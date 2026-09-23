import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

type Fill = "yellow" | "pink" | "blue" | "green" | "purple" | "orange" | "red" | "lime" | "panel";
export const FILL: Record<Fill, string> = {
  yellow: "bg-yellow",
  pink: "bg-pink",
  blue: "bg-blue",
  green: "bg-green",
  purple: "bg-purple",
  orange: "bg-orange",
  red: "bg-red",
  lime: "bg-lime",
  panel: "bg-panel",
};

/** Everything clickable presses (frontend.md §4). */
export function Button({ fill = "panel", className, size = "md", ...props }: ComponentProps<"button"> & { fill?: Fill; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "neo-btn inline-flex items-center justify-center gap-2 rounded-lg text-ink",
        size === "sm" ? "px-3 py-1.5 text-xs" : size === "lg" ? "px-5 py-3 text-base" : "px-4 py-2 text-sm",
        FILL[fill],
        className,
      )}
    />
  );
}

export function LinkButton({ fill = "panel", className, size = "md", ...props }: ComponentProps<typeof Link> & { fill?: Fill; size?: "sm" | "md" | "lg" }) {
  return (
    <Link
      {...props}
      className={cx(
        "neo-btn inline-flex items-center justify-center gap-2 rounded-lg text-ink",
        size === "sm" ? "px-3 py-1.5 text-xs" : size === "lg" ? "px-5 py-3 text-base" : "px-4 py-2 text-sm",
        FILL[fill],
        className,
      )}
    />
  );
}

/**
 * The primary action whose label is its own validation message (frontend.md §6):
 * when the action can't happen, the button says why.
 */
export function PrimaryAction({ ready, label, className, ...props }: ComponentProps<"button"> & { ready: boolean; label: string }) {
  return (
    <button
      type="submit"
      {...props}
      disabled={!ready || props.disabled}
      className={cx(
        "neo-btn w-full rounded-xl py-3 text-base font-extrabold text-ink",
        ready && !props.disabled ? "bg-blue" : "bg-panel text-ink/70",
        className,
      )}
    >
      {label}
    </button>
  );
}

export function Tag({ children, fill = "panel", className }: { children: ReactNode; fill?: Fill; className?: string }) {
  return <span className={cx("neo-tag inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] leading-4 text-ink", FILL[fill], className)}>{children}</span>;
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("neo-label text-xs text-ink/70", className)}>{children}</p>;
}

export function Highlight({ children, fill = "pink" }: { children: ReactNode; fill?: Fill }) {
  return <span className={cx("hl", FILL[fill])}>{children}</span>;
}

/** App section: bordered, usually no fill so the cream shows through (frontend.md §6). */
export function Section({ title, action, children, className, fill }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; fill?: Fill }) {
  return (
    <section className={cx("neo-sm rounded-2xl p-4", fill ? FILL[fill] : "", className)}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-lg font-black tracking-tight">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Card({ children, className, fill = "panel" }: { children: ReactNode; className?: string; fill?: Fill }) {
  return <div className={cx("neo rounded-xl p-4", FILL[fill], className)}>{children}</div>;
}

export function Row({ children, className, fill = "panel" }: { children: ReactNode; className?: string; fill?: Fill }) {
  return <div className={cx("neo-sm rounded-xl px-3 py-2.5 text-sm", FILL[fill], className)}>{children}</div>;
}

/** Notices and errors: a fill with ink text inside a neo-sm border — never coloured text (frontend.md §11.6). */
export function Notice({ tone, title, children, action }: { tone: "error" | "warn" | "info" | "ok" | "fixture"; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const fill = { error: "bg-red", warn: "bg-yellow", info: "bg-panel", ok: "bg-green", fixture: "bg-lime" }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("neo-sm rounded-xl p-3 text-sm text-ink", fill)}>
      <p className="font-extrabold">{title}</p>
      {children && <div className="mt-1 font-medium text-ink/80">{children}</div>}
      {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export function EmojiTile({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span aria-hidden className={cx("neo-flat grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-panel text-xl", className)}>
      {children}
    </span>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="neo-label text-xs">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs font-medium text-ink/70">{hint}</p>}
    </div>
  );
}

export const inputClass = "neo-input w-full rounded-xl px-3 py-2.5 text-sm";

export function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const share = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs font-bold">
        <span>{label}</span>
        <span className="tabular-nums">
          {value} / {max}
        </span>
      </div>
      <div className="neo-flat h-3 overflow-hidden rounded-full bg-panel" role="progressbar" aria-valuenow={value} aria-valuemax={max} aria-label={label}>
        <div className="h-full bg-blue" style={{ width: `${Math.max(value > 0 ? 4 : 0, share * 100)}%` }} />
      </div>
    </div>
  );
}

export function Empty({ emoji, title, children, action }: { emoji: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl px-4 py-8 text-center">
      <span aria-hidden className="text-4xl">
        {emoji}
      </span>
      <p className="text-lg font-black">{title}</p>
      {children && <p className="max-w-md text-sm font-medium text-ink/70">{children}</p>}
      {action}
    </div>
  );
}
