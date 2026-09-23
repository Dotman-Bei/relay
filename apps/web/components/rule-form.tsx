"use client";
import { useMemo, useState } from "react";
import type { Deployment, Policy } from "@relay/protocol-types";
import { POLICY_CODES } from "@relay/protocol-types";
import { validatePolicy } from "@relay/reference";
import { nowSeconds } from "@/lib/format";
import type { Template } from "@/lib/templates";
import { ChainTime } from "./chain-time";
import { Field, inputClass, Tag } from "./ui";

const toLocal = (unix: number) => {
  const d = new Date(unix * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocal = (s: string) => (s ? Math.floor(new Date(s).getTime() / 1000) : 0);

export interface RuleDraft {
  sealAt: number;
  releaseAt: number;
  expiresAt: number;
  capacity: number;
  minContributions: number;
  unanimousConsent: boolean;
  receiptThreshold: number;
  relayers: `0x${string}`[];
}

export function draftFromTemplate(t: Template | null, d: Deployment | null): RuleDraft {
  const now = nowSeconds();
  const collect = (t?.collectDays ?? 7) * 86400;
  const years = t?.years ?? 1;
  const relayers = d?.quorum.relayers.map((r) => r.address) ?? [];
  return {
    sealAt: now + collect,
    releaseAt: now + collect + Math.round(years * 365.25 * 86400),
    expiresAt: 0,
    capacity: t?.capacity ?? 8,
    minContributions: t?.minContributions ?? 2,
    unanimousConsent: t?.unanimous ?? false,
    receiptThreshold: Math.min(d?.quorum.defaultThreshold ?? 2, Math.max(1, relayers.length)),
    relayers,
  };
}

export function draftFromPolicy(p: Policy): RuleDraft {
  return { ...p, relayers: [...p.relayers] };
}

/** The first reason the contract would reject this rule, or null. Mirrors CapsuleRegistry._validatePolicy. */
export function ruleProblem(r: RuleDraft, joinedMembers = 1): string | null {
  const v = validatePolicy(r as Policy, nowSeconds() + 30, () => true);
  if (v && "code" in v) return POLICY_CODES[v.code as keyof typeof POLICY_CODES];
  if (r.capacity < joinedMembers) return `Capacity can't drop below the ${joinedMembers} members already joined`;
  return null;
}

export function RuleForm({ value, onChange, deployment }: { value: RuleDraft; onChange: (r: RuleDraft) => void; deployment: Deployment | null }) {
  const [expiry, setExpiry] = useState(value.expiresAt !== 0);
  const set = (patch: Partial<RuleDraft>) => onChange({ ...value, ...patch });
  const quorum = deployment?.quorum.relayers ?? [];
  const problem = useMemo(() => ruleProblem(value), [value]);
  const demoTiming = () => {
    const now = nowSeconds();
    set({ sealAt: now + 5 * 60, releaseAt: now + 10 * 60, expiresAt: expiry ? now + 24 * 3600 : 0 });
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contributions close" htmlFor="sealAt" hint={<ChainTime unix={value.sealAt} />}>
          <input id="sealAt" type="datetime-local" className={inputClass} value={toLocal(value.sealAt)} onChange={(e) => set({ sealAt: fromLocal(e.target.value) })} />
        </Field>
        <Field label="Opens no earlier than" htmlFor="releaseAt" hint={<ChainTime unix={value.releaseAt} />}>
          <input id="releaseAt" type="datetime-local" className={inputClass} value={toLocal(value.releaseAt)} onChange={(e) => set({ releaseAt: fromLocal(e.target.value) })} />
        </Field>
      </div>
      <button type="button" onClick={demoTiming} className="w-fit text-xs inline-flex min-h-6 items-center font-extrabold underline decoration-2 underline-offset-2 pointer-coarse:min-h-11">
        Use demo timing: close in 5 min, open in 10 min
      </button>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="People, including you" htmlFor="capacity" hint="2 to 64">
          <input id="capacity" type="number" min={2} max={64} className={inputClass} value={value.capacity} onChange={(e) => set({ capacity: Number(e.target.value) })} />
        </Field>
        <Field label="Contributions needed to open" htmlFor="minContributions" hint={`1 to ${value.capacity}`}>
          <input id="minContributions" type="number" min={1} max={value.capacity} className={inputClass} value={value.minContributions} onChange={(e) => set({ minContributions: Number(e.target.value) })} />
        </Field>
      </div>

      <fieldset className="grid grid-cols-1 gap-2">
        <legend className="neo-label mb-1 text-xs">Whose consent counts</legend>
        {[
          { v: false, t: "Each contributor consents", d: "Anyone who contributes has consented. People who join but never consent don't block the release." },
          { v: true, t: "Everyone who joins must consent", d: "Unanimous. One member who joins and never consents keeps it sealed — pick an expiry if that worries you." },
        ].map((o) => (
          <label key={String(o.v)} className={`neo-sm flex cursor-pointer gap-3 rounded-xl p-3 text-sm ${value.unanimousConsent === o.v ? "bg-yellow" : "bg-panel"}`}>
            <input type="radio" name="consent" className="mt-1 accent-black" checked={value.unanimousConsent === o.v} onChange={() => set({ unanimousConsent: o.v })} />
            <span>
              <span className="font-extrabold">{o.t}</span>
              <span className="block font-medium text-ink/80">{o.d}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="grid grid-cols-1 gap-2">
        <label className="flex min-h-6 items-center gap-2 text-sm font-bold pointer-coarse:min-h-11">
          <input type="checkbox" className="accent-black" checked={expiry} onChange={(e) => { setExpiry(e.target.checked); set({ expiresAt: e.target.checked ? value.releaseAt + 365 * 86400 : 0 }); }} />
          Give up if it can&apos;t open by a date (expiry)
        </label>
        {expiry && (
          <Field label="Expires" htmlFor="expiresAt" hint={<ChainTime unix={value.expiresAt} />}>
            <input id="expiresAt" type="datetime-local" className={inputClass} value={toLocal(value.expiresAt)} onChange={(e) => set({ expiresAt: fromLocal(e.target.value) })} />
          </Field>
        )}
      </div>

      <fieldset className="grid grid-cols-1 gap-2">
        <legend className="neo-label mb-1 text-xs">Release quorum</legend>
        {quorum.length === 0 && <p className="text-sm font-bold text-ink/70">No relayers are listed in this network&apos;s deployment record.</p>}
        {quorum.map((r) => {
          const on = value.relayers.some((a) => a.toLowerCase() === r.address.toLowerCase());
          return (
            <label key={r.address} className="neo-flat flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-panel p-2.5 text-sm pointer-coarse:min-h-11">
              <input
                type="checkbox"
                className="accent-black"
                checked={on}
                onChange={() => set({ relayers: on ? value.relayers.filter((a) => a.toLowerCase() !== r.address.toLowerCase()) : [...value.relayers, r.address] })}
              />
              <span className="font-mono text-xs font-bold">{r.address.slice(0, 10)}…</span>
              <span className="font-bold whitespace-nowrap">{r.label}</span>
              <Tag fill={r.independence === "INDEPENDENT" ? "green" : r.independence === "LOCAL FIXTURE" ? "lime" : "orange"}>{r.independence}</Tag>
            </label>
          );
        })}
        <Field label="Receipts needed before it counts as released" htmlFor="threshold" hint={`Each relayer holds one key share; ${value.receiptThreshold} of ${value.relayers.length} together can open it — before or after the date.`}>
          <input id="threshold" type="number" min={1} max={Math.max(1, value.relayers.length)} className={inputClass} value={value.receiptThreshold} onChange={(e) => set({ receiptThreshold: Number(e.target.value) })} />
        </Field>
      </fieldset>

      {problem && (
        <p role="status" className="neo-sm rounded-xl bg-yellow px-3 py-2 text-sm font-bold">
          {problem}
        </p>
      )}
    </div>
  );
}
