//! blank. becomes the Mayhem app (user's decision 08.10.2026, ROADMAP "Jetzt 1"): from the release
//! after 0.9.2 the asset `blank.exe` is the Mayhem build, so blank.'s own updater puts the Mayhem
//! app in place of blank.'s file (whatever its name) and starts it. Only a start whose replaced
//! file (`<exe>.old`, which the update leaves until this start's setup removes it) is a blank.
//! build cleans up – decided by that file's version resource, not by this file's name or
//! arguments: so a renamed blank. ("blank (1).exe") is cleaned up too, and an update of the
//! Mayhem app itself (its `.old` is "Mayhem") never. Order: blank.'s gaming tweaks set back
//! exactly from their backup (tweaks.rs), its autostart entry, its Twitch sign-in in the Windows
//! Credential Manager, then its two folders (settings, games, error log; WebView2's data) – only
//! folders named after blank.'s identifier. The first error stops it, so a tweak that cannot be set
//! back keeps its backup and everything else; a mark in the Mayhem app's own folder stays until a
//! cleanup worked, so every later start tries again (silently; only the first tells of an error).
//! A run that finds nothing says nothing; what was removed is shown once, in English.

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
/// blank.'s product name, in the version resource of every blank. build (0.1.0 to 0.9.2).
const BLANK_PRODUCT: &str = "blank.";
/// In the Mayhem app's own folder while a cleanup is due.
const MARK: &str = "from-blank";
/// WebView2 of the old blank. can hold a file for a moment after blank. ended.
const TRIES: u32 = 10;
const WAIT: Duration = Duration::from_millis(500);
const STOPPED: &str = "Cleaning up after blank. stopped with an error, so some of it is still \
                       there. Mayhem tries again at its next start.";

/// Where blank. kept its things; the tests point it at throw-away places.
struct Places {
    /// Settings, games, the tweaks' backup, error log: `%APPDATA%\com.blank.desktop`.
    config: PathBuf,
    /// WebView2's data: `%LOCALAPPDATA%\com.blank.desktop`.
    local: PathBuf,
    /// The mark in the Mayhem app's own folder (`%APPDATA%\lol.mayhemstats.desktop`).
    mark: PathBuf,
    run: &'static str,
    approved: &'static str,
    twitch: &'static str,
}

/// The cleanup of this start, until the window asks for its result.
static RUNNING: Mutex<Option<JoinHandle<Option<String>>>> = Mutex::new(None);

/// blank.'s update replaced blank. by this file: the file it replaced is a blank. build. Also
/// found by a later start if the first one ended at once (another Mayhem window was open).
fn replaced_blank(exe: &Path) -> bool {
    crate::pc::file_description(&crate::update::sibling(exe, ".old")).as_deref()
        == Some(BLANK_PRODUCT)
}

/// Whether to clean up now. A start that replaced blank. sets the mark; it stays until a cleanup
/// worked, so each later start tries again.
fn due(replaced: bool, mark: &Path) -> bool {
    if replaced {
        if let Some(dir) = mark.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(mark, b"");
    }
    replaced || mark.exists()
}

/// At the start of the Mayhem app, before update.rs removes the replaced file: cleans up after
/// blank. in the background if this start replaced it or an earlier cleanup did not finish.
pub fn start(app: &AppHandle) {
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    // The same folders Tauri gave blank. (app_config_dir, and WebView2's in app_local_data_dir).
    let path = app.path();
    let (Ok(config), Ok(local), Ok(own)) = (
        path.config_dir(),
        path.local_data_dir(),
        path.app_config_dir(),
    ) else {
        return;
    };
    let places = Places {
        config: config.join(BLANK_IDENTIFIER),
        local: local.join(BLANK_IDENTIFIER),
        mark: own.join(MARK),
        run: crate::autostart::RUN,
        approved: crate::autostart::APPROVED,
        twitch: crate::twitch::auth::CREDENTIAL_SERVICE,
    };
    let replaced = replaced_blank(&exe);
    if !due(replaced, &places.mark) {
        return;
    }
    let job = thread::spawn(move || run(&places, replaced));
    if let Ok(mut running) = RUNNING.lock() {
        *running = Some(job);
    }
}

