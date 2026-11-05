// His mind. A sentence comes in; he works it out, recognises it, or remembers it. Whatever he can't
// handle goes to his teacher (Claude), and what Claude answers becomes his: the question and its
// rewordings go into his memory and train his net, so next time he doesn't need to ask.
//
// Recognition mixes his trained net with plain word matching: on held-out sentences the net alone
// was barely better than word matching, the mix clearly is (scripts/eval.mjs).

import fs from 'node:fs';
import path from 'node:path';
import { Net, dot } from './net.mjs';
import { norm, features, content } from './text.mjs';
import { INTENTS, OTHER } from './corpus.mjs';
import { calc, convert, timeIn, dateMath } from './reason.mjs';

const ACT = 0.55;         // he does it (chosen with scripts/tune.mjs)
const ASK = 0.43;         // he checks first
const MARGIN = 0.03;      // only if the next meaning is clearly behind
const LONG = 9;           // a long sentence is rarely an order
const RECALL = 0.42;      // close enough to something he was taught (recall() also wants its words)
// how a question is asked, not what it's about
const ASKING = new Set(content('fonctionne fonctionner marche marcher difference differences explique expliquer explication veut signifie signification definition principe role sert servir utilite utiliser utilise exemple resume simplement rapidement concretement vraiment'));
const PENDING_MS = 2 * 60 * 1000;
const LEX = 1 << 18;

const YES = /^(oui|ouais|yes|yep|ok|okay|vas y|exact|c est ca|dac|d accord|grave)( \S+)?$/;
const NO = /^(non|nope|no|nan|pas ca|laisse tomber|annule)( \S+)?$/;
const WRONG = /^(non )?(c est pas ca|c est pas ce que je voulais|t as pas compris|tu as pas compris|tu t es trompe|pas ca|mauvaise reponse|c est faux|wrong)$/;
const TEACH = /^(?:quand je (?:dis|dit|tape)|si je (?:dis|dit|tape)|when i say) (.+?) (?:ca veut dire|ca signifie|tu fais|fais|it means|do) (.+)$/;
const FORCE = /^\s*(?:l[ ,]+)?(?:demande(?:r)?\s+[àa]\s+claude|claude\s*[:,]|ask claude)\s*:?\s*/i;
const REMEMBER = /^\s*(?:retiens|souviens[- ]toi|rappelle[- ]toi|n['’ ]?oublie pas|note|remember)(?: bien)?(?: que| qu['’]| de| :)?\s*/i;
const FORGET_FACT = /^(?:oublie|forget)\b(?: ca| le truc| ce que je t ai dit)?(?: sur| a propos de| que| qu| about)?\s*(.*)$/;
const OPEN = /^(?:ouvre|lance|demarre|open|launch|start)\s+(?:moi\s+)?(?!un |une |des )(.+)$/;
const REMIND = /^(?:rappelle moi|rappelle|remind me|fais moi penser)\b/;
const TIMER = /^(?:mets?|lance|fais)?\s*(?:moi )?(?:un |une )?(?:minuteur|timer|chrono|alarme)(?: de| pour| dans)?\s*(\d+)\s*(h|min|s)?/;
const CHOOSE = /^\s*(?:choisis|choisi|tu choisis|tu prendrais quoi|pick|choose)(?:\s+(?:entre|pour moi|between))*\s*:?\s+(.+?)\s+(?:ou|or)\s+(.+?)\s*\??$/i;
const SPLIT = /\s*(?:,\s*)?\b(?:et|puis|ensuite|and then)\b\s+|\s*,\s+/i;

// "dans 20 min x", "a 18h30 x", "demain a 9h x"
export function parseReminder(text, now = new Date()) {
  let s = norm(text).replace(REMIND, '').trim();
  let at = null;
  let m = s.match(/^(?:dans|in)\s+(\d+)\s*h\s*(\d+)?\s*(?:min)?\s*/);
  if (m) at = new Date(now.getTime() + (Number(m[1]) * 60 + Number(m[2] || 0)) * 60000);
  else if ((m = s.match(/^(?:dans|in)\s+(\d+)\s*min\b\s*/))) at = new Date(now.getTime() + Number(m[1]) * 60000);
  else if ((m = s.match(/^(demain\s+)?(?:(?:a|at|vers)\s+)?(\d{1,2})\s*(?:h|:)\s*(\d{2})?\s*/))) {
    at = new Date(now);
    at.setHours(Number(m[2]), Number(m[3] || 0), 0, 0);
    if (m[1] || at <= now) at.setDate(at.getDate() + 1);
  }
  if (!at || Number.isNaN(at.getTime())) return null;
  s = s.slice(m[0].length).replace(/^(de|d|que|qu|to)\s+/, '').trim();
  return { at: at.getTime(), what: s || '…' };
}

