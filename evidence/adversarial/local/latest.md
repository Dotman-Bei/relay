# Adversarial campaign — LOCAL FIXTURE

Run 2026-09-23T09-33-50-427Z against registry `0x5fbdb2315678afecb367f032d93f642f64180aa3` (chain 31337).

| ID | Attempt | Expected | Observed |
|---|---|---|---|
| ADV-1 | Change the date after member consent | Revert | ✅ status reverted, RuleLocked: The rule is locked: another member has already consented to it.; stored rule is still the consented one |
| ADV-2 | Commit twice as one participant | Revert | ✅ status reverted, AlreadyContributed: You have already committed your contribution. One per member. |
| ADV-3 | Request release before the rule is true | Revert | ✅ while COLLECTING: reverted WrongLifecycle; sealed before date: reverted RuleNotSatisfied (The release rule is not true yet: Release date has not arrived.) |
| ADV-4 | Submit a receipt before eligibility | Revert | ✅ status reverted, EligibilityNotRecorded: Release eligibility has not been recorded on-chain yet. |
| ADV-5 | Serve modified ciphertext | Client detects commitment mismatch | ✅ reveal with modified ciphertext refused: Commitment mismatch for ciphertext: expected a07adfba4b5d373 \| Commitment mismatch for ciphertext: expected ba46d18249a47a7. Upload through tampering storage blocked before any transaction: Commitment mismatch for ciphertext (read-back): expected feb836ea5c274250300c0a2be631411e5 |
| ADV-6 | Point verifier at a false server response | Verifier derives state from chain and reports the actual state | ✅ claimed RELEASED; chain-derived RELEASE_ELIGIBLE; claim rejected: claimed lifecycle RELEASED, chain says RELEASE_ELIGIBLE; claimed 2 receipts, chain has 1; claimed released=true, chain says RELEASE_ELIGIBLE |
| ADV-7 | Withhold one relayer receipt | State remains RELEASE_UNAVAILABLE, not RELEASED | ✅ lifecycle RELEASE_ELIGIBLE; receipts 1/2; delivery {"kind":"RELEASE_UNAVAILABLE","receipts":1,"threshold":2,"missing":1}; member reveal: Release unavailable: 1 of 2 key shares delivered \| Release unavailable: 1 of 2 key shares delivered |

Control: circle 1 RELEASED with 2 receipts; member opened 2/2 contributions.
