// node --test test/  : his decisions, with a fake Claude so nothing leaves the PC.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Mind, parseReminder } from '../src/brain/mind.mjs';
import { readLesson } from '../src/brain/teacher.mjs';

const MODEL = new URL('../model/l-net.bin', import.meta.url);

function mind(answer = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-test-'));
  const calls = [];
  const m = new Mind({
    dir,
    model: MODEL,
    teacher: async (q) => {
      calls.push(q);
      return { ok: true, reply: `réponse à ${q} à 5h du matin`, lesson: `réponse à ${q}`, durable: true, paraphrases: [], action: null, fact: null, ...answer };
    },
  });
  return { m, calls, dir };
}

test('il fait seul ce qu il sait, sans Claude', async () => {
  const { m, calls } = mind();
  assert.strictEqual((await m.respond('quelle heure il est')).tool, 'time');
  assert.strictEqual((await m.respond('combien fait 15% de 240')).say, '36');
  assert.strictEqual((await m.respond('et fois 2')).say, '72');
  assert.match((await m.respond('10 km en miles')).say, /6,21/);
  assert.strictEqual((await m.respond('ouvre spotify')).tool, 'open');
  assert.strictEqual((await m.respond('rappelle moi dans 10 min d appeler paul et de manger')).tool, 'remind');
  assert.strictEqual(calls.length, 0);
});

test('ce qu il ne comprend pas passe par Claude, et il l apprend', async () => {
  const { m, calls } = mind({ paraphrases: ['c est quoi la capitale de la zorglubie', 'la capitale zorglube c est quoi'] });
  const first = await m.respond('quelle est la capitale de la zorglubie');
  assert.strictEqual(first.source, 'claude');
  assert.strictEqual(first.learned, true);
  const again = await m.respond('c est quoi la capitale de la zorglubie');
  assert.strictEqual(again.source, 'local');
  // la reponse sans ce qui ne valait que sur le moment
  assert.match(first.say, /5h du matin/);
  assert.strictEqual(again.say, 'réponse à quelle est la capitale de la zorglubie');
  assert.strictEqual(calls.length, 1);
  // pas la meme question : il ne ressort pas sa reponse
  const other = await m.respond('quelle est la capitale de la gnomie');
  assert.strictEqual(other.source, 'claude');
});

test('une reponse qui depend du moment ne s apprend pas', async () => {
  const { m, calls } = mind({ durable: false });
  await m.respond('qui a gagne le match hier');
  await m.respond('qui a gagne le match hier');
  assert.strictEqual(calls.length, 2);
});

test('« non c est pas ca » : il oublie et redemande', async () => {
  const { m, calls } = mind();
  await m.respond('quelle est la capitale de la zorglubie');
  assert.strictEqual((await m.respond('quelle est la capitale de la zorglubie')).source, 'local');
  const fixed = await m.respond('non c est pas ca');
  assert.strictEqual(fixed.source, 'claude');
  assert.strictEqual(calls.length, 2);
});

test('Claude lui apprend qu une phrase etait un ordre', async () => {
  const { m, calls } = mind({ action: 'volUp', durable: false, paraphrases: [] });
  const r = await m.respond('fais peter les basses');
  assert.strictEqual(r.tool, 'key');
  const again = await m.respond('fais peter les basses');
  assert.strictEqual(again.source, 'local');
  assert.strictEqual(again.args.key, 'volUp');
  assert.strictEqual(calls.length, 1);
});

test('risque : toujours une question, meme venant de Claude', async () => {
  const { m } = mind();
  assert.strictEqual((await m.respond('verrouille mon pc')).confirm, true);
  assert.strictEqual((await m.respond('non')).tool, undefined);
  assert.strictEqual((await m.respond('verrouille mon pc')).confirm, true);
  assert.strictEqual((await m.respond('oui')).tool, 'lock');
  const { m: m2 } = mind({ action: 'lock' });
  const asked = await m2.respond('ferme la boutique a double tour');
  assert.strictEqual(asked.confirm, true);
  assert.strictEqual(asked.tool, undefined);
});

test('il apprend tes mots et retient tes faits', async () => {
  const { m, calls } = mind();
  assert.match((await m.respond('quand je dis fais peter tu fais monte le son')).say, /Compris/);
  assert.strictEqual((await m.respond('fais peter')).args.key, 'volUp');
  await m.respond('retiens que je pars en Corée en janvier');
  assert.match((await m.respond('je pars quand en coree')).say, /janvier/);
  await m.respond('oublie la coree');
  assert.strictEqual((await m.respond('je pars quand en coree')).source, 'claude');
  assert.strictEqual(calls.length, 1);
});

test('il garde ce qu il a appris apres redemarrage', async () => {
  const { m, dir, calls } = mind();
  await m.respond('quelle est la capitale de la zorglubie');
  m.saveNet();
  const again = new Mind({ dir, model: MODEL, teacher: async () => { calls.push('x'); return { ok: true, reply: 'x', lesson: 'x' }; } });
  assert.strictEqual((await again.respond('quelle est la capitale de la zorglubie')).source, 'local');
  assert.strictEqual(calls.length, 1);
});

test('plusieurs ordres', async () => {
  const { m } = mind();
  const r = await m.respond('monte le son et ouvre spotify');
  assert.deepStrictEqual(r.steps.map((s) => s.tool), ['key', 'open']);
});

test('lecture des reponses de Claude', () => {
  assert.strictEqual(readLesson('du texte normal').reply, 'du texte normal');
  assert.strictEqual(readLesson('du texte normal').durable, false);
  assert.strictEqual(readLesson('```json\n{"reply":"ok","durable":true}\n```').durable, true);
});

test('rappels', () => {
  const now = new Date(2026, 10, 2, 12, 0);
  assert.strictEqual(parseReminder('rappelle moi dans 20 min le linge', now).what, 'le linge');
  assert.strictEqual(new Date(parseReminder('rappelle moi demain a 9h cours', now).at).getDate(), 3);
  assert.strictEqual(parseReminder('rappelle moi le theoreme', now), null);
});
