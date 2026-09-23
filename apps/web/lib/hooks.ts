"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { readMetadata, type CircleView } from "@relay/sdk";
import type { CircleMetadata } from "@relay/protocol-types";
import { circleScope, getCircleKey } from "./keys";
import { useRelay } from "./relay";
import { useWallet } from "./wallet";

/** Wall clock in unix seconds, ticking. Chain time is shown separately where it matters. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function parseId(raw: string | string[] | undefined | null): bigint | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  return s && /^\d{1,30}$/.test(s) && s !== "0" ? BigInt(s) : null;
}

export function useCircle(id: bigint | null) {
  const { reader, network } = useRelay();
  return useQuery({
    queryKey: ["circle", network, id?.toString()],
    queryFn: () => reader!.getCircle(id!),
    enabled: Boolean(reader && id),
    refetchInterval: 6000,
    retry: (n, e) => !/UnknownCircle/.test(String(e)) && n < 2,
  });
}

export function useMember(id: bigint | null, account: `0x${string}` | null) {
  const { reader, network } = useRelay();
  return useQuery({
    queryKey: ["member", network, id?.toString(), account],
    queryFn: () => reader!.getMember(id!, account!),
    enabled: Boolean(reader && id && account),
    refetchInterval: 6000,
  });
}

export function useCircleEvents(id: bigint | null) {
  const { reader, network } = useRelay();
  return useQuery({
    queryKey: ["events", network, id?.toString()],
    queryFn: () => reader!.circleEvents(id!),
    enabled: Boolean(reader && id),
    refetchInterval: 10_000,
  });
}

export interface MyCircle {
  circle: CircleView;
  member: Awaited<ReturnType<NonNullable<ReturnType<typeof useRelay>["reader"]>["getMember"]>>;
  role: "creator" | "member";
}

export function useMyCircles() {
  const { reader, network } = useRelay();
  const { address } = useWallet();
  return useQuery({
    queryKey: ["my-circles", network, address],
    enabled: Boolean(reader && address),
    refetchInterval: 10_000,
    queryFn: async (): Promise<MyCircle[]> => {
      const ids = await reader!.circlesOf(address!);
      const rows = await Promise.all(
        ids.map(async (id) => {
          const [circle, member] = await Promise.all([reader!.getCircle(id), reader!.getMember(id, address!)]);
          return { circle, member, role: circle.creator.toLowerCase() === address!.toLowerCase() ? ("creator" as const) : ("member" as const) };
        }),
      );
      return rows.sort((a, b) => Number(b.circle.circleId - a.circle.circleId));
    },
  });
}

export function useAccountEvents() {
  const { reader, network } = useRelay();
  const { address } = useWallet();
  return useQuery({
    queryKey: ["account-events", network, address],
    queryFn: () => reader!.accountEvents(address!),
    enabled: Boolean(reader && address),
    refetchInterval: 15_000,
  });
}

/** Decrypt Circle metadata when this browser holds the Circle's key (from an invite link or recovery kit). */
export function useMetadata(circle: CircleView | undefined | null) {
  const { store, deployment, network } = useRelay();
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const f = () => setVersion((v) => v + 1);
    window.addEventListener("relay:keys-changed", f);
    return () => window.removeEventListener("relay:keys-changed", f);
  }, []);
  return useQuery({
    queryKey: ["metadata", network, circle?.circleId.toString(), circle?.metadataCommitment, version],
    enabled: Boolean(store && deployment && circle),
    staleTime: Infinity,
    queryFn: async (): Promise<CircleMetadata | null> => {
      const key = getCircleKey(circleScope(deployment!.chainId, deployment!.contract.address), circle!.circleId);
      if (!key || /^0x0+$/.test(circle!.metadataCommitment)) return null;
      return readMetadata(store!, circle!.metadataCommitment, key);
    },
  });
}

export function circleTitle(meta: CircleMetadata | null | undefined, id: bigint | string) {
  return meta ? `${meta.emoji ? `${meta.emoji} ` : ""}${meta.title}` : `Circle #${id.toString()}`;
}
