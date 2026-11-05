'use strict';

// L on the desktop: a transparent overlay for his body, his mind (src/brain) here in the main process.

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, globalShortcut, nativeImage } = require('electron');
const { startWindowWatch } = require('./windows');
const { createFocusWatch } = require('./focus');
const { createTools } = require('./tools');

const ROOT = path.join(__dirname, '..', '..');

let overlay = null;
let tray = null;
let mind = null;
let tools = null;
let windowWatch = null;
let lastWindows = null;
let display = null; // the screen he's on for now, null: home
let games = null;   // the window where you play against him
let keys = {};      // which of his shortcuts Windows let him have

const DRIVE = process.env.L_DRIVE; // scripts/drive.js
const UNSEEN = Boolean(process.env.L_UNSEEN); // scripts/stow-check.js: he runs, but nothing reaches your screen
if (process.env.L_DATA) app.setPath('userData', process.env.L_DATA);

if (!app.requestSingleInstanceLock()) app.quit();

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function settings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch {
    return {};
  }
}

// the screen he lives on: your choice in his tray menu, else the main one
const home = () => screen.getAllDisplays().find((d) => d.id === settings().displayId) || screen.getPrimaryDisplay();
const targetDisplay = () => display || home();

// Windows sometimes reports a work area that runs under the taskbar
function usableArea() {
  const d = targetDisplay();
  const area = { ...d.workArea };
  for (const b of lastWindows?.bars || []) {
    const overlaps = b.x < d.bounds.x + d.bounds.width && b.x + b.width > d.bounds.x && b.y < d.bounds.y + d.bounds.height && b.y + b.height > d.bounds.y;
    if (!overlaps || b.width < b.height || b.y <= d.bounds.y + d.bounds.height / 2) continue;
    area.height = Math.min(area.height, b.y - area.y);
  }
  return area;
}

function fitOverlay() {
  if (!overlay) return;
  const area = usableArea();
  // with screens at different scales, a first step fully inside the target screen fixes the scale
  overlay.setBounds({ x: area.x + 20, y: area.y + 20, width: 200, height: 200 });
  overlay.setBounds(area);
  overlay.setBounds(area);
  overlay.webContents.send('l:resize', { width: area.width, height: area.height });
  windowWatch?.refresh();
}

const focusWatch = createFocusWatch({
  home,
  moveTo: (d) => {
    display = d;
    fitOverlay();
  },
  hide: (on) => {
    if (on) overlay?.hide();
    else overlay?.showInactive();
  },
});

function createOverlay() {
  overlay = new BrowserWindow({
    ...usableArea(),
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    alwaysOnTop: true,
    type: 'toolbar',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      offscreen: UNSEEN,
    },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  if (!UNSEEN) overlay.once('ready-to-show', () => overlay.showInactive());
  overlay.webContents.once('did-finish-load', () => {
    fitOverlay();
    if (DRIVE) require('../../scripts/drive')(overlay, DRIVE);
    if (UNSEEN) require('../../scripts/stow-check')(overlay, process.env.L_UNSEEN);
    if (settings().stowed) overlay.webContents.send('l:stow', true);
    windowWatch = startWindowWatch({
      overlay,
      onUpdate: (data) => {
        const before = JSON.stringify(lastWindows?.bars);
        lastWindows = data;
        if (JSON.stringify(data.bars) !== before) fitOverlay();
        focusWatch.update(data);
        overlay.webContents.send('l:windows', { fg: data.fg, wins: data.wins });
      },
    });
  });
}

// a small gothic-enough L for the tray, so there's no image file to carry around
function trayIcon() {
  const S = 32;
  const px = Buffer.alloc(S * S * 4);
  const paint = (x0, y0, x1, y1, v) => {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * S + x) * 4;
        px[i] = px[i + 1] = px[i + 2] = v;
        px[i + 3] = 255;
      }
    }
  };
  paint(0, 0, S, S, 245);
  paint(11, 5, 17, 24, 15);
  paint(8, 5, 20, 8, 15);
  paint(11, 22, 25, 27, 15);
  paint(23, 19, 26, 27, 15);
  return nativeImage.createFromBitmap(px, { width: S, height: S });
}

function callHim() {
  focusWatch.recall();
  if (!UNSEEN) overlay?.showInactive();
  overlay?.webContents.send('l:hidden', false);
  if (settings().stowed) setStowed(false);
  overlay?.webContents.send('l:open');
}

// put away: all that's left of him is a sugar cube in the corner of the screen. He stays that way when he restarts.
function setStowed(on) {
  fs.writeFileSync(settingsFile(), JSON.stringify({ ...settings(), stowed: on }));
  if (on) overlay?.setFocusable(false);
  overlay?.webContents.send('l:stow', on);
  if (tray) rebuildTray();
}

