import { listCandidatures } from "@/lib/db/candidatures";
import { PageHeader } from "@/components/app/page-header";
import { CandidaturesTable } from "./table";

export const dynamic = "force-dynamic";

export default async function CandidaturesPage() {
  const items = listCandidatures();
  return (
    <>
      <PageHeader
        eyebrow="Faire avancer"
        title="Candidatures"
        subtitle="Suivez chaque étape, notez vos échanges et gardez vos échéances à portée de main."
      />
      <CandidaturesTable initial={items} />
    </>
  );
}
