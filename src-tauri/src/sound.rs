//! Notification sounds: "channel went live" and "PC overloaded". The WAVs are embedded in the
//! executable and played with PlaySoundW, so they work regardless of the Windows sound scheme and
//! WebView autoplay rules. Sources: "new notification 07" and "warning alert" by Universfield
//! (Pixabay), chosen by the user, converted from MP3 to 16-bit PCM WAV because PlaySoundW only plays
//! WAV. PlaySoundW has no volume parameter, so the volume setting scales the samples of a copy.
static ALERT: &[u8] = include_bytes!("../../src/assets/live-alert.wav");
static WARNING: &[u8] = include_bytes!("../../src/assets/warning-alert.wav");

#[derive(serde::Deserialize, Clone, Copy, Default)]
#[serde(rename_all = "camelCase")]
pub enum Sound {
    #[default]
    Live,
    Warning,
}

/// Volume 0–100 from the settings; 0 plays nothing. Without `sound` the live sound.
#[tauri::command]
pub fn play_alert_sound(volume: u8, sound: Option<Sound>) {
    let volume = volume.min(100);
    if volume == 0 {
        return;
    }
    let source = match sound.unwrap_or_default() {
        Sound::Live => ALERT,
        Sound::Warning => WARNING,
    };
    #[cfg(windows)]
    {
        let wav = scaled(source, f32::from(volume) / 100.0).unwrap_or_else(|| source.to_vec());
        // Synchronous on its own thread, so the buffer lives until the sound has finished. A newer
        // sound stops an older one (PlaySoundW plays one sound per process).
        std::thread::spawn(move || {
            use windows_sys::Win32::Media::Audio::{
                PlaySoundW, SND_MEMORY, SND_NODEFAULT, SND_SYNC,
            };
            // SAFETY: SND_MEMORY reads the WAV from `wav`, which outlives the synchronous call.
            unsafe {
                PlaySoundW(
                    wav.as_ptr().cast(),
                    std::ptr::null_mut(),
                    SND_MEMORY | SND_SYNC | SND_NODEFAULT,
                );
            }
        });
    }
}

/// Copy of a 16-bit PCM WAV with the samples multiplied by level² (the slider then feels even);
/// `None` for any other format.
#[cfg_attr(not(windows), allow(dead_code))]
fn scaled(wav: &[u8], level: f32) -> Option<Vec<u8>> {
    if wav.get(0..4)? != b"RIFF" || wav.get(8..12)? != b"WAVE" {
        return None;
    }
    let gain = level.clamp(0.0, 1.0).powi(2);
    let word = |at: usize| {
        wav.get(at..at + 2)
            .map(|b| u16::from_le_bytes([b[0], b[1]]))
    };
    let mut out = wav.to_vec();
    let mut pcm16 = false;
    let mut pos = 12;
    while pos + 8 <= wav.len() {
        let size = u32::from_le_bytes(wav[pos + 4..pos + 8].try_into().ok()?) as usize;
        let body = pos + 8;
        match &wav[pos..pos + 4] {
            b"fmt " => pcm16 = word(body)? == 1 && word(body + 14)? == 16,
            b"data" if pcm16 => {
                let end = body.checked_add(size)?.min(wav.len());
                for sample in out[body..end].chunks_exact_mut(2) {
                    let value = f32::from(i16::from_le_bytes([sample[0], sample[1]]));
                    sample.copy_from_slice(&((value * gain).round() as i16).to_le_bytes());
                }
                return Some(out);
            }
            b"data" => return None,
            _ => {}
        }
        // Chunks are padded to an even length.
        pos = body.checked_add(size)?.checked_add(size & 1)?;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn samples(wav: &[u8]) -> Vec<i16> {
        let data = wav.windows(4).position(|w| w == b"data").unwrap() + 8;
        wav[data..]
            .chunks_exact(2)
            .map(|b| i16::from_le_bytes([b[0], b[1]]))
            .collect()
    }

    #[test]
    fn warning_sound_is_a_playable_wav() {
        assert!(scaled(WARNING, 1.0).is_some_and(|w| w == WARNING));
    }

    #[test]
    fn scales_the_embedded_alert() {
        let full = scaled(ALERT, 1.0).expect("16-bit PCM WAV");
        assert_eq!(full, ALERT);
        let half = scaled(ALERT, 0.5).unwrap();
        assert_eq!(half.len(), ALERT.len());
        let (a, b) = (samples(ALERT), samples(&half));
        let peak = |s: &[i16]| s.iter().map(|v| i32::from(*v).abs()).max().unwrap();
        assert!(peak(&a) > 1000);
        // Level 0.5 → gain 0.25.
        assert!((peak(&b) - peak(&a) / 4).abs() <= 1);
        assert!(scaled(ALERT, 0.0)
            .map(|w| samples(&w).iter().all(|v| *v == 0))
            .unwrap());
    }

    #[test]
    fn rejects_other_data() {
        assert!(scaled(b"not a wav file", 0.5).is_none());
    }
}
