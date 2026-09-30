//! Which Windows this is (read only): Windows 11 is build 22000 and later; Windows 10 lacks some
//! settings of 11 (e.g. the taskbar alignment in flyout.rs).
use std::sync::OnceLock;

pub const FIRST_WINDOWS_11: u32 = 22_000;

/// The build number ("22631"), read once from the registry.
pub fn build() -> Option<u32> {
    static BUILD: OnceLock<Option<u32>> = OnceLock::new();
    *BUILD.get_or_init(read_build)
}

pub fn is_windows_10() -> bool {
    build().is_some_and(|build| build < FIRST_WINDOWS_11)
}

fn read_build() -> Option<u32> {
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};
    let key: Vec<u16> = "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\0"
        .encode_utf16()
        .collect();
    let name: Vec<u16> = "CurrentBuildNumber\0".encode_utf16().collect();
    let mut value = [0u16; 32];
    let mut size = std::mem::size_of_val(&value) as u32;
    // SAFETY: reads one short string into a local buffer of the given size in bytes; both names end
    // with a zero, and RegGetValueW ends the string with a zero within the buffer.
    let read = unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE,
            key.as_ptr(),
            name.as_ptr(),
            RRF_RT_REG_SZ,
            std::ptr::null_mut(),
            value.as_mut_ptr().cast(),
            &mut size,
        )
    };
    if read != 0 {
        return None;
    }
    let end = value.iter().position(|&c| c == 0).unwrap_or(value.len());
    String::from_utf16(&value[..end]).ok()?.trim().parse().ok()
}
