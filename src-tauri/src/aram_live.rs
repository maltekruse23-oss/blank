//! Champ-Karte (user's wish "erkennt den Champ, den man spielt, und zeigt die passenden Augments und
//! Builds"): while the League client runs and the card is switched on, blank. listens to the
//! client's own event stream for exactly one thing, the champion select of an ARAM Mayhem game, and
//! tells the app window which champion the user holds (event `aram-champ`). Read-only: one
//! WebSocket to 127.0.0.1 with the lockfile's password (like every other look at the client),
//! subscribed to the champion select only; nothing is sent to the client except that subscription,
//! nothing is triggered, the game itself is never touched. No polling: the client reports changes.
//!
//! `aram_champ_info` then reads what the card shows: the champion's public stats from the website
//! (nothing personal is sent, only the champion's number) and the item list from Data Dragon (name,
//! finished or not, mana), reduced here.
use super::{champion_names, lockfile, parse_lockfile, Lcu, MAYHEM_QUEUE, SESSION};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    sync::atomic::{AtomicBool, AtomicI64, Ordering},
    time::Duration,
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

/// The card is switched on (setting `popoutChamp`, told by the app window).
static WANTED: AtomicBool = AtomicBool::new(false);
/// One connection at a time.
static LISTENING: AtomicBool = AtomicBool::new(false);
/// The last champion told to the app (0: none), so the same pick is told once.
static TOLD: AtomicI64 = AtomicI64::new(0);

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
}

/// The user's champion in a champion select event (`data` of the event), if one is held.
fn my_champion(data: &Value) -> Option<i64> {
    let session = SelectSession::deserialize(data).ok()?;
    session
        .my_team
        .iter()
        .find(|cell| cell.cell_id == session.local_player_cell_id)
        .map(|cell| cell.champion_id)
        .filter(|id| (1..100_000).contains(id))
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
        let _ = app.emit_to("main", EVENT_NAME, champ);
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

/// The app window switches the card on or off (setting `popoutChamp`).
#[tauri::command]
pub fn aram_champ_watch(app: AppHandle, on: bool) {
    WANTED.store(on, Ordering::Relaxed);
    if on {
        listen(&app);
    }
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
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChampInfo {
    /// The website's `/api/champions/<id>` as it came (checked in the app); None: no games yet.
    champion: Option<String>,
    /// The website's `/api/augments` (names and rarity).
    augments: Option<String>,
    items: HashMap<u32, ItemInfo>,
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
            Some((
                id,
                ItemInfo {
                    name: item.name,
                    done,
                    mana,
                },
            ))
        })
        .collect()
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
    let (champion, augments, items) = tokio::join!(
        fetch(&http, &champion_url),
        fetch(&http, &augments_url),
        fetch(&http, &items_url),
    );
    let items = match items? {
        Some(bytes) => items_of(
            serde_json::from_slice(&bytes).map_err(|_| "Item-Liste nicht lesbar.".to_string())?,
        ),
        None => HashMap::new(),
    };
    Ok(ChampInfo {
        champion: text(champion?),
        augments: text(augments.unwrap_or(None)),
        items,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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
            "x": {"name": "kaputt"}
        }}))
        .unwrap();
        let items = items_of(list);
        assert_eq!(items.len(), 5);
        assert!(items[&3040].done && items[&3040].mana);
        assert!(items[&4646].done && !items[&4646].mana);
        assert!(!items[&1058].done);
        assert!(!items[&3020].done);
        assert!(!items[&2003].done);
    }

    #[test]
    fn only_plain_versions_go_into_the_address() {
        assert!(valid_version("15.20.1"));
        assert!(!valid_version("15.20"));
        assert!(!valid_version("../x.1.1"));
        assert!(!valid_version("15.20.1/../../"));
    }
}
