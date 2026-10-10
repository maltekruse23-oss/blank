//! The overlay over the League game (Mayhem app; user's order 10.10.2026 "Ingame-Overlay für
//! Augment-Rankings"): while an augment offer is on screen, each card gets its tier for the build
//! chosen on the Champ page and the picture of the build it fits, under the augment's text, plus
//! one line naming the build. Tiers only: no win rates, no advice (Riot's rules).
//! The Mayhem window tells what to show per offered augment (`mayhem_overlay_cards`); aram/offers.rs
//! tells which cards are on screen and where their names are (`cards`), so a late message of the
//! page never leaves the overlay over a game without cards.
//! The window covers the game's client area, is transparent, lets every click through to the game
//! (the one exception to "no click-through", user's decision 10.10.2026), never takes the focus, is
//! not in the taskbar or Alt+Tab and is left out of screen captures (offers.rs never reads it).
//! Its window keeps the app alive, so closing the Mayhem window quits the app (mayhem.rs).
//! Created on demand, closed half a minute after the cards went (as blank.'s popouts). Only
//! borderless or windowed, like the reading itself.

use std::{
    sync::{Mutex, MutexGuard},
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};
use windows_sys::Win32::{
    Foundation::HWND,
    UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, ShowWindow, GWL_EXSTYLE, HWND_TOPMOST,
        SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE, SW_SHOWNOACTIVATE,
        WS_EX_TOOLWINDOW,
    },
};

/// The window's label (also in `capabilities/overlay.json` and src/mayhem/main.tsx).
pub const LABEL: &str = "overlay";
const EVENT: &str = "overlay-cards";
const CLOSE_AFTER: Duration = Duration::from_secs(30);
const TIERS: [&str; 5] = ["S", "A", "B", "C", "D"];
/// Cards in one offer, items in a build's picture, characters in a build's name.
const MAX_CARDS: usize = 3;
const MAX_ITEMS: usize = 2;
const MAX_BUILD: usize = 60;

/// What the Mayhem window tells for the offer open now.
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Told {
    champion_id: i64,
    /// The build the tiers are for.
    build: String,
    cards: Vec<CardInfo>,
}

/// One offered augment: its tier for that build (none: too few games) and the first two items of
/// the build it fits (none: it fits none).
#[derive(Deserialize, Clone)]
struct CardInfo {
    id: u32,
    tier: Option<String>,
    items: Vec<u32>,
}

/// What the overlay page draws.
#[derive(Serialize, Clone, PartialEq, Debug)]
pub struct Shown {
    build: String,
    cards: Vec<Badge>,
}

/// A card's badge, under the card's name at (x, y): parts of the game window's width and height.
#[derive(Serialize, Clone, PartialEq, Debug)]
struct Badge {
    tier: Option<String>,
    items: Vec<u32>,
    x: f32,
    y: f32,
}

struct State {
    told: Option<Told>,
    /// The champion of the game and the cards on screen with where their names are (offers.rs).
    champion: i64,
    on_screen: Vec<(u32, (f32, f32))>,
    shown: Option<Shown>,
    /// Counts every change; a close waits for the overlay to stay hidden.
    serial: u64,
}

static STATE: Mutex<State> = Mutex::new(State {
    told: None,
    champion: 0,
    on_screen: Vec::new(),
    shown: None,
    serial: 0,
});
/// One change of the window at a time (creating it takes a moment).
static WINDOW: Mutex<()> = Mutex::new(());

fn state() -> MutexGuard<'static, State> {
    STATE.lock().unwrap_or_else(|p| p.into_inner())
}

/// The Mayhem window (MayhemCard.tsx): per offered augment its tier and the build it fits, again
/// whenever the chosen build changes.
#[tauri::command]
pub async fn mayhem_overlay_cards(app: AppHandle, mut told: Told) {
    if valid(&told) {
        told.build = shown_name(&told.build);
        state().told = Some(told);
        refresh(&app);
    }
}

/// The overlay page at its start: what to draw now (later changes come as `overlay-cards`).
#[tauri::command]
pub fn mayhem_overlay_now() -> Option<Shown> {
    state().shown.clone()
}

