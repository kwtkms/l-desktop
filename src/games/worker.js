'use strict';

// L thinks here, so the board keeps moving while he does
importScripts('chess.js');

self.onmessage = ({ data }) => {
  const s = self.Chess.parse(data.fen);
  s.seen = data.seen || {};
  const r = self.Chess.think(s, data.level);
  postMessage(r && r.move ? { from: r.move.from, to: r.move.to, promo: r.move.promo || null, score: r.score, nodes: r.nodes } : null);
};
