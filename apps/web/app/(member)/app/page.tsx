"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { CircleRow } from "@/components/circle-row";
import { TxLink } from "@/components/hash";
import { RequireAccount } from "@/components/require-account";
import { deliveryOf } from "@/components/state";
import { Empty, LinkButton, Notice, Row, Section } from "@/components/ui";
import { formatDate, shortAddr } from "@/lib/format";
import { useAccountEvents, useMyCircles, type MyCircle } from "@/lib/hooks";
import { getEncryptionJwk } from "@/lib/keys";
import { useRelay } from "@/lib/relay";
import { stewardReminder } from "@/lib/steward";
import { useWallet } from "@/lib/wallet";

const PENDING_INVITES = "relay:pending-invites:v1";

function nextAction(m: MyCircle): { label: string; href: string } | null {
  const c = m.circle;
  const id = c.circleId.toString();
  if (m.role === "creator" && c.lifecycle === "DRAFT") return { label: "Publish the rule so people can join", href: `/circles/${id}` };
  if ((c.lifecycle === "AWAITING_CONSENT" || c.lifecycle === "COLLECTING") && m.member.joined && !m.member.consented) return { label: "Review the rule and consent", href: `/circles/${id}/consent` };
  if ((c.lifecycle === "AWAITING_CONSENT" || c.lifecycle === "COLLECTING") && m.member.consented && !m.member.contributed) return { label: "Seal your contribution", href: `/capsules/new?circleId=${id}` };
  if (c.lifecycle === "SEALED" && c.ruleStatus === 0) return { label: "The rule is true — record the release", href: `/circles/${id}` };
  if (c.lifecycle === "RELEASED" && m.member.consented) return { label: "Open it together", href: `/capsules/${id}/reveal` };
  return null;
}

