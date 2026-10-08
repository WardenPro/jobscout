"use client";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { indeedSearchUrl } from "@/lib/indeed";

export function IndeedSearch({ sectors }: { sectors: string[] }) {
  const [keywords, setKeywords] = useState(sectors[0] ?? "");
  const [location, setLocation] = useState("Suisse");
  return (
    <details className="glass-panel mb-5 p-4">
      <summary className="cursor-pointer text-small font-semibold">Rechercher sur Indeed Suisse</summary>
      <p className="mt-3 text-small text-textSecondary">Ouvrez une recherche dans un nouvel onglet. Si le scan automatique est refusé par Indeed, vous pouvez consulter les offres directement sur le site.</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="min-w-[180px] flex-1 text-caption text-textSecondary">Poste ou secteur
          <Input className="mt-1" value={keywords} onChange={e => setKeywords(e.target.value)} list="indeed-sectors" placeholder="Ex. administrateur systèmes" />
        </label>
        <datalist id="indeed-sectors">{sectors.map(s => <option key={s} value={s} />)}</datalist>
        <label className="min-w-[180px] flex-1 text-caption text-textSecondary">Ville ou région en Suisse
          <Input className="mt-1" value={location} onChange={e => setLocation(e.target.value)} placeholder="Suisse, Genève, Lausanne…" />
        </label>
        <Button asChild variant="secondary"><a href={indeedSearchUrl(keywords, location)} target="_blank" rel="noopener noreferrer">Ouvrir Indeed Suisse <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a></Button>
      </div>
    </details>
  );
}
