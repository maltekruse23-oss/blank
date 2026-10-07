//! The popout window itself: its handle, showing without focus, creating it, and its frame.

use tauri::{
    window::{Effect, EffectsBuilder},
    AppHandle, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
    COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
};
use windows_core::Interface;
use windows_sys::Win32::{
    Foundation::HWND,
    UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_TOOLWINDOW,
    },
};

use super::{failed, WIDTH};

pub(super) fn hwnd(window: &WebviewWindow) -> Result<HWND, String> {
    Ok(window.hwnd().map_err(failed)?.0 as HWND)
}

/// While hidden, the page counts as invisible and uses less memory (as the minimized app does,
/// background.rs); before it is shown again, it draws normally.
pub(super) fn set_visible(window: &WebviewWindow, visible: bool) {
    let _ = window.with_webview(move |platform| {
        let controller = platform.controller();
        let level = if visible {
            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
        } else {
            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
        };
        // SAFETY: COM calls on the live WebView2 controller, on the main thread (with_webview).
        unsafe {
            let _ = controller.SetIsVisible(visible);
            if let Ok(webview) = controller
                .CoreWebView2()
                .and_then(|w| w.cast::<ICoreWebView2_19>())
            {
                let _ = webview.SetMemoryUsageTargetLevel(level);
            }
        }
    });
}

/// The popout window. It is transparent and has no frame of Windows: the popout draws its own
/// background, border and shadow, so all of it slides and fades in and out together. With
/// `acrylic`, Windows blurs what lies behind it instead (with its own frame and shadow; the blur
/// itself appears at once).
pub(super) fn create(app: &AppHandle, label: &str, acrylic: bool) -> Result<(), String> {
    // Must match the main window's arguments: all share one WebView2 environment (gpu.rs).
    let args = crate::gpu::browser_args(app);
    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("blank. Popout")
        .inner_size(WIDTH, 80.0)
        .decorations(false)
        .transparent(true)
        .shadow(acrylic)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .focused(false)
        .visible(false);
    builder = builder.additional_browser_args(&args);
    let window = builder.build().map_err(failed)?;
    let handle = hwnd(&window)?;
    // SAFETY: valid top-level window of this process. Tool window: not in Alt+Tab. It appears
    // without activation (flyout_present); only a click on it activates it, which Windows needs
    // before the app may come to the front for "Details".
    unsafe {
        let style = GetWindowLongPtrW(handle, GWL_EXSTYLE);
        SetWindowLongPtrW(handle, GWL_EXSTYLE, style | WS_EX_TOOLWINDOW as isize);
    }
    windows_frame(handle, acrylic);
    if acrylic {
        // Without Acrylic support (older Windows) the popout simply stays opaque.
        let _ = window.set_effects(EffectsBuilder::new().effect(Effect::Acrylic).build());
    }
    Ok(())
}

/// Width of the invisible borders (left, top, right, bottom) between the window rect and what
/// Windows draws; None if Windows does not say.
pub(super) fn invisible_borders(handle: HWND) -> Option<(i32, i32, i32, i32)> {
    use windows_sys::Win32::{
        Foundation::RECT,
        Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS},
        UI::WindowsAndMessaging::GetWindowRect,
    };
    let empty = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    let (mut outer, mut seen) = (empty, empty);
    // SAFETY: valid window handle; both rects are local out-values of the right size.
    let known = unsafe {
        GetWindowRect(handle, &mut outer) != 0
            && DwmGetWindowAttribute(
                handle,
                DWMWA_EXTENDED_FRAME_BOUNDS as u32,
                (&mut seen as *mut RECT).cast(),
                std::mem::size_of::<RECT>() as u32,
            ) == 0
    };
    (known && seen.right > seen.left).then(|| {
        (
            seen.left - outer.left,
            seen.top - outer.top,
            outer.right - seen.right,
            outer.bottom - seen.bottom,
        )
    })
}

/// With Acrylic, Windows 11 rounds the corners and draws its thin border. Without, both stay off:
/// Windows would draw them around the whole transparent window, a second frame around the popout.
fn windows_frame(handle: HWND, acrylic: bool) {
    use windows_sys::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE,
        DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND, DWMWCP_ROUND,
    };
    let corners = if acrylic {
        DWMWCP_ROUND
    } else {
        DWMWCP_DONOTROUND
    };
    // SAFETY: valid window handle; the values point to local integers of the right size.
    unsafe {
        DwmSetWindowAttribute(
            handle,
            DWMWA_WINDOW_CORNER_PREFERENCE as u32,
            (&corners as *const i32).cast(),
            4,
        );
        if !acrylic {
            DwmSetWindowAttribute(
                handle,
                DWMWA_BORDER_COLOR as u32,
                (&DWMWA_COLOR_NONE as *const u32).cast(),
                4,
            );
        }
    }
}