class Lexical {
  constructor() {
    this.docs = [];
    this.df = new Map();
  }

  add(text) {
    const f = features(text, LEX);
    for (const k of f.keys()) this.df.set(k, (this.df.get(k) || 0) + 1);
    this.docs.push(f);
    this.vs = null;
  }

  vec(f) {
    const v = new Map();
    let s = 0;
    for (const [k, w] of f) {
      const x = w * Math.log(1 + this.docs.length / (1 + (this.df.get(k) || 0)));
      v.set(k, x);
      s += x * x;
    }
    s = Math.sqrt(s) || 1;
    for (const [k, x] of v) v.set(k, x / s);
    return v;
  }

  scores(text) {
    this.vs ??= this.docs.map((f) => this.vec(f));
    const q = this.vec(features(text, LEX));
    return this.vs.map((v) => {
      let c = 0;
      for (const [k, x] of q) c += x * (v.get(k) || 0);
      return c;
    });
  }
}

const SEED = (() => {
  try {
    return JSON.parse(fs.readFileSync(new URL('./seed.json', import.meta.url), 'utf8'));
  } catch {
    return { version: 0, lessons: [] };
  }
})();

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};

export class Mind {
  // dir: where he keeps what he learns. model: his trained net. teacher(question, context): Claude.
  constructor({ dir, model, teacher, tune = {} }) {
    this.tune = { act: ACT, ask: ASK, margin: MARGIN, long: 0.65, ...tune };
    this.dir = dir;
    this.teacher = teacher;
    fs.mkdirSync(dir, { recursive: true });
    const own = path.join(dir, 'l-net.bin');
    // his own copy, unless a newer one was trained since: what he learned stays in memory.json either way
    const file = fs.existsSync(own) && fs.statSync(own).mtimeMs >= fs.statSync(model).mtimeMs ? own : model;
    this.net = new Net({ weights: fs.readFileSync(file) });
    this.state = { lessons: [], learned: [], facts: [], local: 0, asked: 0, ...readJson(path.join(dir, 'memory.json'), {}) };
    // what he knows from the start (scripts/grow.mjs); yours to correct like the rest
    if ((this.state.seedVersion || 0) < SEED.version) {
      this.state.lessons = this.state.lessons.filter((l) => !l.seed);
      this.state.lessons.push(...SEED.lessons.map((l) => ({ ...l, at: 0, uses: 0, seed: true })));
      this.state.seedVersion = SEED.version;
    }
    this.pending = null;
    this.last = null;
    this.lastValue = null;
    this.lastLine = new Map();
    this.rebuild();
  }

  // every sentence he knows, with its meaning, as his net and word matching see it
  rebuild() {
    this.docs = [];
    this.lex = new Lexical();
    const put = (text, label) => {
      this.docs.push({ text, label, u: this.net.embed(text) });
      this.lex.add(text);
    };
    const dropped = new Set(this.state.learned.map((l) => l.text));
    for (const [name, it] of Object.entries(INTENTS)) for (const s of it.say) if (!dropped.has(norm(s))) put(norm(s), name);
    for (const s of OTHER) if (!dropped.has(norm(s))) put(norm(s), 'other');
    for (const l of this.state.learned) put(l.text, l.target);
    this.lessonDocs = [];
    this.lessonLex = new Lexical();
    this.state.lessons.forEach((lesson, i) => {
      for (const q of lesson.q) {
        this.lessonDocs.push({ i, u: this.net.embed(q) });
        this.lessonLex.add(q);
      }
    });
  }

  save() {
    fs.writeFileSync(path.join(this.dir, 'memory.json'), JSON.stringify(this.state, null, 1));
    clearTimeout(this.netTimer);
    this.netTimer = setTimeout(() => this.saveNet(), 3000);
    this.netTimer.unref?.();
  }

  saveNet() {
    fs.writeFileSync(path.join(this.dir, 'l-net.bin'), this.net.toBuffer());
  }

