// The X and coming back (user's wish: an animation every time, "can be very fancy"). Like an old
// TV: closing, the app flashes, folds into a glowing line, then into a dot that shoots off to the
// bottom right (where the icon in the notification area is); opening, the dot flies back in,
// opens into a line with a shockwave and sparks and the app springs open. The window stays opaque
// throughout (the body keeps its background). Only with "Animationen"; each run ends by itself.

/** Colours of the scheme (tokens), never fixed ones. */
function colors() {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string) => style.getPropertyValue(name).trim();
  return { accent: read('--accent') || 'currentColor', text: read('--text') || 'currentColor' };
}

type Spark = { x: number; y: number; vx: number; vy: number; life: number; size: number };

/** A canvas over the whole window, sized for sharp drawing; the drawing context in CSS pixels. */
function prepare(canvas: HTMLCanvasElement) {
  const { width, height } = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext('2d');
  context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, width, height };
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
/** Part of a timeline: 0 before `from`, 1 after `to`. */
const part = (t: number, from: number, to: number) => clamp((t - from) / (to - from));
const easeIn = (t: number) => t * t * t;
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Runs `draw(t)` for `ms` milliseconds (t from 0 to 1), then clears the canvas. */
function run(canvas: HTMLCanvasElement, ms: number, draw: (t: number) => void) {
  return new Promise<void>((resolve) => {
    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      draw(t);
      if (t < 1) requestAnimationFrame(frame);
      else {
        const context = canvas.getContext('2d');
        context?.clearRect(0, 0, canvas.width, canvas.height);
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}

/** A glowing dot with a white-hot core. */
function dot(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  accent: string,
  core: string,
) {
  context.save();
  context.globalCompositeOperation = 'lighter';
  context.shadowColor = accent;
  context.shadowBlur = r * 4;
  context.fillStyle = accent;
  context.beginPath();
  context.arc(x, y, r, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = r * 1.5;
  context.fillStyle = core;
  context.beginPath();
  context.arc(x, y, r * 0.45, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawSparks(context: CanvasRenderingContext2D, sparks: Spark[], color: string, dt: number) {
  context.save();
  context.globalCompositeOperation = 'lighter';
  context.fillStyle = color;
  context.shadowColor = color;
  context.shadowBlur = 6;
  for (const s of sparks) {
    if (s.life <= 0) continue;
    s.life -= dt;
    s.vy += 0.05 * dt;
    s.vx *= 0.98;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    context.globalAlpha = clamp(s.life / 25);
    context.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
  }
  context.restore();
}

const spark = (x: number, y: number, angle: number, speed: number): Spark => ({
  x,
  y,
  vx: Math.cos(angle) * speed,
  vy: Math.sin(angle) * speed,
  life: 20 + Math.random() * 30,
  size: 1.5 + Math.random() * 2,
});

const CLOSE_MS = 780;
const OPEN_MS = 950;

/** Closing: flash, line, dot, off to the bottom right. The app stays folded afterwards. */
export async function playClose(app: HTMLElement, canvas: HTMLCanvasElement) {
  const { accent, text } = colors();
  const { context, width, height } = prepare(canvas);
  app.getAnimations().forEach((a) => a.cancel());
  app.animate(
    [
      { transform: 'scale(1, 1)', filter: 'brightness(1)', offset: 0 },
      { transform: 'scale(1.015, 1.015)', filter: 'brightness(1.3)', offset: 0.12 },
      { transform: 'scale(1.05, 0.006)', filter: 'brightness(3)', offset: 0.5 },
      { transform: 'scale(0.004, 0.006)', filter: 'brightness(4)', offset: 0.72 },
      { transform: 'scale(0, 0)', filter: 'brightness(4)', offset: 0.78 },
      { transform: 'scale(0, 0)', filter: 'brightness(4)', offset: 1 },
    ],
    { duration: CLOSE_MS, easing: 'cubic-bezier(0.55, 0, 0.45, 1)', fill: 'forwards' },
  );
  if (!context) return new Promise<void>((r) => setTimeout(r, CLOSE_MS));
  const center = { x: width / 2, y: height / 2 };
  const target = { x: width + 30, y: height + 30 };
  const sparks: Spark[] = [];
  const trail: { x: number; y: number }[] = [];
  let last = performance.now();
  return run(canvas, CLOSE_MS, (t) => {
    const now = performance.now();
    const dt = Math.min(3, (now - last) / 16.7);
    last = now;
    context.clearRect(0, 0, width, height);
    // The glowing line while the app folds into it.
    const line = part(t, 0.35, 0.5) * (1 - part(t, 0.62, 0.74));
    if (line > 0) {
      const half = (width / 2) * 1.05 * (1 - part(t, 0.5, 0.72));
      const gradient = context.createLinearGradient(center.x - half, 0, center.x + half, 0);
      gradient.addColorStop(0, 'transparent');
      gradient.addColorStop(0.5, text);
      gradient.addColorStop(1, 'transparent');
      context.save();
      context.globalAlpha = line;
      context.shadowColor = accent;
      context.shadowBlur = 24;
      context.fillStyle = gradient;
      context.fillRect(center.x - half, center.y - 1.5, half * 2, 3);
      context.restore();
    }
    // The dot, then its flight with a trail and sparks.
    const glow = part(t, 0.62, 0.72);
    if (glow > 0) {
      const fly = easeIn(part(t, 0.78, 1));
      const x = center.x + (target.x - center.x) * fly;
      const y = center.y + (target.y - center.y) * fly;
      if (fly > 0) {
        trail.push({ x, y });
        if (trail.length > 14) trail.shift();
        for (let i = 0; i < 3; i++)
          sparks.push(
            spark(
              x,
              y,
              Math.atan2(center.y - y, center.x - x) + (Math.random() - 0.5),
              1 + Math.random() * 3,
            ),
          );
      }
      trail.forEach((p, i) => {
        context.save();
        context.globalAlpha = (i / trail.length) * 0.5;
        dot(context, p.x, p.y, 3 + i * 0.3, accent, text);
        context.restore();
      });
      dot(context, x, y, 4 + glow * 5, accent, text);
    }
    drawSparks(context, sparks, accent, dt);
  });
}

/** Opening: the dot flies back in, opens into a line with a shockwave, the app springs open. */
export async function playOpen(app: HTMLElement, canvas: HTMLCanvasElement) {
  const { accent, text } = colors();
  const { context, width, height } = prepare(canvas);
  app.getAnimations().forEach((a) => a.cancel());
  const animation = app.animate(
    [
      { transform: 'scale(0, 0)', filter: 'brightness(4)', offset: 0 },
      { transform: 'scale(0, 0)', filter: 'brightness(4)', offset: 0.26 },
      { transform: 'scale(0.004, 0.006)', filter: 'brightness(4)', offset: 0.28 },
      { transform: 'scale(1.06, 0.006)', filter: 'brightness(3)', offset: 0.46 },
      { transform: 'scale(0.985, 1.035)', filter: 'brightness(1.5)', offset: 0.74 },
      { transform: 'scale(1.005, 0.995)', filter: 'brightness(1.1)', offset: 0.88 },
      { transform: 'scale(1, 1)', filter: 'brightness(1)', offset: 1 },
    ],
    { duration: OPEN_MS, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
  );
  const center = { x: width / 2, y: height / 2 };
  const from = { x: width + 30, y: height + 30 };
  const sparks: Spark[] = [];
  const trail: { x: number; y: number }[] = [];
  let burst = false;
  let last = performance.now();
  const drawing = context
    ? run(canvas, OPEN_MS, (t) => {
        const now = performance.now();
        const dt = Math.min(3, (now - last) / 16.7);
        last = now;
        context.clearRect(0, 0, width, height);
        // The dot flies in from the bottom right.
        const fly = easeOut(part(t, 0, 0.26));
        if (t < 0.3) {
          const x = from.x + (center.x - from.x) * fly;
          const y = from.y + (center.y - from.y) * fly;
          trail.push({ x, y });
          if (trail.length > 14) trail.shift();
          trail.forEach((p, i) => {
            context.save();
            context.globalAlpha = (i / trail.length) * 0.5;
            dot(context, p.x, p.y, 3 + i * 0.3, accent, text);
            context.restore();
          });
          dot(context, x, y, 5 + fly * 4, accent, text);
        }
        // It opens into a line: sparks off both ends, then a shockwave through the window.
        const line = part(t, 0.26, 0.46);
        if (line > 0 && t < 0.62) {
          const half = (width / 2) * 1.06 * easeOut(line);
          const gradient = context.createLinearGradient(center.x - half, 0, center.x + half, 0);
          gradient.addColorStop(0, 'transparent');
          gradient.addColorStop(0.5, text);
          gradient.addColorStop(1, 'transparent');
          context.save();
          context.globalAlpha = 1 - part(t, 0.46, 0.62);
          context.shadowColor = accent;
          context.shadowBlur = 26;
          context.fillStyle = gradient;
          context.fillRect(center.x - half, center.y - 1.5, half * 2, 3);
          context.restore();
          if (t < 0.46)
            for (const side of [-1, 1])
              sparks.push(
                spark(
                  center.x + side * half,
                  center.y,
                  side > 0 ? (Math.random() - 0.5) * 0.9 : Math.PI + (Math.random() - 0.5) * 0.9,
                  2 + Math.random() * 4,
                ),
              );
        }
        if (!burst && t >= 0.46) {
          burst = true;
          for (let i = 0; i < 70; i++)
            sparks.push(
              spark(
                center.x + (Math.random() - 0.5) * width * 0.8,
                center.y,
                (Math.random() < 0.5 ? -1 : 1) * (Math.PI / 2) + (Math.random() - 0.5) * 1.2,
                1 + Math.random() * 5,
              ),
            );
        }
        const wave = part(t, 0.46, 0.9);
        if (wave > 0 && wave < 1) {
          context.save();
          context.globalCompositeOperation = 'lighter';
          context.globalAlpha = (1 - wave) * 0.8;
          context.strokeStyle = accent;
          context.shadowColor = accent;
          context.shadowBlur = 18;
          context.lineWidth = 3 * (1 - wave) + 1;
          context.beginPath();
          context.ellipse(
            center.x,
            center.y,
            easeOut(wave) * width * 0.7,
            easeOut(wave) * height * 0.7,
            0,
            0,
            Math.PI * 2,
          );
          context.stroke();
          context.restore();
        }
        drawSparks(context, sparks, accent, dt);
      })
    : Promise.resolve();
  await Promise.all([animation.finished.catch(() => undefined), drawing]);
  // Back to normal: no transform left on the app (fixed parts, tilting cards).
  animation.cancel();
}

/** Without motion: the app simply as it is (after a close with motion, it stays folded). */
export function resetWindowFx(app: HTMLElement) {
  app.getAnimations().forEach((a) => a.cancel());
}
