use super::place::Taskbar;
use super::*;
use serde_json::json;

#[test]
fn finds_the_taskbar_from_screen_and_work_area() {
    let screen = (0, 0, 1920, 1080);
    // Bottom, 48 px high.
    assert_eq!(
        taskbar_in(screen, (0, 0, 1920, 1032)),
        Some(Taskbar {
            top: false,
            x: 0,
            y: 1032,
            height: 48
        })
    );
    // Top.
    assert_eq!(
        taskbar_in(screen, (0, 48, 1920, 1032)),
        Some(Taskbar {
            top: true,
            x: 0,
            y: 0,
            height: 48
        })
    );
    // Hidden (work area = screen), at the side: none.
    assert_eq!(taskbar_in(screen, screen), None);
    assert_eq!(taskbar_in(screen, (62, 0, 1858, 1080)), None);
    // A second screen left of the main one.
    assert_eq!(
        taskbar_in((-1920, 0, 1920, 1080), (-1920, 0, 1920, 1032)),
        Some(Taskbar {
            top: false,
            x: -1920,
            y: 1032,
            height: 48
        })
    );
}

#[test]
fn centres_the_card_in_the_taskbar() {
    let bottom = Taskbar {
        top: false,
        x: -1920,
        y: 1032,
        height: 48,
    };
    // Window 320 Ã— 60 (card 40 + inset 10 above and below), no invisible borders.
    let (x, y) = in_taskbar(bottom, (320, 60), (0, 0, 0, 0), 40, 10, 12, None);
    assert_eq!(x, -1920 + 12 - 10);
    // Card from 1036 to 1076: 4 px space above and below in the 48 px taskbar.
    assert_eq!(y + 10, 1036);
    assert_eq!(y + 60 - 10, 1076);
    // With room above to open into (window 190 high), the card stays at the same place.
    let (_, y) = in_taskbar(bottom, (320, 190), (0, 0, 0, 0), 40, 10, 12, None);
    assert_eq!(y + 190 - 10 - 40, 1036);
    // Icons on the left: the card ends 12 px left of the notification area (x -100).
    let (x, _) = in_taskbar(bottom, (320, 60), (0, 0, 0, 0), 40, 10, 12, Some(-100));
    assert_eq!(x + 320 - 10, -100 - 12);
    // Top taskbar: the card hangs from the top, room below.
    let top = Taskbar {
        top: true,
        x: 0,
        y: 0,
        height: 48,
    };
    let (_, y) = in_taskbar(top, (320, 190), (0, 0, 0, 0), 40, 10, 12, None);
    assert_eq!(y + 10, 4);
}

#[test]
fn only_known_small_items_are_shown() {
    assert!(check(&json!({ "kind": "music", "id": 1 })).is_ok());
    assert!(check(&json!({ "kind": "live", "id": 2, "login": "someone" })).is_ok());
    assert!(check(&json!({ "kind": "script" })).is_err());
    assert!(check(&json!({ "id": 3 })).is_err());
    assert!(check(&json!("music")).is_err());
    let long = "x".repeat(MAX_ITEM_BYTES);
    assert!(check(&json!({ "kind": "warning", "detail": long })).is_err());
}

#[test]
fn what_is_seen_sits_at_the_chosen_place() {
    // Measured on a 1920 Ã— 1080 screen with the taskbar at the bottom (work area 1032 high):
    // the popout is seen 362 Ã— 98 inside invisible borders of 7 px left, right and bottom.
    let (area, seen, borders) = ((0, 0, 1920, 1032), (362, 98), (7, 0, 7, 7));
    assert_eq!(corner("bottom-center", area, seen, borders, 12), (772, 922));
    assert_eq!(corner("bottom-left", area, seen, borders, 12), (5, 922));
    assert_eq!(corner("bottom-right", area, seen, borders, 12), (1539, 922));
    assert_eq!(corner("top-left", area, seen, borders, 12), (5, 12));
    assert_eq!(corner("top-center", area, seen, borders, 12), (772, 12));
    // A second screen to the right of the first.
    let second = (1920, 0, 2560, 1400);
    assert_eq!(corner("top-right", second, seen, borders, 12), (4099, 12));
    for place in PLACES {
        let (x, y) = corner(place, area, seen, borders, 12);
        // What is seen stays inside the work area.
        assert!(
            x + borders.0 >= 0 && x + borders.0 + seen.0 <= 1920,
            "{place}"
        );
        assert!(
            y + borders.1 >= 0 && y + borders.1 + seen.1 <= 1032,
            "{place}"
        );
    }
}
