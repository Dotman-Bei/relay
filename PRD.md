# Relay PRD

> **Status:** draft — written before implementation  
> **Launch policy:** testnet first. No mainnet deployment, public-mainnet claim, or claim of production custody is permitted until the testnet acceptance gates in §22 pass and the owner explicitly authorises the mainnet gate in §18.

## 0. Agent Operating Contract

This document is the product contract for Relay. Read it before changing source, contracts, tests, public copy, or deployment configuration.

1. Build the mechanism before breadth. A private group capsule that can be independently checked on testnet is more valuable than a broad social app with a simulated unlock.
2. Treat network configuration as live protocol data. The chain ID, RPC endpoints, explorer, faucet, deployed addresses, and ABI provenance must be probed from official BOT Chain sources at deployment time. They must not be copied into product constants from this PRD.
3. Do not put raw media, plaintext messages, decryption keys, recipient contact details, or AI prompts containing private content on-chain.
4. Do not claim that a capsule is “impossible to open early,” “private,” “decentralized,” or “mainnet live” unless the claim ledger (§21) contains the specific evidence needed for that wording.
5. The release mechanism must be independently verifiable without trusting Relay's web server. Build `packages/reference` and `packages/verifier` before the public proof path is called complete.
6. A blocked external dependency is a product state, not a reason to fake a result. Label local fixtures `LOCAL FIXTURE`; label project-operated release relayers `PROJECT_BASELINE`.
7. Keep the phase boundary. Do not begin mainnet work until the testnet gate has passed. Owner approval, funds, and production secrets are owner decisions.
8. Design, styling, layout, and visual-system requirements belong in `frontend.md`; they are deliberately not specified here.

## 1. Product Summary

### Name

**Relay**

### One sentence

Relay is a social time-capsule protocol where a group encrypts contributions now and receives them only after an immutable on-chain date-and-consent rule is satisfied.

### Judge-compressed narrative

People say a future reveal was consensual, that every member contributed, and that it was not opened early. Relay makes the first two statements chain-measurable and makes every recorded release independently checkable. The media stays encrypted off-chain; BOT Chain stores the commitments, consent, conditions, and release record.

### Core claim

For a Relay capsule, anyone can verify from chain data **which participants consented, which rule governed release, whether the rule was satisfied, and when Relay recorded release**. Relay does not claim that a creator cannot retain a copy, or that a colluding release quorum cannot disclose a key early.

## 2. Programme Fit and Competition Requirements

Relay is a Social-track consumer product with a load-bearing BOT Chain mechanism:

- The social value is a shared future moment, not a file locker.
- The protocol value is a tamper-evident social consent and release record.
- The AI-native value is an opt-in Memory Steward that helps groups create meaningful capsules while never deciding release conditions or holding decryption keys.
- The BOT Chain value is frequent, low-cost group actions—joining, consenting, committing a contribution, and recording a release—on an EVM-compatible network.

The first proof environment is BOT Chain **testnet**. Mainnet is a later, separately evidenced deployment (§15–§18).

## 3. Problem

Private memories are currently either:

1. stored in an app that users must trust to honour a future delivery date; or
2. shared immediately in a group chat, where the future reveal and group consent cannot be recovered.

For a social capsule, “we all agreed to open this later” is usually an assertion. A screenshot or a server database cannot independently establish the original condition, the participant set, or whether it was edited later. A generic vault also does not solve the social part: prompting contributions, collecting consent, forming a shared reveal, and preserving a verifiable history of the moment.

## 4. Product Thesis

Turn a social promise into a measurable mechanism.

The valuable primitive is not timed storage. It is an immutable, privacy-preserving **group release agreement**:

> A defined set of people committed encrypted material under a stated rule, and the protocol recorded release only after that rule evaluated true.

## 5. Dominant Mechanism

