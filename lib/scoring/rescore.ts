import "server-only";
import type { ProfileFull } from "@/lib/cv/types";
import { listOffres, setOffreScore } from "@/lib/db/offres";
import { scoreOffreLocal } from "./local";

/** Re-score toutes les offres avec ce profil (local, déterministe, gratuit). */
export function rescoreAllOffres(profile: ProfileFull): number {
  let updated = 0;
  for (const o of listOffres()) {
    setOffreScore(
      o.id,
      scoreOffreLocal(profile, {
        title: o.title,
        company: o.company,
        country: o.country,
        description_text: o.description_text,
        contract_type: o.contract_type,
      })
    );
    updated++;
  }
  return updated;
}
