"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { shortAddr } from "@/lib/format";
import { networkLabel, useRelay } from "@/lib/relay";
import { useWallet } from "@/lib/wallet";
import { Logo } from "./brand";
import { NetworkBanner } from "./network-banner";
import { cx, LinkButton } from "./ui";

/** Each route owns a colour that fills its nav button only when active (frontend.md §2). */
const NAV = [
  { href: "/app", label: "Dashboard", emoji: "🏠", fill: "bg-yellow" },
  { href: "/circles", label: "Circles", emoji: "🫂", fill: "bg-blue" },
  { href: "/capsules", label: "Capsules", emoji: "🔒", fill: "bg-purple" },
  { href: "/activity", label: "Activity", emoji: "🧾", fill: "bg-green" },
  { href: "/settings", label: "Settings", emoji: "⚙️", fill: "bg-pink" },
];
const PUBLIC = [
  { href: "/", label: "Home" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/explore", label: "Explore" },
];

function isActive(path: string, href: string) {
  return href === "/app" ? path === "/app" : path === href || path.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { address, kind, disconnect } = useWallet();
  const { deployment, network, status } = useRelay();
  const net = networkLabel(deployment, network);
  const statusFill = status?.kind === "OK" ? (deployment?.network === "local" ? "bg-lime" : "bg-green") : status?.kind === "NOT_DEPLOYED" ? "bg-yellow" : "bg-red";

  return (
    <div className="mx-auto max-w-6xl md:flex md:gap-6 md:px-6 md:py-6">
      {/* Desktop sidebar */}
      <aside className="neo sticky top-6 hidden h-[calc(100dvh-3rem)] w-56 shrink-0 flex-col rounded-2xl bg-panel p-4 md:flex">
        <Logo href="/app" />
        <nav aria-label="App" className="mt-6 flex flex-col gap-2.5">
          {NAV.map((n) => {
            const active = isActive(path, n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cx("neo-btn flex items-center gap-2 rounded-lg px-3 py-2 text-sm", active ? n.fill : "bg-panel")}>
                <span aria-hidden>{n.emoji}</span>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <nav aria-label="Public" className="mt-5 flex flex-col gap-1 border-t-[3px] border-line pt-3 text-sm font-bold">
          {PUBLIC.map((p) => (
            <Link key={p.href} href={p.href} className="rounded px-1 py-0.5 hover:underline hover:decoration-[3px]">
              {p.label} →
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 text-xs">
          <span className={cx("neo-tag w-fit rounded px-1.5 py-0.5", statusFill)}>{net}</span>
          {address ? (
            <div className="neo-flat rounded-lg bg-panel p-2">
              <p className="font-mono font-bold" title={address}>{shortAddr(address)}</p>
              <p className="font-medium text-ink/70">{kind === "injected" ? "Browser wallet" : kind === "fixture" ? "LOCAL FIXTURE account" : "Browser session key"}</p>
              <button type="button" onClick={disconnect} className="mt-1 font-bold underline decoration-2 underline-offset-2">
                Disconnect
              </button>
            </div>
          ) : (
            <LinkButton href="/onboarding" fill="yellow" size="sm">Connect →</LinkButton>
          )}
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-20 border-b-[3px] border-line bg-bg px-4 pt-3 pb-2 md:hidden">
        <div className="flex items-center justify-between">
          <Logo href="/app" />
          <span className={cx("neo-tag rounded px-1.5 py-0.5 text-[10px]", statusFill)}>{net}</span>
        </div>
        <nav aria-label="App" className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-2">
          {NAV.map((n) => {
            const active = isActive(path, n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cx("neo-btn shrink-0 rounded-full px-3 py-1 text-xs", active ? n.fill : "bg-panel")}>
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <main id="main" className="flex min-w-0 flex-1 flex-col gap-5 p-4 md:p-0 [&>*]:min-w-0">
        <NetworkBanner />
        {children}
      </main>
    </div>
  );
}

export function PageHeader({ title, lead, action }: { title: ReactNode; lead?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-black tracking-tight">{title}</h1>
        {lead && <p className="mt-1 max-w-2xl text-sm font-medium text-ink/80">{lead}</p>}
      </div>
      {action}
    </div>
  );
}
