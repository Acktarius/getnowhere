import assert from "node:assert/strict";
import { test } from "node:test";
import { getUfwAdvisory } from "../firewall-status.mjs";

function fakeRunner(result) {
  return async () => result;
}

function fakeFailingRunner(error) {
  return async () => {
    throw error;
  };
}

test("non-Linux platforms resolve to unknown without running any command", async () => {
  const runner = async () => {
    throw new Error("must not be called");
  };
  const advisory = await getUfwAdvisory("darwin", runner);
  assert.equal(advisory.state, "unknown");
  assert.equal(advisory.reason, "not-linux");
});

test("reports active when systemctl reports the ufw unit is active", async () => {
  const advisory = await getUfwAdvisory(
    "linux",
    fakeRunner({ stdout: "active\n" }),
  );
  assert.equal(advisory.state, "active");
});

test("reports inactive when systemctl reports the ufw unit is inactive", async () => {
  const advisory = await getUfwAdvisory(
    "linux",
    fakeRunner({ stdout: "inactive\n" }),
  );
  assert.equal(advisory.state, "inactive");
});

test("treats a non-zero exit carrying an inactive/failed stdout as a confident result", async () => {
  // `systemctl is-active <unit>` exits 3 for inactive units but still emits
  // the state string on stdout — Node's promisified execFile attaches it to
  // the rejected error.
  const error = Object.assign(new Error("Command failed"), {
    code: 3,
    stdout: "failed\n",
  });
  const advisory = await getUfwAdvisory("linux", fakeFailingRunner(error));
  assert.equal(advisory.state, "inactive");
});

test("resolves to unknown when systemctl is missing (non-systemd host)", async () => {
  const error = Object.assign(new Error("spawn systemctl ENOENT"), {
    code: "ENOENT",
  });
  const advisory = await getUfwAdvisory("linux", fakeFailingRunner(error));
  assert.equal(advisory.state, "unknown");
  assert.equal(advisory.reason, "no-systemctl");
});

test("resolves to unknown on a permission failure instead of throwing", async () => {
  const error = Object.assign(new Error("EACCES"), { code: "EACCES" });
  const advisory = await getUfwAdvisory("linux", fakeFailingRunner(error));
  assert.equal(advisory.state, "unknown");
  assert.equal(advisory.reason, "permission-denied");
});

test("resolves to unknown for an unrecognized systemctl result instead of throwing", async () => {
  const advisory = await getUfwAdvisory(
    "linux",
    fakeRunner({ stdout: "activating\n" }),
  );
  assert.equal(advisory.state, "unknown");
});
