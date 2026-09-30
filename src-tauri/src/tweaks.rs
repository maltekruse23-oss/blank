//! "Gaming-Optimierung" (Settings): a few Windows settings of the current user that help games.
//! Every change is reversible: before blank. changes a setting for the first time, its previous
//! value is written to tweaks.json in the app's config folder, and "Rückgängig" writes exactly
//! that value back (a value that did not exist is deleted again). Only per-user settings — the
//! registry under HKCU and SystemParametersInfo — so no administrator rights, no restart and
//! nothing that weakens security (no Defender, updates, services or CPU mitigations). Changes run
//! only on click; the file is not part of the settings export because it belongs to this PC.

use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// A setting as it was before blank. changed it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum Saved {
    /// Registry value that did not exist.
    Absent,
    Dword {
        value: u32,
    },
    /// One entry of a "name=value;" list; `None`: not in the list.
    Entry {
        value: Option<String>,
    },
    /// Mouse thresholds and acceleration (SPI_GETMOUSE).
    Mouse {
        value: [i32; 3],
    },
    /// Whether an accessibility shortcut was switched on.
    Shortcut {
        on: bool,
    },
}

#[derive(Clone, Copy)]
enum Access {
    /// Sticky keys: Shift five times.
    Sticky,
    /// Filter keys: right Shift held for eight seconds.
    Filter,
    /// Toggle keys: Num Lock held for five seconds.
    Toggle,
}

enum Part {
    /// DWORD under HKCU. `absent`: what Windows assumes while the value does not exist (`None`:
    /// not known, counts as not optimised).
    Dword {
        key: &'static str,
        name: &'static str,
        target: u32,
        absent: Option<u32>,
    },
    /// Entry of a "name=value;" string under HKCU.
    Entry {
        key: &'static str,
        name: &'static str,
        entry: &'static str,
        target: &'static str,
    },
    /// "Zeigerbeschleunigung verbessern" (enhance pointer precision).
    Mouse,
    /// Keyboard shortcut of an accessibility feature (the feature itself stays as it is).
    Shortcut(Access),
}

struct Tweak {
    id: &'static str,
    name: &'static str,
    detail: &'static str,
    /// State text when optimised and when not ("an", "aus").
    optimal: &'static str,
    other: &'static str,
    parts: &'static [Part],
}

const GAME_DVR: &str = r"Software\Microsoft\Windows\CurrentVersion\GameDVR";

const TWEAKS: &[Tweak] = &[
    Tweak {
        id: "game-mode",
        name: "Spielmodus an",
        detail: "Windows gibt dem laufenden Spiel Vorrang",
        optimal: "an",
        other: "aus",
        parts: &[Part::Dword {
            key: r"Software\Microsoft\GameBar",
            name: "AutoGameModeEnabled",
            target: 1,
            absent: Some(1),
        }],
    },
    Tweak {
        id: "windowed-games",
        name: "Optimierung für Spiele im Fenster",
        detail: "Weniger Verzögerung in randlosen DirectX-10/11-Spielen",
        optimal: "an",
        other: "aus",
        parts: &[Part::Entry {
            key: r"Software\Microsoft\DirectX\UserGpuPreferences",
            name: "DirectXUserGlobalSettings",
            entry: "SwapEffectUpgradeEnable",
            target: "1",
        }],
    },
    Tweak {
        id: "game-captures",
        name: "Game-Bar-Aufnahmen aus",
        detail: "Nimmt nichts im Hintergrund auf; Win+Alt+R nimmt dann auch nicht auf",
        optimal: "aus",
        other: "an",
        parts: &[
            Part::Dword {
                key: GAME_DVR,
                name: "AppCaptureEnabled",
                target: 0,
                absent: None,
            },
            Part::Dword {
                key: GAME_DVR,
                name: "HistoricalCaptureEnabled",
                target: 0,
                absent: Some(0),
            },
            Part::Dword {
                key: r"System\GameConfigStore",
                name: "GameDVR_Enabled",
                target: 0,
                absent: None,
            },
        ],
    },
    Tweak {
        id: "mouse-acceleration",
        name: "Mausbeschleunigung aus",
        detail: "Der Zeiger folgt der Maus 1:1 („Zeigerbeschleunigung verbessern“)",
        optimal: "aus",
        other: "an",
        parts: &[Part::Mouse],
    },
    Tweak {
        id: "accessibility-shortcuts",
        name: "Bedienungshilfe-Kürzel aus",
        detail: "Keine Einrastfunktion-Abfrage mitten im Spiel (5× Umschalt und ähnliche)",
        optimal: "aus",
        other: "an",
        parts: &[
            Part::Shortcut(Access::Sticky),
            Part::Shortcut(Access::Filter),
            Part::Shortcut(Access::Toggle),
        ],
    },
];

