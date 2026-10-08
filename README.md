# JobScout

Trouvez des offres d'emploi grâce à un scan multi-plateformes, triez-les avec un score calculé sur votre vrai profil, et générez pour chacune un CV et une lettre de motivation d'une page (compatibles ATS), sans jamais inventer une compétence que vous n'avez pas.

Tout tourne sur votre machine : base SQLite locale, serveur limité à `127.0.0.1`, aucun compte à créer. Seuls sortent les recherches envoyées aux sites d'offres pendant un scan, les lieux envoyés aux services de trajet si vous demandez ce calcul et, si vous utilisez une IA en ligne, les textes transmis au fournisseur que vous avez choisi, plus quelques requêtes techniques ([détail](CONFIDENTIALITE.md)).

> Site et guide de démarrage : **https://latenightsbeats1208-pixel.github.io/jobscout/** · [Installation](INSTALL.md) · [Guide de l'IA](GUIDE-IA.md) · [Conditions d'utilisation](CGU.md) · [Confidentialité](CONFIDENTIALITE.md)
>
> **En vidéo**, moins de 2 minutes chacune : [1. Installation](https://youtu.be/cIh4PSmPlKE) · [2. Mise en place](https://youtu.be/gOMQkcsD6LA) · [3. Utilisation](https://youtu.be/45uLxsWXXLQ)

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript** + **Tailwind**
- **IA au choix** — Anthropic Claude (référence : Opus 4.8 pour la rédaction, Sonnet 5 pour la relecture), OpenAI, Google Gemini, Mistral, DeepSeek, Groq, OpenRouter, Ollama et LM Studio en local, ou tout serveur compatible OpenAI. Deux modèles par fournisseur : un de **rédaction** (extraction du CV, CV, lettre, message V.I.E) et un de **relecture** (relecture, traduction anglaise, réparation ciblée de la lettre). Couche commune : `lib/ai/llm.ts` ; catalogue : `lib/ai/providers.ts`.
- **Tests** : Vitest (`npm test`) et intégration continue GitHub Actions (types, tests, build sur Windows et Linux, Node 22 et 24)
- **SQLite** intégré (`node:sqlite`, WAL) + fichiers locaux
- **Scraping** : `fetch` + parsing DOM (`jsdom`) + JSON-LD `JobPosting` ; Playwright uniquement pour LinkedIn
- **@react-pdf/renderer** + **docx** pour les documents générés ; **xlsx** pour l'import/export des candidatures

## Installation

> **Première installation ? Suivez le [guide pas à pas](INSTALL.md)** : prérequis, durée de chaque étape (mesurée), messages normaux, ordinateur à laisser allumé ou non, problèmes fréquents.
>
> En vidéo : [installation](https://youtu.be/cIh4PSmPlKE) · [mise en place](https://youtu.be/gOMQkcsD6LA) · [utilisation](https://youtu.be/45uLxsWXXLQ).
>
> En résumé : **environ 10 à 20 minutes au total avec les réglages par défaut (jusqu'à 35 si vous activez d'autres sources), dont 10 à 15 devant l'écran**. `npm ci` prend environ 1 minute ; le premier scan dure 1 à 3 minutes avec France Travail seule, 10 à 20 minutes avec toutes les sources. Pendant ce temps, l'ordinateur doit rester allumé (hors veille), le terminal ouvert.

Requiert **Node ≥ 22.13** (module `node:sqlite` sans drapeau expérimental ; Node 24 convient). Au démarrage, Node affiche `ExperimentalWarning: SQLite is an experimental feature` : c'est normal et sans effet.

```bash
git clone https://github.com/latenightsbeats1208-pixel/jobscout.git
cd jobscout
npm ci
npm run dev
```

L'app démarre sur http://127.0.0.1:3000 (écoute limitée à la machine locale, rien n'est exposé au réseau). Sous Windows, `scripts/Start-JobScout.ps1` lance le serveur de développement et ouvre le navigateur.

**IA à configurer dès l'inscription** : l'onboarding lit votre CV avec un modèle d'IA pour créer le profil. Pas à pas, pour une clé payante ou une IA gratuite en local (Ollama, LM Studio) : [guide de l'IA](GUIDE-IA.md). Dans l'écran « Génération IA », choisissez votre fournisseur et collez votre clé :

