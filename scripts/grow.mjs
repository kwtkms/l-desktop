// Has Claude write what he needs, once, then keeps it here:
//   node scripts/grow.mjs test    test/heldout.json : phrases he never trains on, to measure him
//   node scripts/grow.mjs corpus  src/brain/grown.json : more ways of saying each thing, for training
//   node scripts/grow.mjs seed    src/brain/seed.json : answers in his voice to what a student often asks
//   node scripts/grow.mjs basics  adds the plain "c'est quoi X" of each subject to seed.json
//   node scripts/grow.mjs check   a second read of seed.json: what's wrong or doubtful goes, Claude answers it instead
// Sends only intents and example phrases, nothing about the PC or about you.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { findClaude } from '../src/brain/teacher.mjs';
import { INTENTS, OTHER } from '../src/brain/corpus.mjs';
import { norm } from '../src/brain/text.mjs';

const mode = process.argv[2];
const here = (p) => new URL(`../${p}`, import.meta.url);
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'l-grow-'));
const exe = findClaude();
const DENIED = ['WebSearch', 'WebFetch', 'Bash', 'PowerShell', 'Edit', 'Write', 'NotebookEdit', 'Agent', 'Read', 'Glob', 'Grep'];

function ask(prompt) {
  return new Promise((resolve) => {
    const child = spawn(exe, ['-p', prompt, '--output-format', 'json', '--no-session-persistence', '--setting-sources', 'local', '--disallowedTools', ...DENIED], { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('error', () => resolve(null));
    child.on('close', () => {
      try {
        const text = JSON.parse(out).result;
        resolve(JSON.parse(text.slice(text.search(/[[{]/), Math.max(text.lastIndexOf(']'), text.lastIndexOf('}')) + 1)));
      } catch {
        resolve(null);
      }
    });
  });
}

async function pool(jobs, size = 6) {
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < jobs.length) {
      const i = next++;
      results[i] = await jobs[i]();
      process.stdout.write('.');
    }
  }));
  console.log();
  return results;
}

const intents = Object.entries(INTENTS);
const known = new Set([...intents.flatMap(([, it]) => it.say), ...OTHER].map(norm));
const fresh = (list) => [...new Set((list || []).map(norm))].filter((s) => s && !known.has(s));
const STYLE = 'Français parlé d’un étudiant de 20 ans qui écrit vite au clavier : minuscules, parfois sans accents, parfois abrégé (pk, jsp, stp, pr, tu peux), parfois une faute de frappe.';

