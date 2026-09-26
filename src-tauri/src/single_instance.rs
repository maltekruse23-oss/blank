//! Only one blank. at a time. Two instances would open exactly on top of each other (second
//! monitor), announce every go-live twice and overwrite each other's settings with stale values.
//! A second start brings the running window to the front and exits.
use std::sync::atomic::{AtomicIsize, Ordering};
use windows_sys::Win32::{
    Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS},
    System::Threading::CreateMutexW,
    UI::WindowsAndMessaging::{FindWindowW, IsIconic, SetForegroundWindow, ShowWindow, SW_RESTORE},
};

/// The mutex while this process owns it (0 otherwise).
static OWNED: AtomicIsize = AtomicIsize::new(0);

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(Some(0)).collect()
}

/// `false` if blank. is already running (its window has then been shown).
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
    let (class, title) = (wide("Tauri Window"), wide("blank."));
    // SAFETY: both strings are null-terminated; the window handle is only passed back to Windows.
    unsafe {
        let window = FindWindowW(class.as_ptr(), title.as_ptr());
        if !window.is_null() {
            if IsIconic(window) != 0 {
                ShowWindow(window, SW_RESTORE);
            }
            SetForegroundWindow(window);
        }
    }
    false
}

/// Lets the updated EXE become the one instance while this process is shutting down (update.rs).
pub fn release() {
    let handle = OWNED.swap(0, Ordering::Relaxed);
    if handle != 0 {
        // SAFETY: the handle came from CreateMutexW in acquire and is closed once.
        unsafe { CloseHandle(handle as windows_sys::Win32::Foundation::HANDLE) };
    }
}