| Fournisseur | Clé | Remarque |
|---|---|---|
| Anthropic (Claude) | https://platform.claude.com | référence de JobScout, meilleure fidélité au profil ; les modèles récents qui refusent l'appel d'outil forcé (Opus 5.5, Sonnet 5.5) passent d'eux-mêmes en mode « auto » |
| OpenAI | https://platform.openai.com/api-keys | GPT-6 Sol / Luna, raisonnement coupé (requis pour les réponses structurées en Chat Completions) |
| Google Gemini | https://aistudio.google.com/apikey | offre gratuite limitée |
| Mistral | https://console.mistral.ai/api-keys | fournisseur européen |
| DeepSeek | https://platform.deepseek.com/api_keys | très économique ; mode « thinking » coupé (requis pour l'appel d'outil forcé) |
| Groq, OpenRouter | console du fournisseur | Groq : offre gratuite très limitée (≈ 8 000 jetons/min) ; OpenRouter : une clé pour des centaines de modèles |
| Ollama, LM Studio | aucune clé | 100 % local et gratuit ; qualité selon le modèle (par exemple `gemma4:12b`, `qwen3.5:9b`, `ministral-3:14b`) ; réponse contrainte par le schéma JSON, ces serveurs ne sachant pas forcer un appel d'outil |
| Autre | selon le serveur | tout serveur au format OpenAI Chat Completions (URL de base à indiquer) |

« Charger la liste » propose les modèles disponibles chez le fournisseur, « Vérifier » teste la connexion. Les clés restent dans la base locale, enregistrées en clair (non chiffrées) : protégez l'accès à votre ordinateur. Une adresse de serveur doit être en `https://`, sauf serveur sur la machine même (`http://127.0.0.1…`). Mode développement : une `ANTHROPIC_API_KEY` dans `.env` sert de repli si rien n'est configuré.

**LinkedIn (optionnel)** : c'est la seule source qui a besoin d'un navigateur Chromium. Activez-la dans Profil › Recherche › Sources, puis cliquez « Installer le moteur LinkedIn » (~100 Mo à télécharger, ~265 Mo sur le disque). En ligne de commande : `npm run playwright:install`.

**Mises à jour** : arrêtez JobScout (`Ctrl + C`), puis `git pull` et `npm ci`.

**Messages npm normaux** : `npm warn deprecated node-domexception`, « packages are looking for funding », et, avec npm récent, le script d'installation de `tesseract.js` ignoré (il n'affiche qu'un appel aux dons). `npm audit --omit=dev`, qui ne regarde que ce qui tourne réellement, doit afficher `found 0 vulnerabilities` (le PostCSS embarqué par Next.js est forcé en version corrigée via `overrides`). `npm audit` complet signale des failles dans des outils de développement (Tailwind CSS et ses dépendances), sans effet sur l'application. **Ne lancez jamais `npm audit fix --force`** : il installerait Tailwind CSS 4, incompatible.

## Paquet Windows

`npm run package` produit `installer/output/JobScout_Setup_v<version>.exe` : un installeur autonome (Node 22 LTS embarqué, aucune dépendance sur la machine cible), avec launcher natif, données sous `%LOCALAPPDATA%\JobScout` et contrôle anti-fuite de données personnelles bloquant. Voir [`installer/README.md`](installer/README.md).

## Sources de scan

