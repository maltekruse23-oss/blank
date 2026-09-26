#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Elevated one-shot start for "RAM bereinigen": cleans and exits, no window, no app.
    #[cfg(windows)]
    if std::env::args().nth(1).as_deref() == Some(blank_lib::CLEAN_MEMORY_ARG) {
        std::process::exit(blank_lib::clean_memory_elevated());
    }
    #[cfg(windows)]
    {
        let args: Vec<String> = std::env::args().collect();
        if args.get(1).map(String::as_str) == Some(blank_lib::AFTER_UPDATE_ARG) {
            blank_lib::wait_for_old_version(args.get(2).map(String::as_str).unwrap_or(""));
        }
    }
    blank_lib::run()
}
