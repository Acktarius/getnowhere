import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ONE_PERSON_LINK_WARNING,
  REPLY_TIMING_NOTICE,
} from "@/lib/invite-link";
import {
  CreateInviteLinkSheet,
  InviteLinkContactNote,
  PasteInviteLinkSheet,
} from "@/screens/contacts/InviteLinkSheets";
import { useContactsStore } from "@/state/contactsStore";
import type { Contact } from "@/types/models";

vi.mock("@/lib/clipboard/sensitiveClipboard", () => ({
  copySensitive: vi.fn(async () => undefined),
}));

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

describe("PasteInviteLinkSheet", () => {
  afterEach(() => {
    cleanup();
  });

  it("warns the responder only after Done, then closes on Got it", async () => {
    const onClose = vi.fn();
    const pasteInviteLink = vi.fn(async () => ({
      type: "show-existing" as const,
      contactId: "c1",
      replyLink: "{}",
    }));
    useContactsStore.setState({ pasteInviteLink });

    render(<PasteInviteLinkSheet open myAddress="ccx7bob" onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText(/paste the link/i), {
      target: { value: "{}" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open link" }));

    const done = await screen.findByRole("button", { name: "Done" });
    expect(screen.queryByText(REPLY_TIMING_NOTICE)).toBeNull();

    fireEvent.click(done);
    expect(screen.getByText(REPLY_TIMING_NOTICE)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

describe("InviteLinkContactNote", () => {
  afterEach(() => {
    cleanup();
  });

  it("adds nothing to a redeemer contact page", () => {
    const contact = {
      id: "c1",
      linkRole: "redeemer",
      linkState: "awaiting",
    } as Contact;
    const { container } = render(
      <InviteLinkContactNote contact={contact} myAddress="ccx7bob" />,
    );
    expect(container.textContent).toBe("");
  });
});
