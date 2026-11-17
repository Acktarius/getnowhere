import { describe, expect, it } from "vitest";
import {
  needsRelationshipFuel,
  RELATIONSHIP_FUEL_CCX,
} from "@/lib/wallet/relationship-fuel";

describe("needsRelationshipFuel", () => {
  it("is true at and under one fallback message", () => {
    expect(needsRelationshipFuel(0)).toBe(true);
    expect(needsRelationshipFuel(RELATIONSHIP_FUEL_CCX)).toBe(true);
  });

  it("is false once the balance can cover one fallback message", () => {
    expect(needsRelationshipFuel(RELATIONSHIP_FUEL_CCX + 0.0001)).toBe(false);
  });
});
