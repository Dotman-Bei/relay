/**
 * PROJECT_BASELINE release relayer.
 *
 * Holds one or more relayer identities (a signing account + a P-256 encryption key). For every
 * capsule whose quorum includes an identity, after — and only after — the registry has recorded
 * ReleaseEligibilityReached, it:
 *   1. opens its own share of each contribution key from the contribution manifests,
 *   2. re-encrypts that share to each consenting member's published key,
 *   3. signs and uploads a delivery manifest (content-addressed),
 *   4. records recordReleaseReceipt(circleId, sha256(delivery)) on-chain.
 * It never decides eligibility. It can optionally call requestRelease, which the contract only
 * accepts when the stored rule is true (anyone may call it).
 *
 *   tsx src/relayer.ts init --dir .relay-local/relayers --count 3
 *   tsx src/relayer.ts run  --deployment deployments/local.json --dir .relay-local/relayers
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, createWalletClient, http, type Hex, type PublicClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { DeploymentSchema, type Deployment, type DeliveryManifest } from "@relay/protocol-types";
import {
  chainFromDeployment,
  decodeRevert,
  deliverShare,
  deliverySigningBytes,
  encodeDelivery,
  fetchManifest,
  generateEncryptionKeyPair,
  getVerified,
  HttpBlobStore,
  keyFingerprint,
  openRelayerShare,
  prepare,
  putVerified,
  RelayReader,
  sha256Bytes32,
  writeSettling,
  type BlobStore,
  type EntitledMember,
} from "@relay/sdk";

export interface RelayerIdentity {
  label: string;
  signingKey: Hex;
  address: `0x${string}`;
  encryption: { publicKeyHex: string; privateJwk: JsonWebKey; fingerprint: Hex };
}

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

export async function createIdentity(label: string): Promise<RelayerIdentity> {
  const signingKey = generatePrivateKey();
  const kp = await generateEncryptionKeyPair();
  return {
    label,
    signingKey,
    address: privateKeyToAccount(signingKey).address,
    encryption: {
      publicKeyHex: Buffer.from(kp.publicKey).toString("hex"),
      privateJwk: kp.privateJwk,
      fingerprint: await keyFingerprint(kp.publicKey),
    },
  };
}

export function loadIdentities(dir: string): RelayerIdentity[] {
  const file = join(dir, "identities.json");
  if (!existsSync(file)) throw new Error(`No relayer identities at ${file}; run \`relayer init\` first.`);
  return JSON.parse(readFileSync(file, "utf8")) as RelayerIdentity[];
}

export interface RelayerOptions {
  deployment: Deployment;
  identities: RelayerIdentity[];
  store: BlobStore;
  /** Addresses that deliberately withhold receipts (adversarial campaign only). */
  withhold?: Set<string>;
  autoRequestRelease?: boolean;
  log?: (msg: string) => void;
  metricsFile?: string;
}

export class Relayer {
  readonly client: PublicClient;
  readonly reader: RelayReader;
  private readonly done = new Set<string>();
  private registered = false;

  constructor(readonly opts: RelayerOptions) {
    const chain = chainFromDeployment(opts.deployment);
    this.client = createPublicClient({ chain, transport: http(opts.deployment.rpcUrl) }) as PublicClient;
    this.reader = new RelayReader(this.client, opts.deployment.contract.address, BigInt(opts.deployment.contract.deploymentBlock));
  }

  private log(msg: string) {
    (this.opts.log ?? ((m) => console.log(`[relayer] ${m}`)))(msg);
  }

  private wallet(id: RelayerIdentity) {
    return createWalletClient({
      account: privateKeyToAccount(id.signingKey),
      chain: chainFromDeployment(this.opts.deployment),
      transport: http(this.opts.deployment.rpcUrl),
    });
  }

