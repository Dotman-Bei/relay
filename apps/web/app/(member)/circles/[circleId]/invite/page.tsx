"use client";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { acceptInviteFlow, decodeInviteFragment, issueInvitesFlow, type InviteSecret } from "@relay/sdk";
import { PageHeader } from "@/components/app-shell";
import { InviteLinkList } from "@/components/copy";
import { RuleCard } from "@/components/rule";
import { LifecycleTag } from "@/components/state";
import { TxStatus } from "@/components/tx-status";
import { Button, Empty, Field, inputClass, LinkButton, Notice, PrimaryAction, Section } from "@/components/ui";
import { loadIssuedInvites, saveIssuedInvites, useFlowContext } from "@/lib/flow";
import { circleTitle, parseId, useCircle, useMember, useMetadata } from "@/lib/hooks";
import { circleScope, getCircleKey, setCircleKey } from "@/lib/keys";
import { useRelay } from "@/lib/relay";
import { useTx } from "@/lib/tx";
import { useWallet } from "@/lib/wallet";

const PENDING = "relay:pending-invites:v1";
const readPending = (): { circleId: string; link: string }[] => {
  try {
    return JSON.parse(localStorage.getItem(PENDING) ?? "[]");
  } catch {
    return [];
  }
};
const writePending = (v: { circleId: string; link: string }[]) => {
  try {
    localStorage.setItem(PENDING, JSON.stringify(v));
  } catch {
    /* ignore */
  }
};

function Invitee({ secret, link }: { secret: InviteSecret; link: string }) {
  const { reader, deployment, network } = useRelay();
  const { address, ready } = useWallet();
  const circle = useCircle(secret.circleId);
  const me = useMember(secret.circleId, address);
  const meta = useMetadata(circle.data);
  const tx = useTx();
  const ctx = useFlowContext(tx.send);
  const [declined, setDeclined] = useState(false);
  const inviteState = useQuery({
    queryKey: ["invite-state", network, secret.circleId.toString(), secret.inviteKey],
    queryFn: () => reader!.inviteStateOf(secret.circleId, secret.inviteKey),
    enabled: Boolean(reader),
    refetchInterval: 8000,
  });

  if (declined) {
    return (
      <Section>
        <Empty emoji="👋" title="Declined" action={<LinkButton href="/app">Back to your dashboard →</LinkButton>}>
          Nothing was written on-chain. The link stays unused and this browser forgot it.
        </Empty>
      </Section>
    );
  }
  const c = circle.data;
  const done = tx.state.kind === "success";
  const reason = !ready
    ? "Loading…"
    : !address
      ? null
      : me.data?.joined
        ? "You're already in this Circle"
        : inviteState.data === 2
          ? "This invitation was already used"
          : inviteState.data === 0
            ? "This invitation isn't registered for this Circle"
            : c?.lifecycle === "DRAFT"
              ? "The creator hasn't published the rule yet — come back soon"
              : c && c.lifecycle !== "AWAITING_CONSENT" && c.lifecycle !== "COLLECTING"
                ? `Joining is closed: the Circle is ${c.lifecycle.replace(/_/g, " ").toLowerCase()}`
                : c && c.memberCount >= c.policy.capacity
                  ? "This Circle is full"
                  : tx.blocked;

  return (
    <>
      <PageHeader title={`📮 ${circleTitle(meta.data, secret.circleId)}`} lead={meta.data?.description ?? "You've been invited to a Relay Circle."} />
      {c && (
        <div className="flex flex-wrap items-center gap-2">
          <LifecycleTag state={c.lifecycle} />
          <span className="text-xs font-bold text-ink/70">{c.memberCount} of {c.policy.capacity} joined · {c.contributionCount} sealed so far</span>
        </div>
      )}
      {c && <RuleCard policy={c.policy} policyHash={c.policyHash} locked={c.ruleLocked} relayers={deployment?.quorum.relayers ?? []} />}
      <Section title="Accept or decline">
        <div className="grid gap-3 text-sm">
          <p className="font-medium text-ink/80">
            Joining records your address as a member on-chain. It doesn&apos;t commit you to anything else: you&apos;ll review the rule and consent as a separate step, and you can still walk away before
            consenting.
          </p>
          {!address ? (
            <LinkButton href={`/onboarding?next=${encodeURIComponent(link)}`} fill="yellow" className="w-fit">Connect to accept →</LinkButton>
          ) : done ? (
            <LinkButton href={`/circles/${secret.circleId}/consent`} fill="blue" className="w-fit">Next: review the rule and consent →</LinkButton>
          ) : (
            <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
              <PrimaryAction
                type="button"
                ready={!reason && Boolean(ctx)}
                label={reason ?? (tx.state.kind === "pending" || tx.state.kind === "preparing" ? "Joining…" : "Accept invitation")}
                onClick={() =>
                  tx.run(async () => {
                    await acceptInviteFlow(ctx!, secret);
                    writePending(readPending().filter((p) => p.link !== link));
                    await me.refetch();
                  })
                }
              />
              <Button
                onClick={() => {
                  writePending(readPending().filter((p) => p.link !== link));
                  setDeclined(true);
                }}
              >
                Decline
              </Button>
            </div>
          )}
          <TxStatus state={tx.state} onRetry={tx.retry} />
        </div>
      </Section>
    </>
  );
}

