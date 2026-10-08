//! Real PC status for the PC page and Home, plus a background watch for warnings (notices in the
//! app and popouts).
//! CPU from GetSystemTimes, memory from GlobalMemoryStatusEx, graphics card from the Windows
//! performance counters "GPU Engine" (the same source as Task Manager; assigned to the adapter with
//! the most dedicated memory via DXGI), system drive from GetDiskFreeSpaceEx, and per program CPU,
//! memory and GPU so a warning can say what causes the load. Nothing is changed on the system.
//!
//! Samples every 10 s in the background, every 5 s while Home shows a summary and every 2 s while
//! the PC page is open. Warnings:
//! CPU or memory at 90 % or more for 30 s, GPU at 95 % or more for 60 s, each at most every
//! 30 minutes; battery at 15 % or less, once until the device was charged.
//!
//! A program named in a warning can be closed from there: normally (like its window's X, so it can
//! ask about unsaved work) or, if it does not react, forcibly. Only programs with their own window
//! in this user's session; never Windows' own processes, shared helpers or blank. itself.
use serde::Serialize;
use std::{
    sync::{Arc, Condvar, Mutex},
    time::{Duration, Instant},
};
use tauri::AppHandle;

mod gpu;
mod hardware;
mod programs;
mod sampler;
mod watch;

use gpu::Gpu;
use hardware::specs;
use programs::protected;
pub(crate) use programs::{file_description, program_pids, windows};
use sampler::Sampler;
use watch::Watch;

const IDLE_INTERVAL: Duration = Duration::from_secs(10);
/// After a reading without CPU share (the very first one), the next one comes this soon; not
/// earlier, even if a page asks (a second reading right away has no share either).
const FIRST_AGAIN: Duration = Duration::from_millis(700);
/// Between the first CPU times and the first reading at the start (long enough for a share).
const FIRST_READING: Duration = Duration::from_millis(250);
/// How long a page request keeps its interval (a little more than two of its requests).
const LIVE_FOR: Duration = Duration::from_secs(12);
const BATTERY_EVERY: Duration = Duration::from_secs(600);
const COOLDOWN: Duration = Duration::from_secs(1800);
const LOW_BATTERY: u8 = 15;
const BATTERY_REARM: u8 = 20;

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Specs {
    cpu: String,
    threads: u32,
    memory_installed_bytes: Option<u64>,
    gpu: Option<String>,
    gpu_memory_bytes: Option<u64>,
    os: String,
}

