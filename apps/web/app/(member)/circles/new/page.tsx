"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { createCircleFlow, issueInvitesFlow } from "@relay/sdk";
import { PageHeader } from "@/components/app-shell";
import { InviteLinkList } from "@/components/copy";
import { RequireAccount } from "@/components/require-account";
import { draftFromTemplate, RuleForm, ruleProblem, type RuleDraft } from "@/components/rule-form";
import { TxStatus } from "@/components/tx-status";
import { Field, inputClass, LinkButton, PrimaryAction, Section, Tag } from "@/components/ui";
import { saveIssuedInvites, useFlowContext } from "@/lib/flow";
import { circleScope, setCircleKey } from "@/lib/keys";
import { useRelay } from "@/lib/relay";
import { templateById } from "@/lib/templates";
import { useTx } from "@/lib/tx";

function NewCircle() {
  const params = useSearchParams();
  const template = templateById(params.get("template"));
  const { deployment } = useRelay();
  const tx = useTx();
  const ctx = useFlowContext(tx.send);
  const [title, setTitle] = useState(template?.title ?? "");
  const [description, setDescription] = useState(template?.blurb ?? "");
  const [emoji, setEmoji] = useState(template?.emoji ?? "🔒");
  const [rule, setRule] = useState<RuleDraft>(() => draftFromTemplate(template, deployment));
  const [invites, setInvites] = useState(1);
  const [openNow, setOpenNow] = useState(true);
  const [result, setResult] = useState<{ circleId: bigint; links: string[] } | null>(null);

  // Relayers arrive with the deployment record; fill them in once it loads.
  useEffect(() => {
    if (deployment && rule.relayers.length === 0) setRule(draftFromTemplate(template, deployment));
  }, [deployment]); // eslint-disable-line react-hooks/exhaustive-deps

  const problem = !title.trim()
    ? "Give the Circle a name"
    : (ruleProblem(rule) ?? tx.blocked);
  const busy = tx.state.kind === "preparing" || tx.state.kind === "pending";
  const label = busy ? "Working…" : problem ?? `Create Circle${openNow ? " and publish the rule" : " as a draft"}${invites ? ` · ${invites} invite link${invites === 1 ? "" : "s"}` : ""}`;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ctx || problem || !deployment) return;
    tx.run(async () => {
      const created = await createCircleFlow(ctx, {
        policy: { ...rule, relayers: rule.relayers },
        metadata: { v: 1, title: title.trim(), description: description.trim(), emoji, ...(template ? { templateId: template.id } : {}) },
        open: openNow,
      });
      const scope = circleScope(deployment.chainId, deployment.contract.address);
      setCircleKey(scope, created.circleId, created.metadataKey);
      let links: string[] = [];
      if (invites > 0) {
        const issued = await issueInvitesFlow(ctx, { circleId: created.circleId, count: invites, metadataKey: created.metadataKey, baseUrl: window.location.origin });
        links = issued.invites.map((i) => i.link);
        saveIssuedInvites(scope, created.circleId.toString(), links);
      }
      setResult({ circleId: created.circleId, links });
    });
  };

  return (
    <>
      <PageHeader
        title="New Circle"
        lead="Write the rule before anyone joins. Once another member consents to it, the contract won't let anyone — including you — change it."
        action={template ? <Tag fill="orange">{template.emoji} Template: {template.title}</Tag> : undefined}
      />
      {result ? (
        <Section title="Your Circle exists on-chain" fill="green">
          <div className="grid grid-cols-1 gap-3">
            <p className="text-sm font-bold">Circle #{result.circleId.toString()} · {openNow ? "rule published — people can join and consent" : "draft — publish it when you're ready"}.</p>
            {result.links.length > 0 && (
              <>
                <p className="text-sm font-medium text-ink/80">Each link seats one person, once. Anyone holding a link can use it, so send them privately. They are saved in this browser only.</p>
                <InviteLinkList links={result.links} />
              </>
            )}
            <div className="flex flex-wrap gap-2">
              <LinkButton href={`/circles/${result.circleId}/consent`} fill="blue">Consent to your own rule →</LinkButton>
              <LinkButton href={`/circles/${result.circleId}`}>Open the Circle →</LinkButton>
            </div>
          </div>
        </Section>
      ) : (
        <form onSubmit={submit} className="grid grid-cols-1 gap-5">
          <Section title="About the Circle">
            <div className="grid grid-cols-1 gap-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
                <Field label="Name" htmlFor="title" hint="Encrypted before upload. Only people with an invite link can read it.">
                  <input id="title" className={inputClass} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Class of '26" />
                </Field>
                <Field label="Emoji" htmlFor="emoji">
                  <input id="emoji" className={inputClass} maxLength={8} value={emoji} onChange={(e) => setEmoji(e.target.value)} />
                </Field>
              </div>
              <Field label="What's it for?" htmlFor="description" hint="Also encrypted. The chain only stores its hash.">
                <textarea id="description" rows={3} className={inputClass} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
            </div>
          </Section>
          <Section title="The rule">
            <RuleForm value={rule} onChange={setRule} deployment={deployment} />
          </Section>
          <Section title="Invitations">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Invite links to create now" htmlFor="invites" hint="You can make more later. Max 32 at a time.">
                <input id="invites" type="number" min={0} max={Math.min(32, rule.capacity - 1)} className={inputClass} value={invites} onChange={(e) => setInvites(Math.max(0, Math.min(32, Number(e.target.value))))} />
              </Field>
              <label className="neo-sm flex cursor-pointer items-start gap-3 self-end rounded-xl bg-panel p-3 text-sm">
                <input type="checkbox" className="mt-1 accent-black" checked={openNow} onChange={(e) => setOpenNow(e.target.checked)} />
                <span>
                  <span className="font-extrabold">Publish the rule now</span>
                  <span className="block font-medium text-ink/80">Unchecked keeps it a draft: links work only after you publish.</span>
                </span>
              </label>
            </div>
          </Section>
          <TxStatus state={tx.state} onRetry={tx.retry} />
          <PrimaryAction ready={!problem && !busy} label={label} />
        </form>
      )}
    </>
  );
}

export default function Page() {
  return (
    <RequireAccount>
      <Suspense>
        <NewCircle />
      </Suspense>
    </RequireAccount>
  );
}