  private async send(id: RelayerIdentity, write: ReturnType<ReturnType<typeof prepare>[keyof ReturnType<typeof prepare>]>) {
    const wallet = this.wallet(id);
    const { request } = await this.client.simulateContract({
      account: wallet.account,
      address: write.address,
      abi: write.abi,
      functionName: write.functionName as never,
      args: write.args as never,
    });
    const hash = await wallet.writeContract(request as never);
    const { confirmations, settleMs } = writeSettling(this.opts.deployment.network);
    const receipt = await this.client.waitForTransactionReceipt({ hash, confirmations });
    if (settleMs) await new Promise((r) => setTimeout(r, settleMs));
    if (receipt.status !== "success") throw new Error(`${write.label} reverted in ${hash}`);
    return hash;
  }

  /** Publish each identity's encryption key to storage and register its fingerprint on-chain once. */
  async ensureRegistered() {
    if (this.registered) return;
    const p = prepare(this.opts.deployment.contract.address);
    for (const id of this.opts.identities) {
      const pub = Uint8Array.from(Buffer.from(id.encryption.publicKeyHex, "hex"));
      const ref = await putVerified(this.opts.store, pub, "relayer public key");
      if (`0x${ref}` !== id.encryption.fingerprint) throw new Error("relayer key fingerprint mismatch");
      const onChain = await this.reader.relayerKeyOf(id.address);
      if (/^0x0+$/.test(onChain)) {
        const tx = await this.send(id, p.registerRelayerKey(id.encryption.fingerprint));
        this.log(`${id.label} ${id.address} registered key ${id.encryption.fingerprint.slice(0, 12)}… in ${tx}`);
      } else if (onChain.toLowerCase() !== id.encryption.fingerprint.toLowerCase()) {
        throw new Error(`${id.label}: on-chain key ${onChain} differs from local identity`);
      }
    }
    this.registered = true;
  }

  /** One pass over all circles. Returns the actions taken, for tests and scripts. */
  async tick(): Promise<string[]> {
    await this.ensureRegistered();
    const actions: string[] = [];
    const count = Number(await this.reader.circleCount());
    const p = prepare(this.opts.deployment.contract.address);
    for (let i = 1; i <= count; i++) {
      const id = BigInt(i);
      const mine = this.opts.identities;
      const circle = await this.reader.getCircle(id);
      const quorum = new Set(circle.policy.relayers.map((r) => r.toLowerCase()));
      const inQuorum = mine.filter((m) => quorum.has(m.address.toLowerCase()));
      if (inQuorum.length === 0) continue;

      if (this.opts.autoRequestRelease && circle.lifecycle === "SEALED" && circle.ruleStatus === 0) {
        try {
          const tx = await this.send(inQuorum[0]!, p.requestRelease(id));
          actions.push(`requestRelease ${id} ${tx}`);
          this.log(`circle ${id}: rule is true on-chain; recorded eligibility in ${tx}`);
        } catch (e) {
          this.log(`circle ${id}: requestRelease not accepted: ${decodeRevert(e)?.reason ?? (e as Error).message}`);
        }
        continue; // pick up receipts on the next pass, from the chain's recorded state
      }
      if (circle.eligibleAt === 0) continue;

      for (const me of inQuorum) {
        const key = `${id}:${me.address.toLowerCase()}`;
        if (this.done.has(key)) continue;
        if (this.opts.withhold?.has(me.address.toLowerCase())) {
          if (!this.done.has(`${key}:logged`)) this.log(`circle ${id}: ${me.label} WITHHOLDING its receipt (adversarial fixture)`);
          this.done.add(`${key}:logged`);
          continue;
        }
        const existing = await this.reader.receiptOf(id, me.address);
        if (!/^0x0+$/.test(existing)) {
          this.done.add(key);
          continue;
        }
        const started = Date.now();
        const digest = await this.deliver(id, me, circle.eligibleAt);
        const tx = await this.send(me, p.recordReleaseReceipt(id, digest));
        this.done.add(key);
        actions.push(`receipt ${id} ${me.address} ${tx}`);
        this.log(`circle ${id}: ${me.label} delivered shares (${digest.slice(0, 12)}…) and recorded receipt in ${tx}`);
        if (this.opts.metricsFile) {
          appendFileSync(
            this.opts.metricsFile,
            `${JSON.stringify({ circleId: i, relayer: me.address, eligibleAt: circle.eligibleAt, receiptTx: tx, receiptAtMs: Date.now(), workMs: Date.now() - started })}\n`,
          );
        }
      }
    }
    return actions;
  }

