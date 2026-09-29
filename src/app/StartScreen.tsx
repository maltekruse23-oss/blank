import { useEffect, useRef, type CSSProperties } from 'react';

/**
 * The start screen (user's wish: "a cool loading screen, it can be very, very extravagant").
 * Light particles swirl in from everywhere and assemble "blank" from left to right, the accent dot
 * drops in with a bounce, a shock wave and sparks, a glint runs over the word; below, what really
 * is loading (Twitch, PC, devices). Then the dot opens like a portal into the app while the word
 * bursts apart. The first start of an installation takes its time, later starts are quicker; a
 * click or any key skips it. Drawn once per frame on a canvas only while it runs, then removed.
 */

export type StartKind = 'first' | 'again';
export type StartSource = { name: string; ready: boolean };

const timing = {
  first: { assemble: 1700, glint: 700, wait: 1500 },
  again: { assemble: 1000, glint: 480, wait: 1200 },
} as const;
const FALL_MS = 240;
const EXIT_MS = 650;
const HOLE_FROM = 110;

type Particle = {
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  delay: number;
  spin: number;
  /** Exit: the burst away from the dot. */
  vx: number;
  vy: number;
};
type Spark = { x: number; y: number; vx: number; vy: number };

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (p: number) => 1 - (1 - p) ** 3;
const easeIn = (p: number) => p ** 3;
const easeInOut = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);

