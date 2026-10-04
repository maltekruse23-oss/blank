//! Additive upload of confirmed local Mayhem entries to the user's existing public Site.
//! Local games are never removed. Credentials live only in Windows Credential Manager.
use super::{load, Augment, Entry, Player};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};

const BASE: &str = "https://blank-mayhem.maltevfx.chatgpt.site";
const SERVICE: &str = "blank.aram.website";
const MAX_BODY: usize = 60_000;
/// The Site takes icons up to 24 KB of PNG (as base64 in a data URL) and 40 augments a request.
const MAX_AUGMENT_ICON: usize = "data:image/png;base64,".len() + 32_768;
const AUGMENTS_PER_REQUEST: usize = 40;

#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub enabled: bool,
    pub uploading: bool,
    pub uploaded: usize,
    pub pending: usize,
    pub archive_uploaded: usize,
    pub archive_pending: usize,
    pub last_success: Option<u64>,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct Progress {
    /// Off until the user allows it with a click: friends' apps update too.
    enabled: bool,
    acknowledged: HashMap<String, String>,
    last_success: Option<u64>,
    /// Augments the Site has with name and icon (it shows them on its pages).
    #[serde(default)]
    augments: Vec<u32>,
}

pub struct WebsiteState {
    path: PathBuf,
    busy: AtomicBool,
    dirty: AtomicBool,
    paused: AtomicBool,
    progress_lock: tokio::sync::Mutex<()>,
    status: Mutex<Status>,
}

impl WebsiteState {
    pub fn new(app: &AppHandle) -> tauri::Result<Self> {
        let path = app.path().app_config_dir()?.join("aram-website.json");
        let progress = read_progress(&path);
        let status = match &progress {
            Ok(p) => Status {
                enabled: p.enabled,
                uploaded: p.acknowledged.len(),
                last_success: p.last_success,
                ..Status::default()
            },
            Err(e) => Status {
                error: Some(e.clone()),
                ..Status::default()
            },
        };
        Ok(Self {
            path,
            busy: AtomicBool::new(false),
            dirty: AtomicBool::new(false),
            paused: AtomicBool::new(!status.enabled),
            progress_lock: tokio::sync::Mutex::new(()),
            status: Mutex::new(status),
        })
    }
}

fn read_progress(path: &Path) -> Result<Progress, String> {
    match std::fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|_| "Website-Uploadstatus beschädigt; nichts überschrieben.".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Progress::default()),
        Err(_) => Err("Website-Uploadstatus nicht lesbar.".into()),
    }
}

fn write_progress(path: &Path, p: &Progress) -> Result<(), String> {
    let bytes = serde_json::to_vec(p).map_err(|_| "Uploadstatus nicht speicherbar.")?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|_| "Uploadordner nicht speicherbar.")?;
    }
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, bytes)
        .and_then(|_| std::fs::rename(&temp, path))
        .map_err(|_| "Website-Uploadstatus nicht speicherbar.".into())
}

fn credential(puuid: &str) -> Result<String, String> {
    let entry = keyring::Entry::new(SERVICE, puuid)
        .map_err(|_| "Windows-Schlüsselspeicher nicht verfügbar.")?;
    match entry.get_password() {
        Ok(token) if token.len() == 64 && token.bytes().all(|b| b.is_ascii_hexdigit()) => Ok(token),
        Ok(_) => Err("Gespeicherter Website-Schlüssel ist ungültig.".into()),
        Err(keyring::Error::NoEntry) => {
            use windows_sys::Win32::Security::Cryptography::{
                BCryptGenRandom, BCRYPT_USE_SYSTEM_PREFERRED_RNG,
            };
            let mut bytes = [0u8; 32];
            // SAFETY: null selects the system RNG, output buffer is valid for 32 bytes.
            if unsafe {
                BCryptGenRandom(
                    std::ptr::null_mut(),
                    bytes.as_mut_ptr(),
                    32,
                    BCRYPT_USE_SYSTEM_PREFERRED_RNG,
                )
            } < 0
            {
                return Err("Sicherer Website-Schlüssel nicht erzeugbar.".into());
            }
            let token: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
            // Persist before first request: a lost HTTP response must not lose ownership.
            entry
                .set_password(&token)
                .map_err(|_| "Website-Schlüssel nicht sicher speicherbar.")?;
            Ok(token)
        }
        Err(_) => Err("Website-Schlüssel nicht lesbar.".into()),
    }
}

