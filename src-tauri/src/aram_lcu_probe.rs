//! Manual, read-only, single-hop diagnostic. Never compiled into the application.
//! Set BLANK_LCU_PROBE_OUTPUT (new directory) and BLANK_LCU_PROBE_STORE (aram.json).
//! cargo test --lib foreign_mayhem_history_probe -- --ignored --nocapture
//! Remove this file and its cfg(test) module declaration to remove the probe.
use super::{Lcu, HISTORY, MAYHEM_QUEUE};
use serde_json::{json, Value};
use std::{collections::BTreeSet, fs, path::PathBuf, time::Instant};

struct Probe {
    lcu: Lcu,
    output: PathBuf,
    requests: Vec<Value>,
}

impl Probe {
    async fn get(&mut self, label: &str, path: &str) -> Value {
        assert!(self.requests.len() < 12, "Probe request limit reached");
        let started = Instant::now();
        let response = self
            .lcu
            .http
            .get(format!("{}{path}", self.lcu.base))
            .basic_auth("riot", Some(&self.lcu.password))
            .header("Accept", "application/json")
            .send()
            .await;
        let (status, body, error) = match response {
            Ok(response) => {
                let status = response.status().as_u16();
                match response.bytes().await {
                    Ok(bytes) => (Some(status), bytes.to_vec(), None),
                    Err(_) => (Some(status), Vec::new(), Some("response body read failed")),
                }
            }
            Err(_) => (None, Vec::new(), Some("local LCU transport failed")),
        };
        let filename = format!("{:02}-{label}.json", self.requests.len() + 1);
        fs::write(self.output.join(&filename), &body).unwrap();
        self.requests
            .push(json!({"label":label,"method":"GET","path":path,
            "httpStatus":status,"elapsedMs":started.elapsed().as_millis(),
            "bytes":body.len(),"rawFile":filename,"error":error}));
        fs::write(
            self.output.join("requests.json"),
            serde_json::to_vec_pretty(&self.requests).unwrap(),
        )
        .unwrap();
        println!("{label}: HTTP {status:?}, {} bytes", body.len());
        if status != Some(200) {
            return Value::Null;
        }
        serde_json::from_slice(&body).unwrap_or(Value::Null)
    }
}

fn puuids(game: &Value) -> BTreeSet<String> {
    let mut found = BTreeSet::new();
    for key in ["participantIdentities", "participants"] {
        for participant in game[key].as_array().into_iter().flatten() {
            for value in [&participant["player"]["puuid"], &participant["puuid"]] {
                if let Some(id) = value.as_str().filter(|s| super::valid_puuid(s)) {
                    found.insert(id.to_owned());
                }
            }
        }
    }
    found
}

fn games(history: &Value) -> Vec<Value> {
    history["games"]["games"]
        .as_array()
        .cloned()
        .unwrap_or_default()
}

fn describe(game: &Value) -> Value {
    json!({"gameId":game["gameId"],"queueId":game["queueId"],
        "platformId":game["platformId"],"gameCreation":game["gameCreation"],
        "participants":game["participants"].as_array().map(Vec::len),
        "participantPuuids":puuids(game),"participantStatsPresent":
        game["participants"].as_array().is_some_and(|ps| !ps.is_empty() &&
            ps.iter().all(|p| p["stats"].is_object()))})
}

