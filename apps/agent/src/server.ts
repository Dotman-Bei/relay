/**
 * Memory Steward HTTP service.
 *   GET  /health
 *   POST /v1/consent                 signed StewardConsent (opt in / opt out)
 *   GET  /v1/consent/:circleId/:member
 *   POST /v1/prompts                 { circleId, member, theme, occasion, groupSize, yearsUntilOpen, tone }
 *   GET  /v1/reminders/:circleId/:member
 *   GET  /v1/receipts/:circleId      signed receipts (no payloads)
 * Request bodies are never logged.
 */
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createPublicClient, http, type PublicClient } from "viem";
import { DeploymentSchema } from "@relay/protocol-types";
import { RelayReader } from "@relay/sdk";
import { modelClient, PromptRequestSchema, suggestPrompts } from "./prompts.ts";
import { Steward } from "./steward.ts";

export function startStewardServer(opts: { port: number; deploymentFile: string; dir: string; host?: string }) {
  const deployment = DeploymentSchema.parse(JSON.parse(readFileSync(opts.deploymentFile, "utf8")));
  const client = createPublicClient({ transport: http(deployment.rpcUrl) }) as PublicClient;
  const reader = new RelayReader(client, deployment.contract.address, BigInt(deployment.contract.deploymentBlock));
  const steward = new Steward({ dir: opts.dir, chainId: deployment.chainId, registry: deployment.contract.address, reader });
  const model = modelClient();

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify(body));
  };
  const json = (req: IncomingMessage) =>
    new Promise<unknown>((ok, fail) => {
      let s = "";
      req.on("data", (c: Buffer) => {
        s += c.toString("utf8");
        if (s.length > 16_384) req.destroy();
      });
      req.on("end", () => {
        try {
          ok(JSON.parse(s || "{}"));
        } catch (e) {
          fail(e);
        }
      });
    });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://x");
      if (req.method === "OPTIONS") return send(res, 204, {});
      if (url.pathname === "/health") {
        return send(res, 200, { ok: true, agent: steward.account.address, mode: model ? "MODEL" : "TEMPLATE", label: deployment.label, contentAccess: "none" });
      }
      if (url.pathname === "/v1/consent" && req.method === "POST") return send(res, 201, await steward.recordConsent(await json(req)));
      let m = url.pathname.match(/^\/v1\/consent\/(\d+)\/(0x[0-9a-fA-F]{40})$/);
      if (m) return send(res, 200, { optedIn: steward.isOptedIn(m[1]!, m[2]!) });
      if (url.pathname === "/v1/prompts" && req.method === "POST") {
        const body = (await json(req)) as { circleId?: string; member?: string } & Record<string, unknown>;
        const { circleId, member, ...meta } = body;
        if (!circleId || !member || !steward.isOptedIn(String(circleId), String(member))) {
          return send(res, 403, { error: "Opt in to the Memory Steward for this Circle first." });
        }
        const request = PromptRequestSchema.parse(meta);
        const result = await suggestPrompts(request, model);
        const receipt = await steward.receipt("PROMPTS_SUGGESTED", String(circleId), String(member).toLowerCase() as `0x${string}`, result.mode);
        return send(res, 200, { ...result, receipt });
      }
      m = url.pathname.match(/^\/v1\/reminders\/(\d+)\/(0x[0-9a-fA-F]{40})$/);
      if (m) return send(res, 200, await steward.reminder(m[1]!, m[2]! as `0x${string}`));
      m = url.pathname.match(/^\/v1\/receipts\/(\d+)$/);
      if (m) return send(res, 200, { items: steward.receipts(m[1]!) });
      return send(res, 404, { error: "no route" });
    } catch (e) {
      return send(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
  });
  server.listen(opts.port, opts.host ?? "127.0.0.1");
  return { server, steward, mode: model ? "MODEL" : "TEMPLATE" };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.STEWARD_PORT ?? 8688);
  const s = startStewardServer({
    port,
    deploymentFile: process.env.RELAY_DEPLOYMENT ?? "deployments/local.json",
    dir: process.env.STEWARD_DIR ?? ".relay-local/steward",
    host: process.env.STEWARD_HOST ?? "127.0.0.1",
  });
  console.log(`[steward] Memory Steward on :${port} (${s.mode} mode, agent ${s.steward.account.address})`);
}
