'use strict';

// electron scripts/sprites.js <in folder> : cuts each picture out of its white background, trims them all
// the same way (feet on the bottom line) and writes them to assets/l/. Only what touches the outside
// through white goes: his white shirt stays because its ink line closes it.
const fs = require('node:fs');
const path = require('node:path');
const { app, nativeImage } = require('electron');

const SIZE = 700;     // his pictures, square, once trimmed
const WHITE = 238;    // lighter than this on all three channels: paper
const BAND = 2;       // pixels past the paper where the ink gets anti-aliased
// paper closed in by his body, and his eyes (not paper, however white), where the source pictures have them
const HOLES = { thumb: [[830, 469]], eat: [[802, 444]], berry: [[830, 493]], idle: [], stride: [], stand: [], sit: [] };
const EYES = { thumb: [[800, 263], [876, 280]], eat: [[758, 243], [831, 264]], berry: [[800, 256], [881, 272]], idle: [[722, 249], [813, 260]], stride: [[892, 188], [935, 200]], stand: [[845, 177], [885, 187]], sit: [[713, 210], [770, 227]] };
// standing or sitting he was drawn from further away: how much bigger than the others he comes out, so his
// head stays close to the size it has crouched, and how big his eyes are in the source picture
const ZOOM = { stride: 1.67, stand: 1.67, sit: 1.2 };
const FACE = { stride: 0.52, stand: 0.52, sit: 0.72 };
const HEAD_ROWS = { stride: 300, stand: 290, sit: 330 }; // above this, small white gaps are between strands of hair (400 otherwise)
const GAP = 1800;      // ...and no bigger than this
const HAIR_FROM = { thumb: 605, eat: 570, berry: 625, idle: 580, stride: 760, stand: 720, sit: 640 }; // right of this and high enough, only hair
const HAIR_ROWS = { stride: 270, stand: 260, sit: 290 }; // (345 otherwise)
const MARGIN = 14;     // room for his line

// The pictures are too much of an illustration for a desktop: same pose and same face, but flat colours
// and a thick line, so he reads at his size.
const COLOURS = {
  ink: [20, 19, 26], hair: [14, 15, 21], shine: [52, 70, 94], edge: [70, 86, 111], ring: [118, 102, 118], sclera: [246, 245, 241],
  skin: [246, 236, 223], skin2: [220, 198, 179], skin3: [169, 143, 128],
  shirt: [247, 247, 243], shirt2: [198, 202, 212], shirt3: [141, 147, 163], crease: [150, 155, 170],
  jeans: [123, 166, 196], jeans2: [95, 140, 172], jeans3: [63, 107, 143],
  red: [214, 52, 63], red2: [143, 31, 42], leaf: [78, 154, 75], mouth: [109, 58, 62],
};
// hair tips over his collar, which turn into black marks once flattened
const ERASE = { eat: [[555, 322, 600, 392]], berry: [[610, 338, 656, 455]] };
const FOLD = 11;     // how much darker than around it a fold of his shirt is
const SHIRT = { stride: 226, stand: 226 }; // lighter than this, his shirt is white (188 otherwise)
const OUTLINE = 7;   // his line, in pixels of the source pictures at zoom 1
const SMOOTH = 4;    // how much detail goes
const TONE = 9;      // a speck of another tone smaller than this goes
const THIN = 2;      // what's thinner than twice this falls off his outline: stray wisps of hair

// Kuwahara: each pixel takes the calmest of the four squares around it, which flattens without blurring edges
function flatten(px, w, h, SMOOTH) {
  const W = w + 1;
  const sums = [0, 1, 2].map(() => new Float64Array(W * (h + 1)));
  const lum = new Float64Array(W * (h + 1));
  const lum2 = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const a = px[o + 3] / 255;
      const v = [0, 1, 2].map((c) => px[o + c] * a + 255 * (1 - a));
      const l = 0.11 * v[0] + 0.59 * v[1] + 0.3 * v[2];
      const at = (y + 1) * W + x + 1;
      for (const c of [0, 1, 2]) sums[c][at] = v[c] + sums[c][at - 1] + sums[c][at - W] - sums[c][at - W - 1];
      lum[at] = l + lum[at - 1] + lum[at - W] - lum[at - W - 1];
      lum2[at] = l * l + lum2[at - 1] + lum2[at - W] - lum2[at - W - 1];
    }
  }
  const box = (t, x0, y0, x1, y1) => t[y1 * W + x1] - t[y0 * W + x1] - t[y1 * W + x0] + t[y0 * W + x0];
  const out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = Infinity;
      let pick = null;
      for (const [ax, ay] of [[x - SMOOTH, y - SMOOTH], [x, y - SMOOTH], [x - SMOOTH, y], [x, y]]) {
        const x0 = Math.max(0, ax);
        const y0 = Math.max(0, ay);
        const x1 = Math.min(w, ax + SMOOTH + 1);
        const y1 = Math.min(h, ay + SMOOTH + 1);
        const n = (x1 - x0) * (y1 - y0);
        const m = box(lum, x0, y0, x1, y1) / n;
        const s = box(lum2, x0, y0, x1, y1) / n - m * m;
        if (s < best) { best = s; pick = [x0, y0, x1, y1, n]; }
      }
      const [x0, y0, x1, y1, n] = pick;
      for (const c of [0, 1, 2]) out[(y * w + x) * 3 + c] = box(sums[c], x0, y0, x1, y1) / n;
    }
  }
  return out;
}

