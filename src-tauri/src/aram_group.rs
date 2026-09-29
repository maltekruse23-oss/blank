//! ARAM group (user's wish: the same leaderboard for every friend): a group is a topic on the same
//! public MQTT brokers as watching together (watch.rs), under which the members' apps keep – as
//! retained messages – each member, the group's start and every game. So everyone's app has the
//! same games, even those it could not fetch itself. Rust only carries text the app has already
//! encrypted (src/adapters/aramGroup.ts): fixed brokers, a topic of the fixed form, sub-topics of
//! three fixed forms, bounded payloads. Connected only while the user is in a group.
use std::sync::Mutex;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{broadcast, watch as signal};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, http::HeaderValue, Message},
};

use crate::watch::{
    connect_packet, is_client, next_packet, publish_packet, subscribe_packet, Incoming, BROKERS,
    CONNECT_WITHIN, DISCONNECT, PING, PING_EVERY, RETRY,
};

const TOPIC_PREFIX: &str = "blank-aram/";
/// One game of one player, encrypted (with the mates of the game); anything larger is refused.
const MAX_PAYLOAD: usize = 8 * 1024;
/// Games sent at once after (re)connecting; the rest follow with the next exchange.
const QUEUE: usize = 1024;
/// Frontend events; keep in sync with `src/adapters/aramGroup.ts`.
const MESSAGE_EVENT: &str = "aram-group-message";
const LINK_EVENT: &str = "aram-group-link";

struct Group {
    outgoing: broadcast::Sender<Publish>,
    stop: signal::Sender<bool>,
}

#[derive(Clone)]
struct Publish {
    sub: String,
    payload: String,
    retain: bool,
}

#[derive(Default)]
pub struct GroupState {
    group: Mutex<Option<Group>>,
}

#[derive(Clone, Serialize)]
struct Received {
    /// Which broker kept it: each is filled up on its own (one may have lost what it kept).
    broker: &'static str,
    sub: String,
    /// Empty: the kept message was cleared (a member left).
    text: String,
}

#[derive(Clone, Serialize)]
struct Link {
    broker: &'static str,
    up: bool,
}

// --- Checks ---

