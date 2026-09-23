# @relay/sdk

Client library for Relay capsules on BOT Chain. Browser and Node 22+ (WebCrypto only).

```ts
import { createPublicClient, http } from "viem";
import { RelayReader, HttpBlobStore, openCapsuleFlow } from "@relay/sdk";

const reader = new RelayReader(createPublicClient({ transport: http(rpcUrl) }), registry, deploymentBlock);
const circle = await reader.getCircle(3n);          // lifecycle, rule, counts — straight from the chain
const events = await reader.circleEvents(3n);       // decoded, ordered, timestamped
```

| Area | Exports |
|---|---|
| Crypto | `aesEncrypt/aesDecrypt`, `eciesSeal/eciesOpen`, `generateEncryptionKeyPair`, `keyFingerprint`, `split/combine` (Shamir) |
| Capsules | `sealContribution`, `uploadContribution`, `fetchManifest`, `openRelayerShare`, `deliverShare`, `collectShares`, `openContribution` |
| Storage | `BlobStore`, `HttpBlobStore`, `MemoryBlobStore`, `getVerified`, `putVerified`, `CommitmentMismatchError` |
| Chain | `RelayReader`, `prepare(registry).*` (write preparation), `decodeRegistryLog`, `decodeRevert`, `describeError` |
| Flows | `createCircleFlow`, `issueInvitesFlow`, `acceptInviteFlow`, `consentFlow`, `contributeFlow`, `openCapsuleFlow` |
| Config | `probeRuntime` (→ `PROTOCOL_CONFIG_CHANGED`), `chainFromDeployment` |
| Rules | `hashPolicy`, `lifecycle`, `unmetCondition`, `deliveryStatus` (re-exported from `@relay/reference`) |

Reading chain state never touches Relay's servers. Storage reads are always hash-verified.
