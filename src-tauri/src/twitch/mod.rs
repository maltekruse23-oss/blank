//! Twitch access for the frontend adapter (`src/adapters/twitchHelix.ts`).
//! Client ID and channel selection live in `<app config dir>/twitch.json`, the OAuth token only
//! in the Windows Credential Manager. The frontend never receives a token, only public data.
mod auth;
mod eventsub;
mod helix;

pub use eventsub::start as start_eventsub;

use std::{
    path::PathBuf,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use reqwest::{Response, StatusCode};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tokio::sync::{Mutex, Notify};

const HELIX: &str = "https://api.twitch.tv/helix";
// Twitch requires validating OAuth sessions on start and hourly.
const VALIDATE_EVERY: Duration = Duration::from_secs(3600);
const MAX_CHANNELS: usize = 100;

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum TwitchError {
    NotConfigured,
    Unauthenticated,
    Offline,
    RateLimited,
    LoginExpired,
    LoginCancelled,
    Unknown { message: String },
}

impl From<reqwest::Error> for TwitchError {
    fn from(error: reqwest::Error) -> Self {
        if error.is_connect() || error.is_timeout() {
            Self::Offline
        } else {
            Self::Unknown {
                message: error.to_string(),
            }
        }
    }
}

pub type Result<T> = std::result::Result<T, TwitchError>;

#[derive(Clone, Serialize, Deserialize)]
pub struct GameRef {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchedChannel {
    pub login: String,
    pub display_name: String,
    pub games: Vec<GameRef>,
    /// Absent in selections saved before profile images existed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub profile_image_url: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelRef {
    login: String,
    display_name: String,
    profile_image_url: Option<String>,
}

impl From<helix::User> for ChannelRef {
    fn from(user: helix::User) -> Self {
        Self {
            login: user.login,
            display_name: user.display_name,
            profile_image_url: Some(user.profile_image_url).filter(|url| !url.is_empty()),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveStream {
    pub login: String,
    pub title: String,
    pub game: GameRef,
    pub viewers: u64,
    pub thumbnail_url: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    configured: bool,
    signed_in: bool,
    login: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceLogin {
    user_code: String,
    verification_uri: String,
    expires_in: u64,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Settings {
    client_id: Option<String>,
    watchlist: Vec<WatchedChannel>,
}

#[derive(Default)]
struct Session {
    token: Option<auth::Token>,
    login: Option<String>,
    validated_at: Option<Instant>,
    pending: Option<PendingLogin>,
}

#[derive(Clone)]
struct PendingLogin {
    device_code: String,
    interval: Duration,
    expires_at: Instant,
}

pub struct Twitch {
    http: reqwest::Client,
    settings_path: PathBuf,
    // Lock order: settings before session.
    settings: Mutex<Settings>,
    session: Mutex<Session>,
    /// Signals the EventSub task that the watched channels or the account changed.
    eventsub_changed: Notify,
    eventsub_status: std::sync::Mutex<EventSubStatus>,
}

#[derive(Clone, Copy, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventSubStatus {
    connected: bool,
    /// Channels with an active "went live" subscription.
    watched: usize,
}

impl Twitch {
    fn set_eventsub_status(&self, connected: bool, watched: usize) {
        if let Ok(mut status) = self.eventsub_status.lock() {
            *status = EventSubStatus { connected, watched };
        }
    }
}

#[tauri::command]
pub fn twitch_eventsub_status(twitch: State<'_, Twitch>) -> EventSubStatus {
    twitch
        .eventsub_status
        .lock()
        .map(|status| *status)
        .unwrap_or_default()
}

/// Opens a URL in the default browser. Callers only pass URLs they built or checked themselves.
pub(crate) fn open_url(url: &str) {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL};
        let wide = |s: &str| s.encode_utf16().chain(Some(0)).collect::<Vec<u16>>();
        let (verb, file) = (wide("open"), wide(url));
        // SAFETY: both buffers are NUL-terminated and outlive the call.
        unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                verb.as_ptr(),
                file.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                SW_SHOWNORMAL,
            );
        }
    }
    #[cfg(not(windows))]
    let _ = url;
}

/// Maps HTTP failures to error kinds the frontend can show.
pub async fn check(response: Response) -> Result<Response> {
    #[derive(Deserialize)]
    struct ErrorBody {
        message: String,
    }
    match response.status() {
        status if status.is_success() => Ok(response),
        StatusCode::UNAUTHORIZED => Err(TwitchError::Unauthenticated),
        StatusCode::TOO_MANY_REQUESTS => Err(TwitchError::RateLimited),
        status => Err(TwitchError::Unknown {
            message: response
                .json::<ErrorBody>()
                .await
                .map(|body| body.message)
                .unwrap_or_else(|_| status.to_string()),
        }),
    }
}

impl Twitch {
    pub fn new(app: &AppHandle) -> std::result::Result<Self, Box<dyn std::error::Error>> {
        let settings_path = app.path().app_config_dir()?.join("twitch.json");
        let settings = std::fs::read_to_string(&settings_path)
            .ok()
            .and_then(|json| serde_json::from_str(&json).ok())
            .unwrap_or_default();
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .user_agent(concat!("blank/", env!("CARGO_PKG_VERSION")))
            .build()?;
        Ok(Self {
            http,
            settings_path,
            settings: Mutex::new(settings),
            session: Mutex::new(Session {
                token: auth::load_token(),
                ..Session::default()
            }),
            eventsub_changed: Notify::new(),
            eventsub_status: std::sync::Mutex::default(),
        })
    }

    /// Channels watched instantly via EventSub: the first ones of the selection.
    async fn watched_logins(&self) -> Vec<String> {
        self.settings
            .lock()
            .await
            .watchlist
            .iter()
            .take(eventsub::MAX_WATCHED)
            .map(|c| c.login.clone())
            .collect()
    }

    /// The pending device login, unless it was cancelled or replaced by a newer one.
    async fn pending(&self, device_code: &str) -> Option<PendingLogin> {
        self.session
            .lock()
            .await
            .pending
            .clone()
            .filter(|p| p.device_code == device_code)
    }

    async fn client_id(&self) -> Result<String> {
        self.settings
            .lock()
            .await
            .client_id
            .clone()
            .ok_or(TwitchError::NotConfigured)
    }

    /// Client ID and channel selection for the settings file (settings_file.rs). The login (token)
    /// is never part of it.
    pub(crate) async fn export(&self) -> serde_json::Value {
        let settings = self.settings.lock().await;
        serde_json::json!({ "clientId": settings.client_id, "watchlist": settings.watchlist })
    }

    fn save(&self, settings: &Settings) -> Result<()> {
        let io = |error: std::io::Error| TwitchError::Unknown {
            message: error.to_string(),
        };
        if let Some(dir) = self.settings_path.parent() {
            std::fs::create_dir_all(dir).map_err(io)?;
        }
        let json =
            serde_json::to_string_pretty(settings).map_err(|error| TwitchError::Unknown {
                message: error.to_string(),
            })?;
        std::fs::write(&self.settings_path, json).map_err(io)
    }

    /// A usable access token: validated on first use and hourly, refreshed when rejected.
    async fn access_token(&self, client_id: &str) -> Result<String> {
        let mut session = self.session.lock().await;
        let Some(access) = session.token.as_ref().map(|t| t.access_token.clone()) else {
            return Err(TwitchError::Unauthenticated);
        };
        if session
            .validated_at
            .is_none_or(|at| at.elapsed() > VALIDATE_EVERY)
        {
            match auth::validate(&self.http, &access).await? {
                Some(login) => {
                    session.login = Some(login);
                    session.validated_at = Some(Instant::now());
                }
                None => self.refresh(&mut session, client_id).await?,
            }
        }
        session
            .token
            .as_ref()
            .map(|t| t.access_token.clone())
            .ok_or(TwitchError::Unauthenticated)
    }

    async fn refresh(&self, session: &mut Session, client_id: &str) -> Result<()> {
        let Some(refresh_token) = session.token.as_ref().map(|t| t.refresh_token.clone()) else {
            return Err(TwitchError::Unauthenticated);
        };
        match auth::refresh(&self.http, client_id, &refresh_token).await {
            Ok(token) => {
                auth::store_token(&token)?;
                session.token = Some(token);
                // Validate the new token on next use to learn the login again.
                session.validated_at = None;
                Ok(())
            }
            Err(TwitchError::Unauthenticated) => {
                auth::delete_token();
                *session = Session::default();
                Err(TwitchError::Unauthenticated)
            }
            Err(error) => Err(error),
        }
    }

    /// GET a Helix endpoint; a rejected token is refreshed once.
    async fn helix<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, &str)],
    ) -> Result<Vec<T>> {
        let client_id = self.client_id().await?;
        let mut refreshed = false;
        loop {
            let token = self.access_token(&client_id).await?;
            let response = self
                .http
                .get(format!("{HELIX}/{path}"))
                .header("Client-Id", &client_id)
                .bearer_auth(&token)
                .query(query)
                .send()
                .await?;
            if response.status() == StatusCode::UNAUTHORIZED && !refreshed {
                refreshed = true;
                let mut session = self.session.lock().await;
                self.refresh(&mut session, &client_id).await?;
                continue;
            }
            return Ok(check(response).await?.json::<helix::Page<T>>().await?.data);
        }
    }
}

