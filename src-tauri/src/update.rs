//! Updates from the app's own GitHub releases (blank.: Settings → System, "Jetzt aktualisieren";
//! the Mayhem app: "Update" in its sidebar). Checking asks GitHub for the latest release (no data
//! about the user is sent). Installing only happens on click: the running app's own file
//! (blank.exe or mayhem.exe, chosen by the config, never by the page) is downloaded from that
//! release, its size and SHA-256 must match what GitHub states, then the running EXE renames
//! itself to `.old`, the new one takes its place and is started; it waits for this process to end
//! and removes the `.old` file. The file replaced is always the running one, whatever its name:
//! since blank. is paused, the asset blank.exe is the Mayhem build, so blank.'s update turns
//! blank.exe into the Mayhem app (from_blank.rs), which then updates itself from mayhem.exe.
use crate::single_instance;
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use tauri::{AppHandle, Emitter, State};

const LATEST: &str = "https://api.github.com/repos/maltekruse23-oss/blank/releases/latest";
const DOWNLOADS: &str = "https://github.com/maltekruse23-oss/blank/releases/download/";
const MAX_BYTES: u64 = 100 * 1024 * 1024;
/// The Mayhem app's English notes in the release text (.github/release-notes.md); blank.'s
/// German news are built into blank. (PatchNotes.tsx).
const MAYHEM_NOTES: &str = "## New in the Mayhem app";
const MAX_NOTES: usize = 8;
const MAX_NOTE_CHARS: usize = 300;
/// Command-line switch of the new EXE, followed by the process id of the old one (main.rs).
pub const AFTER_UPDATE_ARG: &str = "--after-update";

/// This start came right after an update (main.rs): the app shows what is new, once.
static JUST_UPDATED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn mark_updated() {
    JUST_UPDATED.store(true, std::sync::atomic::Ordering::Relaxed);
}

/// True once after an update, so the app shows what is new (then false).
#[tauri::command]
pub fn update_news() -> bool {
    JUST_UPDATED.swap(false, std::sync::atomic::Ordering::Relaxed)
}

/// Which app runs (by the config's identifier, as in lib.rs): blank. updates blank.exe and speaks
/// German, the Mayhem app updates mayhem.exe and speaks English. No other file can be installed.
#[derive(Clone, Copy, Debug, PartialEq)]
enum Exe {
    Blank,
    Mayhem,
}

impl Exe {
    fn of(app: &AppHandle) -> Self {
        Self::from_identifier(&app.config().identifier)
    }

    fn from_identifier(identifier: &str) -> Self {
        if identifier == crate::mayhem::IDENTIFIER {
            Self::Mayhem
        } else {
            Self::Blank
        }
    }

    fn asset(self) -> &'static str {
        match self {
            Self::Blank => "blank.exe",
            Self::Mayhem => "mayhem.exe",
        }
    }

    fn say(self, german: &str, english: &str) -> String {
        match self {
            Self::Blank => german,
            Self::Mayhem => english,
        }
        .to_string()
    }
}

/// The release asset found by the last check; only this one can be installed.
#[derive(Default)]
pub struct UpdateState(Mutex<Option<Asset>>);

#[derive(Clone)]
struct Asset {
    url: String,
    size: u64,
    sha256: [u8; 32],
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    current: String,
    latest: String,
    available: bool,
    /// What the latest version brings (the Mayhem app's English notes; empty for blank.).
    notes: Vec<String>,
}

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    assets: Vec<ReleaseAsset>,
    body: Option<String>,
}

#[derive(Deserialize)]
struct ReleaseAsset {
    name: String,
    size: u64,
    browser_download_url: String,
    digest: Option<String>,
}

/// "v1.2.3" or "1.2.3".
fn parse_version(text: &str) -> Option<(u32, u32, u32)> {
    let mut parts = text.trim().trim_start_matches('v').split('.');
    let version = (
        parts.next()?.parse().ok()?,
        parts.next()?.parse().ok()?,
        parts.next()?.parse().ok()?,
    );
    parts.next().is_none().then_some(version)
}

