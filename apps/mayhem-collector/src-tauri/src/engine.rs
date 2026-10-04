use crate::lcu::{valid_puuid, Lcu};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};

const SITE: &str = "https://blank-mayhem.maltevfx.chatgpt.site";
const MAX_RAW: usize = 2 * 1024 * 1024;
const MAX_QUEUE: u64 = 128 * 1024 * 1024;
pub fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[derive(Clone, Deserialize, Serialize)]
struct Saved {
    #[serde(default = "default_autostart")]
    autostart: bool,
    seen: BTreeSet<String>,
}
fn default_autostart() -> bool {
    true
}
impl Default for Saved {
    fn default() -> Self {
        Self {
            autostart: true,
            seen: BTreeSet::new(),
        }
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub enabled: bool,
    pub autostart: bool,
    pub players: usize,
    pub total_matches: Option<usize>,
    pub total_players: Option<usize>,
    pub uploaded: usize,
    pub pending: usize,
    pub message: String,
    pub error: Option<String>,
}
pub struct Engine {
    dir: PathBuf,
    saved: Mutex<Saved>,
    status: Mutex<Status>,
    pub enabled: AtomicBool,
    enrolled: AtomicBool,
    disk_ok: bool,
}

pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let temp = path.with_extension("tmp");
    let mut file = std::fs::File::create(&temp).map_err(|_| "Datei nicht anlegbar.")?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "Datei nicht speicherbar.")?;
    drop(file);
    std::fs::rename(temp, path).map_err(|_| "Datei nicht abschließbar.".into())
}
fn files(dir: &Path, extension: &str) -> Result<Vec<PathBuf>, String> {
    let mut paths = Vec::new();
    for entry in std::fs::read_dir(dir).map_err(|_| "Warteschlange nicht lesbar.")? {
        let p = entry.map_err(|_| "Datei nicht lesbar.")?.path();
        if p.extension().and_then(|s| s.to_str()) == Some(extension) {
            paths.push(p);
        }
    }
    paths.sort();
    Ok(paths)
}
fn credential() -> Result<keyring::Entry, String> {
    keyring::Entry::new("blank.mayhem.collector", "upload")
        .map_err(|_| "Windows-Schlüsselspeicher nicht verfügbar.".into())
}
fn token() -> Result<String, String> {
    let entry = credential()?;
    match entry.get_password() {
        Ok(token) if token.len() == 64 && token.bytes().all(|b| b.is_ascii_hexdigit()) => Ok(token),
        Ok(_) => Err("Lokaler Zugang beschädigt.".into()),
        Err(keyring::Error::NoEntry) => {
            use windows_sys::Win32::Security::Cryptography::{
                BCryptGenRandom, BCRYPT_USE_SYSTEM_PREFERRED_RNG,
            };
            let mut bytes = [0u8; 32];
            if unsafe {
                BCryptGenRandom(
                    std::ptr::null_mut(),
                    bytes.as_mut_ptr(),
                    32,
                    BCRYPT_USE_SYSTEM_PREFERRED_RNG,
                )
            } < 0
            {
                return Err("Installation nicht sicher erkennbar.".into());
            }
            let token: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
            entry
                .set_password(&token)
                .map_err(|_| "Lokaler Zugang nicht speicherbar.")?;
            Ok(token)
        }
        Err(_) => Err("Windows-Schlüsselspeicher nicht lesbar.".into()),
    }
}
pub fn hash(raw: &[u8]) -> Result<String, String> {
    use windows_sys::Win32::Security::Cryptography::{BCryptHash, BCRYPT_SHA256_ALG_HANDLE};
    let mut out = [0u8; 32];
    // SAFETY: Windows SHA-256 pseudo-handle; buffers are valid and bounded by MAX_RAW.
    if unsafe {
        BCryptHash(
            BCRYPT_SHA256_ALG_HANDLE,
            std::ptr::null(),
            0,
            raw.as_ptr(),
            raw.len() as u32,
            out.as_mut_ptr(),
            32,
        )
    } < 0
    {
        return Err("Prüfsumme nicht berechenbar.".into());
    }
    Ok(out.iter().map(|b| format!("{b:02x}")).collect())
}
pub fn identity(raw: &[u8], owner: Option<&str>) -> Result<(String, String), String> {
    if raw.is_empty() || raw.len() > MAX_RAW {
        return Err("Matchantwort leer oder zu groß.".into());
    }
    let v: Value = serde_json::from_slice(raw).map_err(|_| "Ungültige Matchantwort.")?;
    let platform = v["platformId"].as_str().unwrap_or("");
    let id = v["gameId"]
        .as_u64()
        .filter(|id| *id > 0)
        .ok_or("Match-ID fehlt.")?;
    let identities = v["participantIdentities"]
        .as_array()
        .ok_or("Teilnehmer fehlen.")?;
    let puuids: BTreeSet<_> = identities
        .iter()
        .filter_map(|p| p["player"]["puuid"].as_str())
        .filter(|p| valid_puuid(p))
        .collect();
    if !(2..=8).contains(&platform.len())
        || !platform.as_bytes()[0].is_ascii_uppercase()
        || !platform
            .bytes()
            .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit())
        || v["queueId"].as_u64() != Some(2400)
        || identities.len() != 10
        || puuids.len() != 10
        || v["participants"].as_array().map(Vec::len) != Some(10)
        || owner.is_some_and(|p| !puuids.contains(p))
    {
        return Err("Keine vollständigen eigenen Mayhem-Matchdetails.".into());
    }
    Ok((format!("{platform}_{id}"), hash(raw)?))
}
fn http() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(30))
        .user_agent("blank-mayhem-collector/0.1.0")
        .build()
        .map_err(|_| "Netzwerk nicht verfügbar.".into())
}
pub fn receipt_matches(v: &Value, key: &str, digest: &str) -> bool {
    v["archived"] == true
        && v["kind"] == "details"
        && v["matchKey"].as_str() == Some(key)
        && v["sha256"].as_str() == Some(digest)
        && v["canonical"].is_boolean()
        && v["conflict"].is_boolean()
}

