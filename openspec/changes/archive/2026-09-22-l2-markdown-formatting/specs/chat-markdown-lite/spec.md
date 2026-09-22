# chat-markdown-lite

## Purpose

Lightweight markdown rendering for L2 live chat message bubbles (display only).

## Requirements

### Requirement: Live bubbles render markdown-lite

When a chat message has `channel` `live` (or omitted, treated as live), the UI
SHALL render `text` through the markdown-lite formatter. Relay messages SHALL
display plain text unchanged.

#### Scenario: Outbound live message shows formatting

- GIVEN the room is Holepunch-connected and the user sends `**hi**`
- WHEN the outbound bubble appears
- THEN the bubble shows bold "hi"
- AND the composer showed plain `**hi**` while typing

#### Scenario: Inbound live message shows formatting

- GIVEN a peer sends `*emphasis*` over L2 live
- WHEN the inbound bubble renders
- THEN the text appears italic

#### Scenario: Relay message stays plain

- GIVEN a message with `channel` `relay` and text `**bold**`
- WHEN the bubble renders
- THEN the literal string `**bold**` is shown

### Requirement: Supported markdown-lite syntax

The formatter SHALL support, at minimum:

| Input | Output |
| ----- | ------ |
| `**text**` | bold |
| `*text*` | italic |
| `~~text~~` | strikethrough |
| `` `text` `` | inline code |
| line ending with two spaces + newline | line break |
| line starting with `  * ` | bullet list item |

Unclosed delimiters SHALL remain visible as literal characters.

#### Scenario: GitHub line break

- GIVEN text `line one  \nline two`
- WHEN rendered
- THEN "line one" and "line two" appear on separate lines

#### Scenario: Bullet line

- GIVEN text `  * first item`
- WHEN rendered
- THEN the line appears as a bulleted list item

### Requirement: Safe rendering

User-supplied text SHALL be HTML-escaped before inline tags are applied. The
formatter SHALL NOT use `dangerouslySetInnerHTML` with unescaped user content.

#### Scenario: HTML in message is escaped

- GIVEN text `<script>alert(1)</script>`
- WHEN rendered
- THEN angle brackets are escaped and no script runs

### Requirement: Wire format unchanged

Send and storage paths SHALL continue to carry raw markdown text with no
server-side or transport transformation.

#### Scenario: Stored text is raw

- GIVEN a user sends `**hello**` on L2
- WHEN the message is persisted or reloaded
- THEN `text` equals `**hello**`
