//! Programs: which may be closed, their windows and processes, and small Windows helpers.

use std::collections::{HashMap, HashSet};

use super::Sample;

/// Never offered for closing: Windows' own processes, shared helpers (WebView2 serves many apps).
const PROTECTED: &[&str] = &[
    "system",
    "registry",
    "memory compression",
    "secure system",
    "smss.exe",
    "csrss.exe",
    "wininit.exe",
    "winlogon.exe",
    "services.exe",
    "lsass.exe",
    "svchost.exe",
    "dwm.exe",
    "explorer.exe",
    "fontdrvhost.exe",
    "sihost.exe",
    "ctfmon.exe",
    "taskhostw.exe",
    "runtimebroker.exe",
    "audiodg.exe",
    "conhost.exe",
    "searchhost.exe",
    "startmenuexperiencehost.exe",
    "shellexperiencehost.exe",
    "textinputhost.exe",
    "applicationframehost.exe",
    "lockapp.exe",
    "msedgewebview2.exe",
];

pub(super) fn protected(exe: &str) -> bool {
    let exe = exe.to_lowercase();
    let own = std::env::current_exe()
        .ok()
        .and_then(|p| p.file_name()?.to_str().map(str::to_lowercase));
    PROTECTED.contains(&exe.as_str()) || own.is_some_and(|own| own == exe)
}

fn session(pid: u32) -> Option<u32> {
    use windows_sys::Win32::System::RemoteDesktop::ProcessIdToSessionId;
    let mut id = 0;
    // SAFETY: out-pointer to a local integer.
    (unsafe { ProcessIdToSessionId(pid, &mut id) } != 0).then_some(id)
}

/// Visible top-level windows and their process ids (also for opening a player, media.rs).
pub(crate) fn windows() -> Vec<(windows_sys::Win32::Foundation::HWND, u32)> {
    use windows_sys::{
        core::BOOL,
        Win32::{
            Foundation::{HWND, LPARAM},
            UI::WindowsAndMessaging::{
                EnumWindows, GetWindow, GetWindowThreadProcessId, IsWindowVisible, GW_OWNER,
            },
        },
    };
    unsafe extern "system" fn collect(hwnd: HWND, list: LPARAM) -> BOOL {
        // SAFETY: `list` is the Vec passed below, alive for the whole enumeration.
        let list = unsafe { &mut *(list as *mut Vec<(HWND, u32)>) };
        // SAFETY: plain queries on a window handle given by EnumWindows.
        unsafe {
            if IsWindowVisible(hwnd) != 0 && GetWindow(hwnd, GW_OWNER).is_null() {
                let mut pid = 0;
                GetWindowThreadProcessId(hwnd, &mut pid);
                list.push((hwnd, pid));
            }
        }
        1
    }
    let mut list: Vec<(HWND, u32)> = Vec::new();
    // SAFETY: the callback only touches `list`, which outlives the call.
    unsafe { EnumWindows(Some(collect), &mut list as *mut _ as LPARAM) };
    list
}

/// Executables that have a visible window in this session and are not protected.
pub(super) fn closable(exes: &HashMap<u32, String>) -> HashSet<String> {
    let own = session(std::process::id());
    windows()
        .into_iter()
        .filter(|(_, pid)| session(*pid) == own)
        .filter_map(|(_, pid)| exes.get(&pid).cloned())
        .filter(|exe| !protected(exe))
        .collect()
}

/// Processes of an executable in this session.
pub(crate) fn program_pids(exe: &str) -> Vec<u32> {
    use windows_sys::Win32::{
        Foundation::{CloseHandle, INVALID_HANDLE_VALUE},
        System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
            TH32CS_SNAPPROCESS,
        },
    };
    let exe = exe.to_lowercase();
    let own = session(std::process::id());
    let mut pids = Vec::new();
    // SAFETY: the snapshot handle is checked and closed; the entry is a sized out-struct.
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return pids;
        }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut more = Process32FirstW(snapshot, &mut entry) != 0;
        while more {
            let pid = entry.th32ProcessID;
            if from_wide(&entry.szExeFile).to_lowercase() == exe && session(pid) == own {
                pids.push(pid);
            }
            more = Process32NextW(snapshot, &mut entry) != 0;
        }
        CloseHandle(snapshot);
    }
    pids
}

pub(super) fn ticks(t: windows_sys::Win32::Foundation::FILETIME) -> u64 {
    (u64::from(t.dwHighDateTime) << 32) | u64::from(t.dwLowDateTime)
}

pub(super) fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(Some(0)).collect()
}

pub(super) fn from_wide(text: &[u16]) -> String {
    String::from_utf16_lossy(&text[..text.iter().position(|c| *c == 0).unwrap_or(text.len())])
}

pub(super) fn disk(root: &[u16], sample: &mut Sample) {
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    let (mut available, mut total, mut free) = (0u64, 0u64, 0u64);
    // SAFETY: null-terminated path; out-pointers to local integers.
    if unsafe { GetDiskFreeSpaceExW(root.as_ptr(), &mut available, &mut total, &mut free) } != 0 {
        sample.disk_total_bytes = Some(total);
        sample.disk_used_bytes = Some(total.saturating_sub(free));
    }
}

/// File description of a process's executable.
pub(super) fn describe(handle: windows_sys::Win32::Foundation::HANDLE) -> Option<String> {
    use windows_sys::Win32::{
        Storage::FileSystem::{GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW},
        System::Threading::QueryFullProcessImageNameW,
    };
    let mut path = vec![0u16; 1024];
    let mut size = path.len() as u32;
    // SAFETY: buffer and size describe `path`; the version block is sized by the first call and
    // the returned pointers point into it.
    unsafe {
        if QueryFullProcessImageNameW(handle, 0, path.as_mut_ptr(), &mut size) == 0 {
            return None;
        }
        path.truncate(size as usize);
        path.push(0);
        let len = GetFileVersionInfoSizeW(path.as_ptr(), std::ptr::null_mut());
        if len == 0 {
            return None;
        }
        let mut block = vec![0u8; len as usize];
        if GetFileVersionInfoW(path.as_ptr(), 0, len, block.as_mut_ptr().cast()) == 0 {
            return None;
        }
        let mut pointer: *mut core::ffi::c_void = std::ptr::null_mut();
        let mut bytes = 0u32;
        let translation = wide("\\VarFileInfo\\Translation");
        if VerQueryValueW(
            block.as_ptr().cast(),
            translation.as_ptr(),
            &mut pointer,
            &mut bytes,
        ) == 0
            || bytes < 4
        {
            return None;
        }
        let pair = std::slice::from_raw_parts(pointer as *const u16, 2);
        let key = wide(&format!(
            "\\StringFileInfo\\{:04x}{:04x}\\FileDescription",
            pair[0], pair[1]
        ));
        if VerQueryValueW(
            block.as_ptr().cast(),
            key.as_ptr(),
            &mut pointer,
            &mut bytes,
        ) == 0
            || bytes == 0
        {
            return None;
        }
        let text = std::slice::from_raw_parts(pointer as *const u16, bytes as usize);
        Some(from_wide(text).trim().to_string())
    }
}