impl Engine {
    pub fn new(dir: PathBuf) -> Self {
        let loaded = std::fs::create_dir_all(&dir)
            .map_err(|_| "Sammlungsordner nicht anlegbar.".to_string())
            .and_then(|_| match std::fs::read(dir.join("state.json")) {
                Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| {
                    "Sammlungsstatus beschädigt. Keine Daten überschrieben.".to_string()
                }),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Saved::default()),
                Err(_) => Err("Sammlungsstatus nicht lesbar.".into()),
            });
        let disk_ok = loaded.is_ok();
        let error = loaded.as_ref().err().cloned();
        let saved = loaded.unwrap_or_default();
        let enabled = disk_ok;
        let autostart = saved.autostart;
        let this = Self {
            dir,
            saved: Mutex::new(saved),
            status: Mutex::new(Status {
                enabled,
                autostart,
                players: 0,
                total_matches: None,
                total_players: None,
                uploaded: 0,
                pending: 0,
                message: if enabled {
                    "Bereit zum Sammeln"
                } else {
                    "Sammlung pausiert"
                }
                .into(),
                error,
            }),
            enabled: AtomicBool::new(enabled),
            enrolled: AtomicBool::new(false),
            disk_ok,
        };
        let _ = this.counts();
        this
    }
    pub fn status(&self) -> Status {
        self.status.lock().unwrap().clone()
    }
    fn save(&self, saved: &Saved) -> Result<(), String> {
        atomic_write(
            &self.dir.join("state.json"),
            &serde_json::to_vec(saved).map_err(|_| "Status nicht speicherbar.")?,
        )
    }
    pub fn set_autostart(&self, enabled: bool) -> Result<Status, String> {
        if !self.disk_ok {
            return Err("Lokaler Status nicht lesbar; nichts überschrieben.".into());
        }
        crate::autostart::set(enabled)?;
        {
            let mut saved = self.saved.lock().unwrap();
            saved.autostart = enabled;
            self.save(&saved)?;
        }
        self.status.lock().unwrap().autostart = enabled;
        Ok(self.status())
    }
    async fn enroll(&self) -> Result<(), String> {
        if self.enrolled.load(Ordering::SeqCst) {
            return Ok(());
        }
        let response = http()?
            .post(format!("{SITE}/api/archive/enroll"))
            .bearer_auth(token()?)
            .send()
            .await
            .map_err(|_| "Verbindung unterbrochen. Neuer Versuch folgt automatisch.")?;
        if response.status().as_u16() != 200 {
            return Err(format!(
                "Sammlung derzeit nicht verfügbar (HTTP {}).",
                response.status().as_u16()
            ));
        }
        let value: Value = response
            .json()
            .await
            .map_err(|_| "Website-Antwort nicht lesbar.")?;
        if value["enabled"] != true {
            return Err("Sammlung derzeit nicht verfügbar.".into());
        }
        self.enrolled.store(true, Ordering::SeqCst);
        Ok(())
    }
    pub async fn totals(&self) {
        if let Ok(client) = http() {
            if let Ok(response) = client.get(format!("{SITE}/api/archive/stats")).send().await {
                if response.status().is_success() {
                    if let Ok(v) = response.json::<Value>().await {
                        let mut s = self.status.lock().unwrap();
                        s.total_matches = v["matches"].as_u64().map(|n| n as usize);
                        s.total_players = v["players"].as_u64().map(|n| n as usize);
                    }
                }
            }
        }
    }
    fn active(&self) -> bool {
        self.enabled.load(Ordering::SeqCst)
    }
    fn counts(&self) -> Result<(), String> {
        let pending = files(&self.dir, "raw")?.len();
        let receipts = files(&self.dir, "receipt")?;
        let uploaded = receipts.len();
        let mut players = BTreeSet::new();
        for path in receipts {
            let bytes = std::fs::read(path).map_err(|_| "Beitrag nicht lesbar.")?;
            let v: Value = serde_json::from_slice(&bytes).map_err(|_| "Beitrag beschädigt.")?;
            if let Some(list) = v["localParticipants"].as_array() {
                players.extend(list.iter().filter_map(|p| p.as_str().map(str::to_owned)));
            }
        }
        let mut s = self.status.lock().unwrap();
        s.pending = pending;
        s.uploaded = uploaded;
        s.players = players.len();
        Ok(())
    }
    fn stage(&self, raw: &[u8], owner: &str) -> Result<(), String> {
        let (key, _) = identity(raw, Some(owner))?;
        let path = self.dir.join(format!("{key}.raw"));
        if path.exists() || path.with_extension("receipt").exists() {
            return Ok(());
        }
        let size = files(&self.dir, "raw")?
            .iter()
            .try_fold(0u64, |sum, p| std::fs::metadata(p).map(|m| sum + m.len()))
            .map_err(|_| "Warteschlange nicht lesbar.")?;
        if size + raw.len() as u64 > MAX_QUEUE {
            return Err(
                "Warteschlange voll (128 MB). Bitte Upload prüfen; nichts gelöscht.".into(),
            );
        }
        atomic_write(&path, raw)?;
        self.counts()
    }
    async fn drain(&self) -> Result<(), String> {
        let http = http()?;
        for path in files(&self.dir, "raw")? {
            if !self.active() {
                break;
            }
            tokio::time::sleep(Duration::from_secs(5)).await;
            if !self.active() {
                break;
            }
            if path.with_extension("receipt").exists() {
                std::fs::remove_file(&path).map_err(|_| "Bestätigtes Match nicht aufräumbar.")?;
                continue;
            }
            let metadata = std::fs::metadata(&path).map_err(|_| "Lokale Matchdatei fehlt.")?;
            if metadata.len() > MAX_RAW as u64 {
                return Err("Lokale Matchdatei zu groß; nichts gelöscht.".into());
            }
            let raw = std::fs::read(&path).map_err(|_| "Lokale Matchdatei nicht lesbar.")?;
            let (key, digest) = identity(&raw, None)?;
            let game: Value =
                serde_json::from_slice(&raw).map_err(|_| "Matchdaten nicht lesbar.")?;
            let participants: Vec<Value> = game["participantIdentities"]
                .as_array()
                .ok_or("Teilnehmer fehlen.")?
                .iter()
                .map(|p| p["player"]["puuid"].clone())
                .collect();
            if path.file_stem().and_then(|s| s.to_str()) != Some(&key) {
                return Err("Lokale Matchdatei widersprüchlich; nichts gelöscht.".into());
            }
            self.status.lock().unwrap().message = "Match wird hochgeladen …".into();
            let captured = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|t| t.as_millis() as u64)
                .unwrap_or_else(now);
            let response = http
                .post(format!("{SITE}/api/archive/contribute"))
                .bearer_auth(token()?)
                .header("Content-Type", "application/json")
                .header("X-Archive-Captured-At", captured.to_string())
                .header("X-Archive-Collector-Version", "mini-0.1.0")
                .body(raw)
                .send()
                .await
                .map_err(|_| "Upload unterbrochen. Match bleibt lokal; neuer Versuch folgt.")?;
            let code = response.status().as_u16();
            if code != 200 {
                if code == 401 || code == 403 {
                    self.enabled.store(false, Ordering::SeqCst);
                }
                return Err(match code {
                    401 | 403 => "Sammlung für diese Installation nicht verfügbar.".into(),
                    429 => {
                        "Upload-Limit erreicht. Daten bleiben lokal; später neuer Versuch.".into()
                    }
                    _ => format!("Upload HTTP {code}. Match bleibt lokal."),
                });
            }
            let mut answer: Value = response
                .json()
                .await
                .map_err(|_| "Upload-Bestätigung nicht lesbar; Match bleibt lokal.")?;
            if !receipt_matches(&answer, &key, &digest) {
                return Err("Upload-Prüfsumme stimmt nicht; Match bleibt lokal.".into());
            }
            answer["localParticipants"] = Value::Array(participants);
            atomic_write(
                &path.with_extension("receipt"),
                &serde_json::to_vec(&answer).map_err(|_| "Bestätigung nicht speicherbar.")?,
            )?;
            std::fs::remove_file(&path).map_err(|_| "Bestätigte Matchdatei nicht aufräumbar.")?;
            self.counts()?;
        }
        Ok(())
    }
    pub async fn cycle(&self) -> Result<(), String> {
        if !self.active() {
            return Ok(());
        }
        self.status.lock().unwrap().error = None;
        self.enroll().await?;
        self.drain().await?;
        if !self.active() {
            return Ok(());
        }
        let Some(lcu) = Lcu::connect()? else {
            self.status.lock().unwrap().message = "Warte auf den geöffneten League Client".into();
            return Ok(());
        };
        let me = lcu.json("/lol-summoner/v1/current-summoner").await?;
        let puuid = me["puuid"]
            .as_str()
            .filter(|p| valid_puuid(p))
            .ok_or("Bitte im League Client anmelden.")?;
        self.status.lock().unwrap().message = "Eigene Mayhem-Matches werden geprüft …".into();
        let mut visited = BTreeSet::new();
        for page in 0..5 {
            if !self.active() {
                return Ok(());
            }
            let history = lcu
                .json(&format!(
                    "/lol-match-history/v1/products/lol/{puuid}/matches?begIndex={}&endIndex={}",
                    page * 20,
                    page * 20 + 19
                ))
                .await?;
            let games = history["games"]["games"]
                .as_array()
                .ok_or("Match-History noch nicht verfügbar.")?;
            if games.is_empty() {
                break;
            }
            for game in games.iter().take(20) {
                if !self.active() {
                    return Ok(());
                }
                let id = game["gameId"]
                    .as_u64()
                    .filter(|id| *id > 0)
                    .ok_or("Match-ID fehlt in der History.")?;
                if !visited.insert(id) {
                    continue;
                }
                let seen_key = format!("{puuid}/{id}");
                if self.saved.lock().unwrap().seen.contains(&seen_key) {
                    continue;
                }
                if game["queueId"].as_u64() == Some(2400) {
                    let raw = lcu
                        .bytes(&format!("/lol-match-history/v1/games/{id}"))
                        .await?;
                    let parsed: Value =
                        serde_json::from_slice(&raw).map_err(|_| "Matchdetails nicht lesbar.")?;
                    if parsed["gameId"].as_u64() != Some(id) {
                        return Err("League lieferte eine abweichende Match-ID.".into());
                    }
                    self.stage(&raw, puuid)?;
                }
                {
                    let mut saved = self.saved.lock().unwrap();
                    saved.seen.insert(seen_key);
                    self.save(&saved)?;
                }
                self.drain().await?;
            }
            if games.len() < 20 {
                break;
            }
        }
        if self.active() {
            self.status.lock().unwrap().message =
                "Aktuell · neue Spiele werden automatisch geprüft".into();
        }
        Ok(())
    }
    pub fn error(&self, error: String) {
        self.status.lock().unwrap().error = Some(error);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn sample() -> Vec<u8> {
        serde_json::to_vec(&serde_json::json!({"platformId":"EUW1","gameId":42,"queueId":2400,"participants":vec![Value::Null;10],"participantIdentities":(0..10).map(|n|serde_json::json!({"player":{"puuid":format!("{n:078}")}})).collect::<Vec<_>>()})).unwrap()
    }
    #[test]
    fn own_match_only_and_raw_queue_survives_restart() {
        let dir =
            std::env::temp_dir().join(format!("mini-collector-{}-{}", std::process::id(), now()));
        let e = Engine::new(dir.clone());
        let raw = sample();
        let owner = format!("{:078}", 0);
        assert!(identity(&raw, Some(&"x".repeat(78))).is_err());
        e.stage(&raw, &owner).unwrap();
        e.stage(&raw, &owner).unwrap();
        assert_eq!(e.status().pending, 1);
        drop(e);
        let e = Engine::new(dir.clone());
        assert_eq!(e.status().pending, 1);
        assert_eq!(std::fs::read(dir.join("EUW1_42.raw")).unwrap(), raw);
        drop(e);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn failed_or_wrong_hash_never_acknowledges() {
        let v = serde_json::json!({"archived":true,"kind":"details","matchKey":"EUW1_42","sha256":"hash","canonical":false,"conflict":true});
        assert!(receipt_matches(&v, "EUW1_42", "hash"));
        assert!(!receipt_matches(&v, "EUW1_42", "different"));
        assert!(!receipt_matches(
            &serde_json::json!({"error":"rate limit"}),
            "EUW1_42",
            "hash"
        ));
    }
}
