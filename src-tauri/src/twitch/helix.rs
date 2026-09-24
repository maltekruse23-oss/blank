//! Response shapes of the Helix endpoints in use.
//! https://dev.twitch.tv/docs/api/reference/
use serde::Deserialize;

use super::{GameRef, LiveStream};

#[derive(Deserialize)]
pub struct Page<T> {
    pub data: Vec<T>,
}

#[derive(Deserialize)]
pub struct Channel {
    pub game_id: String,
    pub game_name: String,
    pub title: String,
}

#[derive(Deserialize)]
pub struct User {
    pub id: String,
    pub login: String,
    pub display_name: String,
    pub profile_image_url: String,
}

#[derive(Deserialize)]
pub struct Category {
    pub id: String,
    pub name: String,
}

#[derive(Deserialize)]
pub struct Stream {
    user_login: String,
    title: String,
    game_id: String,
    game_name: String,
    viewer_count: u64,
    thumbnail_url: String,
    #[serde(rename = "type")]
    kind: String,
}

impl Stream {
    /// `cache_bucket` changes every few minutes so the preview image is fetched again.
    pub fn into_live(self, cache_bucket: u64) -> Option<LiveStream> {
        if self.kind != "live" {
            return None;
        }
        let thumbnail_url = (!self.thumbnail_url.is_empty()).then(|| {
            let url = self
                .thumbnail_url
                .replace("{width}", "440")
                .replace("{height}", "248");
            format!("{url}?t={cache_bucket}")
        });
        let name = if self.game_name.is_empty() {
            "Ohne Kategorie".to_owned()
        } else {
            self.game_name
        };
        Some(LiveStream {
            login: self.user_login,
            title: self.title,
            game: GameRef {
                id: self.game_id,
                name,
            },
            viewers: self.viewer_count,
            thumbnail_url,
        })
    }
}

/// Twitch logins: 1–25 characters, lowercase ASCII letters, digits and underscores.
pub fn is_login(value: &str) -> bool {
    (1..=25).contains(&value.len())
        && value
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
}