impl Part {
    fn read(&self) -> Result<Saved, String> {
        Ok(match *self {
            Part::Dword { key, name, .. } => match reg::dword(key, name)? {
                Some(value) => Saved::Dword { value },
                None => Saved::Absent,
            },
            Part::Entry {
                key, name, entry, ..
            } => Saved::Entry {
                value: reg::text(key, name)?.and_then(|list| get_entry(&list, entry)),
            },
            Part::Mouse => Saved::Mouse {
                value: sys::mouse(None)?,
            },
            Part::Shortcut(access) => Saved::Shortcut {
                on: sys::shortcut(access, None)?,
            },
        })
    }

    fn is_optimal(&self, saved: &Saved) -> bool {
        match (self, saved) {
            (Part::Dword { target, absent, .. }, Saved::Absent) => *absent == Some(*target),
            (Part::Dword { target, .. }, Saved::Dword { value }) => value == target,
            (Part::Entry { target, .. }, Saved::Entry { value }) => {
                value.as_deref() == Some(*target)
            }
            (Part::Mouse, Saved::Mouse { value }) => value[2] == 0,
            (Part::Shortcut(_), Saved::Shortcut { on }) => !on,
            _ => false,
        }
    }

    fn optimise(&self) -> Result<(), String> {
        match *self {
            Part::Dword {
                key, name, target, ..
            } => reg::set_dword(key, name, target),
            Part::Entry {
                key,
                name,
                entry,
                target,
            } => write_entry(key, name, entry, Some(target)),
            Part::Mouse => sys::mouse(Some([0, 0, 0])).map(drop),
            Part::Shortcut(access) => sys::shortcut(access, Some(false)).map(drop),
        }
    }

    fn restore(&self, saved: &Saved) -> Result<(), String> {
        match (self, saved) {
            (Part::Dword { key, name, .. }, Saved::Absent) => reg::delete(key, name),
            (Part::Dword { key, name, .. }, Saved::Dword { value }) => {
                reg::set_dword(key, name, *value)
            }
            (
                Part::Entry {
                    key, name, entry, ..
                },
                Saved::Entry { value },
            ) => write_entry(key, name, entry, value.as_deref()),
            (Part::Mouse, Saved::Mouse { value }) => sys::mouse(Some(*value)).map(drop),
            (Part::Shortcut(access), Saved::Shortcut { on }) => {
                sys::shortcut(*access, Some(*on)).map(drop)
            }
            _ => Err("Die Sicherung passt nicht zu dieser Einstellung.".into()),
        }
    }
}

/// Value of `entry` in a "name=value;" list.
fn get_entry(list: &str, entry: &str) -> Option<String> {
    list.split(';')
        .filter_map(|pair| pair.split_once('='))
        .find(|(name, _)| name.trim() == entry)
        .map(|(_, value)| value.trim().to_string())
}

/// The list with `entry` set to `value` (or removed); other entries stay in their order.
fn set_entry(list: &str, entry: &str, value: Option<&str>) -> String {
    let mut out = String::new();
    let mut written = false;
    for pair in list.split(';').map(str::trim).filter(|p| !p.is_empty()) {
        if pair
            .split_once('=')
            .is_some_and(|(name, _)| name.trim() == entry)
        {
            if let (Some(value), false) = (value, written) {
                out.push_str(&format!("{entry}={value};"));
                written = true;
            }
        } else {
            out.push_str(pair);
            out.push(';');
        }
    }
    if let (Some(value), false) = (value, written) {
        out.push_str(&format!("{entry}={value};"));
    }
    out
}

