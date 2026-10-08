//! Augment offers in an ARAM Mayhem game (Etappe 2b, MAYHEM-BERATER.md 6; user's wish "Augments im
//! Spiel sofort erkennen, auch Reroll"). Riot gives the three offered cards through no interface,
//! so while one may be open blank. reads them off the screen: a capture of the League game window
//! only (a band in its middle), Windows' own text recognition (`Windows.Media.Ocr`), the names
//! matched against the client's augment list in the client's language. Only with the switch on
//! (`champOffers`), only in a Mayhem game; nothing is typed into the game, nothing read from its
//! memory. The game's level comes from its Live Client Data (127.0.0.1:2999, read-only) once a
//! second; after each level-up (and at the start) the screen is read every 250 ms until the cards
//! are gone, at most 60 s. The app hears `aram-offers` (an empty list: the offer closed).
//! Only borderless or windowed: a capture of an exclusive full-screen game is black.

use std::{
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use super::{client::Lcu, games::CherryAugment, live, GAME_EXE};

static WANTED: AtomicBool = AtomicBool::new(false);
static RUNNING: AtomicBool = AtomicBool::new(false);

const LIVE: &str = "https://127.0.0.1:2999/liveclientdata/activeplayer";
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

pub(super) fn wanted() -> bool {
    WANTED.load(Ordering::Relaxed)
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
}

/// A Mayhem game started (after_game.rs): follow its offers until it ends.
pub(super) fn follow(app: &AppHandle) {
    if !wanted() || RUNNING.swap(true, Ordering::Relaxed) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = run(&app).await {
            crate::errors::record("Augment-Angebote", &error);
        }
        RUNNING.store(false, Ordering::Relaxed);
    });
}

async fn run(app: &AppHandle) -> Result<(), String> {
    let names = augment_names().await?;
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
                    look(app, &names).await;
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
async fn augment_names() -> Result<Vec<(u32, String, String)>, String> {
    let lcu = Lcu::connect()?.ok_or(super::NOT_OPEN)?;
    let list: Vec<CherryAugment> = lcu
        .get("/lol-game-data/assets/v1/cherry-augments.json")
        .await?;
    Ok(list
        .into_iter()
        .map(|a| (a.id, plain(&a.name), a.name.chars().take(80).collect()))
        .filter(|(_, p, _)| p.chars().count() >= 4)
        .collect())
}

/// Reads the screen while an offer may be open and tells the app each new set of cards.
async fn look(app: &AppHandle, names: &[(u32, String, String)]) {
    let started = Instant::now();
    let mut seen = None::<Instant>;
    let mut told: Vec<Offer> = Vec::new();
    while started.elapsed() < LOOK_AT_MOST && wanted() {
        let columns = tauri::async_runtime::spawn_blocking(screen::read_columns)
            .await
            .ok()
            .flatten()
            .unwrap_or_default();
        let found = matched(&columns, names);
        if !found.is_empty() {
            seen = Some(Instant::now());
            if found != told {
                told = found;
                tell(app, told.clone());
            }
        } else if seen.map_or(started.elapsed() > NONE_WITHIN, |t| {
            t.elapsed() > GONE_AFTER
        }) {
            break;
        }
        tokio::time::sleep(LOOK_EVERY).await;
    }
    if !told.is_empty() {
        tell(app, Vec::new());
    }
}

fn tell(app: &AppHandle, offers: Vec<Offer>) {
    let (champion_id, direction) = live::chosen();
    let _ = app.emit_to(
        "main",
        EVENT,
        Offers {
            champion_id,
            direction,
            offers,
        },
    );
}

/// Lowercase letters and digits only: what the recognition reliably gives back.
fn plain(text: &str) -> String {
    text.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

/// Per column of text (one card each), the augment whose name it contains, left to right. A name
/// counts with up to one wrong letter in eight (`ponytail:` substitutions only; letters the
/// recognition drops or adds are not forgiven – widen to an edit distance if names get missed).
fn matched(columns: &[String], names: &[(u32, String, String)]) -> Vec<Offer> {
    let mut out: Vec<Offer> = Vec::new();
    for column in columns {
        let text: Vec<char> = plain(column).chars().collect();
        let best = names
            .iter()
            .filter(|(_, name, _)| contains(&text, name))
            .max_by_key(|(_, name, _)| name.chars().count());
        if let Some((id, _, name)) = best {
            if !out.iter().any(|o| o.id == *id) {
                out.push(Offer {
                    id: *id,
                    name: name.clone(),
                });
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

/// Lines of text side by side (x centre, top, text) grouped into columns, each read top to bottom.
fn columns_of(mut lines: Vec<(f32, f32, String)>, width: f32) -> Vec<String> {
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
            group.into_iter().map(|l| l.2).collect::<Vec<_>>().join(" ")
        })
        .collect()
}

mod screen {
    //! The capture of the game window's middle and its text, on a blocking thread.
    use windows::{
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

    pub(super) fn read_columns() -> Option<Vec<String>> {
        let (pixels, width, height) = capture()?;
        let lines = recognize(&pixels, width, height).ok()?;
        Some(super::columns_of(lines, width as f32))
    }

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(Some(0)).collect()
    }

    /// The middle band of the game window (where the cards are) as BGRA, top row first.
    fn capture() -> Option<(Vec<u8>, u32, u32)> {
        let (class, title) = (wide(CLASS), wide(TITLE));
        // SAFETY: every handle is checked and released; the buffer has the size GetDIBits writes.
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
            let (w, h) = (rect.right, rect.bottom);
            let (x, y) = (origin.x + w / 10, origin.y + h * 15 / 100);
            let (width, height) = (w * 8 / 10, h * 60 / 100);
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
            read.then_some((pixels, width as u32, height as u32))
        }
    }

    /// Lines of text with their x centre and top, in pixels of the capture.
    fn recognize(
        pixels: &[u8],
        width: u32,
        height: u32,
    ) -> windows::core::Result<Vec<(f32, f32, String)>> {
        // SAFETY: plain COM initialisation of this thread; a second call only reports it was done.
        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        let engine = OcrEngine::TryCreateFromUserProfileLanguages()?;
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
        let ids: Vec<u32> = matched(&columns, &names()).iter().map(|o| o.id).collect();
        // The longest name wins ("Tank It Or Leave It" over a shorter one inside it); one wrong
        // letter in eight is forgiven.
        assert_eq!(ids, [1, 4, 3]);
    }

    #[test]
    fn no_text_no_offer() {
        assert!(matched(&columns_of(Vec::new(), 1200.0), &names()).is_empty());
        assert!(matched(&["Shop 1500 Gold".to_string()], &names()).is_empty());
        assert_eq!(plain("Tank It, Or-Leave It!"), "tankitorleaveit");
    }
}
