//! The card after an ARAM Mayhem game in the Mayhem app (ROADMAP "Als Nächstes 0", user's wish
//! 08.10.2026: "eine After-Game-Card auch mit einbauen wie bei blank"; blank.'s card is
//! after_game.rs with AramResult.tsx). It follows the same end of the game as "Find my Mayhem rank"
//! (ladder.rs, no second detector): the end-of-game screen's stats once a second for up to a minute,
//! else the client's history (it has the game about two minutes later), then one event with the
//! player's own result, the players of the game who are League friends or on mayhemstats.lol's
//! leaderboard, and the augments' names, rarities and icons from the client. Exactly one card per
//! game, remembered in memory only (the Mayhem app stores nothing). Read-only, like all of aram.
//! The window compares with the site's all-time records itself (`mayhem_records` in
//! aram_website.rs, the Records page's command) and opens a game's page only by its id
//! (`mayhem_open_game`).

use std::{
    collections::{HashMap, HashSet},
    sync::Mutex,
    time::Duration,
};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};

use super::{
    after_game::add_noted_skins,
    augment_info,
    client::Lcu,
    games::{champion_names, entries, friend_set, from_eog, from_history, Eog, Game, Summary},
    now_ms, website, Augment, Entry, Summoner, AFTER_GAME, EOG, EOG_TRIES, MAYHEM_QUEUE, SUMMONER,
};

/// The card for the window.
const EVENT: &str = "mayhem-card";
const SITE: &str = "https://mayhemstats.lol";
/// Games whose card was shown (enough for a long evening of games).
const MAX_SHOWN: usize = 50;

/// What the card shows: the player's own result (with the friends and listed players of the game in
/// `with`) and their augments.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Card {
    entry: Entry,
    augments: HashMap<u32, Augment>,
}

/// The games whose card was shown, newest last; only in memory.
static SHOWN: Mutex<Vec<u64>> = Mutex::new(Vec::new());

/// Marks a game's card as shown; false if it was shown before (a reconnect is followed as a game of
/// its own, ladder.rs).
fn first_card(game_id: u64) -> bool {
    let mut shown = SHOWN
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if shown.contains(&game_id) {
        return false;
    }
    shown.push(game_id);
    let over = shown.len().saturating_sub(MAX_SHOWN);
    shown.drain(..over);
    true
}

/// The Riot IDs on mayhemstats.lol's leaderboard (lowercase), read while the game runs; empty when
/// the site does not answer. Matched on this PC only, nothing goes out.
pub(super) async fn listed_names() -> HashSet<String> {
    let Ok(http) = website::site_client() else {
        return HashSet::new();
    };
    match website::read_json(&http, "/api/leaderboard").await {
        Ok(Some(board)) => names_of(&board),
        _ => HashSet::new(),
    }
}

fn names_of(board: &str) -> HashSet<String> {
    let Ok(value) = serde_json::from_str::<Value>(board) else {
        return HashSet::new();
    };
    value["players"]
        .as_array()
        .map(|players| {
            players
                .iter()
                .filter_map(|p| p["name"].as_str())
                .filter(|name| name.contains('#'))
                .map(str::to_lowercase)
                .collect()
        })
        .unwrap_or_default()
}