```text
Creator defines a Circle and release rule
                 |
                 v
Participants join and sign consent on BOT Chain
                 |
                 v
Each participant encrypts a contribution locally
                 |
                 +--> encrypted bundle -> content-addressed storage
                 +--> commitment + participant status -> CapsuleRegistry
                 |
                 v
CapsuleRegistry evaluates date + contribution threshold
                 |
          rule false | rule true
                 |         |
                 v         v
           remains sealed  ReleaseRequested event
                                  |
                                  v
                    threshold release relayers publish receipts
                                  |
                                  v
                  member receives a key share and opens the capsule
                                  |
                                  v
                 independent verifier replays the chain events
```

The smart contract is the source of truth for consent and release eligibility. Storage and notification systems are delivery infrastructure, not the authority that decides whether a capsule should open.

## 6. Privacy and Trust Boundary

### What goes on-chain

- Capsule identifier and version
- Creator address
- A content commitment, not plaintext content
- Participant addresses or privacy-preserving participant commitments
- The immutable release policy: timestamp, required contribution count, and required consent state
- Join, consent, contribution, release-request, and release-receipt events
- Public key fingerprints and release-relayer identifiers

### What stays off-chain

- Messages, images, video, and audio
- Original filenames, captions, and private Circle description where disclosure would identify the group
- Encryption keys and key shares
- Member contact details and notification preferences
- Any material submitted to the Memory Steward

### Encryption and release model

The client generates the content key and encrypts each contribution before upload. The encrypted bundle is stored outside the chain. At release, a threshold set of relayers delivers key shares to entitled members only after `CapsuleRegistry` emits `ReleaseRequested`.

The MVP uses a threshold quorum and records every release receipt. This creates a checkable public timeline, but it is not a claim of perfect cryptographic time-locking: a creator can retain plaintext or a key, and a colluding threshold of relayers could disclose material early. Those limitations must remain visible in the product and README.

## 7. Users, Roles, and Required User Stories

| Role | Required capability |
|---|---|
| Visitor | Understand Relay, inspect public templates, and start onboarding. |
| Member | Create or join a Circle, consent, submit an encrypted contribution, and receive an eligible release. |
| Circle creator | Define the participant set and a rule, invite members, and cancel only before another participant has committed. |
| Participant | Accept or decline an invitation, consent to the immutable rule, contribute, and view their own release status. |
| Memory Steward | Offer opt-in prompts and completion reminders. It cannot modify a rule, sign for a member, release a key, or access content without an explicit member opt-in. |
| Release relayer | Observe eligibility events and submit a signed receipt. Its operation and independence status are disclosed. |
| Verifier | Reconstruct capsule status and validate every claim from on-chain events and public metadata. |

### Required user stories

1. As a creator, I can create a Circle with a date and minimum-contributor rule before inviting anyone.
2. As a participant, I can see the exact rule and explicitly consent before contributing.
3. As a participant, I can add a message, image, audio, or video without plaintext being committed to the chain.
4. As a member, I can see progress without seeing another member’s sealed contribution.
5. As a member, I can open the capsule only after the verifiable release state exists.
6. As a verifier, I can determine whether an observed release was eligible under the original rule without calling Relay's backend.

## 8. System Architecture

### 8.1 Components

| Component | Responsibility | Authority it must not have |
|---|---|---|
| `CapsuleRegistry` Solidity contract | Capsule lifecycle, consent, contribution count, immutable release condition, release-request event | Plaintext content or decryption keys |
| Web client | Wallet/passkey session, local encryption, upload, calls to the contract, member experience | Secret server-side custody of user content |
| Encrypted storage adapter | Stores ciphertext by content-addressed reference | Authority to make a capsule eligible |
| Release-relayer service | Watches eligible capsules and submits release receipts | Authority to change rules or claim eligibility before the contract does |
| Memory Steward | Opt-in prompts and incomplete-capsule reminders | Authority over content, consent, or release |
| `packages/reference` | Small, deterministic implementation of the lifecycle rules | Production deployment authority |
| `packages/verifier` | Replays events and validates claim-ledger evidence | Relay-server trust |

