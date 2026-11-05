// A series of sentences that aren't in his corpus, with what should happen. Fake Claude: a sentence that
// "goes to claude" counts as handed over, nothing leaves the PC. Fresh memory on each run.
// Written by the same author as the corpus, so this flatters him: read it as an upper bound.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Mind } from '../src/brain/mind.mjs';
import { norm } from '../src/brain/text.mjs';
import { INTENTS, OTHER } from '../src/brain/corpus.mjs';

const SERIES = [
  ['t as l heure sur toi', 'time'], ['on est quel jour la', 'date'], ['il me reste combien de jus', 'battery'],
  ['ma ram elle en est ou', 'system'], ['reste combien de place sur mon disque', 'disk'], ['le pc tourne depuis longtemps', 'uptime'],
  ['j ai quoi comme rappels', 'reminders'], ['coupe la musique deux secondes', 'play'], ['morceau suivant stp', 'next'],
  ['remets le son d avant', 'prev'], ['c est trop bas monte un peu', 'volUp'], ['baisse le volume c est fort', 'volDown'],
  ['coupe le son', 'mute'], ['montre moi le bureau', 'showDesk'], ['fais une capture', 'shot'],
  ['pile ou face', 'coin'], ['lance un de', 'dice'], ['on joue a pierre feuille ciseaux', 'rps'],
  ['ferme ta bouche un moment', 'quiet'], ['va dormir', 'sleep'], ['reveille toi', 'wake'],
  ['pousse toi de la', 'aside'], ['reviens', 'comeBack'], ['disparais', 'hide'],
  ['mange un sucre', 'sugar'], ['range ta tour', 'tidyUp'], ['tu sais faire quoi au juste', 'help'],
  ['salut toi', 'hello'], ['ca roule', 'howAreYou'], ['merci beaucoup', 'thanks'],
  ['a plus', 'bye'], ['t es qui toi', 'who'], ['tu fais quoi la', 'doing'],
  ['je suis creve', 'tired'], ['je m ennuie grave', 'bored'], ['t es cool', 'nice'],
  ['t es nul', 'rude'], ['raconte une blague', 'joke'], ['pourquoi tu t assois comme ca', 'crouch'],
  ['tu dors jamais', 'sleepTalk'],
  ['combien font 12 fois 12', 'calc'], ['que fait 3 + 4 * 2', 'calc'], ['5 miles en km', 'convert'],
  ['il est quelle heure a seoul', 'timeIn'], ['ouvre discord', 'open'], ['rappelle moi dans 15 min de sortir le chien', 'remind'],
  ['explique moi le theoreme de pythagore', 'claude'], ['c est quoi une closure en javascript', 'claude'],
  ['comment on dit merci en coreen', 'claude'], ['ecris moi un mail pour mon prof', 'claude'],
  ['pourquoi le ciel est bleu', 'claude'], ['qui a invente le telephone', 'claude'],
  ['aide moi a reviser les bases de donnees', 'claude'], ['tu penses quoi de mon projet', 'claude'],
  ['corrige cette phrase je suis aller au cinema', 'claude'], ['donne moi une recette de pates', 'claude'],
  ['quelle est la difference entre tcp et udp', 'claude'], ['je dois choisir quoi comme cours a seoul', 'claude'],
  ['resume moi la revolution francaise', 'claude'], ['pourquoi mon code plante avec une erreur null', 'claude'],
  ['comment marche un reseau de neurones', 'claude'], ['le son d un violon c est quoi physiquement', 'claude'],
  ['c est quoi la batterie d un groupe de rock', 'claude'], ['ca veut dire quoi l heure de pointe', 'claude'],
];

const known = new Set([...Object.values(INTENTS).flatMap((it) => it.say), ...OTHER].map(norm));
const dup = SERIES.filter(([s]) => known.has(norm(s)));
const fresh = SERIES.filter(([s]) => !known.has(norm(s)));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-trial-'));
const m = new Mind({
  dir,
  model: new URL('../model/l-net.bin', import.meta.url),
  teacher: async () => ({ ok: true, reply: '-', durable: false, paraphrases: [], action: null, fact: null }),
});

const tally = { right: 0, checks: 0, handed: 0, wrong: 0, unsafe: 0 };
const fails = [];
for (const [s, want] of fresh) {
  m.pending = null;
  const r = await m.respond(s);
  const got = r.source === 'claude' ? 'claude' : r.intent;
  if (r.confirm && !r.tool) {
    tally.checks++;
    fails.push(`? ${s} -> demande confirmation (attendu ${want}) : ${r.say}`);
  } else if (got === want) tally.right++;
  else if (got === 'claude') {
    tally.handed++;
    fails.push(`C ${s} -> Claude (attendu ${want})`);
  } else {
    tally.wrong++;
    if (want === 'claude') tally.unsafe++;
    fails.push(`X ${s} -> ${got} (attendu ${want})`);
  }
}
fs.rmSync(dir, { recursive: true, force: true });

const orders = fresh.filter(([, w]) => w !== 'claude').length;
console.log(`${fresh.length} phrases inedites (${dup.length} ecartees car deja dans le corpus), dont ${orders} ordres et ${fresh.length - orders} vraies questions`);
console.log(`justes ${tally.right}, confirmation demandee ${tally.checks}, passees a Claude a tort ${tally.handed}, fausses ${tally.wrong} (dont ${tally.unsafe} vraies questions prises pour un ordre)`);
console.log(fails.join('\n'));
