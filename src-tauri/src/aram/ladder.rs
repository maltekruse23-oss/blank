//! "Find my Mayhem rank" in the Mayhem app (ROADMAP "Jetzt 2", user's decisions 08.10.2026: no
//! groups, one public leaderboard; a click enters you, after that every new Mayhem game goes up by
//! itself; the server knows who is entered, the app stores nothing about it).
//!
//! The way in is the Collector's (apps/mayhem-collector): the client's full answer for each of the
//! player's own Mayhem games goes to the site's archive (POST /api/archive/contribute with this
//! installation's upload key, POST /api/archive/enroll), and the site lists every player of an
//! archived game; "Hide name" (/privacy/remove) takes them off again. By itself after a Mayhem game
//! only once this installation's own click made its upload key (players of others' archived games
//! are listed without ever clicking) and only while the site lists the player (their profile,
//! website::own_profile): then the games it does not count yet go up; removed or hidden → nothing
//! goes up by itself. Read-only on the client, only games from the player's own history that name
//! them. Kept on this PC is only the random upload key in the Windows Credential Manager, as the
//! Collector does (without it every start would enroll anew; the site allows three a day).
//! Messages are English: only the Mayhem app uses this.

use std::{
    collections::HashSet,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};

use super::{
    after_game::{game_ended, started_mayhem_game},
    archive,
    client::Lcu,
    game_card,
    games::History,
    website, Summoner, AFTER_GAME, GAME_EXE, HISTORY, MAYHEM_QUEUE, SUMMONER,
};

const SITE: &str = "https://mayhemstats.lol";
/// This installation's upload key (Windows Credential Manager, made on the first upload).
const KEY_SERVICE: &str = "mayhem.app.upload";
const KEY_USER: &str = "installation";
/// The site takes at most 30 writing requests a minute from one address.
const PAUSE: Duration = Duration::from_secs(3);
/// Upload progress for the window: `{ done, total }`.
const PROGRESS: &str = "mayhem-upload";
/// Games went up after a game: the window asks for the rank again.
const UPLOADED: &str = "mayhem-uploaded";

const CLIENT: &str = "The League client did not answer. Try again.";
const SITE_DOWN: &str = "mayhemstats.lol did not answer. Check your connection.";
const UNCONFIRMED: &str = "mayhemstats.lol did not confirm a game. Try again.";
const NO_KEY: &str = "Windows could not keep the upload key.";

/// What a click on "Find my Mayhem rank" did.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Found {
    /// ARAM Mayhem games in the client's history (it gives out the last 20 games).
    games: usize,
    /// Of them sent now (the site counted the others already).
    sent: usize,
    /// The player's rank afterwards; `ranks.me` None: the site does not list them.
    ranks: website::OwnRanks,
}

#[derive(Serialize, Clone)]
struct Progress {
    done: usize,
    total: usize,
}

/// "Find my Mayhem rank": the player's recent Mayhem games to mayhemstats.lol, then their rank.
/// None while the client is closed or nobody is signed in.
#[tauri::command]
pub async fn mayhem_find_rank(app: AppHandle) -> Result<Option<Found>, String> {
    let Some((lcu, puuid, name)) = player().await? else {
        return Ok(None);
    };
    // The click itself: from now on this installation uploads after each game (upload_after).
    // ponytail: one key per installation, so another account signed in on this PC later counts as
    // entered too; per-account consent would need a marker per PUUID.
    website::stored_key(KEY_SERVICE, KEY_USER).map_err(|_| NO_KEY)?;
    let http = website::site_client().map_err(|_| SITE_DOWN)?;
    let before = website::own_profile(&http, &lcu, &puuid, &name)
        .await
        .map_err(|_| SITE_DOWN)?;
    let games = mayhem_games(&lcu, &puuid).await?;
    let counted = before.as_deref().map(counted).unwrap_or_default();
    let sent = send_new(&app, &lcu, &http, &puuid, &games, &counted).await?;
    let me = if sent == 0 {
        before
    } else {
        website::own_profile(&http, &lcu, &puuid, &name)
            .await
            .map_err(|_| SITE_DOWN)?
    };
    let board = website::read_json(&http, "/api/leaderboard")
        .await
        .map_err(|_| SITE_DOWN)?;
    Ok(Some(Found {
        games: games.len(),
        sent,
        ranks: website::OwnRanks { name, board, me },
    }))
}

