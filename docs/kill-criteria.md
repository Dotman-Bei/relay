# Kill criteria and escalation (PRD §26)

Each row names a condition, the automated check that detects it, and the required action. Nothing here is advisory.

| Condition | Detected by | Affected claims | Required action |
|---|---|---|---|
| Contract and reference evaluator disagree on any valid generated history | `pnpm test:parity` (exit 1, `evidence/parity/parity-report.json` verdict FAIL) | C-01 – C-04 | Stop deployment. Mark claims `FAILED`. Fix the mechanism before any new feature. |
| A member can cause or record release while the rule is false | Invariant `noReleaseWithoutValidRule`, fuzz `releaseTimestampBoundary`, ADV-3, verifier eligibility check | C-02 – C-04 | Stop testnet beta. Disclose. Redeploy only after remediation and a fresh evidence run. |
| Client cannot prove ciphertext matches its commitment | SDK tests, ADV-5, `putVerified` read-back | C-04 | Remove privacy wording; block uploads until fixed. |
| Threshold relayers can't reliably deliver a usable testnet release | Relayer metrics (`metrics.jsonl`), `pnpm metrics`, ADV-7-style RELEASE_UNAVAILABLE states persisting | "working release" | Mark `UNAVAILABLE`. Never substitute a server-triggered reveal and present it as the protocol. |
| BOT Chain testnet configuration or availability prevents an honest live proof | `pnpm probe:testnet` (agreement false), web `PROTOCOL_CONFIG_CHANGED` | C-05 | Keep results labelled `LOCAL FIXTURE`; don't claim testnet deployment. |
| Fewer than one external beta group completes a capsule | Beta metrics (`pnpm metrics`, developer vs. external wallets) | Social traction | Don't claim user validation; narrow the audience or rework onboarding. |

## Findings so far

- **2026-09-22** — the invariant suite found `memberCount > capacity` reachable through `updatePolicy`. Fixed before any deployment (D-009). Parity re-run: 0 mismatches.
