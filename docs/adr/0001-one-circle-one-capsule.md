# ADR 0001 — One Circle seals one capsule

**Status:** accepted · 2026-09-22 · DECISIONS D-001

**Context.** The PRD's routes separate `/circles/*` (group, rule, consent) from `/capsules/*` (content, entitlement, reveal), and its events mix the words (`CircleCreated`, `CapsuleCancelled`). A registry that allowed many capsules per Circle would need a second id space, per-capsule rules and per-capsule consent.

**Decision.** In v1 a Circle has exactly one capsule and they share an id. The two route families are two views of one on-chain record.

**Consequences.** Simple, auditable state; the verifier replays one event stream per id. A recurring group creates a new Circle per capsule. A future v2 can add `capsuleId` under a Circle without breaking v1 records, because the registry is versioned by `PROTOCOL_VERSION` inside every rule hash.
