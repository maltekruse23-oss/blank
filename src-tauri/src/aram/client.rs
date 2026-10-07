//! The League client: its lockfile, and read-only GET requests to it on 127.0.0.1.

use std::{path::PathBuf, time::Duration};

use serde::de::DeserializeOwned;

use super::{CLIENT_EXE, MAX_ICON_BYTES, NOT_OPEN};

/// Port and password from the client's lockfile ("LeagueClient:pid:port:password:https").
pub(super) fn parse_lockfile(text: &str) -> Option<(u16, String)> {
    let parts: Vec<&str> = text.trim().split(':').collect();
    if parts.len() != 5 || parts[4] != "https" {
        return None;
    }
    let port = parts[2].parse::<u16>().ok().filter(|port| *port > 0)?;
    let password = parts[3];
    let valid = !password.is_empty()
        && password.len() <= 128
        && password
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    valid.then(|| (port, password.to_string()))
}

/// The League client runs (its lockfile is there).
pub fn client_open() -> bool {
    lockfile().is_some()
}

/// The lockfile next to the running client (it exists only while the client runs).
pub(super) fn lockfile() -> Option<PathBuf> {
    crate::pc::program_pids(CLIENT_EXE)
        .into_iter()
        .find_map(|pid| {
            let file = image_path(pid)?.parent()?.join("lockfile");
            file.is_file().then_some(file)
        })
}

fn image_path(pid: u32) -> Option<PathBuf> {
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::{
        Foundation::CloseHandle,
        System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
        },
    };
    let mut path = vec![0u16; 1024];
    let mut size = path.len() as u32;
    // SAFETY: the handle is checked and closed; buffer and size describe `path`.
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return None;
        }
        let ok = QueryFullProcessImageNameW(handle, 0, path.as_mut_ptr(), &mut size) != 0;
        CloseHandle(handle);
        if !ok {
            return None;
        }
    }
    path.truncate(size as usize);
    Some(PathBuf::from(std::ffi::OsString::from_wide(&path)))
}

/// PUUIDs as the client gives them (36 characters, like a UUID; Riot's web API uses 78) of
/// letters, digits, "-" and "_" – never anything that could change the path.
pub(super) fn valid_puuid(puuid: &str) -> bool {
    (30..=100).contains(&puuid.len())
        && puuid
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

pub(super) struct Lcu {
    pub(super) http: reqwest::Client,
    pub(super) base: String,
    pub(super) password: String,
}

impl Lcu {
    /// None while the client is closed.
    pub(super) fn connect() -> Result<Option<Self>, String> {
        let Some(path) = lockfile() else {
            return Ok(None);
        };
        let text = std::fs::read_to_string(&path).map_err(|_| NOT_OPEN.to_string())?;
        let (port, password) = parse_lockfile(&text).ok_or(NOT_OPEN)?;
        let http = reqwest::Client::builder()
            // The client's certificate for 127.0.0.1 is its own, signed by Riot and not by a
            // public authority; accepted for this local connection only (nothing leaves the PC).
            .tls_danger_accept_invalid_certs(true)
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(3))
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Some(Self {
            http,
            base: format!("https://127.0.0.1:{port}"),
            password,
        }))
    }

    pub(super) async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T, String> {
        serde_json::from_slice(&self.get_bytes(path).await?)
            .map_err(|_| "Unerwartete Antwort des League-Clients.".to_string())
    }

    pub(super) async fn get_bytes(&self, path: &str) -> Result<Vec<u8>, String> {
        let response = self
            .http
            .get(format!("{}{path}", self.base))
            .basic_auth("riot", Some(&self.password))
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|_| "Der League-Client antwortet nicht.".to_string())?;
        if !response.status().is_success() {
            return Err(format!(
                "Der League-Client lieferte keine Daten ({}).",
                response.status().as_u16()
            ));
        }
        response
            .bytes()
            .await
            .map(|bytes| bytes.to_vec())
            .map_err(|_| "Unerwartete Antwort des League-Clients.".to_string())
    }

    /// A small PNG of the client's game data (augment icons), as data URL.
    pub(super) async fn icon(&self, path: &str) -> Option<String> {
        if !icon_path(path) {
            return None;
        }
        let response = self
            .http
            .get(format!("{}{path}", self.base))
            .basic_auth("riot", Some(&self.password))
            .send()
            .await
            .ok()?;
        let png = response
            .headers()
            .get("content-type")
            .is_some_and(|t| t.as_bytes().starts_with(b"image/png"));
        if !response.status().is_success() || !png {
            return None;
        }
        let bytes = response.bytes().await.ok()?;
        (bytes.len() <= MAX_ICON_BYTES && bytes.starts_with(b"\x89PNG"))
            .then(|| format!("data:image/png;base64,{}", base64(&bytes)))
    }
}

/// Only PNGs of the client's game data, nothing that could leave that folder.
pub(super) fn icon_path(path: &str) -> bool {
    path.starts_with("/lol-game-data/assets/")
        && path.ends_with(".png")
        && !path.contains("..")
        && path.len() <= 200
        && path
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '_' | '-' | '.'))
}

pub(super) fn base64(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = (u32::from(chunk[0]) << 16)
            | (u32::from(*chunk.get(1).unwrap_or(&0)) << 8)
            | u32::from(*chunk.get(2).unwrap_or(&0));
        for (i, shift) in [18, 12, 6, 0].into_iter().enumerate() {
            out.push(if i <= chunk.len() {
                ALPHABET[(n >> shift) as usize & 63] as char
            } else {
                '='
            });
        }
    }
    out
}
