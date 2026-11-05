import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const Small = createRequire(import.meta.url)('../src/games/small.js');

test('morpion : sans erreur, il ne perd jamais contre 300 parties au hasard', () => {
  let lost = 0;
  for (let n = 0; n < 300; n++) {
    const b = Array(9).fill('');
    let turn = n % 2 ? 'x' : 'o';
    while (!Small.tttWinner(b)) {
      if (turn === 'o') b[Small.tttMove(b, 'o', 0)] = 'o';
      else {
        const free = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
        b[free[Math.floor(Math.random() * free.length)]] = 'x';
      }
      turn = turn === 'x' ? 'o' : 'x';
    }
    if (Small.tttWinner(b).who === 'x') lost++;
  }
  assert.equal(lost, 0);
});

test('puissance 4 : il gagne quand il peut, il bloque sinon', () => {
  const g = Small.c4Empty();
  g[5][0] = g[5][1] = g[5][2] = 2;
  g[4][0] = g[4][1] = 1;
  assert.equal(Small.c4Move(g, 2, 4), 3);
  const h = Small.c4Empty();
  h[5][4] = h[4][4] = h[3][4] = 1;
  h[5][3] = h[5][2] = 2;
  assert.equal(Small.c4Move(h, 2, 4), 4);
});

test('puissance 4 : une ligne en diagonale compte', () => {
  const g = Small.c4Empty();
  for (let k = 0; k < 4; k++) g[5 - k][k] = 1;
  assert.equal(Small.c4Winner(g).who, 1);
});
