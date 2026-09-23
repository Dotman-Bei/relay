/**
 * Runtime protocol-configuration probe (PRD §9.3). Before any transaction UI is enabled, the
 * client checks that the RPC reports the recorded chain ID and that the registry address holds
 * the recorded runtime bytecode. Any disagreement stops transaction actions.
 */
import { defineChain, type Chain, type PublicClient } from "viem";
import type { Deployment } from "@relay/protocol-types";
import { sha256Hex } from "./crypto.ts";
import { fromHex } from "./encoding.ts";

export type NetworkStatus =
  | { kind: "OK"; chainId: number; blockNumber: bigint; checkedAt: number }
  | { kind: "NOT_DEPLOYED"; reason: string }
  | { kind: "PROTOCOL_CONFIG_CHANGED"; reasons: string[]; checkedAt: number }
  | { kind: "RPC_UNREACHABLE"; reason: string; checkedAt: number };

export async function probeRuntime(client: PublicClient, deployment: Deployment | null): Promise<NetworkStatus> {
  if (!deployment) return { kind: "NOT_DEPLOYED", reason: "No deployment record is configured for this network." };
  const checkedAt = Date.now();
  let chainId: number;
  let blockNumber: bigint;
  let code: string | undefined;
  try {
    [chainId, blockNumber, code] = await Promise.all([
      client.getChainId(),
      client.getBlockNumber(),
      client.getCode({ address: deployment.contract.address }),
    ]);
  } catch (e) {
    return { kind: "RPC_UNREACHABLE", reason: e instanceof Error ? e.message : String(e), checkedAt };
  }
  const reasons: string[] = [];
  if (chainId !== deployment.chainId) reasons.push(`RPC reports chain ${chainId}; deployment record says ${deployment.chainId}.`);
  if (!code || code === "0x") {
    reasons.push(`No contract code at ${deployment.contract.address}.`);
  } else {
    const h = await sha256Hex(fromHex(code));
    if (h !== deployment.contract.runtimeSha256) {
      reasons.push(`Registry bytecode hash ${h.slice(0, 12)}… does not match the recorded ${deployment.contract.runtimeSha256.slice(0, 12)}….`);
    }
  }
  if (reasons.length) return { kind: "PROTOCOL_CONFIG_CHANGED", reasons, checkedAt };
  return { kind: "OK", chainId, blockNumber, checkedAt };
}

export function explorerTx(deployment: Pick<Deployment, "explorerUrl"> | null, hash: string): string | null {
  return deployment?.explorerUrl ? `${deployment.explorerUrl.replace(/\/$/, "")}/tx/${hash}` : null;
}

export function explorerAddress(deployment: Pick<Deployment, "explorerUrl"> | null, address: string): string | null {
  return deployment?.explorerUrl ? `${deployment.explorerUrl.replace(/\/$/, "")}/address/${address}` : null;
}

/** A viem chain built from the deployment record — never from constants in product code. */
export function chainFromDeployment(d: Deployment): Chain {
  return defineChain({
    id: d.chainId,
    name: d.label,
    nativeCurrency: { name: d.nativeSymbol, symbol: d.nativeSymbol, decimals: 18 },
    rpcUrls: { default: { http: [d.rpcUrl] } },
    ...(d.explorerUrl ? { blockExplorers: { default: { name: "Explorer", url: d.explorerUrl } } } : {}),
  });
}
