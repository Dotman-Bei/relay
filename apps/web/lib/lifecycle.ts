import type { Lifecycle } from "@relay/protocol-types";

/**
 * One fixed colour map for lifecycle state, used everywhere (frontend.md §2: "if you want colour to
 * encode something, fix one map"). Colour is always paired with the state's words.
 */
export const LIFECYCLE_STYLE: Record<Lifecycle, { fill: string; label: string; emoji: string; blurb: string }> = {
  DRAFT: { fill: "bg-panel", label: "Draft", emoji: "📝", blurb: "Rule is being written. Nobody can join yet." },
  AWAITING_CONSENT: { fill: "bg-yellow", label: "Awaiting consent", emoji: "✍️", blurb: "Rule published. Members join and consent to it." },
  COLLECTING: { fill: "bg-blue", label: "Collecting", emoji: "✉️", blurb: "Rule locked by a member's consent. Contributions are open." },
  SEALED: { fill: "bg-purple", label: "Sealed", emoji: "🔒", blurb: "Contributions closed. Waiting for the release rule." },
  RELEASE_ELIGIBLE: { fill: "bg-orange", label: "Release eligible", emoji: "🗝️", blurb: "The rule was true on-chain. Relayers are delivering key shares." },
  RELEASED: { fill: "bg-green", label: "Released", emoji: "🎉", blurb: "Enough relayer receipts are recorded. Members can open it." },
  CANCELLED: { fill: "bg-pink", label: "Cancelled", emoji: "🚫", blurb: "Cancelled by the creator before anyone else consented." },
  EXPIRED: { fill: "bg-lime", label: "Expired", emoji: "⌛", blurb: "The expiry passed before release was recorded." },
};

export const LIFECYCLE_ORDER: Lifecycle[] = ["DRAFT", "AWAITING_CONSENT", "COLLECTING", "SEALED", "RELEASE_ELIGIBLE", "RELEASED"];
