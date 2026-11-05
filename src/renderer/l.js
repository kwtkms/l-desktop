'use strict';

// How he lives: where he crouches or sits, what he does with his hands, how he answers.
// (x, y) is the point between his feet, in overlay coordinates. He never jumps: he gets up, walks
// bent forward with his hands in his pockets, and crouches again. Between two windows he walks out
// of one and into the other.

(() => {
  const { POSES, SHEETS, STEP_LENGTH, draw, tower, cube, cup, laptop, blend, spot } = window.LBody;
  const canvas = document.getElementById('me');
  const ctx = canvas.getContext('2d');
  const talk = document.getElementById('talk');
  const bubble = document.getElementById('bubble');
  const entry = document.getElementById('entry');
  const input = document.getElementById('input');

  const SCALE = 1.45;
  const W = 360;
  const H = 500;
  const FEET_X = W / 2;
  const FEET_Y = H - 130; // what's below is for his legs when he sits on a window
  const HEAD = 225;      // how much room he needs above a window, crouched
  const TALL = 360;      // ...and up on his feet
  const LEGS = 130;      // how far his feet hang when he sits
  const STEP = 46;       // his walking speed: he's in no hurry
  const CUP_X = 80;      // where he puts his cup down
  const CUBE = 34;       // the sugar cube he leaves when he's put away, in pixels
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  canvas.width = W * dpr;
  canvas.height = H * dpr;

  let screenW = innerWidth;
  let screenH = innerHeight;
  let wins = [];
  let fg = null;

  const me = {
    x: screenW * 0.72, y: screenH, mode: 'perch', vy: 0, win: null, off: 0, side: 1, alpha: 0,
    rest: 'crouch', face: 1, vx: 0, squash: 0, wob: 0, wobV: 0, prop: null, propUntil: 0, afterFall: null, dozing: false, walk: null, drag: false, asleep: false, quiet: false, thinking: false, asking: false, talking: 0, sulkUntil: 0, phase: 0,
  };
  const live = { ...POSES.idle, gx: 0, gy: 0, lookX: 0, lookY: 0, phase: 0 };
  let sugars = 3;
  let crumbs = [];
  let blinkAt = 3;
  let blink = 0;
  const BLINK = 0.17;
  let flying = [];     // what's in the air between his hand and somewhere
  let ripple = 0;
  let lastMoved = -100; // the last time the pointer moved
  let lastSeen = 0;     // ...or anything else that means you're there
  let interest = null;  // what he's looking at when it isn't your pointer
  let nextGlance = 2;
  let overHim = 0;
  let turnWish = 0;
  let strokes = [];
  let clicks = [];
  let lastStrokeDir = 0;
  let lastMouseX = 0;
  let dragV = { x: 0, y: 0, px: 0, py: 0 };
  let acting = null; // { pose, until, then }
  let nextAct = 5;
  let nextMove = 60;
  let nextRemark = 400;
  let mouse = { x: -1, y: -1 };
  let lastHeard = 0;
  let lastTyped = -100; // the last key you pressed in his panel
  let lastSpoke = -100; // the last thing he said about a game
  const play = { win: null, game: null, on: false, live: false, want: false, tried: -100, since: 0 };
  let hand = null;      // the sugar you took from his tower, at your pointer: { el, x, y, vx, vy }
  let loose = [];       // sugars out in the world, thrown or dropped: { el, x, y, vx, vy, still, win, t }
  let eaten = [];       // when he ate his last sugars
  let rushUntil = 0;    // too much sugar: he goes faster, for a while
  let shakes = [];      // how hard he's being shaken, held
  let dizzy = false; // the games window, and whether a game is going
  let seenWall = Date.now(); // the last time your pointer moved, by the clock
  let lastPoint = { x: -1, y: -1, at: 0 };
  let flinchAt = -100;  // the last time your pointer flew past his face
  let towerEye = 0;     // how long your pointer has been hovering over his tower
  let towerSaid = false;
  let nextInvite = 900 + Math.random() * 900; // when he asks you for a game

  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const oneOf = (list) => list[Math.floor(Math.random() * list.length)];

  // ---------- where he can be

  // windows come front to back: this point of a window's top edge isn't under another one
  const clearAt = (win, x) => {
    for (const w of wins) {
      if (w.id === win.id) return true;
      if (x > w.x && x < w.x + w.w && win.y >= w.y && win.y < w.y + w.h) return false;
    }
    return true;
  };

  const perchable = (w) => !w.max && w.y > HEAD && w.y < screenH - 40 && w.w > 260;

  // what's under him, if he had to come down: the highest window, or the bottom of the screen
  function ground(x, fromY) {
    let best = { y: screenH, win: null };
    for (const w of wins) {
      if (!perchable(w) || x < w.x + 30 || x > w.x + w.w - 30) continue;
      if (w.y < fromY - 2 || w.y >= best.y || !clearAt(w, x)) continue;
      best = { y: w.y, win: w };
    }
    return best;
  }

  // somewhere to go: the window in front if he can sit on it, otherwise any other, or the floor
  function chooseSpot() {
    // often just a few steps along where he is
    const here = surface(me.win);
    if (here && Math.random() < 0.6) {
      const to = me.x + rnd(110, 340) * (Math.random() < 0.5 ? -1 : 1);
      const x = clamp(to, here.x + 70, here.x + here.w - 70);
      if (x > 80 && x < screenW - 80 && Math.abs(x - me.x) > 60 && (me.win === null || clearAt(here, x))) return { x, win: me.win };
    }
    const spots = wins.filter(perchable).filter((w) => w.id !== me.win && w.y > TALL);
    const front = spots.find((w) => w.id === fg);
    for (const w of front ? [front, ...spots] : spots.sort(() => Math.random() - 0.5)) {
      for (let i = 0; i < 5; i++) {
        const x = rnd(w.x + 70, w.x + w.w - 70);
        if (clearAt(w, x) && x > 80 && x < screenW - 80) return { x, win: w.id };
      }
    }
    return { x: rnd(140, screenW - 140), win: null };
  }

  const surface = (id) => (id === null ? { x: 0, y: screenH, w: screenW } : wins.find((w) => w.id === id));

  // on the same surface he just walks. Otherwise he walks to the edge he's nearest to, fades, and
  // comes in along the other surface.
  function goTo(spot) {
    if (spot.win === me.win) {
      me.walk = { x: spot.x, then: null };
    } else if (spot.win === null && me.win !== null && surface(me.win) && offEdge(surface(me.win)) !== null) {
      // down is easy: he walks off the edge
      me.walk = { x: offEdge(surface(me.win)), off: true, then: spot };
    } else {
      const from = surface(me.win);
      const toRight = from && from.x + from.w - me.x < me.x - from.x;
      let edge = from ? (toRight ? from.x + from.w - 14 : from.x + 14) : me.x;
      // in a hurry (you want to play): a few steps and he fades, wherever he is
      if (spot.quick) edge = me.x + (toRight ? 1 : -1) * Math.min(Math.abs(edge - me.x), 110);
      me.walk = { x: clamp(edge, 30, screenW - 30), fade: true, then: spot };
    }
    me.mode = 'walk';
    acting = null;
    me.side = me.walk.x >= me.x ? 1 : -1;
  }

  // past which end of this window he'd fall clear of it, if it's on the screen
  function offEdge(s) {
    const right = s.x + s.w + 34;
    const left = s.x - 34;
    const canRight = right < screenW - 30;
    const canLeft = left > 30;
    if (canRight && (!canLeft || right - me.x < me.x - left)) return right;
    return canLeft ? left : null;
  }

  function arrive(spot) {
    const to = surface(spot.win);
    if (!to) {
      me.mode = 'perch';
      return;
    }
    const enterLeft = Math.abs(spot.x - to.x) < Math.abs(spot.x - (to.x + to.w));
    me.x = clamp(enterLeft ? to.x + 14 : to.x + to.w - 14, 30, screenW - 30);
    me.y = to.y;
    me.win = spot.win;
    me.off = me.x - to.x;
    me.walk = { x: spot.x, appear: true, then: null };
    me.side = spot.x >= me.x ? 1 : -1;
  }

  // what he does once he's somewhere: sits if there's an edge to sit on, or stays up, or crouches
  const canStand = () => me.y > TALL;
  const canSit = () => me.win !== null && me.y < screenH - LEGS;

  function chooseRest() {
    const r = Math.random();
    if (canSit() && r < 0.45) return 'sit';
    if (canStand() && r < 0.7) return 'stand';
    return 'crouch';
  }

  function settle(g) {
    me.rest = 'crouch';
    if (dizzy) {
      dizzy = false;
      shakes = [];
      setTimeout(() => {
        act('dazed', 3.6);
        me.wobV = 2.2;
        if (!me.quiet) say(oneOf(['Le plafond tourne. C’est ta faute.', 'Je vais m’asseoir. Je suis déjà assis. Ça tourne quand même.', 'On ne secoue pas un détective. Ni personne.']));
      }, 30);
    }
    const impact = clamp(me.vy / 900, 0, 1);
    me.squash = Math.max(me.squash, 0.05 + impact * 0.26);
    me.vx = 0;
    if (impact > 0.62) {
      act('dazed', 1.8);
      if (!me.quiet && Math.random() < 0.3) say(oneOf(['Ça, je l’ajoute à ta liste.', 'Le sol est là. C’est noté.', 'Merci. J’avais besoin de vérifier la gravité.']));
    }
    me.y = g.y;
    me.win = g.win?.id ?? null;
    me.off = g.win ? me.x - g.win.x : 0;
    me.mode = 'perch';
    me.vy = 0;
    if (me.afterFall !== null) {
      const x = me.afterFall;
      me.afterFall = null;
      goTo({ x, win: me.win });
    }
  }

  function onWindows(data) {
    wins = data.wins || [];
    // something new came to the front: he glances at it
    if (data.fg !== fg) {
      const w = wins.find((v) => v.id === data.fg);
      if (w) {
        interest = { x: w.x + w.w / 2, y: w.y + w.h / 3 };
        nextGlance = rnd(1.2, 2.4);
      }
    }
    fg = data.fg;
    if (play.want) toGame();
    if ((me.mode !== 'perch' && me.mode !== 'walk') || me.win === null) return;
    if (me.mode === 'inside') return;
    const w = wins.find((v) => v.id === me.win);
    // his window left, or something covered him: he comes down
    if (!w || !perchable(w) || (me.mode === 'perch' && !clearAt(w, clamp(w.x + me.off, 0, screenW)))) {
      me.mode = 'fall';
      me.win = null;
      me.walk = null;
      return;
    }
    const dx = w.x + me.off - me.x;
    // his window is moving under him: he feels it
    if (Math.abs(dx) > 1 || Math.abs(w.y - me.y) > 1) {
      me.wobV = clamp(me.wobV - dx * 0.035, -2.4, 2.4);
      me.squash = Math.max(me.squash, clamp(Math.abs(w.y - me.y) * 0.004, 0, 0.14));
    }
    me.x = clamp(w.x + me.off, 30, screenW - 30);
    if (me.walk) me.walk.x += dx;
    me.y = w.y;
  }

  // ---------- what he says

  let hideTimer = null;
  let typing = null;
  let panelOpen = false;
  const INK_TOP = () => me.y - (me.mode === 'stowed' ? CUBE + 20 : extent().top + 6);

  function place() {
    const width = talk.offsetWidth || 310;
    talk.style.left = `${clamp(me.x - width / 2, 8, screenW - width - 8)}px`;
    if (INK_TOP() > 190) {
      talk.style.top = '';
      talk.style.bottom = `${screenH - INK_TOP()}px`;
    } else {
      talk.style.bottom = '';
      talk.style.top = `${Math.min(me.y + 8, screenH - 240)}px`;
    }
  }

  function refreshTalk() {
    const on = panelOpen || bubble.style.display === 'block';
    talk.style.display = on ? 'flex' : 'none';
    entry.style.display = panelOpen ? 'flex' : 'none';
    if (on) place();
  }

  // choices: buttons under what he says, [{ label, fn }]; a click does it and closes the bubble
  function say(text, { note = '', stay = false, thinking = false, choices = null } = {}) {
    clearTimeout(hideTimer);
    clearInterval(typing);
    bubble.classList.toggle('thinking', thinking);
    const finish = () => {
      bubble.textContent = text;
      if (note) {
        const small = document.createElement('small');
        small.textContent = note;
        bubble.appendChild(small);
      }
      if (choices) {
        const row = document.createElement('div');
        row.className = 'choices';
        for (const c of choices) {
          const b = document.createElement('button');
          b.textContent = c.label;
          b.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            lastSeen = time;
            bubble.style.display = 'none';
            refreshTalk();
            c.fn();
          });
          row.appendChild(b);
        }
        bubble.appendChild(row);
        if (onTalk(mouse.x, mouse.y)) window.l.interactive(true);
      }
    };
    // he says it at the speed he says it; a long answer doesn't make you wait
    if (thinking || text.length > 400) finish();
    else {
      let shown = 0;
      bubble.textContent = '';
      typing = setInterval(() => {
        shown = Math.min(text.length, shown + 2);
        bubble.textContent = text.slice(0, shown);
        if (shown >= text.length) {
          clearInterval(typing);
          finish();
        }
      }, 22);
    }
    bubble.style.display = 'block';
    bubble.scrollTop = 0;
    refreshTalk();
    if (!thinking) me.talking = Math.min(5, text.length * 0.011 + 0.3);
    if (!stay && !thinking) hideTimer = setTimeout(hush, clamp(3500 + text.length * 70, 4000, 45000));
  }

  function hush() {
    if (bubble.matches(':hover')) {
      hideTimer = setTimeout(hush, 2000);
      return;
    }
    bubble.style.display = 'none';
    refreshTalk();
  }

  function openPanel() {
    if (me.asleep) wake();
    let told = true;
    try { told = localStorage.getItem('l-told') === '1'; localStorage.setItem('l-told', '1'); } catch { /* he'll tell you again */ }
    if (!told) setTimeout(() => say('Écris-moi ici. Tu peux aussi prendre un sucre sur ma tour et me le lancer, me tenir par le col, ou faire un clic droit sur moi pour le reste. Les touches : Ctrl+Alt+K, J, H, U, L.', { stay: true }), 200);
    panelOpen = true;
    refreshTalk();
    window.l.keyboard(true);
    window.l.interactive(true);
    hovering = true;
    setTimeout(() => input.focus(), 30);
  }

  function closePanel() {
    panelOpen = false;
    input.value = '';
    input.blur();
    window.l.keyboard(false);
    refreshTalk();
  }

  // ---------- what he does with his hands

  const PICK = { stride: 'stand', sit: 'sit' };
  const restPose = () => (me.rest === 'stand' ? 'stand' : me.rest === 'sit' ? 'sit' : 'idle');
  const yawnPose = () => (me.rest === 'stand' ? 'standYawn' : me.rest === 'sit' ? 'sitYawn' : 'yawn');
  const starePose = () => (me.rest === 'stand' ? 'standStare' : me.rest === 'sit' ? 'sitStare' : 'stare');

  function act(pose, seconds, then) {
    // his hands are out of his pockets only crouched
    if (!PICK[POSES[pose].sprite]) me.rest = 'crouch';
    acting = { pose, until: time + seconds, then };
  }

  // one thing after another, as long as nothing else has come up
  function seq(steps) {
    const go = (i) => {
      if (i >= steps.length) return;
      const { pose, s, fn } = steps[i];
      act(pose, s, () => go(i + 1));
      fn?.();
    };
    go(0);
  }

  // from somewhere around his feet to somewhere else, through the air
  function fly(kind, from, to, seconds, peak, then) {
    flying.push({ kind, from, to, t: 0, seconds, peak, then });
  }

  const pinch = () => spot('eat', ...SHEETS.eat.pinch);
  const lips = () => spot('eat', ...SHEETS.eat.lips);

  function eat() {
    if (sugars > 0 && Math.random() < 0.6) {
      sugars--;
      seq([
        { pose: 'pinch', s: 0.55 },
        { pose: 'pinch', s: 0.34, fn: () => fly('cube', pinch(), lips(), 0.32, 9, () => { live.chew = 1; }) },
        { pose: 'eat', s: 2.2 },
      ]);
    } else act(oneOf(['berry', 'lolly']), rnd(3, 6));
  }

  function addSugar() {
    act('reach', 1.2);
    const height = () => [58, -sugars * 9.6 - 9];
    fly('cube', spot('idle', 370, 270), height(), 0.75, 16, () => {
      sugars++;
      me.squash = Math.max(me.squash, 0.012);
      if (sugars >= 9 + Math.floor(Math.random() * 5)) collapse();
    });
  }

  // tea, or something that was tea before the sugar went in
  function tea() {
    if (me.rest !== 'crouch' && !canCrouch()) return;
    me.prop = 'cup';
    me.propUntil = time + rnd(35, 70);
    const count = 2 + Math.floor(Math.random() * 5);
    const steps = [{ pose: 'pinch', s: 0.8 }];
    for (let i = 0; i < count; i++) {
      steps.push({ pose: 'pinch', s: rnd(0.7, 1.1), fn: () => fly('cube', pinch(), [CUP_X, -19], 0.42, -6, () => { ripple = 1; }) });
    }
    steps.push({ pose: 'think', s: rnd(1.6, 3) });
    seq(steps);
  }

  function computer() {
    me.prop = 'laptop';
    const long = rnd(10, 26);
    me.propUntil = time + long + 0.5;
    act('laptop', long);
  }

  const canCrouch = () => true;

  function collapse(byYou = false) {
    const push = byYou ? 1.6 : 1;
    for (let i = 0; i < sugars; i++) crumbs.push({ x: 58 * me.side + rnd(-4, 4), y: -i * 9.6, vx: rnd(-50, 70) * me.side * push, vy: rnd(-90, -10) * push, life: 1.6 });
    sugars = 0;
    if (byYou) {
      wake();
      me.squash = Math.max(me.squash, 0.06);
      // he looks at the mess, then at you
      seq([{ pose: starePose(), s: 1.1 }, { pose: 'nails', s: 2.4 }]);
      if (!me.quiet) say(oneOf(['Tu viens de détruire neuf minutes de travail.', 'Je reconstruirai. Je me souviendrai aussi.', 'Intéressant. Tu fais ça quand tu perds ?', 'C’était une tour porteuse.']));
      nextAct = rnd(6, 10);
      setTimeout(() => { if (me.mode === 'perch' && !acting) addSugar(); }, 5200);
      return;
    }
    act('nails', 3.5);
    if (!me.quiet) say(oneOf(['Bien. On recommence.', 'C’était prévu.', 'Non. Ça ne compte pas.', 'Tu n’as rien vu.']));
  }

  // ---------- sugars you hold, throw, drop. He catches them, or goes and picks them up.

  function sugarEl() {
    const el = document.createElement('div');
    el.className = 'sugar';
    document.body.appendChild(el);
    return el;
  }
  const placeEl = (c) => { c.el.style.transform = `translate(${Math.round(c.x - 7)}px, ${Math.round(c.y - 13)}px)`; };

  // where his hands can reach, on the screen
  const reach = () => ({ x: me.x + me.side * 34, y: me.y - extent().top * 0.5 });

  function grab(x, y) {
    if (hand) return;
    hand = { el: sugarEl(), x, y, vx: 0, vy: 0, px: x, py: y };
    placeEl(hand);
    window.l.interactive(true); // the window keeps your pointer while you hold it
    document.body.style.cursor = 'grabbing';
    lastSeen = time;
  }

  function takeFromTower(x, y) {
    if (sugars < 1) return;
    // the bottom one, sometimes: it all comes down
    if (sugars >= 9 && Math.random() < 0.2) {
      collapse(true);
      return;
    }
    sugars--;
    grab(x, y);
    memo.stolen++;
    keep();
    if (me.quiet) return;
    const n = memo.stolen;
    if (n === 10 || n === 25 || n === 50 || n === 100) say(`${n} sucres pris sur ma tour depuis le début. Je tiens les comptes. Toi, tu ne les tiens pas.`);
    else if (Math.random() < 0.35) say(oneOf(['C’est le mien.', 'Repose ça.', 'Tu me le rends comment ?', 'Lance-le-moi. Je l’attraperai.']));
  }

  function release() {
    const c = hand;
    hand = null;
    document.body.style.cursor = '';
    const r = reach();
    // let go right at his hands: he takes it
    if (Math.hypot(c.x - r.x, c.y - r.y) < 75 && Math.hypot(c.vx, c.vy) < 600 && canCatch()) {
      c.el.remove();
      catchSugar();
    } else loose.push({ ...c, vx: clamp(c.vx, -1800, 1800), vy: clamp(c.vy, -1800, 1400), still: false, win: null, t: 0 });
    window.l.interactive(onHim(mouse.x, mouse.y) || panelOpen);
  }

  const canCatch = () => me.mode === 'perch' && !me.asleep && !me.thinking && time >= me.sulkUntil && !acting?.game;

  function catchSugar() {
    me.squash = Math.max(me.squash, 0.04);
    seq([
      { pose: 'pinch', s: 0.45 },
      { pose: 'pinch', s: 0.34, fn: () => fly('cube', pinch(), lips(), 0.32, 9, () => { live.chew = 1; ate(); }) },
      { pose: 'eat', s: 2 },
    ]);
  }

  // one more sugar inside him
  function ate() {
    eaten = eaten.filter((at) => time - at < 90);
    eaten.push(time);
    memo.given++;
    keep();
    if ((memo.given === 10 || memo.given === 50 || memo.given === 100) && !me.quiet) {
      say(memo.given === 10 ? 'Dix sucres venus de toi. Je commence à te faire confiance. Un peu.' : `${memo.given} sucres venus de toi. C’est la base d’une relation de travail sérieuse.`);
      return;
    }
    if (eaten.length >= 5 && time > rushUntil) {
      eaten = [];
      rushUntil = time + 25;
      say(oneOf(['Cinq sucres. Je vois tout plus clairement. Tout.', 'Mon cerveau tourne à quarante pour cent de plus. Ne me parle pas.', 'Encore un et je résous quelque chose.']));
      setTimeout(() => { if (me.mode === 'perch' && !acting) act(yawnPose(), 2.4); }, 26000);
    } else if (!me.quiet && Math.random() < 0.3) say(oneOf(['Enfin quelqu’un de raisonnable.', 'Merci. Recommence.', 'Je n’ai rien demandé. Mais oui.', 'Un seul ?']));
  }

  // what loose sugars do: fall, bounce, lie there; he catches them or goes for them
  function stepSugars(dt) {
    if (hand) {
      hand.vx += ((hand.x - hand.px) / Math.max(dt, 0.008) - hand.vx) * 0.35;
      hand.vy += ((hand.y - hand.py) / Math.max(dt, 0.008) - hand.vy) * 0.35;
      hand.px = hand.x;
      hand.py = hand.y;
    }
    const r = reach();
    for (const c of loose) {
      c.t += dt;
      if (!c.still) {
        c.vy = Math.min(1400, c.vy + 1500 * dt);
        c.x += c.vx * dt;
        if (c.x < 8 || c.x > screenW - 8) { c.x = clamp(c.x, 8, screenW - 8); c.vx *= -0.5; }
        const g = ground(c.x, c.y);
        c.y += c.vy * dt;
        // in reach on the way: he catches it
        if (canCatch() && c.t > (c.his ? 1.5 : 0.08) && Math.hypot(c.x - r.x, c.y - r.y) < 70) {
          c.gone = true;
          if ((c.x - me.x) * me.side < -10) me.side = -me.side;
          catchSugar();
          continue;
        }
        // on his head, asleep or busy: that wakes him
        if (!c.bonked && !c.his && Math.hypot(c.vx, c.vy) > 500 && me.mode === 'perch' && onHim(c.x, c.y) && c.y < me.y - extent().top * 0.6) {
          c.bonked = true;
          c.vy = -Math.abs(c.vy) * 0.3;
          c.vx = -c.vx * 0.4;
          if (me.asleep) wake();
          me.squash = Math.max(me.squash, 0.1);
          act('dazed', 1.4);
          if (!me.quiet) say(oneOf(['Aïe. C’était volontaire, je le note.', 'Sur la tête. Vraiment.', 'Lancer de sucre : zéro sur dix.']));
        }
        if (c.y >= g.y && c.vy >= 0) {
          c.y = g.y;
          if (c.vy > 260) { c.vy *= -0.32; c.vx *= 0.6; } else { c.still = true; c.vx = c.vy = 0; c.win = g.win?.id ?? null; c.t = 0; }
        }
      } else {
        // its window went away
        if (c.win !== null && !wins.some((w) => w.id === c.win)) { c.still = false; c.win = null; }
        // on his surface: he goes for it, unless he's busy
        if (c.win === me.win && c.t > (c.his ? 12 : 1.2) && me.mode === 'perch' && !acting && !me.asleep && !me.thinking && time >= me.sulkUntil && !(play.on && me.win === play.win)) {
          if (Math.abs(c.x - me.x) < 95) {
            c.gone = true;
            if ((c.x - me.x) * me.side < 0) me.side = -me.side;
            seq([{ pose: 'reach', s: 0.7 }, { pose: 'pinch', s: 0.01, fn: catchSugar }]);
          } else if (!c.sought) {
            c.sought = true;
            const dir = Math.sign(c.x - me.x);
            goTo({ x: clamp(c.x - dir * 70, 40, screenW - 40), win: me.win });
          }
        }
        // nobody wants it
        if (c.t > 40) c.gone = true;
      }
      placeEl(c);
    }
    for (const c of loose) if (c.gone) c.el.remove();
    loose = loose.filter((c) => !c.gone);
  }

  // in the air it's harder to click: you get more room
  const onLoose = (x, y) => loose.find((c) => (c.still ? Math.abs(c.x - x) < 14 && y > c.y - 20 && y < c.y + 6 : Math.hypot(c.x - x, c.y - 6 - y) < 34));

  // he throws you one of his, at your pointer: click it in the air to catch it, and throw it back
  function giveSugar(at) {
    if (me.mode !== 'perch' || me.asleep || acting?.game) return;
    if (sugars < 1) {
      if (!me.quiet) say('Je n’en ai plus. C’est toi qui les as tous pris.');
      return;
    }
    const target = at && at.x >= 0 ? at : { x: me.x + me.side * 320, y: me.y - 260 };
    if ((target.x - me.x) * me.side < -40) me.side = -me.side;
    sugars--;
    acting = null;
    seq([
      { pose: 'reach', s: 0.45 },
      { pose: 'pinch', s: 0.35, fn: () => {
        const r = reach();
        const T = clamp(Math.hypot(target.x - r.x, target.y - r.y) / 800, 0.5, 1.1);
        const c = { el: sugarEl(), x: r.x, y: r.y - 10, vx: (target.x - r.x) / T, vy: (target.y - r.y) / T - 0.5 * 1500 * T, still: false, win: null, t: 0, his: true };
        placeEl(c);
        loose.push(c);
      } },
      { pose: starePose(), s: 1.2 },
    ]);
    if (!me.quiet) say(oneOf(['Tiens. Un seul.', 'Attrape. Clique dessus en l’air. C’est un test.', 'Un sucre. Considère ça comme un investissement.']));
  }

  // from your menu or Ctrl+Alt+U: a sugar from your pointer, aimed at his hands
  function throwSugar(at) {
    if (me.mode === 'stowed' || me.mode === 'leaving') return;
    lastSeen = time;
    if (me.asleep) wake();
    // he turns towards it first: his hands are where it's aimed
    if ((at.x - me.x) * me.side < -40 && me.mode === 'perch') me.side = -me.side;
    const r = reach();
    const T = clamp(Math.hypot(r.x - at.x, r.y - at.y) / 700, 0.45, 1);
    const c = { el: sugarEl(), x: at.x, y: at.y, vx: (r.x - at.x) / T, vy: (r.y - at.y) / T - 0.5 * 1500 * T, still: false, win: null, t: 0 };
    placeEl(c);
    loose.push(c);
    if (canCatch()) act('pinch', T + 0.3);
  }

  function sulk(seconds) {
    me.sulkUntil = time + seconds;
    acting = null;
  }

  function wake() {
    me.asleep = false;
    me.dozing = false;
    blink = 0;
  }

  // you moved while he was dozing by himself
  function startled() {
    wake();
    me.squash = Math.max(me.squash, 0.08);
    act(starePose(), 1.3);
    if (!me.quiet && Math.random() < 0.5) say(oneOf(['Je ne dormais pas.', 'Je réfléchissais, les yeux fermés.', 'Tu es parti longtemps. J’ai compté.']));
  }

  // ---------- what he remembers from one day to the next (on this machine, nowhere else)

  const MEMO_KEY = 'l-memo';
  let memo = { record: {}, stolen: 0, given: 0, lastAt: 0, toldTower: 0 };
  try { memo = { ...memo, ...JSON.parse(localStorage.getItem(MEMO_KEY) || '{}') }; } catch { /* a fresh start */ }
  const keep = () => { try { localStorage.setItem(MEMO_KEY, JSON.stringify(memo)); } catch { /* not kept */ } };
  const GAME_AT = { chess: 'Aux échecs', ttt: 'Au morpion', c4: 'Au puissance 4' };

  // "Aux échecs, on en est à 3 à 1 pour moi." from the games he finished, every one of them
  function recordLine(game) {
    const s = memo.record[game];
    if (!s || s.you + s.him + s.draw === 0) return '';
    const hi = Math.max(s.him, s.you);
    const lo = Math.min(s.him, s.you);
    const who = s.him > s.you ? 'pour moi' : s.him < s.you ? 'pour toi. Pour l’instant' : 'partout';
    const draws = s.draw ? `, et ${s.draw} nulle${s.draw > 1 ? 's' : ''}` : '';
    return `${GAME_AT[game]}, on en est à ${hi} à ${lo} ${who}${draws}.`;
  }

  // a duration, said the way he'd say it: he counted, he doesn't round much
  function howLong(ms) {
    const m = Math.max(1, Math.round(ms / 60000));
    if (m < 60) return `${m} minute${m > 1 ? 's' : ''}`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h} heure${h > 1 ? 's' : ''}${m % 60 ? ` ${m % 60}` : ''}`;
    return `${Math.round(h / 24)} jours`;
  }

  // you were away (no pointer over the screen) for a while, and you're back
  function welcome(away) {
    wake();
    me.squash = Math.max(me.squash, 0.06);
    act(starePose(), 1.6);
    if (me.quiet) return;
    const d = howLong(away);
    say(oneOf([
      `Tu es parti ${d}. J’ai compté.`,
      `${d[0].toUpperCase()}${d.slice(1)}. Je ne demande pas où tu étais. Je le déduirai.`,
      `Te revoilà. ${d[0].toUpperCase()}${d.slice(1)} d’absence. Je ne dormais pas.`,
    ]));
  }

  // he keeps the hour he last saw you: started again much later, he says so
  function greetAtStart() {
    const gap = memo.lastAt ? Date.now() - memo.lastAt : 0;
    memo.lastAt = Date.now();
    keep();
    if (gap < 2 * 3600e3 || me.quiet) return;
    setTimeout(() => {
      if (me.mode !== 'perch' || panelOpen) return;
      say(oneOf([`${howLong(gap)[0].toUpperCase()}${howLong(gap).slice(1)} sans nouvelles. Je suis toujours là. Évidemment.`, `Dernière fois : il y a ${howLong(gap)}. J’ai eu le temps de réfléchir. À quoi, ça me regarde.`]));
    }, 5000);
  }
  setInterval(() => { if (me.mode !== 'stowed') { memo.lastAt = Date.now(); keep(); } }, 60000);

  // he asks you for a game, now and then; the buttons are in his bubble
  function invite() {
    if (me.quiet || play.on || me.mode !== 'perch' || panelOpen || me.asleep || bubble.style.display === 'block') return false;
    const game = oneOf(['chess', 'chess', 'ttt', 'c4']);
    const ask = {
      chess: oneOf(['Je m’ennuie. Une partie d’échecs ?', 'Tu as dix minutes ? Je te propose de perdre aux échecs.']),
      ttt: oneOf(['Un morpion. Rapide. Je ne te laisserai pas gagner, mais tu peux faire nulle.']),
      c4: oneOf(['Puissance 4 ? C’est résolu, ce jeu. Je fais semblant que non.']),
    }[game];
    const rec = recordLine(game);
    const no = () => { sulk(6); say(oneOf(['Comme tu veux. Je note que tu as refusé.', 'Dommage. Pour toi.', 'Plus tard, alors. Je ne l’oublierai pas.'])); };
    const go = (g) => () => { window.l.games(g); };
    say(rec ? `${ask} ${rec}` : ask, {
      choices: [
        { label: { chess: 'Échecs', ttt: 'Morpion', c4: 'Puissance 4' }[game], fn: go(game) },
        ...['chess', 'ttt', 'c4'].filter((g) => g !== game).map((g) => ({ label: { chess: 'Échecs', ttt: 'Morpion', c4: 'Puissance 4' }[g], fn: go(g) })),
        { label: 'Non', fn: no },
      ],
    });
    return true;
  }

  // ---------- the games window: he sits on it, watches the board, and takes it badly when he loses

  const gameWin = () => (play.win === null ? null : wins.find((w) => w.id === play.win));

  // walk to the top of the games window, if he can sit there
  function toGame() {
    const w = gameWin();
    if (!w || me.mode === 'stowed' || me.mode === 'leaving' || me.mode === 'drag' || me.mode === 'fall') return;
    play.want = false;
    if (me.win === w.id || time - play.tried < 4) return;
    play.tried = time;
    if (!perchable(w) || !clearAt(w, w.x + w.w * 0.8)) return;
    goTo({ x: w.x + w.w * (w.x + w.w * 0.8 < screenW - 80 ? 0.8 : 0.25), win: w.id, quick: true });
  }

  // what he says; at most one remark every few seconds unless it matters
  function remarkOn(lines, { must = false, chance = 1 } = {}) {
    if (me.quiet || (!must && (time - lastSpoke < 9 || Math.random() > chance))) return;
    lastSpoke = time;
    say(oneOf(lines));
  }


  // he goes into the window: a few steps there if he can, then he fades; the L you play against is him
  function enter() {
    if (me.mode === 'inside' || me.mode === 'stowed' || me.mode === 'leaving') return;
    closePanel();
    bubble.style.display = 'none';
    refreshTalk();
    acting = null;
    me.walk = null;
    me.prop = null;
    me.mode = 'inside';
  }

  function comeOut(w) {
    if (me.mode !== 'inside') return;
    me.mode = 'perch';
    me.alpha = 0;
    me.rest = 'crouch';
    me.win = null;
    me.x = clamp(w ? w.x + w.w / 2 : me.x, 60, screenW - 60);
    me.y = screenH;
    nextMove = rnd(60, 160);
  }

  function onGame(ev) {
    lastSeen = time;
    if (ev.kind === 'closed') {
      const w = gameWin();
      const was = play.live;
      const rec = recordLine(play.game);
      play.win = null;
      play.on = false;
      play.live = false;
      play.game = null;
      comeOut(w);
      if (was) remarkOn(['Tu fermes le plateau. J’appelle ça un abandon.', 'Abandon. Je ne le compte pas. Mais je m’en souviens.'], { must: true });
      else if (rec) remarkOn([`${rec} Revanche quand tu veux.`, `${rec} Je le garde en mémoire.`], { must: true });
      else remarkOn(['Revanche quand tu veux.', 'C’était instructif. Pour toi.'], { chance: 0.6 });
      return;
    }
    if (ev.kind === 'end' && GAME_AT[ev.game] && ['you', 'him', 'draw'].includes(ev.result)) {
      const s = memo.record[ev.game] || { you: 0, him: 0, draw: 0 };
      s[ev.result]++;
      memo.record[ev.game] = s;
      keep();
    }
    if (ev.win) play.win = ev.win;
    play.game = ev.game;
    if (me.asleep) wake();
    if (ev.kind === 'start' || ev.kind === 'you' || ev.kind === 'played' || ev.kind === 'think') play.live = true;
    if (ev.kind === 'end') play.live = false;
    if (!play.on) {
      play.on = true;
      play.since = time;
      play.want = true;
      toGame();
    }
  }

  // what you ask from his menu or with a shortcut
  function onDo({ what, at }) {
    lastSeen = time;
    if (me.mode === 'stowed' || me.mode === 'leaving') return;
    if (me.asleep && what !== 'sugar') wake();
    if (what === 'sugar') return throwSugar(at);
    if (what === 'give') return giveSugar(at);
    if (what === 'invite') { if (!invite() && !me.quiet) say(play.on ? 'On joue déjà.' : 'Pas maintenant.'); return; }
    if (what === 'sleep') { acting = null; me.asleep = true; me.dozing = true; return; }
    if (me.mode === 'drag' || me.mode === 'fall') return;
    if (what === 'come') {
      const x = clamp(at.x, 60, screenW - 60);
      const g = ground(x, at.y - 1);
      lastHeard = time;
      if (Math.abs(x - me.x) < 30 && (g.win?.id ?? null) === me.win) return act(starePose(), 1.2);
      goTo({ x, win: g.win?.id ?? null });
      return;
    }
    if (me.mode !== 'perch') return;
    if (what === 'tea') tea();
    else if (what === 'computer') computer();
    else if (what === 'tower') { addSugar(); setTimeout(addSugar, 1500); setTimeout(addSugar, 3000); }
    else if (what === 'crouch') { acting = null; me.rest = 'crouch'; }
    else if (what === 'stand') { acting = null; if (canStand()) me.rest = 'stand'; else say('Il n’y a pas la place au-dessus de ma tête.'); }
    else if (what === 'sit') { acting = null; if (canSit()) me.rest = 'sit'; else say('Il n’y a pas de bord ici. Mets-moi sur une fenêtre.'); }
    else if (what === 'walk') goTo(chooseSpot());
  }

  // ---------- put away: he fades, and a sugar cube with his L on it waits in the corner

  let back = null; // where he was

  function stow() {
    if (me.mode === 'stowed' || me.mode === 'leaving') return;
    if (me.mode === 'inside') me.mode = 'perch';
    for (const c of loose) c.el.remove();
    loose = [];
    if (hand) { hand.el.remove(); hand = null; document.body.style.cursor = ''; }
    closePanel();
    bubble.style.display = 'none';
    refreshTalk();
    acting = null;
    flying = [];
    me.prop = null;
    back = me.win === null ? { x: me.x, win: null } : { x: me.x, win: me.win, off: me.off };
    me.walk = null;
    me.drag = false;
    press = null;
    me.mode = 'leaving';
  }

  function unstow() {
    if (me.mode !== 'stowed' && me.mode !== 'leaving') return;
    const w = back && back.win !== null && wins.find((v) => v.id === back.win);
    me.alpha = 0;
    me.mode = 'perch';
    if (w && perchable(w) && clearAt(w, clamp(w.x + back.off, 0, screenW))) {
      me.win = w.id;
      me.off = back.off;
      me.x = clamp(w.x + back.off, 30, screenW - 30);
      me.y = w.y;
    } else {
      me.win = null;
      me.x = clamp(back?.x ?? screenW * 0.72, 30, screenW - 30);
      me.y = screenH;
    }
    nextMove = rnd(70, 220);
    me.rest = 'crouch';
    refreshTalk();
  }

  const BODY = {
    quiet() { me.quiet = true; return 'Bien. Je me tais.'; },
    sleep() { me.asleep = true; acting = null; return 'Je ferme les yeux. Ça ne veut pas dire que je dors.'; },
    wake() { wake(); me.quiet = false; return 'Je ne dormais pas.'; },
    sugar() { eat(); return ''; },
    tidyUp() {
      sugars = 0;
      act('reach', 0.8);
      return 'Rangé. Je me souviendrai que tu as détruit cette tour.';
    },
    async aside() {
      const ok = await window.l.body('aside');
      return ok ? 'Je vais sur l’autre écran.' : 'Il n’y a pas d’autre écran. Je reste.';
    },
    async comeBack() {
      await window.l.body('comeBack');
      return 'Me voilà.';
    },
    async hide() {
      setTimeout(() => {
        closePanel();
        window.l.body('stow');
      }, 1600);
      return 'Je laisse un sucre dans le coin. Clique dessus si tu as besoin de moi.';
    },
  };

  // what you can ask of his body directly: he does it, he doesn't have to understand it
  const plain = (text) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z' -]/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  const ORDERS = [
    [/^(assieds|assois)[ -]?toi|^assis$|^va t'?asseoir/, () => {
      if (!canSit()) return 'Il n’y a pas de bord ici. Mets-moi sur une fenêtre.';
      me.rest = 'sit';
      return 'Assis. Je perds déjà quelque chose.';
    }],
    [/^(leve|releve)[ -]?toi|^debout$|^mets toi debout/, () => {
      if (!canStand()) return 'Il n’y a pas la place au-dessus de ma tête.';
      me.rest = 'stand';
      return 'Si tu insistes.';
    }],
    [/^accroupi|^mets toi accroupi/, () => {
      me.rest = 'crouch';
      return 'Enfin une demande raisonnable.';
    }],
    [/^(viens|approche|viens ici|viens la)( toi)?$/, () => {
      if (mouse.x < 0) return 'Où ça ?';
      goTo({ x: clamp(mouse.x, 60, screenW - 60), win: me.win });
      return '';
    }],
    [/^(marche|bouge|va te promener|va faire un tour|promene toi|deplace toi)$/, () => {
      goTo(chooseSpot());
      return '';
    }],
    [/^(fais|prends|bois|prepare)( toi)?( un| une| du| ton)? ?(the|cafe|tasse)|^(the|cafe)$/, () => {
      tea();
      return 'Sans sucre, ce serait de l’eau chaude avec des ambitions.';
    }],
    [/ordi|ordinateur|laptop|travaille$/, () => {
      computer();
      return 'Ne regarde pas mon écran.';
    }],
    [/^(fais|construis|monte|continue)( moi)?( une| la| ta)? ?tour|^empile/, () => {
      addSugar();
      setTimeout(addSugar, 1500);
      setTimeout(addSugar, 3000);
      return 'Observe.';
    }],
    [/^(baille|tu es fatigue)/, () => {
      act(yawnPose(), 2.2);
      return '';
    }],
    [/^(on )?(joue|jouer)( aux?)?( echecs| morpion| puissance ?4)?$|^(une partie|partie d'?)?(echecs|morpion|puissance ?4)$|^(tu )?(veux|sais) jouer/, (text) => {
      const game = /morpion/.test(text) ? 'ttt' : /puissance/.test(text) ? 'c4' : 'chess';
      window.l.games(game);
      return { chess: 'Les blancs, si tu veux. Ça ne changera rien.', ttt: 'Le morpion. Tu sais que ça finit en nulle si on joue bien ? Joue bien.', c4: 'Puissance 4. Tu es en rouge, ça te va.' }[game];
    }],
    [/^(tiens|attrape)( un)?( sucre)?$|^(un )?sucre$/, () => {
      throwSugar(mouse.x >= 0 ? mouse : { x: me.x + me.side * 300, y: me.y - 300 });
      return '';
    }],
    [/^(donne|lance|envoie|passe)[ -]?(moi)? ?(un|ton|ta|le)? ?sucre/, () => {
      giveSugar(mouse.x >= 0 ? mouse : null);
      return '';
    }],
    [/^(dors|va dormir|fais (dodo|une sieste)|endors toi)$/, () => {
      acting = null;
      me.asleep = true;
      me.dozing = true;
      setTimeout(closePanel, 900);
      return 'Je ferme les yeux. Ça ne veut pas dire que je dors.';
    }],
    [/^(reveille toi|debout la dedans|wake up)$/, () => {
      wake();
      act(starePose(), 1.5);
      return 'Je ne dormais pas.';
    }],
    [/^(regarde moi|fixe moi|regarde)$/, () => {
      act(starePose(), 4);
      return '';
    }],
    [/^(mange|mange un sucre|mange quelque chose)$/, () => {
      eat();
      return '';
    }],
    [/^(reflechis|pense|concentre toi)$/, () => {
      act('think', 5);
      return 'Silence.';
    }],
    [/ongles/, () => {
      act('nails', 4);
      return '';
    }],
    [/^(detruis|casse|fais tomber|demolis)( ta| la)? tour/, () => {
      collapse(false);
      return '';
    }],
    [/^(propose|proposes)( moi)?( une)? partie|^on fait une partie$/, () => {
      if (!invite()) return play.on ? 'On joue déjà.' : 'Pas maintenant.';
      return '';
    }],
    [/^(quel est le |c'?est quoi le |on en est ou |)score|^on en est ou$/, () => {
      const lines = ['chess', 'ttt', 'c4'].map(recordLine).filter(Boolean);
      return lines.length ? lines.join(' ') : 'Aucune partie terminée. Le score est vierge. Ça ne durera pas.';
    }],
    [/^(qu'?est ce que tu sais faire|tu sais faire quoi|aide|help|tes commandes)$/, () => 'Dis-moi : assieds-toi, lève-toi, viens, dors, réveille-toi, regarde-moi, mange, réfléchis, fais une tour, détruis ta tour, fais un thé, ordi, donne-moi un sucre, on joue aux échecs, propose-moi une partie, score, range-toi. Pour le reste, parle-moi normalement.'],
    [/^gratte/, () => {
      if (!canStand()) return 'Pas la place.';
      act('rub', 3);
      return '';
    }],
  ];

  async function hear(text) {
    if (!text.trim()) return {};
    lastHeard = time;
    lastSeen = time;
    const order = ORDERS.find(([re]) => re.test(plain(text)));
    if (order && me.mode !== 'stowed') {
      const said = order[1](plain(text));
      if (said) say(said);
      return { did: true };
    }
    me.thinking = true;
    bubble.style.display = 'none';
    const thinkingTimer = setTimeout(() => say('…', { thinking: true }), 600);
    let r;
    try {
      r = await window.l.hear(text);
    } catch (e) {
      r = { say: `Quelque chose a cassé en moi : ${e.message}`, failed: true };
    }
    clearTimeout(thinkingTimer);
    me.thinking = false;
    me.asking = false;
    let line = r.say || '';
    for (const b of r.body || []) {
      if (BODY[b]) {
        const said = await BODY[b]();
        if (said) line = line ? `${line} ${said}` : said;
      }
    }
    if (r.mood === 'sulk') sulk(rnd(25, 60));
    let note = '';
    if (r.failed) note = 'Claude n’a pas pu répondre';
    else if (r.source === 'claude') note = r.learned ? 'demandé à Claude · retenu' : 'demandé à Claude';
    if (line) say(line, { note, stay: r.confirm });
    else if (r.did) act('thumb', 1.2);
    if (r.confirm) input.focus();
    return r;
  }

  input.addEventListener('keydown', (e) => {
    lastTyped = time;
    if (e.key === 'Escape') {
      closePanel();
      hush();
    }
    if (e.key === 'Enter') {
      const text = input.value;
      input.value = '';
      hear(text);
    }
    e.stopPropagation();
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (panelOpen && !input.value && document.activeElement !== input && !me.thinking) closePanel();
    }, 15000);
  });

  // ---------- the mouse: it only reaches him on himself and on what he shows

  let hovering = false;
  let press = null;

  // the room his present picture takes around the point between his feet
  function extent() {
    if (live.sprite === 'stride' || live.sprite === 'stand') return { top: 350, below: 4, front: 115, back: 105 };
    if (live.sprite === 'sit') return { top: 215, below: LEGS - 12, front: 100, back: 65 };
    return { top: HEAD, below: 4, front: 78, back: 72 };
  }

  const onHim = (x, y) => {
    if (me.mode === 'leaving' || me.mode === 'inside') return false;
    if (me.mode === 'stowed') return Math.abs(x - me.x) < CUBE * 0.75 && y > me.y - CUBE * 1.4 && y < me.y + 4;
    const { top, below, front, back: behind } = extent();
    const left = me.side > 0 ? behind : front;
    const right = me.side > 0 ? front : behind;
    return x > me.x - left && x < me.x + right && y > me.y - top && y < me.y + below;
  };

  // the tower of sugar at his feet, which a click knocks down
  function onTower(x, y) {
    if (me.mode !== 'perch' || sugars < 1 || me.prop === 'laptop') return false;
    const lx = ((x - me.x) / SCALE) * me.side;
    const ly = (y - me.y) / SCALE;
    return lx > 46 && lx < 82 && ly < 8 && ly > -(sugars * 9.6 + 16);
  }

  function onTalk(x, y) {
    if (talk.style.display !== 'flex') return false;
    const r = talk.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  addEventListener('mousemove', (e) => {
    mouse = { x: e.clientX, y: e.clientY };
    lastMoved = time;
    lastSeen = time;
    const away = Date.now() - seenWall;
    seenWall = Date.now();
    if (away > 10 * 60e3 && me.mode === 'perch' && !hand && !press) welcome(away);
    else if (me.dozing && Math.hypot(mouse.x - me.x, mouse.y - me.y + 120) < 420) startled();
    // your pointer flies past his face: he flinches, and takes it personally
    const wallNow = performance.now();
    if (lastPoint.x >= 0 && wallNow > lastPoint.at) {
      const speed = Math.hypot(mouse.x - lastPoint.x, mouse.y - lastPoint.y) / ((wallNow - lastPoint.at) / 1000);
      const face = { x: me.x + me.side * 8, y: me.y - extent().top * 0.72 };
      if (speed > 3500 && Math.hypot(mouse.x - face.x, mouse.y - face.y) < 110 && me.mode === 'perch' && !me.asleep && !acting && !hand && !press && time - flinchAt > 6) {
        flinchAt = time;
        blink = BLINK;
        me.squash = Math.max(me.squash, 0.07);
        me.wobV -= me.side * 2.2;
        act(starePose(), 1.1);
        if (!me.quiet && Math.random() < 0.45) say(oneOf(['Doucement avec ça.', 'Tu as failli me toucher l’œil.', 'Ta souris va trop vite pour ce qu’elle a à faire.']));
      }
    }
    lastPoint = { x: mouse.x, y: mouse.y, at: wallNow };
    // going back and forth over him is not something he lets go
    if (me.mode === 'perch' && onHim(mouse.x, mouse.y)) {
      const dir = Math.sign(mouse.x - lastMouseX);
      if (dir && dir !== lastStrokeDir) {
        lastStrokeDir = dir;
        strokes = strokes.filter((at) => time - at < 2.4);
        strokes.push(time);
        if (strokes.length >= 8) {
          strokes = [];
          sulk(9);
          if (!me.quiet) say(oneOf(['Ne fais pas ça.', 'Je ne suis pas un chat.', 'Tu cherches quelque chose ? Pas sur moi.']));
        }
      }
    }
    lastMouseX = mouse.x;
    if (hand) {
      hand.x = e.clientX;
      hand.y = e.clientY;
      placeEl(hand);
      return;
    }
    if (press && me.mode !== 'stowed') {
      if (Math.hypot(e.clientX - press.sx, e.clientY - press.sy) > 6) press.moved = true;
      if (press.moved) {
        me.mode = 'drag';
        me.walk = null;
        me.win = null;
        me.drag = true;
        // shaken back and forth: he'll feel it when he lands
        const dir = Math.sign(e.movementX || 0);
        if (dir && Math.abs(e.movementX) > 6 && dir !== press.dir) {
          press.dir = dir;
          shakes = shakes.filter((at) => time - at < 1.5);
          shakes.push(time);
          if (shakes.length >= 7) dizzy = true;
        }
        me.x = e.clientX;
        me.y = e.clientY + 200 * SCALE; // held by the collar, like he'd hold you
        me.y = Math.min(me.y, screenH);
      }
      return;
    }
    const tower = onTower(e.clientX, e.clientY) || onLoose(e.clientX, e.clientY);
    const over = onHim(e.clientX, e.clientY) || onTalk(e.clientX, e.clientY) || Boolean(tower);
    document.body.style.cursor = tower && !onHim(e.clientX, e.clientY) ? 'grab' : '';
    if (over !== hovering) {
      hovering = over;
      window.l.interactive(over || panelOpen);
    }
  });

  addEventListener('mousedown', (e) => {
    if (e.button === 0 && !onHim(e.clientX, e.clientY)) {
      const c = onLoose(e.clientX, e.clientY);
      if (c) {
        c.gone = true;
        c.el.remove();
        loose = loose.filter((v) => v !== c);
        grab(e.clientX, e.clientY);
        // caught in the air, one he threw you
        if (c.his && !c.still && !me.quiet) say(oneOf(['Attrapé. Réflexes acceptables.', 'Bien. Maintenant, rends-le-moi.', 'Pas mal. Pour un humain.']));
        return;
      }
      if (onTower(e.clientX, e.clientY)) {
        lastSeen = time;
        takeFromTower(e.clientX, e.clientY);
        return;
      }
    }
    if (onHim(e.clientX, e.clientY)) {
      clicks = clicks.filter((at) => time - at < 3);
      clicks.push(time);
      if (clicks.length >= 5 && me.mode === 'perch') {
        clicks = [];
        sulk(14);
        if (!me.quiet) say(oneOf(['Encore une fois et je note ton nom.', 'Tu testes si je réagis. Je réagis. Arrête.', 'Cinq clics en trois secondes. C’est dans le dossier.']));
      }
    }
    if (onHim(e.clientX, e.clientY)) press = { sx: e.clientX, sy: e.clientY, moved: false };
    else if (bubble.contains(e.target) && !panelOpen) setTimeout(() => { if (!getSelection().toString()) hush(); }, 0);
  });

  addEventListener('contextmenu', (e) => {
    if (onHim(e.clientX, e.clientY)) window.l.menu();
  });

  addEventListener('mouseup', () => {
    if (hand) {
      release();
      return;
    }
    if (!press) return;
    const { moved } = press;
    press = null;
    if (me.mode === 'stowed') {
      window.l.body('unstow');
      return;
    }
    if (moved) {
      me.drag = false;
      me.mode = 'fall';
      // he goes where your hand was sending him
      me.vx = clamp(dragV.x, -1500, 1500);
      me.vy = clamp(dragV.y, -1300, 900);
      if (!me.quiet && Math.random() < 0.4) say(oneOf(['Je ne suis pas un objet. Moi, je les tiens mieux que ça.', 'Tu aurais pu demander.', 'Ici, ça ira. Je n’avais pas le choix.']));
    } else if (me.asleep) startled(); // a poke wakes him; it doesn't open anything
    else if (panelOpen) closePanel();
    else openPanel();
  });

  // ---------- life

  let time = 0;
  let last = performance.now();
  const cost = { ms: 0, frames: 0 };
  let calm = false; // for tests: he does nothing of his own accord

  function chooseAct() {
    if (calm || me.mode !== 'perch' || me.asleep || me.thinking || acting || time < me.sulkUntil) return;
    if (play.on && me.win === play.win) return;
    const r = Math.random();
    // up or sitting, he has no hands: he looks around, or changes his mind
    if (me.rest === 'stand') {
      if (r < 0.22) return act('peer', rnd(3, 7));
      if (r < 0.38) return act('stoop', rnd(2.5, 5));
      if (r < 0.54) return act('rub', rnd(2, 4.5));
      if (r < 0.62) return act('standYawn', 2.2);
      if (r < 0.8) { me.rest = canSit() && Math.random() < 0.6 ? 'sit' : 'crouch'; return; }
    } else if (me.rest === 'sit') {
      if (r < 0.26) return act('sitLook', rnd(3, 7));
      if (r < 0.46) return act('sitNod', rnd(3, 6));
      if (r < 0.54) return act('sitYawn', 2.2);
      if (r < 0.74) { me.rest = canStand() && Math.random() < 0.5 ? 'stand' : 'crouch'; return; }
    } else if (r < 0.14) {
      me.rest = chooseRest();
      return;
    }
    if (r < 0.22) act('thumb', rnd(3, 8));
    else if (r < 0.32) act('nails', rnd(2.5, 5));
    else if (r < 0.38) act(yawnPose(), 2.2);
    else if (r < 0.58) addSugar();
    else if (r < 0.72) eat();
    else if (r < 0.82) tea();
    else if (r < 0.9) computer();
    else act('think', rnd(3, 6));
  }

  function remark() {
    if (me.mode === 'inside') return;
    if (me.quiet || me.asleep || me.mode !== 'perch' || panelOpen || bubble.style.display === 'block') return;
    say(oneOf(REMARKS));
  }

  const REMARKS = [
    'Je réfléchis mieux accroupi. Assis, j’ai vérifié : je perds quelque chose. Je ne dirai pas quoi.',
    'Il reste du sucre quelque part chez toi ? Question sérieuse.',
    'Si tu as un problème difficile, je suis disponible. Je m’ennuie à un degré préoccupant.',
    'Je n’aime pas perdre. C’est tout. Il n’y a pas de leçon là-dedans.',
    'Cette tour tiendra. Je ne dirai pas jusqu’à quand.',
    'Les chaussures sont surestimées.',
    'Tu peux tout me demander. Je ne garantis que la réponse, pas la politesse.',
    'À sept pour cent, tu es sur le point de me demander quelque chose. Ne cherche pas la logique.',
    'Dis « chifoumi » si tu veux perdre.',
  ];

  function step(dt) {
    time += dt;

    if (me.mode === 'fall') {
      me.vy = Math.min(1000, me.vy + 1500 * dt);
      me.x += me.vx * dt;
      // the sides of the screen send him back, with less conviction
      if (me.x < 40 || me.x > screenW - 40) {
        me.x = clamp(me.x, 40, screenW - 40);
        me.vx *= -0.5;
        me.squash = Math.max(me.squash, 0.08);
      }
      const g = ground(me.x, me.y);
      me.y += me.vy * dt;
      if (me.y >= g.y && me.vy >= 0) settle(g);
    } else if (me.mode === 'walk' && me.walk) {
      const w = me.walk;
      const dir = Math.sign(w.x - me.x);
      if (dir) me.side = dir;
      const moved = Math.min(Math.abs(w.x - me.x), STEP * SCALE * dt * (time < rushUntil ? 2.3 : 1));
      me.x += dir * moved;
      // his steps come from how far he's gone: a foot on the ground stays where it is
      me.phase += moved / (STEP_LENGTH * SCALE);
      if (w.x !== undefined && me.win !== null) {
        const s = surface(me.win);
        if (s) me.off = me.x - s.x;
      }
      if (w.fade) {
        const left = Math.abs(w.x - me.x);
        me.alpha = Math.min(me.alpha, clamp(left / 26, 0, 1));
      }
      if (Math.abs(w.x - me.x) < 0.5) {
        if (w.off) {
          // off the edge
          me.afterFall = w.then.x;
          me.walk = null;
          me.win = null;
          me.mode = 'fall';
          me.vy = 0;
          me.vx = me.side * 60;
        } else if (w.then) arrive(w.then);
        else {
          me.walk = null;
          me.mode = 'perch';
          me.rest = me.win !== null && me.win === play.win && canSit() ? 'sit' : chooseRest();
          nextMove = rnd(70, 220);
        }
      }
    }
    if (me.mode === 'leaving') {
      me.alpha = Math.max(0, me.alpha - dt * 3);
      if (me.alpha === 0) {
        me.mode = 'stowed';
        me.win = null;
        me.x = 52;
        me.y = screenH - 8;
        me.asleep = false;
        refreshTalk();
      }
    } else if (!me.walk?.fade && me.mode !== 'inside') me.alpha = Math.min(1, me.alpha + dt * 2.2);

    // his tower stays on the screen
    if (me.mode === 'perch') {
      if (me.x > screenW - 120) me.side = -1;
      else if (me.x < 120) me.side = 1;
    }

    // he gets bored of what's on the floor
    if (me.prop && (time > me.propUntil || me.mode !== 'perch' || me.rest !== 'crouch')) me.prop = null;
    // nobody around: he dozes off, wherever he is
    if (!me.asleep && me.mode === 'perch' && !panelOpen && !me.thinking && !acting && !play.on && time - lastSeen > 300) {
      me.asleep = true;
      me.dozing = true;
    }

    nextAct -= dt;
    if (nextAct <= 0) {
      chooseAct();
      nextAct = rnd(5, 13);
    }
    nextMove -= dt;
    if (nextMove <= 0) {
      if (me.mode === 'perch' && !me.asleep && !me.thinking && !panelOpen && time - lastHeard > 40 && !(play.on && me.win === play.win)) goTo(chooseSpot());
      nextMove = rnd(70, 220);
    }
    nextRemark -= dt;
    if (nextRemark <= 0) {
      remark();
      nextRemark = rnd(900, 2400);
    }
    // you're here and doing nothing with him: a game?
    nextInvite -= dt;
    if (nextInvite <= 0) {
      const here = time - lastMoved < 20 && time - lastHeard > 120;
      nextInvite = here && invite() ? rnd(1800, 3600) : rnd(240, 600);
    }

    // your pointer hovers over his tower: he watches it. The first time, he tells you what to do.
    if (!hand && !press && me.mode === 'perch' && !me.asleep && onTower(mouse.x, mouse.y) && time - lastMoved < 4) {
      towerEye += dt;
      if (towerEye > 0.8 && !towerSaid) {
        towerSaid = true;
        if (!acting) act(starePose(), 1.4);
        if (!me.quiet && !memo.toldTower) {
          memo.toldTower = 1;
          keep();
          say('Tu peux en prendre un. Clique dessus, garde le bouton, et lance-le vers moi. Je l’attrape.', { stay: false });
        } else if (!me.quiet && Math.random() < 0.3) say(oneOf(['Je te vois.', 'Doucement. Celui du bas, et tout tombe.', 'Tu hésites. C’est déjà une forme d’aveu.']));
      }
    } else if (!onTower(mouse.x, mouse.y)) {
      towerEye = 0;
      towerSaid = false;
    }

    if (acting && time >= acting.until) {
      const { then } = acting;
      acting = null;
      then?.();
    }

    blinkAt -= dt;
    if (blinkAt <= 0) {
      blink = BLINK;
      blinkAt = Math.random() < 0.15 ? 0.3 : rnd(4, 11); // he doesn't blink much, sometimes twice
    }
    blink = Math.max(0, blink - dt);
    me.talking = Math.max(0, me.talking - dt);

    // asking or sulking, he goes back down; he doesn't fall asleep on his feet
    if (me.asking || me.thinking || time < me.sulkUntil || (me.asleep && me.rest === 'stand')) me.rest = 'crouch';
    if (me.rest === 'sit' && !canSit()) me.rest = 'crouch';
    let pose = restPose();
    if (overHim > 0.7) pose = starePose();
    if (me.mode === 'drag' || me.mode === 'fall') pose = 'dangle';
    else if (me.mode === 'walk') pose = 'walk';
    else if (me.asking) pose = 'call';
    else if (me.thinking) pose = 'think';
    else if (me.asleep) pose = me.rest === 'sit' ? 'sitSleep' : 'sleep';
    else if (time < me.sulkUntil) pose = 'sulk';
    else if (acting) pose = acting.pose;

    const k = 1 - Math.exp(-dt * 8);
    blend(live, POSES[pose], k);
    live.phase = me.phase;
    // what's in his hand doesn't melt from one thing into another
    live.item = POSES[pose].item;
    live.walk = POSES[pose].walk;
    if (blink > 0) {
      const closing = Math.sin((1 - blink / BLINK) * Math.PI);
      live.lid = Math.max(live.lid, closing);
      if (closing > 0.92) live.eye = 0;
    }
    if (me.talking > 0) {
      if (SHEETS[POSES[pose].sprite].mouth) live.mouth = Math.max(live.mouth, 0.42 + 0.42 * Math.sin(time * 15) * Math.sin(time * 4.3));
      else live.chew = 0.5;
    }

    stepSugars(dt);
    if (play.on && me.mode === 'perch' && (me.win === play.win || time - play.since > 7)) enter();
    if (me.mode === 'inside') me.alpha = Math.max(0, me.alpha - dt * 2.5);

    // what gets flown about
    for (const f of flying) {
      f.t += dt;
      if (f.t >= f.seconds) f.then?.();
    }
    flying = flying.filter((f) => f.t < f.seconds);
    ripple = Math.max(0, ripple - dt * 2.4);

    // how hard things hit him, going off
    me.squash = Math.max(0, me.squash - dt * me.squash * 7 - dt * 0.01);
    me.wobV += (-me.wob * 55 - me.wobV * 6) * dt;
    me.wob += me.wobV * dt;
    live.squash = me.squash;
    live.tilt = clamp(me.wob, -0.22, 0.22) * 0.8 * me.side + (me.mode === 'fall' ? clamp(me.vx / 2200, -0.32, 0.32) : 0) * me.side;

    // the way he's facing changes through a turn, not at once
    me.face += (me.side - me.face) * (1 - Math.exp(-dt * 11));

    // how fast your hand is taking him
    if (me.mode === 'drag') {
      dragV.x += ((me.x - dragV.px) / Math.max(dt, 0.008) - dragV.x) * 0.3;
      dragV.y += ((me.y - dragV.py) / Math.max(dt, 0.008) - dragV.y) * 0.3;
    } else dragV.x = dragV.y = 0;
    dragV.px = me.x;
    dragV.py = me.y;
    live.trail = clamp((me.mode === 'drag' ? dragV.x : me.vx) * me.side / 900, -1, 1);

    // he looks at your pointer; these eyes don't let go of it easily. When it's still he looks elsewhere.
    nextGlance -= dt;
    if (nextGlance <= 0) {
      const r = Math.random();
      if (r < 0.45) interest = { x: me.x + me.side * rnd(60, 500), y: me.y - rnd(0, 320) };
      else if (r < 0.7) interest = { x: me.x + me.side * rnd(30, 160), y: me.y + 40 };
      else interest = null;
      nextGlance = rnd(1.5, 5);
    }
    const head = me.y - extent().top + 40;
    let aim = interest || { x: me.x + me.side * 300, y: head + 15 };
    if (mouse.x >= 0 && time - lastMoved < 5) aim = mouse;
    if (me.prop === 'laptop' && acting?.pose === 'laptop') aim = { x: me.x + me.side * 130, y: me.y + 30 };
    if (me.prop === 'cup' && acting) aim = { x: me.x + me.side * 110, y: me.y + 60 };
    // a game on: the board, unless you're moving your pointer about
    const board = play.on && gameWin();
    if (board && (time - lastMoved > 1.2 || acting?.game)) aim = { x: board.x + board.w / 2, y: board.y + board.h * 0.5 };
    // you're typing to him: he reads over your shoulder
    if (panelOpen && time - lastTyped < 2.5) {
      const r = entry.getBoundingClientRect();
      aim = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    const dx = (aim.x - me.x) * me.side;
    const dy = aim.y - head;
    const d = Math.hypot(dx, dy) || 1;
    const near = Math.min(1, d / 170);
    live.gx += ((dx / d) - live.gx) * (1 - Math.exp(-dt * 4.5));
    live.gy += ((dy / d) - live.gy) * (1 - Math.exp(-dt * 4.5));
    // the eyes get there first
    live.lookX += ((dx / d) * near - live.lookX) * (1 - Math.exp(-dt * 20));
    live.lookY += ((dy / d) * near - live.lookY) * (1 - Math.exp(-dt * 20));

    // what's behind him for a while gets him to turn round
    if (me.mode === 'perch' && !acting && mouse.x >= 0 && time - lastMoved < 5 && dx < -90 && me.x > 120 && me.x < screenW - 120 && sugars < 2) {
      turnWish += dt;
      if (turnWish > 1.8) {
        me.side = -me.side;
        turnWish = 0;
      }
    } else turnWish = 0;

    overHim = me.mode === 'perch' && onHim(mouse.x, mouse.y) && time - lastMoved < 6 ? overHim + dt : 0;

    for (const c of crumbs) {
      c.vy += 600 * dt;
      c.x += c.vx * dt;
      c.y = Math.min(0, c.y + c.vy * dt);
      if (c.y === 0) c.vx *= 0.8;
      c.life -= dt;
    }
    crumbs = crumbs.filter((c) => c.life > 0);
  }

  function render() {
    canvas.style.transform = `translate(${Math.round(me.x - FEET_X)}px, ${Math.round(me.y - FEET_Y)}px)`;
    canvas.style.opacity = me.alpha.toFixed(3);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.translate(FEET_X, FEET_Y);
    if (me.mode === 'stowed') {
      const s = CUBE;
      cube(ctx, -s / 2, 0, s);
      ctx.fillStyle = '#15131a';
      ctx.font = `${s * 0.8}px 'Old English Text MT', 'Times New Roman', serif`;
      ctx.textAlign = 'center';
      ctx.fillText('L', 0, -s * 0.2);
      if (talk.style.display === 'flex') place();
      return;
    }
    ctx.scale(SCALE, SCALE);
    for (const c of crumbs) cube(ctx, c.x, c.y, 6);
    ctx.save();
    ctx.scale(me.side, 1);
    if (me.mode === 'perch' && me.prop !== 'laptop') tower(ctx, sugars, time);
    if (me.prop === 'cup') {
      cup(ctx, CUP_X, time);
      if (ripple > 0) {
        ctx.strokeStyle = `rgba(250, 240, 225, ${ripple})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.ellipse(CUP_X, -14, 8 * (1.2 - ripple), 2 * (1.2 - ripple), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (me.prop === 'laptop') laptop(ctx, 66, time);
    ctx.restore();
    ctx.save();
    const turned = Math.abs(me.face) < 0.14 ? Math.sign(me.face || me.side) * 0.14 : me.face;
    ctx.scale(turned, 1);
    draw(ctx, live, time);
    ctx.restore();
    ctx.save();
    ctx.scale(me.side, 1);
    for (const f of flying) {
      const u = Math.min(1, f.t / f.seconds);
      const x = f.from[0] + (f.to[0] - f.from[0]) * u;
      const y = f.from[1] + (f.to[1] - f.from[1]) * u - Math.sin(u * Math.PI) * f.peak;
      if (f.kind === 'cube') cube(ctx, x - 3, y + 3, 6);
    }
    ctx.restore();
    if (talk.style.display === 'flex') place();
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const began = performance.now();
    step(dt);
    render();
    cost.ms += performance.now() - began;
    cost.frames++;
    requestAnimationFrame(frame);
  }

  let pinned = false; // a test gave him its own windows: the real ones don't count any more
  window.l.on('windows', (data) => { if (!pinned) onWindows(data); });
  window.l.on('resize', ({ width, height }) => {
    screenW = width;
    screenH = height;
    me.x = clamp(me.x, 30, screenW - 30);
    me.y = Math.min(me.y, screenH);
    if (me.mode === 'perch' && me.win === null) me.y = screenH;
    if (me.mode === 'stowed') me.y = screenH - 8;
  });
  window.l.on('open', openPanel);
  window.l.on('say', ({ text, stay }) => say(text, { stay }));
  window.l.on('asking', () => {
    me.asking = true;
    say('Je ne sais pas. J’appelle quelqu’un.', { thinking: true });
  });
  window.l.on('hidden', () => {});
  window.l.on('stow', (on) => (on ? stow() : unstow()));
  window.l.on('game', onGame);
  window.l.on('do', onDo);
  greetAtStart();

  // for scripts/drive.js
  window.__L = {
    hear,
    say,
    hush,
    closePanel,
    goTo,
    pose: (name, seconds = 5) => act(name, seconds),
    rest: (name) => { me.rest = name; },
    do: { tea, computer, addSugar, eat, startled, throwSugar, collapse, onDo, reach, invite, welcome },
    memo: () => JSON.parse(JSON.stringify(memo)),
    choose: (label) => {
      const b = [...bubble.querySelectorAll('.choices button')].find((v) => v.textContent === label);
      if (!b) return false;
      b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      return true;
    },
    game: onGame,
    tower: (x, y) => onTower(x, y),
    doze: () => { lastSeen = -1000; },
    calm: (on) => { calm = on; },
    cost: () => {
      const r = { ms: +(cost.ms / (cost.frames || 1)).toFixed(2), frames: cost.frames };
      cost.ms = 0;
      cost.frames = 0;
      return r;
    },
    windows: (data) => { pinned = true; onWindows(data); },
    onto: (id, x) => { me.mode = 'walk'; arrive({ x, win: id }); },
    state: () => ({ x: me.x, y: me.y, mode: me.mode, win: me.win, wins: wins.length, screenW, screenH, panel: panelOpen, sugars, side: me.side, alpha: me.alpha, rest: me.rest, sprite: live.sprite, prop: me.prop, flying: flying.length, acting: acting?.pose, asleep: me.asleep, play: { ...play }, loose: loose.map((c) => ({ x: Math.round(c.x), y: Math.round(c.y), still: c.still })), hand: Boolean(hand), rush: time < rushUntil, said: bubble.style.display === 'block' ? bubble.textContent : '' }),
  };

  requestAnimationFrame(frame);
})();