function CreatorLinks({ circleId }: { circleId: bigint }) {
  const { deployment } = useRelay();
  const { address } = useWallet();
  const circle = useCircle(circleId);
  const meta = useMetadata(circle.data);
  const tx = useTx();
  const ctx = useFlowContext(tx.send);
  const [count, setCount] = useState(1);
  const [links, setLinks] = useState<string[]>([]);
  const scope = deployment ? circleScope(deployment.chainId, deployment.contract.address) : null;
  useEffect(() => {
    if (scope) setLinks(loadIssuedInvites(scope, circleId.toString()));
  }, [scope, circleId]);

  const c = circle.data;
  if (!c) return <p className="text-sm font-bold">Reading Circle #{circleId.toString()}…</p>;
  const isCreator = address?.toLowerCase() === c.creator.toLowerCase();
  if (!isCreator) {
    return (
      <Section>
        <Empty emoji="📮" title="Open the link you were sent">Invitations arrive as a full link. Only the Circle&apos;s creator can make new ones.</Empty>
      </Section>
    );
  }
  const metadataKey = scope ? getCircleKey(scope, circleId) : null;
  const open = c.lifecycle === "DRAFT" || c.lifecycle === "AWAITING_CONSENT" || c.lifecycle === "COLLECTING";
  const room = c.policy.capacity - c.memberCount;
  const reason = !open ? `Invitations are closed: the Circle is ${c.lifecycle.replace(/_/g, " ").toLowerCase()}` : count < 1 || count > 32 ? "Choose 1 to 32 links" : tx.blocked;

  return (
    <>
      <PageHeader title={`Invitations · ${circleTitle(meta.data, circleId)}`} lead={`${room} seat${room === 1 ? "" : "s"} left of ${c.policy.capacity}. Each link seats one person, once.`} />
      {!metadataKey && (
        <Notice tone="warn" title="This browser doesn't hold this Circle's key">New links will work, but invitees won&apos;t see the Circle&apos;s name. Import your recovery kit in Settings to fix that.</Notice>
      )}
      <Section title="Make links">
        <form
          className="grid gap-3 sm:grid-cols-[10rem_1fr] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason || !ctx || !scope) return;
            tx.run(async () => {
              const issued = await issueInvitesFlow(ctx, { circleId, count, metadataKey, baseUrl: window.location.origin });
              const made = issued.invites.map((i) => i.link);
              saveIssuedInvites(scope, circleId.toString(), made);
              setLinks((l) => [...l, ...made]);
            });
          }}
        >
          <Field label="How many" htmlFor="count">
            <input id="count" type="number" min={1} max={32} className={inputClass} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </Field>
          <PrimaryAction ready={!reason} label={reason ?? `Create ${count} link${count === 1 ? "" : "s"}`} />
        </form>
        <div className="mt-3">
          <TxStatus state={tx.state} onRetry={tx.retry} />
        </div>
      </Section>
      <Section title="Links made in this browser">
        {links.length === 0 ? <p className="text-sm font-bold text-ink/70">None yet. Links are secrets; the chain only knows their public half.</p> : <InviteLinkList links={links} />}
      </Section>
    </>
  );
}

export default function InvitePage() {
  const pathId = parseId(useParams().circleId as string);
  const { deployment } = useRelay();
  const [secret, setSecret] = useState<InviteSecret | null | undefined>(undefined);
  const [link, setLink] = useState("");

  useEffect(() => {
    const s = decodeInviteFragment(window.location.hash);
    setSecret(s);
    setLink(`${window.location.pathname}${window.location.hash}`);
    if (s) {
      const pending = readPending();
      const full = `${window.location.pathname}${window.location.hash}`;
      if (!pending.some((p) => p.link === full)) writePending([...pending, { circleId: s.circleId.toString(), link: full }]);
    }
  }, []);

  useEffect(() => {
    if (secret?.metadataKey && deployment) {
      setCircleKey(circleScope(deployment.chainId, deployment.contract.address), secret.circleId, secret.metadataKey);
      window.dispatchEvent(new Event("relay:keys-changed"));
    }
  }, [secret, deployment]);

  if (secret === undefined || !pathId) return <p className="text-sm font-bold">Reading the invitation…</p>;
  if (secret && secret.circleId !== pathId) return <Notice tone="error" title="This link is damaged">The invitation inside the link is for a different Circle than the page. Ask for a new link.</Notice>;
  return secret ? <Invitee secret={secret} link={link} /> : <CreatorLinks circleId={pathId} />;
}
