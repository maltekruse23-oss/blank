//! Low resource use while minimized. wry leaves the WebView2 "visible" when the window is minimized,
//! so the page would keep rendering and its timers would run at full rate. Minimized, the WebView is
//! marked invisible (the page sees `document.hidden`, Chromium throttles it) and asked to use less
//! memory; scripts keep running, so go-live alerts and their sound still work.
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Manager, Window};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
    COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
};
use windows_core::Interface;

static MINIMIZED: AtomicBool = AtomicBool::new(false);

/// Call on every resize; acts only when the window was minimized or restored.
pub fn sync(window: &Window) {
    let minimized = window.is_minimized().unwrap_or(false);
    if MINIMIZED.swap(minimized, Ordering::Relaxed) == minimized {
        return;
    }
    let Some(webview) = window.get_webview_window(window.label()) else {
        return;
    };
    let _ = webview.with_webview(move |platform| {
        let controller = platform.controller();
        let level = if minimized {
            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
        } else {
            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
        };
        // SAFETY: COM calls on the live WebView2 controller, on the main thread (with_webview).
        unsafe {
            let _ = controller.SetIsVisible(!minimized);
            if let Ok(webview) = controller
                .CoreWebView2()
                .and_then(|w| w.cast::<ICoreWebView2_19>())
            {
                let _ = webview.SetMemoryUsageTargetLevel(level);
            }
        }
    });
}
