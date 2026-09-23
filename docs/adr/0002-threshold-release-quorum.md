# ADR 0002 — Threshold release with per-capsule quorum

**Status:** accepted · 2026-09-22 · DECISIONS D-004, D-006, D-007

**Context.** The PRD requires release to depend on on-chain eligibility, not on a server, and forbids claiming that early disclosure is impossible. Options: (a) time-lock encryption (drand/tlock-style), (b) a single custodian key, (c) a k-of-n relayer quorum.

**Decision.** (c). Each contribution key is split k-of-n with Shamir; each share is ECIES-encrypted to one relayer. Relayers re-encrypt their share to consenting members only after `ReleaseEligibilityReached`, and record a receipt. The quorum and threshold are part of the rule members consent to.

**Why not (a).** No BOT Chain-native beacon is documented; importing an external beacon adds a second trust root the verifier can't check on-chain. It remains the best future upgrade.

**Consequences.** Any k relayers can collude to open early (stated in SECURITY.md, claim C-07 never claimed). Withholding is visible as RELEASE_UNAVAILABLE with an exact missing count. Independence is a disclosed label (`PROJECT_BASELINE` today), not an assumption.
