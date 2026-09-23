"use client";
import { shortHash } from "@/lib/format";
import { useRelay } from "@/lib/relay";

/** Transaction / address reference; ↗ goes out to the explorer (frontend.md §9 arrows). */
export function TxLink({ hash, label }: { hash: string; label?: string }) {
  const { explorerTx } = useRelay();
  const url = explorerTx(hash);
  if (!url) return <span className="font-mono text-xs font-bold text-ink/70" title={hash}>{label ?? shortHash(hash)}</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="hash-link text-xs" title={hash}>
      {label ?? shortHash(hash)} ↗
    </a>
  );
}

export function AddrLink({ address, label }: { address: string; label?: string }) {
  const { explorerAddress } = useRelay();
  const url = explorerAddress(address);
  const text = label ?? `${address.slice(0, 6)}…${address.slice(-4)}`;
  if (!url) return <span className="font-mono text-xs font-bold" title={address}>{text}</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="hash-link text-xs" title={address}>
      {text} ↗
    </a>
  );
}
