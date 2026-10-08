//! Durable, bounded outbox for complete Queue 2400 detail responses.
//! No extra LCU requests, recursive discovery or credentials in the executable.
use super::{now_ms, website};
use serde_json::Value;
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    time::Duration,
};
use tauri::{AppHandle, Manager};

const BASE: &str = "https://mayhemstats.lol/api/archive/matches";
const MAX_RAW: usize = 2 * 1024 * 1024;
const MAX_OUTBOX: u64 = 256 * 1024 * 1024;

fn root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|p| p.join("aram-archive"))
        .map_err(|_| "Archivordner nicht verfügbar.".into())
}

/// The archive key ("EUW1_123") and SHA-256 of a complete Mayhem game (also aram/ladder.rs).
pub(super) fn identity(raw: &[u8]) -> Result<(String, String), String> {
    if raw.is_empty() || raw.len() > MAX_RAW {
        return Err("Archiv: Matchantwort zu groß oder leer.".into());
    }
    let v: Value = serde_json::from_slice(raw).map_err(|_| "Archiv: ungültiges JSON.")?;
    let platform = v["platformId"].as_str().unwrap_or("");
    let id = v["gameId"]
        .as_u64()
        .filter(|id| *id > 0)
        .ok_or("Archiv: Match-ID fehlt.")?;
    let identities = v["participantIdentities"]
        .as_array()
        .ok_or("Archiv: Teilnehmer fehlen.")?;
    let puuids: HashSet<_> = identities
        .iter()
        .filter_map(|p| p["player"]["puuid"].as_str())
        .filter(|p| super::valid_puuid(p))
        .collect();
    if platform.is_empty()
        || platform.len() > 16
        || !platform
            .bytes()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
        || v["queueId"].as_u64() != Some(2400)
        || identities.len() != 10
        || puuids.len() != 10
        || v["participants"].as_array().map(Vec::len) != Some(10)
    {
        return Err("Archiv: keine vollständigen Mayhem-Matchdetails.".into());
    }
    Ok((format!("{platform}_{id}"), website::bytes_hash(raw)?))
}

fn files(dir: &Path, extension: &str) -> Result<Vec<PathBuf>, String> {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(_) => return Err("Archiv-Warteschlange nicht lesbar.".into()),
    };
    let mut result = Vec::new();
    for entry in entries {
        let path = entry.map_err(|_| "Archiv-Datei nicht lesbar.")?.path();
        if path.extension().and_then(|s| s.to_str()) == Some(extension) {
            result.push(path);
        }
    }
    result.sort();
    Ok(result)
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let temp = path.with_extension("tmp");
    let mut file = std::fs::File::create(&temp).map_err(|_| "Archivdatei nicht anlegbar.")?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "Archivdatei nicht speicherbar.")?;
    drop(file);
    std::fs::rename(temp, path).map_err(|_| "Archivdatei nicht abschließbar.".into())
}

fn stage(dir: &Path, raw: &[u8]) -> Result<(), String> {
    let (key, hash) = identity(raw)?;
    let path = dir.join(format!("{key}-{hash}.json"));
    if path.exists() || path.with_extension("receipt").exists() {
        return Ok(());
    }
    let size: u64 = files(dir, "json")?
        .iter()
        .map(|p| std::fs::metadata(p).map(|m| m.len()))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Archivgröße nicht lesbar.")?
        .iter()
        .sum();
    if size + raw.len() as u64 > MAX_OUTBOX {
        return Err(
            "Archiv-Warteschlange voll (256 MB). Upload prüfen; Daten bleiben erhalten.".into(),
        );
    }
    std::fs::create_dir_all(dir).map_err(|_| "Archivordner nicht anlegbar.")?;
    atomic_write(&path, raw)
}

