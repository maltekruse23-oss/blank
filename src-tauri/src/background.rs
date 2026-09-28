//! Low resource use while minimized or hidden in the notification area (the X, see lib.rs). wry
//! leaves the WebView2 "visible" in both cases, so the page would keep rendering and its timers
//! would run at full rate. Then the WebView is marked invisible (the page sees `document.hidden`,
//! Chromium throttles it) and asked to use less memory; scripts keep running, so go-live alerts,
//! their sound and popouts still work.
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Manager, WebviewWindow, Window};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
    COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
};
use windows_core::Interface;

static MINIMIZED: AtomicBool = AtomicBool::new(false);
static HIDDEN: AtomicBool = AtomicBool::new(false);
/// What the WebView was last set to (minimized or hidden).
static IDLE: AtomicBool = AtomicBool::new(false);

/// Call on every resize; acts only when the window was minimized or restored.
pub fn sync(window: &Window) {
    MINIMIZED.store(window.is_minimized().unwrap_or(false), Ordering::Relaxed);
    if let Some(webview) = window.get_webview_window(window.label()) {
        apply(&webview);
    }
}

/// The window was hidden into the notification area, or shown again.
pub fn set_hidden(webview: &WebviewWindow, hidden: bool) {
    HIDDEN.store(hidden, Ordering::Relaxed);
    apply(webview);
}

fn apply(webview: &WebviewWindow) {
    let idle = MINIMIZED.load(Ordering::Relaxed) || HIDDEN.load(Ordering::Relaxed);
    if IDLE.swap(idle, Ordering::Relaxed) == idle {
        return;
    }
    let _ = webview.with_webview(move |platform| {
        let controller = platform.controller();
        let level = if idle {
            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
        } else {
            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
        };
        // SAFETY: COM calls on the live WebView2 controller, on the main thread (with_webview).
        unsafe {
            let _ = controller.SetIsVisible(!idle);
            if let Ok(webview) = controller
                .CoreWebView2()
                .and_then(|w| w.cast::<ICoreWebView2_19>())
            {
                let _ = webview.SetMemoryUsageTargetLevel(level);
            }
        }
    });
}
