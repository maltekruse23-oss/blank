//! Real PC status for the PC page and Home, plus a background watch for the pet's warnings.
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
use crate::battery;
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Condvar, Mutex},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};

const IDLE_INTERVAL: Duration = Duration::from_secs(10);
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
        let mut sampler = Sampler::new();
        if let Ok(mut shared) = state.0 .0.lock() {
            shared.specs = specs(sampler.gpu.as_ref().and_then(|g| g.adapter.clone()));
        }
        let mut watch = Watch::default();
        loop {
            let sample = sampler.sample();
            watch.check(&app, &sample, sampler.elapsed);
            let (lock, wake) = &*state.0;
            let Ok(mut shared) = lock.lock() else {
                return;
            };
            shared.latest = Some(sample);
            let interval = shared
                .live
                .filter(|(_, until)| *until > Instant::now())
                .map_or(IDLE_INTERVAL, |(interval, _)| interval);
            let _ = wake.wait_timeout(shared, interval);
        }
    });
}

// ---------------------------------------------------------------------------------------------
// Warnings

#[derive(Default)]
struct Watch {
    /// How long each resource has been above its limit.
    high: HashMap<&'static str, Duration>,
    warned: HashMap<&'static str, Instant>,
    battery_checked: Option<Instant>,
    /// Devices already warned about; cleared once charged again.
    low: HashMap<String, bool>,
}

impl Watch {
    fn check(&mut self, app: &AppHandle, sample: &Sample, elapsed: Duration) {
        for warning in self.overloads(sample, elapsed, Instant::now()) {
            let _ = app.emit("pc-warning", warning);
        }
        if self
            .battery_checked
            .is_none_or(|t| t.elapsed() >= BATTERY_EVERY)
        {
            self.battery_checked = Some(Instant::now());
            self.check_batteries(app);
        }
    }

    /// Resources that have been above their limit long enough and were not reported recently.
    fn overloads(&mut self, sample: &Sample, elapsed: Duration, now: Instant) -> Vec<PcWarning> {
        let mut found = Vec::new();
        let memory = if sample.memory_total_bytes > 0 {
            Some(sample.memory_used_bytes as f64 / sample.memory_total_bytes as f64 * 100.0)
        } else {
            None
        };
        let checks = [
            ("cpu", sample.cpu_percent, 90.0, 30, &sample.top_cpu),
            ("memory", memory, 90.0, 30, &sample.top_memory),
            ("gpu", sample.gpu_percent, 95.0, 60, &sample.top_gpu),
        ];
        for (resource, value, limit, seconds, apps) in checks {
            let high = self.high.entry(resource).or_default();
            match value {
                Some(v) if v >= limit => *high += elapsed,
                _ => *high = Duration::ZERO,
            }
            let recent = self
                .warned
                .get(resource)
                .is_some_and(|t| now.duration_since(*t) < COOLDOWN);
            if *high >= Duration::from_secs(seconds) && !recent {
                self.warned.insert(resource, now);
                found.push(PcWarning {
                    resource,
                    percent: value.unwrap_or(0.0).round(),
                    apps: apps.iter().take(3).cloned().collect(),
                });
            }
        }
        found
    }

