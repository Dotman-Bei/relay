# Deployment records

| File | Meaning |
|---|---|
| `testnet.probe.json` | Gate T0: official BOT Chain testnet configuration, source-page hashes, live RPC observation. Re-run with `pnpm probe:testnet`. |
| `testnet.json` | **Does not exist yet.** Written only by `pnpm deploy:testnet` after a real deployment (PRD §15.2). |
| `mainnet.json` | Only after gate M0 (PRD §18). |
| `local.json` | LOCAL FIXTURE record written by `pnpm local:chain`; regenerated every run and not committed; not evidence of anything on BOT Chain. |

All records validate against `DeploymentSchema` / `NetworkProbeSchema` in `@relay/protocol-types`.
