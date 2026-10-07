//! Popouts like FluentFlyout: a small window at the bottom centre of the main screen, just above
//! the taskbar, for what is playing, who went live and warnings while blank. is not the active
//! window. The web content decides when (src/features/popouts/); this module only shows and hides
//! the window. It has its own WebView, created for a popout and closed half a minute after the
//! last one, so it costs nothing while there is nothing to show. It never takes the focus when it
//! appears (only a click on it does), is missing from the taskbar and Alt+Tab, and stays away
//! while a full-screen game, a full-screen video or a presentation runs on its screen; when one
//! starts there while it is visible, it goes away at once (fullscreen.rs).
use crate::{fullscreen, tray};
use serde_json::Value;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow};
use windows_sys::Win32::{
    Foundation::HWND,
    Graphics::Gdi::{CreateRectRgn, SetWindowRgn},
    UI::WindowsAndMessaging::{
        SetWindowPos, ShowWindow, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
        SWP_SHOWWINDOW, SW_HIDE, SW_SHOWNOACTIVATE,
    },
};

mod place;
mod window;

use place::{
    corner, icons_on_the_left, in_taskbar, keep_above_taskbar, notification_area_left,
    target_monitor, taskbar_in, taskbar_light,
};
use window::{create, hwnd, invisible_borders, set_visible};

/// Width of a new popout window in CSS pixels; each popout then sets its own width and height.
const WIDTH: f64 = 360.0;
/// Gap between popout and the edges of the screen's work area, e.g. the taskbar (CSS pixels).
const MARGIN: f64 = 12.0;
/// Kept free at the right end of a taskbar without a readable notification area (its clock).
const CLOCK_ROOM: f64 = 100.0;
/// The ARAM card carries its augment icons (a few small PNGs as data URLs).
const MAX_ITEM_BYTES: usize = 64 * 1024;
const MAX_PENDING: usize = 5;
/// A hidden popout window is closed after this long without a new popout. Hidden, its WebView
/// still holds about 50 MB; opening it again costs a fraction of a second once per popout.
const CLOSE_AFTER: Duration = Duration::from_secs(30);
/// "music": what plays in any app (media.rs); "mix": blank.'s own SoundCloud mix; "test": the
/// sample from Settings â†’ Popouts; "preview": the live preview while those settings change;
/// "info": a short note (e.g. nothing plays); "aram": the card after an ARAM Mayhem game (aram.rs);
/// "champ": the Champ-Karte in an ARAM Mayhem champion select (aram_live.rs).
const KINDS: &[&str] = &[
    "music", "mix", "live", "warning", "test", "preview", "info", "aram", "champ",
];
/// What a popout may ask of blank.'s own mix (useMusic in the app window).
const MIX_ACTIONS: &[&str] = &["toggle", "next", "seek"];
/// Where a popout may appear (src/features/popouts/placement.ts).
const PLACES: &[&str] = &[
    "top-left",
    "top-center",
    "top-right",
    "bottom-left",
    "bottom-center",
    "bottom-right",
];
/// "focus": the screen of the active window.
const SCREENS: &[&str] = &["primary", "second", "cursor", "focus"];
/// Pages a popout may open in the app (App.tsx).
const PAGES: &[&str] = &[
    "home", "twitch", "pros", "rank", "aram", "music", "devices", "pc", "apps", "settings",
];

#[derive(Default)]
pub struct FlyoutState(Mutex<Inner>);

#[derive(Default)]
struct Inner {
    /// Label of the popout window while it exists ("flyout-1", "flyout-2", â€¦): a new window never
    /// has to wait for a closing one to be gone.
    label: Option<String>,
    /// Its web content has loaded and listens for items.
    ready: bool,
    /// Items that arrived while it was loading.
    pending: Vec<Value>,
    /// Counts popouts and windows; a delayed close only acts if nothing happened since.
    serial: u64,
    /// The window has the Acrylic background (a setting; changing it means a new window).
    acrylic: bool,
    /// The latest popout may show over full screen (a setting, or asked for by a click).
    over: bool,
}

fn failed(error: impl std::fmt::Display) -> String {
    error.to_string()
}

/// A popout item from the web content: an object with a known kind, of sane size.
fn check(item: &Value) -> Result<(), String> {
    let kind = item.get("kind").and_then(Value::as_str);
    let size = serde_json::to_string(item).map_or(usize::MAX, |text| text.len());
    if kind.is_some_and(|kind| KINDS.contains(&kind)) && size <= MAX_ITEM_BYTES {
        Ok(())
    } else {
        Err("UngÃ¼ltige Meldung".into())
    }
}