/// From the Mayhem app's look for the client (mayhem.rs, every few seconds): a game seen while the
/// client runs is followed to its end, once – also when the client closes or restarts meanwhile.
/// The process list is only read while the client runs or a game is followed.
pub fn game_seen(app: &AppHandle, client_open: bool) {
    static FOLLOWED: AtomicBool = AtomicBool::new(false);
    let followed = FOLLOWED.load(Ordering::Relaxed);
    if !client_open && !followed {
        return;
    }
    let game = !crate::pc::program_pids(GAME_EXE).is_empty();
    if game && client_open && !followed {
        FOLLOWED.store(true, Ordering::Relaxed);
        tauri::async_runtime::spawn(after_game(app.clone()));
    } else if !game {
        FOLLOWED.store(false, Ordering::Relaxed);
    }
}

/// A Mayhem game ended (Windows reports the end of the game's process, no polling): its card
/// (game_card.rs), and once the client's history has it, the games the site does not count yet go
/// up – only while the site lists the player.
async fn after_game(app: AppHandle) {
    let Some(game_id) = started_mayhem_game().await else {
        return;
    };
    // The augments offered in this game, read off the screen until it ends (offers.rs).
    super::offers::follow(&app, game_id);
    // The card names the players of the game the leaderboard lists: read while the game runs.
    let listed = tauri::async_runtime::spawn(game_card::listed_names());
    // ponytail: a game whose end cannot be awaited (or that ends while the client is closed) goes
    // up with the next game or the next click, which send everything the site does not count; it
    // gets no card.
    if !game_ended().await {
        return;
    }
    let listed = listed.await.unwrap_or_default();
    tauri::async_runtime::spawn(game_card::after_game(app.clone(), game_id, listed));
    // The history has the game a little later (as in blank.: about two minutes in all). A client
    // that is away or does not answer yet (e.g. "Close client during game") gets the next look.
    for wait in AFTER_GAME {
        tokio::time::sleep(wait).await;
        match upload_after(&app, game_id).await {
            Ok(true) => return,
            Ok(false) => {}
            Err(error) if error == CLIENT => {}
            Err(error) => {
                crate::errors::record("Mayhem upload", &error);
                return;
            }
        }
    }
}

/// true when done (sent, nothing new, never clicked here or the player not listed); false while the
/// client is away or its history does not have the game yet.
async fn upload_after(app: &AppHandle, game_id: u64) -> Result<bool, String> {
    // Only after this installation's own click (it made the key), never because others' uploads list
    // the player; only read, never made here.
    if !website::has_key(KEY_SERVICE, KEY_USER) {
        return Ok(true);
    }
    let Some((lcu, puuid, name)) = player().await? else {
        return Ok(false);
    };
    let games = mayhem_games(&lcu, &puuid).await?;
    if !games.contains(&game_id) {
        return Ok(false);
    }
    let http = website::site_client().map_err(|_| SITE_DOWN)?;
    // Asked every time, nothing kept: removed or hidden on the site means never again by itself.
    let Some(profile) = website::own_profile(&http, &lcu, &puuid, &name)
        .await
        .map_err(|_| SITE_DOWN)?
    else {
        return Ok(true);
    };
    if send_new(app, &lcu, &http, &puuid, &games, &counted(&profile)).await? > 0 {
        let _ = app.emit_to(crate::mayhem::WINDOW, UPLOADED, ());
    }
    Ok(true)
}

/// The client and the signed-in player (PUUID, Riot ID); None while it is closed or nobody is
/// signed in.
async fn player() -> Result<Option<(Lcu, String, String)>, String> {
    let Ok(Some(lcu)) = Lcu::connect() else {
        return Ok(None);
    };
    let summoner: Summoner = lcu.get(SUMMONER).await.map_err(|_| CLIENT)?;
    Ok(website::own_player(&summoner).map(|(puuid, name)| (lcu, puuid, name)))
}

