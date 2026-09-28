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

use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};

use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

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
/// Only a game that started this recently is announced as just played.
const JUST_PLAYED_MS: u64 = 3 * 60 * 60 * 1000;
const NOT_OPEN: &str = "Der League-Client ist nicht geöffnet.";

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
            .json::<T>()
            .await
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

/// The results of the tracked players in one game, with their place in damage among all.
fn entries(
    game: &Game,
    tracked: &HashSet<String>,
    champions: &HashMap<i64, (String, String)>,
) -> Vec<Entry> {
    let mut damages: Vec<u64> = game
        .participants
        .iter()
        .map(|p| p.stats.total_damage_dealt_to_champions)
        .collect();
    damages.sort_unstable_by(|a, b| b.cmp(a));
    let team_damage = |team: i64| -> u64 {
        game.participants
            .iter()
            .filter(|p| p.team_id == team)
            .map(|p| p.stats.total_damage_dealt_to_champions)
            .sum()
    };
    // Older games give the length in milliseconds.
    let seconds = if game.game_duration > 36_000 {
        game.game_duration / 1000
    } else {
        game.game_duration
    };
    game.participant_identities
        .iter()
        .filter(|identity| tracked.contains(&identity.player.puuid))
        .filter_map(|identity| {
            let p = game
                .participants
                .iter()
                .find(|p| p.participant_id == identity.participant_id)?;
            let s = &p.stats;
            let (champion, champion_name) =
                champions.get(&p.champion_id).cloned().unwrap_or_default();
            let team = team_damage(p.team_id);
            let player = &identity.player;
            Some(Entry {
                game_id: game.game_id,
                at: game.game_creation,
                seconds: seconds.min(u32::MAX as u64) as u32,
                patch: patch(&game.game_version),
                puuid: player.puuid.clone(),
                name: riot_id(&player.game_name, &player.tag_line, &player.summoner_name),
                champion_id: p.champion_id,
                champion,
                champion_name,
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
                damage_rank: damages
                    .iter()
                    .position(|d| *d == s.total_damage_dealt_to_champions)
                    .map_or(0, |i| i as u32 + 1),
                team_share: if team == 0 {
                    0.0
                } else {
                    s.total_damage_dealt_to_champions as f64 / team as f64
                },
                multikill: s.largest_multi_kill,
                pentas: s.penta_kills,
                details: Some(Details {
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
                }),
            })
        })
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
    lcu: &Lcu,
    stored: &mut Stored,
    friends: &[String],
) -> Result<(Vec<String>, Vec<Entry>), String> {
    let me: Summoner = lcu.get("/lol-summoner/v1/current-summoner").await?;
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
    // Stored before the details existed: fetched again while the client still has them.
    let without_details: HashSet<(u64, String)> = stored
        .games
        .iter()
        .filter(|e| e.details.is_none())
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
        let champions: HashMap<i64, (String, String)> = lcu
            .get::<Vec<Champion>>("/lol-game-data/assets/v1/champion-summary.json")
            .await
            .unwrap_or_default()
            .into_iter()
            .map(|c| (c.id, (c.alias, c.name)))
            .collect();
        let tracked: HashSet<String> = tracked.into_iter().collect();
        for id in wanted {
            let Ok(game) = lcu
                .get::<Game>(&format!("/lol-match-history/v1/games/{id}"))
                .await
            else {
                continue;
            };
            if game.queue_id != MAYHEM_QUEUE {
                continue;
            }
            for entry in entries(&game, &tracked, &champions) {
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
                        old.details = entry.details;
                    }
                }
            }
        }
        stored.games.sort_by(|a, b| b.at.cmp(&a.at));
        stored.games.truncate(MAX_ENTRIES);
    }
    add_augments(lcu, stored).await;
    stored.version = 2;
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

