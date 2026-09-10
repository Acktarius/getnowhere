## 1. Delete wallet resets biometric flags

- [x] 1.1 Add failing test: `deleteWalletData` keeps theme but sets both biometric flags false in `gnh.settings` / settings store
- [x] 1.2 Implement flag reset in `deleteWalletData` after enrollment clear; make test pass
- [x] 1.3 Confirm `resetAppData` still removes full `gnh.settings` (existing test)

## 2. Stale-flag reconcile safety net

- [x] 2.1 Add failing unit tests for reconcile: flag on + missing enrollment → flags off; flag on + enrollment present → unchanged
- [x] 2.2 Implement reconcile helper (app-access + data-unlock flags vs enrollment presence)
- [x] 2.3 Wire reconcile before App Lock gate on mobile boot / ready path; make tests pass

## 3. Docs

- [x] 3.1 Document delete-wallet biometric flag reset + stale-flag self-heal in `docs/features/app-access-and-data-unlock.md`
