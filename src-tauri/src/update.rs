//! Updates from the app's own GitHub releases (Settings → System, "Jetzt aktualisieren"). Checking
//! asks GitHub for the latest release (no data about the user is sent). Installing only happens
//! on click: the new blank.exe is downloaded from that release, its size and SHA-256 must match
//! what GitHub states, then the running EXE renames itself to `.old`, the new one takes its place
//! and is started; it waits for this process to end and removes the `.old` file.
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
const ASSET: &str = "blank.exe";
const MAX_BYTES: u64 = 100 * 1024 * 1024;
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
}

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    assets: Vec<ReleaseAsset>,
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
pub async fn update_check(state: State<'_, UpdateState>) -> Result<UpdateInfo, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let offline = || "GitHub gerade nicht erreichbar.".to_string();
    let response = client(Duration::from_secs(15))?
        .get(LATEST)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|_| offline())?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("Noch keine Version veröffentlicht.".into());
    }
    if !response.status().is_success() {
        return Err(offline());
    }
    let release: Release = response.json().await.map_err(|_| offline())?;
    let latest = parse_version(&release.tag_name).ok_or("Unbekannte Versionsnummer auf GitHub.")?;
    let available = latest > parse_version(&current).unwrap_or((0, 0, 0));
    let asset = release
        .assets
        .into_iter()
        .find(|asset| asset.name == ASSET)
        .filter(|asset| {
            asset.browser_download_url.starts_with(DOWNLOADS) && asset.size <= MAX_BYTES
        })
        .and_then(|asset| {
            Some(Asset {
                sha256: parse_digest(asset.digest.as_deref()?)?,
                url: asset.browser_download_url,
                size: asset.size,
            })
        });
    if available && asset.is_none() {
        return Err("Die neue Version hat keine prüfbare blank.exe.".into());
    }
    *state.0.lock().map_err(|error| error.to_string())? = if available { asset } else { None };
    Ok(UpdateInfo {
        current,
        latest: format!("{}.{}.{}", latest.0, latest.1, latest.2),
        available,
    })
}

async fn download(app: &AppHandle, asset: &Asset) -> Result<Vec<u8>, String> {
    let failed = || "Download fehlgeschlagen.".to_string();
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
            return Err("Download größer als angegeben.".into());
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
fn verify(bytes: &[u8], asset: &Asset) -> Result<(), String> {
    if bytes.len() as u64 != asset.size
        || !bytes.starts_with(b"MZ")
        || sha256(bytes) != Some(asset.sha256)
    {
        return Err("Prüfsumme stimmt nicht – Update abgebrochen.".into());
    }
    Ok(())
}

fn sibling(exe: &Path, suffix: &str) -> PathBuf {
    let mut name = exe.file_name().unwrap_or_default().to_os_string();
    name.push(suffix);
    exe.with_file_name(name)
}

/// Puts the new EXE in place of the running one; the running one keeps working as `.old`.
fn replace(exe: &Path, bytes: &[u8]) -> Result<(), String> {
    let (new, old) = (sibling(exe, ".new"), sibling(exe, ".old"));
    std::fs::write(&new, bytes).map_err(|_| {
        "Kein Schreibzugriff im Ordner von blank.exe – bitte die neue Version von Hand laden."
            .to_string()
    })?;
    let _ = std::fs::remove_file(&old);
    if std::fs::rename(exe, &old).is_err() {
        let _ = std::fs::remove_file(&new);
        return Err("blank.exe ließ sich nicht ersetzen.".into());
    }
    if std::fs::rename(&new, exe).is_err() {
        let _ = std::fs::rename(&old, exe);
        let _ = std::fs::remove_file(&new);
        return Err("blank.exe ließ sich nicht ersetzen.".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn update_install(app: AppHandle, state: State<'_, UpdateState>) -> Result<(), String> {
    let asset = state
        .0
        .lock()
        .map_err(|error| error.to_string())?
        .clone()
        .ok_or("Erst nach Updates suchen.")?;
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    let bytes = download(&app, &asset).await?;
    verify(&bytes, &asset)?;
    replace(&exe, &bytes)?;
    // The new EXE must be able to become the one instance; it waits for this process to end.
    single_instance::release();
    std::process::Command::new(&exe)
        .arg(AFTER_UPDATE_ARG)
        .arg(std::process::id().to_string())
        .spawn()
        .map_err(|_| "Update installiert – bitte blank. neu starten.".to_string())?;
    app.exit(0);
    Ok(())
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
        assert!(parse_version("v0.10.0") > parse_version("v0.9.9"));
    }

    #[test]
    fn checks_the_download() {
        let data = b"MZ fake exe";
        let asset = Asset {
            url: String::new(),
            size: data.len() as u64,
            sha256: sha256(data).unwrap(),
        };
        assert!(verify(data, &asset).is_ok());
        assert!(verify(b"MZ fake exf", &asset).is_err());
        assert!(verify(
            b"XX fake exe",
            &Asset {
                sha256: sha256(b"XX fake exe").unwrap(),
                ..asset.clone()
            }
        )
        .is_err());
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
}
