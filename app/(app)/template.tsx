// Animation d'entrée à chaque navigation. `.page-enter` (globals.css) n'anime
// que l'opacité : une transformation, même nulle en fin d'animation, ferait de
// ce bloc le repère des éléments `fixed` de la page (panneau de scan projeté
// à y ≈ 3 700 px). Les couches fixes sont de toute façon rendues hors de ce
// bloc (barre latérale dans le layout, modale de scan via createPortal).
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