  // what a sentence most resembles
  recognise(n) {
    const u = this.net.embed(n);
    const lx = this.lex.scores(n);
    const best = new Map();
    this.docs.forEach((d, i) => {
      const c = 0.5 * dot(u, d.u) + 0.5 * lx[i];
      if (c > (best.get(d.label) ?? -9)) best.set(d.label, c);
    });
    const [a, b] = [...best.entries()].sort((x, y) => y[1] - x[1]);
    return { label: a[0], score: a[1], margin: a[1] - (b?.[1] ?? 0) };
  }

  sure(n, hit = this.recognise(n)) {
    return hit.label !== 'other' && hit.margin >= this.tune.margin && hit.score >= (n.split(' ').length > LONG ? this.tune.long : this.tune.act);
  }

  // A new meaning for a sentence: his memory, and a few steps of training so the net follows.
  learn(text, target) {
    this.state.learned = this.state.learned.filter((l) => l.text !== text);
    this.state.learned.push({ text, target, at: Date.now() });
    this.drill(text, target);
    this.rebuild();
    this.save();
  }

  drill(text, target) {
    const same = this.docs.filter((d) => d.label === target && d.text !== text);
    const other = this.docs.filter((d) => d.label !== target);
    if (!same.length || !other.length) return;
    const pick = (list) => list[Math.floor(Math.random() * list.length)].text;
    for (let i = 0; i < 12; i++) this.net.triplet(text, pick(same), pick(other), { lr: 0.1 });
  }

  // what Claude just taught him
  addLesson(question, paraphrases, answer) {
    const q = [...new Set([question, ...paraphrases].map(norm))].filter(Boolean).slice(0, 8);
    if (!q.length || !answer) return;
    for (let i = 0; i < 8; i++) {
      const a = q[Math.floor(Math.random() * q.length)];
      const p = q[Math.floor(Math.random() * q.length)];
      const n = this.docs[Math.floor(Math.random() * this.docs.length)].text;
      if (a !== p && !q.includes(n)) this.net.triplet(a, p, n, { lr: 0.1 });
    }
    this.state.lessons.push({ q, a: answer, at: Date.now(), uses: 0 });
    this.rebuild();
  }

  // something he was taught that answers this. Every word that matters must be in it:
  // "capitale du japon" isn't "capitale de la coree", however alike they look.
  recall(n) {
    if (!this.lessonDocs.length) return null;
    const u = this.net.embed(n);
    const lx = this.lessonLex.scores(n);
    let best = -1;
    let top = 0;
    this.lessonDocs.forEach((d, i) => {
      const c = 0.5 * dot(u, d.u) + 0.5 * lx[i];
      if (c > top) {
        top = c;
        best = d.i;
      }
    });
    if (best < 0 || top < RECALL) return null;
    const lesson = this.state.lessons[best];
    const known = new Set(lesson.q.flatMap(content));
    const words = content(n);
    const about = words.filter((w) => !ASKING.has(w));
    return about.length && about.every((w) => known.has(w)) ? best : null;
  }

  recallFact(raw) {
    const n = norm(raw);
    if (!this.state.facts.length || !/\b(je|j|mon|ma|mes|m)\b/.test(n)) return null;
    if (!/\?\s*$/.test(raw) && !/\b(quand|quoi|ou|comment|combien|quel|quelle|qui|est ce que)\b/.test(n)) return null;
    const words = content(raw);
    if (!words.length) return null;
    let best = null;
    let score = 0;
    for (const f of this.state.facts) {
      const have = new Set(content(f.text));
      const s = words.filter((w) => have.has(w)).length / words.length;
      if (s > score) {
        score = s;
        best = f;
      }
    }
    return score >= 0.6 ? best.text : null;
  }

  // what an intent comes down to
  act(name, typed) {
    const it = INTENTS[name];
    if (!it) return null;
    if (it.lines) {
      const others = it.lines.filter((l) => l !== this.lastLine.get(name));
      const say = others[Math.floor(Math.random() * others.length)] ?? it.lines[0];
      this.lastLine.set(name, say);
      return { say, intent: name };
    }
    if (it.body) return { body: it.body, intent: name };
    return { tool: it.tool, args: { ...it.args, typed }, intent: name };
  }

