// Trains his net from scratch on this PC: node scripts/train.mjs. Writes model/l-net.bin.
// --eval: holds out one sentence in five, and compares with plain word matching (TF-IDF).
import fs from 'node:fs';
import { Net, dot } from '../src/brain/net.mjs';
import { norm, features } from '../src/brain/text.mjs';
import { INTENTS, OTHER, augment } from '../src/brain/corpus.mjs';

let seed = 42;
const r = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const clean = (list) => [...new Set(list.map(norm))].filter(Boolean);
const groupsOf = (keep) => {
  const g = {};
  for (const [name, it] of Object.entries(INTENTS)) g[name] = clean(it.say).filter(keep).flatMap((s) => augment(s, r));
  g.other = clean(OTHER).filter(keep).flatMap((s) => augment(s, r));
  return g;
};

function tfidfOf(groups) {
  const docs = Object.entries(groups).flatMap(([l, list]) => list.map((s) => ({ l, f: features(s, 1 << 18) })));
  const df = new Map();
  for (const d of docs) for (const k of d.f.keys()) df.set(k, (df.get(k) || 0) + 1);
  const idf = (k) => Math.log(1 + docs.length / (1 + (df.get(k) || 0)));
  const vec = (f) => {
    const v = new Map();
    let s = 0;
    for (const [k, w] of f) {
      const x = w * idf(k);
      v.set(k, x);
      s += x * x;
    }
    s = Math.sqrt(s) || 1;
    for (const [k, x] of v) v.set(k, x / s);
    return v;
  };
  for (const d of docs) d.v = vec(d.f);
  return (text) => {
    const q = vec(features(text, 1 << 18));
    let best = null;
    let top = -1;
    for (const d of docs) {
      let c = 0;
      for (const [k, x] of q) c += x * (d.v.get(k) || 0);
      if (c > top) {
        top = c;
        best = d.l;
      }
    }
    return best;
  };
}

if (process.argv.includes('--eval')) {
  const scores = { net: 0, tfidf: 0, n: 0 };
  const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 5;
  for (let fold = 0; fold < 5; fold++) {
    const train = groupsOf((s) => hash(s) !== fold);
    const test = [...Object.entries(INTENTS).flatMap(([l, it]) => clean(it.say).map((s) => [l, s])), ...clean(OTHER).map((s) => ['other', s])].filter(([, s]) => hash(s) === fold);
    const net = new Net();
    net.train(train, { epochs: 18 });
    const ex = Object.entries(train).flatMap(([l, list]) => list.map((s) => ({ l, u: net.embed(s) })));
    const lex = tfidfOf(train);
    for (const [l, s] of test) {
      const u = net.embed(s);
      let best = null;
      let top = -2;
      for (const e of ex) {
        const c = dot(u, e.u);
        if (c > top) {
          top = c;
          best = e.l;
        }
      }
      scores.n++;
      if (best === l) scores.net++;
      if (lex(s) === l) scores.tfidf++;
    }
    console.log(`pli ${fold + 1}/5 fini`);
  }
  console.log(`phrases mises de cote: ${scores.n}  reseau: ${(100 * scores.net / scores.n).toFixed(1)} %  mots seuls (TF-IDF): ${(100 * scores.tfidf / scores.n).toFixed(1)} %`);
} else {
  const net = new Net();
  const t0 = Date.now();
  net.train(groupsOf(() => true), { epochs: 25, log: (e, l) => { if (e % 5 === 0) console.log(`epoque ${e} perte ${l.toFixed(4)}`); } });
  fs.mkdirSync('model', { recursive: true });
  fs.writeFileSync('model/l-net.bin', net.toBuffer());
  console.log(`entraine en ${((Date.now() - t0) / 1000).toFixed(0)} s, ${(fs.statSync('model/l-net.bin').size / 1e6).toFixed(1)} Mo`);
}
