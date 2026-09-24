mod autostart;
#[cfg(windows)]
mod background;
#[cfg(windows)]
mod battery;
#[cfg(windows)]
mod monitor;
#[cfg(windows)]
mod pc;
#[cfg(windows)]
mod pet;
#[cfg(windows)]
mod settings_file;
#[cfg(windows)]
mod single_instance;
mod sound;
mod soundcloud;
#[cfg(windows)]
mod taskbar;
#[cfg(windows)]
mod tray;
mod twitch;
mod usage;
#[cfg(windows)]
mod window_aspect;

use tauri::Manager;

pub fn run() {
    #[cfg(windows)]
    if !single_instance::acquire() {
        return;
    }
    tauri::Builder::default()
        .setup(|app| {
            app.manage(twitch::Twitch::new(app.handle())?);
            app.manage(usage::UsageState::default());
            #[cfg(windows)]
            app.manage(battery::Batteries::default());
            #[cfg(windows)]
            app.manage(pet::PetState::default());
            #[cfg(windows)]
            {
                let pc = pc::PcState::default();
                app.manage(pc.clone());
                pc::start(app.handle().clone(), pc);
            }
            twitch::start_eventsub(app.handle().clone());
            #[cfg(windows)]
            {
                let window = app
                    .get_webview_window("main")
                    .ok_or("Main window missing")?;
                window_aspect::apply(&window)?;
                pet::watch_taskbar(app.handle(), &window)?;
                tray::create(app.handle())?;
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
            if let tauri::WindowEvent::Resized(_) = _event {
                background::sync(_window);
            }
        })
        .invoke_handler(tauri::generate_handler![
            autostart::autostart_enabled,
            autostart::set_autostart,
            #[cfg(windows)]
            battery::device_batteries,
            #[cfg(windows)]
            pc::pc_status,
            #[cfg(windows)]
            pc::close_program,
            #[cfg(windows)]
            pc::program_running,
            #[cfg(windows)]
            pet::set_pet_mode,
            #[cfg(windows)]
            pet::pet_resize,
            #[cfg(windows)]
            settings_file::settings_export,
            sound::play_alert_sound,
            soundcloud::soundcloud_open,
            usage::app_usage,
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
