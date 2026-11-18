import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ONE_PERSON_LINK_WARNING } from "@/lib/invite-link";
import { CreateInviteLinkSheet } from "@/screens/contacts/InviteLinkSheets";

describe("CreateInviteLinkSheet", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the one-person warning before the link is created", () => {
    render(
      <CreateInviteLinkSheet
        open
        myAddress="ccx7aliceaddress"
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(ONE_PERSON_LINK_WARNING)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Create and copy" }),
    ).toBeTruthy();
  });
});
