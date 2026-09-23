/**
 * Reference parity (PRD §13.4, kill criterion §26): the reference evaluator and the Solidity
 * contract must make the same decision — accept, or revert with the same custom error and
 * arguments — for generated policies and event histories, at identical block timestamps.
 *
 *   pnpm test:parity [--sequences 40] [--steps 30] [--seed 1234]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  decodeErrorResult,
  http,
  type Hex,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { capsuleRegistryAbi, lifecycleFromIndex, type Policy } from "@relay/protocol-types";
import { capsuleRegistryBytecode } from "@relay/protocol-types/bytecode";
import {
  apply,
  emptyRegistry,
  hashPolicy,
  inviteDigest,
  lifecycle,
  releaseRuleStatus,
  type Action,
  type RegistryState,
} from "@relay/reference";
import { toChainPolicy } from "@relay/sdk";
import { ROOT, startAnvil } from "./lib/harness.ts";

const KEYS: Hex[] = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
  "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
  "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
  "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97",
  "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6",
];

const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1]! : d;
};

// Deterministic PRNG (mulberry32) so failures are reproducible from the seed.
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)), pick: <T>(xs: T[]) => xs[Math.floor(next() * xs.length)]! };
}

type Norm = { ok: true } | { ok: false; name: string; args: string[] };

function normArgs(name: string, args: readonly unknown[]): string[] {
  if (name === "WrongLifecycle") return [typeof args[0] === "string" ? String(args[0]) : lifecycleFromIndex(Number(args[0]))];
  return args.map((a) => String(a).toLowerCase());
}

async function main() {
  const sequences = Number(arg("sequences", "40"));
  const steps = Number(arg("steps", "30"));
  const seed = Number(arg("seed", "1234"));
  const r = rng(seed);

  const anvil = await startAnvil(8745);
  const chain = { id: 31337, name: "parity", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [anvil.rpcUrl] } } } as const;
  const client = createPublicClient({ chain, transport: http(anvil.rpcUrl) });
  const accounts = KEYS.map((k) => privateKeyToAccount(k));
  const wallets = accounts.map((account) => createWalletClient({ account, chain, transport: http(anvil.rpcUrl) }));
  const [deployer, creator, m1, m2, m3, m4, r1, r2, r3, outsider] = accounts;
  const members = [m1!, m2!, m3!, m4!];
  const relayers = [r1!, r2!, r3!];
  const walletOf = (addr: string) => wallets[accounts.findIndex((a) => a.address.toLowerCase() === addr.toLowerCase())]!;

  const t0 = Number((await client.getBlock()).timestamp) + 10;
  let now = t0;
  const dep = await wallets[0]!.deployContract({ abi: capsuleRegistryAbi, bytecode: capsuleRegistryBytecode });
  const registry = (await client.waitForTransactionReceipt({ hash: dep })).contractAddress!;
  let model: RegistryState = emptyRegistry();

  const stats = { transactions: 0, accepted: 0, reverted: 0, mismatches: 0, viewChecks: 0, hashChecks: 0, errorsSeen: {} as Record<string, number> };
  const mismatches: string[] = [];

  /** Execute one action on both sides at timestamp `at`. */
  async function both(action: Action, at: number, sendArgs: { functionName: string; args: readonly unknown[] }) {
    now = Math.max(at, now + 1);
    const ref = apply(model, action, now);
    await client.request({ method: "evm_setNextBlockTimestamp" as never, params: [now] as never });
    const hash = await walletOf(action.caller).writeContract({
      address: registry,
      abi: capsuleRegistryAbi,
      functionName: sendArgs.functionName as never,
      args: sendArgs.args as never,
      gas: 2_000_000n,
    } as never);
    const receipt = await client.waitForTransactionReceipt({ hash });
    stats.transactions++;
    let chainResult: Norm = { ok: true };
    if (receipt.status !== "success") {
      const trace = (await client.request({ method: "debug_traceTransaction" as never, params: [hash, { tracer: "callTracer" }] as never })) as { output?: Hex };
      const decoded = decodeErrorResult({ abi: capsuleRegistryAbi, data: trace.output ?? "0x" });
      chainResult = { ok: false, name: decoded.errorName, args: normArgs(decoded.errorName, decoded.args ?? []) };
    }
    const refResult: Norm = ref.ok ? { ok: true } : { ok: false, name: ref.error.name, args: normArgs(ref.error.name, ref.error.args) };
    if (JSON.stringify(chainResult) !== JSON.stringify(refResult)) {
      stats.mismatches++;
      mismatches.push(`${action.type} at ${now}: chain ${JSON.stringify(chainResult)} vs reference ${JSON.stringify(refResult)}`);
    }
    if (chainResult.ok) stats.accepted++;
    else {
      stats.reverted++;
      stats.errorsSeen[chainResult.name] = (stats.errorsSeen[chainResult.name] ?? 0) + 1;
    }
    if (ref.ok) model = ref.state;
  }

  async function compareViews(circleId: bigint) {
    const c = model.circles[circleId.toString()];
    if (!c) return;
    const [view, life, rule] = await Promise.all([
      client.readContract({ address: registry, abi: capsuleRegistryAbi, functionName: "getCircle", args: [circleId] }),
      client.readContract({ address: registry, abi: capsuleRegistryAbi, functionName: "lifecycleOf", args: [circleId] }),
      client.readContract({ address: registry, abi: capsuleRegistryAbi, functionName: "releaseRuleStatus", args: [circleId] }),
    ]);
    const chainTime = Number((await client.getBlock()).timestamp);
    const pairs: [string, unknown, unknown][] = [
      ["lifecycle", lifecycleFromIndex(Number(life)), lifecycle(c, chainTime)],
      ["ruleStatus", Number(rule), releaseRuleStatus(c, chainTime)],
      ["memberCount", view.memberCount, c.memberCount],
      ["consentCount", view.consentCount, c.consentCount],
      ["contributionCount", view.contributionCount, c.contributionCount],
      ["receiptCount", view.receiptCount, c.receiptCount],
      ["eligibleAt", Number(view.eligibleAt), c.eligibleAt],
      ["policyHash", view.policyHash.toLowerCase(), c.policyHash.toLowerCase()],
      ["ruleLocked", view.ruleLocked, c.ruleLocked],
    ];
    stats.viewChecks++;
    for (const [k, a, b] of pairs) {
      if (String(a) !== String(b)) {
        stats.mismatches++;
        mismatches.push(`view ${k} for circle ${circleId} at ${chainTime}: chain ${String(a)} vs reference ${String(b)}`);
      }
    }
  }

  // Relayer keys (one relayer deliberately left unregistered to exercise RelayerKeyMissing).
  for (const [i, rl] of relayers.slice(0, 2).entries()) {
    const fp = `0x${(i + 1).toString(16).padStart(64, "0")}` as Hex;
    await both({ type: "registerRelayerKey", caller: rl.address, fingerprint: fp }, now + 1, { functionName: "registerRelayerKey", args: [fp] });
  }

  const randomPolicy = (): Policy => {
    const valid = r.next() < 0.85;
    const seal = now + r.int(valid ? 30 : -5, 900);
    const release = seal + r.int(valid ? 0 : -20, 900);
    const nRel = r.int(1, valid ? 2 : 3);
    const cap = r.int(valid ? 2 : 1, 5);
    return {
      sealAt: seal,
      releaseAt: release,
      expiresAt: r.next() < 0.4 ? 0 : release + r.int(valid ? 1 : 0, 900),
      capacity: cap,
      minContributions: r.int(valid ? 1 : 0, cap),
      unanimousConsent: r.next() < 0.5,
      receiptThreshold: r.int(1, nRel),
      relayers: (r.next() < 0.9 ? relayers.slice(0, nRel) : [relayers[0]!, relayers[0]!]).map((a) => a.address),
    };
  };

  for (let s = 0; s < sequences; s++) {
    const policy = randomPolicy();
    const h = hashPolicy(policy);
    const chainHash = await client.readContract({ address: registry, abi: capsuleRegistryAbi, functionName: "hashPolicy", args: [toChainPolicy(policy)] });
    stats.hashChecks++;
    if (chainHash.toLowerCase() !== h.toLowerCase()) {
      stats.mismatches++;
      mismatches.push(`hashPolicy mismatch for ${JSON.stringify(policy)}`);
    }
    const meta = `0x${(s + 1).toString(16).padStart(64, "0")}` as Hex;
    const expectedId = model.circleCount + 1n;
    await both({ type: "createCircle", caller: creator!.address, policy, metadataCommitment: meta }, now + 1, {
      functionName: "createCircle",
      args: [toChainPolicy(policy), meta],
    });
    if (model.circleCount !== expectedId) continue; // invalid policy rejected identically; next sequence
    const id = expectedId;

    const invites: { key: `0x${string}`; pk: Hex }[] = [];
    for (let k = 0; k < steps; k++) {
      const c = model.circles[id.toString()]!;
      // Steer towards the lifecycle's productive actions 80% of the time; otherwise anything goes.
      const phase = lifecycle(c, now);
      const productive: Record<string, number[]> = {
        DRAFT: [0, 0, 1, 11],
        AWAITING_CONSENT: [1, 2, 3, 4, 5, 6, 10, 11],
        COLLECTING: [2, 3, 4, 5, 6, 7, 7, 13],
        SEALED: [8, 8, 13, 12],
        RELEASE_ELIGIBLE: [9, 9, 9, 8],
        RELEASED: [9, 8, 13],
        CANCELLED: [0, 10, 8],
        EXPIRED: [12, 8, 9],
      };
      const roll = r.next() < 0.8 ? r.pick(productive[phase]!) : r.int(0, 13);
      const anyone = r.pick([creator!, ...members, outsider!]);
      switch (roll) {
        case 0:
          await both({ type: "openCircle", caller: r.next() < 0.85 ? creator!.address : anyone.address, circleId: id }, now + r.int(1, 5), { functionName: "openCircle", args: [id] });
          break;
        case 1: {
          const pk = generatePrivateKey();
          const key = privateKeyToAccount(pk).address;
          invites.push({ key, pk });
          await both({ type: "issueInvitations", caller: creator!.address, circleId: id, inviteKeys: [key] }, now + 1, { functionName: "issueInvitations", args: [id, [key]] });
          break;
        }
        case 2:
        case 3: {
          const who = r.pick(members);
          const inv = invites.length ? r.pick(invites) : { key: outsider!.address, pk: KEYS[9]! };
          const forge = r.next() < 0.15;
          const signerPk = forge ? generatePrivateKey() : inv.pk;
          const digest = inviteDigest(31337, registry, id, who.address);
          const sig = await privateKeyToAccount(signerPk).signMessage({ message: { raw: digest } });
          const recovered = privateKeyToAccount(signerPk).address;
          await both({ type: "acceptInvitation", caller: who.address, circleId: id, inviteKey: inv.key, recoveredSigner: recovered }, now + r.int(1, 8), {
            functionName: "acceptInvitation",
            args: [id, inv.key, sig],
          });
          break;
        }
        case 4:
        case 5: {
          const who = r.pick([creator!, ...members]);
          const stale = r.next() < 0.1;
          const ph = stale ? (`0x${"ab".repeat(32)}` as Hex) : c.policyHash;
          const fp = r.next() < 0.05 ? (`0x${"0".repeat(64)}` as Hex) : (`0x${"cd".repeat(32)}` as Hex);
          await both({ type: "recordConsent", caller: who.address, circleId: id, policyHash: ph, fingerprint: fp }, now + r.int(1, 8), { functionName: "recordConsent", args: [id, ph, fp] });
          break;
        }
        case 6:
        case 7: {
          const who = r.pick([creator!, ...members]);
          const cm = r.next() < 0.05 ? (`0x${"0".repeat(64)}` as Hex) : (`0x${(k + 1000 * s + 7).toString(16).padStart(64, "0")}` as Hex);
          await both({ type: "commitContribution", caller: who.address, circleId: id, commitment: cm }, now + r.int(1, 8), { functionName: "commitContribution", args: [id, cm] });
          break;
        }
        case 8:
          await both({ type: "requestRelease", caller: anyone.address, circleId: id }, now + r.int(1, 60), { functionName: "requestRelease", args: [id] });
          break;
        case 9: {
          const rl = r.pick([...relayers, outsider!]);
          const dg = `0x${(k + 5).toString(16).padStart(64, "0")}` as Hex;
          await both({ type: "recordReleaseReceipt", caller: rl.address, circleId: id, deliveryDigest: dg }, now + r.int(1, 30), { functionName: "recordReleaseReceipt", args: [id, dg] });
          break;
        }
        case 10:
          await both({ type: "cancel", caller: r.next() < 0.8 ? creator!.address : anyone.address, circleId: id }, now + r.int(1, 30), { functionName: "cancel", args: [id] });
          break;
        case 11: {
          const np = randomPolicy();
          await both({ type: "updatePolicy", caller: creator!.address, circleId: id, policy: np }, now + r.int(1, 30), { functionName: "updatePolicy", args: [id, toChainPolicy(np)] });
          break;
        }
        case 12:
          await both({ type: "markExpired", caller: anyone.address, circleId: id }, now + r.int(1, 60), { functionName: "markExpired", args: [id] });
          break;
        case 13: {
          // time passes with no action: jump to (or just before) the next deadline, or drift
          const targets = [c.policy.sealAt - 1, c.policy.sealAt, c.policy.releaseAt - 1, c.policy.releaseAt, c.policy.expiresAt || c.policy.releaseAt + 50]
            .filter((x) => x > now);
          now = targets.length && r.next() < 0.7 ? r.pick(targets) : now + r.int(30, 400);
          await client.request({ method: "evm_setNextBlockTimestamp" as never, params: [now] as never });
          await client.request({ method: "evm_mine" as never, params: [] as never });
          break;
        }
      }
      await compareViews(id);
    }
  }

  anvil.stop();
  const report = {
    schema: "relay.parity-report/v1",
    label: "LOCAL FIXTURE",
    generatedAt: new Date().toISOString(),
    seed,
    sequences,
    stepsPerSequence: steps,
    ...stats,
    verdict: stats.mismatches === 0 ? "PASS" : "FAIL",
    mismatches: mismatches.slice(0, 50),
  };
  mkdirSync(resolve(ROOT, "evidence/parity"), { recursive: true });
  const out = resolve(ROOT, "evidence/parity/parity-report.json");
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `parity ${report.verdict}: ${stats.transactions} transactions (${stats.accepted} accepted, ${stats.reverted} reverted), ` +
      `${stats.viewChecks} view comparisons, ${stats.hashChecks} policy-hash comparisons, ${stats.mismatches} mismatches\n` +
      `errors exercised: ${Object.entries(stats.errorsSeen).map(([k, v]) => `${k}×${v}`).join(", ")}\nreport: ${out}`,
  );
  if (mismatches.length) console.log(mismatches.slice(0, 10).join("\n"));
  process.exit(stats.mismatches === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
