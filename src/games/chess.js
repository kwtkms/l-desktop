'use strict';

// Chess, all the rules: castling, en passant, promotion, check, mate, stalemate, fifty moves, threefold
// repetition, not enough material. And L's side of it: a small alpha-beta search, given a time budget.
// Works in the games window and under node (test/chess.test.mjs).
// Squares go 0..63 from a8 to h1; white pieces are upper case.

(function (root) {
  const FILES = 'abcdefgh';
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const name = (sq) => FILES[sq % 8] + (8 - Math.floor(sq / 8));
  const square = (s) => FILES.indexOf(s[0]) + (8 - Number(s[1])) * 8;
  const white = (p) => p !== '.' && p === p.toUpperCase();
  const colour = (p) => (p === '.' ? null : white(p) ? 'w' : 'b');
  const other = (c) => (c === 'w' ? 'b' : 'w');

  function parse(fen) {
    const [rows, turn, castle, ep, half, full] = fen.trim().split(/\s+/);
    const board = [];
    for (const ch of rows.replace(/\//g, '')) {
      if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) board.push('.');
      else board.push(ch);
    }
    return {
      board, turn, castle: castle === '-' ? '' : castle, ep: ep === '-' ? -1 : square(ep),
      half: Number(half || 0), full: Number(full || 1), seen: {},
    };
  }

  function fen(s) {
    let out = '';
    for (let r = 0; r < 8; r++) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = s.board[r * 8 + f];
        if (p === '.') empty++;
        else {
          if (empty) out += empty;
          empty = 0;
          out += p;
        }
      }
      if (empty) out += empty;
      if (r < 7) out += '/';
    }
    return `${out} ${s.turn} ${s.castle || '-'} ${s.ep < 0 ? '-' : name(s.ep)} ${s.half} ${s.full}`;
  }
  // what makes two positions the same, for repetitions
  const key = (s) => fen(s).split(' ').slice(0, 4).join(' ');

  const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const at = (f, r) => (f >= 0 && f < 8 && r >= 0 && r < 8 ? r * 8 + f : -1);

  // is this square attacked by that side
  function attacked(board, sq, by) {
    const f = sq % 8;
    const r = Math.floor(sq / 8);
    const up = by === 'w' ? 1 : -1; // a white pawn attacks from the row below (higher index)
    for (const df of [-1, 1]) {
      const t = at(f + df, r + up);
      if (t >= 0 && board[t] === (by === 'w' ? 'P' : 'p')) return true;
    }
    for (const [df, dr] of KNIGHT) {
      const t = at(f + df, r + dr);
      if (t >= 0 && board[t] === (by === 'w' ? 'N' : 'n')) return true;
    }
    for (const [df, dr] of KING) {
      const t = at(f + df, r + dr);
      if (t >= 0 && board[t] === (by === 'w' ? 'K' : 'k')) return true;
    }
    const slide = (dirs, pieces) => dirs.some(([df, dr]) => {
      for (let k = 1; k < 8; k++) {
        const t = at(f + df * k, r + dr * k);
        if (t < 0) return false;
        const p = board[t];
        if (p === '.') continue;
        return colour(p) === by && pieces.includes(p.toLowerCase());
      }
      return false;
    });
    return slide(ROOK, 'rq') || slide(BISHOP, 'bq');
  }

  const kingOf = (board, c) => board.indexOf(c === 'w' ? 'K' : 'k');
  const inCheck = (s, c = s.turn) => attacked(s.board, kingOf(s.board, c), other(c));

  // every move by the side to play, before checking it doesn't leave its own king attacked
  function pseudo(s) {
    const out = [];
    const { board, turn } = s;
    const push = (from, to, extra = {}) => out.push({ from, to, piece: board[from], take: board[to] !== '.' ? board[to] : null, ...extra });
    for (let from = 0; from < 64; from++) {
      const p = board[from];
      if (colour(p) !== turn) continue;
      const f = from % 8;
      const r = Math.floor(from / 8);
      const kind = p.toLowerCase();
      if (kind === 'p') {
        const dir = turn === 'w' ? -1 : 1;
        const startRow = turn === 'w' ? 6 : 1;
        const lastRow = turn === 'w' ? 0 : 7;
        const pawnTo = (to, extra = {}) => {
          if (Math.floor(to / 8) === lastRow) for (const q of 'qrbn') push(from, to, { ...extra, promo: turn === 'w' ? q.toUpperCase() : q });
          else push(from, to, extra);
        };
        const one = at(f, r + dir);
        if (one >= 0 && board[one] === '.') {
          pawnTo(one);
          const two = at(f, r + dir * 2);
          if (r === startRow && board[two] === '.') push(from, two, { double: true });
        }
        for (const df of [-1, 1]) {
          const t = at(f + df, r + dir);
          if (t < 0) continue;
          if (board[t] !== '.' && colour(board[t]) !== turn) pawnTo(t);
          else if (t === s.ep) push(from, t, { ep: true, take: turn === 'w' ? 'p' : 'P' });
        }
      } else if (kind === 'n' || kind === 'k') {
        for (const [df, dr] of kind === 'n' ? KNIGHT : KING) {
          const t = at(f + df, r + dr);
          if (t >= 0 && colour(board[t]) !== turn) push(from, t);
        }
        if (kind === 'k') {
          const enemy = other(turn);
          const row = turn === 'w' ? 7 : 0;
          const home = row * 8 + 4;
          if (from === home && !attacked(board, home, enemy)) {
            const can = (flag) => s.castle.includes(turn === 'w' ? flag : flag.toLowerCase());
            if (can('K') && board[home + 1] === '.' && board[home + 2] === '.' && board[home + 3] === (turn === 'w' ? 'R' : 'r')
              && !attacked(board, home + 1, enemy) && !attacked(board, home + 2, enemy)) push(from, home + 2, { castle: 'K' });
            if (can('Q') && board[home - 1] === '.' && board[home - 2] === '.' && board[home - 3] === '.' && board[home - 4] === (turn === 'w' ? 'R' : 'r')
              && !attacked(board, home - 1, enemy) && !attacked(board, home - 2, enemy)) push(from, home - 2, { castle: 'Q' });
          }
        }
      } else {
        const dirs = kind === 'r' ? ROOK : kind === 'b' ? BISHOP : [...ROOK, ...BISHOP];
        for (const [df, dr] of dirs) {
          for (let k = 1; k < 8; k++) {
            const t = at(f + df * k, r + dr * k);
            if (t < 0) break;
            if (board[t] === '.') push(from, t);
            else {
              if (colour(board[t]) !== turn) push(from, t);
              break;
            }
          }
        }
      }
    }
    return out;
  }

  function play(s, m) {
    const board = s.board.slice();
    const turn = s.turn;
    board[m.to] = m.promo || m.piece;
    board[m.from] = '.';
    if (m.ep) board[m.to + (turn === 'w' ? 8 : -8)] = '.';
    if (m.castle) {
      const row = turn === 'w' ? 56 : 0;
      if (m.castle === 'K') { board[row + 5] = board[row + 7]; board[row + 7] = '.'; }
      else { board[row + 3] = board[row]; board[row] = '.'; }
    }
    let castle = s.castle;
    const lose = (flags) => { for (const c of flags) castle = castle.replace(c, ''); };
    if (m.piece === 'K') lose('KQ');
    if (m.piece === 'k') lose('kq');
    for (const sq of [m.from, m.to]) {
      if (sq === 63) lose('K');
      if (sq === 56) lose('Q');
      if (sq === 7) lose('k');
      if (sq === 0) lose('q');
    }
    const next = {
      board, turn: other(turn), castle, ep: m.double ? (m.from + m.to) / 2 : -1,
      half: m.take || m.piece.toLowerCase() === 'p' ? 0 : s.half + 1,
      full: s.full + (turn === 'b' ? 1 : 0), seen: s.seen,
    };
    return next;
  }

  function moves(s) {
    return pseudo(s).filter((m) => !inCheck(play(s, m), s.turn));
  }

  // only kings, or a king and a single knight or bishop against a king
  function bare(board) {
    const rest = board.filter((p) => p !== '.' && p.toLowerCase() !== 'k');
    return rest.length === 0 || (rest.length === 1 && 'nb'.includes(rest[0].toLowerCase()));
  }

  // how the game stands: null while it goes on
  function outcome(s) {
    const legal = moves(s);
    if (!legal.length) return inCheck(s) ? { result: other(s.turn), why: 'mat' } : { result: 'draw', why: 'pat' };
    if (s.half >= 100) return { result: 'draw', why: 'cinquante coups' };
    if ((s.seen[key(s)] || 0) >= 3) return { result: 'draw', why: 'répétition' };
    if (bare(s.board)) return { result: 'draw', why: 'matériel insuffisant' };
    return null;
  }

  // the move in French notation: R D T F C for king, queen, rook, bishop, knight
  const LETTER = { k: 'R', q: 'D', r: 'T', b: 'F', n: 'C', p: '' };
  function san(s, m) {
    if (m.castle) return m.castle === 'K' ? 'O-O' : 'O-O-O';
    const kind = m.piece.toLowerCase();
    let out = LETTER[kind];
    if (kind === 'p') {
      if (m.take) out += FILES[m.from % 8];
    } else {
      const rivals = moves(s).filter((o) => o.to === m.to && o.piece === m.piece && o.from !== m.from);
      if (rivals.length) {
        const sameFile = rivals.some((o) => o.from % 8 === m.from % 8);
        const sameRow = rivals.some((o) => Math.floor(o.from / 8) === Math.floor(m.from / 8));
        if (!sameFile) out += FILES[m.from % 8];
        else if (!sameRow) out += name(m.from)[1];
        else out += name(m.from);
      }
    }
    if (m.take) out += 'x';
    out += name(m.to);
    if (m.promo) out += `=${LETTER[m.promo.toLowerCase()]}`;
    const after = play(s, m);
    if (inCheck(after)) out += moves(after).length ? '+' : '#';
    return out;
  }

  // ---------- his side

  const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  // where each piece is better, seen from white, a8 first
  const PST = {
    p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
    kEnd: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
  };

  // the position from the side to play's point of view, in hundredths of a pawn
  function evaluate(s) {
    let score = 0;
    let heavy = 0;
    for (const p of s.board) if ('qQrRbBnN'.includes(p)) heavy += VALUE[p.toLowerCase()];
    const endgame = heavy <= 1300;
    for (let sq = 0; sq < 64; sq++) {
      const p = s.board[sq];
      if (p === '.') continue;
      const kind = p.toLowerCase();
      const index = white(p) ? sq : (7 - Math.floor(sq / 8)) * 8 + (sq % 8);
      const table = kind === 'k' && endgame ? PST.kEnd : PST[kind];
      const v = VALUE[kind] + table[index];
      score += white(p) ? v : -v;
    }
    return s.turn === 'w' ? score : -score;
  }

  const MATE = 100000;
  const order = (list) => list.sort((a, b) => ((b.take ? VALUE[b.take.toLowerCase()] * 10 - VALUE[b.piece.toLowerCase()] : 0) + (b.promo ? 800 : 0))
    - ((a.take ? VALUE[a.take.toLowerCase()] * 10 - VALUE[a.piece.toLowerCase()] : 0) + (a.promo ? 800 : 0)));

  function think(start, { ms = 1200, depth: maxDepth = 5, noise = 0 } = {}) {
    const until = Date.now() + ms;
    let nodes = 0;
    let stop = false;
    const out = () => {
      if ((++nodes & 1023) === 0 && Date.now() > until) stop = true;
      return stop;
    };

    function quiet(s, alpha, beta, depth) {
      const stand = evaluate(s);
      if (stand >= beta) return beta;
      if (stand > alpha) alpha = stand;
      if (depth <= 0) return alpha;
      for (const m of order(moves(s).filter((x) => x.take || x.promo))) {
        if (out()) break;
        const v = -quiet(play(s, m), -beta, -alpha, depth - 1);
        if (v >= beta) return beta;
        if (v > alpha) alpha = v;
      }
      return alpha;
    }

    function search(s, depth, alpha, beta, ply) {
      const list = moves(s);
      if (!list.length) return inCheck(s) ? -MATE + ply : 0;
      if (s.half >= 100) return 0;
      if (depth <= 0) return quiet(s, alpha, beta, 4);
      for (const m of order(list)) {
        if (out()) break;
        const v = -search(play(s, m), depth - 1, -beta, -alpha, ply + 1);
        if (v >= beta) return beta;
        if (v > alpha) alpha = v;
      }
      return alpha;
    }

    let best = null;
    let bestScore = -Infinity;
    const root = order(moves(start));
    if (!root.length) return null;
    for (let depth = 1; depth <= maxDepth && !stop; depth++) {
      let alpha = -Infinity;
      let pick = null;
      let pickScore = -Infinity;
      // the best of the last round first
      const list = best ? [best, ...root.filter((m) => m !== best)] : root;
      for (const m of list) {
        // the window is widened by the noise, so a move just under the best gets its true score and not a
        // bound the noise could lift over the best one
        const raw = -search(play(start, m), depth - 1, -Infinity, -(alpha - noise), 1);
        const v = raw + (noise ? (Math.random() - 0.5) * noise : 0);
        if (stop && pick) break;
        if (v > pickScore) { pickScore = v; pick = m; }
        if (raw > alpha) alpha = raw;
      }
      if (pick && (!stop || !best)) { best = pick; bestScore = pickScore; }
    }
    return { move: best, score: bestScore, nodes };
  }

  // a game: a position and how it got there
  function game(from = START) {
    let s = parse(from);
    s.seen = { [key(s)]: 1 };
    const past = [];
    return {
      get state() { return s; },
      get history() { return past.map((p) => p.san); },
      get last() { return past.at(-1)?.move || null; },
      moves: (sq) => moves(s).filter((m) => sq === undefined || m.from === sq),
      move(m) {
        const legal = moves(s).find((o) => o.from === m.from && o.to === m.to && (!o.promo || o.promo.toLowerCase() === (m.promo || 'q').toLowerCase()));
        if (!legal) return null;
        const label = san(s, legal);
        past.push({ state: s, move: legal, san: label });
        s = play(s, legal);
        s.seen = { ...past.at(-1).state.seen };
        s.seen[key(s)] = (s.seen[key(s)] || 0) + 1;
        return { ...legal, san: label };
      },
      undo() {
        const p = past.pop();
        if (p) s = p.state;
        return Boolean(p);
      },
      outcome: () => outcome(s),
      check: () => inCheck(s),
      fen: () => fen(s),
    };
  }

  const api = { START, parse, fen, moves, play, outcome, inCheck, san, think, evaluate, game, name, square, colour };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Chess = api;
}(typeof self !== 'undefined' ? self : this));
