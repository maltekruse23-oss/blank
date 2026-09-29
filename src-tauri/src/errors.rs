//! Error log on this PC only (`errors.log` next to twitch.json): what went wrong in the app, its
//! popouts and here, so a friend can copy a report (Settings → System → Fehlerbericht) and send it
//! themselves. Nothing is ever sent from here. The user's own folder and name are taken out of
//! every line; the file stays small (one older file is kept).

use std::{
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::{AppHandle, Manager};

const FILE: &str = "errors.log";
const OLD_FILE: &str = "errors.old.log";
/// Past this size the log becomes the older file and a new one starts.
const MAX_BYTES: u64 = 128 * 1024;
const MAX_MESSAGE: usize = 2000;
const MAX_SOURCE: usize = 40;
/// Lines in a report (from the end of both files).
const REPORT_LINES: usize = 80;

static DIR: OnceLock<PathBuf> = OnceLock::new();
static WRITING: Mutex<()> = Mutex::new(());

/// Where the log goes, and panics (crashes of the Rust side) are written to it too.
pub fn init(app: &AppHandle) {
    if let Ok(dir) = app.path().app_config_dir() {
        let _ = DIR.set(dir);
    }
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        record("Absturz", &info.to_string());
        previous(info);
    }));
}

/// One line in the log; `source`: where it happened ("ARAM", "App", "Popout" …).
pub fn record(source: &str, message: &str) {
    let Some(dir) = DIR.get() else { return };
    let line = line(now_utc(), source, message);
    // A panic while writing must not poison the log for later lines.
    let _guard = WRITING
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let _ = std::fs::create_dir_all(dir);
    let path = dir.join(FILE);
    if std::fs::metadata(&path).is_ok_and(|m| m.len() > MAX_BYTES) {
        let _ = std::fs::rename(&path, dir.join(OLD_FILE));
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(file, "{line}");
    }
}

fn line(time: String, source: &str, message: &str) -> String {
    let source: String = source
        .chars()
        .filter(|c| c.is_alphanumeric() || " -_.".contains(*c))
        .take(MAX_SOURCE)
        .collect();
    let message: String = message
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .take(MAX_MESSAGE)
        .collect();
    private(&format!("{time} {source}: {}", message.trim()))
}

/// Takes the user's folder and name out (they show up in paths and Windows' messages).
fn private(text: &str) -> String {
    let mut text = text.to_owned();
    if let Ok(home) = std::env::var("USERPROFILE") {
        text = replace_ignoring_case(&text, &home, "%USERPROFILE%", false);
    }
    if let Ok(name) = std::env::var("USERNAME") {
        if name.chars().count() >= 3 {
            text = replace_ignoring_case(&text, &name, "%USERNAME%", true);
        }
    }
    text
}

/// `word`: only where it stands alone (a short name must not change "maximal" for "Max").
fn replace_ignoring_case(text: &str, needle: &str, with: &str, word: bool) -> String {
    if needle.is_empty() {
        return text.to_owned();
    }
    if !needle.is_ascii() {
        return text.replace(needle, with);
    }
    let (bytes, find) = (text.as_bytes(), needle.as_bytes());
    let apart = |at: Option<&u8>| at.is_none_or(|b| !b.is_ascii_alphanumeric() && b.is_ascii());
    let mut out = String::with_capacity(text.len());
    let mut from = 0;
    let mut i = 0;
    while i + find.len() <= bytes.len() {
        // Only ASCII is compared, so a match starts and ends on character boundaries.
        let alone = !word
            || (apart(i.checked_sub(1).and_then(|b| bytes.get(b)))
                && apart(bytes.get(i + find.len())));
        if alone && bytes[i..i + find.len()].eq_ignore_ascii_case(find) {
            out.push_str(&text[from..i]);
            out.push_str(with);
            i += find.len();
            from = i;
        } else {
            i += 1;
        }
    }
    out.push_str(&text[from..]);
    out
}

fn now_utc() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    stamp(secs)
}

/// "2026-09-30 14:05:09 UTC" from seconds since 1970 (civil calendar, no library needed).
fn stamp(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let rest = secs % 86_400;
    // Howard Hinnant's days-to-civil algorithm.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02} {:02}:{:02}:{:02} UTC",
        rest / 3600,
        rest / 60 % 60,
        rest % 60
    )
}

fn last_lines(dir: &Path) -> Vec<String> {
    let mut lines: Vec<String> = [OLD_FILE, FILE]
        .iter()
        .filter_map(|name| std::fs::read_to_string(dir.join(name)).ok())
        .flat_map(|text| text.lines().map(str::to_owned).collect::<Vec<_>>())
        .filter(|line| !line.trim().is_empty())
        .collect();
    let skip = lines.len().saturating_sub(REPORT_LINES);
    lines.drain(..skip);
    lines
}

/// From the app or a popout (errors the page caught); only text, checked and shortened here.
#[tauri::command]
pub fn log_error(source: String, message: String) {
    record(&source, &message);
}

/// The report to copy: version, Windows, the last lines of the log. Nothing leaves this PC here.
#[tauri::command]
pub fn error_report(app: AppHandle) -> String {
    let lines = DIR.get().map(|dir| last_lines(dir)).unwrap_or_default();
    #[cfg(windows)]
    let windows = match crate::winver::build() {
        Some(build) if build >= crate::winver::FIRST_WINDOWS_11 => format!("11 (Build {build})"),
        Some(build) => format!("10 (Build {build})"),
        None => "unbekannt".to_owned(),
    };
    #[cfg(not(windows))]
    let windows = "–".to_owned();
    let body = if lines.is_empty() {
        "Keine Fehler aufgezeichnet.".to_owned()
    } else {
        lines.join("\n")
    };
    format!(
        "blank. Fehlerbericht\nVersion: {}\nWindows: {windows}\nErstellt: {}\n\n{body}\n",
        app.package_info().version,
        now_utc()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dates_follow_the_calendar() {
        assert_eq!(stamp(0), "1970-01-01 00:00:00 UTC");
        assert_eq!(stamp(951_782_400), "2000-02-29 00:00:00 UTC");
        assert_eq!(stamp(1_790_719_716), "2026-09-29 22:08:36 UTC");
    }

    #[test]
    fn names_are_taken_out_in_any_case() {
        assert_eq!(
            replace_ignoring_case(
                r"C:\Users\Kim\x c:\users\KIM\y",
                r"C:\Users\Kim",
                "%U%",
                false
            ),
            r"%U%\x %U%\y"
        );
        assert_eq!(replace_ignoring_case("äöü Kim", "kim", "X", true), "äöü X");
        assert_eq!(
            replace_ignoring_case("Max maximal max.", "max", "X", true),
            "X maximal X."
        );
        assert_eq!(replace_ignoring_case("abc", "", "X", true), "abc");
    }

    #[test]
    fn lines_are_one_line_and_short() {
        let text = line(
            "T".into(),
            "Pop\nout!",
            &format!("a\nb{}", "x".repeat(5000)),
        );
        assert!(text.starts_with("T Popout: a b"));
        assert!(!text.contains('\n'));
        assert!(text.chars().count() < MAX_MESSAGE + 20);
    }
}
