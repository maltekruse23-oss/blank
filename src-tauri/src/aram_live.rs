//! Champ-Karte (user's wish "erkennt den Champ, den man spielt, und zeigt die passenden Augments und
//! Builds"): while the League client runs and the card is switched on, blank. listens to the
//! client's own event stream for exactly one thing, the champion select of an ARAM Mayhem game, and
//! tells the app window which champion the user holds (event `aram-champ`). Read-only: one
//! WebSocket to 127.0.0.1 with the lockfile's password (like every other look at the client),
//! subscribed to the champion select only; nothing is sent to the client except that subscription,
//! nothing is triggered, the game itself is never touched. No polling: the client reports changes.
//!
//! `aram_champ_info` then reads what the card shows: the champion's public Mayhem stats from
//! arammeta.com (user's choice 06.10.2026: open JSON files of an MIT-licensed project, ARAM Mayhem
//! only, many more games) and from our website, and the item list from Data Dragon (name, finished
//! or not, mana), reduced here. Nothing personal is sent, only the champion's number.
//!
//! Writing into the client (user's decision 06.10.2026, MAYHEM-BERATER.md 6a), each with its own
//! switch, off by default, only for the champion held in an ARAM Mayhem champion select: the item
//! set "blank. <direction>" of the chosen build (`aram_item_set`; the user's own sets are written
//! back unchanged) and the own summoner spells (`spells_for`: Snowball plus the spell beside it in
//! arammeta's best pair for the champion when that pair has Snowball and enough games, else Flash
//! or the exception with a reason in `SPELL_EXCEPTIONS`; once the user changes them, nothing more
//! in that select).
use super::{champion_names, lockfile, mayhem_game, parse_lockfile, Lcu, SESSION};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, AtomicI64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};
use tokio_tungstenite::{
    connect_async_tls_with_config,
    tungstenite::{client::IntoClientRequest, http::HeaderValue, Message},
    Connector,
};

/// The client's event for the champion select (WAMP over its local WebSocket).
const CHAMP_SELECT: &str = "OnJsonApiEvent_lol-champ-select_v1_session";
/// WAMP message types the client uses: subscribe, event.
const SUBSCRIBE: u8 = 5;
const EVENT: u8 = 8;
const CONNECT_WITHIN: Duration = Duration::from_secs(5);
/// Events of a busy champion select stay far below this; anything bigger is not read.
const MAX_EVENT_BYTES: usize = 512 * 1024;
const EVENT_NAME: &str = "aram-champ";
const SITE: &str = "https://mayhemstats.lol";
const DDRAGON: &str = "https://ddragon.leagueoflegends.com/cdn";
const MAX_ANSWER: usize = 8 * 1024 * 1024;
/// arammeta.com: per champion `/api/champions/<id>.json`, the augment list in `/api/tier-list.json`.
const META: &str = "https://arammeta.com";
/// The augment list (3 MB) is read again after this long; it changes about once a day.
const META_KEEP: Duration = Duration::from_secs(6 * 60 * 60);

/// arammeta's augment list and champion games, reduced, kept for `META_KEEP`.
static META_LIST: Mutex<Option<(Instant, Arc<MetaList>)>> = Mutex::new(None);

/// The card is switched on (setting `popoutChamp`, told by the app window).
static WANTED: AtomicBool = AtomicBool::new(false);
/// One connection at a time.
static LISTENING: AtomicBool = AtomicBool::new(false);
/// The last champion told to the app (0: none), so the same pick is told once.
static TOLD: AtomicI64 = AtomicI64::new(0);
/// The switches "Item-Set schreiben" and "Beschwörerzauber setzen" (`champItemSet`, `champSpells`).
static ITEM_SET_WANTED: AtomicBool = AtomicBool::new(false);
static SPELLS_WANTED: AtomicBool = AtomicBool::new(false);
/// The last champion picked (kept after the select ends) and the build chosen for it on the card;
/// the augment offers in the game are ranked for it (offers.rs).
static CHOSEN: Mutex<(i64, Option<String>)> = Mutex::new((0, None));

const MY_SELECTION: &str = "/lol-champ-select/v1/session/my-selection";
const FLASH: i64 = 4;
const GHOST: i64 = 6;
/// ARAM's Mark/Dash.
const SNOWBALL: i64 = 32;
/// Champions that take another spell instead of Flash (user's rule: Snowball almost always, Flash
/// beside it; never Exhaust or Barrier). Champion id, spell, reason.
const SPELL_EXCEPTIONS: &[(i64, i64, &str)] = &[(
    27,
    GHOST,
    "Singed: läuft mit seinem Gift durch die Gegner, Geist hält ihn im Kampf, Blitz bringt ihm wenig",
)];
/// Howling Abyss, where ARAM Mayhem is played.
const ARAM_MAP: i64 = 12;
const ITEM_SET_TITLE: &str = "blank. ";

/// What the app hears: the champion the user holds in an ARAM Mayhem champion select (0 when the
/// select ended), with its Data Dragon key and name from the client's champion list.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Champ {
    champion_id: i64,
    alias: String,
    name: String,
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct SelectSession {
    local_player_cell_id: i64,
    my_team: Vec<Cell>,
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct Cell {
    cell_id: i64,
    champion_id: i64,
    spell1_id: i64,
    spell2_id: i64,
}

fn my_cell(data: &Value) -> Option<Cell> {
    let session = SelectSession::deserialize(data).ok()?;
    session
        .my_team
        .into_iter()
        .find(|cell| cell.cell_id == session.local_player_cell_id)
}

/// The user's champion in a champion select event (`data` of the event), if one is held.
fn my_champion(data: &Value) -> Option<i64> {
    my_cell(data)
        .map(|cell| cell.champion_id)
        .filter(|id| (1..100_000).contains(id))
}

/// The spells blank. sets for a champion, from the user's (D, F): Snowball and the spell beside
/// it in arammeta's best pair for the champion (`meta`, see `meta_spell`), else Flash or the
/// champion's exception; Flash, or else the spell that is not Snowball, keeps its key.
fn spells_for(champion: i64, (d, f): (i64, i64), meta: Option<i64>) -> (i64, i64) {
    let main = meta.unwrap_or_else(|| {
        SPELL_EXCEPTIONS
            .iter()
            .find(|(id, ..)| *id == champion)
            .map_or(FLASH, |(_, spell, _)| *spell)
    });
    if f == FLASH || (d != FLASH && d == SNOWBALL) {
        (SNOWBALL, main)
    } else {
        (main, SNOWBALL)
    }
}

/// arammeta's best spell pair counts only from this many games of the champion.
const META_SPELL_GAMES: u32 = 100;
/// Never set (user's rule): Exhaust and Barrier.
const NEVER_SPELLS: [i64; 2] = [3, 21];
/// Per champion the spell beside Snowball from arammeta (None: the fixed rule), read once a run.
static META_SPELLS: Mutex<Vec<(i64, Option<i64>)>> = Mutex::new(Vec::new());

/// The spell beside Snowball in arammeta's best pair (`spells.top[0]` of the champion file;
/// MAYHEM-BERATER.md 6a "später aus den Spielen ableiten"): only with enough games, only a pair
/// with Snowball (user's rule: Snowball almost always), never Exhaust or Barrier.
fn meta_spell(file: &[u8]) -> Option<i64> {
    #[derive(Deserialize)]
    struct File {
        spells: Pairs,
    }
    #[derive(Deserialize)]
    struct Pairs {
        top: Vec<Pair>,
    }
    #[derive(Deserialize)]
    struct Pair {
        g: u32,
        items: Vec<Spell>,
    }
    #[derive(Deserialize)]
    struct Spell {
        id: i64,
    }
    let file: File = serde_json::from_slice(file).ok()?;
    let best = file.spells.top.first()?;
    let [a, b] = best.items.as_slice() else {
        return None;
    };
    let other = match (a.id, b.id) {
        (SNOWBALL, other) | (other, SNOWBALL) => other,
        _ => return None,
    };
    (best.g >= META_SPELL_GAMES
        && other != SNOWBALL
        && !NEVER_SPELLS.contains(&other)
        && (1..100).contains(&other))
    .then_some(other)
}

/// `meta_spell` for a champion, fetched once a run (also a failure: then the fixed rule).
async fn meta_spell_of(champion: i64) -> Option<i64> {
    let known = |list: &[(i64, Option<i64>)]| list.iter().find(|(id, _)| *id == champion).copied();
    if let Some((_, main)) = known(&META_SPELLS.lock().unwrap_or_else(|p| p.into_inner())) {
        return main;
    }
    let http = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(5))
        .user_agent(concat!("blank/", env!("CARGO_PKG_VERSION")))
        .build()
        .ok();
    let main = match http {
        Some(http) => fetch(&http, &format!("{META}/api/champions/{champion}.json"))
            .await
            .ok()
            .flatten()
            .and_then(|bytes| meta_spell(&bytes)),
        None => None,
    };
    META_SPELLS
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .push((champion, main));
    main
}

