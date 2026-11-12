import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const packaging = join(dirname(fileURLToPath(import.meta.url)), "..", "packaging");
const installWrapper = join(packaging, "install-cli-wrapper.sh");
const debWrapper = join(packaging, "deb-cli-wrapper.sh");

test("cli wrapper prints the bare version and otherwise execs the app", () => {
  const dir = mkdtempSync(join(tmpdir(), "gnh-cli-"));
  try {
    const app = join(dir, "app.sh");
    writeFileSync(app, "#!/bin/sh\nprintf '%s\\n' launched\n");
    chmodSync(app, 0o755);
    const bin = join(dir, "bin", "getnowhere");
    execFileSync("bash", [installWrapper, "1.2.3", app, bin]);
    assert.equal(execFileSync(bin, ["--version"], { encoding: "utf8" }), "1.2.3\n");
    assert.equal(execFileSync(bin, ["-v"], { encoding: "utf8" }), "1.2.3\n");
    assert.equal(execFileSync(bin, [], { encoding: "utf8" }), "launched\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("deb wrapper replaces the symlink and opens app directories", () => {
  const dir = mkdtempSync(join(tmpdir(), "gnh-deb-"));
  try {
    const root = join(dir, "root");
    const appDir = join(root, "usr/lib/getnowhere");
    execFileSync("mkdir", ["-p", appDir, join(root, "usr/bin"), join(root, "DEBIAN")]);
    chmodSync(appDir, 0o700);
    const app = join(appDir, "getnowhere");
    writeFileSync(app, "#!/bin/sh\nprintf '%s\\n' launched\n");
    chmodSync(app, 0o700);
    const sandbox = join(appDir, "chrome-sandbox");
    writeFileSync(sandbox, "");
    chmodSync(sandbox, 0o4755);
    execFileSync("ln", ["-s", "../lib/getnowhere/getnowhere", join(root, "usr/bin/getnowhere")]);
    writeFileSync(
      join(root, "DEBIAN/control"),
      "Package: getnowhere\nVersion: 1.2.3\nArchitecture: all\nMaintainer: test\nDescription: test\n",
    );
    const deb = join(dir, "getnowhere.deb");
    execFileSync("dpkg-deb", ["--root-owner-group", "-b", root, deb]);
    execFileSync("bash", [debWrapper, deb, "1.2.3"]);

    const listing = execFileSync("dpkg-deb", ["-c", deb], { encoding: "utf8" });
    assert.match(listing, /drwxr-xr-x.+ \.\/usr\/lib\/getnowhere\/\n/);
    assert.match(listing, /-rwxr-xr-x.+ \.\/usr\/lib\/getnowhere\/getnowhere\n/);
    assert.match(listing, /-rwsr-xr-x.+ \.\/usr\/lib\/getnowhere\/chrome-sandbox\n/);
    assert.match(listing, /-rwxr-xr-x.+ \.\/usr\/bin\/getnowhere\n/);
    assert.doesNotMatch(listing, /usr\/bin\/getnowhere ->/);

    const extract = join(dir, "extract");
    execFileSync("dpkg-deb", ["-x", deb, extract]);
    const script = readFileSync(join(extract, "usr/bin/getnowhere"), "utf8");
    assert.match(script, /printf '%s\\n' '1\.2\.3'/);
    assert.match(script, /exec '\/usr\/lib\/getnowhere\/getnowhere'/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
