import { createElement, Fragment, type ReactNode } from "react";
import { MarkdownFencedCode } from "@/components/MarkdownFencedCode";

const BULLET_PREFIX = "  * ";
const FENCE_RE = /```(?:[^\n`]*\n)?([\s\S]*?)```/g;

type MarkdownSegment =
  | { kind: "text"; value: string }
  | { kind: "fencedCode"; value: string };

/** Inline `  ` → `\n`; preserve the `  ` inside `  * ` bullet markers. */
function expandInlineHardBreaks(text: string): string {
  return text.replace(/ {2}(?!\* )/g, "\n").replace(/\n{2,}/g, "\n");
}

function trimFenceBody(body: string): string {
  return body.replace(/^\n/, "").replace(/\n$/, "");
}

export function splitFencedCode(text: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  let last = 0;
  FENCE_RE.lastIndex = 0;
  for (const match of text.matchAll(FENCE_RE)) {
    const index = match.index ?? 0;
    if (index > last) {
      segments.push({ kind: "text", value: text.slice(last, index) });
    }
    segments.push({
      kind: "fencedCode",
      value: trimFenceBody(match[1] ?? ""),
    });
    last = index + match[0].length;
  }
  if (last < text.length) {
    segments.push({ kind: "text", value: text.slice(last) });
  }
  return segments.length > 0 ? segments : [{ kind: "text", value: text }];
}

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

function isBulletLine(line: string): boolean {
  if (!line) return false;
  return line.startsWith(BULLET_PREFIX) || line.split(BULLET_PREFIX)[0] === "";
}

function parseBlockLines(text: string): BlockLine[] {
  const rawLines = expandInlineHardBreaks(text).split("\n");
  const lines: BlockLine[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i] ?? "";

    const segments = line.split(BULLET_PREFIX);
    if (segments.length === 1) {
      if (line.length === 0 && i === rawLines.length - 1) continue;
      lines.push({
        kind: "text",
        segment: line,
        hardBreak: i < rawLines.length - 1,
      });
      continue;
    }

    const lead = segments[0] ?? "";
    if (lead.length > 0) {
      lines.push({ kind: "text", segment: lead, hardBreak: true });
    }
    for (let j = 1; j < segments.length; j++) {
      lines.push({ kind: "bullet", segment: segments[j] ?? "" });
    }

    if (i < rawLines.length - 1) {
      const next = rawLines[i + 1] ?? "";
      if (!isBulletLine(next) && lines.at(-1)?.kind === "bullet") {
        lines.push({ kind: "text", segment: "", hardBreak: true });
      }
    }
  }

  return lines;
}

function fencedCodeToHtml(code: string): string {
  return `<pre class="md-fence"><code>${escapeHtml(code)}</code></pre>`;
}

function textMarkdownToHtml(text: string): string {
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

/** Same structure as render path; stable for unit tests. */
export function markdownLiteToHtml(text: string): string {
  return splitFencedCode(text)
    .map((seg) =>
      seg.kind === "fencedCode"
        ? fencedCodeToHtml(seg.value)
        : textMarkdownToHtml(seg.value),
    )
    .join("");
}

function textMarkdownToReact(text: string, keySeed: number): ReactNode[] {
  const lines = parseBlockLines(text);
  const nodes: ReactNode[] = [];
  let bulletBuf: ReactNode[] = [];
  let key = keySeed;

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
  return nodes;
}

/** L2 live chat subset: bold, italic, strike, code, line breaks, bullets, fences. */
export function renderMarkdownLite(text: string): ReactNode {
  const segments = splitFencedCode(text);
  const nodes: ReactNode[] = [];
  let key = 0;

  for (const seg of segments) {
    if (seg.kind === "fencedCode") {
      nodes.push(
        createElement(MarkdownFencedCode, {
          key: `fence-${key++}`,
          code: seg.value,
        }),
      );
      continue;
    }
    nodes.push(...textMarkdownToReact(seg.value, key));
    key += 100;
  }

  if (nodes.length === 1) return nodes[0] as ReactNode;
  return createElement(Fragment, null, ...nodes);
}
