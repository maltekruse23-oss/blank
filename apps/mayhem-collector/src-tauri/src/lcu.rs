use serde_json::Value;
use std::{path::PathBuf, time::Duration};
use windows_sys::Win32::System::RemoteDesktop::ProcessIdToSessionId;
use windows_sys::Win32::{
    Foundation::{CloseHandle, INVALID_HANDLE_VALUE},
    System::{
        Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
            TH32CS_SNAPPROCESS,
        },
        Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION},
    },
};

pub fn valid_puuid(p: &str) -> bool {
    (30..=100).contains(&p.len())
        && p.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn lockfile() -> Option<PathBuf> {
    use std::os::windows::ffi::OsStringExt;
    // Only the League client in this Windows session is read. No process memory access.
    unsafe {
        let mut own_session = 0;
        if ProcessIdToSessionId(std::process::id(), &mut own_session) == 0 {
            return None;
        }
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return None;
        }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut more = Process32FirstW(snapshot, &mut entry) != 0;
        let mut result = None;
        while more {
            let len = entry
                .szExeFile
                .iter()
                .position(|c| *c == 0)
                .unwrap_or(entry.szExeFile.len());
            let name = String::from_utf16_lossy(&entry.szExeFile[..len]);
            let mut session = u32::MAX;
            if name.eq_ignore_ascii_case("LeagueClientUx.exe")
                && ProcessIdToSessionId(entry.th32ProcessID, &mut session) != 0
                && session == own_session
            {
                let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, entry.th32ProcessID);
                if !handle.is_null() {
                    let mut path = vec![0u16; 32768];
                    let mut size = path.len() as u32;
                    if QueryFullProcessImageNameW(handle, 0, path.as_mut_ptr(), &mut size) != 0 {
                        path.truncate(size as usize);
                        let exe = PathBuf::from(std::ffi::OsString::from_wide(&path));
                        if let Some(parent) = exe.parent() {
                            let file = parent.join("lockfile");
                            if file.is_file() {
                                result = Some(file);
                            }
                        }
                    }
                    CloseHandle(handle);
                }
            }
            if result.is_some() {
                break;
            }
            more = Process32NextW(snapshot, &mut entry) != 0;
        }
        CloseHandle(snapshot);
        result
    }
}

fn parse_lockfile(text: &str) -> Option<(u16, String)> {
    let parts: Vec<_> = text.trim().split(':').collect();
    if parts.len() != 5 || parts[4] != "https" {
        return None;
    }
    let port = parts[2].parse::<u16>().ok().filter(|p| *p > 0)?;
    let password = parts[3];
    if password.is_empty()
        || password.len() > 128
        || !password
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return None;
    }
    Some((port, password.into()))
}

pub struct Lcu {
    http: reqwest::Client,
    base: String,
    password: String,
}
impl Lcu {
    pub fn connect() -> Result<Option<Self>, String> {
        let Some(path) = lockfile() else {
            return Ok(None);
        };
        let text =
            std::fs::read_to_string(path).map_err(|_| "League-Verbindung noch nicht verfügbar.")?;
        let (port, password) =
            parse_lockfile(&text).ok_or("League-Verbindung noch nicht verfügbar.")?;
        let http = reqwest::Client::builder()
            .tls_danger_accept_invalid_certs(true)
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(3))
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|_| "Lokale League-Verbindung nicht verfügbar.")?;
        Ok(Some(Self {
            http,
            base: format!("https://127.0.0.1:{port}"),
            password,
        }))
    }
    pub async fn bytes(&self, path: &str) -> Result<Vec<u8>, String> {
        let mut response = self
            .http
            .get(format!("{}{path}", self.base))
            .basic_auth("riot", Some(&self.password))
            .send()
            .await
            .map_err(|_| "League Client antwortet nicht; später neuer Versuch.")?;
        if !response.status().is_success() {
            return Err(format!(
                "League Client: HTTP {}. Später neuer Versuch.",
                response.status().as_u16()
            ));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "League-Antwort nicht vollständig.")?
        {
            if bytes.len() + chunk.len() > 2 * 1024 * 1024 {
                return Err("League-Antwort größer als 2 MB.".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(bytes)
    }
    pub async fn json(&self, path: &str) -> Result<Value, String> {
        serde_json::from_slice(&self.bytes(path).await?)
            .map_err(|_| "League-Antwort nicht lesbar.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_only_loopback_credentials_and_safe_ids() {
        assert!(parse_lockfile("League:1:1234:local-secret:https").is_some());
        assert!(parse_lockfile("League:1:0:local-secret:https").is_none());
        assert!(parse_lockfile("League:1:1234:secret:http").is_none());
        assert!(!valid_puuid("../../foreign?puuid"));
    }
}