/// What blank. did with the spells in this champion select.
#[derive(Default)]
struct Spells {
    /// The user's spells before, and what blank. set.
    set: Option<((i64, i64), (i64, i64))>,
    /// The user changed them after blank.: nothing more in this select.
    done: bool,
}

async fn set_spells(champion: i64, data: &Value, state: &mut Spells) {
    let Some(cell) = my_cell(data) else {
        return;
    };
    let now = (cell.spell1_id, cell.spell2_id);
    if state.done || now.0 <= 0 || now.1 <= 0 {
        return;
    }
    if let Some((before, set)) = state.set {
        if now != set && now != before {
            state.done = true;
            return;
        }
    }
    let want = spells_for(champion, now, meta_spell_of(champion).await);
    if want == now {
        return;
    }
    let Ok(Some(lcu)) = Lcu::connect() else {
        return;
    };
    let body = serde_json::json!({ "spell1Id": want.0, "spell2Id": want.1 });
    match lcu.send(reqwest::Method::PATCH, MY_SELECTION, &body).await {
        Ok(()) => state.set = Some((state.set.map_or(now, |(before, _)| before), want)),
        Err(error) => {
            state.done = true;
            crate::errors::record("Beschwörerzauber", &error);
        }
    }
}

/// One message of the client's stream: `[8, "<event>", {"eventType", "data", …}]` for the
/// champion select; anything else is None.
fn select_event(text: &str) -> Option<(String, Value)> {
    if text.len() > MAX_EVENT_BYTES {
        return None;
    }
    let message: Value = serde_json::from_str(text).ok()?;
    let parts = message.as_array()?;
    if parts.first()?.as_u64()? != u64::from(EVENT) || parts.get(1)?.as_str()? != CHAMP_SELECT {
        return None;
    }
    let body = parts.get(2)?;
    let kind = body.get("eventType")?.as_str()?.to_string();
    Some((kind, body.get("data").cloned().unwrap_or(Value::Null)))
}

fn tell(app: &AppHandle, champion_id: i64, names: &HashMap<i64, (String, String)>) {
    if TOLD.swap(champion_id, Ordering::Relaxed) != champion_id {
        if champion_id > 0 {
            *CHOSEN.lock().unwrap_or_else(|p| p.into_inner()) = (champion_id, None);
        }
        let (alias, name) = names.get(&champion_id).cloned().unwrap_or_default();
        let champ = Champ {
            champion_id,
            alias,
            name,
        };
        // blank.'s window, or the Mayhem app's (mayhem.rs); only one of them exists.
        for window in ["main", crate::mayhem::WINDOW] {
            let _ = app.emit_to(window, EVENT_NAME, champ.clone());
        }
    }
}

/// Listens while the client runs and the card is wanted; ends by itself when the client closes.
pub fn listen(app: &AppHandle) {
    if !WANTED.load(Ordering::Relaxed) || LISTENING.swap(true, Ordering::Relaxed) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = stream(&app).await {
            // A closed client is the normal end; only real failures are noted.
            if lockfile().is_some() {
                crate::errors::record("Champ-Karte", &error);
            }
        }
        tell(&app, 0, &HashMap::new());
        LISTENING.store(false, Ordering::Relaxed);
    });
}

async fn stream(app: &AppHandle) -> Result<(), String> {
    let Some(path) = lockfile() else {
        return Ok(());
    };
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let (port, password) = parse_lockfile(&text).ok_or("Lockfile unlesbar")?;
    let mut request = format!("wss://127.0.0.1:{port}/")
        .into_client_request()
        .map_err(|e| e.to_string())?;
    let auth = format!(
        "Basic {}",
        super::base64(format!("riot:{password}").as_bytes())
    );
    request.headers_mut().insert(
        "Authorization",
        HeaderValue::from_str(&auth).map_err(|e| e.to_string())?,
    );
    // The client's certificate for 127.0.0.1 is its own, signed by Riot and not by a public
    // authority; accepted for this local connection only, as for every other look at the client.
    let tls = native_tls::TlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;
    let connecting =
        connect_async_tls_with_config(request, None, false, Some(Connector::NativeTls(tls)));
    let (mut socket, _) = tokio::time::timeout(CONNECT_WITHIN, connecting)
        .await
        .map_err(|_| "Client antwortet nicht".to_string())?
        .map_err(|e| e.to_string())?;
    let subscribe = format!("[{SUBSCRIBE},\"{CHAMP_SELECT}\"]");
    socket
        .send(Message::Text(subscribe.into()))
        .await
        .map_err(|e| e.to_string())?;
    // Whether this champion select is ARAM Mayhem: asked once per select.
    let mut mayhem: Option<bool> = None;
    // Keys and names of the champions, read once when needed.
    let mut names = HashMap::new();
    let mut spells = Spells::default();
    while let Some(message) = socket.next().await {
        if !WANTED.load(Ordering::Relaxed) {
            break;
        }
        let text = match message {
            Ok(Message::Text(text)) => text,
            Ok(Message::Close(_)) | Err(_) => break,
            Ok(_) => continue,
        };
        let Some((kind, data)) = select_event(&text) else {
            continue;
        };
        if kind == "Delete" {
            mayhem = None;
            spells = Spells::default();
            tell(app, 0, &names);
            continue;
        }
        if mayhem.is_none() {
            mayhem = Some(is_mayhem().await);
        }
        if mayhem == Some(true) {
            if let Some(champion) = my_champion(&data) {
                if names.is_empty() {
                    if let Ok(Some(lcu)) = Lcu::connect() {
                        names = champion_names(&lcu).await;
                    }
                }
                tell(app, champion, &names);
                if SPELLS_WANTED.load(Ordering::Relaxed) {
                    set_spells(champion, &data, &mut spells).await;
                }
            }
        }
    }
    let _ = socket.close(None).await;
    Ok(())
}

async fn is_mayhem() -> bool {
    #[derive(Deserialize, Default)]
    #[serde(default, rename_all = "camelCase")]
    struct Session {
        game_data: Game,
        map: Mode,
    }
    #[derive(Deserialize, Default)]
    #[serde(default, rename_all = "camelCase")]
    struct Mode {
        game_mode: String,
    }
    #[derive(Deserialize, Default)]
    #[serde(default)]
    struct Game {
        queue: Queue,
    }
    #[derive(Deserialize, Default)]
    #[serde(default)]
    struct Queue {
        id: i64,
        #[serde(rename = "gameMode")]
        game_mode: String,
    }
    let Ok(Some(lcu)) = Lcu::connect() else {
        return false;
    };
    lcu.get::<Session>(SESSION).await.is_ok_and(|s| {
        let q = &s.game_data.queue;
        mayhem_game(q.id, &q.game_mode) || mayhem_game(0, &s.map.game_mode)
    })
}

/// The app window switches the card on or off (setting `popoutChamp`), and the writes into the
/// client (`champItemSet`, `champSpells`) and the reading of offers in the game (`champOffers`);
/// the Mayhem app leaves them out: off.
#[tauri::command]
pub fn aram_champ_watch(
    app: AppHandle,
    on: bool,
    item_set: Option<bool>,
    spells: Option<bool>,
    offers: Option<bool>,
) {
    super::offers::set_wanted(on && offers == Some(true));
    ITEM_SET_WANTED.store(on && item_set == Some(true), Ordering::Relaxed);
    SPELLS_WANTED.store(on && spells == Some(true), Ordering::Relaxed);
    WANTED.store(on, Ordering::Relaxed);
    if on {
        listen(&app);
    }
}

