# Security model

Relay records a group's release agreement on-chain and keeps content encrypted off-chain. This document states what it protects, against whom, and — as plainly — what it does not.

## Assets

Sealed contributions · content keys and key shares · member consent integrity · the immutable release rule · accurate lifecycle and release evidence · wallet and encryption-key recovery material.

## Trust boundary

**On-chain (public):** the rule (dates, contribution count, consent mode, relayer quorum), member addresses, consent to a specific rule hash, a sha256 commitment per contribution, public-key fingerprints, release eligibility, relayer receipts.

**Never on-chain:** content, file names, captions, the Circle's name/description (encrypted with a Circle key that travels in invite-link fragments), content keys, key shares, contact details, anything given to the Memory Steward.

## Cryptography

| Purpose | Construction |
|---|---|
| Content | AES-256-GCM, fresh 32-byte key per contribution, AAD binds chain/registry/circle/contributor/rule hash. Payload padded to ≤12.5% size buckets. |
| Key splitting | Shamir secret sharing over GF(2⁸), k-of-n, share x = relayer index + 1 |
| Key transport | ECIES: ephemeral P-256 ECDH → HKDF-SHA256 (salt = epk‖recipient, info = context) → AES-256-GCM; context also AAD, so a box can't be replayed across circles, members or share indices |
| Commitments | sha256 of the exact manifest bytes (content-addressed storage key = on-chain commitment) |
| Invitations | Single-use secp256k1 invite keys; the redeemer submits the invite key's EIP-191 signature over `keccak(chainId, registry, circleId, redeemer)`; low-s enforced |
| Receipts | Relayer EIP-191 signature over sha256 of the delivery manifest; digest recorded on-chain |

All client crypto is WebCrypto; no custom primitives beyond the Shamir field arithmetic, which is property-tested.

## Adversaries and what stops them

| Adversary | Attempt | Control | Evidence |
|---|---|---|---|
| Creator | Change the date after members consent | `updatePolicy` reverts once a non-creator consents (`RuleLocked`) or anyone contributed | ADV-1, `test_updatePolicy_revertsAfterNonCreatorConsent`, invariant `ruleImmutableAfterForeignConsent` |
| Creator | Swap the rule while a member is reading it | Consent names the rule hash; mismatch reverts (`PolicyHashMismatch`) | `test_consent_requiresMembershipExactHashAndNonZeroKey`, fuzz |
| Participant | Contribute without consent / twice | `ConsentRequired`, `AlreadyContributed` | ADV-2, unit + invariant tests |
| Anyone | Release early | `requestRelease` evaluates only stored state (`WrongLifecycle`, `RuleNotSatisfied`) | ADV-3, fuzz `testFuzz_releaseTimestampBoundary` |
| Relayer | Claim eligibility / receipt early | Receipts revert without recorded eligibility; only quorum members | ADV-4, parity |
| Relayer | Withhold a share | Capsule stays `RELEASE_UNAVAILABLE` with the missing count; never "released" | ADV-7 |
| Storage | Serve modified ciphertext | Client checks sha256 on every read; upload is read back before any commit | ADV-5, SDK tests |
| Web server | Show a false release | Verifier derives state from the chain and flags the claim | ADV-6, verifier tests |
| Front-runner | Steal an invitation from the mempool | Signature binds the redeemer's address | `test_invitation_signatureIsBoundToRedeemer` |
| Malicious upload | Exploit media processing | Servers never decode media; clients render only an allowlist of MIME types from decrypted, schema-validated headers; no SVG/HTML | `PAYLOAD_MIME_ALLOWLIST` |
| AI service | Retain or overreach | Steward is opt-in per Circle, receives only typed metadata, holds no keys, has no registry permissions; every action is a signed receipt without payload | `apps/agent/test` |

## Residual risks we state publicly

1. **Collusion.** Any `receiptThreshold` relayers together can reconstruct a content key at any time, including before the release date. Today's relayers are `PROJECT_BASELINE` — one operator. This is the central trust assumption of the MVP (claim C-07: never claimed otherwise).
2. **Retention.** A contributor can keep their plaintext; a member who opens a capsule can keep what they saw.
3. **Device compromise.** Encryption keys live in browser storage. Anyone with the browser profile or the recovery kit can open that member's share.
4. **Session keys.** The "browser session key" option stores a signing key in localStorage. It is labelled for testnet trials only.
5. **Metadata.** Addresses, timing, counts and ciphertext sizes (to within ~12.5%) are public.
6. **RPC trust.** The verifier trusts the RPC it reads. Run it against more than one endpoint.
7. **Unanimous rules can be blocked** by a member who joins and never consents; choosing an expiry bounds this.

## Contract properties

No owner, no pause, no upgrade, no admin function (PRD §10.2.9: nothing to disclose). All loops bounded by `MAX_RELAYERS` (7) or `MAX_INVITES_PER_CALL` (32). Solidity 0.8.28, custom errors, `bytecode_hash = none` so the runtime bytecode hash in deployment records is reproducible.

## Reporting

Report vulnerabilities privately to the repository owner before public disclosure. There is no bug bounty yet, and no production deployment to attack.
