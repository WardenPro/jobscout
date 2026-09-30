import { OnboardingFrame } from "@/components/app/onboarding-frame";
import { UploadGate } from "./upload-gate";

// Pas de getSetting() ici : ce RSC serait prérendu à la compilation et l'état
// de configuration IA figé d'après le poste de build (piège documenté dans
// app/page.tsx). Le gate vit côté client, dans UploadGate.
export default function UploadPage() {
  return (
    <OnboardingFrame current="upload" title="Commençons par votre profil." description="Configurez la génération IA, puis importez votre CV. Vous pourrez vérifier chaque information avant de l'enregistrer.">
      <UploadGate />
    </OnboardingFrame>
  );
}
