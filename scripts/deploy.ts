/**
 * Deploy CapsuleRegistry to BOT Chain and write deployments/<network>.json (PRD §15.2, §16).
 *
 *   pnpm deploy:testnet --preflight     check every precondition, spend nothing
 *   DEPLOYER_PRIVATE_KEY=0x… STORAGE_URL=https://… RELAYER_DIR=.relay-testnet/relayers pnpm deploy:testnet
 *   pnpm deploy:mainnet --preflight
 *   DEPLOYER_PRIVATE_KEY=0x… STORAGE_URL=https://… pnpm deploy:mainnet --confirm-mainnet
 *
 * Gates: the network's T0 probe must exist, agree, and be < 24h old. Mainnet additionally needs
 * gate M0 recorded (evidence/gates/M0.json, `pnpm gate:status`) for the exact bytecode being
 * deployed, and the explicit --confirm-mainnet flag on the spending run (PRD §18).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, formatEther, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CAPSULE_REGISTRY_ABI_SHA256, capsuleRegistryAbi, DeploymentSchema, NetworkProbeSchema, type Deployment } from "@relay/protocol-types";
import { capsuleRegistryBytecode, CAPSULE_REGISTRY_RUNTIME_SHA256 } from "@relay/protocol-types/bytecode";
import { chainFromDeployment, fromHex, HttpBlobStore, sha256Hex } from "@relay/sdk";
import { loadIdentities, Relayer } from "../apps/relayer/src/relayer.ts";
import { gitCommit, ROOT } from "./lib/harness.ts";
import { gateStatus } from "./gates.ts";

const network = process.argv.includes("--network") ? process.argv[process.argv.indexOf("--network") + 1]! : "testnet";
const preflight = process.argv.includes("--preflight");

async function main() {
  if (network !== "testnet" && network !== "mainnet") {
    console.error(`Unknown network ${network}; expected testnet or mainnet.`);
    process.exit(2);
  }
  const mainnet = network === "mainnet";
  const label = mainnet ? "BOT Chain mainnet" : "BOT Chain testnet";
  const problems: string[] = [];
  if (mainnet) {
    const status = gateStatus();
    const m0 = status.find((x) => x.id === "M0")!;
    if (!m0.passed) problems.push(`Gate M0 not passed: ${m0.missing.join("; ")}`);
    const unmet = status.filter((x) => x.id !== "M0" && !x.passed).map((x) => x.id);
    if (m0.passed && unmet.length) console.log(`OWNER OVERRIDE (evidence/gates/M0.json): deploying with ${unmet.join(", ")} unmet.`);
    if (existsSync(resolve(ROOT, "deployments/mainnet.json"))) problems.push("deployments/mainnet.json already exists: a second mainnet deployment is a new decision (DECISIONS.md), not a re-run.");
    if (!preflight && !process.argv.includes("--confirm-mainnet")) problems.push("Spending run needs --confirm-mainnet: it deploys with real BOT and publishes the address.");
  }
  const probePath = resolve(ROOT, `deployments/${network}.probe.json`);
  if (!existsSync(probePath)) throw new Error(`Gate T0 not met: run \`pnpm probe:${network}\` first.`);
  const probe = NetworkProbeSchema.parse(JSON.parse(readFileSync(probePath, "utf8")));
  const ageH = (Date.now() - Date.parse(probe.probedAt)) / 3.6e6;
  if (!probe.agreement) problems.push("T0 probe recorded a chain-ID disagreement.");
  if (ageH > 24) problems.push(`T0 probe is ${ageH.toFixed(1)}h old; re-run \`pnpm probe:${network}\` before deploying.`);

  const { chainId, rpcUrl, explorerUrl, nativeSymbol } = probe.documented;
  const client = createPublicClient({ transport: http(rpcUrl) });
  const liveChain = await client.getChainId();
  if (liveChain !== chainId) problems.push(`RPC now reports chain ${liveChain}, probe recorded ${chainId}: PROTOCOL_CONFIG_CHANGED.`);

  const key = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
  const storageUrl = process.env.STORAGE_URL;
  const relayerDir = process.env.RELAYER_DIR ?? `.relay-${network}/relayers`;
  if (!key) problems.push("DEPLOYER_PRIVATE_KEY is not set (owner decision: deployment wallet and funds).");
  if (!storageUrl) problems.push("STORAGE_URL is not set (public URL of the PROJECT_BASELINE storage server).");
  let identities: ReturnType<typeof loadIdentities> = [];
  try {
    identities = loadIdentities(relayerDir);
  } catch (e) {
    problems.push(`${(e as Error).message} (tsx apps/relayer/src/relayer.ts init --dir ${relayerDir} --count 3)`);
  }

  const gasPrice = await client.getGasPrice();
  const deployGas = 2_800_000n; // 2,729,551 measured on testnet
  if (key) {
    const deployer = privateKeyToAccount(key).address;
    const bal = await client.getBalance({ address: deployer });
    const need = deployGas * gasPrice;
    console.log(`deployer ${deployer}: ${formatEther(bal)} ${nativeSymbol} (deploy needs ~${formatEther(need)})`);
    if (bal < need) problems.push(mainnet ? `Deployer ${deployer} holds less than the ~${formatEther(need)} BOT deployment needs.` : `Deployer ${deployer} is unfunded; claim test tokens at ${probe.documented.faucetUrl}.`);
  }
  for (const id of identities) {
    const bal = await client.getBalance({ address: id.address });
    // Key registration plus one capsule's release request and receipt (measured: 45,619 + 34,951 + 63,855).
    const need = (mainnet ? 150_000n : 400_000n) * gasPrice;
    console.log(`relayer ${id.label} ${id.address}: ${formatEther(bal)} ${nativeSymbol}`);
    if (bal < need) problems.push(`Relayer ${id.address} needs gas for key registration and receipts.`);
  }
  if (storageUrl) {
    const ok = await fetch(`${storageUrl.replace(/\/$/, "")}/health`).then((r) => r.ok).catch(() => false);
    if (!ok) problems.push(`Storage server at ${storageUrl} is not reachable.`);
  }

  if (problems.length || preflight) {
    console.log(`\n${problems.length ? "BLOCKED" : "READY"} — ${label} deployment preflight`);
    for (const p of problems) console.log(`  • ${p}`);
    process.exit(problems.length ? 1 : 0);
  }

  const account = privateKeyToAccount(key!);
  const chainStub = { id: chainId, name: label, nativeCurrency: { name: nativeSymbol, symbol: nativeSymbol, decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } } as const;
  const wallet = createWalletClient({ account, chain: chainStub, transport: http(rpcUrl) });
  console.log("deploying CapsuleRegistry…");
  const hash = await wallet.deployContract({ abi: capsuleRegistryAbi, bytecode: capsuleRegistryBytecode });
  const receipt = await client.waitForTransactionReceipt({ hash });
  const address = receipt.contractAddress!;
  const code = await client.getCode({ address });
  const runtime = await sha256Hex(fromHex(code!));
  if (runtime !== CAPSULE_REGISTRY_RUNTIME_SHA256) throw new Error(`Deployed runtime ${runtime} ≠ build ${CAPSULE_REGISTRY_RUNTIME_SHA256}`);
  console.log(`deployed at ${address} in ${hash} (block ${receipt.blockNumber})`);

  let verifiedSource: Deployment["contract"]["verifiedSource"] = "UNVERIFIED";
  try {
    execFileSync(
      `${process.env.HOME}/.foundry/bin/forge`,
      ["verify-contract", address, "src/CapsuleRegistry.sol:CapsuleRegistry", "--verifier", "blockscout", "--verifier-url", `${explorerUrl}/api/`, "--chain", String(chainId), "--watch"],
      { cwd: resolve(ROOT, "contracts"), stdio: "inherit" },
    );
    verifiedSource = "VERIFIED";
  } catch {
    console.error("Source verification did not complete; record stays UNVERIFIED until `forge verify-contract` succeeds (gate T2).");
  }

  const deployment: Deployment = DeploymentSchema.parse({
    schema: "relay.deployment/v1",
    network,
    label,
    chainId,
    nativeSymbol,
    rpcUrl,
    explorerUrl,
    probe: { file: `deployments/${network}.probe.json`, probedAt: probe.probedAt },
    contract: {
      name: "CapsuleRegistry",
      address,
      deployer: account.address,
      transactionHash: hash,
      deploymentBlock: Number(receipt.blockNumber),
      runtimeSha256: runtime,
      verifiedSource,
      verificationUrl: `${explorerUrl}/address/${address}?tab=contract`,
    },
    abiSha256: CAPSULE_REGISTRY_ABI_SHA256,
    sourceCommit: gitCommit(),
    quorum: {
      relayers: identities.map((id) => ({
        address: id.address,
        label: id.label,
        independence: "PROJECT_BASELINE",
        operator: "Relay project",
        encryptionKeyFingerprint: id.encryption.fingerprint,
        endpoint: null,
      })),
      defaultThreshold: Math.min(2, identities.length),
      independence: "PROJECT_BASELINE",
      note: "All relayers are operated by the Relay project. A colluding threshold could disclose early; this is not an independent quorum.",
    },
    storage: { url: storageUrl!, operator: process.env.STORAGE_OPERATOR ?? "Relay project", label: "PROJECT_BASELINE" },
    steward: { url: process.env.STEWARD_URL ?? null, address: null },
    verifier: { version: "0.1.0", sourceCommit: gitCommit(), url: process.env.VERIFIER_URL ?? null },
    deployedAt: new Date().toISOString(),
  });
  writeFileSync(resolve(ROOT, `deployments/${network}.json`), `${JSON.stringify(deployment, null, 2)}\n`);
  const relayer = new Relayer({ deployment, identities, store: new HttpBlobStore(storageUrl!), autoRequestRelease: true });
  await relayer.ensureRegistered();
  void chainFromDeployment;
  console.log(`deployments/${network}.json written; relayer keys registered. Next: ${mainnet ? "pnpm verify:mainnet, then record M1 (PRD §22)" : "pnpm proof:testnet"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
