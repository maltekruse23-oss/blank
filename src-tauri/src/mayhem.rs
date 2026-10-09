//! The Mayhem app (user's wish 06.10.2026: "eine eigene Mayhem-App neben blank.", first version
//! "ganz schlicht", the card "direkt in der App, kein Popup"): a second EXE from the same code,
//! built with its own config (`tauri.mayhem.conf.json`, `pnpm mayhem:build`). One window, a
//! desktop dashboard in the look "Arena" (user's wish 07.10.2026, MAYHEM-DESIGN.md): Home, the
//! Champ-Karte of the ARAM Mayhem champion select (aram_live.rs), augment and champion tier lists
//! with champion details, items and patch changes (arammeta.com, all from its one public list,
//! `mayhem_tiers`), the signed-in player's rank with the leaderboard (mayhemstats.lol,
//! `mayhem_ranks` in aram_website.rs), "Find my Mayhem rank" (aram/ladder.rs: the player's own
//! Mayhem games to mayhemstats.lol on click, then after each game while the site lists them), the
//! records of every category (mayhemstats.lol, read-only, `mayhem_records`), the card after each
//! Mayhem game (aram/game_card.rs, in the window, not a popout; it compares with the same
//! `mayhem_records`) and "Update" (update.rs, the same verified flow as blank., for mayhem.exe);
//! nothing else of blank.: no tray, popouts, settings or stored data (only ladder.rs's upload key
//! in the Windows Credential Manager), and it never writes into the client. blank. is paused: its update installs this app
//! as blank.exe, which then cleans up after blank. once (from_blank.rs).
//!
//! The client is looked for every few seconds (the lockfile next to `LeagueClientUx.exe`, as blank.
//! does via pc.rs); while it runs, the card follows its champion select. Read-only, as in blank.
use std::{
    sync::atomic::{AtomicIsize, Ordering},
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};

/// The config's identifier: lib.rs starts this app instead of blank. when it is built with it.
pub const IDENTIFIER: &str = "lol.mayhemstats.desktop";
/// The one window (also in `capabilities/mayhem.json`).
pub const WINDOW: &str = "mayhem";
/// The window's title from tauri.mayhem.conf.json; a second start finds the window by it.
const TITLE: &str = "Mayhem";
/// Tells the window whether the League client runs (true/false), on every change.
const CLIENT_EVENT: &str = "league-client";
const LOOK_EVERY: Duration = Duration::from_secs(5);
/// The single-instance mutex while this process owns it (0 otherwise), for `release`.
static OWNED: AtomicIsize = AtomicIsize::new(0);

pub fn run(context: tauri::Context<tauri::Wry>) {
    if !only_one() {
        return;
    }
    tauri::Builder::default()
        .setup(|app| {
            crate::errors::init(app.handle());
            app.manage(crate::update::UpdateState::default());
            // Only when this start replaced blank. (blank. becomes the Mayhem app); reads the
            // replaced `.old` before clean_up removes it.
            crate::from_blank::start(app.handle());
            crate::update::clean_up();
            look_for_client(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            crate::errors::log_error,
            crate::aram::live::aram_champ_watch,
            crate::aram::live::aram_champ_info,
            crate::aram::live::aram_open_guide,
            crate::aram::live::mayhem_tiers,
            crate::aram::website::mayhem_ranks,
            crate::aram::website::mayhem_records,
            crate::aram::website::mayhem_player,
            crate::aram::ladder::mayhem_find_rank,
            crate::aram::game_card::mayhem_open_game,
            crate::update::update_check,
            crate::update::update_install,
            crate::update::update_news,
            crate::from_blank::mayhem_moved,
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
            // A Mayhem game's end shows its card (game_card.rs) and uploads it after the player's
            // own click on "Find my Mayhem rank", while mayhemstats.lol lists them (ladder.rs).
            crate::aram::ladder::game_seen(&app, open);
            thread::sleep(LOOK_EVERY);
        }
    });
}

/// Only one Mayhem app at a time (found in the Windows test 07.10.2026: a second start opened a
/// second window). A second start brings the running window to the front and exits. Its own mutex,
/// not blank.'s (single_instance.rs): both apps may run side by side. Nothing is hidden in the
/// notification area here, so finding the window by its title is enough. After an update the new
/// EXE gets here once the old one has ended or let go of the mutex (`release`; main.rs waits).
fn only_one() -> bool {
    use windows_sys::Win32::{
        Foundation::{GetLastError, ERROR_ALREADY_EXISTS},
        System::Threading::CreateMutexW,
        UI::WindowsAndMessaging::{
            FindWindowW, IsIconic, SetForegroundWindow, ShowWindow, SW_RESTORE,
        },
    };
    let wide = |text: &str| text.encode_utf16().chain(Some(0)).collect::<Vec<u16>>();
    let name = wide(r"Local\mayhem.single-instance");
    // SAFETY: the name is null-terminated. The handle stays open for the whole process on purpose;
    // Windows releases it at the end.
    let handle = unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) };
    // SAFETY: reads the error of the call above.
    if handle.is_null() || unsafe { GetLastError() } != ERROR_ALREADY_EXISTS {
        OWNED.store(handle as isize, Ordering::Relaxed);
        // Also when the mutex cannot be created: better a second window than none.
        return true;
    }
    let (class, title) = (wide("Tauri Window"), wide(TITLE));
    // SAFETY: both strings are null-terminated; the window handle is checked and only passed back
    // to Windows.
    unsafe {
        let window = FindWindowW(class.as_ptr(), title.as_ptr());
        if !window.is_null() {
            if IsIconic(window) != 0 {
                ShowWindow(window, SW_RESTORE);
            }
            SetForegroundWindow(window);
        }
    }
    false
}

