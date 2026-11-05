// Which thresholds? Tuned on half of test/heldout.json (A); the other half (B) stays for the final figure.
//   node scripts/tune.mjs            sweep on A
//   node scripts/tune.mjs B '{"act":0.55}'   one run on B
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Mind } from '../src/brain/mind.mjs';

const all = JSON.parse(fs.readFileSync(new URL('../test/heldout.json', import.meta.url), 'utf8'));
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 11) % 2;
const part = (name) => all.filter(([s]) => hash(s) === (name === 'A' ? 0 : 1));

async function run(series, tune, verbose) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-tune-'));
  const m = new Mind({ dir, tune, model: new URL('../model/l-net.bin', import.meta.url), teacher: async () => ({ ok: true, reply: '-', durable: false, paraphrases: [], action: null, fact: null }) });
  const n = { right: 0, checks: 0, handed: 0, wrong: 0, stole: 0, askQ: 0 };
  const fails = [];
  for (const [s, want] of series) {
    m.pending = null;
    const r = await m.respond(s);
    clearTimeout(m.netTimer);
    const got = r.source === 'claude' ? 'claude' : r.intent;
    if (r.confirm && !r.tool) {
      n.checks++;
      if (want === 'claude') n.askQ++;
    } else if (got === want) n.right++;
    else if (got === 'claude') n.handed++;
    else {
      n.wrong++;
      if (want === 'claude') n.stole++;
      fails.push(`X ${s} -> ${got} (attendu ${want})`);
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
  const acted = n.right + n.wrong;
  console.log(`${JSON.stringify(tune)} n=${series.length} justes ${n.right} (${(100 * n.right / series.length).toFixed(1)} %), confirm ${n.checks} (dont ${n.askQ} vraies questions), Claude a tort ${n.handed}, fausses ${n.wrong} (dont ${n.stole} vraies questions) ; juste quand il agit ${(100 * n.right / acted).toFixed(1)} %`);
  if (verbose) console.log(fails.join('\n'));
}

if (process.argv[2] === 'B') await run(part('B'), JSON.parse(process.argv[3] || '{}'), true);
else {
  for (const act of [0.4, 0.45, 0.5, 0.55, 0.6, 0.65]) {
    for (const margin of [0.01, 0.03]) await run(part('A'), { act, ask: act - 0.12, margin, long: act + 0.1 });
  }
}