# Tasks

## 1. Helpers + tests
- [x] 1.1 Add pure helpers (e.g. `src/lib/send-contact-recipient.ts`):
  eligible/sort list, `contactLetterMark(alias)`, autofill
  `{ address, paymentId? }`. Vitest: sort, archived/blocked skip, PidTo
  present/absent, multi-word initials, single-word ≤3 letters.
- [x] 1.2 Fail-first then implement helpers until tests pass.

## 2. SendSheet UI
- [x] 2.1 Custom Contact dropdown above address in `SendSheet` when options
  exist: one-line rows `[alias …… round mark]`; placeholder when none
  selected; on pick apply autofill.
- [x] 2.2 Close on outside click / Escape; keep QR + manual edit; re-select
  overwrites address/PID. Manual smoke on Send.

## 3. Docs (light)
- [x] 3.1 Note contact picker + PidTo autofill + letter mark in
  `docs/features/lite-wallet.md` send section.
