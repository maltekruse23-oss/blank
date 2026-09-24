// App commands must be allowed explicitly in capabilities/default.json.
const COMMANDS: &[&str] = &[
    "app_usage",
    "autostart_enabled",
    "clean_memory",
    "close_program",
    "device_batteries",
    "set_autostart",
    "pc_status",
    "pet_resize",
    "play_alert_sound",
    "program_running",
    "set_pet_mode",
    "settings_export",
    "soundcloud_open",
    "twitch_account",
    "twitch_eventsub_status",
    "twitch_set_client_id",
    "twitch_start_login",
    "twitch_finish_login",
    "twitch_cancel_login",
    "twitch_logout",
    "twitch_open_channel",
    "twitch_load_watchlist",
    "twitch_save_watchlist",
    "twitch_find_channel",
    "twitch_channels",
    "twitch_search_categories",
    "twitch_live_streams",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
