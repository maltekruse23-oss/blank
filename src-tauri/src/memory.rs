//! RAM cleaning like Mem Reduct (PC page → "Bereinigen"): empties the working sets of all
//! processes, flushes the system file cache and the modified page list and purges the standby list
//! without priority. Windows only allows this with administrator rights, so the app starts itself
//! once elevated for it (`blank.exe --clean-memory`, Windows asks first); that process cleans and
//! exits at once. Nothing runs in the background and nothing is cleaned automatically.
use serde::Serialize;
use std::ffi::c_void;
use windows_sys::Win32::{
    Foundation::{CloseHandle, GetLastError, ERROR_CANCELLED, HANDLE, HWND, LUID, WAIT_OBJECT_0},
    Security::{
        AdjustTokenPrivileges, LookupPrivilegeValueW, LUID_AND_ATTRIBUTES, SE_INCREASE_QUOTA_NAME,
        SE_PRIVILEGE_ENABLED, SE_PROF_SINGLE_PROCESS_NAME, TOKEN_ADJUST_PRIVILEGES,
        TOKEN_PRIVILEGES, TOKEN_QUERY,
    },
    System::{
        Memory::SetSystemFileCacheSize,
        SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX},
        Threading::{GetCurrentProcess, GetExitCodeProcess, OpenProcessToken, WaitForSingleObject},
    },
    UI::{
        Shell::{ShellExecuteExW, SEE_MASK_NOASYNC, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW},
        WindowsAndMessaging::SW_HIDE,
    },
};

/// Command-line switch of the elevated cleaning process (checked in main.rs).
pub const CLEAN_ARG: &str = "--clean-memory";

// Steps that failed, as bits of the elevated process' exit code.
const PRIVILEGES: u32 = 1;
const WORKING_SETS: u32 = 2;
const FILE_CACHE: u32 = 4;
const MODIFIED_LIST: u32 = 8;
const STANDBY_LIST: u32 = 16;

// NtSetSystemInformation(SystemMemoryListInformation, SYSTEM_MEMORY_LIST_COMMAND), as used by
// Mem Reduct and Sysinternals RAMMap.
const SYSTEM_MEMORY_LIST_INFORMATION: u32 = 80;
const MEMORY_EMPTY_WORKING_SETS: u32 = 2;
const MEMORY_FLUSH_MODIFIED_LIST: u32 = 3;
const MEMORY_PURGE_LOW_PRIORITY_STANDBY_LIST: u32 = 5;

#[link(name = "ntdll")]
extern "system" {
    fn NtSetSystemInformation(class: u32, information: *const c_void, length: u32) -> i32;
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(Some(0)).collect()
}

/// Enables one privilege of the own (elevated) token.
fn enable(privilege: *const u16) -> bool {
    // SAFETY: own process token, valid out-pointers, one privilege in the list; the token handle
    // is closed again.
    unsafe {
        let mut token: HANDLE = std::ptr::null_mut();
        if OpenProcessToken(
            GetCurrentProcess(),
            TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY,
            &mut token,
        ) == 0
        {
            return false;
        }
        let mut luid = LUID {
            LowPart: 0,
            HighPart: 0,
        };
        let mut ok = LookupPrivilegeValueW(std::ptr::null(), privilege, &mut luid) != 0;
        if ok {
            let state = TOKEN_PRIVILEGES {
                PrivilegeCount: 1,
                Privileges: [LUID_AND_ATTRIBUTES {
                    Luid: luid,
                    Attributes: SE_PRIVILEGE_ENABLED,
                }],
            };
            let changed = AdjustTokenPrivileges(
                token,
                0,
                &state,
                0,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            );
            // Succeeds without the privilege, too; the last error tells (ERROR_NOT_ALL_ASSIGNED).
            ok = changed != 0 && GetLastError() == 0;
        }
        CloseHandle(token);
        ok
    }
}

fn memory_list(command: u32) -> bool {
    // SAFETY: the command is a 4-byte value, as the call expects.
    unsafe {
        NtSetSystemInformation(
            SYSTEM_MEMORY_LIST_INFORMATION,
            (&command as *const u32).cast(),
            4,
        ) >= 0
    }
}

