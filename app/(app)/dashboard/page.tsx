import Link from "next/link";
import { ArrowRight, ArrowUpRight, Briefcase, CalendarDays, FileText, FolderOpen, MapPin, Search, Send, type LucideIcon } from "lucide-react";
import { ScoreOrbit } from "@/components/app/score-orbit";
import { suggestedOffres, offresCounts } from "@/lib/db/offres";
import { listCandidatures, candidaturesCounts } from "@/lib/db/candidatures";
import { listDocuments } from "@/lib/db/documents";
import { getProfile } from "@/lib/db/queries";
import { formatRelativeDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  envoyee: "Envoyée",
  en_cours: "En cours",
  entretien: "Entretien",
  acceptee: "Acceptée",
  refusee: "Refusée",
};

export default async function DashboardPage() {
  const profile = getProfile();
  const untrackedOffers = suggestedOffres(6, true);
  const fallbackOffers = suggestedOffres(7);
  const counts = offresCounts();
  const candidatures = listCandidatures();
  const candCounts = candidaturesCounts();
  const documents = listDocuments();
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || null;
  const nextOffer = untrackedOffers[0] ?? fallbackOffers[0] ?? null;
  const otherOffers = (untrackedOffers.length > 1 ? untrackedOffers : fallbackOffers).filter((offer) => offer.id !== nextOffer?.id);
  const topOffers = (otherOffers.length ? otherOffers : fallbackOffers).slice(0, 5);
  const dossierCount = new Set(documents.map((doc) => doc.offre_id).filter((id): id is number => id != null)).size;
  const upcoming = candidatures
    .filter((c) => c.deadline && new Date(c.deadline) >= new Date(Date.now() - 86400000))
    .sort((a, b) => (a.deadline! > b.deadline! ? 1 : -1))
    .slice(0, 3);
  const today = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <div className="space-y-7 sm:space-y-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow mb-3"><span className="signal-dot" aria-hidden="true" />Vue d’ensemble</p>
          <h1 className="font-display text-display text-balance">Bonjour{firstName ? `, ${firstName}` : ""}.</h1>
          <p className="mt-3 max-w-[60ch] text-body text-textSecondary">Les opportunités à explorer, les candidatures à faire avancer.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border px-3.5 py-2 text-caption text-textSecondary sm:mb-1"><CalendarDays className="h-3.5 w-3.5" /><span className="first-letter:uppercase">{today}</span></span>
      </header>

      <section aria-label="Prochaine étape" className="glass-panel focus-card reveal-panel">
        <div className="relative grid items-center md:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="relative z-10 p-6 sm:p-8 xl:p-9">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/[.045] px-3 py-1.5 text-caption font-medium text-accent"><span className="signal-dot !h-1 !w-1" aria-hidden="true" />À découvrir maintenant</span>
            <h2 className="mt-5 max-w-[25ch] font-display text-[clamp(1.65rem,2.5vw,2.3rem)] font-medium leading-[1.24]">
              {nextOffer ? nextOffer.title : "Commencez par découvrir les offres."}
            </h2>
            <p className="mt-3 text-body text-textSecondary">
              {nextOffer ? nextOffer.company : "Lancez une recherche pour trouver des postes adaptés à votre profil."}
            </p>
            {nextOffer && <p className="mt-2 flex items-center gap-1.5 text-small text-textSecondary"><MapPin className="h-3.5 w-3.5" />{nextOffer.location || nextOffer.country || "Lieu non précisé"}</p>}
            <Link href={nextOffer ? `/offres/${nextOffer.id}` : "/offres"} className="button-primary group mt-7 inline-flex min-h-11 items-center justify-center gap-5 rounded-full py-2.5 pl-5 pr-4 text-small font-medium">
              {nextOffer ? "Étudier cette offre" : "Explorer les offres"} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="flex items-center justify-center gap-6 border-t border-accent/10 px-6 py-6 sm:gap-4 md:flex-col md:border-t-0 md:px-4 md:py-7">
            {nextOffer ? (
              <>
                <ScoreOrbit score={nextOffer.score ?? 0} />
                <div className="max-w-[160px] md:max-w-none md:text-center"><p className="text-small font-medium">Adéquation avec votre profil</p><p className="mt-1 text-caption text-textSecondary">Une piste à étudier de plus près.</p></div>
              </>
            ) : (
              <p className="text-small text-textSecondary">Vos prochaines opportunités apparaîtront ici après une recherche.</p>
            )}
          </div>
        </div>
      </section>

      <section aria-label="Chiffres clés" className="reveal-panel reveal-delay-1 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <Metric icon={Briefcase} label="Offres disponibles" value={counts.total} detail={`${counts.today} publiées aujourd'hui`} href="/offres" />
        <Metric icon={Send} label="Candidatures" value={candCounts.total} detail={candCounts.upcoming ? `${candCounts.upcoming} échéance${candCounts.upcoming > 1 ? "s" : ""} à venir` : "Aucune échéance à venir"} href="/candidatures" />
        <Metric icon={FolderOpen} label="Dossiers préparés" value={dossierCount} detail="CV et lettres disponibles" href="/documents" />
      </section>

      <div className="reveal-panel reveal-delay-2 grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(290px,0.85fr)]">
        <section aria-labelledby="recommended-title" className="glass-panel min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-5 sm:px-6">
            <div>
              <h2 id="recommended-title" className="font-display text-[19px] font-medium">À explorer pour vous</h2>
            </div>
            <Link href="/offres" className="inline-flex shrink-0 items-center gap-1 text-caption font-medium text-textSecondary hover:text-accent">Tout voir <ArrowUpRight className="h-3.5 w-3.5" /></Link>
          </div>
          <div>
            {topOffers.length ? topOffers.map((offer) => {
              return (
                <Link key={offer.id} href={`/offres/${offer.id}`} className="offer-row group flex items-center gap-3.5 border-b border-border px-5 py-4 last:border-b-0 sm:px-6">
                  <span className="score-badge flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-[14px] text-[17px] font-medium leading-none tabular-nums" aria-label={`Score ${offer.score ?? 0} sur 100`}>
                    {offer.score ?? 0}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block line-clamp-2 text-small font-medium leading-snug">{offer.title}</span>
                    <span className="mt-1 block truncate text-caption text-textSecondary">{offer.company} · {offer.country ?? "Pays non précisé"}{offer.posted_at ? ` · ${formatRelativeDate(offer.posted_at)}` : ""}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-textSecondary transition-transform group-hover:translate-x-1 group-hover:text-accent" />
                </Link>
              );
            }) : (
              <div className="px-6 py-12 text-center">
                <Search className="mx-auto mb-3 h-7 w-7 text-accent" />
                <h3 className="text-h3">Vos offres apparaîtront ici</h3>
                <p className="mx-auto mt-2 max-w-[36ch] text-small text-textSecondary">Lancez un scan depuis la page Offres pour remplir votre sélection.</p>
                <Link href="/offres" className="mt-4 inline-flex items-center gap-1 text-small font-semibold text-accent hover:underline">Aller aux offres <ArrowRight className="h-4 w-4" /></Link>
              </div>
            )}
          </div>
        </section>

        <div className="space-y-6">
          <section aria-labelledby="activity-title" className="glass-panel overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-5">
              <div>
                <h2 id="activity-title" className="font-display text-[19px] font-medium">Votre activité</h2>
              </div>
              <Link href="/candidatures" className="inline-flex items-center gap-1 text-caption font-medium text-textSecondary hover:text-accent">Le suivi <ArrowUpRight className="h-3.5 w-3.5" /></Link>
            </div>
            <div className="p-5">
              {candidatures.length ? (
                <div className="space-y-4">
                  {candidatures.slice(0, 3).map((c) => (
                    <div key={c.id} className="relative border-b border-border pb-4 pl-5 last:border-0 last:pb-0">
                      <span className="signal-dot absolute left-0 top-2 !h-1.5 !w-1.5" aria-hidden="true" />
                      <div className="flex items-start justify-between gap-3">
                        <p className="line-clamp-2 text-small font-semibold leading-snug">{c.offre_title ?? c.ext_title ?? "Candidature"}</p>
                        <span className="shrink-0 rounded-full border border-accent/15 bg-accent/[.06] px-2 py-0.5 text-[10px] font-medium text-accent">{STATUS_LABELS[c.status] ?? c.status}</span>
                      </div>
                      <p className="mt-1 text-small text-textSecondary">{c.offre_company ?? c.ext_company ?? "Entreprise non précisée"}</p>
                      <p className="mt-2 text-caption text-textSecondary">Ajoutée le {displayDate(c.applied_at)}</p>
                    </div>
                  ))}
                  {upcoming[0] && <p className="flex items-center gap-2 border-t border-border pt-4 text-small text-accent"><CalendarDays className="h-4 w-4 shrink-0" /> Prochaine échéance : {displayDate(upcoming[0].deadline)}</p>}
                </div>
              ) : (
                <div className="py-5 text-center">
                  <CalendarDays className="mx-auto mb-3 h-6 w-6 text-textSecondary" />
                  <p className="text-small font-semibold">Votre suivi commence ici</p>
                  <p className="mx-auto mt-1 max-w-[32ch] text-small text-textSecondary">Ajoutez une offre au suivi pour retrouver son avancement et vos échéances.</p>
                </div>
              )}
            </div>
          </section>
          <Link href="/documents" className="glass-panel group flex items-center gap-4 p-5 transition-colors hover:border-accent/30">
            <span className="brand-mark h-12 w-12 rounded-[16px]"><FileText className="h-5 w-5" strokeWidth={1.5} /></span>
            <span className="min-w-0 flex-1"><span className="block text-small font-semibold">Vos documents</span><span className="mt-0.5 block text-small text-textSecondary">CV et lettres prêts à télécharger</span></span>
            <ArrowUpRight className="h-4 w-4 text-textSecondary group-hover:text-accent" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function displayDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function Metric({ icon: Icon, label, value, detail, href }: { icon: LucideIcon; label: string; value: number; detail: string; href: string }) {
  return (
    <Link href={href} className="glass-panel metric-card group flex items-center gap-4 px-5 py-4 transition-all duration-200 sm:block sm:px-6 sm:py-5">
      <span className="flex min-w-0 flex-1 items-center gap-3 sm:gap-2.5">
        <Icon className="h-4 w-4 shrink-0 text-textSecondary" strokeWidth={1.5} />
        <span className="text-small font-medium">{label}</span>
        <ArrowUpRight className="ml-auto hidden h-3.5 w-3.5 text-textSecondary opacity-40 transition-opacity group-hover:opacity-100 sm:block" />
      </span>
      <span className="relative z-10 flex shrink-0 flex-col text-right sm:mt-4 sm:text-left">
        <span className="font-display text-[32px] font-light leading-none tabular-nums sm:text-[42px]">{value}</span>
        <span className="mt-2 block text-[11px] text-textSecondary sm:text-caption">{detail}</span>
      </span>
    </Link>
  );
}