### 8.2 Suggested repository layout

```text
.
├── apps/
│   ├── web/
│   ├── agent/
│   └── relayer/
├── packages/
│   ├── relay-sdk/
│   ├── protocol-types/
│   ├── reference/
│   ├── verifier/
│   └── claim-ledger/
├── contracts/
│   ├── src/
│   ├── test/
│   └── script/
├── scripts/
├── docs/
│   ├── phase.md
│   ├── kill-criteria.md
│   ├── claims.md
│   ├── adr/
│   ├── proofs/
│   └── runbooks/
├── deployments/
├── evidence/
├── PRD.md
├── DECISIONS.md
├── ARCHITECTURE.md
├── SECURITY.md
├── WHAT_IS_REAL.md
└── frontend.md
```

## 9. Product Surfaces and Navigation

`frontend.md` owns the visual and interaction design of these routes. This PRD defines their purpose, required data, and meaningful states only.

### 9.1 Navbar routes

| Navbar label | Route | Audience | Product responsibility |
|---|---|---|---|
| Home | `/` | Everyone | State Relay’s thesis, explain the trust boundary, show how a Circle works, and lead to onboarding. |
| How it works | `/how-it-works` | Everyone | Explain encryption, consent, release conditions, the verifier, and the limits stated in §6. |
| Explore | `/explore` | Everyone | Show public capsule templates and opt-in public community campaigns; never expose sealed member content. |
| Dashboard | `/app` | Signed-in members | Show the member’s action-required invitations, sealed capsules, eligible releases, and recent verified activity. |
| Circles | `/circles` | Signed-in members | List Circles the member created or joined; distinguish `DRAFT`, `AWAITING_CONSENT`, `COLLECTING`, `SEALED`, `RELEASE_ELIGIBLE`, `RELEASED`, `CANCELLED`, and `EXPIRED`. |
| Capsules | `/capsules` | Signed-in members | List individual capsules across Circles, including the member’s entitlement and contribution status. |
| Activity | `/activity` | Signed-in members | Show the member’s own on-chain lifecycle events with links to the network explorer. |
| Settings | `/settings` | Signed-in members | Manage signing/encryption key recovery material, notification preferences, Memory Steward consent, and connected wallet/session. |

### 9.2 Required non-navbar routes

| Route | Product responsibility |
|---|---|
| `/onboarding` | Create or connect a wallet/passkey and explain the encryption and recovery boundary before account completion. |
| `/circles/new` | Define a Circle, participant capacity, release policy, and invitation plan. |
| `/circles/[circleId]` | Canonical Circle state: the immutable rule, member statuses, contribution count, activity record, and available creator actions. |
| `/circles/[circleId]/invite` | Create and redeem an invitation without exposing sealed content. |
| `/circles/[circleId]/consent` | Show the exact policy being accepted; submit explicit on-chain consent. |
| `/capsules/new?circleId=[circleId]` | Encrypt and commit a member contribution after consent. |
| `/capsules/[capsuleId]` | Show a member’s sealed, eligible, or released state. Only render decrypted content after a valid release path succeeds. |
| `/capsules/[capsuleId]/reveal` | Present the shared reveal and allow a post-reveal reflection; disclosure happens only for entitled members. |
| `/verify/[capsuleId]` | Public, read-only verifier result: original rule, event sequence, evaluation result, relayer labels, and evidence limitations. |

### 9.3 Required product states

- **Success:** a member sees a transaction reference, the chain-confirmed state, and the next action.
- **Pending:** the app shows that an on-chain action is awaiting confirmation without treating it as final.
- **Failure:** the app gives the failed action, reason, retry path, and no false success state.
- **Protocol configuration changed:** if the runtime probe disagrees with expected BOT Chain configuration, stop transaction actions and show `PROTOCOL_CONFIG_CHANGED`.
- **Release unavailable:** if the on-chain rule is eligible but the threshold key delivery has not completed, show the precise missing receipt count; do not call the capsule released.

