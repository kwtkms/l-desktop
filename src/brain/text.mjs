// How he reads what you type: no accents, no capitals, SMS spelling spelled out, and the pieces his
// neural net looks at (words, word pairs, groups of letters, so a typo still looks like the word).

const SMS = {
  ds: 'dans', dan: 'dans', stp: '', svp: '', pls: '', please: '', steuplait: '', pr: 'pour', pk: 'pourquoi', cb: 'combien', cmb: 'combien',
  bcp: 'beaucoup', jsuis: 'je suis', chui: 'je suis', jai: 'j ai', jveux: 'je veux', jvais: 'je vais', koi: 'quoi', qd: 'quand', tjr: 'toujours',
  mn: 'min', mins: 'min', minute: 'min', minutes: 'min', slt: 'salut', bjr: 'bonjour', cc: 'coucou', mrc: 'merci', cv: 'ca va',
  dmain: 'demain', ajd: 'aujourd hui', auj: 'aujourd hui', rdv: 'rendez vous', zik: 'musique', tkt: 't inquiete', jsp: 'je sais pas', mtn: 'maintenant', vrm: 'vraiment',
};

export function norm(text) {
  const base = String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’'`]/g, ' ').replace(/[^a-z0-9:+ -]/g, ' ').replace(/(\D)-(\D)/g, '$1 $2');
  return base.split(/\s+/).map((w) => (w in SMS ? SMS[w] : w)).filter(Boolean).join(' ').trim();
}

export const stem = (w) => (w.length > 4 ? w.replace(/(?:es|s|e|x)$/, '') : w);

const hash = (s, seed) => {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

// bucket -> weight, in a table of `size` buckets
export function features(text, size) {
  const out = new Map();
  const add = (s, w) => {
    const k = hash(s, 7) % size;
    out.set(k, (out.get(k) || 0) + w);
  };
  const words = text.split(' ').filter(Boolean);
  words.forEach((w, i) => {
    add(`w:${stem(w)}`, 2);
    if (i) add(`b:${stem(words[i - 1])}_${stem(w)}`, 1.5);
    const p = `<${w}>`;
    for (let n = 3; n <= 4; n++) for (let k = 0; k + n <= p.length; k++) add(`c:${p.slice(k, k + n)}`, 0.5);
  });
  return out;
}

const STOP = new Set('je j me m moi mon ma mes tu t te toi ton ta tes il elle on nous vous ils le la les l un une des du de d au aux a et ou en dans sur pour par avec que qu qui quoi quel quelle quels quelles quand comment combien pourquoi est ce c ca sais dit dis dire deja as ai y ne pas n se s sa son ses cette cet ces fait faire peux peut veux dois the of is what how do i you my'.split(' '));

// the words that carry the meaning: "capitale", "coree", not "c est quoi la"
export const content = (text) => norm(text).split(' ').filter((w) => w && !STOP.has(w)).map(stem);
