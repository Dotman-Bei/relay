import type { Metadata } from "next";
import { LIFECYCLE } from "@relay/protocol-types";
import { ClaimStatusTag, LEDGER } from "@/components/claims";
import { MechanismDiagram } from "@/components/diagram";
import { EmojiTile, Highlight, LinkButton } from "@/components/ui";
import { LIFECYCLE_STYLE } from "@/lib/lifecycle";

export const metadata: Metadata = { title: "How it works" };

const PARTS = [
  {
    id: "encryption",
    emoji: "🔒",
    title: "Encryption happens on your device",
    body: [
      "Your contribution — text, image, audio or video, plus its caption and file name — is packed, padded to hide its exact size, and encrypted with a fresh AES-256-GCM key in your browser.",
      "That key is split with Shamir secret sharing into one share per relayer (k of n needed), and each share is encrypted to that relayer's published P-256 key. Your device keeps no copy of the key.",
      "The ciphertext and a manifest go to content-addressed storage. Before anything touches the chain, your browser reads them back and checks the hash. Only the manifest's sha256 is committed on-chain.",
    ],
  },
  {
    id: "consent",
    emoji: "✍️",
    title: "Consent is to an exact rule",
    body: [
      "The creator writes the rule first. Members consent with a transaction that names the rule's hash — so a consent can never attach to a different rule than the one you read.",
      "The moment any member other than the creator consents, CapsuleRegistry refuses every change to the rule. You can only contribute after you consent, and only once.",
      "Invitations are single-use keys that travel in the link's #fragment, which browsers never send to a server. Redeeming signs your own address, so a copied signature can't seat anyone else.",
    ],
  },
  {
    id: "release",
    emoji: "🗝️",
    title: "The contract decides release",
    body: [
      "The rule is: the release date has passed, at least N contributions were committed, and — if the Circle chose it — every member who joined has consented. The contract evaluates only its own stored state.",
      "Anyone may ask for release; the contract either reverts with the unmet condition or records ReleaseEligibilityReached. Relayers act only after that event exists.",
      "Each relayer opens its share, re-encrypts it to every consenting member's key, publishes a signed delivery, and records a receipt. The capsule counts as released only when receipts reach the threshold. Short of that, Relay shows RELEASE UNAVAILABLE and the exact number missing.",
    ],
  },
  {
    id: "verifier",
    emoji: "🔎",
    title: "Anyone can check it",
    body: [
      "The open-source verifier reads events straight from a BOT Chain RPC, replays them through a small reference model of the rules, and flags any event the rules would have rejected.",
      "It checks the registry's bytecode against the audited build, cross-checks the contract's own view of the capsule, and can compare a server's claimed state against the chain.",
      "It needs nothing from Relay's servers. Run it from the command line, or on the Verify page of any capsule.",
    ],
  },
];

