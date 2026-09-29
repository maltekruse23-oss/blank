//! What is playing in any app that reports to Windows (Spotify, browsers, media players, blank.'s
//! own mix): the same source Windows uses for its own media flyout and the lock screen
//! (GlobalSystemMediaTransportControls). Event-driven: Windows announces every change, nothing is
//! polled. Besides reading, only on click in a popout: play/pause, skipping, jumping, repeat and
//! shuffle, opening the player; and, if switched on, pausing other players when one starts.
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Mutex, OnceLock,
};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use windows::{
    Foundation::TypedEventHandler,
    Media::{
        Control::{
            GlobalSystemMediaTransportControlsSession as Session,
            GlobalSystemMediaTransportControlsSessionManager as Manager,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
        },
        MediaPlaybackAutoRepeatMode as Repeat,
    },
    Storage::Streams::{DataReader, IRandomAccessStreamReference},
    Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED},
};

/// Settings → Popouts → "Andere Medien automatisch pausieren" (set by the app window).
static PAUSE_OTHERS: AtomicBool = AtomicBool::new(false);
/// A track counts as having ended by itself when the next one comes this close to its end.
const END_SLACK: f64 = 6.0;

/// Covers larger than this are left out; a popout shows them as a small square.
const MAX_COVER_BYTES: u64 = 512 * 1024;
/// Windows often reports one change in several steps (title, then cover); wait for the last one.
const SETTLE: Duration = Duration::from_millis(250);

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    title: String,
    artist: String,
    /// Name of the playing app, e.g. "Spotify" or "Chrome".
    app: String,
    playing: bool,
    /// Cover as a data: URL, if the app provides one.
    cover: Option<String>,
    can_previous: bool,
    can_next: bool,
    can_toggle: bool,
    /// "none", "one" or "all"; None if the player does not say.
    repeat: Option<&'static str>,
    shuffle: Option<bool>,
    can_repeat: bool,
    can_shuffle: bool,
    /// This track came by itself because the one before ran to its end (for "Als Nächstes").
    by_itself: bool,
}

/// Where the current track was last reported: position and length in seconds, when (ms since
/// 1970) and whether it played; for telling a track that ended from one that was skipped.
#[derive(Clone, Copy)]
struct Progress {
    position: f64,
    duration: f64,
    at: f64,
    playing: bool,
}

impl Progress {
    fn ended(&self, now: f64) -> bool {
        let played = if self.playing {
            (now - self.at) / 1000.0
        } else {
            0.0
        };
        self.duration > 0.0 && self.position + played >= self.duration - END_SLACK
    }
}

fn now_ms() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0.0, |d| d.as_millis() as f64)
}

static CURRENT: Mutex<Option<NowPlaying>> = Mutex::new(None);
static MANAGER: OnceLock<Manager> = OnceLock::new();

enum Signal {
    /// Another app became the current one (or none plays any more).
    Session,
    /// Title, cover or play state of the current app changed.
    Changed,
}

/// Handlers on the current app's session; removed again when another app takes over.
struct Bound {
    session: Session,
    properties: i64,
    playback: i64,
}

impl Bound {
    fn new(session: Session, send: &mpsc::Sender<Signal>) -> windows::core::Result<Self> {
        let (on_properties, on_playback) = (send.clone(), send.clone());
        let properties = session.MediaPropertiesChanged(&TypedEventHandler::new(move |_, _| {
            let _ = on_properties.send(Signal::Changed);
            Ok(())
        }))?;
        let playback = session.PlaybackInfoChanged(&TypedEventHandler::new(move |_, _| {
            let _ = on_playback.send(Signal::Changed);
            Ok(())
        }))?;
        Ok(Self {
            session,
            properties,
            playback,
        })
    }
}

impl Drop for Bound {
    fn drop(&mut self) {
        let _ = self.session.RemoveMediaPropertiesChanged(self.properties);
        let _ = self.session.RemovePlaybackInfoChanged(self.playback);
    }
}

