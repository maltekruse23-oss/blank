//! Reset helper (page "Apps"): which programs of a fixed list are installed, and installing chosen
//! ones on click — without any package manager, straight from the makers. Each installer comes from
//! the maker's official link over https only, from the maker's own servers, and runs only when
//! Windows confirms a valid digital signature of exactly the expected maker; otherwise it is
//! deleted unopened. Nothing runs in the background.

use std::{
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Exe,
    Msi,
}

/// Where the newest installer comes from.
#[derive(Clone, Copy)]
enum Source {
    /// The maker's fixed "latest version" link.
    Link(&'static str),
    /// The maker's own update feed (electron-updater `latest.yml` in this folder): it names the
    /// newest installer and its SHA-512, which is checked in addition to the signature.
    Feed(&'static str),
}

/// A program blank. can install. Links, servers and signers were checked on 26.09.2026: link
/// followed to the file, signature read from it (e.g. "Discord Inc.").
struct Program {
    id: &'static str,
    name: &'static str,
    /// Installed names in lowercase; one matches the name itself or its start when a
    /// non-alphanumeric character follows ("roblox player for …"). The longest match wins, so
    /// "discord canary" is not taken for "discord".
    names: &'static [&'static str],
    source: Source,
    /// Servers the file may finally come from (the host itself or its subdomains).
    hosts: &'static [&'static str],
    /// Exact name in the installer's signing certificate.
    signer: &'static str,
    kind: Kind,
    /// Arguments for an installation without questions; `None`: the installer shows its window.
    /// MSI packages always run with a progress bar only (`/passive`).
    silent: Option<&'static [&'static str]>,
}

const RIOT: &[&str] = &["riotcdn.net"];
const DISCORD: &[&str] = &["discord.com", "discordapp.net"];
const OPERA: &[&str] = &["opera.com"];

