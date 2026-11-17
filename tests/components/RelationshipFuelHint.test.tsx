import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RelationshipFuelHint } from "@/components/RelationshipFuelHint";
import { RELATIONSHIP_FUEL_HINT } from "@/lib/wallet/relationship-fuel";

describe("RelationshipFuelHint", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the hint when a synced wallet is at the fuel line", () => {
    render(<RelationshipFuelHint balanceCcx={0.0111} syncStatus="synced" />);
    expect(screen.getByRole("status").textContent).toBe(RELATIONSHIP_FUEL_HINT);
  });

  it("stays quiet while sync is still running", () => {
    render(<RelationshipFuelHint balanceCcx={0} syncStatus="syncing" />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("stays quiet once the balance can cover a message", () => {
    render(<RelationshipFuelHint balanceCcx={0.02} syncStatus="synced" />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
