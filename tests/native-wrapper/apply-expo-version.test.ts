import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyExpoVersion } from "../../native-wrapper/scripts/apply-expo-version.mjs";

function writeTempPair(versionBody: string, appJson: string) {
  const dir = mkdtempSync(join(tmpdir(), "gnh-expo-version-"));
  const versionPath = join(dir, "version");
  const appJsonPath = join(dir, "app.json");
  writeFileSync(versionPath, versionBody);
  writeFileSync(appJsonPath, appJson);
  return { versionPath, appJsonPath };
}

describe("applyExpoVersion", () => {
  it("writes expo.version from the version file without reformatting", () => {
    const { versionPath, appJsonPath } = writeTempPair(
      "version=0.4.12\nbuildversionIos=12\n",
      '{\n  "expo": {\n    "name": "Get NowHere",\n    "version": "0.4.9"\n  }\n}\n',
    );

    const result = applyExpoVersion({ versionPath, appJsonPath });

    expect(result).toEqual({
      previous: "0.4.9",
      version: "0.4.12",
      changed: true,
    });
    expect(readFileSync(appJsonPath, "utf8")).toBe(
      '{\n  "expo": {\n    "name": "Get NowHere",\n    "version": "0.4.12"\n  }\n}\n',
    );
  });

  it("is a no-op when app.json already matches", () => {
    const appJson = '{\n  "expo": {\n    "version": "0.4.11"\n  }\n}\n';
    const { versionPath, appJsonPath } = writeTempPair(
      "version=0.4.11\n",
      appJson,
    );

    expect(applyExpoVersion({ versionPath, appJsonPath })).toEqual({
      previous: "0.4.11",
      version: "0.4.11",
      changed: false,
    });
    expect(readFileSync(appJsonPath, "utf8")).toBe(appJson);
  });

  it("fails when the version file is missing", () => {
    expect(() =>
      applyExpoVersion({
        versionPath: join(tmpdir(), "gnh-missing-version"),
        appJsonPath: join(tmpdir(), "gnh-missing-app.json"),
      }),
    ).toThrow(/Missing version file/);
  });
});