/// Something full screen (a game, a video, a presentation) on the screen a popout goes to: screen`n/// is the setting (placement.ts). Only that screen counts (user's wish), see fullscreen.rs.
fn held_back(app: &AppHandle, screen: Option<&str>) -> bool {
    let screen = screen.filter(|s| SCREENS.contains(s)).unwrap_or("primary");
    let Some(main) = app.get_webview_window("main") else {
        return false;
    };
    target_monitor(&main, screen)
        .is_ok_and(|monitor| full_screen_at(&monitor, std::ptr::null_mut()))
}

/// Full screen on this screen, looking past skip (the popout window itself).
fn full_screen_at(monitor: &tauri::Monitor, skip: HWND) -> bool {
    let (x, y) = (
        monitor.position().x + monitor.size().width as i32 / 2,
        monitor.position().y + monitor.size().height as i32 / 2,
    );
    fullscreen::full_screen_on(fullscreen::monitor_at(x, y), skip)
}

/// Shows a popout item: `false` if it is held back (full screen on the popout's screen `screen`,
/// unless `over_full_screen`, a setting). `acrylic`: the setting for the window's background.
/// Called by the main window.
#[tauri::command]
pub async fn flyout_show(
    app: AppHandle,
    state: State<'_, FlyoutState>,
    item: Value,
    over_full_screen: Option<bool>,
    acrylic: Option<bool>,
    screen: Option<String>,
) -> Result<bool, String> {
    check(&item)?;
    let over = over_full_screen == Some(true);
    if !over && held_back(&app, screen.as_deref()) {
        return Ok(false);
    }
    let acrylic = acrylic == Some(true);
    let mut replaced = None;
    let new_window = {
        let mut inner = state.0.lock().map_err(failed)?;
        inner.serial += 1;
        // The background setting changed: a new window replaces the old one.
        if inner.label.is_some() && inner.acrylic != acrylic {
            replaced = inner.label.take();
            inner.ready = false;
        }
        inner.acrylic = acrylic;
        inner.over = over;
        match (inner.label.clone(), inner.ready) {
            (Some(label), true) => {
                app.emit_to(label.as_str(), "flyout-item", item)
                    .map_err(failed)?;
                None
            }
            (label, _) => {
                if inner.pending.len() >= MAX_PENDING {
                    inner.pending.remove(0);
                }
                inner.pending.push(item);
                match label {
                    Some(_) => None,
                    None => {
                        let label = format!("flyout-{}", inner.serial);
                        inner.label = Some(label.clone());
                        Some(label)
                    }
                }
            }
        }
    };
    if let Some(window) = replaced.and_then(|label| app.get_webview_window(&label)) {
        let _ = window.destroy();
    }
    // Built outside the lock: building waits for the main thread.
    if let Some(label) = new_window {
        if let Err(error) = create(&app, &label, acrylic) {
            let mut inner = state.0.lock().map_err(failed)?;
            inner.label = None;
            inner.pending.clear();
            return Err(error);
        }
    }
    Ok(true)
}

/// The new state for a popout that may be open (the own mix paused, resumed, another track):
/// passed on only if the popout window is there; never opens one.
#[tauri::command]
pub async fn flyout_update(
    app: AppHandle,
    state: State<'_, FlyoutState>,
    item: Value,
) -> Result<(), String> {
    check(&item)?;
    let inner = state.0.lock().map_err(failed)?;
    if let (Some(label), true) = (inner.label.as_deref(), inner.ready) {
        app.emit_to(label, "flyout-update", item).map_err(failed)?;
    }
    Ok(())
}

/// The popout page has loaded: from now on items come as events; returns those that waited.
#[tauri::command]
pub async fn flyout_pending(
    window: WebviewWindow,
    state: State<'_, FlyoutState>,
) -> Result<Vec<Value>, String> {
    let mut inner = state.0.lock().map_err(failed)?;
    if inner.label.as_deref() != Some(window.label()) {
        return Ok(Vec::new());
    }
    inner.ready = true;
    Ok(std::mem::take(&mut inner.pending))
}

/// Lets the hidden page draw again before it is shown.
#[tauri::command]
pub async fn flyout_prepare(window: WebviewWindow) {
    set_visible(&window, true);
}

