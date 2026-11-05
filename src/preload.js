'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('l', {
  // his body lets the mouse through, except on himself and what he shows
  interactive: (on) => ipcRenderer.send('overlay:interactive', Boolean(on)),
  keyboard: (on) => ipcRenderer.send('overlay:keyboard', Boolean(on)),
  hear: (text) => ipcRenderer.invoke('l:hear', String(text)),
  remark: () => ipcRenderer.invoke('l:remark'),
  body: (what) => ipcRenderer.invoke('l:body', String(what)),
  menu: () => ipcRenderer.send('l:menu'),
  games: (game) => ipcRenderer.send('l:games', String(game || 'chess')),
  on: (name, fn) => {
    if (!['windows', 'resize', 'open', 'say', 'asking', 'hidden', 'stow', 'game', 'do'].includes(name)) return;
    ipcRenderer.on(`l:${name}`, (_e, data) => fn(data));
  },
});
