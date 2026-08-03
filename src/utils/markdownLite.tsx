import { createElement, Fragment, type ReactNode } from "react";

const BULLET_PREFIX = "  * ";
const HARD_BREAK_SUFFIX = "  ";

/** Escape HTML metacharacters in user text. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type InlineToken =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "strike"; value: string }
  | { kind: "italic"; value: string };

const INLINE_RE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|~~[^~\n]+~~|\*[^*\n]+\*)/g;

function tokenizeInline(segment: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let last = 0;
  for (const match of segment.matchAll(INLINE_RE)) {
    const index = match.index ?? 0;
    if (index > last) {
      tokens.push({ kind: "text", value: segment.slice(last, index) });
    }
    const raw = match[0];
    if (raw.startsWith("`")) {
      tokens.push({ kind: "code", value: raw.slice(1, -1) });
    } else if (raw.startsWith("**")) {
      tokens.push({ kind: "bold", value: raw.slice(2, -2) });
    } else if (raw.startsWith("~~")) {
      tokens.push({ kind: "strike", value: raw.slice(2, -2) });
    } else if (raw.startsWith("*")) {
      tokens.push({ kind: "italic", value: raw.slice(1, -1) });
    }
    last = index + raw.length;
  }
  if (last < segment.length) {
    tokens.push({ kind: "text", value: segment.slice(last) });
  }
  return tokens;
}

function inlineTokenToHtml(token: InlineToken): string {
  const inner = escapeHtml(token.value);
  switch (token.kind) {
    case "text":
      return inner;
    case "code":
      return `<code>${inner}</code>`;
    case "bold":
      return `<strong>${inner}</strong>`;
    case "strike":
      return `<del>${inner}</del>`;
    case "italic":
      return `<em>${inner}</em>`;
  }
}

function formatInlineHtml(segment: string): string {
  return tokenizeInline(segment).map(inlineTokenToHtml).join("");
}

function inlineTokenToReact(token: InlineToken, key: string): ReactNode {
  const child = token.value;
  switch (token.kind) {
    case "text":
      return child;
    case "code":
      return createElement("code", { key }, child);
    case "bold":
      return createElement("strong", { key }, child);
    case "strike":
      return createElement("del", { key }, child);
    case "italic":
      return createElement("em", { key }, child);
  }
}

function formatInlineReact(segment: string, keyPrefix: string): ReactNode[] {
  return tokenizeInline(segment).map((t, i) =>
    inlineTokenToReact(t, `${keyPrefix}-i${i}`),
  );
}

type BlockLine =
  | { kind: "text"; segment: string; hardBreak: boolean }
  | { kind: "bullet"; segment: string };

function parseBlockLines(text: string): BlockLine[] {
  const rawLines = text.split("\n");
  const lines: BlockLine[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i] ?? "";
    const hardBreak = line.endsWith(HARD_BREAK_SUFFIX);
    if (hardBreak) line = line.slice(0, -HARD_BREAK_SUFFIX.length);
    if (line.startsWith(BULLET_PREFIX)) {
      lines.push({
        kind: "bullet",
        segment: line.slice(BULLET_PREFIX.length),
      });
    } else {
      lines.push({
        kind: "text",
        segment: line,
        hardBreak: hardBreak || i < rawLines.length - 1,
      });
    }
  }
  return lines;
}

/** Same structure as render path; stable for unit tests. */
export function markdownLiteToHtml(text: string): string {
  const lines = parseBlockLines(text);
  let out = "";
  let bulletBuf: string[] = [];

  function flushBullets() {
    if (bulletBuf.length === 0) return;
    out += `<ul>${bulletBuf.map((h) => `<li>${h}</li>`).join("")}</ul>`;
    bulletBuf = [];
  }

  for (const line of lines) {
    if (line.kind === "bullet") {
      bulletBuf.push(formatInlineHtml(line.segment));
      continue;
    }
    flushBullets();
    out += formatInlineHtml(line.segment);
    if (line.hardBreak) out += "<br />";
  }
  flushBullets();
  return out;
}

/** L2 live chat subset: bold, italic, strike, code, line breaks, bullets. */
export function renderMarkdownLite(text: string): ReactNode {
  const lines = parseBlockLines(text);
  const nodes: ReactNode[] = [];
  let bulletBuf: ReactNode[] = [];
  let key = 0;

  function flushBullets() {
    if (bulletBuf.length === 0) return;
    nodes.push(
      createElement(
        "ul",
        { key: `ul-${key++}`, style: { margin: "4px 0", paddingLeft: 18 } },
        ...bulletBuf,
      ),
    );
    bulletBuf = [];
  }

  for (const line of lines) {
    if (line.kind === "bullet") {
      bulletBuf.push(
        createElement(
          "li",
          { key: `li-${key++}` },
          ...formatInlineReact(line.segment, `b${key}`),
        ),
      );
      continue;
    }
    flushBullets();
    nodes.push(...formatInlineReact(line.segment, `t${key}`));
    if (line.hardBreak) {
      nodes.push(createElement("br", { key: `br-${key++}` }));
    }
  }
  flushBullets();

  if (nodes.length === 1) return nodes[0] as ReactNode;
  return createElement(Fragment, null, ...nodes);
}