export default function HowItWorks() {
  const c05 = LEDGER.claims.find((c) => c.id === "C-05");
  return (
    <div className="mt-12">
      <h1 className="text-5xl leading-[0.95] font-black tracking-tight sm:text-6xl">
        A promise, <Highlight fill="lime">measured</Highlight>
      </h1>
      <p className="mt-5 max-w-2xl text-lg font-medium text-ink/80">
        People say a reveal was agreed, that everyone took part, and that nobody opened it early. Relay makes the first two measurable on-chain and makes every recorded release independently
        checkable. Here is the whole mechanism, including where it stops.
      </p>

      <div className="neo mt-10 rounded-2xl bg-panel p-4 sm:p-6">
        <MechanismDiagram />
      </div>

      <div className="mt-12 grid grid-cols-1 gap-6">
        {PARTS.map((p) => (
          <section key={p.id} id={p.id} className="neo-sm scroll-mt-6 rounded-2xl bg-panel p-5">
            <div className="flex items-center gap-3">
              <EmojiTile>{p.emoji}</EmojiTile>
              <h2 className="text-2xl font-black tracking-tight">{p.title}</h2>
            </div>
            <div className="mt-3 grid gap-2 text-sm font-medium text-ink/80">
              {p.body.map((b) => (
                <p key={b.slice(0, 32)}>{b}</p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="mt-12" id="lifecycle">
        <h2 className="text-2xl font-black tracking-tight">Every state a Circle can be in</h2>
        <p className="mt-2 max-w-2xl text-sm font-medium text-ink/80">Colours in Relay always mean these states, and always come with the words.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {LIFECYCLE.map((l) => (
            <div key={l} className={`neo-sm flex items-start gap-3 rounded-xl p-3 ${LIFECYCLE_STYLE[l].fill}`}>
              <span aria-hidden className="text-xl">{LIFECYCLE_STYLE[l].emoji}</span>
              <div>
                <p className="font-mono text-xs font-bold">{l}</p>
                <p className="text-sm font-medium text-ink/80">{LIFECYCLE_STYLE[l].blurb}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="neo mt-12 scroll-mt-6 rounded-2xl bg-purple p-6" id="limits">
        <h2 className="text-2xl font-black tracking-tight">Where it stops</h2>
        <ul className="mt-3 grid gap-2 text-sm font-medium text-ink/80">
          <li className="neo-sm rounded-xl bg-panel px-3 py-2"><b className="text-ink">A contributor can keep a copy.</b> Relay can&apos;t make you forget what you wrote, and a creator can keep anything they contributed.</li>
          <li className="neo-sm rounded-xl bg-panel px-3 py-2"><b className="text-ink">A colluding threshold of relayers could open it early.</b> k relayers together hold enough shares. Relay records every receipt and discloses who the relayers are; it can&apos;t see off-chain collusion.</li>
          <li className="neo-sm rounded-xl bg-panel px-3 py-2"><b className="text-ink">Today&apos;s relayers are PROJECT_BASELINE.</b> They are operated by the Relay project, so they are not independent of each other.</li>
          <li className="neo-sm rounded-xl bg-panel px-3 py-2"><b className="text-ink">Your keys live in your browser.</b> Lose the browser and your recovery kit, and nobody — including Relay — can open your share of a reveal.</li>
          <li className="neo-sm rounded-xl bg-panel px-3 py-2"><b className="text-ink">Not for emergencies or estates.</b> Relay makes no medical, legal or estate-planning guarantee.</li>
        </ul>
      </section>

      <section className="mt-12 scroll-mt-6" id="status">
        <h2 className="text-2xl font-black tracking-tight">
          What&apos;s <Highlight fill="green">real</Highlight> today
        </h2>
        <p className="mt-2 max-w-2xl text-sm font-medium text-ink/80 wrap-anywhere">
          {c05?.publicWording} Each claim below is worded at the rung its evidence has reached; the ledger check fails if copy anywhere says more.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3">
          {LEDGER.claims.map((c) => (
            <div key={c.id} id={c.id.toLowerCase()} className="neo-sm scroll-mt-6 rounded-xl bg-panel p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-ink/60">{c.id}</span>
                <ClaimStatusTag status={c.status} />
                <p className="font-black">{c.claim}</p>
              </div>
              <p className="mt-1 text-sm font-medium text-ink/80 wrap-anywhere">{c.publicWording}</p>
              <p className="mt-2 text-xs font-bold text-ink/70">
                Needed for &ldquo;{c.earliestWording}&rdquo;: {c.requiredEvidence}.
              </p>
              {c.evidence.length > 0 && <p className="mt-1 font-mono text-xs font-bold break-all text-ink/60">evidence: {c.evidence.join(" · ")}</p>}
            </div>
          ))}
        </div>
      </section>

      <div className="mt-12 flex flex-wrap gap-3">
        <LinkButton href="/onboarding" fill="yellow">Start a Circle →</LinkButton>
        <LinkButton href="/explore">Browse templates →</LinkButton>
      </div>
    </div>
  );
}
