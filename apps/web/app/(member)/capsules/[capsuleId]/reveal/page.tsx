"use client";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { decryptReflection, describeError, encryptReflection, openCapsuleFlow, reflectionTag, utf8, type OpenedCapsuleItem } from "@relay/sdk";
import { PageHeader } from "@/components/app-shell";
import { AddrLink } from "@/components/hash";
import { RequireAccount } from "@/components/require-account";
import { deliveryOf } from "@/components/state";
import { Button, Empty, Field, inputClass, LinkButton, Notice, Section, Tag } from "@/components/ui";
import { formatDate, shortAddr } from "@/lib/format";
import { circleTitle, parseId, useCircle, useMember, useMetadata } from "@/lib/hooks";
import { circleScope, getCircleKey, getEncryptionJwk } from "@/lib/keys";
import { useRelay } from "@/lib/relay";
import { useWallet } from "@/lib/wallet";

/** Render one opened contribution. Only allowlisted media types reach here (schema-validated). */
function Opened({ item }: { item: OpenedCapsuleItem }) {
  const url = useMemo(() => {
    if (!item.opened || item.opened.header.kind === "text") return null;
    return URL.createObjectURL(new Blob([item.opened.body.slice().buffer as ArrayBuffer], { type: item.opened.header.mime }));
  }, [item]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  if (!item.opened) {
    return (
      <div className="neo-sm rounded-xl bg-red p-4 text-sm">
        <p className="font-extrabold">Couldn&apos;t open {shortAddr(item.contributor)}&apos;s contribution</p>
        <p className="mt-1 font-medium text-ink/80">{item.error}</p>
      </div>
    );
  }
  const h = item.opened.header;
  return (
    <figure className="neo flex flex-col gap-3 rounded-2xl bg-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <AddrLink address={item.contributor} />
        <Tag>{h.kind}</Tag>
      </div>
      {h.kind === "text" && <p className="text-base font-medium whitespace-pre-wrap">{utf8.decode(item.opened.body)}</p>}
      {h.kind === "image" && url && <img src={url} alt={h.caption ?? `Photo from ${shortAddr(item.contributor)}`} className="neo-flat w-full rounded-xl [image-rendering:auto]" />}
      {h.kind === "audio" && url && <audio controls src={url} className="w-full" />}
      {h.kind === "video" && url && <video controls src={url} className="neo-flat w-full rounded-xl" />}
      {h.caption && <figcaption className="text-sm font-bold text-ink/80">{h.caption}</figcaption>}
    </figure>
  );
}

function Reveal() {
  const id = parseId(useParams().capsuleId as string);
  const { deployment, reader, store } = useRelay();
  const { address } = useWallet();
  const circle = useCircle(id);
  const me = useMember(id, address);
  const meta = useMetadata(circle.data);
  const [items, setItems] = useState<OpenedCapsuleItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reflections, setReflections] = useState<{ author: string; text: string; at: string }[]>([]);
  const [draft, setDraft] = useState("");

  const metaKey = deployment && id ? getCircleKey(circleScope(deployment.chainId, deployment.contract.address), id) : null;
  const loadReflections = async () => {
    if (!metaKey || !deployment) return;
    try {
      const tag = await reflectionTag(metaKey);
      const r = await fetch(`${deployment.storage.url.replace(/\/$/, "")}/v1/reflections/${tag}`);
      const body = (await r.json()) as { items: { iv: string; ct: string }[] };
      const out = [];
      for (const it of body.items) {
        try {
          out.push(await decryptReflection(metaKey, it));
        } catch {
          /* not decryptable with this key: skip */
        }
      }
      setReflections(out);
    } catch {
      setReflections([]);
    }
  };

  if (!id) return <Empty emoji="🧭" title="That isn't a capsule id" />;
  const c = circle.data;
  if (!c) return <p className="text-sm font-bold">Reading the capsule…</p>;
  const d = deliveryOf(c);
  const jwk = address ? getEncryptionJwk(address) : null;

  const gate = c.lifecycle !== "RELEASED"
    ? d?.kind === "RELEASE_UNAVAILABLE"
      ? `Release unavailable: ${d.missing} of ${d.threshold} relayer receipts are still missing`
      : `Not released: the Circle is ${c.lifecycle.replace(/_/g, " ").toLowerCase()}`
    : !me.data?.consented
      ? "Only members who consented are entitled to the reveal"
      : !jwk
        ? "This browser doesn't hold your encryption key — import your recovery kit in Settings"
        : null;

  return (
    <>
      <PageHeader title={`🎉 ${circleTitle(meta.data, c.circleId)}`} lead={`Opened together. ${c.contributionCount} contribution${c.contributionCount === 1 ? "" : "s"}, released on-chain at ${formatDate(c.eligibleAt || c.policy.releaseAt)}.`} />
      {gate ? (
        <Notice tone={d?.kind === "RELEASE_UNAVAILABLE" ? "warn" : "info"} title={gate} action={<LinkButton href={`/capsules/${c.circleId}`} size="sm">Back to the capsule →</LinkButton>}>
          Nothing is decrypted until the release path succeeds: eligibility on-chain, enough relayer receipts, and your own key.
        </Notice>
      ) : items === null ? (
        <Section fill="green">
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-2xl font-black">{c.receiptCount} relayers delivered your key shares.</p>
            <p className="max-w-md text-sm font-medium text-ink/80">Opening fetches the sealed envelopes, checks every hash against the chain, combines your shares and decrypts — all in this browser.</p>
            <Button
              fill="yellow"
              size="lg"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const r = await openCapsuleFlow({ chainId: deployment!.chainId, registry: deployment!.contract.address, account: address!, reader: reader!, store: store! }, { circleId: c.circleId, privateJwk: jwk! });
                  setItems(r.items);
                  await loadReflections();
                } catch (e) {
                  setError(describeError(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Opening…" : "Open it"}
            </Button>
            {error && <Notice tone="error" title="Couldn't open the capsule">{error}</Notice>}
          </div>
        </Section>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{items.map((it) => <Opened key={it.commitment} item={it} />)}</div>
          <Section title="Reflections">
            {metaKey ? (
              <div className="grid grid-cols-1 gap-3">
                <p className="text-sm font-medium text-ink/80">Say something now that it&apos;s open. Reflections are encrypted with the Circle&apos;s key; only members with the invite key can read them.</p>
                {reflections.map((r) => (
                  <div key={`${r.author}-${r.at}`} className="neo-sm rounded-xl bg-panel px-3 py-2 text-sm">
                    <p className="font-mono text-xs font-bold text-ink/60">{shortAddr(r.author)} · {new Date(r.at).toLocaleString()}</p>
                    <p className="font-medium whitespace-pre-wrap">{r.text}</p>
                  </div>
                ))}
                <form
                  className="grid grid-cols-1 gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!draft.trim() || !deployment) return;
                    const blob = await encryptReflection(metaKey, address!, draft.trim());
                    await fetch(`${deployment.storage.url.replace(/\/$/, "")}/v1/reflections/${await reflectionTag(metaKey)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(blob) });
                    setDraft("");
                    await loadReflections();
                  }}
                >
                  <Field label="Your reflection" htmlFor="reflection">
                    <textarea id="reflection" rows={3} className={inputClass} value={draft} maxLength={4000} onChange={(e) => setDraft(e.target.value)} />
                  </Field>
                  <Button type="submit" fill="blue" className="w-fit" disabled={!draft.trim()}>{draft.trim() ? "Share with the Circle" : "Write something first"}</Button>
                </form>
              </div>
            ) : (
              <p className="text-sm font-bold text-ink/70">Reflections need the Circle&apos;s key from your invite link or recovery kit.</p>
            )}
          </Section>
        </>
      )}
    </>
  );
}

export default function Page() {
  return (
    <RequireAccount>
      <Reveal />
    </RequireAccount>
  );
}
