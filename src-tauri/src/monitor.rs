//! Start position: where the window was last (window.json next to twitch.json), if that place is
//! still on a screen; otherwise (first start, screen gone) centred on the second monitor (the
//! first one that is not the primary monitor). With a single monitor the window keeps the default
//! position then.
use std::{
    path::PathBuf,
    sync::atomic::{AtomicBool, AtomicU64, Ordering},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, Window};

const FILE: &str = "window.json";
/// Written once the window has not moved for this long (not on every step of a drag).
const SETTLE: Duration = Duration::from_millis(600);
/// Windows parks minimized windows far outside every screen.
const PARKED: i32 = -30_000;

/// Outer position in physical pixels, size in logical pixels (the same on screens with another
/// display scale).
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
struct Place {
    x: i32,
    y: i32,
    width: f64,
    height: f64,
}

/// A screen's work area: x, y, width, height in physical pixels.
type Area = (i32, i32, i32, i32);

pub fn place(window: &WebviewWindow) -> tauri::Result<()> {
    if let Some(place) = saved(window) {
        let areas: Vec<Area> = window
            .available_monitors()?
            .iter()
            .map(|m| {
                let area = m.work_area();
                (
                    area.position.x,
                    area.position.y,
                    area.size.width as i32,
                    area.size.height as i32,
                )
            })
            .collect();
        let scale = window.scale_factor()?;
        let outer = ((place.width * scale).round() as i32, 40);
        if reachable((place.x, place.y), outer, &areas) {
            window.set_position(PhysicalPosition::new(place.x, place.y))?;
            // After moving: the size in the scale of the screen it is on now.
            return window.set_size(LogicalSize::new(place.width, place.height));
        }
    }
    place_on_second(window)
}

/// The top of the window (where it is grabbed) lies within a screen's work area: at least a strip
/// of `grip` (width, height) around its middle.
fn reachable(at: (i32, i32), grip: (i32, i32), areas: &[Area]) -> bool {
    let middle = at.0 + grip.0 / 2;
    areas.iter().any(|&(x, y, width, height)| {
        middle >= x + 40 && middle <= x + width - 40 && at.1 >= y - 8 && at.1 + grip.1 <= y + height
    })
}

fn place_on_second(window: &WebviewWindow) -> tauri::Result<()> {
    let Some(primary) = window.primary_monitor()? else {
        return Ok(());
    };
    let Some(target) = window
        .available_monitors()?
        .into_iter()
        .find(|m| m.position() != primary.position())
    else {
        return Ok(());
    };
    // Keep the logical size if the second monitor uses another display scale.
    let ratio = target.scale_factor() / window.scale_factor()?;
    let outer = window.outer_size()?;
    let size = PhysicalSize::new(
        (f64::from(outer.width) * ratio).round() as i32,
        (f64::from(outer.height) * ratio).round() as i32,
    );
    let area = target.work_area();
    let (width, height) = (area.size.width as i32, area.size.height as i32);
    window.set_position(PhysicalPosition::new(
        area.position.x + (width - size.width).max(0) / 2,
        area.position.y + (height - size.height).max(0) / 2,
    ))
}

fn path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join(FILE))
}

fn saved(window: &WebviewWindow) -> Option<Place> {
    let text = std::fs::read_to_string(path(window.app_handle())?).ok()?;
    let place: Place = serde_json::from_str(&text).ok()?;
    let sane = place.width.is_finite()
        && place.height.is_finite()
        && (100.0..=4000.0).contains(&place.width)
        && (100.0..=4000.0).contains(&place.height)
        && place.x > PARKED
        && place.y > PARKED;
    sane.then_some(place)
}

static PENDING: AtomicBool = AtomicBool::new(false);
static CHANGED_AT: AtomicU64 = AtomicU64::new(0);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

/// The window moved or changed its size: saved once it rests (never while minimized or hidden).
pub fn remember(window: &Window) {
    CHANGED_AT.store(now_ms(), Ordering::Relaxed);
    if PENDING.swap(true, Ordering::AcqRel) {
        return;
    }
    let window = window.clone();
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(SETTLE);
            let quiet = now_ms().saturating_sub(CHANGED_AT.load(Ordering::Relaxed));
            if quiet >= SETTLE.as_millis() as u64 {
                break;
            }
        }
        PENDING.store(false, Ordering::Release);
        save(&window);
    });
}

fn save(window: &Window) {
    let shown = window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(true);
    let (Ok(at), Ok(size), Ok(scale)) = (
        window.outer_position(),
        window.outer_size(),
        window.scale_factor(),
    ) else {
        return;
    };
    if !shown || at.x <= PARKED || at.y <= PARKED || size.width == 0 {
        return;
    }
    let inner = window.inner_size().unwrap_or(size);
    let place = Place {
        x: at.x,
        y: at.y,
        width: f64::from(inner.width) / scale,
        height: f64::from(inner.height) / scale,
    };
    let Some(path) = path(window.app_handle()) else {
        return;
    };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(text) = serde_json::to_string(&place) {
        let _ = std::fs::write(path, text);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCREENS: [Area; 2] = [(0, 0, 1920, 1040), (1920, 0, 2560, 1400)];

    #[test]
    fn only_a_place_on_a_screen_counts() {
        assert!(reachable((600, 200), (860, 40), &SCREENS));
        assert!(reachable((2500, 300), (860, 40), &SCREENS));
        // Partly off to the right, but its middle is still on the second screen.
        assert!(reachable((4000, 100), (860, 40), &SCREENS));
        // The screen on the right is gone.
        assert!(!reachable((2500, 300), (860, 40), &SCREENS[..1]));
        // Above every screen or its top below the bottom.
        assert!(!reachable((600, -200), (860, 40), &SCREENS));
        assert!(!reachable((600, 1030), (860, 40), &SCREENS));
    }
}
