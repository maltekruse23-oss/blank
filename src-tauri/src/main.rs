#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Elevated one-shot start for "RAM bereinigen": cleans and exits, no window, no app.
    #[cfg(windows)]
    if std::env::args().nth(1).as_deref() == Some(blank_lib::CLEAN_MEMORY_ARG) {
        std::process::exit(blank_lib::clean_memory_elevated());
    }
    blank_lib::run()
}
