"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { RelayProvider } from "@/lib/relay";
import { WalletProvider } from "@/lib/wallet";

function useQueryClient() {
  return useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }))[0];
}

/** Everything a signed-in page needs: chain reads, the deployment probe, and a wallet. */
export function Providers({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  return (
    <QueryClientProvider client={qc}>
      <RelayProvider>
        <WalletProvider>{children}</WalletProvider>
      </RelayProvider>
    </QueryClientProvider>
  );
}

/** Chain reads and the probe only (no wallet): enough for the network banner on public pages. */
export function RelayOnlyProviders({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  return (
    <QueryClientProvider client={qc}>
      <RelayProvider>{children}</RelayProvider>
    </QueryClientProvider>
  );
}
