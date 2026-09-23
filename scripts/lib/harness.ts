/**
 * Shared harness for the local proof run, adversarial campaign and parity suite.
 * Local runs use a fresh anvil chain and are labelled LOCAL FIXTURE everywhere.
 */
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  type Account,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CAPSULE_REGISTRY_ABI_SHA256, capsuleRegistryAbi, DeploymentSchema, type Deployment } from "@relay/protocol-types";
import { capsuleRegistryBytecode, CAPSULE_REGISTRY_RUNTIME_SHA256 } from "@relay/protocol-types/bytecode";
import { chainFromDeployment, decodeRevert, describeError, HttpBlobStore, RelayReader, writeSettling, type PreparedWrite, type TxResult } from "@relay/sdk";
import { createIdentity, Relayer, type RelayerIdentity } from "../../apps/relayer/src/relayer.ts";
import { startStorageServer } from "../../apps/relayer/src/storage-server.ts";

export const ROOT = resolve(import.meta.dirname, "../..");

/** Anvil's well-known development keys (mnemonic "test test … junk"). LOCAL FIXTURE only. */
export const ANVIL_KEYS: Hex[] = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
];

export function gitCommit(): string {
  try {
    const sha = execSync("git rev-parse HEAD", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    const dirty = execSync("git status --porcelain", { cwd: ROOT }).toString().trim().length > 0;
    return dirty ? `${sha}+dirty` : sha;
  } catch {
    return "UNCOMMITTED";
  }
}

async function portAnswers(url: string): Promise<boolean> {
  try {
    await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}", signal: AbortSignal.timeout(500) });
    return true;
  } catch {
    return false;
  }
}

/** Refuse to reuse a port another process holds: we must never deploy onto someone else's chain. */
export async function assertPortFree(port: number) {
  if (await portAnswers(`http://127.0.0.1:${port}`)) {
    throw new Error(`Port ${port} is already in use by another process. Stop it yourself or pick another port; Relay will not touch it.`);
  }
}

export async function startAnvil(port: number): Promise<{ rpcUrl: string; stop: () => void; proc: ChildProcess }> {
  await assertPortFree(port);
  const bin = process.env.ANVIL_BIN ?? `${process.env.HOME}/.foundry/bin/anvil`;
  const proc = spawn(bin, ["--port", String(port), "--chain-id", "31337", "--silent", "--hardfork", "cancun"], { stdio: "ignore" });
  // Never leak the chain: kill it on every exit path, including crashes.
  process.on("exit", () => proc.kill("SIGTERM"));
  const rpcUrl = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) });
      if (res.ok) return { rpcUrl, proc, stop: () => proc.kill("SIGTERM") };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  proc.kill();
  throw new Error("anvil did not start");
}

export interface Actor {
  name: string;
  account: Account;
  wallet: WalletClient;
}

export class Harness {
  readonly client: PublicClient;
  constructor(readonly deployment: Deployment) {
    this.client = createPublicClient({ chain: chainFromDeployment(deployment), transport: http(deployment.rpcUrl) }) as PublicClient;
  }

  actor(name: string, key: Hex): Actor {
    const account = privateKeyToAccount(key);
    return { name, account, wallet: createWalletClient({ account, chain: chainFromDeployment(this.deployment), transport: http(this.deployment.rpcUrl) }) };
  }

  reader() {
    return new RelayReader(this.client, this.deployment.contract.address, BigInt(this.deployment.contract.deploymentBlock));
  }

  store() {
    return new HttpBlobStore(this.deployment.storage.url);
  }

  /** Simulate then send; throws with the decoded revert on failure. */
  sender(actor: Actor) {
    return async (w: PreparedWrite): Promise<TxResult> => {
      const { request } = await this.client.simulateContract({
        account: actor.account,
        address: w.address,
        abi: w.abi,
        functionName: w.functionName as never,
        args: w.args as never,
      });
      const hash = await actor.wallet.writeContract(request as never);
      const receipt = await this.settled(hash);
      if (receipt.status !== "success") throw new Error(`${w.label} reverted: ${hash}`);
      return { hash, logs: receipt.logs as TxResult["logs"] };
    };
  }

  /**
   * Evidence for an expected rejection: the decoded revert from simulation, plus a mined
   * failing transaction (explicit gas skips estimation) so the explorer shows status 0.
   */
  async attemptExpectingRevert(actor: Actor, w: PreparedWrite, gas = 400_000n) {
    let decoded: { name: string; reason: string } | null = null;
    try {
      await this.client.simulateContract({ account: actor.account, address: w.address, abi: w.abi, functionName: w.functionName as never, args: w.args as never });
    } catch (e) {
      const r = decodeRevert(e);
      decoded = r ? { name: r.name, reason: r.reason } : { name: "UNDECODED", reason: describeError(e) };
    }
    const hash = await actor.wallet.writeContract({
      address: w.address,
      abi: capsuleRegistryAbi,
      functionName: w.functionName as never,
      args: w.args as never,
      gas,
      chain: chainFromDeployment(this.deployment),
      account: actor.account,
    } as never);
    const receipt = await this.settled(hash);
    return { hash, status: receipt.status, blockNumber: receipt.blockNumber.toString(), decoded };
  }