fn counts(app: &AppHandle, dir: &Path) -> Result<(), String> {
    let sent = files(dir, "receipt")?;
    let pending = files(dir, "json")?
        .iter()
        .filter(|p| !p.with_extension("receipt").exists())
        .count();
    // Revision receipts are separate files, but the UI counts matches only.
    let matches: HashSet<_> = sent
        .iter()
        .filter_map(|p| {
            p.file_stem()?
                .to_str()?
                .rsplit_once('-')
                .map(|(key, _)| key)
        })
        .collect();
    website::publish(app, |s| {
        s.archive_uploaded = matches.len();
        s.archive_pending = pending;
    });
    Ok(())
}

pub(super) fn capture(app: &AppHandle, raw: &[u8]) -> Result<(), String> {
    let dir = root(app)?;
    stage(&dir, raw)?;
    counts(app, &dir)
}

fn credential() -> Result<String, String> {
    let key = keyring::Entry::new("blank.aram.archive", "import")
        .map_err(|_| "Archiv-Schlüsselspeicher nicht verfügbar.")?
        .get_password()
        .map_err(|_| "Archiv-Schlüssel fehlt. Rohdaten bleiben lokal vorgemerkt.".to_string())?;
    if key.len() != 64 || !key.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err("Archiv-Schlüssel ungültig.".into());
    }
    Ok(key)
}

fn valid_receipt(v: &Value, key: &str, hash: &str) -> bool {
    v["matchKey"].as_str() == Some(key)
        && v["sha256"].as_str() == Some(hash)
        && v["kind"] == "details"
        && v["archived"] == true
        && v["canonical"] == true
        && v["conflict"] == false
}

async fn send(
    http: &reqwest::Client,
    token: &str,
    raw: Vec<u8>,
    captured: u64,
) -> Result<Value, String> {
    let (key, hash) = identity(&raw)?;
    let response = http
        .post(BASE)
        .bearer_auth(token)
        .header("Content-Type", "application/json")
        .header("X-Archive-Captured-At", captured.to_string())
        .header(
            "X-Archive-Collector-Version",
            concat!("blank-", env!("CARGO_PKG_VERSION")),
        )
        .body(raw)
        .send()
        .await
        .map_err(|_| {
            "Archiv nicht erreichbar. Rohdaten bleiben für einen neuen Versuch gespeichert."
        })?;
    let status = response.status().as_u16();
    if status != 200 && status != 201 {
        return Err(match status {
            401 | 403 => "Archiv-Schlüssel abgelehnt; Rohdaten bleiben lokal.".into(),
            _ => format!("Archiv-Upload fehlgeschlagen (HTTP {status}); Rohdaten bleiben lokal."),
        });
    }
    let answer: Value = response
        .json()
        .await
        .map_err(|_| "Archiv-Bestätigung nicht lesbar.")?;
    if !valid_receipt(&answer, &key, &hash) {
        return Err("Archiv-Bestätigung oder Prüfsumme abweichend; Rohdaten bleiben lokal.".into());
    }
    Ok(answer)
}

