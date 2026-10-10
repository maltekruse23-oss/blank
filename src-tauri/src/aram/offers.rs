//! Augment offers in an ARAM Mayhem game (Etappe 2b, MAYHEM-BERATER.md 6; user's wish "Augments im
//! Spiel sofort erkennen, auch Reroll"). Riot gives the three offered cards through no interface,
//! so while one may be open blank. reads them off the screen: a capture of the League game window
//! only (a band in its middle), Windows' own text recognition (`Windows.Media.Ocr`), the names
//! matched against the client's augment list in the client's language. Only with the switch on
//! (`champOffers`), only in a Mayhem game; nothing is typed into the game, nothing read from its
//! memory. The game's level comes from its Live Client Data (127.0.0.1:2999, read-only) once a
//! second; after each level-up (and at the start) the screen is read every 250 ms until the cards
//! are gone, at most 60 s. The app hears `aram-offers` (an empty list: the offer closed).
//! Which card was taken (Etappe 3a, user's order 08.10.2026, display only): when the others vanish
//! before it, or a click on its row on the card (`aram_offer_taken`); checked against the game's
//! real augments afterwards, a mismatch goes into the local error log.
//! Only borderless or windowed: a capture of an exclusive full-screen game is black.
//! The Mayhem app reads the offers in every ARAM Mayhem game (user's decision 10.10.2026: all
//! automatic, it has no settings; `always_on` from mayhem.rs) and hears `aram-offers` in its own
//! window; blank. only with its switch.
//! Hardened like the overlays that do the same (aram-mayhem-overlay, aramgg_client, Hexgate): a
//! set of cards counts only when two readings in a row agree (`agreed`); when the band gives fewer
//! than three cards, each title is read again in its own enlarged crop (`title_crops`); the
//! recognition reads the client's language (`/riotclient/region-locale`, read-only) when Windows
//! has it installed, else Windows' own languages.
//! Fixed GET paths of the client here: `/lol-game-data/assets/v1/cherry-augments.json`,
//! `/riotclient/region-locale`.
//! Each reading also gives where a card's name was read; the overlay over the game (Mayhem app,
//! overlay.rs) puts its badges there while the cards told are on screen.

use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, MutexGuard,
    },
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use super::{client::Lcu, games::CherryAugment, live, GAME_EXE};

pub(crate) use screen::game_area;

/// Where a card's name was read: its centre and top, as parts of the game window's width and height.
type Spot = (f32, f32);

static WANTED: AtomicBool = AtomicBool::new(false);
/// The Mayhem app: offers are read in every ARAM Mayhem game, no switch.
static ALWAYS: AtomicBool = AtomicBool::new(false);
static RUNNING: AtomicBool = AtomicBool::new(false);
static GAME: Mutex<Game> = Mutex::new(Game::new(0));

/// The followed game's offers, only in memory.
struct Game {
    id: u64,
    /// Every card of the offer open now or last (rerolls included).
    round: Vec<Offer>,
    /// The cards on screen now (empty: no offer open).
    showing: Vec<Offer>,
    /// The cards taken so far, in order.
    taken: Vec<Offer>,
}

impl Game {
    const fn new(id: u64) -> Self {
        Game {
            id,
            round: Vec::new(),
            showing: Vec::new(),
            taken: Vec::new(),
        }
    }
}

fn game() -> MutexGuard<'static, Game> {
    GAME.lock().unwrap_or_else(|p| p.into_inner())
}

const LIVE: &str = "https://127.0.0.1:2999/liveclientdata/activeplayer";
/// The client's language, for the recognition (the augment names are in it).
const LOCALE: &str = "/riotclient/region-locale";
/// Cards in one offer.
const CARDS: usize = 3;
const EVENT: &str = "aram-offers";
const LOOK_EVERY: Duration = Duration::from_millis(250);
const LOOK_AT_MOST: Duration = Duration::from_secs(60);
/// No card this long before any was seen: no offer at this level.
const NONE_WITHIN: Duration = Duration::from_secs(4);
/// No card this long after cards were seen: one was taken.
const GONE_AFTER: Duration = Duration::from_secs(2);
/// The game's Live Client Data did not answer this long after it had: the game is over.
const LIVE_GONE: Duration = Duration::from_secs(30);

