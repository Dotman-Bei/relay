/**
 * Content-addressed blob storage. A blob's address is the sha256 of its bytes, so every read
 * is verifiable against the address — and, for manifests, against the on-chain commitment.
 * The store has no authority: it cannot make anything eligible, and it only ever sees ciphertext,
 * public keys and manifests that contain no plaintext.
 */
import { sha256Hex } from "./crypto.ts";

export interface BlobStore {
  /** Store bytes; returns the sha256 hex the store reports. */
  put(bytes: Uint8Array): Promise<string>;
  /** Fetch raw bytes by sha256 hex. Callers must verify; use `getVerified`. */
  get(sha256: string): Promise<Uint8Array>;
  readonly label: string;
}

export class CommitmentMismatchError extends Error {
  constructor(
    readonly expected: string,
    readonly actual: string,
    readonly what: string,
  ) {
    super(`Commitment mismatch for ${what}: expected ${expected}, storage served ${actual}`);
    this.name = "CommitmentMismatchError";
  }
}

export class BlobNotFoundError extends Error {
  constructor(readonly sha256: string) {
    super(`Blob ${sha256} was not found in storage`);
    this.name = "BlobNotFoundError";
  }
}

const strip = (h: string) => h.replace(/^0x/, "").toLowerCase();

/** Fetch and verify that the bytes hash to the requested address. */
export async function getVerified(store: BlobStore, sha256: string, what = "blob"): Promise<Uint8Array> {
  const want = strip(sha256);
  const bytes = await store.get(want);
  const got = await sha256Hex(bytes);
  if (got !== want) throw new CommitmentMismatchError(want, got, what);
  return bytes;
}

/**
 * Upload, then read back and verify before anything is committed on-chain (PRD §11:
 * "verify the ciphertext commitment before creating the chain transaction").
 */
export async function putVerified(store: BlobStore, bytes: Uint8Array, what = "blob"): Promise<string> {
  const want = await sha256Hex(bytes);
  const reported = strip(await store.put(bytes));
  if (reported !== want) throw new CommitmentMismatchError(want, reported, `${what} (upload receipt)`);
  await getVerified(store, want, `${what} (read-back)`);
  return want;
}

export class MemoryBlobStore implements BlobStore {
  readonly label = "LOCAL FIXTURE (memory)";
  readonly blobs = new Map<string, Uint8Array>();
  async put(bytes: Uint8Array) {
    const h = await sha256Hex(bytes);
    this.blobs.set(h, bytes.slice());
    return h;
  }
  async get(sha256: string) {
    const b = this.blobs.get(strip(sha256));
    if (!b) throw new BlobNotFoundError(sha256);
    return b.slice();
  }
}

/** Client for the project-operated storage server (apps/relayer storage-server). */
export class HttpBlobStore implements BlobStore {
  constructor(
    readonly baseUrl: string,
    readonly label = "PROJECT_BASELINE storage",
    private readonly fetchImpl: typeof fetch = (...a) => globalThis.fetch(...a),
  ) {}

  async put(bytes: Uint8Array) {
    const h = await sha256Hex(bytes);
    const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/v1/blobs/${h}`, {
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body: bytes.slice().buffer as ArrayBuffer,
    });
    if (!res.ok) throw new Error(`Storage upload failed: HTTP ${res.status} ${await res.text().catch(() => "")}`);
    const body = (await res.json()) as { sha256: string };
    return body.sha256;
  }

  async get(sha256: string) {
    const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/v1/blobs/${strip(sha256)}`);
    if (res.status === 404) throw new BlobNotFoundError(sha256);
    if (!res.ok) throw new Error(`Storage read failed: HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}