/// Shows the popout (`width` Ã— `height` in CSS pixels) at `place` on `screen` (src/features/
/// popouts/placement.ts), on top of other windows but without taking the focus. `inset`: the
/// transparent edge the page keeps around the popout for its own shadow; it counts towards the
/// gap to the screen's edge. `taskbar`: the card's height (CSS pixels) to place it in the taskbar
/// like a part of it (a setting); returns which edge that taskbar is at ("bottom"/"top"), or none
/// if this screen has no taskbar there (then the popout goes to `place` as usual).
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn flyout_present(
    window: WebviewWindow,
    state: State<'_, FlyoutState>,
    width: f64,
    height: f64,
    place: String,
    screen: String,
    inset: Option<f64>,
    taskbar: Option<f64>,
) -> Result<Option<TaskbarPlace>, String> {
    if !PLACES.contains(&place.as_str()) || !SCREENS.contains(&screen.as_str()) {
        return Err("Unbekannte Position".into());
    }
    let over = {
        let mut inner = state.0.lock().map_err(failed)?;
        inner.serial += 1;
        inner.over
    };
    let monitor = target_monitor(&window, &screen)?;
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let area = (
        area.position.x,
        area.position.y,
        area.size.width as i32,
        area.size.height as i32,
    );
    let whole = (
        monitor.position().x,
        monitor.position().y,
        monitor.size().width as i32,
        monitor.size().height as i32,
    );
    let bar = taskbar.and_then(|card| {
        taskbar_in(whole, area).map(|bar| (bar, (card.clamp(20.0, 200.0) * scale).round() as i32))
    });
    // Icons on the left: the popout goes to the free right end, left of the clock and icons of the
    // notification area (on other screens only a clock: its room is kept free). Centred icons:
    // the left end is free.
    let right_end = bar.and_then(|(bar, _)| {
        icons_on_the_left().then(|| {
            notification_area_left(bar, whole.2)
                .unwrap_or(whole.0 + whole.2 - (CLOCK_ROOM * scale).round() as i32)
        })
    });
    let size = PhysicalSize::new(
        (width.clamp(240.0, 600.0) * scale).round() as u32,
        (height.clamp(40.0, 460.0) * scale).round() as u32,
    );
    // A new size shows the whole window again; a compact popout then limits it (flyout_region).
    // SAFETY: valid window handle; no region means the whole window.
    unsafe { SetWindowRgn(hwnd(&window)?, std::ptr::null_mut(), 1) };
    let inset = inset.unwrap_or(0.0).clamp(0.0, MARGIN);
    let margin = ((MARGIN - inset) * scale).round() as i32;
    let inset_px = (inset * scale).round() as i32;
    let at = |seen: (i32, i32), borders: (i32, i32, i32, i32)| match bar {
        Some((bar, card)) => in_taskbar(
            bar,
            seen,
            borders,
            card,
            inset_px,
            margin + inset_px,
            right_end,
        ),
        None => corner(&place, area, seen, borders, margin),
    };
    // Near the place first: moving to a screen with another scaling may resize the window.
    let seen = (size.width as i32, size.height as i32);
    let (x, y) = at(seen, (0, 0, 0, 0));
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(failed)?;
    window.set_size(size).map_err(failed)?;
    let handle = hwnd(&window)?;
    // The window rect has invisible resize borders; place what is seen.
    let outer = window.outer_size().map_err(failed)?;
    let borders = invisible_borders(handle).unwrap_or((
        (outer.width as i32 - size.width as i32) / 2,
        0,
        (outer.width as i32 - size.width as i32) / 2,
        outer.height as i32 - size.height as i32,
    ));
    let (left, top, right, bottom) = borders;
    let seen = (
        outer.width as i32 - left - right,
        outer.height as i32 - top - bottom,
    );
    let (x, y) = at(seen, borders);
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(failed)?;
    // Its screen turned full screen meanwhile: it stays hidden, and its page drops what it shows.
    if !over && full_screen_at(&monitor, handle) {
        window
            .emit_to(window.label(), "flyout-fullscreen", ())
            .map_err(failed)?;
        return Ok(None);
    }
    keep_above_taskbar(&window, bar.is_some());
    // Until it is hidden: gone at once when something on its screen turns full screen.
    fullscreen::watch(
        window.app_handle(),
        (!over).then(|| (handle, window.label().to_string())),
    );
    // SAFETY: valid window handle; shows and raises it without activating it.
    unsafe {
        ShowWindow(handle, SW_SHOWNOACTIVATE);
        SetWindowPos(
            handle,
            HWND_TOPMOST,
            0,
            0,
            0,
            0,
            SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
        );
    }
    Ok(bar.map(|(bar, _)| TaskbarPlace {
        edge: if bar.top { "top" } else { "bottom" },
        side: if right_end.is_some() { "right" } else { "left" },
        light: taskbar_light(),
    }))
}

/// Where a popout in the taskbar ended up: the taskbar's edge and the end it keeps to.
#[derive(serde::Serialize)]
pub struct TaskbarPlace {
    edge: &'static str,
    side: &'static str,
    /// Windows in light colours: the taskbar is light too.
    light: bool,
}

