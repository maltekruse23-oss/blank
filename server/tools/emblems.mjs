// Prepares the tier emblems (src/features/aram/emblems/*.png) from the drafts: removes a baked-in
// checkerboard, crops to the emblem, pads to a square, writes 256 px RGBA PNGs. No libraries.
// node server/tools/emblems.mjs <folder with 1-D.png … 8-MAYHEM.png> src/features/aram/emblems
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { inflateSync, deflateSync, crc32 } from 'node:zlib';

const [, , from, to, sizeArg = '256'] = process.argv;
const SIZE = Number(sizeArg);
mkdirSync(to, { recursive: true });

function decode(buf) {
  let pos = 8;
  let w, h, type;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const name = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (name === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      type = data[9];
      if (data[8] !== 8 || data[12] !== 0) throw new Error('nur 8 Bit, ohne Interlace');
    } else if (name === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const bpp = type === 6 ? 4 : type === 2 ? 3 : 0;
  if (!bpp) throw new Error('Farbtyp ' + type);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let add = 0;
      if (f === 1) add = a;
      else if (f === 2) add = b;
      else if (f === 3) add = (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a),
          pb = Math.abs(p - b),
          pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = (line[x] + add) & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      out[o] = line[x * bpp];
      out[o + 1] = line[x * bpp + 1];
      out[o + 2] = line[x * bpp + 2];
      out[o + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { w, h, px: out };
}

function encode(w, h, px) {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const chunk = (name, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(name, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const file of readdirSync(from).filter((f) => f.endsWith('.png'))) {
  const { w, h, px } = decode(readFileSync(`${from}/${file}`));
  const lum = new Float32Array(w * h);
  const chroma = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = px[i * 4],
      g = px[i * 4 + 1],
      b = px[i * 4 + 2];
    lum[i] = (r + g + b) / 3;
    chroma[i] = Math.max(r, g, b) - Math.min(r, g, b);
  }
  // A plain magenta backdrop (asked for so): keyed out by how magenta a pixel is, the magenta
  // tint on the edges taken off. Otherwise a baked-in checkerboard.
  const keyed = px[0] > 200 && px[1] < 90 && px[2] > 200;
  const bg = new Uint8Array(w * h);
  if (keyed) {
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      const spill = Math.max(0, Math.min(px[o], px[o + 2]) - px[o + 1]);
      const alpha = Math.max(0, Math.min(1, 1 - (spill - 60) / 140));
      px[o] -= spill;
      px[o + 2] -= spill;
      px[o + 3] = Math.round(alpha * 255);
      if (alpha === 0) bg[i] = 1;
    }
  } else {
    // The two grey levels of the checkerboard, from the top left corner (two-means).
    const corner = [];
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) corner.push(lum[y * w + x]);
    let lo = Math.min(...corner),
      hi = Math.max(...corner);
    for (let n = 0; n < 10; n++) {
      const mid = (lo + hi) / 2;
      const a = corner.filter((v) => v < mid),
        b = corner.filter((v) => v >= mid);
      lo = a.reduce((s, v) => s + v, 0) / (a.length || 1);
      hi = b.reduce((s, v) => s + v, 0) / (b.length || 1);
    }
    const tol = Math.max(18, (hi - lo) * 0.35);
    const level = (i) =>
      chroma[i] > 24 ? -1 : Math.abs(lum[i] - lo) < tol ? 0 : Math.abs(lum[i] - hi) < tol ? 1 : -1;
    // Checker texture: along a line through the pixel, nearly all samples are one of the two levels
    // and the level changes a few times (flat white letters and silver gradients do not).
    const R = 16;
    const texture = (x, y, dx, dy) => {
      let on = 0,
        flips = 0,
        last = -1,
        n = 0;
      for (let t = -R; t <= R; t++) {
        const xx = x + dx * t,
          yy = y + dy * t;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        n++;
        const l = level(yy * w + xx);
        if (l < 0) continue;
        on++;
        if (last >= 0 && l !== last) flips++;
        last = l;
      }
      return on >= n * 0.8 && flips >= 2;
    };
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (level(i) >= 0 && texture(x, y, 1, 0) && texture(x, y, 0, 1)) bg[i] = 1;
      }
    // The squares' blurred edges and faint noise lie right next to found backdrop: grow into grey
    // pixels a few steps (never far, so white letters inside the emblem stay).
    for (let pass = 0; pass < 4; pass++) {
      const grow = [];
      for (let i = 0; i < w * h; i++) {
        if (bg[i] || chroma[i] > 30 || lum[i] < lo - tol * 1.6 || lum[i] > hi + tol) continue;
        const x = i % w,
          y = (i / w) | 0;
        if (
          (x > 0 && bg[i - 1]) ||
          (x < w - 1 && bg[i + 1]) ||
          (y > 0 && bg[i - w]) ||
          (y < h - 1 && bg[i + w])
        )
          grow.push(i);
      }
      for (const i of grow) bg[i] = 1;
    }
  }
  // Everything not connected to the emblem's big body is crumbs of the backdrop (noise, square
  // edges, a frame line at the image border): only large opaque pieces stay.
  const seen = new Uint8Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (bg[start] || seen[start]) continue;
    const piece = [start];
    seen[start] = 1;
    for (let k = 0; k < piece.length; k++) {
      const i = piece[k],
        x = i % w,
        y = (i / w) | 0;
      for (const j of [
        x > 0 ? i - 1 : -1,
        x < w - 1 ? i + 1 : -1,
        y > 0 ? i - w : -1,
        y < h - 1 ? i + w : -1,
      ])
        if (j >= 0 && !bg[j] && !seen[j]) ((seen[j] = 1), piece.push(j));
    }
    const touches = piece.some((i) => {
      const x = i % w,
        y = (i / w) | 0;
      return x < 3 || y < 3 || x > w - 4 || y > h - 4;
    });
    if (piece.length < (w * h) / 400 || (touches && piece.length < (w * h) / 20))
      for (const i of piece) bg[i] = 1;
  }
  // Soft edge: pixels next to the backdrop get alpha by how grey-light they still are.
  let minX = w,
    minY = h,
    maxX = 0,
    maxY = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x,
        o = i * 4;
      if (bg[i]) {
        px[o + 3] = 0;
        continue;
      }
      let near = 0;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx,
            yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && bg[yy * w + xx])
            near = Math.max(near, 3 - Math.max(Math.abs(dx), Math.abs(dy)));
        }
      if (near && !keyed) {
        const r = px[o],
          g = px[o + 1],
          b = px[o + 2];
        const light = (Math.min(r, g, b) - 90) / 140;
        const grey = 1 - (Math.max(r, g, b) - Math.min(r, g, b)) / 60;
        const fade = Math.max(0, Math.min(1, light)) * Math.max(0, Math.min(1, grey));
        px[o + 3] = Math.round(255 * (1 - fade * (near / 2)));
      }
      if (px[o + 3] > 40) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  // Square around the emblem with 4 % room, then an area-average down to SIZE (premultiplied).
  const side = Math.round(Math.max(maxX - minX + 1, maxY - minY + 1) * 1.08);
  const cx = (minX + maxX + 1) / 2,
    cy = (minY + maxY + 1) / 2;
  const sx0 = cx - side / 2,
    sy0 = cy - side / 2;
  const out = Buffer.alloc(SIZE * SIZE * 4);
  const k = side / SIZE;
  for (let oy = 0; oy < SIZE; oy++)
    for (let ox = 0; ox < SIZE; ox++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        n = 0;
      const x0 = Math.floor(sx0 + ox * k),
        x1 = Math.floor(sx0 + (ox + 1) * k);
      const y0 = Math.floor(sy0 + oy * k),
        y1 = Math.floor(sy0 + (oy + 1) * k);
      for (let y = y0; y < Math.max(y1, y0 + 1); y++)
        for (let x = x0; x < Math.max(x1, x0 + 1); x++) {
          n++;
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const o = (y * w + x) * 4,
            al = px[o + 3];
          r += px[o] * al;
          g += px[o + 1] * al;
          b += px[o + 2] * al;
          a += al;
        }
      const o = (oy * SIZE + ox) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
        out[o + 3] = Math.round(a / n);
      }
    }
  const name = file.replace(/^\d+-/, '').toLowerCase();
  writeFileSync(`${to}/${name}`, encode(SIZE, SIZE, out));
  const share = bg.reduce((s, v) => s + v, 0) / (w * h);
  console.log(
    `${file} → ${name}: Hintergrund ${(share * 100).toFixed(0)} %, Emblem ${maxX - minX + 1}×${maxY - minY + 1}`,
  );
}

// Stand-in for D until its picture comes: C in dull grey.
if (!readdirSync(from).some((f) => /-D\.png$/i.test(f))) {
  const { w, h, px } = decode(readFileSync(`${to}/c.png`));
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const l = Math.round((0.3 * px[o] + 0.59 * px[o + 1] + 0.11 * px[o + 2]) * 0.75);
    px[o] = l;
    px[o + 1] = l;
    px[o + 2] = Math.min(255, l + 6);
  }
  writeFileSync(`${to}/d.png`, encode(w, h, px));
  console.log('d.png: Platzhalter aus C in Grau');
}
