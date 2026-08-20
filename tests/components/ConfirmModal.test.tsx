import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ConfirmModal } from "@/components/ConfirmModal";

describe("ConfirmModal", () => {
  it("shows busyLabel and busyStatus while async onConfirm runs", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });

    render(
      <ConfirmModal
        open
        title="Leave room?"
        confirmLabel="LEAVE ROOM"
        busyLabel="Leaving…"
        busyStatus="Destroying room…"
        onConfirm={() => pending}
        onClose={() => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: "LEAVE ROOM" }));

    expect(screen.getByRole("button", { name: "Leaving…" })).toBeDisabled();
    expect(screen.getByText("Destroying room…")).toBeInTheDocument();

    release();
  });
});