/// offers.rs, each reading: the cards of the offer on screen with where their names are (empty:
/// gone) and the game's champion.
pub(crate) fn cards(app: &AppHandle, champion: i64, on_screen: Vec<(u32, (f32, f32))>) {
    {
        let mut state = state();
        let ids = |cards: &[(u32, (f32, f32))]| cards.iter().map(|c| c.0).collect::<Vec<_>>();
        if state.champion == champion && ids(&state.on_screen) == ids(&on_screen) {
            return;
        }
        state.champion = champion;
        state.on_screen = on_screen;
    }
    refresh(app);
}

/// A build's name is only shown: shortened and without control characters, never refused (a core
/// named by its three items is often longer).
fn shown_name(build: &str) -> String {
    build
        .chars()
        .filter(|c| !c.is_control())
        .take(MAX_BUILD)
        .collect()
}

fn valid(told: &Told) -> bool {
    told.champion_id > 0
        && told.cards.len() <= MAX_CARDS
        && told.cards.iter().all(|c| {
            c.tier.as_deref().is_none_or(|t| TIERS.contains(&t))
                && c.items.len() <= MAX_ITEMS
                && c.items.iter().all(|&id| (1..=999_999).contains(&id))
        })
}

/// The badges of the cards on screen that the page told something about, for that champion only
/// (a message of the last game never shows); None: nothing to draw.
fn compose(told: Option<&Told>, champion: i64, on_screen: &[(u32, (f32, f32))]) -> Option<Shown> {
    let told = told.filter(|t| t.champion_id == champion)?;
    let cards: Vec<Badge> = on_screen
        .iter()
        .filter_map(|&(id, (x, y))| {
            let card = told.cards.iter().find(|c| c.id == id)?;
            (card.tier.is_some() || !card.items.is_empty()).then(|| Badge {
                tier: card.tier.clone(),
                items: card.items.clone(),
                x,
                y,
            })
        })
        .collect();
    (!cards.is_empty()).then(|| Shown {
        build: told.build.clone(),
        cards,
    })
}

fn refresh(app: &AppHandle) {
    let _window = WINDOW.lock().unwrap_or_else(|p| p.into_inner());
    let (shown, serial) = {
        let mut state = state();
        let shown = compose(state.told.as_ref(), state.champion, &state.on_screen);
        if shown == state.shown {
            return;
        }
        state.shown.clone_from(&shown);
        state.serial += 1;
        (shown, state.serial)
    };
    match shown {
        Some(shown) => {
            if let Err(error) = show(app, &shown) {
                crate::errors::record("Overlay", &error);
            }
        }
        None => hide(app, serial),
    }
}

fn show(app: &AppHandle, shown: &Shown) -> Result<(), String> {
    let Some((x, y, w, h)) = crate::aram::offers::game_area() else {
        return Ok(());
    };
    let window = match app.get_webview_window(LABEL) {
        Some(window) => window,
        None => create(app)?,
    };
    // Exactly over the game's client area; a frameless window's inner area may start a little in.
    let _ = window.set_position(PhysicalPosition::new(x, y));
    let _ = window.set_size(PhysicalSize::new(w.max(1) as u32, h.max(1) as u32));
    if let (Ok(inner), Ok(outer)) = (window.inner_position(), window.outer_position()) {
        let _ = window.set_position(PhysicalPosition::new(
            x - (inner.x - outer.x),
            y - (inner.y - outer.y),
        ));
    }
    app.emit_to(LABEL, EVENT, shown)
        .map_err(|e| e.to_string())?;
    let handle = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
    // On the main thread, after tao applied its own flags (click-through, no focus): those rewrite
    // the extended style and would drop the tool-window bit.
    app.run_on_main_thread(move || {
        let handle = handle as HWND;
        // SAFETY: valid top-level window of this process. Tool window: not in Alt+Tab; shown and
        // raised without activation.
        unsafe {
            let style = GetWindowLongPtrW(handle, GWL_EXSTYLE);
            SetWindowLongPtrW(handle, GWL_EXSTYLE, style | WS_EX_TOOLWINDOW as isize);
            ShowWindow(handle, SW_SHOWNOACTIVATE);
            SetWindowPos(
                handle,
                HWND_TOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
            );
        }
    })
    .map_err(|e| e.to_string())
}

