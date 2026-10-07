//! Sampling: CPU, memory, drive and the programs with the most load.

use std::{
    collections::{HashMap, HashSet},
    time::{Duration, Instant},
};

use super::gpu::Gpu;
use super::programs::{closable, describe, disk, from_wide, ticks, wide};
use super::{AppLoad, Sample};

pub(super) struct Sampler {
    last_system: Option<(u64, u64)>,
    last_process: HashMap<u32, u64>,
    last_at: Instant,
    pub(super) elapsed: Duration,
    names: HashMap<String, String>,
    pub(super) gpu: Option<Gpu>,
    threads: f64,
    disk: Vec<u16>,
    disk_name: String,
    /// League game and client seen in the last process list.
    league: (bool, bool),
}

impl Sampler {
    pub(super) fn new() -> Self {
        let drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".into());
        Sampler {
            last_system: None,
            last_process: HashMap::new(),
            last_at: Instant::now(),
            elapsed: Duration::ZERO,
            names: HashMap::new(),
            // Opened after the first reading (start).
            gpu: None,
            threads: std::thread::available_parallelism().map_or(1, |n| n.get()) as f64,
            disk: wide(&format!("{drive}\\")),
            disk_name: drive,
            league: (false, false),
        }
    }

    pub(super) fn sample(&mut self) -> Sample {
        let now = Instant::now();
        self.elapsed = now - self.last_at;
        self.last_at = now;
        let mut sample = Sample {
            disk_name: self.disk_name.clone(),
            ..Sample::default()
        };
        self.cpu_and_memory(&mut sample);
        let (exes, cpu, memory) = self.processes();
        sample.league = self.league;
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

    pub(super) fn cpu_and_memory(&mut self, sample: &mut Sample) {
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
        self.league = (false, false);
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
                // Before opening it: the game may not let itself be opened.
                if exe == crate::aram::GAME_EXE_LOWER {
                    self.league.0 = true;
                } else if exe == crate::aram::CLIENT_EXE_LOWER {
                    self.league.1 = true;
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
