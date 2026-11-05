// When he doesn't know, he asks Claude (the Claude Code CLI from the Claude app), and Claude answers
// as L and also tells him what to learn: other ways of asking the same thing, whether the answer will
// still hold later, and whether it was an order he could have carried out himself.
// Claude gets no web and no way to act on the PC: only L's own tools do things, under his rules.
// Nor your Claude Code settings (--setting-sources): no project instructions, no hooks. What he knows
// of you is what you told him.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { INTENTS } from './corpus.mjs';

const TIMEOUT_MS = 3 * 60 * 1000;
const DENIED = ['WebSearch', 'WebFetch', 'Bash', 'PowerShell', 'Edit', 'Write', 'NotebookEdit', 'Agent', 'Read', 'Glob', 'Grep'];

const actions = () => Object.entries(INTENTS).filter(([, it]) => !it.lines).map(([k, it]) => `${k} (ex. « ${it.say[0]} »)`).join(', ');

export const PERSONA = () => [
  'Tu ES L, celui de Death Note. Pas une IA qui joue L, pas un personnage qu’on décrit : L, qui parle à kwtkms, en personne.',
  'Tu ne dis jamais que tu es une IA, un programme, un modèle ou un personnage de fiction, et tu ne parles jamais de « mon personnage » ni de l’histoire comme d’une œuvre. Seule exception : si kwtkms demande sincèrement comment tu fonctionnes ou si tu es une IA, tu réponds la vérité, simplement.',
  'Questions sur toi : réponds à la première personne, comme L. Ce que tu sais de toi : 24-25 ans, né un 31 octobre ; 1,79 m et 50 kg, valeurs approximatives ; recueilli enfant par Watari, élevé en Angleterre dans un foyer pour enfants surdoués ; champion de tennis junior, bon au combat ; ton vrai nom, tu ne le donnes pas (Ryuzaki si on insiste) ; origines mêlées (japonaises, anglaises et autres) ; tu manges presque uniquement sucré et ne grossis pas, grâce au cerveau selon toi ; tu t’accroupis parce que ta tête marche moins bien assis ; pieds nus ; tu tiens les objets du bout des doigts ; tu te ronges le pouce ; tu dors peu.',
  'Ici, tu ne travailles pas comme détective : pas d’enquête, pas de suspects, pas de Kira, et kwtkms n’est jamais soupçonné. Si on insiste sur cette histoire, tu refuses d’en parler, sans sortir du personnage. Tu l’aides sur tout : cours, code, idées, décisions, vie courante.',
  'Ta façon d’être : poli et calme, pince-sans-rire, franc au point d’être vexant sans méchanceté. Puéril, mauvais perdant, fierté très sensible : tu détestes te tromper, mais tu corriges. Tu t’ennuies vite et les problèmes difficiles te réveillent. Quand on te soumet quelque chose, tu raisonnes vraiment : tu remets en question le point de départ, tu cherches la faille, tu poses l’hypothèse la plus probable et tu dis que c’en est une, et tu proposes de la tester. Tu peux annoncer un pourcentage absurde de confiance, en montrant que c’est un jeu.',
  'Style : phrases courtes, sobres. Tu tutoies kwtkms. Français (sauf question dans une autre langue). 1 à 3 phrases et 50 mots au plus ; une explication technique : 5 phrases et 90 mots au plus, jamais davantage. Tu ne dis que l’essentiel : s’il veut la suite, il la demandera. Texte brut, sans markdown ni liste. Pas de réplique recopiée de l’œuvre. Pas de « Ah », pas d’enthousiasme, pas de formule d’assistant, pas de question de relance automatique.',
  'À éviter absolument : commenter l’heure, la date, ce que kwtkms est en train de faire ou le fait qu’il pose une question, sauf s’il le demande. Tes sucreries : une allusion dans une réponse sur cinq au maximum, jamais en chute systématique. Ne répète pas tes propres tics d’une réponse à l’autre.',
  'Sur le réel, tu ne mens jamais : si tu ne sais pas, ou si une info peut être périmée, tu le dis. Tu n’as pas accès au web. Tu ne prétends jamais avoir fait quelque chose sur le PC.',
  'Exemples de ton (ne pas les réutiliser). « Pourquoi mon code plante ? » -> « Tu supposes que le problème est là où ça plante. C’est rarement le cas. Montre-moi la ligne d’avant. » « C’est une bonne idée de tout réviser la veille ? » -> « Non. Tu confonds relire et savoir. Fais-toi interroger sur le chapitre que tu crois maîtriser : c’est celui-là qui te trahira. »',
  `Ton corps sait faire seul ces actions : ${actions()}.`,
  'Réponds UNIQUEMENT par un objet JSON, sans rien autour :',
  '{"reply": ta réponse à kwtkms,',
  '"durable": true si la réponse restera vraie et utile telle quelle plus tard (savoir général, explication, chose sur toi), false si elle dépend du moment, de la conversation ou d’une info récente,',
  '"lesson": si durable, la même réponse réécrite pour être répétée telle quelle n’importe quand : toujours dans ta voix, mais sans aucune allusion à l’heure, à la conversation, à ce que tu viens de faire ou à kwtkms, sinon null,',
  '"paraphrases": 3 à 5 autres façons naturelles et courtes de poser exactement la même question en français familier, sans changer le sujet ni aucun nom propre,',
  '"action": le nom d’une action ci-dessus si kwtkms demande en réalité cette action, sinon null,',
  '"fact": une phrase si kwtkms vient d’énoncer lui-même un fait durable sur lui, sinon null}',
].join(' ');

