"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { contributeFlow, kindForMime, MAX_PAYLOAD_BYTES, utf8 } from "@relay/sdk";
import { PAYLOAD_MIME_ALLOWLIST } from "@relay/protocol-types";
import { PageHeader } from "@/components/app-shell";
import { Countdown } from "@/components/chain-time";
import { RequireAccount } from "@/components/require-account";
import { StewardPanel } from "@/components/steward-panel";
import { TxStatus } from "@/components/tx-status";
import { Button, cx, Empty, Field, inputClass, LinkButton, Notice, PrimaryAction, Section } from "@/components/ui";
import { useFlowContext } from "@/lib/flow";
import { circleTitle, parseId, useCircle, useMember, useMetadata } from "@/lib/hooks";
import { useTx } from "@/lib/tx";
import { useWallet } from "@/lib/wallet";

type Kind = "text" | "image" | "audio" | "video";
const KINDS: { k: Kind; label: string; emoji: string; fill: string }[] = [
  { k: "text", label: "Letter", emoji: "✉️", fill: "bg-yellow" },
  { k: "image", label: "Photo", emoji: "📷", fill: "bg-blue" },
  { k: "audio", label: "Voice", emoji: "🎙️", fill: "bg-pink" },
  { k: "video", label: "Video", emoji: "🎬", fill: "bg-purple" },
];

function Recorder({ onDone }: { onDone: (f: File) => void }) {
  const rec = useRef<MediaRecorder | null>(null);
  const [state, setState] = useState<"idle" | "recording" | "denied">("idle");
  return state === "recording" ? (
    <Button fill="red" onClick={() => rec.current?.stop()}>⏹ Stop recording</Button>
  ) : (
    <Button
      onClick={async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const chunks: Blob[] = [];
          const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4" });
          mr.ondataavailable = (e) => chunks.push(e.data);
          mr.onstop = () => {
            stream.getTracks().forEach((t) => t.stop());
            const type = mr.mimeType.split(";")[0]!;
            onDone(new File(chunks, `voice-memo.${type.includes("webm") ? "webm" : "m4a"}`, { type }));
            setState("idle");
          };
          rec.current = mr;
          mr.start();
          setState("recording");
        } catch {
          setState("denied");
        }
      }}
    >
      {state === "denied" ? "Microphone blocked — choose a file instead" : "🎙️ Record a voice memo"}
    </Button>
  );
}

