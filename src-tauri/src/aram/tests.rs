use super::after_game::{note_skins, Session};
use super::client::icon_path;
use super::games::{from_eog, skin_from_path, Eog, Identity, IdentityPlayer, Participant, Stats};
use super::*;

fn puuid(n: u8) -> String {
    format!("{}{}", "a".repeat(77), n)
}

fn game() -> Game {
    let stats = |damage: u64, win: bool| Stats {
        win,
        kills: 10,
        deaths: 2,
        assists: 20,
        total_damage_dealt_to_champions: damage,
        magic_damage_dealt_to_champions: damage / 4,
        physical_damage_dealt_to_champions: damage / 2,
        penta_kills: 1,
        time_ccing_others: 33,
        item0: 3031,
        item3: 3006,
        player_augment1: 7,
        ..Stats::default()
    };
    Game {
        game_id: 77,
        game_creation: 1_790_000_000_000,
        game_duration: 1200,
        queue_id: MAYHEM_QUEUE,
        game_mode: "KIWI".into(),
        game_version: "16.19.712.1234".into(),
        participant_identities: (1..=4)
            .map(|i| Identity {
                participant_id: i,
                player: IdentityPlayer {
                    puuid: puuid(i as u8),
                    game_name: format!("Spieler{i}"),
                    tag_line: "EUW".into(),
                    summoner_name: String::new(),
                },
            })
            .collect(),
        participants: vec![
            Participant {
                participant_id: 1,
                team_id: 100,
                champion_id: 10,
                stats: stats(30_000, true),
            },
            Participant {
                participant_id: 2,
                team_id: 100,
                champion_id: 62,
                stats: stats(10_000, true),
            },
            Participant {
                participant_id: 3,
                team_id: 200,
                champion_id: 10,
                stats: stats(50_000, false),
            },
            Participant {
                participant_id: 4,
                team_id: 200,
                champion_id: 10,
                stats: stats(0, false),
            },
        ],
    }
}

#[test]
fn lockfile_gives_port_and_password_only_when_valid() {
    assert_eq!(
        parse_lockfile("LeagueClient:1234:54321:aB3_-x9:https\n"),
        Some((54321, "aB3_-x9".into()))
    );
    assert_eq!(parse_lockfile("LeagueClient:1234:0:pw:https"), None);
    assert_eq!(parse_lockfile("LeagueClient:1234:54321:pw:http"), None);
    assert_eq!(parse_lockfile("LeagueClient:1234:54321:p w:https"), None);
    assert_eq!(parse_lockfile("LeagueClient:1234:54321::https"), None);
    assert_eq!(parse_lockfile("kaputt"), None);
}

/// One real entry of the test game, from an hour ago.
pub(super) fn sample_entry() -> Entry {
    let tracked: HashSet<String> = [puuid(1)].into_iter().collect();
    let mut entry = entries(
        &from_history(&game()),
        &tracked,
        &HashMap::new(),
        &HashSet::new(),
        false,
    )
    .remove(0);
    entry.at = now_ms() - 60 * 60 * 1000;
    entry
}

#[test]
fn every_game_gets_exactly_one_card() {
    let mut stored = Stored::default();
    assert!(take_card(&mut stored, 11));
    assert!(!take_card(&mut stored, 11));
    assert!(take_card(&mut stored, 12));
    for id in 100..(100 + MAX_CARDED as u64) {
        take_card(&mut stored, id);
    }
    // Only the newest are kept; the oldest could get a card again, but are months old.
    assert_eq!(stored.carded.len(), MAX_CARDED);
    assert!(!stored.carded.contains(&11));
}