/// Only this part of the popout window is shown and takes the mouse; the rest is room for a compact
/// popout to open into without resizing the window (a resize briefly showed the old picture at the
/// wrong place). `rect`: x, y, width, height in CSS pixels of the page; none: the whole window.
#[tauri::command]
pub async fn flyout_region(window: WebviewWindow, rect: Option<[f64; 4]>) -> Result<(), String> {
    let handle = hwnd(&window)?;
    let region = match rect {
        None => std::ptr::null_mut(),
        Some(values) => {
            if !values.iter().all(|v| v.is_finite()) {
                return Err("UngÃ¼ltiger Bereich".into());
            }
            let [x, y, width, height] = values.map(|v| v.clamp(0.0, 2000.0));
            let scale = window.scale_factor().map_err(failed)?;
            // The region is relative to the window rectangle, which may have invisible borders.
            let inner = window.inner_position().map_err(failed)?;
            let outer = window.outer_position().map_err(failed)?;
            let px = |v: f64| (v * scale).round() as i32;
            let (dx, dy) = (inner.x - outer.x, inner.y - outer.y);
            // SAFETY: plain GDI region; SetWindowRgn below takes ownership of it.
            unsafe {
                CreateRectRgn(
                    dx + px(x),
                    dy + px(y),
                    dx + px(x + width),
                    dy + px(y + height),
                )
            }
        }
    };
    // SAFETY: valid window handle; the system owns the region from now on.
    unsafe { SetWindowRgn(handle, region, 1) };
    Ok(())
}

/// Hides the popout; its window is closed after half a quiet minute.
#[tauri::command]
pub async fn flyout_hide(
    window: WebviewWindow,
    state: State<'_, FlyoutState>,
) -> Result<(), String> {
    // SAFETY: valid window handle.
    unsafe { ShowWindow(hwnd(&window)?, SW_HIDE) };
    keep_above_taskbar(&window, false);
    fullscreen::watch(window.app_handle(), None);
    set_visible(&window, false);
    let serial = {
        let mut inner = state.0.lock().map_err(failed)?;
        inner.serial += 1;
        inner.serial
    };
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(CLOSE_AFTER).await;
        let state = app.state::<FlyoutState>();
        let label = {
            let Ok(mut inner) = state.0.lock() else {
                return;
            };
            if inner.serial != serial {
                return;
            }
            inner.ready = false;
            inner.pending.clear();
            inner.label.take()
        };
        if let Some(window) = label.and_then(|label| app.get_webview_window(&label)) {
            let _ = window.destroy();
        }
    });
    Ok(())
}

/// A live notice or warning was closed or clicked in the popout: the app removes it too.
#[tauri::command]
pub async fn flyout_done(app: AppHandle, kind: String, id: u64) -> Result<(), String> {
    if !KINDS.contains(&kind.as_str()) {
        return Err("UngÃ¼ltige Meldung".into());
    }
    app.emit_to(
        "main",
        "flyout-done",
        serde_json::json!({ "kind": kind, "id": id }),
    )
    .map_err(failed)
}

/// A button in a popout for blank.'s own mix: passed on to the app window, which plays the mix.
/// `position`: ms for "seek".
#[tauri::command]
pub async fn flyout_mix(
    app: AppHandle,
    action: String,
    position: Option<f64>,
) -> Result<(), String> {
    let position = position.filter(|ms| ms.is_finite() && *ms >= 0.0);
    if !MIX_ACTIONS.contains(&action.as_str()) || (action == "seek" && position.is_none()) {
        return Err("Unbekannte Aktion".into());
    }
    app.emit_to(
        "main",
        "mix-control",
        serde_json::json!({ "action": action, "position": position }),
    )
    .map_err(failed)
}

/// Number of screens: the choice of screen in the settings only makes sense with more than one.
#[tauri::command]
pub fn flyout_screens(app: AppHandle) -> usize {
    app.available_monitors()
        .map_or(1, |monitors| monitors.len())
}

/// Whether popouts "in the taskbar" sit at its right end (icons on the left), for the edit mode.
#[tauri::command]
pub fn taskbar_icons_left() -> bool {
    icons_on_the_left()
}

/// Brings back the full app, optionally on a page (a click in a popout).
#[tauri::command]
pub async fn show_app(app: AppHandle, page: Option<String>) -> Result<(), String> {
    if let Some(page) = page {
        if !PAGES.contains(&page.as_str()) {
            return Err("Unbekannte Seite".into());
        }
        app.emit_to("main", "open-page", page).map_err(failed)?;
    }
    tray::show_app(&app);
    Ok(())
}

#[cfg(test)]
mod tests;
