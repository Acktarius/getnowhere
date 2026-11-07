## ADDED Requirements

### Requirement: Diagnostics sheet displays only truncated room id

The room diagnostics sheet (both the loading variant and the full variant in
`ChatRoomScreen`) SHALL display a truncated room id label — never the full raw
`roomId` hex string. The truncated label SHALL be short enough to let two peers
verbally compare which room they are discussing but SHALL NOT expose the full
capability value.

#### Scenario: Truncated room id is shown

- GIVEN the room diagnostics sheet is open
- WHEN a user reads the "Room id" row
- THEN they see a short label (e.g. `aabb…cd`) not the full hex string
- AND the full hex string does not appear anywhere in the visible sheet

### Requirement: CopyButton copies only the truncated room id

When a `CopyButton` is present in the diagnostics sheet for the room id, it
SHALL copy the **truncated** label, not the full `roomId`.

#### Scenario: Copied value is truncated

- GIVEN the room diagnostics sheet is open
- WHEN a user activates the copy button next to "Room id"
- THEN the clipboard receives the truncated label, not the full capability value

### Requirement: Topic ref is display-only and non-copyable

The discovery topic ref SHALL be displayed as a shortened excerpt
(`shortTopicRef`) inside a non-selectable element. No `CopyButton` or
`copySensitive` call SHALL target `discoveryTopicRef` or any full `topicRef`
value in the diagnostics sheet.

#### Scenario: Topic cannot be copied via the diagnostics sheet

- GIVEN the room diagnostics sheet is open and a topic ref is available
- WHEN a user inspects the "Topic" row
- THEN they see a shortened non-selectable label
- AND there is no copy button or text-selection affordance for the topic value

### Requirement: Full capability values do not enter sheet props or DOM

The component receiving the diagnostics sheet SHALL NOT pass a full `roomId` or
full `topicRef` as a prop, JSX child, or attribute that is rendered into the
DOM or placed in any copyable affordance.

#### Scenario: Source guard — sheet props carry truncated values

- GIVEN the diagnostics sheet component definition
- WHEN its call sites in `ChatRoomScreen` are reviewed
- THEN `CopyButton value` is bound to the output of `shortRoomId(…)` not to
  `displayRoom.id` or the raw `roomId` string directly
- AND `discoveryTopicRef` is not passed to any `CopyButton value` or
  `copySensitive` call

### Requirement: shortRoomId helper is deterministic and loss-free for identification

`shortRoomId` SHALL produce a stable truncated label from a hex room id such
that:

- The same input always yields the same output.
- The output is visibly distinct from identically truncated labels for other
  common room ids (i.e., it preserves leading and trailing characters).
- For the current 4-byte (8-hex) format, the output SHALL be no longer than
  the original.

#### Scenario: Consistent truncation

- GIVEN `roomId` is `"aabbccdd"`
- WHEN `shortRoomId("aabbccdd")` is called
- THEN the result is the same on every call
- AND it includes characters from both the start and end of the input
