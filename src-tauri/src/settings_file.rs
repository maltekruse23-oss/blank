//! Settings export (Settings → Übertragen): writes one file to the Downloads folder and shows it in
//! Explorer. The web content passes its part (appearance, notifications, music); the Twitch channel
//! selection and Client ID are added here. The Twitch login (token) is never exported. Importing
//! happens in the web content (Windows file picker), which applies each part the usual way.
use crate::twitch::Twitch;
use std::path::{Path, PathBuf};
use tauri::State;

const MAX_BYTES: usize = 512 * 1024;
const FILE_NAME: &str = "blank-einstellungen";

type Object = serde_json::Map<String, serde_json::Value>;

/// The web content's part: a JSON object marked as blank. settings, of sane size.
fn checked(content: &str) -> Result<Object, String> {
    let invalid = || "Ungültige Einstellungen".to_string();
    if content.len() > MAX_BYTES {
        return Err(invalid());
    }
    match serde_json::from_str(content).map_err(|_| invalid())? {
        serde_json::Value::Object(map)
            if map.get("app").and_then(|app| app.as_str()) == Some("blank.") =>
        {
            Ok(map)
        }
        _ => Err(invalid()),
    }
}

/// First free name: blank-einstellungen.json, then "blank-einstellungen (2).json" and so on.
fn free_path(dir: &Path, exists: impl Fn(&Path) -> bool) -> Option<PathBuf> {
    (1..100)
        .map(|n| match n {
            1 => dir.join(format!("{FILE_NAME}.json")),
            n => dir.join(format!("{FILE_NAME} ({n}).json")),
        })
        .find(|path| !exists(path))
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(Some(0)).collect()
}

/// The user's Downloads folder, also when it was moved (e.g. to another drive or OneDrive).
fn downloads() -> Option<PathBuf> {
    use windows_sys::Win32::{
        System::Com::CoTaskMemFree,
        UI::Shell::{FOLDERID_Downloads, SHGetKnownFolderPath},
    };
    let mut raw = std::ptr::null_mut();
    // SAFETY: valid GUID pointer and out-pointer; the returned buffer is freed with
    // CoTaskMemFree as documented, also on failure.
    let path = unsafe {
        let result = SHGetKnownFolderPath(&FOLDERID_Downloads, 0, std::ptr::null_mut(), &mut raw);
        let path = (result == 0 && !raw.is_null()).then(|| {
            let length = (0..).take_while(|&i| *raw.add(i) != 0).count();
            String::from_utf16_lossy(std::slice::from_raw_parts(raw, length))
        });
        CoTaskMemFree(raw.cast());
        path
    };
    path.map(PathBuf::from)
        .or_else(|| {
            std::env::var_os("USERPROFILE").map(|home| PathBuf::from(home).join("Downloads"))
        })
        .filter(|dir| dir.is_dir())
}

/// Opens Explorer with the file selected.
fn reveal(path: &Path) {
    use windows_sys::Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL};
    let (verb, program) = (wide("open"), wide("explorer.exe"));
    let arguments = wide(&format!("/select,\"{}\"", path.display()));
    // SAFETY: all strings are NUL-terminated and outlive the call.
    unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            verb.as_ptr(),
            program.as_ptr(),
            arguments.as_ptr(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        );
    }
}

/// Saves the settings file; returns its file name.
#[tauri::command]
pub async fn settings_export(twitch: State<'_, Twitch>, content: String) -> Result<String, String> {
    let mut settings = checked(&content)?;
    settings.insert("twitch".into(), twitch.export().await);
    let dir = downloads().ok_or("Downloads-Ordner nicht gefunden")?;
    let path = free_path(&dir, Path::exists).ok_or("Kein freier Dateiname in Downloads")?;
    let text = serde_json::to_string_pretty(&serde_json::Value::Object(settings))
        .map_err(|error| error.to_string())?;
    std::fs::write(&path, text).map_err(|error| format!("Speichern fehlgeschlagen: {error}"))?;
    reveal(&path);
    Ok(path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::{checked, free_path};
    use std::path::{Path, PathBuf};

    #[test]
    fn accepts_only_blank_settings_objects() {
        assert!(checked(r#"{"app":"blank.","format":1}"#).is_ok());
        assert!(checked(r#"{"app":"other"}"#).is_err());
        assert!(checked("[1,2]").is_err());
        assert!(checked("not json").is_err());
        let huge = format!(r#"{{"app":"blank.","x":"{}"}}"#, "a".repeat(600 * 1024));
        assert!(checked(&huge).is_err());
    }

    #[test]
    fn picks_the_first_free_file_name() {
        let dir = Path::new("D");
        assert_eq!(
            free_path(dir, |_| false),
            Some(PathBuf::from("D").join("blank-einstellungen.json"))
        );
        let taken = [
            dir.join("blank-einstellungen.json"),
            dir.join("blank-einstellungen (2).json"),
        ];
        assert_eq!(
            free_path(dir, |p| taken.iter().any(|t| t == p)),
            Some(dir.join("blank-einstellungen (3).json"))
        );
    }
}