#[test]
fn games_from_other_apps_are_checked() {
    let good = sample_entry();
    assert!(valid_entry(&good));
    let mut bad = good.clone();
    bad.name = "a\u{7}b".into();
    assert!(!valid_entry(&bad));
    let mut bad = good.clone();
    bad.champion = "../x".into();
    assert!(!valid_entry(&bad));
    let mut bad = good.clone();
    bad.damage = 10_000_000_000;
    assert!(!valid_entry(&bad));
    let mut bad = good.clone();
    bad.team_share = f64::NAN;
    assert!(!valid_entry(&bad));
    let mut bad = good.clone();
    bad.at = 1_000;
    assert!(!valid_entry(&bad));
    let mut bad = good.clone();
    bad.items = vec![1; 20];
    assert!(!valid_entry(&bad));
    let mut bad = good;
    bad.puuid = "short".into();
    assert!(!valid_entry(&bad));
}

#[test]
fn the_best_version_of_a_game_wins_everywhere() {
    let exact = sample_entry();
    let mut screen = exact.clone();
    screen.provisional = true;
    let mut older = exact.clone();
    older.details = None;
    let mut no_lobby = exact.clone();
    no_lobby.lobby.clear();
    assert!(quality(&exact) > quality(&no_lobby));
    assert!(quality(&no_lobby) > quality(&older));
    assert!(quality(&older) > quality(&screen));
}

#[test]
fn every_game_keeps_all_players_values_without_names() {
    let entry = sample_entry();
    assert_eq!(entry.lobby.len(), 4);
    let you: Vec<&Seat> = entry.lobby.iter().filter(|s| s.you).collect();
    assert_eq!(you.len(), 1);
    assert_eq!((you[0].damage, you[0].team), (30_000, 100));
    let json = serde_json::to_string(&entry.lobby).unwrap();
    assert!(!json.contains("Spieler") && !json.contains(&puuid(2)));

    let mut bad = entry.clone();
    bad.lobby.iter_mut().for_each(|s| s.you = true);
    assert!(!valid_entry(&bad));
    let mut bad = entry.clone();
    bad.lobby[1].damage = 10_000_000_000;
    assert!(!valid_entry(&bad));
    let mut bad = entry;
    bad.lobby = vec![bad.lobby[0].clone(); 11];
    assert!(!valid_entry(&bad));
}

/// A full game (ten players, six items, all details, friends) still fits into one message of
/// the group, encrypted and in Base64 (aram_group.rs: 8 KB).
#[test]
fn a_full_game_fits_into_a_group_message() {
    let mut entry = sample_entry();
    entry.name = "N".repeat(40);
    entry.champion_name = "C".repeat(40);
    entry.items = vec![999_999; 7];
    entry.augments = vec![999_999; 8];
    let seat = Seat {
        you: false,
        team: 200,
        champion_id: 99_999,
        kills: 999,
        deaths: 999,
        assists: 999,
        damage: 99_999_999,
        taken: 99_999_999,
        mitigated: 99_999_999,
        healed: 99_999_999,
        shielded: 99_999_999,
        gold: 99_999_999,
    };
    entry.lobby = vec![seat; 10];
    let mate = Mate {
        puuid: puuid(9),
        name: "M".repeat(40),
        champion: "A".repeat(40),
        champion_name: "B".repeat(40),
        damage: 99_999_999,
        kills: 999,
        deaths: 999,
        assists: 999,
        same_team: true,
    };
    entry.with = vec![mate; 9];
    entry.skin = Some(MAX_SKIN);
    let json = serde_json::to_string(&entry).unwrap();
    // Message frame, 12 bytes nonce + 16 tag, Base64 4/3.
    let sealed = (json.len() + 120 + 28).div_ceil(3) * 4;
    assert!(sealed < 8 * 1024, "{sealed}");
}

