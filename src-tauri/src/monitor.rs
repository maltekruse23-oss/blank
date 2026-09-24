//! Start position: centred on the second monitor (the first one that is not the primary monitor).
//! With a single monitor the window keeps the default position.
use tauri::{PhysicalPosition, PhysicalSize, WebviewWindow};

pub fn place_on_second(window: &WebviewWindow) -> tauri::Result<()> {
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
