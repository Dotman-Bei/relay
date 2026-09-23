# Relay

**Later, together.** Relay is a social time-capsule protocol for BOT Chain: a group encrypts contributions now and receives them only after an immutable on-chain date-and-consent rule is satisfied. Anyone can check which members consented, which rule governed release, whether it was satisfied, and when release was recorded — without trusting Relay's servers.

> **Status — read [WHAT_IS_REAL.md](WHAT_IS_REAL.md).** The full lifecycle is built and tested on a **LOCAL FIXTURE** chain. Relay is **not yet deployed on BOT Chain testnet**: the official network probe (gate T0) passed; deployment waits on a funded deployment wallet. Nothing is on mainnet.

## What's in the box

| Path | What |
|---|---|
| `contracts/` | `CapsuleRegistry` (Solidity 0.8.28, Foundry): 48 unit, 4 fuzz, 7 invariant tests |
| `packages/protocol-types` | ABI, lifecycle enum, zod schemas |
| `packages/reference` | Deterministic model of the rules; parity-tested against the contract |
| `packages/verifier` | Independent verifier: CLI and library (also runs in the browser at `/verify/[id]`) |
| `packages/relay-sdk` | Encryption, threshold shares, content-addressed storage, typed reads/writes, member flows |
| `packages/claim-ledger` | Claim statuses, evidence checks, public-copy lint |
| `apps/web` | Next.js 16 client — all PRD §9 routes |
| `apps/relayer` | `PROJECT_BASELINE` release relayer + storage server |
| `apps/agent` | Memory Steward (opt-in) |
| `scripts/` | probe, deploy, local stack, proof run, adversarial campaign, parity, evidence |

## Run it locally (LOCAL FIXTURE)

Requirements: Node ≥ 22.12, pnpm 9, Foundry.

```bash
pnpm install
git submodule update --init            # forge-std
pnpm contracts:test                    # contract unit, fuzz and invariant tests
pnpm test                              # every package's tests
pnpm test:parity                       # reference vs. contract on anvil: accept/revert/error parity
pnpm proof:local                       # PRD §15.3 proof run → docs/proofs/local/<run>/
pnpm adversarial:local                 # PRD §14 campaign → evidence/adversarial/local/
pnpm claims:check                      # claim ledger + public-copy lint
```

Interactive stack and web client:

```bash
pnpm local:chain                                   # anvil :8645, registry, storage :8687, steward :8688, 3 relayers
NEXT_PUBLIC_RELAY_NETWORK=local pnpm web:dev       # http://localhost:3000 — pick a LOCAL FIXTURE account
cd apps/web && npx playwright test                 # two-member end-to-end through the UI (needs web on :3100)
```

Local runs are labelled LOCAL FIXTURE everywhere. They are not evidence of a BOT Chain deployment.

## BOT Chain testnet

```bash
pnpm probe:testnet                          # gate T0 → deployments/testnet.probe.json
pnpm deploy:testnet --preflight             # lists exactly what's missing, spends nothing
DEPLOYER_PRIVATE_KEY=… STORAGE_URL=… RELAYER_DIR=… pnpm deploy:testnet
CREATOR_KEY=… MEMBER_KEY=… pnpm proof:testnet
CREATOR_KEY=… MEMBER_KEY=… pnpm adversarial:testnet
pnpm verify:testnet                         # replays every capsule from the public RPC
```

See [docs/runbooks/testnet-deploy.md](docs/runbooks/testnet-deploy.md).

## Verify a capsule yourself

```bash
pnpm --filter @relay/verifier exec tsx src/cli.ts --rpc <BOT Chain RPC> --registry <address> --from-block <n> --circle <id> [--claimed claim.json] [--storage <url>]
```

The verifier checks the registry's bytecode against this build, replays every event through the reference model, cross-checks the contract's views, and reports the rule, the event sequence, the evaluation, relayer labels and the evidence's limits.

## Limits, printed where you'll see them

A contributor can keep a copy. A colluding threshold of relayers could open a capsule early, and today's relayers are all project-operated (`PROJECT_BASELINE`). Keys live in your browser; lose it and your recovery kit and nobody can open your share. See [SECURITY.md](SECURITY.md).

## Docs

[PRD.md](PRD.md) · [frontend.md](frontend.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [SECURITY.md](SECURITY.md) · [DECISIONS.md](DECISIONS.md) · [docs/claims.md](docs/claims.md) · [docs/phase.md](docs/phase.md) · [docs/kill-criteria.md](docs/kill-criteria.md) · [docs/botchain-developer-guide.md](docs/botchain-developer-guide.md)