## 10. Contract Requirements

### 10.1 Lifecycle

```text
DRAFT
  -> AWAITING_CONSENT
  -> COLLECTING
  -> SEALED
  -> RELEASE_ELIGIBLE
  -> RELEASED

DRAFT | AWAITING_CONSENT -> CANCELLED
SEALED -> EXPIRED (only where the policy includes an expiry)
```

No default state may silently accept an unknown lifecycle value.

### 10.2 Required invariants

1. A capsule rule becomes immutable once a non-creator participant consents.
2. A member may contribute only after they have consented.
3. A member may contribute at most once per capsule in the MVP unless a future rule explicitly permits versioned contributions.
4. The contract evaluates release eligibility from its stored policy and recorded state only.
5. A release receipt may be recorded only after eligibility exists.
6. No contract function stores or emits plaintext content, private storage locations, or decryption keys.
7. Cancellation is impossible after a non-creator has committed a contribution.
8. Contract functions must avoid unbounded loops. Aggregate counts and mappings replace iteration over participant lists.
9. Administrative authority, if temporarily needed for testnet deployment controls, must be explicit, minimal, time-bounded, and visible in the verifier output.

### 10.3 Events

The contract must emit enough data for independent reconstruction: `CircleCreated`, `InvitationAccepted`, `ConsentRecorded`, `ContributionCommitted`, `ReleaseEligibilityReached`, `ReleaseReceiptRecorded`, `CapsuleCancelled`, and `CapsuleExpired` where applicable.

## 11. Client, Agent, and SDK Requirements

- Use strict TypeScript and runtime schemas for all cross-boundary data.
- The client must encrypt before upload and verify the ciphertext commitment before creating the chain transaction.
- `relay-sdk` exposes typed lifecycle reads, write preparation, event decoding, and verifier-compatible policy evaluation. It must not require Relay’s backend to read a capsule’s chain state.
- The Memory Steward is opt-in per Circle. The default is off for content access. It may operate on user-provided metadata and prompts, but it does not receive encryption keys.
- The agent records a signed activity receipt for each action it performs. The receipt identifies the action type, policy version, and capsule ID, but never includes the private payload.
- A member must be able to disable future Memory Steward actions without invalidating an existing capsule rule.

## 12. Security Model

### Assets

- Sealed user content
- Content encryption keys and key shares
- Member consent integrity
- Immutable release conditions
- Accurate lifecycle and release evidence
- Wallet/passkey authority and recovery material

### Adversaries

- A malicious creator attempting to alter the rule after invitations
- A participant attempting to contribute without consent or claim a release while ineligible
- A compromised web server attempting to display an early or false release
- A malicious relayer withholding a key share or colluding with other relayers
- A malicious upload attempting to exploit media processing
- An AI service attempting to retain or overreach on private content

### Required properties

- Contract state, not server state, determines eligibility.
- The website cannot forge a consent event or release receipt.
- The verifier detects an event sequence that violates the lifecycle invariants.
- Content is not readable from chain data or public storage without the content key.
- A release relayer cannot unilaterally claim that a capsule was eligible.
- The product communicates the remaining trust assumption of the threshold release quorum.

## 13. Testing Strategy

1. **Unit tests:** each lifecycle transition, authorization rule, cancellation boundary, event emission, and configuration guard.
2. **Property tests:** generated participant sequences must never produce a release without valid consent, contribution threshold, and date condition.
3. **Contract tests:** use Foundry to test access control, state machine invariants, malformed commitments, duplicate contribution, timestamp boundaries, and denial-of-service resistance.
4. **Reference parity tests:** the reference evaluator and Solidity contract must produce the same eligibility result for generated policies and event histories.
5. **Integration tests:** run the encrypted upload, testnet commit, testnet release-request, receipt, and decrypt flow against live testnet services—not a mocked public path.
6. **End-to-end tests:** create a two-member Circle, obtain consent, submit two encrypted contributions, wait for a simulated test rule, and verify the reveal experience.
7. **Verifier tests:** intentionally mutate event order, contributor identity, rule data, and receipt timing; the verifier must reject each invalid result.

