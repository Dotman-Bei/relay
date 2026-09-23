"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import type { CircleView, MemberView } from "@relay/sdk";
import { formatDay } from "@/lib/format";
import { circleTitle, useMetadata } from "@/lib/hooks";
import { Postmark } from "./chain-time";
import { DeliveryTag, LifecycleTag } from "./state";
import { Tag } from "./ui";

/**
 * A Circle as a pressable card that adapts to its own width (container queries), not the screen's:
 * the postmark appears only when the row has room, and long names wrap to two lines.
 */
export function CircleCard({ circle, href, tags, details }: { circle: CircleView; href: string; tags?: ReactNode; details?: ReactNode }) {
  const meta = useMetadata(circle);
  return (
    <Link href={href} className="neo-btn @container flex items-center gap-3 rounded-xl bg-panel p-3">
      <span className="hidden @[26rem]:block">
        <Postmark unix={circle.policy.releaseAt} size="sm" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-base leading-snug font-black wrap-anywhere">{circleTitle(meta.data, circle.circleId)}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <LifecycleTag state={circle.lifecycle} />
          <DeliveryTag circle={circle} />
          {tags}
        </div>
        {details}
        <p className="mt-1 text-xs font-bold text-ink/70 @[26rem]:hidden">Opens {formatDay(circle.policy.releaseAt)}</p>
      </div>
      <span aria-hidden className="shrink-0 text-lg font-black">
        →
      </span>
    </Link>
  );
}

export function CircleRow({ circle, member, role, href }: { circle: CircleView; member?: MemberView; role?: "creator" | "member"; href?: string }) {
  return (
    <CircleCard
      circle={circle}
      href={href ?? `/circles/${circle.circleId}`}
      tags={role && <Tag>{role === "creator" ? "Creator" : "Member"}</Tag>}
      details={
        <p className="mt-1.5 text-xs font-bold text-ink/70">
          {circle.memberCount}/{circle.policy.capacity} joined · {circle.consentCount} consented · {circle.contributionCount}/{circle.policy.minContributions} contributions
          {member && (member.contributed ? " · you sealed yours ✉" : member.consented ? " · yours not sealed yet" : member.joined ? " · you haven't consented" : "")}
        </p>
      }
    />
  );
}
