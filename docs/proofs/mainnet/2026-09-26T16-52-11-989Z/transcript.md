# Relay proof run · BOT Chain mainnet · 2026-09-26T16-52-11-989Z

registry 0xb565bd5875ae429f2ebca9e69e202407021c6d62 on chain 677; creator 0xa7d755a07b520723b57E83Da2A1aD2cdD141Ad9f; member 0xCD8C2706Ac50D2Cc6970b9F35c20591766d9a08A

✓ 1. Circle created and rule published — 0x55b98cc257a37005b7de7166a71d08c52eadfd24b98355491e7b651537feb8f8
    circle 2; rule 0x2c1ee7af80921533464d5fdde3be67295ef6731e2765eea721f2721d35f62e28: sealAt 1790441773, releaseAt 1790442013, 2 contributions, unanimous consent, 2-of-3 receipts. Open tx 0x0bf775411c79b43e8044286405bbc4d366f5d8d5ad0f328784ddc7e57eb08532

✓ 2. Both members consented to the exact rule hash — 0x9d0fa6fbef2363ef6276bed685651c675eb6d5ea661bbb1ddcad67ca3ba93ec9
    invite issued 0x6c17ee15d559a3c154d7b2cc1209c87d6da576eccc37e4bd613ef41f15e55287; member joined 0x4391061f0259e9f4a8704d2e0f37c1be9b2e0f0d74a0bc593c2c9b838c6458fb; creator consent 0x58f9df51ed5d618259b5e93a8b7671daf4c2c365def30b790720afc99d967704; member consent 0x9d0fa6fbef2363ef6276bed685651c675eb6d5ea661bbb1ddcad67ca3ba93ec9

✓ 3. Encrypted contributions committed; plaintext absent from chain events and manifests — 0x34f6f31367dd5f9d280583ac46aee191957a34bd3a2b6bfbf404ede97302c328
    commitments 0x34431ddf07cd7ba812741fa5a80359babf664ef64a7fc60ddeb0dc1081b57665 (0x6bc80d98569784e4c3830b66c9dc229e6276d991235b7ac07614e7015fc9ae86), 0xb60971eab47da5869cb237163feb46ea4d20f7aec990a5074399f3e0bd574744 (0x34f6f31367dd5f9d280583ac46aee191957a34bd3a2b6bfbf404ede97302c328); scanned 18 registry logs for 4 plaintext needles: 0 found; manifests leak: false

✓ 4. Early release attempt — not run on mainnet
    A reverted transaction still spends gas; the mainnet run is funded at the measured minimum. The contract's rejection of an early release is evidenced on BOT Chain testnet (claim C-02, docs/proofs/testnet/2026-09-23T09-02-50-791Z) with the same runtime bytecode.

waiting 396s for chain time 1790442013

waiting 380s for chain time 1790442013

waiting 364s for chain time 1790442013

waiting 349s for chain time 1790442013

waiting 333s for chain time 1790442013

waiting 317s for chain time 1790442013

waiting 301s for chain time 1790442013

waiting 286s for chain time 1790442013

waiting 270s for chain time 1790442013

waiting 254s for chain time 1790442013

waiting 238s for chain time 1790442013

waiting 223s for chain time 1790442013

waiting 206s for chain time 1790442013

waiting 190s for chain time 1790442013

waiting 175s for chain time 1790442013

waiting 159s for chain time 1790442013

waiting 143s for chain time 1790442013

waiting 127s for chain time 1790442013

waiting 112s for chain time 1790442013

waiting 96s for chain time 1790442013

waiting 80s for chain time 1790442013

waiting 64s for chain time 1790442013

waiting 49s for chain time 1790442013

waiting 33s for chain time 1790442013

waiting 17s for chain time 1790442013

waiting 1s for chain time 1790442013

waiting for hosted relayers: lifecycle RELEASE_ELIGIBLE, receipts 0/2

waiting for hosted relayers: lifecycle RELEASED, receipts 2/2

✓ 5. Release eligibility recorded by a hosted relayer after the rule became true — 0xe59e9b40f763e43f01855a679b579381a313bac16545a766a9ba98bcc8ca88d6
    eligibility in block 24610146; releaseAt 1790442013

✓ 6. Relayer receipts recorded; the member decrypted every contribution — 0x5e0fb0df95f8c79bf7b47c742bfb3e7589b71971c31da0c959184a8f85b53811
    receipts 2/3 (threshold 2) in 0x5e0fb0df95f8c79bf7b47c742bfb3e7589b71971c31da0c959184a8f85b53811, 0x0d59588f03e628572c4e72100b41de2ad66ce8ee69242d50028bda3153f8b98b; lifecycle RELEASED; member opened: "Proof-run secret: meet at the old lighthouse, 5pm, bring the" | "image/png 70B"

✓ 7. Independent verifier replayed the chain
    verdict VALID; 14 events replayed; lifecycle RELEASED; bytecode matches true; cross-check true; deliveries 4/4 member×contribution shares, 4/4 member×contribution shares, –

**Result: PASSED** — BOT Chain mainnet
