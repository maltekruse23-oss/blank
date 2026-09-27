//! Graphics card for the WebView (user's wish; follows "Animationen" in Settings → Darstellung):
//! with animations on, WebView2 may use the graphics card, so motion and blur run smoothly; with
//! them off it draws on the processor as before (`--disable-gpu --in-process-gpu`, less memory).
//! WebView2 takes its arguments only when its first window is created, and all windows of the app
//! share them: the choice (gpu.json next to settings.json) is read once at start, a change applies
//! after a restart.

use std::{path::PathBuf, sync::OnceLock};

use tauri::{AppHandle, Manager};

/// Edge features the app never needs, in every run.
const BASE: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";
/// Drawing on the processor only (animations off).
const ON_PROCESSOR: &str = "--disable-gpu --in-process-gpu";
/// Start of the app after a restart for the graphics card: waits for the old process (main.rs).
pub const RESTART_ARG: &str = "--after-restart";

/// Whether this run uses the graphics card (fixed at the first window).
static THIS_RUN: OnceLock<bool> = OnceLock::new();

fn file(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join("gpu.json"))
}

/// The stored choice; nothing stored yet: on (animations are on by default).
fn wanted(app: &AppHandle) -> bool {
    file(app)
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|text| parse(&text))
        .unwrap_or(true)
}

fn parse(text: &str) -> Option<bool> {
    serde_json::from_str::<serde_json::Value>(text)
        .ok()?
        .get("gpu")?
        .as_bool()
}

fn this_run(app: &AppHandle) -> bool {
    *THIS_RUN.get_or_init(|| wanted(app))
}

/// The WebView2 arguments of this run; every window must be created with exactly these.
pub fn browser_args(app: &AppHandle) -> String {
    if this_run(app) {
        BASE.to_string()
    } else {
        format!("{BASE} {ON_PROCESSOR}")
    }
}

#[derive(serde::Serialize)]
pub struct GpuState {
    /// This run uses the graphics card.
    active: bool,
    /// The next run will (the stored choice).
    wanted: bool,
}

#[tauri::command]
pub fn gpu_state(app: AppHandle) -> GpuState {
    GpuState {
        active: this_run(&app),
        wanted: wanted(&app),
    }
}

/// Stores the choice for the next start (the app calls it when "Animationen" changes).
#[tauri::command]
pub fn set_gpu(app: AppHandle, on: bool) -> Result<(), String> {
    let path = file(&app).ok_or("Kein Einstellungsordner")?;
    if path.exists() && wanted(&app) == on {
        return Ok(());
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    // A temporary file first, so a crash never leaves a half-written one.
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, format!("{{\"gpu\":{on}}}")).map_err(|e| e.to_string())?;
    std::fs::rename(&temp, &path).map_err(|e| e.to_string())
}

/// Starts blank. again (for a changed graphics card choice); the new process waits for this one.
#[tauri::command]
pub fn restart_app(app: AppHandle) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    crate::single_instance::release();
    std::process::Command::new(exe)
        .arg(RESTART_ARG)
        .arg(std::process::id().to_string())
        .spawn()
        .map_err(|_| "Neustart nicht möglich – bitte blank. selbst neu starten.".to_string())?;
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_choice_strictly() {
        assert_eq!(parse(r#"{"gpu":true}"#), Some(true));
        assert_eq!(parse(r#"{"gpu":false}"#), Some(false));
        assert_eq!(parse(r#"{"gpu":"ja"}"#), None);
        assert_eq!(parse("kaputt"), None);
        assert_eq!(parse("{}"), None);
    }
}
