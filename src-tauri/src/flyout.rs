//! Popouts like FluentFlyout: a small window at the bottom centre of the main screen, just above
//! the taskbar, for what is playing, who went live and warnings while blank. is not the active
//! window. The web content decides when (src/features/popouts/); this module only shows and hides
//! the window. It has its own WebView, created for a popout and closed half a minute after the
//! last one, so it costs nothing while there is nothing to show. It never takes the focus when it
//! appears (only a click on it does), is missing from the taskbar and Alt+Tab, and stays away
//! while a full-screen game, a full-screen video or a presentation runs (the same rule Windows
//! uses for its own notifications).
use crate::tray;
use serde_json::Value;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{
    window::{Effect, EffectsBuilder},
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
    COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
};
use windows_core::Interface;
use windows_sys::Win32::{
    Foundation::HWND,
    UI::{
        Shell::{
            SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE,
            QUNS_RUNNING_D3D_FULL_SCREEN,
        },
        WindowsAndMessaging::{
            GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, ShowWindow, GWL_EXSTYLE,
            HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE,
            SW_SHOWNOACTIVATE, WS_EX_TOOLWINDOW,
        },
    },
};

/// Width of a new popout window in CSS pixels; each popout then sets its own width and height.
const WIDTH: f64 = 360.0;
/// Gap between popout and the edges of the screen's work area, e.g. the taskbar (CSS pixels).
const MARGIN: f64 = 12.0;
const MAX_ITEM_BYTES: usize = 16 * 1024;
const MAX_PENDING: usize = 5;
/// A hidden popout window is closed after this long without a new popout. Hidden, its WebView
/// still holds about 50 MB; opening it again costs a fraction of a second once per popout.
const CLOSE_AFTER: Duration = Duration::from_secs(30);
/// "music": what plays in any app (media.rs); "mix": blank.'s own SoundCloud mix; "test": the
/// sample from Settings → Popouts; "info": a short note (e.g. nothing plays).
const KINDS: &[&str] = &["music", "mix", "live", "warning", "test", "info"];
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
    "home", "twitch", "pros", "music", "devices", "pc", "apps", "settings",
];

#[derive(Default)]
pub struct FlyoutState(Mutex<Inner>);

#[derive(Default)]
struct Inner {
    /// Label of the popout window while it exists ("flyout-1", "flyout-2", …): a new window never
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
        Err("Ungültige Meldung".into())
    }
}

/// A full-screen game or video, or a presentation: Windows holds back its notifications too.
fn busy() -> bool {
    let mut state = 0;
    // SAFETY: plain query into a local integer.
    let known = unsafe { SHQueryUserNotificationState(&mut state) } == 0;
    known
        && matches!(
            state,
            QUNS_BUSY | QUNS_RUNNING_D3D_FULL_SCREEN | QUNS_PRESENTATION_MODE
        )
}

fn hwnd(window: &WebviewWindow) -> Result<HWND, String> {
    Ok(window.hwnd().map_err(failed)?.0 as HWND)
}

/// While hidden, the page counts as invisible and uses less memory (as the minimized app does,
/// background.rs); before it is shown again, it draws normally.
fn set_visible(window: &WebviewWindow, visible: bool) {
    let _ = window.with_webview(move |platform| {
        let controller = platform.controller();
        let level = if visible {
            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
        } else {
            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
        };
        // SAFETY: COM calls on the live WebView2 controller, on the main thread (with_webview).
        unsafe {
            let _ = controller.SetIsVisible(visible);
            if let Ok(webview) = controller
                .CoreWebView2()
                .and_then(|w| w.cast::<ICoreWebView2_19>())
            {
                let _ = webview.SetMemoryUsageTargetLevel(level);
            }
        }
    });
}

/// The popout window. It is transparent and has no frame of Windows: the popout draws its own
/// background, border and shadow, so all of it slides and fades in and out together. With
/// `acrylic`, Windows blurs what lies behind it instead (with its own frame and shadow; the blur
/// itself appears at once).
fn create(app: &AppHandle, label: &str, acrylic: bool) -> Result<(), String> {
    // Must match the main window's arguments: both share one WebView2 environment.
    let args = app
        .config()
        .app
        .windows
        .first()
        .and_then(|window| window.additional_browser_args.clone());
    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("blank. Popout")
        .inner_size(WIDTH, 80.0)
        .decorations(false)
        .transparent(true)
        .shadow(acrylic)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .focused(false)
        .visible(false);
    if let Some(args) = args {
        builder = builder.additional_browser_args(&args);
    }
    let window = builder.build().map_err(failed)?;
    let handle = hwnd(&window)?;
    // SAFETY: valid top-level window of this process. Tool window: not in Alt+Tab. It appears
    // without activation (flyout_present); only a click on it activates it, which Windows needs
    // before the app may come to the front for "Details".
    unsafe {
        let style = GetWindowLongPtrW(handle, GWL_EXSTYLE);
        SetWindowLongPtrW(handle, GWL_EXSTYLE, style | WS_EX_TOOLWINDOW as isize);
    }
    windows_frame(handle, acrylic);
    if acrylic {
        // Without Acrylic support (older Windows) the popout simply stays opaque.
        let _ = window.set_effects(EffectsBuilder::new().effect(Effect::Acrylic).build());
    }
    Ok(())
}