/// Runs in the elevated process; returns its exit code (0 = every step worked).
pub fn clean_elevated() -> i32 {
    let mut failed = 0;
    // Both, even if the first fails.
    let profile = enable(SE_PROF_SINGLE_PROCESS_NAME);
    let quota = enable(SE_INCREASE_QUOTA_NAME);
    if !(profile && quota) {
        failed |= PRIVILEGES;
    }
    if !memory_list(MEMORY_EMPTY_WORKING_SETS) {
        failed |= WORKING_SETS;
    }
    // (SIZE_T)-1 for both limits flushes the system file cache.
    // SAFETY: plain call with documented values.
    if unsafe { SetSystemFileCacheSize(usize::MAX, usize::MAX, 0) } == 0 {
        failed |= FILE_CACHE;
    }
    if !memory_list(MEMORY_FLUSH_MODIFIED_LIST) {
        failed |= MODIFIED_LIST;
    }
    if !memory_list(MEMORY_PURGE_LOW_PRIORITY_STANDBY_LIST) {
        failed |= STANDBY_LIST;
    }
    failed as i32
}

/// Used memory as shown on the PC page: installed minus available.
fn used_memory() -> Option<u64> {
    let mut status = MEMORYSTATUSEX {
        dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
        ..unsafe { std::mem::zeroed() }
    };
    // SAFETY: dwLength is set; the struct is a valid out-pointer.
    (unsafe { GlobalMemoryStatusEx(&mut status) } != 0)
        .then(|| status.ullTotalPhys.saturating_sub(status.ullAvailPhys))
}

/// Starts the cleaning process elevated (Windows asks) and waits for it; its exit code.
fn run_elevated(owner: isize) -> Result<u32, String> {
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    let (verb, file, arguments) = (wide("runas"), wide(&exe.to_string_lossy()), wide(CLEAN_ARG));
    // SAFETY: zero is a valid SHELLEXECUTEINFOW; all strings outlive the call; the process handle
    // is closed after waiting.
    unsafe {
        let mut info: SHELLEXECUTEINFOW = std::mem::zeroed();
        info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
        info.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC;
        info.hwnd = owner as HWND;
        info.lpVerb = verb.as_ptr();
        info.lpFile = file.as_ptr();
        info.lpParameters = arguments.as_ptr();
        info.nShow = SW_HIDE;
        if ShellExecuteExW(&mut info) == 0 {
            return Err(if GetLastError() == ERROR_CANCELLED {
                "Abgebrochen – ohne Administratorrechte geht es nicht.".into()
            } else {
                "Bereinigen konnte nicht gestartet werden.".into()
            });
        }
        if info.hProcess.is_null() {
            return Err("Bereinigen konnte nicht gestartet werden.".into());
        }
        let finished = WaitForSingleObject(info.hProcess, 120_000) == WAIT_OBJECT_0;
        let mut code = u32::MAX;
        GetExitCodeProcess(info.hProcess, &mut code);
        CloseHandle(info.hProcess);
        if finished {
            Ok(code)
        } else {
            Err("Bereinigen dauert zu lange.".into())
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Cleaned {
    used_before: u64,
    used_after: u64,
    freed_bytes: u64,
    /// Some steps were not allowed.
    incomplete: bool,
}

#[tauri::command]
pub async fn clean_memory(window: tauri::WebviewWindow) -> Result<Cleaned, String> {
    // The prompt belongs to the app window, so it opens in front instead of in the taskbar.
    let owner = window.hwnd().map(|hwnd| hwnd.0 as isize).unwrap_or(0);
    tauri::async_runtime::spawn_blocking(move || {
        let before = used_memory().ok_or("Arbeitsspeicher nicht lesbar.")?;
        let code = run_elevated(owner)?;
        // Without the privileges nothing that matters worked (one step even runs without them).
        if code & PRIVILEGES != 0 && code & WORKING_SETS != 0 {
            return Err("Windows hat das Bereinigen abgelehnt.".to_string());
        }
        // Give Windows a moment to account for the freed pages.
        std::thread::sleep(std::time::Duration::from_millis(600));
        let after = used_memory().ok_or("Arbeitsspeicher nicht lesbar.")?;
        Ok(Cleaned {
            used_before: before,
            used_after: after,
            freed_bytes: before.saturating_sub(after),
            incomplete: code != 0,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}