/// Transparent, frameless, on top, never focused, every click through to the game (tao keeps
/// the last two in its own flags), left out of screen captures (`WDA_EXCLUDEFROMCAPTURE`, Windows
/// 10 2004 and later; offers.rs reads the screen).
fn create(app: &AppHandle) -> Result<WebviewWindow, String> {
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("mayhem.html".into()))
        .title("Mayhem overlay")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .content_protected(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .focused(false)
        .focusable(false)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;
    window
        .set_ignore_cursor_events(true)
        .map_err(|e| e.to_string())?;
    Ok(window)
}

/// Hides the overlay (in order with a show, on the main thread); its window is closed after half a
/// quiet minute.
fn hide(app: &AppHandle, serial: u64) {
    let Some(window) = app.get_webview_window(LABEL) else {
        return;
    };
    // Emptied, so a later show never flashes the cards before.
    let _ = app.emit_to(LABEL, EVENT, None::<Shown>);
    if let Ok(handle) = window.hwnd() {
        let handle = handle.0 as isize;
        // SAFETY: valid window handle.
        let _ = app.run_on_main_thread(move || unsafe {
            ShowWindow(handle as HWND, SW_HIDE);
        });
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(CLOSE_AFTER).await;
        let _window = WINDOW.lock().unwrap_or_else(|p| p.into_inner());
        if state().serial == serial {
            if let Some(window) = app.get_webview_window(LABEL) {
                let _ = window.destroy();
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn told(champion_id: i64, cards: Vec<CardInfo>) -> Told {
        Told {
            champion_id,
            build: "Burn mage".into(),
            cards,
        }
    }

    fn card(id: u32, tier: Option<&str>, items: &[u32]) -> CardInfo {
        CardInfo {
            id,
            tier: tier.map(str::to_owned),
            items: items.to_vec(),
        }
    }

    #[test]
    fn badges_go_where_the_names_were_read() {
        let page = told(
            86,
            vec![
                card(1, Some("S"), &[3089, 4645]),
                card(2, Some("C"), &[]),
                card(3, None, &[]),
            ],
        );
        let on_screen = [(2, (0.5, 0.37)), (1, (0.31, 0.37)), (3, (0.69, 0.38))];
        let shown = compose(Some(&page), 86, &on_screen).expect("shown");
        assert_eq!(shown.build, "Burn mage");
        // In the order on screen; a card with neither tier nor build has no badge.
        assert_eq!(
            shown.cards,
            [
                Badge {
                    tier: Some("C".into()),
                    items: vec![],
                    x: 0.5,
                    y: 0.37
                },
                Badge {
                    tier: Some("S".into()),
                    items: vec![3089, 4645],
                    x: 0.31,
                    y: 0.37
                },
            ]
        );
        // Another champion's message (the last game), no cards on screen or none told: nothing.
        assert_eq!(compose(Some(&page), 17, &on_screen), None);
        assert_eq!(compose(Some(&page), 86, &[]), None);
        assert_eq!(compose(None, 86, &on_screen), None);
        assert_eq!(compose(Some(&page), 86, &[(9, (0.5, 0.4))]), None);
    }

    #[test]
    fn only_tiers_and_items_the_overlay_can_draw_are_taken() {
        let ok = told(86, vec![card(1, Some("A"), &[3089, 4645])]);
        assert!(valid(&ok));
        assert!(valid(&told(86, vec![card(1, None, &[])])));
        assert!(!valid(&told(0, vec![])));
        assert!(!valid(&told(86, vec![card(1, Some("SSS"), &[])])));
        assert!(!valid(&told(86, vec![card(1, Some("A"), &[1, 2, 3])])));
        assert!(!valid(&told(86, vec![card(1, Some("A"), &[0])])));
        assert!(!valid(&told(86, vec![card(1, None, &[]); 4])));
        // A long name (a core named by its three items) is shortened, never refused.
        let long = "Rylai's Crystal Scepter + Archangel's Staff + Liandry's Torment";
        assert!(valid(&Told {
            build: long.into(),
            ..ok
        }));
        assert_eq!(shown_name(long).chars().count(), MAX_BUILD);
        assert_eq!(shown_name("Burn\nmage"), "Burnmage");
    }
}
