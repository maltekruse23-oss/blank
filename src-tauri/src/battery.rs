//! Battery levels of the user's wireless devices, read when the frontend asks (Home or Devices
//! visible). Only read requests are sent; no setting on a device is changed.
//! - Logitech receivers and cabled Logitech devices: HID++ 2.0 (device name/type 0x0005, battery
//!   0x1004 "unified battery" or 0x1000 "battery status"). G HUB may run at the same time.
//! - HyperX Cloud Alpha Wireless: vendor report 21 BB 0B → percent (as used by HeadsetControl).
//!
//! Verified on the user's PC with a Logitech "PRO X 2" (LIGHTSPEED) and a Cloud Alpha Wireless.
use serde::Serialize;
use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

#[derive(Serialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
    Mouse,
    Keyboard,
    Headset,
    Controller,
    Other,
}

#[derive(Serialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum Charge {
    Charging,
    Full,
    Battery,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub(crate) id: String,
    name: String,
    kind: Kind,
    /// How it is connected, e.g. "Logitech-Funk".
    link: &'static str,
    /// `false`: known from earlier, but not answering now (off, asleep, out of range).
    pub(crate) reachable: bool,
    /// 0–100; `None` if the device did not answer or has no readable percentage. Never reported
    /// as 0 in that case.
    pub(crate) battery: Option<u8>,
    /// `None` if unknown.
    pub(crate) charge: Option<Charge>,
}

impl Device {
    fn unreachable(&self) -> Device {
        Device {
            reachable: false,
            battery: None,
            charge: None,
            ..self.clone()
        }
    }
}

/// One HID API instance for the app (hidapi allows only one) and a short cache, so Home and
/// Devices asking at the same moment cause a single scan.
#[derive(Default)]
pub struct Batteries(Mutex<Option<Scanner>>);

struct Scanner {
    api: hidapi::HidApi,
    last: Option<(Instant, Vec<Device>)>,
    /// Logitech devices seen in this session, so a sleeping mouse stays listed.
    known: HashMap<String, Device>,
}

const CACHE: Duration = Duration::from_secs(3);

#[tauri::command]
pub async fn device_batteries(app: tauri::AppHandle, fresh: bool) -> Result<Vec<Device>, String> {
    tauri::async_runtime::spawn_blocking(move || scan(&app, fresh))
        .await
        .map_err(|e| e.to_string())?
}

/// Blocking scan, shared by the command and the low-battery watch (pc.rs).
pub fn scan(app: &tauri::AppHandle, fresh: bool) -> Result<Vec<Device>, String> {
    {
        use tauri::Manager;
        let state = app.state::<Batteries>();
        let mut guard = state
            .0
            .lock()
            .map_err(|_| "Geräte nicht lesbar".to_string())?;
        if guard.is_none() {
            let api = hidapi::HidApi::new().map_err(|e| format!("HID nicht verfügbar: {e}"))?;
            *guard = Some(Scanner {
                api,
                last: None,
                known: HashMap::new(),
            });
        }
        let scanner = guard.as_mut().expect("initialised above");
        if let Some((at, devices)) = &scanner.last {
            if !fresh && at.elapsed() < CACHE {
                return Ok(devices.clone());
            }
        }
        scanner
            .api
            .refresh_devices()
            .map_err(|e| format!("HID nicht verfügbar: {e}"))?;
        let mut devices = logitech::scan(&scanner.api, &mut scanner.known);
        devices.extend(hyperx::scan(&scanner.api));
        scanner.last = Some((Instant::now(), devices.clone()));
        Ok(devices)
    }
}

mod logitech {
    use super::{Charge, Device, Kind};
    use hidapi::{HidApi, HidDevice};
    use std::{
        collections::HashMap,
        time::{Duration, Instant},
    };

    const VENDOR: u16 = 0x046D;
    /// Software id in our requests, to tell our answers from G HUB's.
    const SW_ID: u8 = 0x0D;
    const TIMEOUT: Duration = Duration::from_millis(1000);

    enum Answer {
        Data(Vec<u8>),
        /// Nothing paired at this index (or not a HID++ device).
        Absent,
        /// Paired, but not reachable right now.
        Unreachable,
    }

    struct Link {
        long: HidDevice,
        short: Option<HidDevice>,
    }

