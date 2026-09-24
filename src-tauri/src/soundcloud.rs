//! Opens SoundCloud pages (the playing track and its uploader, which SoundCloud's terms require to
//! be linked) in the default browser. The music itself plays in SoundCloud's embedded player in
//! the web content; nothing else of SoundCloud runs in Rust.

const PREFIX: &str = "https://soundcloud.com/";

/// Only plain soundcloud.com page links: no other host, no spaces, quotes or other specials.
fn is_soundcloud_url(url: &str) -> bool {
    url.strip_prefix(PREFIX).is_some_and(|path| {
        !path.is_empty()
            && path.len() <= 300
            && path
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "-_./%?=&".contains(c))
    })
}

#[tauri::command]
pub fn soundcloud_open(url: String) -> Result<(), String> {
    if !is_soundcloud_url(&url) {
        return Err("Kein SoundCloud-Link".into());
    }
    crate::twitch::open_url(&url);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::is_soundcloud_url;

    #[test]
    fn accepts_profiles_and_tracks_only_on_soundcloud() {
        assert!(is_soundcloud_url("https://soundcloud.com/forss"));
        assert!(is_soundcloud_url(
            "https://soundcloud.com/forss/flickermood"
        ));
        assert!(is_soundcloud_url(
            "https://soundcloud.com/dj-name/mix-2026?in=dj-name/sets/best"
        ));
        assert!(!is_soundcloud_url("https://soundcloud.com/"));
        assert!(!is_soundcloud_url("http://soundcloud.com/forss"));
        assert!(!is_soundcloud_url(
            "https://soundcloud.com.evil.example/forss"
        ));
        assert!(!is_soundcloud_url(
            "https://evil.example/soundcloud.com/forss"
        ));
        assert!(!is_soundcloud_url("https://soundcloud.com/forss\" --flag"));
        assert!(!is_soundcloud_url("https://soundcloud.com/a b"));
        assert!(!is_soundcloud_url("file:///C:/Windows/notepad.exe"));
    }
}