/// The switch "Augments im Spiel erkennen" (`champOffers`, told with `aram_champ_watch`).
pub(super) fn set_wanted(on: bool) {
    WANTED.store(on, Ordering::Relaxed);
}

/// The Mayhem app (mayhem.rs, at its start): offers in every ARAM Mayhem game.
pub fn always_on() {
    ALWAYS.store(true, Ordering::Relaxed);
}

pub(super) fn wanted() -> bool {
    ALWAYS.load(Ordering::Relaxed) || WANTED.load(Ordering::Relaxed)
}

#[derive(Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
struct Offer {
    id: u32,
    name: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Offers {
    /// The champion picked in the champion select (0 if blank. did not see it).
    champion_id: i64,
    /// The build chosen on the Champ-Karte, if any ("ap", "ad", "tank").
    direction: Option<String>,
    offers: Vec<Offer>,
    /// The cards taken so far in this game, as far as known.
    taken: Vec<Offer>,
}

/// A Mayhem game started (after_game.rs): follow its offers until it ends.
pub(super) fn follow(app: &AppHandle, game_id: u64) {
    if !wanted() || RUNNING.swap(true, Ordering::Relaxed) {
        return;
    }
    *game() = Game::new(game_id);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = run(&app).await {
            crate::errors::record("Augment-Angebote", &error);
        }
        RUNNING.store(false, Ordering::Relaxed);
    });
}

