import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const buildScript = path.join(root, "scripts/ppa/build-source.sh");
const publishScript = path.join(root, "scripts/ppa/publish-latest.sh");

function tempDir(): string {
  return execFileSync("mktemp", ["-d", path.join(tmpdir(), "ppa-XXXXXX")], {
    encoding: "utf8",
  }).trim();
}

function writePayload(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "getnowhere"), "#!/bin/sh\nexit 0\n");
}

function mockBin(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "dpkg-buildpackage"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$MOCK_LOG"
if [[ -f debian/changelog ]]; then
  cat debian/changelog >> "$MOCK_LOG"
fi
version=$(sed -n 's/.*(\\(.*\\)).*/\\1/p' debian/changelog | head -1)
parent=$(dirname "$PWD")
touch "$parent/getnowhere_\${version}.dsc"
touch "$parent/getnowhere_\${version}_source.changes"
touch "$parent/getnowhere_\${version}.debian.tar.xz"
`,
  );
  writeFileSync(
    path.join(dir, "dpkg-source"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$MOCK_LOG"
dest=""
prev=""
for arg in "$@"; do
  if [[ "$prev" == "-x" ]]; then
    :
  fi
  prev=$arg
  dest=$arg
done
mkdir -p "$dest/debian"
cat > "$dest/debian/changelog" <<'EOF'
getnowhere (1.2.3-1~jammy1) jammy; urgency=medium

  * Desktop package.

 -- Get NowHere <packaging@localhost>  Wed, 01 Jan 2020 00:00:00 +0000
EOF
cat > "$dest/debian/control" <<'EOF'
Source: getnowhere
Maintainer: Get NowHere <packaging@localhost>
EOF
`,
  );
  writeFileSync(
    path.join(dir, "dput"),
    `#!/usr/bin/env bash
printf 'dput called\\n' >> "$MOCK_LOG"
exit 0
`,
  );
  execFileSync("chmod", [
    "755",
    path.join(dir, "dpkg-buildpackage"),
    path.join(dir, "dpkg-source"),
    path.join(dir, "dput"),
  ]);
}

