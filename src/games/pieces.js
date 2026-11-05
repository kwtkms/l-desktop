'use strict';

// The chess pieces, drawn here: one SVG per piece, on a 45 × 45 grid. Same shapes for both sides, the
// colours change.

(function (root) {
  const SHAPES = {
    p: `<circle cx="22.5" cy="12.5" r="5.2"/>
        <path d="M18.3 19.5h8.4l-1.6 3.4c3.2 2.6 5.4 7.3 5.6 12.1H14.3c.2-4.8 2.4-9.5 5.6-12.1z"/>
        <path d="M11.5 35h22a1.5 1.5 0 0 1 1.5 1.5V40H10v-3.5a1.5 1.5 0 0 1 1.5-1.5z"/>`,
    r: `<path d="M12 8.5h4.2v3.6h3.4V8.5h5.8v3.6h3.4V8.5H33v8l-3.2 3v12.5l3.2 3H12l3.2-3V19.5L12 16.5z"/>
        <path d="M10.5 35h24a1.5 1.5 0 0 1 1.5 1.5V40H9v-3.5a1.5 1.5 0 0 1 1.5-1.5z"/>
        <path class="line" d="M15.2 19.5h14.6M15.2 32h14.6" fill="none"/>`,
    n: `<path d="M13.5 35c-.4-4.6 1.3-8.2 4.9-11.6 1.9-1.8 2.4-3.5 1.6-5.2-2.4 1.9-4.9 2.9-7 2.7-1.6-.2-2.4-1.6-1.8-3.1L14.8 12c1-2.5 2.9-4.3 5.3-5.3l.4-2.9 2.7 2.4c6.1.7 10.6 5.9 10.9 13.3.2 5.3-1 10.5-2.6 15.5z"/>
        <path d="M10.5 35h24a1.5 1.5 0 0 1 1.5 1.5V40H9v-3.5a1.5 1.5 0 0 1 1.5-1.5z"/>
        <circle class="eye" cx="18.6" cy="12.6" r="1.3"/>
        <path class="line" d="M24.5 9.8c3.6 2.6 5.6 7.4 5.5 13.7" fill="none"/>`,
    b: `<circle cx="22.5" cy="7.6" r="2.6"/>
        <path d="M22.5 10.6c-5.5 3.8-8.2 9.4-7 14.6.4 1.6 1.1 2.9 2 3.8h10c.9-.9 1.6-2.2 2-3.8 1.2-5.2-1.5-10.8-7-14.6z"/>
        <path d="M16 29.5h13l-1.2 4.5H17.2z"/>
        <path d="M10.5 35h24a1.5 1.5 0 0 1 1.5 1.5V40H9v-3.5a1.5 1.5 0 0 1 1.5-1.5z"/>
        <path class="line" d="M25.6 15.2l-4.6 5.4M18 25.8h9" fill="none"/>`,
    q: `<circle cx="9" cy="12.5" r="2.4"/><circle cx="15.7" cy="9.4" r="2.4"/><circle cx="22.5" cy="8.3" r="2.4"/><circle cx="29.3" cy="9.4" r="2.4"/><circle cx="36" cy="12.5" r="2.4"/>
        <path d="M9.6 14.6l4.6 14.4h16.6l4.6-14.4-6.3 8.3-3.2-11.6-3.3 11.1-3.3-11.1-3.2 11.6z"/>
        <path d="M14.4 29h16.2l-1 5H15.4z"/>
        <path d="M10.5 35h24a1.5 1.5 0 0 1 1.5 1.5V40H9v-3.5a1.5 1.5 0 0 1 1.5-1.5z"/>`,
    k: `<path class="cross" d="M22.5 3.5v8.2M18.8 6.8h7.4" fill="none"/>
        <path d="M22.5 13c-4.6 0-8.8 1.8-10.9 5.4-2.6 4.5-.7 9.3 2.9 11.6h16c3.6-2.3 5.5-7.1 2.9-11.6-2.1-3.6-6.3-5.4-10.9-5.4z"/>
        <path d="M14.4 30h16.2l-1 4.5H15.4z"/>
        <path d="M10.5 35h24a1.5 1.5 0 0 1 1.5 1.5V40H9v-3.5a1.5 1.5 0 0 1 1.5-1.5z"/>
        <path class="line" d="M22.5 17v9.5M15 22.5c4.6-2.4 10.4-2.4 15 0" fill="none"/>`,
  };

  // one piece as SVG markup; side 'w' or 'b'
  function svg(kind, side) {
    return `<svg viewBox="0 0 45 45" class="piece-svg ${side}" aria-hidden="true">${SHAPES[kind]}</svg>`;
  }

  root.Pieces = { svg };
}(typeof self !== 'undefined' ? self : this));
