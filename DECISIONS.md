# Decisions

Append-only (PRD §27). Newer decisions supersede older ones by reference; nothing is edited in place.

D-001: In protocol v1 each Circle seals exactly one capsule, so a capsule's id is its Circle's id; `/circles/*` is the group-and-rule view and `/capsules/*` the content view of the same on-chain record.
Date: 2026-09-22
Status: active
Evidence: PRD §9 uses Circle and capsule for one lifecycle (`CircleCreated` … `CapsuleCancelled`); contracts/src/CapsuleRegistry.sol
Cost: A group wanting a second capsule creates a new Circle and re-invites.

D-002: Consent names the exact rule hash; the rule locks when any non-creator consents; before that the creator may replace it, which clears the creator's own consent.
Date: 2026-09-22
Status: active
Evidence: `recordConsent(circleId, policyHash, fp)` reverts with `PolicyHashMismatch`; `updatePolicy` reverts with `RuleLocked`; tests `test_updatePolicy_*`, invariant `ruleImmutableAfterForeignConsent`, ADV-1
Cost: After a member consents, a creator who wants a different rule must start a new Circle.

D-003: Cancellation is allowed only in DRAFT and AWAITING_CONSENT, following §10.1's lifecycle, which is stricter than §7's "before another participant has committed".
Date: 2026-09-22
Status: active
Evidence: `cancel` checks lifecycle and `nonCreatorContributed`; invariant `noCancelAfterForeignContribution`
Cost: A creator can't cancel once a member consented, even if nobody contributed yet.

D-004: Each capsule carries its own release quorum (1–7 relayers, k-of-n) inside the rule; relayers self-register one encryption-key fingerprint per address; the registry has no owner, pause, upgrade or admin role.
Date: 2026-09-22
Status: active
Evidence: `Policy.relayers`, `registerRelayerKey`, `RelayerKeyMissing`; SECURITY.md "Contract properties"
Cost: Relayer key rotation requires a new relayer address; capsules keep the quorum they were created with.

D-005: Invitations are single-use keys whose private half travels only in the link's #fragment; redeeming requires the invite key's signature over the redeemer's own address.
Date: 2026-09-22
Status: active
Evidence: `acceptInvitation`, `inviteDigest`; `test_invitation_signatureIsBoundToRedeemer`, malleability test
Cost: Links are bearer secrets: anyone holding an unredeemed link can take the seat.

D-006: A contribution's on-chain commitment is sha256 of its manifest; the manifest commits to the ciphertext by sha256 and carries relayer key shares; storage is content-addressed by the same hashes.
Date: 2026-09-22
Status: active
Evidence: packages/relay-sdk/src/capsule.ts; ADV-5; SDK tests
Cost: Two storage round-trips per contribution; manifests are public (they contain only encrypted shares and hashes).

D-007: Entitlement to a reveal is having consented; relayers deliver shares to every consenting member, contributors or not.
Date: 2026-09-22
Status: active
Evidence: apps/relayer/src/relayer.ts `deliver`; verifier delivery coverage check
Cost: A member who consented but never contributed still receives everyone else's contributions.

D-008: The rule's consent condition is either "each contributor consents" or "every joined member consents"; an optional expiry turns a SEALED capsule that was never released into EXPIRED.
Date: 2026-09-22
Status: active
Evidence: `Policy.unanimousConsent`, `expiresAt`, `markExpired`; `test_requestRelease_unanimous*`, `test_noExpiryMeansSealedForever`
Cost: Under unanimity one silent member can block release; the UI says so and suggests an expiry.

D-009: `updatePolicy` rejects a capacity below the members already joined, after the invariant suite found memberCount could exceed capacity.
Date: 2026-09-22
Status: active
Evidence: invariant `countsAreOrdered` counterexample (open → update → join → join → shrink); fix + `test_updatePolicy_cannotShrinkCapacityBelowMembers`; parity report
Cost: None beyond one comparison.

D-010: Log queries read a fresh block number (`cacheTime: 0`), after the local proof run showed viem's 4-second block-number cache made a relayer miss fresh contributions and a member miss fresh receipts.
Date: 2026-09-22
Status: active
Evidence: first proof run step 6 failure (0/4 shares delivered by relayer 1); fix in packages/relay-sdk/src/chain.ts; passing proof runs since
Cost: One extra `eth_blockNumber` per log query.

D-011: A member's reveal skips delivery manifests that fail their hash check instead of failing entirely, so one bad relayer or corrupted blob can't block a reveal honest relayers can satisfy.
Date: 2026-09-22
Status: active
Evidence: ADV-5 first run crashed on a tampered delivery; `openCapsuleFlow` now reports `deliveryErrors`
Cost: The UI must surface skipped deliveries; a reveal may succeed while a relayer misbehaved.

