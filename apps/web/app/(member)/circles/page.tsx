"use client";
import { useState } from "react";
import { LIFECYCLE, type Lifecycle } from "@relay/protocol-types";
import { PageHeader } from "@/components/app-shell";
import { CircleRow } from "@/components/circle-row";
import { RequireAccount } from "@/components/require-account";
import { Empty, LinkButton, Notice, Section } from "@/components/ui";
import { useMyCircles } from "@/lib/hooks";
import { LIFECYCLE_STYLE } from "@/lib/lifecycle";

function Circles() {
  const circles = useMyCircles();
  const [filter, setFilter] = useState<Lifecycle | "ALL">("ALL");
  const rows = (circles.data ?? []).filter((m) => filter === "ALL" || m.circle.lifecycle === filter);
  const count = (l: Lifecycle) => (circles.data ?? []).filter((m) => m.circle.lifecycle === l).length;
  return (
    <>
      <PageHeader title="Circles" lead="Every Circle you created or joined, in its on-chain state." action={<LinkButton href="/circles/new" fill="blue">New Circle →</LinkButton>} />
      <div role="group" aria-label="Filter by state" className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={filter === "ALL"} onClick={() => setFilter("ALL")} className={filter === "ALL" ? "neo-btn rounded-full bg-blue px-3 py-1 text-xs" : "neo-flat rounded-full bg-panel px-3 py-1 text-xs font-bold"}>
          All · {circles.data?.length ?? 0}
        </button>
        {LIFECYCLE.map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={filter === l}
            onClick={() => setFilter(l)}
            className={filter === l ? `neo-btn rounded-full px-3 py-1 text-xs ${LIFECYCLE_STYLE[l].fill}` : "neo-flat rounded-full bg-panel px-3 py-1 text-xs font-bold"}
          >
            {l.replace(/_/g, " ")} · {count(l)}
          </button>
        ))}
      </div>
      {circles.isError && <Notice tone="error" title="Couldn't read your Circles">{String(circles.error)}</Notice>}
      <Section>
        {circles.isLoading ? (
          <p className="text-sm font-bold">Reading the chain…</p>
        ) : rows.length === 0 ? (
          <Empty emoji="🫂" title={filter === "ALL" ? "No Circles yet" : `No ${filter.replace(/_/g, " ").toLowerCase()} Circles`} action={<LinkButton href="/circles/new" fill="yellow">Start one →</LinkButton>}>
            A Circle is a group and one rule: when it opens, how many contributions it needs, and whose consent counts.
          </Empty>
        ) : (
          <div className="grid grid-cols-1 gap-3">{rows.map((m) => <CircleRow key={m.circle.circleId.toString()} {...m} />)}</div>
        )}
      </Section>
    </>
  );
}

export default function Page() {
  return (
    <RequireAccount>
      <Circles />
    </RequireAccount>
  );
}
