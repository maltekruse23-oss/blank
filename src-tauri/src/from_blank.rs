//! blank. becomes the Mayhem app (user's decision 08.10.2026, ROADMAP "Jetzt 1"): from the release
//! after 0.9.2 the asset `blank.exe` is the Mayhem build, so blank.'s own updater puts the Mayhem
//! app in place of blank.exe and starts it with `--after-update`. Only that start cleans up after
//! blank. (file blank.exe and started by an update; never a normal start, never mayhem.exe), in
//! this order: blank.'s gaming tweaks set back exactly from their backup (tweaks.rs), its
//! autostart entry, its Twitch sign-in in the Windows Credential Manager, then its two folders
//! (settings, games, error log; WebView2's data) – only folders named after blank.'s identifier.
//! The first error stops it, so a tweak that cannot be set back keeps its backup and everything
//! else; the next update of the Mayhem app (still blank.exe) tries again. A run that finds nothing
//! says nothing; what was removed is shown once, in English.

use std::{
    ffi::OsStr,
    path::{Path, PathBuf},
    sync::Mutex,
    thread::{self, JoinHandle},
    time::Duration,
};

use tauri::{AppHandle, Manager};

/// blank.'s identifier (tauri.conf.json); its folders are named after it.
const BLANK_IDENTIFIER: &str = "com.blank.desktop";
/// WebView2 of the old blank. can hold a file for a moment after blank. ended.
const TRIES: u32 = 10;
const WAIT: Duration = Duration::from_millis(500);
const STOPPED: &str = "Cleaning up after blank. stopped with an error, so some of it is still \
                       there. Mayhem tries again after its next update.";

/// Where blank. kept its things; the tests point it at throw-away places.
struct Places {
    /// Settings, games, the tweaks' backup, error log: `%APPDATA%\com.blank.desktop`.
    config: PathBuf,
    /// WebView2's data: `%LOCALAPPDATA%\com.blank.desktop`.
    local: PathBuf,
    run: &'static str,
    approved: &'static str,
    twitch: &'static str,
}

/// The cleanup of this start, until the window asks for its result.
static RUNNING: Mutex<Option<JoinHandle<Option<String>>>> = Mutex::new(None);

/// This start replaced blank.: blank.'s updater started the new file as blank.exe.
fn wanted(args: &[String], exe: &Path) -> bool {
    args.get(1).map(String::as_str) == Some(crate::update::AFTER_UPDATE_ARG)
        && exe
            .file_name()
            .is_some_and(|name| name.eq_ignore_ascii_case("blank.exe"))
}

/// At the start of the Mayhem app: cleans up after blank. in the background if this start
/// replaced it.
pub fn start(app: &AppHandle) {
    let args: Vec<String> = std::env::args().collect();
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    if !wanted(&args, &exe) {
        return;
    }
    // The same folders Tauri gave blank. (app_config_dir, and WebView2's in app_local_data_dir).
    let path = app.path();
    let (Ok(config), Ok(local)) = (path.config_dir(), path.local_data_dir()) else {
        return;
    };
    let places = Places {
        config: config.join(BLANK_IDENTIFIER),
        local: local.join(BLANK_IDENTIFIER),
        run: crate::autostart::RUN,
        approved: crate::autostart::APPROVED,
        twitch: crate::twitch::auth::CREDENTIAL_SERVICE,
    };
    let job = thread::spawn(move || notice(clean(&places)));
    if let Ok(mut running) = RUNNING.lock() {
        *running = Some(job);
    }
}

/// Once, after the cleanup has finished: what to tell the user (`None`: nothing).
#[tauri::command]
pub async fn mayhem_moved() -> Option<String> {
    let job = RUNNING.lock().ok()?.take()?;
    tauri::async_runtime::spawn_blocking(move || job.join().ok().flatten())
        .await
        .ok()
        .flatten()
}

/// Cleans up after blank.; what was done, as short English parts. Stops at the first error.
fn clean(places: &Places) -> Result<Vec<&'static str>, String> {
    let mut done = Vec::new();
    // First and alone: a tweak that cannot be set back keeps its backup and all the rest.
    let tweaks = crate::tweaks::undo_all(&places.config.join("tweaks.json"))
        .map_err(|error| format!("gaming tweaks: {error}"))?;
    if tweaks > 0 {
        done.push("gaming tweaks set back");
    }
    if crate::autostart::remove(places.run, places.approved)
        .map_err(|error| format!("autostart: {error}"))?
    {
        done.push("start with Windows off");
    }
    if forget_twitch(places.twitch)? {
        done.push("Twitch sign-in removed");
    }
    let config = remove_folder(&places.config)?;
    if remove_folder(&places.local)? || config {
        done.push("settings and saved games deleted");
    }
    Ok(done)
}

/// blank.'s Twitch token in the Windows Credential Manager; true if it was there.
fn forget_twitch(service: &str) -> Result<bool, String> {
    match keyring::Entry::new(service, crate::twitch::auth::CREDENTIAL_USER)
        .and_then(|entry| entry.delete_credential())
    {
        Ok(()) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(format!("Twitch sign-in: {error}")),
    }
}