/// Width of the invisible borders (left, top, right, bottom) between the window rect and what
/// Windows draws; None if Windows does not say.
fn invisible_borders(handle: HWND) -> Option<(i32, i32, i32, i32)> {
    use windows_sys::Win32::{
        Foundation::RECT,
        Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS},
        UI::WindowsAndMessaging::GetWindowRect,
    };
    let empty = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    let (mut outer, mut seen) = (empty, empty);
    // SAFETY: valid window handle; both rects are local out-values of the right size.
    let known = unsafe {
        GetWindowRect(handle, &mut outer) != 0
            && DwmGetWindowAttribute(
                handle,
                DWMWA_EXTENDED_FRAME_BOUNDS as u32,
                (&mut seen as *mut RECT).cast(),
                std::mem::size_of::<RECT>() as u32,
            ) == 0
    };
    (known && seen.right > seen.left).then(|| {
        (
            seen.left - outer.left,
            seen.top - outer.top,
            outer.right - seen.right,
            outer.bottom - seen.bottom,
        )
    })
}

/// With Acrylic, Windows 11 rounds the corners and draws its thin border. Without, both stay off:
/// Windows would draw them around the whole transparent window, a second frame around the popout.
fn windows_frame(handle: HWND, acrylic: bool) {
    use windows_sys::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE,
        DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND, DWMWCP_ROUND,
    };
    let corners = if acrylic { DWMWCP_ROUND } else { DWMWCP_DONOTROUND };
    // SAFETY: valid window handle; the values point to local integers of the right size.
    unsafe {
        DwmSetWindowAttribute(
            handle,
            DWMWA_WINDOW_CORNER_PREFERENCE as u32,
            (&corners as *const i32).cast(),
            4,
        );
        if !acrylic {
            DwmSetWindowAttribute(
                handle,
                DWMWA_BORDER_COLOR as u32,
                (&DWMWA_COLOR_NONE as *const u32).cast(),
                4,
            );
        }
    }
}

