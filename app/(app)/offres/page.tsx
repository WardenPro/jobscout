import { searchOffres } from "@/lib/db/offres";
import { PageHeader } from "@/components/app/page-header";
import { OffresList } from "./list";
import { ScanButton } from "./scan-button";

export const dynamic = "force-dynamic";

export default async function OffresPage({ searchParams }: { searchParams: Promise<{ vie?: string }> }) {
  const { vie } = await searchParams;
  const initial = searchOffres({ vieOnly: vie === "1" });

  return (
    <>
      <PageHeader
        eyebrow="Découvrir"
        title="Vos prochaines opportunités"
        subtitle="Repérez les offres qui vous correspondent. Prenez le temps de choisir la suite."
        actions={<ScanButton />}
      />
      <OffresList initialResult={initial} initialVieOnly={vie === "1"} />
    </>
  );
}
