import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const Chess = createRequire(import.meta.url)('../src/games/chess.js');

// the number of positions after n moves: known values, the usual check that every rule is right
function perft(s, depth) {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of Chess.moves(s)) n += perft(Chess.play(s, m), depth - 1);
  return n;
}

test('positions de départ : 20, 400, 8902', () => {
  const s = Chess.parse(Chess.START);
  assert.equal(perft(s, 1), 20);
  assert.equal(perft(s, 2), 400);
  assert.equal(perft(s, 3), 8902);
});

test('Kiwipete (roques, prise en passant, promotions) : 48, 2039, 97862', () => {
  const s = Chess.parse('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  assert.equal(perft(s, 1), 48);
  assert.equal(perft(s, 2), 2039);
  assert.equal(perft(s, 3), 97862);
});

test('position 3 (fins de partie, en passant découvrant le roi) : 14, 191, 2812, 43238', () => {
  const s = Chess.parse('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
  assert.deepEqual([1, 2, 3, 4].map((d) => perft(s, d)), [14, 191, 2812, 43238]);
});

test('position 4 (promotions, roques sous échec) : 6, 264, 9467', () => {
  const s = Chess.parse('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
  assert.deepEqual([1, 2, 3].map((d) => perft(s, d)), [6, 264, 9467]);
});

test('mat, pat, notation', () => {
  const g = Chess.game();
  for (const [a, b] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4']]) g.move({ from: Chess.square(a), to: Chess.square(b) });
  const m = g.move({ from: Chess.square('d8'), to: Chess.square('h4') });
  assert.equal(m.san, 'Dh4#');
  assert.deepEqual(g.outcome(), { result: 'b', why: 'mat' });
  const pat = Chess.parse('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.deepEqual(Chess.outcome(pat), { result: 'draw', why: 'pat' });
});

test('il voit un mat en un et le joue', () => {
  const s = Chess.parse('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
  const { move } = Chess.think(s, { ms: 800 });
  assert.equal(Chess.name(move.to), 'a8');
});

test('il ne laisse pas sa dame en prise', () => {
  const s = Chess.parse('4k3/8/8/3q4/8/8/3R4/4K3 b - - 0 1');
  const { move } = Chess.think(s, { ms: 800 });
  assert.equal(move.piece, 'q');
  const after = Chess.play(s, move);
  assert.ok(!Chess.moves(after).some((m) => m.to === move.to && m.take === 'q'), `dame laissée en prise sur ${Chess.name(move.to)}`);
});
