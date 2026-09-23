"use client";
import { useState } from "react";
import { cx, Empty, EmojiTile, Highlight, LinkButton, Section } from "@/components/ui";
import { TEMPLATES } from "@/lib/templates";

const CATS = ["All", "Friends", "Family", "Teams", "Milestones"] as const;

export default function Explore() {
  const [cat, setCat] = useState<(typeof CATS)[number]>("All");
  const shown = TEMPLATES.filter((t) => cat === "All" || t.category === cat);
  return (
    <div className="mt-12">
      <h1 className="text-5xl leading-[0.95] font-black tracking-tight sm:text-6xl">
        Start from a <Highlight fill="orange">template</Highlight>
      </h1>
      <p className="mt-5 max-w-2xl text-lg font-medium text-ink/80">
        Templates only pre-fill a rule. You&apos;ll review every date and number before anything is written on-chain. Nothing here shows anyone&apos;s sealed content — there is none to show.
      </p>

      <div role="group" aria-label="Category" className="mt-6 flex flex-wrap gap-2">
        {CATS.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={cat === c}
            onClick={() => setCat(c)}
            className={cx("min-h-9 rounded-full px-4 py-1.5 text-sm pointer-coarse:min-h-11", cat === c ? "neo-btn bg-blue" : "neo-flat bg-panel font-bold")}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((t) => (
          <div key={t.id} className={`neo flex flex-col rounded-xl p-4 ${t.fill}`}>
            <div className="flex items-center justify-between">
              <EmojiTile>{t.emoji}</EmojiTile>
              <span className="neo-tag rounded bg-panel px-1.5 py-0.5 text-[10px]">{t.category}</span>
            </div>
            <p className="mt-3 text-lg font-black">{t.title}</p>
            <p className="mt-1 text-sm font-medium text-ink/80">{t.blurb}</p>
            <ul className="mt-3 grid gap-1 text-xs font-bold text-ink/80">
              <li>Opens after {t.years} year{t.years === 1 ? "" : "s"} · collect for {t.collectDays} days</li>
              <li>Needs {t.minContributions} contributions · up to {t.capacity} people</li>
              <li>{t.unanimous ? "Every member who joins must consent" : "Each contributor consents"}</li>
            </ul>
            <LinkButton href={`/circles/new?template=${t.id}`} className="mt-4 self-start" size="sm">Use this template →</LinkButton>
          </div>
        ))}
      </div>

      <Section className="mt-12" title="Public community campaigns">
        <Empty emoji="📮" title="No public campaigns yet">
          A campaign appears here only when its creator opts in to listing it. A listing shows the rule and progress counts — never contributions, never member addresses.
        </Empty>
      </Section>
    </div>
  );
}
