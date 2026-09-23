import type { Lifecycle } from "@relay/protocol-types";
import type { CircleView } from "@relay/sdk";
import { LIFECYCLE_STYLE } from "@/lib/lifecycle";
import { cx } from "./ui";

export function LifecycleTag({ state, className }: { state: Lifecycle; className?: string }) {
  const s = LIFECYCLE_STYLE[state];
  return (
    <span className={cx("neo-tag inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] leading-4 text-ink", s.fill, className)} title={s.blurb}>
      <span aria-hidden>{s.emoji}</span>
      {state.replace(/_/g, " ")}
    </span>
  );
}

/** Release is only "released" when receipts reach the quorum threshold (PRD §9.3). */
export function deliveryOf(c: CircleView) {
  if (c.eligibleAt === 0) return null;
  const threshold = c.policy.receiptThreshold;
  if (c.receiptCount >= threshold) return { kind: "RELEASED" as const, receipts: c.receiptCount, threshold, missing: 0 };
  return { kind: "RELEASE_UNAVAILABLE" as const, receipts: c.receiptCount, threshold, missing: threshold - c.receiptCount };
}

export function DeliveryTag({ circle }: { circle: CircleView }) {
  const d = deliveryOf(circle);
  if (!d || d.kind === "RELEASED") return null;
  return (
    <span className="neo-tag inline-flex items-center gap-1 rounded bg-orange px-1.5 py-0.5 text-[10px] leading-4 text-ink">
      RELEASE UNAVAILABLE · {d.missing} receipt{d.missing === 1 ? "" : "s"} missing
    </span>
  );
}