/// "sha256:<64 hex digits>".
fn parse_digest(text: &str) -> Option<[u8; 32]> {
    let hex = text.strip_prefix("sha256:")?;
    if hex.len() != 64 {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(hex.get(i * 2..i * 2 + 2)?, 16).ok()?;
    }
    Some(out)
}

/// The release's file for this app: only from the release's own download folder on GitHub,
/// within the size limit and with GitHub's SHA-256.
fn pick(assets: Vec<ReleaseAsset>, name: &str) -> Option<Asset> {
    let asset = assets.into_iter().find(|asset| asset.name == name)?;
    if !asset.browser_download_url.starts_with(DOWNLOADS) || asset.size > MAX_BYTES {
        return None;
    }
    Some(Asset {
        sha256: parse_digest(asset.digest.as_deref()?)?,
        url: asset.browser_download_url,
        size: asset.size,
    })
}

/// The Mayhem app's notes from a release text (GitHub's release body, untrusted): the "- " lines
/// of its section as plain text without control characters, at most MAX_NOTES lines of
/// MAX_NOTE_CHARS characters each. Empty when the section is missing.
fn english_notes(body: &str) -> Vec<String> {
    body.lines()
        .skip_while(|line| line.trim_end() != MAYHEM_NOTES)
        .skip(1)
        .take_while(|line| !line.starts_with('#'))
        .filter_map(|line| line.strip_prefix("- "))
        .map(|line| {
            let clean: String = line.chars().filter(|c| !c.is_control()).collect();
            let clean = clean.trim();
            if clean.chars().count() > MAX_NOTE_CHARS {
                clean
                    .chars()
                    .take(MAX_NOTE_CHARS - 1)
                    .chain(Some('…'))
                    .collect()
            } else {
                clean.to_string()
            }
        })
        .filter(|line| !line.is_empty())
        .take(MAX_NOTES)
        .collect()
}

fn sha256(data: &[u8]) -> Option<[u8; 32]> {
    use windows_sys::Win32::Security::Cryptography::{BCryptHash, BCRYPT_SHA256_ALG_HANDLE};
    let mut out = [0u8; 32];
    // SAFETY: the algorithm pseudo-handle needs no setup; input and output buffers are valid for
    // the given lengths.
    let status = unsafe {
        BCryptHash(
            BCRYPT_SHA256_ALG_HANDLE,
            std::ptr::null(),
            0,
            data.as_ptr(),
            u32::try_from(data.len()).ok()?,
            out.as_mut_ptr(),
            32,
        )
    };
    (status >= 0).then_some(out)
}

fn client(timeout: Duration) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(timeout)
        .user_agent(concat!("blank/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn update_check(
    app: AppHandle,
    state: State<'_, UpdateState>,
) -> Result<UpdateInfo, String> {
    let exe = Exe::of(&app);
    let current = env!("CARGO_PKG_VERSION").to_string();
    let offline = || {
        exe.say(
            "GitHub gerade nicht erreichbar.",
            "GitHub did not answer. Check your connection.",
        )
    };
    let response = client(Duration::from_secs(15))?
        .get(LATEST)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|_| offline())?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(exe.say(
            "Noch keine Version veröffentlicht.",
            "No version has been released yet.",
        ));
    }
    if !response.status().is_success() {
        return Err(offline());
    }
    let release: Release = response.json().await.map_err(|_| offline())?;
    let latest = parse_version(&release.tag_name).ok_or_else(|| {
        exe.say(
            "Unbekannte Versionsnummer auf GitHub.",
            "GitHub lists an unknown version number.",
        )
    })?;
    let available = latest > parse_version(&current).unwrap_or((0, 0, 0));
    let asset = pick(release.assets, exe.asset());
    if available && asset.is_none() {
        return Err(exe.say(
            "Die neue Version hat keine prüfbare blank.exe.",
            "The new version has no verifiable mayhem.exe.",
        ));
    }
    *state.0.lock().map_err(|error| error.to_string())? = if available { asset } else { None };
    Ok(UpdateInfo {
        current,
        latest: format!("{}.{}.{}", latest.0, latest.1, latest.2),
        available,
        notes: match exe {
            Exe::Mayhem => english_notes(release.body.as_deref().unwrap_or_default()),
            Exe::Blank => Vec::new(),
        },
    })
}

