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
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};

use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

#[path = "aram_archive.rs"]
mod archive;
#[path = "aram_live.rs"]
pub mod live;
#[path = "aram_website.rs"]
pub mod website;

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

// --- The League client ---

/// Port and password from the client's lockfile ("LeagueClient:pid:port:password:https").
fn parse_lockfile(text: &str) -> Option<(u16, String)> {
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

/// The lockfile next to the running client (it exists only while the client runs).
fn lockfile() -> Option<PathBuf> {
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
fn valid_puuid(puuid: &str) -> bool {
    (30..=100).contains(&puuid.len())
        && puuid
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

struct Lcu {
    http: reqwest::Client,
    base: String,
    password: String,
}

impl Lcu {
    /// None while the client is closed.
    fn connect() -> Result<Option<Self>, String> {
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

    async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T, String> {
        serde_json::from_slice(&self.get_bytes(path).await?)
            .map_err(|_| "Unerwartete Antwort des League-Clients.".to_string())
    }

    async fn get_bytes(&self, path: &str) -> Result<Vec<u8>, String> {
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
    async fn icon(&self, path: &str) -> Option<String> {
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
fn icon_path(path: &str) -> bool {
    path.starts_with("/lol-game-data/assets/")
        && path.ends_with(".png")
        && !path.contains("..")
        && path.len() <= 200
        && path
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '_' | '-' | '.'))
}

fn base64(bytes: &[u8]) -> String {
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

// --- What the client sends (only the parts used) ---

#[derive(Deserialize)]
struct CherryAugment {
    id: u32,
    #[serde(default, rename = "nameTRA")]
    name: String,
    #[serde(default)]
    rarity: String,
    #[serde(default, rename = "augmentSmallIconPath")]
    icon: String,
}

fn rarity(value: &str) -> &'static str {
    match value {
        "kPrismatic" => "prismatic",
        "kGold" => "gold",
        "kSilver" => "silver",
        _ => "",
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Summoner {
    #[serde(default)]
    puuid: String,
    #[serde(default)]
    game_name: String,
    #[serde(default)]
    tag_line: String,
    #[serde(default)]
    profile_icon_id: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatFriend {
    #[serde(default)]
    puuid: String,
    #[serde(default)]
    game_name: String,
    #[serde(default)]
    game_tag: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    icon: i64,
}

#[derive(Deserialize)]
struct History {
    games: HistoryGames,
}

#[derive(Deserialize)]
struct HistoryGames {
    #[serde(default)]
    games: Vec<HistoryGame>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HistoryGame {
    game_id: u64,
    #[serde(default)]
    queue_id: i64,
    #[serde(default)]
    game_creation: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Game {
    game_id: u64,
    #[serde(default)]
    game_creation: u64,
    #[serde(default)]
    game_duration: u64,
    #[serde(default)]
    queue_id: i64,
    #[serde(default)]
    game_version: String,
    #[serde(default)]
    participant_identities: Vec<Identity>,
    #[serde(default)]
    participants: Vec<Participant>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Identity {
    participant_id: i64,
    player: IdentityPlayer,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IdentityPlayer {
    #[serde(default)]
    puuid: String,
    #[serde(default)]
    game_name: String,
    #[serde(default)]
    tag_line: String,
    #[serde(default)]
    summoner_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Participant {
    participant_id: i64,
    #[serde(default)]
    team_id: i64,
    #[serde(default)]
    champion_id: i64,
    stats: Stats,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct Stats {
    win: bool,
    kills: u32,
    deaths: u32,
    assists: u32,
    total_damage_dealt_to_champions: u64,
    total_damage_taken: u64,
    total_heal: u64,
    total_damage_shielded_on_teammates: u64,
    gold_earned: u64,
    champ_level: u32,
    item0: u32,
    item1: u32,
    item2: u32,
    item3: u32,
    item4: u32,
    item5: u32,
    item6: u32,
    largest_multi_kill: u32,
    penta_kills: u32,
    magic_damage_dealt_to_champions: u64,
    physical_damage_dealt_to_champions: u64,
    true_damage_dealt_to_champions: u64,
    damage_self_mitigated: u64,
    double_kills: u32,
    triple_kills: u32,
    quadra_kills: u32,
    largest_critical_strike: u32,
    #[serde(rename = "timeCCingOthers")]
    time_ccing_others: u32,
    largest_killing_spree: u32,
    damage_dealt_to_turrets: u64,
    player_augment1: u32,
    player_augment2: u32,
    player_augment3: u32,
    player_augment4: u32,
    player_augment5: u32,
    player_augment6: u32,
}

#[derive(Deserialize)]
struct Champion {
    id: i64,
    #[serde(default)]
    name: String,
    #[serde(default)]
    alias: String,
}

fn riot_id(game_name: &str, tag: &str, fallback: &str) -> String {
    match (game_name.is_empty(), tag.is_empty()) {
        (false, false) => format!("{game_name}#{tag}"),
        (false, true) => game_name.to_string(),
        _ => fallback.to_string(),
    }
}

/// "16.19.712.1234" → "16.19".
fn patch(version: &str) -> String {
    version.split('.').take(2).collect::<Vec<_>>().join(".")
}

/// One player of a game, from the history or from the end-of-game screen.
#[derive(Default, Clone)]
struct Line {
    /// The skin played, if the source tells it.
    skin: Option<u32>,
    puuid: String,
    name: String,
    team: i64,
    champion_id: i64,
    win: bool,
    kills: u32,
    deaths: u32,
    assists: u32,
    damage: u64,
    taken: u64,
    healed: u64,
    shielded: u64,
    gold: u64,
    level: u32,
    items: Vec<u32>,
    augments: Vec<u32>,
    multikill: u32,
    pentas: u32,
    details: Details,
}

/// A game with all its players, whatever the source.
struct Summary {
    game_id: u64,
    at: u64,
    seconds: u32,
    patch: String,
    players: Vec<Line>,
}

fn from_history(game: &Game) -> Summary {
    // Older games give the length in milliseconds.
    let seconds = if game.game_duration > 36_000 {
        game.game_duration / 1000
    } else {
        game.game_duration
    };
    let players = game
        .participant_identities
        .iter()
        .filter_map(|identity| {
            let p = game
                .participants
                .iter()
                .find(|p| p.participant_id == identity.participant_id)?;
            let s = &p.stats;
            let player = &identity.player;
            Some(Line {
                skin: None,
                puuid: player.puuid.clone(),
                name: riot_id(&player.game_name, &player.tag_line, &player.summoner_name),
                team: p.team_id,
                champion_id: p.champion_id,
                win: s.win,
                kills: s.kills,
                deaths: s.deaths,
                assists: s.assists,
                damage: s.total_damage_dealt_to_champions,
                taken: s.total_damage_taken,
                healed: s.total_heal,
                shielded: s.total_damage_shielded_on_teammates,
                gold: s.gold_earned,
                level: s.champ_level,
                items: [
                    s.item0, s.item1, s.item2, s.item3, s.item4, s.item5, s.item6,
                ]
                .into_iter()
                .filter(|item| *item != 0)
                .collect(),
                augments: [
                    s.player_augment1,
                    s.player_augment2,
                    s.player_augment3,
                    s.player_augment4,
                    s.player_augment5,
                    s.player_augment6,
                ]
                .into_iter()
                .filter(|augment| *augment != 0)
                .collect(),
                multikill: s.largest_multi_kill,
                pentas: s.penta_kills,
                details: Details {
                    magic: s.magic_damage_dealt_to_champions,
                    physical: s.physical_damage_dealt_to_champions,
                    true_damage: s.true_damage_dealt_to_champions,
                    mitigated: s.damage_self_mitigated,
                    doubles: s.double_kills,
                    triples: s.triple_kills,
                    quadras: s.quadra_kills,
                    largest_crit: s.largest_critical_strike,
                    cc_seconds: s.time_ccing_others,
                    largest_spree: s.largest_killing_spree,
                    turret_damage: s.damage_dealt_to_turrets,
                },
            })
        })
        .collect();
    Summary {
        game_id: game.game_id,
        at: game.game_creation,
        seconds: seconds.min(u32::MAX as u64) as u32,
        patch: patch(&game.game_version),
        players,
    }
}

/// The end-of-game screen: its own shape, stats by upper-case names.
#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct Eog {
    game_id: u64,
    /// Seconds.
    game_length: u64,
    teams: Vec<EogTeam>,
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct EogTeam {
    team_id: i64,
    is_winning_team: bool,
    players: Vec<EogPlayer>,
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct EogPlayer {
    puuid: String,
    riot_id_game_name: String,
    riot_id_tag_line: String,
    summoner_name: String,
    champion_id: i64,
    team_id: i64,
    level: u32,
    items: Vec<i64>,
    stats: HashMap<String, serde_json::Value>,
    /// Pictures of the skin played; their path names the skin.
    skin_splash_path: String,
    skin_tile_path: String,
}

/// The skin's number from a picture path of the client: ".../Skins/Skin14/...", ".../Skins/Base/..."
/// (0) or ".../champion-splashes/103/103014.jpg" (champion id × 1000 + number).
fn skin_from_path(path: &str, champion_id: i64) -> Option<u32> {
    let lower = path.to_ascii_lowercase();
    if lower.contains("/skins/base/") {
        return Some(0);
    }
    let digits = |text: &str| -> Option<u64> {
        let end = text
            .find(|c: char| !c.is_ascii_digit())
            .unwrap_or(text.len());
        text[..end].parse().ok()
    };
    if let Some(at) = lower.find("/skins/skin") {
        return digits(&lower[at + "/skins/skin".len()..])
            .filter(|n| *n <= u64::from(MAX_SKIN))
            .map(|n| n as u32);
    }
    if let Some(at) = lower.find("/champion-splashes/") {
        let file = lower[at..].rsplit('/').next()?;
        let id = digits(file)?;
        let champion = u64::try_from(champion_id).ok()?;
        return (id / 1000 == champion && id % 1000 <= u64::from(MAX_SKIN))
            .then_some((id % 1000) as u32);
    }
    None
}

fn from_eog(eog: &Eog, now: u64) -> Summary {
    let players = eog
        .teams
        .iter()
        .flat_map(|team| team.players.iter().map(move |p| (team, p)))
        .map(|(team, p)| {
            let n = |key: &str| {
                p.stats
                    .get(key)
                    .and_then(serde_json::Value::as_f64)
                    .unwrap_or(0.0)
                    .max(0.0)
            };
            let big = |key: &str| n(key).round() as u64;
            let small = |key: &str| n(key).round().min(u32::MAX as f64) as u32;
            Line {
                skin: skin_from_path(&p.skin_splash_path, p.champion_id)
                    .or_else(|| skin_from_path(&p.skin_tile_path, p.champion_id)),
                puuid: p.puuid.clone(),
                name: riot_id(&p.riot_id_game_name, &p.riot_id_tag_line, &p.summoner_name),
                team: if p.team_id != 0 {
                    p.team_id
                } else {
                    team.team_id
                },
                champion_id: p.champion_id,
                win: team.is_winning_team || n("WIN") > 0.0,
                kills: small("CHAMPIONS_KILLED"),
                deaths: small("NUM_DEATHS"),
                assists: small("ASSISTS"),
                damage: big("TOTAL_DAMAGE_DEALT_TO_CHAMPIONS"),
                taken: big("TOTAL_DAMAGE_TAKEN"),
                healed: big("TOTAL_HEAL"),
                shielded: 0,
                gold: big("GOLD_EARNED"),
                level: if p.level > 0 { p.level } else { small("LEVEL") },
                items: p
                    .items
                    .iter()
                    .filter(|item| **item > 0 && **item <= u32::MAX as i64)
                    .map(|item| *item as u32)
                    .collect(),
                augments: (1..=6)
                    .map(|i| small(&format!("PLAYER_AUGMENT_{i}")))
                    .filter(|augment| *augment != 0)
                    .collect(),
                multikill: small("LARGEST_MULTI_KILL"),
                pentas: small("PENTA_KILLS"),
                details: Details {
                    magic: big("MAGIC_DAMAGE_DEALT_TO_CHAMPIONS"),
                    physical: big("PHYSICAL_DAMAGE_DEALT_TO_CHAMPIONS"),
                    true_damage: big("TRUE_DAMAGE_DEALT_TO_CHAMPIONS"),
                    mitigated: big("TOTAL_DAMAGE_SELF_MITIGATED"),
                    doubles: small("DOUBLE_KILLS"),
                    triples: small("TRIPLE_KILLS"),
                    quadras: small("QUADRA_KILLS"),
                    largest_crit: small("LARGEST_CRITICAL_STRIKE"),
                    cc_seconds: small("TIME_CCING_OTHERS"),
                    largest_spree: small("LARGEST_KILLING_SPREE"),
                    turret_damage: big("TOTAL_DAMAGE_DEALT_TO_TURRETS"),
                },
            }
        })
        .collect();
    Summary {
        game_id: eog.game_id,
        at: now.saturating_sub(eog.game_length.saturating_mul(1000)),
        seconds: eog.game_length.min(36_000) as u32,
        // Unknown here: the item pictures take the known version until the history's values come.
        patch: String::new(),
        players,
    }
}

/// The results of the tracked players in one game, with their place in damage among all and the
/// user's friends in the same game.
fn entries(
    game: &Summary,
    tracked: &HashSet<String>,
    champions: &HashMap<i64, (String, String)>,
    friends: &HashSet<String>,
    provisional: bool,
) -> Vec<Entry> {
    let mut damages: Vec<u64> = game.players.iter().map(|p| p.damage).collect();
    damages.sort_unstable_by(|a, b| b.cmp(a));
    let team_damage = |team: i64| -> u64 {
        game.players
            .iter()
            .filter(|p| p.team == team)
            .map(|p| p.damage)
            .sum()
    };
    let champion = |id: i64| champions.get(&id).cloned().unwrap_or_default();
    game.players
        .iter()
        .filter(|p| tracked.contains(&p.puuid))
        .map(|p| {
            let (alias, champion_name) = champion(p.champion_id);
            let team = team_damage(p.team);
            let with = game
                .players
                .iter()
                .filter(|o| o.puuid != p.puuid)
                .filter(|o| friends.contains(&o.puuid) || tracked.contains(&o.puuid))
                .map(|o| {
                    let (alias, champion_name) = champion(o.champion_id);
                    Mate {
                        puuid: o.puuid.clone(),
                        name: o.name.clone(),
                        champion: alias,
                        champion_name,
                        damage: o.damage,
                        kills: o.kills,
                        deaths: o.deaths,
                        assists: o.assists,
                        same_team: o.team == p.team,
                    }
                })
                .collect();
            Entry {
                game_id: game.game_id,
                at: game.at,
                seconds: game.seconds,
                patch: game.patch.clone(),
                puuid: p.puuid.clone(),
                name: p.name.clone(),
                champion_id: p.champion_id,
                champion: alias,
                champion_name,
                win: p.win,
                kills: p.kills,
                deaths: p.deaths,
                assists: p.assists,
                damage: p.damage,
                taken: p.taken,
                healed: p.healed,
                shielded: p.shielded,
                gold: p.gold,
                level: p.level,
                items: p.items.clone(),
                augments: p.augments.clone(),
                damage_rank: damages
                    .iter()
                    .position(|d| *d == p.damage)
                    .map_or(0, |i| i as u32 + 1),
                team_share: if team == 0 {
                    0.0
                } else {
                    p.damage as f64 / team as f64
                },
                multikill: p.multikill,
                pentas: p.pentas,
                details: Some(p.details.clone()),
                with,
                provisional,
                skin: p.skin,
                lobby: game
                    .players
                    .iter()
                    .map(|o| Seat {
                        you: o.puuid == p.puuid,
                        team: o.team,
                        champion_id: o.champion_id,
                        kills: o.kills,
                        deaths: o.deaths,
                        assists: o.assists,
                        damage: o.damage,
                        taken: o.taken,
                        mitigated: o.details.mitigated,
                        healed: o.healed,
                        shielded: o.shielded,
                        gold: o.gold,
                    })
                    .collect(),
            }
        })
        .collect()
}

/// A stored game gets a new version (exact values, a better one from a friend): the skin stays if
/// the new version does not know it.
fn replace_keeping_skin(old: &mut Entry, new: Entry) {
    let skin = new.skin.or(old.skin);
    *old = new;
    old.skin = skin;
}

/// The user's League friends (for the comparison on the card).
async fn friend_set(lcu: &Lcu) -> HashSet<String> {
    lcu.get::<Vec<ChatFriend>>(FRIENDS)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|f| f.puuid)
        .filter(|p| valid_puuid(p))
        .collect()
}

async fn champion_names(lcu: &Lcu) -> HashMap<i64, (String, String)> {
    lcu.get::<Vec<Champion>>(CHAMPIONS)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|c| (c.id, (c.alias, c.name)))
        .collect()
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
struct Session {
    game_data: SessionGame,
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct SessionGame {
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

fn note_skins(game: &SessionGame) {
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
fn add_noted_skins(summary: &mut Summary) {
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
async fn catch_up(app: &AppHandle) {
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

/// How good a version of a game is: exact values with all details and the whole game, with all
/// details, exact values, the end-of-game screen's. Everyone keeps the best, so all end up with
/// the same.
fn quality(entry: &Entry) -> u8 {
    let values = match (entry.provisional, entry.details.is_some()) {
        (true, _) => 1,
        (false, false) => 2,
        (false, true) if entry.lobby.is_empty() => 3,
        (false, true) => 4,
    };
    // The same values with the skin played are a little better (so the skin reaches everyone).
    values * 2 + u8::from(entry.skin.is_some())
}

/// Games before this cannot be ARAM Mayhem results (2020), for checks of times.
const PLAUSIBLE_FROM: u64 = 1_577_836_800_000;
const DAY_MS: u64 = 24 * 60 * 60 * 1000;

fn plain_text(text: &str, max: usize) -> bool {
    text.chars().count() <= max && !text.chars().any(char::is_control)
}

fn alias(text: &str) -> bool {
    text.len() <= 40 && text.chars().all(|c| c.is_ascii_alphanumeric())
}

/// A game from another app: every value in a sane range, every text short and plain.
fn valid_entry(e: &Entry) -> bool {
    let big = 100_000_000;
    let mates_ok = e.with.len() <= MAX_MEMBERS
        && e.with.iter().all(|m| {
            valid_puuid(&m.puuid)
                && plain_text(&m.name, 40)
                && alias(&m.champion)
                && plain_text(&m.champion_name, 40)
                && m.damage <= big
                && m.kills.max(m.deaths).max(m.assists) <= 1000
        });
    let details_ok = e.details.as_ref().is_none_or(|d| {
        [
            d.magic,
            d.physical,
            d.true_damage,
            d.mitigated,
            d.turret_damage,
        ]
        .iter()
        .all(|v| *v <= big)
            && [d.doubles, d.triples, d.quadras, d.largest_spree]
                .iter()
                .all(|v| *v <= 1000)
            && d.largest_crit <= 1_000_000
            && d.cc_seconds <= 100_000
    });
    e.game_id > 0
        && e.game_id < 10_000_000_000_000
        && (PLAUSIBLE_FROM..=now_ms() + DAY_MS).contains(&e.at)
        && e.seconds <= 4 * 60 * 60
        && e.patch.len() <= 10
        && e.patch.chars().all(|c| c.is_ascii_digit() || c == '.')
        && valid_puuid(&e.puuid)
        && !e.name.is_empty()
        && plain_text(&e.name, 40)
        && (0..=100_000).contains(&e.champion_id)
        && alias(&e.champion)
        && plain_text(&e.champion_name, 40)
        && e.kills.max(e.deaths).max(e.assists) <= 1000
        && [e.damage, e.taken, e.healed, e.shielded, e.gold]
            .iter()
            .all(|v| *v <= big)
        && e.level <= 30
        && e.items.len() <= 7
        && e.items.iter().all(|i| *i <= 1_000_000)
        && e.augments.len() <= 8
        && e.augments.iter().all(|a| *a <= 1_000_000)
        && (1..=10).contains(&e.damage_rank)
        && e.team_share.is_finite()
        && (0.0..=1.0).contains(&e.team_share)
        && e.multikill <= 5
        && e.pentas <= 100
        && e.skin.is_none_or(|skin| skin <= MAX_SKIN)
        && details_ok
        && mates_ok
        && lobby_ok(&e.lobby)
}

/// The whole game's values: at most ten players, the entry's player at most once, sane values.
fn lobby_ok(lobby: &[Seat]) -> bool {
    let big = 100_000_000;
    lobby.len() <= MAX_MEMBERS
        && lobby.iter().filter(|s| s.you).count() <= 1
        && lobby.iter().all(|s| {
            (0..=1000).contains(&s.team)
                && (0..=100_000).contains(&s.champion_id)
                && s.kills.max(s.deaths).max(s.assists) <= 1000
                && [s.damage, s.taken, s.mitigated, s.healed, s.shielded, s.gold]
                    .iter()
                    .all(|v| *v <= big)
        })
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
mod tests {
    use super::*;

    fn puuid(n: u8) -> String {
        format!("{}{}", "a".repeat(77), n)
    }

    fn game() -> Game {
        let stats = |damage: u64, win: bool| Stats {
            win,
            kills: 10,
            deaths: 2,
            assists: 20,
            total_damage_dealt_to_champions: damage,
            magic_damage_dealt_to_champions: damage / 4,
            physical_damage_dealt_to_champions: damage / 2,
            penta_kills: 1,
            time_ccing_others: 33,
            item0: 3031,
            item3: 3006,
            player_augment1: 7,
            ..Stats::default()
        };
        Game {
            game_id: 77,
            game_creation: 1_790_000_000_000,
            game_duration: 1200,
            queue_id: MAYHEM_QUEUE,
            game_version: "16.19.712.1234".into(),
            participant_identities: (1..=4)
                .map(|i| Identity {
                    participant_id: i,
                    player: IdentityPlayer {
                        puuid: puuid(i as u8),
                        game_name: format!("Spieler{i}"),
                        tag_line: "EUW".into(),
                        summoner_name: String::new(),
                    },
                })
                .collect(),
            participants: vec![
                Participant {
                    participant_id: 1,
                    team_id: 100,
                    champion_id: 10,
                    stats: stats(30_000, true),
                },
                Participant {
                    participant_id: 2,
                    team_id: 100,
                    champion_id: 62,
                    stats: stats(10_000, true),
                },
                Participant {
                    participant_id: 3,
                    team_id: 200,
                    champion_id: 10,
                    stats: stats(50_000, false),
                },
                Participant {
                    participant_id: 4,
                    team_id: 200,
                    champion_id: 10,
                    stats: stats(0, false),
                },
            ],
        }
    }

    #[test]
    fn lockfile_gives_port_and_password_only_when_valid() {
        assert_eq!(
            parse_lockfile("LeagueClient:1234:54321:aB3_-x9:https\n"),
            Some((54321, "aB3_-x9".into()))
        );
        assert_eq!(parse_lockfile("LeagueClient:1234:0:pw:https"), None);
        assert_eq!(parse_lockfile("LeagueClient:1234:54321:pw:http"), None);
        assert_eq!(parse_lockfile("LeagueClient:1234:54321:p w:https"), None);
        assert_eq!(parse_lockfile("LeagueClient:1234:54321::https"), None);
        assert_eq!(parse_lockfile("kaputt"), None);
    }

    /// One real entry of the test game, from an hour ago.
    pub(super) fn sample_entry() -> Entry {
        let tracked: HashSet<String> = [puuid(1)].into_iter().collect();
        let mut entry = entries(
            &from_history(&game()),
            &tracked,
            &HashMap::new(),
            &HashSet::new(),
            false,
        )
        .remove(0);
        entry.at = now_ms() - 60 * 60 * 1000;
        entry
    }

    #[test]
    fn every_game_gets_exactly_one_card() {
        let mut stored = Stored::default();
        assert!(take_card(&mut stored, 11));
        assert!(!take_card(&mut stored, 11));
        assert!(take_card(&mut stored, 12));
        for id in 100..(100 + MAX_CARDED as u64) {
            take_card(&mut stored, id);
        }
        // Only the newest are kept; the oldest could get a card again, but are months old.
        assert_eq!(stored.carded.len(), MAX_CARDED);
        assert!(!stored.carded.contains(&11));
    }

    #[test]
    fn games_from_other_apps_are_checked() {
        let good = sample_entry();
        assert!(valid_entry(&good));
        let mut bad = good.clone();
        bad.name = "a\u{7}b".into();
        assert!(!valid_entry(&bad));
        let mut bad = good.clone();
        bad.champion = "../x".into();
        assert!(!valid_entry(&bad));
        let mut bad = good.clone();
        bad.damage = 10_000_000_000;
        assert!(!valid_entry(&bad));
        let mut bad = good.clone();
        bad.team_share = f64::NAN;
        assert!(!valid_entry(&bad));
        let mut bad = good.clone();
        bad.at = 1_000;
        assert!(!valid_entry(&bad));
        let mut bad = good.clone();
        bad.items = vec![1; 20];
        assert!(!valid_entry(&bad));
        let mut bad = good;
        bad.puuid = "short".into();
        assert!(!valid_entry(&bad));
    }

    #[test]
    fn the_best_version_of_a_game_wins_everywhere() {
        let exact = sample_entry();
        let mut screen = exact.clone();
        screen.provisional = true;
        let mut older = exact.clone();
        older.details = None;
        let mut no_lobby = exact.clone();
        no_lobby.lobby.clear();
        assert!(quality(&exact) > quality(&no_lobby));
        assert!(quality(&no_lobby) > quality(&older));
        assert!(quality(&older) > quality(&screen));
    }

    #[test]
    fn every_game_keeps_all_players_values_without_names() {
        let entry = sample_entry();
        assert_eq!(entry.lobby.len(), 4);
        let you: Vec<&Seat> = entry.lobby.iter().filter(|s| s.you).collect();
        assert_eq!(you.len(), 1);
        assert_eq!((you[0].damage, you[0].team), (30_000, 100));
        let json = serde_json::to_string(&entry.lobby).unwrap();
        assert!(!json.contains("Spieler") && !json.contains(&puuid(2)));

        let mut bad = entry.clone();
        bad.lobby.iter_mut().for_each(|s| s.you = true);
        assert!(!valid_entry(&bad));
        let mut bad = entry.clone();
        bad.lobby[1].damage = 10_000_000_000;
        assert!(!valid_entry(&bad));
        let mut bad = entry;
        bad.lobby = vec![bad.lobby[0].clone(); 11];
        assert!(!valid_entry(&bad));
    }

    /// A full game (ten players, six items, all details, friends) still fits into one message of
    /// the group, encrypted and in Base64 (aram_group.rs: 8 KB).
    #[test]
    fn a_full_game_fits_into_a_group_message() {
        let mut entry = sample_entry();
        entry.name = "N".repeat(40);
        entry.champion_name = "C".repeat(40);
        entry.items = vec![999_999; 7];
        entry.augments = vec![999_999; 8];
        let seat = Seat {
            you: false,
            team: 200,
            champion_id: 99_999,
            kills: 999,
            deaths: 999,
            assists: 999,
            damage: 99_999_999,
            taken: 99_999_999,
            mitigated: 99_999_999,
            healed: 99_999_999,
            shielded: 99_999_999,
            gold: 99_999_999,
        };
        entry.lobby = vec![seat; 10];
        let mate = Mate {
            puuid: puuid(9),
            name: "M".repeat(40),
            champion: "A".repeat(40),
            champion_name: "B".repeat(40),
            damage: 99_999_999,
            kills: 999,
            deaths: 999,
            assists: 999,
            same_team: true,
        };
        entry.with = vec![mate; 9];
        entry.skin = Some(MAX_SKIN);
        let json = serde_json::to_string(&entry).unwrap();
        // Message frame, 12 bytes nonce + 16 tag, Base64 4/3.
        let sealed = (json.len() + 120 + 28).div_ceil(3) * 4;
        assert!(sealed < 8 * 1024, "{sealed}");
    }

    #[test]
    fn only_tracked_players_with_rank_and_share() {
        let tracked: HashSet<String> = [puuid(1), puuid(2)].into_iter().collect();
        let champions = HashMap::from([
            (10, ("Kayle".to_string(), "Kayle".to_string())),
            (62, ("MonkeyKing".to_string(), "Wukong".to_string())),
        ]);
        let friends: HashSet<String> = [puuid(3)].into_iter().collect();
        let found = entries(
            &from_history(&game()),
            &tracked,
            &champions,
            &friends,
            false,
        );
        assert_eq!(found.len(), 2);
        let first = &found[0];
        assert_eq!(first.name, "Spieler1#EUW");
        assert_eq!(first.champion, "Kayle");
        assert_eq!(first.patch, "16.19");
        assert_eq!(first.seconds, 1200);
        assert_eq!(first.damage_rank, 2);
        assert!((first.team_share - 0.75).abs() < 1e-9);
        assert_eq!(first.items, vec![3031, 3006]);
        assert_eq!(first.augments, vec![7]);
        let details = first.details.as_ref().unwrap();
        assert_eq!(
            (details.magic, details.physical, details.cc_seconds),
            (7_500, 15_000, 33)
        );
        assert_eq!(first.pentas, 1);
        // Tracked player 2 (same team) and friend 3 (other team) are in the game with player 1.
        let with: Vec<(&str, bool)> = first
            .with
            .iter()
            .map(|m| (m.name.as_str(), m.same_team))
            .collect();
        assert_eq!(with, vec![("Spieler2#EUW", true), ("Spieler3#EUW", false)]);
        assert!(!first.provisional);
        assert_eq!(found[1].champion, "MonkeyKing");
        assert_eq!(found[1].champion_name, "Wukong");
        assert_eq!(found[1].damage_rank, 3);
    }

    #[test]
    fn unknown_champion_and_empty_team_stay_harmless() {
        let tracked: HashSet<String> = [puuid(4)].into_iter().collect();
        let mut g = game();
        g.participants[2].stats.total_damage_dealt_to_champions = 0;
        let found = entries(
            &from_history(&g),
            &tracked,
            &HashMap::new(),
            &HashSet::new(),
            false,
        );
        assert_eq!(found[0].champion, "");
        assert_eq!(found[0].team_share, 0.0);
    }

    #[test]
    fn end_of_game_stats_become_provisional_entries() {
        let json = r#"{"gameId":88,"gameLength":1100,"teams":[
            {"teamId":100,"isWinningTeam":true,"players":[
                {"puuid":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1","riotIdGameName":"Spieler1","riotIdTagLine":"EUW","championId":10,"teamId":100,"items":[3031,0,3006],
                 "stats":{"TOTAL_DAMAGE_DEALT_TO_CHAMPIONS":40000,"CHAMPIONS_KILLED":12,"NUM_DEATHS":3,"ASSISTS":20,"MAGIC_DAMAGE_DEALT_TO_CHAMPIONS":30000.0,"PENTA_KILLS":1}},
                {"puuid":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2","riotIdGameName":"Freund","riotIdTagLine":"EUW","championId":62,"teamId":100,
                 "stats":{"TOTAL_DAMAGE_DEALT_TO_CHAMPIONS":10000,"CHAMPIONS_KILLED":4}}]},
            {"teamId":200,"isWinningTeam":false,"players":[
                {"puuid":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","championId":10,"teamId":200,"stats":{"TOTAL_DAMAGE_DEALT_TO_CHAMPIONS":50000}}]}]}"#;
        let eog: Eog = serde_json::from_str(json).unwrap();
        let summary = from_eog(&eog, 2_000_000);
        assert_eq!(summary.at, 2_000_000 - 1_100_000);
        let tracked: HashSet<String> = [puuid(1)].into_iter().collect();
        let friends: HashSet<String> = [puuid(2)].into_iter().collect();
        let found = entries(&summary, &tracked, &HashMap::new(), &friends, true);
        let me = &found[0];
        assert!(me.provisional && me.win);
        assert_eq!(
            (me.damage, me.kills, me.deaths, me.assists, me.pentas),
            (40_000, 12, 3, 20, 1)
        );
        assert_eq!(me.details.as_ref().unwrap().magic, 30_000);
        assert_eq!(me.items, vec![3031, 3006]);
        assert_eq!(me.damage_rank, 2);
        assert!((me.team_share - 0.8).abs() < 1e-9);
        assert_eq!(me.with.len(), 1);
        assert_eq!(
            (
                me.with[0].name.as_str(),
                me.with[0].damage,
                me.with[0].same_team
            ),
            ("Freund#EUW", 10_000, true)
        );
    }

    #[test]
    fn the_skin_played_comes_from_the_picture_paths() {
        let base = "/lol-game-data/assets/ASSETS/Characters/Ahri/Skins/Base/Images/ahri_splash.jpg";
        let skin = "/lol-game-data/assets/ASSETS/Characters/Ahri/Skins/Skin14/Images/a.jpg";
        let splash = "/lol-game-data/assets/v1/champion-splashes/103/103027.jpg";
        assert_eq!(skin_from_path(base, 103), Some(0));
        assert_eq!(skin_from_path(skin, 103), Some(14));
        assert_eq!(skin_from_path(splash, 103), Some(27));
        // Another champion's picture or nothing to read: not guessed.
        assert_eq!(skin_from_path(splash, 104), None);
        assert_eq!(skin_from_path("", 103), None);
        assert_eq!(skin_from_path("/x/Skins/Skin99999/y.jpg", 103), None);

        let json = r#"{"gameId":88,"gameLength":900,"teams":[{"teamId":100,"isWinningTeam":true,"players":[
            {"puuid":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1","championId":103,
             "skinSplashPath":"/lol-game-data/assets/v1/champion-splashes/103/103014.jpg","stats":{"TOTAL_DAMAGE_DEALT_TO_CHAMPIONS":1}},
            {"puuid":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2","championId":62,
             "stats":{"TOTAL_DAMAGE_DEALT_TO_CHAMPIONS":1}}]}]}"#;
        let mut summary = from_eog(&serde_json::from_str(json).unwrap(), 2_000_000);
        assert_eq!(summary.players[0].skin, Some(14));
        assert_eq!(summary.players[1].skin, None);
        // Noted at the start of the game (session): fills in what the screen did not tell.
        let session: Session = serde_json::from_str(
            r#"{"gameData":{"gameId":88,"queue":{"id":2400},"playerChampionSelections":[
                {"championId":62,"selectedSkinIndex":7},{"championId":103,"selectedSkinIndex":2}]}}"#,
        )
        .unwrap();
        note_skins(&session.game_data);
        add_noted_skins(&mut summary);
        assert_eq!(summary.players[0].skin, Some(14));
        assert_eq!(summary.players[1].skin, Some(7));
    }

    #[test]
    fn a_better_version_keeps_the_skin() {
        let tracked: HashSet<String> = [puuid(1)].into_iter().collect();
        let mut summary = from_history(&game());
        summary.players[0].skin = Some(5);
        let with_skin =
            entries(&summary, &tracked, &HashMap::new(), &HashSet::new(), true).remove(0);
        let exact = entries(
            &from_history(&game()),
            &tracked,
            &HashMap::new(),
            &HashSet::new(),
            false,
        )
        .remove(0);
        assert!(quality(&exact) > quality(&with_skin));
        let mut kept = with_skin.clone();
        replace_keeping_skin(&mut kept, exact.clone());
        assert_eq!(kept.skin, Some(5));
        assert!(!kept.provisional);
        // The same values with the skin are the better version.
        let mut exact_with_skin = exact.clone();
        exact_with_skin.skin = Some(5);
        assert!(quality(&exact_with_skin) > quality(&exact));
        assert!(valid_entry(&exact_with_skin));
        exact_with_skin.skin = Some(MAX_SKIN + 1);
        assert!(!valid_entry(&exact_with_skin));
    }

    #[test]
    fn icons_are_only_png_of_the_game_data() {
        assert!(icon_path(
            "/lol-game-data/assets/ASSETS/UX/Kiwi/Augments/Icons/Goldrend_small.png"
        ));
        assert!(!icon_path("/lol-game-data/assets/../../lol-login/x.png"));
        assert!(!icon_path("/lol-chat/v1/friends.png"));
        assert!(!icon_path("/lol-game-data/assets/x.json"));
        assert!(!icon_path("/lol-game-data/assets/a b.png"));
        assert!(!icon_path("/lol-game-data/assets/x.png?y=1"));
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
        assert_eq!(base64(&[0xff, 0xfe, 0x00]), "//4A");
        assert_eq!(rarity("kPrismatic"), "prismatic");
        assert_eq!(rarity("kIrgendwas"), "");
    }

    #[test]
    fn puuids_are_checked() {
        assert!(valid_puuid("3f2c9a1e-8d4b-4c7a-9e21-5b6d7f8a9c0e"));
        assert!(valid_puuid(&puuid(1)));
        assert!(!valid_puuid("kurz"));
        assert!(!valid_puuid(&format!("{}/..", "a".repeat(60))));
        assert!(!valid_puuid(&format!("{}?x=1", "a".repeat(60))));
    }

    #[test]
    fn collection_survives_a_round_trip() {
        let dir = std::env::temp_dir().join(format!("blank-aram-test-{}", std::process::id()));
        let path = dir.join("aram.json");
        let tracked: HashSet<String> = [puuid(1)].into_iter().collect();
        let stored = Stored {
            version: 1,
            me: Some(Player {
                puuid: puuid(1),
                name: "Spieler1#EUW".into(),
                icon: 29,
            }),
            games: entries(
                &from_history(&game()),
                &tracked,
                &HashMap::new(),
                &HashSet::new(),
                false,
            ),
            synced_at: Some(5),
            since: Some(7),
            carded: vec![3, 9],
            friends: vec![puuid(2)],
            augments: HashMap::from([(
                7,
                Augment {
                    name: "Goldrend".into(),
                    rarity: "prismatic".into(),
                    icon: None,
                },
            )]),
        };
        save(&path, &stored).unwrap();
        let back = load(&path).unwrap();
        assert_eq!(back.games, stored.games);
        assert_eq!(back.me, stored.me);
        assert_eq!(back.friends, stored.friends);
        assert_eq!(back.since, Some(7));
        assert_eq!(back.carded, vec![3, 9]);
        // A collection from before the reset existed reads as never reset.
        let old: Stored =
            serde_json::from_str(r#"{"version":1,"me":null,"games":[],"syncedAt":null}"#).unwrap();
        assert_eq!(old.since, None);
        assert_eq!(back.augments, stored.augments);
        std::fs::write(&path, "{kaputt").unwrap();
        assert_eq!(load(&path).err().as_deref(), Some(DAMAGED));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
