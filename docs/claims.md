<!-- Generated from packages/claim-ledger/data/claims.json by `pnpm claims:generate`. Do not edit by hand. -->
# Claim and evidence ledger

Network: BOT Chain testnet (chain 968) — not yet deployed · updated 2026-09-23

Statuses: `PLANNED` → `TESTED_LOCAL` → `OBSERVED_TESTNET` → `OBSERVED_MAINNET`, or `FAILED` / `UNAVAILABLE`.
A claim may only be worded publicly at the rung its evidence has reached. `pnpm claims:check` enforces this over the web app and docs.

| ID | Claim | Earliest permitted wording | Status | What we can say today | Evidence |
|---|---|---|---|---|---|
| C-01 | Release policy is immutable after consent | Tested locally | **TESTED_LOCAL** | Tested locally: once another member consents, the contract rejects any change to the rule. | `evidence/contracts/forge-test.txt`<br>`contracts/test/CapsuleRegistry.t.sol`<br>`contracts/test/CapsuleRegistry.invariant.t.sol`<br>`evidence/parity/parity-report.json`<br>`evidence/adversarial/local/latest.json` |
| C-02 | An ineligible release is rejected | Observed on BOT Chain testnet | **TESTED_LOCAL** | Tested locally (LOCAL FIXTURE): early release attempts revert on-chain. Not yet observed on BOT Chain testnet. | `evidence/adversarial/local/latest.json`<br>`evidence/contracts/forge-test.txt` |
| C-03 | The capsule lifecycle is independently replayable | Verified on BOT Chain testnet | **TESTED_LOCAL** | Tested locally (LOCAL FIXTURE): the open-source verifier replays every event from an RPC and rejects mutated histories. | `evidence/unit/verifier.txt`<br>`docs/proofs/local`<br>`evidence/e2e/lifecycle.txt` |
| C-04 | Member payload is absent from contract events | The protocol does not store plaintext payload on-chain | **TESTED_LOCAL** | Tested locally: contract events carry only ids, addresses, counts, timestamps and 32-byte hashes; a local proof run found no plaintext in any event. | `evidence/unit/protocol-types.txt`<br>`docs/proofs/local`<br>`evidence/e2e/lifecycle.txt` |
| C-05 | Testnet deployment exists | Deployed on BOT Chain testnet | **PLANNED** | Not yet deployed. Gate T0 (network probe) passed; deployment is waiting on a funded deployment wallet (owner decision). | `deployments/testnet.probe.json` |
| C-06 | Mainnet deployment exists | Deployed on BOT Chain mainnet | **PLANNED** | No mainnet deployment. Mainnet is gated by T0–T6 and owner authorisation (M0). | — |
| C-07 | Threshold release prevents all early disclosure | Never claim | **UNAVAILABLE** | Relay does not claim this. A colluding threshold of relayers could disclose early, and contributors can keep their own copies. | `SECURITY.md` |

## Notes

- **C-01** — Invariant suite found and fixed a capacity-shrink bug before any deployment (DECISIONS.md D-009).
- **C-02** — Needs a mined failing testnet transaction (pnpm adversarial:testnet) to reach OBSERVED_TESTNET.
- **C-03** — Needs `pnpm verify:testnet` output against the deployed registry.
- **C-04** — ABI inspection passes; the testnet proof run is still required for the earliest permitted wording.
- **C-05** — Blocked by: testnet faucet requires human verification; deployer and relayer wallets must be funded by the owner.
- **C-06** — Out of scope until every testnet gate passes.
- **C-07** — Permanently unavailable by design.
