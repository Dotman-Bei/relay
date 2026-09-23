# What is real

_Last updated 2026-09-23, after the BOT Chain testnet deployment. This file states the current truth; if it disagrees with any other page, this file and `packages/claim-ledger/data/claims.json` win._

## In one paragraph

`CapsuleRegistry` is **deployed on BOT Chain testnet** at [`0x6f6e2c0fb44016d621e133612c61069de15cd710`](https://scan.bohr.life/address/0x6f6e2c0fb44016d621e133612c61069de15cd710) with verified source (gate T2, 2026-09-23). The full lifecycle has now run on testnet: Circle #2 went from creation through consent, encrypted commits, a rejected early release, eligibility and three relayer receipts to a decrypted reveal, and the verifier replayed it as VALID (`docs/proofs/testnet/2026-09-23T09-02-50-791Z/`). **Caveat:** that run used two wallets the build agent generated, not the non-developer participants PRD §15.3 asks for. Relay's mechanism is otherwise built and tested **locally**. The `CapsuleRegistry` contract, the reference model, the independent verifier, the SDK, the release relayer, the storage server, the Memory Steward and the web client all exist and run together on a **LOCAL FIXTURE** chain (anvil, chain 31337), where the full create → consent → encrypted commit → rejected early release → eligibility → receipts → reveal → verification lifecycle passes, both as a script and through the real web UI in a browser. **Relay is hosted at https://relay.169-58-153-9.sslip.io** on the build VPS: the web client, storage, Memory Steward and three relayers run as systemd services behind nginx with Let's Encrypt TLS, and a two-member capsule (Circle #7) went through that public site end to end on testnet (`evidence/e2e/testnet-hosted.txt`). The network configuration probe (gate T0) passed against official BOT Chain sources, most recently on 2026-09-23. Nothing is on mainnet, and nothing on mainnet is planned before every testnet gate passes.

## Tested network

| Network | Status | Evidence |
|---|---|---|
| LOCAL FIXTURE (anvil, chain 31337) | Full lifecycle passes | `docs/proofs/local/*`, `evidence/adversarial/local/latest.json`, `evidence/e2e/` |
| BOT Chain testnet (chain 968) | **Registry deployed and verified; full proof run passed** (developer wallets) | `deployments/testnet.json`, [BOTScan](https://scan.bohr.life/address/0x6f6e2c0fb44016d621e133612c61069de15cd710) |
| BOT Chain mainnet (chain 677) | Nothing. Gated by M0. | — |

## Gates (PRD §22)

| Gate | State | Why |
|---|---|---|
| T0 Protocol configuration | **Passed** 2026-09-22 | `pnpm probe:testnet`: docs and live RPC agree on chain 968 |
| T1 Lifecycle correctness | **Passed locally** | 48 unit + 4 fuzz + 7 invariant contract tests; reference property tests; parity 0 mismatches |
| T2 Testnet deployment | **Passed** 2026-09-23 | `0x6f6e2c0fb44016d621e133612c61069de15cd710`, block 24389826, source verified on BOTScan, runtime sha256 matches the build |
| T3 Testnet proof | **Passed with developer wallets** 2026-09-23 | `docs/proofs/testnet/2026-09-23T09-02-50-791Z/`; a run by two non-developer participants is still required |
| T4 Independent verification | **Passed** 2026-09-23 | `evidence/verifier/testnet.json`: every testnet capsule VALID from the public RPC, bytecode matches |
| T5 Adversarial campaign | **Passed on testnet** 2026-09-23 | All seven §14 attempts evidenced as mined transactions or client detections: `evidence/adversarial/testnet/2026-09-23T09-34-01-018Z.json` |
| T6 Beta evidence | Not started | No external group yet |
| M0 / M1 Mainnet | Not started | Out of scope until T0–T6 pass |

## What each component is, honestly

- **Relayers** are `PROJECT_BASELINE` (on testnet) or `LOCAL FIXTURE` (locally): operated by the project, not independent. A threshold of them acting together could open a capsule early. The three testnet relayers run permanently as `relay-relayer@1..3` on the build VPS: one host, one operator.
- **Testnet storage** is public at https://storage.relay.169-58-153-9.sslip.io (data on the build VPS in `.relay-testnet/storage`; back it up). The hostnames come from sslip.io, not a domain the project owns; switching to a real domain needs no redeploy (`pnpm endpoints:set`). A Docker/compose setup for other servers is in `deploy/` (validated, not yet run with Docker).
- **Storage** is a project-operated, content-addressed blob server. Every read is hash-checked by the client, so it can withhold data but can't substitute it undetected.
- **The Memory Steward** runs in `TEMPLATE` mode unless model credentials are configured; with them it calls `claude-opus-5` using only the theme/occasion/size a member types.
- **Passkeys** are not offered: BOT Chain testnet documents ERC-4337 with an ECDSA SimpleAccountFactory, but no WebAuthn-capable account.
- **Public community campaigns** on Explore: none exist; the listing is an empty state.

## What we never claim

That nobody could open a capsule before its date (C-07). That capsules are "private" or "decentralized" without qualification. That Relay is on mainnet.
