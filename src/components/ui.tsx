import { useState, type ReactNode } from 'react';
import { ArrowUpRight, Cable, Mouse, Headphones, Keyboard, Gamepad2 } from 'lucide-react';
import type { DeviceKind } from '../adapters/devices';

export function Card({
  title,
  eyebrow,
  children,
  action,
  className = '',
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  action?: () => void;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      <header className="card-header">
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
        </div>
        {action && (
          <button className="icon-button" aria-label={`${title} öffnen`} onClick={action}>
            <ArrowUpRight size={19} />
          </button>
        )}
      </header>
      {children}
    </section>
  );
}
export function Badge({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return (
    <span className={`badge ${active ? 'active' : ''}`}>
      {active && <i />}
      {children}
    </span>
  );
}
export function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="meter"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <span style={{ width: `${value}%` }} />
    </div>
  );
}
const tones = ['forest', 'violet', 'blue'] as const;
/** Stable colour per channel, derived from its login. */
export function channelTone(login: string) {
  const hash = [...login].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return tones[hash % tones.length];
}
/** Profile image when available, otherwise initials; broken images fall back to initials. */
export function ChannelAvatar({
  login,
  imageUrl,
  muted = false,
}: {
  login: string;
  imageUrl?: string | null;
  muted?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (imageUrl && !failed)
    return (
      <img
        className={`avatar avatar-image ${muted ? 'muted' : ''}`}
        src={imageUrl}
        alt=""
        onError={() => setFailed(true)}
      />
    );
  return (
    <span className={`avatar ${muted ? 'neutral' : channelTone(login)}`} aria-hidden="true">
      {login.slice(0, 2)}
    </span>
  );
}
export function DeviceIcon({ kind, size = 24 }: { kind: DeviceKind; size?: number }) {
  const Icon =
    kind === 'mouse'
      ? Mouse
      : kind === 'headset'
        ? Headphones
        : kind === 'keyboard'
          ? Keyboard
          : kind === 'controller'
            ? Gamepad2
            : Cable;
  return <Icon size={size} strokeWidth={1.3} />;
}
