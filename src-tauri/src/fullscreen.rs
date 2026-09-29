//! Full screen per screen (user's wish: a popout must not disturb a full-screen video, and goes away
//! at once when something on its screen turns full screen; the other screen does not matter).
//! Only reads where windows are; nothing about them is kept. While a popout is visible, Windows
//! reports when another window becomes active and when a window of the active program changes its
//! size (events, no polling); otherwise nothing runs.
use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::{mpsc, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use windows_sys::{
    core::BOOL,
    Win32::{
        Foundation::{HWND, LPARAM, POINT, RECT},
        Graphics::{
            Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS},
            Gdi::{
                GetMonitorInfoW, MonitorFromPoint, MonitorFromWindow, HMONITOR, MONITORINFO,
                MONITOR_DEFAULTTONEAREST,
            },
        },
        UI::{
            Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK},
            Shell::{
                SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE,
                QUNS_RUNNING_D3D_FULL_SCREEN,
            },
            WindowsAndMessaging::{
                EnumWindows, GetClassNameW, GetForegroundWindow, GetWindowLongPtrW, GetWindowRect,
                GetWindowThreadProcessId, IsIconic, IsWindowVisible, IsZoomed, ShowWindowAsync,
                EVENT_OBJECT_LOCATIONCHANGE, EVENT_SYSTEM_FOREGROUND, GWL_EXSTYLE, SW_HIDE,
                WINEVENT_OUTOFCONTEXT, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_EX_TRANSPARENT,
            },
        },
    },
};

/// Left, top, right, bottom in physical pixels.
type Edges = (i32, i32, i32, i32);

/// What counts about one window for "full screen" (from the front to the back).
#[derive(Debug, Clone, Copy)]
struct Seen {
    bounds: Edges,
    /// Always on top (a small player or a note in front of a video does not end full screen).
    topmost: bool,
    /// A maximized window is never full screen, even where it fills the whole screen (a taskbar
    /// that hides itself). Browsers leave "maximized" when they go full screen.
    maximized: bool,
}

fn covers(outer: Edges, inner: Edges) -> bool {
    outer.0 <= inner.0 && outer.1 <= inner.1 && outer.2 >= inner.2 && outer.3 >= inner.3
}

fn overlaps(a: Edges, b: Edges) -> bool {
    a.0 < b.2 && b.0 < a.2 && a.1 < b.3 && b.1 < a.3
}

/// Over the windows from the front: the first normal one on the screen decides. Full screen if it
/// covers the whole screen (and is not maximized); windows always on top that do not cover it are
/// looked past.
fn decide(windows: impl IntoIterator<Item = Seen>, screen: Edges) -> bool {
    for window in windows {
        if !overlaps(window.bounds, screen) {
            continue;
        }
        if covers(window.bounds, screen) && !window.maximized {
            return true;
        }
        if !window.topmost {
            return false;
        }
    }
    false
}

fn rect_edges(rect: RECT) -> Edges {
    (rect.left, rect.top, rect.right, rect.bottom)
}

fn monitor_edges(monitor: HMONITOR) -> Option<Edges> {
    let mut info = MONITORINFO {
        cbSize: size_of::<MONITORINFO>() as u32,
        rcMonitor: RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        },
        rcWork: RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        },
        dwFlags: 0,
    };
    // SAFETY: plain query into a local struct of the stated size.
    (unsafe { GetMonitorInfoW(monitor, &mut info) } != 0).then(|| rect_edges(info.rcMonitor))
}

/// Windows that are not what one looks at: the desktop, the taskbars.
const SHELL: &[&str] = &[
    "Progman",
    "WorkerW",
    "Shell_TrayWnd",
    "Shell_SecondaryTrayWnd",
];

/// The visible top-level windows from the front to the back, without `skip` (the popout), tool
/// windows and see-through overlays (e.g. of a graphics driver), hidden or minimized ones.
fn front_to_back(skip: HWND) -> Vec<Seen> {
    struct Search {
        skip: HWND,
        seen: Vec<Seen>,
    }
    unsafe extern "system" fn each(hwnd: HWND, search: LPARAM) -> BOOL {
        // SAFETY: `search` is the Search passed below, alive for the whole enumeration.
        let search = unsafe { &mut *(search as *mut Search) };
        // SAFETY: plain queries on a window handle given by EnumWindows, into local values.
        unsafe {
            if hwnd == search.skip || IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 {
                return 1;
            }
            let extended = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
            if extended & (WS_EX_TOOLWINDOW | WS_EX_TRANSPARENT) != 0 {
                return 1;
            }
            let mut cloaked: u32 = 0;
            let asked = DwmGetWindowAttribute(
                hwnd,
                DWMWA_CLOAKED as u32,
                &mut cloaked as *mut u32 as *mut _,
                size_of::<u32>() as u32,
            );
            if asked == 0 && cloaked != 0 {
                return 1;
            }
            let mut class = [0u16; 64];
            let length = GetClassNameW(hwnd, class.as_mut_ptr(), class.len() as i32).max(0);
            let class = String::from_utf16_lossy(&class[..length as usize]);
            if SHELL.contains(&class.as_str()) {
                return 1;
            }
            // What is seen (without invisible borders), else the window rect.
            let mut rect = RECT {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            };
            let framed = DwmGetWindowAttribute(
                hwnd,
                DWMWA_EXTENDED_FRAME_BOUNDS as u32,
                &mut rect as *mut RECT as *mut _,
                size_of::<RECT>() as u32,
            ) == 0;
            if !framed && GetWindowRect(hwnd, &mut rect) == 0 {
                return 1;
            }
            if rect.right <= rect.left || rect.bottom <= rect.top {
                return 1;
            }
            search.seen.push(Seen {
                bounds: rect_edges(rect),
                topmost: extended & WS_EX_TOPMOST != 0,
                maximized: IsZoomed(hwnd) != 0,
            });
        }
        1
    }
    let mut search = Search {
        skip,
        seen: Vec::new(),
    };
    // SAFETY: the callback only touches `search`, which outlives the call.
    unsafe { EnumWindows(Some(each), &mut search as *mut Search as LPARAM) };
    search.seen
}

