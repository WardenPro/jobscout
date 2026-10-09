"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { FRENCH_DEPARTMENTS, FRENCH_REGIONS, SearchAreaSchema, areaLabel, type SearchArea } from "@/lib/search-areas";
import { SWISS_CANTONS } from "@/lib/swiss-geography";
import type { ProfileFull } from "@/lib/cv/types";

const selectClass = "h-9 rounded-md border border-border bg-bg px-3 text-small text-text";
export function SearchAreas({ profile, update }: { profile: ProfileFull; update: (patch: Partial<ProfileFull>) => void }) {
  const [country, setCountry] = useState<"CH" | "FR">("CH");
  const [kind, setKind] = useState<SearchArea["kind"]>("canton");
  const [value, setValue] = useState("GE");
  const [error, setError] = useState<string | null>(null);
  const areas = profile.search_areas ?? [];
  const choices = kind === "canton" ? Object.entries(SWISS_CANTONS).map(([code, nom]) => ({ code, nom })) : kind === "region" ? FRENCH_REGIONS : FRENCH_DEPARTMENTS;
  function changeKind(next: SearchArea["kind"]) { setKind(next); setValue(next === "city" ? "" : next === "canton" ? "GE" : next === "region" ? "84" : "74"); setError(null); }
  function add() {
    const parsed = SearchAreaSchema.safeParse({ country, kind, value });
    if (!parsed.success) { setError("Choisissez une zone ou saisissez une ville."); return; }
    if (areas.length >= 20) { setError("Vous pouvez sélectionner au maximum 20 zones."); return; }
    const area = parsed.data;
    if (!areas.some(item => item.country === area.country && item.kind === area.kind && item.value.toLocaleLowerCase() === area.value.toLocaleLowerCase())) update({ search_areas: [...areas, area] });
    setError(null); if (kind === "city") setValue("");
  }
  return <div className="my-4 rounded-md border border-border p-3 space-y-3">
    <p className="text-small font-medium">Zones géographiques cibles</p>
    <p className="text-caption text-textSecondary">Choisissez les villes ou territoires à conserver et cochez aussi leurs pays dans vos pays cibles. Plusieurs zones d'un pays sont combinées : une offre peut correspondre à l'une d'elles. Sans zone pour un pays, tout ce pays reste couvert. Enregistrez le profil pour appliquer vos choix aux scans et aux offres affichées.</p>
    <div className="flex flex-wrap gap-2">
      {areas.map((area, index) => <Chip key={`${area.country}-${area.kind}-${area.value}`} active onRemove={() => update({ search_areas: areas.filter((_, i) => i !== index) })}>{area.country === "CH" ? "Suisse" : "France"} · {areaLabel(area)}</Chip>)}
    </div>
    <div className="flex flex-wrap gap-2">
      <select aria-label="Pays de la zone" className={selectClass} value={country} onChange={event => { const next = event.target.value as "CH" | "FR"; setCountry(next); changeKind(next === "CH" ? "canton" : "region"); }}><option value="CH">Suisse</option><option value="FR">France</option></select>
      <select aria-label="Type de zone" className={selectClass} value={kind} onChange={event => changeKind(event.target.value as SearchArea["kind"])}><option value="city">Ville</option>{country === "CH" ? <option value="canton">Canton</option> : <><option value="region">Région</option><option value="department">Département</option></>}</select>
      {kind === "city" ? <Input aria-label="Ville cible" className="max-w-xs" value={value} onChange={event => setValue(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); add(); } }} placeholder={country === "CH" ? "Ex. Genève, Lausanne, Nyon…" : "Ex. Annecy, Annemasse…"} /> : <select aria-label="Territoire cible" className={`${selectClass} max-w-full`} value={value} onChange={event => setValue(event.target.value)}>{choices.map(choice => <option key={choice.code} value={choice.code}>{choice.code} — {choice.nom}</option>)}</select>}
      <Button type="button" size="sm" variant="secondary" onClick={add}><Plus className="h-4 w-4" /> Ajouter la zone</Button>
    </div>
    <label className="flex items-center gap-2 text-small"><input type="checkbox" checked={profile.include_unknown_locations ?? false} onChange={event => update({ include_unknown_locations: event.target.checked })} />Conserver les offres dont le lieu ne permet pas de vérifier la zone</label>
    <p className="text-caption text-textSecondary">Le filtrage dépend du lieu publié. Les lieux imprécis sont exclus par défaut. Les villes correspondent au lieu nommé, sans rayon kilométrique. Certaines sources ne proposent pas de recherche locale : leurs résultats sont filtrés après collecte et peuvent être limités.</p>
    {error && <p role="alert" className="text-small text-danger">{error}</p>}
  </div>;
}