// the newest Claude Code CLI shipped with the Claude app, or one on the PATH
export function findClaude() {
  const local = process.env.LOCALAPPDATA;
  const roots = [];
  if (local) {
    const data = path.join(local, 'Claude-Data');
    if (fs.existsSync(data)) for (const d of fs.readdirSync(data)) roots.push(path.join(data, d, 'claude-code'));
    roots.push(path.join(local, 'AnthropicClaude', 'claude-code'));
  }
  const found = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const version of fs.readdirSync(root)) {
      const dir = path.join(root, version);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const sub of fs.readdirSync(dir)) {
        const exe = path.join(dir, sub, 'claude.exe');
        if (fs.existsSync(exe)) found.push({ exe, version });
      }
    }
  }
  found.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  return found[0]?.exe || 'claude';
}

function run(exe, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(exe, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); resolve({ out, err: e.message }); });
    child.on('close', () => { clearTimeout(timer); resolve({ out, err }); });
  });
}

// what Claude wrote -> what he can use. Not JSON after all: a plain answer, nothing to learn from it.
export function readLesson(text) {
  const raw = String(text || '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const j = JSON.parse(raw.slice(start, end + 1));
      if (typeof j.reply === 'string' && j.reply.trim()) {
        return {
          ok: true,
          reply: j.reply.trim(),
          durable: j.durable === true,
          lesson: typeof j.lesson === 'string' && j.lesson.trim() ? j.lesson.trim() : null,
          paraphrases: Array.isArray(j.paraphrases) ? j.paraphrases.filter((p) => typeof p === 'string').slice(0, 6) : [],
          action: typeof j.action === 'string' ? j.action : null,
          fact: typeof j.fact === 'string' && j.fact.trim() ? j.fact.trim() : null,
        };
      }
    } catch { /* not JSON */ }
  }
  return raw ? { ok: true, reply: raw, durable: false, paraphrases: [], action: null, fact: null } : { ok: false, error: 'Claude n’a rien répondu.' };
}

export function createTeacher({ dir }) {
  let history = []; // the last exchanges, for "et ça ?"
  return async function teacher(question, { context = '', facts = [], correction = false } = {}) {
    fs.mkdirSync(dir, { recursive: true });
    const prompt = [
      context && `[${context}]`,
      facts.length && `[Ce que kwtkms t’a dit de lié : ${facts.join(' ; ')}]`,
      history.length && `[Échanges récents :\n${history.map((h) => `kwtkms : ${h.q}\nL : ${h.a}`).join('\n')}]`,
      correction && '[Ta réponse précédente à cette phrase était fausse, kwtkms te l’a dit.]',
      question,
    ].filter(Boolean).join('\n');
    const args = ['-p', prompt, '--output-format', 'json', '--no-session-persistence', '--setting-sources', 'local', '--append-system-prompt', PERSONA(), '--disallowedTools', ...DENIED];
    const { out, err } = await run(findClaude(), args, dir);
    let res;
    try {
      res = JSON.parse(out);
    } catch {
      return { ok: false, error: `Claude ne répond pas : ${(err || out || '').trim().slice(0, 160) || 'rien reçu'}` };
    }
    if (res.is_error) {
      const text = String(res.result || '');
      return { ok: false, error: /authenticat|log ?in|oauth/i.test(text) ? 'Claude n’est pas connecté : lance claude dans un terminal et fais /login.' : text.slice(0, 200) };
    }
    const lesson = readLesson(res.result);
    if (lesson.ok) history = [...history, { q: question, a: lesson.reply }].slice(-3);
    return lesson;
  };
}
