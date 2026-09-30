import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MessageBubble } from "@/components/MessageBubble";
import type { ChatMessage } from "@/types/models";

function outbound(status: ChatMessage["status"]): ChatMessage {
  return {
    id: `m-${status}`,
    roomId: "room-1",
    direction: "out",
    text: `hello ${status}`,
    createdAt: "2026-01-01T12:00:00.000Z",
    status,
    channel: "live",
    kind: "text",
  };
}

function renderBubble(message: ChatMessage) {
  return render(<MessageBubble message={message} />).container;
}

function checkIcons(container: HTMLElement) {
  return {
    single: container.querySelectorAll("svg.lucide-check").length,
    double: container.querySelectorAll("svg.lucide-check-check").length,
  };
}

describe("MessageBubble outbound status", () => {
  afterEach(cleanup);

  it("shows the queued label and no check", () => {
    const container = renderBubble(outbound("queued"));
    expect(screen.getByText("queued")).toBeInTheDocument();
    expect(checkIcons(container)).toEqual({ single: 0, double: 0 });
  });

  it("shows a clock and no check while sending", () => {
    const container = renderBubble(outbound("sending"));
    expect(screen.getByLabelText("Sending")).toBeInTheDocument();
    expect(screen.queryByLabelText("Sent")).toBeNull();
    expect(checkIcons(container)).toEqual({ single: 0, double: 0 });
  });

  it("shows a single check for sent, never a double check", () => {
    const container = renderBubble(outbound("sent"));
    expect(screen.getAllByLabelText("Sent")).toHaveLength(1);
    expect(checkIcons(container)).toEqual({ single: 1, double: 0 });
  });

  it("shows a single check for a legacy outbound delivered row", () => {
    const container = renderBubble(outbound("delivered"));
    expect(screen.getAllByLabelText("Sent")).toHaveLength(1);
    expect(checkIcons(container)).toEqual({ single: 1, double: 0 });
  });

  it("shows the failure icon and no check when failed", () => {
    const container = renderBubble(outbound("failed"));
    expect(screen.getByLabelText("Failed")).toBeInTheDocument();
    expect(checkIcons(container)).toEqual({ single: 0, double: 0 });
  });

  it("shows no status icon on an inbound delivered row", () => {
    const container = renderBubble({
      ...outbound("delivered"),
      direction: "in",
    });
    expect(screen.queryByLabelText("Sent")).toBeNull();
    expect(checkIcons(container)).toEqual({ single: 0, double: 0 });
  });
});