#[tauri::command]
pub async fn twitch_account(twitch: State<'_, Twitch>) -> Result<Account> {
    let Ok(client_id) = twitch.client_id().await else {
        return Ok(Account {
            configured: false,
            signed_in: false,
            login: None,
        });
    };
    match twitch.access_token(&client_id).await {
        Ok(_) | Err(TwitchError::Unauthenticated | TwitchError::Offline) => {}
        Err(error) => return Err(error),
    }
    let session = twitch.session.lock().await;
    Ok(Account {
        configured: true,
        signed_in: session.token.is_some(),
        login: session.login.clone(),
    })
}

#[tauri::command]
pub async fn twitch_set_client_id(twitch: State<'_, Twitch>, client_id: String) -> Result<()> {
    let client_id = client_id.trim().to_owned();
    // Twitch client IDs are ~30 characters; shorter input is usually a channel name.
    if !(20..=64).contains(&client_id.len())
        || !client_id.bytes().all(|b| b.is_ascii_alphanumeric())
    {
        return Err(TwitchError::Unknown {
            message: "Ungültige Client-ID".into(),
        });
    }
    let mut settings = twitch.settings.lock().await;
    if settings.client_id.as_deref() != Some(client_id.as_str()) {
        // Tokens belong to one client ID.
        auth::delete_token();
        *twitch.session.lock().await = Session::default();
    }
    settings.client_id = Some(client_id);
    twitch.save(&settings)?;
    twitch.eventsub_changed.notify_one();
    Ok(())
}

