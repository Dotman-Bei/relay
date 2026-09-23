"use client";
import Link from "next/link";
import { useRelay } from "@/lib/relay";

/** Shows every non-OK network state, and the LOCAL FIXTURE label, on every page. */
export function NetworkBanner() {
  const { status, deployment, network } = useRelay();
  if (!status) return null;
  if (status.kind === "PROTOCOL_CONFIG_CHANGED") {
    return (
      <div role="alert" className="neo-sm rounded-xl bg-red px-3 py-2 text-sm text-ink">
        <p className="font-extrabold">PROTOCOL_CONFIG_CHANGED — transactions are stopped.</p>
        <ul className="mt-1 list-disc pl-5 font-medium text-ink/80">
          {status.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (status.kind === "RPC_UNREACHABLE") {
    return (
      <div role="alert" className="neo-sm rounded-xl bg-red px-3 py-2 text-sm font-bold text-ink">
        The {deployment?.label ?? network} RPC is unreachable, so nothing can be read or sent right now. {status.reason.slice(0, 120)}
      </div>
    );
  }
  if (status.kind === "NOT_DEPLOYED") {
    return (
      <div role="status" className="neo-sm rounded-xl bg-yellow px-3 py-2 text-sm font-bold text-ink">
        Relay is not deployed on {network === "local" ? "the LOCAL FIXTURE chain" : network === "mainnet" ? "BOT Chain mainnet" : "BOT Chain testnet"} yet — transactions are off. The protocol is tested locally;{" "}
        <Link href="/how-it-works#status" className="underline decoration-[3px] underline-offset-2">
          see what&apos;s real →
        </Link>
      </div>
    );
  }
  if (deployment?.network === "local") {
    return (
      <div role="status" className="neo-sm rounded-xl bg-lime px-3 py-2 text-sm font-bold text-ink">
        LOCAL FIXTURE — a development chain on this machine, not BOT Chain. Relayers and storage are local too.
      </div>
    );
  }
  return null;
}
