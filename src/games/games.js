'use strict';

// The games window: you against L, and L is there, across the table. He thinks while his engine does,
// watches you play, says what he thinks of it. Everything that happens also goes to the L on your
// desktop (window.games.tell).

(() => {
  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const oneOf = (list) => list[Math.floor(Math.random() * list.length)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  let ready = false; // the three games setting up aren't news
  const tell = (event) => ready && window.games?.tell(event);

  const status = $('status');
  function setStatus(text, hot = false) {
    status.textContent = text;
    status.classList.toggle('hot', hot);
  }

  // ================= him, across the table

  const Him = (() => {
    const { POSES, SHEETS, draw, blend } = window.LBody;
    const can = $('lcan');
    const ctx = can.getContext('2d');
    const W = 250;
    const H = 480;
    const dpr = window.devicePixelRatio || 1;
    can.width = W * dpr;
    can.height = H * dpr;
    const S = 1.62;           // his size here
    const FEET = [118, 468];  // where his feet are on the canvas
    const live = { ...POSES.idle, gx: 1, gy: 0.3, lookX: 0.6, lookY: 0.3, phase: 0 };
    let base = 'idle';        // what he does when nothing happens
    let act = null;           // { pose, until }
    let time = 0;
    let last = performance.now();
    let blinkAt = 2;
    let blink = 0;
    let talking = 0;
    let squash = 0;
    let aim = { x: 1, y: 0.35 }; // where he looks, as a direction from his head
    let aimUntil = 0;
    let mouse = null;
    let mouseAt = -10;
    let nextFidget = 6;
    let hideTimer = null;
    let lastSaid = -100;
    const BLINK = 0.17;
    const said = $('said');
    const mood = $('mood');

    function pose(name, seconds) {
      if (!POSES[name]) return;
      act = { pose: name, until: time + seconds };
    }
    function rest(name) { if (POSES[name]) base = name; }
    function jolt(v = 0.06) { squash = Math.max(squash, v); }
    function lookAt(x, y, seconds = 1.5) {
      const r = can.getBoundingClientRect();
      const hx = r.left + FEET[0] + 10;
      const hy = r.top + FEET[1] - 200 * S;
      const d = Math.hypot(x - hx, y - hy) || 1;
      aim = { x: (x - hx) / d, y: (y - hy) / d };
      aimUntil = time + seconds;
    }
    function feel(text, hot = false) {
      mood.textContent = text;
      mood.classList.toggle('hot', hot);
    }
    // what he says, typed out; at most one remark every few seconds unless it matters
    function say(text, { must = false, chance = 1 } = {}) {
      if (!must && (time - lastSaid < 7 || Math.random() > chance)) return;
      lastSaid = time;
      clearTimeout(hideTimer);
      said.textContent = '';
      said.classList.add('on');
      let shown = 0;
      const typing = setInterval(() => {
        shown = Math.min(text.length, shown + 2);
        said.textContent = text.slice(0, shown);
        if (shown >= text.length) clearInterval(typing);
      }, 24);
      talking = Math.min(4, text.length * 0.012 + 0.3);
      hideTimer = setTimeout(() => said.classList.remove('on'), clamp(2600 + text.length * 60, 3000, 9000));
    }

    addEventListener('pointermove', (e) => {
      mouse = { x: e.clientX, y: e.clientY };
      mouseAt = time;
    });

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt;
      if (act && time >= act.until) act = null;
      // left alone, his hands find something to do
      nextFidget -= dt;
      if (nextFidget <= 0) {
        if (!act && base === 'idle') pose(oneOf(['thumb', 'thumb', 'nails', 'scratch', 'stare']), 2 + Math.random() * 3);
        nextFidget = 5 + Math.random() * 7;
      }
      const name = act ? act.pose : base;
      blend(live, POSES[name], 1 - Math.exp(-dt * 9));
      live.item = POSES[name].item;
      live.walk = POSES[name].walk;
      blinkAt -= dt;
      if (blinkAt <= 0) {
        blink = BLINK;
        blinkAt = Math.random() < 0.15 ? 0.3 : 3 + Math.random() * 7;
      }
      blink = Math.max(0, blink - dt);
      if (blink > 0) {
        const closing = Math.sin((1 - blink / BLINK) * Math.PI);
        live.lid = Math.max(live.lid, closing);
        if (closing > 0.92) live.eye = 0;
      }
      talking = Math.max(0, talking - dt);
      if (talking > 0) {
        if (SHEETS[POSES[name].sprite].mouth) live.mouth = Math.max(live.mouth, 0.42 + 0.42 * Math.sin(time * 15) * Math.sin(time * 4.3));
        else live.chew = 0.5;
      }
      // the board, or your pointer when it moves, or what he was told to look at
      let to = { x: 1, y: 0.32 };
      if (time < aimUntil) to = aim;
      else if (mouse && time - mouseAt < 2) {
        const r = can.getBoundingClientRect();
        const dx = mouse.x - (r.left + FEET[0] + 10);
        const dy = mouse.y - (r.top + FEET[1] - 200 * S);
        const d = Math.hypot(dx, dy) || 1;
        to = { x: dx / d, y: dy / d };
      }
      const k = 1 - Math.exp(-dt * 5);
      live.gx += (to.x - live.gx) * k;
      live.gy += (to.y - live.gy) * k;
      live.lookX += (to.x - live.lookX) * (1 - Math.exp(-dt * 18));
      live.lookY += (to.y - live.lookY) * (1 - Math.exp(-dt * 18));
      squash = Math.max(0, squash - dt * squash * 7 - dt * 0.01);
      live.squash = squash;
      live.tilt = 0;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // his shadow
      ctx.fillStyle = 'rgba(0, 0, 0, .35)';
      ctx.beginPath();
      ctx.ellipse(FEET[0] + 8, FEET[1] + 2, 105, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.translate(FEET[0], FEET[1]);
      ctx.scale(S, S);
      draw(ctx, live, time);
      requestAnimationFrame(frame);
    }
    window.LBody.ready.then(() => requestAnimationFrame(frame));

    return { pose, rest, say, feel, jolt, lookAt, state: () => ({ base, act: act?.pose }) };
  })();

  // ================= sound: a few clicks and tones, made here

  const Sound = (() => {
    let ac = null;
    let muted = false;
    try { muted = localStorage.getItem('l-games-mute') === '1'; } catch { /* sound on */ }
    const btn = $('mute');
    const show = () => btn.classList.toggle('off', muted);
    show();
    btn.addEventListener('click', () => {
      muted = !muted;
      try { localStorage.setItem('l-games-mute', muted ? '1' : '0'); } catch { /* not kept */ }
      show();
    });
    const audio = () => {
      if (!ac) ac = new AudioContext();
      return ac;
    };
    // wood on wood
    function knock(freq, vol, delay = 0) {
      if (muted) return;
      const a = audio();
      const len = Math.floor(a.sampleRate * 0.07);
      const buf = a.createBuffer(1, len, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
      const src = a.createBufferSource();
      src.buffer = buf;
      const f = a.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = 3;
      const g = a.createGain();
      g.gain.value = vol;
      src.connect(f).connect(g).connect(a.destination);
      src.start(a.currentTime + delay);
    }
    function tone(freq, seconds, vol, delay = 0, type = 'sine') {
      if (muted) return;
      const a = audio();
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = type;
      o.frequency.value = freq;
      const t = a.currentTime + delay;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
      o.connect(g).connect(a.destination);
      o.start(t);
      o.stop(t + seconds + 0.05);
    }
    return {
      move: () => knock(1500, 1.4),
      take: () => { knock(900, 1.8); knock(1700, 0.8, 0.045); },
      check: () => { tone(880, 0.22, 0.08, 0, 'triangle'); tone(1320, 0.3, 0.05, 0.06, 'triangle'); },
      drop: () => knock(500, 1.6),
      pen: () => knock(2600, 0.5),
      win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, 0.07, i * 0.09, 'triangle')),
      lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.4, 0.07, i * 0.12, 'triangle')),
      draw: () => [440, 440].forEach((f, i) => tone(f, 0.25, 0.06, i * 0.15, 'triangle')),
    };
  })();

  // ================= the score, per game

  const SCORE_KEY = 'l-games-score';
  let score = {};
  try { score = JSON.parse(localStorage.getItem(SCORE_KEY)) || {}; } catch { score = {}; }
  const NAMES = { chess: 'Échecs', ttt: 'Morpion', c4: 'Puissance 4' };
  let current = 'chess';
  function showScore() {
    const s = score[current] || { you: 0, him: 0, draw: 0 };
    $('tally').textContent = `${NAMES[current]} · toi ${s.you} — lui ${s.him} — nulles ${s.draw}`;
  }

  // the end of a game, for every game: score, his face, a sheet over the board
  function finish(game, result, why, sheet, title) {
    const s = score[game] || { you: 0, him: 0, draw: 0 };
    s[result]++;
    score[game] = s;
    try { localStorage.setItem(SCORE_KEY, JSON.stringify(score)); } catch { /* not kept */ }
    showScore();
    tell({ game, kind: 'end', result, why });
    if (result === 'him') {
      Sound.lose();
      Him.pose('lolly', 4);
      Him.rest('thumb');
      Him.feel('satisfait', true);
      Him.say(game === 'chess'
        ? oneOf(['Mat. On en refait une ? Tu as appris quelque chose, j’espère.', 'Je gagne. Ce n’est pas de la chance, c’est de la statistique.', 'Tu as tenu plus longtemps que prévu. Pas beaucoup.'])
        : oneOf(['Gagné.', 'Comme prévu.', 'Encore ?', 'Tu m’as laissé faire ?']), { must: true });
    } else if (result === 'you') {
      Sound.win();
      Him.rest('sulk');
      Him.jolt(0.1);
      Him.feel('vexé', true);
      Him.say(oneOf(['… Revanche.', 'Je n’aime pas perdre. Revanche.', 'Tu as gagné. Je vais y réfléchir longtemps.', 'Intéressant. Ça ne se reproduira pas.']), { must: true });
    } else {
      Sound.draw();
      Him.pose('think', 3);
      Him.feel('pensif');
      Him.say(game === 'ttt' ? 'Nulle. C’est ce qui arrive quand on joue bien tous les deux.' : 'Nulle. Personne n’est satisfait. C’est juste.', { must: true });
    }
    const text = { you: 'Tu as gagné', him: 'L a gagné', draw: 'Nulle' }[result];
    sheet.innerHTML = `<h2>${title}</h2><p>${text}.</p><div class="row"><button class="main again">Revanche</button><button class="look">Voir le plateau</button></div>`;
    sheet.querySelector('.again').addEventListener('click', () => { sheet.hidden = true; NEW[game](); });
    sheet.querySelector('.look').addEventListener('click', () => { sheet.hidden = true; });
    setTimeout(() => { sheet.hidden = false; }, 700);
  }

  // a game starts: he gets ready
  function fresh() {
    Him.rest('idle');
    Him.feel('t’attend');
  }

  // ================= tabs

  function show(game) {
    if (!NAMES[game]) return;
    current = game;
    for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.game === game);
    for (const s of document.querySelectorAll('.game')) s.classList.toggle('on', s.id === game);
    showScore();
    STATUS[game]();
    tell({ game, kind: 'open' });
  }
  for (const b of document.querySelectorAll('#tabs button')) b.addEventListener('click', () => show(b.dataset.game));
  window.games?.on('show', show);

  // ================= chess

  const LEVELS = [
    { ms: 350, depth: 2, noise: 120 },
    { ms: 1100, depth: 4, noise: 25 },
    { ms: 2600, depth: 6, noise: 0 },
    { ms: 200, depth: 1, noise: 420 }, // débutant: he barely looks; he can leave a piece hanging
  ];
  const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const boardEl = $('board');
  const squaresEl = $('squares');
  const piecesEl = $('pieces');
  let chess = null;
  let you = 'w';
  let flip = false;
  let picked = -1;
  let busy = false;
  let drag = null;
  let lastScore = 0;
  let token = 0;
  let tip = null;   // the move he shows you when you ask: { from, to }
  let hints = 0;    // how many times you asked, this game
  let worker = null;
  try { worker = new Worker('worker.js'); } catch { worker = null; }

  function ask(level) {
    const s = chess.state;
    return new Promise((resolve) => {
      if (!worker) {
        setTimeout(() => {
          const r = Chess.think(s, level);
          resolve(r && r.move ? { from: r.move.from, to: r.move.to, promo: r.move.promo, score: r.score } : null);
        }, 30);
        return;
      }
      worker.onmessage = ({ data }) => resolve(data);
      worker.postMessage({ fen: chess.fen(), seen: s.seen, level });
    });
  }

  // board square <-> where it is on the screen
  const cell = (sq) => {
    let f = sq % 8;
    let r = Math.floor(sq / 8);
    if (flip) { f = 7 - f; r = 7 - r; }
    return [f, r];
  };
  const place = (el, sq) => {
    const [f, r] = cell(sq);
    el.style.transform = `translate(${f * 100}%, ${r * 100}%)`;
  };
  function sqAt(e) {
    const r = boardEl.getBoundingClientRect();
    let f = Math.floor(((e.clientX - r.left) / r.width) * 8);
    let row = Math.floor(((e.clientY - r.top) / r.height) * 8);
    if (f < 0 || f > 7 || row < 0 || row > 7) return -1;
    if (flip) { f = 7 - f; row = 7 - row; }
    return row * 8 + f;
  }

  function drawSquares(over = -1) {
    const s = chess.state;
    const last = chess.last;
    const legal = picked >= 0 ? chess.moves(picked) : [];
    const checked = chess.check() ? s.board.indexOf(s.turn === 'w' ? 'K' : 'k') : -1;
    squaresEl.textContent = '';
    for (let i = 0; i < 64; i++) {
      const sq = flip ? 63 - i : i;
      const f = sq % 8;
      const r = Math.floor(sq / 8);
      const el = document.createElement('div');
      el.className = `sq ${(f + r) % 2 ? 'd' : 'l'}`;
      if (last && (last.from === sq || last.to === sq)) el.classList.add('last');
      if (sq === picked) el.classList.add('sel');
      if (tip && (tip.from === sq || tip.to === sq)) el.classList.add('tip');
      if (sq === checked) el.classList.add('check');
      if (sq === over) el.classList.add('over');
      const target = legal.find((m) => m.to === sq);
      if (target) el.classList.add(target.take ? 'ring' : 'dot');
      if (i % 8 === 0) el.insertAdjacentHTML('beforeend', `<span class="coord r">${8 - r}</span>`);
      if (i >= 56) el.insertAdjacentHTML('beforeend', `<span class="coord f">${'abcdefgh'[f]}</span>`);
      squaresEl.appendChild(el);
    }
    drawArrow();
  }

  // the hint, as an arrow from the piece to where it goes
  function drawArrow() {
    const svg = $('arrows');
    svg.textContent = '';
    if (!tip) return;
    const [f1, r1] = cell(tip.from);
    const [f2, r2] = cell(tip.to);
    const x1 = f1 * 100 + 50;
    const y1 = r1 * 100 + 50;
    const len = Math.hypot((f2 - f1) * 100, (r2 - r1) * 100);
    const x2 = f2 * 100 + 50 - ((f2 - f1) * 100 / len) * 30;
    const y2 = r2 * 100 + 50 - ((r2 - r1) * 100 / len) * 30;
    svg.innerHTML = '<defs><marker id="head" viewBox="0 0 6 6" refX="2" refY="3" markerWidth="3.2" markerHeight="3.2" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="rgba(96,196,128,.92)"/></marker></defs>'
      + `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(96,196,128,.85)" stroke-width="15" stroke-linecap="round" stroke-dasharray="900" marker-end="url(#head)"/>`;
  }

  // you ask him for help: he shows you the move he'd play in your place, and he remembers you asked
  async function hintChess() {
    if (busy || !chess || chess.outcome() || chess.state.turn !== you || !$('promo').hidden) return;
    const mine = token;
    busy = true;
    drawPieces();
    setStatus('L cherche. Pour toi. Il n’aime pas ça.', true);
    Him.rest('think');
    Him.feel('cherche pour toi…', true);
    const r = await ask({ ms: 900, depth: 4, noise: 0 });
    if (mine !== token) return;
    busy = false;
    Him.rest('idle');
    Him.feel('t’attend');
    if (!r) { chessStatus(); return; }
    tip = { from: r.from, to: r.to };
    hints++;
    drawAll();
    chessStatus();
    Sound.pen();
    tell({ game: 'chess', kind: 'hint', n: hints });
    Him.pose('thumb', 1.6);
    if (hints === 1) Him.say(oneOf(['Là. Je ne le dirai qu’une fois.', 'Celui-là. Ne me demande pas pourquoi, cherche.', 'Je te montre. Comprendre, c’est ton travail.']), { must: true });
    else if (hints === 3) Him.say('Trois indices. Je les compte.', { must: true });
    else if (hints >= 5) Him.say(oneOf(['À ce stade, c’est moi qui joue contre moi.', `${hints} indices. Je pourrais aussi bien jouer les deux couleurs.`]), { must: true });
    else Him.say(oneOf(['Là.', 'Encore ?', 'Regarde la flèche.']), { must: true });
  }

  let bySq = {};
  function drawPieces(landed = -1) {
    piecesEl.textContent = '';
    bySq = {};
    const s = chess.state;
    const mineNow = s.turn === you && !busy && !chess.outcome();
    for (let sq = 0; sq < 64; sq++) {
      const p = s.board[sq];
      if (p === '.') continue;
      const el = document.createElement('div');
      const side = Chess.colour(p);
      el.className = `pc${mineNow && side === you ? ' mine' : ''}${sq === landed ? ' land' : ''}`;
      el.innerHTML = Pieces.svg(p.toLowerCase(), side);
      place(el, sq);
      piecesEl.appendChild(el);
      bySq[sq] = el;
    }
  }

  function drawSide() {
    // what each side has lost, and who's ahead
    const full = { q: 1, r: 2, b: 2, n: 2, p: 8 };
    const lost = (c) => {
      const out = [];
      for (const k of 'qrbnp') {
        const have = chess.state.board.filter((p) => p === (c === 'w' ? k.toUpperCase() : k)).length;
        for (let n = have; n < full[k]; n++) out.push(k);
      }
      return out;
    };
    const him = you === 'w' ? 'b' : 'w';
    const tookYou = lost(him);  // what you took
    const tookHim = lost(you);
    $('takenYou').innerHTML = tookYou.map((k) => Pieces.svg(k, him)).join('');
    $('takenHim').innerHTML = tookHim.map((k) => Pieces.svg(k, you)).join('');
    const diff = tookYou.reduce((a, k) => a + VALUE[k], 0) - tookHim.reduce((a, k) => a + VALUE[k], 0);
    $('diffYou').textContent = diff > 0 ? `+${diff}` : '';
    $('diffHim').textContent = diff < 0 ? `+${-diff}` : '';
    // the moves
    const h = chess.history;
    const ol = $('moves');
    ol.textContent = '';
    for (let i = 0; i < h.length; i += 2) {
      const li = document.createElement('li');
      li.innerHTML = '<i></i><span></span><span></span>';
      li.children[0].textContent = `${i / 2 + 1}.`;
      li.children[1].textContent = h[i];
      li.children[2].textContent = h[i + 1] || '';
      if (i === h.length - 1) li.children[1].classList.add('new');
      if (i + 1 === h.length - 1) li.children[2].classList.add('new');
      ol.appendChild(li);
    }
    ol.scrollTop = ol.scrollHeight;
  }

  function drawAll(landed = -1) {
    drawSquares();
    drawPieces(landed);
    drawSide();
  }

  // his opinion of the position, from your side: the bar fills with your share
  function evalBar(hisScore) {
    const yours = -hisScore;
    const share = Math.abs(yours) > 50000 ? (yours > 0 ? 100 : 0) : 50 + 50 * Math.tanh(yours / 500);
    $('evalbar').firstElementChild.style.height = `${share}%`;
  }

  function chessStatus() {
    if (!chess || chess.outcome()) return;
    if (busy) setStatus('L réfléchit…', true);
    else setStatus(chess.check() ? 'Échec. À toi.' : 'À toi. Glisse une pièce, ou clique puis clique.');
  }

  function newChess() {
    token++;
    chess = Chess.game();
    you = $('side').value;
    flip = you === 'b';
    picked = -1;
    tip = null;
    hints = 0;
    busy = false;
    lastScore = 0;
    $('promo').hidden = true;
    $('chessEnd').hidden = true;
    evalBar(0);
    drawAll();
    fresh();
    tell({ game: 'chess', kind: 'start', youStart: you === 'w', level: Number($('level').value) });
    if (ready) Him.say(you === 'w' ? oneOf(['Les blancs. Prends ton temps, je prends le mien.', 'Joue. Je regarde.', 'À toi.']) : 'Je commence. Ne le prends pas mal.', { chance: 0.8 });
    if (you === 'b') hisTurn();
    else chessStatus();
  }

  // a piece slides; what it takes fades; a castling rook goes along
  async function slide(m) {
    const el = bySq[m.from];
    const takenAt = m.ep ? m.to + (Chess.colour(m.piece) === 'w' ? 8 : -8) : m.to;
    if (bySq[takenAt] && takenAt !== m.from) bySq[takenAt].classList.add('gone');
    if (el) {
      el.style.zIndex = 10;
      place(el, m.to);
    }
    if (m.castle) {
      const row = Chess.colour(m.piece) === 'w' ? 56 : 0;
      const [a, b] = m.castle === 'K' ? [row + 7, row + 5] : [row, row + 3];
      if (bySq[a]) place(bySq[a], b);
    }
    await wait(250);
  }

  function sounds(done) {
    if (chess.check()) Sound.check();
    else if (done.take) Sound.take();
    else Sound.move();
  }

  function legalTo(from, to) {
    return chess.moves(from).filter((m) => m.to === to);
  }

  function tryMove(from, to, animate) {
    const options = legalTo(from, to);
    if (!options.length) return false;
    if (options.some((m) => m.promo)) choosePromo(from, to, animate);
    else yourMove({ from, to }, animate);
    return true;
  }

  function choosePromo(from, to, animate) {
    const box = $('promo');
    box.innerHTML = '<p>Ton pion devient…</p><div class="choices"></div>';
    for (const k of 'qrbn') {
      const b = document.createElement('button');
      b.innerHTML = Pieces.svg(k, you);
      b.title = { q: 'Dame', r: 'Tour', b: 'Fou', n: 'Cavalier' }[k];
      b.addEventListener('click', () => {
        box.hidden = true;
        yourMove({ from, to, promo: k }, animate);
      });
      box.lastElementChild.appendChild(b);
    }
    box.hidden = false;
  }

  async function yourMove(m, animate) {
    const mine = token;
    picked = -1;
    tip = null;
    busy = true;
    const legal = legalTo(m.from, m.to)[0];
    if (animate) await slide(legal);
    const done = chess.move(m);
    drawAll(m.to);
    sounds(done);
    if (mine !== token) return;
    tell({ game: 'chess', kind: 'you', san: done.san, take: done.take ? done.take.toLowerCase() : null, check: chess.check() });
    // he looks up at what you did
    const r = boardEl.getBoundingClientRect();
    const [f, row] = cell(m.to);
    Him.lookAt(r.left + (f + 0.5) * r.width / 8, r.top + (row + 0.5) * r.height / 8, 1.2);
    if (done.take === 'q' || done.take === 'Q') {
      Him.jolt(0.08);
      Him.pose('stare', 1.6);
      Him.say(oneOf(['Ma dame. Je l’avais vu venir. Si.', 'Hm. Ça, je ne l’avais pas compté.']), { must: true });
    } else if (done.take) Him.pose('stare', 0.8);
    if (endChess()) return;
    hisTurn();
  }

  async function hisTurn() {
    const mine = token;
    busy = true;
    drawPieces();
    chessStatus();
    tell({ game: 'chess', kind: 'think' });
    const levelIndex = Number($('level').value);
    Him.rest(levelIndex === 2 ? 'nails' : 'think');
    Him.feel('réfléchit…', true);
    const started = Date.now();
    const r = await ask(LEVELS[levelIndex] || LEVELS[1]);
    const spent = Date.now() - started;
    if (spent < 700) await wait(700 - spent);
    if (mine !== token || !r) return;
    Him.rest('idle');
    Him.pose('reach', 0.6);
    await wait(250);
    const m = chess.moves(r.from).find((o) => o.to === r.to && (!o.promo || !r.promo || o.promo === r.promo));
    await slide(m);
    const done = chess.move({ from: r.from, to: r.to, promo: r.promo });
    const swing = r.score - lastScore;
    lastScore = r.score;
    busy = false;
    drawAll(r.to);
    sounds(done);
    evalBar(r.score);
    Him.feel('t’attend');
    const mate = Math.abs(r.score) > 50000 ? Math.sign(r.score) : 0;
    tell({ game: 'chess', kind: 'played', san: done.san, take: done.take ? done.take.toLowerCase() : null, check: chess.check(), score: r.score, swing, mate });
    if (!endChess()) {
      chessStatus();
      if (mate > 0) Him.say(oneOf(['Mat bientôt. Je ne dis pas en combien.', 'C’est fini. Tu ne le vois pas encore.']), { must: true });
      else if (swing > 260) {
        Him.pose(oneOf(['thumb', 'lolly']), 2.5);
        Him.say(oneOf(['Merci.', 'Ça, c’était une erreur. Je l’ai prise.', 'Tu voulais vraiment jouer ça ?']));
      } else if (chess.check()) Him.say(oneOf(['Échec.', 'Échec. Ton roi est mal entouré.']), { chance: 0.7 });
      else if (done.take && done.take.toLowerCase() === 'q') Him.say('Ta dame. Je la garde.', { must: true });
      else if (swing < -260) {
        Him.pose('scratch', 2);
        Him.say(oneOf(['Hm. Ce n’était pas prévu.', 'Joli. Ne t’habitue pas.']), { chance: 0.8 });
      } else if (Math.random() < 0.08) Him.say(oneOf(['Intéressant.', 'Continue.', 'Je vois ce que tu essaies de faire.']));
    }
  }

  function endChess() {
    const o = chess.outcome();
    if (!o) return false;
    busy = false;
    drawPieces();
    const result = o.result === 'draw' ? 'draw' : o.result === you ? 'you' : 'him';
    const title = { mat: 'Échec et mat', pat: 'Pat', 'cinquante coups': 'Cinquante coups', répétition: 'Répétition', 'matériel insuffisant': 'Plus assez de pièces' }[o.why];
    setStatus(`${title}. ${result === 'you' ? 'Tu as gagné.' : result === 'him' ? 'L a gagné.' : 'Nulle.'}`, true);
    finish('chess', result, o.why, $('chessEnd'), title);
    return true;
  }

  // ---------- your hand on the board: drag a piece, or click it then click where it goes
  boardEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || busy || chess.outcome() || chess.state.turn !== you || !$('promo').hidden) return;
    const sq = sqAt(e);
    if (sq < 0) return;
    if (picked >= 0 && picked !== sq && tryMove(picked, sq, true)) return;
    const p = chess.state.board[sq];
    if (p !== '.' && Chess.colour(p) === you && chess.moves(sq).length) {
      picked = sq;
      drawSquares();
      drag = { sq, el: bySq[sq], x: e.clientX, y: e.clientY, moved: false };
      try { boardEl.setPointerCapture(e.pointerId); } catch { /* a pointer made up by a test */ }
      Sound.pen();
    } else {
      picked = -1;
      drawSquares();
    }
  });
  boardEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
    drag.moved = true;
    const r = boardEl.getBoundingClientRect();
    const size = r.width / 8;
    drag.el.classList.add('lift');
    drag.el.style.transform = `translate(${e.clientX - r.left - size / 2}px, ${e.clientY - r.top - size / 2 - 6}px) scale(1.08)`;
    const over = sqAt(e);
    if (over !== drag.over) {
      drag.over = over;
      drawSquares(legalTo(drag.sq, over).length ? over : -1);
    }
  });
  boardEl.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.moved) return;
    const to = sqAt(e);
    d.el.classList.remove('lift');
    if (to >= 0 && to !== d.sq && legalTo(d.sq, to).length) {
      place(d.el, to);
      tryMove(d.sq, to, false);
    } else {
      place(d.el, d.sq);
      drawSquares();
    }
  });

  function undoChess() {
    if (busy || !chess.history.length) return;
    $('chessEnd').hidden = true;
    chess.undo();
    if (chess.state.turn !== you) chess.undo();
    picked = -1;
    tip = null;
    drawAll();
    chessStatus();
    fresh();
    tell({ game: 'chess', kind: 'undo' });
    Him.say(oneOf(['Tu reviens en arrière. Dans la vraie vie, ça ne marche pas.', 'Annuler. Je note.']), { chance: 0.7 });
  }

  $('chessNew').addEventListener('click', newChess);
  $('chessUndo').addEventListener('click', undoChess);
  $('chessHint').addEventListener('click', hintChess);
  $('chessFlip').addEventListener('click', () => { flip = !flip; drawAll(); });
  $('side').addEventListener('change', newChess);
  $('level').addEventListener('change', () => {
    Him.say(['Distrait. Tu as besoin d’aide, alors.', 'Sérieux. Comme d’habitude.', 'Vexé. Tu l’auras voulu.', 'Débutant. Je jouerai en regardant ailleurs. Vraiment ailleurs.'][Number($('level').value)], { must: true });
  });

  // ================= morpion: you are ✕

  const NS = 'http://www.w3.org/2000/svg';
  const tttEl = $('tttBoard');
  let ttt = Array(9).fill('');
  let tttYouStart = true;
  let tttBusy = false;
  let tttOver = false;
  const centre = (i) => [50 + (i % 3) * 100, 50 + Math.floor(i / 3) * 100];

  function svgEl(name, attrs) {
    const el = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  function tttFrame() {
    tttEl.textContent = '';
    for (const [x1, y1, x2, y2] of [[100, 14, 100, 286], [200, 14, 200, 286], [14, 100, 286, 100], [14, 200, 286, 200]]) {
      tttEl.appendChild(svgEl('line', { x1, y1, x2, y2, class: 'grid' }));
    }
    for (let i = 0; i < 9; i++) {
      const r = svgEl('rect', { x: (i % 3) * 100, y: Math.floor(i / 3) * 100, width: 100, height: 100, class: 'cell' });
      r.addEventListener('click', () => tttClick(i));
      tttEl.appendChild(r);
    }
  }

  function tttMark(i, who) {
    const [x, y] = centre(i);
    if (who === 'x') {
      tttEl.appendChild(svgEl('line', { x1: x - 26, y1: y - 26, x2: x + 26, y2: y + 26, class: 'x draw' }));
      tttEl.appendChild(svgEl('line', { x1: x + 26, y1: y - 26, x2: x - 26, y2: y + 26, class: 'x draw late' }));
    } else {
      const c = svgEl('circle', { cx: x, cy: y, r: 28, class: 'o draw', transform: `rotate(-90 ${x} ${y})` });
      c.style.strokeDasharray = 180;
      c.style.strokeDashoffset = 180;
      tttEl.appendChild(c);
    }
    Sound.pen();
  }

  function tttStatus() {
    if (tttOver) return;
    setStatus(tttBusy ? 'L réfléchit…' : 'À toi : tu as les ✕.', tttBusy);
  }

  function tttEnd() {
    const w = Small.tttWinner(ttt);
    if (!w) return false;
    tttOver = true;
    if (w.line.length) {
      const [a, , c] = w.line;
      const [x1, y1] = centre(a);
      const [x2, y2] = centre(c);
      const dx = Math.sign(x2 - x1) * 30;
      const dy = Math.sign(y2 - y1) * 30;
      tttEl.appendChild(svgEl('line', { x1: x1 - dx, y1: y1 - dy, x2: x2 + dx, y2: y2 + dy, class: 'win' }));
    }
    const result = w.who === 'draw' ? 'draw' : w.who === 'x' ? 'you' : 'him';
    setStatus(result === 'draw' ? 'Nulle.' : result === 'you' ? 'Tu as gagné.' : 'L a gagné.', true);
    finish('ttt', result, w.who === 'draw' ? 'nulle' : 'ligne', $('tttEnd'), result === 'draw' ? 'Nulle' : 'Trois alignés');
    return true;
  }

  async function tttHim() {
    tttBusy = true;
    tttStatus();
    tell({ game: 'ttt', kind: 'think' });
    Him.rest('think');
    await wait(550 + Math.random() * 600);
    const i = Small.tttMove(ttt, 'o', 0.12);
    Him.rest('idle');
    Him.pose('reach', 0.5);
    if (i >= 0) {
      ttt[i] = 'o';
      tttMark(i, 'o');
    }
    tttBusy = false;
    tell({ game: 'ttt', kind: 'played' });
    if (!tttEnd()) tttStatus();
  }

  function tttClick(i) {
    if (tttBusy || tttOver || ttt[i]) return;
    ttt[i] = 'x';
    tttMark(i, 'x');
    tell({ game: 'ttt', kind: 'you' });
    const r = tttEl.getBoundingClientRect();
    const [x, y] = centre(i);
    Him.lookAt(r.left + (x / 300) * r.width, r.top + (y / 300) * r.height, 1);
    if (!tttEnd()) tttHim();
  }

  function newTtt() {
    ttt = Array(9).fill('');
    tttOver = false;
    tttBusy = false;
    tttYouStart = !tttYouStart;
    $('tttEnd').hidden = true;
    tttFrame();
    fresh();
    tell({ game: 'ttt', kind: 'start', youStart: tttYouStart });
    if (ready) Him.say(tttYouStart ? 'Tu commences. Ça ne t’aidera pas.' : 'À moi de commencer.', { chance: 0.6 });
    if (!tttYouStart) tttHim();
    else tttStatus();
  }
  $('tttNew').addEventListener('click', newTtt);

  // ================= puissance 4: you are 1 (red), he is 2

  const c4El = $('c4Board');
  const ghost = $('c4Ghost');
  let c4 = Small.c4Empty();
  let c4Busy = false;
  let c4Over = false;

  function drawC4(line = [], dropped = null) {
    c4El.textContent = '';
    for (let c = 0; c < Small.COLS; c++) {
      const col = document.createElement('div');
      col.className = 'col';
      for (let r = 0; r < Small.ROWS; r++) {
        const cellEl = document.createElement('div');
        cellEl.className = 'cell';
        if (line.some(([rr, cc]) => rr === r && cc === c)) cellEl.classList.add('win');
        if (c4[r][c]) {
          const i = document.createElement('i');
          i.className = `p${c4[r][c]}`;
          if (dropped && dropped[0] === r && dropped[1] === c) {
            i.classList.add('drop');
            i.style.setProperty('--from', `${-(r + 1) * 64 - 60}px`);
            i.style.setProperty('--fall', `${0.2 + r * 0.05}s`);
          }
          cellEl.appendChild(i);
        }
        col.appendChild(cellEl);
      }
      col.addEventListener('click', () => c4Click(c));
      col.addEventListener('pointerenter', () => {
        ghost.style.transform = `translateX(${c * 64}px)`;
      });
      c4El.appendChild(col);
    }
    ghost.style.opacity = c4Busy || c4Over ? 0 : 1;
  }

  function c4Status() {
    if (c4Over) return;
    setStatus(c4Busy ? 'L réfléchit…' : 'À toi.', c4Busy);
  }

  function c4End() {
    const w = Small.c4Winner(c4);
    if (!w) return false;
    c4Over = true;
    ghost.style.opacity = 0;
    setTimeout(() => drawC4(w.line), 450);
    const result = w.who === 'draw' ? 'draw' : w.who === 1 ? 'you' : 'him';
    setStatus(result === 'draw' ? 'Grille pleine. Nulle.' : result === 'you' ? 'Tu as gagné.' : 'L a gagné.', true);
    finish('c4', result, w.who === 'draw' ? 'nulle' : 'ligne', $('c4End'), result === 'draw' ? 'Grille pleine' : 'Quatre alignés');
    return true;
  }

  function drop(c, who) {
    const r = Small.c4Row(c4, c);
    if (r < 0) return false;
    c4[r][c] = who;
    drawC4([], [r, c]);
    setTimeout(Sound.drop, 200 + r * 50);
    return true;
  }

  async function c4Him() {
    c4Busy = true;
    ghost.style.opacity = 0;
    c4Status();
    tell({ game: 'c4', kind: 'think' });
    Him.rest('think');
    await wait(450);
    const started = Date.now();
    const c = Small.c4Move(c4, 2, 6);
    const spent = Date.now() - started;
    if (spent < 500) await wait(500 - spent);
    Him.rest('idle');
    Him.pose('reach', 0.5);
    c4Busy = false;
    drop(c, 2);
    tell({ game: 'c4', kind: 'played' });
    if (!c4End()) c4Status();
  }

  function c4Click(c) {
    if (c4Busy || c4Over) return;
    if (!drop(c, 1)) return;
    tell({ game: 'c4', kind: 'you' });
    const r = c4El.getBoundingClientRect();
    Him.lookAt(r.left + (c + 0.5) * r.width / 7, r.top + r.height * 0.7, 1);
    if (!c4End()) c4Him();
  }

  function newC4() {
    c4 = Small.c4Empty();
    c4Over = false;
    c4Busy = false;
    $('c4End').hidden = true;
    drawC4();
    fresh();
    tell({ game: 'c4', kind: 'start', youStart: true });
    if (ready) Him.say('Tu as les rouges. Commence.', { chance: 0.6 });
    c4Status();
  }
  $('c4New').addEventListener('click', newC4);

  // ---------- off we go
  const NEW = { chess: newChess, ttt: newTtt, c4: newC4 };
  const STATUS = { chess: chessStatus, ttt: tttStatus, c4: c4Status };
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && picked >= 0) {
      picked = -1;
      drawSquares();
    }
  });
  newChess();
  tttYouStart = false;
  newTtt();
  newC4();
  ready = true;
  show(new URLSearchParams(location.search).get('game') || 'chess');
  Him.say(oneOf(['Assieds-toi. On joue.', 'Enfin quelqu’un qui veut réfléchir.', 'Je te laisse choisir le jeu. Ça ne changera pas le résultat.']), { must: true });

  // for scripts/stow-check.js and a look at it
  window.__G = {
    show,
    chess: () => chess,
    // a move as your hand would make it: click on the piece, click where it goes
    click: (sq) => {
      const r = boardEl.getBoundingClientRect();
      const [f, row] = cell(sq);
      const at = { clientX: r.left + (f + 0.5) * r.width / 8, clientY: r.top + (row + 0.5) * r.height / 8, button: 0, pointerId: 1, bubbles: true };
      boardEl.dispatchEvent(new PointerEvent('pointerdown', at));
      boardEl.dispatchEvent(new PointerEvent('pointerup', at));
    },
    hint: hintChess,
    tip: () => tip,
    state: () => ({ current, busy, history: chess.history, status: status.textContent, ttt: ttt.join(','), c4: c4.map((r) => r.join('')).join('/'), him: Him.state() }),
    ttt: tttClick,
    c4: c4Click,
  };
})();