export function StartScreen({
  kind,
  sources,
  onDone,
}: {
  kind: StartKind;
  sources: StartSource[];
  onDone: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  // Read every frame without starting the animation again.
  const latest = useRef({ sources, onDone });
  latest.current = { sources, onDone };
  const skip = useRef(false);
  const t = timing[kind];

  useEffect(() => {
    const element = root.current;
    const surface = canvas.current;
    const done = () => latest.current.onDone();
    const ready = () => latest.current.sources.every((s) => s.ready);
    const skipNow = () => {
      skip.current = true;
    };
    window.addEventListener('keydown', skipNow);
    const stopKeys = () => window.removeEventListener('keydown', skipNow);

    const ctx = surface?.getContext('2d');
    if (!element || !surface || !ctx) {
      done();
      return stopKeys;
    }
    const css = getComputedStyle(document.documentElement);
    const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    const accent = token('--accent', '#afd58c');
    const text = token('--text', '#e6ede5');
    const font = token('--font-display', "'Segoe UI Variable Display', 'Segoe UI', sans-serif");

    const W = element.clientWidth;
    const H = element.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    surface.width = Math.round(W * dpr);
    surface.height = Math.round(H * dpr);
    ctx.scale(dpr, dpr);

    // The word and where its dot sits.
    const size = Math.round(Math.min(W * 0.17, 150));
    const type = `700 ${size}px ${font}`;
    ctx.font = type;
    const word = 'blank';
    const wordWidth = ctx.measureText(word).width;
    const dotR = size * 0.085;
    const gap = size * 0.05;
    const left = (W - (wordWidth + gap + 2 * dotR)) / 2;
    const baseline = H * 0.47 + size * 0.3;
    const dot = { x: left + wordWidth + gap + dotR, y: baseline - dotR };
    element.style.setProperty('--hx', `${dot.x}px`);
    element.style.setProperty('--hy', `${dot.y}px`);
    element.style.setProperty('--status-top', `${baseline + size * 0.34}px`);

    // Points of the letters, from the word drawn once off screen.
    const sample = document.createElement('canvas');
    sample.width = Math.ceil(wordWidth) + 4;
    sample.height = Math.ceil(size * 1.3);
    const s = sample.getContext('2d');
    const particles: Particle[] = [];
    if (s) {
      s.font = type;
      s.fillStyle = '#fff';
      s.fillText(word, 2, size);
      const pixels = s.getImageData(0, 0, sample.width, sample.height).data;
      const step = size > 110 ? 4 : 3;
      const reach = Math.hypot(W, H) * 0.6;
      for (let y = 0; y < sample.height; y += step)
        for (let x = 0; x < sample.width; x += step) {
          if (pixels[(y * sample.width + x) * 4 + 3]! < 140) continue;
          const tx = left + x - 2;
          const ty = baseline - size + y;
          const angle = Math.random() * Math.PI * 2;
          const r = reach + Math.random() * 90;
          const away = Math.atan2(ty - dot.y, tx - dot.x);
          const speed = 260 + Math.random() * 620;
          particles.push({
            tx,
            ty,
            sx: W / 2 + Math.cos(angle) * r,
            sy: H / 2 + Math.sin(angle) * r,
            // Left letters first, so the word forms from left to right.
            delay:
              ((tx - left) / wordWidth) * 0.34 * t.assemble + Math.random() * 0.12 * t.assemble,
            spin: (1.1 + Math.random() * 0.9) * Math.PI,
            vx: Math.cos(away) * speed + (Math.random() - 0.5) * 120,
            vy: Math.sin(away) * speed + (Math.random() - 0.5) * 120 - 80,
          });
        }
    }

    const travel = 0.54 * t.assemble;
    const landed = 0.34 * t.assemble + 0.12 * t.assemble + travel;
    const dropAt = 0.78 * t.assemble;
    const impact = dropAt + FALL_MS;
    const glintAt = Math.max(landed + 140, impact + 150);
    const minimum = glintAt + t.glint;
    const sparks: Spark[] = Array.from({ length: 28 }, () => {
      const a = -Math.PI * (0.08 + Math.random() * 0.84);
      const v = 140 + Math.random() * 360;
      return { x: dot.x, y: dot.y + dotR, vx: Math.cos(a) * v, vy: Math.sin(a) * v };
    });

    const at = (p: Particle, time: number) => {
      const e = easeOut(clamp((time - p.delay) / travel));
      const k = 1 - e;
      const a = p.spin * k;
      const ox = (p.sx - p.tx) * k;
      const oy = (p.sy - p.ty) * k;
      return [
        p.tx + ox * Math.cos(a) - oy * Math.sin(a),
        p.ty + ox * Math.sin(a) + oy * Math.cos(a),
      ];
    };

    const start = performance.now();
    let exitAt: number | null = null;
    let frame = 0;
    const draw = () => {
      const now = performance.now() - start;
      ctx.clearRect(0, 0, W, H);

      if (
        exitAt === null &&
        (skip.current || (now >= minimum && (ready() || now >= minimum + t.wait)))
      ) {
        exitAt = now;
        element.classList.add('opening');
      }
      const u = exitAt === null ? -1 : now - exitAt;

      if (exitAt === null) {
        // Particles swirling in; the crisp word takes over once all have landed.
        const solid = clamp((now - landed) / 140);
        if (solid < 1) {
          // Landed ones in the text colour; flying ones in the accent colour with a short trail
          // (one path each, so hundreds of particles stay cheap without a graphics card).
          const home = new Path2D();
          const heads = new Path2D();
          const trails = new Path2D();
          for (const p of particles) {
            const progress = (now - p.delay) / travel;
            if (progress <= 0) continue;
            const [x, y] = at(p, now) as [number, number];
            if (progress >= 1) {
              home.rect(x, y, 1.8, 1.8);
              continue;
            }
            const [bx, by] = at(p, now - 26) as [number, number];
            trails.moveTo(bx, by);
            trails.lineTo(x, y);
            heads.rect(x - 1, y - 1, 2, 2);
          }
          ctx.globalAlpha = 1 - solid;
          ctx.fillStyle = text;
          ctx.fill(home);
          ctx.strokeStyle = accent;
          ctx.fillStyle = accent;
          ctx.lineWidth = 1.2;
          ctx.globalAlpha = (1 - solid) * 0.7;
          ctx.stroke(trails);
          ctx.globalAlpha = 1 - solid;
          ctx.fill(heads);
        }
        if (solid > 0) {
          ctx.globalAlpha = solid;
          ctx.font = type;
          ctx.fillStyle = text;
          ctx.fillText(word, left, baseline);
        }
        ctx.globalAlpha = 1;

        // The dot: falls, bounces, sends out a wave and sparks.
        if (now >= dropAt) {
          let y = dot.y;
          if (now < impact) y = -dotR + (dot.y + dotR) * ((now - dropAt) / FALL_MS) ** 2;
          else {
            const since = (now - impact) / 1000;
            y = dot.y - 20 * Math.exp(-8 * since) * Math.abs(Math.sin(13 * since));
          }
          ctx.fillStyle = accent;
          ctx.globalAlpha = 0.16;
          ctx.beginPath();
          ctx.arc(dot.x, y, dotR * 2.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(dot.x, y, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
        if (now >= impact) {
          const since = now - impact;
          ctx.strokeStyle = accent;
          for (const [delay, reach] of [
            [0, 260],
            [110, 170],
          ] as const) {
            const p = clamp((since - delay) / 650);
            if (p <= 0 || p >= 1) continue;
            ctx.globalAlpha = (1 - p) ** 1.5 * 0.8;
            ctx.lineWidth = 2 * (1 - p) + 0.5;
            ctx.beginPath();
            ctx.arc(dot.x, dot.y, dotR + reach * easeOut(p), 0, Math.PI * 2);
            ctx.stroke();
          }
          const life = since / 1000;
          if (life < 0.75) {
            ctx.globalAlpha = 1 - life / 0.75;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            for (const k of sparks) {
              const x = k.x + k.vx * life;
              const y = k.y + k.vy * life + 450 * life * life;
              ctx.moveTo(x - k.vx * 0.02, y - (k.vy + 900 * life) * 0.02);
              ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }

        // A glint runs over the word (only where something is drawn).
        const g = clamp((now - glintAt) / t.glint);
        if (g > 0 && g < 1) {
          const x = left - 120 + (wordWidth + 260) * easeInOut(g);
          const band = ctx.createLinearGradient(x - 60, 0, x + 60, 0);
          band.addColorStop(0, 'rgba(255,255,255,0)');
          band.addColorStop(0.5, 'rgba(255,255,255,0.85)');
          band.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.save();
          ctx.globalCompositeOperation = 'source-atop';
          ctx.transform(1, 0, -0.35, 1, baseline * 0.35, 0);
          ctx.fillStyle = band;
          ctx.fillRect(x - 60, baseline - size, 120, size * 1.3);
          ctx.restore();
        }
      } else {
        // Opening: the dot pulses, then opens like a portal into the app; the word bursts apart.
        const hole =
          easeIn(clamp((u - HOLE_FROM) / (EXIT_MS - HOLE_FROM))) * (Math.hypot(W, H) + 60);
        element.style.setProperty('--hole', `${hole}px`);
        const life = u / 1000;
        ctx.fillStyle = text;
        ctx.globalAlpha = 1 - clamp(u / 520);
        ctx.beginPath();
        for (const p of particles) {
          const x = p.tx + p.vx * life;
          const y = p.ty + p.vy * life + 300 * life * life;
          ctx.rect(x, y, 1.8, 1.8);
        }
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = accent;
        ctx.strokeStyle = accent;
        ctx.beginPath();
        if (hole < dotR) {
          // The dot swells once before it opens.
          const pulse = 1 + 0.45 * Math.sin(Math.PI * clamp(u / HOLE_FROM));
          ctx.arc(dot.x, dot.y, dotR * pulse, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // A glowing rim just outside the opening.
          ctx.lineWidth = 3;
          ctx.globalAlpha = 1 - clamp((u - HOLE_FROM) / (EXIT_MS - HOLE_FROM));
          ctx.arc(dot.x, dot.y, hole + 3, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        if (u >= EXIT_MS) {
          done();
          return;
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      stopKeys();
      cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- starts once; sources and onDone are read through `latest`
  }, []);

  const count = sources.filter((s) => s.ready).length;
  return (
    <div
      ref={root}
      className="start-screen"
      style={{ '--status-delay': `${Math.round(t.assemble * 0.35)}ms` } as CSSProperties}
      role="status"
      aria-label="blank. startet"
      onPointerDown={() => {
        skip.current = true;
      }}
    >
      <canvas ref={canvas} aria-hidden />
      {sources.length > 0 && (
        <div className="start-status">
          <span className="start-bar">
            <span style={{ width: `${(count / sources.length) * 100}%` }} />
          </span>
          <span className="start-sources">
            {sources.map((source) => (
              <span key={source.name} data-ready={source.ready}>
                {source.name}
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}