## 14. Adversarial Evidence Campaign

The campaign records both expected success and attempted violation. It must be reproducible from a clean checkout.

| Attempt | Expected result | Evidence |
|---|---|---|
| Change the date after member consent | Revert | Testnet transaction hash and verifier output |
| Commit twice as one participant | Revert | Testnet transaction hash and contract test |
| Request release before the rule is true | Revert | Testnet transaction hash and contract test |
| Submit a receipt before eligibility | Revert | Testnet transaction hash and contract test |
| Serve modified ciphertext | Client detects commitment mismatch | Integration test output |
| Point verifier at a false server response | Verifier derives state from chain and reports the actual state | Verifier run output |
| Withhold one relayer receipt | State remains `RELEASE_UNAVAILABLE`, not `RELEASED` | Testnet event trace |

## 15. Testnet Deployment and Evidence Plan

### 15.1 Testnet is the first deployment

Relay must deploy `CapsuleRegistry`, the verifier, the client, and clearly labelled `PROJECT_BASELINE` release relayers to BOT Chain testnet before any mainnet contract is deployed. Testnet is not a placeholder: the public demo must execute real transactions and show the resulting explorer links.

### 15.2 Testnet deployment record

`deployments/testnet.json` must contain:

- Network name, chain ID, and official-source probe timestamp
- Contract address, deployer address, transaction hash, deployment block, and verified-source status
- ABI hash and source commit
- Configuration for the threshold release quorum and its independence label
- Versioned verifier URL and source commit

### 15.3 Testnet proof run

The minimum public proof run uses at least two non-developer participant wallets and demonstrates:

1. Circle creation with a future date and required-contributor threshold;
2. independent consent from both members;
3. encrypted contributions whose plaintext is absent from chain events;
4. a failed early-release attempt;
5. rule satisfaction and a recorded release request;
6. receipt delivery and a member reveal;
7. independent verification from the deployed testnet contract.

No testnet result becomes a mainnet claim. Public copy must say “deployed on BOT Chain testnet” until §18 is passed.

## 16. Mainnet Evidence Plan

Mainnet is a phase after testnet acceptance—not an automatic follow-on action.

Before mainnet, produce:

- a verified testnet contract and exact testnet proof-run transactions;
- contract test, property-test, and reference-parity reports;
- an independent review of the contract and encryption/release threat model;
- a documented assessment of relayer custody and quorum operations;
- a reproducible `verify:testnet` command;
- a rollback and incident response runbook;
- a final network configuration probe from official BOT Chain sources; and
- explicit owner approval for the deployment wallet, funds, production secrets, and address publication.

After a mainnet deployment, record real addresses and transaction hashes in `deployments/mainnet.json`, run `verify:mainnet`, and narrow or upgrade claims only to the evidence rung reached. Mainnet evidence does not prove private content is forever inaccessible, nor does it prove market adoption.

## 17. Operational Metrics

Measure facts, not vanity assertions:

- Created Circles, invited members, consent completion rate, and contribution completion rate
- Number of sealed capsules and independently verified releases
- Median and p95 time from eligibility event to sufficient release receipts
- Number of failed release attempts correctly rejected by the contract
- Number of Memory Steward actions, opt-in rate, and opt-out rate
- Testnet participant count, distinguishing developer wallets from external beta users
- Storage upload failures and ciphertext-commitment mismatches

## 18. Mainnet Release Policy

Only the owner may authorise the mainnet deployment gate. Authorisation is permitted only after every Gate T item in §22 has passed, the evidence is checked into the repository, and the live testnet claim verification succeeds from a clean environment.