| Source | Méthode | Périmètre | Par défaut |
|--------|---------|-----------|------------|
| France Travail | API officielle si `FT_CLIENT_ID` / `FT_CLIENT_SECRET` sont définis (https://francetravail.io), sinon HTML SSR | France | cochée |
| Welcome to the Jungle | Index de recherche Algolia du site, avec la clé de recherche de son interface (lecture seule, aucune page HTML) | International (filtré par pays cibles) | à activer vous-même |
| HelloWork | HTML SSR + JSON-LD | France | à activer vous-même |
| Talent.com | HTML SSR multi-domaines + JSON-LD | France, Belgique, Suisse, Luxembourg, Canada, USA, Maroc, Tunisie, Sénégal | à activer vous-même |
| jobup.ch | État JSON des pages de résultats + JSON-LD (groupe JobCloud) | Suisse (surtout romande) | à activer vous-même |
| jobs.ch | Idem jobup.ch ; une offre déjà complète sur jobup.ch n'est pas reprise | Suisse | à activer vous-même |
| Indeed Suisse (indeed.ch) | Scan suspendu ; lien de recherche manuelle dans Offres | Suisse | suspendue |
| Job-Room (SECO, travail.swiss / arbeit.swiss) | Interface JSON de la recherche publique du site ; annonces reprises de jobup.ch / jobs.ch déjà complètes écartées | Suisse | à activer vous-même |
| LinkedIn | Playwright (pages publiques « guest ») | International (tous pays cibles) | à activer vous-même, moteur à installer |
| APEC | — | France (cadres) | **suspendue** : le site bloque désormais les requêtes automatiques |
| Civiweb (V.I.E) | — | International | **suspendue** : Business France exige désormais une authentification que JobScout ne gère pas |

**Avant d'activer une source, lisez les [conditions d'utilisation](CGU.md) (sections 5 et 6)** : les conditions de Welcome to the Jungle, HelloWork, Talent.com, jobup.ch, jobs.ch, Indeed et LinkedIn interdisent l'extraction automatisée sans autorisation ; Job-Room demande de ne pas explorer ses annonces. C'est pourquoi, depuis la 3.4.13, seule France Travail est cochée d'office. Chaque source s'active ou se désactive dans Profil › Recherche › Sources (ou à l'étape Préférences de l'onboarding). Une source suspendue n'est jamais interrogée, même si elle est restée cochée dans un ancien profil. Une source hors périmètre géographique (ex. HelloWork quand le profil ne cible pas la France, jobup.ch quand il ne cible pas la Suisse) est automatiquement sautée. La disponibilité des sources dépend des sites tiers (anti-bot, changements d'API) ; une source en échec est signalée dans le journal du scan.

**Indeed Suisse** : la récupération des fiches complètes reste bloquée, y compris lors des essais avec Bright Data. Le scan est donc suspendu et ignoré même dans un ancien profil. Dans **Offres › Rechercher sur Indeed Suisse**, un lien ouvre la recherche par mots-clés et ville dans votre navigateur ; il ne rapatrie pas les offres dans JobScout. Le scraper est conservé pour de futurs diagnostics, décrits dans [le guide des tests réels](tests/live/README.md).

WTTJ est interrogée avec la clé de recherche (lecture seule) qu'utilise l'interface du site. Si elle cesse de fonctionner, décochez la source.

### Relais Bright Data (optionnel)

Dans **Profil › Paramètres et données › Proxy de recherche Bright Data**, renseignez une clé API et une zone **Web Unlocker API**, choisissez les sources à relayer et le plafond d'appels par source et par scan (20 par défaut, de 1 à 100). Le relais reste désactivé par défaut. L'enregistrement et la lecture des paramètres ne déclenchent aucun appel externe ; **Tester la connexion** en effectue un.

- **Seulement en cas de blocage** : accès direct d'abord ; un HTTP 403/429 ou une page de vérification déclenche le relais. Les autres pages de cette source utilisent ensuite le relais pendant ce scan.
- **Toujours** : toutes les pages publiques des sources choisies utilisent le relais.
- Sources configurables : jobup.ch, jobs.ch, HelloWork, Talent.com et les pages publiques de France Travail. Les API authentifiées, Job-Room et LinkedIn restent directs. Indeed Suisse est absent de ce réglage tant que son scan est suspendu. Cocher une source ici ne l'active pas dans les scans : choisissez aussi vos sources de recherche dans le profil.

Les appels passent par l'[API REST officielle](https://docs.brightdata.com/products/web-unlocker/send-your-first-request), sans modifier les certificats TLS. Bright Data reçoit la clé, la zone et l'URL publique avec ses mots-clés ; le profil et le CV ne sont pas envoyés. Les appels peuvent être facturés selon votre contrat. Une erreur du relais ou le plafond atteint cesse les appels pour cette source pendant le scan. Un HTTP 407 avec `ip_forbidden` indique que l'IP de votre PC doit être autorisée dans le compte Bright Data. La clé se conserve dans la base locale, en clair comme les clés IA, ou dans `.env.local` via `BRIGHTDATA_API_KEY` ; `BRIGHTDATA_ZONE` préremplit la zone. Elle n'est jamais renvoyée par l'API des paramètres. Le relais ne garantit pas la disponibilité des sites et ne remplace pas leurs autorisations d'accès.

