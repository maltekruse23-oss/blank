//! Copy of the web settings (preferences, music, programs to take along) in settings.json next to
//! twitch.json. The WebView's own storage stays the main place; this copy fills in when that storage
//! comes up empty or older (seen once: an app start without its saved settings). Holds no secrets
//! and is never exported or uploaded as such.

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

const MAX_BYTES: usize = 512 * 1024;

pub struct StoreFile(PathBuf);

impl StoreFile {
    pub fn new(app: &AppHandle) -> tauri::Result<Self> {
        Ok(Self(app.path().app_config_dir()?.join("settings.json")))
    }
}

fn read(path: &std::path::Path) -> Result<Option<String>, String> {
    match std::fs::read_to_string(path) {
        Ok(text) => Ok(Some(text)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

/// Writes to a temporary file first, so a crash never leaves a half-written copy.
fn write(path: &std::path::Path, content: &str) -> Result<(), String> {
    if content.len() > MAX_BYTES {
        return Err("Einstellungen zu groß".into());
    }
    let valid = serde_json::from_str::<serde_json::Value>(content).is_ok_and(|v| v.is_object());
    if !valid {
        return Err("Keine gültigen Einstellungen".into());
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, content).map_err(|e| e.to_string())?;
    std::fs::rename(&temp, path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn settings_mirror_read(file: tauri::State<'_, StoreFile>) -> Result<Option<String>, String> {
    read(&file.0)
}

#[tauri::command]
pub fn settings_mirror_write(
    file: tauri::State<'_, StoreFile>,
    content: String,
) -> Result<(), String> {
    write(&file.0, &content)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copy_is_written_whole_and_checked() {
        let dir = std::env::temp_dir().join(format!("blank-store-test-{}", std::process::id()));
        let path = dir.join("settings.json");
        assert_eq!(read(&path), Ok(None));
        write(&path, r#"{"savedAt":1,"items":{}}"#).unwrap();
        assert_eq!(
            read(&path).unwrap().as_deref(),
            Some(r#"{"savedAt":1,"items":{}}"#)
        );
        // Broken or oversized content never replaces a good copy.
        assert!(write(&path, "{ kaputt").is_err());
        assert!(write(&path, "[1,2]").is_err());
        assert!(write(&path, &format!("{{\"x\":\"{}\"}}", "a".repeat(MAX_BYTES))).is_err());
        assert_eq!(
            read(&path).unwrap().as_deref(),
            Some(r#"{"savedAt":1,"items":{}}"#)
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