/// Something full screen on this screen: a presentation (anywhere), Windows' own full-screen state
/// of the active window when that is on this screen, or the front window covering the screen.
pub fn full_screen_on(monitor: HMONITOR, skip: HWND) -> bool {
    let Some(screen) = monitor_edges(monitor) else {
        return false;
    };
    let mut state = 0;
    // SAFETY: plain query into a local integer.
    if unsafe { SHQueryUserNotificationState(&mut state) } == 0 {
        if state == QUNS_PRESENTATION_MODE {
            return true;
        }
        if state == QUNS_BUSY || state == QUNS_RUNNING_D3D_FULL_SCREEN {
            // SAFETY: plain queries; a null foreground window is checked.
            let front = unsafe { GetForegroundWindow() };
            if !front.is_null()
                && unsafe { MonitorFromWindow(front, MONITOR_DEFAULTTONEAREST) } == monitor
            {
                return true;
            }
        }
    }
    decide(front_to_back(skip), screen)
}

/// The screen with this point (physical pixels), e.g. the middle of the screen a popout goes to.
pub fn monitor_at(x: i32, y: i32) -> HMONITOR {
    // SAFETY: plain query.
    unsafe { MonitorFromPoint(POINT { x, y }, MONITOR_DEFAULTTONEAREST) }
}

// --- Watching while a popout is visible ---

/// The visible popout window (0: none watched).
static WATCHED: AtomicIsize = AtomicIsize::new(0);
static FOREGROUND_HOOK: AtomicIsize = AtomicIsize::new(0);
static LOCATION_HOOK: AtomicIsize = AtomicIsize::new(0);
/// The app and the popout window's label, to tell its page.
static TARGET: Mutex<Option<(AppHandle, String)>> = Mutex::new(None);
/// Wakes the checking thread; events in quick succession become one check.
static SIGNAL: OnceLock<mpsc::SyncSender<()>> = OnceLock::new();
/// A change settles for this long before it is checked (a window going full screen may resize in
/// steps); short enough that the popout is gone at once to the eye.
const SETTLE: Duration = Duration::from_millis(40);

fn signal() {
    let sender = SIGNAL.get_or_init(|| {
        let (send, receive) = mpsc::sync_channel::<()>(1);
        std::thread::spawn(move || {
            while receive.recv().is_ok() {
                std::thread::sleep(SETTLE);
                while receive.try_recv().is_ok() {}
                check_now();
            }
        });
        send
    });
    let _ = sender.try_send(());
}

/// The watched popout's screen turned full screen: hide it at once and tell its page, which then
/// drops what it shows and hides itself as usual (flyout_hide, which also ends the watching).
fn check_now() {
    let popout = WATCHED.load(Ordering::Relaxed);
    if popout == 0 {
        return;
    }
    let handle = popout as HWND;
    // SAFETY: the popout window's handle, set while it is shown.
    let monitor = unsafe { MonitorFromWindow(handle, MONITOR_DEFAULTTONEAREST) };
    if !full_screen_on(monitor, handle) {
        return;
    }
    if WATCHED
        .compare_exchange(popout, 0, Ordering::Relaxed, Ordering::Relaxed)
        .is_err()
    {
        return;
    }
    // SAFETY: valid window handle; posted, so this thread never waits for the window's thread.
    unsafe { ShowWindowAsync(handle, SW_HIDE) };
    if let Ok(target) = TARGET.lock() {
        if let Some((app, label)) = target.as_ref() {
            let _ = app.emit_to(label.as_str(), "flyout-fullscreen", ());
        }
    }
}

