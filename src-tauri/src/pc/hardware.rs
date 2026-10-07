//! Specs: what the PC is made of, read once.

use super::programs::{from_wide, wide};
use super::Specs;

pub(super) fn specs(adapter: Option<(String, u64, String)>) -> Specs {
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
