import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createRoomSessionHost,
  roomSessionMode,
} from "../room-session-store.mjs";

function memoryFs() {
  /** @type {Map<string, Buffer>} */
  const files = new Map();
  return {
    files,
    existsSync: (path) => files.has(path),
    readFileSync: (path) => {
      const hit = files.get(path);
      if (!hit) throw new Error("missing");
      return hit;
    },
    writeFileSync: (path, data) => {
      files.set(path, Buffer.from(data));
    },
    unlinkSync: (path) => {
      files.delete(path);
    },
  };
}

function fakeSafeStorage(backend) {
  return {
    getSelectedStorageBackend: () => backend,
    encryptString: (plain) => Buffer.from(`enc:${plain}`, "utf8"),
    decryptString: (buf) => {
      const text = Buffer.from(buf).toString("utf8");
      if (!text.startsWith("enc:")) throw new Error("bad");
      return text.slice(4);
    },
  };
}

test("gnome libsecret is an OS store", () => {
  assert.equal(roomSessionMode("gnome_libsecret"), "os");
  assert.equal(roomSessionMode("kwallet6"), "os");
  assert.equal(roomSessionMode("basic_text"), "wallet");
});

test("OS mode round-trips ciphertext and does not store plaintext", () => {
  const fs = memoryFs();
  const host = createRoomSessionHost({
    userData: "/tmp/gnh-test",
    safeStorage: fakeSafeStorage("gnome_libsecret"),
    fs,
  });
  assert.equal(host.save('{"room":1}').mode, "os");
  const stored = [...fs.files.values()][0].toString("utf8");
  assert.equal(stored, 'enc:{"room":1}');
  assert.notEqual(stored, '{"room":1}');
  assert.deepEqual(host.load(), { mode: "os", json: '{"room":1}' });
  host.clear();
  assert.equal(fs.files.size, 0);
});

test("basic_text does not write a file", () => {
  const fs = memoryFs();
  const host = createRoomSessionHost({
    userData: "/tmp/gnh-test",
    safeStorage: fakeSafeStorage("basic_text"),
    fs,
  });
  assert.deepEqual(host.load(), { mode: "wallet" });
  assert.deepEqual(host.save("{}"), { mode: "wallet" });
  assert.equal(fs.files.size, 0);
});