/// Starts watching; changes arrive as the event `media-changed` (a NowPlaying or null).
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        if let Err(error) = watch(app) {
            crate::errors::record(
                "Musik",
                &format!("Medien-Überwachung nicht verfügbar: {error}"),
            );
        }
    });
}

fn watch(app: AppHandle) -> windows::core::Result<()> {
    // SAFETY: joins the multithreaded COM apartment for this thread, which lives as long as the app.
    unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).ok()? };
    let manager = Manager::RequestAsync()?.get()?;
    let _ = MANAGER.set(manager.clone());
    let (send, receive) = mpsc::channel();
    let on_session = send.clone();
    manager.CurrentSessionChanged(&TypedEventHandler::new(move |_, _| {
        let _ = on_session.send(Signal::Session);
        Ok(())
    }))?;
    let mut bound: Option<Bound> = None;
    let mut cover: Option<(String, String)> = None;
    // The track on screen, whether it came by itself, and where it was last reported.
    let mut track = String::new();
    let mut by_itself = false;
    let mut progress: Option<Progress> = None;
    let mut rebind = true;
    loop {
        if rebind {
            // The old app's handlers go first (Drop), then the new app's are added.
            drop(bound.take());
            bound = manager
                .GetCurrentSession()
                .ok()
                .and_then(|session| Bound::new(session, &send).ok());
        }
        let mut now = bound
            .as_ref()
            .and_then(|b| read(&b.session, &mut cover).ok().flatten());
        if let Some(playing) = now.as_mut() {
            let key = format!("{}\n{}\n{}", playing.app, playing.title, playing.artist);
            if key != track {
                by_itself = progress.is_some_and(|p| p.ended(now_ms()));
                track = key;
            }
            playing.by_itself = by_itself;
            progress = bound.as_ref().and_then(|b| progress_of(&b.session));
            // Another player took over and plays: the others pause (a setting).
            if rebind && playing.playing && PAUSE_OTHERS.load(Ordering::Relaxed) {
                if let Some(b) = bound.as_ref() {
                    pause_others(&manager, Some(&b.session));
                }
            }
        } else {
            track.clear();
            progress = None;
        }
        publish(&app, now);
        // Wait for the next change, then give Windows a moment to report all of it.
        let Ok(first) = receive.recv() else {
            return Ok(());
        };
        std::thread::sleep(SETTLE);
        rebind = matches!(first, Signal::Session);
        for signal in receive.try_iter() {
            rebind |= matches!(signal, Signal::Session);
        }
    }
}

/// The current app's track; None while it has no title. `cover` keeps the last track's cover, so
/// it is read once per track and not again at every pause.
fn read(
    session: &Session,
    cover: &mut Option<(String, String)>,
) -> windows::core::Result<Option<NowPlaying>> {
    let properties = session.TryGetMediaPropertiesAsync()?.get()?;
    let title = properties.Title()?.to_string();
    if title.trim().is_empty() {
        return Ok(None);
    }
    let artist = properties.Artist()?.to_string();
    let app = app_name(&session.SourceAppUserModelId()?.to_string());
    let info = session.GetPlaybackInfo()?;
    let controls = info.Controls()?;
    let key = format!("{app}\n{title}\n{artist}");
    let image = match cover {
        Some((known, image)) if *known == key => Some(image.clone()),
        _ => {
            let image = properties
                .Thumbnail()
                .ok()
                .and_then(|thumbnail| read_cover(&thumbnail).ok().flatten());
            // Apps often send the cover a moment after the title; try again next time.
            *cover = image.clone().map(|image| (key, image));
            image
        }
    };
    let repeat = info
        .AutoRepeatMode()
        .and_then(|mode| mode.Value())
        .ok()
        .map(|mode| match mode {
            Repeat::Track => "one",
            Repeat::List => "all",
            _ => "none",
        });
    Ok(Some(NowPlaying {
        title,
        artist,
        app,
        playing: info.PlaybackStatus()? == Status::Playing,
        cover: image,
        can_previous: controls.IsPreviousEnabled()?,
        can_next: controls.IsNextEnabled()?,
        can_toggle: controls.IsPlayPauseToggleEnabled()?,
        repeat,
        shuffle: info.IsShuffleActive().and_then(|on| on.Value()).ok(),
        can_repeat: controls.IsRepeatEnabled().unwrap_or(false),
        can_shuffle: controls.IsShuffleEnabled().unwrap_or(false),
        by_itself: false,
    }))
}