#[test]
fn only_tracked_players_with_rank_and_share() {
    let tracked: HashSet<String> = [puuid(1), puuid(2)].into_iter().collect();
    let champions = HashMap::from([
        (10, ("Kayle".to_string(), "Kayle".to_string())),
        (62, ("MonkeyKing".to_string(), "Wukong".to_string())),
    ]);
    let friends: HashSet<String> = [puuid(3)].into_iter().collect();
    let found = entries(
        &from_history(&game()),
        &tracked,
        &champions,
        &friends,
        false,
    );
    assert_eq!(found.len(), 2);
    let first = &found[0];
    assert_eq!(first.name, "Spieler1#EUW");
    assert_eq!(first.champion, "Kayle");
    assert_eq!(first.patch, "16.19");
    assert_eq!(first.seconds, 1200);
    assert_eq!(first.damage_rank, 2);
    assert!((first.team_share - 0.75).abs() < 1e-9);
    assert_eq!(first.items, vec![3031, 3006]);
    assert_eq!(first.augments, vec![7]);
    let details = first.details.as_ref().unwrap();
    assert_eq!(
        (details.magic, details.physical, details.cc_seconds),
        (7_500, 15_000, 33)
    );
    assert_eq!(first.pentas, 1);
    // Tracked player 2 (same team) and friend 3 (other team) are in the game with player 1.
    let with: Vec<(&str, bool)> = first
        .with
        .iter()
        .map(|m| (m.name.as_str(), m.same_team))
        .collect();
    assert_eq!(with, vec![("Spieler2#EUW", true), ("Spieler3#EUW", false)]);
    assert!(!first.provisional);
    assert_eq!(found[1].champion, "MonkeyKing");
    assert_eq!(found[1].champion_name, "Wukong");
    assert_eq!(found[1].damage_rank, 3);
}

#[test]
fn unknown_champion_and_empty_team_stay_harmless() {
    let tracked: HashSet<String> = [puuid(4)].into_iter().collect();
    let mut g = game();
    g.participants[2].stats.total_damage_dealt_to_champions = 0;
    let found = entries(
        &from_history(&g),
        &tracked,
        &HashMap::new(),
        &HashSet::new(),
        false,
    );
    assert_eq!(found[0].champion, "");
    assert_eq!(found[0].team_share, 0.0);
}

