# Send contact recipient picker

## Why

Sending CCX today requires pasting a Conceal address (and optional payment ID)
by hand. Contacts already store the counterpart address and `paymentIdTo` — the
ID to attach when sending so they can recognize the transfer. A contact picker
on the send sheet removes copy-paste friction and reduces wrong-PID mistakes.

## What Changes

- Add a contact dropdown on the Send CCX sheet above the address field.
- Each option is one line: alias leading, round letter-mark trailing
  (`[name …… icon]`).
- Round mark: multi-word alias → initials; single-word alias → up to first
  3 letters (uppercase).
- Selecting a contact fills the recipient CCX address; fills Payment ID from
  `paymentIdTo` when present, otherwise leaves Payment ID empty.
- Omit archived and blocked contacts; hide the dropdown when none are eligible.
- Manual address / Payment ID edits remain allowed after selection.

## Capabilities

- `lite-wallet`: send-sheet contact recipient picker, letter mark, autofill
  (delta: `specs/lite-wallet/spec.md`)

## Impact

UI in `SendSheet` + small pure helpers/tests for eligibility, sort, mark text,
and autofill. No spend/crypto or sync changes. Contact store is read-only here.
