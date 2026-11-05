'use strict';

// electron scripts/eyes.js : the whites of his eyes, cleaned up (assets/l/<name>-eye.png).
// In each picture: the black pupil, the white around it and the grey ring between them, as one solid
// shape, filled with the colour of the white (<name>-eye.png); and the pupil with its ring alone, as
// drawn (<name>-pupil.png). His pupil moves on that shape only, so the one printed in the picture never
// shows twice, and nothing lands on his eyelids or under his eyes.
// The positions come from SHEETS in src/renderer/body.js.

const fs = require('node:fs');
const path = require('node:path');
const { app, nativeImage } = require('electron');

const RING = Number(process.env.RING || 1.35); // how far round the pupil its dark rim goes, in iris radii
const DIR = path.join(__dirname, '..', 'assets', 'l');
const body = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'body.js'), 'utf8');

function sheets() {
  const out = {};
  for (const m of body.matchAll(/^\s+(\w+): \{ feet: [^\n]*?eyes: (\[\[[^\n]*?\]\]), irises: (\[\[[^\n]*?\]\])/gm)) {
    out[m[1]] = { eyes: JSON.parse(m[2]), irises: JSON.parse(m[3]) };
  }
  return out;
}

function clean(name, { eyes, irises }) {
  const img = nativeImage.createFromPath(path.join(DIR, `${name}.png`));
  const { width: w, height: h } = img.getSize();
  const px = img.toBitmap(); // BGRA
  const at = (x, y) => (y * w + x) * 4;
  const lum = (i) => 0.114 * px[i] + 0.587 * px[i + 1] + 0.299 * px[i + 2];
  const sat = (i) => Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]);
  const mask = new Uint8Array(w * h);
  const moving = new Uint8Array(w * h);
  let sum = [0, 0, 0];
  let count = 0;

  eyes.forEach(([ex, ey, rx, ry], k) => {
    const [ix, iy, ir] = irises[k];
    const inside = (x, y, s = 1) => ((x - ex) / (rx * s)) ** 2 + ((y - ey) / (ry * s)) ** 2 <= 1;
    const flood = (seeds, ok) => {
      const seen = new Uint8Array(w * h);
      const stack = seeds.filter(([x, y]) => ok(x, y));
      const got = [];
      for (const [x, y] of stack) seen[y * w + x] = 1;
      while (stack.length) {
        const [x, y] = stack.pop();
        got.push([x, y]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx]) continue;
          seen[ny * w + nx] = 1;
          if (ok(nx, ny)) stack.push([nx, ny]);
        }
      }
      return got;
    };
    const near = (x, y, r) => Math.hypot(x - ix, y - iy) <= r;
    // the pupil: dark, around where the iris is
    const seeds = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) seeds.push([Math.round(ix) + dx, Math.round(iy) + dy]);
    const pupil = flood(seeds, (x, y) => near(x, y, ir * 1.5) && lum(at(x, y)) < 95);
    // the ring around it: anything not light, close to the pupil
    const ring = [];
    for (let y = Math.floor(iy - ir * 1.4); y <= iy + ir * 1.4; y++) {
      for (let x = Math.floor(ix - ir * 1.4); x <= ix + ir * 1.4; x++) {
        if (near(x, y, ir * RING) && inside(x, y, 0.86) && lum(at(x, y)) <= 150) ring.push([x, y]);
      }
    }
    // the white: light and grey-ish, joined to the pupil, inside the eye
    const white = (x, y) => inside(x, y, 0.95) && lum(at(x, y)) > 150 && sat(at(x, y)) < 40;
    const edge = [];
    for (const [x, y] of [...pupil, ...ring]) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) edge.push([x + dx, y + dy]);
    const whites = flood(edge, white);
    for (const [x, y] of whites) {
      const i = at(x, y);
      sum = [sum[0] + px[i], sum[1] + px[i + 1], sum[2] + px[i + 2]];
      count++;
    }
    const local = new Uint8Array(w * h);
    for (const [x, y] of [...pupil, ...ring, ...whites]) local[y * w + x] = 1;
    // close the shape: grow by one, shrink by one, then fill what's enclosed
    const box = [Math.floor(ex - rx - 3), Math.floor(ey - ry - 3), Math.ceil(ex + rx + 3), Math.ceil(ey + ry + 3)];
    const grow = (src, on) => {
      const out = new Uint8Array(w * h);
      for (let y = box[1]; y <= box[3]; y++) {
        for (let x = box[0]; x <= box[2]; x++) {
          let any = false;
          let all = true;
          for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const v = src[(y + dy) * w + x + dx];
            any = any || v;
            all = all && v;
          }
          out[y * w + x] = on ? any : all;
        }
      }
      return out;
    };
    // only small gaps: a lock of hair across the eye stays in front of it
    const closed = grow(grow(local, true), false);
    // what moves: the pupil and its ring, nothing light, nothing that isn't the eye
    // (only the ring right against the pupil: further out it's the outline of his eye)
    const may = new Uint8Array(w * h);
    for (const [x, y] of [...pupil, ...ring]) {
      if (lum(at(x, y)) <= 150 && closed[y * w + x] && near(x, y, ir * RING)) may[y * w + x] = 1;
    }
    // thin dark lines are locks of hair or his eyelid, not his eye: shrink by one, grow back by one,
    // and they're gone; the round pupil and the rim against it come back whole
    const opened = grow(grow(may, false), true);
    for (let y = box[1]; y <= box[3]; y++) {
      for (let x = box[0]; x <= box[2]; x++) if (opened[y * w + x] && may[y * w + x]) moving[y * w + x] = 1;
    }
    // the white repainted: what moves, and what is light; a dark line of his eyelid or a lock of
    // hair stays as drawn, in front of the pupil
    for (let y = box[1]; y <= box[3]; y++) {
      for (let x = box[0]; x <= box[2]; x++) {
        const i = y * w + x;
        if (closed[i] && inside(x, y, 1.05) && (moving[i] || lum(at(x, y)) > 150)) mask[i] = 1;
      }
    }
    console.log(`${name} oeil ${k}: pupille ${pupil.length}, blanc ${whites.length}`);
  });

  const colour = count ? sum.map((v) => Math.round(v / count)) : [235, 238, 242];
  const outPx = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    outPx[i * 4] = colour[0];
    outPx[i * 4 + 1] = colour[1];
    outPx[i * 4 + 2] = colour[2];
    outPx[i * 4 + 3] = 255;
  }
  fs.writeFileSync(path.join(DIR, `${name}-eye.png`), nativeImage.createFromBitmap(outPx, { width: w, height: h }).toPNG());
  const pupilPx = Buffer.alloc(w * h * 4);
  // the grey at the edge of the pupil becomes dark ink, partly see-through: over the white it gives the
  // same grey, and moved it doesn't leave a light dotted ring behind it
  for (let i = 0; i < w * h; i++) {
    if (!moving[i]) continue;
    const l = lum(i * 4);
    if (l <= 120) {
      px.copy(pupilPx, i * 4, i * 4, i * 4 + 4);
      continue;
    }
    const a = Math.max(0, Math.min(1, (colour.reduce((s, v) => s + v, 0) / 3 - l) / (colour.reduce((s, v) => s + v, 0) / 3 - 30)));
    pupilPx[i * 4] = Math.round(34 * a); // BGRA, the colour times its opacity: right either way it's read
    pupilPx[i * 4 + 1] = Math.round(26 * a);
    pupilPx[i * 4 + 2] = Math.round(30 * a);
    pupilPx[i * 4 + 3] = Math.round(a * 255);
  }
  fs.writeFileSync(path.join(DIR, `${name}-pupil.png`), nativeImage.createFromBitmap(pupilPx, { width: w, height: h }).toPNG());
}

app.whenReady().then(() => {
  const all = sheets();
  for (const [name, s] of Object.entries(all)) clean(name, s);
  console.log(`fait : ${Object.keys(all).join(', ')}`);
  app.quit();
});
