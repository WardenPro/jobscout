# Tests réels et diagnostic des sources

Les tests ordinaires (`npm test`) utilisent des réponses simulées et des bases temporaires. Les tests de ce dossier ne contactent les services externes qu'avec une activation explicite ; ils peuvent entraîner des frais et ne font pas partie de la recette CI hors ligne.

## Indeed Suisse avec Playwright (diagnostic du 9 octobre 2026)

### Faisabilité et approche

Le module LinkedIn est `lib/scrapers/linkedin.ts`, en TypeScript/Node.js. Il utilise
`newContext()` dans `lib/scrapers/base.ts` : Chromium headless, contexte neuf,
locale française et viewport 1366 × 900. La version verrouillée de Playwright est
1.59.1. Le moteur se gère dans `lib/scrapers/browser-engine.ts`.

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
la structure visuelle change. Le parseur Indeed existant extrait ensuite titre,
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

Installez le moteur Chromium avant le test. Pour le dossier de développement,
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

Utilisez une fiche encore active pour une nouvelle évaluation. Huit fixtures
navigateur interceptent tous les accès réseau : injection JavaScript retardée,
anciens/nouveaux sélecteurs, JSON-LD, changement de structure, description masquée,
extrait court, protection HTTP 200 et offre expirée. Les tests ordinaires
`tests/indeed-browser.test.ts` vérifient aussi les HTTP 401/403/429, 404/410,
500/502, les URL interdites, redirections et délais de navigation sans Chromium.

Pour une fiche réelle, `test-results/indeed-browser/result.json` conserve le
statut, le code HTTP, la durée et les métadonnées de l'offre si elle est récupérée.
Une capture `page.png` est également enregistrée. Ces fichiers sont ignorés par
Git. Un refus distant fait échouer le test de récupération complète : il n'est
pas transformé en succès ou en test ignoré.

### Résultat mesuré

Les huit fixtures navigateur passent. Sur la fiche testée la veille
(`jk=0f4b81843b423ef2`), une navigation réelle avec le contexte LinkedIn a renvoyé
**HTTP 401** après environ 2,8 s, sans description récupérée. Le test réel échoue
donc avec le statut `blocked`. Ce résultat démontre un refus d'accès dans cette
configuration ; il n'établit pas à lui seul la cause exacte du refus ni une
impossibilité générale avec tout navigateur. Les résultats, les recherches et
les fiches d'autres annonces n'ont pas été validés par cet essai unique.

Indeed reste suspendu dans l'application. Ce prototype est uniquement un outil
de diagnostic : il ne modifie pas les paramètres, ne remplit pas la base des
offres et n'active pas le moteur ou la source pendant un scan normal.

## Indeed Suisse et Bright Data

Le scan Indeed est suspendu dans l'application. Le test `indeed-proxy.test.ts` appelle directement le scraper pour vérifier une éventuelle reprise du service ; il ne réactive pas la source dans les paramètres.

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
