# Tasks — l2-markdown-formatting

## 1. Markdown-lite utility

- [x] 1.1 Add `tests/utils/markdown-lite.test.ts` covering syntax, escapes, line breaks, bullets
- [x] 1.2 Implement `src/utils/markdownLite.tsx` (`renderMarkdownLite`, `markdownLiteToHtml`)

## 2. UI integration

- [x] 2.1 Wire `MessageBubble` to render live messages via `renderMarkdownLite`; relay plain
- [x] 2.2 Keep edit composer on raw `message.text`

## 3. Verify

- [x] 3.1 Run `npm test -- tests/utils/markdown-lite.test.ts` and `npm run types`
