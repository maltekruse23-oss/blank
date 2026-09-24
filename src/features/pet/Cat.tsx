import type { FigureProps } from './figures';
import { HeadphonesBand, HeadphonesCups, Mark, Note } from './parts';

/**
 * A cat: round head with pointed ears, whiskers, a small nose and a "w" mouth. Sleeping: closed
 * eyes; awake: oval eyes that blink; excited: happy arcs and an open mouth; worried: wide eyes and
 * a drop of sweat; music: headphones between the ears and eyes closed.
 */
export function Cat({ mood, blinking }: FigureProps) {
  const music = mood === 'music';
  return (
    <svg className={`pet-svg cat mood-${mood}`} viewBox="0 0 100 92" aria-hidden="true">
      {music && <HeadphonesBand left={10} right={90} y={54} top={-4} />}
      <path className="cat-body" d="M18 40 L24 6 L46 24 Z" />
      <path className="cat-body" d="M82 40 L76 6 L54 24 Z" />
      <path className="cat-ear-inner" d="M25 30 L28 15 L38 25 Z" />
      <path className="cat-ear-inner" d="M75 30 L72 15 L62 25 Z" />
      <path
        className="cat-body"
        d="M50 18 C76 18 90 34 90 56 C90 76 74 86 50 86 C26 86 10 76 10 56 C10 34 24 18 50 18 Z"
      />
      <path className="cat-whisker" d="M8 58 L26 61 M9 67 L26 66 M92 58 L74 61 M91 67 L74 66" />
      <path className="cat-nose" d="M46 58 L54 58 L50 63 Z" />
      {mood !== 'excited' && mood !== 'worried' && (
        <path className="cat-line thin" d="M44 66 Q47 70 50 66 Q53 70 56 66" />
      )}
      {mood === 'sleepy' && (
        <>
          <path className="cat-line" d="M30 49 Q36 53 42 49" />
          <path className="cat-line" d="M58 49 Q64 53 70 49" />
          <Mark x={84} y={16}>
            z
          </Mark>
          <Mark x={93} y={7} size="small">
            z
          </Mark>
        </>
      )}
      {mood === 'awake' && (
        <g className={`pet-eyes ${blinking ? 'blink' : ''}`}>
          <ellipse className="cat-eye" cx="36" cy="48" rx="5" ry="7" />
          <ellipse className="cat-eye" cx="64" cy="48" rx="5" ry="7" />
          <circle className="cat-glint" cx="38" cy="45" r="1.8" />
          <circle className="cat-glint" cx="66" cy="45" r="1.8" />
        </g>
      )}
      {mood === 'excited' && (
        <>
          <path className="cat-line" d="M30 51 Q36 42 42 51" />
          <path className="cat-line" d="M58 51 Q64 42 70 51" />
          <ellipse className="cat-eye" cx="50" cy="69" rx="5" ry="4.5" />
          <Mark x={86} y={22} size="big">
            !
          </Mark>
        </>
      )}
      {mood === 'worried' && (
        <>
          <path className="cat-line thin" d="M28 41 L41 37 M72 41 L59 37" />
          <circle className="cat-eye" cx="36" cy="49" r="5" />
          <circle className="cat-eye" cx="64" cy="49" r="5" />
          <path className="cat-line thin" d="M43 70 Q46.5 66 50 70 Q53.5 74 57 70" />
          <path className="pet-drop" d="M88 26 Q94 36 88 40 Q82 36 88 26 Z" />
        </>
      )}
      {music && (
        <>
          <path className="cat-line" d="M30 48 Q36 53 42 48" />
          <path className="cat-line" d="M58 48 Q64 53 70 48" />
          <HeadphonesCups left={10} right={90} y={54} />
          <Note x={86} y={14} />
        </>
      )}
    </svg>
  );
}
