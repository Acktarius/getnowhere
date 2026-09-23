/**
 * UI origin allowlist (SEC-2026-022).
 * @see docs/architecture/electron-desktop.md
 */

import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import {
  isAllowedUiUrl,
  isLoopbackHostname,
  uiPolicyFromTarget,
} from "../ui-navigation.mjs";

const indexHtml = "/tmp/gnh-ui/index.html";
const filePolicy = uiPolicyFromTarget({ kind: "file", value: indexHtml });
const vitePolicy = uiPolicyFromTarget({
  kind: "url",
  value: "http://127.0.0.1:5173",
});

describe("uiPolicyFromTarget", () => {
  it("accepts packaged file UI and Vite loopback", () => {
    assert.equal(filePolicy.kind, "file");
    assert.equal(filePolicy.dirPath, dirname(indexHtml));
    assert.equal(vitePolicy.kind, "http");
    assert.equal(vitePolicy.origin, "http://127.0.0.1:5173");
  });

  it("accepts a file:// GNH_UI_URL override", () => {
    const policy = uiPolicyFromTarget({
      kind: "url",
      value: pathToFileURL(indexHtml).href,
    });
    assert.equal(policy.kind, "file");
    assert.equal(policy.dirPath, dirname(indexHtml));
  });

  it("rejects a remote http override", () => {
    assert.throws(
      () =>
        uiPolicyFromTarget({
          kind: "url",
          value: "https://evil.example/ui",
        }),
      /loopback|local file/,
    );
  });

  it("rejects localhost (DNS rebinding) even on port 5173", () => {
    assert.throws(() =>
      uiPolicyFromTarget({
        kind: "url",
        value: "http://localhost:5173",
      }),
    );
  });
});

describe("isAllowedUiUrl", () => {
  it("allows the Vite origin including hash routes", () => {
    assert.equal(isAllowedUiUrl("http://127.0.0.1:5173/", vitePolicy), true);
    assert.equal(
      isAllowedUiUrl("http://127.0.0.1:5173/#/chats", vitePolicy),
      true,
    );
  });

  it("denies another host or port", () => {
    assert.equal(isAllowedUiUrl("http://127.0.0.1:4173/", vitePolicy), false);
    assert.equal(isAllowedUiUrl("https://evil.example/", vitePolicy), false);
    assert.equal(isAllowedUiUrl("http://localhost:5173/", vitePolicy), false);
  });

  it("allows the packaged index and same-dir assets", () => {
    assert.equal(isAllowedUiUrl(pathToFileURL(indexHtml).href, filePolicy), true);
    assert.equal(
      isAllowedUiUrl(pathToFileURL(join(dirname(indexHtml), "assets/app.js")).href, filePolicy),
      true,
    );
    assert.equal(
      isAllowedUiUrl(`${pathToFileURL(indexHtml).href}#/chats`, filePolicy),
      true,
    );
  });

  it("denies a file outside the UI directory", () => {
    assert.equal(isAllowedUiUrl("file:///etc/passwd", filePolicy), false);
    assert.equal(
      isAllowedUiUrl(pathToFileURL("/tmp/other/index.html").href, filePolicy),
      false,
    );
  });

  it("fails closed on missing policy or about:blank", () => {
    assert.equal(isAllowedUiUrl("http://127.0.0.1:5173/", null), false);
    assert.equal(isAllowedUiUrl("about:blank", vitePolicy), false);
    assert.equal(isAllowedUiUrl("", vitePolicy), false);
  });
});

describe("isLoopbackHostname", () => {
  it("accepts 127.0.0.1 and IPv6 loopback only", () => {
    assert.equal(isLoopbackHostname("127.0.0.1"), true);
    assert.equal(isLoopbackHostname("::1"), true);
    assert.equal(isLoopbackHostname("[::1]"), true);
    assert.equal(isLoopbackHostname("localhost"), false);
    assert.equal(isLoopbackHostname("0.0.0.0"), false);
  });
});
