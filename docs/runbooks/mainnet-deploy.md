# BOT Chain mainnet deployment (gates M0 → M1)

Mainnet is a separate decision, not the next command after testnet (PRD §16, §18). `pnpm deploy:mainnet` refuses to spend anything until every step below up to M0 is recorded.

## 1. Gates, recorded from evidence

```bash
pnpm gate:status
```

prints T0–T6, the security review and M0, what each rests on, and what is missing. T3, T6, the review and M0 are recorded with `pnpm gate:record`; add `--dry-run` to check without writing.

| Gate | How it is recorded | What the recorder checks |
|---|---|---|
| T3 | `pnpm gate:record T3 --circle <id>` | Verifier replays the Circle as VALID and RELEASED; ≥ 2 members, each consented and contributed; no member is a project wallet (`deployments/testnet.developer-wallets.json`, the deployer, the relayers); a reverted early `requestRelease` for that Circle exists on the explorer (§15.3 item 4) |
| T6 | `pnpm gate:record T6 --circle <id> --notes docs/beta/<file>.md` | Same chain checks (no early-release requirement), plus the beta's documented results and failures |
| Review | `pnpm gate:record review --reviewer "…" --report <url>` | Records the reviewer and report against the current runtime sha256; a bytecode change invalidates it |
| M0 | `pnpm gate:record M0 --owner "…"` | Refused unless every gate above passes; re-verifies every testnet Circle live; binds to the current runtime sha256 |

A gate is never recorded by hand. If the bytecode, quorum membership, storage/encryption implementation or network configuration changes after M0, the gate reopens (§18): re-run the affected proof and record the decision in `DECISIONS.md`.

## 2. Before M0: operations

- **Server.** SSH key-only (no password login), services off root, backups of relayer keys and storage off the machine.
- **Relayers.** New identities for mainnet — never reuse testnet keys:
  `tsx apps/relayer/src/relayer.ts init --dir .relay-mainnet/relayers --count 3`. Prefer at least one relayer on a different machine and operator; until then the quorum stays labelled PROJECT_BASELINE.
- **Storage and steward.** A separate data directory and hostname for mainnet ciphertext.
- **Logs.** `pnpm probe:mainnet` measures `eth_getLogs` on the public RPC. On 2026-09-26 it served 100,000-block ranges although the docs say it is disabled; keep a log-capable fallback endpoint.
- **Funds.** Measured on testnet at the 20 gwei floor: deployment 2,729,551 gas (0.0546 BOT), relayer key registration 45,619 each, one two-member capsule ≈ 0.88–0.97 M gas (≈ 0.018–0.02 BOT). Deployer 0.056 BOT minimum; each relayer 0.003+; each participant 0.005–0.011. Wallets must hold each transaction's gas **limit** × price up front, and the node's estimate runs about 20% above gas used (sealing: ~76,500 limit vs ~63,000 used), so budget each wallet's measured total plus the last step's headroom: creator 0.0116 BOT, member 0.0052 BOT. On 2026-09-26 the member was funded at gas used (0.005) and missed sealing Circle #1 by 0.000115 BOT; `pnpm proof:mainnet` now refuses to start below these amounts.
- **Deployment wallet.** A fresh key, never one pasted in chat or used on testnet.

## 3. Deploy (after M0)

```bash
pnpm probe:mainnet                           # must be < 24 h old
pnpm deploy:mainnet --preflight              # must print READY
DEPLOYER_PRIVATE_KEY=… STORAGE_URL=https://… STORAGE_OPERATOR="…" \
  RELAYER_DIR=.relay-mainnet/relayers pnpm deploy:mainnet --confirm-mainnet
```

The script deploys the exact bytecode, checks the runtime sha256, verifies source on the Blockscout explorer, writes `deployments/mainnet.json` and registers relayer keys. It refuses if `deployments/mainnet.json` already exists.

## 4. After deploy (M1)

1. Start mainnet relayers with `--deployment deployments/mainnet.json` (docs/runbooks/relayer.md) and point `pnpm endpoints:set` at the mainnet record.
2. Build the web client with `NEXT_PUBLIC_RELAY_NETWORK=mainnet`.
3. One real lifecycle transaction, then `pnpm verify:mainnet --out evidence/verifier/mainnet.json`.
4. Move C-06 to OBSERVED_MAINNET in the claim ledger, run `pnpm claims:check`, update WHAT_IS_REAL.md and append DECISIONS. Public copy may use the C-06 wording only after that.

## Rollback

The registry is immutable and has no admin. Rollback means stopping the web client and relayers from pointing people at it, publishing why, and — if a new contract is needed — going through M0 again for the new bytecode.
