use super::watch::Watch;
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
