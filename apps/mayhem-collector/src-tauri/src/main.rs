#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod autostart;
mod engine;
mod lcu;
use engine::{Engine, Status};
use tauri::Manager;

#[tauri::command]
fn status(state: tauri::State<'_, Engine>) -> Status {
    state.status()
}
#[tauri::command]
fn autostart(state: tauri::State<'_, Engine>, enabled: bool) -> Result<Status, String> {
    state.set_autostart(enabled)
}
fn show(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
fn main() {
    use windows_sys::Win32::{
        Foundation::{GetLastError, ERROR_ALREADY_EXISTS},
        System::Threading::CreateMutexW,
    };
    let background = std::env::args().any(|a| a == "--background");
    let name: Vec<u16> = "Local\\blank.mayhem.collector.v1"
        .encode_utf16()
        .chain(Some(0))
        .collect();
    // Kept alive for the process; two instances must never share the outbox.
    let mutex = unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) };
    if mutex.is_null() {
        return;
    }
    if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
        if !background {
            use windows_sys::Win32::UI::WindowsAndMessaging::{
                FindWindowW, SetForegroundWindow, ShowWindowAsync, SW_RESTORE,
            };
            let title: Vec<u16> = "blank. Collector".encode_utf16().chain(Some(0)).collect();
            unsafe {
                let hwnd = FindWindowW(std::ptr::null(), title.as_ptr());
                if !hwnd.is_null() {
                    ShowWindowAsync(hwnd, SW_RESTORE);
                    SetForegroundWindow(hwnd);
                }
            }
        }
        return;
    }
    tauri::Builder::default()
        .setup(move |app| {
            let engine = Engine::new(app.path().app_config_dir()?);
            if let Err(error) = engine.set_autostart(engine.status().autostart) {
                engine.error(error);
            }
            app.manage(engine);
            use tauri::{
                menu::{Menu, MenuItem},
                tray::TrayIconBuilder,
            };
            let open = MenuItem::with_id(app, "open", "Öffnen", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Beenden", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            let tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("packaged icon").clone())
                .tooltip("blank. Mayhem Collector")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show(app),
                    "quit" => app.exit(0),
                    _ => (),
                })
                .build(app)?;
            app.manage(tray);
            if !background {
                show(app.handle());
            }
            let handle = app.handle().clone();
            let totals_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    totals_handle.state::<Engine>().totals().await;
                    tokio::time::sleep(std::time::Duration::from_secs(30)).await;
                }
            });
            tauri::async_runtime::spawn(async move {
                loop {
                    if let Err(error) = handle.state::<Engine>().cycle().await {
                        handle.state::<Engine>().error(error);
                    }
                    tokio::time::sleep(std::time::Duration::from_secs(120)).await;
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![status, autostart])
        .run(tauri::generate_context!())
        .expect("Collector could not start");
}
