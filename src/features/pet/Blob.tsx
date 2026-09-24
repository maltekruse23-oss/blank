import type { FigureProps } from './figures';
import { HeadphonesBand, HeadphonesCups, Note } from './parts';

const star = (x: number, y: number) =>
  `M${x} ${y - 7} L${x + 2} ${y - 2} L${x + 7} ${y} L${x + 2} ${y + 2} L${x} ${y + 7} L${x - 2} ${y + 2} L${x - 7} ${y} L${x - 2} ${y - 2} Z`;

/** The first pet figure: a soft blob with shine, cheeks, star eyes when excited and headphones
 *  while music plays. */
export function Blob({ mood, blinking }: FigureProps) {
  return (
    <svg className={`pet-svg blob mood-${mood}`} viewBox="0 0 100 92" aria-hidden="true">
      <ellipse className="blob-ground" cx="50" cy="88" rx="30" ry="4" />
      {mood === 'music' && <HeadphonesBand left={7} right={93} y={50} top={-12} />}
      <path
        className="blob-body"
        d="M50 10 C78 10 94 32 94 58 C94 78 76 86 50 86 C24 86 6 78 6 58 C6 32 22 10 50 10 Z"
      />
      <path
        className="blob-shade"
        d="M8 62 C12 78 28 86 50 86 C72 86 88 78 92 62 C84 74 68 79 50 79 C32 79 16 74 8 62 Z"
      />
      <ellipse
        className="blob-shine"
        cx="32"
        cy="28"
        rx="10"
        ry="6"
        transform="rotate(-24 32 28)"
      />
      <ellipse className="blob-cheek" cx="24" cy="62" rx="6" ry="3.5" />
      <ellipse className="blob-cheek" cx="76" cy="62" rx="6" ry="3.5" />
      {mood === 'sleepy' && (
        <>
          <path className="blob-line" d="M29 51 Q35 56 41 51" />
          <path className="blob-line" d="M59 51 Q65 56 71 51" />
          <path className="blob-line" d="M46 64 Q50 66 54 64" />
          <text className="blob-z" x="78" y="20">
            z
          </text>
          <text className="blob-z small" x="88" y="10">
            z
          </text>
        </>
      )}
      {mood === 'awake' && (
        <>
          <g className={`pet-eyes ${blinking ? 'blink' : ''}`}>
            <ellipse className="blob-eye" cx="35" cy="50" rx="5" ry="7" />
            <ellipse className="blob-eye" cx="65" cy="50" rx="5" ry="7" />
            <circle className="blob-glint" cx="37" cy="47" r="1.8" />
            <circle className="blob-glint" cx="67" cy="47" r="1.8" />
          </g>
          <path className="blob-line" d="M43 63 Q50 69 57 63" />
        </>
      )}
      {mood === 'worried' && (
        <>
          <path className="blob-line" d="M27 40 L41 44" />
          <path className="blob-line" d="M73 40 L59 44" />
          <ellipse className="blob-eye" cx="35" cy="52" rx="4.5" ry="5.5" />
          <ellipse className="blob-eye" cx="65" cy="52" rx="4.5" ry="5.5" />
          <path className="blob-line" d="M42 67 Q46 63 50 67 Q54 71 58 67" />
          <path className="blob-drop" d="M86 22 Q92 32 86 36 Q80 32 86 22 Z" />
        </>
      )}
      {mood === 'excited' && (
        <>
          <path className="blob-star" d={star(35, 50)} />
          <path className="blob-star" d={star(65, 50)} />
          <ellipse className="blob-mouth" cx="50" cy="66" rx="6" ry="5" />
          <text className="blob-bang" x="84" y="22">
            !
          </text>
        </>
      )}
      {mood === 'music' && (
        <>
          <path className="blob-line" d="M29 50 Q35 55 41 50" />
          <path className="blob-line" d="M59 50 Q65 55 71 50" />
          <path className="blob-line" d="M44 63 Q50 68 56 63" />
          <HeadphonesCups left={7} right={93} y={50} />
          <Note x={88} y={14} />
        </>
      )}
    </svg>
  );
}
