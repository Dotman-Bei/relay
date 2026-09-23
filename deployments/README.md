# Deployment records

| File | Meaning |
|---|---|
| `testnet.probe.json` | Gate T0: official BOT Chain testnet configuration, source-page hashes, live RPC observation. Re-run with `pnpm probe:testnet`. |
| `testnet.json` | BOT Chain testnet deployment of 2026-09-23: `0x6f6e2c0fb44016d621e133612c61069de15cd710`, block 24389826, source verified. Written by `pnpm deploy:testnet` (PRD §15.2). |
| `mainnet.json` | Only after gate M0 (PRD §18). |
| `local.json` | LOCAL FIXTURE record written by `pnpm local:chain`; regenerated every run and not committed; not evidence of anything on BOT Chain. |

All records validate against `DeploymentSchema` / `NetworkProbeSchema` in `@relay/protocol-types`.