/// The item set of a build: its core, arammeta's best boots, then the further items of the
/// direction.
fn item_set(
    champion: i64,
    direction: &str,
    core: &[u32],
    boots: &[u32],
    more: &[u32],
    stamp: u128,
) -> Option<Value> {
    let label = match direction {
        "ap" => "AP",
        "ad" => "AD",
        "tank" => "Tank",
        _ => return None,
    };
    let item = |id: &u32| (1..1_000_000).contains(id);
    if core.is_empty()
        || core.len() > 6
        || boots.len() > 4
        || more.len() > 12
        || !core.iter().chain(boots).chain(more).all(item)
    {
        return None;
    }
    let block = |kind: String, ids: &[u32]| {
        let items: Vec<Value> = ids
            .iter()
            .map(|id| serde_json::json!({ "id": id.to_string(), "count": 1 }))
            .collect();
        serde_json::json!({ "type": kind, "items": items })
    };
    let mut blocks = vec![block(format!("Kern {label}"), core)];
    if !boots.is_empty() {
        blocks.push(block("Stiefel".into(), boots));
    }
    if !more.is_empty() {
        blocks.push(block("Danach".into(), more));
    }
    Some(serde_json::json!({
        "title": format!("{ITEM_SET_TITLE}{label}"),
        "type": "custom",
        "map": "any",
        "mode": "any",
        "associatedChampions": [champion],
        "associatedMaps": [ARAM_MAP],
        "blocks": blocks,
        "preferredItemSlots": [],
        "sortrank": 0,
        "startedFrom": "blank",
        "uid": format!("{:08x}-0000-4000-8000-{:012x}", champion, stamp & 0xffff_ffff_ffff),
    }))
}

/// The list as the client gave it, with blank.'s earlier sets for this champion replaced by `set`;
/// every other set stays exactly as it was.
fn with_item_set(mut sets: Value, champion: i64, set: Value) -> Option<Value> {
    let list = sets.get_mut("itemSets")?.as_array_mut()?;
    list.retain(|s| {
        let ours = s
            .get("title")
            .and_then(Value::as_str)
            .is_some_and(|t| t.starts_with(ITEM_SET_TITLE));
        let this = s
            .get("associatedChampions")
            .and_then(Value::as_array)
            .is_some_and(|c| c.iter().any(|id| id.as_i64() == Some(champion)));
        !(ours && this)
    });
    list.push(set);
    Some(sets)
}

/// aramonly.com, whose ARAM guides list many offmeta builds (user's wish 08.10.2026, AP-Alistar).
const GUIDES: &str = "https://www.aramonly.com";

/// The address of a champion's guides there, from its English name ("Nunu & Willump" →
/// "nunu-and-willump"); the start page when the name is unknown or odd.
fn guide_url(name: Option<&str>) -> String {
    let slug = name
        .unwrap_or_default()
        .to_lowercase()
        .replace('&', "and")
        .replace(['\x27', '.'], "")
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if slug.is_empty() || slug.len() > 40 {
        format!("{GUIDES}/")
    } else {
        format!("{GUIDES}/guide/{slug}/")
    }
}

/// Opens the champion's guides on aramonly.com in the browser (a link only; nothing is read).
#[tauri::command]
pub fn aram_open_guide(champion_id: u32) {
    let name = META_LIST.lock().ok().and_then(|kept| {
        kept.as_ref()
            .and_then(|(_, list)| list.champs.get(&champion_id.to_string()))
            .map(|c| c.name_en.clone())
    });
    crate::twitch::open_url(&guide_url(name.as_deref()));
}

/// The champion picked last and the build chosen for it (offers.rs).
pub(super) fn chosen() -> (i64, Option<String>) {
    CHOSEN.lock().unwrap_or_else(|p| p.into_inner()).clone()
}

/// The build chosen on the card for the champion held in the ARAM Mayhem champion select (only
/// then): remembered for the game's offers, and written as item set with that switch on.
#[tauri::command]
pub async fn aram_champ_build(
    champion_id: i64,
    direction: String,
    core: Vec<u32>,
    boots: Vec<u32>,
    more: Vec<u32>,
) -> Result<(), String> {
    if champion_id <= 0 || TOLD.load(Ordering::Relaxed) != champion_id {
        return Ok(());
    }
    if matches!(direction.as_str(), "ap" | "ad" | "tank") {
        let mut chosen = CHOSEN.lock().unwrap_or_else(|p| p.into_inner());
        if chosen.0 == champion_id {
            chosen.1 = Some(direction.clone());
        }
    }
    if !ITEM_SET_WANTED.load(Ordering::Relaxed) {
        return Ok(());
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos());
    let set = item_set(champion_id, &direction, &core, &boots, &more, stamp)
        .ok_or("Ungültiges Item-Set")?;
    let result = async {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Me {
            summoner_id: u64,
        }
        let lcu = Lcu::connect()?.ok_or(super::NOT_OPEN)?;
        let me: Me = lcu.get(super::SUMMONER).await?;
        let path = format!("/lol-item-sets/v1/item-sets/{}/sets", me.summoner_id);
        let sets: Value = lcu.get(&path).await?;
        let sets = with_item_set(sets, champion_id, set).ok_or("Unerwartete Item-Sets")?;
        lcu.send(reqwest::Method::PUT, &path, &sets).await
    }
    .await;
    if let Err(error) = &result {
        crate::errors::record("Item-Set", error);
    }
    result
}

// --- What the card shows ---

