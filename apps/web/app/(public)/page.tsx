import Link from "next/link";
import { ClaimCard, LEDGER, testnetState } from "@/components/claims";
import { Reveal } from "@/components/reveal";
import { EmojiTile, Highlight, LinkButton, Tag } from "@/components/ui";

const STEPS = [
  { n: "1", title: "Write the rule first", body: "Pick the open date, how many contributions it needs, and whose consent counts — before inviting anyone." },
  { n: "2", title: "Everyone consents on-chain", body: "Each member signs the exact rule hash. Once someone else consents, the creator can't change a digit." },
  { n: "3", title: "Encrypt, then commit", body: "Letters, photos, voice memos, video: encrypted on your device. Only a 32-byte hash reaches BOT Chain." },
  { n: "4", title: "The contract decides", body: "On the date, anyone can ask. The contract checks its stored rule and either rejects or records eligibility." },
  { n: "5", title: "Receipts, then the reveal", body: "Relayers deliver key shares only after eligibility is on-chain, and each records a receipt. Enough receipts, and it opens." },
];

const FEATURES = [
  { emoji: "✍️", fill: "bg-yellow", title: "Consent you can point to", body: "Who agreed, to which rule, and when — as events anyone can read, not a screenshot." },
  { emoji: "🔒", fill: "bg-purple", title: "Encrypted before upload", body: "AES-256-GCM on your device. Storage holds ciphertext; the chain holds its hash." },
  { emoji: "🗝️", fill: "bg-orange", title: "Threshold release", body: "Each content key is split k-of-n across relayers. No single relayer can open a capsule." },
  { emoji: "🔎", fill: "bg-green", title: "Independent verifier", body: "Open-source replay of every event from any RPC. It needs nothing from Relay's servers." },
  { emoji: "🤖", fill: "bg-pink", title: "Memory Steward, opt-in", body: "Prompt ideas and reminders from your theme — never your content, never your keys. Off by default." },
  { emoji: "🧾", fill: "bg-lime", title: "Honest about delivery", body: "Eligible but short a receipt? It says exactly how many are missing, and doesn't call it released." },
];

