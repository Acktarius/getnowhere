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

  it("ChatRoomScreen copies truncated room id; raw id and topic are not copyable", () => {
    const src = readSrc("src/screens/chats/ChatRoomScreen.tsx");
    // shortRoomId must be imported and used
    expect(src).toMatch(/import[^;]*shortRoomId[^;]*from "@\/utils\/format"/);
    expect(src).toMatch(/NonSelectableText/);
    // CopyButton must be bound to the shortRoomId helper, not the raw id
    expect(src).toMatch(/CopyButton value=\{shortRoomId\(displayRoom\.id\)\}/);
    expect(src).toMatch(/CopyButton value=\{shortRoomId\(roomId\)\}/);
    // Raw capability values must not be passed to CopyButton
    expect(src).not.toMatch(/CopyButton value=\{displayRoom\.id\}/);
    expect(src).not.toMatch(/CopyButton value=\{roomId\}/);
    // Topic must never be copyable
    expect(src).not.toMatch(/CopyButton value=\{discoveryTopicRef\}/);
    expect(src).not.toMatch(/copySensitive\(discoveryTopicRef\)/);
  });

  it("ChatRoomHeader does not mount raw roomId in the DOM", () => {
    const src = readSrc("src/components/ChatRoomHeader.tsx");
    expect(src).not.toMatch(/sr-only/);
    expect(src).not.toMatch(/Room \{roomId\}/);
    expect(src).not.toMatch(/roomId:/);
  });

  it("useSeedDemoContacts is gated to Vite DEV", () => {
    const src = readSrc("src/hooks/useSeedDemoContacts.ts");
    expect(src).toMatch(/if\s*\(\s*!import\.meta\.env\.DEV\s*\)\s*return/);
  });
});
