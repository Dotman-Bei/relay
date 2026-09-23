/** Formatting helpers. Every human date gets the chain's clock underneath it (Relay's "rupiah line"). */

export const shortAddr = (a: string | null | undefined) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
export const shortHash = (h: string | null | undefined) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "—");

export function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDay(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** "3 days", "4 h 12 min", "38 s" — coarse, for countdowns. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s >= 2 * 86400) return `${Math.floor(s / 86400).toLocaleString()} days`;
  if (s >= 3600) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
  if (s >= 60) return `${Math.floor(s / 60)} min ${s % 60} s`;
  return `${s} s`;
}

export function relative(unix: number, now: number): string {
  const d = unix - now;
  return d >= 0 ? `in ${formatDuration(d)}` : `${formatDuration(-d)} ago`;
}

export const nowSeconds = () => Math.floor(Date.now() / 1000);
