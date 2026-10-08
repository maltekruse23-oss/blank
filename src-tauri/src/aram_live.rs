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
//! back unchanged) and the own summoner spells (`spells_for`: Snowball plus Flash, exceptions with a
//! reason in `SPELL_EXCEPTIONS`; once the user changes them, nothing more in that select).
use super::{champion_names, lockfile, parse_lockfile, Lcu, MAYHEM_QUEUE, SESSION};
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

/// The spells blank. sets for a champion, from the user's (D, F): Snowball and Flash (or the
/// champion's exception); Flash, or else the spell that is not Snowball, keeps its key.
fn spells_for(champion: i64, (d, f): (i64, i64)) -> (i64, i64) {
    let main = SPELL_EXCEPTIONS
        .iter()
        .find(|(id, ..)| *id == champion)
        .map_or(FLASH, |(_, spell, _)| *spell);
    if f == FLASH || (d != FLASH && d == SNOWBALL) {
        (SNOWBALL, main)
    } else {
        (main, SNOWBALL)
    }
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
    let want = spells_for(champion, now);
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
    }
    let Ok(Some(lcu)) = Lcu::connect() else {
        return false;
    };
    lcu.get::<Session>(SESSION)
        .await
        .is_ok_and(|s| s.game_data.queue.id == MAYHEM_QUEUE)
}

/// The app window switches the card on or off (setting `popoutChamp`), and the writes into the
/// client (`champItemSet`, `champSpells`; the Mayhem app leaves them out: off).
#[tauri::command]
pub fn aram_champ_watch(app: AppHandle, on: bool, item_set: Option<bool>, spells: Option<bool>) {
    ITEM_SET_WANTED.store(on && item_set == Some(true), Ordering::Relaxed);
    SPELLS_WANTED.store(on && spells == Some(true), Ordering::Relaxed);
    WANTED.store(on, Ordering::Relaxed);
    if on {
        listen(&app);
    }
}

