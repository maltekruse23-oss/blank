//! ARAM Mayhem leaderboard (user's wish: the best games of the user and three friends, with a
//! ranking by damage and more). Riot's public web API does not serve ARAM Mayhem (403), so the
//! games come from the League client on this PC, read-only: its port and password from the
//! lockfile stay in Rust, requests go only to 127.0.0.1 and only to the fixed GET paths below;
//! nothing in the client is changed, the game itself is never touched. The games are kept in
//! aram.json next to twitch.json, for good (user's choice); friends' games are read the way the
//! client shows their profile.
//!
//! The client gives out only the last 20 games of a player (measured: other ranges return the
//! same 20), so besides the page itself a sync also follows the end of each game and the opening
//! of the client (`league_seen`, from the process list pc.rs reads anyway) – once the page was
//! used at least once (aram.json exists).
//!
//! The card right after a game (user's report: it came too late): when a Mayhem game starts, its
//! id is noted and the end of the game process is awaited (Windows reports it, no polling); then
//! the end-of-game screen's stats (all ten players, there at once) go into the collection, marked
//! provisional until the history has the game, and the app shows the card. Friends of the user in
//! the same game come along for the comparison (user's wish).

use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

#[path = "aram_archive.rs"]
mod archive;
#[path = "aram_live.rs"]
pub mod live;
#[path = "aram_website.rs"]
pub mod website;

mod after_game;
mod client;
mod games;
pub mod offers;
mod validate;

pub use after_game::league_seen;
use after_game::{add_noted_skins, catch_up};
pub use client::client_open;
use client::{base64, lockfile, parse_lockfile, valid_puuid, Lcu};
use games::{
    champion_names, entries, friend_set, from_history, rarity, replace_keeping_skin, riot_id,
    ChatFriend, CherryAugment, Game, History, Summoner,
};
use validate::{quality, valid_entry, DAY_MS, PLAUSIBLE_FROM};

/// Queue of ARAM: Mayhem (the only mode that counts, user's choice).
const MAYHEM_QUEUE: i64 = 2400;
/// The client's history: the last 20 games, whatever range is asked for.
const HISTORY: &str = "begIndex=0&endIndex=20";
/// Friends in the leaderboard: with the user ten, as many as in one game (user's wish: more).
const MAX_FRIENDS: usize = 9;
/// Upper bound for the collection (years of games for four players).
const MAX_ENTRIES: usize = 20_000;
const MAX_ICON_BYTES: usize = 64 * 1024;
const CLIENT_EXE: &str = "LeagueClientUx.exe";
/// Lowercase, as pc.rs lists executables.
pub const GAME_EXE_LOWER: &str = "league of legends.exe";
pub const CLIENT_EXE_LOWER: &str = "leagueclientux.exe";
/// After a game its result reaches the history a little later: looks again after these waits
/// (about two minutes in all), until the game is there. A freshly opened client needs a moment.
const AFTER_GAME: [Duration; 5] = [
    Duration::from_secs(10),
    Duration::from_secs(15),
    Duration::from_secs(20),
    Duration::from_secs(30),
    Duration::from_secs(45),
];
const AFTER_CLIENT_START: Duration = Duration::from_secs(45);
const NOT_OPEN: &str = "Der League-Client ist nicht geöffnet.";
/// As the process list names the game (program_pids compares without case).
const GAME_EXE: &str = "League of Legends.exe";
const SESSION: &str = "/lol-gameflow/v1/session";
const SUMMONER: &str = "/lol-summoner/v1/current-summoner";
const FRIENDS: &str = "/lol-chat/v1/friends";
const CHAMPIONS: &str = "/lol-game-data/assets/v1/champion-summary.json";
/// The end-of-game screen's stats; asked once a second for at most a minute after the game.
const EOG: &str = "/lol-end-of-game/v1/eog-stats-block";
const EOG_TRIES: u32 = 60;
/// Then the history's exact values replace the end-of-game ones.
const FINISH_AFTER: Duration = Duration::from_secs(150);
/// Cards remembered as shown (enough for months of games).
const MAX_CARDED: usize = 300;
/// A game of the user that ended this recently and has no card yet gets it at the next look
/// (blank. was not running at its end, or its end was not noticed).
const CATCH_UP_MS: u64 = 30 * 60 * 1000;
/// Members of a group (with the user ten, as in one game).
const MAX_MEMBERS: usize = 10;

