//! Following the client and the game: a sync when the client opens, the end of each Mayhem
//! game awaited, its end-of-game stats, and exactly one card per game.

use std::{
    collections::HashSet,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use super::client::{valid_puuid, Lcu};
use super::games::{
    champion_names, entries, friend_set, from_eog, riot_id, Eog, Summary, Summoner,
};
use super::{
    add_augments, live, load, now_ms, save, sync, take_card, website, AramState, Entry, Player,
    AFTER_CLIENT_START, AFTER_GAME, CATCH_UP_MS, EOG, EOG_TRIES, FINISH_AFTER, GAME_EXE,
    MAX_ENTRIES, MAX_SKIN, MAYHEM_QUEUE, SESSION, SUMMONER,
};

/// A Mayhem game's end is being awaited (then the process list does not start a second look).
static WATCHING: AtomicBool = AtomicBool::new(false);

/// From pc.rs's process list (every 10 s anyway): whether the game and the client run. A game that
/// starts is followed to its end (game_started); a game that ended without being followed, or a
/// client that just opened, starts a look a little later – once the page was used (aram.json
/// exists). Nothing else is watched.
pub fn league_seen(app: &AppHandle, game: bool, client: bool) {
    static LAST: Mutex<(bool, bool)> = Mutex::new((false, false));
    let Ok(mut last) = LAST.lock() else {
        return;
    };
    let (had_game, had_client) = std::mem::replace(&mut *last, (game, client));
    drop(last);
    if client && !had_client {
        // The champion select is followed while the client runs (Champ-Karte, if switched on).
        live::listen(app);
    }
    let app = app.clone();
    if game && !had_game {
        tauri::async_runtime::spawn(game_started(app));
    } else if had_game && !game {
        if !WATCHING.load(Ordering::Relaxed) {
            tauri::async_runtime::spawn(after_game(app, 0));
        }
    } else if client && !had_client {
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(AFTER_CLIENT_START).await;
            match sync_in_background(&app).await {
                Ok(_) => catch_up(&app).await,
                Err(error) => crate::errors::record("ARAM", &error.to_string()),
            }
        });
    }
}