async fn run(app: &AppHandle) -> Result<(), String> {
    let lcu = Lcu::connect()?.ok_or(super::NOT_OPEN)?;
    let names = Arc::new(augment_names(&lcu).await?);
    let language = client_language(&lcu).await;
    let http = reqwest::Client::builder()
        // The game's own certificate for 127.0.0.1, accepted for this local connection only.
        .tls_danger_accept_invalid_certs(true)
        .no_proxy()
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|e| e.to_string())?;
    let mut level = 0;
    let mut answered = None::<Instant>;
    loop {
        if !wanted() || crate::pc::program_pids(GAME_EXE).is_empty() {
            return Ok(());
        }
        match game_level(&http).await {
            Some(now) => {
                answered = Some(Instant::now());
                if now > level {
                    level = now;
                    look(app, &names, language.as_deref()).await;
                }
            }
            None if answered.is_some_and(|t| t.elapsed() > LIVE_GONE) => return Ok(()),
            None => {}
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}

async fn game_level(http: &reqwest::Client) -> Option<u32> {
    #[derive(Deserialize)]
    struct Player {
        level: u32,
    }
    let player: Player = http.get(LIVE).send().await.ok()?.json().await.ok()?;
    Some(player.level)
}

/// The client's augments with their names in its language, as compared (`plain`).
async fn augment_names(lcu: &Lcu) -> Result<Vec<(u32, String, String)>, String> {
    let list: Vec<CherryAugment> = lcu
        .get("/lol-game-data/assets/v1/cherry-augments.json")
        .await?;
    Ok(list
        .into_iter()
        .map(|a| (a.id, plain(&a.name), a.name.chars().take(80).collect()))
        .filter(|(_, p, _)| p.chars().count() >= 4)
        .collect())
}

/// The client's language as a tag for the recognition; None when it does not answer.
async fn client_language(lcu: &Lcu) -> Option<String> {
    #[derive(Deserialize)]
    struct RegionLocale {
        locale: String,
    }
    let answer: RegionLocale = lcu.get(LOCALE).await.ok()?;
    language_tag(&answer.locale)
}

/// The client's locale ("de_DE") as a language tag ("de-DE"); anything else is not used.
fn language_tag(locale: &str) -> Option<String> {
    let (language, region) = locale.split_once('_')?;
    let ok = (2..=3).contains(&language.len())
        && language.bytes().all(|b| b.is_ascii_lowercase())
        && region.len() == 2
        && region.bytes().all(|b| b.is_ascii_uppercase());
    ok.then(|| format!("{language}-{region}"))
}

/// Reads the screen while an offer may be open and tells the app each new set of cards.
async fn look(app: &AppHandle, names: &Arc<Vec<(u32, String, String)>>, language: Option<&str>) {
    let started = Instant::now();
    let mut seen = None::<Instant>;
    let mut told: Vec<Offer> = Vec::new();
    let mut last: Vec<Offer> = Vec::new();
    // Each different set of cards read in this round, in order.
    let mut readings: Vec<Vec<Offer>> = Vec::new();
    // Readings in a row without all the cards told (the overlay goes at the second).
    let mut missing = 0u32;
    while started.elapsed() < LOOK_AT_MOST && wanted() {
        let (names, language) = (Arc::clone(names), language.map(str::to_owned));
        let read = tauri::async_runtime::spawn_blocking(move || {
            screen::read_offers(&names, language.as_deref())
        })
        .await
        .unwrap_or_default();
        let spots: Vec<(u32, Spot)> = read.iter().map(|(o, at)| (o.id, *at)).collect();
        let found: Vec<Offer> = read.into_iter().map(|(o, _)| o).collect();
        if !found.is_empty() {
            seen = Some(Instant::now());
        } else if seen.map_or(started.elapsed() > NONE_WITHIN, |t| {
            t.elapsed() > GONE_AFTER
        }) {
            break;
        }
        let same = agreed(&mut last, found);
        if let Some(cards) = same.as_ref().filter(|cards| **cards != told) {
            if told.is_empty() {
                game().round.clear();
            }
            told.clone_from(cards);
            tell(app, told.clone());
        }
        remember(&mut readings, &told, &last, same.is_some());
        // The overlay shows the cards told while all of them are on screen; a single misread
        // keeps it, the second goes (a pick, a reroll turning its card).
        let all_there = !told.is_empty() && told.iter().all(|c| last.contains(c));
        missing = if all_there { 0 } else { missing + 1 };
        if all_there {
            crate::overlay::cards(app, live::chosen().0, spots);
        } else if missing == 2 {
            crate::overlay::cards(app, 0, Vec::new());
        }
        tokio::time::sleep(LOOK_EVERY).await;
    }
    crate::overlay::cards(app, 0, Vec::new());
    if !told.is_empty() {
        if let Some(card) = taken_of(&readings) {
            let mut game = game();
            // A card of this round marked by a click stays the user's word.
            if !game.round.iter().any(|o| game.taken.contains(o)) {
                game.taken.push(card.clone());
            }
        }
        tell(app, Vec::new());
    }
}

/// A reading counts once the next one agrees: a single misread frame is never told.
fn agreed(last: &mut Vec<Offer>, now: Vec<Offer>) -> Option<Vec<Offer>> {
    let same = !now.is_empty() && *last == now;
    *last = now;
    same.then(|| last.clone())
}

/// The readings `taken_of` sees: each agreed set, and at once a lone card of the cards told (the
/// card left after a pick may be on screen too briefly to be read twice).
fn remember(readings: &mut Vec<Vec<Offer>>, told: &[Offer], now: &[Offer], agreed: bool) {
    let lone = matches!(now, [card] if told.contains(card));
    if (agreed || lone) && readings.last().map(Vec::as_slice) != Some(now) {
        readings.push(now.to_vec());
    }
}

/// The card taken in a round: the last reading shows only it, after a reading with it among
/// others (the other cards vanished first). Anything else is unknown.
fn taken_of(readings: &[Vec<Offer>]) -> Option<&Offer> {
    let (last, before) = readings.split_last()?;
    let [card] = last.as_slice() else {
        return None;
    };
    before
        .iter()
        .any(|r| r.len() > 1 && r.contains(card))
        .then_some(card)
}

/// A click on an offered row of the card (fallback when the screen did not tell): that card is
/// taken, a second click undoes it. Only cards of the offer open now or last count.
#[tauri::command]
pub fn aram_offer_taken(app: AppHandle, id: u32) {
    let showing = {
        let mut game = game();
        let Some(card) = game.round.iter().find(|o| o.id == id).cloned() else {
            return;
        };
        match game.taken.iter().position(|o| o.id == id) {
            Some(at) => drop(game.taken.remove(at)),
            None => game.taken.push(card),
        }
        game.showing.clone()
    };
    tell(&app, showing);
}

/// The game ended (after_game.rs, with its real augments): a recognised list that differs is
/// noted in the local error log, so a test shows whether the recognition works. Once per game.
pub(super) fn check_taken(game_id: u64, real: &[u32]) {
    let taken: Vec<u32> = {
        let mut game = game();
        if game_id == 0 || game.id != game_id {
            return;
        }
        game.id = 0;
        game.taken.iter().map(|o| o.id).collect()
    };
    if let Some(line) = mismatch(&taken, real) {
        crate::errors::record("Augment-Erkennung", &format!("Spiel {game_id}: {line}"));
    }
}

/// Recognised and real augments compared as sets; None when they agree.
fn mismatch(taken: &[u32], real: &[u32]) -> Option<String> {
    let same = taken.len() == real.len() && taken.iter().all(|id| real.contains(id));
    (!same).then(|| format!("erkannt {taken:?}, tatsächlich {real:?}"))
}

fn tell(app: &AppHandle, offers: Vec<Offer>) {
    let taken = {
        let mut game = game();
        for card in &offers {
            if !game.round.contains(card) {
                game.round.push(card.clone());
            }
        }
        game.showing.clone_from(&offers);
        game.taken.clone()
    };
    let (champion_id, direction) = live::chosen();
    let offers = Offers {
        champion_id,
        direction,
        offers,
        taken,
    };
    // blank.'s window, or the Mayhem app's (mayhem.rs); only one of them exists.
    for window in ["main", crate::mayhem::WINDOW] {
        let _ = app.emit_to(window, EVENT, offers.clone());
    }
}

/// Lowercase letters and digits only: what the recognition reliably gives back.
fn plain(text: &str) -> String {
    text.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

/// Per column of text (one card each, with where its top line is), the augment whose name it
/// contains and where, left to right. A name counts with up to one wrong letter in eight
/// (`ponytail:` substitutions only; letters the recognition drops or adds are not forgiven – widen
/// to an edit distance if names get missed).
fn matched(columns: &[(f32, f32, String)], names: &[(u32, String, String)]) -> Vec<(Offer, Spot)> {
    let mut out: Vec<(Offer, Spot)> = Vec::new();
    for (x, top, column) in columns {
        let text: Vec<char> = plain(column).chars().collect();
        let best = names
            .iter()
            .filter(|(_, name, _)| contains(&text, name))
            .max_by_key(|(_, name, _)| name.chars().count());
        if let Some((id, _, name)) = best {
            if !out.iter().any(|(o, _)| o.id == *id) {
                let offer = Offer {
                    id: *id,
                    name: name.clone(),
                };
                out.push((offer, (*x, *top)));
            }
        }
    }
    out
}

fn contains(text: &[char], name: &str) -> bool {
    let name: Vec<char> = name.chars().collect();
    let allowed = name.len() / 8;
    name.len() <= text.len()
        && text
            .windows(name.len())
            .any(|window| window.iter().zip(&name).filter(|(a, b)| a != b).count() <= allowed)
}

/// Lines of text side by side (x centre, top, text) grouped into columns, each read top to bottom,
/// with where its top line is (the card's name: its picture has no text).
fn columns_of(mut lines: Vec<(f32, f32, String)>, width: f32) -> Vec<(f32, f32, String)> {
    lines.sort_by(|a, b| a.0.total_cmp(&b.0));
    let mut groups: Vec<Vec<(f32, f32, String)>> = Vec::new();
    for line in lines {
        match groups.last_mut() {
            Some(group) if line.0 - group[group.len() - 1].0 < width * 0.12 => group.push(line),
            _ => groups.push(vec![line]),
        }
    }
    groups
        .into_iter()
        .map(|mut group| {
            group.sort_by(|a, b| a.1.total_cmp(&b.1));
            let (x, top) = (group[0].0, group[0].1);
            let text = group.into_iter().map(|l| l.2).collect::<Vec<_>>().join(" ");
            (x, top, text)
        })
        .collect()
}

/// The band of the game window where the cards are (x, y, width, height in client pixels).
fn band(w: i32, h: i32) -> (i32, i32, i32, i32) {
    (w / 10, h * 15 / 100, w * 8 / 10, h * 60 / 100)
}

/// The three card titles inside the band (x, y, width, height in its pixels), left to right, for a
/// game window of `w` × `h`: the cards sit in the middle and 0.34 h to each side, a title 0.145 h
/// to each side of its card's centre, between 35 and 45 % of the height (as aram-mayhem-overlay
/// measured them).
fn title_crops(w: i32, h: i32) -> Vec<(i32, i32, i32, i32)> {
    let (x, y, width, height) = band(w, h);
    let (middle, h) = (w as f32 / 2.0, h as f32);
    let top = ((h * 0.35) as i32 - y).max(0);
    let bottom = ((h * 0.45) as i32 - y).min(height);
    [-1.0f32, 0.0, 1.0]
        .into_iter()
        .filter_map(|side| {
            let centre = middle + side * 0.34 * h;
            let left = ((centre - 0.145 * h) as i32 - x).max(0);
            let right = ((centre + 0.145 * h) as i32 - x).min(width);
            (right > left && bottom > top).then_some((left, top, right - left, bottom - top))
        })
        .collect()
}

/// A part of a BGRA image (`width` pixels a row), each pixel `scale` × `scale` times
/// (`ponytail:` nearest pixel; smooth scaling if titles still get missed).
fn enlarged(pixels: &[u8], width: u32, crop: (i32, i32, i32, i32), scale: u32) -> Vec<u8> {
    let [x, y, w, h] = [crop.0, crop.1, crop.2, crop.3].map(|v| v.max(0) as usize);
    let (width, scale) = (width as usize, scale as usize);
    let mut out = Vec::with_capacity(w * h * scale * scale * 4);
    for row in y..y + h {
        let mut line = Vec::with_capacity(w * scale * 4);
        for col in x..x + w {
            let at = (row * width + col) * 4;
            for _ in 0..scale {
                line.extend_from_slice(&pixels[at..at + 4]);
            }
        }
        for _ in 0..scale {
            out.extend_from_slice(&line);
        }
    }
    out
}

mod screen {
    //! The capture of the game window's middle and its text, on a blocking thread.
    use super::{Offer, Spot};
    use windows::{
        core::HSTRING,
        Globalization::Language,
        Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap},
        Media::Ocr::OcrEngine,
        Storage::Streams::DataWriter,
        Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED},
    };
    use windows_sys::Win32::{
        Foundation::{POINT, RECT},
        Graphics::Gdi::{
            BitBlt, ClientToScreen, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC,
            DeleteObject, GetDC, GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER,
            BI_RGB, DIB_RGB_COLORS, SRCCOPY,
        },
        UI::WindowsAndMessaging::{FindWindowW, GetClientRect, IsIconic},
    };

    /// The game window's class and title.
    const CLASS: &str = "RiotWindowClass";
    const TITLE: &str = "League of Legends (TM) Client";

    /// The cards on screen now, left to right, with where each name is (empty: none, or nothing
    /// readable).
    pub(super) fn read_offers(
        names: &[(u32, String, String)],
        language: Option<&str>,
    ) -> Vec<(Offer, Spot)> {
        read(names, language).unwrap_or_default()
    }

    fn read(names: &[(u32, String, String)], language: Option<&str>) -> Option<Vec<(Offer, Spot)>> {
        let (pixels, w, h) = capture()?;
        let (left, top, width, height) = super::band(w, h);
        let (width, height) = (width as u32, height as u32);
        // From pixels of the band to parts of the game window.
        let at = |cards: Vec<(Offer, Spot)>| {
            let window = |(x, y): Spot| ((left as f32 + x) / w as f32, (top as f32 + y) / h as f32);
            cards.into_iter().map(|(o, s)| (o, window(s))).collect()
        };
        // SAFETY: plain COM initialisation of this thread; a second call only reports it was done.
        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        let engine = engine(language).ok()?;
        let band = recognize(&engine, &pixels, width, height)
            .map(|lines| super::matched(&super::columns_of(lines, width as f32), names))
            .unwrap_or_default();
        if band.len() >= super::CARDS {
            return Some(at(band));
        }
        // The band missed a card (small text, a busy background): each title on its own, enlarged.
        let max = OcrEngine::MaxImageDimension().ok()?;
        let titles: Vec<(f32, f32, String)> = super::title_crops(w, h)
            .into_iter()
            .filter_map(|crop| {
                let scale = if crop.2.max(crop.3) as u32 * 2 <= max {
                    2
                } else {
                    1
                };
                let image = super::enlarged(&pixels, width, crop, scale);
                let (cw, ch) = (crop.2 as u32 * scale, crop.3 as u32 * scale);
                let lines = recognize(&engine, &image, cw, ch).ok()?;
                let first = lines.iter().map(|l| l.1).reduce(f32::min).unwrap_or(0.0);
                let (x, y) = (crop.0 as f32 + crop.2 as f32 / 2.0, crop.1 as f32);
                let text = lines.into_iter().map(|l| l.2).collect::<Vec<_>>().join(" ");
                Some((x, y + first / scale as f32, text))
            })
            .collect();
        let by_title = super::matched(&titles, names);
        Some(at(if by_title.len() > band.len() {
            by_title
        } else {
            band
        }))
    }

    /// The game window's client area on screen (x, y, width, height in pixels); None when it is
    /// not there or minimized.
    pub(crate) fn game_area() -> Option<(i32, i32, i32, i32)> {
        let (class, title) = (wide(CLASS), wide(TITLE));
        // SAFETY: the handle is checked; RECT and POINT are plain out-parameters.
        unsafe {
            let window = FindWindowW(class.as_ptr(), title.as_ptr());
            if window.is_null() || IsIconic(window) != 0 {
                return None;
            }
            let mut rect: RECT = std::mem::zeroed();
            if GetClientRect(window, &mut rect) == 0 {
                return None;
            }
            let mut origin = POINT { x: 0, y: 0 };
            ClientToScreen(window, &mut origin);
            Some((origin.x, origin.y, rect.right, rect.bottom))
        }
    }

    /// The recognition in the client's language when Windows has it installed, else in Windows'
    /// own languages.
    fn engine(language: Option<&str>) -> windows::core::Result<OcrEngine> {
        let language = language.and_then(|tag| Language::CreateLanguage(&HSTRING::from(tag)).ok());
        if let Some(language) = language {
            if OcrEngine::IsLanguageSupported(&language).unwrap_or(false) {
                return OcrEngine::TryCreateFromLanguage(&language);
            }
        }
        OcrEngine::TryCreateFromUserProfileLanguages()
    }

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(Some(0)).collect()
    }

    /// The middle band of the game window (where the cards are, `band`) as BGRA, top row first,
    /// with the window's client size.
    fn capture() -> Option<(Vec<u8>, i32, i32)> {
        let (left, top, w, h) = game_area()?;
        // SAFETY: every handle is checked and released; the buffer has the size GetDIBits writes.
        unsafe {
            let (x, y, width, height) = super::band(w, h);
            let (x, y) = (left + x, top + y);
            if width < 200 || height < 100 {
                return None;
            }
            let screen = GetDC(std::ptr::null_mut());
            let memory = CreateCompatibleDC(screen);
            let bitmap = CreateCompatibleBitmap(screen, width, height);
            let old = SelectObject(memory, bitmap);
            let copied = BitBlt(memory, 0, 0, width, height, screen, x, y, SRCCOPY) != 0;
            let mut info: BITMAPINFO = std::mem::zeroed();
            info.bmiHeader = BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB,
                ..std::mem::zeroed()
            };
            let mut pixels = vec![0u8; (width * height * 4) as usize];
            let read = copied
                && GetDIBits(
                    memory,
                    bitmap,
                    0,
                    height as u32,
                    pixels.as_mut_ptr().cast(),
                    &mut info,
                    DIB_RGB_COLORS,
                ) != 0;
            SelectObject(memory, old);
            DeleteObject(bitmap);
            DeleteDC(memory);
            ReleaseDC(std::ptr::null_mut(), screen);
            read.then_some((pixels, w, h))
        }
    }

    /// Lines of text with their x centre and top, in pixels of the capture.
    fn recognize(
        engine: &OcrEngine,
        pixels: &[u8],
        width: u32,
        height: u32,
    ) -> windows::core::Result<Vec<(f32, f32, String)>> {
        // The recognition takes images up to its maximum side; larger captures are halved.
        let max = OcrEngine::MaxImageDimension()?;
        let (pixels, width, height, scale) = if width > max || height > max {
            let (w, h) = (width / 2, height / 2);
            let mut half = Vec::with_capacity((w * h * 4) as usize);
            for row in 0..h {
                for col in 0..w {
                    let at = ((row * 2 * width + col * 2) * 4) as usize;
                    half.extend_from_slice(&pixels[at..at + 4]);
                }
            }
            (half, w, h, 2.0)
        } else {
            (pixels.to_vec(), width, height, 1.0)
        };
        let writer = DataWriter::new()?;
        writer.WriteBytes(&pixels)?;
        let bitmap = SoftwareBitmap::CreateCopyFromBuffer(
            &writer.DetachBuffer()?,
            BitmapPixelFormat::Bgra8,
            width as i32,
            height as i32,
        )?;
        let result = engine.RecognizeAsync(&bitmap)?.get()?;
        let mut lines = Vec::new();
        for line in result.Lines()? {
            let (mut left, mut right, mut top) = (f32::MAX, 0f32, f32::MAX);
            for word in line.Words()? {
                let r = word.BoundingRect()?;
                left = left.min(r.X);
                right = right.max(r.X + r.Width);
                top = top.min(r.Y);
            }
            if left <= right {
                let text = line.Text()?.to_string();
                lines.push(((left + right) / 2.0 * scale, top * scale, text));
            }
        }
        Ok(lines)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names() -> Vec<(u32, String, String)> {
        [
            "Tank It Or Leave It",
            "Tank Engine",
            "Mystic Punch",
            "Goredrink",
        ]
        .iter()
        .enumerate()
        .map(|(i, n)| (i as u32 + 1, plain(n), (*n).to_string()))
        .collect()
    }

    #[test]
    fn cards_are_read_in_columns_left_to_right() {
        // Two lines per card (a wrapped name, then its text), out of order as recognised.
        let lines = vec![
            (900.0, 120.0, "Mystic Punch".to_string()),
            (150.0, 140.0, "Leave It".to_string()),
            (150.0, 100.0, "Tank It Or".to_string()),
            (520.0, 100.0, "Goredrlnk".to_string()),
            (530.0, 160.0, "Heilt dich".to_string()),
        ];
        let columns = columns_of(lines, 1200.0);
        assert_eq!(columns.len(), 3);
        let found = matched(&columns, &names());
        let ids: Vec<u32> = found.iter().map(|(o, _)| o.id).collect();
        // The longest name wins ("Tank It Or Leave It" over a shorter one inside it); one wrong
        // letter in eight is forgiven.
        assert_eq!(ids, [1, 4, 3]);
        // Each card is where its name's first line was read (the overlay's badges go there).
        let spots: Vec<Spot> = found.iter().map(|(_, at)| *at).collect();
        assert_eq!(spots, [(150.0, 100.0), (520.0, 100.0), (900.0, 120.0)]);
    }

    fn cards(ids: &[u32]) -> Vec<Offer> {
        ids.iter()
            .map(|&id| Offer {
                id,
                name: format!("A{id}"),
            })
            .collect()
    }

    #[test]
    fn the_card_left_last_was_taken() {
        // Three cards, a reroll of one, then the two others vanish first.
        let readings = [cards(&[1, 2, 3]), cards(&[1, 4, 3]), cards(&[4])];
        assert_eq!(taken_of(&readings).map(|o| o.id), Some(4));
        // All vanished at once, or only ever one card read: unknown.
        assert!(taken_of(&[cards(&[1, 2, 3])]).is_none());
        assert!(taken_of(&[cards(&[5])]).is_none());
        // A single card that was never among the others (a misread): unknown.
        assert!(taken_of(&[cards(&[1, 2, 3]), cards(&[6])]).is_none());
        assert!(taken_of(&[]).is_none());
    }

    #[test]
    fn a_lone_card_read_once_is_enough_to_be_taken() {
        // Each reading as `look` gets it: [1,2,3] twice, the card left read once, then nothing.
        let walk = |frames: &[&[u32]]| {
            let (mut last, mut told, mut readings) = (Vec::new(), Vec::new(), Vec::new());
            for frame in frames {
                let same = agreed(&mut last, cards(frame));
                if let Some(cards) = &same {
                    told.clone_from(cards);
                }
                remember(&mut readings, &told, &last, same.is_some());
            }
            taken_of(&readings).map(|o| o.id)
        };
        assert_eq!(walk(&[&[1, 2, 3], &[1, 2, 3], &[2], &[]]), Some(2));
        // A lone misread while the three are still there is undone when they are read again.
        let three: &[u32] = &[1, 2, 3];
        assert_eq!(walk(&[three, three, &[2], three, three, &[]]), None);
        // A lone card never among the cards told counts for nothing.
        assert_eq!(walk(&[&[1, 2, 3], &[1, 2, 3], &[6], &[]]), None);
    }

    #[test]
    fn a_set_of_cards_counts_when_two_readings_agree() {
        let ids = |cards: Option<Vec<Offer>>| cards.map(|c| c.iter().map(|o| o.id).collect());
        let mut last = Vec::new();
        assert!(agreed(&mut last, cards(&[1, 2, 3])).is_none());
        // A single misread frame in between is never told.
        assert!(agreed(&mut last, cards(&[1, 7, 3])).is_none());
        assert!(agreed(&mut last, cards(&[1, 2, 3])).is_none());
        assert_eq!(
            ids(agreed(&mut last, cards(&[1, 2, 3]))),
            Some(vec![1, 2, 3])
        );
        // Nothing read twice is no offer.
        assert!(agreed(&mut last, Vec::new()).is_none());
        assert!(agreed(&mut last, Vec::new()).is_none());
    }

    #[test]
    fn titles_are_cropped_inside_the_band() {
        // 1920 × 1080: the band starts at (192, 162) and is 1536 × 648.
        assert_eq!(
            title_crops(1920, 1080),
            [
                (244, 216, 313, 108),
                (611, 216, 313, 108),
                (978, 216, 313, 108)
            ]
        );
        for (w, h) in [(1280, 720), (1024, 768), (3440, 1440), (2560, 1600)] {
            let (_, _, width, height) = band(w, h);
            let crops = title_crops(w, h);
            assert_eq!(crops.len(), 3, "{w}×{h}");
            for (x, y, cw, ch) in crops {
                assert!(x >= 0 && y >= 0 && cw > 0 && ch > 0, "{w}×{h}");
                assert!(x + cw <= width && y + ch <= height, "{w}×{h}");
            }
        }
        // A window too small for cards has no titles.
        assert!(title_crops(0, 0).is_empty());
    }

    #[test]
    fn a_crop_is_enlarged_pixel_by_pixel() {
        // 2 × 2 pixels, each with its own value; the right column, twice as large.
        let pixels: Vec<u8> = (0..4u8).flat_map(|p| [p; 4]).collect();
        let big = enlarged(&pixels, 2, (1, 0, 1, 2), 2);
        let values: Vec<u8> = big.chunks(4).map(|p| p[0]).collect();
        assert_eq!(values, [1, 1, 1, 1, 3, 3, 3, 3]);
    }

    #[test]
    fn the_clients_locale_becomes_a_language_tag() {
        assert_eq!(language_tag("de_DE").as_deref(), Some("de-DE"));
        assert_eq!(language_tag("en_US").as_deref(), Some("en-US"));
        for odd in [
            "", "de", "DE_de", "de-DE", "de_DEU", "d_DE", "de_DE;x", "../x_YY",
        ] {
            assert_eq!(language_tag(odd), None, "{odd}");
        }
    }

    #[test]
    fn only_a_difference_is_noted() {
        assert_eq!(mismatch(&[3, 1], &[1, 3]), None);
        assert!(mismatch(&[1], &[1, 3]).is_some());
        assert!(mismatch(&[2, 3], &[1, 3]).is_some());
        assert_eq!(mismatch(&[], &[]), None);
    }

    #[test]
    fn no_text_no_offer() {
        assert!(matched(&columns_of(Vec::new(), 1200.0), &names()).is_empty());
        assert!(matched(&[(0.0, 0.0, "Shop 1500 Gold".to_string())], &names()).is_empty());
        assert_eq!(plain("Tank It, Or-Leave It!"), "tankitorleaveit");
    }
}
