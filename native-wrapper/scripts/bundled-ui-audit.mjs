#!/usr/bin/env node
/** Audit synced Vite bundle for mobile WebView XSS / external script loads. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const EXTERNAL_SCRIPT = /<script[^>]+src\s*=\s*["']https?:\/\//i;
const EXTERNAL_MODULE = /<script[^>]+type\s*=\s*["']module["'][^>]+src\s*=\s*["']https?:\/\//i;
const INLINE_EVAL = /\beval\s*\(/;

/**
 * @param {string} html
 * @returns {{ ok: true, warnings: string[] }}
 */
export function auditBundledUiHtml(html) {
  const warnings = [];

  if (EXTERNAL_SCRIPT.test(html) || EXTERNAL_MODULE.test(html)) {
    throw new Error("bundled UI index.html references an external script URL");
  }

  if (INLINE_EVAL.test(html)) {
    throw new Error("bundled UI index.html contains eval()");
  }

  const externalStyles = html.match(/<link[^>]+href\s*=\s*["']https?:\/\/[^"']+["']/gi);
  if (externalStyles?.length) {
    warnings.push(
      `external stylesheet links (${externalStyles.length}) — strip on mobile sync or bundle locally`,
    );
  }

  const localScripts = html.match(/<script[^>]+src\s*=\s*["'](?!https?:\/\/)[^"']+["']/gi);
  if (!localScripts?.length) {
    throw new Error("bundled UI index.html has no local script entry");
  }

  return { ok: true, warnings };
}

/** Strip Google Fonts and other remote stylesheet preloads from mobile asset HTML. */
export function stripExternalStylesheetLinks(html) {
  return html
    .split("\n")
    .filter((line) => !/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(line))
    .join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: node bundled-ui-audit.mjs <index.html>");
    process.exit(1);
  }
  const html = readFileSync(path, "utf8");
  const result = auditBundledUiHtml(html);
  for (const w of result.warnings) {
    console.warn(`[bundled-ui-audit] ${w}`);
  }
  console.log(`[bundled-ui-audit] OK ${path}`);
}
