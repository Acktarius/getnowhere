import { Send, Wifi, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChatRoomHeader } from "@/components/ChatRoomHeader";
import { EmptyState } from "@/components/EmptyState";
import { MessageBubble } from "@/components/MessageBubble";
import { Sheet } from "@/components/Sheet";
import { getMessagesForRoom } from "@/services/mock/MockChatTransport";
import { useChatStore } from "@/state/chatStore";
import { useContactsStore } from "@/state/contactsStore";

export function ChatRoomScreen() {
  const { roomId = "" } = useParams();
  const openRoom = useChatStore((s) => s.openRoom);
  const subscribeRoom = useChatStore((s) => s.subscribeRoom);
  const send = useChatStore((s) => s.send);
  const setMessages = useChatStore((s) => s.setMessages);
  const room = useChatStore((s) => s.rooms.find((r) => r.id === roomId));
  const messages = useChatStore((s) => s.messagesByRoom[roomId] ?? []);
  const contact = useContactsStore((s) =>
    s.contacts.find((c) => c.id === room?.contactId),
  );

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      await openRoom(roomId);
      setMessages(roomId, getMessagesForRoom(roomId));
      unsub = subscribeRoom(roomId);
    })();
    return () => unsub?.();
  }, [roomId, openRoom, subscribeRoom, setMessages]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  if (!room || !contact) {
    return (
      <div className="screen">
        <ChatRoomHeader
          contact={{
            id: "",
            alias: "Unknown",
            ccxAddress: "",
            paymentIdFrom: "",
            relationshipStatus: "pending",
            inviteStatus: "none",
            chatStatus: "unavailable",
            createdAt: "",
            updatedAt: "",
          }}
          peerStatus="offline"
          roomId={roomId}
        />
        <EmptyState
          title="Room unavailable"
          body="This room could not be loaded."
          action={
            <Link className="btn btn--sm btn--secondary" to="/chats">
              Back to chats
            </Link>
          }
        />
      </div>
    );
  }

  async function handleSend() {
    if (!draft.trim()) return;
    setSending(true);
    const text = draft.trim();
    setDraft("");
    try {
      await send(roomId, text);
    } finally {
      setSending(false);
    }
  }

  const offline = room.peerStatus === "offline";

  return (
    <div className="screen" style={{ paddingBottom: 0 }}>
      <ChatRoomHeader
        contact={contact}
        peerStatus={room.peerStatus}
        roomId={roomId}
        onShowDiagnostics={() => setDiagOpen(true)}
      />
      <div
        ref={scrollerRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 14px 8px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {messages.length === 0 ? (
          <EmptyState
            title="Encrypted room ready"
            body="This is a peer-to-peer room — no central server stores these messages. Say hello."
          />
        ) : (
          <>
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
          </>
        )}
      </div>

      <div
        style={{
          padding: "10px 12px calc(env(safe-area-inset-bottom) + 10px)",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-elev)",
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
        }}
      >
        <input
          className="input grow"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={
            offline
              ? "Peer offline — messages may not arrive"
              : "Type a message"
          }
          disabled={sending}
        />
        <button
          className="btn btn--primary no-shrink"
          onClick={handleSend}
          disabled={sending || !draft.trim()}
          style={{ height: 44, width: 44, padding: 0 }}
        >
          <Send size={17} />
        </button>
      </div>

      <Sheet
        open={diagOpen}
        title="Room diagnostics"
        onClose={() => setDiagOpen(false)}
      >
        <div className="stack stack--gap-3">
          <div className="card card--pad-md stack stack--gap-2">
            <DiagRow label="Room ID" value={room.id} />
            <DiagRow label="Bootstrap source" value={room.bootstrapSource} />
            <DiagRow label="Room key ref" value={room.roomKeyRef} mono />
            <DiagRow label="Peer status" value={room.peerStatus} />
            <DiagRow
              label="Created"
              value={new Date(room.createdAt).toLocaleString()}
            />
          </div>
          <div className="card card--pad-md">
            <div className="card__title">Layer notice</div>
            <p className="muted" style={{ fontSize: 13 }}>
              Messages in this room travel peer-to-peer and are not stored on
              the Conceal blockchain. The blockchain layer was used only to
              bootstrap the relationship and deliver the invite.
            </p>
            <div className="row-flex" style={{ gap: 8, marginTop: 10 }}>
              {offline ? (
                <WifiOff size={16} style={{ color: "var(--danger)" }} />
              ) : (
                <Wifi size={16} style={{ color: "var(--primary)" }} />
              )}
              <span className="faint" style={{ fontSize: 12 }}>
                {offline
                  ? "Peer appears offline. The future Holepunch adapter handles reconnection."
                  : "Peer session active."}
              </span>
            </div>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

function DiagRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="row-flex row-flex--between" style={{ gap: 12 }}>
      <span className="faint" style={{ fontSize: 12 }}>
        {label}
      </span>
      <span
        className={`${mono ? "mono" : ""}`}
        style={{ fontSize: 11.5, wordBreak: "break-all", textAlign: "right" }}
      >
        {value}
      </span>
    </div>
  );
}
