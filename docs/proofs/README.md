# Proof runs

Each run of `pnpm proof:<network>` writes `docs/proofs/<network>/<run-id>/`:

- `input.json` — network, registry, participants, the exact rule, source commit
- `output.json` — the seven §15.3 steps with transaction hashes and pass/fail
- `verifier-report.json` — the independent verifier's replay of the capsule
- `transcript.md` — human-readable log

`local/` runs are **LOCAL FIXTURE**: a development chain on the build machine. They prove the mechanism works end to end; they are not evidence of a BOT Chain deployment. `testnet/` runs will appear once Relay is deployed on BOT Chain testnet.