/// The item set of a build: its core, then the further items of the direction.
fn item_set(
    champion: i64,
    direction: &str,
    core: &[u32],
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
    if core.is_empty() || core.len() > 6 || more.len() > 12 || !core.iter().chain(more).all(item) {
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

/// Writes the item set of the chosen build for the champion held in the ARAM Mayhem champion
/// select (only then, and only with the switch on; otherwise nothing happens).
#[tauri::command]
pub async fn aram_item_set(
    champion_id: i64,
    direction: String,
    core: Vec<u32>,
    more: Vec<u32>,
) -> Result<(), String> {
    if !ITEM_SET_WANTED.load(Ordering::Relaxed)
        || champion_id <= 0
        || TOLD.load(Ordering::Relaxed) != champion_id
    {
        return Ok(());
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos());
    let set =
        item_set(champion_id, &direction, &core, &more, stamp).ok_or("Ungültiges Item-Set")?;
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
}

/// An augment as arammeta lists it (English name; rarity kSilver/kGold/kPrismatic; categories
/// like "ap", "ad", "tank"; icon path on arammeta.com).
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
    #[serde(rename(deserialize = "desc_en"), skip_serializing)]
    text: String,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct MetaList {
    patch_prefix: String,
    champs: HashMap<String, MetaChamp>,
    augs: HashMap<String, MetaAugment>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct MetaChamp {
    g: u32,
    wr: f64,
    name_en: String,
    alias: String,
    tags: Vec<String>,
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
    })
}

/// One champion of the Mayhem app's tier list (arammeta's numbers over all its Mayhem games).
#[derive(Serialize)]
pub struct TierChampion {
    id: u32,
    name: String,
    alias: String,
    tags: Vec<String>,
    wr: f64,
    games: u32,
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
}

#[derive(Serialize)]
pub struct Tiers {
    patch: String,
    champions: Vec<TierChampion>,
    augments: Vec<TierAugment>,
}

/// Every champion and augment with arammeta's win rate and games (Mayhem app, tier lists). The
/// app ranks them itself; this only reads the list the champ card already keeps.
#[tauri::command]
pub async fn mayhem_tiers() -> Result<Tiers, String> {
    let http = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(30))
        .user_agent(concat!("blank/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;
    let list = meta_list(&http)
        .await
        .ok_or_else(|| "arammeta.com antwortet nicht.".to_string())?;
    Ok(tiers_of(&list))
}

fn tiers_of(list: &MetaList) -> Tiers {
    let short = |text: &str, max: usize| text.chars().take(max).collect::<String>();
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
            })
        })
        .collect();
    Tiers {
        patch: short(&list.patch_prefix, 12),
        champions,
        augments,
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

/// The champion's stats from the website and the items from Data Dragon (`version`: the app's).
#[tauri::command]
pub async fn aram_champ_info(champion_id: u32, version: String) -> Result<ChampInfo, String> {
    if !(1..100_000).contains(&champion_id) || !valid_version(&version) {
        return Err("Ungültige Anfrage.".into());
    }
    let http = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(20))
        .user_agent(concat!("blank/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;
    let text = |bytes: Option<Vec<u8>>| bytes.and_then(|b| String::from_utf8(b).ok());
    let champion_url = format!("{SITE}/api/champions/{champion_id}");
    let augments_url = format!("{SITE}/api/augments");
    let items_url = format!("{DDRAGON}/{version}/data/de_DE/item.json");
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
    fn spells_keep_flash_on_its_key() {
        // Flash on D or F stays there, Snowball takes the other key.
        assert_eq!(spells_for(12, (FLASH, 7)), (FLASH, SNOWBALL));
        assert_eq!(spells_for(12, (14, FLASH)), (SNOWBALL, FLASH));
        assert_eq!(spells_for(12, (FLASH, SNOWBALL)), (FLASH, SNOWBALL));
        assert_eq!(spells_for(12, (SNOWBALL, FLASH)), (SNOWBALL, FLASH));
        // Without Flash: Snowball keeps its key, else Flash goes on D.
        assert_eq!(spells_for(12, (SNOWBALL, 3)), (SNOWBALL, FLASH));
        assert_eq!(spells_for(12, (3, 21)), (FLASH, SNOWBALL));
        // Singed takes Ghost where Flash was; never Exhaust (3) or Barrier (21).
        assert_eq!(spells_for(27, (14, FLASH)), (SNOWBALL, GHOST));
        for (_, spell, reason) in SPELL_EXCEPTIONS {
            assert!(![3, 21].contains(spell) && !reason.is_empty());
        }
    }

    #[test]
    fn item_sets_replace_only_blanks_own_for_the_champion() {
        let set = item_set(12, "ap", &[3089, 6655], &[3157], 7).unwrap();
        assert_eq!(set["title"], "blank. AP");
        assert_eq!(set["blocks"][0]["items"][1]["id"], "6655");
        assert_eq!(set["blocks"][1]["type"], "Danach");
        assert!(item_set(12, "mana", &[3089], &[], 7).is_none());
        assert!(item_set(12, "ap", &[], &[], 7).is_none());
        assert!(item_set(12, "ap", &[0], &[], 7).is_none());
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
    }

    #[test]
    fn reads_arammetas_augment_list() {
        let list: MetaList = serde_json::from_value(json!({
            "patch_prefix": "16.19",
            "champs": {"12": {"g": 60574, "name_en": "Alistar", "top": {"kGold": []}}},
            "augs": {"1025": {
                "name_en": "Dive Bomber", "name": "x", "icon": "assets/icons/divebomber_large.png",
                "rarity": "kSilver", "cats": ["amp"], "wr": 0.49
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

    #[test]
    fn only_plain_versions_go_into_the_address() {
        assert!(valid_version("15.20.1"));
        assert!(!valid_version("15.20"));
        assert!(!valid_version("../x.1.1"));
        assert!(!valid_version("15.20.1/../../"));
    }
}
