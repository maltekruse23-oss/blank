#[cfg(windows)]
mod apps;
mod autostart;
#[cfg(windows)]
mod background;
#[cfg(windows)]
mod battery;
#[cfg(windows)]
mod cloud;
#[cfg(windows)]
mod flyout;
#[cfg(windows)]
mod media;
#[cfg(windows)]
mod memory;
#[cfg(windows)]
mod monitor;
#[cfg(windows)]
mod pc;
#[cfg(windows)]
mod settings_file;
#[cfg(windows)]
mod single_instance;
mod sound;
mod soundcloud;
mod store;
#[cfg(windows)]
mod tray;
#[cfg(windows)]
mod tweaks;
mod twitch;
#[cfg(windows)]
mod update;
mod usage;
#[cfg(windows)]
mod window_aspect;

use tauri::Manager;

/// RAM cleaning runs in a separate, elevated start of the app (memory.rs; checked in main.rs).
#[cfg(windows)]
pub use memory::{clean_elevated as clean_memory_elevated, CLEAN_ARG as CLEAN_MEMORY_ARG};
/// Start of a freshly updated EXE (update.rs; checked in main.rs).
#[cfg(windows)]
pub use update::{wait_for_old as wait_for_old_version, AFTER_UPDATE_ARG};

pub fn run() {
    #[cfg(windows)]
    if !single_instance::acquire() {
        return;
    }
    tauri::Builder::default()
        .setup(|app| {
            app.manage(twitch::Twitch::new(app.handle())?);
            app.manage(usage::UsageState::default());
            app.manage(store::StoreFile::new(app.handle())?);
            #[cfg(windows)]
            app.manage(battery::Batteries::default());
            #[cfg(windows)]
            app.manage(flyout::FlyoutState::default());
            #[cfg(windows)]
            app.manage(tweaks::TweakFile::new(app.handle())?);
            #[cfg(windows)]
            {
                app.manage(update::UpdateState::default());
                update::clean_up();
                autostart::repair();
            }
            #[cfg(windows)]
            {
                let pc = pc::PcState::default();
                app.manage(pc.clone());
                pc::start(app.handle().clone(), pc);
            }
            twitch::start_eventsub(app.handle().clone());
            #[cfg(windows)]
            media::start(app.handle().clone());
            #[cfg(windows)]
            {
                let window = app
                    .get_webview_window("main")
                    .ok_or("Main window missing")?;
                window_aspect::apply(&window)?;
                // Must not stop the app from opening, e.g. early at sign-in before the taskbar
                // is ready (the tray icon then appears once Explorer announces it).
                if let Err(error) = tray::create(app.handle()) {
                    eprintln!("Tray icon unavailable: {error}");
                }
                // A missing or changed monitor setup must not stop the app from opening.
                let _ = monitor::place_on_second(&window);
                window.show()?;
            }
            #[cfg(not(windows))]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.show()?;
                }
            }
            Ok(())
        })
        .on_window_event(|_window, _event| {
            #[cfg(windows)]
            // Only the app window; popouts handle their visibility themselves (flyout.rs).
            if let (tauri::WindowEvent::Resized(_), "main") = (_event, _window.label()) {
                background::sync(_window);
            }
        })
        .invoke_handler(tauri::generate_handler![
            #[cfg(windows)]
            apps::apps_scan,
            #[cfg(windows)]
            apps::apps_install,
            #[cfg(windows)]
            apps::apps_cancel,
            autostart::autostart_status,
            #[cfg(windows)]
            cloud::settings_complete,
            #[cfg(windows)]
            cloud::cloud_upload,
            #[cfg(windows)]
            cloud::cloud_download,
            autostart::set_autostart,
            #[cfg(windows)]
            battery::device_batteries,
            #[cfg(windows)]
            memory::clean_memory,
            #[cfg(windows)]
            pc::pc_status,
            #[cfg(windows)]
            pc::close_program,
            #[cfg(windows)]
            pc::program_running,
            #[cfg(windows)]
            flyout::flyout_show,
            #[cfg(windows)]
            flyout::flyout_update,
            #[cfg(windows)]
            flyout::flyout_pending,
            #[cfg(windows)]
            flyout::flyout_prepare,
            #[cfg(windows)]
            flyout::flyout_present,
            #[cfg(windows)]
            flyout::flyout_hide,
            #[cfg(windows)]
            flyout::flyout_done,
            #[cfg(windows)]
            flyout::flyout_screens,
            #[cfg(windows)]
            flyout::flyout_mix,
            #[cfg(windows)]
            flyout::show_app,
            #[cfg(windows)]
            media::media_current,
            #[cfg(windows)]
            media::media_control,
            #[cfg(windows)]
            media::media_timeline,
            #[cfg(windows)]
            media::media_seek,
            #[cfg(windows)]
            media::media_settings,
            #[cfg(windows)]
            media::media_pause_others,
            #[cfg(windows)]
            media::media_open_player,
            #[cfg(windows)]
            tray::set_tray_click,
            #[cfg(windows)]
            settings_file::settings_export,
            sound::play_alert_sound,
            store::settings_mirror_read,
            store::settings_mirror_write,
            soundcloud::soundcloud_open,
            usage::app_usage,
            #[cfg(windows)]
            tweaks::tweaks_status,
            #[cfg(windows)]
            tweaks::tweaks_apply,
            #[cfg(windows)]
            tweaks::tweaks_restore,
            #[cfg(windows)]
            update::update_check,
            #[cfg(windows)]
            update::update_install,
            twitch::twitch_account,
            twitch::twitch_eventsub_status,
            twitch::twitch_set_client_id,
            twitch::twitch_start_login,
            twitch::twitch_finish_login,
            twitch::twitch_cancel_login,
            twitch::twitch_logout,
            twitch::twitch_open_channel,
            twitch::twitch_load_watchlist,
            twitch::twitch_save_watchlist,
            twitch::twitch_find_channel,
            twitch::twitch_channels,
            twitch::twitch_search_categories,
            twitch::twitch_live_streams,
        ])
        .run(tauri::generate_context!())
        .expect("blank. could not start");
}
