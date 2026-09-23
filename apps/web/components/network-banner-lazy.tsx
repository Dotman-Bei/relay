"use client";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const Live = dynamic(() => import("./network-banner-live"), { ssr: false });

/** Public pages: the banner (and the chain client behind it) loads lazily, never blocking first paint. */
export function LazyNetworkBanner() {
  const path = usePathname();
  // These pages mount the full providers themselves and render the banner inside them.
  if (path.startsWith("/onboarding") || path.startsWith("/verify")) return null;
  return <Live />;
}