/// Which game just ended, and the user's result in it (event "aram-result").
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct JustPlayed {
    game_id: u64,
    puuid: String,
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub(super) struct Session {
    pub(super) game_data: SessionGame,
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub(super) struct SessionGame {
    game_id: u64,
    queue: SessionQueue,
    /// Champion and skin of each player (for the card's splash art).
    player_champion_selections: Vec<Selection>,
    team_one: Vec<Selection>,
    team_two: Vec<Selection>,
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct Selection {
    champion_id: i64,
    selected_skin_index: i64,
}

/// Skins played in the last games (game id, champion id, skin), noted at the start of a game; in
/// ARAM a champion is in a game only once. Only in memory: the stored game keeps its skin.
static SKINS: std::sync::Mutex<Vec<(u64, i64, u32)>> = std::sync::Mutex::new(Vec::new());
const MAX_SKINS: usize = 100;

pub(super) fn note_skins(game: &SessionGame) {
    let mut skins = SKINS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    for pick in game
        .player_champion_selections
        .iter()
        .chain(&game.team_one)
        .chain(&game.team_two)
    {
        let Ok(skin) = u32::try_from(pick.selected_skin_index) else {
            continue;
        };
        if pick.champion_id <= 0 || skin > MAX_SKIN {
            continue;
        }
        skins.retain(|(g, c, _)| !(*g == game.game_id && *c == pick.champion_id));
        skins.push((game.game_id, pick.champion_id, skin));
    }
    let over = skins.len().saturating_sub(MAX_SKINS);
    skins.drain(..over);
}

/// The players' skins as noted at the start, where the game's own source did not tell them.
pub(super) fn add_noted_skins(summary: &mut Summary) {
    let skins = SKINS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    for player in summary.players.iter_mut().filter(|p| p.skin.is_none()) {
        player.skin = skins
            .iter()
            .find(|(g, c, _)| *g == summary.game_id && *c == player.champion_id)
            .map(|(_, _, skin)| *skin);
    }
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct SessionQueue {
    id: i64,
}

/// A game started: while it runs the client knows its id and queue. A Mayhem game's end is awaited
/// (Windows reports the end of its process), then its card follows at once.
async fn game_started(app: AppHandle) {
    if !app.state::<AramState>().path.is_file() {
        return;
    }
    let mut info = None;
    for _ in 0..10 {
        if let Ok(Some(lcu)) = Lcu::connect() {
            if let Ok(session) = lcu.get::<Session>(SESSION).await {
                if session.game_data.game_id != 0 {
                    note_skins(&session.game_data);
                    info = Some((session.game_data.queue.id, session.game_data.game_id));
                    break;
                }
            }
        }
        tokio::time::sleep(Duration::from_secs(3)).await;
    }
    let Some((queue, game_id)) = info else {
        return;
    };
    if queue != MAYHEM_QUEUE {
        return;
    }
    WATCHING.store(true, Ordering::Relaxed);
    let waited = tauri::async_runtime::spawn_blocking(wait_for_game_exit)
        .await
        .unwrap_or(false);
    // Not awaitable: the process list notices the end, a little later (after_game with id 0).
    if waited {
        after_game(app, game_id).await;
    }
    WATCHING.store(false, Ordering::Relaxed);
}

/// Blocks until the game's process ends; false if it cannot be awaited (the process list then
/// notices the end, a little later).
fn wait_for_game_exit() -> bool {
    use windows_sys::Win32::{
        Foundation::CloseHandle,
        System::Threading::{OpenProcess, WaitForSingleObject, INFINITE, PROCESS_SYNCHRONIZE},
    };
    let Some(pid) = crate::pc::program_pids(GAME_EXE).into_iter().next() else {
        return false;
    };
    // SAFETY: the handle is checked and closed; waiting needs only the right to synchronize.
    unsafe {
        let handle = OpenProcess(PROCESS_SYNCHRONIZE, 0, pid);
        if handle.is_null() {
            return false;
        }
        WaitForSingleObject(handle, INFINITE);
        CloseHandle(handle);
    }
    true
}

/// What the end-of-game screen gave.
enum Recorded {
    /// In the collection, and its card is due (not shown before).
    Card(JustPlayed),
    /// Its card was shown before (e.g. the screen of an earlier game is still there).
    Shown,
    /// Began before the leaderboard started: not counted, no card.
    Before,
}

/// A game just ended (`expected`: its id, 0 if not known): the end-of-game screen's stats as soon
/// as they are there, else the history as before; then the user's card – exactly one per game,
/// whichever look found the game first (`carded` in aram.json).
async fn after_game(app: AppHandle, expected: u64) {
    if !app.state::<AramState>().path.is_file() {
        return;
    }
    if expected == 0 {
        // Only from the process list: which queue it was, the client still knows right after.
        if let Ok(Some(lcu)) = Lcu::connect() {
            if let Ok(session) = lcu.get::<Session>(SESSION).await {
                let queue = session.game_data.queue.id;
                if queue != 0 && queue != MAYHEM_QUEUE {
                    return;
                }
            }
        }
    }
    let ended = now_ms();
    for _ in 0..EOG_TRIES {
        if let Ok(Some(lcu)) = Lcu::connect() {
            if let Ok(eog) = lcu.get::<Eog>(EOG).await {
                if eog.game_id != 0 && (expected == 0 || eog.game_id == expected) {
                    match record_eog(&app, &lcu, &eog).await {
                        Ok(Recorded::Card(played)) => {
                            let _ = app.emit("aram-result", played);
                            finish_later(app);
                            return;
                        }
                        // Not knowing which game ended, an earlier game's screen may still be
                        // there: wait for this one's.
                        Ok(Recorded::Shown) if expected == 0 => {}
                        Ok(_) => {
                            finish_later(app);
                            return;
                        }
                        Err(error) => {
                            crate::errors::record("ARAM", &error.to_string());
                            break;
                        }
                    }
                }
            }
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    // No usable end-of-game stats: look in the history a few times, as before – for a game of the
    // user that ended just now and has no card yet.
    let window = Duration::from_secs(10 * 60).as_millis() as u64;
    for wait in AFTER_GAME {
        tokio::time::sleep(wait).await;
        if let Err(error) = sync_in_background(&app).await {
            crate::errors::record("ARAM", &error.to_string());
            continue;
        }
        match claim_card(&app, ended.saturating_sub(window)).await {
            Ok(Some(played)) => {
                let _ = app.emit("aram-result", played);
                return;
            }
            Ok(None) => {}
            Err(error) => crate::errors::record("ARAM", &error.to_string()),
        }
    }
}

/// The end-of-game stats into the collection (provisional until the history has the game), and
/// whether the user's card is due. Unusable stats (no damage, the user not among them) are an
/// error: then the history is used.
async fn record_eog(app: &AppHandle, lcu: &Lcu, eog: &Eog) -> Result<Recorded, String> {
    let mut summary = from_eog(eog, now_ms());
    add_noted_skins(&mut summary);
    let me: Summoner = lcu.get(SUMMONER).await?;
    if !valid_puuid(&me.puuid) {
        return Err("Im League-Client ist niemand angemeldet.".into());
    }
    if summary.players.iter().all(|p| p.damage == 0)
        || !summary.players.iter().any(|p| p.puuid == me.puuid)
    {
        return Err("Endbildschirm ohne brauchbare Werte".into());
    }
    let friends = friend_set(lcu).await;
    let champions = champion_names(lcu).await;
    let state = app.state::<AramState>();
    let _guard = state.lock.lock().await;
    let mut stored = load(&state.path)?;
    if stored.since.is_some_and(|since| summary.at < since) {
        return Ok(Recorded::Before);
    }
    stored.me = Some(Player {
        puuid: me.puuid.clone(),
        name: riot_id(&me.game_name, &me.tag_line, ""),
        icon: me.profile_icon_id,
    });
    let mut tracked: HashSet<String> = stored.friends.iter().cloned().collect();
    tracked.insert(me.puuid.clone());
    let have: HashSet<(u64, String)> = stored
        .games
        .iter()
        .map(|e| (e.game_id, e.puuid.clone()))
        .collect();
    let mut added = false;
    for entry in entries(&summary, &tracked, &champions, &friends, true) {
        if !have.contains(&(entry.game_id, entry.puuid.clone())) {
            stored.games.push(entry);
            added = true;
        }
    }
    let due = take_card(&mut stored, summary.game_id);
    stored.games.sort_by_key(|e| std::cmp::Reverse(e.at));
    stored.games.truncate(MAX_ENTRIES);
    add_augments(lcu, &mut stored).await;
    save(&state.path, &stored)?;
    if added {
        let _ = app.emit("aram-updated", ());
    }
    Ok(if due {
        Recorded::Card(JustPlayed {
            game_id: summary.game_id,
            puuid: me.puuid,
        })
    } else {
        Recorded::Shown
    })
}

/// The user's newest game that ended after `ended_after` (ms) and has no card yet: its card is
/// marked as shown and due now.
async fn claim_card(app: &AppHandle, ended_after: u64) -> Result<Option<JustPlayed>, String> {
    let state = app.state::<AramState>();
    let _guard = state.lock.lock().await;
    let mut stored = load(&state.path)?;
    let Some(me) = stored.me.as_ref().map(|m| m.puuid.clone()) else {
        return Ok(None);
    };
    let newest = stored
        .games
        .iter()
        .filter(|e| e.puuid == me && !stored.carded.contains(&e.game_id))
        .filter(|e| e.at + u64::from(e.seconds) * 1000 >= ended_after)
        .filter(|e| stored.since.is_none_or(|since| e.at >= since))
        .max_by_key(|e| e.at)
        .map(|e| e.game_id);
    let Some(game_id) = newest else {
        return Ok(None);
    };
    take_card(&mut stored, game_id);
    save(&state.path, &stored)?;
    Ok(Some(JustPlayed { game_id, puuid: me }))
}

/// A game of the user that ended in the last half hour without a card (blank. was not running at
/// its end, or the end went unnoticed) gets it now.
pub(super) async fn catch_up(app: &AppHandle) {
    match claim_card(app, now_ms().saturating_sub(CATCH_UP_MS)).await {
        Ok(Some(played)) => {
            let _ = app.emit("aram-result", played);
        }
        Ok(None) => {}
        Err(error) => crate::errors::record("ARAM", &error.to_string()),
    }
}

/// A little later the history has the game: its exact values replace the end-of-game ones.
fn finish_later(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FINISH_AFTER).await;
        if let Err(error) = sync_in_background(&app).await {
            crate::errors::record("ARAM", &error.to_string());
        }
    });
}

/// A sync without the page (after a game, when the client opens): the user and the new results.
async fn sync_in_background(app: &AppHandle) -> Result<(Option<String>, Vec<Entry>), String> {
    let state = app.state::<AramState>();
    if !state.path.is_file() {
        return Ok((None, Vec::new()));
    }
    let _guard = state.lock.lock().await;
    let Some(lcu) = Lcu::connect()? else {
        return Ok((None, Vec::new()));
    };
    let mut stored = load(&state.path)?;
    let friends = stored.friends.clone();
    let (_, added) = sync(app, &lcu, &mut stored, &friends).await?;
    save(&state.path, &stored)?;
    website::enqueue(app);
    if !added.is_empty() {
        let _ = app.emit("aram-updated", ());
    }
    Ok((stored.me.map(|me| me.puuid), added))
}
