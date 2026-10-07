//! The Mayhem app (user's wish 06.10.2026: "eine eigene Mayhem-App neben blank.", first version
//! "ganz schlicht", the card "direkt in der App, kein Popup"): a second EXE from the same code,
//! built with its own config (`tauri.mayhem.conf.json`, `pnpm mayhem:build`). One window, the
//! Champ-Karte of the ARAM Mayhem champion select (aram_live.rs) and nothing else of blank.: no
//! tray, popouts, settings or stored data.
//!
//! The client is looked for every few seconds (the lockfile next to `LeagueClientUx.exe`, as blank.
//! does via pc.rs); while it runs, the card follows its champion select. Read-only, as in blank.
use std::{thread, time::Duration};
use tauri::{AppHandle, Emitter};

/// The config's identifier: lib.rs starts this app instead of blank. when it is built with it.
pub const IDENTIFIER: &str = "lol.mayhemstats.desktop";
/// The one window (also in `capabilities/mayhem.json`).
pub const WINDOW: &str = "mayhem";
/// Tells the window whether the League client runs (true/false), on every change.
const CLIENT_EVENT: &str = "league-client";
const LOOK_EVERY: Duration = Duration::from_secs(5);

pub fn run(context: tauri::Context<tauri::Wry>) {
    tauri::Builder::default()
        .setup(|app| {
            crate::errors::init(app.handle());
            look_for_client(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            crate::errors::log_error,
            crate::aram::live::aram_champ_watch,
            crate::aram::live::aram_champ_info,
            league_client_open,
        ])
        .run(context)
        .expect("Mayhem could not start");
}

/// Whether the League client runs, for the window's first look.
#[tauri::command]
pub fn league_client_open() -> bool {
    crate::aram::client_open()
}

/// Looks for the client every few seconds; once it has been there for two looks (a freshly
/// started client needs a moment before it answers), the card listens to its champion select.
fn look_for_client(app: AppHandle) {
    thread::spawn(move || {
        let mut seen = 0u32;
        loop {
            let open = crate::aram::client_open();
            if open != (seen > 0) {
                let _ = app.emit_to(WINDOW, CLIENT_EVENT, open);
            }
            seen = if open { seen.saturating_add(1) } else { 0 };
            if seen >= 2 {
                // Does nothing while it already listens or the window does not want the card.
                crate::aram::live::listen(&app);
            }
            thread::sleep(LOOK_EVERY);
        }
    });
}
