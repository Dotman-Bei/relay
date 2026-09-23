"use client";
import { formatDate, formatDay, formatDuration } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { cx } from "./ui";

/** A human date with the chain's own clock underneath — Relay's equivalent of Bareng's rupiah line. */
export function ChainTime({ unix, className }: { unix: number; className?: string }) {
  return (
    <span className={cx("inline-flex flex-col leading-tight", className)}>
      <span className="font-bold">{formatDate(unix)}</span>
      <span className="font-mono text-xs font-bold text-ink/70">chain time {unix}</span>
    </span>
  );
}

export function Countdown({ to, label = "Opens", done = "Release date reached" }: { to: number; label?: string; done?: string }) {
  const now = useNow();
  const left = to - now;
  return (
    <div>
      <p className="text-4xl font-black tabular-nums">{left > 0 ? formatDuration(left) : done}</p>
      <p className="mt-1 text-sm font-bold text-ink/80">
        {label} {formatDay(to)} · <span className="font-mono text-xs text-ink/70">chain time {to}</span>
      </p>
    </div>
  );
}

/** The postmark: Relay's one ornament, a cancellation stamp for the release date. */
export function Postmark({ unix, word = "Opens", size = "md" }: { unix: number; word?: string; size?: "sm" | "md" }) {
  const d = new Date(unix * 1000);
  return (
    <span
      aria-label={`${word} ${formatDay(unix)}`}
      className={cx("postmark shrink-0 bg-panel text-ink", size === "sm" ? "h-16 w-16 text-[10px]" : "h-24 w-24 text-[11px]")}
    >
      <span>
        <span className="block text-ink/70">{word}</span>
        <span className={cx("block", size === "sm" ? "text-sm" : "text-lg")}>{d.toLocaleDateString(undefined, { day: "2-digit", month: "short" })}</span>
        <span className="block">{d.getFullYear()}</span>
      </span>
    </span>
  );
}