const PROGRAMS: &[Program] = &[
    Program { id: "discord", name: "Discord", names: &["discord"], source: Source::Link("https://discord.com/api/downloads/distributions/app/installers/latest?channel=stable&platform=win&arch=x64"), hosts: DISCORD, signer: "Discord Inc.", kind: Kind::Exe, silent: Some(&["-s"]) },
    Program { id: "discord-canary", name: "Discord Canary", names: &["discord canary"], source: Source::Link("https://discord.com/api/downloads/distributions/app/installers/latest?channel=canary&platform=win&arch=x64"), hosts: DISCORD, signer: "Discord Inc.", kind: Kind::Exe, silent: Some(&["-s"]) },
    Program { id: "discord-ptb", name: "Discord PTB", names: &["discord ptb"], source: Source::Link("https://discord.com/api/downloads/distributions/app/installers/latest?channel=ptb&platform=win&arch=x64"), hosts: DISCORD, signer: "Discord Inc.", kind: Kind::Exe, silent: Some(&["-s"]) },
    Program { id: "chrome", name: "Google Chrome", names: &["google chrome"], source: Source::Link("https://dl.google.com/dl/chrome/install/googlechromestandaloneenterprise64.msi"), hosts: &["dl.google.com"], signer: "Google LLC", kind: Kind::Msi, silent: Some(&[]) },
    Program { id: "brave", name: "Brave", names: &["brave"], source: Source::Link("https://laptop-updates.brave.com/latest/winx64"), hosts: &["brave.com"], signer: "Brave Software, Inc.", kind: Kind::Exe, silent: Some(&["/silent", "/install"]) },
    Program { id: "firefox", name: "Firefox", names: &["mozilla firefox"], source: Source::Link("https://download.mozilla.org/?product=firefox-latest-ssl&os=win64&lang=de"), hosts: &["mozilla.org", "mozilla.net"], signer: "Mozilla Corporation", kind: Kind::Exe, silent: Some(&["/S"]) },
    Program { id: "opera-gx", name: "Opera GX", names: &["opera gx"], source: Source::Link("https://net.geo.opera.com/opera_gx/stable/windows"), hosts: OPERA, signer: "Opera Norway AS", kind: Kind::Exe, silent: Some(&["--silent", "--allusers=0", "--launchopera=0", "--setdefaultbrowser=0"]) },
    Program { id: "opera", name: "Opera", names: &["opera stable"], source: Source::Link("https://net.geo.opera.com/opera/stable/windows"), hosts: OPERA, signer: "Opera Norway AS", kind: Kind::Exe, silent: Some(&["--silent", "--allusers=0", "--launchopera=0", "--setdefaultbrowser=0"]) },
    Program { id: "steam", name: "Steam", names: &["steam"], source: Source::Link("https://cdn.akamai.steamstatic.com/client/installer/SteamSetup.exe"), hosts: &["steamstatic.com"], signer: "Valve Corp.", kind: Kind::Exe, silent: Some(&["/S"]) },
    Program { id: "epic", name: "Epic Games Launcher", names: &["epic games launcher"], source: Source::Link("https://launcher-public-service-prod06.ol.epicgames.com/launcher/api/installer/download/EpicGamesLauncherInstaller.msi"), hosts: &["epicgames.com", "epicgames-download1.akamaized.net"], signer: "Epic Games Inc.", kind: Kind::Msi, silent: Some(&[]) },
    Program { id: "ea", name: "EA app", names: &["ea app"], source: Source::Link("https://origin-a.akamaihd.net/EA-Desktop-Client-Download/installer-releases/EAappInstaller.exe"), hosts: &["origin-a.akamaihd.net"], signer: "Electronic Arts, Inc.", kind: Kind::Exe, silent: None },
    Program { id: "ubisoft", name: "Ubisoft Connect", names: &["ubisoft connect"], source: Source::Link("https://static3.cdn.ubi.com/orbit/launcher_installer/UbisoftConnectInstaller.exe"), hosts: &["static3.cdn.ubi.com"], signer: "UBISOFT ENTERTAINMENT INC.", kind: Kind::Exe, silent: Some(&["/S"]) },
    Program { id: "battlenet", name: "Battle.net", names: &["battle.net"], source: Source::Link("https://www.battle.net/download/getInstallerForGame?os=win&gameProgram=BATTLENET_APP&version=Live"), hosts: &["battle.net"], signer: "Blizzard Entertainment, Inc.", kind: Kind::Exe, silent: None },
    Program { id: "gog", name: "GOG Galaxy", names: &["gog galaxy"], source: Source::Link("https://webinstallers.gog-statics.com/download/GOG_Galaxy_2.0.exe"), hosts: &["gog-statics.com"], signer: "GOG sp. z o.o", kind: Kind::Exe, silent: None },
    // The Riot Client comes with the game; TFT is part of League of Legends.
    Program { id: "league-euw", name: "League of Legends (EU West)", names: &["league of legends", "teamfight tactics"], source: Source::Link("https://lol.secure.dyn.riotcdn.net/channels/public/x/installer/current/live.euw.exe"), hosts: RIOT, signer: "Riot Games, Inc.", kind: Kind::Exe, silent: Some(&["--skip-to-install"]) },
    Program { id: "valorant-eu", name: "VALORANT (Europa)", names: &["valorant"], source: Source::Link("https://valorant.secure.dyn.riotcdn.net/channels/public/x/installer/current/live.live.eu.exe"), hosts: RIOT, signer: "Riot Games, Inc.", kind: Kind::Exe, silent: Some(&["--skip-to-install"]) },
    // Installs by itself without questions.
    Program { id: "roblox", name: "Roblox", names: &["roblox player"], source: Source::Link("https://www.roblox.com/download/client?os=win"), hosts: &["roblox.com", "rbxcdn.com"], signer: "Roblox Corporation", kind: Kind::Exe, silent: Some(&[]) },
    // Mojang belongs to Microsoft: the maker itself signs.
    Program { id: "minecraft", name: "Minecraft Launcher", names: &["minecraft launcher"], source: Source::Link("https://launcher.mojang.com/download/MinecraftInstaller.msi"), hosts: &["mojang.com"], signer: "Microsoft Corporation", kind: Kind::Msi, silent: Some(&[]) },
    Program { id: "spotify", name: "Spotify", names: &["spotify"], source: Source::Link("https://download.scdn.co/SpotifySetup.exe"), hosts: &["scdn.co"], signer: "Spotify AB", kind: Kind::Exe, silent: Some(&["/silent"]) },
    Program { id: "focusrite-control2", name: "Focusrite Control 2", names: &["focusrite control 2"], source: Source::Link("https://releases.focusrite.com/com.focusrite.focusrite-control/latest/Focusrite-Control-2.exe"), hosts: &["focusrite.com"], signer: "FOCUSRITE AUDIO ENGINEERING LIMITED", kind: Kind::Exe, silent: Some(&["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"]) },
    Program { id: "dpm", name: "DPM", names: &["dpm"], source: Source::Feed("https://app.dpm.lol/releases/nsis/win32/x64"), hosts: &["app.dpm.lol"], signer: "DPMLOL SAS", kind: Kind::Exe, silent: Some(&["/S"]) },
    Program { id: "ghub", name: "Logitech G HUB", names: &["logitech g hub"], source: Source::Link("https://download01.logi.com/web/ftp/pub/techsupport/gaming/lghub_installer.exe"), hosts: &["logi.com"], signer: "Logitech Inc", kind: Kind::Exe, silent: None },
    // SteelSeries belongs to GN: the parent company signs.
    Program { id: "steelseries-gg", name: "SteelSeries GG", names: &["steelseries gg"], source: Source::Link("https://steelseries.com/gg/downloads/gg/latest/windows"), hosts: &["steelseries.com", "steelseriescdn.com"], signer: "GN Hearing A/S", kind: Kind::Exe, silent: None },
    Program { id: "razer-synapse4", name: "Razer Synapse 4", names: &["razer synapse 4", "razer synapse"], source: Source::Link("https://rzr.to/synapse-4-pc-download"), hosts: &["razerzone.com"], signer: "Razer USA Ltd.", kind: Kind::Exe, silent: None },
    // Blitz is made by Swift Media Entertainment.
    Program { id: "blitz", name: "Blitz", names: &["blitz"], source: Source::Link("https://blitz.gg/download/win"), hosts: &["blitz.gg"], signer: "Swift Media Entertainment, Inc.", kind: Kind::Exe, silent: Some(&["/S"]) },
    Program { id: "medal", name: "Medal", names: &["medal"], source: Source::Link("https://install.medal.tv/"), hosts: &["medal.tv"], signer: "Medal B.V.", kind: Kind::Exe, silent: None },
    Program { id: "faceit", name: "FACEIT", names: &["faceit"], source: Source::Link("https://faceit-client.faceit-cdn.net/release/FACEIT-setup-latest.exe"), hosts: &["faceit-cdn.net"], signer: "ESL Gaming GmbH", kind: Kind::Exe, silent: None },
    Program { id: "telegram", name: "Telegram", names: &["telegram desktop"], source: Source::Link("https://telegram.org/dl/desktop/win64"), hosts: &["telegram.org"], signer: "Telegram FZ-LLC", kind: Kind::Exe, silent: Some(&["/VERYSILENT", "/NORESTART"]) },
    Program { id: "zoom", name: "Zoom", names: &["zoom", "zoom workplace"], source: Source::Link("https://zoom.us/client/latest/ZoomInstallerFull.exe?archType=x64"), hosts: &["zoom.us"], signer: "Zoom Communications, Inc.", kind: Kind::Exe, silent: None },
    // Parsec belongs to Unity.
    Program { id: "parsec", name: "Parsec", names: &["parsec"], source: Source::Link("https://builds.parsec.app/package/parsec-windows.exe"), hosts: &["parsec.app"], signer: "Unity Technologies SF", kind: Kind::Exe, silent: None },
    Program { id: "mullvad", name: "Mullvad VPN", names: &["mullvad vpn"], source: Source::Link("https://mullvad.net/download/app/exe/latest"), hosts: &["mullvad.net"], signer: "Mullvad VPN AB", kind: Kind::Exe, silent: Some(&["/S"]) },
];

