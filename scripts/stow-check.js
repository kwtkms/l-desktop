'use strict';

// L_UNSEEN=<folder> L_DATA=<temp folder> electron . : puts him away and calls him back through his real window,
// never shown on your screen. Writes the results and pictures to the folder.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function check(overlay, out) {
  fs.mkdirSync(out, { recursive: true });
  const web = overlay.webContents;
  const log = (line) => fs.appendFileSync(path.join(out, 'log.txt'), `${line}\n`);
  const state = () => web.executeJavaScript('window.__L.state()');
  const stowed = () => {
    try {
      return Boolean(JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8')).stowed);
    } catch {
      return false;
    }
  };
  const snap = async (name, rect) => fs.writeFileSync(path.join(out, `${name}.png`), (await web.capturePage(rect)).toPNG());
  const report = async (what) => {
    const s = await state();
    log(`${what}: mode=${s.mode} x=${Math.round(s.x)} y=${Math.round(s.y)} alpha=${s.alpha.toFixed(2)} panel=${s.panel} enregistre=${stowed()}`);
    return s;
  };
  const click = (x, y, button = 'left') => {
    web.sendInputEvent({ type: 'mouseMove', x, y });
    web.sendInputEvent({ type: 'mouseDown', x, y, button, clickCount: 1 });
    web.sendInputEvent({ type: 'mouseUp', x, y, button, clickCount: 1 });
  };
  const near = (s) => ({ x: Math.max(0, Math.round(s.x - 150)), y: Math.max(0, Math.round(s.y - 370)), width: 300, height: 380 });

  await wait(3500);
  await web.executeJavaScript('window.__L.calm(true)');
  let s = await report('depart');
  await snap(s.mode === 'stowed' ? 'relance' : 'avant', near(s));
  if (s.mode === 'stowed') {
    log('relance : reste range, OK');
  } else {
    const before = { x: s.x, y: s.y };
    await web.executeJavaScript('window.l.body("stow")');
    await wait(1500);
    s = await report('range');
    await snap('range', near(s));
    click(Math.round(s.x + 200), Math.round(s.y - 200));
    await wait(300);
    await report('clic a cote du sucre (doit rester range)');
    click(Math.round(s.x), Math.round(s.y - 15));
    await wait(1500);
    s = await report('clic sur le sucre');
    log(`retour au meme endroit : ${Math.abs(s.x - before.x) < 2 && Math.abs(s.y - before.y) < 2} (avant ${Math.round(before.x)},${Math.round(before.y)})`);
    await snap('revenu', near(s));
    await web.executeJavaScript('window.__L.goTo({ x: window.__L.state().x - 120, win: window.__L.state().win })');
    for (const k of [0, 1, 2]) {
      await wait(690);
      s = await report(`marche (${(await state()).sprite})`);
      await snap(`marche-${k}`, near(s));
    }
    await web.executeJavaScript('window.__L.cost()');
    await web.executeJavaScript('window.__L.goTo({ x: window.__L.state().x + 150, win: window.__L.state().win })');
    await wait(1500);
    log(`cout par image en marche : ${JSON.stringify(await web.executeJavaScript('window.__L.cost()'))}`);
    await wait(2500);
    await web.executeJavaScript('window.__L.cost()');
    await wait(1500);
    log(`cout par image a l arret : ${JSON.stringify(await web.executeJavaScript('window.__L.cost()'))}`);
    await web.executeJavaScript('window.__L.rest("stand")');
    await wait(1000);
    s = await report(`debout (${(await state()).sprite})`);
    await snap('debout', near(s));
    await web.executeJavaScript('window.__L.pose("thumb", 2)');
    await wait(800);
    s = await report(`geste, redescend (${(await state()).rest}, ${(await state()).sprite})`);
    await snap('geste', near(s));

    // on a window, with its edge at mid-height: he sits, his legs hang, he can be clicked on them
    const seat = (y) => ({ x: Math.max(0, Math.round(s.x - 150)), y: y - 260, width: 300, height: 400 });
    const W = '{ wins: [{ id: 999, x: 300, y: 600, w: 900, h: 400 }], fg: 999 }';
    await web.executeJavaScript(`window.__L.windows(${W}); window.__L.onto(999, 700)`);
    await wait(7500);
    await web.executeJavaScript(`window.__L.windows(${W}); window.__L.rest("sit")`);
    await wait(1000);
    s = await report(`assis (${(await state()).sprite}, fenetre ${(await state()).win})`);
    await snap('assis', seat(600));
    await wait(700);
    await snap('assis-2', seat(600));
    click(Math.round(s.x + 40), 680);
    await wait(300);
    s = await report('clic sur ses jambes (doit ouvrir)');
    await web.executeJavaScript('window.__L.closePanel()');
    await web.executeJavaScript(`window.__L.windows(${W}); window.__L.pose("sitNod", 2)`);
    await wait(900);
    s = await report(`sitNod (${(await state()).rest}, ${(await state()).sprite})`);

    // held by the collar, then let go
    web.sendInputEvent({ type: 'mouseMove', x: Math.round(s.x), y: 560 });
    web.sendInputEvent({ type: 'mouseDown', x: Math.round(s.x), y: 560, button: 'left', clickCount: 1 });
    web.sendInputEvent({ type: 'mouseMove', x: Math.round(s.x) + 60, y: 300 });
    await wait(600);
    s = await report(`tenu (${(await state()).sprite})`);
    await snap('tenu', near(s));
    web.sendInputEvent({ type: 'mouseUp', x: Math.round(s.x), y: 300, button: 'left', clickCount: 1 });
    await wait(1800);
    s = await report(`lache (${(await state()).rest}, ${(await state()).sprite})`);
    await snap('lache', near(s));
    await web.executeJavaScript('window.__L.closePanel()');

    // what he does with what's around him
    await web.executeJavaScript('window.__L.do.tea()');
    await wait(1300);
    s = await report(`the (${JSON.stringify(await state())})`);
    await snap('the', near(s));
    await wait(5000);
    await web.executeJavaScript('window.__L.do.computer()');
    await wait(1000);
    s = await report(`ordi (${(await state()).prop}, ${(await state()).acting})`);
    await snap('ordi', near(s));
    await web.executeJavaScript('window.__L.pose("think", 0.1)');
    await wait(400);
    await web.executeJavaScript('window.__L.do.addSugar()');
    await wait(400);
    await snap('tour', near(s));
    await wait(900);
    await web.executeJavaScript('window.__L.do.eat()');
    await wait(3400);
    for (const line of ['assieds toi', 'leve toi', 'gratte toi', 'fais une tour', 'accroupis toi', 'baille']) {
      const r = await web.executeJavaScript(`window.__L.hear(${JSON.stringify(line)})`);
      await wait(900);
      s = await state();
      log(`ordre "${line}" -> did=${r.did} repos=${s.rest} geste=${s.acting}`);
    }
    await wait(3500);

    // thrown
    web.sendInputEvent({ type: 'mouseMove', x: Math.round(s.x), y: Math.round(s.y - 60) });
    web.sendInputEvent({ type: 'mouseDown', x: Math.round(s.x), y: Math.round(s.y - 60), button: 'left', clickCount: 1 });
    for (let k = 1; k <= 6; k++) {
      web.sendInputEvent({ type: 'mouseMove', x: Math.round(s.x) + k * 50, y: Math.round(s.y - 60) - k * 40 });
      await wait(30);
    }
    web.sendInputEvent({ type: 'mouseUp', x: Math.round(s.x) + 300, y: Math.round(s.y - 300), button: 'left', clickCount: 1 });
    await wait(180);
    s = await report(`lance en vol (${(await state()).sprite})`);
    await snap('vol', near(s));
    await wait(2600);
    s = await report(`lance retombe (${(await state()).acting})`);
    await web.executeJavaScript('window.__L.closePanel()');

    // left alone, he dozes off; you come back, he wakes up
    await web.executeJavaScript('window.__L.doze()');
    await wait(1500);
    s = await report(`seul (dort=${(await state()).asleep})`);
    web.sendInputEvent({ type: 'mouseMove', x: Math.round(s.x) + 40, y: Math.round(s.y) - 200 });
    await wait(500);
    s = await report(`souris revenue (dort=${(await state()).asleep})`);

    // every pose once, and the window leaving while he sits on it
    const poses = await web.executeJavaScript('Object.keys(window.LBody.POSES)');
    for (const name of poses) {
      await web.executeJavaScript(`window.__L.pose("${name}", 0.2)`);
      await wait(120);
    }
    log(`${poses.length} poses passees`);
    await web.executeJavaScript(`window.__L.windows(${W}); window.__L.onto(999, 700)`);
    await wait(4000);
    await web.executeJavaScript(`window.__L.windows(${W}); window.__L.rest("sit")`);
    await wait(500);
    await web.executeJavaScript('window.__L.windows({ wins: [], fg: null })');
    await wait(1500);
    s = await report(`fenetre fermee sous lui (${(await state()).rest}, fenetre ${(await state()).win})`);

    // the games window: he walks to it and goes in; the L you play against is in there
    const games = global.openGames('chess');
    await wait(1200);
    const g = (code) => games.webContents.executeJavaScript(code);
    const id = (await state()).play.win;
    log(`jeux ouverts : fenetre ${id}, ${JSON.stringify(await g('window.__G.state()'))}`);
    const GW = `{ wins: [{ id: ${id}, x: 400, y: 330, w: 1100, h: 700 }], fg: ${id} }`;
    await web.executeJavaScript(`window.__L.windows(${GW})`);
    await wait(2500);
    s = await report(`vers la fenetre de jeux (fenetre ${(await state()).win})`);
    await wait(6000);
    s = await report(`entre dans la fenetre (fenetre ${(await state()).win})`);
    const sq = (n) => 'abcdefgh'.indexOf(n[0]) + (8 - Number(n[1])) * 8;
    const move = async (a, b) => {
      await g(`window.__G.click(${sq(a)}); window.__G.click(${sq(b)})`);
      await wait(900);
      log(`coup ${a}-${b} : dans la fenetre il fait ${JSON.stringify((await g('window.__G.state()')).him)}`);
      await wait(2600);
      const st = await g('window.__G.state()');
      log(`  partie : ${st.history.join(' ')} | ${st.status} | dans la fenetre il dit : ${await g('document.getElementById("said").textContent')}`);
    };
    await move('e2', 'e4');
    await move('d1', 'h5');
    await move('f1', 'c4');
    await g('window.__G.hint()');
    await wait(1600);
    log(`indice : ${JSON.stringify(await g('window.__G.tip()'))} | il dit : ${await g('document.getElementById("said").textContent')} | fleche : ${await g('document.querySelectorAll("#arrows line").length')}`);
    fs.writeFileSync(path.join(out, 'jeux-echecs.png'), (await games.webContents.capturePage()).toPNG());
    await g('window.__G.show("ttt")');
    await g('window.__G.ttt(4)');
    await wait(1800);
    log(`morpion : ${(await g('window.__G.state()')).ttt}`);
    fs.writeFileSync(path.join(out, 'jeux-morpion.png'), (await games.webContents.capturePage()).toPNG());
    await g('window.__G.show("c4")');
    await g('window.__G.c4(3)');
    await wait(1800);
    log(`puissance 4 : ${(await g('window.__G.state()')).c4}`);
    fs.writeFileSync(path.join(out, 'jeux-p4.png'), (await games.webContents.capturePage()).toPNG());

    games.close();
    await wait(1500);
    s = await report(`jeux fermes, il ressort | ${JSON.stringify((await state()).play)} | il dit : ${(await state()).said}`);
    await snap('ressort', near(s));
    await web.executeJavaScript('window.__L.closePanel(); window.__L.windows({ wins: [], fg: null })');
    await wait(2500);
    await web.executeJavaScript('window.__L.rest("crouch"); window.__L.pose("think", 0.1)');
    await wait(800);

    // sugars: thrown at him from the pointer (he catches it), taken off his tower and thrown away (he goes
    // and picks it up), taken and let go right at his hands (he takes it)
    s = await state();
    await web.executeJavaScript(`window.__L.do.onDo({ what: 'sugar', at: { x: ${Math.round(s.x) + 330}, y: ${Math.round(s.y) - 330} } })`);
    await wait(300);
    s = await report(`sucre lance (en l air ${JSON.stringify((await state()).loose)}, geste ${(await state()).acting})`);
    await snap('sucre', { x: Math.max(0, Math.round(s.x - 150)), y: Math.max(0, Math.round(s.y - 400)), width: 450, height: 410 });
    await wait(1500);
    s = await report(`sucre attrape ? reste ${(await state()).loose.length} dehors, geste ${(await state()).acting}`);
    await wait(2500);
    await web.executeJavaScript('window.__L.do.addSugar()');
    await wait(1500);
    s = await state();
    const tx = Math.round(s.x + s.side * 64 * 1.45);
    const ty = Math.round(s.y - 6);
    log(`tour : ${s.sugars} sucres, la souris dessus la touche : ${await web.executeJavaScript(`window.__L.tower(${tx}, ${ty})`)}`);
    web.sendInputEvent({ type: 'mouseMove', x: tx, y: ty });
    web.sendInputEvent({ type: 'mouseDown', x: tx, y: ty, button: 'left', clickCount: 1 });
    await wait(100);
    log(`  pris en main : ${(await state()).hand}, tour ${(await state()).sugars}`);
    const dir = s.side;
    for (let k = 1; k <= 8; k++) {
      web.sendInputEvent({ type: 'mouseMove', x: tx + dir * k * 22, y: ty - 120 - k * 8 });
      await wait(30);
    }
    web.sendInputEvent({ type: 'mouseUp', x: tx + dir * 176, y: ty - 184, button: 'left', clickCount: 1 });
    await wait(200);
    log(`  lance : ${JSON.stringify((await state()).loose)}`);
    await wait(1500);
    log(`  au sol : ${JSON.stringify((await state()).loose)}, lui ${(await state()).mode} x=${Math.round((await state()).x)}`);
    for (let k = 0; k < 30 && (await state()).loose.length; k++) await wait(300);
    await wait(600);
    s = await state();
    log(`  ramasse : reste ${s.loose.length}, geste ${s.acting}, x=${Math.round(s.x)}`);
    await snap('ramasse', near(s));
    await wait(2500);
    s = await state();
    const r = await web.executeJavaScript('window.__L.do.reach()');
    const t2x = Math.round(s.x + s.side * 64 * 1.45);
    web.sendInputEvent({ type: 'mouseMove', x: t2x, y: ty });
    web.sendInputEvent({ type: 'mouseDown', x: t2x, y: ty, button: 'left', clickCount: 1 });
    web.sendInputEvent({ type: 'mouseMove', x: Math.round(r.x), y: Math.round(r.y) });
    await wait(400);
    web.sendInputEvent({ type: 'mouseUp', x: Math.round(r.x), y: Math.round(r.y), button: 'left', clickCount: 1 });
    await wait(300);
    log(`donne dans la main : dehors ${(await state()).loose.length}, geste ${(await state()).acting}`);
    await wait(3000);

    // what he keeps: sugars taken and given, games finished, your absence; his tower watched; a flinch
    log(`memoire : ${JSON.stringify(await web.executeJavaScript('window.__L.memo()'))}`);
    await web.executeJavaScript('window.__L.hush(); window.__L.closePanel()');
    s = await state();
    const hx = Math.round(s.x + s.side * 64 * 1.45);
    web.sendInputEvent({ type: 'mouseMove', x: hx, y: ty - 4 });
    for (let k = 0; k < 6; k++) { await wait(250); web.sendInputEvent({ type: 'mouseMove', x: hx + (k % 2), y: ty - 4 }); }
    s = await state();
    log(`souris sur la tour 1,5 s : geste ${s.acting}, il dit : ${s.said}`);
    await snap('tour-regard', near(s));
    web.sendInputEvent({ type: 'mouseMove', x: 30, y: 30 });
    await wait(3000);
    await web.executeJavaScript('window.__L.hush(); window.__L.pose("think", 0.05)');
    await wait(400);
    s = await state();
    const fy = Math.round(s.y - 225 * 0.72);
    web.sendInputEvent({ type: 'mouseMove', x: Math.round(s.x) - 200, y: fy });
    await wait(16);
    web.sendInputEvent({ type: 'mouseMove', x: Math.round(s.x) + 5, y: fy });
    await wait(16);
    web.sendInputEvent({ type: 'mouseMove', x: Math.round(s.x) + 200, y: fy });
    await wait(150);
    s = await state();
    log(`souris tres vite devant son visage : geste ${s.acting}, il dit : ${s.said}`);
    await wait(2000);
    await web.executeJavaScript('window.__L.do.welcome(37 * 60e3)');
    await wait(1500);
    log(`retour apres 37 min : ${(await state()).said}`);
    await web.executeJavaScript(`window.__L.game({ game: 'chess', kind: 'end', result: 'him', why: 'mat' }); window.__L.game({ game: 'chess', kind: 'closed' })`);
    await wait(1500);
    log(`partie gagnee par lui puis fermee : ${(await state()).said} | memoire ${JSON.stringify((await web.executeJavaScript('window.__L.memo()')).record)}`);
    await wait(1500);
    await web.executeJavaScript('window.__L.hush(); window.__L.pose("think", 0.05)');
    await wait(300);
    log(`invitation : ${await web.executeJavaScript('window.__L.do.invite()')}`);
    await wait(2200);
    s = await state();
    log(`  il dit : ${s.said}`);
    await snap('invitation', { x: Math.max(0, Math.round(s.x - 230)), y: Math.max(0, Math.round(s.y - 480)), width: 460, height: 490 });
    log(`  clic sur Non : ${await web.executeJavaScript('window.__L.choose("Non")')}`);
    await wait(1500);
    log(`  puis il dit : ${(await state()).said}`);
    await wait(7000);
    await web.executeJavaScript('window.__L.do.addSugar()');
    await wait(1200);
    s = await state();
    web.sendInputEvent({ type: 'mouseMove', x: Math.round(s.x + s.side * 380), y: Math.round(s.y - 300) });
    await wait(100);
    const tower0 = (await state()).sugars;
    await web.executeJavaScript('window.__L.hear("donne-moi un sucre")');
    await wait(750);
    s = await state();
    log(`donne-moi un sucre : tour ${tower0} -> ${s.sugars}, en l air ${JSON.stringify(s.loose)}, il dit : ${s.said}`);
    await snap('il-lance', { x: Math.max(0, Math.round(Math.min(s.x, s.x + s.side * 400) - 80)), y: Math.max(0, Math.round(s.y - 480)), width: 620, height: 490 });
    if (s.loose[0]) {
      const c = s.loose[0];
      web.sendInputEvent({ type: 'mouseMove', x: c.x, y: c.y - 4 });
      web.sendInputEvent({ type: 'mouseDown', x: c.x, y: c.y - 4, button: 'left', clickCount: 1 });
      await wait(150);
      log(`  clic sur le sucre en vol : en main ${(await state()).hand}, il dit : ${(await state()).said}`);
      web.sendInputEvent({ type: 'mouseUp', x: c.x, y: c.y - 4, button: 'left', clickCount: 1 });
      await wait(3000);
    }
    for (const line of ['score', 'regarde-moi', 'aide', 'dors', 'réveille-toi']) {
      const r = await web.executeJavaScript(`window.__L.hear(${JSON.stringify(line)})`);
      await wait(1500);
      s = await state();
      log(`ordre "${line}" -> did=${r.did} geste=${s.acting} dort=${s.asleep} | ${s.said.slice(0, 90)}`);
    }
    await wait(2000);

    await web.executeJavaScript(`window.__L.do.onDo({ what: 'come', at: { x: 400, y: 300 } })`);
    await wait(600);
    s = await report(`viens a la souris (400) -> ${(await state()).mode}`);

    await web.executeJavaScript('window.l.body("stow")');
    await wait(1200);
    await web.executeJavaScript('window.__L.say("Rappel : test.")');
    await wait(300);
    s = await report('bulle pendant qu il est range');
    await snap('bulle', { x: 0, y: Math.max(0, Math.round(s.y - 200)), width: 400, height: 210 });
    log('reste range pour la relance');
  }
  app.quit();
};
