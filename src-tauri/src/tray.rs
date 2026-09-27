//! Icon in the notification area (behind the arrow on the taskbar). "Öffnen" in its menu and a
//! click in a popout (flyout.rs) bring back the full app; a left click on the icon does too, or
//! shows what plays as a popout (Settings → Popouts). "Nicht stören" in the menu switches do not
//! disturb without opening the app (the app window decides and reports the state back).
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, Wry,
};

/// A left click on the icon shows the music popout instead of the app (set by the app window).
static CLICK_SHOWS_MUSIC: AtomicBool = AtomicBool::new(false);

/// The "Nicht stören" entry of the menu, so the app can set its tick.
pub struct QuietItem(CheckMenuItem<Wry>);

#[tauri::command]
pub fn set_tray_click(music: bool) {
    CLICK_SHOWS_MUSIC.store(music, Ordering::Relaxed);
}

/// The tick of "Nicht stören" follows the app (title bar, settings, the menu itself). Async: menu
/// changes go through the main thread, which a synchronous command would block.
#[tauri::command]
pub async fn set_tray_quiet(item: State<'_, QuietItem>, quiet: bool) -> Result<(), String> {
    item.0.set_checked(quiet).map_err(|e| e.to_string())
}

fn left_click(app: &AppHandle) {
    if CLICK_SHOWS_MUSIC.load(Ordering::Relaxed) {
        // The app window builds the popout (usePopouts).
        let _ = app.emit_to("main", "tray-music", ());
    } else {
        show_app(app);
    }
}

/// Shows the full app window in front.
pub fn show_app(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Öffnen", true, None::<&str>)?;
    let quiet = CheckMenuItem::with_id(app, "quiet", "Nicht stören", true, false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Beenden", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&open, &quiet, &PredefinedMenuItem::separator(app)?, &quit],
    )?;
    app.manage(QuietItem(quiet));
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("blank.")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_app(app),
            // The app window switches do not disturb and sets the tick again (set_tray_quiet).
            "quiet" => {
                let _ = app.emit_to("main", "tray-quiet", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                left_click(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}
