"use client";
/**
 * Wallet session. Three ways to hold a signing key:
 *  - injected: an EIP-1193 browser wallet (MetaMask, Rabby, BO Wallet…)
 *  - session:  a key generated and kept in this browser, for BOT Chain testnet trials only
 *  - fixture:  Anvil's public development keys, offered only on the LOCAL FIXTURE network
 * Passkeys are not offered: BOT Chain testnet documents ERC-4337 with an ECDSA SimpleAccountFactory,
 * but no WebAuthn-capable account factory (see DECISIONS.md).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createWalletClient, custom, http, numberToHex, type WalletClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { chainFromDeployment } from "@relay/sdk";
import { useRelay } from "./relay";

export type WalletKind = "injected" | "session" | "fixture";

/** Anvil's well-known development keys. They are public; they only ever sign on the local fixture chain. */
export const FIXTURE_KEYS = [
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
] as const;

const PREF = "relay:wallet:v1";
const SESSION_KEY = "relay:session-key:v1";

interface Pref {
  kind: WalletKind;
  fixture?: number;
}

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown>; on?: (e: string, f: (...a: unknown[]) => void) => void; removeListener?: (e: string, f: (...a: unknown[]) => void) => void };
const injectedProvider = (): Eip1193 | null => (typeof window !== "undefined" ? ((window as unknown as { ethereum?: Eip1193 }).ethereum ?? null) : null);

export interface WalletValue {
  ready: boolean;
  kind: WalletKind | null;
  address: `0x${string}` | null;
  walletClient: WalletClient | null;
  walletChainId: number | null;
  hasInjected: boolean;
  connectInjected: () => Promise<void>;
  chooseSessionKey: () => void;
  chooseFixture: (index: number) => void;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
  exportSessionKey: () => string | null;
  error: string | null;
}

const Ctx = createContext<WalletValue | null>(null);

function readPref(): Pref | null {
  try {
    return JSON.parse(localStorage.getItem(PREF) ?? "null") as Pref | null;
  } catch {
    return null;
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { deployment, network } = useRelay();
  const [pref, setPref] = useState<Pref | null>(null);
  const [ready, setReady] = useState(false);
  const [injectedAccount, setInjectedAccount] = useState<`0x${string}` | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasInjected, setHasInjected] = useState(false);

  useEffect(() => {
    setPref(readPref());
    setHasInjected(Boolean(injectedProvider()));
    setReady(true);
  }, []);

  const savePref = (p: Pref | null) => {
    setPref(p);
    try {
      if (p) localStorage.setItem(PREF, JSON.stringify(p));
      else localStorage.removeItem(PREF);
    } catch {
      /* ignore */
    }
  };

  // Keep the injected account and chain in sync with the wallet.
  useEffect(() => {
    const eth = injectedProvider();
    if (!eth || pref?.kind !== "injected") return;
    let alive = true;
    eth.request({ method: "eth_accounts" }).then((a) => alive && setInjectedAccount(((a as string[])[0] as `0x${string}`) ?? null));
    eth.request({ method: "eth_chainId" }).then((c) => alive && setWalletChainId(Number(c)));
    const onAcc = (a: unknown) => setInjectedAccount(((a as string[])[0] as `0x${string}`) ?? null);
    const onChain = (c: unknown) => setWalletChainId(Number(c));
    eth.on?.("accountsChanged", onAcc);
    eth.on?.("chainChanged", onChain);
    return () => {
      alive = false;
      eth.removeListener?.("accountsChanged", onAcc);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, [pref?.kind]);

  const chain = useMemo(() => (deployment ? chainFromDeployment(deployment) : null), [deployment]);

  const { address, walletClient, effectiveChainId } = useMemo(() => {
    if (!pref || !chain || !deployment) return { address: null, walletClient: null, effectiveChainId: null };
    if (pref.kind === "injected") {
      const eth = injectedProvider();
      if (!eth || !injectedAccount) return { address: injectedAccount, walletClient: null, effectiveChainId: walletChainId };
      return {
        address: injectedAccount,
        walletClient: createWalletClient({ account: injectedAccount, chain, transport: custom(eth) }),
        effectiveChainId: walletChainId,
      };
    }
    let key: `0x${string}` | null = null;
    if (pref.kind === "fixture") key = network === "local" ? (FIXTURE_KEYS[pref.fixture ?? 0] ?? null) : null;
    // Session keys are a testnet convenience; on mainnet a key in browser storage would hold real funds.
    if (pref.kind === "session" && network !== "mainnet") {
      try {
        key = localStorage.getItem(SESSION_KEY) as `0x${string}` | null;
      } catch {
        key = null;
      }
    }
    if (!key) return { address: null, walletClient: null, effectiveChainId: null };
    const account = privateKeyToAccount(key);
    return { address: account.address, walletClient: createWalletClient({ account, chain, transport: http(deployment.rpcUrl) }), effectiveChainId: deployment.chainId };
  }, [pref, chain, deployment, injectedAccount, walletChainId, network]);

  const connectInjected = useCallback(async () => {
    setError(null);
    const eth = injectedProvider();
    if (!eth) {
      setError(network === "mainnet" ? "No browser wallet found. Install one (MetaMask, Rabby, BO Wallet) to use Relay on mainnet." : "No browser wallet found. Install one, or use a browser session key for testnet.");
      return;
    }
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      setInjectedAccount((accounts[0] as `0x${string}`) ?? null);
      setWalletChainId(Number(await eth.request({ method: "eth_chainId" })));
      savePref({ kind: "injected" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [network]);

  const switchNetwork = useCallback(async () => {
    const eth = injectedProvider();
    if (!eth || !deployment) return;
    const hex = numberToHex(deployment.chainId);
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    } catch {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hex,
            chainName: deployment.label,
            nativeCurrency: { name: deployment.nativeSymbol, symbol: deployment.nativeSymbol, decimals: 18 },
            rpcUrls: [deployment.rpcUrl],
            ...(deployment.explorerUrl ? { blockExplorerUrls: [deployment.explorerUrl] } : {}),
          },
        ],
      });
    }
    setWalletChainId(Number(await eth.request({ method: "eth_chainId" })));
  }, [deployment]);

  const value: WalletValue = {
    ready,
    kind: pref?.kind ?? null,
    address,
    walletClient,
    walletChainId: effectiveChainId,
    hasInjected,
    connectInjected,
    chooseSessionKey: () => {
      try {
        if (!localStorage.getItem(SESSION_KEY)) localStorage.setItem(SESSION_KEY, generatePrivateKey());
      } catch {
        setError("This browser blocks local storage; a session key cannot be kept.");
        return;
      }
      savePref({ kind: "session" });
    },
    chooseFixture: (i) => savePref({ kind: "fixture", fixture: i }),
    disconnect: () => {
      savePref(null);
      setInjectedAccount(null);
    },
    switchNetwork,
    exportSessionKey: () => {
      try {
        return localStorage.getItem(SESSION_KEY);
      } catch {
        return null;
      }
    },
    error,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet outside WalletProvider");
  return v;
}
