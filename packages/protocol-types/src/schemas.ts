import { z } from "zod";
import { LIFECYCLE, MAX_MEMBERS, MAX_RELAYERS } from "./lifecycle.ts";

// ------------------------------------------------------------------ primitives

export const Hex = z.string().regex(/^0x[0-9a-fA-F]*$/, "expected 0x-prefixed hex");
export const Address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "expected a 20-byte address")
  .transform((s) => s as `0x${string}`);
export const Bytes32 = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "expected 32 bytes")
  .transform((s) => s.toLowerCase() as `0x${string}`);
export const Sha256Hex = z.string().regex(/^[0-9a-f]{64}$/, "expected lowercase sha256 hex");
export const Base64 = z.string().regex(/^[A-Za-z0-9+/_-]*={0,2}$/, "expected base64");
export const UintString = z.string().regex(/^\d+$/, "expected a decimal integer string");
export const LifecycleSchema = z.enum(LIFECYCLE);

// ------------------------------------------------------------------ policy

/** The release rule as stored on-chain (timestamps are unix seconds). */
export const PolicySchema = z
  .object({
    sealAt: z.number().int().positive(),
    releaseAt: z.number().int().positive(),
    expiresAt: z.number().int().nonnegative(),
    capacity: z.number().int().min(2).max(MAX_MEMBERS),
    minContributions: z.number().int().min(1),
    unanimousConsent: z.boolean(),
    receiptThreshold: z.number().int().min(1),
    relayers: z.array(Address).min(1).max(MAX_RELAYERS),
  })
  .strict();
export type Policy = z.infer<typeof PolicySchema>;

// ------------------------------------------------------------------ network + deployment

export const NetworkName = z.enum(["local", "testnet", "mainnet"]);
export type NetworkName = z.infer<typeof NetworkName>;

/** Result of probing official BOT Chain sources (PRD §0.2, gate T0). */
export const NetworkProbeSchema = z
  .object({
    network: NetworkName,
    probedAt: z.string(),
    officialSources: z.array(z.object({ url: z.string().url(), fetchedAt: z.string(), sha256: Sha256Hex })),
    documented: z.object({
      chainId: z.number().int().positive(),
      rpcUrl: z.string().url(),
      explorerUrl: z.string().url(),
      faucetUrl: z.string().url().nullable(),
      nativeSymbol: z.string(),
    }),
    observed: z.object({
      chainId: z.number().int().positive(),
      clientVersion: z.string().nullable(),
      latestBlock: z.number().int().nonnegative(),
      latestBlockTimestamp: z.number().int().nonnegative(),
      getLogsMaxRangeTested: z.number().int().nonnegative().nullable(),
      explorerApi: z.string().nullable(),
    }),
    agreement: z.boolean(),
    discrepancies: z.array(z.string()),
  })
  .strict();
export type NetworkProbe = z.infer<typeof NetworkProbeSchema>;

export const RelayerIndependence = z.enum(["PROJECT_BASELINE", "INDEPENDENT", "LOCAL FIXTURE"]);

export const RelayerRecordSchema = z
  .object({
    address: Address,
    label: z.string(),
    independence: RelayerIndependence,
    operator: z.string(),
    encryptionKeyFingerprint: Bytes32,
    endpoint: z.string().nullable(),
  })
  .strict();
export type RelayerRecord = z.infer<typeof RelayerRecordSchema>;

/** deployments/<network>.json — PRD §15.2. */
export const DeploymentSchema = z
  .object({
    schema: z.literal("relay.deployment/v1"),
    network: NetworkName,
    label: z.enum(["LOCAL FIXTURE", "BOT Chain testnet", "BOT Chain mainnet"]),
    chainId: z.number().int().positive(),
    nativeSymbol: z.string(),
    rpcUrl: z.string().url(),
    explorerUrl: z.string().url().nullable(),
    probe: z.object({ file: z.string(), probedAt: z.string() }).nullable(),
    contract: z.object({
      name: z.literal("CapsuleRegistry"),
      address: Address,
      deployer: Address,
      transactionHash: Bytes32,
      deploymentBlock: z.number().int().nonnegative(),
      runtimeSha256: Sha256Hex,
      verifiedSource: z.enum(["VERIFIED", "UNVERIFIED", "NOT_APPLICABLE"]),
      verificationUrl: z.string().url().nullable(),
    }),
    abiSha256: Sha256Hex,
    sourceCommit: z.string(),
    quorum: z.object({
      relayers: z.array(RelayerRecordSchema).min(1),
      defaultThreshold: z.number().int().min(1),
      independence: RelayerIndependence,
      note: z.string(),
    }),
    storage: z.object({ url: z.string().url(), operator: z.string(), label: RelayerIndependence }),
    steward: z.object({ url: z.string().url().nullable(), address: Address.nullable() }),
    verifier: z.object({ version: z.string(), sourceCommit: z.string(), url: z.string().nullable() }),
    deployedAt: z.string(),
  })
  .strict();
export type Deployment = z.infer<typeof DeploymentSchema>;

// ------------------------------------------------------------------ off-chain envelopes