/// An item as the card needs it.
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ItemInfo {
    name: String,
    /// A finished item (nothing builds from it, no boots, potions or trinkets, ≥ 1000 gold), as
    /// the website counts it.
    done: bool,
    /// Gives mana or mana regeneration (bad in ARAM, user's rule for builds).
    mana: bool,
    /// What the item builds towards ("ap", "ad", "tank" or "other"), for the build directions.
    kind: &'static str,
    /// Data Dragon tags of a finished item, for the themes of the combos (combos.ts).
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tags: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChampInfo {
    /// The website's `/api/champions/<id>` as it came (checked in the app); None: no games yet.
    champion: Option<String>,
    /// The website's `/api/augments` (names and rarity).
    augments: Option<String>,
    items: HashMap<u32, ItemInfo>,
    /// arammeta's numbers; None when it did not answer (the card then uses the website's).
    meta: Option<MetaInfo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaInfo {
    /// Patch of the numbers, like "16.19".
    patch: String,
    /// The champion's Mayhem games counted there.
    games: Option<u32>,
    /// `/api/champions/<id>.json` as it came (checked in the app).
    champion: Option<String>,
    augments: HashMap<u32, MetaAugment>,
    /// arammeta's Mayhem items: English text and price, for the themes of the combos (combos.ts).
    items: HashMap<u32, ItemText>,
}

#[derive(Serialize)]
pub struct ItemText {
    text: String,
    price: Option<u32>,
}

/// An augment as arammeta lists it (English name; rarity kSilver/kGold/kPrismatic; categories
/// like "ap", "ad", "tank"; icon path on arammeta.com; English text for the combos' themes).
#[derive(Serialize, Deserialize, Clone, Default, Debug, PartialEq)]
#[serde(default)]
pub struct MetaAugment {
    #[serde(rename(deserialize = "name_en"))]
    name: String,
    rarity: String,
    cats: Vec<String>,
    icon: String,
    /// Win rate and games over all champions (only for the Mayhem app's tier list).
    #[serde(skip_serializing)]
    wr: f64,
    #[serde(skip_serializing)]
    g: u32,
    #[serde(rename(deserialize = "desc_en"))]
    text: String,
    /// Win rate above what its champions win anyway, and pick rate (Mayhem app only).
    #[serde(skip_serializing, deserialize_with = "lenient")]
    lift: Option<f64>,
    #[serde(skip_serializing, deserialize_with = "lenient")]
    pick: Option<f64>,
}

/// A field arammeta might change: a wrong shape gives its default instead of losing the whole
/// list (the champ card in blank. reads the same list).
fn lenient<'de, D: serde::Deserializer<'de>, T: serde::de::DeserializeOwned + Default>(
    d: D,
) -> Result<T, D::Error> {
    Ok(serde_json::from_value(Value::deserialize(d)?).unwrap_or_default())
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct MetaList {
    patch_prefix: String,
    champs: HashMap<String, MetaChamp>,
    augs: HashMap<String, MetaAugment>,
    // The rest only for the Mayhem app's pages (`mayhem_tiers`).
    #[serde(rename = "augCategories", deserialize_with = "lenient")]
    categories: MetaCategories,
    #[serde(rename = "itemLut", deserialize_with = "lenient")]
    items: HashMap<String, MetaItem>,
    #[serde(rename = "patchChanges", deserialize_with = "lenient")]
    changes: Option<MetaChanges>,
    #[serde(rename = "searchIndex", deserialize_with = "lenient")]
    search: MetaSearch,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct MetaChamp {
    g: u32,
    wr: f64,
    name_en: String,
    alias: String,
    tags: Vec<String>,
    /// Best augments for the champion per rarity (kPrismatic, kGold, kSilver), best first.
    #[serde(deserialize_with = "lenient")]
    top: HashMap<String, Vec<MetaTop>>,
    /// Teammates, best lift first.
    #[serde(deserialize_with = "lenient")]
    pairs: Vec<MetaPair>,
    /// Team profile: damage per minute (phys, magic, true) and scores 0–3 (front, cc, …).
    #[serde(deserialize_with = "lenient")]
    comp: HashMap<String, f64>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct MetaTop {
    id: u32,
    g: u32,
    wr: f64,
    lift: Option<f64>,
    pick: Option<f64>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct MetaPair {
    id: u32,
    g: u32,
    wr: f64,
    expected: Option<f64>,
    lift: Option<f64>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct MetaCategories {
    order: Vec<String>,
    labels: HashMap<String, MetaLabel>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct MetaLabel {
    en: String,
}

/// itemLut: e = English name, p = price, de = English text, r = role.
#[derive(Deserialize, Default)]
#[serde(default)]
struct MetaItem {
    e: String,
    p: Option<u32>,
    de: String,
    r: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct MetaSearch {
    related: MetaRelated,
}

/// Augment name → champion ids arammeta's search links with it.
#[derive(Deserialize, Default)]
#[serde(default)]
struct MetaRelated {
    augments: HashMap<String, Vec<u32>>,
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct MetaChanges {
    current_patch: String,
    baseline_patch: String,
    current_games: Option<u32>,
    baseline_games: Option<u32>,
    hero_risers: Vec<MetaChange>,
    hero_fallers: Vec<MetaChange>,
    item_risers: Vec<MetaChange>,
    item_fallers: Vec<MetaChange>,
    augment_risers: Vec<MetaChange>,
    augment_fallers: Vec<MetaChange>,
    champ_item_risers: Vec<MetaChange>,
    champ_item_fallers: Vec<MetaChange>,
    champ_aug_risers: Vec<MetaChange>,
    champ_aug_fallers: Vec<MetaChange>,
}

/// One riser or faller: a champion, item or augment (`id`, `name_en`) or a champion with an
/// item or augment (`champ` plus `item`/`augment`).
#[derive(Deserialize, Default)]
#[serde(default)]
struct MetaChange {
    id: Option<u32>,
    name_en: String,
    champ: Option<MetaRef>,
    item: Option<MetaRef>,
    augment: Option<MetaRef>,
    current_wr: f64,
    baseline_wr: f64,
    current_games: u32,
    baseline_games: u32,
    current_tier: Option<String>,
    baseline_tier: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct MetaRef {
    id: u32,
    name_en: String,
}

/// arammeta's augment list, from memory while fresh.
async fn meta_list(http: &reqwest::Client) -> Option<Arc<MetaList>> {
    let kept = META_LIST.lock().ok()?.clone();
    if let Some((at, list)) = kept {
        if at.elapsed() < META_KEEP {
            return Some(list);
        }
    }
    let bytes = fetch(http, &format!("{META}/api/tier-list.json"))
        .await
        .ok()??;
    let list = Arc::new(serde_json::from_slice::<MetaList>(&bytes).ok()?);
    if let Ok(mut kept) = META_LIST.lock() {
        *kept = Some((Instant::now(), list.clone()));
    }
    Some(list)
}

async fn meta_info(http: &reqwest::Client, champion_id: u32) -> Option<MetaInfo> {
    let url = format!("{META}/api/champions/{champion_id}.json");
    let (list, champion) = tokio::join!(meta_list(http), fetch(http, &url));
    let list = list?;
    let champion = champion
        .ok()?
        .and_then(|bytes| String::from_utf8(bytes).ok());
    Some(MetaInfo {
        patch: list.patch_prefix.chars().take(12).collect(),
        games: list.champs.get(&champion_id.to_string()).map(|c| c.g),
        champion,
        augments: list
            .augs
            .iter()
            .filter_map(|(id, a)| Some((id.parse::<u32>().ok()?, a.clone())))
            .collect(),
        items: item_texts(&list),
    })
}

/// arammeta's Mayhem items with English text and price, for the combos' themes (combos.ts).
fn item_texts(list: &MetaList) -> HashMap<u32, ItemText> {
    list.items
        .iter()
        // arammeta keeps items taken out of the game as "Deprecated item" (e.g. Stormrazor).
        .filter(|(_, i)| !i.e.starts_with("Deprecated"))
        .filter_map(|(id, i)| {
            let text = ItemText {
                text: short(&i.de, ITEM_TEXT_MAX),
                price: i.p,
            };
            Some((id.parse::<u32>().ok()?, text))
        })
        .collect()
}

/// Enough of an item's text for its effects (arammeta's are at most about 370 characters).
const ITEM_TEXT_MAX: usize = 600;

/// One champion of the Mayhem app's tier list (arammeta's numbers over all its Mayhem games).
#[derive(Serialize)]
pub struct TierChampion {
    id: u32,
    name: String,
    alias: String,
    tags: Vec<String>,
    wr: f64,
    games: u32,
    /// Best augments for this champion, per rarity in arammeta's order.
    top: Vec<ChampAugment>,
    /// Teammates, in arammeta's order (best lift first).
    pairs: Vec<Teammate>,
    /// Team profile, only the known keys (`COMP`).
    comp: HashMap<String, f64>,
}

#[derive(Serialize)]
pub struct ChampAugment {
    id: u32,
    rarity: String,
    games: u32,
    wr: f64,
    lift: Option<f64>,
    pick: Option<f64>,
}

#[derive(Serialize)]
pub struct Teammate {
    id: u32,
    games: u32,
    wr: f64,
    expected: Option<f64>,
    lift: Option<f64>,
}

/// One augment of the Mayhem app's tier list.
#[derive(Serialize)]
pub struct TierAugment {
    id: u32,
    name: String,
    rarity: String,
    icon: String,
    text: String,
    cats: Vec<String>,
    wr: f64,
    games: u32,
    lift: Option<f64>,
    pick: Option<f64>,
    /// Champions arammeta's search links with the augment.
    champions: Vec<u32>,
}

#[derive(Serialize)]
pub struct Category {
    id: String,
    label: String,
}

#[derive(Serialize)]
pub struct TierItem {
    id: u32,
    name: String,
    price: Option<u32>,
    role: Option<String>,
    text: String,
}

/// The current patch against the one before (arammeta's patchChanges).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Changes {
    current: String,
    baseline: String,
    current_games: Option<u32>,
    baseline_games: Option<u32>,
    champions: Movers,
    items: Movers,
    augments: Movers,
    champion_items: Movers,
    champion_augments: Movers,
}

#[derive(Serialize)]
pub struct Movers {
    risers: Vec<Change>,
    fallers: Vec<Change>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    /// The champion, item or augment that moved.
    id: u32,
    name: String,
    /// With an item or augment: the champion it moved for.
    champion: Option<u32>,
    current_wr: f64,
    baseline_wr: f64,
    current_games: u32,
    baseline_games: u32,
    current_tier: Option<String>,
    baseline_tier: Option<String>,
}

#[derive(Serialize)]
pub struct Tiers {
    patch: String,
    champions: Vec<TierChampion>,
    augments: Vec<TierAugment>,
    categories: Vec<Category>,
    items: Vec<TierItem>,
    changes: Option<Changes>,
}

/// The keys of a champion's team profile the app shows.
const COMP: [&str; 10] = [
    "phys", "magic", "true", "front", "damage", "engage", "wave", "poke", "sustain", "cc",
];
const RARITIES: [&str; 3] = ["kPrismatic", "kGold", "kSilver"];

/// Every champion and augment with arammeta's win rate and games (Mayhem app, tier lists), plus
/// per champion its best augments, teammates and team profile, the augment categories, the item
/// list and the patch changes (user, 08.10.2026: "alle Daten von arammeta"). The app ranks them
/// itself; this only reads the list the champ card already keeps. Left out on purpose: the
/// trained team model (`team_score`, `draftModel`, `recommendation_composition`, for the later
/// Lobby-Check) and fields without a clear meaning (`skillScaling`, `prevMix`, `slots`).
/// One client for arammeta.com and Data Dragon for the whole run: open connections are reused, so
/// later requests skip the TLS handshake (user's wish 08.10.2026: "Laden schneller machen").
fn web_client() -> Result<reqwest::Client, String> {
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    if let Some(client) = CLIENT.get() {
        return Ok(client.clone());
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(30))
        .user_agent(concat!("blank/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;
    Ok(CLIENT.get_or_init(|| client).clone())
}

#[tauri::command]
pub async fn mayhem_tiers() -> Result<Tiers, String> {
    let http = web_client()?;
    let list = meta_list(&http)
        .await
        .ok_or_else(|| "arammeta.com antwortet nicht.".to_string())?;
    Ok(tiers_of(&list))
}

fn short(text: &str, max: usize) -> String {
    text.chars().take(max).collect()
}

/// A share like a win or pick rate, None when it is not one.
fn share(value: Option<f64>) -> Option<f64> {
    value.filter(|v| (0.0..=1.0).contains(v))
}

/// A lift (win rate above the expectation), None when it is not a plausible one.
fn lift(value: Option<f64>) -> Option<f64> {
    value.filter(|v| (-1.0..=1.0).contains(v))
}

fn tiers_of(list: &MetaList) -> Tiers {
    let champions = list
        .champs
        .iter()
        .filter_map(|(id, c)| {
            let id = id.parse::<u32>().ok()?;
            let ok = c.g > 0 && (0.0..=1.0).contains(&c.wr) && alias_ok(&c.alias);
            ok.then(|| TierChampion {
                id,
                name: short(&c.name_en, 40),
                alias: c.alias.clone(),
                tags: c.tags.iter().take(3).map(|t| short(t, 20)).collect(),
                wr: c.wr,
                games: c.g,
                top: RARITIES
                    .iter()
                    .flat_map(|rarity| {
                        let list = c.top.get(*rarity).map(Vec::as_slice).unwrap_or_default();
                        list.iter()
                            .filter(|a| a.g > 0 && (0.0..=1.0).contains(&a.wr))
                            .take(20)
                            .map(|a| ChampAugment {
                                id: a.id,
                                rarity: rarity.to_string(),
                                games: a.g,
                                wr: a.wr,
                                lift: lift(a.lift),
                                pick: share(a.pick),
                            })
                    })
                    .collect(),
                pairs: c
                    .pairs
                    .iter()
                    .filter(|p| p.g > 0 && (0.0..=1.0).contains(&p.wr))
                    .take(30)
                    .map(|p| Teammate {
                        id: p.id,
                        games: p.g,
                        wr: p.wr,
                        expected: share(p.expected),
                        lift: lift(p.lift),
                    })
                    .collect(),
                comp: COMP
                    .iter()
                    .filter_map(|key| {
                        let value = *c.comp.get(*key)?;
                        (0.0..100_000.0)
                            .contains(&value)
                            .then(|| (key.to_string(), value))
                    })
                    .collect(),
            })
        })
        .collect();
    let augments = list
        .augs
        .iter()
        .filter_map(|(id, a)| {
            let id = id.parse::<u32>().ok()?;
            let ok = a.g > 0 && (0.0..=1.0).contains(&a.wr);
            ok.then(|| TierAugment {
                id,
                name: short(&a.name, 60),
                rarity: short(&a.rarity, 20),
                icon: short(&a.icon, 200),
                text: short(&a.text, 400),
                cats: a.cats.iter().take(6).map(|c| short(c, 20)).collect(),
                wr: a.wr,
                games: a.g,
                lift: lift(a.lift),
                pick: share(a.pick),
                champions: list
                    .search
                    .related
                    .augments
                    .get(&a.name)
                    .map(|ids| ids.iter().take(200).copied().collect())
                    .unwrap_or_default(),
            })
        })
        .collect();
    let categories = list
        .categories
        .order
        .iter()
        .take(20)
        .filter_map(|id| {
            let label = &list.categories.labels.get(id)?.en;
            (!label.is_empty()).then(|| Category {
                id: short(id, 20),
                label: short(label, 30),
            })
        })
        .collect();
    let items = list
        .items
        .iter()
        .take(400)
        .filter_map(|(id, i)| {
            let id = id.parse().ok()?;
            (!i.e.is_empty()).then(|| TierItem {
                id,
                name: short(&i.e, 60),
                price: i.p.filter(|p| *p < 100_000),
                role: i.r.as_deref().map(|r| short(r, 30)),
                text: short(&i.de, 800),
            })
        })
        .collect();
    Tiers {
        patch: short(&list.patch_prefix, 12),
        champions,
        augments,
        categories,
        items,
        changes: list.changes.as_ref().map(changes_of),
    }
}

fn changes_of(c: &MetaChanges) -> Changes {
    // A champion pair names the item or augment as the subject and the champion beside it.
    let one = |m: &MetaChange| {
        let (id, name, champion) = match (&m.champ, m.item.as_ref().or(m.augment.as_ref())) {
            (Some(champ), Some(thing)) => (thing.id, thing.name_en.as_str(), Some(champ.id)),
            _ => (m.id?, m.name_en.as_str(), None),
        };
        let ok = !name.is_empty()
            && (0.0..=1.0).contains(&m.current_wr)
            && (0.0..=1.0).contains(&m.baseline_wr);
        let tier = |t: &Option<String>| {
            t.as_deref()
                .filter(|t| t.len() <= 4 && t.chars().all(|c| c.is_ascii_alphanumeric()))
                .map(str::to_string)
        };
        ok.then(|| Change {
            id,
            name: short(name, 60),
            champion,
            current_wr: m.current_wr,
            baseline_wr: m.baseline_wr,
            current_games: m.current_games,
            baseline_games: m.baseline_games,
            current_tier: tier(&m.current_tier),
            baseline_tier: tier(&m.baseline_tier),
        })
    };
    let movers = |risers: &[MetaChange], fallers: &[MetaChange]| Movers {
        risers: risers.iter().take(20).filter_map(one).collect(),
        fallers: fallers.iter().take(20).filter_map(one).collect(),
    };
    Changes {
        current: short(&c.current_patch, 12),
        baseline: short(&c.baseline_patch, 12),
        current_games: c.current_games,
        baseline_games: c.baseline_games,
        champions: movers(&c.hero_risers, &c.hero_fallers),
        items: movers(&c.item_risers, &c.item_fallers),
        augments: movers(&c.augment_risers, &c.augment_fallers),
        champion_items: movers(&c.champ_item_risers, &c.champ_item_fallers),
        champion_augments: movers(&c.champ_aug_risers, &c.champ_aug_fallers),
    }
}

/// Data Dragon keys are plain letters and digits.
fn alias_ok(alias: &str) -> bool {
    (1..=40).contains(&alias.len()) && alias.chars().all(|c| c.is_ascii_alphanumeric())
}

#[derive(Deserialize)]
struct DragonItems {
    data: HashMap<String, DragonItem>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct DragonItem {
    name: String,
    into: Vec<String>,
    tags: Vec<String>,
    gold: DragonGold,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct DragonGold {
    total: u32,
}

fn items_of(list: DragonItems) -> HashMap<u32, ItemInfo> {
    list.data
        .into_iter()
        .filter_map(|(id, item)| {
            let id = id.parse::<u32>().ok()?;
            let tag = |t: &str| item.tags.iter().any(|x| x == t);
            let done = !tag("Boots")
                && item.into.is_empty()
                && !tag("Consumable")
                && !tag("Trinket")
                && item.gold.total >= 1000;
            let mana = tag("Mana") || tag("ManaRegen");
            let kind = kind_of(&tag);
            Some((
                id,
                ItemInfo {
                    name: item.name,
                    done,
                    mana,
                    kind,
                    tags: if done { item.tags } else { Vec::new() },
                },
            ))
        })
        .collect()
}

/// The direction an item builds towards, from its Data Dragon tags: ability power first (hybrid
/// items like Nashor's Tooth count as AP), then attack damage, then defence.
fn kind_of(tag: &dyn Fn(&str) -> bool) -> &'static str {
    if tag("SpellDamage") {
        "ap"
    } else if [
        "Damage",
        "CriticalStrike",
        "AttackSpeed",
        "ArmorPenetration",
        "OnHit",
    ]
    .iter()
    .any(|t| tag(t))
    {
        "ad"
    } else if ["Health", "Armor", "SpellBlock"].iter().any(|t| tag(t)) {
        "tank"
    } else {
        "other"
    }
}

/// Data Dragon versions look like "15.20.1".
fn valid_version(version: &str) -> bool {
    let parts: Vec<&str> = version.split('.').collect();
    parts.len() == 3
        && parts
            .iter()
            .all(|p| !p.is_empty() && p.len() <= 4 && p.bytes().all(|b| b.is_ascii_digit()))
}

async fn fetch(http: &reqwest::Client, url: &str) -> Result<Option<Vec<u8>>, String> {
    let response = http
        .get(url)
        .send()
        .await
        .map_err(|_| "Nicht erreichbar.".to_string())?;
    match response.status().as_u16() {
        200 => {}
        404 => return Ok(None),
        status => return Err(format!("HTTP {status}")),
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|_| "Antwort unvollständig.".to_string())?;
    if bytes.len() > MAX_ANSWER {
        return Err("Antwort zu groß.".into());
    }
    Ok(Some(bytes.to_vec()))
}

/// Data Dragon's language for item names: German for blank. (also when the flag is missing),
/// English only when asked (the Mayhem app is English only).
fn item_locale(english: Option<bool>) -> &'static str {
    if english == Some(true) {
        "en_US"
    } else {
        "de_DE"
    }
}

/// The champion's stats from the website and the items from Data Dragon (`version`: the app's).
/// Item names in German for blank., in English with `english` (the Mayhem app is English only).
#[tauri::command]
pub async fn aram_champ_info(
    champion_id: u32,
    version: String,
    english: Option<bool>,
) -> Result<ChampInfo, String> {
    if !(1..100_000).contains(&champion_id) || !valid_version(&version) {
        return Err("Ungültige Anfrage.".into());
    }
    let locale = item_locale(english);
    let http = web_client()?;
    let text = |bytes: Option<Vec<u8>>| bytes.and_then(|b| String::from_utf8(b).ok());
    let champion_url = format!("{SITE}/api/champions/{champion_id}");
    let augments_url = format!("{SITE}/api/augments");
    let items_url = format!("{DDRAGON}/{version}/data/{locale}/item.json");
    let (champion, augments, items, meta) = tokio::join!(
        fetch(&http, &champion_url),
        fetch(&http, &augments_url),
        fetch(&http, &items_url),
        meta_info(&http, champion_id),
    );
    let items = match items? {
        Some(bytes) => items_of(
            serde_json::from_slice(&bytes).map_err(|_| "Item-Liste nicht lesbar.".to_string())?,
        ),
        None => HashMap::new(),
    };
    // One of the two sources is enough (arammeta first, the card says which).
    let champion = match champion {
        Ok(champion) => text(champion),
        Err(error) if meta.is_none() => return Err(error),
        Err(_) => None,
    };
    Ok(ChampInfo {
        champion,
        augments: text(augments.unwrap_or(None)),
        items,
        meta,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn guides_are_found_by_the_english_name() {
        let url = |n: &str| guide_url(Some(n));
        assert_eq!(url("Alistar"), "https://www.aramonly.com/guide/alistar/");
        assert_eq!(
            url("Nunu & Willump"),
            "https://www.aramonly.com/guide/nunu-and-willump/"
        );
        assert_eq!(url("Cho'Gath"), "https://www.aramonly.com/guide/chogath/");
        assert_eq!(url("Dr. Mundo"), "https://www.aramonly.com/guide/dr-mundo/");
        assert_eq!(
            url("Aurelion Sol"),
            "https://www.aramonly.com/guide/aurelion-sol/"
        );
        assert_eq!(guide_url(None), "https://www.aramonly.com/");
        assert_eq!(url("../../x?y"), "https://www.aramonly.com/guide/x-y/");
    }

    #[test]
    fn spells_keep_flash_on_its_key() {
        // Flash on D or F stays there, Snowball takes the other key.
        assert_eq!(spells_for(12, (FLASH, 7), None), (FLASH, SNOWBALL));
        assert_eq!(spells_for(12, (14, FLASH), None), (SNOWBALL, FLASH));
        assert_eq!(spells_for(12, (FLASH, SNOWBALL), None), (FLASH, SNOWBALL));
        assert_eq!(spells_for(12, (SNOWBALL, FLASH), None), (SNOWBALL, FLASH));
        // Without Flash: Snowball keeps its key, else Flash goes on D.
        assert_eq!(spells_for(12, (SNOWBALL, 3), None), (SNOWBALL, FLASH));
        assert_eq!(spells_for(12, (3, 21), None), (FLASH, SNOWBALL));
        // Singed takes Ghost where Flash was; never Exhaust (3) or Barrier (21).
        assert_eq!(spells_for(27, (14, FLASH), None), (SNOWBALL, GHOST));
        for (_, spell, reason) in SPELL_EXCEPTIONS {
            assert!(!NEVER_SPELLS.contains(spell) && !reason.is_empty());
        }
        // arammeta's pair goes first, also before an exception.
        assert_eq!(spells_for(12, (14, FLASH), Some(GHOST)), (SNOWBALL, GHOST));
        assert_eq!(spells_for(27, (FLASH, 7), Some(FLASH)), (FLASH, SNOWBALL));
    }

    #[test]
    fn spells_from_arammeta_only_with_snowball_and_enough_games() {
        // The shape of arammeta's champion file (only what is read; Singed, 08.10.2026).
        let file = |slug: &str, g: u32| {
            let items: Vec<Value> = slug
                .split('+')
                .map(|id| json!({ "id": id.parse::<i64>().unwrap(), "name_en": "x" }))
                .collect();
            let top = json!({ "name_en": "x", "slug": slug, "g": g, "wr": 0.57, "items": items });
            serde_json::to_vec(&json!({ "poolAugments": [], "spells": { "top": [top] } })).unwrap()
        };
        assert_eq!(meta_spell(&file("6+32", 167)), Some(GHOST));
        assert_eq!(meta_spell(&file("32+4", 1502)), Some(FLASH));
        // Without Snowball (Flash + Ghost), too few games, Exhaust or Barrier: the fixed rule.
        assert_eq!(meta_spell(&file("4+6", 1568)), None);
        assert_eq!(meta_spell(&file("6+32", 99)), None);
        assert_eq!(meta_spell(&file("3+32", 500)), None);
        assert_eq!(meta_spell(&file("32+21", 500)), None);
        assert_eq!(meta_spell(&file("32+32", 500)), None);
        assert_eq!(meta_spell(&file("4", 500)), None);
        assert_eq!(meta_spell(b"{}"), None);
        assert_eq!(meta_spell(br#"{"spells":{"top":[]}}"#), None);
    }

    #[test]
    fn item_sets_replace_only_blanks_own_for_the_champion() {
        let set = item_set(12, "ap", &[3089, 6655], &[3020, 3111], &[3157], 7).unwrap();
        assert_eq!(set["title"], "blank. AP");
        assert_eq!(set["blocks"][0]["items"][1]["id"], "6655");
        assert_eq!(set["blocks"][1]["type"], "Stiefel");
        assert_eq!(set["blocks"][1]["items"][1]["id"], "3111");
        assert_eq!(set["blocks"][2]["type"], "Danach");
        // Without boots no empty block.
        let set = item_set(12, "ap", &[3089], &[], &[3157], 7).unwrap();
        assert_eq!(set["blocks"][1]["type"], "Danach");
        assert!(item_set(12, "mana", &[3089], &[], &[], 7).is_none());
        assert!(item_set(12, "ap", &[], &[], &[], 7).is_none());
        assert!(item_set(12, "ap", &[0], &[], &[], 7).is_none());
        assert!(item_set(12, "ap", &[3089], &[0], &[], 7).is_none());
        assert!(item_set(12, "ap", &[3089], &[1, 2, 3, 4, 5], &[], 7).is_none());
        let set = item_set(12, "ap", &[3089, 6655], &[3020], &[3157], 7).unwrap();
        let sets = serde_json::json!({ "accountId": 1, "itemSets": [
            { "title": "Mein Alistar", "associatedChampions": [12], "uid": "a" },
            { "title": "blank. Tank", "associatedChampions": [12], "uid": "b" },
            { "title": "blank. AD", "associatedChampions": [27], "uid": "c" },
        ], "timestamp": 5 });
        let out = with_item_set(sets, 12, set).unwrap();
        let titles: Vec<&str> = out["itemSets"]
            .as_array()
            .unwrap()
            .iter()
            .map(|s| s["title"].as_str().unwrap())
            .collect();
        assert_eq!(titles, ["Mein Alistar", "blank. AD", "blank. AP"]);
        assert_eq!(out["accountId"], 1);
        assert!(with_item_set(serde_json::json!({}), 12, Value::Null).is_none());
    }

    #[test]
    fn finds_the_users_champion_in_the_select() {
        let data = json!({
            "localPlayerCellId": 2,
            "myTeam": [
                {"cellId": 0, "championId": 12},
                {"cellId": 2, "championId": 103},
            ]
        });
        assert_eq!(my_champion(&data), Some(103));
        let none = json!({"localPlayerCellId": 2, "myTeam": [{"cellId": 2, "championId": 0}]});
        assert_eq!(my_champion(&none), None);
        assert_eq!(my_champion(&json!({"myTeam": []})), None);
    }

    #[test]
    fn reads_only_champion_select_events() {
        let event = format!(
            r#"[8,"{CHAMP_SELECT}",{{"eventType":"Update","uri":"/lol-champ-select/v1/session","data":{{"localPlayerCellId":1}}}}]"#
        );
        let (kind, data) = select_event(&event).unwrap();
        assert_eq!(kind, "Update");
        assert_eq!(data["localPlayerCellId"], 1);
        assert!(
            select_event(r#"[8,"OnJsonApiEvent_lol-chat_v1_me",{"eventType":"Update"}]"#).is_none()
        );
        assert!(select_event(&format!(r#"[5,"{CHAMP_SELECT}"]"#)).is_none());
        assert!(select_event("nonsense").is_none());
    }

    #[test]
    fn items_know_finished_and_mana() {
        let list: DragonItems = serde_json::from_value(json!({"data": {
            "3040": {"name": "Seraphs Umarmung", "tags": ["Mana", "SpellDamage"], "gold": {"total": 2900}},
            "4646": {"name": "Sturmflut", "tags": ["SpellDamage"], "gold": {"total": 2800}},
            "1058": {"name": "Riesiger Stab", "into": ["4646"], "gold": {"total": 1200}},
            "3020": {"name": "Zauberschuhe", "tags": ["Boots"], "gold": {"total": 1100}},
            "2003": {"name": "Trank", "tags": ["Consumable"], "gold": {"total": 50}},
            "3115": {"name": "Nashors Zahn", "tags": ["SpellDamage", "AttackSpeed", "OnHit"], "gold": {"total": 3000}},
            "3031": {"name": "Klinge", "tags": ["Damage", "CriticalStrike"], "gold": {"total": 3400}},
            "3075": {"name": "Dornenpanzer", "tags": ["Health", "Armor"], "gold": {"total": 2450}},
            "x": {"name": "kaputt"}
        }}))
        .unwrap();
        let items = items_of(list);
        assert_eq!(items.len(), 8);
        assert_eq!(items[&4646].kind, "ap");
        assert_eq!(items[&3115].kind, "ap");
        assert_eq!(items[&3031].kind, "ad");
        assert_eq!(items[&3075].kind, "tank");
        assert_eq!(items[&2003].kind, "other");
        assert!(items[&3040].done && items[&3040].mana);
        assert!(items[&4646].done && !items[&4646].mana);
        assert!(!items[&1058].done);
        assert!(!items[&3020].done);
        assert!(!items[&2003].done);
        // Tags only for finished items (the combos' themes), not sent for the rest.
        assert_eq!(items[&3031].tags, ["Damage", "CriticalStrike"]);
        assert!(items[&3020].tags.is_empty());
        let sent = serde_json::to_value(&items[&3020]).unwrap();
        assert!(sent.get("tags").is_none());
    }

    #[test]
    fn reads_arammetas_augment_list() {
        let list: MetaList = serde_json::from_value(json!({
            "patch_prefix": "16.19",
            "champs": {"12": {"g": 60574, "name_en": "Alistar", "top": {"kGold": []}}},
            "augs": {"1025": {
                "name_en": "Dive Bomber", "name": "x", "icon": "assets/icons/divebomber_large.png",
                "rarity": "kSilver", "cats": ["amp"], "wr": 0.49,
                "desc_en": "Explodes when you die, dealing massive true damage."
            }},
            "itemLut": {}
        }))
        .unwrap();
        assert_eq!(list.patch_prefix, "16.19");
        assert_eq!(list.champs["12"].g, 60574);
        let augment = &list.augs["1025"];
        assert_eq!(augment.name, "Dive Bomber");
        assert_eq!(augment.rarity, "kSilver");
        assert_eq!(augment.cats, ["amp"]);
        // Sent on to the app with plain field names.
        let sent = serde_json::to_value(augment).unwrap();
        assert_eq!(sent["name"], "Dive Bomber");
        assert_eq!(sent["icon"], "assets/icons/divebomber_large.png");
        // The English text goes along for the combos' themes (combos.ts).
        assert_eq!(
            sent["text"],
            "Explodes when you die, dealing massive true damage."
        );
        assert!(sent.get("wr").is_none());
    }

    #[test]
    fn item_texts_leave_out_items_taken_out_of_the_game() {
        let list: MetaList = serde_json::from_value(json!({"itemLut": {
            "3031": {"e": "Infinity Edge", "p": 3500, "de": "75 Attack Damage\n25% Critical Strike Chance"},
            "3095": {"e": "Deprecated item", "p": 3000, "de": "50 Attack Damage"},
            "x": {"e": "Kaputt", "de": "?"}
        }}))
        .unwrap();
        let texts = item_texts(&list);
        assert_eq!(texts.len(), 1);
        assert_eq!(texts[&3031].price, Some(3500));
        assert!(texts[&3031].text.starts_with("75 Attack Damage"));
        let sent = serde_json::to_value(&texts[&3031]).unwrap();
        assert_eq!(sent["price"], 3500);
    }

    #[test]
    fn tier_lists_keep_only_sound_entries() {
        let list: MetaList = serde_json::from_str(
            r#"{"patch_prefix":"16.19",
                "champs":{"12":{"g":3912,"wr":0.56,"name_en":"Alistar","alias":"Alistar","tags":["Tank"]},
                          "13":{"g":0,"wr":0.5,"name_en":"None","alias":"None"},
                          "14":{"g":10,"wr":0.5,"name_en":"Bad","alias":"../x"}},
                "augs":{"1001":{"name_en":"Goliath","rarity":"kPrismatic","icon":"assets/icons/g.png",
                                "desc_en":"Grow.","cats":["tank"],"wr":0.58,"g":8210},
                        "1002":{"name_en":"Odd","wr":1.5,"g":5}}}"#,
        )
        .unwrap();
        let tiers = tiers_of(&list);
        assert_eq!(tiers.patch, "16.19");
        assert_eq!(tiers.champions.len(), 1);
        assert_eq!(tiers.champions[0].alias, "Alistar");
        assert_eq!(tiers.augments.len(), 1);
        assert_eq!(tiers.augments[0].name, "Goliath");
        assert_eq!(tiers.augments[0].text, "Grow.");
    }

    /// Shaped like arammeta's tier-list.json of 08.10.2026, cut down.
    const FULL_LIST: &str = r#"{"patch_prefix":"16.20",
        "champs":{"1":{"name":"安妮","name_en":"Annie","alias":"Annie","tags":["Mage"],"wr":0.5126,
            "rawWr":0.5326,"g":858,"prevMix":0.7,"roleMeta":{},"skillScaling":{"pp":0,"z":0,"g":9376},
            "top":{"kPrismatic":[{"id":1045,"g":47,"wr":0.5602,"lift":0.0276,"score":-0.0134,
                "lcb":-0.0128,"pick":0.049,"peerPick":0.0603,"pickLift":-0.208,"slots":[{"g":6,"wr":0.6}]}],
                "kGold":[{"id":1068,"g":111,"wr":0.542,"lift":0.0094,"pick":0.071},{"id":9,"g":0,"wr":0.5}],
                "kOdd":[{"id":5,"g":5,"wr":0.5}]},
            "pairs":[{"id":120,"g":38,"wr":0.5,"expected":0.5783,"lift":0.014,"z":-0.936},
                     {"id":22,"g":50,"wr":0.46,"expected":7,"lift":0.0129,"z":-0.415}],
            "comp":{"phys":53.27,"magic":1696.434,"true":100.577,"front":0.54,"damage":0.89,
                "engage":0.99,"wave":0.9,"poke":0.9,"sustain":0.03,"cc":2.03,"odd":1}}},
        "augs":{"1045":{"name_en":"Goliath","rarity":"kPrismatic","icon":"assets/icons/g.png",
            "desc_en":"Grow.","cats":["tank"],"wr":0.58,"g":8210,"lift":-0.0097,"pick":0.1316,
            "sets":[],"displayTags":[3,1],"curG":8210}},
        "augCategories":{"order":["tank","gone"],"labels":{"tank":{"zh":"防守","en":"Defense"}},"newPatch":"16.20"},
        "tiers":{"order":["OP","T1"],"colors":{}},
        "itemLut":{"3089":{"e":"Rabadon's Deathcap","z":"x","p":3600,"dz":"x","de":"130 Ability Power","s":"ap","r":"Mage"},
                   "3047":{"e":"Plated Steelcaps","p":1200,"de":"Armor","s":null,"r":null},
                   "bad":{"e":"Bad","p":1}},
        "patchChanges":{"currentPatch":"16.20","baselinePatch":"16.19","currentGames":21259,
            "baselineGames":869021,"minHeroGames":500,
            "heroRisers":[{"id":412,"name_en":"Thresh","alias":"Thresh","current_wr":0.4623,
                "baseline_wr":0.4394,"delta":0.0229,"current_games":1466,"baseline_games":64104,
                "current_tier":"T4","baseline_tier":"T5"}],
            "heroFallers":[],
            "itemFallers":[{"id":3504,"name_en":"Ardent Censer","current_wr":0.4886,"baseline_wr":0.5287,
                "current_games":3009,"baseline_games":129595}],
            "champAugRisers":[{"champ":{"id":105,"name_en":"Fizz","alias":"Fizz"},
                "augment":{"id":1151,"name_en":"Bread and Cheese","rarity":"kGold"},
                "current_wr":0.6039,"baseline_wr":0.4904,"current_lift":0.1015,"current_games":144,
                "baseline_games":6027,"current_pick":0.0992}]},
        "searchIndex":{"related":{"augments":{"Goliath":[2,5,6],"巨人":[2]},"items":{}}},
        "team_score":{"kind":"logit_v2"},"draftModel":{"kind":"composition_lr"},"ddv":"16.20.1"}"#;

    #[test]
    fn the_mayhem_pages_get_every_part_of_the_list() {
        let list: MetaList = serde_json::from_str(FULL_LIST).unwrap();
        let tiers = serde_json::to_value(tiers_of(&list)).unwrap();
        let annie = &tiers["champions"][0];
        // Per rarity in a fixed order, entries without games and unknown rarities left out.
        assert_eq!(annie["top"].as_array().unwrap().len(), 2);
        assert_eq!(annie["top"][0]["rarity"], "kPrismatic");
        assert_eq!(annie["top"][1]["id"], 1068);
        assert_eq!(annie["pairs"][0]["games"], 38);
        assert_eq!(annie["pairs"][1]["expected"], Value::Null);
        assert_eq!(annie["comp"].as_object().unwrap().len(), 10);
        assert_eq!(annie["comp"]["cc"], 2.03);
        let goliath = &tiers["augments"][0];
        assert_eq!(goliath["pick"], 0.1316);
        assert_eq!(goliath["champions"], json!([2, 5, 6]));
        assert_eq!(
            tiers["categories"],
            json!([{"id": "tank", "label": "Defense"}])
        );
        let mut items = tiers["items"].as_array().unwrap().clone();
        items.sort_by_key(|i| i["id"].as_u64());
        assert_eq!(items.len(), 2);
        assert_eq!(items[0]["role"], Value::Null);
        assert_eq!(items[1]["price"], 3600);
        let changes = &tiers["changes"];
        assert_eq!(changes["baselineGames"], 869021);
        assert_eq!(changes["champions"]["risers"][0]["currentTier"], "T4");
        assert_eq!(changes["items"]["fallers"][0]["name"], "Ardent Censer");
        let pair = &changes["championAugments"]["risers"][0];
        assert_eq!(
            (&pair["id"], &pair["champion"]),
            (&json!(1151), &json!(105))
        );
    }

    /// The real list from arammeta.com: every part the pages show arrives. `cargo test -- --ignored`.
    #[test]
    #[ignore = "lädt die echte Liste von arammeta.com"]
    fn the_real_list_has_every_part() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let tiers = runtime.block_on(mayhem_tiers()).unwrap();
        assert!(tiers.champions.len() > 100 && tiers.augments.len() > 100);
        assert!(tiers.champions.iter().all(|c| c.comp.len() == COMP.len()));
        assert!(tiers
            .champions
            .iter()
            .all(|c| !c.top.is_empty() && !c.pairs.is_empty()));
        assert!(
            tiers
                .augments
                .iter()
                .filter(|a| !a.champions.is_empty())
                .count()
                > 100
        );
        assert!(tiers.items.len() > 50 && tiers.categories.len() > 5);
        let changes = tiers.changes.unwrap();
        assert!(!changes.champions.risers.is_empty() && !changes.champion_items.risers.is_empty());
    }

    #[test]
    fn a_changed_extra_field_keeps_the_champ_cards_list() {
        // blank.'s champ card reads the same list: new parts in another shape only drop out.
        let list: MetaList = serde_json::from_str(
            r#"{"patch_prefix":"16.20","champs":{"1":{"g":5,"name_en":"Annie","alias":"Annie",
                "top":"soon","pairs":{"x":1},"comp":[1]}},
                "augs":{"1":{"name_en":"Goliath","wr":0.5,"g":3,"pick":"often"}},
                "itemLut":[1],"patchChanges":7,"searchIndex":null,"augCategories":"x"}"#,
        )
        .unwrap();
        assert_eq!(list.champs["1"].g, 5);
        assert!(list.champs["1"].top.is_empty() && list.champs["1"].pairs.is_empty());
        assert_eq!(list.augs["1"].pick, None);
        assert!(list.items.is_empty() && list.changes.is_none());
    }

    #[test]
    fn only_plain_versions_go_into_the_address() {
        assert!(valid_version("15.20.1"));
        assert!(!valid_version("15.20"));
        assert!(!valid_version("../x.1.1"));
        assert!(!valid_version("15.20.1/../../"));
    }

    /// blank. keeps German item names; only the Mayhem app asks for English ones.
    #[test]
    fn item_names_are_english_only_when_asked() {
        assert_eq!(item_locale(None), "de_DE");
        assert_eq!(item_locale(Some(false)), "de_DE");
        assert_eq!(item_locale(Some(true)), "en_US");
    }
}
