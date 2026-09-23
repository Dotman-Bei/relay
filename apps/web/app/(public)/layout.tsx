import type { ReactNode } from "react";
import { LazyNetworkBanner } from "@/components/network-banner-lazy";
import { Footer, PublicNav } from "@/components/public-chrome";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
      <PublicNav />
      <div className="mt-3">
        <LazyNetworkBanner />
      </div>
      <main id="main">{children}</main>
      <Footer />
    </div>
  );
}
