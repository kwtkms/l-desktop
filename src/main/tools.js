'use strict';

// What his mind asks of the PC, and how he says it. Everything here reports what's real: when
// something can't be measured or fails, he says so.

const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pcInfo, pressKey, lockPc, screenClip } = require('./skills');
const { launch } = require('./launch');

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const dateFr = (d, opts) => d.toLocaleString('fr-FR', opts);
const clock = (d) => dateFr(d, { hour: '2-digit', minute: '2-digit' });

function battery() {
  const script = 'Get-CimInstance Win32_Battery | Select-Object -First 1 EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json -Compress';
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 8000 }, (err, out) => {
      if (err) return resolve('Je n’arrive pas à lire la batterie.');
      try {
        const b = JSON.parse(out);
        const plugged = b.BatteryStatus !== 1;
        resolve(`Batterie à ${b.EstimatedChargeRemaining} %, ${plugged ? 'branché' : 'sur batterie'}.`);
      } catch {
        resolve('Je ne vois pas de batterie sur ce PC.');
      }
    });
  });
}

function reminderStore(dir, onDue) {
  const file = path.join(dir, 'reminders.json');
  let list = [];
  try {
    list = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { /* none yet */ }
  const save = () => fs.writeFileSync(file, JSON.stringify(list, null, 1));
  const check = () => {
    const now = Date.now();
    const due = list.filter((r) => r.at <= now);
    if (!due.length) return;
    list = list.filter((r) => r.at > now);
    save();
    for (const r of due) onDue(r);
  };
  setInterval(check, 5000).unref?.();
  setTimeout(check, 3000);
  return {
    add(r) {
      list.push(r);
      list.sort((a, b) => a.at - b.at);
      save();
    },
    clear() {
      list = [];
      save();
    },
    get list() {
      return list;
    },
  };
}

function createTools({ dir, mind, onDue }) {
  const reminders = reminderStore(dir, onDue);
  // his record against you: he's keeping count, obviously
  const scoreFile = path.join(dir, 'score.json');
  let score = { me: 0, you: 0 };
  try {
    score = { ...score, ...JSON.parse(fs.readFileSync(scoreFile, 'utf8')) };
  } catch { /* first game */ }

  const tools = {
    time: () => `Il est ${clock(new Date())}.`,
    date: () => `On est le ${dateFr(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`,
    battery,
    async system() {
      const p = await pcInfo();
      return `Processeur à ${p.cpu} %, ${p.ramUsed} Go de mémoire utilisés sur ${p.ramTotal}.`;
    },
    async disk() {
      const p = await pcInfo();
      return p.diskFree === null ? 'Je n’arrive pas à lire le disque.' : `Il reste ${p.diskFree} Go libres sur ${p.diskTotal} sur C:.`;
    },
    async uptime() {
      const p = await pcInfo();
      const h = Math.floor(p.uptime / 3600);
      return `Le PC tourne depuis ${h ? `${h} h ` : ''}${Math.floor((p.uptime % 3600) / 60)} min.`;
    },
    reminders() {
      const list = reminders.list;
      if (!list.length) return 'Aucun rappel de prévu.';
      return list.map((r) => `${dateFr(new Date(r.at), { weekday: 'short', hour: '2-digit', minute: '2-digit' })} : ${r.what}`).join('\n');
    },
    clearReminders() {
      reminders.clear();
      return 'Rappels effacés.';
    },
    remind({ at, what }) {
      reminders.add({ at, what });
      return `Je te le rappellerai ${dateFr(new Date(at), { weekday: 'long', hour: '2-digit', minute: '2-digit' })}.`;
    },
    async key({ key }) {
      return (await pressKey(key)) ? '' : 'La touche n’est pas passée.';
    },
    async lock() {
      return (await lockPc()) ? '' : 'Je n’ai pas réussi à verrouiller.';
    },
    async shot() {
      return (await screenClip()) ? '' : 'L’outil de capture ne s’ouvre pas.';
    },
    coin: () => `${pick(['Pile', 'Face'])}.`,
    dice: () => `${1 + Math.floor(Math.random() * 6)}.`,
    rps: () => {
      tools.rpsOpen = true;
      return `Pierre, feuille ou ciseaux ? ${score.me + score.you ? `On en est à ${score.me} pour moi, ${score.you} pour toi. ` : ''}Je joue au hasard. Je ne triche pas. Pour l’instant.`;
    },
    async open({ what }) {
      const r = await launch(what);
      return r.ok ? `J’ouvre ${r.what}.` : `Je ne trouve pas « ${what} » : ni raccourci, ni dossier, ni site que je connaisse.`;
    },
    help: () => [
      'Je m’occupe seul de : heure, date, batterie, mémoire, disque, musique, volume, capture, rappels, minuteurs, ouvrir une appli, calculs, conversions, heure à l’étranger.',
      'Le reste, je le demande à Claude et j’essaie de le retenir.',
      '« retiens que… », « oublie… », « quand je dis X tu fais Y », « c’est pas ça », « demande à Claude… ».',
    ].join('\n'),
    stats() {
      const s = mind.stats();
      if (s.share === null) return 'On n’a encore rien échangé. Je n’ai donc aucun chiffre à te donner.';
      return `${s.local} réponses seul, ${s.asked} demandes à Claude, soit ${s.share} % sans lui. Retenu : réponses ${s.lessons}, tournures ${s.learned}, faits ${s.facts}.`;
    },
    known() {
      const { facts } = mind.state;
      return facts.length ? `Tu m’as dit :\n${facts.map((f) => `• ${f.text}`).join('\n')}` : 'Tu ne m’as rien demandé de retenir.';
    },
  };

  // the game he offered
  function rpsTurn(text) {
    if (!tools.rpsOpen) return null;
    const you = String(text).toLowerCase().match(/pierre|feuille|ciseaux/)?.[0];
    tools.rpsOpen = false;
    if (!you) return null;
    const me = pick(['pierre', 'feuille', 'ciseaux']);
    const Me = me[0].toUpperCase() + me.slice(1);
    const beats = { pierre: 'ciseaux', feuille: 'pierre', ciseaux: 'feuille' };
    if (me === you) {
      tools.rpsOpen = true;
      return { say: `${Me} aussi. Égalité, ce qui ne prouve rien. Encore.` };
    }
    const won = beats[me] === you;
    if (won) score.me++;
    else score.you++;
    fs.writeFileSync(scoreFile, JSON.stringify(score));
    const tally = `${score.me} à ${score.you}.`;
    if (won) return { say: `${Me}. J’ai gagné. ${tally} C’était prévisible.` };
    tools.rpsOpen = true;
    return { say: `${Me}. Bien. ${tally} On rejoue : cette fois, c’est le meilleur de ${score.you * 2 + 1}.`, mood: 'sulk' };
  }

  async function run(step) {
    const fn = tools[step.tool];
    if (typeof fn !== 'function') return '';
    try {
      return await fn(step.args || {});
    } catch (e) {
      return `Ça n’a pas marché (${e.message}).`;
    }
  }

  return { run, rpsTurn, reminders };
}

module.exports = { createTools };