/// A program (all processes with the same executable) and its share.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppLoad {
    name: String,
    /// Executable file name, e.g. "chrome.exe"; identifies the program for closing.
    exe: String,
    /// Has its own window in this session and is not part of Windows (see `close_program`).
    closable: bool,
    /// Percent of the whole CPU or GPU; bytes for memory.
    value: f64,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Sample {
    /// `None` until two readings exist.
    cpu_percent: Option<f64>,
    memory_used_bytes: u64,
    memory_total_bytes: u64,
    /// `None` without readable GPU counters.
    gpu_percent: Option<f64>,
    disk_name: String,
    disk_used_bytes: Option<u64>,
    disk_total_bytes: Option<u64>,
    top_cpu: Vec<AppLoad>,
    top_memory: Vec<AppLoad>,
    top_gpu: Vec<AppLoad>,
    /// League game and client running (aram.rs follows the end of games); not shown.
    #[serde(skip)]
    league: (bool, bool),
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PcStatus {
    specs: Specs,
    sample: Option<Sample>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PcWarning {
    resource: &'static str,
    percent: f64,
    apps: Vec<AppLoad>,
}

#[derive(Default)]
struct Shared {
    specs: Specs,
    latest: Option<Sample>,
    /// Interval a page asked for, and until when.
    live: Option<(Duration, Instant)>,
}

#[derive(Default, Clone)]
pub struct PcState(Arc<(Mutex<Shared>, Condvar)>);

/// Current values; also measures every `seconds` (2–10) for a few seconds, for the page asking.
#[tauri::command]
pub fn pc_status(state: tauri::State<'_, PcState>, seconds: u64) -> Result<PcStatus, String> {
    let (lock, wake) = &*state.0;
    let mut shared = lock
        .lock()
        .map_err(|_| "PC-Status nicht verfügbar".to_string())?;
    let now = Instant::now();
    let wanted = Duration::from_secs(seconds.clamp(2, 10));
    let current = shared
        .live
        .filter(|(_, until)| *until > now)
        .map(|(i, _)| i);
    // Only one page is shown at a time: the latest request sets the interval.
    shared.live = Some((wanted, now + LIVE_FOR));
    if current.is_none_or(|c| wanted < c) {
        wake.notify_one();
    }
    Ok(PcStatus {
        specs: shared.specs.clone(),
        sample: shared.latest.clone(),
    })
}

pub fn start(app: AppHandle, state: PcState) {
    std::thread::spawn(move || {
        // Pages show values almost at once after the start: CPU (it needs two readings), memory
        // and disk first; the graphics counters take a second or two to open (Windows lists every
        // GPU engine), so the GPU follows with the next reading.
        let mut sampler = Sampler::new();
        sampler.cpu_and_memory(&mut Sample::default());
        std::thread::sleep(FIRST_READING);
        let first = sampler.sample();
        if let Ok(mut shared) = state.0 .0.lock() {
            shared.specs = specs(None);
            shared.latest = Some(first);
        }
        sampler.gpu = Gpu::open();
        if let Ok(mut shared) = state.0 .0.lock() {
            shared.specs = specs(sampler.gpu.as_ref().and_then(|g| g.adapter.clone()));
        }
        let mut watch = Watch::default();
        let mut quick = 3;
        loop {
            let sample = sampler.sample();
            watch.check(&app, &sample, sampler.elapsed);
            crate::aram::league_seen(&app, sample.league.0, sample.league.1);
            let (lock, wake) = &*state.0;
            let Ok(mut shared) = lock.lock() else {
                return;
            };
            // The CPU share needs two readings: right after the start the second one comes after
            // FIRST_AGAIN (undisturbed), so pages show it almost at once instead of "—" for up to
            // 10 s. Only a few times, should Windows not give the times at all.
            if sample.cpu_percent.is_none() && quick > 0 {
                quick -= 1;
                shared.latest = Some(sample);
                drop(shared);
                std::thread::sleep(FIRST_AGAIN);
                continue;
            }
            shared.latest = Some(sample);
            let interval = shared
                .live
                .filter(|(_, until)| *until > Instant::now())
                .map_or(IDLE_INTERVAL, |(interval, _)| interval);
            let _ = wake.wait_timeout(shared, interval);
        }
    });
}

/// Closes a program named in a warning. Normally: asks each of its windows to close (like their
/// X). `force`: ends its processes, for a program that does not react. Returns how many windows
/// or processes were addressed; 0 if it is no longer running.
#[tauri::command]
pub fn close_program(exe: String, force: bool) -> Result<u32, String> {
    use windows_sys::Win32::{
        Foundation::CloseHandle,
        System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE},
        UI::WindowsAndMessaging::{PostMessageW, WM_CLOSE},
    };
    if protected(&exe) {
        return Err("Dieses Programm schließt blank. nicht".into());
    }
    let pids = program_pids(&exe);
    if pids.is_empty() {
        return Ok(0);
    }
    if force {
        let mut ended = 0;
        for pid in pids {
            // SAFETY: the handle is checked and closed.
            unsafe {
                let handle = OpenProcess(PROCESS_TERMINATE, 0, pid);
                if !handle.is_null() {
                    if TerminateProcess(handle, 1) != 0 {
                        ended += 1;
                    }
                    CloseHandle(handle);
                }
            }
        }
        return if ended > 0 {
            Ok(ended)
        } else {
            Err("Beenden nicht erlaubt".into())
        };
    }
    let targets: Vec<_> = windows()
        .into_iter()
        .filter(|(_, pid)| pids.contains(pid))
        .collect();
    if targets.is_empty() {
        return Err("Kein Fenster zum Schließen".into());
    }
    for (hwnd, _) in &targets {
        // SAFETY: posting WM_CLOSE to a window handle from EnumWindows; the program decides.
        unsafe { PostMessageW(*hwnd, WM_CLOSE, 0, 0) };
    }
    Ok(targets.len() as u32)
}

/// Number of running processes of a program in this session (to see whether closing worked).
#[tauri::command]
pub fn program_running(exe: String) -> u32 {
    program_pids(&exe).len() as u32
}

#[cfg(test)]
mod tests;