#[tauri::command]
pub async fn twitch_start_login(twitch: State<'_, Twitch>) -> Result<DeviceLogin> {
    let client_id = twitch.client_id().await?;
    let device = auth::start(&twitch.http, &client_id).await?;
    twitch.session.lock().await.pending = Some(PendingLogin {
        device_code: device.device_code,
        interval: Duration::from_secs(device.interval.max(1)),
        expires_at: Instant::now() + Duration::from_secs(device.expires_in),
    });
    auth::open_in_browser(&device.verification_uri);
    Ok(DeviceLogin {
        user_code: device.user_code,
        verification_uri: device.verification_uri,
        expires_in: device.expires_in,
    })
}

/// Waits until the user confirmed the code in the browser, the code expired, or login was cancelled.
#[tauri::command]
pub async fn twitch_finish_login(twitch: State<'_, Twitch>) -> Result<Account> {
    let client_id = twitch.client_id().await?;
    let Some(first) = twitch.session.lock().await.pending.clone() else {
        return Err(TwitchError::LoginCancelled);
    };
    let device_code = first.device_code;
    loop {
        let Some(pending) = twitch.pending(&device_code).await else {
            return Err(TwitchError::LoginCancelled);
        };
        if Instant::now() >= pending.expires_at {
            twitch.session.lock().await.pending = None;
            return Err(TwitchError::LoginExpired);
        }
        tokio::time::sleep(pending.interval).await;
        if twitch.pending(&device_code).await.is_none() {
            return Err(TwitchError::LoginCancelled);
        }
        match auth::poll(&twitch.http, &client_id, &device_code).await? {
            auth::Poll::Pending => {}
            auth::Poll::SlowDown => {
                if let Some(p) = twitch.session.lock().await.pending.as_mut() {
                    p.interval += Duration::from_secs(5);
                }
            }
            auth::Poll::Expired => {
                twitch.session.lock().await.pending = None;
                return Err(TwitchError::LoginExpired);
            }
            auth::Poll::Done(token) => {
                auth::store_token(&token)?;
                *twitch.session.lock().await = Session {
                    token: Some(token),
                    ..Session::default()
                };
                twitch.eventsub_changed.notify_one();
                return twitch_account(twitch).await;
            }
        }
    }
}

