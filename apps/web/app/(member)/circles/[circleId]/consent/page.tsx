"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { consentFlow } from "@relay/sdk";
import { PageHeader } from "@/components/app-shell";
import { RecoveryKitButton } from "@/components/recovery";
import { RequireAccount } from "@/components/require-account";
import { RuleCard } from "@/components/rule";
import { TxStatus } from "@/components/tx-status";
import { Empty, LinkButton, Notice, PrimaryAction, Section } from "@/components/ui";
import { useFlowContext } from "@/lib/flow";
import { circleTitle, parseId, useCircle, useMember, useMetadata } from "@/lib/hooks";
import { ensureEncryptionKey, getEncryptionJwk } from "@/lib/keys";
import { useRelay } from "@/lib/relay";
import { useTx } from "@/lib/tx";
import { useWallet } from "@/lib/wallet";

function Consent() {
  const id = parseId(useParams().circleId as string);
  const { deployment } = useRelay();
  const { address } = useWallet();
  const circle = useCircle(id);
  const me = useMember(id, address);
  const meta = useMetadata(circle.data);
  const tx = useTx();
  const ctx = useFlowContext(tx.send);
  const [agree, setAgree] = useState(false);
  const [reviewed, setReviewed] = useState<`0x${string}` | null>(null);
  const [hasKey, setHasKey] = useState(true);

  useEffect(() => {
    if (address) setHasKey(Boolean(getEncryptionJwk(address)));
  }, [address]);
  // Freeze the hash the member actually looked at; if the rule changes underneath, the contract rejects it.
  useEffect(() => {
    if (circle.data && !reviewed) setReviewed(circle.data.policyHash);
  }, [circle.data, reviewed]);

  if (!id) return <Empty emoji="🧭" title="That isn't a Circle id" />;
  const c = circle.data;
  if (!c) return <p className="text-sm font-bold">Reading the rule from the chain…</p>;
  const changed = reviewed && reviewed !== c.policyHash;
  const done = tx.state.kind === "success";
  const reason = !me.data?.joined
    ? "You're not a member of this Circle"
    : me.data.consented
      ? "You've already consented"
      : c.lifecycle !== "AWAITING_CONSENT" && c.lifecycle !== "COLLECTING"
        ? `Consent is closed: the Circle is ${c.lifecycle.replace(/_/g, " ").toLowerCase()}`
        : changed
          ? "The rule changed while you were reading — review it again"
          : !agree
            ? "Tick the box to confirm you've read the rule"
            : tx.blocked;

  return (
    <>
      <PageHeader title={`Consent · ${circleTitle(meta.data, c.circleId)}`} lead="This is the exact rule your consent will name. Read the numbers; they are what the contract enforces." />
      {changed && (
        <Notice tone="warn" title="The creator changed the rule" action={<LinkButton href={`/circles/${c.circleId}/consent`} size="sm" onClick={() => setReviewed(c.policyHash)}>Show me the new rule</LinkButton>}>
          You were reading rule {reviewed!.slice(0, 12)}…; the Circle now has {c.policyHash.slice(0, 12)}…. Your consent would be rejected, so review it again.
        </Notice>
      )}
      <RuleCard policy={c.policy} policyHash={reviewed ?? c.policyHash} locked={c.ruleLocked} relayers={deployment?.quorum.relayers ?? []} />
      <Section title="What consenting means">
        <ul className="grid gap-2 text-sm font-medium text-ink/80">
          <li>✍️ Your consent is a transaction that names this rule&apos;s hash. It can&apos;t be moved to another rule.</li>
          <li>🔒 Once any member other than the creator consents, nobody can change the rule — not even the creator.</li>
          <li>🗝️ Consenting publishes your encryption key&apos;s fingerprint, so relayers can deliver your share of the reveal. Only consenting members are entitled to it.</li>
          <li>✉️ You can contribute only after consenting, and only once.</li>
        </ul>
      </Section>
      {!hasKey && address && (
        <Notice tone="warn" title="This browser has no encryption key for you yet" action={<RecoveryKitButton account={address} label="Save a recovery kit after creating it" />}>
          One will be created when you consent. Save your recovery kit right after — Relay can&apos;t recover it.
        </Notice>
      )}
      <Section>
        {done ? (
          <div className="grid grid-cols-1 gap-3">
            <TxStatus state={tx.state} confirmedState={<>You&apos;re on record as consenting to rule {c.policyHash.slice(0, 12)}….</>} next={<LinkButton href={`/capsules/new?circleId=${c.circleId}`} fill="blue" size="sm">Seal your contribution →</LinkButton>} />
            {address && <RecoveryKitButton account={address} label="Download an updated recovery kit" />}
          </div>
        ) : (
          <form
            className="grid grid-cols-1 gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (reason || !ctx || !reviewed) return;
              tx.run(async () => {
                const key = await ensureEncryptionKey(address!);
                setHasKey(true);
                await consentFlow(ctx, { circleId: c.circleId, reviewedPolicyHash: reviewed, publicKey: key.publicKey });
                await me.refetch();
              });
            }}
          >
            <label className="flex items-start gap-2 text-sm font-bold">
              <input type="checkbox" className="mt-1 accent-black" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              I&apos;ve read this rule. I understand it can&apos;t be changed once another member consents, and that Relay can&apos;t recover my encryption key.
            </label>
            <PrimaryAction ready={!reason} label={reason ?? `Consent to rule ${c.policyHash.slice(0, 10)}…`} />
            <TxStatus state={tx.state} onRetry={tx.retry} />
          </form>
        )}
      </Section>
    </>
  );
}

export default function Page() {
  return (
    <RequireAccount>
      <Consent />
    </RequireAccount>
  );
}