    impl Link {
        fn request(&self, index: u8, feature: u8, function: u8, params: &[u8]) -> Answer {
            let mut msg = [0u8; 20];
            msg[0] = 0x11;
            msg[1] = index;
            msg[2] = feature;
            msg[3] = (function << 4) | SW_ID;
            msg[4..4 + params.len()].copy_from_slice(params);
            if self.long.write(&msg).is_err() {
                return Answer::Unreachable;
            }
            let deadline = Instant::now() + TIMEOUT;
            let mut buf = [0u8; 64];
            while Instant::now() < deadline {
                for handle in std::iter::once(&self.long).chain(self.short.as_ref()) {
                    let Ok(n) = handle.read_timeout(&mut buf, 20) else {
                        return Answer::Unreachable;
                    };
                    if n < 7 || buf[1] != index {
                        continue;
                    }
                    let r = &buf[..n];
                    // HID++ 1.0 error from the receiver: 08 = nothing paired there.
                    if r[0] == 0x10 && r[2] == 0x8F && r[3] == feature {
                        return if r[5] == 0x08 || r[5] == 0x01 {
                            Answer::Absent
                        } else {
                            Answer::Unreachable
                        };
                    }
                    if r[0] == 0x11 && r[2] == 0xFF && r[3] == feature && r[4] == msg[3] {
                        return Answer::Absent;
                    }
                    if r[0] == 0x11 && r[2] == feature && r[3] == msg[3] {
                        return Answer::Data(r[4..].to_vec());
                    }
                }
            }
            Answer::Unreachable
        }

        /// Index of a HID++ 2.0 feature (0 = not supported).
        fn feature(&self, index: u8, id: u16) -> Answer {
            self.request(index, 0x00, 0, &[(id >> 8) as u8, id as u8])
        }
    }

    fn name_and_kind(link: &Link, index: u8, feature: u8) -> Option<(String, Kind)> {
        let Answer::Data(count) = link.request(index, feature, 0, &[]) else {
            return None;
        };
        let length = usize::from(count[0]);
        let mut name = Vec::new();
        while name.len() < length {
            let Answer::Data(chunk) = link.request(index, feature, 1, &[name.len() as u8]) else {
                return None;
            };
            let part: Vec<u8> = chunk
                .iter()
                .take(length - name.len())
                .copied()
                .take_while(|c| *c != 0)
                .collect();
            if part.is_empty() {
                break;
            }
            name.extend(part);
        }
        let kind = match link.request(index, feature, 2, &[]) {
            Answer::Data(t) => match t[0] {
                0 | 2 => Kind::Keyboard,
                3..=5 => Kind::Mouse,
                8 => Kind::Headset,
                11 | 12 => Kind::Controller,
                _ => Kind::Other,
            },
            _ => Kind::Other,
        };
        let name = String::from_utf8_lossy(&name).trim().to_string();
        Some((name, kind))
    }

    fn battery(link: &Link, index: u8) -> (Option<u8>, Option<Charge>) {
        if let Answer::Data(f) = link.feature(index, 0x1004) {
            if f[0] != 0 {
                if let Answer::Data(s) = link.request(index, f[0], 1, &[]) {
                    let charge = match s[2] {
                        0 => Some(Charge::Battery),
                        1 | 2 => Some(Charge::Charging),
                        3 => Some(Charge::Full),
                        _ => None,
                    };
                    return ((s[0] <= 100).then_some(s[0]), charge);
                }
                return (None, None);
            }
        }
        if let Answer::Data(f) = link.feature(index, 0x1000) {
            if f[0] != 0 {
                if let Answer::Data(s) = link.request(index, f[0], 0, &[]) {
                    let charge = match s[2] {
                        0 => Some(Charge::Battery),
                        1 | 2 | 4 => Some(Charge::Charging),
                        3 => Some(Charge::Full),
                        _ => None,
                    };
                    // 0 means "unknown" for this feature.
                    return ((1..=100).contains(&s[0]).then_some(s[0]), charge);
                }
            }
        }
        (None, None)
    }