/// Where the session's track is, if it reports a length (live streams do not).
fn progress_of(session: &Session) -> Option<Progress> {
    let timeline = session.GetTimelineProperties().ok()?;
    let start = timeline.StartTime().ok()?.Duration;
    let duration = (timeline.EndTime().ok()?.Duration - start) as f64 / 1e7;
    let position = (timeline.Position().ok()?.Duration - start) as f64 / 1e7;
    let now = now_ms();
    let at = timeline
        .LastUpdatedTime()
        .ok()
        .and_then(|time| unix_ms(time.UniversalTime))
        .filter(|&at| at <= now)
        .unwrap_or(now);
    let playing = session
        .GetPlaybackInfo()
        .and_then(|info| info.PlaybackStatus())
        .is_ok_and(|status| status == Status::Playing);
    Some(Progress {
        position,
        duration,
        at,
        playing,
    })
}

/// Pauses every playing session except `keep` (and never blank.'s own mix).
fn pause_others(manager: &Manager, keep: Option<&Session>) {
    let Ok(sessions) = manager.GetSessions() else {
        return;
    };
    let kept = keep.and_then(|s| s.SourceAppUserModelId().ok());
    for index in 0..sessions.Size().unwrap_or(0) {
        let Ok(session) = sessions.GetAt(index) else {
            continue;
        };
        let Ok(id) = session.SourceAppUserModelId() else {
            continue;
        };
        if Some(&id) == kept.as_ref() || app_name(&id.to_string()) == "blank." {
            continue;
        }
        let playing = session
            .GetPlaybackInfo()
            .and_then(|info| info.PlaybackStatus())
            .is_ok_and(|status| status == Status::Playing);
        if playing {
            let _ = session
                .TryPauseAsync()
                .and_then(|operation| operation.get());
        }
    }
}

fn read_cover(reference: &IRandomAccessStreamReference) -> windows::core::Result<Option<String>> {
    let stream = reference.OpenReadAsync()?.get()?;
    let size = stream.Size()?;
    if size == 0 || size > MAX_COVER_BYTES {
        return Ok(None);
    }
    let reader = DataReader::CreateDataReader(&stream)?;
    reader.LoadAsync(size as u32)?.get()?;
    let mut bytes = vec![0u8; size as usize];
    reader.ReadBytes(&mut bytes)?;
    Ok(
        image_type(&bytes)
            .map(|mime| format!("data:{mime};base64,{}", crate::apps::base64(&bytes))),
    )
}

/// The image type from the first bytes; only formats the WebView shows.
fn image_type(bytes: &[u8]) -> Option<&'static str> {
    match bytes {
        [0xFF, 0xD8, 0xFF, ..] => Some("image/jpeg"),
        [0x89, b'P', b'N', b'G', ..] => Some("image/png"),
        [b'G', b'I', b'F', b'8', ..] => Some("image/gif"),
        [b'B', b'M', ..] => Some("image/bmp"),
        [b'R', b'I', b'F', b'F', _, _, _, _, b'W', b'E', b'B', b'P', ..] => Some("image/webp"),
        _ => None,
    }
}

