# ADR 0003 — Network configuration is probed, recorded and checked at runtime

**Status:** accepted · 2026-09-22 · DECISIONS D-012

**Decision.** `scripts/probe-network.ts` parses chain ID, RPC and explorer from the official BOT Chain developer docs, hashes each source page, and compares with the live RPC. Deployments refuse to run on a missing, stale (>24 h) or disagreeing probe. The web client fetches its deployment record at runtime and, before enabling any transaction, checks `eth_chainId` and the sha256 of the registry's runtime bytecode; any difference shows `PROTOCOL_CONFIG_CHANGED` and disables writes.

**Consequences.** No network constant exists in product code. A chain-ID change, an RPC pointing elsewhere, or a different contract at the recorded address all stop transactions instead of silently misbehaving.