/// From pc.rs's process list (every 10 s anyway): whether the game and the client run. A game
/// that ended, or a client that just opened, starts a sync a little later – once the page was
/// used (aram.json exists). Nothing else is watched.
pub fn league_seen(app: &AppHandle, game: bool, client: bool) {
    static LAST: Mutex<(bool, bool)> = Mutex::new((false, false));
    let Ok(mut last) = LAST.lock() else {
        return;
    };
    let (had_game, had_client) = std::mem::replace(&mut *last, (game, client));
    drop(last);
    let app = app.clone();
    if had_game && !game {
        tauri::async_runtime::spawn(after_game(app));
    } else if client && !had_client {
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(AFTER_CLIENT_START).await;
            if let Err(error) = sync_in_background(&app).await {
                eprintln!("ARAM: {error}");
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
#[serde(default)]
struct SessionGame {
    queue: SessionQueue,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct SessionQueue {
    id: i64,
}

/// A game just ended: only for ARAM Mayhem (the client still knows the queue right after), look a
/// few times until it is in the history, then tell the app the user's result for the card.
async fn after_game(app: AppHandle) {
    if !app.state::<AramState>().path.is_file() {
        return;
    }
    if let Ok(Some(lcu)) = Lcu::connect() {
        if let Ok(session) = lcu.get::<Session>("/lol-gameflow/v1/session").await {
            let queue = session.game_data.queue.id;
            if queue != 0 && queue != MAYHEM_QUEUE {
                return;
            }
        }
    }
    let ended = now_ms();
    for wait in AFTER_GAME {
        tokio::time::sleep(wait).await;
        match sync_in_background(&app).await {
            Ok((me, added)) => {
                let played = added
                    .into_iter()
                    .filter(|e| Some(&e.puuid) == me.as_ref())
                    .filter(|e| ended.saturating_sub(e.at) < JUST_PLAYED_MS)
                    .max_by_key(|e| e.at);
                if let Some(entry) = played {
                    let _ = app.emit(
                        "aram-result",
                        JustPlayed {
                            game_id: entry.game_id,
                            puuid: entry.puuid,
                        },
                    );
                    return;
                }
            }
            Err(error) => eprintln!("ARAM: {error}"),
        }
    }
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
    let (_, added) = sync(&lcu, &mut stored, &friends).await?;
    save(&state.path, &stored)?;
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
    state: tauri::State<'_, AramState>,
    friends: Vec<String>,
) -> Result<AramData, String> {
    let _guard = state.lock.lock().await;
    let mut stored = load(&state.path)?;
    let Some(lcu) = Lcu::connect()? else {
        return Ok(data(stored, false, Vec::new()));
    };
    stored.friends = friends
        .into_iter()
        .filter(|f| valid_puuid(f))
        .take(MAX_FRIENDS)
        .collect();
    let friends = stored.friends.clone();
    let (missing, _) = sync(&lcu, &mut stored, &friends).await?;
    save(&state.path, &stored)?;
    Ok(data(stored, true, missing))
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
    stored.version = 2;
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

    #[test]
    fn only_tracked_players_with_rank_and_share() {
        let tracked: HashSet<String> = [puuid(1), puuid(2)].into_iter().collect();
        let champions = HashMap::from([
            (10, ("Kayle".to_string(), "Kayle".to_string())),
            (62, ("MonkeyKing".to_string(), "Wukong".to_string())),
        ]);
        let found = entries(&game(), &tracked, &champions);
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
        assert_eq!(found[1].champion, "MonkeyKing");
        assert_eq!(found[1].champion_name, "Wukong");
        assert_eq!(found[1].damage_rank, 3);
    }

    #[test]
    fn unknown_champion_and_empty_team_stay_harmless() {
        let tracked: HashSet<String> = [puuid(4)].into_iter().collect();
        let mut g = game();
        g.participants[2].stats.total_damage_dealt_to_champions = 0;
        let found = entries(&g, &tracked, &HashMap::new());
        assert_eq!(found[0].champion, "");
        assert_eq!(found[0].team_share, 0.0);
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
            games: entries(&game(), &tracked, &HashMap::new()),
            synced_at: Some(5),
            since: Some(7),
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
