//! Pet mode: the main window turns into a small pet on the desktop and back. It stays the same
//! window and WebView (no second browser process), so Twitch polling and go-live alerts keep
//! running; the web content only switches its view. The window is transparent (tauri.conf.json);
//! the normal app paints its own opaque background. In pet mode it is small, borderless and only
//! on top (and larger) while a speech bubble is shown. The taskbar button always brings back the
//! full app, not the pet.
use crate::{single_instance, taskbar, window_aspect};
use std::sync::{
    atomic::{AtomicBool, AtomicU32, Ordering},
    Mutex, OnceLock,
};
use tauri::{AppHandle, Emitter, LogicalSize, PhysicalPosition, PhysicalSize, Size, WebviewWindow};
use windows_sys::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    UI::{
        Shell::{DefSubclassProc, SetWindowSubclass},
        WindowsAndMessaging::{
            ShowWindowAsync, SC_MINIMIZE, SW_MINIMIZE, WA_INACTIVE, WM_ACTIVATE, WM_SYSCOMMAND,
        },
    },
};

#[derive(Default)]
pub struct PetState(Mutex<Inner>);

/// Same as `Inner::active`, for the window procedure (which must not wait for the mutex).
static ACTIVE: AtomicBool = AtomicBool::new(false);
static APP: OnceLock<AppHandle> = OnceLock::new();
static SHOW_APP_MESSAGE: AtomicU32 = AtomicU32::new(0);
const SUBCLASS_ID: usize = 0xB1A6;

pub fn is_active() -> bool {
    ACTIVE.load(Ordering::Relaxed)
}

/// Asks the web content to turn the pet back into the app (App.tsx).
fn emit_show_app() {
    if let Some(app) = APP.get() {
        let _ = app.emit("show-app", ());
    }
}

/// In pet mode, a click on the taskbar button either activates the window (it was in the
/// background) or minimizes it (it was the active window). Both bring back the full app instead.
/// Whether it really was blank.'s button is checked on another thread (taskbar.rs); a minimize
/// that did not come from it is carried out afterwards.
unsafe extern "system" fn taskbar_opens_app(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    _data: usize,
) -> LRESULT {
    // A second start of blank. (single_instance.rs); emitted after this message is handled.
    if msg == SHOW_APP_MESSAGE.load(Ordering::Relaxed) && msg != 0 {
        std::thread::spawn(emit_show_app);
        return 0;
    }
    if is_active() {
        let activated = msg == WM_ACTIVATE && (wparam & 0xFFFF) as u32 != WA_INACTIVE;
        let minimize = msg == WM_SYSCOMMAND && (wparam & 0xFFF0) as u32 == SC_MINIMIZE;
        if activated || minimize {
            if let Some((taskbar, point)) = taskbar::under_cursor() {
                let window = hwnd as isize;
                std::thread::spawn(move || {
                    if taskbar::on_own_button(taskbar, point) {
                        emit_show_app();
                    } else if minimize {
                        // SAFETY: only posts a request; Windows ignores it for a closed window.
                        unsafe { ShowWindowAsync(window as HWND, SW_MINIMIZE) };
                    }
                });
                if minimize {
                    return 0;
                }
            }
        }
    }
    DefSubclassProc(hwnd, msg, wparam, lparam)
}

pub fn watch_taskbar(
    app: &AppHandle,
    window: &WebviewWindow,
) -> Result<(), Box<dyn std::error::Error>> {
    let _ = APP.set(app.clone());
    SHOW_APP_MESSAGE.store(single_instance::show_app_message(), Ordering::Relaxed);
    let hwnd = window.hwnd()?.0 as HWND;
    // SAFETY: setup runs on the UI thread that owns this valid HWND.
    if unsafe { SetWindowSubclass(hwnd, Some(taskbar_opens_app), SUBCLASS_ID, 0) } == 0 {
        return Err("Window subclass for the taskbar button could not be installed".into());
    }
    Ok(())
}

#[derive(Default)]
struct Inner {
    active: bool,
    /// Window position and client size of the normal app, restored on the way back.
    normal: Option<(PhysicalPosition<i32>, PhysicalSize<u32>)>,
    /// Bottom-right corner of the pet: stays put when the window grows for a bubble.
    anchor: Option<PhysicalPosition<i32>>,
}

/// Distance of a new pet from the corner of the screen's work area (logical pixels).
const MARGIN: f64 = 24.0;

fn failed(error: impl std::fmt::Display) -> String {
    error.to_string()
}

/// Rounded corners and the thin Windows 11 border only make sense for the normal app.
fn window_frame(window: &WebviewWindow, normal: bool) {
    use windows_sys::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_WINDOW_CORNER_PREFERENCE,
    };
    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    let hwnd = hwnd.0 as windows_sys::Win32::Foundation::HWND;
    // DWMWA_COLOR_DEFAULT / DWMWA_COLOR_NONE; DWMWCP_DEFAULT / DWMWCP_DONOTROUND.
    let border: u32 = if normal { 0xFFFF_FFFF } else { 0xFFFF_FFFE };
    let corners: i32 = if normal { 0 } else { 1 };
    // SAFETY: valid window handle; the attribute values point to local integers of the right size.
    unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR as u32,
            (&border as *const u32).cast(),
            4,
        );
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE as u32,
            (&corners as *const i32).cast(),
            4,
        );
    }
}

