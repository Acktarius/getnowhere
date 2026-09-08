import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeSelector } from "@/components/ThemeSelector";
import { resolveAccentVars } from "@/lib/appearance/accentVars";
import { useSettingsStore } from "@/state/settingsStore";

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

/** Sky/Pink Dark and Light `--primary` hex from the capability spec. */
function expectedPrimariesFromSpec(spec: string): {
  skyDark: string;
  skyLight: string;
  pinkDark: string;
  pinkLight: string;
} {
  const block = requirement(spec, "Accents include sky and pink");
  const sky = block.match(
    /Sky SHALL use\s+`(#[0-9a-fA-F]{6})`\s+as the Dark primary and\s+`(#[0-9a-fA-F]{6})`\s+as the Light primary/,
  );
  const pink = block.match(
    /Pink SHALL use\s+`(#[0-9a-fA-F]{6})`\s+as the Dark primary and\s+`(#[0-9a-fA-F]{6})`\s+as the Light primary/,
  );
  if (!sky || !pink) {
    throw new Error("capability spec is missing sky/pink primary hex");
  }
  return {
    skyDark: sky[1].toLowerCase(),
    skyLight: sky[2].toLowerCase(),
    pinkDark: pink[1].toLowerCase(),
    pinkLight: pink[2].toLowerCase(),
  };
}

function primaryOf(accent: string, theme: "dark" | "light"): string {
  return resolveAccentVars(accent, theme)["--primary"].toLowerCase();
}

describe("accent maps", () => {
  const spec = readRepo(
    "openspec/changes/appearance-contrast-and-accents/specs/app-appearance/spec.md",
  );
  const expected = expectedPrimariesFromSpec(spec);

  it("sky Dark --primary matches the spec hex", () => {
    expect(primaryOf("sky", "dark")).toBe(expected.skyDark);
  });

  it("sky Light --primary matches the spec hex", () => {
    expect(primaryOf("sky", "light")).toBe(expected.skyLight);
  });

  it("pink Dark --primary matches the spec hex", () => {
    expect(primaryOf("pink", "dark")).toBe(expected.pinkDark);
  });

  it("pink Light --primary matches the spec hex", () => {
    expect(primaryOf("pink", "light")).toBe(expected.pinkLight);
  });

  it("unknown accents resolve to teal", () => {
    const teal = resolveAccentVars("teal", "dark");
    const unknown = resolveAccentVars("chartreuse", "dark");
    expect(unknown).toEqual(teal);
    expect(teal["--primary"].toLowerCase()).not.toBe(expected.skyDark);
    expect(teal["--primary"].toLowerCase()).not.toBe(expected.pinkDark);
  });

  it("sky and pink maps do not write page surfaces", () => {
    for (const accent of ["sky", "pink"] as const) {
      for (const theme of ["dark", "light"] as const) {
        const vars = resolveAccentVars(accent, theme);
        expect(vars).not.toHaveProperty("--bg");
        expect(vars).not.toHaveProperty("--bg-card");
      }
    }
  });
});

describe("ThemeSelector accents", () => {
  afterEach(() => {
    cleanup();
    useSettingsStore.getState().reset();
  });

  it("lists Dark, Light, and System themes only", () => {
    render(createElement(ThemeSelector));
    expect(screen.getByRole("button", { name: "Dark" })).toHaveTextContent(
      "Dark",
    );
    expect(screen.getByRole("button", { name: "Light" })).toHaveTextContent(
      "Light",
    );
    expect(screen.getByRole("button", { name: "System" })).toHaveTextContent(
      "System",
    );
    expect(screen.getByRole("button", { name: "Sky" })).toHaveTextContent("");
    expect(screen.getByRole("button", { name: "Pink" })).toHaveTextContent("");
  });

  it("lists Sky and Pink accent swatches", () => {
    render(createElement(ThemeSelector));
    expect(screen.getByRole("button", { name: "Sky" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pink" })).toBeInTheDocument();
  });

  it("wraps the accent row", () => {
    render(createElement(ThemeSelector));
    expect(
      screen.getByRole("button", { name: "Sky" }).parentElement,
    ).toHaveStyle({ flexWrap: "wrap" });
  });

  it("Sky swatch persists accent sky", async () => {
    const user = userEvent.setup();
    render(createElement(ThemeSelector));
    await user.click(screen.getByRole("button", { name: "Sky" }));
    expect(useSettingsStore.getState().accent).toBe("sky");
    expect(
      JSON.parse(localStorage.getItem("gnh.settings") ?? "{}").accent,
    ).toBe("sky");
  });
});
