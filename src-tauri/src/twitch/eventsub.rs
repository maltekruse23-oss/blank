//! Instant "went live" notifications via EventSub WebSocket (`stream.online`).
//! Twitch allows a total subscription cost of 10 per user token, and `stream.online` for a
//! channel that has not authorized this app costs 1, so the first 10 selected channels are
//! watched here; polling in the frontend covers the rest and game switches.
//! https://dev.twitch.tv/docs/eventsub/handling-websocket-events/
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};
use tokio_tungstenite::{connect_async, tungstenite::Message};

use super::{check, helix, GameRef, Result, Twitch, TwitchError, HELIX};

const WS_URL: &str = "wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30";
pub const MAX_WATCHED: usize = 10;
const RETRY_AFTER: Duration = Duration::from_secs(20);
/// Frontend event; keep in sync with `src/adapters/twitchHelix.ts`.
const EVENT: &str = "twitch-stream-online";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamOnline {
    login: String,
    display_name: String,
    /// Empty id when the current game could not be read.
    game: GameRef,
    title: String,
}

#[derive(Deserialize)]
struct Envelope {
    metadata: Metadata,
    payload: serde_json::Value,
}

#[derive(Deserialize)]
struct Metadata {
    message_type: String,
}

enum End {
    /// Nothing to watch or not signed in: wait for a change.
    Idle,
    /// Selection or account changed, or Twitch asked to reconnect: start over now.
    Restart,
    /// Connection problem: retry after a pause.
    Failed,
}

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            let twitch = app.state::<Twitch>();
            let result = session(&app, &twitch).await;
            twitch.set_eventsub_status(false, 0);
            let end = match result {
                Ok(end) => end,
                Err(TwitchError::NotConfigured | TwitchError::Unauthenticated) => End::Idle,
                Err(_) => End::Failed,
            };
            match end {
                End::Restart => {}
                End::Idle => twitch.eventsub_changed.notified().await,
                End::Failed => {
                    tokio::select! {
                        _ = twitch.eventsub_changed.notified() => {}
                        _ = tokio::time::sleep(RETRY_AFTER) => {}
                    }
                }
            }
        }
    });
}

async fn session(app: &AppHandle, twitch: &Twitch) -> Result<End> {
    let logins = twitch.watched_logins().await;
    if logins.is_empty() {
        return Ok(End::Idle);
    }
    let query: Vec<(&str, &str)> = logins.iter().map(|l| ("login", l.as_str())).collect();
    let users: Vec<helix::User> = twitch.helix("users", &query).await?;

    let (mut socket, _) = connect_async(WS_URL)
        .await
        .map_err(|_| TwitchError::Offline)?;
    let mut keepalive = Duration::from_secs(30);
    loop {
        let next = tokio::select! {
            _ = twitch.eventsub_changed.notified() => return Ok(End::Restart),
            next = tokio::time::timeout(keepalive + Duration::from_secs(10), socket.next()) => next,
        };
        let text = match next {
            Ok(Some(Ok(Message::Text(text)))) => text,
            Ok(Some(Ok(Message::Ping(_)))) => {
                // tungstenite queues the Pong; flushing sends it right away.
                let _ = socket.flush().await;
                continue;
            }
            Ok(Some(Ok(Message::Close(_)))) | Ok(Some(Err(_))) | Ok(None) => {
                return Ok(End::Failed)
            }
            Ok(Some(Ok(_))) => continue,
            // No message, not even a keepalive, within the agreed time: the connection is dead.
            Err(_) => return Ok(End::Failed),
        };
        let Ok(envelope) = serde_json::from_str::<Envelope>(&text) else {
            continue;
        };
        let payload = &envelope.payload;
        match envelope.metadata.message_type.as_str() {
            "session_welcome" => {
                if let Some(seconds) = payload["session"]["keepalive_timeout_seconds"].as_u64() {
                    keepalive = Duration::from_secs(seconds);
                }
                // Twitch closes the connection if nothing is subscribed within 10 seconds.
                let session_id = payload["session"]["id"].as_str().unwrap_or_default();
                let mut watched = 0;
                for user in &users {
                    if subscribe(twitch, session_id, &user.id).await {
                        watched += 1;
                    }
                }
                twitch.set_eventsub_status(true, watched);
            }
            "notification" if payload["subscription"]["type"] == "stream.online" => {
                let event = &payload["event"];
                if let (Some(id), Some(login)) = (
                    event["broadcaster_user_id"].as_str(),
                    event["broadcaster_user_login"].as_str(),
                ) {
                    let name = event["broadcaster_user_name"].as_str().unwrap_or(login);
                    announce(app, twitch, id, login, name).await;
                }
            }
            // A fresh session is simpler than handing over the old one; subscriptions are cheap.
            "session_reconnect" => return Ok(End::Restart),
            _ => {} // session_keepalive, revocation
        }
    }
}

/// true when Twitch accepted the subscription.
async fn subscribe(twitch: &Twitch, session_id: &str, broadcaster_id: &str) -> bool {
    let result: Result<()> = async {
        let client_id = twitch.client_id().await?;
        let token = twitch.access_token(&client_id).await?;
        let response = twitch
            .http
            .post(format!("{HELIX}/eventsub/subscriptions"))
            .header("Client-Id", &client_id)
            .bearer_auth(&token)
            .json(&json!({
                "type": "stream.online",
                "version": "1",
                "condition": { "broadcaster_user_id": broadcaster_id },
                "transport": { "method": "websocket", "session_id": session_id },
            }))
            .send()
            .await?;
        check(response).await.map(|_| ())
    }
    .await;
    // A failed subscription (e.g. cost limit) only means this channel is covered by polling.
    result.is_ok()
}

/// Adds the current game and title so the frontend can apply the channel's game rule at once.
async fn announce(app: &AppHandle, twitch: &Twitch, id: &str, login: &str, name: &str) {
    let channel = twitch
        .helix::<helix::Channel>("channels", &[("broadcaster_id", id)])
        .await
        .ok()
        .and_then(|channels| channels.into_iter().next());
    let (game, title) = match channel {
        Some(c) => (
            GameRef {
                id: c.game_id,
                name: c.game_name,
            },
            c.title,
        ),
        None => (
            GameRef {
                id: String::new(),
                name: String::new(),
            },
            String::new(),
        ),
    };
    let _ = app.emit(
        EVENT,
        StreamOnline {
            login: login.to_owned(),
            display_name: name.to_owned(),
            game,
            title,
        },
    );
}
