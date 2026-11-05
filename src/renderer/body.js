'use strict';

// His body: pictures (assets/l/, cut out by scripts/sprites.js), brought to life from here. Facing right,
// origin between his feet, y going up is negative. A pose is a picture and a few numbers: his head can
// lean and drop (the rows of the picture slide, so no seam shows), his eyelids close, his pupils move, he
// breathes. Up on his feet he is a puppet: the legs of the picture are cut at the hip, knee and ankle and
// each foot goes where it has to, so a foot on the ground stays on the ground.
// Everything is flipped by the caller when he faces left.

(() => {
  const K = 0.222;           // world units per pixel of his pictures
  const LASH = '#17161c';
  const PUPIL = '#121118';
  const JEANS = 'rgb(95, 140, 172)';
  const base = new URL('../../assets/l/', document.currentScript?.src || location.href);

  // what's where in each picture: x of his feet, the row of his neck, his eyes [x, y, rx, ry], his pupils
  // [x, y, r] and how far they can go, his mouth [x, y, width], his fingers
  const SHEETS = {
    idle: { feet: 230, neck: 209, eyes: [[292, 137, 22, 21], [342, 143, 16, 20]], irises: [[288, 134, 9, 7], [341, 139, 7.5, 5]], mouth: [309, 196, 13] },
    thumb: { feet: 236, neck: 209, eyes: [[332, 135, 20, 21], [374, 144, 15, 20]], irises: [[330, 132, 9, 7], [374, 141, 7, 5]] },
    eat: { feet: 219, neck: 199, eyes: [[315, 128, 19, 20], [355, 139, 14, 18]], irises: [[313, 124, 8.5, 7], [355, 137, 7, 5]], pinch: [368, 202], lips: [325, 186] },
    berry: { feet: 236, neck: 199, eyes: [[332, 128, 20, 21], [377, 137, 15, 19]], irises: [[331, 125, 9, 7], [377, 138, 7.5, 5]] },
    // up, hands in his pockets: only what's above his hips is the picture as it is
    stride: { feet: 260, neck: 229, eyes: [[596, 147, 19, 18], [635, 158, 14, 16]], irises: [[594, 143, 7, 6], [635, 155, 5.5, 4]], mouth: [601, 207, 12], rig: true },
    // on the edge of a window: `drop` is how much of the picture hangs below it, `shin` where his legs part
    sit: { feet: 81, neck: 174, eyes: [[256, 114, 19, 18], [294, 126, 15, 16]], irises: [[255, 111, 7, 6], [292, 122, 5.5, 4]], mouth: [266, 165, 11], drop: 349, shin: [480, 252] },
  };
  for (const [name, sheet] of Object.entries(SHEETS)) {
    sheet.img = new Image();
    sheet.img.src = new URL(`${name}.png`, base).href;
    sheet.shut = new Image();
    sheet.shut.src = new URL(`${name}-shut.png`, base).href;
    sheet.eye = new Image();
    sheet.eye.src = new URL(`${name}-eye.png`, base).href;
    // his pupils as drawn, alone (scripts/eyes.js)
    sheet.pupil = new Image();
    sheet.pupil.src = new URL(`${name}-pupil.png`, base).href;
  }
  const ready = Promise.all(Object.values(SHEETS).flatMap((s) => [s.img, s.shut, s.eye, s.pupil]).map((i) => i.decode().catch(() => {})));

  const REST = { sprite: 'idle', lean: 0, nod: 0, eye: 1, lid: 0, chew: 0, item: 0, walk: 0, swing: 0, kick: 0, mouth: 0, wide: 0, rub: 0, slump: 0 };
  const pose = (changes) => ({ ...REST, ...changes });

  const POSES = {
    idle: pose({}),
    thumb: pose({ sprite: 'thumb' }),
    think: pose({ sprite: 'thumb', lean: -3, nod: 1 }),
    nails: pose({ sprite: 'thumb', nod: 1.5, chew: 0.7 }),
    eat: pose({ sprite: 'eat', chew: 0.5 }),
    pinch: pose({ sprite: 'eat', nod: 1 }),
    berry: pose({ sprite: 'berry', chew: 0.3 }),
    lolly: pose({ sprite: 'eat', item: 3, chew: 0.2 }),
    reach: pose({ lean: 5, nod: 3 }),
    laptop: pose({ sprite: 'thumb', nod: 3, lean: 2 }),
    // when he asks Claude: the phone, held by its corner
    call: pose({ sprite: 'eat', item: 4, lean: -2 }),
    scratch: pose({ lean: 2, nod: 2 }),
    sulk: pose({ lean: -4, nod: 9, lid: 0.32 }),
    sleep: pose({ lean: 4, nod: 13, eye: 0 }),
    yawn: pose({ nod: -5, lean: -3, lid: 0.55, mouth: 1.7 }),
    dazed: pose({ nod: 7, lean: 5, lid: 0.45 }),
    stare: pose({ wide: 1, lean: 2, nod: -1 }),
    walk: pose({ sprite: 'stride', walk: 1 }),
    // standing there, because he got up and forgot why
    stand: pose({ sprite: 'stride' }),
    peer: pose({ sprite: 'stride', lean: 3, nod: 2, slump: 1 }),
    stoop: pose({ sprite: 'stride', lean: 5, nod: 5, lid: 0.18, slump: 2 }),
    standStare: pose({ sprite: 'stride', wide: 1, slump: -0.6 }),
    standYawn: pose({ sprite: 'stride', nod: -4, lid: 0.55, mouth: 1.7, slump: -2 }),
    // one foot scratching the other leg, as he does
    rub: pose({ sprite: 'stride', rub: 1, nod: 1 }),
    // sitting on the edge of a window, his feet in the air
    sit: pose({ sprite: 'sit', kick: 1 }),
    sitLook: pose({ sprite: 'sit', lean: -3, nod: -1, kick: 0.4 }),
    sitNod: pose({ sprite: 'sit', nod: 5, lid: 0.25, kick: 0.25 }),
    sitStare: pose({ sprite: 'sit', wide: 1, kick: 0.15 }),
    sitYawn: pose({ sprite: 'sit', nod: -4, lid: 0.55, mouth: 1.7, kick: 0.2 }),
    sitSleep: pose({ sprite: 'sit', lean: 3, nod: 8, eye: 0 }),
    // held up between your fingers, like he holds everything
    dangle: pose({ sprite: 'stride', swing: 1 }),
  };

  // ---------- his legs, up

  const GROUND = 1084;      // the row of the picture his soles are on
  const CENTRE = 260;       // the column between his hips
  const STRIDE = 92;       // how far a foot goes each way under him
  const STANCE = 0.62;      // how much of a step a foot is on the ground
  const LEGS = [
    {
      // behind: its picture has a raised heel
      hip: [225, 545], knee: [195, 745], ankle: [72, 985], rest: 0.68, sole: 78, phase: 0.5, stand: [-22, 0], kneeR: 50,
      thigh: [[200, 510], [292, 510], [292, 640], [282, 695], [258, 745], [150, 762], [170, 700], [186, 560]],
      shin: [[150, 745], [256, 738], [262, 788], [197, 886], [142, 955], [120, 1012], [95, 1002], [18, 958], [30, 935], [58, 905], [90, 868]],
      foot: [[0, 948], [34, 945], [124, 998], [120, 1038], [152, 1058], [164, 1092], [55, 1092], [0, 1005]],
    },
    {
      // in front: flat on the floor
      hip: [295, 545], knee: [350, 730], ankle: [405, 1010], rest: 0, sole: 74, phase: 0, stand: [40, 0], kneeR: 46,
      thigh: [[228, 510], [348, 510], [348, 540], [393, 695], [392, 738], [306, 748], [278, 695], [240, 600]],
      shin: [[306, 734], [392, 722], [428, 900], [447, 965], [470, 1012], [378, 1068], [364, 1000], [324, 860]],
      foot: [[355, 1000], [470, 1008], [562, 1005], [570, 1052], [482, 1092], [372, 1092], [370, 1040]],
    },
  ];
  for (const leg of LEGS) {
    leg.upper = Math.hypot(leg.knee[0] - leg.hip[0], leg.knee[1] - leg.hip[1]);
    leg.lower = Math.hypot(leg.ankle[0] - leg.knee[0], leg.ankle[1] - leg.knee[1]);
    leg.thighAt = Math.atan2(leg.knee[1] - leg.hip[1], leg.knee[0] - leg.hip[0]);
    leg.shinAt = Math.atan2(leg.ankle[1] - leg.knee[1], leg.ankle[0] - leg.knee[0]);
  }
  // his top half, down to the middle of his thighs: where the cut is, it's all the same blue
  const TOP = [[0, 0], [702, 0], [702, 502], [352, 502], [346, 548], [302, 592], [240, 592], [198, 548], [172, 502], [0, 502]];
  const PIVOT = [260, 540];

  const ease = (u) => u * u * (3 - 2 * u);
  const mix = (a, b, k) => a + (b - a) * k;

  // where a foot is, seen from under his hips, along a step going 0 to 1
  function stepFoot(phase) {
    const f = phase % 1;
    if (f < STANCE) {
      const u = f / STANCE;
      const roll = u > 0.68 ? (u - 0.68) / 0.32 : 0;
      return { x: STRIDE * (1 - 2 * u), y: Math.sin(roll * 0.65) * 62, pitch: roll * 0.65 };
    }
    const u = (f - STANCE) / (1 - STANCE);
    return { x: STRIDE * (2 * ease(u) - 1), y: Math.sin(u * Math.PI) * 34 + (1 - u) * 37, pitch: mix(0.65, -0.14, ease(u)) };
  }

  // the wanted place of everything below his waist, for this moment
  function legPlan(p, t) {
    if (p.swing > 0.5) {
      // nothing under him: they hang, and trail behind where he's being taken
      const trail = (p.trail || 0) * 44;
      const sway = Math.sin(t * 2.4) * 9;
      return { hipX: 0, drop: 0, tilt: 0, feet: [
        { x: -14 - trail - sway, y: -38, pitch: 0.55 },
        { x: 18 - trail + sway, y: -18, pitch: 0.48 },
      ] };
    }
    if (p.walk > 0.5) {
      const ph = p.phase || 0;
      const a = stepFoot(ph + LEGS[0].phase);
      const b = stepFoot(ph + LEGS[1].phase);
      const beat = Math.abs(Math.cos(ph * Math.PI * 2));
      return {
        hipX: Math.sin(ph * Math.PI * 2) * 3,
        drop: -4 + beat * 15,
        tilt: Math.sin(ph * Math.PI * 2) * 0.016,
        feet: [{ ...a, x: a.x + 14 }, { ...b, x: b.x + 14 }],
      };
    }
    // standing: his weight goes from one leg to the other, slowly
    const weight = Math.sin(t * 0.55);
    const feet = LEGS.map((leg) => ({ x: leg.stand[0], y: leg.stand[1], pitch: 0 }));
    if (p.rub > 0.5) {
      feet[1] = { x: 18 + Math.sin(t * 6.2) * 12, y: 118 + Math.sin(t * 6.2) * 26, pitch: 0.5 };
      return { hipX: -14, drop: 2, tilt: 0.012, feet };
    }
    const slump = p.slump || 0;
    return { hipX: weight * 9 - slump * 3, drop: -9 + Math.abs(weight) * 3 + slump * 2, tilt: weight * 0.008 + slump * 0.008, feet };
  }

  const plan = { hipX: 0, drop: -8, tilt: 0, feet: [{ x: -22, y: 0, pitch: 0 }, { x: 40, y: 0, pitch: 0 }] };
  let planAt = 0;

  function follow(p, t) {
    const want = legPlan(p, t);
    const dt = Math.min(0.1, Math.abs(t - planAt));
    planAt = t;
    // a walking foot is exactly where the step says, or it slides; otherwise he moves there
    const k = p.still ? 1 : p.walk > 0.5 ? 1 - Math.exp(-dt * 26) : 1 - Math.exp(-dt * 9);
    plan.hipX = mix(plan.hipX, want.hipX, k);
    plan.drop = mix(plan.drop, want.drop, k);
    plan.tilt = mix(plan.tilt, want.tilt, k);
    plan.feet.forEach((foot, i) => {
      foot.x = mix(foot.x, want.feet[i].x, k);
      foot.y = mix(foot.y, want.feet[i].y, k);
      foot.pitch = mix(foot.pitch, want.feet[i].pitch, k);
    });
  }

  function piece(ctx, img, poly, at, turn, from) {
    ctx.save();
    ctx.translate(at[0], at[1]);
    ctx.rotate(turn);
    ctx.translate(-from[0], -from[1]);
    ctx.beginPath();
    poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  function legs(ctx, img) {
    LEGS.forEach((leg, i) => {
      const foot = plan.feet[i];
      const hip = [leg.hip[0] + plan.hipX, leg.hip[1] + plan.drop];
      const wanted = [CENTRE + foot.x, GROUND - leg.sole - foot.y];
      const dx = wanted[0] - hip[0];
      const dy = wanted[1] - hip[1];
      const d = Math.min(leg.upper + leg.lower - 2, Math.hypot(dx, dy));
      const at = Math.atan2(dy, dx);
      const ankle = [hip[0] + Math.cos(at) * d, hip[1] + Math.sin(at) * d];
      const bend = Math.acos(Math.max(-1, Math.min(1, (leg.upper ** 2 + d ** 2 - leg.lower ** 2) / (2 * leg.upper * d))));
      const thigh = at - bend; // his knee goes forward
      const knee = [hip[0] + Math.cos(thigh) * leg.upper, hip[1] + Math.sin(thigh) * leg.upper];
      const shin = Math.atan2(ankle[1] - knee[1], ankle[0] - knee[0]);
      piece(ctx, img, leg.foot, ankle, foot.pitch - leg.rest, leg.ankle);
      piece(ctx, img, leg.shin, knee, shin - leg.shinAt, leg.knee);
      piece(ctx, img, leg.thigh, hip, thigh - leg.thighAt, leg.hip);
      // what closes the fold: the same blue, and the line of his leg going round the front of the knee
      // (smaller than the leg and pushed to its front, or it shows behind the knee)
      const r = leg.kneeR * 0.6;
      const front = (thigh + shin) / 2 - Math.PI / 2;
      const kx = knee[0] + Math.cos(front) * (leg.kneeR - r);
      const ky = knee[1] + Math.sin(front) * (leg.kneeR - r);
      ctx.fillStyle = JEANS;
      ctx.beginPath();
      ctx.arc(kx, ky, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = LASH;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(kx, ky, r, thigh - Math.PI / 2 - 0.2, shin - Math.PI / 2 + 0.2);
      ctx.stroke();
    });
  }

  // ---------- his face

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const eyeCanvas = document.createElement('canvas');
  const ectx = eyeCanvas.getContext('2d');

  // his pupils, on the white of the picture's own eyes, so the hair stays in front of them
  function pupils(ctx, sheet, p, at) {
    if (!sheet.eye.complete || !sheet.eye.naturalWidth) return;
    sheet.irises.forEach(([x, y, r, range], i) => {
      const [ex, ey, rx, ry] = sheet.eyes[i];
      const M = 5;
      const left = Math.round(ex - rx - M);
      const high = Math.round(ey - ry - M);
      const wide = Math.round(rx * 2 + M * 2);
      const tall = Math.round(ry * 2 + M * 2);
      if (eyeCanvas.width < wide || eyeCanvas.height < tall) {
        eyeCanvas.width = Math.max(eyeCanvas.width, wide);
        eyeCanvas.height = Math.max(eyeCanvas.height, tall);
      } else ectx.clearRect(0, 0, eyeCanvas.width, eyeCanvas.height);
      ectx.globalCompositeOperation = 'source-over';
      ectx.drawImage(sheet.eye, left, high, wide, tall, 0, 0, wide, tall);
      ectx.globalCompositeOperation = 'source-atop';
      // the pupil drawn in the picture, moved a little on the white: at rest it's the picture as it is.
      // His stare is the point, not where it goes.
      const ox = clamp(p.lookX || 0, -1, 1) * range * 0.27;
      const oy = clamp(p.lookY || 0, -1, 1) * range * 0.2 + (p.wide || 0) * 1;
      const cx = x - left + ox;
      const cy = y - high + oy;
      ectx.drawImage(sheet.pupil, left - ox, high - oy, wide, tall, 0, 0, wide, tall);
      if (p.wide > 0.05) {
        // wide awake: the pupil shrinks, the white shows around it
        ectx.strokeStyle = 'rgb(240, 238, 234)';
        ectx.lineWidth = p.wide * 2.2;
        ectx.beginPath();
        ectx.arc(cx, cy, r - p.wide * 1.1, 0, Math.PI * 2);
        ectx.stroke();
      }
      const [dx, dy] = at(ey);
      ctx.drawImage(eyeCanvas, 0, 0, wide, tall, left + Math.round(dx), high + Math.round(dy), wide, tall);
    });
  }

  // his mouth, when it opens: only pictures where it's shut and free have one
  function mouth(ctx, sheet, p, at) {
    if (!sheet.mouth || p.mouth < 0.04) return;
    const [x, y, w] = sheet.mouth;
    const [dx, dy] = at(y);
    const open = Math.min(1.7, p.mouth);
    ctx.fillStyle = '#4e2a31';
    ctx.strokeStyle = LASH;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(x + dx, y + dy + open * 1.5, w * (0.45 + open * 0.16), 1 + open * 3.4, 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // his eyelids, over the eyes of the picture
  function lids(ctx, sheet, p, at) {
    const closed = p.eye < 0.15 ? 1 : Math.min(1, p.lid);
    for (const [x, y, rx, ry] of sheet.eyes) {
      const [dx, dy] = at(y);
      const cx = x + dx;
      const cy = y + dy;
      if (closed <= 0.02) continue;
      const edge = cy - ry + ry * 2 * closed;
      // the eyelid is the picture itself, without its eye, as far down as he has closed it
      const M = 9;
      const left = Math.round(x - rx - M);
      const high = Math.round(y - ry - M);
      const wide = Math.round(rx * 2 + M * 2);
      const tall = Math.round(ry * 2 * closed + M + (closed === 1 ? M : 0));
      ctx.drawImage(sheet.shut, left, high, wide, tall, left + Math.round(dx), high + Math.round(dy), wide, tall);
      // shut, a line sagging under the eye; half shut, an arc that stops short, or it reads as glasses
      const low = closed === 1 ? cy + ry * 0.2 : edge + ry * 0.12;
      const reach = closed === 1 ? rx - 1 : rx * 0.72;
      ctx.beginPath();
      ctx.moveTo(cx - reach, low);
      ctx.quadraticCurveTo(cx, closed === 1 ? cy + ry * 0.62 : edge - ry * 0.16, cx + reach, low);
      ctx.lineCap = 'round';
      ctx.lineWidth = closed === 1 ? 2.6 : 2.2;
      ctx.strokeStyle = LASH;
      ctx.stroke();
    }
  }

  // what isn't in the picture, between his fingers
  function held(ctx, sheet, item, t) {
    const [x, y] = sheet.pinch || [0, 0];
    ctx.save();
    ctx.translate(x, y);
    if (item === 3) {
      ctx.lineCap = 'round';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#f2efe8';
      ctx.beginPath();
      ctx.moveTo(-2, 10);
      ctx.lineTo(-10, -32);
      ctx.stroke();
      ctx.translate(-12, -54);
      ctx.rotate(t * 0.7);
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.fillStyle = '#e4567f';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#2b2730';
      ctx.stroke();
      ctx.strokeStyle = '#fff1f5';
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (let a = 0; a < 11; a += 0.3) ctx.lineTo(Math.cos(a) * a * 1.9, Math.sin(a) * a * 1.9);
      ctx.stroke();
    } else if (item === 4) {
      ctx.rotate(0.2);
      ctx.beginPath();
      ctx.roundRect(-13, -66, 27, 72, 5);
      ctx.fillStyle = '#23252e';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#0d0d11';
      ctx.stroke();
      ctx.fillStyle = '#5d6a85';
      ctx.fillRect(-8, -58, 17, 30);
    }
    ctx.restore();
  }

  // ---------- the picture

  // one picture, its head rows sliding by (lean, nod), the rest stretched by his breath. Assembled at
  // the picture's own size, on whole rows: scaled afterwards, the joins don't show.
  const flat = document.createElement('canvas');
  const fctx = flat.getContext('2d');
  const whole = document.createElement('canvas');
  const wctx = whole.getContext('2d');

  function picture(ctx, name, p, t, alpha, squeeze = 1) {
    const sheet = SHEETS[name];
    const { img } = sheet;
    if (!img.complete || !img.naturalWidth) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const asleep = p.eye < 0.15;
    const breath = (0.5 + 0.5 * Math.sin(t * (asleep ? 0.9 : 1.5))) * (asleep ? 3.4 : 2.2);
    const chewing = p.chew * Math.sin(t * 13) * 1.1;
    const lean = (p.lean + (p.gx || 0) * 6) / K / 6;
    const nod = (p.nod + (p.gy || 0) * 2.5) / K / 6 + chewing;
    const top = sheet.neck + 40;
    const slide = (y) => {
      const u = Math.max(0, Math.min(1, (top - y) / 75));
      return u * u * (3 - 2 * u);
    };
    const at = (y) => {
      const s = slide(y);
      return [lean * s, nod * s - breath * (1 - y / h)];
    };

    const PAD = 60;
    const fw = w + PAD * 2;
    const fh = h + PAD + (sheet.rig ? 40 : 0);
    if (flat.width < fw || flat.height < fh) {
      flat.width = Math.max(flat.width, fw);
      flat.height = Math.max(flat.height, fh);
    } else fctx.clearRect(0, 0, flat.width, flat.height);
    fctx.save();
    fctx.translate(PAD, PAD);
    // from the feet up, so his head stays in front of his shoulders when it drops
    const rows = top + 2;
    const y0 = Math.round(rows + at(rows)[1]);
    const [shin, part] = sheet.shin || [h, 0];
    fctx.drawImage(img, 0, rows, w, shin - rows, 0, y0, w, shin - y0);
    // his legs swing, each in its own time, from the knee
    for (let y = shin; y < h; y += 2) {
      const u = (y - shin) / (h - shin);
      const push = p.kick * u * u * 15;
      fctx.drawImage(img, 0, y, part, 2, Math.sin(t * 1.5) * push, y, part, 2);
      fctx.drawImage(img, part, y, w - part, 2, part + Math.sin(t * 1.5 + 2.1) * push, y, w - part, 2);
    }
    let below = y0;
    for (let y = rows - 2; y >= 0; y -= 2) {
      const [dx, dy] = at(y);
      const up = Math.round(y + dy);
      if (up >= below) continue; // squeezed out, where his neck folds when his head drops
      fctx.drawImage(img, 0, y, w, 2, dx, up, w, below - up);
      below = up;
    }
    if (p.eye >= 0.15) pupils(fctx, sheet, p, at);
    mouth(fctx, sheet, p, at);
    lids(fctx, sheet, p, at);
    if (p.item >= 3) held(fctx, sheet, Math.round(p.item), t);
    fctx.restore();

    if (sheet.rig) {
      if (whole.width < fw || whole.height < fh) {
        whole.width = Math.max(whole.width, fw);
        whole.height = Math.max(whole.height, fh);
      } else wctx.clearRect(0, 0, whole.width, whole.height);
      wctx.save();
      wctx.translate(PAD, PAD);
      legs(wctx, img);
      wctx.translate(PIVOT[0] + plan.hipX, PIVOT[1] + plan.drop);
      wctx.rotate(plan.tilt);
      wctx.translate(-PIVOT[0], -PIVOT[1]);
      wctx.beginPath();
      TOP.forEach(([x, y], i) => (i ? wctx.lineTo(x, y) : wctx.moveTo(x, y)));
      wctx.closePath();
      wctx.clip();
      wctx.drawImage(flat, -PAD, -PAD);
      wctx.restore();
    }
    const done = sheet.rig ? whole : flat;

    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.imageSmoothingQuality = 'high';
    if (squeeze !== 1) ctx.scale(1 / Math.sqrt(squeeze), squeeze);
    ctx.scale(K, K);
    ctx.drawImage(done, 0, 0, fw, fh, -sheet.feet - PAD, (sheet.drop || 0) - h - PAD, fw, fh);
    ctx.restore();
  }

  // going from one picture to another: he gets up or goes down as the new one comes in over the old
  const FADE = 0.2;
  const RISE = 0.42;
  const fade = { cur: null, prev: null, since: 0, long: FADE };
  const tallOf = (name) => (SHEETS[name].img.naturalHeight - (SHEETS[name].drop || 0)) || 1;

  function draw(ctx, p, t) {
    ctx.save();
    if (p.tilt) ctx.rotate(p.tilt);
    if (p.squash) ctx.scale(1 + p.squash * 0.55, 1 - p.squash);
    if (p.swing > 0.5) {
      // held by the collar: he turns around that point
      ctx.translate(0, -200);
      ctx.rotate(Math.sin(t * 2.4) * 0.04 + (p.trail || 0) * 0.14);
      ctx.translate(0, 200);
    }
    if (SHEETS[p.sprite].rig || SHEETS[fade.cur]?.rig) follow(p, t);
    if (p.still) picture(ctx, p.sprite, p, t, 1);
    else {
      if (fade.cur !== p.sprite) {
        fade.prev = fade.cur;
        fade.cur = p.sprite;
        fade.since = t;
        fade.long = fade.prev && Math.abs(tallOf(fade.prev) / tallOf(fade.cur) - 1) > 0.12 ? RISE : FADE;
      }
      const f = fade.prev ? Math.min(1, (t - fade.since) / fade.long) : 1;
      if (f >= 1) picture(ctx, fade.cur, p, t, 1);
      else {
        // both are squeezed to the height they're passing through, so he rises instead of swapping
        const u = ease(f);
        const a = tallOf(fade.prev);
        const b = tallOf(fade.cur);
        const now = mix(a, b, u);
        picture(ctx, fade.prev, { ...p, item: 0, mouth: 0 }, t, Math.min(1, 2 - 2 * f), now / a);
        picture(ctx, fade.cur, p, t, Math.min(1, 2 * f), now / b);
      }
    }
    ctx.restore();
  }

  // ---------- what's around him

  // sugar: a small cube seen slightly from above
  function cube(ctx, x, y, s = 9) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = '#6b6a75';
    const d = s * 0.34;
    ctx.beginPath();
    ctx.rect(x, y - s, s, s);
    ctx.fillStyle = '#fdfdfb';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + d, y - s - d);
    ctx.lineTo(x + s + d, y - s - d);
    ctx.lineTo(x + s, y - s);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + s, y - s);
    ctx.lineTo(x + s + d, y - s - d);
    ctx.lineTo(x + s + d, y - d);
    ctx.lineTo(x + s, y);
    ctx.closePath();
    ctx.fillStyle = '#d5d6de';
    ctx.fill();
    ctx.stroke();
  }

  // the tower he builds in front of him: the higher, the less steady
  function tower(ctx, count, t, x = 58) {
    for (let i = 0; i < count; i++) {
      const wobble = Math.sin(t * 2 + i * 0.7) * i * i * 0.018;
      const jitter = ((i * 7) % 5 - 2) * 0.5;
      cube(ctx, x + jitter + wobble, -i * 9.6);
    }
  }

  // a cup on the floor, too sweet, a little steam
  function cup(ctx, x, t) {
    ctx.save();
    ctx.translate(x, 0);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = '#2b2730';
    ctx.fillStyle = '#f7f6f1';
    ctx.beginPath();
    ctx.ellipse(0, -0.8, 12, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-8.5, -14);
    ctx.quadraticCurveTo(-8, -2, -4.5, -2);
    ctx.lineTo(4.5, -2);
    ctx.quadraticCurveTo(8, -2, 8.5, -14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(10, -9, 3.2, -1.4, 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -14, 8.5, 2.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#8a5a35';
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 0.8;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(120, 124, 135, .55)';
    for (const dx of [-2.5, 2.5]) {
      ctx.beginPath();
      for (let k = 0; k <= 8; k++) {
        const y = -17 - k * 1.5;
        const wave = Math.sin(t * 2 + k * 0.8 + dx) * 1.3;
        if (k) ctx.lineTo(dx + wave, y);
        else ctx.moveTo(dx + wave, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // his computer on the floor, its screen towards him
  function laptop(ctx, x, t) {
    ctx.save();
    ctx.translate(x, 0);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#17161c';
    ctx.fillStyle = '#c9ccd4';
    ctx.beginPath();
    ctx.moveTo(-23, 0);
    ctx.lineTo(11, 0);
    ctx.lineTo(13, -3);
    ctx.lineTo(-20, -3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#31343e';
    ctx.beginPath();
    ctx.moveTo(10, -3);
    ctx.lineTo(19, -29);
    ctx.lineTo(23, -28);
    ctx.lineTo(13, -3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // what it shows lights the side facing him, unevenly
    const glow = 0.55 + Math.sin(t * 7) * 0.08 + Math.sin(t * 2.3) * 0.1;
    ctx.fillStyle = `rgba(190, 216, 245, ${glow})`;
    ctx.beginPath();
    ctx.moveTo(11, -5);
    ctx.lineTo(19, -28);
    ctx.lineTo(20, -27.6);
    ctx.lineTo(12.2, -5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(190, 216, 245, ${glow * 0.2})`;
    ctx.beginPath();
    ctx.moveTo(10, -3);
    ctx.lineTo(18.5, -28);
    ctx.lineTo(-2, -3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  const blend = (a, b, k) => {
    for (const key of Object.keys(b)) {
      if (typeof b[key] === 'number') a[key] += (b[key] - a[key]) * k;
      else a[key] = b[key];
    }
    return a;
  };

  // from a place in a picture to where it is around his feet
  const spot = (name, x, y) => [(x - SHEETS[name].feet) * K, (y - SHEETS[name].img.naturalHeight + (SHEETS[name].drop || 0)) * K];

  // how far his body goes in one whole step: walking at this rate, a foot on the ground doesn't slide
  const STEP_LENGTH = (STRIDE * 2 * K) / STANCE;

  window.LBody = { POSES, SHEETS, STEP_LENGTH, draw, cube, tower, cup, laptop, blend, spot, ready };
})();