function colourOf(b, g, r, high, shirt = 188) {
  const l = 0.11 * b + 0.59 * g + 0.3 * r;
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  if (r > g + 55 && r > b + 55) return r > 150 ? 'red' : 'red2';
  if (g > r + 22 && g > b + 12) return 'leaf';
  if (r > g + 26 && l < 150) return 'mouth';
  if (l < 58) return 'hair';
  if (l < 112 && sat < 24 && high) return 'shine';
  if (b > r + 9) return l > 125 ? 'jeans2' : 'jeans3';
  if (r - b >= 9) return l > 208 ? 'skin' : l > 165 ? 'skin2' : 'skin3';
  return l > shirt ? 'shirt' : l > 110 ? 'shirt2' : l > 80 ? 'shirt3' : 'ink';
}

function stylize(px, w, h, name) {
  const zoom = ZOOM[name] || 1;
  const face = FACE[name] || 1;
  const flat = flatten(px, w, h, Math.max(2, Math.round(SMOOTH / zoom)));
  const OUT = Math.round(OUTLINE / zoom);
  const FLAT = TONE;
  const WISP = Math.max(1, Math.round(THIN / zoom));
  const NEAR = 175 * face;
  const headRows = HEAD_ROWS[name] || 400;
  const eyes = EYES[name] || [];
  const inside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) inside[i] = px[i * 4 + 3] > 128 ? 1 : 0;

  // the ink of the picture: darker than what's around it, in strokes long enough not to be hatching
  const line = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!inside[i]) continue;
      const l = 0.11 * px[i * 4] + 0.59 * px[i * 4 + 1] + 0.3 * px[i * 4 + 2];
      const f = 0.11 * flat[i * 3] + 0.59 * flat[i * 3 + 1] + 0.3 * flat[i * 3 + 2];
      const close = eyes.some(([ex, ey]) => Math.hypot(ex - x, ey - y) < NEAR);
      if (close ? l < f - 16 && l < 200 : l < f - 42 && l < 135) line[i] = 1;
    }
  }
  const seen = new Uint8Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (!line[s] || seen[s]) continue;
    const part = [s];
    seen[s] = 1;
    for (let k = 0; k < part.length; k++) {
      const i = part[k];
      for (const n of [i - 1, i + 1, i - w, i + w, i - w - 1, i - w + 1, i + w - 1, i + w + 1]) {
        if (n >= 0 && n < w * h && line[n] && !seen[n]) { seen[n] = 1; part.push(n); }
      }
    }
    const mid = part[0];
    const close = eyes.some(([ex, ey]) => Math.hypot(ex - (mid % w), ey - Math.floor(mid / w)) < NEAR);
    if (part.length < (close ? 12 : 70)) for (const i of part) line[i] = 0;
  }

  // square filters on a mask, through a summed table
  const table = (mask) => {
    const t = new Int32Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const at = (y + 1) * (w + 1) + x + 1;
        t[at] = mask[y * w + x] + t[at - 1] + t[at - w - 1] - t[at - w - 2];
      }
    }
    return t;
  };
  const count = (t, x, y, r) => {
    const x0 = Math.max(0, x - r);
    const y0 = Math.max(0, y - r);
    const x1 = Math.min(w, x + r + 1);
    const y1 = Math.min(h, y + r + 1);
    const W = w + 1;
    return t[y1 * W + x1] - t[y0 * W + x1] - t[y1 * W + x0] + t[y0 * W + x0];
  };
  // no stray wisps: what survives eating into the shape, then growing back
  const inTable = table(inside);
  const core = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (count(inTable, x, y, WISP) === (WISP * 2 + 1) ** 2) core[y * w + x] = 1;
  }
  const coreTable = table(core);
  const solid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (count(coreTable, x, y, WISP) > 0) solid[y * w + x] = 1;
  }

  const erased = (x, y) => (ERASE[name] || []).some(([a, b, d, e]) => x >= a && x <= d && y >= b && y <= e);
  const hairy = new Uint8Array(w * h);
  const names = new Array(w * h);
  // standing, the arm in his pocket is only a faint line on his shirt: it stays, in the shirt's own shadow
  const fold = new Uint8Array(w * h);
  if (zoom > 1) {
    const R = 9;
    const lums = new Int32Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const at = (y + 1) * (w + 1) + x + 1;
        const l = inside[i] ? 0.11 * px[i * 4] + 0.59 * px[i * 4 + 1] + 0.3 * px[i * 4 + 2] : 255;
        lums[at] = l + lums[at - 1] + lums[at - w - 1] - lums[at - w - 2];
      }
    }
    for (let y = R; y < h - R; y++) {
      for (let x = R; x < w - R; x++) {
        const i = y * w + x;
        if (!inside[i] || line[i]) continue;
        const l = 0.11 * px[i * 4] + 0.59 * px[i * 4 + 1] + 0.3 * px[i * 4 + 2];
        const W = w + 1;
        const mean = (lums[(y + R + 1) * W + x + R + 1] - lums[(y - R) * W + x + R + 1] - lums[(y + R + 1) * W + x - R] + lums[(y - R) * W + x - R]) / (R * 2 + 1) ** 2;
        if (mean > 175 && l < mean - FOLD) fold[i] = 1;
      }
    }
    const met = new Uint8Array(w * h);
    for (let s = 0; s < w * h; s++) {
      if (!fold[s] || met[s]) continue;
      const part = [s];
      met[s] = 1;
      for (let k = 0; k < part.length; k++) {
        const i = part[k];
        for (const n of [i - 1, i + 1, i - w, i + w, i - w - 1, i - w + 1, i + w - 1, i + w + 1]) {
          if (n >= 0 && n < w * h && fold[n] && !met[n]) { met[n] = 1; part.push(n); }
        }
      }
      if (part.length < 110) for (const i of part) fold[i] = 0;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!solid[i]) continue;
      // his eyes keep their detail: black, white, and the hollow around them. Only there.
      const eye = eyes.findIndex(([ex, ey], k) => Math.hypot(ex - x, ey - y) < (k ? 44 : 54) * face);
      let c;
      if (eye >= 0) {
        const [ex, ey] = eyes[eye];
        const l = 0.11 * px[i * 4] + 0.59 * px[i * 4 + 1] + 0.3 * px[i * 4 + 2];
        const white = Math.hypot(ex - x, ey - y) < (eye ? 30 : 38) * face;
        c = l < 70 ? 'hair' : l > 185 ? (white ? 'sclera' : 'skin') : l > 150 ? 'skin2' : 'ring';
      } else c = line[i] ? 'ink' : colourOf(flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2], y < headRows, SHIRT[name]);
      if (erased(x, y) && (c === 'hair' || c === 'ink' || c === 'shine')) c = 'shirt';
      if (fold[i] && (c === 'shirt' || c === 'shirt2')) c = 'crease';
      names[i] = c;
      if (c === 'hair' || c === 'shine') hairy[i] = 1;
    }
  }
  // each patch of colour swallows the specks inside it: flat means flat
  for (const family of [['jeans', 'jeans2', 'jeans3'], ['shirt', 'shirt2', 'shirt3'], ['skin', 'skin2', 'skin3']]) {
    const tables = family.map((c) => table(Uint8Array.from(names, (n) => (n === c ? 1 : 0))));
    const next = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!family.includes(names[i])) continue;
        let best = -1;
        let pick = names[i];
        family.forEach((c, k) => {
          const n = count(tables[k], x, y, FLAT);
          if (n > best) { best = n; pick = c; }
        });
        if (pick !== names[i]) next.push([i, pick]);
      }
    }
    for (const [i, c] of next) names[i] = c;
  }
  const solidTable = table(solid);
  const hairTable = table(hairy);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = i * 4;
      let c = names[i];
      if (!c && erased(x, y)) c = 'shirt';
      if (!c) {
        if (count(solidTable, x, y, OUT) === 0) { px[o] = px[o + 1] = px[o + 2] = px[o + 3] = 0; continue; }
        // around his hair, a lighter line: he stays readable over a dark window
        c = count(hairTable, x, y, OUT) > (OUT * 2 + 1) ** 2 * 0.2 ? 'edge' : 'ink';
      }
      const [r, g, b] = COLOURS[c];
      px[o] = b; px[o + 1] = g; px[o + 2] = r; px[o + 3] = 255;
    }
  }
  return shutEyes(px, names, w, eyes, face);
}

