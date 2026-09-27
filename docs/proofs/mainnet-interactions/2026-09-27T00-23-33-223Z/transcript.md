# Mainnet interaction check · 2026-09-27T00-23-33-223Z

Registry 0xb565bd5875ae429f2ebca9e69e202407021c6d62 on BOT Chain mainnet (chain 677). **Three team test wallets controlled by the Relay project** — listed in `deployments/mainnet.developer-wallets.json`. This shows the product working on mainnet; it is not evidence of users.

| # | Wallet | Address | Action | Transaction |
|---|---|---|---|---|
| 1 | A | `0x4B8b679fa9c7dEA7451FeffF3A26220dA1F25D7e` | createCircle → Circle #3 | [0x42cba2c9…](https://scan.botchain.ai/tx/0x42cba2c91bfa51ed46eddc42326737a58104c15207393ae1771070c99a65f8a9) |
| 2 | A | `0x4B8b679fa9c7dEA7451FeffF3A26220dA1F25D7e` | openCircle (rule published) | [0xb82505d7…](https://scan.botchain.ai/tx/0xb82505d7167b350175f0e06b40a17a0f4f93f38936230898641bac4058eb5b0d) |
| 3 | A | `0x4B8b679fa9c7dEA7451FeffF3A26220dA1F25D7e` | issueInvitations (2 invite keys) | [0xf331f8be…](https://scan.botchain.ai/tx/0xf331f8bea5219633d23e3d049a84b64e7ea4d7252b2ba25345812721722736b5) |
| 4 | B | `0x442BfbF0eb7a057678a7d053e1703f2960DD114d` | acceptInvitation (joined as member 2) | [0xceb0a084…](https://scan.botchain.ai/tx/0xceb0a0843d710fe71f0b8d7f3839552add6ce77fb03aaa0f33764a96e8a3649f) |
| 5 | C | `0x61aB51EDcbCB36d1Dd65E721B2B9b1b25eb46b92` | acceptInvitation (joined as member 3) | [0x104da03e…](https://scan.botchain.ai/tx/0x104da03e35ecfdb32d15ecc1a3aadc15fa9cf65251dddd2a9cf2940ad5fa4392) |

Verifier: VALID, lifecycle AWAITING_CONSENT, 3 members. The rule expires at 2026-09-27T03:23:33.000Z; the Circle then reads EXPIRED with no further transactions.

**Result: PASSED**
