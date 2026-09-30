# Direction artistique JobScout

Mise à jour le 30/09/2026 (3.4.11) : identité loupe, cartes opaques, flou limité, 11 px minimum, contrastes mesurés.

## Intention

Un espace personnel calme et précis pour repérer une opportunité et préparer sa candidature. Grands panneaux arrondis, contours fins, reflets de bord, cercles de repérage et typographie légère, adaptés à des écrans de travail et à leurs contenus réels. La lisibilité passe avant l'effet : chaque règle ci-dessous a été mesurée.

## Identité

- **Nom affiché** : « JobScout ».
- **Signature** : la loupe de l'installeur (`installer/make-icon.mjs` : carré arrondi en dégradé `#111827` → `#2563EB`, loupe blanche). Pas de boussole. Le point bleu (`signal-dot`) et les cercles de repérage restent des motifs secondaires ; sur l'accueil, l'anneau (`ScoreOrbit`) représente le vrai score de l'offre présentée.
- **Typographie** : Plus Jakarta Sans Variable pour les titres et les chiffres (`font-display`) ; DM Sans Variable pour les textes, champs et commandes. Polices embarquées via Fontsource, sous licence SIL OFL 1.1 : leur copyright et le texte de licence sont dans `THIRD_PARTY_NOTICES.txt` (racine), copié dans le paquet par `installer/assemble.mjs`. Toute nouvelle police ou ressource tierce y ajoute sa licence.
- **Palette** : blanc `#ffffff`, surfaces `#fbfbfd`, bleu `#0071e3` en clair ; noir `#000000`, surfaces `#1c1c1e`, bleu `#0a84ff` en sombre. Les statuts gardent leur sens vert, orange ou rouge.

## Couleurs : vive et encre

Chaque couleur d'action ou de statut existe en deux jetons (`app/globals.css`) :

| Rôle | Jeton | Clair | Sombre | Sert à |
|---|---|---|---|---|
| Vive | `--accent`, `--success`, `--warning`, `--danger` | `#0071e3` `#30d158` `#ff9f0a` `#ff3b30` | `#0a84ff` `#30d158` `#ff9f0a` `#ff453a` | fonds, bordures, points, anneaux (`bg-*`, `border-*`, `ring-*`) |
| Encre | `--accent-ink`, `--success-ink`, `--warning-ink`, `--danger-ink` | `#0060c0` `#107032` `#935500` `#c41c12` | `#4aa8ff` `#30d158` `#ff9f0a` `#ff7b73` | texte (`text-*`) |
| Sur accent | `--on-accent` | blanc | noir | texte posé sur un fond `bg-accent` plein (`text-onAccent`) |

- `tailwind.config.ts` branche l'encre sur les classes de texte : `text-accent`, `text-success`, `text-warning` et `text-danger` sont lisibles partout sans y penser ; `bg-accent` garde le bleu vif.
- Les couleurs vives passent par `--*-rgb` et acceptent l'opacité (`bg-success/15`, `border-accent/40`, `bg-accent/[.12]`).
- `color-scheme` suit le thème (`light` / `dark`) : barres de défilement et contrôles natifs compris.

## Lisibilité (règles vérifiées)

- **Taille** : 11 px minimum pour tout texte d'interface. Aucun `text-[9px]` ni `text-[10px]`. Badges en `text-caption` (12 px), libellés de nav basse en 11-12 px.
- **Contraste** : au moins 4,5:1 pour tout texte, en clair ET en sombre, mesuré sur le pire fond plausible (page, carte, reflet de carte, survol). Ratios au 30/09/2026 :

| Élément | Clair | Sombre |
|---|---|---|
| Bouton principal, puce active (fond plein) | 4,70 | 5,76 |
| Bouton principal survolé | 5,57 | 6,96 |
| Badge « Envoyée » / V.I.E, pastille de score bleue | 5,03 | 5,22 |
| Badges succès / avertissement / danger | 5,50 / 5,27 / 4,92 | 5,95 / 5,84 / 5,26 |
| Pastilles de score excellent / moyen / faible | 5,50 / 5,27 / 4,99 | 5,95 / 5,84 / 5,54 |
| Onglet de navigation actif | 5,13 | 5,32 |
| Lien `text-accent` sur fond survolé | 5,62 | 5,53 |
| Texte secondaire sur fond survolé | 4,66 | 5,42 |

- **Puce active** (`Chip`) : fond plein `bg-accent` et `text-onAccent`, jamais une simple teinte.
- **Score** : `scoreColor(score)` (`lib/utils.ts`) renvoie un `tone` à poser sur la pastille (`<span className="score-badge" data-tone={tone}>`) pour garder le code couleur excellent / bon / moyen / faible, et des `fg`/`bg` en variables CSS qui suivent le thème.
- **Interlettrage** : aucun `letter-spacing` sur `.font-display` ; titres entre -0,01 et -0,03 em. Au-delà, les espaces entre mots s'écrasent.
- **Fusion de classes** : `cn()` connaît nos tailles (`caption`, `small`, `body`, `h1`-`h3`, `display`) et nos ombres (`card`, `elevated`). Toute nouvelle taille ou ombre de `tailwind.config.ts` se déclare aussi dans `FONT_SIZE_TOKENS` / `SHADOW_TOKENS` ; `tests/utils-cn.test.ts` échoue sinon. Sans cela, `text-small` passe pour une couleur et une classe disparaît.

## Surfaces

- **Cartes** (`glass-panel`, `Card`) : surface opaque `--surface`, bordure `--glass-edge` (pleine en sombre, pour détacher la carte du fond noir), reflet supérieur et ombre douce. Rayon 24 à 28 px ; composants intérieurs de 12 à 16 px. `glass-inset` pour les champs.
- **Flou d'arrière-plan réservé** à ce qui flotte au-dessus du contenu qui défile : en-tête mobile (`.mobile-header`), nav basse et, au besoin, aperçu fixe (`glass-panel glass-float`). Jamais sur les cartes : un calque de flou par carte coûte au défilement sans effet visible sur un fond uni.

## Mouvement

- `.page-enter` (chaque navigation) anime l'**opacité seule**, avec un remplissage `backwards`. Aucune `transform` sur un conteneur de page : même nulle et laissée en place, elle devient le repère des éléments `fixed` (le panneau de scan s'était retrouvé à y ≈ 3 700 px).
- `.reveal-panel` (accueil) peut glisser de 12 px : rien de `fixed` n'y est rendu et son décalage disparaît à la fin de l'animation.
- Animations de 450 à 650 ms ; l'anneau se dessine une fois. Toutes respectent `prefers-reduced-motion`. Aucun défilement forcé.

## Usage

- La navigation flottante situe l'utilisateur et garde le profil actif accessible. Sous 1 024 px, elle devient un en-tête et une barre basse avec libellés.
- Le tableau de bord donne une prochaine action, puis les chiffres et l'activité réelle.
- Les offres associent une liste et un aperçu à partir de 1 280 px. Sur les écrans plus étroits, chaque résultat ouvre sa fiche. Les filtres se replient sur mobile.
- Le bleu identifie les actions et la sélection. Les sous-titres donnent des chiffres (« 98 aujourd'hui ») plutôt que des slogans.
- Les données, formulaires, téléchargements et actions existants conservent leurs destinations. Aucune métrique ni activité décorative n'est ajoutée.

Les jetons sont dans `app/globals.css` et `tailwind.config.ts`. Toute évolution visuelle se vérifie en clair, en sombre, à 390 px, 960 px et 1 440 px, et tout changement de couleur fait recalculer le tableau des contrastes.