function toggleStowed() {
  focusWatch.recall();
  if (!UNSEEN) overlay?.showInactive();
  setStowed(!settings().stowed);
}

// échecs, morpion, puissance 4: a window of its own, which he goes to sit on
function openGames(game = 'chess') {
  if (games && !games.isDestroyed()) {
    games.webContents.send('games:show', game);
    if (!UNSEEN) {
      if (games.isMinimized()) games.restore();
      games.show();
      games.focus();
    }
    return games;
  }
  const area = usableArea();
  const width = 1100;
  const height = 700;
  games = new BrowserWindow({
    width,
    height,
    x: Math.round(area.x + Math.max(0, (area.width - width) / 2)),
    y: Math.round(area.y + Math.min(260, Math.max(40, area.height - height - 30))),
    minWidth: 1000,
    minHeight: 640,
    title: 'Jouer avec L',
    backgroundColor: '#16151b',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'games', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      offscreen: UNSEEN,
    },
  });
  games.setMenuBarVisibility(false);
  games.loadFile(path.join(__dirname, '..', 'games', 'games.html'), { query: { game } });
  if (!UNSEEN) games.once('ready-to-show', () => games.show());
  games.on('closed', () => {
    games = null;
    overlay?.webContents.send('l:game', { kind: 'closed' });
  });
  return games;
}

// the id the window watcher gives that window
function gamesId() {
  if (!games || games.isDestroyed()) return null;
  const h = games.getNativeWindowHandle();
  return h.length >= 8 ? Number(h.readBigInt64LE(0)) : h.readInt32LE(0);
}

// where your pointer is, in his overlay
function pointer() {
  const p = screen.getCursorScreenPoint();
  const b = overlay?.getBounds() || { x: 0, y: 0 };
  return { x: p.x - b.x, y: p.y - b.y };
}

function doIt(what) {
  focusWatch.recall();
  if (!UNSEEN) overlay?.showInactive();
  if (settings().stowed) setStowed(false);
  overlay?.webContents.send('l:do', { what, at: pointer() });
}

const SHORTCUTS = [
  ['CommandOrControl+Alt+L', 'le ranger / le faire revenir', () => toggleStowed()],
  ['CommandOrControl+Alt+K', 'lui parler', () => callHim()],
  ['CommandOrControl+Alt+J', 'jouer contre lui', () => openGames()],
  ['CommandOrControl+Alt+H', 'le faire venir à ta souris', () => doIt('come')],
  ['CommandOrControl+Alt+U', 'lui lancer un sucre', () => doIt('sugar')],
];

function registerKeys() {
  for (const [accel, , fn] of SHORTCUTS) keys[accel] = globalShortcut.register(accel, fn);
}
const keyLabel = (accel) => (keys[accel] === false ? ' — pris par une autre appli' : '');

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('L');
  tray.on('click', callHim);
  rebuildTray();
}

function rebuildTray() {
  tray.setContextMenu(menu());
}

function menu() {
  return Menu.buildFromTemplate([
    { label: `Parler à L (Ctrl+Alt+K)${keyLabel('CommandOrControl+Alt+K')}`, click: callHim },
    {
      label: `Jouer (Ctrl+Alt+J)${keyLabel('CommandOrControl+Alt+J')}`,
      submenu: [
        { label: 'Échecs', click: () => openGames('chess') },
        { label: 'Morpion', click: () => openGames('ttt') },
        { label: 'Puissance 4', click: () => openGames('c4') },
      ],
    },
    {
      label: 'Lui faire faire…',
      submenu: [
        { label: `Venir à ta souris (Ctrl+Alt+H)${keyLabel('CommandOrControl+Alt+H')}`, click: () => doIt('come') },
        { label: `Lui lancer un sucre (Ctrl+Alt+U)${keyLabel('CommandOrControl+Alt+U')}`, click: () => doIt('sugar') },
        { label: 'Te lancer un de ses sucres', click: () => doIt('give') },
        { label: 'Te proposer une partie', click: () => doIt('invite') },
        { label: 'Un thé', click: () => doIt('tea') },
        { label: 'Son ordi', click: () => doIt('computer') },
        { label: 'Une tour de sucres', click: () => doIt('tower') },
        { type: 'separator' },
        { label: 'Accroupi', click: () => doIt('crouch') },
        { label: 'Debout', click: () => doIt('stand') },
        { label: 'Assis', click: () => doIt('sit') },
        { label: 'Aller se promener', click: () => doIt('walk') },
        { label: 'Dormir', click: () => doIt('sleep') },
      ],
    },
    { label: `${settings().stowed ? 'Le faire revenir' : 'Le ranger'} (Ctrl+Alt+L)${keyLabel('CommandOrControl+Alt+L')}`, click: toggleStowed },
    { label: 'Ce qu’il fait seul, en chiffres', click: () => showTool('stats') },
    { label: 'Changer de perso…', click: openPicker },
    {
      label: 'Écran',
      submenu: screen.getAllDisplays().map((d, i) => ({
        label: `Écran ${i + 1} (${d.size.width} × ${d.size.height})`,
        type: 'radio',
        checked: d.id === home().id,
        click: () => {
          fs.writeFileSync(settingsFile(), JSON.stringify({ ...settings(), displayId: d.id }));
          display = null;
          focusWatch.homeChanged();
          fitOverlay();
          rebuildTray();
        },
      })),
    },
    { type: 'separator' },
    { label: 'Fermer L', click: () => app.quit() },
  ]);
}

