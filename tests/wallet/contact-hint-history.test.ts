import {
  messages,
  type RawWalletV1,
  type WalletTransaction,
} from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";
import { mapWalletTransactions } from "../../src/services/conceal/mapWalletTransactions";
import { peekContactHint } from "../../src/services/protocol/SmartMessageProtocolAdapter";

describe("peekContactHint", () => {
  it("maps create / register / revoke shorthand actions", () => {
    expect(
      peekContactHint(messages.encodeSmartMessage("contact", "create", "x")),
    ).toEqual({ module: "contact", action: "create" });
    expect(
      peekContactHint(
        messages.encodeSmartMessage("contact", "register", "i", "e", "r"),
      ),
    ).toEqual({ module: "contact", action: "register" });
    expect(
      peekContactHint(
        messages.encodeSmartMessage(
          "contact",
          "revoke",
          "i",
          "r",
          "user_declined",
        ),
      ),
    ).toEqual({ module: "contact", action: "revoke" });
  });

  it("ignores non-contact modules", () => {
    expect(
      peekContactHint(messages.encodeSmartMessage("trust", "create", "x")),
    ).toBeNull();
    expect(peekContactHint("not-a-smart-message")).toBeNull();
  });
});

describe("mapWalletTransactions", () => {
  it("joins mined txs with message bodies and clears zeroConf when height > 0", () => {
    const sdkTxs: WalletTransaction[] = [
      {
        hash: "mined1",
        height: 100,
        timestamp: 1_700_000_000,
        amount: 1_000_000,
        direction: "out",
        kind: "send",
      },
    ];
    const raw = {
      sentMessages: [
        {
          id: "mined1",
          direction: "sent",
          counterpartyAddress: "ccx…",
          counterpartyName: "x",
          body: messages.encodeSmartMessage("contact", "create", "blob"),
          hasBody: true,
          paymentIdFrom: null,
          paymentIdTo: "abc",
          timestamp: new Date(1_700_000_000_000).toISOString(),
          unread: false,
          blockHeight: 100,
          threadKey: "t",
        },
      ],
      receivedMessages: [],
      pendingTransactions: [],
      incomingPending: [],
    } as unknown as RawWalletV1;

    const [tx] = mapWalletTransactions(sdkTxs, raw);
    expect(tx.contactHint).toEqual({ module: "contact", action: "create" });
    expect(tx.zeroConf).toBeUndefined();
    expect(tx.state).toBe("confirmed");
  });

  it("surfaces pending outbound smartmessages as zeroConf with register/revoke dots", () => {
    const raw = {
      sentMessages: [
        {
          id: "pend1",
          direction: "sent",
          counterpartyAddress: "ccx…",
          counterpartyName: "x",
          body: messages.encodeSmartMessage(
            "contact",
            "register",
            "i",
            "e",
            "r",
          ),
          hasBody: true,
          paymentIdFrom: null,
          paymentIdTo: "abc",
          timestamp: "2026-01-01T00:00:00.000Z",
          unread: false,
          blockHeight: 0,
          threadKey: "t",
        },
      ],
      receivedMessages: [
        {
          id: "pend2",
          direction: "received",
          counterpartyAddress: "recv:pid",
          counterpartyName: "PID",
          body: messages.encodeSmartMessage(
            "contact",
            "revoke",
            "i",
            "r",
            "room_revoked",
          ),
          hasBody: true,
          paymentIdFrom: "pid",
          paymentIdTo: null,
          timestamp: "2026-01-01T00:01:00.000Z",
          unread: true,
          blockHeight: 0,
          threadKey: "t",
        },
      ],
      pendingTransactions: [
        {
          hash: "pend1",
          amountAtomic: 1000,
          timestampIso: "2026-01-01T00:00:00.000Z",
          type: "message",
          spentKeyImages: ["ki"],
        },
      ],
      incomingPending: [
        {
          hash: "pend2",
          amountAtomic: 1000,
          createdAt: Date.parse("2026-01-01T00:01:00.000Z"),
        },
      ],
    } as unknown as RawWalletV1;

    const txs = mapWalletTransactions([], raw);
    const out = txs.find((t) => t.hash === "pend1");
    const inn = txs.find((t) => t.hash === "pend2");
    expect(out?.zeroConf).toBe(true);
    expect(out?.state).toBe("pending");
    expect(out?.contactHint?.action).toBe("register");
    expect(inn?.zeroConf).toBe(true);
    expect(inn?.contactHint?.action).toBe("revoke");
  });

  it("keeps mined 0-amount relays in history even without SDK outputs", () => {
    const raw = {
      sentMessages: [],
      receivedMessages: [
        {
          id: "relay-mined",
          direction: "received",
          counterpartyAddress: "ccx…",
          counterpartyName: "Alice",
          body: "hello",
          hasBody: true,
          paymentIdFrom: "pid",
          paymentIdTo: null,
          timestamp: "2026-08-17T12:00:00.000Z",
          unread: true,
          blockHeight: 1_234_567,
          threadKey: "t",
        },
      ],
      pendingTransactions: [],
      incomingPending: [],
    } as unknown as RawWalletV1;

    const [tx] = mapWalletTransactions([], raw);
    expect(tx.hash).toBe("relay-mined");
    expect(tx.amount).toBe(0);
    expect(tx.state).toBe("confirmed");
    expect(tx.zeroConf).toBeUndefined();
    expect(tx.type).toBe("incoming");
  });
});
