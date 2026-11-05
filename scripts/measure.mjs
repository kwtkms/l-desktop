// How he does on test/heldout.json, phrases written by Claude that he never trains on, through his real
// decisions, with a fake teacher: nothing leaves the PC. Fresh memory on each run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Mind } from '../src/brain/mind.mjs';

const series = JSON.parse(fs.readFileSync(new URL('../test/heldout.json', import.meta.url), 'utf8'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-measure-'));
const m = new Mind({
  dir,
  model: new URL('../model/l-net.bin', import.meta.url),
  teacher: async () => ({ ok: true, reply: '-', durable: false, paraphrases: [], action: null, fact: null }),
});

const n = { right: 0, checks: 0, handed: 0, wrong: 0, stole: 0 };
const fails = [];
const orders = series.filter(([, w]) => w !== 'claude').length;
for (const [s, want] of series) {
  m.pending = null;
  const r = await m.respond(s);
  const got = r.source === 'claude' ? 'claude' : r.intent;
  if (r.confirm && !r.tool) {
    n.checks++;
    if (want === 'claude') fails.push(`? ${s} (vraie question)`);
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
console.log(`${series.length} phrases, ${orders} demandes qu'il devrait gerer seul, ${series.length - orders} vraies questions`);
console.log(`justes ${n.right} (${(100 * n.right / series.length).toFixed(1)} %), confirmations ${n.checks}, passees a Claude alors qu'il savait ${n.handed}, fausses ${n.wrong}`);
console.log(`quand il agit seul, juste a ${(100 * n.right / acted).toFixed(1)} % ; vraies questions prises pour autre chose : ${n.stole}`);
if (process.argv[2] === '-v') console.log(fails.join('\n'));
