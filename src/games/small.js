'use strict';

// Morpion and puissance 4, and how L plays them. Works in the games window and under node.

(function (root) {
  // ---------- morpion: 9 cells, 'x' 'o' or ''
  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

  function tttWinner(b) {
    for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return { who: b[a], line: [a, c, d] };
    return b.every(Boolean) ? { who: 'draw', line: [] } : null;
  }

  // perfect play, from `me`'s point of view
  function tttScore(b, me, turn, depth) {
    const w = tttWinner(b);
    if (w) return w.who === 'draw' ? 0 : w.who === me ? 10 - depth : depth - 10;
    let best = turn === me ? -Infinity : Infinity;
    for (let i = 0; i < 9; i++) {
      if (b[i]) continue;
      b[i] = turn;
      const v = tttScore(b, me, turn === 'x' ? 'o' : 'x', depth + 1);
      b[i] = '';
      best = turn === me ? Math.max(best, v) : Math.min(best, v);
    }
    return best;
  }

  // slip: how often he plays any free cell instead of the best one
  function tttMove(board, me, slip = 0) {
    const free = board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    if (!free.length) return -1;
    if (Math.random() < slip) return free[Math.floor(Math.random() * free.length)];
    // an empty board: every corner and the centre are as good, no need to search it all
    if (free.length === 9) return [0, 2, 4, 6, 8][Math.floor(Math.random() * 5)];
    let best = -Infinity;
    let picks = [];
    for (const i of free) {
      const b = board.slice();
      b[i] = me;
      const v = tttScore(b, me, me === 'x' ? 'o' : 'x', 1);
      if (v > best) { best = v; picks = [i]; } else if (v === best) picks.push(i);
    }
    return picks[Math.floor(Math.random() * picks.length)];
  }

  // ---------- puissance 4: 7 columns of 6, row 0 at the top; 1 and 2 for the two sides
  const COLS = 7;
  const ROWS = 6;
  const c4Empty = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  const c4Row = (g, c) => { for (let r = ROWS - 1; r >= 0; r--) if (!g[r][c]) return r; return -1; };

  function c4Winner(g) {
    const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = g[r][c];
        if (!p) continue;
        for (const [dr, dc] of dirs) {
          const line = [[r, c]];
          for (let k = 1; k < 4; k++) {
            const rr = r + dr * k;
            const cc = c + dc * k;
            if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || g[rr][cc] !== p) break;
            line.push([rr, cc]);
          }
          if (line.length === 4) return { who: p, line };
        }
      }
    }
    return g[0].every(Boolean) ? { who: 'draw', line: [] } : null;
  }

  // every run of four cells, once
  const WINDOWS = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const cells = [];
        for (let k = 0; k < 4; k++) cells.push([r + dr * k, c + dc * k]);
        if (cells.every(([rr, cc]) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS)) WINDOWS.push(cells);
      }
    }
  }

  function c4Eval(g, me) {
    const you = 3 - me;
    let s = 0;
    for (let r = 0; r < ROWS; r++) if (g[r][3] === me) s += 4; else if (g[r][3] === you) s -= 4;
    for (const cells of WINDOWS) {
      let mine = 0;
      let yours = 0;
      for (const [r, c] of cells) { if (g[r][c] === me) mine++; else if (g[r][c] === you) yours++; }
      if (mine && yours) continue;
      if (mine === 3) s += 50; else if (mine === 2) s += 6;
      if (yours === 3) s -= 60; else if (yours === 2) s -= 6;
    }
    return s;
  }

  const ORDER = [3, 2, 4, 1, 5, 0, 6];
  function c4Search(g, depth, alpha, beta, turn, me) {
    const w = c4Winner(g);
    if (w) return w.who === 'draw' ? 0 : w.who === me ? 100000 + depth : -100000 - depth;
    if (depth === 0) return c4Eval(g, me);
    for (const c of ORDER) {
      const r = c4Row(g, c);
      if (r < 0) continue;
      g[r][c] = turn;
      const v = c4Search(g, depth - 1, alpha, beta, 3 - turn, me);
      g[r][c] = 0;
      if (turn === me) { if (v > alpha) alpha = v; } else if (v < beta) beta = v;
      if (alpha >= beta) break;
    }
    return turn === me ? alpha : beta;
  }

  function c4Move(grid, me, depth = 6) {
    const g = grid.map((row) => row.slice());
    let best = -Infinity;
    let pick = -1;
    for (const c of ORDER) {
      const r = c4Row(g, c);
      if (r < 0) continue;
      g[r][c] = me;
      const v = c4Search(g, depth - 1, -Infinity, Infinity, 3 - me, me) + Math.random();
      g[r][c] = 0;
      if (v > best) { best = v; pick = c; }
    }
    return pick;
  }

  const api = { tttWinner, tttMove, c4Empty, c4Row, c4Winner, c4Move, COLS, ROWS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Small = api;
}(typeof self !== 'undefined' ? self : this));
