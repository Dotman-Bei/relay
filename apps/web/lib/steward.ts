"use client";
import type { WalletClient } from "viem";
import type { Deployment, StewardConsent, StewardReceipt } from "@relay/protocol-types";
import { canonicalJson, sha256Bytes32, utf8 } from "@relay/sdk";

export interface PromptSuggestion {
  title: string;
  prompt: string;
  format: "text" | "image" | "audio" | "video";
}

const base = (d: Deployment) => d.steward.url?.replace(/\/$/, "") ?? null;

export async function stewardStatus(d: Deployment): Promise<{ ok: boolean; mode: string; agent: string } | null> {
  const b = base(d);
  if (!b) return null;
  try {
    const r = await fetch(`${b}/health`);
    return r.ok ? ((await r.json()) as { ok: boolean; mode: string; agent: string }) : null;
  } catch {
    return null;
  }
}

export async function stewardOptedIn(d: Deployment, circleId: string, member: string): Promise<boolean> {
  const b = base(d);
  if (!b) return false;
  const r = await fetch(`${b}/v1/consent/${circleId}/${member}`);
  return r.ok ? ((await r.json()) as { optedIn: boolean }).optedIn : false;
}

/** The member signs their decision; the steward verifies the signature and on-chain membership. */
export async function setStewardConsent(d: Deployment, wallet: WalletClient, circleId: string, decision: "OPT_IN" | "OPT_OUT"): Promise<StewardReceipt> {
  const b = base(d);
  if (!b) throw new Error("No Memory Steward is configured for this network.");
  const member = wallet.account!.address;
  const unsigned: Omit<StewardConsent, "signature"> = {
    v: 1,
    kind: "relay.steward-consent",
    decision,
    circleId,
    chainId: d.chainId,
    registry: d.contract.address,
    member,
    scope: "prompts-and-reminders",
    contentAccess: "none",
    issuedAt: new Date().toISOString(),
  };
  const digest = await sha256Bytes32(utf8.encode(canonicalJson(unsigned)));
  const signature = await wallet.signMessage({ account: wallet.account!, message: { raw: digest } });
  const r = await fetch(`${b}/v1/consent`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...unsigned, signature }) });
  const body = (await r.json()) as StewardReceipt & { error?: string };
  if (!r.ok) throw new Error(body.error ?? `Steward returned ${r.status}`);
  return body;
}

export async function stewardPrompts(
  d: Deployment,
  args: { circleId: string; member: string; theme: string; occasion: string; groupSize: number; yearsUntilOpen: number; tone: string },
): Promise<{ mode: "MODEL" | "TEMPLATE"; set: { prompts: PromptSuggestion[] }; note?: string; receipt: StewardReceipt }> {
  const b = base(d);
  if (!b) throw new Error("No Memory Steward is configured for this network.");
  const r = await fetch(`${b}/v1/prompts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(args) });
  const body = await r.json();
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `Steward returned ${r.status}`);
  return body as never;
}

export async function stewardReminder(d: Deployment, circleId: string, member: string): Promise<string | null> {
  const b = base(d);
  if (!b) return null;
  try {
    const r = await fetch(`${b}/v1/reminders/${circleId}/${member}`);
    if (!r.ok) return null;
    return ((await r.json()) as { text: string | null }).text;
  } catch {
    return null;
  }
}
