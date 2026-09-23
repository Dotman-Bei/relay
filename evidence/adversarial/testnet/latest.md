# Adversarial campaign — BOT Chain testnet

Run 2026-09-23T09-34-01-018Z against registry `0x6f6e2c0fb44016d621e133612c61069de15cd710` (chain 968).

| ID | Attempt | Expected | Observed |
|---|---|---|---|
| ADV-1 | Change the date after member consent | Revert | ✅ status reverted, RuleLocked: The rule is locked: another member has already consented to it.; stored rule is still the consented one |
| ADV-2 | Commit twice as one participant | Revert | ✅ status reverted, AlreadyContributed: You have already committed your contribution. One per member. |
| ADV-3 | Request release before the rule is true | Revert | ✅ while COLLECTING: reverted WrongLifecycle; sealed before date: reverted RuleNotSatisfied (The release rule is not true yet: Release date has not arrived.) |
| ADV-4 | Submit a receipt before eligibility | Revert | ✅ status reverted, EligibilityNotRecorded: Release eligibility has not been recorded on-chain yet. |
| ADV-5 | Serve modified ciphertext | Client detects commitment mismatch | ✅ reveal with modified ciphertext refused: Commitment mismatch for ciphertext: expected 7135c9bf30e1b06 \| Commitment mismatch for ciphertext: expected 662370f25bacc27. Upload through tampering storage blocked before any transaction: Commitment mismatch for ciphertext (read-back): expected 6c01d0306ef5afdea1474bbe3fb85f005 |
| ADV-6 | Point verifier at a false server response | Verifier derives state from chain and reports the actual state | ✅ claimed RELEASED; chain-derived RELEASE_ELIGIBLE; claim rejected: claimed lifecycle RELEASED, chain says RELEASE_ELIGIBLE; claimed 2 receipts, chain has 1; claimed released=true, chain says RELEASE_ELIGIBLE |
| ADV-7 | Withhold one relayer receipt | State remains RELEASE_UNAVAILABLE, not RELEASED | ✅ lifecycle RELEASE_ELIGIBLE; receipts 1/2; delivery {"kind":"RELEASE_UNAVAILABLE","receipts":1,"threshold":2,"missing":1}; member reveal: Release unavailable: 1 of 2 key shares delivered \| Release unavailable: 1 of 2 key shares delivered |

Control: circle 5 RELEASED with 2 receipts; member opened 2/2 contributions.