// the same picture with no eyes, only skin where they were: what his eyelids are made of. The hair falling
// over them stays where it reaches the edge of the eye; what's black in the middle is the eye itself.
function shutEyes(px, names, w, eyes, face) {
  const shut = Buffer.from(px);
  // what's his eye and nothing else, painted white: body.js moves a pupil around on it
  const eye = Buffer.alloc(px.length);
  const irises = [];
  const [wr, wg, wb] = COLOURS.sclera;
  const [r, g, b] = COLOURS.skin;
  eyes.forEach(([ex, ey], k) => {
    const R = Math.round((k ? 44 : 54) * face);
    const eyeball = (k ? 16 : 20) * face;
    const inDisc = (i) => Math.hypot(ex - (i % w), ey - Math.floor(i / w)) < R;
    const kept = new Set();
    const stack = [];
    for (let y = ey - R; y <= ey + R; y++) {
      for (let x = ex - R; x <= ex + R; x++) {
        const i = y * w + x;
        if (!inDisc(i) || names[i] !== 'hair') continue;
        if ([i - 1, i + 1, i - w, i + w].some((n) => !inDisc(n))) { kept.add(i); stack.push(i); }
      }
    }
    while (stack.length) {
      const i = stack.pop();
      for (const n of [i - 1, i + 1, i - w, i + w]) {
        if (inDisc(n) && names[n] === 'hair' && !kept.has(n)) { kept.add(n); stack.push(n); }
      }
    }
    const whiteR = (k ? 30 : 38) * face;
    let sx = 0; let sy = 0; let n = 0;
    for (let y = ey - R; y <= ey + R; y++) {
      for (let x = ex - R; x <= ex + R; x++) {
        const i = y * w + x;
        const d = Math.hypot(ex - x, ey - y);
        if (!inDisc(i) || d >= whiteR) continue;
        const hair = names[i] === 'hair' && !(kept.has(i) && d > eyeball);
        if (hair) { sx += x; sy += y; n++; }
        if (hair || names[i] === 'sclera' || (names[i] === 'ring' && d < whiteR * 0.6)) {
          eye[i * 4] = wb; eye[i * 4 + 1] = wg; eye[i * 4 + 2] = wr; eye[i * 4 + 3] = 255;
        }
      }
    }
    irises.push({ x: sx / (n || 1), y: sy / (n || 1), r: Math.sqrt(n / Math.PI), white: whiteR });
    for (let y = ey - R; y <= ey + R; y++) {
      for (let x = ex - R; x <= ex + R; x++) {
        const i = y * w + x;
        if (!inDisc(i) || !names[i] || (kept.has(i) && Math.hypot(ex - x, ey - y) > eyeball)) continue;
        shut[i * 4] = b; shut[i * 4 + 1] = g; shut[i * 4 + 2] = r;
      }
    }
  });
  return { shut, eye, irises };
}

