// His neural net, written here and trained on this PC, with no library: it turns a sentence into a
// point in space so that sentences meaning the same thing end up close. Hashed features -> embedding
// table -> one tanh layer -> unit vector. Trained with a triplet loss by plain gradient descent,
// and it keeps learning afterwards, from what Claude and you teach him.

import { features } from './text.mjs';

export const BUCKETS = 1 << 15;
export const DIM = 64;
export const OUT = 96;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

export class Net {
  constructor({ seed = 13, weights = null } = {}) {
    this.rand = rng(seed);
    if (weights) {
      const copy = new Uint8Array(weights).buffer; // aligned, and his own to change
      this.E = new Float32Array(copy, 0, BUCKETS * DIM);
      this.W = new Float32Array(copy, BUCKETS * DIM * 4, DIM * OUT);
      return;
    }
    this.E = new Float32Array(BUCKETS * DIM);
    for (let i = 0; i < this.E.length; i++) this.E[i] = (this.rand() - 0.5) * 0.2;
    this.W = new Float32Array(DIM * OUT);
    for (let i = 0; i < this.W.length; i++) this.W[i] = (this.rand() - 0.5) * 0.3;
  }

  toBuffer() {
    return Buffer.concat([Buffer.from(this.E.buffer, this.E.byteOffset, this.E.byteLength), Buffer.from(this.W.buffer, this.W.byteOffset, this.W.byteLength)]);
  }

  // everything backprop needs about one sentence
  forward(text) {
    const f = [...features(text, BUCKETS)];
    let sum = 0;
    for (const [, w] of f) sum += w;
    sum = sum || 1;
    const x = new Float32Array(DIM);
    for (const [k, w] of f) for (let d = 0; d < DIM; d++) x[d] += this.E[k * DIM + d] * w / sum;
    const h = new Float32Array(OUT);
    for (let o = 0; o < OUT; o++) {
      let v = 0;
      for (let d = 0; d < DIM; d++) v += this.W[o * DIM + d] * x[d];
      h[o] = Math.tanh(v);
    }
    let len = 0;
    for (let o = 0; o < OUT; o++) len += h[o] * h[o];
    len = Math.sqrt(len) || 1;
    const u = new Float32Array(OUT);
    for (let o = 0; o < OUT; o++) u[o] = h[o] / len;
    return { f, sum, x, h, len, u };
  }

  embed(text) {
    return this.forward(text).u;
  }

  // one gradient step moving sentence s toward (sign 1) or away from (sign -1) `other`
  back(s, other, cos, sign, lr) {
    const dx = new Float32Array(DIM);
    for (let o = 0; o < OUT; o++) {
      const dh = sign * (other[o] - cos * s.u[o]) / s.len * (1 - s.h[o] * s.h[o]);
      for (let d = 0; d < DIM; d++) {
        dx[d] += this.W[o * DIM + d] * dh;
        this.W[o * DIM + d] += lr * dh * s.x[d];
      }
    }
    for (const [k, w] of s.f) {
      const a = lr * w / s.sum;
      for (let d = 0; d < DIM; d++) this.E[k * DIM + d] += a * dx[d];
    }
  }

  // pull a and p together, push n away. Returns the loss before the step.
  triplet(a, p, n, { margin = 0.35, lr = 0.15 } = {}) {
    const sa = this.forward(a);
    const sp = this.forward(p);
    const sn = this.forward(n);
    const cp = dot(sa.u, sp.u);
    const cn = dot(sa.u, sn.u);
    const loss = margin - cp + cn;
    if (loss <= 0) return 0;
    this.back(sa, sp.u, cp, 1, lr);
    this.back(sp, sa.u, cp, 1, lr);
    this.back(sa, sn.u, cn, -1, lr);
    this.back(sn, sa.u, cn, -1, lr);
    return loss;
  }

  // groups: { label: [sentences] }
  train(groups, { epochs = 25, lr = 0.15, log = null } = {}) {
    const labels = Object.keys(groups).filter((l) => groups[l].length);
    const items = labels.flatMap((l) => groups[l].map((s) => [l, s]));
    const pickOf = (list) => list[Math.floor(this.rand() * list.length)];
    for (let e = 0; e < epochs; e++) {
      const rate = lr * (1 - e / epochs * 0.8);
      let total = 0;
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(this.rand() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
      for (const [l, s] of items) {
        if (groups[l].length < 2) continue;
        let p = pickOf(groups[l]);
        if (p === s) p = pickOf(groups[l]);
        // the hardest of a few sentences that mean something else
        let n = null;
        let worst = -2;
        const u = this.embed(s);
        for (let k = 0; k < 6; k++) {
          const other = pickOf(labels);
          if (other === l) continue;
          const cand = pickOf(groups[other]);
          const c = dot(u, this.embed(cand));
          if (c > worst) {
            worst = c;
            n = cand;
          }
        }
        if (n) total += this.triplet(s, p, n, { lr: rate });
      }
      log?.(e, total / items.length);
    }
  }
}
