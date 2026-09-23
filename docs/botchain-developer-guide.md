# Building on BOT Chain testnet — a reproducible guide

_Relay's contribution to the BOT Chain ecosystem (PRD §20): a network-configuration probe anyone can run, the integration facts we measured, and the issues we hit. Everything here was observed on 2026-09-22 and is re-checkable with `pnpm probe:testnet`._

## Network configuration, from official sources

| | Testnet | Mainnet |
|---|---|---|
| Chain ID | 968 (0x3c8) | 677 (0x2a5) |
| RPC | https://rpc.bohr.life | https://rpc.botchain.ai |
| Explorer | https://scan.bohr.life (Blockscout v2 API) | https://scan.botchain.ai |
| Faucet | https://faucet.botchain.ai/basic (10 tBOT / 24 h, human verification) | — |
| ERC-4337 bundler | https://bundler.bohr.life/rpc/ | https://bundler.botchain.ai/rpc/ |
| EntryPoint v0.7 | 0x0000000071727De22E5E9d8BAf0edAc6f37da032 | same |

Sources: [Quick guide](https://dev-docs.botchain.ai/docs/Developers/quick-guide/), [JSON-RPC endpoints](https://dev-docs.botchain.ai/docs/Developers/json-rpc-endpoint/), [AA network & endpoints](https://dev-docs.botchain.ai/docs/Account-Abstraction/network-and-endpoints).

**Don't hard-code these.** `scripts/probe-network.ts` fetches the official pages, records their sha256, parses the values and checks them against the live RPC. Copy it into your project.

## What we measured

- `eth_chainId` → `0x3c8`; client `Geth/v1.5.13` (BSC-derived, Parlia consensus).
- Block time ≈ 0.66–0.75 s; block timestamps track wall clock within seconds.
- `eth_getLogs` on the public **testnet** RPC answered 100,000-block ranges. The docs state it is **disabled on public mainnet endpoints** — plan a log-capable provider for mainnet indexing or verification.
- Gas price 20 gwei; base fee reported as 0.
- Blockscout v2 API is live at `/api/v2/…` and supports `forge verify-contract --verifier blockscout --verifier-url https://scan.bohr.life/api/`.
- Standard tooling (viem 2, Foundry 1.8, Solidity 0.8.28 / cancun) works unchanged.

## Integration issues worth knowing

1. **Token name.** The quick guide calls the testnet token BOT; the faucet page calls it tBOT. Wallet prompts may differ.
2. **Explorer links.** The marketing site links `scan.botchain.ai` (mainnet); testnet transactions are on `scan.bohr.life`.
3. **Logs on mainnet.** See above — anything that reconstructs state from events needs a non-public endpoint on mainnet.
4. **Passkeys.** The documented ERC-4337 stack uses an ECDSA SimpleAccountFactory; there is no documented WebAuthn/P-256 account factory, so passkey wallets need their own audited account contract.
5. **viem block-number cache.** Not BOT-specific, but sub-second blocks make it bite: `getBlockNumber()` is cached for the polling interval (4 s by default), so a log query bounded by it can miss the last few blocks. Pass `{ cacheTime: 0 }` when bounding `eth_getLogs`.

## Minimal verification loop

```bash
pnpm probe:testnet                                   # T0: docs ↔ RPC agreement, recorded
pnpm deploy:testnet --preflight                      # what's missing, without spending
pnpm --filter @relay/verifier exec tsx src/cli.ts --rpc https://rpc.bohr.life --registry <addr> --from-block <n>
```
