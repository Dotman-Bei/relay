"use client";
import type { RegistryEvent } from "@relay/sdk";
import { formatDate, shortAddr, shortHash } from "@/lib/format";
import { TxLink } from "./hash";
import { Row } from "./ui";

export function describeEvent(e: RegistryEvent): string {
  const a = e.args;
  switch (e.name) {
    case "CircleCreated":
      return `Created by ${shortAddr(String(a.creator))} with rule ${shortHash(String(a.policyHash))}`;
    case "PolicyUpdated":
      return `Rule replaced before anyone else consented → ${shortHash(String(a.policyHash))}`;
    case "InvitationIssued":
      return "Invitation link issued";
    case "CircleOpened":
      return "Rule published; joining and consent open";
    case "InvitationAccepted":
      return `${shortAddr(String(a.member))} joined (member ${String(a.memberCount)})`;
    case "ConsentRecorded":
      return `${shortAddr(String(a.member))} consented to rule ${shortHash(String(a.policyHash))}`;
    case "ContributionCommitted":
      return `${shortAddr(String(a.member))} sealed a contribution (${shortHash(String(a.commitment))})`;
    case "ReleaseEligibilityReached":
      return `Rule true on-chain: release eligibility recorded (${String(a.contributionCount)} contributions)`;
    case "ReleaseReceiptRecorded":
      return `Relayer ${shortAddr(String(a.relayer))} recorded receipt ${String(a.receiptCount)}`;
    case "CapsuleCancelled":
      return "Cancelled by the creator";
    case "CapsuleExpired":
      return "Expiry recorded";
    case "RelayerKeyRegistered":
      return `Relayer ${shortAddr(String(a.relayer))} published its key`;
  }
}

export function ActivityList({ events }: { events: RegistryEvent[] }) {
  if (events.length === 0) return <p className="text-sm font-bold text-ink/70">No events yet.</p>;
  return (
    <ol className="grid grid-cols-1 gap-2">
      {events.map((e) => (
        <li key={`${e.transactionHash}-${e.logIndex}`}>
          <Row className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold">{describeEvent(e)}</span>
            <span className="flex items-center gap-2">
              {e.blockTimestamp !== undefined && <span className="text-ink/70">{formatDate(e.blockTimestamp)}</span>}
              <TxLink hash={e.transactionHash} />
            </span>
          </Row>
        </li>
      ))}
    </ol>
  );
}