/// One player's result in one game.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    game_id: u64,
    /// Start of the game, milliseconds since 1970.
    at: u64,
    seconds: u32,
    /// Patch of the game ("16.19"), for the item pictures of that time.
    patch: String,
    puuid: String,
    /// Riot ID at the time of the game ("Name#TAG").
    name: String,
    champion_id: i64,
    /// Data Dragon name of the champion ("MonkeyKing"), for its pictures.
    champion: String,
    /// Shown name ("Wukong").
    champion_name: String,
    win: bool,
    kills: u32,
    deaths: u32,
    assists: u32,
    /// Damage to champions.
    damage: u64,
    taken: u64,
    healed: u64,
    shielded: u64,
    gold: u64,
    level: u32,
    items: Vec<u32>,
    augments: Vec<u32>,
    /// Place of this damage among all players of the game (1 = most).
    damage_rank: u32,
    /// Share of the team's damage to champions, 0–1.
    team_share: f64,
    multikill: u32,
    pentas: u32,
    /** The values below came later (details): None for games stored before, until fetched again. */
    #[serde(default)]
    details: Option<Details>,
    /// Friends of the user in the same game (League friend list or leaderboard), for the card.
    #[serde(default)]
    with: Vec<Mate>,
    /// From the end-of-game screen: the history's exact values replace it once it has the game.
    #[serde(default)]
    provisional: bool,
    /// The skin played (its number, 0 = the base look), for the card's splash art (user's wish);
    /// None when the client did not tell it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    skin: Option<u32>,
    /// All ten players' values of the game, without names (the rank mode compares with everyone in
    /// the game); empty for games stored before, until fetched again.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    lobby: Vec<Seat>,
}

/// One player of a game for the comparison with everyone: values only, no name or PUUID.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Seat {
    /// The player of the entry.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    you: bool,
    team: i64,
    champion_id: i64,
    kills: u32,
    deaths: u32,
    assists: u32,
    damage: u64,
    taken: u64,
    mitigated: u64,
    healed: u64,
    shielded: u64,
    gold: u64,
}

/// Skin numbers go up to about a hundred (chromas included).
const MAX_SKIN: u32 = 999;

/// A friend of the user in the same game, for the comparison on the card.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Mate {
    puuid: String,
    name: String,
    champion: String,
    champion_name: String,
    damage: u64,
    kills: u32,
    deaths: u32,
    assists: u32,
    /// In the same team as the player of the entry.
    same_team: bool,
}

/// More of a player's values in a game, for the leaderboard's categories.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Details {
    /// Magic damage to champions ("AP").
    magic: u64,
    /// Physical damage to champions ("AD").
    physical: u64,
    /// True damage to champions.
    true_damage: u64,
    /// Damage the champion's own defences took off.
    mitigated: u64,
    doubles: u32,
    triples: u32,
    quadras: u32,
    largest_crit: u32,
    /// Seconds others were under the player's crowd control.
    cc_seconds: u32,
    largest_spree: u32,
    turret_damage: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Player {
    puuid: String,
    name: String,
    icon: i64,
}

/// An augment of ARAM Mayhem: name, rarity and its small icon from the client (as data URL, so
/// it shows without the client and without another server).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Augment {
    name: String,
    /// "prismatic", "gold", "silver" or "".
    rarity: String,
    icon: Option<String>,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct Stored {
    version: u32,
    me: Option<Player>,
    games: Vec<Entry>,
    synced_at: Option<u64>,
    /// The friends of the last sync from the page, for the syncs after a game.
    #[serde(default)]
    friends: Vec<String>,
    #[serde(default)]
    augments: HashMap<u32, Augment>,
    /// Started anew at this moment (ms): only games that began later count (user's wish).
    #[serde(default)]
    since: Option<u64>,
    /// Games whose card was shown (newest last): every game gets exactly one card, whichever
    /// look found it first (user's report: not after every game).
    #[serde(default)]
    carded: Vec<u64>,
}

