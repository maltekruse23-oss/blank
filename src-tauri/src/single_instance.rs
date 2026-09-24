//! Only one blank. at a time. Two instances would open exactly on top of each other (second
//! monitor), announce every go-live twice and overwrite each other's settings with stale values.
//! A second start brings the running window to the front (as the full app, also out of pet mode)
//! and exits.
use windows_sys::Win32::{
    Foundation::{GetLastError, ERROR_ALREADY_EXISTS},
    System::Threading::CreateMutexW,
    UI::WindowsAndMessaging::{
        FindWindowW, IsIconic, PostMessageW, RegisterWindowMessageW, SetForegroundWindow,
        ShowWindow, SW_RESTORE,
    },
};

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(Some(0)).collect()
}

/// Window message the running instance answers by showing the full app (pet.rs).
pub fn show_app_message() -> u32 {
    let name = wide("blank.show-app");
    // SAFETY: the name is null-terminated.
    unsafe { RegisterWindowMessageW(name.as_ptr()) }
}

/// `false` if blank. is already running (its window has then been shown).
pub fn acquire() -> bool {
    let name = wide(r"Local\blank.single-instance");
    // SAFETY: the name is null-terminated. The handle is kept open for the whole process lifetime
    // on purpose; Windows releases the mutex when the process ends.
    let handle = unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) };
    // SAFETY: reads the error of the call above.
    if handle.is_null() || unsafe { GetLastError() } != ERROR_ALREADY_EXISTS {
        // Also when the mutex cannot be created: better a second window than none.
        return true;
    }
    let (class, title) = (wide("Tauri Window"), wide("blank."));
    // SAFETY: both strings are null-terminated; the window handle is only passed back to Windows.
    unsafe {
        let window = FindWindowW(class.as_ptr(), title.as_ptr());
        if !window.is_null() {
            PostMessageW(window, show_app_message(), 0, 0);
            if IsIconic(window) != 0 {
                ShowWindow(window, SW_RESTORE);
            }
            SetForegroundWindow(window);
        }
    }
    false
}