/// A Mayhem game ended (`game_id` from its start): its card from the end-of-game screen as soon as
/// it is there, else from the history; once.
pub(super) async fn after_game(app: AppHandle, game_id: u64, listed: HashSet<String>) {
    for _ in 0..EOG_TRIES {
        if let Ok(Some(lcu)) = Lcu::connect() {
            if let Ok(eog) = lcu.get::<Eog>(EOG).await {
                // An earlier game's screen may still be there: only this game's counts.
                if eog.game_id == game_id {
                    if let Some(card) = card(&lcu, from_eog(&eog, now_ms()), &listed, true).await {
                        return show(&app, card);
                    }
                }
            }
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    for wait in AFTER_GAME {
        tokio::time::sleep(wait).await;
        let Ok(Some(lcu)) = Lcu::connect() else {
            continue;
        };
        let path = format!("/lol-match-history/v1/games/{game_id}");
        let Ok(game) = lcu.get::<Game>(&path).await else {
            continue;
        };
        if game.queue_id != MAYHEM_QUEUE {
            return;
        }
        if let Some(card) = card(&lcu, from_history(&game), &listed, false).await {
            return show(&app, card);
        }
    }
}

fn show(app: &AppHandle, card: Card) {
    if first_card(card.entry.game_id) {
        let _ = app.emit_to(crate::mayhem::WINDOW, EVENT, card);
    }
}

/// The signed-in player's card from a game's values; None while they are not usable (nobody signed
/// in, no damage at all, the player not among them).
async fn card(
    lcu: &Lcu,
    mut summary: Summary,
    listed: &HashSet<String>,
    eog: bool,
) -> Option<Card> {
    add_noted_skins(&mut summary);
    let me: Summoner = lcu.get(SUMMONER).await.ok()?;
    let friends = friend_set(lcu).await;
    let champions = champion_names(lcu).await;
    let entry = own_entry(&summary, &me.puuid, &friends, listed, &champions, eog)?;
    let augments = augment_info(lcu, &entry.augments.iter().copied().collect()).await;
    Some(Card { entry, augments })
}

/// The player's entry of a game, with the League friends and the players the leaderboard lists by
/// Riot ID in `with` (as blank.'s card: `entries`).
fn own_entry(
    summary: &Summary,
    puuid: &str,
    friends: &HashSet<String>,
    listed: &HashSet<String>,
    champions: &HashMap<i64, (String, String)>,
    provisional: bool,
) -> Option<Entry> {
    if !super::valid_puuid(puuid) || summary.players.iter().all(|p| p.damage == 0) {
        return None;
    }
    let mut known = friends.clone();
    known.extend(
        summary
            .players
            .iter()
            .filter(|p| super::valid_puuid(&p.puuid) && listed.contains(&p.name.to_lowercase()))
            .map(|p| p.puuid.clone()),
    );
    let me = HashSet::from([puuid.to_string()]);
    entries(summary, &me, champions, &known, provisional)
        .into_iter()
        .next()
}

/// Opens a game's page on mayhemstats.lol in the browser (only the site's address with the id).
#[tauri::command]
pub fn mayhem_open_game(game_id: u64) {
    if game_id > 0 {
        crate::twitch::open_url(&format!("{SITE}/game/{game_id}"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::aram::games::{EogPlayer, EogTeam};

    const ME: &str = "0123abcd-0123-abcd-0123-0123456789ab";

    fn puuid(n: usize) -> String {
        format!("{n:08}-0000-0000-0000-000000000000")
    }

    fn eog(game_id: u64, me_in_it: bool) -> Eog {
        let team = |team_id: i64, win: bool, seats: std::ops::Range<usize>| EogTeam {
            team_id,
            is_winning_team: win,
            players: seats
                .map(|n| EogPlayer {
                    puuid: if n == 0 && me_in_it {
                        ME.into()
                    } else {
                        puuid(n)
                    },
                    riot_id_game_name: format!("Player {n}"),
                    riot_id_tag_line: "EUW".into(),
                    champion_id: 10 + n as i64,
                    team_id,
                    stats: HashMap::from([
                        (
                            "TOTAL_DAMAGE_DEALT_TO_CHAMPIONS".to_string(),
                            Value::from(10_000 + 1_000 * n as u64),
                        ),
                        ("CHAMPIONS_KILLED".to_string(), Value::from(n as u64)),
                        ("PLAYER_AUGMENT_1".to_string(), Value::from(1001)),
                    ]),
                    skin_splash_path: "/lol-game-data/assets/ASSETS/Characters/X/Skins/Skin7/x.jpg"
                        .into(),
                    ..EogPlayer::default()
                })
                .collect(),
        };
        Eog {
            game_id,
            game_length: 1200,
            teams: vec![team(100, true, 0..5), team(200, false, 5..10)],
        }
    }

    #[test]
    fn the_card_names_friends_and_listed_players_of_the_game() {
        let summary = from_eog(&eog(42, true), 1_790_000_000_000);
        let friends = HashSet::from([puuid(3)]);
        // Listed by Riot ID, whatever the case; a name without tag never matches.
        let listed = HashSet::from(["player 7#euw".to_string(), "player 8".to_string()]);
        let champions = HashMap::from([(10, ("Annie".to_string(), "Annie".to_string()))]);
        let entry = own_entry(&summary, ME, &friends, &listed, &champions, true).expect("card");
        assert_eq!((entry.game_id, entry.puuid.as_str()), (42, ME));
        assert_eq!((entry.champion.as_str(), entry.skin), ("Annie", Some(7)));
        assert!(entry.win && entry.provisional);
        assert_eq!(entry.augments, vec![1001]);
        assert_eq!(entry.damage_rank, 10);
        let with: Vec<(&str, bool)> = entry
            .with
            .iter()
            .map(|m| (m.name.as_str(), m.same_team))
            .collect();
        assert_eq!(with, vec![("Player 3#EUW", true), ("Player 7#EUW", false)]);
    }

    #[test]
    fn no_card_without_usable_values() {
        let none = HashSet::new();
        let champions = HashMap::new();
        // The player is not in the game, or nobody is signed in.
        let summary = from_eog(&eog(42, false), 0);
        assert!(own_entry(&summary, ME, &none, &none, &champions, true).is_none());
        let summary = from_eog(&eog(42, true), 0);
        assert!(own_entry(&summary, "", &none, &none, &champions, true).is_none());
        // A screen without any damage (not filled in yet).
        let mut empty = eog(42, true);
        for player in empty.teams.iter_mut().flat_map(|t| t.players.iter_mut()) {
            player.stats.clear();
        }
        let summary = from_eog(&empty, 0);
        assert!(own_entry(&summary, ME, &none, &none, &champions, true).is_none());
    }

    #[test]
    fn each_game_gets_one_card() {
        assert!(first_card(7_001));
        assert!(!first_card(7_001));
        assert!(first_card(7_002));
        // Only the last games are remembered, the oldest go first.
        for id in 0..MAX_SHOWN as u64 {
            first_card(8_000 + id);
        }
        assert!(SHOWN.lock().unwrap().len() <= MAX_SHOWN);
        assert!(first_card(7_001));
        assert!(!first_card(8_000 + MAX_SHOWN as u64 - 1));
    }

    #[test]
    fn listed_names_come_from_the_leaderboard() {
        let board = r#"{"players":[{"name":"Big Lee#DAWG"},{"name":"NoTag"},{"name":7},{}]}"#;
        assert_eq!(names_of(board), HashSet::from(["big lee#dawg".to_string()]));
        assert!(names_of("<html>").is_empty());
        assert!(names_of(r#"{"players":null}"#).is_empty());
    }
}