async fn download(app: &AppHandle, exe: Exe, asset: &Asset) -> Result<Vec<u8>, String> {
    let failed = || exe.say("Download fehlgeschlagen.", "The download failed.");
    let mut response = client(Duration::from_secs(300))?
        .get(&asset.url)
        .send()
        .await
        .map_err(|_| failed())?;
    if !response.status().is_success() {
        return Err(failed());
    }
    let mut bytes = Vec::with_capacity(asset.size as usize);
    let mut shown = 0;
    while let Some(chunk) = response.chunk().await.map_err(|_| failed())? {
        bytes.extend_from_slice(&chunk);
        if bytes.len() as u64 > asset.size {
            return Err(exe.say(
                "Download größer als angegeben.",
                "The download was larger than announced.",
            ));
        }
        let percent = (bytes.len() as u64 * 100 / asset.size.max(1)) as u32;
        if percent >= shown + 5 {
            shown = percent;
            let _ = app.emit("update-progress", percent);
        }
    }
    Ok(bytes)
}

/// Size, checksum and EXE header must match; otherwise nothing is replaced.
fn verify(bytes: &[u8], asset: &Asset) -> bool {
    bytes.len() as u64 == asset.size
        && bytes.starts_with(b"MZ")
        && sha256(bytes) == Some(asset.sha256)
}

pub(crate) fn sibling(exe: &Path, suffix: &str) -> PathBuf {
    let mut name = exe.file_name().unwrap_or_default().to_os_string();
    name.push(suffix);
    exe.with_file_name(name)
}

/// Puts the new EXE in place of the running one; the running one keeps working as `.old`.
fn replace(which: Exe, exe: &Path, bytes: &[u8]) -> Result<(), String> {
    let (new, old) = (sibling(exe, ".new"), sibling(exe, ".old"));
    // The Mayhem app also runs as blank.exe (from_blank.rs), so it names its real file.
    let name = exe.file_name().unwrap_or_default().to_string_lossy();
    let stuck = || {
        which.say(
            "blank.exe ließ sich nicht ersetzen.",
            &format!("{name} could not be replaced."),
        )
    };
    std::fs::write(&new, bytes).map_err(|_| {
        which.say(
            "Kein Schreibzugriff im Ordner von blank.exe – bitte die neue Version von Hand laden.",
            &format!("No write access in the folder of {name}. Download the new version by hand."),
        )
    })?;
    let _ = std::fs::remove_file(&old);
    if std::fs::rename(exe, &old).is_err() {
        let _ = std::fs::remove_file(&new);
        return Err(stuck());
    }
    if std::fs::rename(&new, exe).is_err() {
        let _ = std::fs::rename(&old, exe);
        let _ = std::fs::remove_file(&new);
        return Err(stuck());
    }
    Ok(())
}

