# BOT Chain testnet deployment and rollback

## Preconditions (gate T0 → T2)

- `pnpm probe:testnet` passed within 24 h (`deployments/testnet.probe.json`, `agreement: true`).
- `pnpm contracts:test`, `pnpm test`, `pnpm test:parity` all pass on the commit being deployed (T1).
- Owner has provided: a funded `DEPLOYER_PRIVATE_KEY`, a public HTTPS `STORAGE_URL`, funded relayer identities in `RELAYER_DIR`.
- `pnpm deploy:testnet --preflight` prints `READY`.

## Deploy

```bash
DEPLOYER_PRIVATE_KEY=… STORAGE_URL=https://… RELAYER_DIR=.relay-testnet/relayers pnpm deploy:testnet
```

The script deploys the exact bytecode in `@relay/protocol-types/bytecode`, checks the on-chain runtime sha256, runs `forge verify-contract --verifier blockscout` against the explorer API, registers relayer keys and writes `deployments/testnet.json`. If source verification fails the record says `UNVERIFIED` and gate T2 is not passed — re-run `forge verify-contract` from `contracts/`.

## After deploy

1. Start relayers (docs/runbooks/relayer.md) and the Memory Steward if used.
2. `pnpm --filter @relay/web build` with `NEXT_PUBLIC_RELAY_NETWORK=testnet` (the prebuild copies the deployment record) and deploy the web client.
3. `pnpm proof:testnet` with two non-developer wallets → `docs/proofs/testnet/<run>/`.
4. `pnpm adversarial:testnet` → `evidence/adversarial/testnet/`.
5. `pnpm verify:testnet --out evidence/verifier/testnet.json`.
6. Update claims, regenerate `docs/claims.md`, run `pnpm claims:check`, update `WHAT_IS_REAL.md`, append DECISIONS.

## Rollback

The registry is immutable and has no admin, so "rollback" means **stop pointing people at it**:

1. Move `deployments/testnet.json` to `deployments/archive/testnet-<address>.json` and note why in DECISIONS.md.
2. Rebuild the web client: with no deployment record it shows `NOT_DEPLOYED` and disables transactions.
3. Keep relayers running for any capsule already sealed on the old registry until each is RELEASED or EXPIRED — members' reveals depend on them.
4. Deploy a fixed registry as a new address; re-run the full testnet proof before any claim moves.