/// Shows a popout item: `false` if it is held back (full screen, unless `over_full_screen`, a
/// setting). `acrylic`: the setting for the window's background. Called by the main window.
#[tauri::command]
pub async fn flyout_show(
    app: AppHandle,
    state: State<'_, FlyoutState>,
    item: Value,
    over_full_screen: Option<bool>,
    acrylic: Option<bool>,
) -> Result<bool, String> {
    check(&item)?;
    if over_full_screen != Some(true) && busy() {
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

/// Work area of a screen: x, y, width, height in physical pixels.
type Area = (i32, i32, i32, i32);

/// The middle of the active window (physical pixels), if there is one.
fn active_window_centre() -> Option<(f64, f64)> {
    use windows_sys::Win32::{
        Foundation::RECT,
        UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowRect},
    };
    let mut rect = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    // SAFETY: plain queries; the rect is a local out-value.
    let known = unsafe {
        let active = GetForegroundWindow();
        !active.is_null() && GetWindowRect(active, &mut rect) != 0
    };
    known.then(|| {
        (
            f64::from(rect.left + rect.right) / 2.0,
            f64::from(rect.top + rect.bottom) / 2.0,
        )
    })
}

/// The screen the popout goes to: the main screen, the second screen (the first that is not the
/// main one, as for the app's start, monitor.rs), the one with the mouse or the one with the
/// active window. Falls back to the main screen.
fn target_monitor(window: &WebviewWindow, screen: &str) -> Result<tauri::Monitor, String> {
    let primary = window.primary_monitor().map_err(failed)?;
    let chosen = match screen {
        "second" => window
            .available_monitors()
            .map_err(failed)?
            .into_iter()
            .find(|m| Some(m.position()) != primary.as_ref().map(|p| p.position())),
        "cursor" => {
            let cursor = window.cursor_position().map_err(failed)?;
            window
                .monitor_from_point(cursor.x, cursor.y)
                .map_err(failed)?
        }
        "focus" => match active_window_centre() {
            Some((x, y)) => window.monitor_from_point(x, y).map_err(failed)?,
            None => None,
        },
        _ => None,
    };
    match chosen.or(primary) {
        Some(monitor) => Ok(monitor),
        None => window
            .current_monitor()
            .map_err(failed)?
            .ok_or_else(|| "Kein Bildschirm gefunden".to_string()),
    }
}

/// Top-left corner of the window rect so that what is seen (`seen`: width, height, inside the
/// invisible `borders` left, top, right, bottom) sits at `place` in `area`, `margin` from its edges.
fn corner(
    place: &str,
    area: Area,
    seen: (i32, i32),
    borders: (i32, i32, i32, i32),
    margin: i32,
) -> (i32, i32) {
    let (x, y, width, height) = area;
    let (left, top, _, _) = borders;
    let column = if place.ends_with("left") {
        x + margin
    } else if place.ends_with("right") {
        x + width - margin - seen.0
    } else {
        x + (width - seen.0) / 2
    };
    let row = if place.starts_with("top") {
        y + margin
    } else {
        y + height - margin - seen.1
    };
    (column - left, row - top)
}

/// Shows the popout (`width` × `height` in CSS pixels) at `place` on `screen` (src/features/
/// popouts/placement.ts), on top of other windows but without taking the focus. `inset`: the
/// transparent edge the page keeps around the popout for its own shadow; it counts towards the
/// gap to the screen's edge.
#[tauri::command]
pub async fn flyout_present(
    window: WebviewWindow,
    state: State<'_, FlyoutState>,
    width: f64,
    height: f64,
    place: String,
    screen: String,
    inset: Option<f64>,
) -> Result<(), String> {
    if !PLACES.contains(&place.as_str()) || !SCREENS.contains(&screen.as_str()) {
        return Err("Unbekannte Position".into());
    }
    state.0.lock().map_err(failed)?.serial += 1;
    let monitor = target_monitor(&window, &screen)?;
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let area = (
        area.position.x,
        area.position.y,
        area.size.width as i32,
        area.size.height as i32,
    );
    let size = PhysicalSize::new(
        (width.clamp(240.0, 600.0) * scale).round() as u32,
        (height.clamp(40.0, 460.0) * scale).round() as u32,
    );
    let inset = inset.unwrap_or(0.0).clamp(0.0, MARGIN);
    let margin = ((MARGIN - inset) * scale).round() as i32;
    // Near the place first: moving to a screen with another scaling may resize the window.
    let seen = (size.width as i32, size.height as i32);
    let (x, y) = corner(&place, area, seen, (0, 0, 0, 0), margin);
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
    let (x, y) = corner(&place, area, seen, borders, margin);
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(failed)?;
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
        return Err("Ungültige Meldung".into());
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
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn only_known_small_items_are_shown() {
        assert!(check(&json!({ "kind": "music", "id": 1 })).is_ok());
        assert!(check(&json!({ "kind": "live", "id": 2, "login": "someone" })).is_ok());
        assert!(check(&json!({ "kind": "script" })).is_err());
        assert!(check(&json!({ "id": 3 })).is_err());
        assert!(check(&json!("music")).is_err());
        let long = "x".repeat(MAX_ITEM_BYTES);
        assert!(check(&json!({ "kind": "warning", "detail": long })).is_err());
    }

    #[test]
    fn what_is_seen_sits_at_the_chosen_place() {
        // Measured on a 1920 × 1080 screen with the taskbar at the bottom (work area 1032 high):
        // the popout is seen 362 × 98 inside invisible borders of 7 px left, right and bottom.
        let (area, seen, borders) = ((0, 0, 1920, 1032), (362, 98), (7, 0, 7, 7));
        assert_eq!(corner("bottom-center", area, seen, borders, 12), (772, 922));
        assert_eq!(corner("bottom-left", area, seen, borders, 12), (5, 922));
        assert_eq!(corner("bottom-right", area, seen, borders, 12), (1539, 922));
        assert_eq!(corner("top-left", area, seen, borders, 12), (5, 12));
        assert_eq!(corner("top-center", area, seen, borders, 12), (772, 12));
        // A second screen to the right of the first.
        let second = (1920, 0, 2560, 1400);
        assert_eq!(corner("top-right", second, seen, borders, 12), (4099, 12));
        for place in PLACES {
            let (x, y) = corner(place, area, seen, borders, 12);
            // What is seen stays inside the work area.
            assert!(
                x + borders.0 >= 0 && x + borders.0 + seen.0 <= 1920,
                "{place}"
            );
            assert!(
                y + borders.1 >= 0 && y + borders.1 + seen.1 <= 1032,
                "{place}"
            );
        }
    }
}
