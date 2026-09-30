import Link from "next/link";
import { ArrowRight, FilePlus2 } from "lucide-react";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/db/queries";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { SettingsFolder } from "@/components/app/settings-folder";
import { AiSettings } from "@/components/app/ai-settings";
import { CleanupButton } from "@/components/app/cleanup-button";
import { ProfileSwitcher } from "@/components/app/profile-switcher";
import { ProfileEditor } from "./profile-editor";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const profile = getProfile();
  if (!profile) redirect("/onboarding/upload");

  return (
    <>
      <PageHeader
        eyebrow="Vous connaître"
        title="Votre profil"
        subtitle="Les informations de ce profil guident le classement des offres et la préparation de vos documents."
        actions={
          <>
            <Button asChild variant="primary">
              <Link href="/profile/add-cv"><FilePlus2 className="h-4 w-4" /> Ajouter un CV</Link>
            </Button>
          </>
        }
      />

      <div className="glass-panel mb-8 grid grid-cols-3 divide-x divide-border py-5 text-center sm:py-6">
        <div><p className="font-display text-[27px] font-semibold tabular-nums">{profile.experiences.length}</p><p className="text-small text-textSecondary">Expériences</p></div>
        <div><p className="font-display text-[27px] font-semibold tabular-nums">{profile.educations.length}</p><p className="text-small text-textSecondary">Formations</p></div>
        <div><p className="font-display text-[27px] font-semibold tabular-nums">{profile.skills.length}</p><p className="text-small text-textSecondary">Compétences</p></div>
      </div>

      <div className="mb-8"><ProfileSwitcher currentName={profile.full_name ?? null} /></div>

      <ProfileEditor initial={profile} />

      <section id="parametres" className="mt-12 border-t border-border pt-8">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-textSecondary">Configuration</p>
        <h2 className="font-display text-h2">Paramètres et données</h2>
        <p className="mt-1 max-w-[65ch] text-body text-textSecondary">Choisissez votre mode de génération et l'emplacement des fichiers. Vous pouvez aussi nettoyer ou remplacer le profil.</p>
        <div className="mt-6 space-y-5"><AiSettings /><SettingsFolder /></div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <CleanupButton />
          <Button asChild variant="secondary"><Link href="/onboarding/upload">Remplacer le profil <ArrowRight className="h-4 w-4" /></Link></Button>
        </div>
      </section>
    </>
  );
}
