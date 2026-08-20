import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  auditBundledUiHtml,
  stripExternalStylesheetLinks,
} from "../../native-wrapper/scripts/bundled-ui-audit.mjs";

describe("bundled mobile UI audit", () => {
  it("rejects external script URLs", () => {
    expect(() =>
      auditBundledUiHtml(
        '<html><script src="https://evil.example/pwn.js"></script></html>',
      ),
    ).toThrow(/external script/);
  });

  it("accepts local module entry only", () => {
    const html = `<!doctype html>
<html><head>
<script type="module" src="./assets/index-abc.js"></script>
<link href="https://fonts.googleapis.com/css" rel="stylesheet">
</head><body></body></html>`;
    const result = auditBundledUiHtml(html);
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("stripExternalStylesheetLinks removes Google Fonts", () => {
    const input = `<link href="https://fonts.googleapis.com/css" rel="stylesheet" />
<link rel="stylesheet" href="./assets/index.css">`;
    const out = stripExternalStylesheetLinks(input);
    expect(out).not.toMatch(/googleapis/);
    expect(out).toMatch(/index\.css/);
  });

  it("synced assets/ui/index.html passes audit when present", () => {
    const indexPath = join(
      process.cwd(),
      "native-wrapper/assets/ui/index.html",
    );
    try {
      const html = readFileSync(indexPath, "utf8");
      expect(() => auditBundledUiHtml(html)).not.toThrow();
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return;
      }
      throw err;
    }
  });
});