function NewContribution() {
  const id = parseId(useSearchParams().get("circleId"));
  const { address } = useWallet();
  const circle = useCircle(id);
  const me = useMember(id, address);
  const meta = useMetadata(circle.data);
  const tx = useTx();
  const ctx = useFlowContext(tx.send);
  const [kind, setKind] = useState<Kind>("text");
  const [text, setText] = useState("");
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sealed, setSealed] = useState<{ commitment: string; bytes: number } | null>(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  if (!id) return <Empty emoji="🧭" title="Which Circle?" action={<LinkButton href="/capsules">Your capsules →</LinkButton>}>Open this page from a Circle.</Empty>;
  const c = circle.data;
  if (!c) return <p className="text-sm font-bold">Reading the Circle…</p>;

  const mime = kind === "text" ? "text/plain" : file?.type.split(";")[0] ?? "";
  const allowed = (PAYLOAD_MIME_ALLOWLIST as readonly string[]).includes(mime);
  const reason = !me.data?.joined
    ? "You're not a member of this Circle"
    : !me.data.consented
      ? "Consent to the rule first"
      : me.data.contributed
        ? "You've already sealed your contribution"
        : c.lifecycle !== "AWAITING_CONSENT" && c.lifecycle !== "COLLECTING"
          ? `Contributions are closed: the Circle is ${c.lifecycle.replace(/_/g, " ").toLowerCase()}`
          : kind === "text" && !text.trim()
            ? "Write something first"
            : kind !== "text" && !file
              ? `Choose a ${KINDS.find((k) => k.k === kind)!.label.toLowerCase()} file`
              : kind !== "text" && !allowed
                ? `${mime || "This file type"} isn't supported`
                : file && file.size > MAX_PAYLOAD_BYTES
                  ? "Files must be under 48 MB"
                  : tx.blocked;
  const busy = tx.state.kind === "preparing" || tx.state.kind === "pending";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (reason || !ctx) return;
    tx.run(async () => {
      const body = kind === "text" ? utf8.encode(text) : new Uint8Array(await file!.arrayBuffer());
      const header = {
        kind: kind === "text" ? ("text" as const) : kindForMime(mime),
        mime: mime as (typeof PAYLOAD_MIME_ALLOWLIST)[number],
        ...(caption.trim() ? { caption: caption.trim() } : {}),
        ...(file ? { fileName: file.name.slice(0, 255) } : {}),
      };
      const r = await contributeFlow(ctx, { circleId: c.circleId, header, body, onStage: (s) => tx.setStage("Seal your contribution", s) });
      setSealed({ commitment: r.commitment, bytes: r.ciphertextBytes });
      setText("");
      setFile(null);
      await me.refetch();
    });
  };

  return (
    <>
      <PageHeader title={`Seal a contribution · ${circleTitle(meta.data, c.circleId)}`} lead="It's encrypted on this device before it goes anywhere. Once sealed, nobody — including you — can read it back until the Circle's rule releases it." />
      {sealed ? (
        <Section title="Sealed ✉" fill="green">
          <div className="grid gap-3 text-sm">
            <p className="font-bold">Your contribution is encrypted, stored ({(sealed.bytes / 1024).toFixed(1)} KB of ciphertext) and committed on-chain.</p>
            <p className="font-mono text-xs font-bold break-all text-ink/70">commitment {sealed.commitment}</p>
            <TxStatus state={tx.state} next={<LinkButton href={`/circles/${c.circleId}`} size="sm">Back to the Circle →</LinkButton>} />
          </div>
        </Section>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <form onSubmit={submit} className="grid content-start grid-cols-1 gap-5">
            <Section title="What are you sealing?">
              <div role="group" aria-label="Contribution type" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {KINDS.map((k) => (
                  <button
                    key={k.k}
                    type="button"
                    aria-pressed={kind === k.k}
                    onClick={() => {
                      setKind(k.k);
                      setFile(null);
                    }}
                    className={cx("neo-btn flex flex-col items-center gap-1 rounded-xl p-3 text-sm", kind === k.k ? k.fill : "bg-panel")}
                  >
                    <span aria-hidden className="text-2xl">{k.emoji}</span>
                    {k.label}
                  </button>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4">
                {kind === "text" ? (
                  <Field label="Your letter" htmlFor="letter" hint={`${text.length.toLocaleString()} characters`}>
                    <textarea id="letter" rows={10} className={inputClass} value={text} onChange={(e) => setText(e.target.value)} placeholder="Dear us, in a few years…" />
                  </Field>
                ) : (
                  <Field label={`${KINDS.find((k) => k.k === kind)!.label} file`} htmlFor="file" hint="Stays on this device until it is encrypted. Max 48 MB.">
                    <input
                      id="file"
                      type="file"
                      className={inputClass}
                      accept={(PAYLOAD_MIME_ALLOWLIST as readonly string[]).filter((m) => m.startsWith(kind)).join(",")}
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                  </Field>
                )}
                {kind === "audio" && <Recorder onDone={setFile} />}
                {preview && kind === "image" && <img src={preview} alt="Preview of your photo" className="neo-flat max-h-64 w-fit rounded-xl" />}
                {preview && kind === "audio" && <audio controls src={preview} className="w-full" />}
                {preview && kind === "video" && <video controls src={preview} className="neo-flat max-h-64 rounded-xl" />}
                <Field label="Caption (optional)" htmlFor="caption" hint="Encrypted with the contribution.">
                  <input id="caption" className={inputClass} maxLength={2000} value={caption} onChange={(e) => setCaption(e.target.value)} />
                </Field>
              </div>
            </Section>
            <TxStatus state={tx.state} onRetry={tx.retry} />
            <PrimaryAction ready={!reason && !busy} label={busy ? (tx.state.kind === "preparing" ? `${tx.state.stage}…` : "Waiting for confirmation…") : (reason ?? "Encrypt and seal it")} />
          </form>
          <div className="grid content-start grid-cols-1 gap-5">
            <Section title="Contributions close">
              <Countdown to={c.policy.sealAt} label="Closes" done="Closed" />
            </Section>
            {me.data?.joined && <StewardPanel circleId={c.circleId.toString()} groupSize={c.memberCount} releaseAt={c.policy.releaseAt} />}
            <Notice tone="info" title="What leaves this device">
              Ciphertext (padded, so its exact size is hidden), a manifest of key shares encrypted to the relayers, and a 32-byte hash on-chain. The key itself is split and then forgotten here.
            </Notice>
          </div>
        </div>
      )}
    </>
  );
}

export default function Page() {
  return (
    <RequireAccount>
      <Suspense>
        <NewContribution />
      </Suspense>
    </RequireAccount>
  );
}
