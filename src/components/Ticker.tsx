import { useLayoutEffect, useRef } from 'react';
import { animate } from 'motion';
import { getMotion, motionBase } from '../design/motion';

const NUMBER = /^(\d+)(?:,(\d+))?$/;

/**
 * A number that counts to its value with a spring (first from 0, later from the previous value):
 * "37", "02", "12,4". Anything else (e.g. "—" while a value is missing) is shown as it is, never
 * as a number. Written straight into the element, so counting does not re-render React.
 */
export function Ticker({ text }: { text: string }) {
  const element = useRef<HTMLDataElement>(null);
  const last = useRef<number | null>(null);
  useLayoutEffect(() => {
    const target = element.current;
    if (!target) return;
    const match = NUMBER.exec(text);
    if (!match) {
      target.textContent = text;
      last.current = null;
      return;
    }
    const digits = match[1]!.length;
    const decimals = match[2]?.length ?? 0;
    const to = Number(`${match[1]}.${match[2] ?? '0'}`);
    const format = (value: number) =>
      value
        .toFixed(decimals)
        .replace('.', ',')
        .padStart(digits + (decimals ? decimals + 1 : 0), '0');
    const from = last.current ?? 0;
    last.current = to;
    if (!getMotion().enabled || from === to) {
      target.textContent = text;
      return;
    }
    target.textContent = format(from);
    const controls = animate(from, to, {
      ...motionBase.springs.default,
      type: 'spring',
      onUpdate: (value) => {
        target.textContent = format(Math.max(0, value));
      },
      onComplete: () => {
        target.textContent = text;
      },
    });
    return () => controls.stop();
  }, [text]);
  // A <data> element: rules for spans in cards (small print, gaps) must not reach the number.
  return <data ref={element} className="ticker" value={text} />;
}
