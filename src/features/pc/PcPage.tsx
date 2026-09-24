import { useEffect, useState, type ComponentType } from 'react';
import {
  Cpu,
  CircuitBoard,
  MemoryStick,
  HardDrive,
  Sparkles,
  type LucideProps,
} from 'lucide-react';
import {
  cleanMemory,
  formatGb,
  formatPercent,
  formatSize,
  type AppLoad,
  type PcStatus,
} from '../../adapters/pc';
import { Card, Meter } from '../../components/ui';
import type { PcState } from './usePcStatus';

type Metric = {
  name: string;
  /** Category colour of the icon tile (tokens --tone-1 … --tone-4). */
  tone: 1 | 2 | 3 | 4;
  detail: string;
  Icon: ComponentType<LucideProps>;
  /** null: not measured (yet); shown as a dash, never as 0. */
  value: string | null;
  unit: string;
  percent: number | null;
  sub: string;
};

function topApp(apps: AppLoad[], format: (v: number) => string) {
  const app = apps[0];
  return app ? `Meiste Last: ${app.name} · ${format(app.value)}` : 'Kaum Last';
}

export function pcMetrics({ specs, sample }: PcStatus): Metric[] {
  const memoryPercent =
    sample && sample.memoryTotalBytes > 0
      ? (sample.memoryUsedBytes / sample.memoryTotalBytes) * 100
      : null;
  const diskPercent =
    sample?.diskTotalBytes && sample.diskUsedBytes !== null
      ? (sample.diskUsedBytes / sample.diskTotalBytes) * 100
      : null;
  return [
    {
      name: 'CPU',
      tone: 1,
      detail: 'Prozessorauslastung',
      Icon: Cpu,
      value: sample?.cpuPercent != null ? formatPercent(sample.cpuPercent) : null,
      unit: '%',
      percent: sample?.cpuPercent ?? null,
      sub: sample ? topApp(sample.topCpu, (v) => `${formatPercent(v)} %`) : specs.cpu,
    },
    {
      name: 'GPU',
      tone: 2,
      detail: 'Grafikauslastung',
      Icon: CircuitBoard,
      value: sample?.gpuPercent != null ? formatPercent(sample.gpuPercent) : null,
      unit: '%',
      percent: sample?.gpuPercent ?? null,
      sub:
        sample && sample.gpuPercent != null
          ? topApp(sample.topGpu, (v) => `${formatPercent(v)} %`)
          : 'Nicht messbar',
    },
    {
      name: 'RAM',
      tone: 3,
      detail: 'Arbeitsspeicher',
      Icon: MemoryStick,
      value: sample ? formatGb(sample.memoryUsedBytes) : null,
      unit: `/ ${formatSize(specs.memoryInstalledBytes ?? sample?.memoryTotalBytes ?? 0)}`,
      percent: memoryPercent,
      sub: sample ? topApp(sample.topMemory, (v) => `${formatGb(v)} GB`) : '',
    },
    {
      name: 'Speicher',
      tone: 4,
      detail: sample ? `Laufwerk ${sample.diskName}` : 'Systemlaufwerk',
      Icon: HardDrive,
      value: sample?.diskUsedBytes != null ? formatGb(sample.diskUsedBytes) : null,
      unit: sample?.diskTotalBytes ? `/ ${formatSize(sample.diskTotalBytes)}` : '',
      percent: diskPercent,
      sub:
        sample?.diskTotalBytes && sample.diskUsedBytes !== null
          ? `${formatGb(sample.diskTotalBytes - sample.diskUsedBytes)} GB frei`
          : '',
    },
  ];
}

/** How long the result of a RAM cleaning stays in place of the usual line. */
const CLEAN_RESULT_MS = 12_000;

/** "Bereinigen" in the RAM card: Mem Reduct-style cleaning, only on click. */
function useRamCleaner() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!message || busy) return;
    const timer = window.setTimeout(() => setMessage(null), CLEAN_RESULT_MS);
    return () => window.clearTimeout(timer);
  }, [message, busy]);
  async function clean() {
    if (!cleanMemory || busy) return;
    setBusy(true);
    setMessage('Bereinigt … Windows fragt nach Erlaubnis');
    try {
      const result = await cleanMemory();
      const freed = result.freedBytes >= 50 * 1024 ** 2;
      setMessage(
        (freed
          ? `${formatGb(result.freedBytes)} GB freigegeben`
          : 'Nichts Nennenswertes freizugeben') +
          (result.incomplete ? ' (nicht alles erlaubt)' : ''),
      );
    } catch (error) {
      setMessage(typeof error === 'string' ? error : 'Bereinigen fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }
  return { available: cleanMemory !== null, busy, message, clean };
}

/** Real CPU, graphics card, memory and system drive, updated every 2 s while shown. */
export function PcPage({ pc }: { pc: PcState }) {
  const cleaner = useRamCleaner();
  if (pc.status === 'unavailable')
    return (
      <div className="empty-state">
        <Cpu size={28} />
        <h2>Nur in der Desktop-App</h2>
      </div>
    );
  if (pc.status === 'error')
    return (
      <div className="notice" role="status">
        PC-Werte nicht lesbar.
      </div>
    );
  if (pc.status === 'loading')
    return (
      <p className="section-note" role="status">
        Misst …
      </p>
    );
  const { specs } = pc.pc;
  return (
    <>
      <div className="pc-grid">
        {pcMetrics(pc.pc).map(({ name, tone, detail, Icon, value, unit, percent, sub: usual }) => {
          const ram = name === 'RAM';
          const sub = ram && cleaner.message ? cleaner.message : usual;
          return (
            <Card key={name} title={name} eyebrow={detail}>
              <Icon className={`metric-icon tone-${tone}`} size={32} strokeWidth={1.3} />
              {ram && cleaner.available && (
                <button
                  className="ram-clean"
                  disabled={cleaner.busy}
                  title="Arbeitsspeicher bereinigen wie Mem Reduct (braucht Administratorrechte, Windows fragt)"
                  onClick={() => void cleaner.clean()}
                >
                  <Sparkles size={13} /> {cleaner.busy ? 'Läuft …' : 'Bereinigen'}
                </button>
              )}
              <div className="metric-value">
                {value ?? '—'}
                <small>{unit}</small>
              </div>
              {percent !== null ? (
                <Meter value={Math.min(100, percent)} label={`${name} Auslastung`} />
              ) : (
                <div className="meter" />
              )}
              <p className="metric-sub" title={sub} role={ram ? 'status' : undefined}>
                {sub}
              </p>
            </Card>
          );
        })}
      </div>
      <Card title="Systemübersicht">
        <div className="system-rows">
          <div>
            <span>Prozessor</span>
            <span title={specs.cpu}>{specs.cpu}</span>
          </div>
          <div>
            <span>Grafikkarte</span>
            <span title={specs.gpu ?? undefined}>
              {specs.gpu
                ? `${specs.gpu}${specs.gpuMemoryBytes ? ` · ${formatSize(specs.gpuMemoryBytes)}` : ''}`
                : '—'}
            </span>
          </div>
          <div>
            <span>Arbeitsspeicher</span>
            <span>
              {specs.memoryInstalledBytes ? formatSize(specs.memoryInstalledBytes) : '—'} ·{' '}
              {specs.threads} Threads
            </span>
          </div>
          <div>
            <span>Betriebssystem</span>
            <span>{specs.os}</span>
          </div>
        </div>
      </Card>
    </>
  );
}
