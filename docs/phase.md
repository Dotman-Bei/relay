# Phase

**Current phase: C — BOT Chain testnet.** Registry deployed and verified at `0x6f6e2c0fb44016d621e133612c61069de15cd710` (T2 passed 2026-09-23); the proof run passed on testnet with developer-generated wallets (`docs/proofs/testnet/2026-09-23T09-02-50-791Z/`); the adversarial campaign passed on testnet; a non-developer run (T3 proper) and public storage are next.

| Phase | Scope (PRD §19) | State | Exit evidence |
|---|---|---|---|
| A — mechanism specification | Types, lifecycle, contract interface, reference evaluator, claim ledger, kill criteria | Done | `packages/protocol-types`, `packages/reference`, `docs/kill-criteria.md`, `packages/claim-ledger` |
| B — local proof | Contract tests, property tests, local encrypted upload, verifier parity | Done | `evidence/contracts/forge-test.txt`, `evidence/parity/parity-report.json`, `docs/proofs/local/`, `evidence/adversarial/local/latest.json`, `evidence/e2e/` |
| C — BOT Chain testnet | Deploy, verify source, public proof run, testnet evidence | **In progress** — T2, T4, T5 passed; T3 with developer wallets | `deployments/testnet.json`; next: `pnpm proof:testnet`, `pnpm adversarial:testnet`, `pnpm verify:testnet` |
| D — beta | Real testnet users, completion/failure metrics | Not started | — |
| E — mainnet readiness | Security review, runbooks, config probe, owner decision | Not started | Runbooks drafted in `docs/runbooks/` |
| F — mainnet | Deploy after §18 | Not started | — |

## To leave phase C

1. ~~Fund a deployment wallet~~ — done 2026-09-23.
2. ~~Create and fund three relayers~~ — done; keys registered on-chain.
3. Host the storage server at a public HTTPS URL (it runs on the build machine today) and update `storage.url` in `deployments/testnet.json`.
4. ~~Deploy and verify~~ — done: T2 passed.
5. Two non-developer participant wallets: `pnpm proof:testnet`, `pnpm adversarial:testnet`, `pnpm verify:testnet`.
6. Update `packages/claim-ledger/data/claims.json` statuses from the evidence, `pnpm claims:generate && pnpm claims:check`, and `WHAT_IS_REAL.md`.

Mainnet work does not begin until every T gate has passed and the owner authorises M0.
