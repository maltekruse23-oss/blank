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
use std::sync::atomic::{AtomicIsize, Ordering};
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
    Graphics::Gdi::{CreateRectRgn, SetWindowRgn},
    UI::{
        Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK},
        WindowsAndMessaging::{
            GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, ShowWindow,
            EVENT_SYSTEM_FOREGROUND, GWL_EXSTYLE, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE,
            SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE, SW_SHOWNOACTIVATE, WINEVENT_OUTOFCONTEXT,
            WS_EX_TOOLWINDOW,
        },
    },
};

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
/// "info": a short note (e.g. nothing plays); "aram": the card after an ARAM Mayhem game (aram.rs).
const KINDS: &[&str] = &[
    "music", "mix", "live", "warning", "test", "preview", "info", "aram",
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
    // Must match the main window's arguments: all share one WebView2 environment (gpu.rs).
    let args = crate::gpu::browser_args(app);
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
    builder = builder.additional_browser_args(&args);
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
    let corners = if acrylic {
        DWMWCP_ROUND
    } else {
        DWMWCP_DONOTROUND
    };
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

/// A horizontal taskbar on a screen (physical pixels): the strip between the screen's edge and its
/// work area. None when it hides itself, stands at a side, or this screen has none.
#[derive(Debug, Clone, Copy, PartialEq)]
struct Taskbar {
    top: bool,
    x: i32,
    y: i32,
    height: i32,
}

fn taskbar_in(screen: Area, work: Area) -> Option<Taskbar> {
    let (sx, sy, sw, sh) = screen;
    let (wx, wy, ww, wh) = work;
    if wx != sx || ww != sw {
        return None;
    }
    if wy > sy {
        Some(Taskbar {
            top: true,
            x: sx,
            y: sy,
            height: wy - sy,
        })
    } else if wy + wh < sy + sh {
        Some(Taskbar {
            top: false,
            x: sx,
            y: wy + wh,
            height: sy + sh - (wy + wh),
        })
    } else {
        None
    }
}

/// Top-left corner of the window rect so that the card (`card` high, `inset` inside what is seen)
/// sits in the taskbar like a part of it: centred in its height, `margin` from its left end, or,
/// with `right`, `margin` left of that x (the notification area).
fn in_taskbar(
    bar: Taskbar,
    seen: (i32, i32),
    borders: (i32, i32, i32, i32),
    card: i32,
    inset: i32,
    margin: i32,
    right: Option<i32>,
) -> (i32, i32) {
    let (left, top, _, _) = borders;
    let card_top = bar.y + (bar.height - card) / 2;
    let column = match right {
        Some(limit) => limit - margin + inset - seen.0,
        None => bar.x + margin - inset,
    };
    let row = if bar.top {
        card_top - inset
    } else {
        card_top + card + inset - seen.1
    };
    (column - left, row - top)
}

/// Taskbar icons on the left (Windows setting "Taskleistenausrichtung: Links"); read only.
fn icons_on_the_left() -> bool {
    // Windows 10 has no such setting: its icons are always on the left, next to Start (the left
    // end is not free there).
    if crate::winver::is_windows_10() {
        return true;
    }
    // Missing: Windows 11's default, centred.
    user_dword(
        "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced",
        "TaskbarAl",
    ) == Some(0)
}

/// Windows (and so the taskbar) in light colours; read only.
fn taskbar_light() -> bool {
    user_dword(
        "Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
        "SystemUsesLightTheme",
    ) == Some(1)
}

/// A number from the current user's registry (read only), if it is there.
fn user_dword(key: &str, name: &str) -> Option<u32> {
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};
    let key: Vec<u16> = key.encode_utf16().chain(Some(0)).collect();
    let name: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
    let mut value: u32 = 0;
    let mut size = std::mem::size_of::<u32>() as u32;
    // SAFETY: reads one DWORD into a local integer of that size; both strings end with a zero.
    let read = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            key.as_ptr(),
            name.as_ptr(),
            RRF_RT_REG_DWORD,
            std::ptr::null_mut(),
            (&mut value as *mut u32).cast(),
            &mut size,
        )
    };
    (read == 0).then_some(value)
}

/// Left edge of the notification area (clock, icons) of the main taskbar if it is on this taskbar
/// strip; Windows tells it only for the main one (read only).
fn notification_area_left(bar: Taskbar, width: i32) -> Option<i32> {
    use windows_sys::Win32::{
        Foundation::RECT,
        UI::WindowsAndMessaging::{FindWindowExW, FindWindowW, GetWindowRect},
    };
    let tray: Vec<u16> = "Shell_TrayWnd\0".encode_utf16().collect();
    let notify: Vec<u16> = "TrayNotifyWnd\0".encode_utf16().collect();
    let mut rect = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    // SAFETY: looks up two windows by class and reads one rectangle into a local.
    let found = unsafe {
        let tray = FindWindowW(tray.as_ptr(), std::ptr::null());
        if tray.is_null() {
            return None;
        }
        let area = FindWindowExW(
            tray,
            std::ptr::null_mut(),
            notify.as_ptr(),
            std::ptr::null(),
        );
        !area.is_null() && GetWindowRect(area, &mut rect) != 0
    };
    let on_this = rect.top >= bar.y - 1
        && rect.bottom <= bar.y + bar.height + 1
        && rect.left > bar.x
        && rect.left < bar.x + width;
    (found && on_this).then_some(rect.left)
}

