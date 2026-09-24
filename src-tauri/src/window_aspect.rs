//! Fixed 860 : 640 aspect ratio for the main window. The web content is zoomed with the window,
//! so the layout is always exactly 860 × 640 CSS pixels and never reflows.
use std::sync::atomic::{AtomicBool, Ordering};
use windows_sys::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM},
    UI::{
        HiDpi::GetDpiForWindow,
        Shell::{DefSubclassProc, SetWindowSubclass},
        WindowsAndMessaging::{
            GetClientRect, GetWindowRect, IsIconic, MINMAXINFO, SWP_NOSIZE, WINDOWPOS, WMSZ_BOTTOM,
            WMSZ_BOTTOMLEFT, WMSZ_LEFT, WMSZ_TOP, WMSZ_TOPLEFT, WMSZ_TOPRIGHT, WM_GETMINMAXINFO,
            WM_SIZING, WM_WINDOWPOSCHANGING,
        },
    },
};

/// Logical client size the layout is designed for (keep in sync with tauri.conf.json).
const BASE_WIDTH: f64 = 860.0;
const BASE_HEIGHT: f64 = 640.0;
pub const MIN_WIDTH: f64 = 720.0;
pub const MAX_WIDTH: f64 = 1000.0;
pub const MIN_HEIGHT: f64 = MIN_WIDTH * BASE_HEIGHT / BASE_WIDTH;
pub const MAX_HEIGHT: f64 = MAX_WIDTH * BASE_HEIGHT / BASE_WIDTH;
const SUBCLASS_ID: usize = 0xB1A5;

/// Pet mode (pet.rs): no fixed ratio, no size limits, no content zoom.
static FREE: AtomicBool = AtomicBool::new(false);

pub fn set_free(free: bool) {
    FREE.store(free, Ordering::Relaxed);
}

/// Client size in physical pixels for a requested client width: clamped, at the fixed ratio.
fn client_size(hwnd: HWND, width: i32) -> (i32, i32) {
    // SAFETY: hwnd is the live main window.
    let scale = unsafe { GetDpiForWindow(hwnd) }.max(96) as f64 / 96.0;
    let width = (width as f64).clamp(MIN_WIDTH * scale, MAX_WIDTH * scale);
    (
        width.round() as i32,
        (width * BASE_HEIGHT / BASE_WIDTH).round() as i32,
    )
}

/// Size of the (invisible) resize borders the window rect has beyond the client area.
fn frame(hwnd: HWND) -> (i32, i32) {
    let mut window = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    let mut client = window;
    // SAFETY: hwnd is the live main window; both rects are valid out-pointers.
    unsafe {
        GetWindowRect(hwnd, &mut window);
        GetClientRect(hwnd, &mut client);
    }
    (
        (window.right - window.left) - client.right,
        (window.bottom - window.top) - client.bottom,
    )
}

unsafe extern "system" fn keep_ratio(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    _data: usize,
) -> LRESULT {
    if FREE.load(Ordering::Relaxed) {
        return DefSubclassProc(hwnd, msg, wparam, lparam);
    }
    match msg {
        // Interactive resizing: the dragged edge drives, the opposite side follows.
        WM_SIZING => {
            // SAFETY: for WM_SIZING, lparam points to the proposed window RECT.
            let rect = &mut *(lparam as *mut RECT);
            let edge = wparam as u32;
            let (fx, fy) = frame(hwnd);
            let width = if edge == WMSZ_TOP || edge == WMSZ_BOTTOM {
                let height = (rect.bottom - rect.top - fy) as f64;
                (height * BASE_WIDTH / BASE_HEIGHT).round() as i32
            } else {
                rect.right - rect.left - fx
            };
            let (w, h) = client_size(hwnd, width);
            if matches!(edge, WMSZ_LEFT | WMSZ_TOPLEFT | WMSZ_BOTTOMLEFT) {
                rect.left = rect.right - w - fx;
            } else {
                rect.right = rect.left + w + fx;
            }
            if matches!(edge, WMSZ_TOP | WMSZ_TOPLEFT | WMSZ_TOPRIGHT) {
                rect.top = rect.bottom - h - fy;
            } else {
                rect.bottom = rect.top + h + fy;
            }
            1
        }
        // Any other size change (snapping, DPI change, API calls): keep the top-left corner.
        WM_WINDOWPOSCHANGING => {
            // SAFETY: for WM_WINDOWPOSCHANGING, lparam points to a writable WINDOWPOS.
            let pos = &mut *(lparam as *mut WINDOWPOS);
            // Minimizing moves the window to -32000; leave that and iconic windows alone.
            if pos.flags & SWP_NOSIZE == 0 && IsIconic(hwnd) == 0 && pos.x > -30000 {
                let (fx, fy) = frame(hwnd);
                let (w, h) = client_size(hwnd, pos.cx - fx);
                pos.cx = w + fx;
                pos.cy = h + fy;
            }
            DefSubclassProc(hwnd, msg, wparam, lparam)
        }
        // Exact DPI-aware limits; tao's own values ignore the invisible borders.
        WM_GETMINMAXINFO => {
            let result = DefSubclassProc(hwnd, msg, wparam, lparam);
            // SAFETY: for WM_GETMINMAXINFO, lparam points to a writable MINMAXINFO.
            let info = &mut *(lparam as *mut MINMAXINFO);
            let (fx, fy) = frame(hwnd);
            let (min_w, min_h) = client_size(hwnd, 0);
            let (max_w, max_h) = client_size(hwnd, i32::MAX);
            info.ptMinTrackSize = POINT {
                x: min_w + fx,
                y: min_h + fy,
            };
            info.ptMaxTrackSize = POINT {
                x: max_w + fx,
                y: max_h + fy,
            };
            result
        }
        _ => DefSubclassProc(hwnd, msg, wparam, lparam),
    }
}

pub fn apply(window: &tauri::WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    let hwnd = window.hwnd()?.0 as HWND;
    // SAFETY: setup runs on the UI thread that owns this valid HWND.
    if unsafe { SetWindowSubclass(hwnd, Some(keep_ratio), SUBCLASS_ID, 0) } == 0 {
        return Err("Window subclass for the aspect ratio could not be installed".into());
    }
    fit_content(window);
    let target = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. } =
            event
        {
            fit_content(&target);
        }
    });
    Ok(())
}

/// Zooms the web content so its viewport stays exactly BASE_WIDTH CSS pixels wide.
pub fn fit_content(window: &tauri::WebviewWindow) {
    if FREE.load(Ordering::Relaxed) {
        let _ = window.set_zoom(1.0);
        return;
    }
    let (Ok(size), Ok(scale)) = (window.inner_size(), window.scale_factor()) else {
        return;
    };
    if size.width == 0 {
        return; // minimized
    }
    let _ = window.set_zoom(size.width as f64 / scale / BASE_WIDTH);
}
