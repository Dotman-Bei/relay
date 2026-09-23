# Relay proof run · LOCAL FIXTURE · 2026-09-23T04-14-14-508Z

registry 0x5fbdb2315678afecb367f032d93f642f64180aa3 on chain 31337; creator 0x70997970C51812dc3A010C7d01b50e0d17dc79C8; member 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

✓ 1. Circle created and rule published — 0xa7a97c2cd586f14182c9e360dfe583553a9c1afc2b770b553f10d18ec39ee15b
    circle 1; rule 0x69d390d4c20755ed95e48cbb75d089579a2030750a501c6c66c26bbb65b850bc: sealAt 1790137455, releaseAt 1790138055, 2 contributions, unanimous consent, 2-of-3 receipts. Open tx 0xc9daa630c5bf7f8816711f981114202944feedcaf9aec0ec92823b76cc01a459

✓ 2. Both members consented to the exact rule hash — 0x844e946218849e248d33dfb0c2313228b7b9ecf6349430b8b37a9e7e4bb1fe3e
    invite issued 0x707517a393eaa8afbf60109e03c4f6042b240aa76e8c4ffaf76702a10bc8350b; member joined 0xfd7602fa4796faa87307a75e9d42ff257d0de7a3220f58464610fd938c988ced; creator consent 0xb6fcf06fac2cee7e5ccda80d4f76cb9262d0bea9653fa4de86a879a009c9611d; member consent 0x844e946218849e248d33dfb0c2313228b7b9ecf6349430b8b37a9e7e4bb1fe3e

✓ 3. Encrypted contributions committed; plaintext absent from chain events and manifests — 0x4041e3bdd3dcbc50bc5736030f5e5b9fa8dc03ceb57a1bbf561b452bdfc81f77
    commitments 0xaa68a9c7eafd7821e6fa4035fae1335da467d9d333e8c12da92dd5fe352a2f2b (0xda0cd2d357145c6d6115e5db10000fb78be2ee7f73f244f16f4a30947847900a), 0x0ccc7a41dff389ca31933aec48abc51cf5739ee0b425cf6c35f56f5af0482d17 (0x4041e3bdd3dcbc50bc5736030f5e5b9fa8dc03ceb57a1bbf561b452bdfc81f77); scanned 11 registry logs for 4 plaintext needles: 0 found; manifests leak: false

✓ 4. Early release attempt rejected by the contract — 0x7216672396c02ab4b92d617e0a847edf392bc197c9c340494395dbeeefd931ea
    status reverted in block 17; decoded RuleNotSatisfied: The release rule is not true yet: Release date has not arrived.

✓ 5. Release eligibility recorded after the rule became true — 0x4c27e1405eb3b986448246c8f8012e6a11bb8d36eb10f318a56026452866b05e
    lifecycle RELEASE_ELIGIBLE; eligibleAt 1790138055 ≥ releaseAt 1790138055; receipts 0/2 → RELEASE_UNAVAILABLE until relayers deliver

✓ 6. Relayer receipts recorded; the member decrypted every contribution — 0x789552e7420968da6bb3994cd399f07e3417c1edf720ab80b4cb07c452b0dfd3
    receipts 3/3 (threshold 2) in 0x789552e7420968da6bb3994cd399f07e3417c1edf720ab80b4cb07c452b0dfd3, 0xbd40f3a57e999000366cb160fe3fef3f8326d86527e746a5bba55af6bc9f8bd8, 0x4b64b65a2af139fe73bc9bd8e2a2b0a8cf00099d8104a76bcc034a3dbeb0157f; lifecycle RELEASED; member opened: "Proof-run secret: meet at the old lighthouse, 5pm, bring the" | "image/png 70B"

✓ 7. Independent verifier replayed the chain
    verdict VALID; 15 events replayed; lifecycle RELEASED; bytecode matches true; cross-check true; deliveries 4/4 member×contribution shares, 4/4 member×contribution shares, 4/4 member×contribution shares

**Result: PASSED** — LOCAL FIXTURE. This is a LOCAL FIXTURE run on a development chain, not evidence of a BOT Chain deployment.