fn hex(text: &str, length: usize) -> bool {
    text.len() == length
        && text
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn is_topic(topic: &str) -> bool {
    topic
        .strip_prefix(TOPIC_PREFIX)
        .is_some_and(|id| hex(id, 32))
}

/// "r" (the group's start), "m/<member>" or "g/<game>-<member>"; a member is 16 hex characters.
fn is_sub(sub: &str) -> bool {
    if sub == "r" {
        return true;
    }
    if let Some(member) = sub.strip_prefix("m/") {
        return hex(member, 16);
    }
    sub.strip_prefix("g/")
        .and_then(|rest| rest.split_once('-'))
        .is_some_and(|(game, member)| {
            (1..=16).contains(&game.len())
                && game.bytes().all(|b| b.is_ascii_digit())
                && hex(member, 16)
        })
}

/// Encrypted text as the app sends it: base64 only; empty clears a kept message.
fn is_payload(payload: &str) -> bool {
    payload.len() <= MAX_PAYLOAD
        && payload
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'+' || b == b'/' || b == b'=')
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
    // Everything below the group: its start, its members, its games (kept by the broker).
    let filter = format!("{topic}/#");
    if accepted != Ok(Some(true))
        || socket
            .send(Message::Binary(subscribe_packet(&filter).into()))
            .await
            .is_err()
    {
        let _ = socket.close(None).await;
        return End::Lost;
    }
    let _ = app.emit_to("main", LINK_EVENT, Link { broker, up: true });
    *outgoing = outgoing.resubscribe();
    let prefix = format!("{topic}/");

    let mut ping = tokio::time::interval(PING_EVERY);
    ping.tick().await;
    let mut last_heard = tokio::time::Instant::now();
    let end = loop {
        tokio::select! {
            biased;
            publish = outgoing.recv() => {
                match publish {
                    Ok(p) => {
                        let bytes = publish_packet(&format!("{prefix}{}", p.sub), &p.payload, p.retain);
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
                let mut broken = false;
                while let Some(packet) = next_packet(&mut buffer) {
                    match packet {
                        Ok(Incoming::Publish { topic: from, payload }) => {
                            // Anything odd is dropped; an empty kept message clears.
                            let text = String::from_utf8(payload).unwrap_or_default();
                            if let Some(sub) = from.strip_prefix(&prefix) {
                                if is_sub(sub) && is_payload(&text) {
                                    let received = Received { broker, sub: sub.to_string(), text };
                                    let _ = app.emit_to("main", MESSAGE_EVENT, received);
                                }
                            }
                        }
                        Ok(_) => {}
                        Err(_) => {
                            broken = true;
                            break;
                        }
                    }
                }
                // What is left is at most one unfinished packet: never larger than a game.
                if broken || buffer.len() > MAX_PAYLOAD + 1024 {
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

fn close_group(state: &GroupState) {
    if let Some(group) = state.group.lock().unwrap_or_else(|e| e.into_inner()).take() {
        let _ = group.stop.send(true);
    }
}

/// Connects to a group (and leaves the previous one): `topic` "blank-aram/" + 32 hex characters,
/// derived from the group code in the app; `client`: this app's random id.
#[tauri::command]
pub fn aram_group_open(
    app: AppHandle,
    state: State<'_, GroupState>,
    topic: String,
    client: String,
) -> Result<(), String> {
    if !is_topic(&topic) || !is_client(&client) {
        return Err("Ungültige Gruppe".into());
    }
    close_group(&state);
    let (outgoing, _) = broadcast::channel(QUEUE);
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
    *state.group.lock().unwrap_or_else(|e| e.into_inner()) = Some(Group { outgoing, stop });
    Ok(())
}

/// Sends encrypted text to `sub` of the group over every connected broker; `retain`: the brokers
/// keep it for members who connect later (always, except nothing to keep).
#[tauri::command]
pub fn aram_group_send(
    state: State<'_, GroupState>,
    sub: String,
    data: String,
    retain: bool,
) -> Result<(), String> {
    if !is_sub(&sub) || !is_payload(&data) {
        return Err("Ungültige Nachricht".into());
    }
    let group = state.group.lock().unwrap_or_else(|e| e.into_inner());
    let group = group.as_ref().ok_or("Keine Gruppe")?;
    let _ = group.outgoing.send(Publish {
        sub,
        payload: data,
        retain,
    });
    Ok(())
}

/// Disconnects from the group (what is kept on the brokers stays for the others).
#[tauri::command]
pub fn aram_group_close(state: State<'_, GroupState>) {
    close_group(&state);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_three_sub_topics() {
        assert!(is_sub("r"));
        assert!(is_sub("m/0123456789abcdef"));
        assert!(is_sub("g/7412589630-0123456789abcdef"));
        assert!(!is_sub("m/0123456789ABCDEF"));
        assert!(!is_sub("m/0123456789abcde"));
        assert!(!is_sub("g/-0123456789abcdef"));
        assert!(!is_sub("g/12a4-0123456789abcdef"));
        assert!(!is_sub("g/12345678901234567-0123456789abcdef"));
        assert!(!is_sub("#"));
        assert!(!is_sub("r/x"));
        assert!(!is_sub("m/0123456789abcdef/x"));
    }

    #[test]
    fn group_topics_and_payloads() {
        assert!(is_topic("blank-aram/0123456789abcdef0123456789abcdef"));
        assert!(!is_topic("blank-watch/0123456789abcdef0123456789abcdef"));
        assert!(!is_topic("blank-aram/#"));
        assert!(is_payload(""));
        assert!(is_payload("QUJD+/=="));
        assert!(!is_payload("<script>"));
        assert!(!is_payload(&"A".repeat(MAX_PAYLOAD + 1)));
    }
}
