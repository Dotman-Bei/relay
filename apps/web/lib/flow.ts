"use client";
import type { FlowContext, TxSender } from "@relay/sdk";
import { useRelay } from "./relay";
import { useWallet } from "./wallet";

/** Build the SDK flow context from the current network, wallet and a tx sender. */
export function useFlowContext(send: TxSender): FlowContext | null {
  const { deployment, reader, store } = useRelay();
  const { address } = useWallet();
  if (!deployment || !reader || !store || !address) return null;
  return { chainId: deployment.chainId, registry: deployment.contract.address, account: address, reader, store, send };
}

const INVITES = (scope: string, id: string) => `relay:issued-invites:v1:${scope}:${id}`;

/** Invite links are secrets the chain never sees; the creator's browser keeps the ones it made. */
export function saveIssuedInvites(scope: string, circleId: string, links: string[]) {
  try {
    const prev = JSON.parse(localStorage.getItem(INVITES(scope, circleId)) ?? "[]") as string[];
    localStorage.setItem(INVITES(scope, circleId), JSON.stringify([...prev, ...links]));
  } catch {
    /* ignore */
  }
}

export function loadIssuedInvites(scope: string, circleId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(INVITES(scope, circleId)) ?? "[]") as string[];
  } catch {
    return [];
  }
}
