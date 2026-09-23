"use client";
import Link from "next/link";
import type { CircleView, MemberView } from "@relay/sdk";
import { circleTitle, useMetadata } from "@/lib/hooks";
import { Postmark } from "./chain-time";
import { DeliveryTag, LifecycleTag } from "./state";
import { Tag } from "./ui";

export function CircleRow({ circle, member, role, href }: { circle: CircleView; member?: MemberView; role?: "creator" | "member"; href?: string }) {
  const meta = useMetadata(circle);
  return (
    <Link href={href ?? `/circles/${circle.circleId}`} className="neo-btn flex items-center gap-4 rounded-xl bg-panel p-3">
      <Postmark unix={circle.policy.releaseAt} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-base font-black">{circleTitle(meta.data, circle.circleId)}</p>
          <LifecycleTag state={circle.lifecycle} />
          <DeliveryTag circle={circle} />
          {role && <Tag>{role === "creator" ? "Creator" : "Member"}</Tag>}
        </div>
        <p className="mt-1 text-xs font-bold text-ink/70">
          {circle.memberCount}/{circle.policy.capacity} joined · {circle.consentCount} consented · {circle.contributionCount}/{circle.policy.minContributions} contributions
          {member && (member.contributed ? " · you sealed yours ✉" : member.consented ? " · yours not sealed yet" : member.joined ? " · you haven't consented" : "")}
        </p>
      </div>
      <span aria-hidden className="text-lg font-black">→</span>
    </Link>
  );
}