/// Installed parts that come back by themselves (drivers, runtimes, parts of other programs).
const HIDDEN_NAMES: &[&str] = &[
    "microsoft visual c++",
    "microsoft .net",
    "microsoft windows desktop runtime",
    "microsoft visual studio installer",
    "windows software development kit",
    "windows sdk",
    "vs_",
    "nvidia graphics driver",
    "nvidia hd audio driver",
    "nvidia physx",
    "nvidia frameview",
    "amd install manager",
    "riot client",
    "riot vanguard",
    "focusrite audio drivers",
    "copilot",
];

/// Largest installer accepted (the biggest on the list is about 260 MB).
const MAX_BYTES: u64 = 1024 * 1024 * 1024;

/// Whether `name` (lowercase) is `pattern` or starts with it followed by a non-alphanumeric char.
fn name_matches(name: &str, pattern: &str) -> bool {
    name.strip_prefix(pattern)
        .is_some_and(|rest| rest.chars().next().is_none_or(|c| !c.is_alphanumeric()))
}

fn normalize(name: &str) -> String {
    name.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// The program on the list for an installed name (longest match).
fn program_for(name: &str) -> Option<&'static Program> {
    let name = normalize(name);
    PROGRAMS
        .iter()
        .flat_map(|p| p.names.iter().map(move |n| (p, n)))
        .filter(|(_, n)| name_matches(&name, n))
        .max_by_key(|(_, n)| n.len())
        .map(|(p, _)| p)
}

fn hidden_name(name: &str) -> bool {
    let name = normalize(name);
    HIDDEN_NAMES.iter().any(|p| name.starts_with(p))
}

/// The server a download finally came from is one of the maker's (itself or a subdomain).
fn host_allowed(host: &str, allowed: &[&str]) -> bool {
    let host = host.to_ascii_lowercase();
    allowed
        .iter()
        .any(|a| host == *a || host.strip_suffix(a).is_some_and(|rest| rest.ends_with('.')))
}