If any condition changes after approval—network configuration, contract bytecode, release quorum membership, storage/encryption implementation, or verified source—the gate reopens. Re-run the affected testnet proof and record the decision in `DECISIONS.md` before deploying.

## 19. Delivery Sequence

1. **Phase A — mechanism specification:** types, lifecycle, contract interface, reference evaluator, claim ledger, and kill criteria.
2. **Phase B — local proof:** contract tests, property tests, local encrypted upload, and verifier parity.
3. **Phase C — BOT Chain testnet:** deploy the contract, verify source, execute the public proof run, and publish testnet evidence.
4. **Phase D — beta:** invite real testnet users from a focused community, observe completion and failure metrics, and fix only evidenced weaknesses.
5. **Phase E — mainnet readiness:** security review, runbooks, configuration probe, owner decision, and final testnet re-verification.
6. **Phase F — mainnet:** deploy only after §18; add production evidence and update public claims.

## 20. Open-Source Contribution Requirement

Relay is not complete as a closed interface around a contract. The repository must include:

- an installable `relay-sdk` package;
- the independent `reference` and `verifier` packages;
- a public, documented testnet verification command;
- a transparent claim ledger;
- a concrete contribution to the BOT Chain ecosystem, such as a reproducible developer guide, network-configuration probe, or documented integration issue.

## 21. Claim and Evidence Ledger

`packages/claim-ledger/data/claims.json` is the source of truth; `docs/claims.md` is generated. Every public claim has a status: `PLANNED`, `TESTED_LOCAL`, `OBSERVED_TESTNET`, `OBSERVED_MAINNET`, `FAILED`, or `UNAVAILABLE`.

| ID | Claim | Earliest permitted wording | Required evidence |
|---|---|---|---|
| C-01 | Release policy is immutable after consent | “Tested locally” | Contract and property tests |
| C-02 | An ineligible release is rejected | “Observed on BOT Chain testnet” | Failed testnet transaction and verifier trace |
| C-03 | The capsule lifecycle is independently replayable | “Verified on BOT Chain testnet” | Published verifier output against deployed contract |
| C-04 | Member payload is absent from contract events | “The protocol does not store plaintext payload on-chain” | ABI/event inspection and testnet proof run |
| C-05 | Testnet deployment exists | “Deployed on BOT Chain testnet” | Address, verified source, explorer link, deployment transaction |
| C-06 | Mainnet deployment exists | “Deployed on BOT Chain mainnet” | Mainnet address, verified source, and deployment transaction |
| C-07 | Threshold release prevents all early disclosure | Never claim | The model has a stated collusion and creator-retention limit (§6) |

## 22. Acceptance Gates

| Gate | Pass condition | Stop boundary if not passed |
|---|---|---|
| T0 — Protocol configuration | Official BOT Chain configuration probe succeeds and is recorded | No transaction UI or deployment |
| T1 — Lifecycle correctness | All contract, property, and reference-parity tests pass | No public testnet deployment claim |
| T2 — Testnet deployment | Contract is deployed and source verified on BOT Chain testnet | No beta launch |
| T3 — Testnet proof | The full two-member proof run in §15.3 succeeds, with transaction evidence | No mainnet planning or “working release” claim |
| T4 — Independent verification | `packages/verifier` reproduces deployed capsule state without Relay backend access | No “verifiable” claim |
| T5 — Adversarial campaign | Every expected rejection in §14 is evidenced; any unexpected result is in the ledger | No mainnet readiness declaration |
| T6 — Beta evidence | At least one non-developer group completes a real testnet capsule; results and failures are documented | No adoption claim beyond evidence |
| M0 — Mainnet authorisation | T0–T6 passed, testnet verification rerun, security review completed, and owner authorises deployment | No mainnet deployment |
| M1 — Mainnet evidence | Deployment, verification, first real lifecycle transaction, and `verify:mainnet` all recorded | Do not say “mainnet live” |

## 23. Demo Script Requirements

The two-to-four minute demo must show a real testnet run, not a mock.

