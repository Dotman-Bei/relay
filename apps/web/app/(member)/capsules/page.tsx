"use client";
import { PageHeader } from "@/components/app-shell";
import { CircleCard } from "@/components/circle-row";
import { RequireAccount } from "@/components/require-account";
import { Empty, LinkButton, Notice, Section, StatusLine } from "@/components/ui";
import { shortHash } from "@/lib/format";
import { useMyCircles, type MyCircle } from "@/lib/hooks";

function CapsuleRow({ circle, member }: MyCircle) {
  const collecting = circle.lifecycle === "AWAITING_CONSENT" || circle.lifecycle === "COLLECTING";
  return (
    <CircleCard
      circle={circle}
      href={`/capsules/${circle.circleId}`}
      details={
        <div className="mt-2 flex flex-col gap-1">
          <StatusLine fill={member.consented ? "green" : "panel"}>{member.consented ? "Entitled to the reveal" : "Not entitled: you haven't consented"}</StatusLine>
          <StatusLine fill={member.contributed ? "blue" : "panel"}>
            {member.contributed ? `Yours is sealed ✉ ${shortHash(member.commitment)}` : collecting && member.consented ? "Yours isn't sealed yet" : "No contribution from you"}
          </StatusLine>
        </div>
      }
    />
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
