import Link from "next/link";
import { Compass } from "lucide-react";
import { OnboardingStepper } from "./onboarding-stepper";

export function OnboardingFrame({ current, title, description, children, wide = false }: {
  current: "upload" | "verify" | "preferences";
  title: string;
  description: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="app-shell min-h-[100dvh]">
      <header className="mobile-header border-b border-border">
        <div className="mx-auto flex max-w-[900px] items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="JobScout, accueil">
            <span className="brand-mark h-9 w-9 rounded-[13px]"><Compass className="h-5 w-5" strokeWidth={1.5} /></span>
            <span className="font-display text-[23px] font-semibold">JobScout<span className="text-accent">.</span></span>
          </Link>
          <span className="text-small text-textSecondary">Configuration du profil</span>
        </div>
      </header>
      <main className={`mx-auto px-5 pb-20 pt-7 sm:px-8 sm:pt-10 ${wide ? "max-w-[800px]" : "max-w-[700px]"}`}>
        <OnboardingStepper current={current} />
        <div className="mb-9 mt-10">
          <p className="eyebrow mb-3"><span className="signal-dot" aria-hidden="true" />Étape {current === "upload" ? "1" : current === "verify" ? "2" : "3"} sur 3</p>
          <h1 className="font-display text-h1 text-balance">{title}</h1>
          <p className="mt-3 max-w-[60ch] text-body text-textSecondary">{description}</p>
        </div>
        {children}
      </main>
    </div>
  );
}