function Dashboard() {
  const { address } = useWallet();
  const { deployment } = useRelay();
  const circles = useMyCircles();
  const events = useAccountEvents();
  const [pending, setPending] = useState<{ circleId: string; link: string }[]>([]);
  const [reminders, setReminders] = useState<{ id: string; text: string }[]>([]);
  const hasKey = address ? Boolean(getEncryptionJwk(address)) : true;

  useEffect(() => {
    try {
      setPending(JSON.parse(localStorage.getItem(PENDING_INVITES) ?? "[]"));
    } catch {
      setPending([]);
    }
  }, []);

  useEffect(() => {
    if (!deployment || !address || !circles.data) return;
    const open = circles.data.filter((m) => m.circle.lifecycle === "AWAITING_CONSENT" || m.circle.lifecycle === "COLLECTING");
    Promise.all(open.map(async (m) => ({ id: m.circle.circleId.toString(), text: await stewardReminder(deployment, m.circle.circleId.toString(), address) }))).then((rs) =>
      setReminders(rs.filter((r): r is { id: string; text: string } => Boolean(r.text))),
    );
  }, [deployment, address, circles.data]);

  const all = circles.data ?? [];
  const actions = all.flatMap((m) => {
    const a = nextAction(m);
    return a ? [{ m, a }] : [];
  });
  const sealed = all.filter((m) => ["COLLECTING", "SEALED", "AWAITING_CONSENT"].includes(m.circle.lifecycle));
  const eligible = all.filter((m) => m.circle.lifecycle === "RELEASE_ELIGIBLE" || m.circle.lifecycle === "RELEASED");

  return (
    <>
      <PageHeader
        title="Dashboard"
        lead={<>Everything here is read from the chain for <span className="font-mono font-bold">{shortAddr(address)}</span>. Nothing is stored about you on a server.</>}
        action={<LinkButton href="/circles/new" fill="blue">New Circle →</LinkButton>}
      />
      {!hasKey && (
        <Notice tone="warn" title="This browser has no encryption key for your account" action={<LinkButton href="/settings" size="sm">Import recovery kit →</LinkButton>}>
          You can browse, but you can&apos;t consent or open a reveal from here until you create a key or import your recovery kit.
        </Notice>
      )}
      {circles.isError && <Notice tone="error" title="Couldn't read your Circles">{String(circles.error)}</Notice>}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Section title="Needs you" fill="yellow" className="md:col-span-2">
          {circles.isLoading ? (
            <p className="text-sm font-bold">Reading the chain…</p>
          ) : actions.length === 0 && pending.length === 0 ? (
            <p className="text-sm font-bold text-ink/80">Nothing waiting on you. 🎉</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2">
              {pending.map((p) => (
                <li key={p.link}>
                  <Link href={p.link} className="neo-btn flex items-center justify-between rounded-xl bg-panel px-3 py-2.5 text-sm">
                    <span>📮 Invitation to Circle #{p.circleId}</span>
                    <span className="font-extrabold">Accept or decline →</span>
                  </Link>
                </li>
              ))}
              {actions.map(({ m, a }) => (
                <li key={m.circle.circleId.toString()}>
                  <Link href={a.href} className="neo-btn flex items-center justify-between gap-3 rounded-xl bg-panel px-3 py-2.5 text-sm">
                    <span className="font-bold">Circle #{m.circle.circleId.toString()} · {a.label}</span>
                    <span aria-hidden className="font-black">→</span>
                  </Link>
                </li>
              ))}
              {reminders.map((r) => (
                <li key={`rem-${r.id}`}>
                  <Row fill="pink">🤖 Memory Steward · Circle #{r.id}: {r.text}</Row>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Sealed and collecting">
          {sealed.length === 0 ? (
            <Empty emoji="🔒" title="No sealed capsules yet" action={<LinkButton href="/explore" size="sm">Browse templates →</LinkButton>} />
          ) : (
            <div className="grid grid-cols-1 gap-3">{sealed.map((m) => <CircleRow key={m.circle.circleId.toString()} {...m} href={`/capsules/${m.circle.circleId}`} />)}</div>
          )}
        </Section>

        <Section title="Eligible and released">
          {eligible.length === 0 ? (
            <Empty emoji="🗝️" title="Nothing has opened yet">When a Circle&apos;s rule becomes true on-chain, it shows up here.</Empty>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {eligible.map((m) => {
                const d = deliveryOf(m.circle);
                return (
                  <div key={m.circle.circleId.toString()} className="grid grid-cols-1 gap-1">
                    <CircleRow {...m} href={`/capsules/${m.circle.circleId}`} />
                    {d?.kind === "RELEASE_UNAVAILABLE" && (
                      <p className="text-xs font-bold text-ink/80">Release unavailable: {d.missing} of {d.threshold} relayer receipts still missing.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="Recent activity" className="md:col-span-2" action={<Link href="/activity" className="text-sm font-extrabold underline decoration-[3px] underline-offset-2">All activity →</Link>}>
          {events.isLoading ? (
            <p className="text-sm font-bold">Reading events…</p>
          ) : (events.data ?? []).length === 0 ? (
            <p className="text-sm font-bold text-ink/70">No on-chain actions from this address yet.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2">
              {(events.data ?? []).slice(-6).reverse().map((e) => (
                <li key={`${e.transactionHash}-${e.logIndex}`}>
                  <Row className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold">
                      {e.name.replace(/([A-Z])/g, " $1").trim()}
                      {e.args.circleId !== undefined && (
                        <>
                          {" · "}
                          <Link className="underline decoration-2" href={`/verify/${String(e.args.circleId)}`}>Circle #{String(e.args.circleId)} verify →</Link>
                        </>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      {e.blockTimestamp && <span className="text-ink/70">{formatDate(e.blockTimestamp)}</span>}
                      <TxLink hash={e.transactionHash} />
                    </span>
                  </Row>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <RequireAccount>
      <Dashboard />
    </RequireAccount>
  );
}
