# Delta for lite-wallet

## ADDED Requirements

### Requirement: Send sheet contact recipient picker
The Send CCX sheet SHALL offer a contact dropdown when the device has at least
one eligible contact (not archived, not blocked). Each option SHALL be a single
line with the contact alias and a trailing round letter mark.

#### Scenario: Dropdown lists contacts alphabetically with marks
- GIVEN contacts "Alice Wonder", "bob", and "Carol" (none archived/blocked)
- WHEN the user opens Send CCX
- THEN the Contact dropdown lists them A→Z by alias as one-line rows
- AND "Alice Wonder" shows mark `AW`
- AND "bob" shows mark `BOB` (up to 3 letters)
- AND "Carol" shows mark `CAR`

#### Scenario: Selection autofills address and PidTo
- GIVEN an eligible contact with `ccxAddress` and `paymentIdTo`
- WHEN the user selects that contact in the dropdown
- THEN the recipient address field is set to `ccxAddress`
- AND the Payment ID field is set to `paymentIdTo`

#### Scenario: Selection without PidTo fills address only
- GIVEN an eligible contact with `ccxAddress` and no `paymentIdTo`
- WHEN the user selects that contact
- THEN the recipient address field is set to `ccxAddress`
- AND the Payment ID field is left empty

#### Scenario: No eligible contacts hides the dropdown
- GIVEN every contact is archived or blocked, or there are no contacts
- WHEN the user opens Send CCX
- THEN the Contact dropdown is not shown
- AND address / Payment ID fields remain usable as today

#### Scenario: Archived and blocked contacts are omitted
- GIVEN a contact marked archived or blocked
- WHEN the Contact dropdown is rendered
- THEN that contact does not appear in the options