  // Everything he can settle alone. null: not for him.
  local(raw) {
    const n = norm(raw);
    let m;
    if ((m = n.match(OPEN))) return { tool: 'open', args: { what: m[1] }, intent: 'open' };
    if (REMIND.test(n) && /\d|demain/.test(n)) {
      const r = parseReminder(raw);
      if (r) return { tool: 'remind', args: r, intent: 'remind' };
    }
    if ((m = n.match(TIMER))) {
      const unit = m[2] === 'h' ? 60 : m[2] === 's' ? 1 / 60 : 1;
      return { tool: 'remind', args: { at: Date.now() + Number(m[1]) * unit * 60000, what: 'minuteur' }, intent: 'remind' };
    }
    const value = calc(raw, this.lastValue);
    if (value) {
      if (value.value !== null) this.lastValue = value.value;
      return { say: value.text === null ? 'Ce calcul n’a pas de résultat.' : value.text, intent: 'calc' };
    }
    const c = convert(raw);
    if (c) return { say: c, intent: 'convert' };
    const z = timeIn(raw);
    if (z) return { say: `À ${z.place}, il est ${z.clock} (${z.day}).`, intent: 'timeIn' };
    const d = dateMath(raw);
    if (d) return { say: d, intent: 'date' };
    if ((m = raw.match(CHOOSE))) return { say: `${Math.random() < 0.5 ? m[1] : m[2]}. Je n’expliquerai pas pourquoi.`, intent: 'choose' };
    return null;
  }