D-012: BOT Chain network configuration is read from the official developer docs at probe time and checked against the live RPC (gate T0), never compiled into product code.
Date: 2026-09-22
Status: active
Evidence: deployments/testnet.probe.json (chain 968, https://rpc.bohr.life, https://scan.bohr.life, Blockscout v2, eth_getLogs over 100k blocks)
Cost: Every deployment must re-probe; the web client fetches its deployment record at runtime.

D-013: Record the documentation discrepancy that the quick guide names the testnet token BOT while the faucet page names it tBOT; deployment records use BOT, as the quick guide does.
Date: 2026-09-22
Status: active
Evidence: deployments/testnet.probe.json `discrepancies`
Cost: Wallet prompts may show BOT where users expect tBOT.

D-014: BOT Chain testnet deployment is blocked on an owner decision: the deployer and relayer wallets must be funded, and the official faucet requires human verification that this build environment can't complete.
Date: 2026-09-22
Status: blocked
Evidence: `pnpm deploy:testnet --preflight` → BLOCKED (no DEPLOYER_PRIVATE_KEY, no STORAGE_URL, no relayer identities)
Cost: C-02…C-05 stay at TESTED_LOCAL/PLANNED; all public copy says "not yet deployed".

D-015: Passkey sign-in is not offered, because BOT Chain testnet documents ERC-4337 (EntryPoint v0.7, ECDSA SimpleAccountFactory) but no WebAuthn-capable account factory; offering one would mean deploying unaudited account code.
Date: 2026-09-22
Status: active
Evidence: https://dev-docs.botchain.ai/docs/Account-Abstraction/network-and-endpoints
Cost: Members need a browser wallet or a testnet-only session key.

D-016: The Memory Steward calls `claude-opus-5` at low effort with structured JSON output and server-side `fallbacks: "default"`, only with a member's opt-in and only on typed metadata; without credentials it serves labelled TEMPLATE prompts.
Date: 2026-09-22
Status: active
Evidence: apps/agent/src/prompts.ts, apps/agent/test/steward.test.ts
Cost: Model prompts require an Anthropic credential and send the typed theme to the API.

D-017: The web client implements frontend.md's system with three deliberate choices: tokens in `@theme` with Tailwind's default palette removed (so §10's off-system colours can't be written), neo classes in `@layer components` with errors as red fills (never rings), and one fixed colour map for lifecycle states.
Date: 2026-09-22
Status: active
Evidence: apps/web/app/globals.css; axe-core audit (evidence/e2e/a11y.txt)
Cost: Every colour must come from the twelve tokens; utilities can override neo classes, so overrides need care.

D-018: Mainnet will need a log-capable RPC for the verifier, because official docs state eth_getLogs is disabled on public mainnet endpoints.
Date: 2026-09-22
Status: active
Evidence: https://dev-docs.botchain.ai/docs/Developers/json-rpc-endpoint/
Cost: Phase F must name a third-party or self-run endpoint in the deployment record.

D-019: Local development ports moved to 8645 (anvil), 8687 (storage) and 8688 (steward), and the harness now refuses to start on any port that already answers, after a development run stopped other projects' processes on 8545, 8787 and 8788.
Date: 2026-09-23
Status: active
Evidence: scripts/lib/harness.ts `assertPortFree`; incident noted in the build report to the owner
Cost: Ports differ from common defaults; documented in README.

D-020: CapsuleRegistry is deployed on BOT Chain testnet at 0x6f6e2c0fb44016d621e133612c61069de15cd710, superseding D-014's blocked state; testnet storage runs on the build machine until it is hosted publicly.
Date: 2026-09-23
Status: active
Evidence: deployment tx 0x38d9f3545183c4a3728e3370e2df619683ea0e3825e389f1f6115b7b9eab655f (block 24389826); Blockscout "Pass - Verified" (compiler 0.8.28); runtime sha256 77a4b893… matches the build; relayer keys registered in 0x947e2b60…, 0x3f70bb99…, 0x308ebb88…; relayers funded with 0.5 BOT each from the owner's deployer 0x5e3cC65cA2f1a6AC3Bf75f7110E50d296F127fe6; T0 re-probed the same day.
Cost: Until storage has a public URL, only processes on the build machine can seal or open capsules on testnet; the deployer key was shared in a chat session, so it must stay testnet-only.

D-021: Every transaction sender waits two confirmations and then four seconds before its next read on public networks, because BOT Chain testnet's public RPC answered a read with pre-write state immediately after a confirmed write.
Date: 2026-09-23
Status: active
Evidence: first testnet proof run: createCircle confirmed as Circle #1, then the openCircle simulation reverted UnknownCircle(); fix in packages/relay-sdk/src/config.ts `writeSettling`, used by scripts/lib/harness.ts, apps/relayer and apps/web/lib/tx.ts; second run passed.
Cost: About six seconds per transaction on public networks; multi-step flows in the web client take noticeably longer.

D-022: The first BOT Chain testnet proof run used two wallets generated by the build agent at the owner's request, so it proves the mechanism on testnet but does not meet PRD §15.3's non-developer-participant requirement for gate T3.
Date: 2026-09-23
Status: active
Evidence: docs/proofs/testnet/2026-09-23T09-02-50-791Z/ (Circle #2, all seven steps passed); evidence/verifier/testnet.json (Circles #1 and #2 VALID); participants 0xEFAc0ae9143fc09d98891cF9a280be1b97B6Fe7e and 0x86e54F544534A24949e8E9CfD00DD69526b0C265, funded from the owner's deployer (the creator received 0.2 BOT twice because a funding script was retried). Circle #1 remains an unopened DRAFT left by the failed first attempt; the registry has no delete.
Cost: T3 must be repeated with two non-developer participants before any "working release" claim that depends on real users.

D-023: Gate T5 is passed on BOT Chain testnet by the second adversarial campaign run; the first run's ADV-3 result is kept as recorded, because its collecting-phase attempt fired after the contribution deadline (the test's timing, not the contract) and so did not exercise that case.
Date: 2026-09-23
Status: active
Evidence: evidence/adversarial/testnet/2026-09-23T09-34-01-018Z.json (7/7, ADV-3 rejected while COLLECTING with WrongLifecycle and while SEALED with RuleNotSatisfied); evidence/adversarial/testnet/2026-09-23T09-25-27-033Z.json (6/7, ADV-3 both attempts reverted but the first ran in SEALED); scripts/adversarial.ts now records the lifecycle before that attempt and uses a 540 s testnet window; evidence/verifier/testnet.json (Circles 1–6 VALID).
Cost: Circles 3–6 remain on testnet as campaign artifacts; Circles 4 and 6 stay RELEASE_UNAVAILABLE until relayer-2 records its withheld receipt, which a normally running relayer will do.