/// Marks a game's card as shown; false if it was shown before.
fn take_card(stored: &mut Stored, game_id: u64) -> bool {
    if stored.carded.contains(&game_id) {
        return false;
    }
    stored.carded.push(game_id);
    let over = stored.carded.len().saturating_sub(MAX_CARDED);
    stored.carded.drain(..over);
    true
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AramData {
    /// The League client is open (games can be fetched).
    client: bool,
    me: Option<Player>,
    games: Vec<Entry>,
    synced_at: Option<u64>,
    augments: HashMap<u32, Augment>,
    since: Option<u64>,
    /// Players whose match history the client did not give out this time.
    missing: Vec<String>,
}

pub struct AramState {
    path: PathBuf,
    /// One sync at a time.
    lock: tokio::sync::Mutex<()>,
}

impl AramState {
    pub fn new(app: &AppHandle) -> tauri::Result<Self> {
        Ok(Self {
            path: app.path().app_config_dir()?.join("aram.json"),
            lock: tokio::sync::Mutex::new(()),
        })
    }
}

// --- Stored games ---

const DAMAGED: &str =
    "Die gespeicherten ARAM-Spiele sind beschädigt – es wird nichts überschrieben.";

fn load(path: &Path) -> Result<Stored, String> {
    match std::fs::read_to_string(path) {
        Ok(text) => serde_json::from_str(&text).map_err(|_| DAMAGED.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Stored::default()),
        Err(error) => Err(format!("ARAM-Spiele nicht lesbar: {error}")),
    }
}

/// Writes to a temporary file first, so a crash never leaves a half-written collection.
fn save(path: &Path, stored: &Stored) -> Result<(), String> {
    let failed = |error: std::io::Error| format!("ARAM-Spiele nicht speicherbar: {error}");
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(failed)?;
    }
    let json = serde_json::to_string(stored).map_err(|e| e.to_string())?;
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, json).map_err(failed)?;
    std::fs::rename(&temp, path).map_err(failed)
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

/// Fetches new Mayhem games of the user and the friends; returns the players whose history the
/// client did not give out, and the new results.
async fn sync(
    app: &AppHandle,
    lcu: &Lcu,
    stored: &mut Stored,
    friends: &[String],
) -> Result<(Vec<String>, Vec<Entry>), String> {
    let me: Summoner = lcu.get(SUMMONER).await?;
    if !valid_puuid(&me.puuid) {
        return Err("Im League-Client ist niemand angemeldet.".into());
    }
    stored.me = Some(Player {
        puuid: me.puuid.clone(),
        name: riot_id(&me.game_name, &me.tag_line, ""),
        icon: me.profile_icon_id,
    });
    let mut tracked = vec![me.puuid.clone()];
    for friend in friends.iter().filter(|f| valid_puuid(f)) {
        if !tracked.contains(friend) && tracked.len() <= MAX_FRIENDS {
            tracked.push(friend.clone());
        }
    }
    let have: HashSet<(u64, String)> = stored
        .games
        .iter()
        .map(|e| (e.game_id, e.puuid.clone()))
        .collect();
    // Stored before the details or the whole game's values existed, or from the end-of-game
    // screen: fetched again while the client still has them.
    let without_details: HashSet<(u64, String)> = stored
        .games
        .iter()
        .filter(|e| e.details.is_none() || e.lobby.is_empty() || e.provisional)
        .map(|e| (e.game_id, e.puuid.clone()))
        .collect();
    let mut wanted: Vec<u64> = Vec::new();
    let mut missing = Vec::new();
    let mut added = Vec::new();
    for puuid in &tracked {
        let path = format!("/lol-match-history/v1/products/lol/{puuid}/matches?{HISTORY}");
        let games = match lcu.get::<History>(&path).await {
            Ok(history) => history.games.games,
            Err(error) if puuid == &me.puuid => return Err(error),
            Err(_) => {
                missing.push(puuid.clone());
                continue;
            }
        };
        let since = stored.since.unwrap_or(0);
        for game in games
            .iter()
            .filter(|g| g.queue_id == MAYHEM_QUEUE && g.game_creation >= since)
        {
            let key = (game.game_id, puuid.clone());
            if (!have.contains(&key) || without_details.contains(&key))
                && !wanted.contains(&game.game_id)
            {
                wanted.push(game.game_id);
            }
        }
    }
    if !wanted.is_empty() {
        let champions = champion_names(lcu).await;
        let friends = friend_set(lcu).await;
        let tracked: HashSet<String> = tracked.into_iter().collect();
        for id in wanted {
            let Ok(raw) = lcu
                .get_bytes(&format!("/lol-match-history/v1/games/{id}"))
                .await
            else {
                continue;
            };
            let Ok(game) = serde_json::from_slice::<Game>(&raw) else {
                continue;
            };
            if game.queue_id != MAYHEM_QUEUE {
                continue;
            }
            // Keep the complete response before reducing it to ranking entries; only with the
            // upload allowed, and a failing archive never stops the ranking.
            if website::enabled(app) {
                if let Err(error) = archive::capture(app, &raw) {
                    website::publish(app, |s| s.error = Some(error));
                }
            }
            let mut summary = from_history(&game);
            add_noted_skins(&mut summary);
            for entry in entries(&summary, &tracked, &champions, &friends, false) {
                let key = (entry.game_id, entry.puuid.clone());
                if !have.contains(&key) {
                    added.push(entry.clone());
                    stored.games.push(entry);
                } else if without_details.contains(&key) {
                    if let Some(old) = stored
                        .games
                        .iter_mut()
                        .find(|e| e.game_id == entry.game_id && e.puuid == entry.puuid)
                    {
                        replace_keeping_skin(old, entry);
                    }
                }
            }
        }
        stored.games.sort_by_key(|e| std::cmp::Reverse(e.at));
        stored.games.truncate(MAX_ENTRIES);
    }
    add_augments(lcu, stored).await;
    stored.version = 3;
    stored.synced_at = Some(now_ms());
    Ok((missing, added))
}