/// One cleanup; the mark goes once it worked. Only the start that replaced blank. tells of an
/// error (later tries only log it, so a lasting error does not show at every start).
fn run(places: &Places, replaced: bool) -> Option<String> {
    let result = clean(places);
    if result.is_ok() {
        let _ = std::fs::remove_file(&places.mark);
    }
    notice(result, replaced)
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

fn notice(result: Result<Vec<&str>, String>, replaced: bool) -> Option<String> {
    match result {
        Ok(done) if done.is_empty() => None,
        Ok(done) => Some(format!("Cleaned up after blank.: {}.", done.join(", "))),
        Err(error) => {
            crate::errors::record("blank. cleanup", &error);
            replaced.then(|| STOPPED.into())
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
            mark: root
                .join("Roaming")
                .join(crate::mayhem::IDENTIFIER)
                .join(MARK),
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

    /// Decided by the replaced file's version resource, which Tauri fills with the productName:
    /// "blank." in blank.'s config, "Mayhem" in the Mayhem app's.
    #[test]
    fn runs_only_when_it_replaced_blank() {
        let read = |name: &str| -> serde_json::Value {
            serde_json::from_str(
                &std::fs::read_to_string(format!("{}/{name}", env!("CARGO_MANIFEST_DIR"))).unwrap(),
            )
            .unwrap()
        };
        assert_eq!(read("tauri.conf.json")["productName"], BLANK_PRODUCT);
        assert_ne!(read("tauri.mayhem.conf.json")["productName"], BLANK_PRODUCT);
        let dir = std::env::temp_dir().join(format!("blank-from-old-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let exe = dir.join("blank.exe");
        // No replaced file (a normal start): never.
        assert!(!replaced_blank(&exe));
        // Another program (stands in for the Mayhem build: its own update) or no resource: never.
        let other = Path::new(&std::env::var("SystemRoot").unwrap()).join(r"System32\cmd.exe");
        assert!(crate::pc::file_description(&other).is_some_and(|d| !d.is_empty()));
        std::fs::copy(&other, crate::update::sibling(&exe, ".old")).unwrap();
        assert!(!replaced_blank(&exe));
        std::fs::write(crate::update::sibling(&exe, ".old"), b"MZ old").unwrap();
        assert!(!replaced_blank(&exe));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    /// With a real blank. build, under any name: `BLANK_EXE=<path to blank.exe> cargo test --lib
    /// -- --ignored replaced_a_real_blank` (copies it, runs nothing).
    #[test]
    #[ignore]
    fn replaced_a_real_blank() {
        let blank = std::env::var("BLANK_EXE").expect("BLANK_EXE");
        let dir = std::env::temp_dir().join(format!("blank-from-real-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        for name in ["blank.exe", "blank (1).exe"] {
            let exe = dir.join(name);
            std::fs::copy(&blank, crate::update::sibling(&exe, ".old")).unwrap();
            assert!(replaced_blank(&exe), "{name}");
        }
        std::fs::remove_dir_all(&dir).unwrap();
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

        // The start that replaced blank.
        assert!(due(true, &places.mark));
        assert!(places.mark.exists());
        let said = run(&places, true).unwrap();
        assert!(said.starts_with("Cleaned up after blank.: "), "{said}");
        assert!(said.contains("settings and saved games deleted"));
        assert_eq!(said.contains("Twitch sign-in removed"), signed_in);
        // An empty backup and empty test keys: nothing to report.
        assert!(!said.contains("gaming tweaks set back"));
        assert!(!said.contains("start with Windows off"));
        assert!(!places.config.exists());
        assert!(!places.local.exists());
        assert!(mayhem.exists());
        assert!(!places.mark.exists());
        // Later the Mayhem app updates itself (no blank. replaced, no mark): nothing runs, even
        // when blank.'s folder is back (a blank. built by hand on this PC).
        file(&places.config.join("settings.json"), "{}");
        assert!(!due(false, &places.mark));
        assert!(places.config.join("settings.json").exists());
        // A run that finds nothing says nothing.
        std::fs::remove_dir_all(&places.config).unwrap();
        assert_eq!(run(&places, true), None);
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
            assert!(due(true, &places.mark));
            assert_eq!(run(&places, true).as_deref(), Some(STOPPED));
            // The mark stays: every later start tries again, without saying it again.
            assert!(due(false, &places.mark));
            assert_eq!(run(&places, false), None);
            assert_eq!(std::fs::read_to_string(&backup).unwrap(), text);
            assert!(settings.exists());
        }
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