/// `Ok(true)`: the new version starts and this app closes. `Ok(false)`: the new file is in place,
/// but it could not be started (e.g. a virus scanner holds it); the app says "start it again" –
/// checking or installing again would only offer the same version to the old process.
#[tauri::command]
pub async fn update_install(app: AppHandle, state: State<'_, UpdateState>) -> Result<bool, String> {
    let which = Exe::of(&app);
    let asset = state
        .0
        .lock()
        .map_err(|error| error.to_string())?
        .clone()
        .ok_or_else(|| which.say("Erst nach Updates suchen.", "Check for updates first."))?;
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    let bytes = download(&app, which, &asset).await?;
    if !verify(&bytes, &asset) {
        return Err(which.say(
            "Prüfsumme stimmt nicht – Update abgebrochen.",
            "The checksum does not match. Nothing was changed.",
        ));
    }
    replace(which, &exe, &bytes)?;
    let started = std::process::Command::new(&exe)
        .arg(AFTER_UPDATE_ARG)
        .arg(std::process::id().to_string())
        .spawn()
        .is_ok();
    if !started {
        // Keeps the one instance, so a start by hand brings this window back instead of a second.
        return Ok(false);
    }
    // The new EXE waits for this process to end before it becomes the one instance (main.rs); each
    // app holds only its own guard, the other call does nothing.
    single_instance::release();
    crate::mayhem::release();
    app.exit(0);
    Ok(true)
}

/// Start of the new EXE: waits (at most 15 s) until the old process has ended.
pub fn wait_for_old(pid: &str) {
    use windows_sys::Win32::{
        Foundation::CloseHandle,
        System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE},
    };
    let Ok(pid) = pid.parse::<u32>() else {
        return;
    };
    // SAFETY: a handle only for waiting; closed again.
    unsafe {
        let process = OpenProcess(PROCESS_SYNCHRONIZE, 0, pid);
        if !process.is_null() {
            WaitForSingleObject(process, 15_000);
            CloseHandle(process);
        }
    }
}