    pub fn scan(api: &HidApi, known: &mut HashMap<String, Device>) -> Vec<Device> {
        let mut found = Vec::new();
        let longs: Vec<_> = api
            .device_list()
            .filter(|d| d.vendor_id() == VENDOR && d.usage_page() == 0xFF00 && d.usage() == 2)
            .collect();
        for info in longs {
            let Ok(long) = info.open_device(api) else {
                continue;
            };
            // Receivers report errors on the short collection of the same interface.
            let short = api
                .device_list()
                .find(|d| {
                    d.vendor_id() == VENDOR
                        && d.product_id() == info.product_id()
                        && d.interface_number() == info.interface_number()
                        && d.usage_page() == 0xFF00
                        && d.usage() == 1
                })
                .and_then(|d| d.open_device(api).ok());
            let link = Link { long, short };
            let receiver = info
                .product_string()
                .is_some_and(|s| s.contains("Receiver"));
            // A receiver addresses its paired devices as 1–6. A cabled device is 0xFF and answers
            // to every index, so only 0xFF is asked there.
            let indices: &[u8] = if receiver {
                &[1, 2, 3, 4, 5, 6]
            } else {
                &[0xFF]
            };
            for &index in indices {
                let slot = format!("{}:{index}", info.path().to_string_lossy());
                let f = match link.feature(index, 0x0005) {
                    Answer::Data(f) if f[0] != 0 => f,
                    // Seen earlier in this session, now asleep or switched off.
                    Answer::Unreachable => {
                        if let Some(device) = known.get(&slot) {
                            found.push(device.unreachable());
                        }
                        continue;
                    }
                    _ => continue,
                };
                let Some((name, kind)) = name_and_kind(&link, index, f[0]) else {
                    continue;
                };
                let name = if name.is_empty() {
                    "Logitech-Gerät".to_string()
                } else {
                    name
                };
                let (battery, charge) = battery(&link, index);
                let device = Device {
                    // The device's own unit id: the same mouse via cable and receiver is one entry.
                    id: format!(
                        "logitech:{}",
                        unit_id(&link, index).unwrap_or_else(|| name.clone())
                    ),
                    name,
                    kind,
                    link: if receiver {
                        "Logitech-Funk"
                    } else {
                        "Logitech-Kabel"
                    },
                    reachable: true,
                    battery,
                    charge,
                };
                known.insert(slot, device.clone());
                found.push(device);
            }
        }
        // One entry per device; an answering path wins over a silent one.
        let mut unique: Vec<Device> = Vec::new();
        for device in found {
            match unique.iter_mut().find(|d| d.id == device.id) {
                Some(existing) if !existing.reachable && device.reachable => *existing = device,
                Some(_) => {}
                None => unique.push(device),
            }
        }
        unique
    }

    /// Unit id from DeviceInformation (0x0003), as hex.
    fn unit_id(link: &Link, index: u8) -> Option<String> {
        let Answer::Data(f) = link.feature(index, 0x0003) else {
            return None;
        };
        if f[0] == 0 {
            return None;
        }
        let Answer::Data(info) = link.request(index, f[0], 0, &[]) else {
            return None;
        };
        let unit = &info[1..5];
        (unit != [0, 0, 0, 0]).then(|| unit.iter().map(|b| format!("{b:02x}")).collect())
    }
}

mod hyperx {
    use super::{Device, Kind};
    use hidapi::HidApi;
    use std::time::{Duration, Instant};

    /// HyperX Cloud Alpha Wireless (HP vendor id): vendor collection with report 0x21.
    const VENDOR: u16 = 0x03F0;
    const PRODUCT: u16 = 0x098D;

    pub fn scan(api: &HidApi) -> Vec<Device> {
        let Some(info) = api.device_list().find(|d| {
            d.vendor_id() == VENDOR
                && d.product_id() == PRODUCT
                && d.usage_page() == 0xFF43
                && d.usage() == 0x0202
        }) else {
            return Vec::new();
        };
        let battery = info.open_device(api).ok().and_then(|device| {
            let mut msg = [0u8; 31];
            msg[..3].copy_from_slice(&[0x21, 0xBB, 0x0B]);
            device.write(&msg).ok()?;
            let deadline = Instant::now() + Duration::from_millis(1000);
            let mut buf = [0u8; 64];
            while Instant::now() < deadline {
                let n = device.read_timeout(&mut buf, 50).ok()?;
                if n >= 6 && buf[..3] == [0x21, 0xBB, 0x0B] {
                    // Byte 3: percent, bytes 4–5: voltage (mV). Headset off → no plausible value.
                    let voltage = u16::from_be_bytes([buf[4], buf[5]]);
                    return (1..=100)
                        .contains(&buf[3])
                        .then_some(buf[3])
                        .filter(|_| voltage > 0);
                }
            }
            None
        });
        vec![Device {
            id: format!("hyperx:{}", info.path().to_string_lossy()),
            name: info
                .product_string()
                .map(str::to_string)
                .unwrap_or_else(|| "HyperX Headset".into()),
            kind: Kind::Headset,
            link: "HyperX-Funk",
            // The receiver stays plugged in; without a plausible answer the headset is off.
            reachable: battery.is_some(),
            battery,
            charge: None,
        }]
    }
}
