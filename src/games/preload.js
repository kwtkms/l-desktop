'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('games', {
  // what happened in the game, for L
  tell: (event) => ipcRenderer.send('games:tell', event),
  on: (name, fn) => {
    if (name !== 'show') return;
    ipcRenderer.on('games:show', (_e, data) => fn(data));
  },
});
