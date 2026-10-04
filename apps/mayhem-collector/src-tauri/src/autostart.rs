use windows_sys::Win32::{
    Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS},
    System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegDeleteValueW, RegSetValueExW, HKEY_CURRENT_USER,
        KEY_SET_VALUE, REG_OPTION_NON_VOLATILE, REG_SZ,
    },
};
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}
pub fn command(exe: &str) -> String {
    format!("\"{exe}\" --background")
}
/// Only this application's per-user Run value. No administrator rights or scheduled task.
pub fn set(enabled: bool) -> Result<(), String> {
    let key = wide("Software\\Microsoft\\Windows\\CurrentVersion\\Run");
    let name = wide("blank.MayhemCollector");
    let exe = std::env::current_exe().map_err(|_| "App-Pfad nicht verfügbar.")?;
    let data = wide(&command(&exe.to_string_lossy()));
    unsafe {
        let mut handle = std::ptr::null_mut();
        if RegCreateKeyExW(
            HKEY_CURRENT_USER,
            key.as_ptr(),
            0,
            std::ptr::null(),
            REG_OPTION_NON_VOLATILE,
            KEY_SET_VALUE,
            std::ptr::null(),
            &mut handle,
            std::ptr::null_mut(),
        ) != ERROR_SUCCESS
        {
            return Err("Windows-Autostart nicht erreichbar.".into());
        }
        let result = if enabled {
            RegSetValueExW(
                handle,
                name.as_ptr(),
                0,
                REG_SZ,
                data.as_ptr() as *const u8,
                (data.len() * 2) as u32,
            )
        } else {
            RegDeleteValueW(handle, name.as_ptr())
        };
        RegCloseKey(handle);
        if result != ERROR_SUCCESS && !(result == ERROR_FILE_NOT_FOUND && !enabled) {
            return Err("Autostart konnte nicht geändert werden.".into());
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    #[test]
    fn executable_paths_are_quoted() {
        assert_eq!(
            super::command("C:\\Program Files\\Collector.exe"),
            "\"C:\\Program Files\\Collector.exe\" --background"
        );
    }
}
