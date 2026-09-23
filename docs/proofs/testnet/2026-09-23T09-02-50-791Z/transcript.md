# Relay proof run · BOT Chain testnet · 2026-09-23T09-02-50-791Z

registry 0x6f6e2c0fb44016d621e133612c61069de15cd710 on chain 968; creator 0xEFAc0ae9143fc09d98891cF9a280be1b97B6Fe7e; member 0x86e54F544534A24949e8E9CfD00DD69526b0C265

✓ 1. Circle created and rule published — 0x9225c231a2730e855f84494bea2584d514995673dad2bb241c94a37c7f4affa7
    circle 2; rule 0x132fcf0b7dc3b6e1bf01c7e04a7dd7a17500397d975fa8532b2bc3016c97009f: sealAt 1790154351, releaseAt 1790154531, 2 contributions, unanimous consent, 2-of-3 receipts. Open tx 0x5192fcecc3e07d684d8bace2226985e4bd09a18b0749b66271ed778302bec909

✓ 2. Both members consented to the exact rule hash — 0x8fc1bfd2b86e5f05c0824b6a79b593d0aecf7b64a2a66328278265e990d37bf2
    invite issued 0x7079a921ba34f06d46302edb828b8cca77558c812ecc93b5467ee109cfe31be3; member joined 0x95afedcf6c8583e4ebc2a5d189684fb65eac27aed661d04058e26e966a17a2b5; creator consent 0x5d070dfcb1d2933ede8abebd74de5814f724214cb83543cb5ed8f6f1a5c529f4; member consent 0x8fc1bfd2b86e5f05c0824b6a79b593d0aecf7b64a2a66328278265e990d37bf2

✓ 3. Encrypted contributions committed; plaintext absent from chain events and manifests — 0x2f3b312afe0bc5c9543d819ed1ef4fa181077ce71550acaf359af2a6443512bb
    commitments 0xd05c20465be09f460b77756d0bcecf5cc48e10462ba6b5388e4c7dd2cbaa2747 (0xfbf142b93d949b623cd4d2873ef6c1eee2766839c166a013c5719a491c76713b), 0xa9a0b4797d50ad10202e36a77d9d3845eedf6eed225ef1bbe0e5be4c393b883f (0x2f3b312afe0bc5c9543d819ed1ef4fa181077ce71550acaf359af2a6443512bb); scanned 12 registry logs for 4 plaintext needles: 0 found; manifests leak: false

waiting 97s for chain time 1790154351

waiting 82s for chain time 1790154351

waiting 66s for chain time 1790154351

waiting 50s for chain time 1790154351

waiting 34s for chain time 1790154351

waiting 19s for chain time 1790154351

waiting 3s for chain time 1790154351

✓ 4. Early release attempt rejected by the contract — 0x668fb38e49382bdebc9ca38fbf4a879519d1ef2dc547c83f067f5fd9ba9ea625
    status reverted in block 24393161; decoded RuleNotSatisfied: The release rule is not true yet: Release date has not arrived.

waiting 167s for chain time 1790154531

waiting 151s for chain time 1790154531

waiting 136s for chain time 1790154531

waiting 120s for chain time 1790154531

waiting 104s for chain time 1790154531

waiting 88s for chain time 1790154531

waiting 73s for chain time 1790154531

waiting 57s for chain time 1790154531

waiting 41s for chain time 1790154531

waiting 25s for chain time 1790154531

waiting 10s for chain time 1790154531

✓ 5. Release eligibility recorded after the rule became true — 0xc3d118e888699f7f5421d96777a86971559c9da4ef70e02a4cd0fc31e146f274
    lifecycle RELEASE_ELIGIBLE; eligibleAt 1790154535 ≥ releaseAt 1790154531; receipts 0/2 → RELEASE_UNAVAILABLE until relayers deliver

✓ 6. Relayer receipts recorded; the member decrypted every contribution — 0xc5de4823f0cbb6c475a71962a0f65fdbb32683301f4a5e832467114016ed1598
    receipts 3/3 (threshold 2) in 0xc5de4823f0cbb6c475a71962a0f65fdbb32683301f4a5e832467114016ed1598, 0xa94b754370eb2130804aa5b5fb4cae9564bfe6ab40d797b62c1742257dbc9294, 0xd147208db95436efbb9f724b43e598b8c17d6cddd6c285c72a46a6b01bf5d8a4; lifecycle RELEASED; member opened: "Proof-run secret: meet at the old lighthouse, 5pm, bring the" | "image/png 70B"

✓ 7. Independent verifier replayed the chain
    verdict VALID; 15 events replayed; lifecycle RELEASED; bytecode matches true; cross-check true; deliveries 4/4 member×contribution shares, 4/4 member×contribution shares, 4/4 member×contribution shares

**Result: PASSED** — BOT Chain testnet
