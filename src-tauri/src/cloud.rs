//! Online backup without an account (page Apps): the web content encrypts the whole settings
//! file with a key that exists only in the move code (AES-GCM, see src/adapters/cloud.ts); this
//! module only stores and fetches that encrypted text at two free paste services, dpaste.com
//! (kept 365 days) and, if it is unreachable, catbox.moe (kept permanently). No other address is
//! ever contacted; the services never see readable settings.

use std::time::Duration;

use serde::Serialize;
use tauri::State;

use crate::{settings_file, twitch::Twitch};

/// Largest encrypted text accepted (the settings file itself is at most 512 KB).
const MAX_BYTES: usize = 1024 * 1024;
const DPASTE: char = 'D';
const CATBOX: char = 'C';

#[derive(Serialize, Debug, PartialEq)]
pub struct Stored {
    /// 'D' dpaste.com, 'C' catbox.moe.
    provider: char,
    /// The service's id of the text, as it has to appear in the move code.
    id: String,
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(concat!(
            "blank/",
            env!("CARGO_PKG_VERSION"),
            " (+https://github.com/maltekruse23-oss/blank)"
        ))
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(60))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())
}

/// Id of a stored text from the service's answer (its address), if it is one of its own.
fn id_from(provider: char, answer: &str) -> Option<String> {
    let answer = answer.trim();
    let id = match provider {
        DPASTE => answer.strip_prefix("https://dpaste.com/")?,
        CATBOX => answer
            .strip_prefix("https://files.catbox.moe/")?
            .strip_suffix(".txt")?,
        _ => return None,
    };
    valid_id(provider, id).then(|| id.to_uppercase())
}

/// Ids as the services hand them out; nothing else ever becomes part of an address.
fn valid_id(provider: char, id: &str) -> bool {
    let plain = |len: std::ops::RangeInclusive<usize>| {
        len.contains(&id.len()) && id.chars().all(|c| c.is_ascii_alphanumeric())
    };
    match provider {
        DPASTE => plain(6..=16),
        CATBOX => plain(6..=6),
        _ => false,
    }
}

async fn upload_dpaste(client: &reqwest::Client, text: &str) -> Result<String, String> {
    let response = client
        .post("https://dpaste.com/api/v2/")
        .form(&[
            ("content", text),
            ("expiry_days", "365"),
            ("syntax", "text"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("dpaste {}", response.status().as_u16()));
    }
    let answer = response.text().await.map_err(|e| e.to_string())?;
    id_from(DPASTE, &answer).ok_or_else(|| "dpaste: unerwartete Antwort".into())
}

async fn upload_catbox(client: &reqwest::Client, text: &str) -> Result<String, String> {
    const BOUNDARY: &str = "----blank-umzug-7f3k92qd";
    let body = format!(
        "--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"reqtype\"\r\n\r\nfileupload\r\n\
         --{BOUNDARY}\r\nContent-Disposition: form-data; name=\"fileToUpload\"; filename=\"blank.txt\"\r\n\
         Content-Type: text/plain\r\n\r\n{text}\r\n--{BOUNDARY}--\r\n"
    );
    let response = client
        .post("https://catbox.moe/user/api.php")
        .header(
            "Content-Type",
            format!("multipart/form-data; boundary={BOUNDARY}"),
        )
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("catbox {}", response.status().as_u16()));
    }
    let answer = response.text().await.map_err(|e| e.to_string())?;
    id_from(CATBOX, &answer).ok_or_else(|| "catbox: unerwartete Antwort".into())
}

/// The whole settings file (the web content's part plus the Twitch channel selection), to be
/// encrypted by the web content before it goes online.
#[tauri::command]
pub async fn settings_complete(
    twitch: State<'_, Twitch>,
    content: String,
) -> Result<String, String> {
    settings_file::complete(&twitch, &content).await
}

/// Stores the encrypted text: dpaste.com, or catbox.moe when dpaste fails.
#[tauri::command]
pub async fn cloud_upload(text: String) -> Result<Stored, String> {
    let plain_text = text
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, ':' | '+' | '/' | '='));
    if text.is_empty() || text.len() > MAX_BYTES || !plain_text {
        return Err("Ungültige Daten".into());
    }
    let client = client()?;
    match upload_dpaste(&client, &text).await {
        Ok(id) => Ok(Stored {
            provider: DPASTE,
            id,
        }),
        Err(_) => upload_catbox(&client, &text)
            .await
            .map(|id| Stored {
                provider: CATBOX,
                id,
            })
            .map_err(|_| "Online-Speicher gerade nicht erreichbar – bitte gleich nochmal.".into()),
    }
}

/// Fetches an encrypted text by the provider and id from a move code.
#[tauri::command]
pub async fn cloud_download(provider: char, id: String) -> Result<String, String> {
    if !valid_id(provider, &id) {
        return Err("Code stimmt nicht.".into());
    }
    let url = match provider {
        DPASTE => format!("https://dpaste.com/{}.txt", id.to_uppercase()),
        CATBOX => format!("https://files.catbox.moe/{}.txt", id.to_lowercase()),
        _ => return Err("Code stimmt nicht.".into()),
    };
    let response = client()?.get(url).send().await.map_err(|_| {
        "Online-Speicher gerade nicht erreichbar – bitte gleich nochmal.".to_string()
    })?;
    match response.status().as_u16() {
        200 => {}
        404 | 410 => return Err("Zu diesem Code gibt es keine Daten (mehr).".into()),
        code => return Err(format!("Online-Speicher antwortet mit {code}.")),
    }
    let text = response.text().await.map_err(|e| e.to_string())?;
    if text.len() > MAX_BYTES {
        return Err("Daten zu groß.".into());
    }
    Ok(text.trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_services_own_ids_are_taken() {
        assert_eq!(
            id_from(DPASTE, "https://dpaste.com/9EAJDWRAG\n"),
            Some("9EAJDWRAG".into())
        );
        assert_eq!(
            id_from(CATBOX, "https://files.catbox.moe/7db9kc.txt"),
            Some("7DB9KC".into())
        );
        assert_eq!(id_from(DPASTE, "https://evil.com/9EAJDWRAG"), None);
        assert_eq!(id_from(DPASTE, "https://dpaste.com/../x"), None);
        assert_eq!(id_from(CATBOX, "https://files.catbox.moe/7db9kc.exe"), None);
        assert_eq!(
            id_from(CATBOX, "https://files.catbox.moe/toolong1.txt"),
            None
        );
        assert!(valid_id(DPASTE, "9EAJDWRAG"));
        assert!(!valid_id(DPASTE, "9EAJ/WRAG"));
        assert!(!valid_id('X', "9EAJDWRAG"));
    }
}
