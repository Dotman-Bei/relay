"use client";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/app-shell";
import { Countdown, Postmark } from "@/components/chain-time";
import { AddrLink } from "@/components/hash";
import { RequireAccount } from "@/components/require-account";
import { deliveryOf, LifecycleTag } from "@/components/state";
import { Empty, LinkButton, Notice, Progress, Row, Section, Tag } from "@/components/ui";
import { shortHash } from "@/lib/format";
import { circleTitle, parseId, useCircle, useCircleEvents, useMember, useMetadata } from "@/lib/hooks";
import { useRelay } from "@/lib/relay";
import { useWallet } from "@/lib/wallet";

function Capsule() {
  const id = parseId(useParams().capsuleId as string);
  const { deployment } = useRelay();
  const { address } = useWallet();
  const circle = useCircle(id);
  const events = useCircleEvents(id);
  const me = useMember(id, address);
  const meta = useMetadata(circle.data);
  if (!id) return <Empty emoji="🧭" title="That isn't a capsule id" />;
  if (circle.isError) return <Notice tone="error" title={`Capsule #${id} can't be read`}>{String(circle.error)}</Notice>;
  const c = circle.data;
  if (!c) return <p className="text-sm font-bold">Reading the capsule…</p>;
  const d = deliveryOf(c);
  const contributions = (events.data ?? []).filter((e) => e.name === "ContributionCommitted");
  const receipts = (events.data ?? []).filter((e) => e.name === "ReleaseReceiptRecorded");
  const labels = new Map((deployment?.quorum.relayers ?? []).map((r) => [r.address.toLowerCase(), r]));

  return (
    <>
      <PageHeader
        title={circleTitle(meta.data, c.circleId)}
        lead="The content side of this Circle. Decrypted content only ever appears on the reveal page, after the release path succeeds."
        action={
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`/circles/${c.circleId}`} size="sm">Circle →</LinkButton>
            <LinkButton href={`/verify/${c.circleId}`} fill="green" size="sm">Verify ↗</LinkButton>
          </div>
        }
      />
      <div className="neo rounded-2xl bg-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="grid grid-cols-1 gap-3">
            <div className="flex flex-wrap gap-2">
              <LifecycleTag state={c.lifecycle} />
              <Tag fill={me.data?.consented ? "green" : "panel"}>{me.data?.consented ? "You're entitled to the reveal" : "You're not entitled: no consent"}</Tag>
              <Tag fill={me.data?.contributed ? "blue" : "panel"}>{me.data?.contributed ? "Yours is sealed ✉" : "Nothing sealed by you"}</Tag>
            </div>
            {(c.lifecycle === "SEALED" || c.lifecycle === "COLLECTING" || c.lifecycle === "AWAITING_CONSENT") && <Countdown to={c.policy.releaseAt} />}
            {c.lifecycle === "RELEASED" && <p className="text-4xl font-black">Ready to open 🎉</p>}
            {d?.kind === "RELEASE_UNAVAILABLE" && (
              <div>
                <p className="text-4xl font-black">Release unavailable</p>
                <p className="mt-1 text-sm font-bold text-ink/80">
                  Eligible on-chain, but {d.missing} of {d.threshold} relayer receipts are still missing. It is not released until they arrive.
                </p>
              </div>
            )}
          </div>
          <Postmark unix={c.policy.releaseAt} word={c.lifecycle === "RELEASED" ? "Opened" : "Opens"} />
        </div>
        {c.lifecycle === "RELEASED" && me.data?.consented && (
          <LinkButton href={`/capsules/${c.circleId}/reveal`} fill="green" size="lg" className="mt-5">Open it together →</LinkButton>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Section title={`Sealed envelopes · ${contributions.length}`}>
          {contributions.length === 0 ? (
            <p className="text-sm font-bold text-ink/70">Nothing sealed yet.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2">
              {contributions.map((e) => (
                <li key={String(e.args.commitment)}>
                  <Row className="flex items-center justify-between gap-2" fill="purple">
                    <span className="flex items-center gap-2"><span aria-hidden>✉️</span><AddrLink address={String(e.args.member)} /></span>
                    <span className="font-mono text-xs font-bold">{shortHash(String(e.args.commitment))}</span>
                  </Row>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <Progress label="Needed to open" value={c.contributionCount} max={c.policy.minContributions} />
          </div>
        </Section>
        <Section title="Key delivery">
          {c.eligibleAt === 0 ? (
            <p className="text-sm font-medium text-ink/80">Relayers deliver key shares only after the contract records eligibility. Until then, they hold nothing they can give you.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              <Progress label="Relayer receipts" value={c.receiptCount} max={c.policy.receiptThreshold} />
              <ul className="grid grid-cols-1 gap-2">
                {c.policy.relayers.map((r) => {
                  const rec = labels.get(r.toLowerCase());
                  const got = receipts.find((e) => String(e.args.relayer).toLowerCase() === r.toLowerCase());
                  return (
                    <li key={r}>
                      <Row className="flex flex-wrap items-center justify-between gap-2" fill={got ? "green" : "panel"}>
                        <span className="flex items-center gap-2"><AddrLink address={r} /> <Tag fill="orange">{rec?.independence ?? "UNDISCLOSED"}</Tag></span>
                        <Tag>{got ? "Receipt recorded" : "No receipt yet"}</Tag>
                      </Row>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Section>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <RequireAccount>
      <Capsule />
    </RequireAccount>
  );
}
