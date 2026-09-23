"use client";
import type { Policy } from "@relay/protocol-types";
import type { RelayerRecord } from "@relay/protocol-types";
import { shortAddr } from "@/lib/format";
import { ChainTime } from "./chain-time";
import { Tag } from "./ui";

/** The exact rule, in words, with every number the contract enforces. */
export function RuleCard({ policy, policyHash, locked, relayers }: { policy: Policy; policyHash: string; locked: boolean; relayers: RelayerRecord[] }) {
  const label = new Map(relayers.map((r) => [r.address.toLowerCase(), r]));
  return (
    <div className="neo rounded-2xl bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="neo-label text-xs">The rule</p>
        <Tag fill={locked ? "purple" : "yellow"}>{locked ? "🔒 Locked by member consent" : "✍️ Editable until another member consents"}</Tag>
      </div>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div className="neo-flat rounded-xl p-3">
          <dt className="neo-label text-[11px] text-ink/70">Contributions close</dt>
          <dd><ChainTime unix={policy.sealAt} /></dd>
        </div>
        <div className="neo-flat rounded-xl bg-yellow p-3">
          <dt className="neo-label text-[11px] text-ink/70">Earliest release</dt>
          <dd><ChainTime unix={policy.releaseAt} /></dd>
        </div>
        <div className="neo-flat rounded-xl p-3">
          <dt className="neo-label text-[11px] text-ink/70">Needs</dt>
          <dd className="font-bold">
            {policy.minContributions} contribution{policy.minContributions === 1 ? "" : "s"} · {policy.unanimousConsent ? "every joined member's consent" : "consent from each contributor"}
          </dd>
        </div>
        <div className="neo-flat rounded-xl p-3">
          <dt className="neo-label text-[11px] text-ink/70">Expiry</dt>
          <dd className="font-bold">{policy.expiresAt ? <ChainTime unix={policy.expiresAt} /> : "None — stays sealed until the rule is met"}</dd>
        </div>
        <div className="neo-flat rounded-xl p-3 sm:col-span-2">
          <dt className="neo-label text-[11px] text-ink/70">Release quorum · {policy.receiptThreshold} of {policy.relayers.length} receipts · capacity {policy.capacity}</dt>
          <dd className="mt-1 flex flex-wrap gap-2">
            {policy.relayers.map((r) => {
              const rec = label.get(r.toLowerCase());
              return (
                <span key={r} className="neo-flat inline-flex items-center gap-1.5 rounded-lg bg-panel px-2 py-1 text-xs">
                  <span className="font-mono font-bold">{shortAddr(r)}</span>
                  <Tag fill={rec?.independence === "INDEPENDENT" ? "green" : rec?.independence === "LOCAL FIXTURE" ? "lime" : "orange"}>{rec?.independence ?? "UNDISCLOSED"}</Tag>
                </span>
              );
            })}
          </dd>
        </div>
      </dl>
      <p className="mt-3 break-all font-mono text-[11px] font-bold text-ink/60">rule hash {policyHash}</p>
    </div>
  );
}
