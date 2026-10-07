//! Warnings: sustained load and low batteries, as notices and popouts.

use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use tauri::{AppHandle, Emitter};

use crate::battery;

use super::{PcWarning, Sample, BATTERY_EVERY, BATTERY_REARM, COOLDOWN, LOW_BATTERY};

#[derive(Default)]
pub(super) struct Watch {
    /// How long each resource has been above its limit.
    high: HashMap<&'static str, Duration>,
    warned: HashMap<&'static str, Instant>,
    battery_checked: Option<Instant>,
    /// Devices already warned about; cleared once charged again.
    low: HashMap<String, bool>,
}

impl Watch {
    pub(super) fn check(&mut self, app: &AppHandle, sample: &Sample, elapsed: Duration) {
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
    pub(super) fn overloads(
        &mut self,
        sample: &Sample,
        elapsed: Duration,
        now: Instant,
    ) -> Vec<PcWarning> {
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
