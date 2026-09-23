# Relay proof run · LOCAL FIXTURE · 2026-09-22T23-19-33-765Z

registry 0x5fbdb2315678afecb367f032d93f642f64180aa3 on chain 31337; creator 0x70997970C51812dc3A010C7d01b50e0d17dc79C8; member 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

✓ 1. Circle created and rule published — 0x8856e36953a2fb0346461d2ccae6ff8f614b44b79716aed60fc3b0af24ccfda2
    circle 1; rule 0x0619d1774f78797b4ce34b1b25dfb550d3ba31c9c5ed76c3455396bb2f2c921d: sealAt 1790119774, releaseAt 1790120374, 2 contributions, unanimous consent, 2-of-3 receipts. Open tx 0x9108614e9f882484e434407c650f05bd1ed4a3338e8c9206fea7d25863c6cd4a

✓ 2. Both members consented to the exact rule hash — 0x3845a2bc272bc2a9266e6d1fae775a149c0d06d335eb26720ef51dbb8b9fc96b
    invite issued 0xb950cb6f468a9a0357bfd3d84eab1a903b0ac7e9fcef3c4e71dee324ab547187; member joined 0xc9ad0a0fa131086daeef7168133950cebf05821580c29b84c5d86bfdcb789384; creator consent 0xcf2ce4d873459824274f431b424ed723fb91dacf54305bb098d6291f1cf21cc1; member consent 0x3845a2bc272bc2a9266e6d1fae775a149c0d06d335eb26720ef51dbb8b9fc96b

✓ 3. Encrypted contributions committed; plaintext absent from chain events and manifests — 0xd7f8795762deb16c40ecc2f3381a6d42bfd515767d0098c856f759d0512e2762
    commitments 0xd82a9baead1e588ec0d0f0f11598fd1b8d4d819667a631021fa50da1da26869c (0x023360d5b8beb86ce16edf820d65986cd5596754a4e2f77ec747ca17ffc56a6f), 0xb12e197365e52add00c008e612ba32c1528ced071d9817668c8ea4a7463cd852 (0xd7f8795762deb16c40ecc2f3381a6d42bfd515767d0098c856f759d0512e2762); scanned 11 registry logs for 4 plaintext needles: 0 found; manifests leak: false

✓ 4. Early release attempt rejected by the contract — 0xe394b5d7661de17b31fa77452a05e893f8d72bb41f3d04493f463710c1c09d46
    status reverted in block 17; decoded RuleNotSatisfied: The release rule is not true yet: Release date has not arrived.

✓ 5. Release eligibility recorded after the rule became true — 0x2b3439a911a04778ce82cdbcb768fc2ec2569315c2d34caa4f92d07d689df4e1
    lifecycle RELEASE_ELIGIBLE; eligibleAt 1790120374 ≥ releaseAt 1790120374; receipts 0/2 → RELEASE_UNAVAILABLE until relayers deliver

✓ 6. Relayer receipts recorded; the member decrypted every contribution — 0x8dc0eea7a98fdd35b662649fa7747ede86fe79215605f92ad9a8fece85a9f79e
    receipts 3/3 (threshold 2) in 0x8dc0eea7a98fdd35b662649fa7747ede86fe79215605f92ad9a8fece85a9f79e, 0x5ea7c17a67e664739f18ee97a1f28519ed9794641d1dbf9b5a8cbda2149f8ef8, 0x26d85e2d1f41a389192d362dbe5fc5791d53be6c6b62f8d4ba03e3dc4218eede; lifecycle RELEASED; member opened: "Proof-run secret: meet at the old lighthouse, 5pm, bring the" | "image/png 70B"

✓ 7. Independent verifier replayed the chain
    verdict VALID; 15 events replayed; lifecycle RELEASED; bytecode matches true; cross-check true; deliveries 4/4 member×contribution shares, 4/4 member×contribution shares, 4/4 member×contribution shares

**Result: PASSED** — LOCAL FIXTURE. This is a LOCAL FIXTURE run on a development chain, not evidence of a BOT Chain deployment.