#[test]
#[ignore = "Requires an open League client; explicit manual read-only diagnostic"]
fn foreign_mayhem_history_probe() {
    tauri::async_runtime::block_on(async {
        let output = PathBuf::from(
            std::env::var("BLANK_LCU_PROBE_OUTPUT").expect("output directory required"),
        );
        assert!(
            !output.exists(),
            "Use a new output directory to preserve previous evidence"
        );
        fs::create_dir_all(&output).unwrap();
        let store_path =
            PathBuf::from(std::env::var("BLANK_LCU_PROBE_STORE").expect("store path required"));
        let store_before = fs::read(&store_path).unwrap();
        let store: Value = serde_json::from_slice(&store_before).unwrap();
        let lcu = Lcu::connect()
            .expect("LCU connection configuration failed")
            .expect("League client must be open");
        let mut probe = Probe {
            lcu,
            output,
            requests: Vec::new(),
        };
        let me = probe
            .get("current-summoner", "/lol-summoner/v1/current-summoner")
            .await;
        let own = me["puuid"]
            .as_str()
            .expect("Current account PUUID missing")
            .to_owned();
        let friends = probe.get("friends", "/lol-chat/v1/friends").await;
        let friend_ids: BTreeSet<&str> = friends
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|f| f["puuid"].as_str())
            .collect();
        let own_history = probe
            .get(
                "own-history",
                &format!("/lol-match-history/v1/products/lol/{own}/matches?{HISTORY}"),
            )
            .await;
        let own_games = games(&own_history);
        let mut stored_ids: Vec<u64> = store["games"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|g| g["puuid"].as_str() == Some(&own))
            .filter_map(|g| g["gameId"].as_u64())
            .collect();
        stored_ids.sort_unstable_by(|a, b| b.cmp(a));
        stored_ids.dedup();
        let seed_id = stored_ids
            .first()
            .copied()
            .or_else(|| {
                own_games
                    .iter()
                    .find(|g| g["queueId"].as_i64() == Some(MAYHEM_QUEUE))
                    .and_then(|g| g["gameId"].as_u64())
            })
            .expect("No seed Mayhem match");
        let seed = probe
            .get(
                "seed-details",
                &format!("/lol-match-history/v1/games/{seed_id}"),
            )
            .await;
        assert_eq!(
            seed["queueId"].as_i64(),
            Some(MAYHEM_QUEUE),
            "Seed must be confirmed Mayhem"
        );
        let seed_players = puuids(&seed);
        assert!(
            seed_players.contains(&own),
            "Seed must contain current account"
        );
        let foreign = seed_players
            .iter()
            .find(|id| *id != &own && !friend_ids.contains(id.as_str()))
            .or_else(|| seed_players.iter().find(|id| *id != &own))
            .expect("Seed has no foreign participant PUUID")
            .clone();
        let foreign_history = probe
            .get(
                "foreign-history",
                &format!("/lol-match-history/v1/products/lol/{foreign}/matches?{HISTORY}"),
            )
            .await;
        let foreign_games = games(&foreign_history);
        let mayhem: Vec<&Value> = foreign_games
            .iter()
            .filter(|g| g["queueId"].as_i64() == Some(MAYHEM_QUEUE))
            .collect();
        let known_ids: BTreeSet<u64> = own_games
            .iter()
            .filter_map(|g| g["gameId"].as_u64())
            .chain(stored_ids.iter().copied())
            .collect();
        let candidate = mayhem
            .iter()
            .find(|g| {
                g["gameId"]
                    .as_u64()
                    .is_some_and(|id| !known_ids.contains(&id))
            })
            .or_else(|| {
                mayhem
                    .iter()
                    .find(|g| g["gameId"].as_u64() != Some(seed_id))
            });
        let mut extra = Value::Null;
        let mut timeline = Value::Null;
        if let Some(id) = candidate.and_then(|g| g["gameId"].as_u64()) {
            extra = probe
                .get(
                    "foreign-extra-details",
                    &format!("/lol-match-history/v1/games/{id}"),
                )
                .await;
            timeline = probe
                .get(
                    "foreign-extra-timeline",
                    &format!("/lol-match-history/v1/game-timelines/{id}"),
                )
                .await;
        }
        let extra_players = puuids(&extra);
        let new_players: Vec<_> = extra_players.difference(&seed_players).cloned().collect();
        let timeline_frames = timeline["frames"].as_array();
        let evidence = extra["queueId"].as_i64() == Some(MAYHEM_QUEUE)
            && extra_players.contains(&foreign)
            && !extra_players.contains(&own)
            && !new_players.is_empty();
        let unchanged = fs::read(&store_path).unwrap() == store_before;
        let summary = json!({"currentPuuid":own,"foreignPuuid":foreign,
            "foreignIsCurrentAccount":foreign == own,
            "friendListAvailable":friends.is_array(),"foreignIsFriend":friend_ids.contains(foreign.as_str()),
            "seedWasAlreadyStored":stored_ids.contains(&seed_id),"seed":describe(&seed),
            "ownHistoryCount":own_games.len(),"foreignHistoryCount":foreign_games.len(),
            "foreignHistoryOwner":foreign_history["accountId"],
            "foreignMayhemCount":mayhem.len(),"foreignMayhemMatches":mayhem.iter().map(|g| describe(g)).collect::<Vec<_>>(),
            "foreignAdditionalMatch":describe(&extra),"additionalMatchContainsCurrentAccount":extra_players.contains(&own),
            "additionalMatchContainsForeignAccount":extra_players.contains(&foreign),
            "newPuuidsBeyondSeed":new_players,"timelineFrames":timeline_frames.map(Vec::len),
            "timelineEvents":timeline_frames.map(|frames| frames.iter().map(|f| f["events"].as_array().map_or(0, Vec::len)).sum::<usize>()),
            "singleHopDiscoveryProven":evidence,"storeBytesUnchanged":unchanged,
            "requestCount":probe.requests.len(),"scope":"One foreign PUUID; no recursion; GET only; no production writes"});
        fs::write(
            probe.output.join("summary.json"),
            serde_json::to_vec_pretty(&summary).unwrap(),
        )
        .unwrap();
        println!(
            "singleHopDiscoveryProven={evidence}; summary written; storeBytesUnchanged={unchanged}"
        );
        assert!(
            unchanged,
            "Store changed during probe; investigate concurrent app activity"
        );
    });
}