fn write_entry(key: &str, name: &str, entry: &str, value: Option<&str>) -> Result<(), String> {
    let list = set_entry(&reg::text(key, name)?.unwrap_or_default(), entry, value);
    if list.is_empty() {
        reg::delete(key, name)
    } else {
        reg::set_text(key, name, &list)
    }
}

impl Tweak {
    fn read(&self) -> Result<Vec<Saved>, String> {
        self.parts.iter().map(Part::read).collect()
    }

    fn is_optimal(&self, values: &[Saved]) -> bool {
        self.parts.len() == values.len()
            && self.parts.iter().zip(values).all(|(p, v)| p.is_optimal(v))
    }

    fn optimise(&self) -> Result<(), String> {
        self.parts.iter().try_for_each(Part::optimise)
    }

    fn restore(&self, values: &[Saved]) -> Result<(), String> {
        if values.len() != self.parts.len() {
            return Err("Die Sicherung passt nicht zu dieser Einstellung.".into());
        }
        self.parts
            .iter()
            .zip(values)
            .try_for_each(|(part, saved)| part.restore(saved))
    }

    /// "an", "aus" or "Windows-Standard" (only unset values differ from the optimum).
    fn describe(&self, values: &[Saved]) -> String {
        let mut open = self
            .parts
            .iter()
            .zip(values)
            .filter(|(part, saved)| !part.is_optimal(saved))
            .map(|(_, saved)| saved)
            .peekable();
        if open.peek().is_none() {
            self.optimal.into()
        } else if open.all(|s| matches!(s, Saved::Absent | Saved::Entry { value: None })) {
            "Windows-Standard".into()
        } else {
            self.other.into()
        }
    }
}

fn find(id: &str) -> Result<&'static Tweak, String> {
    TWEAKS
        .iter()
        .find(|t| t.id == id)
        .ok_or_else(|| format!("Unbekannte Einstellung: {id}"))
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Backup {
    /// Changes by blank., per tweak id. Unknown ids (from other versions) are kept as they are.
    changes: BTreeMap<String, Change>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Change {
    /// Milliseconds since 1970.
    changed_at: u64,
    before: Vec<Saved>,
}

const DAMAGED: &str =
    "Die Sicherung der Gaming-Optimierung ist beschädigt – es wird nichts geändert.";

fn load(path: &Path) -> Result<Backup, String> {
    match std::fs::read_to_string(path) {
        Ok(text) => serde_json::from_str(&text).map_err(|_| DAMAGED.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Backup::default()),
        Err(error) => Err(format!("Sicherung nicht lesbar: {error}")),
    }
}

/// Writes to a temporary file first, so a crash never leaves a half-written backup.
fn save(path: &Path, backup: &Backup) -> Result<(), String> {
    let failed = |error: std::io::Error| format!("Sicherung nicht speicherbar: {error}");
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(failed)?;
    }
    let json = serde_json::to_string_pretty(backup).map_err(|e| e.to_string())?;
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, json).map_err(failed)?;
    std::fs::rename(&temp, path).map_err(failed)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TweakInfo {
    id: &'static str,
    name: &'static str,
    detail: &'static str,
    /// "open": can be applied; "done": Windows already has this setting; "changed": changed by
    /// blank. and reversible.
    state: &'static str,
    now: String,
    before: Option<String>,
    changed_at: Option<u64>,
    /// Changed by blank., but set differently since (by Windows or by hand).
    drifted: bool,
}

fn info(backup: &Backup) -> Result<Vec<TweakInfo>, String> {
    TWEAKS
        .iter()
        .map(|tweak| {
            let values = tweak.read()?;
            let optimal = tweak.is_optimal(&values);
            let change = backup.changes.get(tweak.id);
            Ok(TweakInfo {
                id: tweak.id,
                name: tweak.name,
                detail: tweak.detail,
                state: match (change, optimal) {
                    (Some(_), _) => "changed",
                    (None, true) => "done",
                    (None, false) => "open",
                },
                now: tweak.describe(&values),
                before: change.map(|c| tweak.describe(&c.before)),
                changed_at: change.map(|c| c.changed_at),
                drifted: change.is_some() && !optimal,
            })
        })
        .collect()
}

