'use strict';

// electron scripts/snap.js out.png : a sheet of all his poses, to look at them without running him.
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1500, height: 1000, show: false, useContentSize: true, webPreferences: { offscreen: true } });
  await win.loadFile(path.join(__dirname, 'sheet.html'));
  await new Promise((r) => setTimeout(r, 1500));
  const image = await win.webContents.capturePage();
  fs.writeFileSync(process.argv[2] || process.argv[1], image.toPNG());
  app.quit();
});
