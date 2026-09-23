"use client";
/**
 * Network context. The deployment record is fetched at runtime (it is live protocol data, not a
 * constant) and the chain is probed: chain ID and registry bytecode must match the record, or every
 * transaction action stops with PROTOCOL_CONFIG_CHANGED (PRD §9.3).
 */
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createPublicClient, http, type PublicClient } from "viem";
import { DeploymentSchema, type Deployment } from "@relay/protocol-types";
import { chainFromDeployment, HttpBlobStore, probeRuntime, RelayReader, type BlobStore, type NetworkStatus } from "@relay/sdk";

export const NETWORK = (process.env.NEXT_PUBLIC_RELAY_NETWORK ?? "testnet") as "local" | "testnet" | "mainnet";

export interface RelayContextValue {
  network: typeof NETWORK;
  deployment: Deployment | null;
  loading: boolean;
  status: NetworkStatus | null;
  client: PublicClient | null;
  reader: RelayReader | null;
  store: BlobStore | null;
  /** True only when the runtime probe agrees with the deployment record. */
  canTransact: boolean;
  blockReason: string | null;
  explorerTx: (hash: string) => string | null;
  explorerAddress: (addr: string) => string | null;
}

const Ctx = createContext<RelayContextValue | null>(null);

async function loadDeployment(): Promise<Deployment | null> {
  const res = await fetch(`/relay/deployment.${NETWORK}.json`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not load the deployment record (HTTP ${res.status})`);
  return DeploymentSchema.parse(await res.json());
}

export function RelayProvider({ children }: { children: ReactNode }) {
  const dep = useQuery({ queryKey: ["deployment", NETWORK], queryFn: loadDeployment, staleTime: Infinity, retry: 1 });
  const deployment = dep.data ?? null;

  const client = useMemo(
    () => (deployment ? (createPublicClient({ chain: chainFromDeployment(deployment), transport: http(deployment.rpcUrl, { batch: { batchSize: 32, wait: 16 } }) }) as PublicClient) : null),
    [deployment],
  );
  const reader = useMemo(
    () => (client && deployment ? new RelayReader(client, deployment.contract.address, BigInt(deployment.contract.deploymentBlock)) : null),
    [client, deployment],
  );
  const store = useMemo(() => (deployment ? new HttpBlobStore(deployment.storage.url, `${deployment.storage.label} storage`) : null), [deployment]);

  const probe = useQuery({
    queryKey: ["probe", NETWORK, deployment?.contract.address ?? "none"],
    queryFn: () => (client ? probeRuntime(client, deployment) : probeRuntime(null as never, null)),
    enabled: !dep.isLoading,
    refetchInterval: 30_000,
  });

  const status: NetworkStatus | null = dep.isError
    ? { kind: "PROTOCOL_CONFIG_CHANGED", reasons: [(dep.error as Error).message], checkedAt: Date.now() }
    : dep.isLoading
      ? null
      : !deployment
        ? { kind: "NOT_DEPLOYED", reason: `No ${NETWORK === "testnet" ? "BOT Chain testnet" : NETWORK} deployment record yet.` }
        : (probe.data ?? null);

  const canTransact = status?.kind === "OK";
  const blockReason =
    status === null
      ? "Checking the network…"
      : status.kind === "OK"
        ? null
        : status.kind === "NOT_DEPLOYED"
          ? "Transactions are off: Relay is not deployed on this network yet."
          : status.kind === "RPC_UNREACHABLE"
            ? "Transactions are off: the network RPC is unreachable."
            : "Transactions are off: PROTOCOL_CONFIG_CHANGED.";

  const explorer = deployment?.explorerUrl?.replace(/\/$/, "") ?? null;
  const value: RelayContextValue = {
    network: NETWORK,
    deployment,
    loading: dep.isLoading || (Boolean(deployment) && probe.isLoading),
    status,
    client,
    reader,
    store,
    canTransact,
    blockReason,
    explorerTx: (h) => (explorer ? `${explorer}/tx/${h}` : null),
    explorerAddress: (a) => (explorer ? `${explorer}/address/${a}` : null),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRelay(): RelayContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRelay outside RelayProvider");
  return v;
}

export function networkLabel(d: Deployment | null, network: string): string {
  if (d) return d.label;
  return network === "testnet" ? "BOT Chain testnet" : network === "local" ? "LOCAL FIXTURE" : "BOT Chain mainnet";
}