/// Readable name for the app Windows names by its ID: an exe name or path for desktop apps,
/// "Publisher.Package_hash!AppId" for Store apps.
fn app_name(id: &str) -> String {
    const KNOWN: &[(&str, &str)] = &[
        ("spotify", "Spotify"),
        ("chrome", "Chrome"),
        ("msedge", "Edge"),
        ("firefox", "Firefox"),
        // Firefox reports this fixed ID instead of its name.
        ("308046b0af4a39cb", "Firefox"),
        ("opera", "Opera"),
        ("brave", "Brave"),
        ("discord", "Discord"),
        ("vlc", "VLC"),
        ("zunemusic", "Medienwiedergabe"),
        ("zunevideo", "Filme & TV"),
        ("blank", "blank."),
    ];
    let name = match id.split_once('!') {
        Some((package, app)) => {
            let app = app.rsplit('.').next().unwrap_or(app);
            if app.eq_ignore_ascii_case("app") {
                let family = package.split('_').next().unwrap_or(package);
                family.rsplit('.').next().unwrap_or(family)
            } else {
                app
            }
        }
        None => {
            let file = id.rsplit(['\\', '/']).next().unwrap_or(id).trim();
            match file.len().checked_sub(4) {
                Some(end) if file[end..].eq_ignore_ascii_case(".exe") => &file[..end],
                _ => file,
            }
        }
    };
    if let Some((_, known)) = KNOWN.iter().find(|(key, _)| key.eq_ignore_ascii_case(name)) {
        return known.to_string();
    }
    let mut chars = name.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => "Musik".to_string(),
    }
}

fn publish(app: &AppHandle, now: Option<NowPlaying>) {
    let Ok(mut current) = CURRENT.lock() else {
        return;
    };
    if *current == now {
        return;
    }
    current.clone_from(&now);
    drop(current);
    let _ = app.emit("media-changed", now);
}

#[tauri::command]
pub fn media_current() -> Option<NowPlaying> {
    CURRENT.lock().ok().and_then(|current| current.clone())
}

/// Progress of the current track, read only when a popout shows it (Windows would otherwise report
/// it every second). `updated_at`: when the app last reported `position` (ms since 1970).
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Timeline {
    position: f64,
    duration: f64,
    updated_at: f64,
    can_seek: bool,
}

/// Windows' DateTime (100 ns since 1601) as ms since 1970; None for "never".
fn unix_ms(universal: i64) -> Option<f64> {
    const EPOCH_1970: i64 = 116_444_736_000_000_000;
    (universal > EPOCH_1970).then(|| (universal - EPOCH_1970) as f64 / 10_000.0)
}

#[tauri::command]
pub async fn media_timeline() -> Option<Timeline> {
    tauri::async_runtime::spawn_blocking(|| {
        let session = MANAGER.get()?.GetCurrentSession().ok()?;
        let progress = progress_of(&session)?;
        // Live streams have no length: no progress bar.
        if progress.duration <= 0.0 {
            return None;
        }
        let can_seek = session
            .GetPlaybackInfo()
            .and_then(|info| info.Controls())
            .and_then(|controls| controls.IsPlaybackPositionEnabled())
            .unwrap_or(false);
        Some(Timeline {
            position: progress.position.clamp(0.0, progress.duration),
            duration: progress.duration,
            updated_at: progress.at,
            can_seek,
        })
    })
    .await
    .ok()
    .flatten()
}

