# Installer JobScout, pas à pas

Ce guide s'adresse à tout le monde, y compris si vous n'avez jamais ouvert un terminal. Suivez les étapes dans l'ordre : chacune dit ce que vous allez voir et comment savoir que c'est réussi.

## En bref

| | |
|---|---|
| **Temps total** | environ 20 à 35 minutes, dont **10 à 15 minutes devant l'écran** |
| **Ce qu'il faut** | un ordinateur (Windows, macOS ou Linux), une connexion internet, votre CV, une clé API Anthropic |
| **Coût** | logiciel gratuit ; l'IA est facturée par Anthropic sur votre clé, environ **0,12 à 0,20 $ par dossier** (CV + lettre). Le scan et le tri des offres sont gratuits. |
| **Où vont vos données** | profil, offres, documents et candidatures restent sur votre ordinateur (dossier `data/`). Pour rédiger, JobScout envoie votre profil et l'offre à l'API Claude d'Anthropic, avec votre clé. |

## Combien de temps ça prend ?

Durées mesurées le 30/09/2026 sur un PC Windows 11 relié à la fibre. Avec une connexion plus lente, l'étape 3 peut prendre quelques minutes de plus.

| Étape | Durée | Devant l'écran ? |
|---|---|---|
| 1. Installer Node.js | 2 à 5 min | oui (quelques clics) |
| 2. Récupérer JobScout | quelques secondes (Git) à 1 min (ZIP) | oui |
| 3. Installer les dépendances (`npm ci`) | environ 1 min (mesuré : 57 s), jusqu'à 5 min sur une connexion lente | **non**, laissez tourner |
| 4. Premier démarrage (`npm run dev`) | environ 20 s (mesuré : 18 s) | non |
| 5. Premier réglage : clé API, CV, préférences | 5 à 10 min | oui |
| 6. Premier scan des offres | **10 à 20 min** (mesuré : 17 min pour environ 790 offres avec les 6 sources ; LinkedIn en représente à peu près la moitié) | **non**, JobScout travaille seul |

### Faut-il laisser l'ordinateur tourner tout seul ?

- **Pendant l'installation (étape 3) et pendant un scan (étape 6)** : oui, laissez l'ordinateur allumé et **empêchez la mise en veille**. Vous pouvez continuer à l'utiliser normalement pendant ce temps.
- **La fenêtre du terminal où tourne JobScout doit rester ouverte.** La fermer arrête l'application (vos données sont conservées ; il suffit de la relancer, voir « Au quotidien »). Réduire la fenêtre ne pose aucun problème.
- **Si l'ordinateur se met en veille pendant un scan**, le scan s'interrompt : relancez-le simplement depuis la page Offres.
- **Quand JobScout est fermé, rien ne tourne en arrière-plan** : pas de scan automatique, pas de connexion.

## Ce qu'il vous faut

