# Architecture

```text
            ┌──────────────── member's browser (apps/web) ─────────────────┐
            │  encrypt (AES-256-GCM) · split key (Shamir k-of-n) ·          │
            │  seal shares to relayers (ECIES P-256) · verify storage hashes│
            └──────┬──────────────────────┬──────────────────────┬─────────┘
       ciphertext, │ manifest   consent,  │ commitment      read │ events
       public key  ▼            invite    ▼                      ▼
   ┌──────────────────────┐    ┌────────────────────────────────────────┐
   │ storage (content-    │    │ CapsuleRegistry on BOT Chain           │
   │ addressed by sha256) │    │ rule · consent · commitments ·         │
   │ PROJECT_BASELINE     │    │ eligibility · receipts. No admin.      │
   └──────────▲───────────┘    └──────────▲─────────────────┬───────────┘
              │ delivery manifests         │ receipts        │ ReleaseEligibilityReached
              │ (shares re-encrypted       │                 ▼
              │  to each member)     ┌─────┴──────────────────────────┐
              └──────────────────────│ release relayers (k of n)      │
                                     │ apps/relayer · PROJECT_BASELINE│
                                     └────────────────────────────────┘
   packages/verifier ── replays events from any RPC through packages/reference; no Relay server needed
   apps/agent (Memory Steward) ── opt-in prompts and reminders; no keys, no content, no chain writes
```

## Components and their limits (PRD §8.1)

| Component | Path | Does | Must not / cannot |
|---|---|---|---|
| `CapsuleRegistry` | `contracts/src` | Lifecycle, consent, commitments, the rule, eligibility, receipts | Hold content or keys; has no owner |
| Web client | `apps/web` | Wallet/session, local encryption, uploads, transactions, member UX, in-browser verifier | Custody content server-side |
| Storage | `apps/relayer/src/storage-server.ts` | Content-addressed blobs, encrypted reflections | Decide eligibility; decode media |
| Relayer | `apps/relayer/src/relayer.ts` | After on-chain eligibility, deliver shares and record receipts | Change rules or claim eligibility first |
| Memory Steward | `apps/agent` | Opt-in prompts/reminders with signed receipts | Access content, keys, consent or release |
| Reference | `packages/reference` | Deterministic lifecycle model, identical decisions and errors to the contract | Deploy anything |
| Verifier | `packages/verifier` | Replay, invariant checks, cross-check, bytecode provenance, claim comparison | Trust Relay's servers |
| SDK | `packages/relay-sdk` | Crypto, storage, typed reads, write preparation, event decoding, member flows | Require Relay's backend to read chain state |
| Protocol types | `packages/protocol-types` | ABI, zod schemas for every cross-boundary object, lifecycle enum | — |
| Claim ledger | `packages/claim-ledger` | Claim statuses, evidence checks, copy lint, generated `docs/claims.md` | — |

## Lifecycle

```text
DRAFT ──openCircle──▶ AWAITING_CONSENT ──first non-creator consent──▶ COLLECTING
  │                        │                                              │ now ≥ sealAt
  └──cancel──▶ CANCELLED ◀─┘                                              ▼
                                                   SEALED ──requestRelease (rule true)──▶ RELEASE_ELIGIBLE
                                                     │ now ≥ expiresAt (if set)            │ receipts ≥ threshold
                                                     ▼                                     ▼
                                                  EXPIRED                               RELEASED
```

State is computed by `lifecycleOf` from stored flags and `block.timestamp`; transitions that need a record (`ReleaseEligibilityReached`, `CapsuleExpired`) are transactions anyone may send, and the contract accepts them only when the stored rule allows. `RELEASE_UNAVAILABLE` is the delivery status of a RELEASE_ELIGIBLE capsule whose receipts are short of the threshold.

## Events (all indexed by `circleId`)

`CircleCreated`, `PolicyUpdated`, `InvitationIssued`, `CircleOpened`, `InvitationAccepted`, `ConsentRecorded`, `ContributionCommitted`, `ReleaseEligibilityReached`, `ReleaseReceiptRecorded`, `CapsuleCancelled`, `CapsuleExpired`, plus `RelayerKeyRegistered` (by relayer). Fields are ids, addresses, counts, timestamps, bool flags, 32-byte hashes and the rule tuple — the ABI test in `packages/protocol-types` fails if a `string` or `bytes` field is ever added.

## Off-chain objects (zod schemas in `packages/protocol-types`)

- **Contribution manifest** — context, ciphertext sha256/size/IV, k, and one ECIES box per relayer. `sha256(manifest) = on-chain commitment`.
- **Delivery manifest** — one relayer's shares re-encrypted to each consenting member, EIP-191 signed. `sha256 = on-chain receipt digest`.
- **Circle metadata** — title/description/emoji, AES-GCM under a Circle key carried in invite fragments.
- **Recovery kit** — the member's P-256 private key and Circle keys.
- **Steward consent / receipt** — member-signed opt-in/out; agent-signed action receipts without payload.

## Configuration flow

`scripts/probe-network.ts` reads official BOT Chain docs + the live RPC → `deployments/<net>.probe.json` (gate T0) → `scripts/deploy.ts` refuses to run on a stale or disagreeing probe → `deployments/<net>.json` → copied to `apps/web/public/relay/` → the web client fetches it at runtime and probes chain ID and runtime bytecode sha256 before enabling any transaction (`PROTOCOL_CONFIG_CHANGED` otherwise).