/// Signer names compared without case and extra spaces ("GOG  sp. z o.o" in the certificate).
fn same_signer(found: &str, expected: &str) -> bool {
    normalize(found) == normalize(expected)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Offer {
    id: &'static str,
    name: &'static str,
    /// Installs without questions; otherwise its own installer window opens.
    silent: bool,
}

impl From<&'static Program> for Offer {
    fn from(p: &'static Program) -> Self {
        Self {
            id: p.id,
            name: p.name,
            silent: p.silent.is_some(),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppScan {
    /// Programs of the list installed on this PC.
    installed: Vec<Offer>,
    /// Programs of the list not installed here (can be taken along anyway).
    available: Vec<Offer>,
    /// Installed programs blank. cannot install (games from launchers, Store apps, …).
    manual: Vec<String>,
}

/// Display names of installed programs from the Windows program list (all users and this one).
fn installed_names() -> Vec<String> {
    use windows_sys::Win32::System::Registry::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    const UNINSTALL: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall";
    const UNINSTALL_32: &str = r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall";
    let mut names = Vec::new();
    for (root, path) in [
        (HKEY_LOCAL_MACHINE, UNINSTALL),
        (HKEY_LOCAL_MACHINE, UNINSTALL_32),
        (HKEY_CURRENT_USER, UNINSTALL),
    ] {
        let _ = registry::each_subkey(root, path, KEY_READ, |key| {
            let skip = registry::dword(key, "SystemComponent") == Some(1)
                || registry::text(key, "ParentKeyName").is_some()
                || registry::text(key, "ReleaseType")
                    .is_some_and(|t| t.contains("Update") || t.contains("Hotfix"));
            if let Some(name) = registry::text(key, "DisplayName").filter(|_| !skip) {
                let name = name.trim().to_string();
                if !name.is_empty() {
                    names.push(name);
                }
            }
        });
    }
    names
}

fn scan() -> AppScan {
    let mut installed: Vec<&'static Program> = Vec::new();
    let mut manual: Vec<String> = Vec::new();
    for name in installed_names() {
        match program_for(&name) {
            Some(p) if !installed.iter().any(|i| i.id == p.id) => installed.push(p),
            Some(_) => {}
            None if !hidden_name(&name)
                && !manual.iter().any(|m| m.eq_ignore_ascii_case(&name)) =>
            {
                manual.push(name)
            }
            None => {}
        }
    }
    let mut available: Vec<&'static Program> = PROGRAMS
        .iter()
        .filter(|p| !installed.iter().any(|i| i.id == p.id))
        .collect();
    installed.sort_by_key(|p| p.name.to_lowercase());
    available.sort_by_key(|p| p.name.to_lowercase());
    manual.sort_by_key(|m| m.to_lowercase());
    AppScan {
        installed: installed.into_iter().map(Offer::from).collect(),
        available: available.into_iter().map(Offer::from).collect(),
        manual,
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Progress {
    id: &'static str,
    /// "downloading" (detail: percent), "verifying", "installing" (detail: "window" when its own
    /// installer window is open), "done" (detail: note), "failed" (detail: reason) or "skipped".
    state: &'static str,
    detail: Option<String>,
}

fn emit(app: &AppHandle, id: &'static str, state: &'static str, detail: Option<String>) {
    let _ = app.emit("apps-progress", Progress { id, state, detail });
}

static INSTALLING: AtomicBool = AtomicBool::new(false);
static CANCEL: AtomicBool = AtomicBool::new(false);
const CANCELLED: &str = "Abgebrochen";

/// Clears the "installing" flag however the run ends.
struct Running;
impl Drop for Running {
    fn drop(&mut self) {
        INSTALLING.store(false, Ordering::SeqCst);
    }
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(concat!("blank/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.url().scheme() != "https" {
                attempt.error("Umleitung ohne https")
            } else if attempt.previous().len() >= 10 {
                attempt.stop()
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|e| e.to_string())
}

/// File name and SHA-512 (base64) of the newest installer in an electron-updater `latest.yml`.
/// Only a plain `.exe` name in the feed's own folder is accepted.
fn parse_feed(text: &str) -> Option<(String, String)> {
    let value = |key: &str| {
        text.lines()
            .find_map(|line| line.strip_prefix(key))
            .map(|v| v.trim().trim_matches(['\'', '"']).to_string())
    };
    let (path, sha512) = (value("path:")?, value("sha512:")?);
    let plain = path.ends_with(".exe")
        && !path.starts_with('.')
        && path
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'));
    (plain && !sha512.is_empty()).then_some((path, sha512))
}

/// Answer from one of the maker's servers, over https.
async fn fetch(
    client: &reqwest::Client,
    program: &Program,
    url: &str,
) -> Result<reqwest::Response, String> {
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|_| "Hersteller nicht erreichbar".to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Hersteller antwortet mit {}",
            response.status().as_u16()
        ));
    }
    let host = response.url().host_str().unwrap_or_default().to_string();
    if response.url().scheme() != "https" || !host_allowed(&host, program.hosts) {
        return Err(format!("Unerwarteter Server: {host}"));
    }
    Ok(response)
}

/// Link of the newest installer and, from a feed, its SHA-512.
async fn resolve(
    client: &reqwest::Client,
    program: &Program,
) -> Result<(String, Option<String>), String> {
    match program.source {
        Source::Link(url) => Ok((url.to_string(), None)),
        Source::Feed(base) => {
            let text = fetch(client, program, &format!("{base}/latest.yml"))
                .await?
                .text()
                .await
                .map_err(|_| "Update-Dienst des Herstellers unlesbar".to_string())?;
            let (file, sha512) =
                parse_feed(&text).ok_or("Update-Dienst des Herstellers unlesbar")?;
            Ok((format!("{base}/{file}"), Some(sha512)))
        }
    }
}

/// SHA-512 of a file as base64 (the form electron-updater feeds use).
fn sha512_base64(path: &Path) -> Result<String, String> {
    use windows_sys::Win32::Security::Cryptography::{BCryptHash, BCRYPT_SHA512_ALG_HANDLE};
    let data = std::fs::read(path).map_err(|e| e.to_string())?;
    let mut out = [0u8; 64];
    // SAFETY: the algorithm pseudo-handle needs no setup; input and output buffers are valid for
    // the given lengths.
    let status = unsafe {
        BCryptHash(
            BCRYPT_SHA512_ALG_HANDLE,
            std::ptr::null(),
            0,
            data.as_ptr(),
            u32::try_from(data.len()).map_err(|e| e.to_string())?,
            out.as_mut_ptr(),
            64,
        )
    };
    if status < 0 {
        return Err("Prüfsumme nicht berechenbar".into());
    }
    Ok(base64(&out))
}

/// Standard base64 with padding (also for popout covers, media.rs).
pub(crate) fn base64(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let n = chunk
            .iter()
            .enumerate()
            .fold(0u32, |n, (i, b)| n | (*b as u32) << (16 - 8 * i));
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(ALPHABET[(n >> (18 - 6 * i) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

/// Downloads the newest installer to `path` (and checks a feed's SHA-512); `progress` gets the
/// percentage in steps of 5.
async fn download(
    client: &reqwest::Client,
    program: &'static Program,
    path: &Path,
    progress: impl Fn(u64),
) -> Result<(), String> {
    let (url, sha512) = resolve(client, program).await?;
    let mut response = fetch(client, program, &url).await?;
    let total = response.content_length().filter(|&n| n > 0);
    if total.is_some_and(|n| n > MAX_BYTES) {
        return Err("Datei zu groß".into());
    }
    let mut file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    let (mut done, mut shown) = (0u64, 0u64);
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Download abgebrochen".to_string())?
    {
        if CANCEL.load(Ordering::SeqCst) {
            return Err(CANCELLED.into());
        }
        done += chunk.len() as u64;
        if done > MAX_BYTES {
            return Err("Datei zu groß".into());
        }
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        if let Some(total) = total {
            let percent = done * 100 / total;
            if percent >= shown + 5 {
                shown = percent - percent % 5;
                progress(shown);
            }
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    drop(file);
    if let Some(expected) = sha512 {
        if sha512_base64(path)? != expected {
            return Err("Prüfsumme passt nicht zum Update-Dienst".into());
        }
    }
    Ok(())
}

/// Signer of a file whose signature Windows accepts (valid, trusted, not revoked).
fn signer_of(path: &Path) -> Result<String, String> {
    use windows_sys::Win32::Security::{
        Cryptography::{CertGetNameStringW, CERT_NAME_SIMPLE_DISPLAY_TYPE},
        WinTrust::{
            WTHelperGetProvSignerFromChain, WTHelperProvDataFromStateData, WinVerifyTrust,
            WINTRUST_ACTION_GENERIC_VERIFY_V2, WINTRUST_DATA, WINTRUST_FILE_INFO, WTD_CHOICE_FILE,
            WTD_REVOKE_WHOLECHAIN, WTD_STATEACTION_CLOSE, WTD_STATEACTION_VERIFY, WTD_UI_NONE,
        },
    };
    let wide: Vec<u16> = path
        .as_os_str()
        .to_string_lossy()
        .encode_utf16()
        .chain(Some(0))
        .collect();
    // SAFETY: plain C structs, all-zero is valid; sizes and pointers are set below.
    let mut file: WINTRUST_FILE_INFO = unsafe { std::mem::zeroed() };
    file.cbStruct = std::mem::size_of::<WINTRUST_FILE_INFO>() as u32;
    file.pcwszFilePath = wide.as_ptr();
    // SAFETY: as above.
    let mut data: WINTRUST_DATA = unsafe { std::mem::zeroed() };
    data.cbStruct = std::mem::size_of::<WINTRUST_DATA>() as u32;
    data.dwUIChoice = WTD_UI_NONE;
    data.fdwRevocationChecks = WTD_REVOKE_WHOLECHAIN;
    data.dwUnionChoice = WTD_CHOICE_FILE;
    data.Anonymous.pFile = &mut file;
    data.dwStateAction = WTD_STATEACTION_VERIFY;
    let mut action = WINTRUST_ACTION_GENERIC_VERIFY_V2;
    // SAFETY: data and file stay alive for both calls; the state is closed below.
    let status = unsafe {
        WinVerifyTrust(
            std::ptr::null_mut(),
            &mut action,
            (&mut data as *mut WINTRUST_DATA).cast(),
        )
    };
    let mut name = None;
    if status == 0 {
        // SAFETY: the state data belongs to the verification above and is still open.
        unsafe {
            let provider = WTHelperProvDataFromStateData(data.hWVTStateData);
            let signer = WTHelperGetProvSignerFromChain(provider, 0, 0, 0);
            if !signer.is_null() && (*signer).csCertChain > 0 {
                let cert = (*(*signer).pasCertChain).pCert;
                let mut buffer = [0u16; 256];
                let len = CertGetNameStringW(
                    cert,
                    CERT_NAME_SIMPLE_DISPLAY_TYPE,
                    0,
                    std::ptr::null(),
                    buffer.as_mut_ptr(),
                    buffer.len() as u32,
                );
                if len > 1 {
                    name = Some(String::from_utf16_lossy(&buffer[..len as usize - 1]));
                }
            }
        }
    }
    data.dwStateAction = WTD_STATEACTION_CLOSE;
    // SAFETY: closes the state opened above.
    unsafe {
        WinVerifyTrust(
            std::ptr::null_mut(),
            &mut action,
            (&mut data as *mut WINTRUST_DATA).cast(),
        )
    };
    if status != 0 {
        return Err(format!("Signatur ungültig (0x{:08X})", status as u32));
    }
    name.ok_or_else(|| "Signatur ohne Namen".into())
}

/// Starts the installer (Windows asks for administrator rights if it needs them) and waits for it.
fn run(program: &Program, path: &Path) -> Result<u32, String> {
    use windows_sys::Win32::{
        Foundation::{CloseHandle, ERROR_CANCELLED},
        System::Threading::{GetExitCodeProcess, WaitForSingleObject, INFINITE},
        UI::{
            Shell::{
                ShellExecuteExW, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOASYNC, SEE_MASK_NOCLOSEPROCESS,
                SHELLEXECUTEINFOW,
            },
            WindowsAndMessaging::SW_SHOWNORMAL,
        },
    };
    let wide = |t: &str| t.encode_utf16().chain(Some(0)).collect::<Vec<u16>>();
    let file = path.to_string_lossy().to_string();
    let (target, arguments) = match program.kind {
        Kind::Msi => (
            "msiexec.exe".to_string(),
            format!("/i \"{file}\" /passive /norestart"),
        ),
        Kind::Exe => (file, program.silent.unwrap_or(&[]).join(" ")),
    };
    let (verb, target, arguments) = (wide("open"), wide(&target), wide(&arguments));
    // SAFETY: plain C struct, all-zero is valid.
    let mut info: SHELLEXECUTEINFOW = unsafe { std::mem::zeroed() };
    info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
    info.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC | SEE_MASK_FLAG_NO_UI;
    info.lpVerb = verb.as_ptr();
    info.lpFile = target.as_ptr();
    info.lpParameters = arguments.as_ptr();
    info.nShow = SW_SHOWNORMAL;
    // SAFETY: the strings outlive the call.
    if unsafe { ShellExecuteExW(&mut info) } == 0 {
        let error = std::io::Error::last_os_error();
        return Err(if error.raw_os_error() == Some(ERROR_CANCELLED as i32) {
            "Abgebrochen – ohne Administratorrechte geht es nicht".into()
        } else {
            format!("Installer startet nicht ({error})")
        });
    }
    if info.hProcess.is_null() {
        return Ok(0);
    }
    let mut code = 0u32;
    // SAFETY: hProcess was returned by ShellExecuteExW and is closed here.
    unsafe {
        WaitForSingleObject(info.hProcess, INFINITE);
        GetExitCodeProcess(info.hProcess, &mut code);
        CloseHandle(info.hProcess);
    }
    Ok(code)
}

/// Result of an installer's exit code (MSI codes are common among installers too).
fn outcome(code: u32) -> Result<Option<String>, String> {
    match code {
        0 => Ok(None),
        3010 | 1641 => Ok(Some("Neustart nötig".into())),
        1602 => Err(CANCELLED.into()),
        1618 => Err("Eine andere Installation läuft gerade".into()),
        other => Err(format!("Installer meldete Fehler {other}")),
    }
}

async fn install_one(
    app: &AppHandle,
    client: &reqwest::Client,
    dir: &Path,
    program: &'static Program,
) -> Result<Option<String>, String> {
    emit(app, program.id, "downloading", Some("0".into()));
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let path: PathBuf = dir.join(format!(
        "{}.{}",
        program.id,
        if program.kind == Kind::Msi {
            "msi"
        } else {
            "exe"
        }
    ));
    let result = async {
        download(client, program, &path, |percent| {
            emit(app, program.id, "downloading", Some(percent.to_string()))
        })
        .await?;
        emit(app, program.id, "verifying", None);
        let file = path.clone();
        let signer = tauri::async_runtime::spawn_blocking(move || signer_of(&file))
            .await
            .map_err(|e| e.to_string())??;
        if !same_signer(&signer, program.signer) {
            return Err(format!("Falsche Signatur: {signer}"));
        }
        let window = program.silent.is_none();
        emit(
            app,
            program.id,
            "installing",
            window.then(|| "window".into()),
        );
        let file = path.clone();
        let code = tauri::async_runtime::spawn_blocking(move || run(program, &file))
            .await
            .map_err(|e| e.to_string())??;
        outcome(code)
    }
    .await;
    let _ = std::fs::remove_file(&path);
    result
}

/// Scans the Windows program list (instant, read-only).
#[tauri::command]
pub async fn apps_scan() -> Result<AppScan, String> {
    tauri::async_runtime::spawn_blocking(scan)
        .await
        .map_err(|e| e.to_string())
}

/// Installs the chosen programs of the list one after another (progress as `apps-progress`
/// events); resolves when all are done or cancelled.
#[tauri::command]
pub async fn apps_install(app: AppHandle, ids: Vec<String>) -> Result<(), String> {
    let programs = ids
        .iter()
        .map(|id| {
            PROGRAMS
                .iter()
                .find(|p| p.id == id)
                .ok_or_else(|| format!("Unbekanntes Programm: {id}"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    if INSTALLING.swap(true, Ordering::SeqCst) {
        return Err("Es wird schon installiert.".into());
    }
    let _running = Running;
    CANCEL.store(false, Ordering::SeqCst);
    let client = client()?;
    let dir = std::env::temp_dir().join("blank-install");
    for program in programs {
        if CANCEL.load(Ordering::SeqCst) {
            emit(&app, program.id, "skipped", None);
            continue;
        }
        match install_one(&app, &client, &dir, program).await {
            Ok(note) => emit(&app, program.id, "done", note),
            Err(reason) if reason == CANCELLED => emit(&app, program.id, "skipped", None),
            Err(reason) => emit(&app, program.id, "failed", Some(reason)),
        }
    }
    let _ = std::fs::remove_dir(&dir);
    Ok(())
}

/// Stops after the running installer; a running download stops at once.
#[tauri::command]
pub fn apps_cancel() {
    CANCEL.store(true, Ordering::SeqCst);
}

/// Reading the Windows program list (read-only).
mod registry {
    use windows_sys::Win32::{
        Foundation::ERROR_SUCCESS,
        System::Registry::{
            RegCloseKey, RegEnumKeyExW, RegGetValueW, RegOpenKeyExW, HKEY, RRF_RT_REG_DWORD,
            RRF_RT_REG_SZ,
        },
    };

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(Some(0)).collect()
    }

    /// Calls `visit` with each subkey of `path` (opened for reading).
    pub fn each_subkey(
        root: HKEY,
        path: &str,
        access: u32,
        mut visit: impl FnMut(HKEY),
    ) -> Option<()> {
        let mut key: HKEY = std::ptr::null_mut();
        // SAFETY: path is null-terminated; key receives the opened handle.
        if unsafe { RegOpenKeyExW(root, wide(path).as_ptr(), 0, access, &mut key) } != ERROR_SUCCESS
        {
            return None;
        }
        let mut index = 0;
        loop {
            let mut name = [0u16; 256];
            let mut len = name.len() as u32;
            // SAFETY: name holds `len` UTF-16 units.
            let code = unsafe {
                RegEnumKeyExW(
                    key,
                    index,
                    name.as_mut_ptr(),
                    &mut len,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                )
            };
            if code != ERROR_SUCCESS {
                break;
            }
            index += 1;
            let mut sub: HKEY = std::ptr::null_mut();
            // SAFETY: `name` is null-terminated after `len` units (zero-initialised buffer).
            if unsafe { RegOpenKeyExW(key, name.as_ptr(), 0, access, &mut sub) } == ERROR_SUCCESS {
                visit(sub);
                // SAFETY: sub was opened above.
                unsafe { RegCloseKey(sub) };
            }
        }
        // SAFETY: key was opened above.
        unsafe { RegCloseKey(key) };
        Some(())
    }

    fn value(key: HKEY, name: &str, flags: u32) -> Option<Vec<u8>> {
        let name = wide(name);
        let mut size = 0u32;
        // SAFETY: size query with a null buffer.
        let code = unsafe {
            RegGetValueW(
                key,
                std::ptr::null(),
                name.as_ptr(),
                flags,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                &mut size,
            )
        };
        if code != ERROR_SUCCESS || size == 0 {
            return None;
        }
        let mut data = vec![0u8; size as usize];
        // SAFETY: data has `size` bytes.
        let code = unsafe {
            RegGetValueW(
                key,
                std::ptr::null(),
                name.as_ptr(),
                flags,
                std::ptr::null_mut(),
                data.as_mut_ptr().cast(),
                &mut size,
            )
        };
        (code == ERROR_SUCCESS).then(|| {
            data.truncate(size as usize);
            data
        })
    }

    pub fn text(key: HKEY, name: &str) -> Option<String> {
        let data = value(key, name, RRF_RT_REG_SZ)?;
        let units: Vec<u16> = data
            .as_chunks::<2>()
            .0
            .iter()
            .map(|b| u16::from_le_bytes(*b))
            .take_while(|c| *c != 0)
            .collect();
        Some(String::from_utf16_lossy(&units))
    }

    pub fn dword(key: HKEY, name: &str) -> Option<u32> {
        let data = value(key, name, RRF_RT_REG_DWORD)?;
        data.get(..4)
            .map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn installed_names_find_their_program() {
        let id = |name: &str| program_for(name).map(|p| p.id);
        assert_eq!(id("Discord"), Some("discord"));
        assert_eq!(id("Discord Canary"), Some("discord-canary"));
        assert_eq!(id("Roblox Player for someone"), Some("roblox"));
        assert_eq!(id("Teamfight Tactics"), Some("league-euw"));
        assert_eq!(id("SteelSeries GG 120.0.0"), Some("steelseries-gg"));
        // Word boundaries: no "Steam" in "Steamworks Tool".
        assert_eq!(id("Steamworks Tool"), None);
        assert_eq!(id("Apex Legends"), None);
    }

    #[test]
    fn list_is_complete_and_safe() {
        for (n, p) in PROGRAMS.iter().enumerate() {
            let (Source::Link(url) | Source::Feed(url)) = p.source;
            assert!(url.starts_with("https://"), "{}", p.id);
            assert!(!p.hosts.is_empty() && !p.names.is_empty(), "{}", p.id);
            assert!(!p.signer.is_empty(), "{}", p.id);
            // Ids travel in the settings file: lowercase letters, digits and "-" only.
            assert!(p
                .id
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-'));
            assert!(PROGRAMS[n + 1..].iter().all(|o| o.id != p.id), "{}", p.id);
        }
    }

    #[test]
    fn only_the_makers_servers_count() {
        assert!(host_allowed("stable.dl2.discordapp.net", DISCORD));
        assert!(host_allowed("discord.com", DISCORD));
        assert!(!host_allowed("evil-discordapp.net", DISCORD));
        assert!(!host_allowed("discordapp.net.evil.com", DISCORD));
        assert!(!host_allowed("example.com", DISCORD));
        assert!(same_signer("GOG  sp. z o.o", "GOG sp. z o.o"));
        assert!(!same_signer("Discord Inc", "Discord Inc."));
        assert!(hidden_name("NVIDIA Graphics Driver 617.14"));
        assert!(!hidden_name("Apex Legends"));
    }

    #[test]
    fn signatures_are_checked_by_windows() {
        // An unsigned file is refused.
        let dir = std::env::temp_dir().join(format!("blank-sign-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let unsigned = dir.join("unsigned.exe");
        std::fs::write(&unsigned, b"MZ not really a program").unwrap();
        assert!(signer_of(&unsigned).is_err());
        std::fs::remove_dir_all(&dir).unwrap();
        // A signed program that ships with WebView2 names its maker.
        let webview = Path::new(r"C:\Program Files (x86)\Microsoft\EdgeWebView\Application");
        let signed = std::fs::read_dir(webview)
            .into_iter()
            .flatten()
            .flatten()
            .map(|e| e.path().join("msedgewebview2.exe"))
            .find(|p| p.exists());
        if let Some(signed) = signed {
            assert_eq!(signer_of(&signed).as_deref(), Ok("Microsoft Corporation"));
        }
    }

    /// Real downloads (small installers only, about 35 MB): link, redirects, server check,
    /// signature and signer as on the list. Never runs an installer. `cargo test -- --ignored`.
    #[test]
    #[ignore = "lädt echte Installer aus dem Internet"]
    fn real_installers_come_from_their_makers() {
        let ids = [
            "spotify",
            "steam",
            "opera-gx",
            "roblox",
            "minecraft",
            "gog",
            "razer-synapse4",
            "medal",
            "battlenet",
        ];
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let client = client().unwrap();
        let dir = std::env::temp_dir().join(format!("blank-download-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        for id in ids {
            let program = PROGRAMS.iter().find(|p| p.id == id).unwrap();
            let path = dir.join(format!("{id}.bin"));
            runtime
                .block_on(download(&client, program, &path, |_| {}))
                .unwrap_or_else(|e| panic!("{id}: {e}"));
            let signer = signer_of(&path).unwrap_or_else(|e| panic!("{id}: {e}"));
            assert!(same_signer(&signer, program.signer), "{id}: {signer}");
            std::fs::remove_file(&path).unwrap();
        }
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn update_feeds_are_read_carefully() {
        let feed = "version: 1.9.1\nfiles:\n  - url: DPM-Setup-1.9.1.exe\n    sha512: AAA=\n    size: 1\npath: DPM-Setup-1.9.1.exe\nsha512: KgRa==\nreleaseDate: '2026-09-26'\n";
        assert_eq!(
            parse_feed(feed),
            Some(("DPM-Setup-1.9.1.exe".into(), "KgRa==".into()))
        );
        // Only a plain installer name in the feed's own folder.
        for path in [
            "../evil.exe",
            "sub/x.exe",
            "x.msi",
            ".hidden.exe",
            "a b.exe",
        ] {
            assert_eq!(
                parse_feed(&format!("path: {path}\nsha512: x\n")),
                None,
                "{path}"
            );
        }
        assert_eq!(parse_feed("path: x.exe\n"), None);
        // Known values: base64 and SHA-512 of "abc".
        assert_eq!(base64(b"Man"), "TWFu");
        assert_eq!(base64(b"Ma"), "TWE=");
        assert_eq!(base64(b"M"), "TQ==");
        let dir = std::env::temp_dir().join(format!("blank-sha-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("abc.txt");
        std::fs::write(&file, b"abc").unwrap();
        assert_eq!(
            sha512_base64(&file).unwrap(),
            "3a81oZNherrMQXNJriBBMRLm+k6JqX6iCp7u5ktV05ohkpkqJ0/BqDa6PCOj/uu9RU1EI2Q86A4qmslPpUyknw=="
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn exit_codes_are_read() {
        assert_eq!(outcome(0), Ok(None));
        assert_eq!(outcome(3010), Ok(Some("Neustart nötig".into())));
        assert_eq!(outcome(1602), Err(CANCELLED.into()));
        assert!(outcome(1).is_err());
    }
}
