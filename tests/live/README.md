# Tests réels et diagnostic des sources

Les tests ordinaires (`npm test`) utilisent des réponses simulées et des bases temporaires. Les tests de ce dossier ne contactent les services externes qu'avec une activation explicite ; ils peuvent entraîner des frais et ne font pas partie de la recette CI hors ligne.

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
