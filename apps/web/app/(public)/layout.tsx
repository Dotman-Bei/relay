import type { ReactNode } from "react";
import { NetworkBanner } from "@/components/network-banner";
import { Footer, PublicNav } from "@/components/public-chrome";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
      <PublicNav />
      <div className="mt-3">
        <NetworkBanner />
      </div>
      <main id="main">{children}</main>
      <Footer />
    </div>
  );
}
