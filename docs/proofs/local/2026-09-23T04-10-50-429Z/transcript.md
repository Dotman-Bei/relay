# Relay proof run · LOCAL FIXTURE · 2026-09-23T04-10-50-429Z

registry 0x5fbdb2315678afecb367f032d93f642f64180aa3 on chain 31337; creator 0x70997970C51812dc3A010C7d01b50e0d17dc79C8; member 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

✓ 1. Circle created and rule published — 0x8936a328721a1fca90617483230bad1eefdbacf84b6f4570f5aeae1e5c2db672
    circle 1; rule 0x85d956d49aa241fcfa0ae05923ac9db43e158413efa65a3332637f7010853b87: sealAt 1790137251, releaseAt 1790137851, 2 contributions, unanimous consent, 2-of-3 receipts. Open tx 0xc9daa630c5bf7f8816711f981114202944feedcaf9aec0ec92823b76cc01a459

✓ 2. Both members consented to the exact rule hash — 0x9c8e47d610926f35648cfd90d81a142056c0c8e6801dc4f8e693e6bfc59962f5
    invite issued 0x928cd64fb4a3961425eeb851e353af7f54dbe18b210120f769652e67035dd5bc; member joined 0x0c1caf2c400f611d41db69ef10d22edff44255f3142da650b0ed33e8696bf122; creator consent 0x38e2d92f01cb3084f74005c3b9029de5c0357823de4b2f5a304656da17a13f0d; member consent 0x9c8e47d610926f35648cfd90d81a142056c0c8e6801dc4f8e693e6bfc59962f5

✓ 3. Encrypted contributions committed; plaintext absent from chain events and manifests — 0xec844b3dc7bf959547366a530aa3bc7ddeeb14567157dc6524a234850c80f5e7
    commitments 0xb834944a49b8892232d1dfb3e004547799d0f4cea109eabb4ce8fa2dd00bf9a8 (0xaf708ca0ed9c97d5c8f2b0e0c92cf5498993cad852ed186718f89d23f08cf7a0), 0x8c69c6140b2b62be4c9776176629bfda6c550504345204670037af8a893552f8 (0xec844b3dc7bf959547366a530aa3bc7ddeeb14567157dc6524a234850c80f5e7); scanned 11 registry logs for 4 plaintext needles: 0 found; manifests leak: false

✓ 4. Early release attempt rejected by the contract — 0x072c598a9a46247a1aaf70b6a413e0f3f14ccd3f8fb64dfbc4a11f5d96caa1e8
    status reverted in block 17; decoded RuleNotSatisfied: The release rule is not true yet: Release date has not arrived.

✓ 5. Release eligibility recorded after the rule became true — 0xca8539815e4f7025d49b755aa9af5c78024e37c0691c777878a1565cabbfbe0b
    lifecycle RELEASE_ELIGIBLE; eligibleAt 1790137851 ≥ releaseAt 1790137851; receipts 0/2 → RELEASE_UNAVAILABLE until relayers deliver

✓ 6. Relayer receipts recorded; the member decrypted every contribution — 0xee60fa56e23c1dc4e35d0e0b5e61b912d2b2de78450df37216470061ddc50504
    receipts 3/3 (threshold 2) in 0xee60fa56e23c1dc4e35d0e0b5e61b912d2b2de78450df37216470061ddc50504, 0xe50d074f96344bbe6c1aba644478699045a18d434fe1ebd61224e7f9bafd007a, 0x1dc03311a7f3e0b773e3890a02fc38f200685edb973e7f3c1d46e8b7e3a3baee; lifecycle RELEASED; member opened: "Proof-run secret: meet at the old lighthouse, 5pm, bring the" | "image/png 70B"

✓ 7. Independent verifier replayed the chain
    verdict VALID; 15 events replayed; lifecycle RELEASED; bytecode matches true; cross-check true; deliveries 4/4 member×contribution shares, 4/4 member×contribution shares, 4/4 member×contribution shares

**Result: PASSED** — LOCAL FIXTURE. This is a LOCAL FIXTURE run on a development chain, not evidence of a BOT Chain deployment.