/// Removes what an update left next to the EXE (the replaced `.old`, an unfinished `.new`).
pub fn clean_up() {
    if let Ok(exe) = std::env::current_exe() {
        let _ = std::fs::remove_file(sibling(&exe, ".old"));
        let _ = std::fs::remove_file(sibling(&exe, ".new"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_versions() {
        assert_eq!(parse_version("v0.2.0"), Some((0, 2, 0)));
        assert_eq!(parse_version("1.10.3"), Some((1, 10, 3)));
        assert_eq!(parse_version("v1.2"), None);
        assert_eq!(parse_version("v1.2.3-beta"), None);
        assert_eq!(parse_version("v1.2.3.4"), None);
        assert_eq!(parse_version(""), None);
        assert_eq!(parse_version("v-1.2.3"), None);
        assert!(parse_version("v0.10.0") > parse_version("v0.9.9"));
        assert!(parse_version("v0.9.3") > parse_version("0.9.2"));
    }

    #[test]
    fn checks_the_download() {
        let data = b"MZ fake exe";
        let asset = Asset {
            url: String::new(),
            size: data.len() as u64,
            sha256: sha256(data).unwrap(),
        };
        assert!(verify(data, &asset));
        assert!(!verify(b"MZ fake exf", &asset));
        assert!(!verify(
            b"XX fake exe",
            &Asset {
                sha256: sha256(b"XX fake exe").unwrap(),
                ..asset.clone()
            }
        ));
        // Known value: SHA-256 of "abc".
        let digest =
            parse_digest("sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assert_eq!(digest, sha256(b"abc"));
        assert_eq!(parse_digest("sha1:abc"), None);
    }

    #[test]
    fn names_the_files_next_to_the_exe() {
        let exe = Path::new(r"C:\Apps\blank.exe");
        assert_eq!(sibling(exe, ".old"), Path::new(r"C:\Apps\blank.exe.old"));
    }

    /// blank.'s update installs the Mayhem app as blank.exe; its own update then replaces that
    /// file (the running one, whatever its name), so shortcuts and pins keep working.
    #[test]
    fn replaces_the_running_file_whatever_its_name() {
        let dir = std::env::temp_dir().join(format!("blank-update-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let exe = dir.join("blank.exe");
        std::fs::write(&exe, b"MZ old").unwrap();
        replace(Exe::Mayhem, &exe, b"MZ new").unwrap();
        assert_eq!(std::fs::read(&exe).unwrap(), b"MZ new");
        assert_eq!(std::fs::read(sibling(&exe, ".old")).unwrap(), b"MZ old");
        assert!(!sibling(&exe, ".new").exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn each_app_takes_only_its_own_file() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).expect("tauri.conf.json");
        let blank = Exe::from_identifier(config["identifier"].as_str().expect("identifier"));
        assert_eq!(blank, Exe::Blank);
        assert_eq!(blank.asset(), "blank.exe");
        let mayhem = Exe::from_identifier(crate::mayhem::IDENTIFIER);
        assert_eq!(mayhem.asset(), "mayhem.exe");
        // blank. keeps its German messages, the Mayhem app speaks English.
        assert_eq!(blank.say("de", "en"), "de");
        assert_eq!(mayhem.say("de", "en"), "en");

        let digest = format!("sha256:{}", "ab".repeat(32));
        let at = |name: &str| format!("{DOWNLOADS}v0.9.3/{name}");
        let file = |name: &str, url: &str, size: u64, digest: Option<&str>| ReleaseAsset {
            name: name.into(),
            size,
            browser_download_url: url.into(),
            digest: digest.map(Into::into),
        };
        let both = || {
            vec![
                file("blank.exe", &at("blank.exe"), 10, Some(&digest)),
                file("mayhem.exe", &at("mayhem.exe"), 20, Some(&digest)),
            ]
        };
        assert_eq!(pick(both(), mayhem.asset()).map(|a| a.size), Some(20));
        assert_eq!(pick(both(), blank.asset()).map(|a| a.size), Some(10));
        // Never another file, another server, a file over the limit or one without GitHub's digest.
        assert!(pick(both(), "other.exe").is_none());
        let only = |url: &str, size: u64, digest: Option<&str>| {
            pick(vec![file("mayhem.exe", url, size, digest)], "mayhem.exe")
        };
        let url = at("mayhem.exe");
        assert!(only(&url, 20, Some(&digest)).is_some());
        assert!(only("https://example.com/mayhem.exe", 20, Some(&digest)).is_none());
        assert!(only(&url, MAX_BYTES + 1, Some(&digest)).is_none());
        assert!(only(&url, 20, None).is_none());
        assert!(only(&url, 20, Some("sha1:ab")).is_none());
    }

    #[test]
    fn reads_only_the_english_notes() {
        let body = "## Neu in dieser Version\r\n\r\n- **Deutsch:** nicht das\r\n\r\n\
                    ## New in the Mayhem app\r\n\r\n- **Update:** one click\r\n\
                    - <script>alert(1)</script>\r\n- \u{0}\u{1b}[31mred\u{7}\r\n-   \r\n\
                    not a note\r\n\r\n## So geht's\r\n\r\n- nicht das\r\n";
        assert_eq!(
            english_notes(body),
            [
                "**Update:** one click",
                // Plain text: the page shows it as text, never as HTML.
                "<script>alert(1)</script>",
                "[31mred",
            ]
        );
        assert!(english_notes("## Neu in dieser Version\n\n- nur Deutsch").is_empty());
        assert!(english_notes("").is_empty());
        // Long and many lines are cut.
        let long = format!("{MAYHEM_NOTES}\n- {}\n", "x".repeat(10_000));
        let note = &english_notes(&long)[0];
        assert_eq!(note.chars().count(), MAX_NOTE_CHARS);
        assert!(note.ends_with('…'));
        let many = format!("{MAYHEM_NOTES}\n{}", "- note\n".repeat(100));
        assert_eq!(english_notes(&many).len(), MAX_NOTES);
        // The release text in the repo has the section the app shows (and the page reads).
        let ours = english_notes(include_str!("../../.github/release-notes.md"));
        assert!(!ours.is_empty());
        assert!(ours.iter().all(|note| note.starts_with("**")));
    }
}
