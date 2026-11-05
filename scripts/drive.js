'use strict';

// L_DRIVE=<folder> electron . : plays a conversation through his real window, from inside, without
// touching your mouse or keyboard. Writes what he answered and a picture after each sentence.
// Use with L_DATA=<temp folder> so his real memory isn't touched. Keep out of it anything that acts on the PC.

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const SENTENCES = [
  't as quel age', 'tu viens d ou', 'c est quoi ton vrai nom', 'tu connais kira', 't es une ia', 'pourquoi tu t accroupis', 'tu es sur',
  'comment fonctionne un pointeur en c', 'c est quoi la difference entre tcp et udp',
  'pourquoi mon programme fait une segfault quand je free deux fois',
  'tu penses quoi de la vie a seoul', 'tu aimes quoi comme gateau', 'comment fonctionne un moteur diesel', 'je dois choisir entre apprendre le rust ou le go cet ete',
  'chifoumi', 'pierre', 'quelle heure il est', 't es nul', 'mange un sucre',
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function drive(overlay, out) {
  fs.mkdirSync(out, { recursive: true });
  const web = overlay.webContents;
  const log = (line) => fs.appendFileSync(path.join(out, 'log.txt'), `${line}\n`);
  const state = () => web.executeJavaScript('window.__L.state()');
  const snap = async (name) => {
    const s = await state();
    const rect = { x: Math.max(0, Math.round(s.x - 200)), y: Math.max(0, Math.round(s.y - 420)), width: 400, height: 440 };
    const image = await web.capturePage(rect);
    fs.writeFileSync(path.join(out, `${name}.png`), image.toPNG());
  };

  await wait(5000);
  log(`depart ${JSON.stringify(await state())}`);
  await snap('00-depart');

  // the mouse path: a click on him opens his box, typing goes in it
  const s = await state();
  const at = { x: Math.round(s.x), y: Math.round(s.y - 60) };
  web.sendInputEvent({ type: 'mouseMove', ...at });
  await wait(100);
  web.sendInputEvent({ type: 'mouseDown', ...at, button: 'left', clickCount: 1 });
  web.sendInputEvent({ type: 'mouseUp', ...at, button: 'left', clickCount: 1 });
  await wait(300);
  log(`clic: boite ouverte = ${(await state()).panel}`);
  await snap('01-boite');
  await web.executeJavaScript('window.__L.closePanel()');

  let i = 2;
  for (const text of SENTENCES) {
    const started = Date.now();
    const r = await web.executeJavaScript(`window.__L.hear(${JSON.stringify(text)})`);
    log(`> ${text}\n  [${r.source || '-'}${r.learned ? ', retenu' : ''}${r.confirm ? ', question' : ''}${r.failed ? ', ECHEC' : ''}] ${Date.now() - started} ms\n  ${String(r.say || '').replace(/\n/g, ' / ')}${r.body?.length ? ` {corps: ${r.body}}` : ''}`);
    await wait(700);
    await snap(`${String(i++).padStart(2, '0')}`);
  }

  // he gets up and walks, and doesn't jump
  await web.executeJavaScript('window.__L.goTo({ x: window.__L.state().x - 90, win: null })');
  for (let k = 0; k < 4; k++) {
    await wait(700);
    log(`marche ${JSON.stringify(await state())}`);
    await snap(`marche-${k}`);
  }
  await web.executeJavaScript('window.__L.pose("scratch", 3)');
  await wait(1200);
  log(`fin ${JSON.stringify(await state())}`);
  await wait(500);
  app.quit();
};
