//! "Start with Windows" for the current user: a value in HKCU\...\CurrentVersion\Run that points to
//! this executable. Task Manager's "Autostart apps" page can disable such an entry separately
//! (StartupApproved); that counts as off, and switching it on here enables it again.

#[cfg(windows)]
mod registry {
    use windows_sys::Win32::{
        Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS},
        System::Registry::{
            RegDeleteKeyValueW, RegGetValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ,
            RRF_RT_REG_BINARY, RRF_RT_REG_SZ,
        },
    };

    const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
    const APPROVED: &str =
        r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
    const NAME: &str = "blank";

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(Some(0)).collect()
    }

    fn failed(code: u32) -> String {
        format!("Windows-Registry nicht verfügbar (Fehler {code})")
    }

    /// Raw value data, or `None` if the value does not exist.
    fn read(key: &str, flags: u32) -> Result<Option<Vec<u8>>, String> {
        let (key, name) = (wide(key), wide(NAME));
        let mut size = 0u32;
        // SAFETY: null data pointer asks for the size only; strings are null-terminated.
        let code = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                key.as_ptr(),
                name.as_ptr(),
                flags,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                &mut size,
            )
        };
        if code == ERROR_FILE_NOT_FOUND {
            return Ok(None);
        }
        if code != ERROR_SUCCESS {
            return Err(failed(code));
        }
        let mut data = vec![0u8; size as usize];
        // SAFETY: data has `size` bytes, as reported by the call above.
        let code = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                key.as_ptr(),
                name.as_ptr(),
                flags,
                std::ptr::null_mut(),
                data.as_mut_ptr().cast(),
                &mut size,
            )
        };
        match code {
            ERROR_SUCCESS => {
                data.truncate(size as usize);
                Ok(Some(data))
            }
            ERROR_FILE_NOT_FOUND => Ok(None),
            _ => Err(failed(code)),
        }
    }

    fn delete(key: &str) -> Result<(), String> {
        let (key, name) = (wide(key), wide(NAME));
        // SAFETY: both strings are null-terminated.
        match unsafe { RegDeleteKeyValueW(HKEY_CURRENT_USER, key.as_ptr(), name.as_ptr()) } {
            ERROR_SUCCESS | ERROR_FILE_NOT_FOUND => Ok(()),
            code => Err(failed(code)),
        }
    }

    /// The command line stored in the Run key.
    fn command() -> Result<String, String> {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        Ok(format!("\"{}\"", exe.display()))
    }

    pub fn enabled() -> Result<bool, String> {
        let Some(data) = read(RUN, RRF_RT_REG_SZ)? else {
            return Ok(false);
        };
        let stored: Vec<u16> = data
            .chunks_exact(2)
            .map(|b| u16::from_le_bytes([b[0], b[1]]))
            .take_while(|c| *c != 0)
            .collect();
        let points_here =
            String::from_utf16_lossy(&stored).to_lowercase() == command()?.to_lowercase();
        // StartupApproved: first byte odd = disabled in Task Manager.
        let disabled = read(APPROVED, RRF_RT_REG_BINARY)?
            .and_then(|d| d.first().copied())
            .is_some_and(|b| b & 1 == 1);
        Ok(points_here && !disabled)
    }

    pub fn set(on: bool) -> Result<(), String> {
        if !on {
            return delete(RUN);
        }
        let (key, name, value) = (wide(RUN), wide(NAME), wide(&command()?));
        // SAFETY: value is a null-terminated UTF-16 string; the size includes the terminator.
        let code = unsafe {
            RegSetKeyValueW(
                HKEY_CURRENT_USER,
                key.as_ptr(),
                name.as_ptr(),
                REG_SZ,
                value.as_ptr().cast(),
                (value.len() * 2) as u32,
            )
        };
        if code != ERROR_SUCCESS {
            return Err(failed(code));
        }
        // Clears a "disabled" mark from Task Manager.
        delete(APPROVED)
    }
}

#[tauri::command]
pub fn autostart_enabled() -> Result<bool, String> {
    #[cfg(windows)]
    return registry::enabled();
    #[cfg(not(windows))]
    Err("Nur unter Windows".into())
}

/// Returns the state after the change.
#[tauri::command]
pub fn set_autostart(enabled: bool) -> Result<bool, String> {
    #[cfg(windows)]
    {
        registry::set(enabled)?;
        registry::enabled()
    }
    #[cfg(not(windows))]
    {
        let _ = enabled;
        Err("Nur unter Windows".into())
    }
}
