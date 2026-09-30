import { Sidebar } from "@/components/app/sidebar";
import { WorkspaceBar } from "@/components/app/workspace-bar";
import { currentVersion, productName } from "@/lib/update/check";
import { getProfile } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const profileName = getProfile()?.full_name?.trim() || null;
  return (
    <div className="app-shell min-h-[100dvh]">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-onAccent">
        Aller au contenu
      </a>
      <Sidebar version={currentVersion()} productName={productName()} profileName={profileName} />
      <main id="contenu" className="lg:pl-[268px]">
        <div className="mx-auto max-w-[1480px] px-5 pb-28 pt-8 sm:px-8 lg:pb-14 lg:pt-6 xl:px-10"><WorkspaceBar />{children}</div>
      </main>
    </div>
  );
}