function cut(file, name) {
  const image = nativeImage.createFromPath(file);
  const { width: w, height: h } = image.getSize();
  const px = Buffer.from(image.toBitmap()); // BGRA
  const paper = new Uint8Array(w * h);
  const light = (i) => px[i * 4] >= WHITE && px[i * 4 + 1] >= WHITE && px[i * 4 + 2] >= WHITE;
  const stack = [];
  const push = (i) => { if (!paper[i] && light(i)) { paper[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < w * (h - 1)) push(i + w);
  }
  // what the outside doesn't reach: the hole under his chin, the gaps in his hair
  const flood = (start, limit) => {
    const seen = [start];
    const mark = new Set(seen);
    while (seen.length && (!limit || mark.size <= limit)) {
      const i = seen.pop();
      const x = i % w;
      for (const n of [x > 0 && i - 1, x < w - 1 && i + 1, i >= w && i - w, i < w * (h - 1) && i + w]) {
        if (n !== false && !mark.has(n) && !paper[n] && light(n)) {
          mark.add(n);
          seen.push(n);
        }
      }
    }
    return mark;
  };
  for (const [x, y] of HOLES[name] || []) {
    const i = y * w + x;
    if (!light(i)) { console.log('pas de blanc ici', name, x, y); continue; }
    for (const n of flood(i)) paper[n] = 1;
  }
  for (let y = 0; y < (HEAD_ROWS[name] || 400); y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (paper[i] || !light(i)) continue;
      if ((EYES[name] || []).some(([ex, ey]) => Math.hypot(ex - x, ey - y) < 62 * (FACE[name] || 1))) continue;
      const part = flood(i, GAP);
      if (part.size > GAP) continue;
      // hair all around it? The white of his shirt has grey around it, and stays.
      let edge = 0;
      let black = 0;
      for (const n of part) {
        for (const m of [n - 1, n + 1, n - w, n + w]) {
          if (m < 0 || m >= w * h || part.has(m)) continue;
          edge++;
          if (Math.max(px[m * 4], px[m * 4 + 1], px[m * 4 + 2]) < 150) black++;
        }
      }
      if (black / (edge || 1) > 0.3 || (x > HAIR_FROM[name] && y < (HAIR_ROWS[name] || 345))) for (const n of part) paper[n] = 1;
    }
  }
  // distance to the paper, a few pixels in: the edge fades instead of keeping a white fringe
  const near = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (paper[i]) continue;
      for (let r = 1; r <= BAND && !near[i]; r++) {
        for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
          const X = x + dx;
          const Y = y + dy;
          if (X >= 0 && Y >= 0 && X < w && Y < h && paper[Y * w + X]) { near[i] = 1; break; }
        }
      }
    }
  }
  let x0 = w; let y0 = h; let x1 = 0; let y1 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = i * 4;
      if (paper[i]) { px[o] = px[o + 1] = px[o + 2] = px[o + 3] = 0; continue; }
      if (near[i]) {
        // what's left once the white is taken out of it
        const a = Math.min(1, (255 - Math.min(px[o], px[o + 1], px[o + 2])) / 90);
        px[o + 3] = Math.round(255 * a);
        if (a > 0) for (const c of [0, 1, 2]) px[o + c] = Math.max(0, Math.min(255, Math.round((px[o + c] - 255 * (1 - a)) / a)));
      }
      if (px[o + 3] > 40) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  const { shut, eye, irises } = stylize(px, w, h, name);
  return { px, shut, eye, irises, w, h, x0, y0, x1, y1 };
}

