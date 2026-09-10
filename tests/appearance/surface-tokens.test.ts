import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function readRepo(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function requirement(spec: string, title: string): string {
  const heading = `### Requirement: ${title}`;
  const start = spec.indexOf(heading);
  if (start < 0) throw new Error(`missing requirement: ${title}`);
  const rest = spec.slice(start);
  const next = rest.indexOf("\n### ", 1);
  return next < 0 ? rest : rest.slice(0, next);
}

function hexes(text: string): string[] {
  return [...text.matchAll(/#[0-9a-fA-F]{6}/g)].map((m) => m[0].toLowerCase());
}

/** Expected Dark/Light surfaces and glyph mixes from the capability spec. */
function expectedFromSpec(spec: string): {
  darkBg: string;
  darkCard: string;
  lightBg: string;
  darkGlyphMix: number;
  lightGlyphMix: number;
} {
  const dark = requirement(
    spec,
    "Dark page is lifted charcoal with lighter cards",
  );
  const light = requirement(spec, "Light page is paper grey with white cards");
  const glyphs = requirement(spec, "Chat-topic glyphs are visible");
  const [darkBg, darkCard] = hexes(dark);
  const [lightBg] = hexes(light);
  const mix = glyphs.match(
    /(\d+)% of the primary accent in Dark and (\d+)% in Light/,
  );
  if (!darkBg || !darkCard || !lightBg || !mix) {
    throw new Error("capability spec is missing surface hex or glyph mix");
  }
  return {
    darkBg,
    darkCard,
    lightBg,
    darkGlyphMix: Number(mix[1]),
    lightGlyphMix: Number(mix[2]),
  };
}

function ruleBody(css: string, selector: string): string {
  const idx = css.indexOf(selector);
  if (idx < 0) throw new Error(`missing selector ${selector}`);
  const open = css.indexOf("{", idx);
  const close = css.indexOf("}", open);
  if (open < 0 || close < 0) throw new Error(`unclosed rule ${selector}`);
  return css.slice(open + 1, close);
}

function customProp(block: string, name: string): string {
  const m = block.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`missing ${name}`);
  return m[1].trim().toLowerCase();
}

function primaryMixPercent(rule: string): number {
  const m = rule.match(/color-mix\(\s*in srgb,\s*var\(--primary\)\s+(\d+)%/i);
  if (!m) throw new Error("missing primary color-mix");
  return Number(m[1]);
}

describe("surface tokens", () => {
  const spec = readRepo(
    "openspec/changes/appearance-contrast-and-accents/specs/app-appearance/spec.md",
  );
  const css = readRepo("src/styles/global.css");
  const expected = expectedFromSpec(spec);

  it("Dark --bg matches the spec hex", () => {
    const dark = ruleBody(css, '[data-theme="dark"]');
    expect(customProp(dark, "--bg")).toBe(expected.darkBg);
  });

  it("Dark --bg-card matches the spec hex", () => {
    const dark = ruleBody(css, '[data-theme="dark"]');
    expect(customProp(dark, "--bg-card")).toBe(expected.darkCard);
  });

  it("Light --bg matches the spec hex", () => {
    const light = ruleBody(css, '[data-theme="light"]');
    expect(customProp(light, "--bg")).toBe(expected.lightBg);
  });

  it(".chat-topic-backdrop Dark fill uses the spec primary mix", () => {
    const darkRule = ruleBody(css, ".chat-topic-backdrop");
    expect(primaryMixPercent(darkRule)).toBe(expected.darkGlyphMix);
  });

  it(".chat-topic-backdrop Light fill uses the spec primary mix", () => {
    const lightRule = ruleBody(
      css,
      '[data-theme="light"] .chat-topic-backdrop',
    );
    expect(primaryMixPercent(lightRule)).toBe(expected.lightGlyphMix);
  });
});
