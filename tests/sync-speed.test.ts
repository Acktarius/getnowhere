import { describe, expect, it } from "vitest";
import {
  DEFAULT_SYNC_SPEED,
  readSpeedFromSyncSpeed,
  SYNC_PROFILES,
  SYNC_SPEED_LABELS,
  SYNC_SPEED_OPTIONS,
  type SyncSpeed,
  syncProfileFor,
  syncProfileFromReadSpeed,
  syncSpeedFromReadSpeed,
} from "@/lib/sync-speed";

describe("sync-speed levels (DOOM)", () => {
  it("has the five ordered levels with DOOM labels + a sane default", () => {
    expect(SYNC_SPEED_OPTIONS).toEqual([
      "tooYoung",
      "notTooRough",
      "hurtMePlenty",
      "ultraViolence",
      "nightmare",
    ]);
    expect(SYNC_SPEED_LABELS.nightmare).toBe("Nightmare!");
    expect(SYNC_SPEED_LABELS.hurtMePlenty).toBe("Hurt me plenty");
    expect(DEFAULT_SYNC_SPEED).toBe("hurtMePlenty");
    expect(SYNC_SPEED_OPTIONS).toContain(DEFAULT_SYNC_SPEED);
  });

  it("round-trips every level through its persisted readSpeed", () => {
    for (const speed of SYNC_SPEED_OPTIONS) {
      expect(syncSpeedFromReadSpeed(readSpeedFromSyncSpeed(speed))).toBe(speed);
    }
  });

  it("resets legacy no-op readSpeed values (2/10/50/100) + unknown/unset to the default", () => {
    for (const legacy of [2, 10, 50, 100, 0, 999]) {
      expect(syncSpeedFromReadSpeed(legacy)).toBe(DEFAULT_SYNC_SPEED);
    }
  });

  it("the default level engages the worker-pool fold", () => {
    expect(syncProfileFor(DEFAULT_SYNC_SPEED).workers).toBeGreaterThan(0);
  });

  it("Nightmare maxes every knob; gentler levels stay calmer", () => {
    const nm = syncProfileFor("nightmare");
    expect(nm.workers).toBe(8);
    expect(nm.batchBlocks).toBe(1000);
    expect(nm.maxSources).toBe(6);

    const easy = syncProfileFor("tooYoung");
    expect(easy.workers).toBe(0);
    expect(easy.maxSources).toBe(1);
  });

  it("profiles are monotonic non-decreasing across the ordered levels", () => {
    const profiles = SYNC_SPEED_OPTIONS.map((s) => SYNC_PROFILES[s]);
    for (let i = 1; i < profiles.length; i++) {
      expect(profiles[i].workers).toBeGreaterThanOrEqual(
        profiles[i - 1].workers,
      );
      expect(profiles[i].batchBlocks).toBeGreaterThanOrEqual(
        profiles[i - 1].batchBlocks,
      );
      expect(profiles[i].maxSources).toBeGreaterThanOrEqual(
        profiles[i - 1].maxSources,
      );
    }
  });

  it("syncProfileFromReadSpeed resolves through the persisted number", () => {
    const nightmareSpeed = readSpeedFromSyncSpeed("nightmare");
    expect(syncProfileFromReadSpeed(nightmareSpeed)).toEqual(
      SYNC_PROFILES.nightmare,
    );
    expect(syncProfileFromReadSpeed(0)).toEqual(
      SYNC_PROFILES[DEFAULT_SYNC_SPEED],
    );
  });

  it("every level has a non-empty label", () => {
    for (const speed of SYNC_SPEED_OPTIONS) {
      expect(SYNC_SPEED_LABELS[speed as SyncSpeed].length).toBeGreaterThan(0);
    }
  });
});