/// On the main thread (the hooks' callbacks run there): Windows reports size changes of the
/// windows of the active program only (a video turning full screen, a game starting).
unsafe fn follow_process(window: HWND) {
    let mut pid = 0;
    // SAFETY: plain query; a null window gives pid 0.
    unsafe { GetWindowThreadProcessId(window, &mut pid) };
    let old = LOCATION_HOOK.swap(0, Ordering::Relaxed);
    if old != 0 {
        // SAFETY: a hook set on this thread before.
        unsafe { UnhookWinEvent(old as HWINEVENTHOOK) };
    }
    if pid == 0 || WATCHED.load(Ordering::Relaxed) == 0 {
        return;
    }
    // SAFETY: an out-of-context event hook with a plain callback; removed on this thread.
    let hook = unsafe {
        SetWinEventHook(
            EVENT_OBJECT_LOCATIONCHANGE,
            EVENT_OBJECT_LOCATIONCHANGE,
            std::ptr::null_mut(),
            Some(changed),
            pid,
            0,
            WINEVENT_OUTOFCONTEXT,
        )
    };
    LOCATION_HOOK.store(hook as isize, Ordering::Relaxed);
}

unsafe extern "system" fn changed(
    _hook: HWINEVENTHOOK,
    event: u32,
    window: HWND,
    object: i32,
    child: i32,
    _thread: u32,
    _time: u32,
) {
    if WATCHED.load(Ordering::Relaxed) == 0 {
        return;
    }
    if event == EVENT_SYSTEM_FOREGROUND {
        // SAFETY: called on the main thread, where the hooks live.
        unsafe { follow_process(window) };
        signal();
    } else if object == 0 && child == 0 {
        // A whole window moved or changed its size (not the caret or the mouse pointer).
        signal();
    }
}

/// Starts (`popout`: its window) or ends watching; the hooks are set on the main thread.
pub fn watch(app: &AppHandle, popout: Option<(HWND, String)>) {
    let on = popout.is_some();
    match popout {
        Some((handle, label)) => {
            if let Ok(mut target) = TARGET.lock() {
                *target = Some((app.clone(), label));
            }
            WATCHED.store(handle as isize, Ordering::Relaxed);
        }
        None => WATCHED.store(0, Ordering::Relaxed),
    }
    let _ = app.run_on_main_thread(move || {
        let installed = FOREGROUND_HOOK.load(Ordering::Relaxed);
        // SAFETY: out-of-context event hooks with a plain callback, set and removed on this thread.
        unsafe {
            if on && installed == 0 {
                let hook = SetWinEventHook(
                    EVENT_SYSTEM_FOREGROUND,
                    EVENT_SYSTEM_FOREGROUND,
                    std::ptr::null_mut(),
                    Some(changed),
                    0,
                    0,
                    WINEVENT_OUTOFCONTEXT,
                );
                FOREGROUND_HOOK.store(hook as isize, Ordering::Relaxed);
                follow_process(GetForegroundWindow());
            } else if !on && installed != 0 {
                FOREGROUND_HOOK.store(0, Ordering::Relaxed);
                UnhookWinEvent(installed as HWINEVENTHOOK);
                follow_process(std::ptr::null_mut());
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCREEN: Edges = (0, 0, 1920, 1080);
    const OTHER: Edges = (1920, 0, 3840, 1080);
    fn window(bounds: Edges) -> Seen {
        Seen {
            bounds,
            topmost: false,
            maximized: false,
        }
    }

    #[test]
    fn a_window_covering_its_screen_in_front_is_full_screen() {
        assert!(decide([window(SCREEN)], SCREEN));
        // Larger than the screen (a game's window with its edges outside) counts too.
        assert!(decide([window((-8, -8, 1928, 1088))], SCREEN));
        assert!(!decide([], SCREEN));
    }

    #[test]
    fn only_this_screen_counts() {
        // A full-screen video on the other screen does not matter here.
        assert!(!decide([window(OTHER)], SCREEN));
        assert!(decide([window(OTHER), window(SCREEN)], SCREEN));
    }

    #[test]
    fn a_normal_window_in_front_ends_it() {
        let small = window((100, 100, 900, 700));
        assert!(!decide([small, window(SCREEN)], SCREEN));
        // A window on the other screen in front does not.
        assert!(decide(
            [window((2000, 100, 2800, 700)), window(SCREEN)],
            SCREEN
        ));
    }

    #[test]
    fn a_small_window_always_on_top_is_looked_past() {
        let picture_in_picture = Seen {
            bounds: (1500, 800, 1900, 1060),
            topmost: true,
            maximized: false,
        };
        assert!(decide([picture_in_picture, window(SCREEN)], SCREEN));
    }

    #[test]
    fn maximized_is_not_full_screen() {
        // With a taskbar that hides itself, a maximized window fills the whole screen.
        let maximized = Seen {
            bounds: SCREEN,
            topmost: false,
            maximized: true,
        };
        assert!(!decide([maximized], SCREEN));
        // Maximized to the work area: not the whole screen either.
        assert!(!decide([window((0, 0, 1920, 1032))], SCREEN));
    }
}
