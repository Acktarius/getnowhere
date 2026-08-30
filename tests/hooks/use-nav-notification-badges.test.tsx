import { render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { useNavNotificationBadges } from "@/hooks/useNavNotificationBadges";
import { useContactsStore } from "@/state/contactsStore";
import { useNotificationStore } from "@/state/notificationStore";
import type { Contact } from "@/types/models";

function shell(initial: string) {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="*" element={children} />
      </Routes>
    </MemoryRouter>
  );
}

function NavBadgeProbe() {
  const navigate = useNavigate();
  const { contactsUnread } = useNavNotificationBadges();
  return (
    <>
      <span data-testid="badge">{String(contactsUnread)}</span>
      <button type="button" onClick={() => navigate("/contacts")}>
        contacts
      </button>
    </>
  );
}

const contact = {
  id: "c1",
  alias: "Alice",
  relationshipStatus: "eligible",
} as Contact;

describe("useNavNotificationBadges", () => {
  beforeEach(() => {
    useNotificationStore.getState().resetSession();
    useContactsStore.setState({ contacts: [contact], invites: [] });
    useNotificationStore.getState().pingRegister("c1");
  });

  it("hides contacts tab badge on /contacts even when store has pending badge", () => {
    const { result } = renderHook(() => useNavNotificationBadges(), {
      wrapper: shell("/chats"),
    });
    expect(result.current.contactsUnread).toBe(true);

    const { result: onContacts } = renderHook(() => useNavNotificationBadges(), {
      wrapper: shell("/contacts"),
    });
    expect(onContacts.current.contactsUnread).toBe(false);
  });

  it("updates contacts badge when route changes without store update", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/chats"]}>
        <Routes>
          <Route path="*" element={<NavBadgeProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("badge").textContent).toBe("true");
    await user.click(screen.getByRole("button", { name: "contacts" }));
    await waitFor(() => {
      expect(screen.getByTestId("badge").textContent).toBe("false");
    });
  });
});