  /** Build, sign and upload this relayer's delivery manifest for one eligible circle. */
  async deliver(circleId: bigint, me: RelayerIdentity, eligibleAt: number): Promise<Hex> {
    const d = this.opts.deployment;
    const ctx = { chainId: d.chainId, registry: d.contract.address, circleId };
    const events = await this.reader.circleEvents(circleId);
    const members: EntitledMember[] = [];
    for (const e of events.filter((x) => x.name === "ConsentRecorded")) {
      const fp = e.args.encryptionKeyFingerprint as Hex;
      const publicKey = await getVerified(this.opts.store, fp, "member public key");
      members.push({ address: e.args.member as `0x${string}`, publicKey });
    }
    const deliveries: DeliveryManifest["deliveries"] = [];
    for (const e of events.filter((x) => x.name === "ContributionCommitted")) {
      const commitment = e.args.commitment as Hex;
      const manifest = await fetchManifest(this.opts.store, commitment, { ...ctx, contributor: e.args.member as string });
      const share = await openRelayerShare({ manifest, ctx, relayer: me.address, relayerPrivateJwk: me.encryption.privateJwk });
      deliveries.push(...(await deliverShare({ ctx, contribution: commitment, share, members })));
    }
    const unsigned = {
      v: 1 as const,
      kind: "relay.delivery" as const,
      chainId: d.chainId,
      registry: d.contract.address,
      circleId: circleId.toString(),
      relayer: me.address,
      eligibleAt,
      deliveries,
    };
    const signingHash = await sha256Bytes32(deliverySigningBytes(unsigned));
    const signature = await privateKeyToAccount(me.signingKey).signMessage({ message: { raw: signingHash } });
    const bytes = encodeDelivery({ ...unsigned, signature });
    return `0x${await putVerified(this.opts.store, bytes, "delivery manifest")}`;
  }
}

async function main() {
  const cmd = process.argv[2];
  const dir = arg("dir", ".relay-local/relayers")!;
  if (cmd === "init") {
    const count = Number(arg("count", "3"));
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "identities.json");
    if (existsSync(file)) {
      console.log(`Identities already exist at ${file}`);
      return;
    }
    const ids = [];
    for (let i = 0; i < count; i++) ids.push(await createIdentity(`relayer-${i + 1}`));
    writeFileSync(file, JSON.stringify(ids, null, 2), { mode: 0o600 });
    console.log(`Created ${count} relayer identities in ${file}. Fund these addresses before running on a public network:`);
    for (const id of ids) console.log(`  ${id.label} ${id.address}`);
    return;
  }
  if (cmd === "run") {
    const deployment = DeploymentSchema.parse(JSON.parse(readFileSync(arg("deployment", "deployments/local.json")!, "utf8")));
    const relayer = new Relayer({
      deployment,
      identities: loadIdentities(dir),
      store: new HttpBlobStore(deployment.storage.url),
      withhold: new Set((process.env.RELAYER_WITHHOLD ?? "").split(",").filter(Boolean).map((a) => a.toLowerCase())),
      autoRequestRelease: process.env.AUTO_REQUEST_RELEASE !== "0",
      metricsFile: join(dir, "metrics.jsonl"),
    });
    const interval = Number(process.env.POLL_MS ?? 3000);
    console.log(`[relayer] PROJECT_BASELINE relayer for ${deployment.label} registry ${deployment.contract.address}, polling every ${interval}ms`);
    for (;;) {
      try {
        await relayer.tick();
      } catch (e) {
        console.error(`[relayer] pass failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      await new Promise((r) => setTimeout(r, interval));
    }
  }
  console.log("usage: relayer.ts init|run [--dir DIR] [--deployment FILE] [--count N]");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
