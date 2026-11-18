import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { AddContactSheet } from "@/screens/contacts/AddContactSheet";

describe("AddContactSheet hints", () => {
  afterEach(() => {
    cleanup();
  });

  it("explains both payment IDs and keeps pairing inside the sheet", async () => {
    const user = userEvent.setup();
    render(<AddContactSheet open onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByText("Type their name to show pairing.")).toBeTruthy();
    expect(screen.queryByText("Pair QR")).toBeNull();
    expect(
      screen.getByText(
        "You made this ID. They save it so you can recognize what they send.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "You attach it when you send to them, so they can recognize you.",
      ),
    ).toBeTruthy();

    await user.type(screen.getByPlaceholderText("e.g. Cipher"), "Ada");
    expect(screen.getByText("Pair QR")).toBeTruthy();
    expect(screen.getByText("Scan pair QR")).toBeTruthy();
  });
});
