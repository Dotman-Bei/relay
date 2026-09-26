# Deployment records

| File | Meaning |
|---|---|
| `testnet.probe.json` | Gate T0: official BOT Chain testnet configuration, source-page hashes, live RPC observation. Re-run with `pnpm probe:testnet`. |
| `testnet.json` | BOT Chain testnet deployment of 2026-09-23: `0x6f6e2c0fb44016d621e133612c61069de15cd710`, block 24389826, source verified. Written by `pnpm deploy:testnet` (PRD §15.2). |
| `mainnet.probe.json` | Gate T0 for mainnet: `pnpm probe:mainnet`. Read-only; records whether the public RPC serves `eth_getLogs`. |
| `mainnet.json` | BOT Chain mainnet deployment of 2026-09-26: `0xb565bd5875ae429f2ebca9e69e202407021c6d62`, block 24607284, source verified. Written by `pnpm deploy:mainnet` under an owner override of M0 (`evidence/gates/M0.json`). |
| `testnet.developer-wallets.json` | Wallets the project controls on testnet (addresses only). They never count as non-developer participants for T3/T6 or beta metrics. |
| `local.json` | LOCAL FIXTURE record written by `pnpm local:chain`; regenerated every run and not committed; not evidence of anything on BOT Chain. |

All records validate against `DeploymentSchema` / `NetworkProbeSchema` in `@relay/protocol-types`.