/// Name, rarity and icon of augments seen in games for the first time.
async fn add_augments(lcu: &Lcu, stored: &mut Stored) {
    let new: HashSet<u32> = stored
        .games
        .iter()
        .flat_map(|e| e.augments.iter().copied())
        .filter(|id| !stored.augments.contains_key(id))
        .collect();
    if new.is_empty() {
        return;
    }
    let Ok(list) = lcu
        .get::<Vec<CherryAugment>>("/lol-game-data/assets/v1/cherry-augments.json")
        .await
    else {
        return;
    };
    for augment in list.into_iter().filter(|a| new.contains(&a.id)) {
        let icon = lcu.icon(&augment.icon).await;
        stored.augments.insert(
            augment.id,
            Augment {
                name: augment.name.chars().take(80).collect(),
                rarity: rarity(&augment.rarity).to_string(),
                icon,
            },
        );
    }
}

fn data(stored: Stored, client: bool, missing: Vec<String>) -> AramData {
    AramData {
        client,
        me: stored.me,
        games: stored.games,
        synced_at: stored.synced_at,
        augments: stored.augments,
        since: stored.since,
        missing,
    }
}

/// The stored games, and whether the client is open; asks the client nothing.
#[tauri::command]
pub async fn aram_data(state: tauri::State<'_, AramState>) -> Result<AramData, String> {
    let _guard = state.lock.lock().await;
    Ok(data(load(&state.path)?, lockfile().is_some(), Vec::new()))
}

/// Fetches new games from the League client (the user's and those of up to three friends).
#[tauri::command]
pub async fn aram_sync(
    app: AppHandle,
    state: tauri::State<'_, AramState>,
    friends: Vec<String>,
) -> Result<AramData, String> {
    let result = {
        let _guard = state.lock.lock().await;
        let mut stored = load(&state.path)?;
        let Some(lcu) = Lcu::connect()? else {
            return Ok(data(stored, false, Vec::new()));
        };
        // The user is always fetched; a group's list of members includes them.
        let me = stored.me.as_ref().map(|m| m.puuid.clone());
        stored.friends = friends
            .into_iter()
            .filter(|f| valid_puuid(f) && Some(f) != me.as_ref())
            .take(MAX_FRIENDS)
            .collect();
        let friends = stored.friends.clone();
        let (missing, _) = sync(&app, &lcu, &mut stored, &friends).await?;
        save(&state.path, &stored)?;
        data(stored, true, missing)
    };
    catch_up(&app).await;
    website::enqueue(&app);
    Ok(result)
}

