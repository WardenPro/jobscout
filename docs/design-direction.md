# Direction artistique JobScout

## Intention

Un espace personnel calme et précis pour repérer une opportunité et préparer sa candidature. La référence fournie inspire les surfaces vitrées, les reflets de bord, les cercles et une typographie légère. Ces codes sont adaptés à des écrans de travail et à leurs contenus réels.

## Identité

- **Palette d’origine conservée** : blanc `#ffffff`, surfaces `#fbfbfd`, bleu `#0071e3` en clair ; noir `#000000`, surfaces `#1c1c1e`, bleu `#0a84ff` en sombre. Les halos et ombres sont dérivés de ces couleurs. Les statuts gardent leur sens vert, orange ou rouge.
- **Typographie** : Plus Jakarta Sans Variable pour les titres et les chiffres ; DM Sans Variable pour les textes, champs et commandes. Polices embarquées dans l’application via Fontsource.
- **Signature** : la boussole, le point bleu et les cercles de repérage. Sur l’accueil, l’anneau représente le véritable score de l’offre présentée.
- **Surfaces** : grands panneaux de 24 à 28 px de rayon, contours fins, un reflet supérieur et des ombres douces ; composants intérieurs de 12 à 16 px. Les effets proviennent de `glass-panel`, `glass-inset`, `brand-mark` et `focus-card`.

## Usage

- La navigation flottante situe l’utilisateur et garde le profil actif accessible. Sur mobile, elle devient une barre basse avec libellés.
- Le tableau de bord donne une prochaine action, puis les chiffres et l’activité réelle.
- Les offres associent une liste et un aperçu à partir de 1280 px. Sur les écrans plus étroits, chaque résultat ouvre sa fiche. Les filtres se replient sur mobile.
- Le bleu identifie les actions et la sélection. La transparence reste discrète derrière les textes longs.
- Les animations d’entrée durent 450 à 650 ms ; l’anneau se dessine une fois. Toutes respectent `prefers-reduced-motion`. Aucun défilement forcé.
- Les données, formulaires, téléchargements et actions existants conservent leurs destinations. Aucune métrique ni activité décorative n’est ajoutée.

Les tokens sont dans `app/globals.css` et `tailwind.config.ts`. Toute évolution visuelle doit être vérifiée en clair, en sombre et à largeur mobile.
