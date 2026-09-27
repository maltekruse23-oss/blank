//! Watch together (Twitch): friends in a room see the same channel; whoever switches, switches
//! for everyone. The room is a topic on two public MQTT brokers at once (secure WebSockets, MQTT
//! 3.1.1, QoS 0), so it keeps working while one of them is down; no account anywhere. Rust only
//! carries text the app has already encrypted (src/adapters/watch.ts): fixed brokers, a topic of
//! the fixed form, small payloads. Connections exist only while the user is in a room.
//!
//! The player is Twitch's official player in its own window (Twitch allows embedding it only in
//! https pages, and blank. runs on http://tauri.localhost). The window may only show
//! player.twitch.tv; links to twitch.tv open in the browser.
use std::sync::Mutex;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use tauri::{
    webview::NewWindowResponse, AppHandle, Emitter, Manager, State, Url, WebviewUrl,
    WebviewWindowBuilder,
};
use tokio::sync::{broadcast, watch as signal};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, http::HeaderValue, Message},
};

/// Public brokers (tested 2026-09-27: both answer in about 30 ms and keep retained messages).
const BROKERS: [(&str, &str); 2] = [
    ("hivemq", "wss://broker.hivemq.com:8884/mqtt"),
    ("mosquitto", "wss://test.mosquitto.org:8081/mqtt"),
];
const TOPIC_PREFIX: &str = "blank-watch/";
/// Encrypted messages are small (channel, name); anything larger is refused.
const MAX_PAYLOAD: usize = 2048;
const KEEP_ALIVE: Duration = Duration::from_secs(60);
const PING_EVERY: Duration = Duration::from_secs(45);
const CONNECT_WITHIN: Duration = Duration::from_secs(10);
/// Pauses before reconnecting after a lost connection.
const RETRY: [u64; 5] = [2, 5, 10, 30, 60];
const PLAYER: &str = "watch";
/// Frontend events; keep in sync with `src/adapters/watch.ts`.
const MESSAGE_EVENT: &str = "watch-message";
const LINK_EVENT: &str = "watch-link";
const PLAYER_CLOSED_EVENT: &str = "watch-player-closed";

struct Room {
    outgoing: broadcast::Sender<Publish>,
    stop: signal::Sender<bool>,
}

#[derive(Clone)]
struct Publish {
    payload: String,
    retain: bool,
}

#[derive(Default)]
pub struct WatchState {
    room: Mutex<Option<Room>>,
}

#[derive(Clone, Serialize)]
struct Link {
    broker: &'static str,
    up: bool,
}

// --- MQTT 3.1.1, only what a room needs ---

fn remaining_length(mut n: usize) -> Vec<u8> {
    let mut out = Vec::new();
    loop {
        let mut byte = (n % 128) as u8;
        n /= 128;
        if n > 0 {
            byte |= 0x80;
        }
        out.push(byte);
        if n == 0 {
            return out;
        }
    }
}

fn string(value: &str) -> Vec<u8> {
    let bytes = value.as_bytes();
    let mut out = (bytes.len() as u16).to_be_bytes().to_vec();
    out.extend_from_slice(bytes);
    out
}

fn packet(first: u8, body: Vec<u8>) -> Vec<u8> {
    let mut out = vec![first];
    out.extend(remaining_length(body.len()));
    out.extend(body);
    out
}

fn connect_packet(client: &str) -> Vec<u8> {
    let mut body = string("MQTT");
    // Level 4 (3.1.1), clean session, keep alive.
    body.extend([4, 0x02]);
    body.extend((KEEP_ALIVE.as_secs() as u16).to_be_bytes());
    body.extend(string(client));
    packet(0x10, body)
}

fn subscribe_packet(topic: &str) -> Vec<u8> {
    let mut body = vec![0, 1];
    body.extend(string(topic));
    body.push(0);
    packet(0x82, body)
}

fn publish_packet(topic: &str, payload: &str, retain: bool) -> Vec<u8> {
    let mut body = string(topic);
    body.extend_from_slice(payload.as_bytes());
    packet(0x30 | u8::from(retain), body)
}

const PING: [u8; 2] = [0xC0, 0];
const DISCONNECT: [u8; 2] = [0xE0, 0];

enum Incoming {
    ConnAck(u8),
    Publish { topic: String, payload: Vec<u8> },
    Other,
}