export default function Home() {
  const testnet = testnetState();
  return (
    <>
      {/* Hero */}
      <section className="mt-12 grid items-center gap-10 md:grid-cols-[1.3fr_1fr]">
        <div className="neo-rise">
          <span className="neo-tag inline-flex rounded-md bg-lime px-2 py-1 text-xs">
            BOT Chain testnet · {testnet === "live" ? "deployed" : "deployment pending"}
          </span>
          <h1 className="mt-4 text-5xl leading-[0.95] font-black tracking-tight sm:text-6xl">
            Later,
            <br />
            <Highlight fill="pink">together.</Highlight>
          </h1>
          <p className="mt-5 max-w-xl text-lg font-medium text-ink/80">
            Relay is a group time capsule with a promise you can check. Everyone seals their piece now. BOT Chain records who agreed, to which date and rule, and exactly when it opened.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <LinkButton href="/onboarding" fill="yellow" size="lg">Start a Circle →</LinkButton>
            <LinkButton href="/how-it-works" size="lg">How it works</LinkButton>
          </div>
          <p className="mt-4 text-sm font-bold text-ink/70">
            The media never touches the chain. Only hashes, consent and the rule do.
          </p>
        </div>

        {/* Product state, not a slogan graphic (frontend.md §6). Labelled as an example. */}
        <div className="neo neo-rise rotate-1 rounded-2xl bg-panel p-5 [animation-delay:0.12s]" aria-label="Example sealed capsule">
          <div className="flex items-start justify-between gap-3">
            <p className="neo-label text-xs text-ink/70">Sealed capsule · Class of &apos;26</p>
            <Tag fill="yellow">Example</Tag>
          </div>
          <div className="mt-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-4xl font-black tabular-nums">1,826 days</p>
              <p className="mt-1 text-sm font-bold text-ink/80">
                Opens 12 Jun 2031 · <span className="font-mono text-xs text-ink/60">chain time 1938988800</span>
              </p>
            </div>
            <span className="postmark h-20 w-20 bg-panel text-[10px]">
              <span>
                <span className="block text-ink/70">Opens</span>
                <span className="block text-base">12 Jun</span>
                <span className="block">2031</span>
              </span>
            </span>
          </div>
          <ul className="mt-4 flex flex-col gap-2 text-sm">
            {[
              { who: "0x3f2a…a91c", fill: "bg-yellow", tag: "Sealed ✉" },
              { who: "0x8b10…04de", fill: "bg-blue", tag: "Sealed ✉" },
              { who: "0xc7e4…77f1", fill: "bg-pink", tag: "Consented ✓" },
            ].map((m) => (
              <li key={m.who} className={`neo-sm flex items-center justify-between rounded-xl px-3 py-2 ${m.fill}`}>
                <span className="font-mono font-bold">{m.who}</span>
                <span className="neo-tag rounded bg-panel px-1.5 py-0.5 text-[10px]">{m.tag}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs font-bold text-ink/70">2 of 3 contributions · unanimous consent · 2-of-3 release receipts</p>
        </div>
      </section>

      {/* How a Circle works */}
      <section className="mt-16">
        <h2 className="text-2xl font-black tracking-tight">
          How a Circle <Highlight fill="yellow">works</Highlight>
        </h2>
        <Reveal className="mt-5 grid grid-cols-1 gap-3">
          {STEPS.map((s) => (
            <div key={s.n} className="neo-sm flex items-start gap-4 rounded-xl bg-panel p-4">
              <span className="neo-flat grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-yellow text-lg font-black">{s.n}</span>
              <div>
                <p className="text-lg font-black">{s.title}</p>
                <p className="text-sm font-medium text-ink/80">{s.body}</p>
              </div>
            </div>
          ))}
        </Reveal>
      </section>

      {/* Trust boundary */}
      <section className="mt-16">
        <h2 className="text-2xl font-black tracking-tight">
          The line between <Highlight fill="green">chain</Highlight> and you
        </h2>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="neo rounded-2xl bg-purple p-5">
            <p className="neo-label text-xs">On BOT Chain, readable by anyone</p>
            <ul className="mt-3 grid gap-2 text-sm font-bold">
              {["The rule: dates, contribution count, consent mode, relayer quorum", "Member addresses, and who consented to which rule hash", "A 32-byte hash per contribution — never the contribution", "Release eligibility and every relayer receipt", "Public-key fingerprints"].map((x) => (
                <li key={x} className="neo-sm rounded-xl bg-panel px-3 py-2">{x}</li>
              ))}
            </ul>
          </div>
          <div className="neo rounded-2xl bg-panel p-5">
            <p className="neo-label text-xs">Never on-chain</p>
            <ul className="mt-3 grid gap-2 text-sm font-bold">
              {["Messages, photos, audio, video", "File names, captions, the Circle's name and description", "Encryption keys and key shares", "Contact details and notification settings", "Anything you show the Memory Steward"].map((x) => (
                <li key={x} className="neo-sm rounded-xl bg-bg px-3 py-2">{x}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Proof, at the rung it has reached */}
      <section className="mt-16">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-2xl font-black tracking-tight">
            Proof, at the rung it has <Highlight fill="green">reached</Highlight>
          </h2>
          <Link href="/how-it-works#status" className="text-sm inline-flex min-h-6 items-center font-extrabold underline decoration-2 underline-offset-2 pointer-coarse:min-h-11">Full claim ledger →</Link>
        </div>
        <p className="mt-2 max-w-2xl text-sm font-medium text-ink/80">
          Every public claim has a status and the evidence behind it. Nothing below says more than its evidence does.
        </p>
        <Reveal className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LEDGER.claims.slice(0, 6).map((c) => (
            <ClaimCard key={c.id} claim={c} />
          ))}
        </Reveal>
      </section>

      {/* Features */}
      <section className="mt-16">
        <h2 className="text-2xl font-black tracking-tight">
          Built for the <Highlight fill="yellow">moment</Highlight>, measured by the chain
        </h2>
        <Reveal className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className={`neo rounded-xl p-4 ${f.fill}`}>
              <EmojiTile>{f.emoji}</EmojiTile>
              <p className="mt-3 text-lg font-black">{f.title}</p>
              <p className="mt-1 text-sm font-medium text-ink/80">{f.body}</p>
            </div>
          ))}
        </Reveal>
      </section>

      {/* Caveat band */}
      <section className="neo mt-16 rounded-2xl bg-purple p-6" id="limits">
        <h2 className="text-2xl font-black tracking-tight">What Relay does not promise</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {["Contributors can keep a copy", "k colluding relayers could open early", "Relayers today: PROJECT_BASELINE", "Your device is your vault"].map((c) => (
            <span key={c} className="neo-sm rounded-lg bg-panel px-3 py-1.5 text-sm font-extrabold">{c}</span>
          ))}
        </div>
        <p className="mt-4 max-w-3xl text-sm font-medium text-ink/80">
          Relay makes a promise measurable: the rule, the consent and the release are on a public record that can&apos;t be edited later. It cannot stop someone who kept their own plaintext, and a
          threshold of relayers acting together could reconstruct a key before the date. Today every relayer is run by the Relay project, so they are labelled PROJECT_BASELINE — not independent. We
          print this here so nobody has to find it.
        </p>
      </section>

      {/* CTA band */}
      <section className="neo mt-16 -rotate-1 rounded-2xl bg-yellow p-8 text-center">
        <p className="text-3xl font-black tracking-tight">Seal something for later.</p>
        <p className="mx-auto mt-2 max-w-lg text-sm font-medium text-ink/80">Two people and a date are enough. You&apos;ll see the exact rule before anyone signs it.</p>
        <LinkButton href="/onboarding" className="mt-5" size="lg">Start a Circle →</LinkButton>
      </section>
    </>
  );
}
