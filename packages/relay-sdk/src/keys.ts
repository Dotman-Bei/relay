/**
 * Member recovery kit. Relay cannot recover a lost encryption key: the kit is the only copy
 * outside the member's browser storage. It holds the P-256 private key and the metadata keys
 * of Circles the member belongs to. It never holds contribution content keys (nobody keeps those).
 */
import { z } from "zod";
import { keyFingerprint, publicKeyFromJwk } from "./crypto.ts";
import { fromBase64, toBase64 } from "./encoding.ts";

export const RecoveryKitSchema = z
  .object({
    v: z.literal(1),
    kind: z.literal("relay.recovery-kit"),
    createdAt: z.string(),
    account: z.string().regex(/^0x[0-9a-fA-F]{40}$/).nullable(),
    encryptionKey: z.object({
      alg: z.literal("ECDH-P256"),
      privateJwk: z.record(z.string(), z.unknown()),
      fingerprint: z.string().regex(/^0x[0-9a-f]{64}$/),
    }),
    circleKeys: z.record(z.string(), z.string()),
  })
  .strict();
export type RecoveryKit = z.infer<typeof RecoveryKitSchema>;

export async function buildRecoveryKit(args: {
  account: `0x${string}` | null;
  privateJwk: JsonWebKey;
  circleKeys: Record<string, Uint8Array>;
}): Promise<RecoveryKit> {
  return {
    v: 1,
    kind: "relay.recovery-kit",
    createdAt: new Date().toISOString(),
    account: args.account,
    encryptionKey: {
      alg: "ECDH-P256",
      privateJwk: args.privateJwk as Record<string, unknown>,
      fingerprint: await keyFingerprint(publicKeyFromJwk(args.privateJwk)),
    },
    circleKeys: Object.fromEntries(Object.entries(args.circleKeys).map(([k, v]) => [k, toBase64(v)])),
  };
}

export async function parseRecoveryKit(json: string) {
  const kit = RecoveryKitSchema.parse(JSON.parse(json));
  const jwk = kit.encryptionKey.privateJwk as JsonWebKey;
  const fp = await keyFingerprint(publicKeyFromJwk(jwk));
  if (fp !== kit.encryptionKey.fingerprint) throw new Error("Recovery kit fingerprint does not match its key");
  return {
    kit,
    privateJwk: jwk,
    circleKeys: Object.fromEntries(Object.entries(kit.circleKeys).map(([k, v]) => [k, fromBase64(v)])),
  };
}