if (mode === 'test') {
  const rows = await pool(intents.map(([name, it]) => () => ask(
    `On teste un assistant de bureau. Voici une chose qu’on peut lui dire, illustrée par une seule phrase : « ${it.say[0]} ». Écris 6 façons NOUVELLES et variées, très différentes de cet exemple, de lui dire exactement la même chose. ${STYLE} Réponds uniquement par un tableau JSON de chaînes.`,
  ).then((list) => fresh(list).map((s) => [s, name]))));
  const other = await ask(`Écris 60 vraies questions ou demandes variées qu’un étudiant poserait à une IA générale : cours, code, voyage, conseils, culture générale, idées, rédaction. Certaines doivent contenir des mots comme heure, batterie, musique, son, ram, disque, date, sucre, dormir, écran, sans être des ordres à faire sur le PC (ex : « comment fonctionne une batterie »). ${STYLE} Réponds uniquement par un tableau JSON de chaînes.`);
  const out = [...rows.flat(), ...fresh(other).map((s) => [s, 'claude'])];
  fs.writeFileSync(here('test/heldout.json'), JSON.stringify(out, null, 0));
  console.log(`${out.length} phrases de test`);
} else if (mode === 'corpus') {
  const held = new Set(JSON.parse(fs.readFileSync(here('test/heldout.json'), 'utf8')).map(([s]) => s));
  const clean = (list) => fresh(list).filter((s) => !held.has(s));
  const rows = await pool(intents.map(([name, it]) => () => ask(
    `On entraîne un assistant de bureau à reconnaître ce qu’on lui demande. Exemples d’une même intention : ${it.say.slice(0, 8).map((s) => `« ${s} »`).join(', ')}. Écris 40 autres façons de dire exactement la même chose, variées dans les mots et la tournure, sans jamais changer de sens. ${STYLE} Réponds uniquement par un tableau JSON de chaînes.`,
  ).then((list) => [name, clean(list)])));
  const topics = ['cours d’informatique et code', 'questions pratiques sur la vie, l’argent, la santé', 'voyage et Corée du Sud', 'culture générale et sciences', 'rédaction, mails, avis et conseils', 'questions sur le PC qui ne sont PAS des ordres : comment fonctionne, comment réparer, pourquoi, avec les mots heure, batterie, ram, disque, musique, son, écran, date'];
  const others = await pool(topics.map((t) => () => ask(`Écris 60 vraies questions ou demandes d’étudiant à une IA générale, sur : ${t}. ${STYLE} Réponds uniquement par un tableau JSON de chaînes.`)));
  const grown = Object.fromEntries(rows);
  grown.other = clean(others.flat());
  fs.writeFileSync(here('src/brain/grown.json'), JSON.stringify(grown, null, 0));
  console.log(Object.values(grown).reduce((a, l) => a + l.length, 0), 'phrases apprises');
} else if (mode === 'seed') {
  const persona = 'Tu écris pour L, de Death Note, devenu assistant personnel (pas détective, ne parle ni d’enquête ni de Kira). Il tutoie, poli, pince-sans-rire, précis, remet en doute, signale la faille ou l’idée reçue, dit quand c’est une approximation. Pas de markdown. Trois phrases maximum, sauf pour un exemple de code court. Une allusion au sucre dans au plus une réponse sur six. Jamais d’allusion à l’heure ni à la personne qui pose la question.';
  const topics = ['bases du langage C (pointeurs, malloc, compilation)', 'JavaScript et Node', 'Python', 'algorithmes et complexité', 'réseaux (TCP, UDP, DNS, HTTP)', 'bases de données et SQL', 'Git', 'systèmes d’exploitation', 'électronique et microcontrôleurs', 'mathématiques de prépa et d’école d’ingénieur', 'méthodes de révision et de concentration', 'Corée du Sud : géographie, histoire, culture, politesse, mots coréens utiles (rien de ce qui change vite : ni prix ni visa)', 'sciences générales', 'histoire générale'];
  const rows = await pool(topics.map((t) => () => ask(`${persona}\nÉcris 20 connaissances durables sur le thème : ${t}. Seulement des faits sûrs, qui resteront vrais. Réponds uniquement par un tableau JSON d’objets {"q": [4 façons courtes et familières de poser cette question, sans changer ses mots importants], "a": la réponse}.`)));
  const lessons = rows.flat().filter((r) => r && Array.isArray(r.q) && typeof r.a === 'string').map((r) => ({ q: [...new Set(r.q.map(norm))].filter(Boolean), a: r.a.trim() }));
  fs.writeFileSync(here('src/brain/seed.json'), JSON.stringify({ version: 1, lessons }, null, 0));
  console.log(`${lessons.length} connaissances`);
} else if (mode === 'basics') {
  const persona = 'Tu écris pour L, de Death Note, devenu assistant personnel (pas détective, ne parle ni d’enquête ni de Kira). Il tutoie, poli, pince-sans-rire, précis, dit quand c’est une approximation. Pas de markdown. Trois phrases maximum, une définition claire d’abord. Une allusion au sucre dans au plus une réponse sur six. Jamais d’allusion à l’heure ni à la personne qui pose la question.';
  const topics = ['langage C : segfault, récursivité, struct, pile et tas, débordement de tampon, bibliothèques, makefile, gdb', 'JavaScript : closure, promesse, async, callback, this, DOM, event loop, prototype, TypeScript', 'Python : liste en compréhension, pip, venv, classes, exceptions, modules', 'programmation objet : classe, objet, héritage, polymorphisme, encapsulation, interface', 'structures de données : tableau, liste chaînée, pile, file, arbre, graphe, table de hachage, tas', 'réseaux, les bases : différence TCP et UDP, DNS, adresse IP, masque, routeur, modèle OSI, port, NAT, DHCP, VPN', 'Git, commandes courantes : rebase, merge, clone, pull, push, commit, branche, conflit, tag', 'web : API, REST, JSON, cookie, session, CORS, frontend et backend, serveur, WebSocket', 'sécurité : hachage, chiffrement symétrique et asymétrique, XSS, CSRF, JWT, TLS, phishing, attaque par force brute', 'Linux et terminal : sudo, chmod, grep, pipe, ssh, variables d’environnement, droits, paquets', 'architecture des ordinateurs : processeur, registre, mémoire cache, bus, assembleur, binaire, hexadécimal, complément à deux', 'IA et apprentissage automatique : réseau de neurones, surapprentissage, gradient, jeu de test, régression, classification, LLM', 'maths, les bases : dérivée, intégrale, limite, matrice, déterminant, probabilité, espérance, variance, logarithme, nombre complexe', 'physique et électricité, les bases : tension, courant, puissance, énergie, force, fréquence, effet tunnel, entropie', 'capitales et géographie : les capitales des grands pays du monde (une question par pays), plus grand pays, plus long fleuve, continents', 'culture générale : planètes, grands auteurs, grands inventeurs (téléphone, ampoule, avion), peintres, unités de mesure', 'Corée pratique : mots et phrases utiles en coréen (bonjour, merci, pardon, combien, où est, s’il vous plaît), hangeul, honorifiques, transports en général, sans prix ni règle susceptible de changer', 'français et anglais : accords courants, à et a, ce et se, différence entre mots souvent confondus, present perfect, formules de mail', 'vie d’étudiant : écrire un mail à un prof, faire un plan, citer une source, intérêt composé, budget, CV, ce qui reste vrai partout'];
  const rows = await pool(topics.map((t) => () => ask(`${persona}\nÉcris les 25 connaissances les plus demandées sur le thème : ${t}. Commence par les notions les plus simples, y compris les plus évidentes. Seulement des faits sûrs, qui resteront vrais. Réponds uniquement par un tableau JSON d’objets {"q": [5 façons courtes et familières de poser cette question : « c est quoi X », « X ca sert a quoi », « explique moi X », et une variante abrégée si elle existe, comme js pour javascript ; les noms écrits en lettres, jamais de symboles], "a": la réponse}.`)));
  const seed = JSON.parse(fs.readFileSync(here('src/brain/seed.json'), 'utf8'));
  // the symbols his normalising loses leave questions about nothing ("quelle difference entre et")
  const garbled = (s) => /\b(entre|quoi|expliques) et\b|^ou ca change/.test(s);
  const tidy = (l) => ({ ...l, q: [...new Set(l.q.map(norm))].filter((s) => s && !garbled(s)) });
  const added = rows.flat().filter((r) => r && Array.isArray(r.q) && typeof r.a === 'string').map((r) => ({ q: r.q, a: r.a.trim() }));
  const lessons = [...seed.lessons, ...added].map(tidy).filter((l) => l.q.length >= 2);
  fs.writeFileSync(here('src/brain/seed.json'), JSON.stringify({ version: seed.version + 1, lessons }, null, 0));
  console.log(`${added.length} ajoutées, ${lessons.length} connaissances`);
} else if (mode === 'check') {
  const seed = JSON.parse(fs.readFileSync(here('src/brain/seed.json'), 'utf8'));
  const batches = [];
  for (let i = 0; i < seed.lessons.length; i += 30) batches.push(i);
  const rows = await pool(batches.map((start) => () => {
    const part = seed.lessons.slice(start, start + 30).map((l, k) => ({ id: start + k, q: l.q[0], a: l.a }));
    return ask(`Relis ces questions et réponses en vérificateur sévère. Signale chaque réponse fausse, trompeuse, douteuse, qui ne répond pas à la question, ou qui parle d’enquête, de Kira ou de l’heure. Le ton pince-sans-rire n’est pas un défaut. Réponds uniquement par un tableau JSON d’objets {"id": nombre, "why": raison courte}, vide si tout est juste.\n${JSON.stringify(part)}`).then((r) => (Array.isArray(r) ? { flagged: r } : { failed: start }));
  }));
  const flagged = rows.flatMap((r) => r.flagged || []).filter((f) => Number.isInteger(f?.id) && seed.lessons[f.id]);
  const unread = rows.filter((r) => r.failed !== undefined).map((r) => r.failed);
  for (const f of flagged) console.log(`- ${seed.lessons[f.id].q[0]} : ${f.why}`);
  const gone = new Set(flagged.map((f) => f.id));
  const lessons = seed.lessons.filter((_, i) => !gone.has(i));
  fs.writeFileSync(here('src/brain/seed.json'), JSON.stringify({ version: seed.version + 1, lessons }, null, 0));
  console.log(`${gone.size} retirées, ${lessons.length} gardées, lots non relus : ${unread.length ? unread.join(', ') : 'aucun'}`);
} else {
  console.log('test | corpus | seed | basics | check');
}
fs.rmSync(cwd, { recursive: true, force: true });
