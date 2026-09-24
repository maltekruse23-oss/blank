//! OAuth Device Code Grant Flow for a public client (no client secret) and token storage in
//! the Windows Credential Manager.
//! https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};

use super::{check, Result, TwitchError};

const DEVICE_URL: &str = "https://id.twitch.tv/oauth2/device";
const TOKEN_URL: &str = "https://id.twitch.tv/oauth2/token";
const VALIDATE_URL: &str = "https://id.twitch.tv/oauth2/validate";
const REVOKE_URL: &str = "https://id.twitch.tv/oauth2/revoke";
const CREDENTIAL_SERVICE: &str = "blank.twitch";
const CREDENTIAL_USER: &str = "oauth";
// Only public stream data is read, so no scopes are requested.
const SCOPES: &str = "";

#[derive(Clone, Serialize, Deserialize)]
pub struct Token {
    pub access_token: String,
    pub refresh_token: String,
}

#[derive(Deserialize)]
pub struct Device {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

pub enum Poll {
    Pending,
    SlowDown,
    Expired,
    Done(Token),
}

#[derive(Deserialize)]
struct ErrorBody {
    message: String,
}

#[derive(Deserialize)]
struct Validation {
    login: Option<String>,
}

fn unknown(error: impl ToString) -> TwitchError {
    TwitchError::Unknown {
        message: error.to_string(),
    }
}

pub async fn start(http: &Client, client_id: &str) -> Result<Device> {
    let response = http
        .post(DEVICE_URL)
        .form(&[("client_id", client_id), ("scopes", SCOPES)])
        .send()
        .await?;
    Ok(check(response).await?.json().await?)
}

pub async fn poll(http: &Client, client_id: &str, device_code: &str) -> Result<Poll> {
    let response = http
        .post(TOKEN_URL)
        .form(&[
            ("client_id", client_id),
            ("scopes", SCOPES),
            ("device_code", device_code),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await?;
    if response.status().is_success() {
        return Ok(Poll::Done(response.json().await?));
    }
    let message = response
        .json::<ErrorBody>()
        .await
        .map(|body| body.message)
        .unwrap_or_default();
    match message.as_str() {
        "authorization_pending" => Ok(Poll::Pending),
        "slow_down" => Ok(Poll::SlowDown),
        "invalid device code" => Ok(Poll::Expired),
        _ => Err(TwitchError::Unknown { message }),
    }
}

/// Public-client refresh tokens are single-use; the returned token replaces the stored one.
pub async fn refresh(http: &Client, client_id: &str, refresh_token: &str) -> Result<Token> {
    let response = http
        .post(TOKEN_URL)
        .form(&[
            ("client_id", client_id),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
        ])
        .send()
        .await?;
    if matches!(
        response.status(),
        StatusCode::BAD_REQUEST | StatusCode::UNAUTHORIZED
    ) {
        return Err(TwitchError::Unauthenticated);
    }
    Ok(check(response).await?.json().await?)
}

/// Returns the account login for a valid token, or None when Twitch rejects the token.
pub async fn validate(http: &Client, access_token: &str) -> Result<Option<String>> {
    let response = http
        .get(VALIDATE_URL)
        .header("Authorization", format!("OAuth {access_token}"))
        .send()
        .await?;
    if response.status() == StatusCode::UNAUTHORIZED {
        return Ok(None);
    }
    let validation: Validation = check(response).await?.json().await?;
    Ok(Some(validation.login.unwrap_or_default()))
}

pub async fn revoke(http: &Client, client_id: &str, access_token: &str) {
    // Best effort: the local token is deleted regardless of the outcome.
    let _ = http
        .post(REVOKE_URL)
        .form(&[("client_id", client_id), ("token", access_token)])
        .send()
        .await;
}

fn credential() -> Result<keyring::Entry> {
    keyring::Entry::new(CREDENTIAL_SERVICE, CREDENTIAL_USER).map_err(unknown)
}

pub fn load_token() -> Option<Token> {
    serde_json::from_str(&credential().ok()?.get_password().ok()?).ok()
}

pub fn store_token(token: &Token) -> Result<()> {
    let json = serde_json::to_string(token).map_err(unknown)?;
    credential()?.set_password(&json).map_err(unknown)
}

pub fn delete_token() {
    if let Ok(entry) = credential() {
        let _ = entry.delete_credential();
    }
}

/// Opens Twitch's activation page in the default browser. Any other URL is ignored.
pub fn open_in_browser(url: &str) {
    if url.starts_with("https://www.twitch.tv/activate") {
        super::open_url(url);
    }
}