  // "range tes sucres et ouvre spotify": all of it, only if he's sure of every part
  several(raw) {
    if (!SPLIT.test(raw)) return null;
    const parts = raw.split(SPLIT).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2 || parts.length > 4) return null;
    const steps = [];
    for (const part of parts) {
      const n = norm(part);
      let step = this.local(part);
      if (!step && OPEN.test(norm(parts[0])) && part.split(' ').length <= 3) step = this.local(`ouvre ${part}`);
      if (!step) {
        const hit = this.recognise(n);
        if (!this.sure(n, hit) || INTENTS[hit.label]?.risky) return null;
        step = this.act(hit.label, part);
      }
      if (!step) return null;
      steps.push(step);
    }
    return { steps, intent: 'several' };
  }

  // What to do with a sentence: { say?, tool?, args?, body?, steps?, confirm?, source }
  async respond(typed, context = '') {
    const raw = String(typed || '').trim();
    if (!raw) return { source: 'none' };
    const n = norm(raw);
    const now = Date.now();
    const done = (d) => {
      this.state.local++;
      this.last = { raw, at: now, intent: d.intent, lesson: d.lesson };
      this.save();
      return { source: 'local', ...d };
    };

    if (FORCE.test(raw)) return this.ask(raw.replace(FORCE, '').trim() || raw, context);

    // he just asked you something
    const pending = this.pending && now - this.pending.at < PENDING_MS ? this.pending : null;
    this.pending = null;
    if (pending) {
      if (YES.test(n)) {
        if (!INTENTS[pending.intent]?.risky) this.learn(norm(pending.raw), pending.intent);
        return done(this.act(pending.intent, pending.raw));
      }
      if (NO.test(n)) {
        if (INTENTS[pending.intent]?.risky) return done({ say: 'Bien. Je ne touche à rien.', intent: 'ack' });
        this.learn(norm(pending.raw), 'other');
        return this.ask(pending.raw, context);
      }
    }

    // you tell him he's wrong: he forgets what misled him, and Claude gets the sentence
    if (WRONG.test(n) && this.last && now - this.last.at < PENDING_MS) {
      const { raw: before, lesson } = this.last;
      this.last = null;
      if (lesson !== undefined) this.state.lessons.splice(lesson, 1);
      else this.state.learned = this.state.learned.filter((l) => l.text !== norm(before));
      this.learn(norm(before), 'other');
      return this.ask(before, context, { correction: true });
    }

    // your words for things
    let m = n.match(TEACH);
    if (m) {
      const target = this.local(m[2])?.intent ? null : this.recognise(norm(m[2]));
      if (!target || !this.sure(norm(m[2]), target)) return { source: 'local', say: `« ${m[2]} », je ne sais pas encore le faire seul. Je ne peux donc pas l’apprendre.` };
      this.learn(norm(m[1]), target.label);
      return done({ say: `Compris. « ${m[1]} » veut dire « ${m[2]} ».`, intent: 'taught' });
    }

    // what you tell him about you
    if (REMEMBER.test(raw)) {
      const text = raw.replace(REMEMBER, '').trim();
      if (text) {
        this.state.facts.push({ text, at: now });
        return done({ say: `Noté : « ${text} ».`, intent: 'remember' });
      }
    }
    if ((m = n.match(FORGET_FACT))) {
      if (/^(tout|everything)$/.test(m[1])) {
        this.state.facts = [];
        return done({ say: 'Tout ce que tu m’avais dit est effacé.', intent: 'forget' });
      }
      const words = content(m[1]);
      const i = this.state.facts.findIndex((f) => words.length && words.every((w) => content(f.text).includes(w)));
      if (i >= 0) {
        const [gone] = this.state.facts.splice(i, 1);
        return done({ say: `Effacé : « ${gone.text} ».`, intent: 'forget' });
      }
      return done({ say: 'Je n’ai rien retenu qui ressemble à ça.', intent: 'forget' });
    }

    const own = this.state.learned.find((l) => l.text === n);
    if (own) {
      if (own.target === 'other') return this.ask(raw, context);
      return done(this.act(own.target, raw));
    }

    const worked = this.local(raw);
    if (worked) return done(worked);
    const many = this.several(raw);
    if (many) return done(many);

    const hit = this.recognise(n);
    if (this.sure(n, hit)) {
      if (!INTENTS[hit.label]?.risky) return done(this.act(hit.label, raw));
      this.pending = { raw, intent: hit.label, at: now };
      return { source: 'local', confirm: true, say: `Tu veux vraiment : ${INTENTS[hit.label].label} ?` };
    }

    // what he has been taught or told
    const lesson = this.recall(n);
    if (lesson !== null) {
      this.state.lessons[lesson].uses++;
      return done({ say: this.state.lessons[lesson].a, intent: 'lesson', lesson });
    }
    const fact = this.recallFact(raw);
    if (fact) return done({ say: `Tu m’as dit : « ${fact} ».`, intent: 'fact' });

    // nearly sure of an order: he checks
    const intent = INTENTS[hit.label];
    if (intent && hit.score >= this.tune.ask && hit.margin >= this.tune.margin && n.split(' ').length <= LONG && !intent.lines) {
      this.pending = { raw, intent: hit.label, at: now };
      return { source: 'local', confirm: true, say: `Tu veux dire : « ${intent.say[0]} » ?` };
    }

    return this.ask(raw, context);
  }

  // he doesn't know: Claude does, and he learns it
  async ask(question, context, { correction = false } = {}) {
    this.state.asked++;
    const relevant = this.state.facts.filter((f) => {
      const have = new Set(content(f.text));
      return content(question).some((w) => have.has(w));
    }).slice(0, 5).map((f) => f.text);
    const res = await this.teacher(question, { context, facts: relevant, correction });
    if (!res.ok) {
      this.save();
      return { source: 'claude', failed: true, say: res.error };
    }
    let learned = false;
    if (res.action && INTENTS[res.action] && !INTENTS[res.action].lines) {
      // he had the means, not the words
      if (!INTENTS[res.action].risky) {
        this.learn(norm(question), res.action);
        for (const p of res.paraphrases || []) this.learn(norm(p), res.action);
        learned = true;
      }
      const step = this.act(res.action, question);
      if (INTENTS[res.action].risky) {
        this.pending = { raw: question, intent: res.action, at: Date.now() };
        return { source: 'claude', confirm: true, say: `Tu veux vraiment : ${INTENTS[res.action].label} ?` };
      }
      this.save();
      return { source: 'claude', learned, ...step, say: res.reply };
    }
    if (res.durable && res.reply) {
      // what he repeats later, without the remarks that only held at that moment. None given: nothing to keep.
      if (res.lesson) this.addLesson(question, res.paraphrases || [], res.lesson);
      learned = Boolean(res.lesson);
    }
    if (res.fact) this.state.facts.push({ text: res.fact, at: Date.now() });
    this.last = { raw: question, at: Date.now(), lesson: learned ? this.state.lessons.length - 1 : undefined };
    this.save();
    return { source: 'claude', learned, say: res.reply };
  }

  stats() {
    const { local, asked, lessons, learned, facts } = this.state;
    const total = local + asked;
    return {
      local, asked, lessons: lessons.length, learned: learned.filter((l) => l.target !== 'other').length, facts: facts.length,
      share: total ? Math.round(100 * local / total) : null,
    };
  }
}