fn fingerprint(entry: &Entry) -> Result<String, String> {
    let bytes = serde_json::to_vec(entry).map_err(|_| "Spiel nicht lesbar.")?;
    bytes_hash(&bytes)
}

pub(super) fn bytes_hash(bytes: &[u8]) -> Result<String, String> {
    use windows_sys::Win32::Security::Cryptography::{BCryptHash, BCRYPT_SHA256_ALG_HANDLE};
    let mut hash = [0u8; 32];
    // SAFETY: the pseudo-handle and buffers are valid; JSON entries fit u32.
    if unsafe {
        BCryptHash(
            BCRYPT_SHA256_ALG_HANDLE,
            std::ptr::null(),
            0,
            bytes.as_ptr(),
            bytes.len() as u32,
            hash.as_mut_ptr(),
            32,
        )
    } < 0
    {
        return Err("Spiel-Prüfsumme nicht berechenbar.".into());
    }
    Ok(hash.iter().map(|b| format!("{b:02x}")).collect())
}

fn key(entry: &Entry) -> String {
    format!("{}/{}", entry.game_id, entry.puuid)
}

fn payload(me: &Player, entries: &[Entry]) -> Result<Vec<u8>, String> {
    serde_json::to_vec(&serde_json::json!({"player":me,"entries":entries,"group":null}))
        .map_err(|_| "Uploaddaten nicht lesbar.".into())
}

fn pending(games: &[Entry], p: &Progress) -> Result<Vec<Entry>, String> {
    let mut result = Vec::new();
    for entry in games.iter().filter(|e| !e.provisional) {
        if p.acknowledged.get(&key(entry)) != Some(&fingerprint(entry)?) {
            result.push(entry.clone());
        }
    }
    Ok(result)
}

/// An augment the Site accepts: a name without control characters or angle brackets and a
/// small PNG icon. Others are not sent (the Site shows their number).
fn sendable(augment: &Augment) -> bool {
    let name = augment.name.trim();
    !name.is_empty()
        && name.chars().count() <= 80
        && !name
            .chars()
            .any(|c| c.is_control() || matches!(c, '<' | '>'))
        && matches!(
            augment.rarity.as_str(),
            "prismatic" | "gold" | "silver" | ""
        )
        && augment.icon.as_ref().is_some_and(|icon| {
            icon.starts_with("data:image/png;base64,") && icon.len() <= MAX_AUGMENT_ICON
        })
}

/// Augments of games the Site has confirmed, that it does not have yet, by ID.
fn missing_augments(games: &[Entry], augments: &HashMap<u32, Augment>, p: &Progress) -> Vec<u32> {
    let mut ids: Vec<u32> = games
        .iter()
        .filter(|e| p.acknowledged.contains_key(&key(e)))
        .flat_map(|e| e.augments.iter().copied())
        .filter(|id| !p.augments.contains(id) && augments.get(id).is_some_and(sendable))
        .collect();
    ids.sort_unstable();
    ids.dedup();
    ids
}

fn augment_payload(
    puuid: &str,
    augments: &HashMap<u32, Augment>,
    ids: &[u32],
) -> Result<Vec<u8>, String> {
    let list: Vec<_> = ids
        .iter()
        .filter_map(|id| augments.get(id).map(|a| (id, a)))
        .map(|(id, a)| {
            serde_json::json!({"id":id,"name":a.name.trim(),"rarity":a.rarity,"icon":a.icon})
        })
        .collect();
    serde_json::to_vec(&serde_json::json!({"puuid":puuid,"augments":list}))
        .map_err(|_| "Augments nicht lesbar.".into())
}

