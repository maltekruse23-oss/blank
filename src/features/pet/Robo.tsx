import type { FigureProps } from './figures';
import { HeadphonesBand, HeadphonesCups, Mark, Note } from './parts';

/**
 * A small robot: rounded head with an antenna and a dark screen as face, the eyes glow in the
 * accent colour. Sleeping: flat eyes, dim bulb; awake: square eyes that blink; excited: happy
 * arcs, bright bulb; worried: small eyes, tilted brows, a drop; music: headphones, closed eyes and
 * an equaliser as mouth.
 */
export function Robo({ mood, blinking }: FigureProps) {
  const music = mood === 'music';
  const bulb = mood === 'sleepy' ? 'dim' : mood === 'excited' || music ? 'lit' : '';
  return (
    <svg className={`pet-svg robo mood-${mood}`} viewBox="0 0 100 92" aria-hidden="true">
      {music && <HeadphonesBand left={11} right={89} y={50} top={0} />}
      <path className="robo-antenna" d="M50 8 L50 20" />
      <circle className={`robo-bulb ${bulb}`} cx="50" cy="7" r="4.5" />
      {!music && (
        <>
          <rect className="robo-side" x="7" y="42" width="9" height="18" rx="3" />
          <rect className="robo-side" x="84" y="42" width="9" height="18" rx="3" />
        </>
      )}
      <rect className="robo-body" x="14" y="20" width="72" height="64" rx="18" />
      <rect className="robo-screen" x="24" y="31" width="52" height="40" rx="11" />
      {mood === 'sleepy' && (
        <>
          <rect className="robo-glow" x="32" y="49" width="12" height="3" rx="1.5" />
          <rect className="robo-glow" x="56" y="49" width="12" height="3" rx="1.5" />
          <Mark x={82} y={16}>
            z
          </Mark>
          <Mark x={92} y={7} size="small">
            z
          </Mark>
        </>
      )}
      {mood === 'awake' && (
        <>
          <g className={`pet-eyes ${blinking ? 'blink' : ''}`}>
            <rect className="robo-glow" x="33" y="41" width="10" height="12" rx="3" />
            <rect className="robo-glow" x="57" y="41" width="10" height="12" rx="3" />
          </g>
          <rect className="robo-glow" x="44" y="61" width="12" height="3" rx="1.5" />
        </>
      )}
      {mood === 'excited' && (
        <>
          <path className="robo-line" d="M32 50 Q38 40 44 50" />
          <path className="robo-line" d="M56 50 Q62 40 68 50" />
          <path className="robo-line" d="M42 59 Q50 66 58 59" />
          <Mark x={84} y={22} size="big">
            !
          </Mark>
        </>
      )}
      {mood === 'worried' && (
        <>
          <path className="robo-line thin" d="M31 42 L42 38 M69 42 L58 38" />
          <circle className="robo-glow" cx="38" cy="48" r="3.5" />
          <circle className="robo-glow" cx="62" cy="48" r="3.5" />
          <path className="robo-line thin" d="M43 62 Q46.5 58 50 62 Q53.5 66 57 62" />
          <path className="pet-drop" d="M90 24 Q96 34 90 38 Q84 34 90 24 Z" />
        </>
      )}
      {music && (
        <>
          <path className="robo-line" d="M32 46 Q38 51 44 46" />
          <path className="robo-line" d="M56 46 Q62 51 68 46" />
          <rect className="robo-glow" x="39" y="58" width="3" height="7" rx="1.5" />
          <rect className="robo-glow" x="44" y="55" width="3" height="10" rx="1.5" />
          <rect className="robo-glow" x="49" y="59" width="3" height="6" rx="1.5" />
          <rect className="robo-glow" x="54" y="56" width="3" height="9" rx="1.5" />
          <rect className="robo-glow" x="59" y="60" width="3" height="5" rx="1.5" />
          <HeadphonesCups left={11} right={89} y={50} />
          <Note x={86} y={14} />
        </>
      )}
    </svg>
  );
}