/// The player's ARAM Mayhem games in the client's history, newest first.
async fn mayhem_games(lcu: &Lcu, puuid: &str) -> Result<Vec<u64>, String> {
    let path = format!("/lol-match-history/v1/products/lol/{puuid}/matches?{HISTORY}");
    let history: History = lcu.get(&path).await.map_err(|_| CLIENT)?;
    Ok(history
        .games
        .games
        .iter()
        .filter(|g| g.queue_id == MAYHEM_QUEUE && g.game_id > 0)
        .map(|g| g.game_id)
        .collect())
}

/// The games the site counts for the player: their profile's history.
fn counted(profile: &str) -> HashSet<u64> {
    let Ok(value) = serde_json::from_str::<Value>(profile) else {
        return HashSet::new();
    };
    value["history"]
        .as_array()
        .map(|list| {
            list.iter()
                .filter_map(|s| s["entry"]["gameId"].as_u64())
                .collect()
        })
        .unwrap_or_default()
}

/// Sends the games of `games` the site does not count yet, one by one; returns how many went up.
/// The window hears the progress.
async fn send_new(
    app: &AppHandle,
    lcu: &Lcu,
    http: &reqwest::Client,
    puuid: &str,
    games: &[u64],
    counted: &HashSet<u64>,
) -> Result<usize, String> {
    let new: Vec<u64> = games
        .iter()
        .copied()
        .filter(|id| !counted.contains(id))
        .collect();
    if new.is_empty() {
        return Ok(0);
    }
    let key = website::stored_key(KEY_SERVICE, KEY_USER).map_err(|_| NO_KEY)?;
    enroll(http, &key).await?;
    let progress = |done| {
        let total = new.len();
        let _ = app.emit_to(crate::mayhem::WINDOW, PROGRESS, Progress { done, total });
    };
    let mut sent = 0;
    for (done, id) in new.iter().enumerate() {
        progress(done);
        if done > 0 {
            tokio::time::sleep(PAUSE).await;
        }
        let raw = lcu
            .get_bytes(&format!("/lol-match-history/v1/games/{id}"))
            .await
            .map_err(|_| CLIENT)?;
        // Not complete or not the player's own game: never sent.
        let Some(game) = own_game(&raw, *id, puuid) else {
            continue;
        };
        contribute(http, &key, raw, &game).await?;
        sent += 1;
    }
    progress(new.len());
    Ok(sent)
}

/// The client's answer for game `id` as the archive takes it (archive key and SHA-256), if it is
/// a complete ARAM Mayhem game that names the player.
fn own_game(raw: &[u8], id: u64, puuid: &str) -> Option<(String, String)> {
    let value: Value = serde_json::from_slice(raw).ok()?;
    let theirs = value["participantIdentities"]
        .as_array()?
        .iter()
        .any(|p| p["player"]["puuid"] == puuid);
    if !theirs || value["gameId"].as_u64() != Some(id) {
        return None;
    }
    archive::identity(raw).ok()
}

/// This installation may upload (the site answers the same for a known key, three new keys a day
/// per address).
async fn enroll(http: &reqwest::Client, key: &str) -> Result<(), String> {
    let response = http
        .post(format!("{SITE}/api/archive/enroll"))
        .bearer_auth(key)
        .send()
        .await
        .map_err(|_| SITE_DOWN)?;
    match response.status().as_u16() {
        200 => Ok(()),
        429 => Err("Too many new uploaders from your network today. Try again tomorrow.".into()),
        status => Err(refused(status)),
    }
}