/// Takes one whole packet from the front of `buffer` (a WebSocket message may hold several or
/// part of one); None until it is complete.
fn next_packet(buffer: &mut Vec<u8>) -> Option<Result<Incoming, &'static str>> {
    let mut length = 0usize;
    let mut i = 1;
    loop {
        let byte = *buffer.get(i)?;
        length += usize::from(byte & 0x7F) << (7 * (i - 1));
        i += 1;
        if byte & 0x80 == 0 {
            break;
        }
        if i > 4 {
            return Some(Err("invalid length"));
        }
    }
    if buffer.len() < i + length {
        return None;
    }
    let first = buffer[0];
    let body: Vec<u8> = buffer.drain(..i + length).skip(i).collect();
    Some(Ok(match first >> 4 {
        2 if body.len() >= 2 => Incoming::ConnAck(body[1]),
        3 => {
            let Some(size) = body
                .get(..2)
                .map(|b| usize::from(u16::from_be_bytes([b[0], b[1]])))
            else {
                return Some(Err("short publish"));
            };
            // QoS 1/2 would carry a packet id after the topic; this client subscribes with QoS 0.
            let start = 2 + size + if first & 0x06 != 0 { 2 } else { 0 };
            let (Some(topic), Some(payload)) = (body.get(2..2 + size), body.get(start..)) else {
                return Some(Err("short publish"));
            };
            Incoming::Publish {
                topic: String::from_utf8_lossy(topic).into_owned(),
                payload: payload.to_vec(),
            }
        }
        _ => Incoming::Other,
    }))
}

// --- Checks ---

fn is_topic(topic: &str) -> bool {
    topic.strip_prefix(TOPIC_PREFIX).is_some_and(|id| {
        id.len() == 32
            && id
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    })
}

fn is_client(client: &str) -> bool {
    (8..=16).contains(&client.len())
        && client
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
}

/// Encrypted text as the app sends it: base64 only.
fn is_payload(payload: &str) -> bool {
    !payload.is_empty()
        && payload.len() <= MAX_PAYLOAD
        && payload
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'+' || b == b'/' || b == b'=')
}

fn is_channel(login: &str) -> bool {
    (3..=25).contains(&login.len())
        && login
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
}

fn player_url(channel: &str) -> Url {
    // `parent` is required by Twitch; the player runs as the page itself, not embedded.
    Url::parse(&format!(
        "https://player.twitch.tv/?channel={channel}&parent=tauri.localhost&autoplay=true"
    ))
    .expect("valid player address")
}

/// The channel the player shows.
fn channel_of(url: &Url) -> Option<String> {
    url.query_pairs()
        .find(|(key, _)| key == "channel")
        .map(|(_, value)| value.into_owned())
}

/// What the player window may show.
fn player_may_show(url: &Url) -> bool {
    url.scheme() == "https" && url.host_str() == Some("player.twitch.tv")
}

/// Links out of the player (e.g. "watch on Twitch") go to the browser.
fn opens_in_browser(url: &Url) -> bool {
    url.scheme() == "https" && matches!(url.host_str(), Some("www.twitch.tv" | "twitch.tv"))
}

// --- Connections ---

enum End {
    Stopped,
    Lost,
}

