import { MapPin } from "lucide-react";

export function LocationLink({ location, country, showCountry = false }: {
  location?: string | null;
  country?: string | null;
  showCountry?: boolean;
}) {
  const city = location?.trim();
  const nation = country?.trim();
  const query = [...new Set([city, nation].filter(Boolean))].join(", ");
  if (!query) return null;
  const label = showCountry ? query : city || nation;
  return (
    <a
      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-sm text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      title={`Voir ${query} sur Google Maps (nouvel onglet)`}
      aria-label={`Voir ${query} sur Google Maps (nouvel onglet)`}
    >
      <MapPin className="h-4 w-4" aria-hidden="true" />{label}
    </a>
  );
}