fn apply(path: &Path, ids: &[String]) -> Result<Vec<TweakInfo>, String> {
    let mut backup = load(path)?;
    for id in ids {
        let tweak = find(id)?;
        let values = tweak.read()?;
        let fresh = !backup.changes.contains_key(tweak.id);
        if fresh {
            if tweak.is_optimal(&values) {
                continue;
            }
            let changed_at = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_or(0, |d| d.as_millis() as u64);
            backup.changes.insert(
                tweak.id.into(),
                Change {
                    changed_at,
                    before: values.clone(),
                },
            );
            // The previous values are on disk before anything changes.
            save(path, &backup)?;
        }
        if let Err(error) = tweak.optimise() {
            if fresh {
                // Half done: put back what was changed and forget the entry.
                let _ = tweak.restore(&values);
                backup.changes.remove(tweak.id);
                save(path, &backup)?;
            }
            return Err(format!("{}: {error}", tweak.name));
        }
    }
    info(&backup)
}

fn restore(path: &Path, ids: &[String]) -> Result<Vec<TweakInfo>, String> {
    let mut backup = load(path)?;
    for id in ids {
        let tweak = find(id)?;
        let Some(change) = backup.changes.get(tweak.id) else {
            continue;
        };
        // On an error the entry stays, so "Rückgängig" can simply be tried again.
        tweak
            .restore(&change.before)
            .map_err(|error| format!("{}: {error}", tweak.name))?;
        backup.changes.remove(tweak.id);
        save(path, &backup)?;
    }
    info(&backup)
}

/// Location of the backup (tweaks.json next to twitch.json).
pub struct TweakFile(PathBuf);

impl TweakFile {
    pub fn new(app: &AppHandle) -> tauri::Result<Self> {
        Ok(Self(app.path().app_config_dir()?.join("tweaks.json")))
    }
}

/// One change at a time; runs off the main thread (a setting change is announced to all windows).
async fn run<T: Send + 'static>(
    job: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    static LOCK: Mutex<()> = Mutex::new(());
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
        job()
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn tweaks_status(file: tauri::State<'_, TweakFile>) -> Result<Vec<TweakInfo>, String> {
    let path = file.0.clone();
    run(move || info(&load(&path)?)).await
}

/// Applies the given tweaks; returns the new state of all.
#[tauri::command]
pub async fn tweaks_apply(
    file: tauri::State<'_, TweakFile>,
    ids: Vec<String>,
) -> Result<Vec<TweakInfo>, String> {
    let path = file.0.clone();
    run(move || apply(&path, &ids)).await
}

/// Writes back the saved values of the given tweaks; returns the new state of all.
#[tauri::command]
pub async fn tweaks_restore(
    file: tauri::State<'_, TweakFile>,
    ids: Vec<String>,
) -> Result<Vec<TweakInfo>, String> {
    let path = file.0.clone();
    run(move || restore(&path, &ids)).await
}