fn receipt_matches(answer: &serde_json::Value, expected: &[(u64, &str)]) -> bool {
    let Some(results) = answer["results"].as_array() else {
        return false;
    };
    results.len() == expected.len()
        && expected.iter().all(|(id, puuid)| {
            results.iter().any(|r| {
                r["gameId"].as_u64() == Some(*id)
                    && r["puuid"].as_str() == Some(*puuid)
                    && r["stored"].is_boolean()
            })
        })
}

pub(super) fn publish(app: &AppHandle, update: impl FnOnce(&mut Status)) {
    let state = app.state::<WebsiteState>();
    let mut status = state.status.lock().unwrap();
    update(&mut status);
    let _ = app.emit("aram-website", status.clone());
}

pub(super) fn enabled(app: &AppHandle) -> bool {
    !app.state::<WebsiteState>().paused.load(Ordering::SeqCst)
}

async fn upload_snapshot(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<WebsiteState>();
    let mut progress = read_progress(&state.path)?;
    if !progress.enabled || state.paused.load(Ordering::SeqCst) {
        return Ok(());
    }
    let stored = {
        let aram = app.state::<super::AramState>();
        let _guard = aram.lock.lock().await;
        load(&aram.path)?
    };
    let Some(me) = stored.me else {
        return Ok(());
    };
    let entries = pending(&stored.games, &progress)?;
    let waiting = !missing_augments(&stored.games, &stored.augments, &progress).is_empty();
    publish(app, |s| {
        s.pending = entries.len();
        s.error = None;
        s.uploading = !entries.is_empty();
    });
    if entries.is_empty() && !waiting {
        return Ok(());
    }
    let token = credential(&me.puuid)?;
    let http = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(25))
        .user_agent(concat!("blank/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| "Website-Verbindung nicht verfügbar.")?;
    let mut offset = 0;
    while offset < entries.len() {
        if state.paused.load(Ordering::SeqCst) {
            break;
        }
        // At most six entries also keeps D1 statement batches bounded.
        let mut end = (offset + 6).min(entries.len());
        let bytes = loop {
            let bytes = payload(&me, &entries[offset..end])?;
            if bytes.len() <= MAX_BODY {
                break bytes;
            }
            if end == offset + 1 {
                return Err("Ein Spiel ist zu groß für den Website-Upload.".into());
            }
            end -= 1;
        };
        let response = http
            .post(format!("{BASE}/api/games"))
            .bearer_auth(&token)
            .header("Content-Type", "application/json")
            .body(bytes)
            .send()
            .await
            .map_err(|_| "Website nicht erreichbar. Upload wird später wiederholt.")?;
        let status = response.status().as_u16();
        if status != 200 {
            return Err(match status {
                401 | 409 => {
                    "Website-Schlüssel passt nicht zum Spieler. Upload pausiert; Schlüssel prüfen."
                        .into()
                }
                429 => "Website-Limit erreicht. Upload wird später wiederholt.".into(),
                _ => format!("Website-Upload fehlgeschlagen (HTTP {status})."),
            });
        }
        let answer: serde_json::Value = response
            .json()
            .await
            .map_err(|_| "Website-Antwort nicht lesbar.")?;
        let expected: Vec<_> = entries[offset..end]
            .iter()
            .map(|e| (e.game_id, e.puuid.as_str()))
            .collect();
        if !receipt_matches(&answer, &expected) {
            return Err("Website hat nicht alle Spiele bestätigt.".into());
        }
        for entry in &entries[offset..end] {
            progress
                .acknowledged
                .insert(key(entry), fingerprint(entry)?);
        }
        progress.last_success = Some(super::now_ms());
        {
            let _write = state.progress_lock.lock().await;
            // Preserve a pause made while the request was in flight.
            progress.enabled = !state.paused.load(Ordering::SeqCst);
            write_progress(&state.path, &progress)?;
        }
        offset = end;
        publish(app, |s| {
            s.uploaded = progress.acknowledged.len();
            s.pending = entries.len() - offset;
            s.last_success = progress.last_success;
        });
        if offset < entries.len() {
            tokio::time::sleep(Duration::from_secs(3)).await;
        }
    }
    // Names and icons of new augments, after the games (the Site takes only augments of games).
    let augments = missing_augments(&stored.games, &stored.augments, &progress);
    let mut offset = 0;
    while offset < augments.len() && !state.paused.load(Ordering::SeqCst) {
        let mut end = (offset + AUGMENTS_PER_REQUEST).min(augments.len());
        let bytes = loop {
            let bytes = augment_payload(&me.puuid, &stored.augments, &augments[offset..end])?;
            if bytes.len() <= MAX_BODY || end == offset + 1 {
                break bytes;
            }
            end -= 1;
        };
        let response = http
            .post(format!("{BASE}/api/augments"))
            .bearer_auth(&token)
            .header("Content-Type", "application/json")
            .body(bytes)
            .send()
            .await
            .map_err(|_| "Website nicht erreichbar. Upload wird später wiederholt.")?;
        let status = response.status().as_u16();
        if status != 200 {
            return Err(match status {
                401 => {
                    "Website-Schlüssel passt nicht zum Spieler. Upload pausiert; Schlüssel prüfen."
                        .into()
                }
                429 => "Website-Limit erreicht. Upload wird später wiederholt.".into(),
                _ => format!("Augment-Upload fehlgeschlagen (HTTP {status})."),
            });
        }
        let answer: serde_json::Value = response
            .json()
            .await
            .map_err(|_| "Website-Antwort nicht lesbar.")?;
        let have = confirmed_augments(&answer, &augments[offset..end]);
        if !have.is_empty() {
            let _write = state.progress_lock.lock().await;
            // Re-read: the games above wrote it, and a pause may have come in between.
            let mut current = read_progress(&state.path)?;
            current.augments.extend(have);
            current.augments.sort_unstable();
            current.augments.dedup();
            write_progress(&state.path, &current)?;
        }
        offset = end;
    }
    Ok(())
}

/// The sent augments the Site confirms to have (with icon). The others are sent again later,
/// e.g. when their game has not arrived there yet.
fn confirmed_augments(answer: &serde_json::Value, sent: &[u32]) -> Vec<u32> {
    answer["have"]
        .as_array()
        .map(|list| {
            list.iter()
                .filter_map(|v| v.as_u64())
                .filter_map(|v| u32::try_from(v).ok())
                .filter(|id| sent.contains(id))
                .collect()
        })
        .unwrap_or_default()
}

pub fn enqueue(app: &AppHandle) {
    let state = app.state::<WebsiteState>();
    if state.paused.load(Ordering::SeqCst) {
        return;
    }
    state.dirty.store(true, Ordering::SeqCst);
    if state.busy.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<WebsiteState>();
        let mut attempt = 0usize;
        loop {
            state.dirty.store(false, Ordering::SeqCst);
            if state.paused.load(Ordering::SeqCst) {
                break;
            }
            let ranking = upload_snapshot(&app).await;
            // The archive still gets a chance when the independent ranking upload fails.
            let archive = super::archive::upload(&app).await;
            match ranking.and(archive) {
                Ok(()) => {
                    attempt = 0;
                    publish(&app, |s| s.uploading = false);
                }
                Err(error) => {
                    let retry = !error.contains("Schlüssel")
                        && !error.contains("HTTP 400")
                        && !error.contains("beschädigt");
                    publish(&app, |s| {
                        s.uploading = false;
                        s.error = Some(error);
                    });
                    if !retry {
                        break;
                    }
                    let delay = [60, 120, 300, 600][attempt.min(3)];
                    attempt += 1;
                    tokio::time::sleep(Duration::from_secs(delay)).await;
                    state.dirty.store(true, Ordering::SeqCst);
                }
            }
            if !state.dirty.load(Ordering::SeqCst) {
                break;
            }
        }
        state.busy.store(false, Ordering::SeqCst);
        if state.dirty.load(Ordering::SeqCst) && !state.paused.load(Ordering::SeqCst) {
            enqueue(&app);
        }
    });
}

