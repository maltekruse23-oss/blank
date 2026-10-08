//! "Start with Windows" for the current user: a value in HKCU\...\CurrentVersion\Run that points to
//! this executable. Task Manager's "Autostart apps" page can disable such an entry separately
//! (StartupApproved); that counts as off, and switching it on here enables it again. Switching on
//! also writes the "enabled" mark into StartupApproved, exactly as Task Manager does: on the test
//! PC Windows skipped the entry at sign-in without that mark, while apps with it started.

#[cfg(windows)]
mod registry {
    use windows_sys::Win32::{
        Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS},
        System::Registry::{
            RegDeleteKeyValueW, RegGetValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_BINARY,
            REG_SZ, RRF_RT_ANY, RRF_RT_REG_BINARY, RRF_RT_REG_SZ,
        },
    };

    pub const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
    pub const APPROVED: &str =
        r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
    const NAME: &str = "blank";
    /// "Enabled" in StartupApproved: first byte 2, then an empty time stamp (12 bytes, as Windows
    /// writes it).
    const APPROVED_ON: [u8; 12] = [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

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

    pub fn status() -> Result<super::Autostart, String> {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let stored = read(RUN, RRF_RT_REG_SZ)?.map(|data| {
            let units: Vec<u16> = data
                .as_chunks::<2>()
                .0
                .iter()
                .map(|b| u16::from_le_bytes(*b))
                .take_while(|c| *c != 0)
                .collect();
            String::from_utf16_lossy(&units)
        });
        let own = command()?.to_lowercase();
        let points_here = stored.as_deref().is_some_and(|s| s.to_lowercase() == own);
        // StartupApproved: first byte odd = disabled in Task Manager.
        let disabled = stored.is_some()
            && read(APPROVED, RRF_RT_REG_BINARY)?
                .and_then(|d| d.first().copied())
                .is_some_and(|b| b & 1 == 1);
        let other = stored
            .filter(|_| !points_here)
            .map(|command| super::program_of(&command));
        Ok(super::Autostart {
            enabled: points_here && !disabled,
            other_missing: other
                .as_deref()
                .is_some_and(|p| !std::path::Path::new(p).exists()),
            other,
            disabled,
            path: exe.display().to_string(),
        })
    }

    fn write(key: &str, kind: u32, data: &[u8]) -> Result<(), String> {
        let (key, name) = (wide(key), wide(NAME));
        // SAFETY: strings are null-terminated; data/size describe a valid buffer.
        let code = unsafe {
            RegSetKeyValueW(
                HKEY_CURRENT_USER,
                key.as_ptr(),
                name.as_ptr(),
                kind,
                data.as_ptr().cast(),
                data.len() as u32,
            )
        };
        if code == ERROR_SUCCESS {
            Ok(())
        } else {
            Err(failed(code))
        }
    }

    /// Removes the entry and its Task Manager mark from these keys; true if either was there.
    pub fn remove(run: &str, approved: &str) -> Result<bool, String> {
        let there = read(run, RRF_RT_ANY)?.is_some() || read(approved, RRF_RT_ANY)?.is_some();
        delete(run)?;
        delete(approved)?;
        Ok(there)
    }

    pub fn set(on: bool) -> Result<(), String> {
        if !on {
            return remove(RUN, APPROVED).map(drop);
        }
        let value: Vec<u8> = wide(&command()?)
            .iter()
            .flat_map(|c| c.to_le_bytes())
            .collect();
        write(RUN, REG_SZ, &value)?;
        // Replaces a "disabled" mark from Task Manager, too.
        write(APPROVED, REG_BINARY, &APPROVED_ON)
    }

    /// Autostart switched on before the "enabled" mark was written: adds the mark. Changes
    /// nothing when the entry points elsewhere or is switched off in Task Manager.
    pub fn repair() -> Result<(), String> {
        let status = status()?;
        if status.enabled && read(APPROVED, RRF_RT_REG_BINARY)?.is_none() {
            write(APPROVED, REG_BINARY, &APPROVED_ON)?;
        }
        Ok(())
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        /// Under a throw-away test key (HKCU\Software\blank-test), never the real Run key.
        #[test]
        fn remove_takes_the_entry_and_its_mark() {
            const TEST: &str = r"Software\blank-test\autostart";
            const TEST_RUN: &str = r"Software\blank-test\autostart\Run";
            const TEST_APPROVED: &str = r"Software\blank-test\autostart\Approved";
            let command: Vec<u8> = wide(r#""C:\Apps\blank.exe""#)
                .iter()
                .flat_map(|c| c.to_le_bytes())
                .collect();
            write(TEST_RUN, REG_SZ, &command).unwrap();
            write(TEST_APPROVED, REG_BINARY, &APPROVED_ON).unwrap();
            assert_eq!(remove(TEST_RUN, TEST_APPROVED), Ok(true));
            assert_eq!(read(TEST_RUN, RRF_RT_ANY), Ok(None));
            assert_eq!(read(TEST_APPROVED, RRF_RT_ANY), Ok(None));
            // Nothing there: nothing to report, no error.
            assert_eq!(remove(TEST_RUN, TEST_APPROVED), Ok(false));
            for key in [TEST_RUN, TEST_APPROVED, TEST, r"Software\blank-test"] {
                // SAFETY: null-terminated key name; fails harmlessly while other tests use it.
                unsafe {
                    windows_sys::Win32::System::Registry::RegDeleteKeyW(
                        HKEY_CURRENT_USER,
                        wide(key).as_ptr(),
                    );
                }
            }
        }
    }
}

/// blank.'s entry, removed when blank. becomes the Mayhem app (from_blank.rs).
#[cfg(windows)]
pub use registry::{remove, APPROVED, RUN};

/// What Windows starts at sign-in, seen from this copy of the app.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Autostart {
    /// Windows starts this file at sign-in.
    enabled: bool,
    /// The entry starts another file (e.g. an older blank.exe in Downloads).
    other: Option<String>,
    /// That other file no longer exists, so nothing starts.
    other_missing: bool,
    /// The entry is switched off in Task Manager.
    disabled: bool,
    /// This file.
    path: String,
}

/// Program path of a Run command: the quoted part, or the whole text.
#[cfg_attr(not(windows), allow(dead_code))]
fn program_of(command: &str) -> String {
    let command = command.trim();
    match command
        .strip_prefix('"')
        .and_then(|rest| rest.split_once('"'))
    {
        Some((program, _)) => program.to_string(),
        None => command.to_string(),
    }
}

/// At app start: adds the "enabled" mark to an autostart switched on by an older version.
#[cfg(windows)]
pub fn repair() {
    let _ = registry::repair();
}

#[tauri::command]
pub fn autostart_status() -> Result<Autostart, String> {
    #[cfg(windows)]
    return registry::status();
    #[cfg(not(windows))]
    Err("Nur unter Windows".into())
}

/// Returns the state after the change.
#[tauri::command]
pub fn set_autostart(enabled: bool) -> Result<Autostart, String> {
    #[cfg(windows)]
    {
        registry::set(enabled)?;
        registry::status()
    }
    #[cfg(not(windows))]
    {
        let _ = enabled;
        Err("Nur unter Windows".into())
    }
}

#[cfg(test)]
mod tests {
    use super::program_of;

    #[test]
    fn program_path_is_taken_from_the_command() {
        let path = r"C:\Programme\blank\blank.exe";
        assert_eq!(program_of(&format!("\"{path}\"")), path);
        assert_eq!(program_of(&format!("\"{path}\" --minimized")), path);
        assert_eq!(program_of(path), path);
    }
}
