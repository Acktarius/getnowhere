# L2 live chat markdown formatting

## Why

Live (L2 Holepunch) messages are plain text today. Users expect lightweight
formatting (bold, lists, line breaks) in direct P2P chat without pulling in a
full markdown parser or changing the wire format.

## What Changes

- Add a small regex-based `markdownLite` renderer for UI display only.
- Render formatted bubbles when `message.channel` is `live` (L2); L1 relay stays plain.
- Composer stays plain while typing; sent and received live bubbles render markup.
- Wire/storage unchanged — raw markdown text is sent and persisted.

## Capabilities

### New Capabilities

- `chat-markdown-lite`: subset markdown rendering for L2 live chat bubbles.

### Modified Capabilities

(none)

## Impact

- `src/utils/markdownLite.tsx` (new)
- `src/components/MessageBubble.tsx` (render path)
- `tests/utils/markdown-lite.test.ts` (new)
- No protocol, crypto, or sidecar changes.