/// Jumps to `seconds` in the current track (a click on the progress bar).
#[tauri::command]
pub async fn media_seek(seconds: f64) -> Result<(), String> {
    if !seconds.is_finite() || seconds < 0.0 {
        return Err("Ungültige Stelle".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let session = MANAGER
            .get()
            .and_then(|manager| manager.GetCurrentSession().ok())
            .ok_or("Gerade läuft nichts")?;
        let start = session
            .GetTimelineProperties()
            .and_then(|timeline| timeline.StartTime())
            .map_or(0, |time| time.Duration);
        match session
            .TryChangePlaybackPositionAsync(start + (seconds * 1e7) as i64)
            .and_then(|operation| operation.get())
        {
            Ok(true) => Ok(()),
            _ => Err("Die App hat nicht reagiert".to_string()),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Play/pause, next or previous track, next repeat mode (none → all → one) or shuffle on/off in
/// the app that currently plays.
#[tauri::command]
pub async fn media_control(action: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || control(&action))
        .await
        .map_err(|error| error.to_string())?
}

fn current_session() -> Result<Session, String> {
    MANAGER
        .get()
        .and_then(|manager| manager.GetCurrentSession().ok())
        .ok_or_else(|| "Gerade läuft nichts".to_string())
}

fn control(action: &str) -> Result<(), String> {
    let session = current_session()?;
    let info = || session.GetPlaybackInfo();
    let operation = match action {
        "toggle" => session.TryTogglePlayPauseAsync(),
        "next" => session.TrySkipNextAsync(),
        "previous" => session.TrySkipPreviousAsync(),
        "repeat" => {
            let now = info()
                .and_then(|i| i.AutoRepeatMode())
                .and_then(|m| m.Value())
                .unwrap_or(Repeat::None);
            session.TryChangeAutoRepeatModeAsync(match now {
                Repeat::None => Repeat::List,
                Repeat::List => Repeat::Track,
                _ => Repeat::None,
            })
        }
        "shuffle" => {
            let on = info()
                .and_then(|i| i.IsShuffleActive())
                .and_then(|s| s.Value())
                .unwrap_or(false);
            session.TryChangeShuffleActiveAsync(!on)
        }
        _ => return Err("Unbekannte Aktion".into()),
    };
    match operation.and_then(|operation| operation.get()) {
        Ok(true) => Ok(()),
        _ => Err("Die App hat nicht reagiert".into()),
    }
}

/// Settings the app window passes on: pause other players when one starts.
#[tauri::command]
pub fn media_settings(pause_others: bool) {
    PAUSE_OTHERS.store(pause_others, Ordering::Relaxed);
}

/// blank.'s own mix starts (with "pause other players" on): every other playing app pauses.
#[tauri::command]
pub async fn media_pause_others() {
    let _ = tauri::async_runtime::spawn_blocking(|| {
        if let Some(manager) = MANAGER.get() {
            pause_others(manager, None);
        }
    })
    .await;
}

/// Brings the playing app to the front (a click on its name in a popout): a Store app is started
/// by its ID, a desktop app's window is restored and shown.
#[tauri::command]
pub async fn media_open_player() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        let id = current_session()?
            .SourceAppUserModelId()
            .map_err(|error| error.to_string())?
            .to_string();
        open_player(&id)
    })
    .await
    .map_err(|error| error.to_string())?
}

/// The executable a desktop app's ID stands for, e.g. "Spotify.exe", "chrome" → "chrome.exe".
fn executable(id: &str) -> Option<String> {
    if id.contains('!') {
        return None;
    }
    let file = id.rsplit(['\\', '/']).next().unwrap_or(id).trim();
    let stem = match file.len().checked_sub(4) {
        Some(end) if file[end..].eq_ignore_ascii_case(".exe") => &file[..end],
        _ => file,
    };
    // Firefox reports a fixed ID instead of its name.
    let stem = if stem.eq_ignore_ascii_case("308046B0AF4A39CB") {
        "firefox"
    } else {
        stem
    };
    (!stem.is_empty()).then(|| format!("{}.exe", stem.to_lowercase()))
}

