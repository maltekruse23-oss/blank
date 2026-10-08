//! What the client sends (only the parts used), and the results made of it: a game from the
//! history or the end-of-game screen, and the entries of the tracked players.

use std::collections::{HashMap, HashSet};

use serde::Deserialize;

use super::client::{valid_puuid, Lcu};
use super::{Details, Entry, Mate, Seat, CHAMPIONS, FRIENDS, MAX_SKIN};

#[derive(Deserialize)]
pub(super) struct CherryAugment {
    pub(super) id: u32,
    #[serde(default, rename = "nameTRA")]
    pub(super) name: String,
    #[serde(default)]
    pub(super) rarity: String,
    #[serde(default, rename = "augmentSmallIconPath")]
    pub(super) icon: String,
}

pub(super) fn rarity(value: &str) -> &'static str {
    match value {
        "kPrismatic" => "prismatic",
        "kGold" => "gold",
        "kSilver" => "silver",
        _ => "",
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Summoner {
    #[serde(default)]
    pub(super) puuid: String,
    #[serde(default)]
    pub(super) game_name: String,
    #[serde(default)]
    pub(super) tag_line: String,
    #[serde(default)]
    pub(super) profile_icon_id: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ChatFriend {
    #[serde(default)]
    pub(super) puuid: String,
    #[serde(default)]
    pub(super) game_name: String,
    #[serde(default)]
    pub(super) game_tag: String,
    #[serde(default)]
    pub(super) name: String,
    #[serde(default)]
    pub(super) icon: i64,
}

#[derive(Deserialize)]
pub(super) struct History {
    pub(super) games: HistoryGames,
}

#[derive(Deserialize)]
pub(super) struct HistoryGames {
    #[serde(default)]
    pub(super) games: Vec<HistoryGame>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct HistoryGame {
    pub(super) game_id: u64,
    #[serde(default)]
    pub(super) queue_id: i64,
    #[serde(default)]
    pub(super) game_creation: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Game {
    pub(super) game_id: u64,
    #[serde(default)]
    pub(super) game_creation: u64,
    #[serde(default)]
    pub(super) game_duration: u64,
    #[serde(default)]
    pub(super) queue_id: i64,
    /// "KIWI" for ARAM Mayhem, also in a custom game (queue 0).
    #[serde(default)]
    pub(super) game_mode: String,
    #[serde(default)]
    pub(super) game_version: String,
    #[serde(default)]
    pub(super) participant_identities: Vec<Identity>,
    #[serde(default)]
    pub(super) participants: Vec<Participant>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Identity {
    pub(super) participant_id: i64,
    pub(super) player: IdentityPlayer,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct IdentityPlayer {
    #[serde(default)]
    pub(super) puuid: String,
    #[serde(default)]
    pub(super) game_name: String,
    #[serde(default)]
    pub(super) tag_line: String,
    #[serde(default)]
    pub(super) summoner_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Participant {
    pub(super) participant_id: i64,
    #[serde(default)]
    pub(super) team_id: i64,
    #[serde(default)]
    pub(super) champion_id: i64,
    pub(super) stats: Stats,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub(super) struct Stats {
    pub(super) win: bool,
    pub(super) kills: u32,
    pub(super) deaths: u32,
    pub(super) assists: u32,
    pub(super) total_damage_dealt_to_champions: u64,
    pub(super) total_damage_taken: u64,
    pub(super) total_heal: u64,
    pub(super) total_damage_shielded_on_teammates: u64,
    pub(super) gold_earned: u64,
    pub(super) champ_level: u32,
    pub(super) item0: u32,
    pub(super) item1: u32,
    pub(super) item2: u32,
    pub(super) item3: u32,
    pub(super) item4: u32,
    pub(super) item5: u32,
    pub(super) item6: u32,
    pub(super) largest_multi_kill: u32,
    pub(super) penta_kills: u32,
    pub(super) magic_damage_dealt_to_champions: u64,
    pub(super) physical_damage_dealt_to_champions: u64,
    pub(super) true_damage_dealt_to_champions: u64,
    pub(super) damage_self_mitigated: u64,
    pub(super) double_kills: u32,
    pub(super) triple_kills: u32,
    pub(super) quadra_kills: u32,
    pub(super) largest_critical_strike: u32,
    #[serde(rename = "timeCCingOthers")]
    pub(super) time_ccing_others: u32,
    pub(super) largest_killing_spree: u32,
    pub(super) damage_dealt_to_turrets: u64,
    pub(super) player_augment1: u32,
    pub(super) player_augment2: u32,
    pub(super) player_augment3: u32,
    pub(super) player_augment4: u32,
    pub(super) player_augment5: u32,
    pub(super) player_augment6: u32,
}

#[derive(Deserialize)]
struct Champion {
    id: i64,
    #[serde(default)]
    name: String,
    #[serde(default)]
    alias: String,
}

pub(super) fn riot_id(game_name: &str, tag: &str, fallback: &str) -> String {
    match (game_name.is_empty(), tag.is_empty()) {
        (false, false) => format!("{game_name}#{tag}"),
        (false, true) => game_name.to_string(),
        _ => fallback.to_string(),
    }
}

/// "16.19.712.1234" → "16.19".
fn patch(version: &str) -> String {
    version.split('.').take(2).collect::<Vec<_>>().join(".")
}

/// One player of a game, from the history or from the end-of-game screen.
#[derive(Default, Clone)]
pub(super) struct Line {
    /// The skin played, if the source tells it.
    pub(super) skin: Option<u32>,
    pub(super) puuid: String,
    pub(super) name: String,
    pub(super) team: i64,
    pub(super) champion_id: i64,
    pub(super) win: bool,
    pub(super) kills: u32,
    pub(super) deaths: u32,
    pub(super) assists: u32,
    pub(super) damage: u64,
    pub(super) taken: u64,
    pub(super) healed: u64,
    pub(super) shielded: u64,
    pub(super) gold: u64,
    pub(super) level: u32,
    pub(super) items: Vec<u32>,
    pub(super) augments: Vec<u32>,
    pub(super) multikill: u32,
    pub(super) pentas: u32,
    pub(super) details: Details,
}

/// A game with all its players, whatever the source.
pub(super) struct Summary {
    pub(super) game_id: u64,
    pub(super) at: u64,
    pub(super) seconds: u32,
    pub(super) patch: String,
    pub(super) players: Vec<Line>,
}

pub(super) fn from_history(game: &Game) -> Summary {
    // Older games give the length in milliseconds.
    let seconds = if game.game_duration > 36_000 {
        game.game_duration / 1000
    } else {
        game.game_duration
    };
    let players = game
        .participant_identities
        .iter()
        .filter_map(|identity| {
            let p = game
                .participants
                .iter()
                .find(|p| p.participant_id == identity.participant_id)?;
            let s = &p.stats;
            let player = &identity.player;
            Some(Line {
                skin: None,
                puuid: player.puuid.clone(),
                name: riot_id(&player.game_name, &player.tag_line, &player.summoner_name),
                team: p.team_id,
                champion_id: p.champion_id,
                win: s.win,
                kills: s.kills,
                deaths: s.deaths,
                assists: s.assists,
                damage: s.total_damage_dealt_to_champions,
                taken: s.total_damage_taken,
                healed: s.total_heal,
                shielded: s.total_damage_shielded_on_teammates,
                gold: s.gold_earned,
                level: s.champ_level,
                items: [
                    s.item0, s.item1, s.item2, s.item3, s.item4, s.item5, s.item6,
                ]
                .into_iter()
                .filter(|item| *item != 0)
                .collect(),
                augments: [
                    s.player_augment1,
                    s.player_augment2,
                    s.player_augment3,
                    s.player_augment4,
                    s.player_augment5,
                    s.player_augment6,
                ]
                .into_iter()
                .filter(|augment| *augment != 0)
                .collect(),
                multikill: s.largest_multi_kill,
                pentas: s.penta_kills,
                details: Details {
                    magic: s.magic_damage_dealt_to_champions,
                    physical: s.physical_damage_dealt_to_champions,
                    true_damage: s.true_damage_dealt_to_champions,
                    mitigated: s.damage_self_mitigated,
                    doubles: s.double_kills,
                    triples: s.triple_kills,
                    quadras: s.quadra_kills,
                    largest_crit: s.largest_critical_strike,
                    cc_seconds: s.time_ccing_others,
                    largest_spree: s.largest_killing_spree,
                    turret_damage: s.damage_dealt_to_turrets,
                },
            })
        })
        .collect();
    Summary {
        game_id: game.game_id,
        at: game.game_creation,
        seconds: seconds.min(u32::MAX as u64) as u32,
        patch: patch(&game.game_version),
        players,
    }
}

/// The end-of-game screen: its own shape, stats by upper-case names.
#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub(super) struct Eog {
    pub(super) game_id: u64,
    /// Seconds.
    pub(super) game_length: u64,
    pub(super) teams: Vec<EogTeam>,
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub(super) struct EogTeam {
    pub(super) team_id: i64,
    pub(super) is_winning_team: bool,
    pub(super) players: Vec<EogPlayer>,
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub(super) struct EogPlayer {
    pub(super) puuid: String,
    pub(super) riot_id_game_name: String,
    pub(super) riot_id_tag_line: String,
    pub(super) summoner_name: String,
    pub(super) champion_id: i64,
    pub(super) team_id: i64,
    pub(super) level: u32,
    pub(super) items: Vec<i64>,
    pub(super) stats: HashMap<String, serde_json::Value>,
    /// Pictures of the skin played; their path names the skin.
    pub(super) skin_splash_path: String,
    pub(super) skin_tile_path: String,
}

/// The skin's number from a picture path of the client: ".../Skins/Skin14/...", ".../Skins/Base/..."
/// (0) or ".../champion-splashes/103/103014.jpg" (champion id × 1000 + number).
pub(super) fn skin_from_path(path: &str, champion_id: i64) -> Option<u32> {
    let lower = path.to_ascii_lowercase();
    if lower.contains("/skins/base/") {
        return Some(0);
    }
    let digits = |text: &str| -> Option<u64> {
        let end = text
            .find(|c: char| !c.is_ascii_digit())
            .unwrap_or(text.len());
        text[..end].parse().ok()
    };
    if let Some(at) = lower.find("/skins/skin") {
        return digits(&lower[at + "/skins/skin".len()..])
            .filter(|n| *n <= u64::from(MAX_SKIN))
            .map(|n| n as u32);
    }
    if let Some(at) = lower.find("/champion-splashes/") {
        let file = lower[at..].rsplit('/').next()?;
        let id = digits(file)?;
        let champion = u64::try_from(champion_id).ok()?;
        return (id / 1000 == champion && id % 1000 <= u64::from(MAX_SKIN))
            .then_some((id % 1000) as u32);
    }
    None
}

pub(super) fn from_eog(eog: &Eog, now: u64) -> Summary {
    let players = eog
        .teams
        .iter()
        .flat_map(|team| team.players.iter().map(move |p| (team, p)))
        .map(|(team, p)| {
            let n = |key: &str| {
                p.stats
                    .get(key)
                    .and_then(serde_json::Value::as_f64)
                    .unwrap_or(0.0)
                    .max(0.0)
            };
            let big = |key: &str| n(key).round() as u64;
            let small = |key: &str| n(key).round().min(u32::MAX as f64) as u32;
            Line {
                skin: skin_from_path(&p.skin_splash_path, p.champion_id)
                    .or_else(|| skin_from_path(&p.skin_tile_path, p.champion_id)),
                puuid: p.puuid.clone(),
                name: riot_id(&p.riot_id_game_name, &p.riot_id_tag_line, &p.summoner_name),
                team: if p.team_id != 0 {
                    p.team_id
                } else {
                    team.team_id
                },
                champion_id: p.champion_id,
                win: team.is_winning_team || n("WIN") > 0.0,
                kills: small("CHAMPIONS_KILLED"),
                deaths: small("NUM_DEATHS"),
                assists: small("ASSISTS"),
                damage: big("TOTAL_DAMAGE_DEALT_TO_CHAMPIONS"),
                taken: big("TOTAL_DAMAGE_TAKEN"),
                healed: big("TOTAL_HEAL"),
                shielded: 0,
                gold: big("GOLD_EARNED"),
                level: if p.level > 0 { p.level } else { small("LEVEL") },
                items: p
                    .items
                    .iter()
                    .filter(|item| **item > 0 && **item <= u32::MAX as i64)
                    .map(|item| *item as u32)
                    .collect(),
                augments: (1..=6)
                    .map(|i| small(&format!("PLAYER_AUGMENT_{i}")))
                    .filter(|augment| *augment != 0)
                    .collect(),
                multikill: small("LARGEST_MULTI_KILL"),
                pentas: small("PENTA_KILLS"),
                details: Details {
                    magic: big("MAGIC_DAMAGE_DEALT_TO_CHAMPIONS"),
                    physical: big("PHYSICAL_DAMAGE_DEALT_TO_CHAMPIONS"),
                    true_damage: big("TRUE_DAMAGE_DEALT_TO_CHAMPIONS"),
                    mitigated: big("TOTAL_DAMAGE_SELF_MITIGATED"),
                    doubles: small("DOUBLE_KILLS"),
                    triples: small("TRIPLE_KILLS"),
                    quadras: small("QUADRA_KILLS"),
                    largest_crit: small("LARGEST_CRITICAL_STRIKE"),
                    cc_seconds: small("TIME_CCING_OTHERS"),
                    largest_spree: small("LARGEST_KILLING_SPREE"),
                    turret_damage: big("TOTAL_DAMAGE_DEALT_TO_TURRETS"),
                },
            }
        })
        .collect();
    Summary {
        game_id: eog.game_id,
        at: now.saturating_sub(eog.game_length.saturating_mul(1000)),
        seconds: eog.game_length.min(36_000) as u32,
        // Unknown here: the item pictures take the known version until the history's values come.
        patch: String::new(),
        players,
    }
}

/// The results of the tracked players in one game, with their place in damage among all and the
/// user's friends in the same game.
pub(super) fn entries(
    game: &Summary,
    tracked: &HashSet<String>,
    champions: &HashMap<i64, (String, String)>,
    friends: &HashSet<String>,
    provisional: bool,
) -> Vec<Entry> {
    let mut damages: Vec<u64> = game.players.iter().map(|p| p.damage).collect();
    damages.sort_unstable_by(|a, b| b.cmp(a));
    let team_damage = |team: i64| -> u64 {
        game.players
            .iter()
            .filter(|p| p.team == team)
            .map(|p| p.damage)
            .sum()
    };
    let champion = |id: i64| champions.get(&id).cloned().unwrap_or_default();
    game.players
        .iter()
        .filter(|p| tracked.contains(&p.puuid))
        .map(|p| {
            let (alias, champion_name) = champion(p.champion_id);
            let team = team_damage(p.team);
            let with = game
                .players
                .iter()
                .filter(|o| o.puuid != p.puuid)
                .filter(|o| friends.contains(&o.puuid) || tracked.contains(&o.puuid))
                .map(|o| {
                    let (alias, champion_name) = champion(o.champion_id);
                    Mate {
                        puuid: o.puuid.clone(),
                        name: o.name.clone(),
                        champion: alias,
                        champion_name,
                        damage: o.damage,
                        kills: o.kills,
                        deaths: o.deaths,
                        assists: o.assists,
                        same_team: o.team == p.team,
                    }
                })
                .collect();
            Entry {
                game_id: game.game_id,
                at: game.at,
                seconds: game.seconds,
                patch: game.patch.clone(),
                puuid: p.puuid.clone(),
                name: p.name.clone(),
                champion_id: p.champion_id,
                champion: alias,
                champion_name,
                win: p.win,
                kills: p.kills,
                deaths: p.deaths,
                assists: p.assists,
                damage: p.damage,
                taken: p.taken,
                healed: p.healed,
                shielded: p.shielded,
                gold: p.gold,
                level: p.level,
                items: p.items.clone(),
                augments: p.augments.clone(),
                damage_rank: damages
                    .iter()
                    .position(|d| *d == p.damage)
                    .map_or(0, |i| i as u32 + 1),
                team_share: if team == 0 {
                    0.0
                } else {
                    p.damage as f64 / team as f64
                },
                multikill: p.multikill,
                pentas: p.pentas,
                details: Some(p.details.clone()),
                with,
                provisional,
                skin: p.skin,
                lobby: game
                    .players
                    .iter()
                    .map(|o| Seat {
                        you: o.puuid == p.puuid,
                        team: o.team,
                        champion_id: o.champion_id,
                        kills: o.kills,
                        deaths: o.deaths,
                        assists: o.assists,
                        damage: o.damage,
                        taken: o.taken,
                        mitigated: o.details.mitigated,
                        healed: o.healed,
                        shielded: o.shielded,
                        gold: o.gold,
                    })
                    .collect(),
            }
        })
        .collect()
}

/// A stored game gets a new version (exact values, a better one from a friend): the skin stays if
/// the new version does not know it.
pub(super) fn replace_keeping_skin(old: &mut Entry, new: Entry) {
    let skin = new.skin.or(old.skin);
    *old = new;
    old.skin = skin;
}

/// The user's League friends (for the comparison on the card).
pub(super) async fn friend_set(lcu: &Lcu) -> HashSet<String> {
    lcu.get::<Vec<ChatFriend>>(FRIENDS)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|f| f.puuid)
        .filter(|p| valid_puuid(p))
        .collect()
}

pub(super) async fn champion_names(lcu: &Lcu) -> HashMap<i64, (String, String)> {
    lcu.get::<Vec<Champion>>(CHAMPIONS)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|c| (c.id, (c.alias, c.name)))
        .collect()
}
