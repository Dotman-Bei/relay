"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { prepare } from "@relay/sdk";
import { RULE_CODES } from "@relay/protocol-types";
import { ActivityList } from "@/components/activity-list";
import { PageHeader } from "@/components/app-shell";
import { Countdown } from "@/components/chain-time";
import { AddrLink } from "@/components/hash";
import { RequireAccount } from "@/components/require-account";
import { draftFromPolicy, RuleForm, ruleProblem, type RuleDraft } from "@/components/rule-form";
import { RuleCard } from "@/components/rule";
import { DeliveryTag, deliveryOf, LifecycleTag } from "@/components/state";
import { StewardPanel } from "@/components/steward-panel";
import { TxStatus } from "@/components/tx-status";
import { Button, Empty, LinkButton, Notice, PrimaryAction, Progress, Row, Section, Tag } from "@/components/ui";
import { shortHash } from "@/lib/format";
import { circleTitle, parseId, useCircle, useCircleEvents, useMember, useMetadata } from "@/lib/hooks";
import { LIFECYCLE_STYLE } from "@/lib/lifecycle";
import { useRelay } from "@/lib/relay";
import { useTx } from "@/lib/tx";
import { useWallet } from "@/lib/wallet";

function CircleDetail() {
  const id = parseId(useParams().circleId as string);
  const { deployment } = useRelay();
  const { address } = useWallet();
  const circle = useCircle(id);
  const events = useCircleEvents(id);
  const me = useMember(id, address);
  const meta = useMetadata(circle.data);
  const tx = useTx();
  const [editing, setEditing] = useState<RuleDraft | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!id) return <Empty emoji="🧭" title="That isn't a Circle id" />;
  if (circle.isError) return <Notice tone="error" title={`Circle #${id} can't be read`}>{/UnknownCircle/.test(String(circle.error)) ? "No Circle with this id exists on this registry." : String(circle.error)}</Notice>;
  if (!circle.data) return <p className="text-sm font-bold">Reading Circle #{id.toString()} from the chain…</p>;

  const c = circle.data;
  const p = prepare(deployment!.contract.address);
  const isCreator = address?.toLowerCase() === c.creator.toLowerCase();
  const collecting = c.lifecycle === "AWAITING_CONSENT" || c.lifecycle === "COLLECTING";
  const members = Object.values(
    (events.data ?? []).reduce<Record<string, { address: string; joined: boolean; consented: boolean; contributed: boolean; commitment?: string }>>((acc, e) => {
      const a = String(e.args.member ?? e.args.creator ?? "").toLowerCase();
      if (e.name === "CircleCreated" || e.name === "InvitationAccepted") acc[a] = { ...(acc[a] ?? { consented: false, contributed: false }), address: a, joined: true };
      if (e.name === "ConsentRecorded" && acc[a]) acc[a]!.consented = true;
      if (e.name === "ContributionCommitted" && acc[a]) {
        acc[a]!.contributed = true;
        acc[a]!.commitment = String(e.args.commitment);
      }
      if (e.name === "PolicyUpdated" && e.args.creatorConsentCleared) {
        const cr = c.creator.toLowerCase();
        if (acc[cr]) acc[cr]!.consented = false;
      }
      return acc;
    }, {}),
  );
  const d = deliveryOf(c);
  const act = (w: ReturnType<typeof p.openCircle>) => tx.run(() => tx.send(w).then(() => circle.refetch()));
  // Once sealed, counts are frozen: a short count means this rule can never become true.
  const reachable = !(c.contributionCount < c.policy.minContributions || (c.policy.unanimousConsent && c.consentCount !== c.memberCount));

  return (
    <>
      <PageHeader
        title={circleTitle(meta.data, c.circleId)}
        lead={meta.data?.description || (meta.data === null ? "The name and description are encrypted. Open your invite link on this device, or import your recovery kit, to read them." : undefined)}
        action={
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`/capsules/${c.circleId}`} size="sm">Capsule view →</LinkButton>
            <LinkButton href={`/verify/${c.circleId}`} fill="green" size="sm">Verify ↗</LinkButton>
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <LifecycleTag state={c.lifecycle} />
        <DeliveryTag circle={c} />
        <Tag>{isCreator ? "You created it" : me.data?.joined ? "You're a member" : "You're not a member"}</Tag>
        <span className="text-xs font-bold text-ink/70">{LIFECYCLE_STYLE[c.lifecycle].blurb}</span>
      </div>

      <TxStatus state={tx.state} onRetry={tx.retry} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="grid content-start grid-cols-1 gap-5">
          {editing ? (
            <Section title="Edit the rule" fill="yellow">
              <p className="mb-3 text-sm font-medium text-ink/80">Allowed only until another member consents or anyone contributes. Your own consent to the old rule is cleared.</p>
              <RuleForm value={editing} onChange={setEditing} deployment={deployment} />
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Button onClick={() => setEditing(null)}>Keep the current rule</Button>
                <PrimaryAction
                  type="button"
                  ready={!ruleProblem(editing, c.memberCount) && !tx.blocked}
                  label={ruleProblem(editing, c.memberCount) ?? tx.blocked ?? "Replace the rule"}
                  onClick={() => tx.run(async () => {
                    await tx.send(p.updatePolicy(c.circleId, editing));
                    setEditing(null);
                    await circle.refetch();
                  })}
                />
              </div>
            </Section>
          ) : (
            <RuleCard policy={c.policy} policyHash={c.policyHash} locked={c.ruleLocked} relayers={deployment?.quorum.relayers ?? []} />
          )}

          <Section title="Progress">
            <div className="grid grid-cols-1 gap-4">
              {collecting && <Countdown to={c.policy.sealAt} label="Contributions close" done="Contributions closed" />}
              {c.lifecycle === "SEALED" && <Countdown to={c.policy.releaseAt} label="Opens" />}
              <Progress label="Members joined" value={c.memberCount} max={c.policy.capacity} />
              <Progress label="Consents" value={c.consentCount} max={c.memberCount} />
              <Progress label="Contributions (needed to open)" value={c.contributionCount} max={c.policy.minContributions} />
              {c.eligibleAt > 0 && <Progress label="Relayer receipts (needed to count as released)" value={c.receiptCount} max={c.policy.receiptThreshold} />}
              {d?.kind === "RELEASE_UNAVAILABLE" && (
                <Notice tone="warn" title={`Release unavailable: ${d.missing} receipt${d.missing === 1 ? "" : "s"} missing`}>
                  The rule was true on-chain, but only {d.receipts} of the {d.threshold} relayer receipts needed are recorded. It is not released until they are.
                </Notice>
              )}
              {c.lifecycle === "SEALED" && !reachable && (
                <Notice tone="error" title="This capsule can't open under its rule">
                  Contributions are closed and {c.contributionCount < c.policy.minContributions ? `only ${c.contributionCount} of ${c.policy.minContributions} contributions were sealed` : "not every member consented"}.
                  {c.policy.expiresAt ? " It will expire at its expiry date." : " It has no expiry, so it stays sealed."}
                </Notice>
              )}
            </div>
          </Section>

          <Section title="Members">
            <ul className="grid grid-cols-1 gap-2">
              {members.map((m) => (
                <li key={m.address}>
                  <Row className="flex flex-wrap items-center justify-between gap-2" fill={m.contributed ? "blue" : m.consented ? "yellow" : "panel"}>
                    <span className="flex items-center gap-2">
                      <AddrLink address={m.address} />
                      {m.address === c.creator.toLowerCase() && <Tag>Creator</Tag>}
                      {m.address === address?.toLowerCase() && <Tag fill="lime">You</Tag>}
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      <Tag>{m.consented ? "Consented ✓" : "No consent yet"}</Tag>
                      <Tag>{m.contributed ? `Sealed ✉ ${shortHash(m.commitment)}` : "Not sealed"}</Tag>
                    </span>
                  </Row>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs font-bold text-ink/70">Only hashes are shown. Nobody — including the creator — can read a sealed contribution before release.</p>
          </Section>
        </div>

        <div className="grid content-start grid-cols-1 gap-5">
          <Section title="What you can do" fill="panel">
            <div className="grid grid-cols-1 gap-2">
              {collecting && me.data?.joined && !me.data.consented && <LinkButton href={`/circles/${c.circleId}/consent`} fill="blue">Review the rule and consent →</LinkButton>}
              {collecting && me.data?.consented && !me.data.contributed && <LinkButton href={`/capsules/new?circleId=${c.circleId}`} fill="blue">Seal your contribution →</LinkButton>}
              {c.lifecycle === "SEALED" && c.ruleStatus === 0 && (
                <Button fill="orange" disabled={Boolean(tx.blocked)} onClick={() => act(p.requestRelease(c.circleId))}>
                  {tx.blocked ?? "The rule is true — record the release"}
                </Button>
              )}
              {c.lifecycle === "SEALED" && c.ruleStatus !== 0 && reachable && (
                <p className="text-sm font-bold text-ink/80">Not yet: {RULE_CODES[c.ruleStatus as keyof typeof RULE_CODES]}.</p>
              )}
              {c.lifecycle === "EXPIRED" && !c.expiredRecorded && <Button onClick={() => act(p.markExpired(c.circleId))}>Record the expiry on-chain</Button>}
              {c.lifecycle === "RELEASED" && me.data?.consented && <LinkButton href={`/capsules/${c.circleId}/reveal`} fill="green">Open it together →</LinkButton>}
              {!me.data?.joined && collecting && <p className="text-sm font-medium text-ink/80">To join, open an invitation link from the creator.</p>}
            </div>
            {isCreator && (
              <div className="mt-4 grid gap-2 border-t-[3px] border-line pt-4">
                <p className="neo-label text-xs">Creator</p>
                {c.lifecycle === "DRAFT" && (
                  <Button fill="yellow" disabled={Boolean(tx.blocked)} onClick={() => act(p.openCircle(c.circleId))}>
                    {tx.blocked ?? "Publish the rule so people can join"}
                  </Button>
                )}
                {(c.lifecycle === "DRAFT" || collecting) && <LinkButton href={`/circles/${c.circleId}/invite`}>Invitation links →</LinkButton>}
                {(c.lifecycle === "DRAFT" || c.lifecycle === "AWAITING_CONSENT") && !c.ruleLocked && c.contributionCount === 0 && !editing && (
                  <Button onClick={() => setEditing(draftFromPolicy(c.policy))}>Edit the rule</Button>
                )}
                {(c.lifecycle === "DRAFT" || c.lifecycle === "AWAITING_CONSENT") &&
                  (confirmCancel ? (
                    <Notice tone="error" title="Cancel this Circle for good?" action={<><Button fill="red" onClick={() => act(p.cancel(c.circleId))}>Yes, cancel it</Button><Button onClick={() => setConfirmCancel(false)}>Keep it</Button></>}>
                      Cancelling is permanent and recorded on-chain.
                    </Notice>
                  ) : (
                    <Button onClick={() => setConfirmCancel(true)}>Cancel Circle</Button>
                  ))}
                {c.ruleLocked && <p className="text-xs font-bold text-ink/70">The rule is locked: another member consented. Cancelling is no longer possible.</p>}
              </div>
            )}
          </Section>

          {me.data?.joined && collecting && <StewardPanel circleId={c.circleId.toString()} groupSize={c.memberCount} releaseAt={c.policy.releaseAt} />}

          <Section title="Activity record" action={<Link href={`/verify/${c.circleId}`} className="text-xs font-extrabold underline decoration-2">Replay it →</Link>}>
            {events.isLoading ? <p className="text-sm font-bold">Reading events…</p> : <ActivityList events={[...(events.data ?? [])].reverse()} />}
          </Section>
        </div>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <RequireAccount>
      <CircleDetail />
    </RequireAccount>
  );
}
