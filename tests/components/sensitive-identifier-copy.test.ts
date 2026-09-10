import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("sensitive identifier copy call sites", () => {
  it("WalletScreen uses CopyButton and does not use useCopy", () => {
    const src = readSrc("src/screens/wallet/WalletScreen.tsx");
    expect(src).toMatch(/CopyButton/);
    expect(src).toMatch(/NonSelectableText/);
    expect(src).not.toMatch(/useCopy/);
    expect(src).not.toMatch(/copy\(tx\.hash\)/);
  });

  it("ContactDetailScreen copies via CopyButton or copySensitive, not useCopy", () => {
    const src = readSrc("src/screens/contacts/ContactDetailScreen.tsx");
    expect(src).toMatch(/CopyButton|copySensitive/);
    expect(src).not.toMatch(/useCopy/);
  });

  it("ChatRoomScreen room and topic ids use NonSelectableText and CopyButton", () => {
    const src = readSrc("src/screens/chats/ChatRoomScreen.tsx");
    expect(src).toMatch(/NonSelectableText/);
    expect(src).toMatch(/CopyButton/);
  });
});