/** Relayer share of a contribution key, ECIES-encrypted to the relayer's P-256 key. */
export const SealedShareSchema = z
  .object({
    relayer: Address,
    x: z.number().int().min(1).max(255),
    recipientKeyFingerprint: Bytes32,
    epk: Base64,
    iv: Base64,
    ct: Base64,
  })
  .strict();
export type SealedShare = z.infer<typeof SealedShareSchema>;

/**
 * The contribution manifest. Its sha256 is the on-chain commitment. It commits to the
 * ciphertext by hash and carries the key shares; it never carries plaintext, file names or captions.
 */
export const ContributionManifestSchema = z
  .object({
    v: z.literal(1),
    kind: z.literal("relay.contribution"),
    chainId: z.number().int().positive(),
    registry: Address,
    circleId: UintString,
    contributor: Address,
    policyHash: Bytes32,
    ciphertext: z
      .object({ sha256: Sha256Hex, bytes: z.number().int().positive(), alg: z.literal("AES-256-GCM"), iv: Base64 })
      .strict(),
    threshold: z.number().int().min(1),
    shares: z.array(SealedShareSchema).min(1).max(MAX_RELAYERS),
  })
  .strict();
export type ContributionManifest = z.infer<typeof ContributionManifestSchema>;

/** One member-addressed share inside a relayer's delivery. */
export const DeliveredShareSchema = z
  .object({
    member: Address,
    contribution: Bytes32,
    x: z.number().int().min(1).max(255),
    recipientKeyFingerprint: Bytes32,
    epk: Base64,
    iv: Base64,
    ct: Base64,
  })
  .strict();
export type DeliveredShare = z.infer<typeof DeliveredShareSchema>;

/** The delivery manifest a relayer publishes; its sha256 is the on-chain receipt digest. */
export const DeliveryManifestSchema = z
  .object({
    v: z.literal(1),
    kind: z.literal("relay.delivery"),
    chainId: z.number().int().positive(),
    registry: Address,
    circleId: UintString,
    relayer: Address,
    eligibleAt: z.number().int().positive(),
    deliveries: z.array(DeliveredShareSchema),
    signature: Hex,
  })
  .strict();
export type DeliveryManifest = z.infer<typeof DeliveryManifestSchema>;

/** What is encrypted inside a contribution. Only allowlisted media types render. */
export const PAYLOAD_MIME_ALLOWLIST = [
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/mp4",
  "video/mp4",
  "video/webm",
] as const;
export const PayloadHeaderSchema = z
  .object({
    v: z.literal(1),
    kind: z.enum(["text", "image", "audio", "video"]),
    mime: z.enum(PAYLOAD_MIME_ALLOWLIST),
    caption: z.string().max(2000).optional(),
    fileName: z.string().max(255).optional(),
    bytes: z.number().int().nonnegative(),
  })
  .strict();
export type PayloadHeader = z.infer<typeof PayloadHeaderSchema>;

/** Circle metadata, encrypted with the Circle metadata key and stored off-chain. */
export const CircleMetadataSchema = z
  .object({
    v: z.literal(1),
    title: z.string().min(1).max(80),
    description: z.string().max(1000),
    emoji: z.string().max(8),
    templateId: z.string().max(64).optional(),
  })
  .strict();
export type CircleMetadata = z.infer<typeof CircleMetadataSchema>;

export const EncryptedBlobSchema = z
  .object({ v: z.literal(1), alg: z.literal("AES-256-GCM"), iv: Base64, ct: Base64 })
  .strict();
export type EncryptedBlob = z.infer<typeof EncryptedBlobSchema>;

// ------------------------------------------------------------------ Memory Steward

export const StewardAction = z.enum([
  "OPT_IN_RECORDED",
  "OPT_OUT_RECORDED",
  "PROMPTS_SUGGESTED",
  "REMINDER_ISSUED",
]);

/** PRD §11: a signed receipt per agent action, never containing the private payload. */
export const StewardReceiptSchema = z
  .object({
    v: z.literal(1),
    kind: z.literal("relay.steward-receipt"),
    action: StewardAction,
    policyVersion: z.string(),
    capsuleId: UintString,
    chainId: z.number().int().positive(),
    registry: Address,
    subject: Address.nullable(),
    issuedAt: z.string(),
    agent: Address,
    mode: z.enum(["MODEL", "TEMPLATE"]),
    signature: Hex,
  })
  .strict();
export type StewardReceipt = z.infer<typeof StewardReceiptSchema>;

export const StewardConsentSchema = z
  .object({
    v: z.literal(1),
    kind: z.literal("relay.steward-consent"),
    decision: z.enum(["OPT_IN", "OPT_OUT"]),
    circleId: UintString,
    chainId: z.number().int().positive(),
    registry: Address,
    member: Address,
    scope: z.literal("prompts-and-reminders"),
    contentAccess: z.literal("none"),
    issuedAt: z.string(),
    signature: Hex,
  })
  .strict();
export type StewardConsent = z.infer<typeof StewardConsentSchema>;

// ------------------------------------------------------------------ claims

export const ClaimStatus = z.enum([
  "PLANNED",
  "TESTED_LOCAL",
  "OBSERVED_TESTNET",
  "OBSERVED_MAINNET",
  "FAILED",
  "UNAVAILABLE",
]);
export type ClaimStatus = z.infer<typeof ClaimStatus>;
