"use client";
import { RelayOnlyProviders } from "@/app/providers";
import { NetworkBanner } from "./network-banner";

/** Loaded after first paint on public pages: brings in the chain client only to probe the network. */
export default function NetworkBannerLive() {
  return (
    <RelayOnlyProviders>
      <NetworkBanner />
    </RelayOnlyProviders>
  );
}