// the app where you choose who's on your desktop (Apps\persos), when it's there
function openPicker() {
  const dir = path.join(ROOT, '..', 'persos');
  const exe = path.join(dir, 'node_modules', 'electron', 'dist', 'electron.exe');
  if (fs.existsSync(exe)) spawn(exe, [dir], { detached: true, stdio: 'ignore', cwd: dir }).unref();
}

async function showTool(tool) {
  overlay?.webContents.send('l:say', { text: await tools.run({ tool }) });
}

// the sentence you typed -> what he does
async function hear(text) {
  const game = tools.rpsTurn(text);
  if (game) return game;
  // only what he may need; he isn't to comment on it
  const context = `Date du jour : ${new Date().toLocaleDateString('fr-FR', { dateStyle: 'long' })}. Ne la mentionne que si c’est utile à la réponse.`;
  const r = await mind.respond(text, context);
  const steps = r.steps || [r];
  const said = [];
  const body = [];
  for (const step of steps) {
    if (step.body) body.push(step.body);
    if (step.tool) {
      // what the tool measured wins over anything said about it
      const out = await tools.run(step);
      said.push(out || step.say || '');
    } else if (step.say) said.push(step.say);
  }
  const intents = steps.map((s) => s.intent);
  const mood = intents.includes('rude') ? 'sulk' : undefined;
  return { say: said.filter(Boolean).join('\n'), body, intent: r.intent, mood, source: r.source, learned: r.learned, failed: r.failed, confirm: r.confirm, did: steps.some((s) => s.tool) };
}

function registerIpc() {
  ipcMain.on('overlay:interactive', (_e, on) => overlay?.setIgnoreMouseEvents(!on, { forward: true }));
  ipcMain.on('overlay:keyboard', (_e, on) => {
    if (!overlay || DRIVE) return;
    overlay.setFocusable(on);
    if (on) overlay.focus();
  });
  ipcMain.on('l:menu', () => { if (!UNSEEN) menu().popup({ window: overlay }); });
  ipcMain.handle('l:hear', (_e, text) => hear(text));
  ipcMain.on('games:tell', (_e, event) => overlay?.webContents.send('l:game', { ...event, win: gamesId() }));
  ipcMain.on('l:games', (_e, game) => openGames(game));
  ipcMain.handle('l:body', (_e, what) => {
    if (what === 'aside') return focusWatch.aside();
    if (what === 'comeBack') {
      focusWatch.recall();
      return true;
    }
    if (what === 'games') {
      openGames();
      return true;
    }
    if (what === 'stow' || what === 'unstow') {
      setStowed(what === 'stow');
      return true;
    }
    return false;
  });
}

app.on('second-instance', callHim);

app.whenReady().then(async () => {
  const { Mind } = await import('../brain/mind.mjs');
  const { createTeacher } = await import('../brain/teacher.mjs');
  const dir = path.join(app.getPath('userData'), 'mind');
  const teacher = createTeacher({ dir });
  mind = new Mind({
    dir,
    model: path.join(ROOT, 'model', 'l-net.bin'),
    teacher: (question, info) => {
      overlay?.webContents.send('l:asking');
      return teacher(question, info);
    },
  });
  tools = createTools({ dir, mind, onDue: (r) => overlay?.webContents.send('l:say', { text: `Rappel : ${r.what}`, stay: true }) });
  registerIpc();
  createOverlay();
  global.openGames = openGames; // for scripts/stow-check.js
  if (!UNSEEN) {
    registerKeys();
    createTray();
  }
  screen.on('display-metrics-changed', fitOverlay);
  screen.on('display-removed', () => {
    display = null;
    fitOverlay();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  windowWatch?.stop();
  mind?.saveNet();
});
app.on('window-all-closed', () => {});
