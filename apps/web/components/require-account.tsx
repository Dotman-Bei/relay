"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useWallet } from "@/lib/wallet";
import { Empty, LinkButton, Section } from "./ui";

export function RequireAccount({ children }: { children: ReactNode }) {
  const { ready, address } = useWallet();
  const path = usePathname();
  if (!ready) return <p className="text-sm font-bold text-ink/70">Loading your session…</p>;
  if (!address) {
    return (
      <Section>
        <Empty emoji="🔑" title="Connect to see your Circles" action={<LinkButton href={`/onboarding?next=${encodeURIComponent(path)}`} fill="yellow">Connect or create an account →</LinkButton>}>
          Your Circles, invitations and capsules are read from the chain for the address you connect. Relay keeps no account on a server.
        </Empty>
      </Section>
    );
  }
  return <>{children}</>;
}