    fn check_batteries(&mut self, app: &AppHandle) {
        let Ok(devices) = battery::scan(app, false) else {
            return;
        };
        for device in devices {
            let (Some(level), true) = (device.battery, device.reachable) else {
                continue;
            };
            let charging = matches!(
                device.charge,
                Some(battery::Charge::Charging | battery::Charge::Full)
            );
            if charging || level >= BATTERY_REARM {
                self.low.remove(&device.id);
            } else if level <= LOW_BATTERY && !self.low.contains_key(&device.id) {
                self.low.insert(device.id.clone(), true);
                let _ = app.emit("battery-low", &device);
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Sampling

struct Sampler {
    last_system: Option<(u64, u64)>,
    last_process: HashMap<u32, u64>,
    last_at: Instant,
    elapsed: Duration,
    names: HashMap<String, String>,
    gpu: Option<Gpu>,
    threads: f64,
    disk: Vec<u16>,
    disk_name: String,
}

impl Sampler {
    fn new() -> Self {
        let drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".into());
        Sampler {
            last_system: None,
            last_process: HashMap::new(),
            last_at: Instant::now(),
            elapsed: Duration::ZERO,
            names: HashMap::new(),
            gpu: Gpu::open(),
            threads: std::thread::available_parallelism().map_or(1, |n| n.get()) as f64,
            disk: wide(&format!("{drive}\\")),
            disk_name: drive,
        }
    }

    fn sample(&mut self) -> Sample {
        let now = Instant::now();
        self.elapsed = now - self.last_at;
        self.last_at = now;
        let mut sample = Sample {
            disk_name: self.disk_name.clone(),
            ..Sample::default()
        };
        self.cpu_and_memory(&mut sample);
        let (exes, cpu, memory) = self.processes();
        let closable = closable(&exes);
        sample.top_cpu = self.top(cpu, 0.5, &closable);
        sample.top_memory = self.top(memory, 50.0 * 1024.0 * 1024.0, &closable);
        if let Some((total, per_pid)) = self.gpu.as_mut().and_then(Gpu::read) {
            sample.gpu_percent = Some(total);
            let mut gpu: HashMap<String, f64> = HashMap::new();
            for (pid, value) in per_pid {
                if let Some(exe) = exes.get(&pid) {
                    *gpu.entry(exe.clone()).or_default() += value;
                }
            }
            sample.top_gpu = self.top(gpu, 0.5, &closable);
        }
        disk(&self.disk, &mut sample);
        sample
    }

    /// Biggest programs above `min`, at most five, with readable names.
    fn top(
        &self,
        values: HashMap<String, f64>,
        min: f64,
        closable: &HashSet<String>,
    ) -> Vec<AppLoad> {
        let mut list: Vec<AppLoad> = values
            .into_iter()
            .filter(|(_, v)| *v >= min)
            .map(|(exe, value)| AppLoad {
                name: self.names.get(&exe).cloned().unwrap_or_else(|| exe.clone()),
                closable: closable.contains(&exe),
                exe,
                value,
            })
            .collect();
        list.sort_by(|a, b| b.value.total_cmp(&a.value));
        list.truncate(5);
        list
    }

    fn cpu_and_memory(&mut self, sample: &mut Sample) {
        use windows_sys::Win32::{
            Foundation::FILETIME,
            System::{
                SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX},
                Threading::GetSystemTimes,
            },
        };
        let zero = FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        let (mut idle, mut kernel, mut user) = (zero, zero, zero);
        // SAFETY: out-pointers to local FILETIMEs.
        if unsafe { GetSystemTimes(&mut idle, &mut kernel, &mut user) } != 0 {
            let (idle, total) = (ticks(idle), ticks(kernel) + ticks(user));
            if let Some((last_idle, last_total)) = self.last_system {
                let busy = total.saturating_sub(last_total);
                if busy > 0 {
                    let idle = idle.saturating_sub(last_idle);
                    sample.cpu_percent = Some(
                        ((busy.saturating_sub(idle)) as f64 / busy as f64 * 100.0)
                            .clamp(0.0, 100.0),
                    );
                }
            }
            self.last_system = Some((idle, total));
        }
        // SAFETY: zeroed struct with its size set, as the API requires.
        let mut memory: MEMORYSTATUSEX = unsafe { std::mem::zeroed() };
        memory.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
        if unsafe { GlobalMemoryStatusEx(&mut memory) } != 0 {
            sample.memory_total_bytes = memory.ullTotalPhys;
            sample.memory_used_bytes = memory.ullTotalPhys.saturating_sub(memory.ullAvailPhys);
        }
    }

    /// pid → executable (lowercase), and CPU percent and memory bytes per executable.
    #[allow(clippy::type_complexity)]
    fn processes(
        &mut self,
    ) -> (
        HashMap<u32, String>,
        HashMap<String, f64>,
        HashMap<String, f64>,
    ) {
        use windows_sys::Win32::{
            Foundation::{CloseHandle, FILETIME, INVALID_HANDLE_VALUE},
            System::{
                Diagnostics::ToolHelp::{
                    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
                    TH32CS_SNAPPROCESS,
                },
                ProcessStatus::{
                    GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX2,
                },
                Threading::{GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION},
            },
        };
        let mut exes = HashMap::new();
        let mut cpu: HashMap<String, f64> = HashMap::new();
        let mut memory: HashMap<String, f64> = HashMap::new();
        let mut current = HashMap::new();
        let window = self.elapsed.as_secs_f64() * 10_000_000.0 * self.threads;
        // SAFETY: snapshot and process handles are checked and closed; out-structs are sized.
        unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snapshot == INVALID_HANDLE_VALUE {
                return (exes, cpu, memory);
            }
            let mut entry: PROCESSENTRY32W = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
            let mut more = Process32FirstW(snapshot, &mut entry) != 0;
            while more {
                let pid = entry.th32ProcessID;
                let exe = from_wide(&entry.szExeFile).to_lowercase();
                more = Process32NextW(snapshot, &mut entry) != 0;
                if pid == 0 {
                    continue;
                }
                let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
                if handle.is_null() {
                    continue;
                }
                self.remember_name(&exe, handle);
                let zero = FILETIME {
                    dwLowDateTime: 0,
                    dwHighDateTime: 0,
                };
                let (mut created, mut exited, mut kernel, mut user) = (zero, zero, zero, zero);
                if GetProcessTimes(handle, &mut created, &mut exited, &mut kernel, &mut user) != 0 {
                    let time = ticks(kernel) + ticks(user);
                    if let Some(last) = self.last_process.get(&pid) {
                        if window > 0.0 {
                            *cpu.entry(exe.clone()).or_default() +=
                                time.saturating_sub(*last) as f64 / window * 100.0;
                        }
                    }
                    current.insert(pid, time);
                }
                let mut counters: PROCESS_MEMORY_COUNTERS_EX2 = std::mem::zeroed();
                counters.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX2>() as u32;
                if GetProcessMemoryInfo(
                    handle,
                    (&mut counters as *mut PROCESS_MEMORY_COUNTERS_EX2)
                        .cast::<PROCESS_MEMORY_COUNTERS>(),
                    counters.cb,
                ) != 0
                {
                    *memory.entry(exe.clone()).or_default() +=
                        counters.PrivateWorkingSetSize as f64;
                }
                CloseHandle(handle);
                exes.insert(pid, exe);
            }
            CloseHandle(snapshot);
        }
        self.last_process = current;
        (exes, cpu, memory)
    }

    /// Caches a readable program name (file description, e.g. "Google Chrome") per executable.
    fn remember_name(&mut self, exe: &str, handle: windows_sys::Win32::Foundation::HANDLE) {
        if self.names.contains_key(exe) {
            return;
        }
        let fallback = exe.strip_suffix(".exe").unwrap_or(exe).to_string();
        let name = describe(handle)
            .filter(|d| !d.is_empty())
            .unwrap_or(fallback);
        self.names.insert(exe.to_string(), name);
    }
}

// ---------------------------------------------------------------------------------------------
// Closing a program

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

fn protected(exe: &str) -> bool {
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

/// Visible top-level windows and their process ids.
fn windows() -> Vec<(windows_sys::Win32::Foundation::HWND, u32)> {
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
fn closable(exes: &HashMap<u32, String>) -> HashSet<String> {
    let own = session(std::process::id());
    windows()
        .into_iter()
        .filter(|(_, pid)| session(*pid) == own)
        .filter_map(|(_, pid)| exes.get(&pid).cloned())
        .filter(|exe| !protected(exe))
        .collect()
}

/// Processes of an executable in this session.
fn program_pids(exe: &str) -> Vec<u32> {
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

fn ticks(t: windows_sys::Win32::Foundation::FILETIME) -> u64 {
    (u64::from(t.dwHighDateTime) << 32) | u64::from(t.dwLowDateTime)
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(Some(0)).collect()
}

fn from_wide(text: &[u16]) -> String {
    String::from_utf16_lossy(&text[..text.iter().position(|c| *c == 0).unwrap_or(text.len())])
}

fn disk(root: &[u16], sample: &mut Sample) {
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    let (mut available, mut total, mut free) = (0u64, 0u64, 0u64);
    // SAFETY: null-terminated path; out-pointers to local integers.
    if unsafe { GetDiskFreeSpaceExW(root.as_ptr(), &mut available, &mut total, &mut free) } != 0 {
        sample.disk_total_bytes = Some(total);
        sample.disk_used_bytes = Some(total.saturating_sub(free));
    }
}

/// File description of a process's executable.
fn describe(handle: windows_sys::Win32::Foundation::HANDLE) -> Option<String> {
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

// ---------------------------------------------------------------------------------------------
// Graphics card

struct Gpu {
    query: windows_sys::Win32::System::Performance::PDH_HQUERY,
    counter: windows_sys::Win32::System::Performance::PDH_HCOUNTER,
    /// Main adapter (most dedicated memory): name, memory, LUID as in the counter names.
    adapter: Option<(String, u64, String)>,
}

// SAFETY: the PDH handles are only used by the watch thread that owns the sampler.
unsafe impl Send for Gpu {}

impl Gpu {
    fn open() -> Option<Gpu> {
        use windows_sys::Win32::System::Performance::{
            PdhAddEnglishCounterW, PdhCollectQueryData, PdhOpenQueryW,
        };
        let mut query = std::ptr::null_mut();
        let mut counter = std::ptr::null_mut();
        let path = wide("\\GPU Engine(*)\\Utilization Percentage");
        // SAFETY: out-pointers to local handles; the path is null-terminated.
        unsafe {
            if PdhOpenQueryW(std::ptr::null(), 0, &mut query) != 0 {
                return None;
            }
            if PdhAddEnglishCounterW(query, path.as_ptr(), 0, &mut counter) != 0 {
                return None;
            }
            PdhCollectQueryData(query);
        }
        Some(Gpu {
            query,
            counter,
            adapter: main_adapter(),
        })
    }

    /// Utilisation of the main adapter and per process id (percent).
    fn read(&mut self) -> Option<(f64, HashMap<u32, f64>)> {
        use windows_sys::Win32::System::Performance::{
            PdhCollectQueryData, PdhGetFormattedCounterArrayW, PDH_FMT_COUNTERVALUE_ITEM_W,
            PDH_FMT_DOUBLE, PDH_MORE_DATA,
        };
        // SAFETY: the buffer is sized by the first call; items point into it while it lives.
        let items = unsafe {
            if PdhCollectQueryData(self.query) != 0 {
                return None;
            }
            let (mut size, mut count) = (0u32, 0u32);
            let status = PdhGetFormattedCounterArrayW(
                self.counter,
                PDH_FMT_DOUBLE,
                &mut size,
                &mut count,
                std::ptr::null_mut(),
            );
            if status != PDH_MORE_DATA {
                return None;
            }
            let mut buffer = vec![0u8; size as usize];
            let items = buffer.as_mut_ptr().cast::<PDH_FMT_COUNTERVALUE_ITEM_W>();
            if PdhGetFormattedCounterArrayW(
                self.counter,
                PDH_FMT_DOUBLE,
                &mut size,
                &mut count,
                items,
            ) != 0
            {
                return None;
            }
            std::slice::from_raw_parts(items, count as usize)
                .iter()
                .filter(|item| item.FmtValue.CStatus == 0)
                .map(|item| {
                    let mut len = 0;
                    while *item.szName.add(len) != 0 {
                        len += 1;
                    }
                    let name =
                        String::from_utf16_lossy(std::slice::from_raw_parts(item.szName, len));
                    (name, item.FmtValue.Anonymous.doubleValue)
                })
                .collect::<Vec<_>>()
        };
        let luid = self.adapter.as_ref().map(|(_, _, luid)| luid.as_str());
        // Task Manager: per engine the sum over processes; the busiest engine is the adapter's load.
        let mut engines: HashMap<&str, f64> = HashMap::new();
        let mut processes: HashMap<(u32, &str), f64> = HashMap::new();
        for (name, value) in &items {
            if luid.is_some_and(|l| !name.contains(l)) {
                continue;
            }
            let engine = name.split("_engtype_").nth(1).unwrap_or("");
            *engines.entry(engine).or_default() += value;
            if let Some(pid) = name
                .strip_prefix("pid_")
                .and_then(|rest| rest.split('_').next())
                .and_then(|pid| pid.parse::<u32>().ok())
            {
                *processes.entry((pid, engine)).or_default() += value;
            }
        }
        let total = engines.values().copied().fold(0.0, f64::max).min(100.0);
        let mut per_pid: HashMap<u32, f64> = HashMap::new();
        for ((pid, _), value) in processes {
            let entry = per_pid.entry(pid).or_default();
            *entry = entry.max(value);
        }
        Some((total, per_pid))
    }
}

/// The adapter with the most dedicated video memory (the graphics card, not the iGPU).
fn main_adapter() -> Option<(String, u64, String)> {
    use windows::Win32::Graphics::Dxgi::{
        CreateDXGIFactory1, IDXGIFactory1, DXGI_ADAPTER_FLAG_SOFTWARE,
    };
    // SAFETY: plain DXGI enumeration; the interfaces are released when dropped.
    unsafe {
        let factory: IDXGIFactory1 = CreateDXGIFactory1().ok()?;
        let mut best: Option<(String, u64, String)> = None;
        let mut index = 0;
        while let Ok(adapter) = factory.EnumAdapters1(index) {
            index += 1;
            let Ok(desc) = adapter.GetDesc1() else {
                continue;
            };
            if desc.Flags & DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32 != 0 {
                continue;
            }
            let memory = desc.DedicatedVideoMemory as u64;
            if best.as_ref().is_none_or(|(_, m, _)| memory > *m) {
                let luid = format!(
                    "luid_0x{:08X}_0x{:08X}",
                    desc.AdapterLuid.HighPart as u32, desc.AdapterLuid.LowPart
                );
                best = Some((from_wide(&desc.Description), memory, luid));
            }
        }
        best
    }
}

// ---------------------------------------------------------------------------------------------
// Specs

fn specs(adapter: Option<(String, u64, String)>) -> Specs {
    use windows_sys::Win32::System::SystemInformation::GetPhysicallyInstalledSystemMemory;
    let cpu = reg_string(
        r"HARDWARE\DESCRIPTION\System\CentralProcessor\0",
        "ProcessorNameString",
    )
    .map(|s| s.trim().to_string())
    .unwrap_or_else(|| "Prozessor".into());
    let mut kilobytes = 0u64;
    // SAFETY: out-pointer to a local integer.
    let installed = (unsafe { GetPhysicallyInstalledSystemMemory(&mut kilobytes) } != 0)
        .then_some(kilobytes * 1024);
    let product = reg_string(
        r"SOFTWARE\Microsoft\Windows NT\CurrentVersion",
        "ProductName",
    )
    .unwrap_or_else(|| "Windows".into());
    let build: u32 = reg_string(
        r"SOFTWARE\Microsoft\Windows NT\CurrentVersion",
        "CurrentBuild",
    )
    .and_then(|b| b.parse().ok())
    .unwrap_or(0);
    // Windows 11 still reports "Windows 10" as product name; build 22000+ is Windows 11.
    let product = if build >= 22000 {
        product.replacen("Windows 10", "Windows 11", 1)
    } else {
        product
    };
    let os = match reg_string(
        r"SOFTWARE\Microsoft\Windows NT\CurrentVersion",
        "DisplayVersion",
    ) {
        Some(version) => format!("{product} {version}"),
        None => product,
    };
    Specs {
        cpu,
        threads: std::thread::available_parallelism().map_or(1, |n| n.get()) as u32,
        memory_installed_bytes: installed,
        gpu: adapter.as_ref().map(|(name, _, _)| name.clone()),
        gpu_memory_bytes: adapter.map(|(_, memory, _)| memory),
        os,
    }
}

fn reg_string(key: &str, value: &str) -> Option<String> {
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};
    let (key, value) = (wide(key), wide(value));
    let mut buffer = vec![0u16; 256];
    let mut size = (buffer.len() * 2) as u32;
    // SAFETY: null-terminated strings; buffer and size describe `buffer`.
    let code = unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE,
            key.as_ptr(),
            value.as_ptr(),
            RRF_RT_REG_SZ,
            std::ptr::null_mut(),
            buffer.as_mut_ptr().cast(),
            &mut size,
        )
    };
    (code == 0).then(|| from_wide(&buffer))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(cpu: f64, memory: f64, gpu: f64) -> Sample {
        Sample {
            cpu_percent: Some(cpu),
            memory_total_bytes: 100,
            memory_used_bytes: memory as u64,
            gpu_percent: Some(gpu),
            top_cpu: vec![AppLoad {
                name: "Busy".into(),
                exe: "busy.exe".into(),
                closable: true,
                value: 80.0,
            }],
            ..Sample::default()
        }
    }

    fn resources(found: &[PcWarning]) -> Vec<&'static str> {
        found.iter().map(|w| w.resource).collect()
    }

    #[test]
    fn warns_after_sustained_load_once_per_cooldown() {
        let mut watch = Watch::default();
        let start = Instant::now();
        let step = Duration::from_secs(10);
        let at = |n: u32| start + step * n;
        // CPU high for 20 s: not yet.
        assert!(watch
            .overloads(&sample(95.0, 40.0, 10.0), step, at(1))
            .is_empty());
        assert!(watch
            .overloads(&sample(95.0, 40.0, 10.0), step, at(2))
            .is_empty());
        // 30 s: warning with the causing program.
        let found = watch.overloads(&sample(95.0, 40.0, 10.0), step, at(3));
        assert_eq!(resources(&found), ["cpu"]);
        assert_eq!(found[0].apps[0].name, "Busy");
        // Still high: no repeat within 30 minutes.
        assert!(watch
            .overloads(&sample(95.0, 40.0, 10.0), step, at(4))
            .is_empty());
        let later = start + COOLDOWN + step * 5;
        assert_eq!(
            resources(&watch.overloads(&sample(95.0, 40.0, 10.0), step, later)),
            ["cpu"]
        );
    }

    #[test]
    fn a_dip_restarts_the_count() {
        let mut watch = Watch::default();
        let start = Instant::now();
        let step = Duration::from_secs(10);
        for n in 1..=2 {
            watch.overloads(&sample(20.0, 95.0, 10.0), step, start + step * n);
        }
        // Memory drops below 90 %: the 30 s start over.
        watch.overloads(&sample(20.0, 50.0, 10.0), step, start + step * 3);
        for n in 4..=5 {
            assert!(watch
                .overloads(&sample(20.0, 95.0, 10.0), step, start + step * n)
                .is_empty());
        }
        assert_eq!(
            resources(&watch.overloads(&sample(20.0, 95.0, 10.0), step, start + step * 6)),
            ["memory"]
        );
    }

    #[test]
    fn gpu_needs_a_full_minute_and_missing_values_never_warn() {
        let mut watch = Watch::default();
        let start = Instant::now();
        let step = Duration::from_secs(10);
        for n in 1..=5 {
            assert!(watch
                .overloads(&sample(10.0, 10.0, 99.0), step, start + step * n)
                .is_empty());
        }
        assert_eq!(
            resources(&watch.overloads(&sample(10.0, 10.0, 99.0), step, start + step * 6)),
            ["gpu"]
        );
        let unknown = Sample::default();
        for n in 7..=20 {
            assert!(watch.overloads(&unknown, step, start + step * n).is_empty());
        }
    }
}
