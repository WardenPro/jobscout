import { OnboardingFrame } from "@/components/app/onboarding-frame";
import { VerifyForm } from "./form";

export default function VerifyPage() {
  return (
    <OnboardingFrame current="verify" title="Vérifiez votre profil." description="Corrigez les informations extraites du CV et ajoutez celles qui manquent avant de continuer." wide>
      <VerifyForm />
    </OnboardingFrame>
  );
}