/// Registry values under HKEY_CURRENT_USER.
mod reg {
    use windows_sys::Win32::{
        Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS},
        System::Registry::{
            RegDeleteKeyValueW, RegGetValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_DWORD,
            REG_SZ, RRF_RT_REG_DWORD, RRF_RT_REG_SZ,
        },
    };

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(Some(0)).collect()
    }

    fn failed(code: u32) -> String {
        format!("Windows-Registry nicht verfügbar (Fehler {code})")
    }

    /// Raw data, or `None` if the value (or its key) does not exist.
    fn read(key: &str, name: &str, flags: u32) -> Result<Option<Vec<u8>>, String> {
        let (key, name) = (wide(key), wide(name));
        let mut size = 0u32;
        // SAFETY: null data pointer asks for the size only; strings are null-terminated.
        let code = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                key.as_ptr(),
                name.as_ptr(),
                flags,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                &mut size,
            )
        };
        if code == ERROR_FILE_NOT_FOUND {
            return Ok(None);
        }
        if code != ERROR_SUCCESS {
            return Err(failed(code));
        }
        let mut data = vec![0u8; size as usize];
        // SAFETY: data has `size` bytes, as reported by the call above.
        let code = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                key.as_ptr(),
                name.as_ptr(),
                flags,
                std::ptr::null_mut(),
                data.as_mut_ptr().cast(),
                &mut size,
            )
        };
        match code {
            ERROR_SUCCESS => {
                data.truncate(size as usize);
                Ok(Some(data))
            }
            ERROR_FILE_NOT_FOUND => Ok(None),
            _ => Err(failed(code)),
        }
    }

    fn write(key: &str, name: &str, kind: u32, data: &[u8]) -> Result<(), String> {
        let (key, name) = (wide(key), wide(name));
        // SAFETY: strings are null-terminated; data/size describe a valid buffer. Creates the key
        // if it does not exist.
        let code = unsafe {
            RegSetKeyValueW(
                HKEY_CURRENT_USER,
                key.as_ptr(),
                name.as_ptr(),
                kind,
                data.as_ptr().cast(),
                data.len() as u32,
            )
        };
        if code == ERROR_SUCCESS {
            Ok(())
        } else {
            Err(failed(code))
        }
    }

    pub fn dword(key: &str, name: &str) -> Result<Option<u32>, String> {
        Ok(read(key, name, RRF_RT_REG_DWORD)?.and_then(|d| {
            d.get(..4)
                .map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        }))
    }

    pub fn text(key: &str, name: &str) -> Result<Option<String>, String> {
        Ok(read(key, name, RRF_RT_REG_SZ)?.map(|data| {
            let units: Vec<u16> = data
                .as_chunks::<2>()
                .0
                .iter()
                .map(|b| u16::from_le_bytes(*b))
                .take_while(|c| *c != 0)
                .collect();
            String::from_utf16_lossy(&units)
        }))
    }

    pub fn set_dword(key: &str, name: &str, value: u32) -> Result<(), String> {
        write(key, name, REG_DWORD, &value.to_le_bytes())
    }

    pub fn set_text(key: &str, name: &str, value: &str) -> Result<(), String> {
        let data: Vec<u8> = wide(value).iter().flat_map(|c| c.to_le_bytes()).collect();
        write(key, name, REG_SZ, &data)
    }

    pub fn delete(key: &str, name: &str) -> Result<(), String> {
        let (key, name) = (wide(key), wide(name));
        // SAFETY: both strings are null-terminated.
        match unsafe { RegDeleteKeyValueW(HKEY_CURRENT_USER, key.as_ptr(), name.as_ptr()) } {
            ERROR_SUCCESS | ERROR_FILE_NOT_FOUND => Ok(()),
            code => Err(failed(code)),
        }
    }
}

/// Settings behind SystemParametersInfo: they take effect at once and are stored for the user.
mod sys {
    use super::Access;
    use std::ffi::c_void;
    use windows_sys::Win32::UI::{
        Accessibility::{FILTERKEYS, SKF_HOTKEYACTIVE, STICKYKEYS, TOGGLEKEYS},
        WindowsAndMessaging::{
            SystemParametersInfoW, FKF_HOTKEYACTIVE, SPIF_SENDCHANGE, SPIF_UPDATEINIFILE,
            SPI_GETFILTERKEYS, SPI_GETMOUSE, SPI_GETSTICKYKEYS, SPI_GETTOGGLEKEYS,
            SPI_SETFILTERKEYS, SPI_SETMOUSE, SPI_SETSTICKYKEYS, SPI_SETTOGGLEKEYS,
            SYSTEM_PARAMETERS_INFO_ACTION, TKF_HOTKEYACTIVE,
        },
    };

    fn spi(
        action: SYSTEM_PARAMETERS_INFO_ACTION,
        size: u32,
        data: *mut c_void,
        store: bool,
    ) -> Result<(), String> {
        let flags = if store {
            SPIF_UPDATEINIFILE | SPIF_SENDCHANGE
        } else {
            0
        };
        // SAFETY: callers pass a buffer of the type and size the action expects.
        if unsafe { SystemParametersInfoW(action, size, data, flags) } == 0 {
            Err(format!(
                "Windows hat die Einstellung abgelehnt ({})",
                std::io::Error::last_os_error()
            ))
        } else {
            Ok(())
        }
    }

