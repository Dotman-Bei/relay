/**
 * PROJECT_BASELINE content-addressed storage.
 *
 *   PUT  /v1/blobs/:sha256          store bytes; rejected unless sha256(body) matches the path
 *   GET  /v1/blobs/:sha256          fetch bytes (clients verify the hash themselves)
 *   POST /v1/reflections/:tag       append an encrypted reflection {v,alg,iv,ct}
 *   GET  /v1/reflections/:tag       list encrypted reflections
 *   GET  /health
 *
 * The server never decodes, transcodes or previews media: it stores opaque ciphertext, public
 * keys and manifests. It holds no keys and has no authority over eligibility.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, renameSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { EncryptedBlobSchema } from "@relay/protocol-types";

const MAX_BLOB = 64 * 1024 * 1024;
const MAX_REFLECTION = 64 * 1024;

/** `tamper`: adversarial fixture only — true flips a byte of every blob served, a Set only of those hashes. */
export function startStorageServer(opts: { port: number; dir: string; host?: string; tamper?: boolean | Set<string> }) {
  const dir = resolve(opts.dir);
  mkdirSync(join(dir, "blobs"), { recursive: true });
  mkdirSync(join(dir, "reflections"), { recursive: true });

  const send = (res: ServerResponse, status: number, body: unknown, type = "application/json") => {
    res.writeHead(status, {
      "content-type": type,
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,PUT,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      "cache-control": status === 200 && type === "application/octet-stream" ? "public, max-age=31536000, immutable" : "no-store",
      "x-content-type-options": "nosniff",
    });
    res.end(typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body));
  };

  const readBody = (req: IncomingMessage, limit: number) =>
    new Promise<Buffer>((ok, fail) => {
      const chunks: Buffer[] = [];
      let n = 0;
      req.on("data", (c: Buffer) => {
        n += c.length;
        if (n > limit) {
          fail(Object.assign(new Error("payload too large"), { status: 413 }));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on("end", () => ok(Buffer.concat(chunks)));
      req.on("error", fail);
    });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://x");
      if (req.method === "OPTIONS") return send(res, 204, "");
      if (url.pathname === "/health") return send(res, 200, { ok: true, label: "PROJECT_BASELINE storage", tamper: Boolean(opts.tamper) });

      const blob = url.pathname.match(/^\/v1\/blobs\/([0-9a-f]{64})$/);
      if (blob) {
        const h = blob[1]!;
        const path = join(dir, "blobs", h);
        if (req.method === "GET" || req.method === "HEAD") {
          if (!existsSync(path)) return send(res, 404, { error: "not found" });
          const bytes = readFileSync(path);
          // Adversarial fixture only (§14 "Serve modified ciphertext"): flip one byte.
          const tamperThis = opts.tamper === true || (opts.tamper instanceof Set && opts.tamper.has(h));
          if (tamperThis && bytes.length > 0) bytes[bytes.length - 1]! ^= 0x01;
          return send(res, 200, req.method === "HEAD" ? "" : bytes, "application/octet-stream");
        }
        if (req.method === "PUT") {
          const body = await readBody(req, MAX_BLOB);
          const actual = createHash("sha256").update(body).digest("hex");
          if (actual !== h) return send(res, 422, { error: "sha256 mismatch", expected: h, actual });
          if (!existsSync(path)) {
            writeFileSync(`${path}.tmp`, body);
            renameSync(`${path}.tmp`, path);
          }
          return send(res, 201, { sha256: h, bytes: body.length });
        }
      }

      const refl = url.pathname.match(/^\/v1\/reflections\/([0-9a-f]{64})$/);
      if (refl) {
        const path = join(dir, "reflections", `${refl[1]}.jsonl`);
        if (req.method === "GET") {
          const lines = existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean) : [];
          return send(res, 200, { items: lines.map((l) => JSON.parse(l)) });
        }
        if (req.method === "POST") {
          const body = await readBody(req, MAX_REFLECTION);
          const parsed = EncryptedBlobSchema.parse(JSON.parse(body.toString("utf8")));
          appendFileSync(path, `${JSON.stringify(parsed)}\n`);
          return send(res, 201, { ok: true });
        }
      }
      return send(res, 404, { error: "no route" });
    } catch (e) {
      const status = (e as { status?: number }).status ?? 400;
      return send(res, status, { error: e instanceof Error ? e.message : String(e) });
    }
  });
  server.listen(opts.port, opts.host ?? "127.0.0.1");
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.STORAGE_PORT ?? 8687);
  const dir = process.env.STORAGE_DIR ?? ".relay-local/storage";
  startStorageServer({ port, dir, host: process.env.STORAGE_HOST ?? "127.0.0.1", tamper: process.env.STORAGE_TAMPER === "1" });
  console.log(`[storage] PROJECT_BASELINE content-addressed storage on :${port} (${dir})`);
}