/// Deletes one of blank.'s folders with everything in it; true if it was there. Never a folder
/// that is not named after blank. (Rust does not follow links inside while deleting.)
fn remove_folder(dir: &Path) -> Result<bool, String> {
    if dir.file_name() != Some(OsStr::new(BLANK_IDENTIFIER)) {
        return Err(format!("not blank.'s folder: {}", dir.display()));
    }
    if !dir.exists() {
        return Ok(false);
    }
    let mut tries = 1;
    while let Err(error) = std::fs::remove_dir_all(dir) {
        if !dir.exists() {
            break;
        }
        if tries == TRIES {
            return Err(format!("{}: {error}", dir.display()));
        }
        tries += 1;
        thread::sleep(WAIT);
    }
    Ok(true)
}

fn notice(result: Result<Vec<&str>, String>) -> Option<String> {
    match result {
        Ok(done) if done.is_empty() => None,
        Ok(done) => Some(format!("Cleaned up after blank.: {}.", done.join(", "))),
        Err(error) => {
            crate::errors::record("blank. cleanup", &error);
            Some(STOPPED.into())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn places(root: &Path, twitch: &'static str) -> Places {
        Places {
            config: root.join("Roaming").join(BLANK_IDENTIFIER),
            local: root.join("Local").join(BLANK_IDENTIFIER),
            // Throw-away test keys (HKCU\Software\blank-test), never the real Run key; nothing is
            // written there (autostart.rs tests the removal itself).
            run: r"Software\blank-test\from-blank\Run",
            approved: r"Software\blank-test\from-blank\Approved",
            twitch,
        }
    }

    fn file(path: &Path, text: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, text).unwrap();
    }

    #[test]
    fn runs_only_when_blanks_update_started_it() {
        let after = |pid: &str| ["blank.exe", "--after-update", pid].map(String::from);
        assert!(wanted(&after("42"), Path::new(r"C:\Apps\blank.exe")));
        assert!(wanted(&after("42"), Path::new(r"C:\Apps\BLANK.EXE")));
        // The Mayhem app's own update, a normal start, a restart: never.
        assert!(!wanted(&after("42"), Path::new(r"C:\Apps\mayhem.exe")));
        assert!(!wanted(
            &["blank.exe".into()],
            Path::new(r"C:\Apps\blank.exe")
        ));
        assert!(!wanted(
            &["blank.exe", "--restart", "42"].map(String::from),
            Path::new(r"C:\Apps\blank.exe")
        ));
    }

    #[test]
    fn cleans_up_blank_once_and_nothing_else() {
        let root = std::env::temp_dir().join(format!("blank-from-test-{}", std::process::id()));
        let places = places(&root, "blank-test.twitch.cleanup");
        file(&places.config.join("settings.json"), "{}");
        file(&places.config.join("tweaks.json"), r#"{"changes":{}}"#);
        file(&places.config.join("aram-archive").join("1.json"), "{}");
        file(
            &places
                .local
                .join("EBWebView")
                .join("Default")
                .join("Preferences"),
            "{}",
        );
        // The Mayhem app's own folder next to blank.'s stays.
        let mayhem = root
            .join("Roaming")
            .join(crate::mayhem::IDENTIFIER)
            .join("errors.log");
        file(&mayhem, "x");
        // A throw-away credential, never blank.'s real one.
        let entry =
            keyring::Entry::new(places.twitch, crate::twitch::auth::CREDENTIAL_USER).unwrap();
        let signed_in = entry.set_password("test").is_ok();

        let done = clean(&places).unwrap();
        assert!(done.contains(&"settings and saved games deleted"));
        assert_eq!(done.contains(&"Twitch sign-in removed"), signed_in);
        // An empty backup and empty test keys: nothing to report.
        assert!(!done.contains(&"gaming tweaks set back"));
        assert!(!done.contains(&"start with Windows off"));
        assert!(!places.config.exists());
        assert!(!places.local.exists());
        assert!(mayhem.exists());
        assert_eq!(
            notice(Ok(done.clone())),
            Some(format!("Cleaned up after blank.: {}.", done.join(", ")))
        );
        // Again (the Mayhem app's next update as blank.exe): nothing left, nothing to say.
        assert_eq!(clean(&places), Ok(Vec::new()));
        assert_eq!(notice(Ok(Vec::new())), None);
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn a_tweak_it_cannot_set_back_stops_everything() {
        let root = std::env::temp_dir().join(format!("blank-from-stop-{}", std::process::id()));
        let places = places(&root, "blank-test.twitch.stop");
        let backup = places.config.join("tweaks.json");
        let settings = places.config.join("settings.json");
        file(&settings, "{}");
        // From another version, so unknown here: cannot be set back. Same for a damaged file.
        let unknown =
            r#"{"changes":{"from-another-version":{"changedAt":1,"before":[{"kind":"absent"}]}}}"#;
        for text in [unknown, "{ kaputt"] {
            file(&backup, text);
            assert!(clean(&places).is_err());
            assert_eq!(std::fs::read_to_string(&backup).unwrap(), text);
            assert!(settings.exists());
        }
        assert_eq!(notice(Err("test".into())).as_deref(), Some(STOPPED));
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn deletes_only_folders_named_after_blank() {
        let dir = std::env::temp_dir().join(format!("blank-from-guard-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert!(remove_folder(&dir).is_err());
        assert!(dir.exists());
        std::fs::remove_dir_all(&dir).unwrap();
        // The name is blank.'s identifier, not the Mayhem app's.
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(config["identifier"], BLANK_IDENTIFIER);
        assert_ne!(BLANK_IDENTIFIER, crate::mayhem::IDENTIFIER);
    }
}
