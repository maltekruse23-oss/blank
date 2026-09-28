//! Only one blank. at a time. Two instances would open exactly on top of each other (second
//! monitor), announce every go-live twice and overwrite each other's settings with stale values.
//! A second start asks the running blank. to show itself (also out of the notification area, where
//! the X hides it) and exits. The running one shows itself: a window shown from outside would
//! leave its own idea of "hidden" behind, and the next X would do nothing (found by testing).
use std::sync::atomic::{AtomicIsize, Ordering};
use tauri::AppHandle;
use windows_sys::Win32::{
    Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS},
    System::Threading::{
        CreateEventW, CreateMutexW, OpenEventW, SetEvent, WaitForSingleObject, EVENT_MODIFY_STATE,
        INFINITE,
    },
    UI::WindowsAndMessaging::{
        AllowSetForegroundWindow, FindWindowW, GetWindowThreadProcessId, IsIconic,
        SetForegroundWindow, ShowWindow, SW_RESTORE,
    },
};

/// The mutex while this process owns it (0 otherwise).
static OWNED: AtomicIsize = AtomicIsize::new(0);
/// Set by a second start: the running blank. shows itself.
const SHOW_EVENT: &str = r"Local\blank.show";

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(Some(0)).collect()
}

/// `false` if blank. is already running (it has then been asked to show itself).
pub fn acquire() -> bool {
    let name = wide(r"Local\blank.single-instance");
    // SAFETY: the name is null-terminated. The handle is kept open for the whole process lifetime
    // on purpose (or until an update hands over, see release); Windows releases it at the end.
    let handle = unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) };
    // SAFETY: reads the error of the call above.
    if handle.is_null() || unsafe { GetLastError() } != ERROR_ALREADY_EXISTS {
        OWNED.store(handle as isize, Ordering::Relaxed);
        // Also when the mutex cannot be created: better a second window than none.
        return true;
    }
    // The exact title: popouts (flyout.rs) are called "blank. Popout".
    let (class, title, event) = (wide("Tauri Window"), wide("blank."), wide(SHOW_EVENT));
    // SAFETY: all strings are null-terminated; handles are checked, the event handle is closed and
    // the window handle is only passed back to Windows.
    unsafe {
        let window = FindWindowW(class.as_ptr(), title.as_ptr());
        // This start was the user's: it may hand the right to come to the front on.
        if !window.is_null() {
            let mut pid = 0;
            GetWindowThreadProcessId(window, &mut pid);
            if pid != 0 {
                AllowSetForegroundWindow(pid);
            }
        }
        let show = OpenEventW(EVENT_MODIFY_STATE, 0, event.as_ptr());
        if !show.is_null() {
            SetEvent(show);
            CloseHandle(show);
        } else if !window.is_null() {
            // An older blank. without the event (it never hides itself).
            if IsIconic(window) != 0 {
                ShowWindow(window, SW_RESTORE);
            }
            SetForegroundWindow(window);
        }
    }
    false
}

/// Waits (without using the processor) for a second start to ask for the window.
pub fn listen(app: AppHandle) {
    let name = wide(SHOW_EVENT);
    // SAFETY: the name is null-terminated; the auto-reset event lives as long as the process.
    let event = unsafe { CreateEventW(std::ptr::null(), 0, 0, name.as_ptr()) };
    if event.is_null() {
        return;
    }
    let event = event as isize;
    std::thread::spawn(move || loop {
        // SAFETY: the handle stays valid for the whole process (never closed).
        let signalled = unsafe {
            WaitForSingleObject(event as windows_sys::Win32::Foundation::HANDLE, INFINITE)
        };
        if signalled != 0 {
            return;
        }
        crate::tray::show_app(&app);
    });
}

/// Lets the updated EXE become the one instance while this process is shutting down (update.rs).
pub fn release() {
    let handle = OWNED.swap(0, Ordering::Relaxed);
    if handle != 0 {
        // SAFETY: the handle came from CreateMutexW in acquire and is closed once.
        unsafe { CloseHandle(handle as windows_sys::Win32::Foundation::HANDLE) };
    }
}
