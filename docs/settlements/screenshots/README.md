# Settlement receipt iOS comparison

Captured September 30, 2026 on iPhone 18 Pro, iOS 27.0.

- Before confirmation source: `270123ac0e1286a3953a4d97927f4bdb82787b83`, the `master` PR base.
- After confirmation source: this PR's `FriendSettlementConfirmation` and `SettlementReceipt` components.
- Both versions ran in the same local Expo SDK 57 debug native shell. These are original simulator PNGs, captured after the modal transition and receipt animation finished.
- The matched sample is a $24 USD payment to Priya clearing a $24 direct balance. A temporary local capture route rendered the real confirmation components and returned a synthetic commit receipt. It made no database writes and was removed after capture.
- These images compare the friend success confirmation. Group settlements reuse the same receipt component inside the group success modal.
- The development preview and temporary capture route are not included in this PR.

| Appearance | Before | After |
| --- | --- | --- |
| Light | [Before](ios/before-settlement-light.png) | [After](ios/after-settlement-light.png) |
| Dark | [Before](ios/before-settlement-dark.png) | [After](ios/after-settlement-dark.png) |

The receipt arrives in 280 ms, the stamp lands at 400 ms, and a small paper compression releases by 630 ms. A single success haptic accompanies the stamp landing. Reduced motion and reused receipts show the completed receipt without movement; reused receipts also skip haptics. Physical-device haptic feel and Android visual verification remain outstanding.
