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
  secondContactMessage,
} from "@/lib/invite-link";
import {
  CreateInviteLinkSheet,
  InviteLinkContactNote,
  PasteInviteLinkSheet,
} from "@/screens/contacts/InviteLinkSheets";
import { useContactsStore } from "@/state/contactsStore";
import { useSettingsStore } from "@/state/settingsStore";
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
    useSettingsStore.setState({ showTips: true });
  });

  it("warns the responder only after Done, then closes on Got it", async () => {
    useSettingsStore.setState({ showTips: true });
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

  it("closes on Done when tips are off", async () => {
    useSettingsStore.setState({ showTips: false });
    const onClose = vi.fn();
    useContactsStore.setState({
      pasteInviteLink: vi.fn(async () => ({
        type: "show-existing" as const,
        contactId: "c1",
        replyLink: "{}",
      })),
    });

    render(<PasteInviteLinkSheet open myAddress="ccx7bob" onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText(/paste the link/i), {
      target: { value: "{}" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open link" }));
    fireEvent.click(await screen.findByRole("button", { name: "Done" }));

    expect(screen.queryByText(REPLY_TIMING_NOTICE)).toBeNull();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("asks before adding a second contact at the same address", async () => {
    const pasteInviteLink = vi
      .fn()
      .mockResolvedValueOnce({
        type: "confirm-second" as const,
        alias: "Alice",
        linkName: "Ada",
      })
      .mockResolvedValueOnce({
        type: "need-handle" as const,
        frame: { n: "Ada", a: "ccx7ada", p: "abcdef123456" },
      });
    useContactsStore.setState({ pasteInviteLink });

    render(
      <PasteInviteLinkSheet open myAddress="ccx7bob" onClose={() => {}} />,
    );
    fireEvent.change(screen.getByPlaceholderText(/paste the link/i), {
      target: { value: "{}" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open link" }));

    expect(
      await screen.findByText(secondContactMessage("Alice", "Ada")),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add second contact" }));

    await waitFor(() =>
      expect(pasteInviteLink).toHaveBeenLastCalledWith(
        expect.objectContaining({ confirmSecond: true }),
      ),
    );
    expect(
      await screen.findByText(/name they should use for you/i),
    ).toBeTruthy();
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
