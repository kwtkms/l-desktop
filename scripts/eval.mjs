// How good is he, really? 5-fold on the corpus: accuracy, and with a confidence threshold, how much he
// dares answer alone and how often he's then right. net = trained net, lex = word matching.
import { Net, dot } from '../src/brain/net.mjs';
import { norm, features } from '../src/brain/text.mjs';
import { INTENTS, OTHER, augment } from '../src/brain/corpus.mjs';

const clean = (list) => [...new Set(list.map(norm))].filter(Boolean);
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 5;
const all = [...Object.entries(INTENTS).flatMap(([l, it]) => clean(it.say).map((s) => [l, s])), ...clean(OTHER).map((s) => ['other', s])];

function lexOf(docs) {
  const df = new Map();
  const fs = docs.map((d) => features(d.s, 1 << 18));
  for (const f of fs) for (const k of f.keys()) df.set(k, (df.get(k) || 0) + 1);
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
  const vs = fs.map(vec);
  return (text) => {
    const q = vec(features(text, 1 << 18));
    return vs.map((v) => {
      let c = 0;
      for (const [k, x] of q) c += x * (v.get(k) || 0);
      return c;
    });
  };
}

const configs = JSON.parse(process.argv[2] || '[{"epochs":18,"lr":0.15},{"epochs":40,"lr":0.5},{"epochs":40,"lr":1.5}]');
for (const cfg of configs) {
  const rows = [];
  for (let fold = 0; fold < 5; fold++) {
    let seed = 42 + fold;
    const r = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const groups = {};
    for (const [l, s] of all) {
      if (hash(s) === fold) continue;
      (groups[l] ??= []).push(...augment(s, r));
    }
    const net = new Net();
    net.train(groups, cfg);
    const docs = Object.entries(groups).flatMap(([l, list]) => list.map((s) => ({ l, s, u: net.embed(s) })));
    const lex = lexOf(docs);
    for (const [l, s] of all) {
      if (hash(s) !== fold) continue;
      const u = net.embed(s);
      const lx = lex(s);
      const score = (a) => {
        const best = new Map();
        docs.forEach((d, i) => {
          const c = a * dot(u, d.u) + (1 - a) * lx[i];
          if (c > (best.get(d.l) ?? -9)) best.set(d.l, c);
        });
        const [x, y] = [...best.entries()].sort((p, q) => q[1] - p[1]);
        return { l: x[0], c: x[1], m: x[1] - y[1] };
      };
      rows.push({ want: l, net: score(1), lex: score(0), mix: score(0.5) });
    }
  }
  const acc = (k) => (100 * rows.filter((x) => x[k].l === x.want).length / rows.length).toFixed(1);
  console.log(`${JSON.stringify(cfg)} n=${rows.length} justesse net ${acc('net')} lex ${acc('lex')} mix ${acc('mix')}`);
  for (const k of ['net', 'mix']) {
    for (const th of [0.5, 0.6, 0.7, 0.8]) {
      const acts = rows.filter((x) => x[k].l !== 'other' && x[k].c >= th && x[k].m >= 0.05);
      const right = acts.filter((x) => x[k].l === x.want).length;
      const orders = rows.filter((x) => x.want !== 'other').length;
      const wrongOther = acts.filter((x) => x.want === 'other').length;
      console.log(`  ${k} seuil ${th}: agit sur ${acts.length}, juste ${acts.length ? (100 * right / acts.length).toFixed(0) : '-'} %, couvre ${(100 * right / orders).toFixed(0)} % des ordres, vraies questions prises a tort ${wrongOther}/${rows.length - orders}`);
    }
  }
}
