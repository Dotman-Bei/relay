/**
 * Gate T0 (PRD §22): probe official BOT Chain sources and the live RPC, then record the result.
 * Network configuration is live protocol data (PRD §0.2): it is read from the official docs at
 * probe time and checked against what the RPC actually reports — never copied into constants.
 *
 *   pnpm probe:testnet   → deployments/testnet.probe.json
 *   pnpm probe:mainnet   → deployments/mainnet.probe.json (read-only; no mainnet action follows)
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { NetworkProbeSchema, type NetworkProbe } from "@relay/protocol-types";
import { ROOT } from "./lib/harness.ts";

const network = (process.argv[2] ?? "testnet") as "testnet" | "mainnet";
const DOCS = "https://dev-docs.botchain.ai";
const SOURCES = {
  quickGuide: `${DOCS}/docs/Developers/quick-guide/`,
  rpcEndpoints: `${DOCS}/docs/Developers/json-rpc-endpoint/`,
  aaEndpoints: `${DOCS}/docs/Account-Abstraction/network-and-endpoints`,
  faucet: `${DOCS}/docs/Developers/claim-test-tbot-tokens/`,
};

const text = (html: string) =>
  html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, "")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>/g, " $1 ")
    .replace(/<br\s*\/?>|<\/(p|li|h\d|tr|div|td|th)>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ");

async function fetchSource(url: string) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const html = await res.text();
  return { url, html, text: text(html), fetchedAt: new Date().toISOString(), sha256: createHash("sha256").update(html).digest("hex") };
}

async function rpc(url: string, method: string, params: unknown[] = []) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const body = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

async function main() {
  const discrepancies: string[] = [];
  const [quick, rpcPage, aa, faucet] = await Promise.all([
    fetchSource(SOURCES.quickGuide),
    fetchSource(SOURCES.rpcEndpoints),
    fetchSource(SOURCES.aaEndpoints),
    fetchSource(SOURCES.faucet),
  ]);

  // Quick guide: "Test net … Chain ID：968 RPC： https://… Explorer： https://…" then "Main net …"
  const section = network === "testnet" ? quick.text.split(/Main net/i)[0]!.split(/Test net/i)[1] ?? "" : quick.text.split(/Main net/i)[1] ?? "";
  const grab = (re: RegExp) => section.match(re)?.[1]?.trim();
  const chainId = Number(grab(/Chain ID[：:]\s*(\d+)/));
  const rpcUrl = grab(/RPC[：:]\s*(https?:\/\/[^\s]+)/)?.replace(/\/$/, "");
  const explorerUrl = grab(/Explorer[：:]\s*(https?:\/\/[^\s]+)/)?.replace(/\/$/, "");
  const nativeSymbol = grab(/Native Token[：:]\s*([A-Za-z]+)/) ?? "BOT";
  if (!chainId || !rpcUrl || !explorerUrl) throw new Error("Could not parse network configuration from the official quick guide");

  // Cross-check against the other official pages.
  const aaChain = aa.text.match(new RegExp(`${network === "testnet" ? "Testnet" : "Mainnet"}[\\s\\S]*?Chain ID[\\s\\S]*?(\\d{3,})\\s*\\(0x`, "i"));
  if (!aa.text.includes(String(chainId))) discrepancies.push(`Account-abstraction page does not mention chain ID ${chainId}`);
  if (!rpcPage.text.includes(rpcUrl)) discrepancies.push(`JSON-RPC page does not list ${rpcUrl}`);
  void aaChain;
  const faucetUrl = network === "testnet" ? (faucet.text.match(/(https:\/\/faucet\.[^\s]+)/)?.[1]?.replace(/\.$/, "") ?? null) : null;
  if (network === "testnet" && /tBOT/.test(faucet.text) && nativeSymbol === "BOT") {
    discrepancies.push("Quick guide names the testnet token BOT; the faucet page calls it tBOT. Recorded symbol: BOT (quick guide).");
  }
  if (network === "mainnet" && /eth_getLogs is disabled/i.test(rpcPage.text)) {
    discrepancies.push("Official docs: eth_getLogs is disabled on the public mainnet endpoints. The verifier needs a log-capable endpoint on mainnet (Phase F).");
  }

  // Live observation.
  const observedChainId = Number(BigInt((await rpc(rpcUrl, "eth_chainId")) as string));
  const clientVersion = (await rpc(rpcUrl, "web3_clientVersion").catch(() => null)) as string | null;
  const latest = (await rpc(rpcUrl, "eth_getBlockByNumber", ["latest", false])) as { number: string; timestamp: string };
  const latestBlock = Number(BigInt(latest.number));
  let getLogsMaxRangeTested: number | null = null;
  for (const range of [1_000, 10_000, 50_000, 100_000]) {
    try {
      await rpc(rpcUrl, "eth_getLogs", [{ fromBlock: `0x${(latestBlock - range).toString(16)}`, toBlock: latest.number, address: "0x0000000000000000000000000000000000000000" }]);
      getLogsMaxRangeTested = range;
    } catch (e) {
      discrepancies.push(`eth_getLogs over ${range} blocks failed: ${(e as Error).message}`);
      break;
    }
  }
  let explorerApi: string | null = null;
  try {
    const res = await fetch(`${explorerUrl}/api/v2/stats`);
    if (res.ok) explorerApi = "blockscout-v2";
  } catch {
    explorerApi = null;
  }
  if (observedChainId !== chainId) discrepancies.push(`RPC reports chain ${observedChainId}; docs say ${chainId}`);
  const skew = Math.abs(Date.now() / 1000 - Number(BigInt(latest.timestamp)));
  if (skew > 120) discrepancies.push(`Latest block timestamp is ${Math.round(skew)}s from local clock`);

  const probe: NetworkProbe = NetworkProbeSchema.parse({
    network,
    probedAt: new Date().toISOString(),
    officialSources: [quick, rpcPage, aa, faucet].map((s) => ({ url: s.url, fetchedAt: s.fetchedAt, sha256: s.sha256 })),
    documented: { chainId, rpcUrl, explorerUrl, faucetUrl, nativeSymbol },
    observed: { chainId: observedChainId, clientVersion, latestBlock, latestBlockTimestamp: Number(BigInt(latest.timestamp)), getLogsMaxRangeTested, explorerApi },
    agreement: observedChainId === chainId,
    discrepancies,
  });
  const out = resolve(ROOT, `deployments/${network}.probe.json`);
  writeFileSync(out, `${JSON.stringify(probe, null, 2)}\n`);
  console.log(JSON.stringify(probe, null, 2));
  console.log(`\nT0 ${probe.agreement ? "PASSED" : "FAILED"} for BOT Chain ${network} → ${out}`);
  process.exit(probe.agreement ? 0 : 1);
}

main().catch((e) => {
  console.error(`T0 probe failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