#[test]
fn end_of_game_stats_become_provisional_entries() {
    let json = r#"{"gameId":88,"gameLength":1100,"teams":[
        {"teamId":100,"isWinningTeam":true,"players":[
            {"puuid":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1","riotIdGameName":"Spieler1","riotIdTagLine":"EUW","championId":10,"teamId":100,"items":[3031,0,3006],
             "stats":{"TOTAL_DAMAGE_DEALT_TO_CHAMPIONS":40000,"CHAMPIONS_KILLED":12,"NUM_DEATHS":3,"ASSISTS":20,"MAGIC_DAMAGE_DEALT_TO_CHAMPIONS":30000.0,"PENTA_KILLS":1}},
            {"puuid":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2","riotIdGameName":"Freund","riotIdTagLine":"EUW","championId":62,"teamId":100,
             "stats":{"TOTAL_DAMAGE_DEALT_TO_CHAMPIONS":10000,"CHAMPIONS_KILLED":4}}]},
        {"teamId":200,"isWinningTeam":false,"players":[
            {"puuid":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","championId":10,"teamId":200,"stats":{"TOTAL_DAMAGE_DEALT_TO_CHAMPIONS":50000}}]}]}"#;
    let eog: Eog = serde_json::from_str(json).unwrap();
    let summary = from_eog(&eog, 2_000_000);
    assert_eq!(summary.at, 2_000_000 - 1_100_000);
    let tracked: HashSet<String> = [puuid(1)].into_iter().collect();
    let friends: HashSet<String> = [puuid(2)].into_iter().collect();
    let found = entries(&summary, &tracked, &HashMap::new(), &friends, true);
    let me = &found[0];
    assert!(me.provisional && me.win);
    assert_eq!(
        (me.damage, me.kills, me.deaths, me.assists, me.pentas),
        (40_000, 12, 3, 20, 1)
    );
    assert_eq!(me.details.as_ref().unwrap().magic, 30_000);
    assert_eq!(me.items, vec![3031, 3006]);
    assert_eq!(me.damage_rank, 2);
    assert!((me.team_share - 0.8).abs() < 1e-9);
    assert_eq!(me.with.len(), 1);
    assert_eq!(
        (
            me.with[0].name.as_str(),
            me.with[0].damage,
            me.with[0].same_team
        ),
        ("Freund#EUW", 10_000, true)
    );
}

#[test]
fn the_skin_played_comes_from_the_picture_paths() {
    let base = "/lol-game-data/assets/ASSETS/Characters/Ahri/Skins/Base/Images/ahri_splash.jpg";
    let skin = "/lol-game-data/assets/ASSETS/Characters/Ahri/Skins/Skin14/Images/a.jpg";
    let splash = "/lol-game-data/assets/v1/champion-splashes/103/103027.jpg";
    assert_eq!(skin_from_path(base, 103), Some(0));
    assert_eq!(skin_from_path(skin, 103), Some(14));
    assert_eq!(skin_from_path(splash, 103), Some(27));
    // Another champion's picture or nothing to read: not guessed.
    assert_eq!(skin_from_path(splash, 104), None);
    assert_eq!(skin_from_path("", 103), None);
    assert_eq!(skin_from_path("/x/Skins/Skin99999/y.jpg", 103), None);

    let json = r#"{"gameId":88,"gameLength":900,"teams":[{"teamId":100,"isWinningTeam":true,"players":[
        {"puuid":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1","championId":103,
         "skinSplashPath":"/lol-game-data/assets/v1/champion-splashes/103/103014.jpg","stats":{"TOTAL_DAMAGE_DEALT_TO_CHAMPIONS":1}},
        {"puuid":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2","championId":62,
         "stats":{"TOTAL_DAMAGE_DEALT_TO_CHAMPIONS":1}}]}]}"#;
    let mut summary = from_eog(&serde_json::from_str(json).unwrap(), 2_000_000);
    assert_eq!(summary.players[0].skin, Some(14));
    assert_eq!(summary.players[1].skin, None);
    // Noted at the start of the game (session): fills in what the screen did not tell.
    let session: Session = serde_json::from_str(
        r#"{"gameData":{"gameId":88,"queue":{"id":2400},"playerChampionSelections":[
            {"championId":62,"selectedSkinIndex":7},{"championId":103,"selectedSkinIndex":2}]}}"#,
    )
    .unwrap();
    note_skins(&session.game_data);
    add_noted_skins(&mut summary);
    assert_eq!(summary.players[0].skin, Some(14));
    assert_eq!(summary.players[1].skin, Some(7));
}

#[test]
fn a_better_version_keeps_the_skin() {
    let tracked: HashSet<String> = [puuid(1)].into_iter().collect();
    let mut summary = from_history(&game());
    summary.players[0].skin = Some(5);
    let with_skin = entries(&summary, &tracked, &HashMap::new(), &HashSet::new(), true).remove(0);
    let exact = entries(
        &from_history(&game()),
        &tracked,
        &HashMap::new(),
        &HashSet::new(),
        false,
    )
    .remove(0);
    assert!(quality(&exact) > quality(&with_skin));
    let mut kept = with_skin.clone();
    replace_keeping_skin(&mut kept, exact.clone());
    assert_eq!(kept.skin, Some(5));
    assert!(!kept.provisional);
    // The same values with the skin are the better version.
    let mut exact_with_skin = exact.clone();
    exact_with_skin.skin = Some(5);
    assert!(quality(&exact_with_skin) > quality(&exact));
    assert!(valid_entry(&exact_with_skin));
    exact_with_skin.skin = Some(MAX_SKIN + 1);
    assert!(!valid_entry(&exact_with_skin));
}

