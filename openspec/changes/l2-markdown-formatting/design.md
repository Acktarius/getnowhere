# Design — L2 markdown-lite rendering

## Context

- `ChatMessage.channel`: `live` = Holepunch L2, `relay` = L1 chain fallback.
- `MessageBubble` today renders `message.text` as a plain string.
- Composer is a plain `<textarea>` — unchanged.

## Approach

Regex tokenizer (no new dependency). Two layers:

1. **Block** — split on `\n`; detect GitHub hard breaks (two trailing spaces) and
   bullet lines (`  * ` prefix).
2. **Inline** — within each text segment, apply in order: `` `code` ``, `**bold**`,
   `~~strike~~`, `*italic*`. Code spans are extracted first so inner markers stay literal.

HTML in user text is escaped before wrapping in semantic tags (`strong`, `em`, `del`,
`code`, `br`, `ul`/`li`).

## API

```ts
/** UI-only; wire text stays raw. */
export function renderMarkdownLite(text: string): React.ReactNode;
/** Test helper: same output as HTML string (escaped text + tags). */
export function markdownLiteToHtml(text: string): string;
```

## UI rules

| Surface | Behavior |
| -------- | -------- |
| Composer | Plain text always |
| Out bubble, `channel === "live"` | Rendered |
| In bubble, `channel === "live"` | Rendered |
| Relay (`channel === "relay"`) | Plain (SMS-class) |
| Edit mode | Plain `message.text` in input |

Legacy rows without `channel` default to live rendering (same as accent bubble today).

## Non-goals

- Full CommonMark / GFM (links, headings, nested lists, code fences).
- Formatting on L1 relay or protocol changes.
- Composer preview while typing.

## Testing

Vitest unit tests on `markdownLiteToHtml` for each marker, escaping, line breaks,
bullets, and unclosed delimiters left literal.