    /// Current thresholds and acceleration; sets `next` if given and different.
    pub fn mouse(next: Option<[i32; 3]>) -> Result<[i32; 3], String> {
        let mut value = [0i32; 3];
        spi(SPI_GETMOUSE, 0, value.as_mut_ptr().cast(), false)?;
        if let Some(mut next) = next.filter(|n| *n != value) {
            spi(SPI_SETMOUSE, 0, next.as_mut_ptr().cast(), true)?;
        }
        Ok(value)
    }

    /// Whether the shortcut is on; switches it to `next` if given and different.
    pub fn shortcut(access: Access, next: Option<bool>) -> Result<bool, String> {
        macro_rules! toggle {
            ($ty:ty, $get:expr, $set:expr, $bit:expr) => {{
                let size = std::mem::size_of::<$ty>() as u32;
                // SAFETY: all-zero is a valid value of these plain C structs.
                let mut value: $ty = unsafe { std::mem::zeroed() };
                value.cbSize = size;
                spi($get, size, (&mut value as *mut $ty).cast(), false)?;
                let on = value.dwFlags & $bit != 0;
                if let Some(next) = next.filter(|n| *n != on) {
                    if next {
                        value.dwFlags |= $bit;
                    } else {
                        value.dwFlags &= !$bit;
                    }
                    spi($set, size, (&mut value as *mut $ty).cast(), true)?;
                }
                Ok(on)
            }};
        }
        match access {
            Access::Sticky => toggle!(
                STICKYKEYS,
                SPI_GETSTICKYKEYS,
                SPI_SETSTICKYKEYS,
                SKF_HOTKEYACTIVE
            ),
            Access::Filter => toggle!(
                FILTERKEYS,
                SPI_GETFILTERKEYS,
                SPI_SETFILTERKEYS,
                FKF_HOTKEYACTIVE
            ),
            Access::Toggle => toggle!(
                TOGGLEKEYS,
                SPI_GETTOGGLEKEYS,
                SPI_SETTOGGLEKEYS,
                TKF_HOTKEYACTIVE
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entries_change_only_their_own_part() {
        let list = "VRROptimizeEnable=0;SwapEffectUpgradeEnable=0;";
        assert_eq!(
            get_entry(list, "SwapEffectUpgradeEnable").as_deref(),
            Some("0")
        );
        assert_eq!(
            set_entry(list, "SwapEffectUpgradeEnable", Some("1")),
            "VRROptimizeEnable=0;SwapEffectUpgradeEnable=1;"
        );
        assert_eq!(
            set_entry(list, "SwapEffectUpgradeEnable", None),
            "VRROptimizeEnable=0;"
        );
        assert_eq!(
            set_entry("", "SwapEffectUpgradeEnable", Some("1")),
            "SwapEffectUpgradeEnable=1;"
        );
        assert_eq!(
            set_entry(
                "SwapEffectUpgradeEnable=1;",
                "SwapEffectUpgradeEnable",
                None
            ),
            ""
        );
        assert_eq!(get_entry("", "SwapEffectUpgradeEnable"), None);
    }

    #[test]
    fn states_are_described_plainly() {
        let tweak = find("game-captures").unwrap();
        let on = [
            Saved::Dword { value: 1 },
            Saved::Absent,
            Saved::Dword { value: 1 },
        ];
        let off = [
            Saved::Dword { value: 0 },
            Saved::Absent,
            Saved::Dword { value: 0 },
        ];
        let unset = [Saved::Absent, Saved::Absent, Saved::Absent];
        assert!(!tweak.is_optimal(&on));
        assert!(tweak.is_optimal(&off));
        assert_eq!(tweak.describe(&on), "an");
        assert_eq!(tweak.describe(&off), "aus");
        assert_eq!(tweak.describe(&unset), "Windows-Standard");
        // Game mode is on while its value does not exist.
        assert!(find("game-mode").unwrap().is_optimal(&[Saved::Absent]));
        assert!(!tweak.is_optimal(&off[..2]));
    }

    #[test]
    fn tweaks_are_unique_and_complete() {
        for (n, tweak) in TWEAKS.iter().enumerate() {
            assert!(!tweak.parts.is_empty(), "{}", tweak.id);
            assert!(
                TWEAKS[n + 1..].iter().all(|t| t.id != tweak.id),
                "{}",
                tweak.id
            );
        }
    }

    #[test]
    fn backup_survives_a_round_trip() {
        let mut backup = Backup::default();
        backup.changes.insert(
            "mouse-acceleration".into(),
            Change {
                changed_at: 1,
                before: vec![Saved::Mouse { value: [6, 10, 1] }],
            },
        );
        backup.changes.insert(
            "windowed-games".into(),
            Change {
                changed_at: 2,
                before: vec![Saved::Entry { value: None }],
            },
        );
        let json = serde_json::to_string(&backup).unwrap();
        let back: Backup = serde_json::from_str(&json).unwrap();
        assert_eq!(
            back.changes["mouse-acceleration"].before,
            backup.changes["mouse-acceleration"].before
        );
        assert_eq!(
            back.changes["windowed-games"].before,
            vec![Saved::Entry { value: None }]
        );
        // A damaged file is reported, never replaced.
        let dir = std::env::temp_dir().join(format!("blank-tweaks-test-{}", std::process::id()));
        let path = dir.join("tweaks.json");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(&path, "{ kaputt").unwrap();
        assert_eq!(load(&path).err().as_deref(), Some(DAMAGED));
        save(&path, &backup).unwrap();
        assert_eq!(load(&path).unwrap().changes.len(), 2);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    /// Writes and restores values under a throw-away test key (HKCU\Software\blank-test), never
    /// under a real Windows setting.
    #[test]
    fn registry_values_come_back_exactly() {
        const KEY: &str = r"Software\blank-test\tweaks";
        let dword = Part::Dword {
            key: KEY,
            name: "Flag",
            target: 0,
            absent: None,
        };
        let entry = Part::Entry {
            key: KEY,
            name: "List",
            entry: "Upgrade",
            target: "1",
        };
        // Value did not exist: optimise, then restore deletes it again.
        let before = dword.read().unwrap();
        assert_eq!(before, Saved::Absent);
        dword.optimise().unwrap();
        assert_eq!(dword.read().unwrap(), Saved::Dword { value: 0 });
        dword.restore(&before).unwrap();
        assert_eq!(dword.read().unwrap(), Saved::Absent);
        // Existing value: comes back unchanged.
        reg::set_dword(KEY, "Flag", 7).unwrap();
        let before = dword.read().unwrap();
        dword.optimise().unwrap();
        dword.restore(&before).unwrap();
        assert_eq!(reg::dword(KEY, "Flag").unwrap(), Some(7));
        // Entry list: other entries stay, the value disappears when it was ours alone.
        reg::set_text(KEY, "List", "Other=2;").unwrap();
        let before = entry.read().unwrap();
        entry.optimise().unwrap();
        assert_eq!(
            reg::text(KEY, "List").unwrap().as_deref(),
            Some("Other=2;Upgrade=1;")
        );
        entry.restore(&before).unwrap();
        assert_eq!(reg::text(KEY, "List").unwrap().as_deref(), Some("Other=2;"));
        reg::delete(KEY, "List").unwrap();
        let before = entry.read().unwrap();
        entry.optimise().unwrap();
        entry.restore(&before).unwrap();
        assert_eq!(reg::text(KEY, "List").unwrap(), None);
        reg::delete(KEY, "Flag").unwrap();
        // Remove the test keys.
        let wide = |t: &str| t.encode_utf16().chain(Some(0)).collect::<Vec<u16>>();
        // SAFETY: null-terminated key names.
        unsafe {
            windows_sys::Win32::System::Registry::RegDeleteKeyW(
                windows_sys::Win32::System::Registry::HKEY_CURRENT_USER,
                wide(KEY).as_ptr(),
            );
            windows_sys::Win32::System::Registry::RegDeleteKeyW(
                windows_sys::Win32::System::Registry::HKEY_CURRENT_USER,
                wide(r"Software\blank-test").as_ptr(),
            );
        }
    }
}