/// A group's start (ms, from its code's reset; None: no group): only games that began later
/// count and are fetched. The collection itself stays (leaving the group keeps it).
#[tauri::command]
pub async fn aram_set_since(
    app: AppHandle,
    state: tauri::State<'_, AramState>,
    since: Option<u64>,
) -> Result<AramData, String> {
    if since.is_some_and(|s| !(PLAUSIBLE_FROM..=now_ms() + DAY_MS).contains(&s)) {
        return Err("Ungültiger Startzeitpunkt".into());
    }
    let _guard = state.lock.lock().await;
    let mut stored = load(&state.path)?;
    if stored.since != since {
        stored.since = since;
        save(&state.path, &stored)?;
        let _ = app.emit("aram-updated", ());
    }
    Ok(data(stored, lockfile().is_some(), Vec::new()))
}

/// Games of the group's members from the other members' apps (src/adapters/aramGroup.ts): each
/// strictly checked, only for `members`, only after the start. A game already here is replaced
/// only by a better version of itself (exact history values instead of the end-of-game screen's,
/// or with the later values). Returns how many changed.
#[tauri::command]
pub async fn aram_merge(
    app: AppHandle,
    state: tauri::State<'_, AramState>,
    entries: Vec<Entry>,
    members: Vec<String>,
) -> Result<usize, String> {
    let members: HashSet<String> = members
        .into_iter()
        .filter(|m| valid_puuid(m))
        .take(MAX_MEMBERS)
        .collect();
    let _guard = state.lock.lock().await;
    let mut stored = load(&state.path)?;
    let mut changed = 0;
    for entry in entries.into_iter().take(2_000) {
        if !members.contains(&entry.puuid)
            || !valid_entry(&entry)
            || stored.since.is_some_and(|since| entry.at < since)
        {
            continue;
        }
        match stored
            .games
            .iter_mut()
            .find(|e| e.game_id == entry.game_id && e.puuid == entry.puuid)
        {
            Some(old) if quality(&entry) > quality(old) => {
                replace_keeping_skin(old, entry);
                changed += 1;
            }
            Some(_) => {}
            None => {
                stored.games.push(entry);
                changed += 1;
            }
        }
    }
    if changed > 0 {
        stored.games.sort_by_key(|e| std::cmp::Reverse(e.at));
        stored.games.truncate(MAX_ENTRIES);
        save(&state.path, &stored)?;
        let _ = app.emit("aram-updated", ());
    }
    website::enqueue(&app);
    Ok(changed)
}

/// Starts the leaderboard anew (user's wish): all games go, only games from now on count. The
/// icons of augments stay (no games in them), the user and the friends too.
#[tauri::command]
pub async fn aram_reset(state: tauri::State<'_, AramState>) -> Result<AramData, String> {
    let _guard = state.lock.lock().await;
    let mut stored = load(&state.path)?;
    stored.games.clear();
    stored.since = Some(now_ms());
    stored.synced_at = None;
    stored.version = 3;
    save(&state.path, &stored)?;
    Ok(data(stored, lockfile().is_some(), Vec::new()))
}

/// The friend list of the League client, to choose from.
#[tauri::command]
pub async fn aram_friends() -> Result<Vec<Player>, String> {
    let lcu = Lcu::connect()?.ok_or(NOT_OPEN)?;
    let friends: Vec<ChatFriend> = lcu.get("/lol-chat/v1/friends").await?;
    let mut list: Vec<Player> = friends
        .into_iter()
        .filter(|f| valid_puuid(&f.puuid))
        .map(|f| Player {
            name: riot_id(&f.game_name, &f.game_tag, &f.name),
            puuid: f.puuid,
            icon: f.icon,
        })
        .filter(|p| !p.name.is_empty())
        .collect();
    list.sort_by_key(|p| p.name.to_lowercase());
    list.dedup_by(|a, b| a.puuid == b.puuid);
    Ok(list)
}

#[cfg(test)]
#[path = "aram_lcu_probe.rs"]
mod lcu_probe;

#[cfg(test)]
mod tests;