#[test]
fn icons_are_only_png_of_the_game_data() {
    assert!(icon_path(
        "/lol-game-data/assets/ASSETS/UX/Kiwi/Augments/Icons/Goldrend_small.png"
    ));
    assert!(!icon_path("/lol-game-data/assets/../../lol-login/x.png"));
    assert!(!icon_path("/lol-chat/v1/friends.png"));
    assert!(!icon_path("/lol-game-data/assets/x.json"));
    assert!(!icon_path("/lol-game-data/assets/a b.png"));
    assert!(!icon_path("/lol-game-data/assets/x.png?y=1"));
    assert_eq!(base64(b""), "");
    assert_eq!(base64(b"f"), "Zg==");
    assert_eq!(base64(b"fo"), "Zm8=");
    assert_eq!(base64(b"foo"), "Zm9v");
    assert_eq!(base64(b"foobar"), "Zm9vYmFy");
    assert_eq!(base64(&[0xff, 0xfe, 0x00]), "//4A");
    assert_eq!(rarity("kPrismatic"), "prismatic");
    assert_eq!(rarity("kIrgendwas"), "");
}

#[test]
fn puuids_are_checked() {
    assert!(valid_puuid("3f2c9a1e-8d4b-4c7a-9e21-5b6d7f8a9c0e"));
    assert!(valid_puuid(&puuid(1)));
    assert!(!valid_puuid("kurz"));
    assert!(!valid_puuid(&format!("{}/..", "a".repeat(60))));
    assert!(!valid_puuid(&format!("{}?x=1", "a".repeat(60))));
}

#[test]
fn collection_survives_a_round_trip() {
    let dir = std::env::temp_dir().join(format!("blank-aram-test-{}", std::process::id()));
    let path = dir.join("aram.json");
    let tracked: HashSet<String> = [puuid(1)].into_iter().collect();
    let stored = Stored {
        version: 1,
        me: Some(Player {
            puuid: puuid(1),
            name: "Spieler1#EUW".into(),
            icon: 29,
        }),
        games: entries(
            &from_history(&game()),
            &tracked,
            &HashMap::new(),
            &HashSet::new(),
            false,
        ),
        synced_at: Some(5),
        since: Some(7),
        carded: vec![3, 9],
        friends: vec![puuid(2)],
        augments: HashMap::from([(
            7,
            Augment {
                name: "Goldrend".into(),
                rarity: "prismatic".into(),
                icon: None,
            },
        )]),
    };
    save(&path, &stored).unwrap();
    let back = load(&path).unwrap();
    assert_eq!(back.games, stored.games);
    assert_eq!(back.me, stored.me);
    assert_eq!(back.friends, stored.friends);
    assert_eq!(back.since, Some(7));
    assert_eq!(back.carded, vec![3, 9]);
    // A collection from before the reset existed reads as never reset.
    let old: Stored =
        serde_json::from_str(r#"{"version":1,"me":null,"games":[],"syncedAt":null}"#).unwrap();
    assert_eq!(old.since, None);
    assert_eq!(back.augments, stored.augments);
    std::fs::write(&path, "{kaputt").unwrap();
    assert_eq!(load(&path).err().as_deref(), Some(DAMAGED));
    std::fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn a_mayhem_custom_game_counts_as_mayhem() {
    // Matchmade Mayhem, a custom game in its mode (queue 0 or -1), never other modes.
    assert!(mayhem_game(MAYHEM_QUEUE, ""));
    assert!(mayhem_game(0, "KIWI"));
    assert!(mayhem_game(-1, "kiwi"));
    assert!(!mayhem_game(0, "ARAM"));
    assert!(!mayhem_game(450, "ARAM"));
    assert!(!mayhem_game(0, ""));
    let custom: Session = serde_json::from_str(
        r#"{"gameData":{"gameId":7,"queue":{"id":-1,"gameMode":""}},"map":{"gameMode":"KIWI"}}"#,
    )
    .unwrap();
    assert!(custom.mayhem());
    let aram: Session = serde_json::from_str(
        r#"{"gameData":{"gameId":7,"queue":{"id":450,"gameMode":"ARAM"}},"map":{"gameMode":"ARAM"}}"#,
    )
    .unwrap();
    assert!(!aram.mayhem());
}
