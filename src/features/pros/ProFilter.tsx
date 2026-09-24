import { LANES, type Lane, type ProKind } from '../../data/proStreamers';
import type { ProLive } from './usePros';

export type ProFilterValue = { lane: Lane | null; kind: ProKind | null };
export const NO_FILTER: ProFilterValue = { lane: null, kind: null };

const KINDS: [ProKind, string][] = [
  ['pro', 'Pro'],
  ['otp', 'OTP'],
  ['elo', 'High Elo'],
];

export function matchesFilter({ pro }: ProLive, filter: ProFilterValue) {
  return (!filter.lane || pro.lane === filter.lane) && (!filter.kind || pro.kind === filter.kind);
}

function Group<T extends string>({
  label,
  options,
  selected,
  count,
  onSelect,
}: {
  label: string;
  options: [T, string][];
  selected: T | null;
  count: (option: T | null) => number;
  onSelect: (option: T | null) => void;
}) {
  const all: [T | null, string][] = [[null, 'Alle'], ...options];
  return (
    <div className="pro-filter-row" role="group" aria-label={label}>
      <span className="eyebrow">{label}</span>
      {all.map(([option, text]) => {
        const n = count(option);
        return (
          <button
            key={text}
            className={`filter-chip ${selected === option ? 'selected' : ''} ${n === 0 ? 'none' : ''}`}
            aria-pressed={selected === option}
            onClick={() => onSelect(option)}
          >
            {text} <span>{n}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Lane and type filter of the Pros tab; the numbers are live players under the other choice. */
export function ProFilter({
  live,
  value,
  onChange,
}: {
  live: ProLive[];
  value: ProFilterValue;
  onChange: (value: ProFilterValue) => void;
}) {
  const count = (next: ProFilterValue) => live.filter((p) => matchesFilter(p, next)).length;
  return (
    <div className="card pro-filter" id="pro-filter">
      <Group
        label="Lane"
        options={LANES.map((lane): [Lane, string] => [lane, lane])}
        selected={value.lane}
        count={(lane) => count({ ...value, lane })}
        onSelect={(lane) => onChange({ ...value, lane })}
      />
      <Group
        label="Typ"
        options={KINDS}
        selected={value.kind}
        count={(kind) => count({ ...value, kind })}
        onSelect={(kind) => onChange({ ...value, kind })}
      />
    </div>
  );
}