#[tauri::command]
pub async fn twitch_cancel_login(twitch: State<'_, Twitch>) -> Result<()> {
    twitch.session.lock().await.pending = None;
    Ok(())
}

#[tauri::command]
pub async fn twitch_logout(twitch: State<'_, Twitch>) -> Result<()> {
    let token = std::mem::take(&mut *twitch.session.lock().await).token;
    auth::delete_token();
    twitch.eventsub_changed.notify_one();
    if let (Some(token), Ok(client_id)) = (token, twitch.client_id().await) {
        auth::revoke(&twitch.http, &client_id, &token.access_token).await;
    }
    Ok(())
}

/// Opens the channel on twitch.tv in the default browser; the URL is built here from a valid login.
#[tauri::command]
pub fn twitch_open_channel(login: String) -> Result<()> {
    let login = login.trim().to_lowercase();
    if !helix::is_login(&login) {
        return Err(TwitchError::Unknown {
            message: "Ungültiger Kanal".into(),
        });
    }
    open_url(&format!("https://www.twitch.tv/{login}"));
    Ok(())
}

#[tauri::command]
pub async fn twitch_load_watchlist(twitch: State<'_, Twitch>) -> Result<Vec<WatchedChannel>> {
    Ok(twitch.settings.lock().await.watchlist.clone())
}

#[tauri::command]
pub async fn twitch_save_watchlist(
    twitch: State<'_, Twitch>,
    channels: Vec<WatchedChannel>,
) -> Result<()> {
    if channels.len() > MAX_CHANNELS || channels.iter().any(|c| !helix::is_login(&c.login)) {
        return Err(TwitchError::Unknown {
            message: "Ungültige Kanalauswahl".into(),
        });
    }
    let watched = |list: &[WatchedChannel]| -> Vec<String> {
        list.iter()
            .take(eventsub::MAX_WATCHED)
            .map(|c| c.login.clone())
            .collect()
    };
    let mut settings = twitch.settings.lock().await;
    let changed = watched(&settings.watchlist) != watched(&channels);
    settings.watchlist = channels;
    twitch.save(&settings)?;
    // Only a different set of watched channels needs a new EventSub session.
    if changed {
        twitch.eventsub_changed.notify_one();
    }
    Ok(())
}

#[tauri::command]
pub async fn twitch_find_channel(
    twitch: State<'_, Twitch>,
    login: String,
) -> Result<Option<ChannelRef>> {
    let login = login.trim().to_lowercase();
    if !helix::is_login(&login) {
        return Ok(None);
    }
    let users: Vec<helix::User> = twitch.helix("users", &[("login", login.as_str())]).await?;
    Ok(users.into_iter().next().map(ChannelRef::from))
}

/// Current name and profile image of up to 100 channels in one request.
#[tauri::command]
pub async fn twitch_channels(
    twitch: State<'_, Twitch>,
    logins: Vec<String>,
) -> Result<Vec<ChannelRef>> {
    let query: Vec<(&str, &str)> = logins
        .iter()
        .map(String::as_str)
        .filter(|login| helix::is_login(login))
        .take(MAX_CHANNELS)
        .map(|login| ("login", login))
        .collect();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let users: Vec<helix::User> = twitch.helix("users", &query).await?;
    Ok(users.into_iter().map(ChannelRef::from).collect())
}

#[tauri::command]
pub async fn twitch_search_categories(
    twitch: State<'_, Twitch>,
    query: String,
) -> Result<Vec<GameRef>> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let found: Vec<helix::Category> = twitch
        .helix("search/categories", &[("query", query), ("first", "8")])
        .await?;
    Ok(found
        .into_iter()
        .map(|c| GameRef {
            id: c.id,
            name: c.name,
        })
        .collect())
}

#[tauri::command]
pub async fn twitch_live_streams(
    twitch: State<'_, Twitch>,
    logins: Vec<String>,
) -> Result<Vec<LiveStream>> {
    let mut query: Vec<(&str, &str)> = logins
        .iter()
        .map(String::as_str)
        .filter(|login| helix::is_login(login))
        .take(MAX_CHANNELS)
        .map(|login| ("user_login", login))
        .collect();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    query.push(("first", "100"));
    let streams: Vec<helix::Stream> = twitch.helix("streams", &query).await?;
    let bucket = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs() / 300);
    Ok(streams
        .into_iter()
        .filter_map(|s| s.into_live(bucket))
        .collect())
}