1. State the product thesis and the limitation: a verifiable social release record, not a claim of impossible early disclosure.
2. Show the exact Circle rule before members consent.
3. Show two independent wallets consenting and contributing encrypted material.
4. Open the explorer and show the resulting commitment and events, without exposing plaintext content.
5. Attempt early release and show the on-chain rejection.
6. Satisfy the condition, record release receipts, and reveal the capsule to an entitled member.
7. Run or display the independent verifier output.
8. Close with the testnet status, what remains before mainnet, and the next user-validation milestone.

## 24. Evidence Artefacts

The repository must retain:

- `WHAT_IS_REAL.md` with the current truth state and tested network;
- `deployments/testnet.json` and, only after M0, `deployments/mainnet.json`;
- explorer links and transaction hashes for C-01 through C-06;
- test, property-test, integration-test, and verifier reports under `evidence/`;
- versioned testnet proof-run input and output under `docs/proofs/`;
- release-relayer runbook and incident procedure;
- `DECISIONS.md`, append-only, with the decision, evidence, status, and cost of every material change.

## 25. Non-Goals

- A public social feed, likes, followers, or algorithmic content ranking
- A token, speculative rewards, or a marketplace
- A claim of permanent confidentiality against a malicious creator, recipient, device compromise, or colluding release quorum
- Autonomous AI control over user consent, money, keys, content, or release conditions
- Cross-chain support before the BOT Chain testnet and mainnet gates pass
- Medical, legal, estate-planning, or emergency-message guarantees
- Replacing a user’s own encrypted backup strategy

## 26. Kill Criteria and Escalation

| Condition | Affected claim | Required action |
|---|---|---|
| Contract and reference evaluator disagree on any valid generated event history | C-01 to C-04 | Stop deployment; record `FAILED`; fix the mechanism before new features. |
| A member can cause or record release while the policy is false | C-02 to C-04 | Stop testnet beta; disclose the failure; redeploy only after remediation and a new evidence run. |
| Client cannot prove ciphertext matches its on-chain commitment | C-04 | Remove privacy wording and block uploads until resolved. |
| Threshold relayers cannot deliver a usable testnet release reliably | “working release” | Mark `UNAVAILABLE`; do not substitute a server-triggered reveal and present it as the protocol. |
| BOT Chain testnet configuration or availability prevents an honest live proof | C-05 | Keep local results labelled `LOCAL FIXTURE`; do not claim testnet deployment. |
| Fewer than one external beta group completes a capsule | Social traction | Do not claim user validation; narrow the audience or rethink the onboarding seam. |

## 27. Decision Log Policy

`DECISIONS.md` is append-only. Each decision uses this format:

```text
D-001: <full decision sentence>
Date: YYYY-MM-DD
Status: active | superseded | blocked
Evidence: <facts, testnet addresses, transaction hashes, or probe output>
Cost: <what this makes harder, slower, or less private>
```

If current official BOT Chain documentation conflicts with this PRD, current official documentation wins. Record the discrepancy, adapt the implementation, and preserve the product thesis where possible.

## 28. Definition of Done

Relay’s **testnet MVP** is done when:

1. `CapsuleRegistry` is deployed and source-verified on BOT Chain testnet;
2. the create → consent → commit → eligible → receipt → reveal lifecycle has executed with real testnet transactions;
3. the system rejects and evidences at least one early-release attempt;
4. encrypted media content is absent from contract events and a commitment mismatch is detected by the client;
5. `packages/reference` and `packages/verifier` independently reproduce the chain lifecycle;
6. the navbar routes in §9 exist and show correct success, pending, failure, configuration-change, and release-unavailable states;
7. the testnet proof run, claim ledger, deployment record, limitations, and demo are published; and
8. all public wording accurately says **BOT Chain testnet**.

Relay’s **mainnet release** is done only after M0 and M1 (§22) pass. It is not implied by completion of the testnet MVP.