#[tauri::command]
pub async fn aram_website(
    app: AppHandle,
    enabled: Option<bool>,
    open: Option<bool>,
) -> Result<Status, String> {
    let state = app.state::<WebsiteState>();
    if open == Some(true) {
        crate::twitch::open_url(BASE);
    }
    if let Some(enabled) = enabled {
        {
            let _write = state.progress_lock.lock().await;
            let mut progress = read_progress(&state.path)?;
            progress.enabled = enabled;
            write_progress(&state.path, &progress)?;
            state.paused.store(!enabled, Ordering::SeqCst);
        }
        publish(&app, |s| {
            s.enabled = enabled;
            s.error = None;
        });
        if enabled {
            enqueue(&app);
        }
    }
    let result = state.status.lock().unwrap().clone();
    Ok(result)
}

/// The largest answer of the Site that is read (the whole leaderboard or one player's season).
const MAX_ANSWER: usize = 16 * 1024 * 1024;

/// The Site's ranks as it computes them (Etappe 6, one truth for everyone): the global leaderboard
/// and the user's own ranked profile, as JSON text the app checks strictly. Only while the upload
/// is allowed (nothing goes to the Site before that click); only the user's own PUUID is sent,
/// friends are found in the public leaderboard on this PC.
#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SiteRanks {
    pub enabled: bool,
    pub board: Option<String>,
    /// None: the Site has no profile of the user (yet).
    pub me: Option<String>,
}