async fn session(
    app: &AppHandle,
    broker: &'static str,
    address: &str,
    topic: &str,
    client: &str,
    outgoing: &mut broadcast::Receiver<Publish>,
    stop: &mut signal::Receiver<bool>,
) -> End {
    let Ok(mut request) = address.into_client_request() else {
        return End::Lost;
    };
    request
        .headers_mut()
        .insert("Sec-WebSocket-Protocol", HeaderValue::from_static("mqtt"));
    let Ok(Ok((mut socket, _))) =
        tokio::time::timeout(CONNECT_WITHIN, connect_async(request)).await
    else {
        return End::Lost;
    };
    let mut buffer = Vec::new();
    // 1. Log in: CONNECT, then wait for the broker's CONNACK.
    let accepted = tokio::time::timeout(CONNECT_WITHIN, async {
        socket
            .send(Message::Binary(connect_packet(client).into()))
            .await
            .ok()?;
        loop {
            match socket.next().await? {
                Ok(Message::Binary(data)) => buffer.extend_from_slice(&data),
                Ok(Message::Ping(_) | Message::Pong(_) | Message::Frame(_)) => continue,
                _ => return None,
            }
            while let Some(packet) = next_packet(&mut buffer) {
                match packet {
                    Ok(Incoming::ConnAck(code)) => return Some(code == 0),
                    Ok(_) => {}
                    Err(_) => return None,
                }
            }
        }
    })
    .await;
    if accepted != Ok(Some(true))
        || socket
            .send(Message::Binary(subscribe_packet(topic).into()))
            .await
            .is_err()
    {
        let _ = socket.close(None).await;
        return End::Lost;
    }
    let _ = app.emit_to("main", LINK_EVENT, Link { broker, up: true });
    // What was sent while this broker was away is not sent late; the other broker carried it.
    *outgoing = outgoing.resubscribe();

    // 2. In the room: send, receive, keep the connection alive.
    let mut ping = tokio::time::interval(PING_EVERY);
    ping.tick().await;
    let mut last_heard = tokio::time::Instant::now();
    let end = loop {
        tokio::select! {
            // Sending first: a last message (clearing the room) goes out before leaving.
            biased;
            publish = outgoing.recv() => {
                match publish {
                    Ok(p) => {
                        let bytes = publish_packet(topic, &p.payload, p.retain);
                        if socket.send(Message::Binary(bytes.into())).await.is_err() {
                            break End::Lost;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {}
                    Err(broadcast::error::RecvError::Closed) => break End::Stopped,
                }
            }
            changed = stop.changed() => {
                if changed.is_err() || *stop.borrow() {
                    let _ = socket.send(Message::Binary(DISCONNECT.to_vec().into())).await;
                    break End::Stopped;
                }
            }
            _ = ping.tick() => {
                // No answer to the last pings: the connection is dead.
                if last_heard.elapsed() > PING_EVERY * 2 + Duration::from_secs(10)
                    || socket.send(Message::Binary(PING.to_vec().into())).await.is_err()
                {
                    break End::Lost;
                }
            }
            message = socket.next() => {
                let data = match message {
                    Some(Ok(Message::Binary(data))) => data,
                    Some(Ok(Message::Ping(_) | Message::Pong(_) | Message::Frame(_))) => continue,
                    _ => break End::Lost,
                };
                last_heard = tokio::time::Instant::now();
                buffer.extend_from_slice(&data);
                if buffer.len() > 4 * MAX_PAYLOAD {
                    break End::Lost;
                }
                let mut broken = false;
                while let Some(packet) = next_packet(&mut buffer) {
                    match packet {
                        Ok(Incoming::Publish { topic: from, payload }) => {
                            // Empty retained messages only clear; anything odd is dropped.
                            let text = String::from_utf8(payload).unwrap_or_default();
                            if from == topic && is_payload(&text) {
                                let _ = app.emit_to("main", MESSAGE_EVENT, text);
                            }
                        }
                        Ok(_) => {}
                        Err(_) => {
                            broken = true;
                            break;
                        }
                    }
                }
                if broken {
                    break End::Lost;
                }
            }
        }
    };
    let _ = socket.close(None).await;
    end
}

fn start_connection(
    app: AppHandle,
    broker: &'static str,
    address: &'static str,
    topic: String,
    client: String,
    mut outgoing: broadcast::Receiver<Publish>,
    mut stop: signal::Receiver<bool>,
) {
    tauri::async_runtime::spawn(async move {
        let mut attempt = 0;
        loop {
            let end = session(
                &app,
                broker,
                address,
                &topic,
                &client,
                &mut outgoing,
                &mut stop,
            )
            .await;
            let _ = app.emit_to("main", LINK_EVENT, Link { broker, up: false });
            if matches!(end, End::Stopped) || *stop.borrow() {
                return;
            }
            let pause = Duration::from_secs(RETRY[attempt.min(RETRY.len() - 1)]);
            attempt += 1;
            tokio::select! {
                _ = tokio::time::sleep(pause) => {}
                _ = stop.changed() => return,
            }
        }
    });
}

/// `clear`: an empty kept message first, so the brokers forget the room's channel.
fn leave_room(state: &WatchState, clear: bool) {
    if let Some(room) = state.room.lock().unwrap_or_else(|e| e.into_inner()).take() {
        if clear {
            let _ = room.outgoing.send(Publish {
                payload: String::new(),
                retain: true,
            });
        }
        let _ = room.stop.send(true);
    }
}

/// Enters a room (and leaves the previous one): `topic` "blank-watch/" + 32 hex characters,
/// derived from the room code in the app; `client`: this participant's random id.
#[tauri::command]
pub fn watch_join(
    app: AppHandle,
    state: State<'_, WatchState>,
    topic: String,
    client: String,
) -> Result<(), String> {
    if !is_topic(&topic) || !is_client(&client) {
        return Err("Ungültiger Raum".into());
    }
    leave_room(&state, false);
    let (outgoing, _) = broadcast::channel(16);
    let (stop, _) = signal::channel(false);
    for (broker, address) in BROKERS {
        start_connection(
            app.clone(),
            broker,
            address,
            topic.clone(),
            format!("blank-{client}"),
            outgoing.subscribe(),
            stop.subscribe(),
        );
    }
    *state.room.lock().unwrap_or_else(|e| e.into_inner()) = Some(Room { outgoing, stop });
    Ok(())
}

/// Sends encrypted text to everyone in the room (over every broker that is connected);
/// `retain`: brokers keep it for people who join later (the current channel).
#[tauri::command]
pub fn watch_send(state: State<'_, WatchState>, data: String, retain: bool) -> Result<(), String> {
    if !is_payload(&data) {
        return Err("Ungültige Nachricht".into());
    }
    let room = state.room.lock().unwrap_or_else(|e| e.into_inner());
    let room = room.as_ref().ok_or("Kein Raum")?;
    // No receiver right now (both brokers reconnecting): nothing to send to.
    let _ = room.outgoing.send(Publish {
        payload: data,
        retain,
    });
    Ok(())
}

// The window commands are async: on Windows, creating or steering a window from a synchronous
// command (which runs on the main thread) deadlocks, and the player stayed at about:blank.

/// Leaves the room and closes the player; `clear`: nobody else is in it.
#[tauri::command]
pub async fn watch_leave(
    app: AppHandle,
    state: State<'_, WatchState>,
    clear: bool,
) -> Result<(), String> {
    leave_room(&state, clear);
    if let Some(player) = app.get_webview_window(PLAYER) {
        let _ = player.close();
    }
    Ok(())
}

/// Shows `channel` in the player window, opening it if needed; `reload`: start the stream anew
/// even if it already shows this channel (everyone at the live edge again).
#[tauri::command]
pub async fn watch_player(app: AppHandle, channel: String, reload: bool) -> Result<(), String> {
    if !is_channel(&channel) {
        return Err("Ungültiger Kanal".into());
    }
    let url = player_url(&channel);
    if let Some(player) = app.get_webview_window(PLAYER) {
        // Twitch rewrites the address (other order), so only the channel counts.
        let same = player.url().is_ok_and(|current| {
            player_may_show(&current) && channel_of(&current) == Some(channel.clone())
        });
        if same && reload {
            player.reload().map_err(|e| e.to_string())?;
        } else if !same {
            player.navigate(url).map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    // Must match the main window's arguments: all share one WebView2 environment (gpu.rs).
    let args = crate::gpu::browser_args(&app);
    let mut builder = WebviewWindowBuilder::new(&app, PLAYER, WebviewUrl::External(url))
        .title("blank. Zusammen schauen")
        .inner_size(960.0, 540.0)
        .min_inner_size(480.0, 270.0)
        .visible(false)
        .theme(Some(tauri::Theme::Dark))
        .on_navigation(player_may_show)
        .on_new_window(|url, _| {
            if opens_in_browser(&url) {
                crate::twitch::open_url(url.as_str());
            }
            NewWindowResponse::Deny
        });
    builder = builder.additional_browser_args(&args);
    let player = builder.build().map_err(|e| e.to_string())?;
    // Centred on the screen where blank. is (not always the main screen).
    let screen = app
        .get_webview_window("main")
        .and_then(|main| main.current_monitor().ok().flatten());
    if let (Some(screen), Ok(size)) = (screen, player.outer_size()) {
        let area = screen.work_area();
        let centre =
            |start: i32, room: u32, own: u32| start + (room.saturating_sub(own) / 2) as i32;
        let _ = player.set_position(tauri::PhysicalPosition::new(
            centre(area.position.x, area.size.width, size.width),
            centre(area.position.y, area.size.height, size.height),
        ));
    }
    let _ = player.show();
    let handle = app.clone();
    player.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            let _ = handle.emit_to("main", PLAYER_CLOSED_EVENT, ());
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn watch_player_close(app: AppHandle) {
    if let Some(player) = app.get_webview_window(PLAYER) {
        let _ = player.close();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packets_are_built_like_mqtt_3_1_1() {
        assert_eq!(
            connect_packet("blank-abc"),
            [
                0x10, 21, 0, 4, b'M', b'Q', b'T', b'T', 4, 0x02, 0, 60, 0, 9, b'b', b'l', b'a',
                b'n', b'k', b'-', b'a', b'b', b'c'
            ]
        );
        assert_eq!(
            subscribe_packet("t/1"),
            [0x82, 8, 0, 1, 0, 3, b't', b'/', b'1', 0]
        );
        assert_eq!(publish_packet("t", "x", true), [0x31, 4, 0, 1, b't', b'x']);
        // Lengths over 127 take two bytes.
        assert_eq!(remaining_length(127), [127]);
        assert_eq!(remaining_length(128), [0x80, 1]);
        assert_eq!(remaining_length(2000), [0xD0, 0x0F]);
    }

    #[test]
    fn packets_are_read_whole_and_one_by_one() {
        let topic = "blank-watch/0123456789abcdef0123456789abcdef";
        let long = "A".repeat(300);
        let mut buffer = [0x20, 2, 0, 0].to_vec();
        buffer.extend(publish_packet(topic, &long, true));
        // The second packet arrives in two parts.
        let rest = buffer.split_off(20);
        assert!(matches!(
            next_packet(&mut buffer),
            Some(Ok(Incoming::ConnAck(0)))
        ));
        assert!(next_packet(&mut buffer).is_none());
        buffer.extend(rest);
        match next_packet(&mut buffer) {
            Some(Ok(Incoming::Publish { topic: t, payload })) => {
                assert_eq!(t, topic);
                assert_eq!(payload, long.as_bytes());
            }
            _ => panic!("publish expected"),
        }
        assert!(buffer.is_empty());
        // A broken length is refused instead of waiting forever.
        let mut broken = vec![0x30, 0xFF, 0xFF, 0xFF, 0xFF, 0x01];
        assert!(matches!(next_packet(&mut broken), Some(Err(_))));
    }

    #[test]
    fn only_rooms_payloads_and_channels_of_the_right_form() {
        assert!(is_topic("blank-watch/0123456789abcdef0123456789abcdef"));
        assert!(!is_topic("blank-watch/0123456789ABCDEF0123456789ABCDEF"));
        assert!(!is_topic("blank-watch/#"));
        assert!(!is_topic("other/0123456789abcdef0123456789abcdef"));
        assert!(!is_topic("blank-watch/0123456789abcdef0123456789abcde"));
        assert!(is_client("a1b2c3d4e5f6"));
        assert!(!is_client("A1B2C3D4"));
        assert!(!is_client("short"));
        assert!(is_payload("q83v+/9="));
        assert!(!is_payload(""));
        assert!(!is_payload("<script>"));
        assert!(!is_payload(&"A".repeat(MAX_PAYLOAD + 1)));
        assert!(is_channel("xqc"));
        assert!(is_channel("some_channel_2"));
        assert!(!is_channel("xQc"));
        assert!(!is_channel("a&parent=evil.com"));
        assert!(!is_channel("ab"));
    }

    #[test]
    fn the_player_stays_on_twitchs_player() {
        let url = player_url("xqc");
        assert_eq!(
            url.as_str(),
            "https://player.twitch.tv/?channel=xqc&parent=tauri.localhost&autoplay=true"
        );
        assert!(player_may_show(&url));
        // Twitch reorders the address; the channel is still found.
        let rewritten = Url::parse(
            "https://player.twitch.tv/?autoplay=true&channel=xqc&parent=tauri.localhost",
        )
        .unwrap();
        assert_eq!(channel_of(&rewritten).as_deref(), Some("xqc"));
        assert!(!player_may_show(&Url::parse("https://evil.com/").unwrap()));
        assert!(!player_may_show(
            &Url::parse("http://player.twitch.tv/").unwrap()
        ));
        assert!(opens_in_browser(
            &Url::parse("https://www.twitch.tv/xqc").unwrap()
        ));
        assert!(!opens_in_browser(
            &Url::parse("https://twitch.tv.evil.com/").unwrap()
        ));
    }
}
