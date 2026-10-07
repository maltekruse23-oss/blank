//! Checks of games from other apps of the group, and which version of a game is the best.

use super::client::valid_puuid;
use super::{now_ms, Entry, Seat, MAX_MEMBERS, MAX_SKIN};

/// How good a version of a game is: exact values with all details and the whole game, with all
/// details, exact values, the end-of-game screen's. Everyone keeps the best, so all end up with
/// the same.
pub(super) fn quality(entry: &Entry) -> u8 {
    let values = match (entry.provisional, entry.details.is_some()) {
        (true, _) => 1,
        (false, false) => 2,
        (false, true) if entry.lobby.is_empty() => 3,
        (false, true) => 4,
    };
    // The same values with the skin played are a little better (so the skin reaches everyone).
    values * 2 + u8::from(entry.skin.is_some())
}

/// Games before this cannot be ARAM Mayhem results (2020), for checks of times.
pub(super) const PLAUSIBLE_FROM: u64 = 1_577_836_800_000;
pub(super) const DAY_MS: u64 = 24 * 60 * 60 * 1000;

fn plain_text(text: &str, max: usize) -> bool {
    text.chars().count() <= max && !text.chars().any(char::is_control)
}

fn alias(text: &str) -> bool {
    text.len() <= 40 && text.chars().all(|c| c.is_ascii_alphanumeric())
}

/// A game from another app: every value in a sane range, every text short and plain.
pub(super) fn valid_entry(e: &Entry) -> bool {
    let big = 100_000_000;
    let mates_ok = e.with.len() <= MAX_MEMBERS
        && e.with.iter().all(|m| {
            valid_puuid(&m.puuid)
                && plain_text(&m.name, 40)
                && alias(&m.champion)
                && plain_text(&m.champion_name, 40)
                && m.damage <= big
                && m.kills.max(m.deaths).max(m.assists) <= 1000
        });
    let details_ok = e.details.as_ref().is_none_or(|d| {
        [
            d.magic,
            d.physical,
            d.true_damage,
            d.mitigated,
            d.turret_damage,
        ]
        .iter()
        .all(|v| *v <= big)
            && [d.doubles, d.triples, d.quadras, d.largest_spree]
                .iter()
                .all(|v| *v <= 1000)
            && d.largest_crit <= 1_000_000
            && d.cc_seconds <= 100_000
    });
    e.game_id > 0
        && e.game_id < 10_000_000_000_000
        && (PLAUSIBLE_FROM..=now_ms() + DAY_MS).contains(&e.at)
        && e.seconds <= 4 * 60 * 60
        && e.patch.len() <= 10
        && e.patch.chars().all(|c| c.is_ascii_digit() || c == '.')
        && valid_puuid(&e.puuid)
        && !e.name.is_empty()
        && plain_text(&e.name, 40)
        && (0..=100_000).contains(&e.champion_id)
        && alias(&e.champion)
        && plain_text(&e.champion_name, 40)
        && e.kills.max(e.deaths).max(e.assists) <= 1000
        && [e.damage, e.taken, e.healed, e.shielded, e.gold]
            .iter()
            .all(|v| *v <= big)
        && e.level <= 30
        && e.items.len() <= 7
        && e.items.iter().all(|i| *i <= 1_000_000)
        && e.augments.len() <= 8
        && e.augments.iter().all(|a| *a <= 1_000_000)
        && (1..=10).contains(&e.damage_rank)
        && e.team_share.is_finite()
        && (0.0..=1.0).contains(&e.team_share)
        && e.multikill <= 5
        && e.pentas <= 100
        && e.skin.is_none_or(|skin| skin <= MAX_SKIN)
        && details_ok
        && mates_ok
        && lobby_ok(&e.lobby)
}

/// The whole game's values: at most ten players, the entry's player at most once, sane values.
fn lobby_ok(lobby: &[Seat]) -> bool {
    let big = 100_000_000;
    lobby.len() <= MAX_MEMBERS
        && lobby.iter().filter(|s| s.you).count() <= 1
        && lobby.iter().all(|s| {
            (0..=1000).contains(&s.team)
                && (0..=100_000).contains(&s.champion_id)
                && s.kills.max(s.deaths).max(s.assists) <= 1000
                && [s.damage, s.taken, s.mitigated, s.healed, s.shielded, s.gold]
                    .iter()
                    .all(|v| *v <= big)
        })
}
