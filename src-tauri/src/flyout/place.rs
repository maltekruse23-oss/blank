//! Where the popout goes: the screen, the taskbar on it (and staying above it), the corner.

use std::sync::atomic::{AtomicIsize, Ordering};
use std::time::Duration;
use tauri::WebviewWindow;
use windows_sys::Win32::{
    Foundation::HWND,
    UI::{
        Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK},
        WindowsAndMessaging::{
            SetWindowPos, EVENT_SYSTEM_FOREGROUND, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE,
            SWP_NOSIZE, WINEVENT_OUTOFCONTEXT,
        },
    },
};

use super::failed;
use super::window::hwnd;

/// Work area of a screen: x, y, width, height in physical pixels.
pub(super) type Area = (i32, i32, i32, i32);

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
pub(super) fn target_monitor(
    window: &WebviewWindow,
    screen: &str,
) -> Result<tauri::Monitor, String> {
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
pub(super) struct Taskbar {
    pub(super) top: bool,
    pub(super) x: i32,
    pub(super) y: i32,
    pub(super) height: i32,
}

pub(super) fn taskbar_in(screen: Area, work: Area) -> Option<Taskbar> {
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
pub(super) fn in_taskbar(
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
pub(super) fn icons_on_the_left() -> bool {
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
pub(super) fn taskbar_light() -> bool {
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
pub(super) fn notification_area_left(bar: Taskbar, width: i32) -> Option<i32> {
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
pub(super) fn keep_above_taskbar(window: &WebviewWindow, on: bool) {
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
pub(super) fn corner(
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
