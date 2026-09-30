import { OnboardingFrame } from "@/components/app/onboarding-frame";
import { PreferencesForm } from "./form";

export default function PreferencesPage() {
  return (
    <OnboardingFrame current="preferences" title="Définissez votre recherche." description="Choisissez les secteurs, les pays et les sources qui correspondent à votre projet.">
      <PreferencesForm />
    </OnboardingFrame>
  );
}