/// The popout window kept above the taskbar while it sits in it (0: none), and the hook for that.
static IN_TASKBAR: AtomicIsize = AtomicIsize::new(0);
static FOREGROUND_HOOK: AtomicIsize = AtomicIsize::new(0);

/// SAFETY (callers): `handle` is a window handle; SetWindowPos only reorders it.
unsafe fn raise(handle: HWND) {
    SetWindowPos(
        handle,
        HWND_TOPMOST,
        0,
        0,
        0,
        0,
        SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE,
    );
}

/// Another window became the active one, e.g. the taskbar after a click on it: it then lies above
/// the popout in its taskbar. Brings the popout back up at once and once more shortly after (the
/// taskbar comes up a moment after it becomes active). Only a notice of Windows (no hook into
/// other programs, nothing about the window is read or kept).
unsafe extern "system" fn foreground_changed(
    _hook: HWINEVENTHOOK,
    _event: u32,
    _window: HWND,
    _object: i32,
    _child: i32,
    _thread: u32,
    _time: u32,
) {
    let popout = IN_TASKBAR.load(Ordering::Relaxed);
    if popout == 0 {
        return;
    }
    raise(popout as HWND);
    std::thread::spawn(|| {
        for ms in [80, 250] {
            std::thread::sleep(Duration::from_millis(ms));
            let popout = IN_TASKBAR.load(Ordering::Relaxed);
            if popout != 0 {
                // SAFETY: the popout window's handle, set while it is shown.
                unsafe { raise(popout as HWND) };
            }
        }
    });
}

/// While a popout sits in the taskbar, notice when another window becomes active (see above).
fn keep_above_taskbar(window: &WebviewWindow, on: bool) {
    let handle = if on {
        hwnd(window).map_or(0, |h| h as isize)
    } else {
        0
    };
    IN_TASKBAR.store(handle, Ordering::Relaxed);
    // The hook must be set and removed on the thread with the message loop.
    let _ = window.run_on_main_thread(move || {
        let installed = FOREGROUND_HOOK.load(Ordering::Relaxed);
        // SAFETY: an out-of-context event hook with a plain callback; removed on the same thread.
        unsafe {
            if on && installed == 0 {
                let hook = SetWinEventHook(
                    EVENT_SYSTEM_FOREGROUND,
                    EVENT_SYSTEM_FOREGROUND,
                    std::ptr::null_mut(),
                    Some(foreground_changed),
                    0,
                    0,
                    WINEVENT_OUTOFCONTEXT,
                );
                FOREGROUND_HOOK.store(hook as isize, Ordering::Relaxed);
            } else if !on && installed != 0 {
                FOREGROUND_HOOK.store(0, Ordering::Relaxed);
                UnhookWinEvent(installed as HWINEVENTHOOK);
            }
        }
    });
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
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn finds_the_taskbar_from_screen_and_work_area() {
        let screen = (0, 0, 1920, 1080);
        // Bottom, 48 px high.
        assert_eq!(
            taskbar_in(screen, (0, 0, 1920, 1032)),
            Some(Taskbar {
                top: false,
                x: 0,
                y: 1032,
                height: 48
            })
        );
        // Top.
        assert_eq!(
            taskbar_in(screen, (0, 48, 1920, 1032)),
            Some(Taskbar {
                top: true,
                x: 0,
                y: 0,
                height: 48
            })
        );
        // Hidden (work area = screen), at the side: none.
        assert_eq!(taskbar_in(screen, screen), None);
        assert_eq!(taskbar_in(screen, (62, 0, 1858, 1080)), None);
        // A second screen left of the main one.
        assert_eq!(
            taskbar_in((-1920, 0, 1920, 1080), (-1920, 0, 1920, 1032)),
            Some(Taskbar {
                top: false,
                x: -1920,
                y: 1032,
                height: 48
            })
        );
    }

    #[test]
    fn centres_the_card_in_the_taskbar() {
        let bottom = Taskbar {
            top: false,
            x: -1920,
            y: 1032,
            height: 48,
        };
        // Window 320 Ã— 60 (card 40 + inset 10 above and below), no invisible borders.
        let (x, y) = in_taskbar(bottom, (320, 60), (0, 0, 0, 0), 40, 10, 12, None);
        assert_eq!(x, -1920 + 12 - 10);
        // Card from 1036 to 1076: 4 px space above and below in the 48 px taskbar.
        assert_eq!(y + 10, 1036);
        assert_eq!(y + 60 - 10, 1076);
        // With room above to open into (window 190 high), the card stays at the same place.
        let (_, y) = in_taskbar(bottom, (320, 190), (0, 0, 0, 0), 40, 10, 12, None);
        assert_eq!(y + 190 - 10 - 40, 1036);
        // Icons on the left: the card ends 12 px left of the notification area (x -100).
        let (x, _) = in_taskbar(bottom, (320, 60), (0, 0, 0, 0), 40, 10, 12, Some(-100));
        assert_eq!(x + 320 - 10, -100 - 12);
        // Top taskbar: the card hangs from the top, room below.
        let top = Taskbar {
            top: true,
            x: 0,
            y: 0,
            height: 48,
        };
        let (_, y) = in_taskbar(top, (320, 190), (0, 0, 0, 0), 40, 10, 12, None);
        assert_eq!(y + 10, 4);
    }

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
        // Measured on a 1920 Ã— 1080 screen with the taskbar at the bottom (work area 1032 high):
        // the popout is seen 362 Ã— 98 inside invisible borders of 7 px left, right and bottom.
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