describe("ppa source packages", () => {
  it("packs the desktop payload for jammy, noble, and resolute", () => {
    const dir = tempDir();
    const payload = path.join(dir, "payload");
    const output = path.join(dir, "out");
    writePayload(payload);

    execFileSync(
      "bash",
      [buildScript, "--payload", payload, "--version", "1.2.3", output],
      {
        env: {
          ...process.env,
          PPA_SERIES: "22.04,noble,26",
          PPA_DEBIAN_REVISION: "1",
          PPA_UPLOAD_SUFFIX: "2",
          PPA_COMMIT_SHORT: "abc1234",
          SOURCE_DATE_EPOCH: "1700000000",
          PPA_PREPARE_ONLY: "1",
          PPA_WORK_DIR: path.join(dir, "work"),
        },
      },
    );

    expect(
      readFileSync(path.join(output, "jammy/changelog"), "utf8").split("\n")[0],
    ).toBe("getnowhere (1.2.3-1~jammy2) jammy; urgency=medium");
    expect(
      readFileSync(path.join(output, "noble/changelog"), "utf8"),
    ).toContain("~noble2");
    expect(
      readFileSync(path.join(output, "resolute/changelog"), "utf8"),
    ).toContain("~resolute2");
    const names = execFileSync(
      "tar",
      ["-tzf", path.join(output, "jammy/getnowhere_1.2.3.orig.tar.gz")],
      { encoding: "utf8" },
    );
    expect(names).toContain("getnowhere-1.2.3/payload/getnowhere");
    expect(names).not.toContain("debian/");
    expect(
      existsSync(
        path.join(
          dir,
          "work",
          "jammy",
          "getnowhere-1.2.3",
          "debian",
          "source",
          "include-binaries",
        ),
      ),
    ).toBe(false);
  });

  it("lists the desktop icon so dpkg-source accepts it", () => {
    const dir = tempDir();
    const payload = path.join(dir, "payload");
    const output = path.join(dir, "out");
    const icon = path.join(dir, "icon.png");
    writePayload(payload);
    writeFileSync(icon, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    execFileSync(
      "bash",
      [
        buildScript,
        "--payload",
        payload,
        "--version",
        "1.2.3",
        "--icon",
        icon,
        output,
      ],
      {
        env: {
          ...process.env,
          PPA_SERIES: "jammy",
          PPA_DEBIAN_REVISION: "1",
          PPA_UPLOAD_SUFFIX: "1",
          PPA_COMMIT_SHORT: "abc1234",
          SOURCE_DATE_EPOCH: "1700000000",
          PPA_PREPARE_ONLY: "1",
          PPA_WORK_DIR: path.join(dir, "work"),
        },
      },
    );

    const debian = path.join(
      dir,
      "work",
      "jammy",
      "getnowhere-1.2.3",
      "debian",
    );
    expect(
      readFileSync(path.join(debian, "source", "include-binaries"), "utf8"),
    ).toBe("debian/getnowhere.png\n");
    expect(readFileSync(path.join(debian, "getnowhere.png"))).toEqual(
      readFileSync(icon),
    );
  });

  it("signs a downloaded source package and does not upload on a dry run", () => {
    const dir = tempDir();
    const from = path.join(dir, "from");
    const bin = path.join(dir, "bin");
    const log = path.join(dir, "mock.log");
    mkdirSync(from, { recursive: true });
    writeFileSync(
      path.join(from, "getnowhere_1.2.3-1~jammy1.dsc"),
      "Files:\n abc 1 getnowhere_1.2.3.orig.tar.gz\n",
    );
    writeFileSync(path.join(from, "getnowhere_1.2.3.orig.tar.gz"), "orig");
    writeFileSync(
      path.join(from, "getnowhere_1.2.3-1~jammy1.debian.tar.xz"),
      "debian",
    );
    writeFileSync(
      path.join(from, "getnowhere_1.2.3-1~jammy1_source.changes"),
      "changes",
    );
    mockBin(bin);
    writeFileSync(log, "");

    const dry = execFileSync(
      "bash",
      [publishScript, "--dry-run", "--from", from, "--series", "jammy"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? ""}`,
          MOCK_LOG: log,
          PPA_DIST_DIR: path.join(dir, "dry"),
          PPA_TARGET: "",
        },
      },
    );
    expect(dry).toContain("dry-run:");
    expect(readFileSync(log, "utf8")).not.toContain("dput called");

    writeFileSync(log, "");
    execFileSync("bash", [publishScript, "--from", from, "--series", "jammy"], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        MOCK_LOG: log,
        PPA_DIST_DIR: path.join(dir, "upload"),
        PPA_WORK_DIR: path.join(dir, "stage"),
        PPA_DEBFULLNAME: "Example Maintainer",
        PPA_DEBEMAIL: "maintainer@example.invalid",
        PPA_GPG_KEY_ID: "TESTKEY",
        PPA_TARGET: "ppa:example/archive",
        PPA_UPLOAD_SUFFIX: "",
        PPA_DEBIAN_REVISION: "",
      },
    });
    const mockLog = readFileSync(log, "utf8");
    expect(mockLog).toContain("-S -d -sa -kTESTKEY");
    expect(mockLog).toContain(
      "Example Maintainer <maintainer@example.invalid>",
    );
    expect(mockLog).toContain("dput called");
  });

  it("refuses an upload target that is not a ppa path", () => {
    const from = tempDir();
    writeFileSync(path.join(from, "getnowhere_1.2.3-1~jammy1.dsc"), "dsc\n");
    let message = "";
    try {
      execFileSync("bash", [publishScript, "--from", from], {
        encoding: "utf8",
        env: {
          ...process.env,
          PPA_TARGET: "canary-secret-value",
          PPA_DEBFULLNAME: "Example Maintainer",
          PPA_DEBEMAIL: "maintainer@example.invalid",
          PPA_GPG_KEY_ID: "TESTKEY",
        },
      });
    } catch (error) {
      const stderr =
        error instanceof Error && "stderr" in error
          ? String((error as { stderr?: Buffer }).stderr)
          : "";
      message = `${error instanceof Error ? error.message : String(error)}\n${stderr}`;
    }
    expect(message).toContain("ppa:<user>/<archive>");
    expect(message).not.toContain("canary-secret-value");
  });

  it("keeps the workflow pointed at this desktop package", () => {
    const workflow = readFileSync(
      path.join(root, ".github/workflows/ppa-source.yml"),
      "utf8",
    );
    expect(workflow).toContain("branches: [development]");
    expect(workflow).toContain("jammy, noble, resolute");
    expect(workflow).toContain("build-source.sh");
    const publish = readFileSync(
      path.join(root, "scripts/ppa/publish-latest.sh"),
      "utf8",
    );
    expect(publish).toContain("gh run download");
    expect(publish).not.toContain("releases/latest");
    expect(publish).not.toContain("gh release");
    expect(workflow).not.toContain("gh release");
    expect(workflow).toContain("actions/download-artifact@v7");
    expect(workflow).not.toContain("actions/download-artifact@v6");
    expect(workflow).toContain("GetNowHere-linux-x64");
    expect(workflow).not.toContain("CMakeLists");
    const files = [
      "scripts/ppa/build-source.sh",
      "scripts/ppa/publish-latest.sh",
      "scripts/ppa/load-env.sh",
      ".github/workflows/ppa-source.yml",
      "docs/builds/ppa-source.md",
    ];
    const combined = files
      .map((file) => readFileSync(path.join(root, file), "utf8"))
      .join("\n");
    expect(combined).not.toMatch(/\b\d{1,3}(?:\.\d{1,3}){3}\b/);
    expect(combined).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
    expect(combined).not.toMatch(/password\s*=/i);
  });
});
