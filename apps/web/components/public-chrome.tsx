"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "./brand";
import { cx, LinkButton } from "./ui";

const LINKS = [
  { href: "/", label: "Home", fill: "bg-yellow" },
  { href: "/how-it-works", label: "How it works", fill: "bg-lime" },
  { href: "/explore", label: "Explore", fill: "bg-orange" },
  { href: "/app", label: "Dashboard", fill: "bg-blue" },
];

export function PublicNav() {
  const path = usePathname();
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    try {
      setSignedIn(Boolean(localStorage.getItem("relay:wallet:v1")));
    } catch {
      setSignedIn(false);
    }
  }, []);
  return (
    <header className="neo-sm flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5 rounded-xl bg-panel px-3 py-2.5">
      <Logo />
      <nav aria-label="Primary" className="order-last flex w-full flex-wrap gap-2 md:order-none md:w-auto">
        {LINKS.map((l) => {
          const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={cx("neo-btn inline-flex min-h-9 items-center rounded-lg px-3 py-1.5 text-sm pointer-coarse:min-h-11", active ? l.fill : "bg-panel")}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      {!signedIn && (
        <LinkButton href="/onboarding" fill="yellow" size="sm">
          Start a Circle →
        </LinkButton>
      )}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 border-t-[3px] border-line pt-6 pb-10 text-sm font-medium text-ink/80">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-2">A group time capsule with a release record anyone can check. {process.env.NEXT_PUBLIC_RELAY_NETWORK === "mainnet" ? "Deployed on BOT Chain mainnet." : "Built for BOT Chain; testnet first."}</p>
        </div>
        <ul className="grid gap-1.5 font-bold">
          <li>
            <Link href="/how-it-works#status" className="underline decoration-[3px] underline-offset-2">What&apos;s real today →</Link>
          </li>
          <li>
            <Link href="/how-it-works#limits" className="underline decoration-[3px] underline-offset-2">What Relay does not promise →</Link>
          </li>
          <li>
            <a href="https://dev-docs.botchain.ai" target="_blank" rel="noreferrer" className="underline decoration-[3px] underline-offset-2">BOT Chain developer docs ↗</a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
