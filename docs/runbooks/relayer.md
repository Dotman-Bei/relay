# Release-relayer runbook

Relayers are the part of Relay a person operates. This runbook is for the `PROJECT_BASELINE` relayers and for anyone running an independent one.

## What a relayer holds

| Secret | Where | If lost | If leaked |
|---|---|---|---|
| Signing key (EOA) | `identities.json` (mode 600) | Can't record receipts; capsules naming it lose one share | Attacker can record receipts as this relayer (after eligibility only) |
| P-256 encryption key | `identities.json` | Its share of every capsule is unrecoverable; capsules with k = n can never open | Attacker holds one share of every capsule naming this relayer. **Not enough alone**; k leaked relayers open everything early |

Back up `identities.json` offline. Never place two relayers' identities on the same host in production — that collapses k-of-n into one host.

## Start

```bash
tsx apps/relayer/src/relayer.ts init --dir /var/lib/relay/relayer --count 1     # once; prints the address to fund
RELAY_DEPLOYMENT=deployments/testnet.json POLL_MS=5000 \
  tsx apps/relayer/src/relayer.ts run --deployment deployments/testnet.json --dir /var/lib/relay/relayer
```

On start it uploads its public key to storage and registers the fingerprint on-chain once (`registerRelayerKey`). Key rotation = a new relayer address (D-004).

## What it does every pass

1. For each capsule naming it: if SEALED and `releaseRuleStatus == 0`, optionally call `requestRelease` (the contract decides; anyone may call).
2. If eligibility is recorded and it has no receipt yet: open its share of each contribution manifest, re-encrypt to every consenting member's published key, sign and upload the delivery manifest, record `recordReleaseReceipt(sha256(delivery))`.
3. Append latency to `metrics.jsonl` (eligibleAt → receipt).

## Health checks

- `pnpm verify:testnet` — every capsule VALID; relayer rows show `signed delivery · n/n`.
- `pnpm metrics` — p50/p95 eligibility → threshold latency; capsules stuck in RELEASE_UNAVAILABLE.
- Gas balance of the relayer address ≥ 20 receipts' worth.

## Incident procedure

| Symptom | Likely cause | Action |
|---|---|---|
| Capsule RELEASE_UNAVAILABLE > 1 h | Relayer down, unfunded, or storage unreachable | Check logs and balance; restart; the relayer resumes from chain state (no local queue to lose) |
| `Commitment mismatch` in relayer log | Storage served modified bytes | Stop the relayer, preserve the storage directory, compare blob hashes, file an incident in DECISIONS.md |
| `Relayer … has no share in the manifest` | Contributor sealed to a different quorum | Expected for capsules not naming this relayer; otherwise investigate the client version |
| Suspected key leak | Host compromise | Stop immediately. Publish the incident. List capsules naming the relayer (`pnpm verify:testnet`); those with k − 1 other leaked shares are exposed. Stand up a new relayer address for new Circles. Existing capsules keep their quorum — this is a stated limit. |
| Receipt tx reverts `ReceiptAlreadyRecorded` | Duplicate run | Harmless; ensure only one process per identity |

Every incident gets a `D-xxx` entry in DECISIONS.md with evidence and cost.
