"use client";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { Postmark } from "@/components/chain-time";
import { RequireAccount } from "@/components/require-account";
import { DeliveryTag, LifecycleTag } from "@/components/state";
import { Empty, LinkButton, Notice, Section, Tag } from "@/components/ui";
import { shortHash } from "@/lib/format";
import { circleTitle, useMetadata, useMyCircles, type MyCircle } from "@/lib/hooks";

function CapsuleRow({ circle, member }: MyCircle) {
  const meta = useMetadata(circle);
  const collecting = circle.lifecycle === "AWAITING_CONSENT" || circle.lifecycle === "COLLECTING";
  const entitled = member.consented;
  return (
    <Link href={`/capsules/${circle.circleId}`} className="neo-btn flex flex-wrap items-center gap-4 rounded-xl bg-panel p-3">
      <Postmark unix={circle.policy.releaseAt} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-base font-black">{circleTitle(meta.data, circle.circleId)}</p>
          <LifecycleTag state={circle.lifecycle} />
          <DeliveryTag circle={circle} />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Tag fill={entitled ? "green" : "panel"}>{entitled ? "Entitled to the reveal" : "Not entitled: no consent"}</Tag>
          <Tag fill={member.contributed ? "blue" : "panel"}>
            {member.contributed ? `Yours sealed ✉ ${shortHash(member.commitment)}` : collecting && member.consented ? "Yours not sealed yet" : "No contribution from you"}
          </Tag>
        </div>
      </div>
      <span aria-hidden className="text-lg font-black">→</span>
    </Link>
  );
}

function Capsules() {
  const circles = useMyCircles();
  return (
    <>
      <PageHeader title="Capsules" lead="Each Circle seals one capsule. This is the content side: what you're entitled to open, and what you've sealed." />
      {circles.isError && <Notice tone="error" title="Couldn't read your capsules">{String(circles.error)}</Notice>}
      <Section>
        {circles.isLoading ? (
          <p className="text-sm font-bold">Reading the chain…</p>
        ) : (circles.data ?? []).length === 0 ? (
          <Empty emoji="✉️" title="No capsules yet" action={<LinkButton href="/circles/new" fill="yellow">Start a Circle →</LinkButton>} />
        ) : (
          <div className="grid grid-cols-1 gap-3">{(circles.data ?? []).map((m) => <CapsuleRow key={m.circle.circleId.toString()} {...m} />)}</div>
        )}
      </Section>
    </>
  );
}

export default function Page() {
  return (
    <RequireAccount>
      <Capsules />
    </RequireAccount>
  );
}
