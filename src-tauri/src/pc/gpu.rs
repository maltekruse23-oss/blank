//! Graphics card: the "GPU Engine" performance counters and the main adapter.

use std::collections::HashMap;

use super::programs::{from_wide, wide};

pub(super) struct Gpu {
    query: windows_sys::Win32::System::Performance::PDH_HQUERY,
    counter: windows_sys::Win32::System::Performance::PDH_HCOUNTER,
    /// Main adapter (most dedicated memory): name, memory, LUID as in the counter names.
    pub(super) adapter: Option<(String, u64, String)>,
}

// SAFETY: the PDH handles are only used by the watch thread that owns the sampler.
unsafe impl Send for Gpu {}

impl Gpu {
    pub(super) fn open() -> Option<Gpu> {
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
    pub(super) fn read(&mut self) -> Option<(f64, HashMap<u32, f64>)> {
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
