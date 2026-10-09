# Tests réels et diagnostic des sources

Les tests ordinaires (`npm test`) utilisent des réponses simulées et des bases temporaires. Les tests de ce dossier ne contactent les services externes qu'avec une activation explicite ; ils peuvent entraîner des frais et ne font pas partie de la recette CI hors ligne.

## Indeed Suisse avec Playwright (diagnostic du 9 octobre 2026)

### Faisabilité et approche

Le module LinkedIn est `lib/scrapers/linkedin.ts`, en TypeScript/Node.js. Il utilise
`newContext()` dans `lib/scrapers/base.ts` : Chromium headless, contexte neuf,
locale française et viewport 1366 × 900. La version verrouillée de Playwright est
1.59.1. Le moteur se gère dans `lib/scrapers/browser-engine.ts`.

Le diagnostic réel utilise désormais `openIndeedDiagnosticBrowser()` : Google
Chrome installé sur le poste, en mode visible, avec son user-agent natif et un
contexte neuf `fr-CH`. Il n'utilise pas le profil personnel de Chrome. Le mode
headless de LinkedIn et son fonctionnement restent inchangés. Une session
graphique et Google Chrome installé sont nécessaires pour ce test réel.

Contrairement au transport HTTP du scraper Indeed, Playwright exécute le
JavaScript de la page. Il peut donc récupérer une description injectée après
le chargement initial. Il ne garantit pas l'accès : un navigateur automatisé
avec un contexte neuf peut être refusé alors qu'un navigateur utilisateur
affiche la même URL (session, environnement et accès différents).

`lib/scrapers/indeed-browser.ts` ajoute `probeIndeedDetail(page, url)` pour une
fiche publique suisse. Il suit l'approche de LinkedIn : `page.goto` avec
`domcontentloaded`, puis lecture du DOM. L'attente est conditionnée par le
contenu plutôt que par une pause fixe. Trois sélecteurs sont reconnus :
`#jobDescriptionText`, `[data-testid='jobDescriptionText']` et
`.simple-job-description-html`. Le JSON-LD `JobPosting` sert de repli lorsque
la structure visuelle change. La description affichée est prioritaire sur un
extrait JSON-LD, et le parseur Indeed existant extrait ensuite titre,
entreprise, lieu, contrat, salaire et date quand ils sont présents.

Le diagnostic exige une description d'au moins 100 caractères, un titre et une
entreprise pour retourner `ok`. Ce seuil évite de valider un court extrait ; il
ne garantit pas à lui seul que le site a publié tout le texte du poste. Les
blocs masqués ne suffisent pas à déclencher la lecture. Aucun repli vers le texte
global de la page n'est utilisé.

Les résultats distinguent `blocked`, `expired`, `timeout`, `navigation_error`,
`http_error`, `missing_description`, `incomplete` et `outside_switzerland`.
La navigation est bornée à 30 s, l'attente du contenu à 15 s et le test réel
ferme la page au bout de 60 s. Une URL hors `https://ch.indeed.com/viewjob?jk=…`
est refusée avant navigation. Il n'y a ni retry, proxy Bright Data, session
personnelle, connexion à un compte ou résolution de captcha.

### Rejouer le test

