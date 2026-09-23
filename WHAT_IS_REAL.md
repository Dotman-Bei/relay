# What is real

_Last updated 2026-09-23. This file states the current truth; if it disagrees with any other page, this file and `packages/claim-ledger/data/claims.json` win._

## In one paragraph

Relay's mechanism is built and tested **locally**. The `CapsuleRegistry` contract, the reference model, the independent verifier, the SDK, the release relayer, the storage server, the Memory Steward and the web client all exist and run together on a **LOCAL FIXTURE** chain (anvil, chain 31337), where the full create → consent → encrypted commit → rejected early release → eligibility → receipts → reveal → verification lifecycle passes, both as a script and through the real web UI in a browser. **Relay is not deployed on BOT Chain testnet yet.** The network configuration probe (gate T0) passed against official BOT Chain sources on 2026-09-22; deployment is blocked on an owner decision: a funded deployment wallet and funded relayer wallets (the testnet faucet requires human verification). Nothing is on mainnet, and nothing on mainnet is planned before every testnet gate passes.

## Tested network

| Network | Status | Evidence |
|---|---|---|
| LOCAL FIXTURE (anvil, chain 31337) | Full lifecycle passes | `docs/proofs/local/*`, `evidence/adversarial/local/latest.json`, `evidence/e2e/` |
| BOT Chain testnet (chain 968) | **Probe only.** Not deployed. | `deployments/testnet.probe.json` |
| BOT Chain mainnet (chain 677) | Nothing. Gated by M0. | — |

## Gates (PRD §22)

| Gate | State | Why |
|---|---|---|
| T0 Protocol configuration | **Passed** 2026-09-22 | `pnpm probe:testnet`: docs and live RPC agree on chain 968 |
| T1 Lifecycle correctness | **Passed locally** | 48 unit + 4 fuzz + 7 invariant contract tests; reference property tests; parity 0 mismatches |
| T2 Testnet deployment | Blocked | Needs funded deployer (owner decision) — `pnpm deploy:testnet --preflight` lists what's missing |
| T3 Testnet proof | Not started | Needs T2 and two non-developer participant wallets |
| T4 Independent verification | Passed locally, not on testnet | Verifier replays local chains; needs a deployed registry |
| T5 Adversarial campaign | Passed locally, not on testnet | All seven §14 attempts evidenced on LOCAL FIXTURE |
| T6 Beta evidence | Not started | No external group yet |
| M0 / M1 Mainnet | Not started | Out of scope until T0–T6 pass |

## What each component is, honestly

- **Relayers** are `PROJECT_BASELINE` (on testnet) or `LOCAL FIXTURE` (locally): operated by the project, not independent. A threshold of them acting together could open a capsule early.
- **Storage** is a project-operated, content-addressed blob server. Every read is hash-checked by the client, so it can withhold data but can't substitute it undetected.
- **The Memory Steward** runs in `TEMPLATE` mode unless model credentials are configured; with them it calls `claude-opus-5` using only the theme/occasion/size a member types.
- **Passkeys** are not offered: BOT Chain testnet documents ERC-4337 with an ECDSA SimpleAccountFactory, but no WebAuthn-capable account.
- **Public community campaigns** on Explore: none exist; the listing is an empty state.

## What we never claim

That nobody could open a capsule before its date (C-07). That capsules are "private" or "decentralized" without qualification. That Relay is on mainnet.
