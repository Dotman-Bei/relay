# Phase

**Current phase: B → C (local proof complete; BOT Chain testnet deployment blocked on owner funding).**

| Phase | Scope (PRD §19) | State | Exit evidence |
|---|---|---|---|
| A — mechanism specification | Types, lifecycle, contract interface, reference evaluator, claim ledger, kill criteria | Done | `packages/protocol-types`, `packages/reference`, `docs/kill-criteria.md`, `packages/claim-ledger` |
| B — local proof | Contract tests, property tests, local encrypted upload, verifier parity | Done | `evidence/contracts/forge-test.txt`, `evidence/parity/parity-report.json`, `docs/proofs/local/`, `evidence/adversarial/local/latest.json`, `evidence/e2e/` |
| C — BOT Chain testnet | Deploy, verify source, public proof run, testnet evidence | **Blocked** at T2 | T0 passed (`deployments/testnet.probe.json`); needs funded deployer + relayers (DECISIONS D-014) |
| D — beta | Real testnet users, completion/failure metrics | Not started | — |
| E — mainnet readiness | Security review, runbooks, config probe, owner decision | Not started | Runbooks drafted in `docs/runbooks/` |
| F — mainnet | Deploy after §18 | Not started | — |

## To leave phase C (owner actions)

1. Choose and fund a deployment wallet on BOT Chain testnet (faucet: see `deployments/testnet.probe.json`).
2. Run `tsx apps/relayer/src/relayer.ts init --dir .relay-testnet/relayers --count 3` and fund the three printed relayer addresses.
3. Host the storage server (`apps/relayer/src/storage-server.ts`) at a public HTTPS URL.
4. `pnpm probe:testnet && pnpm deploy:testnet --preflight`, then `pnpm deploy:testnet` with `DEPLOYER_PRIVATE_KEY`, `STORAGE_URL`, `RELAYER_DIR`.
5. Two non-developer participant wallets: `pnpm proof:testnet`, `pnpm adversarial:testnet`, `pnpm verify:testnet`.
6. Update `packages/claim-ledger/data/claims.json` statuses from the evidence, `pnpm claims:generate && pnpm claims:check`, and `WHAT_IS_REAL.md`.

Mainnet work does not begin until every T gate has passed and the owner authorises M0.