En cas d'erreur du service, JobScout affiche une explication et cesse les appels suivants de cette source pendant le scan. Le relais peut prendre jusqu'à 180 secondes par requête. Les détails techniques et le test réel optionnel sont regroupés dans [le guide des tests réels](tests/live/README.md) ; ils ne sont pas nécessaires pour utiliser l'application.

## Scoring des offres (local, déterministe, gratuit)

`lib/scoring/local.ts` — critères exposés dans le détail de chaque offre :

- **Secteur** (30 %) — titre et description comparés aux secteurs cibles du profil
- **Compétences** (50 %) — une compétence ancrée dans une expérience pèse davantage qu'une compétence simplement listée
- **Pays** (20 %) — 100 si le pays de l'offre fait partie des pays cibles, 0 sinon ; neutre si l'offre n'a pas de pays ou si aucun pays cible n'est déclaré
- **Contrat** (±10) — selon les contrats recherchés du profil (`preferred_contracts`, par défaut CDI et CDD) : +10 si le contrat de l'offre en fait partie, neutre s'il est inconnu, −6 s'il est identifié mais non recherché
- **Bonus Langue** (jusqu'à +8) — +8 si l'offre est rédigée dans une langue maîtrisée (B2+) ; +2,4 si elle n'est pas en anglais mais que l'utilisateur maîtrise l'anglais
- **Bonus Durée V.I.E** (jusqu'à +5, V.I.E uniquement) — +5 pour 12–24 mois, +3 pour 6–11 mois
- **Taux d'activité** (+4 / −8) — si le profil indique une fourchette souhaitée (ex. 80–100 %) : +4 si le taux de l'offre la recoupe, −8 sinon ; neutre si l'offre n'indique pas de taux. Taux lu dans le contrat, le titre, ou la description après un mot-clé (« taux d'activité », « Pensum »…)

Aucun appel IA : instantané et illimité. Les offres déjà en base sont re-scorées à chaque enregistrement du profil (et via `POST /api/offres/rescore`).

## Marché suisse

Quand la Suisse fait partie des pays cibles, le profil propose deux réglages facultatifs (Profil › Recherche, ou l'étape Préférences de l'onboarding) :

- **Statut de travail** (nationalité suisse, permis C, B, G frontalier, frontalier ou résident UE/AELE à venir) : pour une offre en Suisse, il est demandé au dernier paragraphe de la lettre et suit la ville dans l'en-tête du CV (« Permis G (frontalier) »). Les consignes utilisent le lieu déclaré du candidat sans inventer son pays de résidence ni son rythme de déplacement. Pour un frontalier, un garde-fou retire les phrases explicites de déménagement et rejette une réparation de mobilité qui en réintroduit ; une relecture humaine reste nécessaire.
- **Taux d'activité souhaité** : critère du score (ci-dessus). Le taux de l'offre s'affiche aussi sur sa fiche.

Les contrats suisses et alémaniques (« durée indéterminée », Festanstellung, befristet, Praktikum, Lehrstelle…) sont reconnus, et le salaire publié (CHF ou autre devise, par an ou par mois) s'affiche sur la fiche de l'offre.

Le contrat explicite de la source prime sur les prérequis de la description. Les pourcentages de télétravail sont exclus du taux d'activité. Le salaire utilise un séparateur de milliers stable, indépendant des locales du système. Les taux souhaités peuvent être choisis à l'unité et sont validés de la même façon à l'enregistrement et à la lecture.

Une recherche en erreur est signalée dans le journal du scan. Une offre en échec ou partielle peut être récupérée depuis une autre source ; si la fiche détaillée Job-Room est indisponible, l'extrait de recherche est conservé avec un statut incomplet.

Une erreur de recherche sur un secteur n'empêche pas d'essayer les secteurs suivants, même si aucune offre n'a encore été récupérée. JobCloud, Job-Room et Welcome to the Jungle ne déclarent une panne totale qu'après l'échec de toutes leurs recherches ; une erreur réseau de l'API France Travail permet aussi de poursuivre les autres secteurs.

### Langues, cantons et trajets pour les frontaliers

- **Langues réellement demandées** : l'aperçu et la fiche séparent la langue de rédaction des demandes explicites en français, allemand, anglais et italien. Les obligations et les atouts sont distingués, avec l'extrait justificatif et les écarts par rapport aux langues de votre profil actuel. « Français ou allemand » est une alternative ; « français et allemand » demande les deux. La détection est indicative : absence de demande détectée ne signifie pas absence d'exigence. Les niveaux CECR sont comparés directement ; « professionnel » et « courant » sont rapprochés approximativement de B2 et C1. Un niveau manquant ou des niveaux différents dans une alternative restent à confirmer. Le bonus du score pour la langue du texte garde son fonctionnement.
- **Canton et ville** : les filtres de la liste se combinent et portent sur le lieu de l'offre, indépendamment de la présence sur site. Les 26 cantons sont disponibles, dont Genève, Vaud, Neuchâtel, Jura, Bâle-Ville et Bâle-Campagne. Les régions structurées des sources sont prioritaires ; les anciennes offres utilisent les codes explicites et un catalogue de villes reconnues. Un canton inconnu n'est pas deviné et est exclu quand un canton est sélectionné. La ville accepte une recherche sans accents et des équivalents usuels comme Genf/Genève et Basel/Bâle.
- **Trajet maximal en voiture** : ouvrez le panneau correspondant, saisissez une commune française (avec son code postal si nécessaire), une durée maximale aller de 1 à 240 minutes, acceptez l'envoi des lieux puis lancez le calcul. Photon géocode les communes et OSRM calcule un itinéraire routier réel. L'estimation va de centre de commune à centre de ville, sans trafic, stationnement ni attente à la frontière ; elle ne remplace pas un essai aux horaires de travail. Les transports publics ne sont pas inclus.

Le calcul traite jusqu'à 12 villes suisses par demande, selon le canton et la ville sélectionnés ; relancez pour compléter les villes restantes. Les appels sont séquentiels et temporisés. Les recherches ordinaires lisent uniquement le cache local et ne contactent aucun service de carte. Les estimations sont réutilisées pendant 7 jours, les géocodages pendant 30 jours et les échecs pendant une heure pour permettre la poursuite des lots suivants. Ces durées sont des limites de réutilisation, pas une suppression automatique des données.

Les lieux suisses composés comme « Geneva, Geneva, Switzerland » ou « Lausanne, Vaud, Suisse » sont découpés en ville, canton et pays. Les destinations « 1003 Lausanne » et « Biel/Bienne » sont reconnues ; le NPA suisse est retiré pour viser le centre de ville, et les variantes d'une même ville partagent le cache. Le code postal de la commune française de départ reste vérifié pour éviter les homonymes. Une localisation contradictoire ou plusieurs villes distinctes ne produisent pas de trajet. Cette normalisation est limitée aux offres suisses ; les lieux des offres françaises restent tels que les sources les publient.

Les pays ciblés du profil limitent automatiquement les résultats, les choix de pays, les API et les suggestions de l'accueil : un profil France uniquement voit les offres françaises, un profil Suisse uniquement les offres suisses, et un profil France + Suisse les deux. Un filtre de pays ou de ville peut réduire ce périmètre, sans l'élargir. Les offres dont le pays est inconnu sont exclues lorsqu'un périmètre est défini. Sans pays cible, toutes les destinations restent disponibles. Les offres enregistrées et les candidatures historiques sont conservées ; changer les pays ciblés modifie immédiatement les résultats sans nouveau scan.

Les commandes de canton et de trajet sont masquées pour un profil qui ne cible pas la Suisse et lorsque le filtre de pays sélectionne un autre pays. Le filtre de ville reste disponible pour tous les pays et recherche des mots complets : « Bern » reconnaît « Berne », sans sélectionner « Berneck ». Le filtre de trajet s'applique seulement aux offres suisses ; pour un profil mixte, il ne masque pas les offres françaises ou celles des autres pays ciblés.

Une commune ambiguë, un lieu multiple ou une panne reste un **trajet inconnu**, sans durée inventée. Ces offres restent visibles par défaut ; décochez « Conserver les offres dont le trajet est inconnu » pour ne conserver, parmi les offres suisses, que celles dont la durée calculée respecte votre maximum. Les offres des autres pays ne sont pas affectées. Les services publics [Photon](https://photon.komoot.io) et [OSRM](https://project-osrm.org) utilisent les données [OpenStreetMap](https://www.openstreetmap.org/copyright), sans garantie de disponibilité. Leur accès doit être autorisé par votre connexion réseau (`photon.komoot.io`, `router.project-osrm.org`). Voir les données transmises dans [CONFIDENTIALITE.md](CONFIDENTIALITE.md).

## Extraction du CV

Cascade selon le type de fichier : PDF (`pdf-parse` ou `pdfjs-dist` multi-colonnes, meilleur retenu), DOCX (`mammoth`), image (`tesseract.js` FR+EN), TXT. Les modèles de reconnaissance d'image (FR, EN) sont téléchargés une fois depuis `cdn.jsdelivr.net`. Puis extraction structurée par le fournisseur d'IA choisi (appel d'outil forcé, ou réponse JSON contrainte selon le fournisseur), validation Zod, score de confiance et **garde-fou anti-hallucination** (suppression des entreprises et compétences non ancrées dans le profil).

## Génération de documents

`data/documents/…` — CV et lettre en PDF **et** DOCX, avec une boucle de rétrécissement qui garantit une page A4. Langue détectée par offre (français, ou anglais si l'annonce est en anglais). Relecture automatique : orthographe, affirmations non étayées par le profil. Message court (V.I.E) réservé aux offres V.I.E.

Coût : avec Claude (Anthropic), environ 0,12 à 0,20 $ par dossier (CV + lettre, relecture comprise) aux tarifs actuels, selon la longueur du profil et de l'offre. Avec un autre fournisseur, le coût suit ses tarifs ; en local (Ollama, LM Studio), il est nul. Le nombre de jetons de chaque appel est écrit dans le journal du serveur (`[llm] …`).

**Qualité selon le modèle** : les garde-fous anti-invention (validation contre le profil, limites de mise en page) s'appliquent quel que soit le modèle. Mais JobScout a été mis au point avec Claude : avec un autre modèle, relisez vos premiers documents. Si un modèle renvoie une réponse mal formée, JobScout tente un repli (mode JSON, extraction tolérante) avant d'afficher une erreur qui invite à choisir un modèle plus capable.

## Sécurité

- Serveur limité à `127.0.0.1` ; l'API refuse les requêtes venant d'un autre site ou d'un hôte non local (`middleware.ts`)
- Clés IA stockées en clair dans la base locale, jamais renvoyées au navigateur (seuls les 4 derniers caractères sont affichés)
- Aucune télémétrie : JobScout n'envoie rien à son éditeur, et les scripts de lancement (`npm run dev`, `npm run build`) coupent celle de Next.js (`scripts/next.mjs`) — voir [Confidentialité](CONFIDENTIALITE.md)
- Whitelist de colonnes sur la mise à jour des candidatures (anti mass-assignment)
- Bornage des chemins d'écriture du dossier documents ; ouverture de dossier restreinte au dossier configuré
- Descriptions d'offres assainies (DOMPurify) ; `rel="noopener noreferrer"` sur tous les liens sortants

## Modes IA

JobScout est gratuit (licence MIT), sans compte ni abonnement. Modes IA (`lib/ai/client.ts`) : `byok` (votre clé ou votre modèle local, fournisseur au choix) ; `unset` (rien de configuré : l'onboarding reste bloqué à l'import du CV). Le code contient aussi un mode `pack` (relais défini par `JOBSCOUT_PROXY_URL`) : il est inactif dans cette version, aucun relais n'étant configuré.

## Tests

```bash
npm test            # tests automatiques (Vitest) : couche IA, fournisseurs, configuration, génération de bout en bout
npm run typecheck   # vérification des types
```

Les tests n'utilisent ni clé ni réseau : un faux serveur compatible OpenAI rejoue la génération complète (prompts, validation anti-invention, relecture). GitHub Actions les lance à chaque push et pull request (`.github/workflows/ci.yml`).

Test réel optionnel avec votre propre fournisseur (appels facturés par lui, quelques centimes) :

```bash
JOBSCOUT_LIVE=1 JOBSCOUT_LIVE_PROVIDER=openai JOBSCOUT_LIVE_KEY=sk-... npx vitest run tests/live
```

## Licence

MIT — voir [`LICENSE`](LICENSE). Les marques des sites scannés appartiennent à leurs propriétaires ; JobScout n'est affilié à aucun d'eux.

Utilisation : [conditions générales d'utilisation](CGU.md). Données personnelles : [politique de confidentialité](CONFIDENTIALITE.md).
