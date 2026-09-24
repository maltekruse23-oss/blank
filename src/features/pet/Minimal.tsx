import type { FigureProps } from './figures';

/**
 * Plain, flat pet: one rounded shape in the accent colour and two simple eyes. Sleeping: eyes
 * are short lines; awake: upright pills that blink; excited: happy arcs; worried: wide eyes, a
 * wavy mouth and a drop of sweat.
 */
export function Minimal({ mood, blinking }: FigureProps) {
  return (
    <svg className={`pet-svg minimal mood-${mood}`} viewBox="0 0 100 92" aria-hidden="true">
      <rect className="minimal-body" x="14" y="20" width="72" height="66" rx="30" />
      {mood === 'sleepy' && (
        <>
          <rect className="minimal-eye" x="31" y="52" width="13" height="4" rx="2" />
          <rect className="minimal-eye" x="56" y="52" width="13" height="4" rx="2" />
          <text className="minimal-z" x="80" y="18">
            z
          </text>
        </>
      )}
      {mood === 'awake' && (
        <g className={`pet-eyes ${blinking ? 'blink' : ''}`}>
          <rect className="minimal-eye" x="34" y="43" width="8" height="16" rx="4" />
          <rect className="minimal-eye" x="58" y="43" width="8" height="16" rx="4" />
        </g>
      )}
      {mood === 'worried' && (
        <>
          <circle className="minimal-eye" cx="38" cy="50" r="5" />
          <circle className="minimal-eye" cx="62" cy="50" r="5" />
          <path className="minimal-arc thin" d="M42 68 Q46 64 50 68 Q54 72 58 68" />
          <path className="minimal-drop" d="M80 26 Q86 36 80 40 Q74 36 80 26 Z" />
        </>
      )}
      {mood === 'excited' && (
        <>
          <path className="minimal-arc" d="M31 55 Q37.5 45 44 55" />
          <path className="minimal-arc" d="M56 55 Q62.5 45 69 55" />
        </>
      )}
    </svg>
  );
}