/// Lets the updated mayhem.exe become the one instance while this process is shutting down
/// (update.rs; does nothing in blank., which never owns this mutex).
pub fn release() {
    let handle = OWNED.swap(0, Ordering::Relaxed);
    if handle != 0 {
        // SAFETY: the handle came from CreateMutexW in only_one and is closed once.
        unsafe { windows_sys::Win32::Foundation::CloseHandle(handle as _) };
    }
}

// The Mayhem app's names are spread over Rust, the config, the capability and the adapter; a typo
// in one of them only shows on Windows (no window, no permission, no event). Checked here instead.
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn read(path: &str) -> String {
        std::fs::read_to_string(format!("{}/{path}", env!("CARGO_MANIFEST_DIR")))
            .unwrap_or_else(|e| panic!("{path}: {e}"))
    }

    fn json(path: &str) -> Value {
        serde_json::from_str(&read(path)).unwrap_or_else(|e| panic!("{path}: {e}"))
    }

    #[test]
    fn identifier_starts_only_the_mayhem_app() {
        assert_eq!(json("tauri.mayhem.conf.json")["identifier"], IDENTIFIER);
        // blank.'s own config must never start the Mayhem app.
        assert_ne!(json("tauri.conf.json")["identifier"], IDENTIFIER);
    }

    #[test]
    fn window_label_and_title_match_the_config() {
        let config = json("tauri.mayhem.conf.json");
        let windows = config["app"]["windows"].as_array().expect("windows");
        assert_eq!(windows.len(), 1, "one window only");
        assert_eq!(windows[0]["label"], WINDOW);
        // only_one() finds the running window by this title.
        assert_eq!(windows[0]["title"], TITLE);
        // Frameless with Windows 11's shadow and round corners; its own bar (WindowBar.tsx) drags,
        // maximizes and closes it.
        assert_eq!(windows[0]["decorations"], false);
        assert_eq!(windows[0]["shadow"], true);
    }

    #[test]
    fn capability_covers_only_the_mayhem_window() {
        let capability = json("capabilities/mayhem.json");
        assert_eq!(capability["windows"], serde_json::json!([WINDOW]));
        let permissions = capability["permissions"].as_array().expect("permissions");
        assert!(permissions.contains(&Value::from("allow-mayhem-ranks")));
        assert!(permissions.contains(&Value::from("allow-mayhem-records")));
        assert!(permissions.contains(&Value::from("allow-mayhem-player")));
        assert!(permissions.contains(&Value::from("allow-mayhem-find-rank")));
        assert!(permissions.contains(&Value::from("allow-mayhem-open-game")));
        assert!(permissions.contains(&Value::from("allow-league-client-open")));
        // Exactly what the own window bar needs, nothing broader.
        let window: Vec<_> = permissions
            .iter()
            .filter_map(Value::as_str)
            .filter(|p| p.starts_with("core:window:"))
            .collect();
        assert_eq!(
            window,
            [
                "core:window:allow-start-dragging",
                "core:window:allow-internal-toggle-maximize",
                "core:window:allow-toggle-maximize",
                "core:window:allow-is-maximized",
                "core:window:allow-minimize",
                "core:window:allow-close",
            ]
        );
        for update in [
            "allow-update-check",
            "allow-update-install",
            "allow-update-news",
            "allow-mayhem-moved",
        ] {
            assert!(permissions.contains(&Value::from(update)), "{update}");
        }
    }

    #[test]
    fn adapter_uses_the_same_command_and_event() {
        let adapter = read("../src/adapters/aramChamp.ts");
        assert!(adapter.contains("'league_client_open'"));
        assert!(adapter.contains(&format!("'{CLIENT_EVENT}'")));
        // "Find my Mayhem rank" (aram/ladder.rs).
        let ladder = read("src/aram/ladder.rs");
        let site = read("../src/adapters/aramSite.ts");
        assert!(site.contains("'mayhem_find_rank'"));
        for event in ["mayhem-upload", "mayhem-uploaded"] {
            assert!(ladder.contains(&format!("\"{event}\"")), "{event}");
            assert!(site.contains(&format!("'{event}'")), "{event}");
        }
        // The card after a game (aram/game_card.rs).
        let card = read("src/aram/game_card.rs");
        assert!(card.contains("\"mayhem-card\"") && site.contains("'mayhem-card'"));
        assert!(site.contains("'mayhem_open_game'"));
        // One records command for the Records page and the card (aram_website.rs).
        assert!(read("../src/mayhem/records.ts").contains("'mayhem_records', { season }"));
        assert!(!card.contains("fn mayhem_records"));
    }
}
