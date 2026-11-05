# L, compagnon de bureau

Une appli Electron où un personnage vit sur l'écran, dans une fenêtre transparente au-dessus des
autres : il marche, s'assoit sur les fenêtres, mange des sucres, réagit à la souris et répond quand
on lui parle.

Les dessins du personnage ne sont pas inclus (voir `assets/l/LISEZ-MOI.md`) : il ne m'appartient pas.
Ce dépôt contient tout le reste.

## Ce qui est intéressant dans le code

- **Son propre petit réseau de neurones, écrit sans aucune bibliothèque** (`src/brain/net.mjs`) :
  features hachées, table d'embedding, une couche tanh, vecteur normalisé. Entraîné sur le PC avec une
  triplet loss par descente de gradient simple (`node scripts/train.mjs`). Il sert à reconnaître ce
  qu'on lui demande, même mal écrit.
- **Mesuré, pas supposé** : `scripts/eval.mjs` met de côté une phrase sur cinq et compare le réseau à
  un simple TF-IDF. Le réseau seul faisait à peine mieux ; le mélange réseau + mots fait nettement
  mieux, c'est donc ce qui est utilisé (`src/brain/mind.mjs`).
- **Il apprend en continu** : quand il ne comprend pas, la question part à un modèle plus gros, et la
  réponse, avec d'autres façons de poser la même question, entre dans sa mémoire et réentraîne son
  réseau. La fois suivante, il n'a plus besoin de demander. Le modèle extérieur n'a ni accès au web
  ni moyen d'agir sur le PC : seules les actions de L, sur une liste fermée, font quelque chose.
- **Jeux** (`src/games/`) : échecs avec indices et quatre niveaux (calcul dans un Web Worker),
  morpion, puissance 4.
- **Bureau Windows** : suivi des fenêtres en PowerShell (`src/main/windows.ps1`) pour qu'il marche et
  s'assoie dessus, touches média, verrouillage. Aucune commande ne prend de texte libre.

## Lancer

```bash
npm install
npm start
```

Raccourcis : Ctrl+Alt+L le ranger, K lui parler, J les jeux, H le faire venir à la souris,
U lui lancer un sucre. Écrire « aide » dans sa bulle liste ce qu'il sait faire.

Tests : `node --test test/chess.test.mjs` (un fichier à la fois).

## Stack

Electron, JavaScript (Node.js, ES modules), HTML / CSS / Canvas, PowerShell.