app.whenReady().then(() => {
  const dir = process.argv.at(-1);
  const out = path.join(__dirname, '..', 'assets', 'l');
  fs.mkdirSync(out, { recursive: true });
  const report = {};
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.png'))) {
    const c = cut(path.join(dir, name), name.replace('.png', ''));
    // bottom on his feet; he keeps the scale they all share, as they were drawn at the same size
    const area = { x: Math.max(0, c.x0 - MARGIN), y: Math.max(0, c.y0 - MARGIN), width: Math.min(c.w, c.x1 - c.x0 + MARGIN * 2), height: Math.min(c.h, c.y1 - c.y0 + MARGIN + 8) };
    const base = name.replace('.png', '');
    const scale = SIZE / c.w * (ZOOM[base] || 1);
    const shrink = (bitmap) => nativeImage.createFromBitmap(bitmap, { width: c.w, height: c.h }).crop(area)
      .resize({ width: Math.round(area.width * scale), height: Math.round(area.height * scale), quality: 'best' });
    const small = shrink(c.px);
    fs.writeFileSync(path.join(out, name), small.toPNG());
    fs.writeFileSync(path.join(out, name.replace('.png', '-shut.png')), shrink(c.shut).toPNG());
    fs.writeFileSync(path.join(out, name.replace('.png', '-eye.png')), shrink(c.eye).toPNG());
    report[name.replace('.png', '')] = { ...small.getSize(), left: Math.round((c.x0 - MARGIN) * scale), top: Math.round((c.y0 - MARGIN) * scale), scale, eyes: (EYES[base] || []).map(([x, y]) => [Math.round((x - area.x) * scale), Math.round((y - area.y) * scale)]),
      irises: c.irises.map((e) => [Math.round((e.x - area.x) * scale), Math.round((e.y - area.y) * scale), +(e.r * scale).toFixed(1), +(e.white * scale).toFixed(1)]) };
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report));
  app.quit();
});