/// Places the pet so its bottom-right corner is at `anchor`, inside the monitor's work area.
fn place(
    window: &WebviewWindow,
    anchor: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
) -> tauri::Result<()> {
    let (w, h) = (size.width as i32, size.height as i32);
    let (mut x, mut y) = (anchor.x - w, anchor.y - h);
    if let Some(monitor) = window.current_monitor()? {
        let area = monitor.work_area();
        let (left, top) = (area.position.x, area.position.y);
        let (right, bottom) = (left + area.size.width as i32, top + area.size.height as i32);
        x = x.clamp(left, (right - w).max(left));
        y = y.clamp(top, (bottom - h).max(top));
    }
    window.set_size(size)?;
    window.set_position(PhysicalPosition::new(x, y))
}

fn pet_size(window: &WebviewWindow, width: f64, height: f64) -> tauri::Result<PhysicalSize<u32>> {
    let scale = window.scale_factor()?;
    Ok(LogicalSize::new(width.clamp(40.0, 600.0), height.clamp(40.0, 600.0)).to_physical(scale))
}

/// Switches between the app and the pet. `width`/`height`: pet size in CSS pixels.
#[tauri::command]
pub fn set_pet_mode(
    window: WebviewWindow,
    state: tauri::State<'_, PetState>,
    enabled: bool,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let mut inner = state.0.lock().map_err(failed)?;
    if enabled == inner.active {
        return Ok(());
    }
    if enabled {
        let position = window.outer_position().map_err(failed)?;
        let size = window.inner_size().map_err(failed)?;
        inner.normal = Some((position, size));
        let anchor = match inner.anchor {
            Some(anchor) => anchor,
            None => {
                let monitor = window
                    .current_monitor()
                    .map_err(failed)?
                    .ok_or("Kein Monitor gefunden")?;
                let area = monitor.work_area();
                let margin = (MARGIN * monitor.scale_factor()).round() as i32;
                PhysicalPosition::new(
                    area.position.x + area.size.width as i32 - margin,
                    area.position.y + area.size.height as i32 - margin,
                )
            }
        };
        window_aspect::set_free(true);
        window.set_min_size(None::<Size>).map_err(failed)?;
        window.set_max_size(None::<Size>).map_err(failed)?;
        window.set_resizable(false).map_err(failed)?;
        window.set_shadow(false).map_err(failed)?;
        window_frame(&window, false);
        window.set_zoom(1.0).map_err(failed)?;
        let size = pet_size(&window, width, height).map_err(failed)?;
        place(&window, anchor, size).map_err(failed)?;
    } else {
        // Remember where the pet sat (it may have been dragged).
        if let (Ok(position), Ok(size)) = (window.outer_position(), window.outer_size()) {
            inner.anchor = Some(PhysicalPosition::new(
                position.x + size.width as i32,
                position.y + size.height as i32,
            ));
        }
        window_aspect::set_free(false);
        window.set_always_on_top(false).map_err(failed)?;
        window.set_resizable(true).map_err(failed)?;
        window
            .set_min_size(Some(LogicalSize::new(
                window_aspect::MIN_WIDTH,
                window_aspect::MIN_HEIGHT.round(),
            )))
            .map_err(failed)?;
        window
            .set_max_size(Some(LogicalSize::new(
                window_aspect::MAX_WIDTH,
                window_aspect::MAX_HEIGHT.round(),
            )))
            .map_err(failed)?;
        window.set_shadow(true).map_err(failed)?;
        window_frame(&window, true);
        if let Some((position, size)) = inner.normal.take() {
            window.set_size(size).map_err(failed)?;
            window.set_position(position).map_err(failed)?;
        }
        window_aspect::fit_content(&window);
    }
    inner.active = enabled;
    ACTIVE.store(enabled, Ordering::Relaxed);
    Ok(())
}

/// Resizes the pet (speech bubble) while its bottom-right corner stays in place. `front`: while a
/// bubble is shown, the pet comes out from behind other windows (restored if minimized) and stays
/// on top, without taking the keyboard focus; afterwards it is a normal window again.
#[tauri::command]
pub fn pet_resize(
    window: WebviewWindow,
    state: tauri::State<'_, PetState>,
    width: f64,
    height: f64,
    front: bool,
) -> Result<(), String> {
    let inner = state.0.lock().map_err(failed)?;
    if !inner.active {
        return Ok(());
    }
    if window.is_minimized().map_err(failed)? {
        if !front {
            return Ok(());
        }
        use windows_sys::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOWNOACTIVATE};
        let hwnd = window.hwnd().map_err(failed)?.0 as windows_sys::Win32::Foundation::HWND;
        // SAFETY: valid window handle; restores without activating.
        unsafe { ShowWindow(hwnd, SW_SHOWNOACTIVATE) };
    }
    window.set_always_on_top(front).map_err(failed)?;
    let position = window.outer_position().map_err(failed)?;
    let current = window.outer_size().map_err(failed)?;
    let anchor = PhysicalPosition::new(
        position.x + current.width as i32,
        position.y + current.height as i32,
    );
    let size = pet_size(&window, width, height).map_err(failed)?;
    place(&window, anchor, size).map_err(failed)
}
