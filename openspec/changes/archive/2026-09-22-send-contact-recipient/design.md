# Design — send contact recipient picker

## Context

`SendSheet` collects recipient address, amount, and optional payment ID.
`Contact.paymentIdTo` is the ID to use when sending TO them. Existing
`.row__avatar` / `initials()` use 2 letters for single names; this picker
needs up to 3 for single-word aliases.

## Decisions

1. **Custom dropdown** — button shows selected alias + mark (or placeholder);
   panel lists one-line rows `[alias …… round mark]`. Native `<select>` cannot
   render the round icon.
2. **Letter mark** — `contactLetterMark(alias)`:
   - split on whitespace; if ≥2 words → first char of first + first char of
     last, uppercased
   - if 1 word → first 1–3 chars, uppercased
   - empty → `?`
3. **Autofill** — address from `ccxAddress`; Payment ID from `paymentIdTo`
   when set, else empty.
4. **Eligibility** — skip archived/blocked; sort alias A→Z case-insensitive.
5. **Empty list** — hide Contact control when no eligible contacts.
6. **Reuse** — prefer a compact mark via existing `.row__avatar` (smaller size
   in the row) or a scoped class; keep mark helper separate from `initials()`
   unless we explicitly unify later.

## Risks

- Custom list needs click-outside / Escape to close — keep minimal.
- Re-select overwrites manual edits — intentional.

## Testing

- Unit tests for `contactLetterMark`, eligibility/sort, autofill payload.
- Manual: Send sheet with 0 / N contacts; single- vs multi-word aliases.