- **Un ordinateur** Windows 10 ou 11, macOS ou Linux, avec 8 Go de mémoire de préférence (4 Go minimum) et **environ 1 Go d'espace disque libre** (plus 265 Mo si vous activez LinkedIn).
- **Node.js 22.13 ou plus récent** : l'étape 1 explique comment l'installer.
- **Une clé API Anthropic.** Créez un compte sur [platform.claude.com](https://platform.claude.com), ajoutez des crédits (paiement à l'usage), puis créez une clé dans « API Keys ». Elle ressemble à `sk-ant-…`. Gardez-la pour l'étape 5 ; ne la partagez avec personne.
- **Votre CV** en PDF, DOCX, TXT ou image.
- **Git** est facultatif : vous pouvez télécharger JobScout en ZIP (étape 2, option B).

## Étape 1 — Installer Node.js

Node.js est le moteur qui fait tourner JobScout.

**Windows et macOS**
1. Allez sur [nodejs.org](https://nodejs.org) et téléchargez la version **LTS** (22 ou 24).
2. Lancez l'installeur et acceptez les choix proposés (« Next » / « Suivant » jusqu'au bout). Inutile de cocher l'option d'outils supplémentaires.

**Linux** : installez Node 22 ou 24 avec le gestionnaire de votre distribution ou avec [nvm](https://github.com/nvm-sh/nvm).

**Vérifier** : ouvrez un **nouveau** terminal (Windows : touche Windows, tapez `PowerShell`, Entrée ; macOS : application Terminal) et tapez :

```bash
node --version
```

C'est réussi si la réponse est `v22.13.0` ou un numéro plus grand (par exemple `v24.13.0`).

## Étape 2 — Récupérer JobScout

**Option A, avec Git** (dans le terminal) :

```bash
git clone https://github.com/latenightsbeats1208-pixel/jobscout.git
cd jobscout
```

**Option B, sans Git**
1. Sur la [page GitHub de JobScout](https://github.com/latenightsbeats1208-pixel/jobscout), cliquez sur le bouton vert **Code**, puis **Download ZIP**.
2. Décompressez le fichier, par exemple dans `Documents`, et renommez le dossier `jobscout`.
3. Ouvrez un terminal **dans ce dossier**. Windows : ouvrez le dossier dans l'Explorateur, cliquez dans la barre d'adresse, tapez `powershell` puis Entrée. macOS : clic droit sur le dossier › Services › Nouveau terminal au dossier.

Pour vérifier que vous êtes au bon endroit, tapez `ls` (ou `dir`) : vous devez voir `package.json` et `README.md`.

## Étape 3 — Installer les dépendances

Toujours dans le dossier `jobscout` :

```bash
npm ci
```

npm télécharge environ 360 paquets. **Laissez tourner** jusqu'au retour de l'invite de commande (environ 1 minute, parfois plus). C'est réussi si la fin affiche une ligne du type `added 361 packages`.

Ces messages sont **normaux** et sans conséquence :

- `npm warn deprecated node-domexception@1.0.0` : une dépendance indirecte obsolète, sans effet.
- `52 packages are looking for funding` : de simples appels aux dons.
- Un message indiquant que le script d'installation de `tesseract.js` a été ignoré ou bloqué (npm récent) : ce script n'affiche qu'un appel aux dons, JobScout n'en a pas besoin.
- `npm notice New major version of npm available` : vous pouvez l'ignorer.

**Ne lancez pas `npm audit fix --force`** : cette commande remplacerait Next.js par une version majeure incompatible et casserait l'application.

## Étape 4 — Lancer JobScout

```bash
npm run dev
```

Attendez la ligne `✓ Ready in …` (une vingtaine de secondes la première fois), puis ouvrez **http://127.0.0.1:3000** dans votre navigateur. Laissez ce terminal ouvert tant que vous utilisez JobScout.

- Le message `ExperimentalWarning: SQLite is an experimental feature` est normal.
- La toute première ouverture d'une page prend quelques secondes (elle se prépare), les suivantes sont instantanées.
- JobScout n'est accessible que depuis votre ordinateur (adresse `127.0.0.1`), jamais depuis le réseau.

**Raccourci Windows** : `scripts\Start-JobScout.ps1` lance le serveur et ouvre le navigateur en une fois :

```bash
powershell -ExecutionPolicy Bypass -File scripts\Start-JobScout.ps1
```

## Étape 5 — Premier réglage (5 à 10 minutes)

L'assistant s'ouvre tout seul, en trois étapes : **Importer**, **Vérifier**, **Préférences**.

1. **Génération IA** : collez votre clé API Anthropic, cliquez sur **Enregistrer** puis **Vérifier**. Elle est enregistrée dans la base locale, sur votre ordinateur.
2. **Importer** : déposez votre CV. L'IA en extrait votre profil (expériences, compétences, langues…). Comptez de quelques secondes à une minute.
3. **Vérifier** : relisez le profil extrait et corrigez ce qui doit l'être. JobScout ne rédigera jamais une compétence absente de ce profil : c'est le moment d'être complet.
4. **Préférences** : pays visés, types de contrat, secteurs, et les sources à scanner.

**LinkedIn (facultatif)** : c'est la seule source qui a besoin d'un petit navigateur intégré. Pour l'activer : **Profil › Sources**, puis **Installer le moteur LinkedIn** (environ 100 Mo à télécharger, 265 Mo sur le disque, 1 à 2 minutes).

## Étape 6 — Premier scan

Page **Offres** › **Lancer un scan**. JobScout interroge chaque source, puis note chaque offre selon votre profil. Ce tri est fait sur votre machine, sans IA ni coût.

- Durée : **10 à 20 minutes** selon le nombre de pays et de sources ; environ deux fois moins sans LinkedIn.
- Vous pouvez utiliser l'ordinateur et même JobScout pendant ce temps. Laissez simplement le terminal ouvert et évitez la mise en veille.
- Une source indisponible (site en panne, protection anti-robot) est signalée dans le journal du scan ; les autres continuent.

Ensuite, sur la fiche d'une offre, **Générer les documents** produit un CV et une lettre d'une page (PDF et Word), dans la langue de l'annonce. C'est la seule étape qui utilise votre clé API (0,12 à 0,20 $ par dossier) ; comptez en général moins de deux minutes.

## Au quotidien

- **Relancer JobScout** : ouvrez un terminal dans le dossier `jobscout`, tapez `npm run dev`, puis ouvrez http://127.0.0.1:3000.
- **Arrêter JobScout** : dans le terminal, `Ctrl + C` (ou fermez la fenêtre).
- **Mettre à jour** : dans le dossier `jobscout`, tapez `git pull` puis `npm ci`. Si vous avez installé par ZIP : téléchargez le nouveau ZIP, décompressez-le, puis **recopiez votre dossier `data`** de l'ancienne version dans la nouvelle avant de lancer `npm ci`.
- **Sauvegarder vos données** : copiez le dossier `data` (base, documents générés).
- **Désinstaller** : supprimez le dossier `jobscout`. Pensez à garder une copie de `data` si vous voulez conserver vos candidatures.

## Problèmes fréquents

| Ce que vous voyez | Solution |
|---|---|
| `node` ou `npm` « n'est pas reconnu » | Fermez et rouvrez le terminal après l'installation de Node.js. Sinon, réinstallez Node.js (étape 1). |
| `EBADENGINE` ou un message sur la version de Node | Votre Node.js est trop ancien : installez la version LTS actuelle (22.13 ou plus). |
| `Port 3000 is in use` | Un autre programme utilise ce port. Lancez `npm run dev -- -p 3001`, puis ouvrez http://127.0.0.1:3001. |
| La page ne s'ouvre pas | Vérifiez que le terminal tourne toujours et affiche `Ready`. Utilisez bien `http://127.0.0.1:3000`. |
| La clé API est refusée | Vérifiez qu'elle est copiée en entier (`sk-ant-…`) et qu'il reste des crédits sur votre compte Anthropic. |
| LinkedIn ne renvoie rien | Installez le moteur LinkedIn (Profil › Sources). Si LinkedIn bloque temporairement, relancez le scan plus tard : les autres sources ne sont pas concernées. |
| `npm audit` signale des vulnérabilités | Ne lancez pas `npm audit fix --force`. Mettez JobScout à jour (`git pull` puis `npm ci`) ; s'il en reste, signalez-le dans une issue GitHub. |

Une question, un bug ? Ouvrez une *issue* sur le [dépôt GitHub](https://github.com/latenightsbeats1208-pixel/jobscout/issues).