fn open_player(id: &str) -> Result<(), String> {
    use windows_sys::Win32::UI::{
        Shell::ShellExecuteW,
        WindowsAndMessaging::{
            GetWindowTextLengthW, IsIconic, SetForegroundWindow, ShowWindow, SW_RESTORE,
            SW_SHOWNORMAL,
        },
    };
    let wide = |text: &str| text.encode_utf16().chain(Some(0)).collect::<Vec<u16>>();
    let Some(exe) = executable(id) else {
        // Store app: started (or brought to the front) by Windows through its ID.
        let (verb, file, args) = (
            wide("open"),
            wide("explorer.exe"),
            wide(&format!("shell:AppsFolder\\{id}")),
        );
        // SAFETY: all strings are null-terminated and live during the call.
        let result = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                verb.as_ptr(),
                file.as_ptr(),
                args.as_ptr(),
                std::ptr::null(),
                SW_SHOWNORMAL,
            )
        };
        return if result as isize > 32 {
            Ok(())
        } else {
            Err("Player nicht gefunden".into())
        };
    };
    let pids = crate::pc::program_pids(&exe);
    let window = crate::pc::windows()
        .into_iter()
        // SAFETY: plain query on a window handle from EnumWindows.
        .find(|(hwnd, pid)| pids.contains(pid) && unsafe { GetWindowTextLengthW(*hwnd) } > 0)
        .map(|(hwnd, _)| hwnd)
        .ok_or("Player nicht gefunden")?;
    // SAFETY: valid window handle; the click in the popout lets blank. hand over the front.
    unsafe {
        if IsIconic(window) != 0 {
            ShowWindow(window, SW_RESTORE);
        }
        SetForegroundWindow(window);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_names_are_readable() {
        assert_eq!(app_name("Spotify.exe"), "Spotify");
        assert_eq!(
            app_name(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
            "Chrome"
        );
        assert_eq!(app_name("MSEdge"), "Edge");
        assert_eq!(app_name("308046B0AF4A39CB"), "Firefox");
        assert_eq!(
            app_name("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify"),
            "Spotify"
        );
        assert_eq!(
            app_name("Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic"),
            "Medienwiedergabe"
        );
        assert_eq!(
            app_name("AppleInc.AppleMusicWin_nzyj5cx40ttqa!App"),
            "AppleMusicWin"
        );
        assert_eq!(app_name(r"D:\Tools\blank.EXE"), "blank.");
        assert_eq!(app_name("tidal.exe"), "Tidal");
        assert_eq!(app_name(""), "Musik");
    }

    #[test]
    fn players_are_found_by_their_program() {
        assert_eq!(executable("Spotify.exe").as_deref(), Some("spotify.exe"));
        assert_eq!(executable("chrome").as_deref(), Some("chrome.exe"));
        assert_eq!(
            executable(r"C:\Apps\VLC\vlc.exe").as_deref(),
            Some("vlc.exe")
        );
        assert_eq!(
            executable("308046B0AF4A39CB").as_deref(),
            Some("firefox.exe")
        );
        assert_eq!(
            executable("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify"),
            None
        );
        assert_eq!(executable(""), None);
    }

    #[test]
    fn a_track_ended_by_itself_only_near_its_end() {
        let at = 1_000_000.0;
        let track = |position, playing| Progress {
            position,
            duration: 200.0,
            at,
            playing,
        };
        // Reported at 190 s, playing, next track 8 s later: ran to its end.
        assert!(track(190.0, true).ended(at + 8_000.0));
        // Skipped after a minute.
        assert!(!track(60.0, true).ended(at + 1_000.0));
        // Paused at 100 s, much later a new track: skipped, not ended.
        assert!(!track(100.0, false).ended(at + 600_000.0));
        // Reported at the start, played through (no report in between).
        assert!(track(0.0, true).ended(at + 199_000.0));
        // No length (live stream): never "ended".
        let live = Progress {
            position: 0.0,
            duration: 0.0,
            at,
            playing: true,
        };
        assert!(!live.ended(at + 10_000_000.0));
    }

    #[test]
    fn windows_times_become_unix_times() {
        // 2026-01-01 00:00:00 UTC.
        assert_eq!(unix_ms(134_116_992_000_000_000), Some(1_767_225_600_000.0));
        assert_eq!(unix_ms(0), None);
    }

    #[test]
    fn only_known_image_types_become_covers() {
        assert_eq!(image_type(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("image/jpeg"));
        assert_eq!(image_type(b"\x89PNG\r\n"), Some("image/png"));
        assert_eq!(image_type(b"RIFF\0\0\0\0WEBPVP8"), Some("image/webp"));
        assert_eq!(image_type(b"<svg"), None);
        assert_eq!(image_type(&[]), None);
    }
}
