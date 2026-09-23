"use client";
/**
 * Transaction runner with the PRD §9.3 states. A write is simulated first, so a revert is shown as
 * the contract's own reason before anything is signed; confirmation is awaited before success.
 */
import { useCallback, useRef, useState } from "react";
import type { Hex } from "viem";
import { describeError, type PreparedWrite, type TxResult, type TxSender } from "@relay/sdk";
import { useRelay } from "./relay";
import { useWallet } from "./wallet";

export type TxState =
  | { kind: "idle" }
  | { kind: "preparing"; label: string; stage?: string }
  | { kind: "pending"; label: string; hash: Hex }
  | { kind: "success"; label: string; hash: Hex; blockNumber: bigint }
  | { kind: "failure"; label: string; reason: string; hash?: Hex };

export function useTx() {
  const { client, canTransact, blockReason, deployment } = useRelay();
  const { walletClient, address, walletChainId } = useWallet();
  const [state, setState] = useState<TxState>({ kind: "idle" });
  const last = useRef<(() => Promise<unknown>) | null>(null);

  const guard = (): string | null => {
    if (!canTransact) return blockReason ?? "Transactions are unavailable.";
    if (!walletClient || !address) return "Connect a wallet first.";
    if (deployment && walletChainId !== null && walletChainId !== deployment.chainId) {
      return `Your wallet is on chain ${walletChainId}; switch it to ${deployment.label} (chain ${deployment.chainId}).`;
    }
    return null;
  };

  const send: TxSender = useCallback(
    async (w: PreparedWrite): Promise<TxResult> => {
      const blocked = guard();
      if (blocked) {
        setState({ kind: "failure", label: w.label, reason: blocked });
        throw new Error(blocked);
      }
      setState({ kind: "preparing", label: w.label, stage: "Checking with the contract" });
      let hash: Hex | undefined;
      try {
        const { request } = await client!.simulateContract({
          account: walletClient!.account!,
          address: w.address,
          abi: w.abi,
          functionName: w.functionName as never,
          args: w.args as never,
        });
        setState({ kind: "preparing", label: w.label, stage: "Waiting for your signature" });
        hash = await walletClient!.writeContract(request as never);
        setState({ kind: "pending", label: w.label, hash });
        const receipt = await client!.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("The transaction was mined but reverted.");
        setState({ kind: "success", label: w.label, hash, blockNumber: receipt.blockNumber });
        return { hash, logs: receipt.logs as TxResult["logs"] };
      } catch (e) {
        setState({ kind: "failure", label: w.label, reason: describeError(e), ...(hash ? { hash } : {}) });
        throw e;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, walletClient, address, canTransact, blockReason, walletChainId, deployment],
  );

  /** Run a multi-step flow; `retry` re-runs the same flow. */
  const run = useCallback(async <T,>(flow: () => Promise<T>): Promise<T | null> => {
    last.current = flow;
    try {
      return await flow();
    } catch (e) {
      setState((s) => (s.kind === "failure" ? s : { kind: "failure", label: "Action", reason: describeError(e) }));
      return null;
    }
  }, []);

  return {
    state,
    setStage: (label: string, stage: string) => setState({ kind: "preparing", label, stage }),
    send,
    run,
    retry: () => (last.current ? run(last.current as () => Promise<unknown>) : Promise.resolve(null)),
    reset: () => setState({ kind: "idle" }),
    blocked: guard(),
  };
}