pub(super) async fn upload(app: &AppHandle) -> Result<(), String> {
    let dir = root(app)?;
    counts(app, &dir)?;
    let pending = files(&dir, "json")?;
    if pending.is_empty() || !website::enabled(app) {
        return Ok(());
    }
    let token = credential()?;
    let http = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| "Archiv-Verbindung nicht verfügbar.")?;
    for path in pending {
        // Share the existing website pause switch. Slow starts also separate ranking requests.
        tokio::time::sleep(Duration::from_secs(5)).await;
        if !website::enabled(app) {
            break;
        }
        let receipt = path.with_extension("receipt");
        if receipt.exists() {
            let _ = std::fs::remove_file(path);
            continue;
        }
        let metadata = std::fs::metadata(&path).map_err(|_| "Archivdatei nicht lesbar.")?;
        if metadata.len() > MAX_RAW as u64 {
            return Err("Archivdatei zu groß; nichts entfernt.".into());
        }
        let raw = std::fs::read(&path).map_err(|_| "Archivdatei nicht lesbar.")?;
        let captured = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|t| t.as_millis() as u64)
            .unwrap_or_else(now_ms);
        website::publish(app, |s| s.uploading = true);
        let answer = send(&http, &token, raw, captured).await?;
        atomic_write(
            &receipt,
            &serde_json::to_vec(&answer).map_err(|_| "Archiv-Bestätigung nicht speicherbar.")?,
        )?;
        std::fs::remove_file(&path).map_err(|_| "Bestätigte Archivdatei nicht aufräumbar.")?;
        counts(app, &dir)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "Explicit live check: repeats an already archived real match only"]
    fn existing_live_match_is_acknowledged_without_duplicate() {
        let path =
            std::env::var("BLANK_ARCHIVE_TEST_FILE").expect("Real archived fixture required");
        let raw = std::fs::read(path).unwrap();
        let (key, hash) = identity(&raw).unwrap();
        let token = credential().unwrap();
        tauri::async_runtime::block_on(async {
            let http = reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(30))
                .build()
                .unwrap();
            let existing = http
                .get(format!("{BASE}/{key}/details"))
                .bearer_auth(&token)
                .send()
                .await
                .unwrap();
            assert_eq!(
                existing.status().as_u16(),
                200,
                "Only an existing match may be tested"
            );
            assert_eq!(
                existing
                    .headers()
                    .get("X-Archive-Sha256")
                    .unwrap()
                    .to_str()
                    .unwrap(),
                hash
            );
            let receipt = send(&http, &token, raw, now_ms()).await.unwrap();
            assert!(valid_receipt(&receipt, &key, &hash));
            println!("Live archive upload: existing match and SHA-256 acknowledged; no new fixture uploaded.");
        });
    }
    fn sample() -> Vec<u8> {
        serde_json::to_vec(&serde_json::json!({"platformId":"EUW1","gameId":42,"queueId":2400,
            "participants":(0..10).map(|i| serde_json::json!({"participantId":i+1})).collect::<Vec<_>>(),
            "participantIdentities":(0..10).map(|i| serde_json::json!({"player":{"puuid":format!("{:0>78}",i)}})).collect::<Vec<_>>()
        })).unwrap()
    }
    #[test]
    fn queue_preserves_bytes_and_deduplicates_across_restart() {
        let dir = std::env::temp_dir().join(format!(
            "blank-archive-test-{}-{}",
            std::process::id(),
            now_ms()
        ));
        let raw = sample();
        stage(&dir, &raw).unwrap();
        stage(&dir, &raw).unwrap();
        let pending = files(&dir, "json").unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(std::fs::read(&pending[0]).unwrap(), raw);
        atomic_write(&pending[0].with_extension("receipt"), b"{}").unwrap();
        std::fs::remove_file(&pending[0]).unwrap();
        stage(&dir, &raw).unwrap();
        assert!(files(&dir, "json").unwrap().is_empty());
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn rejects_non_mayhem_and_incomplete_data() {
        let mut v: Value = serde_json::from_slice(&sample()).unwrap();
        v["queueId"] = 450.into();
        assert!(identity(&serde_json::to_vec(&v).unwrap()).is_err());
        v["queueId"] = 2400.into();
        v["participantIdentities"] = serde_json::json!([]);
        assert!(identity(&serde_json::to_vec(&v).unwrap()).is_err());
    }
    #[test]
    fn acknowledgement_requires_matching_hash_and_canonical_match() {
        let mut v = serde_json::json!({"matchKey":"EUW1_42","sha256":"hash","kind":"details","archived":true,"canonical":true,"conflict":false});
        assert!(valid_receipt(&v, "EUW1_42", "hash"));
        assert!(!valid_receipt(&v, "EUW1_42", "other"));
        v["conflict"] = true.into();
        assert!(!valid_receipt(&v, "EUW1_42", "hash"));
    }
}
