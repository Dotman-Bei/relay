"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { describeError } from "@relay/sdk";
import { setStewardConsent, stewardOptedIn, stewardPrompts, stewardStatus, type PromptSuggestion } from "@/lib/steward";
import { useRelay } from "@/lib/relay";
import { useWallet } from "@/lib/wallet";
import { Button, Field, inputClass, Notice, Section, Tag } from "./ui";

/** Opt-in per Circle, off by default. Sees only what's typed here — never contributions or keys. */
export function StewardPanel({ circleId, groupSize, releaseAt }: { circleId: string; groupSize: number; releaseAt: number }) {
  const { deployment } = useRelay();
  const { walletClient, address } = useWallet();
  const health = useQuery({ queryKey: ["steward-health", deployment?.steward.url], queryFn: () => stewardStatus(deployment!), enabled: Boolean(deployment?.steward.url) });
  const opted = useQuery({
    queryKey: ["steward-opt", circleId, address],
    queryFn: () => stewardOptedIn(deployment!, circleId, address!),
    enabled: Boolean(deployment?.steward.url && address),
  });
  const [theme, setTheme] = useState("");
  const [occasion, setOccasion] = useState("");
  const [tone, setTone] = useState("warm");
  const [prompts, setPrompts] = useState<{ mode: string; list: PromptSuggestion[]; note?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!deployment?.steward.url) {
    return (
      <Section title="🤖 Memory Steward">
        <p className="text-sm font-medium text-ink/80">No Memory Steward is configured on this network. It&apos;s optional: Relay works the same without it.</p>
      </Section>
    );
  }

  const toggle = async (decision: "OPT_IN" | "OPT_OUT") => {
    setError(null);
    setBusy(true);
    try {
      await setStewardConsent(deployment, walletClient!, circleId, decision);
      await opted.refetch();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="🤖 Memory Steward"
      action={health.data ? <Tag fill={health.data.mode === "MODEL" ? "pink" : "panel"}>{health.data.mode === "MODEL" ? "AI prompts" : "Template prompts"}</Tag> : <Tag fill="red">Offline</Tag>}
    >
      <div className="grid gap-3 text-sm">
        <p className="font-medium text-ink/80">
          Opt-in, for this Circle only. It suggests prompts from the theme you type below and reminds you before contributions close. It never receives your contributions or keys, can&apos;t sign
          for you, and can&apos;t change the rule. Each thing it does leaves a signed receipt.
        </p>
        {opted.data ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Tag fill="green">On for you</Tag>
              <Button size="sm" disabled={busy} onClick={() => toggle("OPT_OUT")}>Turn off</Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Theme" htmlFor="theme">
                <input id="theme" className={inputClass} value={theme} maxLength={80} onChange={(e) => setTheme(e.target.value)} placeholder="Our first flat" />
              </Field>
              <Field label="Occasion" htmlFor="occasion">
                <input id="occasion" className={inputClass} value={occasion} maxLength={80} onChange={(e) => setOccasion(e.target.value)} placeholder="Moving out" />
              </Field>
              <Field label="Tone" htmlFor="tone">
                <select id="tone" className={inputClass} value={tone} onChange={(e) => setTone(e.target.value)}>
                  {["warm", "funny", "reflective", "practical"].map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
            </div>
            <Button
              fill="pink"
              className="w-fit"
              disabled={!theme.trim() || busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const r = await stewardPrompts(deployment, {
                    circleId,
                    member: address!,
                    theme: theme.trim(),
                    occasion: occasion.trim(),
                    groupSize: Math.max(2, groupSize),
                    yearsUntilOpen: Math.max(0, (releaseAt - Date.now() / 1000) / (365.25 * 86400)),
                    tone,
                  });
                  setPrompts({ mode: r.mode, list: r.set.prompts, ...(r.note ? { note: r.note } : {}) });
                } catch (e) {
                  setError(describeError(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {theme.trim() ? (busy ? "Thinking…" : "Suggest prompts") : "Type a theme first"}
            </Button>
            {prompts && (
              <ul className="grid grid-cols-1 gap-2">
                {prompts.note && <li className="text-xs font-bold text-ink/70">{prompts.note}</li>}
                {prompts.list.map((p) => (
                  <li key={p.title} className="neo-sm rounded-xl bg-panel px-3 py-2">
                    <p className="font-extrabold">{p.title} <Tag>{p.format}</Tag></p>
                    <p className="font-medium text-ink/80">{p.prompt}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <Button fill="pink" className="w-fit" disabled={busy || !walletClient || !health.data} onClick={() => toggle("OPT_IN")}>
            {!health.data ? "Steward is offline" : busy ? "Signing…" : "Turn on for this Circle"}
          </Button>
        )}
        {error && <Notice tone="error" title="The steward didn't accept that">{error}</Notice>}
      </div>
    </Section>
  );
}
