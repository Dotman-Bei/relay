import Link from "next/link";
import ledger from "@relay/claim-ledger/data/claims.json";
import { cx } from "./ui";

export type LedgerClaim = (typeof ledger.claims)[number];
export const LEDGER = ledger;

const STATUS_FILL: Record<string, string> = {
  PLANNED: "bg-yellow",
  TESTED_LOCAL: "bg-lime",
  OBSERVED_TESTNET: "bg-green",
  OBSERVED_MAINNET: "bg-green",
  FAILED: "bg-red",
  UNAVAILABLE: "bg-pink",
};

export function ClaimStatusTag({ status }: { status: string }) {
  return <span className={cx("neo-tag inline-flex rounded px-1.5 py-0.5 text-[11px] leading-4", STATUS_FILL[status] ?? "bg-panel")}>{status.replace(/_/g, " ")}</span>;
}

/** Proof cards: the whole card presses (frontend.md §6). Status comes from the ledger, never from copy. */
export function ClaimCard({ claim }: { claim: LedgerClaim }) {
  return (
    <Link href={`/how-it-works#${claim.id.toLowerCase()}`} className="neo-btn flex h-full flex-col gap-2 rounded-xl bg-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-bold text-ink/60">{claim.id}</span>
        <ClaimStatusTag status={claim.status} />
      </div>
      <p className="text-base leading-snug font-black">{claim.claim}</p>
      <p className="text-sm font-medium text-ink/80 wrap-anywhere">{claim.publicWording}</p>
      <span className="mt-auto text-xs font-extrabold">Evidence →</span>
    </Link>
  );
}

export function testnetState() {
  const c05 = ledger.claims.find((c) => c.id === "C-05");
  return c05?.status === "OBSERVED_TESTNET" || c05?.status === "OBSERVED_MAINNET" ? "live" : "pending";
}