/// A PUUID that may stand in the Site's address as it is.
fn plain_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 100
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

async fn read_json(http: &reqwest::Client, path: &str) -> Result<Option<String>, String> {
    let response = http
        .get(format!("{BASE}{path}"))
        .send()
        .await
        .map_err(|_| "Website nicht erreichbar.")?;
    match response.status().as_u16() {
        200 => {}
        404 => return Ok(None),
        status => return Err(format!("Ränge der Website nicht lesbar (HTTP {status}).")),
    }
    if response
        .content_length()
        .is_some_and(|n| n > MAX_ANSWER as u64)
    {
        return Err("Antwort der Website zu groß.".into());
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|_| "Antwort der Website unvollständig.")?;
    if bytes.len() > MAX_ANSWER {
        return Err("Antwort der Website zu groß.".into());
    }
    String::from_utf8(bytes.to_vec())
        .map(Some)
        .map_err(|_| "Antwort der Website nicht lesbar.".into())
}

#[tauri::command]
pub async fn aram_site_ranks(app: AppHandle) -> Result<SiteRanks, String> {
    if !enabled(&app) {
        return Ok(SiteRanks::default());
    }
    let me = {
        let aram = app.state::<super::AramState>();
        let _guard = aram.lock.lock().await;
        load(&aram.path)?.me.map(|me| me.puuid)
    };
    let http = site_client()?;
    let board = read_json(&http, "/api/leaderboard").await?;
    let me = match me.filter(|id| plain_id(id)) {
        Some(id) => read_json(&http, &format!("/api/players/{id}")).await?,
        None => None,
    };
    Ok(SiteRanks {
        enabled: true,
        board,
        me,
    })
}

/// One player's ranked profile from the Site, for the player dialog. The app asks only for players
/// the public leaderboard already lists.
#[tauri::command]
pub async fn aram_site_profile(app: AppHandle, puuid: String) -> Result<Option<String>, String> {
    if !enabled(&app) || !plain_id(&puuid) {
        return Ok(None);
    }
    read_json(&site_client()?, &format!("/api/players/{puuid}")).await
}