  /** Wait for a receipt, then long enough that the RPC's next answer reflects it. */
  async settled(hash: Hex) {
    const { confirmations, settleMs } = writeSettling(this.deployment.network);
    const receipt = await this.client.waitForTransactionReceipt({ hash, confirmations });
    if (settleMs) await new Promise((r) => setTimeout(r, settleMs));
    return receipt;
  }

  async now(): Promise<number> {
    return Number((await this.client.getBlock({ blockTag: "latest" })).timestamp);
  }

  /** LOCAL FIXTURE only: move chain time forward and mine a block. */
  async warpTo(ts: number) {
    if (this.deployment.network !== "local") throw new Error("time travel is only possible on the local fixture");
    await this.client.request({ method: "evm_setNextBlockTimestamp" as never, params: [ts] as never });
    await this.client.request({ method: "evm_mine" as never, params: [] as never });
  }

  /** Real networks: wait until chain time passes `ts`. */
  async waitUntil(ts: number, log: (s: string) => void = () => {}) {
    for (;;) {
      const now = await this.now();
      if (now >= ts) return;
      log(`waiting ${ts - now}s for chain time ${ts}`);
      await new Promise((r) => setTimeout(r, Math.min(15_000, (ts - now) * 1000 + 1000)));
    }
  }
}

/**
 * Deploy a complete LOCAL FIXTURE: anvil chain, CapsuleRegistry, storage server, three
 * relayer identities (funded, keys registered). Returns the deployment and handles to stop it.
 */
export async function bootLocal(opts: { anvilPort: number; storagePort: number; dir: string; relayerCount?: number; writeDeployment?: string }) {
  await assertPortFree(opts.storagePort);
  const anvil = await startAnvil(opts.anvilPort);
  mkdirSync(opts.dir, { recursive: true });
  const storage = startStorageServer({ port: opts.storagePort, dir: resolve(opts.dir, "storage") });
  const storageUrl = `http://127.0.0.1:${opts.storagePort}`;

  const localChain = { id: 31337, name: "LOCAL FIXTURE", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [anvil.rpcUrl] } } } as const;
  const client = createPublicClient({ chain: localChain, transport: http(anvil.rpcUrl) });
  const deployer = privateKeyToAccount(ANVIL_KEYS[0]!);
  const wallet = createWalletClient({ account: deployer, chain: localChain, transport: http(anvil.rpcUrl) });
  const hash = await wallet.deployContract({ abi: capsuleRegistryAbi, bytecode: capsuleRegistryBytecode });
  const receipt = await client.waitForTransactionReceipt({ hash });
  const address = receipt.contractAddress!;

  const identities: RelayerIdentity[] = [];
  for (let i = 0; i < (opts.relayerCount ?? 3); i++) {
    const id = await createIdentity(`local-relayer-${i + 1}`);
    identities.push(id);
    const tx = await wallet.sendTransaction({ to: id.address, value: parseEther("10") });
    await client.waitForTransactionReceipt({ hash: tx });
  }
  writeFileSync(resolve(opts.dir, "relayer-identities.json"), JSON.stringify(identities, null, 2), { mode: 0o600 });

  const deployment: Deployment = DeploymentSchema.parse({
    schema: "relay.deployment/v1",
    network: "local",
    label: "LOCAL FIXTURE",
    chainId: 31337,
    nativeSymbol: "ETH",
    rpcUrl: anvil.rpcUrl,
    explorerUrl: null,
    probe: null,
    contract: {
      name: "CapsuleRegistry",
      address,
      deployer: deployer.address,
      transactionHash: hash,
      deploymentBlock: Number(receipt.blockNumber),
      runtimeSha256: CAPSULE_REGISTRY_RUNTIME_SHA256,
      verifiedSource: "NOT_APPLICABLE",
      verificationUrl: null,
    },
    abiSha256: CAPSULE_REGISTRY_ABI_SHA256,
    sourceCommit: gitCommit(),
    quorum: {
      relayers: identities.map((id) => ({
        address: id.address,
        label: id.label,
        independence: "LOCAL FIXTURE",
        operator: "Relay project (local development)",
        encryptionKeyFingerprint: id.encryption.fingerprint,
        endpoint: null,
      })),
      defaultThreshold: 2,
      independence: "LOCAL FIXTURE",
      note: "All relayers run in one process operated by the project. Not independent.",
    },
    storage: { url: storageUrl, operator: "Relay project (local development)", label: "LOCAL FIXTURE" },
    steward: { url: null, address: null },
    verifier: { version: "0.1.0", sourceCommit: gitCommit(), url: null },
    deployedAt: new Date().toISOString(),
  });
  if (opts.writeDeployment) writeFileSync(opts.writeDeployment, `${JSON.stringify(deployment, null, 2)}\n`);

  const relayer = new Relayer({ deployment, identities, store: new HttpBlobStore(storageUrl), autoRequestRelease: false, log: () => {} });
  await relayer.ensureRegistered();

  return {
    deployment,
    identities,
    relayer,
    stop: () => {
      storage.close();
      anvil.stop();
    },
  };
}
