//! The app's own resource usage for the live display: blank.exe plus all its WebView2 processes.
//! CPU is the share of all logical processors since the previous call, memory the private working
//! set (Task Manager's "Memory" column). Measured only when the frontend asks, i.e. while visible.
use serde::Serialize;
use std::{collections::HashMap, sync::Mutex, time::Instant};

#[derive(Serialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    /// `None` on the first call: CPU needs a previous sample.
    cpu_percent: Option<f64>,
    /// `None` if the memory of any process could not be read (never shown as a partial sum).
    memory_bytes: Option<u64>,
    processes: u32,
}

struct Sample {
    at: Instant,
    /// CPU time per process id, in 100-ns units.
    cpu: HashMap<u32, u64>,
    cpu_percent: Option<f64>,
}

#[derive(Default)]
pub struct UsageState(Mutex<Option<Sample>>);

/// Calls closer together than this return the previous CPU value (too short to be meaningful).
const MIN_INTERVAL_SECS: f64 = 0.5;

#[tauri::command]
pub fn app_usage(state: tauri::State<'_, UsageState>) -> Result<Usage, String> {
    let processes = measure()?;
    let now = Instant::now();
    let mut last = state
        .0
        .lock()
        .map_err(|_| "Messung nicht verfügbar".to_string())?;
    let memory_bytes = processes
        .iter()
        .map(|p| p.private_bytes)
        .sum::<Option<u64>>();
    let count = processes.len() as u32;
    if let Some(previous) = last.as_ref() {
        let seconds = now.duration_since(previous.at).as_secs_f64();
        if seconds < MIN_INTERVAL_SECS {
            return Ok(Usage {
                cpu_percent: previous.cpu_percent,
                memory_bytes,
                processes: count,
            });
        }
    }
    let cpu: HashMap<u32, u64> = processes.iter().map(|p| (p.pid, p.cpu_time)).collect();
    let cpu_percent = last.as_ref().map(|previous| {
        // A process that started since the previous call counts with its whole CPU time.
        let used: u64 = cpu
            .iter()
            .map(|(pid, time)| time.saturating_sub(previous.cpu.get(pid).copied().unwrap_or(0)))
            .sum();
        let cores = std::thread::available_parallelism().map_or(1, |n| n.get()) as f64;
        let elapsed = now.duration_since(previous.at).as_secs_f64() * 10_000_000.0;
        (used as f64 / (elapsed * cores) * 100.0).clamp(0.0, 100.0)
    });
    *last = Some(Sample {
        at: now,
        cpu,
        cpu_percent,
    });
    Ok(Usage {
        cpu_percent,
        memory_bytes,
        processes: count,
    })
}

struct Process {
    pid: u32,
    cpu_time: u64,
    private_bytes: Option<u64>,
}

/// This process and its descendants (the WebView2 browser and its helper processes).
#[cfg(windows)]
fn measure() -> Result<Vec<Process>, String> {
    use windows_sys::Win32::{
        Foundation::{CloseHandle, INVALID_HANDLE_VALUE},
        System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
            TH32CS_SNAPPROCESS,
        },
    };

    // (pid, parent pid) of every process.
    let mut all = Vec::new();
    // SAFETY: the snapshot handle is checked and closed; the entry is a valid, sized out-struct.
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return Err("Prozessliste nicht verfügbar".into());
        }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut more = Process32FirstW(snapshot, &mut entry) != 0;
        while more {
            all.push((entry.th32ProcessID, entry.th32ParentProcessID));
            more = Process32NextW(snapshot, &mut entry) != 0;
        }
        CloseHandle(snapshot);
    }

    let own = std::process::id();
    let mut found = vec![];
    let mut queue = vec![(own, 0u64)];
    while let Some((parent, parent_created)) = queue.pop() {
        let Some(info) = process_info(parent) else {
            continue;
        };
        // Ids are reused: a child must not be older than its parent.
        if info.created < parent_created {
            continue;
        }
        queue.extend(
            all.iter()
                .filter(|(pid, ppid)| *ppid == parent && *pid != parent)
                .map(|(pid, _)| (*pid, info.created)),
        );
        found.push(Process {
            pid: parent,
            cpu_time: info.cpu_time,
            private_bytes: info.private_bytes,
        });
    }
    if found.is_empty() {
        return Err("Messung nicht verfügbar".into());
    }
    Ok(found)
}

#[cfg(windows)]
struct Info {
    created: u64,
    cpu_time: u64,
    private_bytes: Option<u64>,
}

#[cfg(windows)]
fn process_info(pid: u32) -> Option<Info> {
    use windows_sys::Win32::{
        Foundation::{CloseHandle, FILETIME},
        System::{
            ProcessStatus::{
                GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX2,
            },
            Threading::{GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION},
        },
    };
    let ticks = |t: FILETIME| (u64::from(t.dwHighDateTime) << 32) | u64::from(t.dwLowDateTime);
    // SAFETY: the handle is checked and closed; all out-pointers point to local, sized structs.
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return None;
        }
        let zero = FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        let (mut created, mut exited, mut kernel, mut user) = (zero, zero, zero, zero);
        let times = GetProcessTimes(handle, &mut created, &mut exited, &mut kernel, &mut user) != 0;
        let mut memory: PROCESS_MEMORY_COUNTERS_EX2 = std::mem::zeroed();
        memory.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX2>() as u32;
        let private_bytes = if GetProcessMemoryInfo(
            handle,
            (&mut memory as *mut PROCESS_MEMORY_COUNTERS_EX2).cast::<PROCESS_MEMORY_COUNTERS>(),
            memory.cb,
        ) != 0
        {
            Some(memory.PrivateWorkingSetSize as u64)
        } else {
            None
        };
        CloseHandle(handle);
        times.then(|| Info {
            created: ticks(created),
            cpu_time: ticks(kernel) + ticks(user),
            private_bytes,
        })
    }
}

#[cfg(not(windows))]
fn measure() -> Result<Vec<Process>, String> {
    Err("Nur unter Windows".into())
}