/// One game into the site's archive, confirmed by its checksum.
async fn contribute(
    http: &reqwest::Client,
    key: &str,
    raw: Vec<u8>,
    (match_key, hash): &(String, String),
) -> Result<(), String> {
    let response = http
        .post(format!("{SITE}/api/archive/contribute"))
        .bearer_auth(key)
        .header("Content-Type", "application/json")
        .header("X-Archive-Captured-At", super::now_ms().to_string())
        .header(
            "X-Archive-Collector-Version",
            concat!("mayhem-", env!("CARGO_PKG_VERSION")),
        )
        .body(raw)
        .send()
        .await
        .map_err(|_| SITE_DOWN)?;
    let status = response.status().as_u16();
    if status != 200 {
        return Err(refused(status));
    }
    let answer: Value = response.json().await.map_err(|_| UNCONFIRMED)?;
    if receipt_matches(&answer, match_key, hash) {
        Ok(())
    } else {
        Err(UNCONFIRMED.into())
    }
}

fn refused(status: u16) -> String {
    match status {
        401 | 403 => "mayhemstats.lol no longer takes uploads from this PC.".into(),
        429 => "mayhemstats.lol is busy. Try again in a minute.".into(),
        _ => format!("mayhemstats.lol did not take the games (HTTP {status})."),
    }
}

/// As the Collector: archived as this exact answer (another upload of the game may be the
/// canonical one; the site counts the game either way).
fn receipt_matches(answer: &Value, match_key: &str, hash: &str) -> bool {
    answer["archived"] == true
        && answer["kind"] == "details"
        && answer["matchKey"].as_str() == Some(match_key)
        && answer["sha256"].as_str() == Some(hash)
        && answer["canonical"].is_boolean()
        && answer["conflict"].is_boolean()
}

#[cfg(test)]
mod tests {
    use super::*;

    const ME: &str = "0123abcd-0123-abcd-0123-0123456789ab";

    fn game(id: u64, queue: u64, me_in_it: bool) -> Vec<u8> {
        let identities: Vec<Value> = (0..10)
            .map(|n| {
                let puuid = if n == 3 && me_in_it {
                    ME.to_string()
                } else {
                    format!("{n:036}")
                };
                serde_json::json!({"participantId": n + 1, "player": {"puuid": puuid}})
            })
            .collect();
        serde_json::to_vec(&serde_json::json!({
            "platformId": "EUW1", "gameId": id, "queueId": queue,
            "participants": vec![Value::Null; 10], "participantIdentities": identities,
        }))
        .unwrap()
    }

    #[test]
    fn only_complete_mayhem_games_of_the_player_go_up() {
        let (key, hash) = own_game(&game(42, 2400, true), 42, ME).expect("own game");
        assert_eq!(key, "EUW1_42");
        assert_eq!(hash.len(), 64);
        // Someone else's game, another queue, another id than asked for, no JSON.
        assert!(own_game(&game(42, 2400, false), 42, ME).is_none());
        assert!(own_game(&game(42, 450, true), 42, ME).is_none());
        assert!(own_game(&game(42, 2400, true), 43, ME).is_none());
        assert!(own_game(b"<html>", 42, ME).is_none());
    }

    #[test]
    fn games_the_site_counts_are_not_sent_again() {
        let profile = r#"{"history":[{"entry":{"gameId":7}},{"entry":{"gameId":9}},{"x":1}]}"#;
        assert_eq!(counted(profile), HashSet::from([7, 9]));
        assert!(counted(r#"{"rank":null,"history":[]}"#).is_empty());
        assert!(counted("not json").is_empty());
    }

    #[test]
    fn only_a_matching_receipt_confirms_a_game() {
        let answer = serde_json::json!({"archived":true,"kind":"details","matchKey":"EUW1_42",
            "sha256":"h","canonical":false,"conflict":true});
        assert!(receipt_matches(&answer, "EUW1_42", "h"));
        assert!(!receipt_matches(&answer, "EUW1_42", "other"));
        assert!(!receipt_matches(&answer, "EUW1_43", "h"));
        assert!(!receipt_matches(
            &serde_json::json!({"error":"Tageslimit erreicht"}),
            "EUW1_42",
            "h"
        ));
    }

    #[test]
    fn refusals_say_what_to_do() {
        assert!(refused(403).contains("no longer"));
        assert!(refused(429).contains("minute"));
        assert!(refused(500).contains("HTTP 500"));
    }
}