fn site_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(20))
        .user_agent(concat!("blank/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| "Website-Verbindung nicht verfügbar.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &str = "data:image/png;base64,iVBORw0KGgo=";

    fn augment(name: &str, icon: Option<&str>) -> Augment {
        Augment {
            name: name.into(),
            rarity: "gold".into(),
            icon: icon.map(Into::into),
        }
    }

    #[test]
    fn only_plain_puuids_go_into_the_address() {
        assert!(plain_id(&"a".repeat(78)));
        assert!(plain_id("Ab-9_x"));
        assert!(!plain_id(""));
        assert!(!plain_id("a/../b"));
        assert!(!plain_id("a?x=1"));
        assert!(!plain_id(&"a".repeat(101)));
    }

    #[test]
    fn only_named_augments_with_a_small_png_are_sent() {
        assert!(sendable(&augment("Goldrausch", Some(PNG))));
        assert!(!sendable(&augment("Goldrausch", None)));
        assert!(!sendable(&augment("  ", Some(PNG))));
        assert!(!sendable(&augment("<b>", Some(PNG))));
        assert!(!sendable(&augment(
            "Goldrausch",
            Some("data:image/jpeg;base64,AAAA")
        )));
        let big = format!("{PNG}{}", "A".repeat(MAX_AUGMENT_ICON));
        assert!(!sendable(&augment("Goldrausch", Some(&big))));
        let mut odd = augment("Goldrausch", Some(PNG));
        odd.rarity = "kGold".into();
        assert!(!sendable(&odd));
    }

    #[test]
    fn augments_go_up_only_for_confirmed_games_and_once() {
        let mut entry = super::super::tests::sample_entry();
        entry.augments = vec![7, 9, 11];
        let augments = HashMap::from([
            (7, augment("Sieben", Some(PNG))),
            (9, augment("Neun", None)),
            (11, augment("Elf", Some(PNG))),
        ]);
        let mut p = Progress::default();
        // The Site takes augments only of its games: nothing before the game is confirmed.
        assert!(missing_augments(std::slice::from_ref(&entry), &augments, &p).is_empty());
        p.acknowledged.insert(key(&entry), "x".into());
        let games = std::slice::from_ref(&entry);
        assert_eq!(missing_augments(games, &augments, &p), vec![7, 11]);
        p.augments.push(7);
        assert_eq!(missing_augments(games, &augments, &p), vec![11]);

        let body: serde_json::Value =
            serde_json::from_slice(&augment_payload("me", &augments, &[7, 11]).unwrap()).unwrap();
        assert_eq!(body["puuid"], "me");
        assert_eq!(body["augments"][0]["id"], 7);
        assert_eq!(body["augments"][1]["name"], "Elf");
        assert_eq!(body["augments"][1]["icon"], PNG);
    }

    #[test]
    fn only_sent_augments_count_as_confirmed() {
        let answer = serde_json::json!({"have":[7, 11, 99]});
        assert_eq!(confirmed_augments(&answer, &[7, 8, 11]), vec![7, 11]);
        assert!(confirmed_augments(&serde_json::json!({"error":"x"}), &[7]).is_empty());
    }
    #[test]
    fn only_complete_matching_receipts_acknowledge_games() {
        let expected = [(1, "player-a"), (2, "player-b")];
        let valid = serde_json::json!({"results":[{"gameId":1,"puuid":"player-a","stored":true},{"gameId":2,"puuid":"player-b","stored":false}]});
        assert!(receipt_matches(&valid, &expected)); // Already stored is also safe to acknowledge.
        let partial =
            serde_json::json!({"results":[{"gameId":1,"puuid":"player-a","stored":true}]});
        assert!(!receipt_matches(&partial, &expected));
        let wrong = serde_json::json!({"results":[{"gameId":1,"puuid":"other","stored":true},{"gameId":2,"puuid":"player-b","stored":true}]});
        assert!(!receipt_matches(&wrong, &expected));
        assert!(!receipt_matches(
            &serde_json::json!({"error":"unavailable"}),
            &expected
        ));
    }
}