Installez Google Chrome pour le test réel et le moteur Chromium pour les
fixtures locales. Une fenêtre Chrome temporaire sera ouverte puis fermée.
Pour le dossier de développement,
sous PowerShell :

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) 'data/browsers'
npx playwright install chromium --only-shell
$env:JOBSCOUT_LIVE = '1'
$env:JOBSCOUT_INDEED_BROWSER = '1'
# Facultatif : omettez cette variable pour tester uniquement les fixtures locales.
$env:JOBSCOUT_INDEED_URL = 'https://ch.indeed.com/viewjob?jk=0f4b81843b423ef2'
try {
  npx vitest run tests/live/indeed-browser.test.ts
} finally {
  Remove-Item Env:JOBSCOUT_LIVE, Env:JOBSCOUT_INDEED_BROWSER, Env:PLAYWRIGHT_BROWSERS_PATH
  Remove-Item Env:JOBSCOUT_INDEED_URL -ErrorAction SilentlyContinue
}
```

Utilisez une fiche encore active pour une nouvelle évaluation. Neuf fixtures
navigateur interceptent tous les accès réseau : injection JavaScript retardée,
anciens/nouveaux sélecteurs, JSON-LD, changement de structure, description masquée,
extrait court, protection HTTP 200, offre expirée et priorité de la description
affichée sur un extrait JSON-LD. Les tests ordinaires
`tests/indeed-browser.test.ts` vérifient aussi les HTTP 401/403/429, 404/410,
500/502, les URL interdites, redirections et délais de navigation sans Chromium.

Pour une fiche réelle, `test-results/indeed-browser/result.json` conserve le
statut, le code HTTP, la durée et les métadonnées de l'offre si elle est récupérée.
Une capture `page.png` est également enregistrée. Ces fichiers sont ignorés par
Git. Un refus distant fait échouer le test de récupération complète : il n'est
pas transformé en succès ou en test ignoré.

### Résultat mesuré

Le navigateur charge correctement une page de contrôle (`example.com`). Sur
la fiche `jk=0f4b81843b423ef2`, le contexte headless de LinkedIn a reçu HTTP 401,
et Chromium headless 147 avec son user-agent natif a reçu HTTP 403 avec une
page « Requête bloquée ». Cela distingue le refus d'Indeed d'une panne de
lancement ou d'exécution JavaScript du navigateur.

Google Chrome 154 installé, en mode visible et sans user-agent personnalisé,
a ensuite reçu **HTTP 200**. Le test principal récupère « IT Support » chez
« Cantor Fitzgerald » à Genève, canton GE, contrat FULL_TIME et les 339
caractères de la description affichée dans `.simple-job-description-html`.
La lecture a réussi lors de plusieurs navigations indépendantes avec des
contextes neufs, sans connexion à un compte ni intervention sur un captcha.
Les neuf fixtures et le test réel passent. Cette validation porte sur cette
fiche et ce poste Windows ; elle ne valide pas la recherche Indeed, les autres
fiches, les autres systèmes ou le mode headless. L'accès du site peut changer.

Le diagnostic ne modifie pas les paramètres ni la base. La source est désormais
disponible sur activation explicite : le scan utilise Chrome visible sans proxy,
conserve les cartes en cas de refus des fiches et signale leurs descriptions
incomplètes. Chrome installé et une session graphique locale sont requis.
Le test du scan réel avec une limite d'une offre a conservé « IT Support » chez
Cantor Fitzgerald, malgré le HTTP 401 de la fiche : description `failed`, erreur
explicite, scan terminé. Cela valide la conservation des résultats de recherche,
pas la récupération de la description. Pour le rejouer, utiliser
`JOBSCOUT_INDEED_SCAN=1` avec `JOBSCOUT_LIVE=1` et lancer uniquement
`tests/live/indeed-search.test.ts`.

## Recherche Indeed sans proxy (9 octobre 2026)

Le diagnostic `indeed-search.test.ts` compare deux transports sans appeler
`sourceFetch` ni Bright Data. Il ne modifie pas les paramètres ou la base.
Pour `informatique` / `Suisse`, les résultats mesurés sont :

| Étape | Transport | Résultat |
| --- | --- | --- |
| Recherche | HTTP direct (`fetch`) | HTTP 403, « Security Check », aucune offre |
| Recherche | Chrome visible, Playwright, contexte neuf | HTTP 200, 15 offres, pagination détectée |
| Première fiche trouvée | Même contexte Chrome, nouvel onglet | HTTP 401, accès refusé |

La recherche fonctionne donc sans proxy **dans Chrome**, mais pas avec le
transport HTTP direct actuel. Le succès antérieur de la fiche isolée ne garantit
pas le succès après une recherche. Aucun nouvel essai automatique n'est effectué
après le refus. Ce résultat ne valide pas une chaîne complète de collecte.

Pour rejouer uniquement la recherche Chrome suivie d'une fiche :

```powershell
$env:JOBSCOUT_LIVE = '1'
$env:JOBSCOUT_INDEED_SEARCH_BROWSER = '1'
try {
  npx vitest run tests/live/indeed-search.test.ts
} finally {
  Remove-Item Env:JOBSCOUT_LIVE, Env:JOBSCOUT_INDEED_SEARCH_BROWSER
}
```

Pour tester plutôt l'hypothèse HTTP direct puis fiche Chrome, remplacer
`JOBSCOUT_INDEED_SEARCH_BROWSER` par `JOBSCOUT_INDEED_SEARCH`. Les rapports,
le HTML et la capture sont enregistrés dans `test-results/indeed-search`, ignoré
par Git. Ces tests exigent des offres puis une description exploitable : un
blocage distant fait échouer le test, il n'est pas assimilé à un succès.

### Architecture du scan disponible

La recherche utilise Chrome sans proxy, avec un contexte temporaire par scan,
pagination bornée et déduplication des identifiants. Les fiches sont ensuite
traitées séquentiellement dans ce contexte. Dès un blocage, les cartes restantes
sont conservées sans nouvel appel de fiche. Un HTTP 200 sans description ne
suffit pas à déclarer une fiche complète. Le contexte et le navigateur sont
fermés en fin de scan, y compris après une erreur ou une interruption.

Le proxy de détail reste une possibilité d'architecture, pas une solution
validée : les essais Bright Data précédents n'ont pas récupéré de fiche
complète. La disponibilité de la recherche ne garantit donc pas celle des
descriptions. Une architecture HTTP direct pour la recherche et Playwright
uniquement pour les fiches ne fonctionne pas dans l'environnement testé.

## Indeed Suisse et Bright Data

Le scan de l'application utilise Chrome sans proxy. Le test `indeed-proxy.test.ts` appelle uniquement l'ancien transport HTTP pour comparer Bright Data ; il ne change pas le transport du scan normal.

Renseignez `BRIGHTDATA_API_KEY` et `BRIGHTDATA_ZONE` dans `.env.local`, fichier ignoré par Git. Utilisez une zone Web Unlocker API. Le test utilise une base temporaire, demande une seule offre et autorise au maximum deux appels Bright Data (recherche et fiche). Il exige une description complète : la réussite de la recherche seule ne valide pas la source.

Sous PowerShell :

```powershell
$env:JOBSCOUT_LIVE = "1"
try {
  npx vitest run tests/live/indeed-proxy.test.ts
} finally {
  Remove-Item Env:JOBSCOUT_LIVE
}
```

### Diagnostic du 8 octobre 2026

- L'accès direct à Indeed a reçu HTTP 403.
- Le relais a récupéré les résultats de recherche, mais pas une fiche complète accessible dans un navigateur ordinaire.
- Le service attendait initialement `div#jobsearch-Main`, absent de cette fiche. Après activation externe de « Manual expect », les essais de sélecteurs de description avec rendu JavaScript ont aussi échoué.
- Un essai attendant seulement le corps de page a révélé HTTP 502 `reject_block` : le service rencontrait une page de protection ou un captcha.

Ces essais ne valident donc pas le scan complet. La source reste suspendue et son lien de recherche manuelle reste disponible. Ne relancez ce test que pour un diagnostic volontaire ; chaque essai peut être facturé.

### Traitement des erreurs du relais

Le délai est de 180 secondes par requête. Une erreur Web Unlocker contenue dans une enveloppe HTTP 200 est traitée comme un échec. L'application utilise des explications fixes sans recopier les messages distants, puis arrête les appels suivants du relais pour cette source pendant le scan.

JobScout n'active pas l'option externe « Manual expect » et n'envoie pas de sélecteur personnalisé. Cette option dépend du compte Bright Data et peut inclure les requêtes échouées dans la facturation. Pour les erreurs persistantes, consulter la [documentation du service](https://docs.brightdata.com/products/web-unlocker/error-codes#expect_element).
