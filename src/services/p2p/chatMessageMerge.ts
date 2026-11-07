import type { ChatMessage } from "@/types/models";

/** Edit or delete only a row the sender owns. @see docs/security/p2pchatprotocol.md */
export function mergeContentMessage(
  list: ChatMessage[],
  msg: ChatMessage,
): ChatMessage[] {
  if (msg.kind === "edit" && msg.targetMessageId) {
    const editedAt = msg.editedAt ?? msg.createdAt;
    const idx = list.findIndex(
      (m) => m.id === msg.targetMessageId && m.direction === msg.direction,
    );
    if (idx < 0) return list;
    const next = [...list];
    next[idx] = { ...next[idx], text: msg.text, editedAt };
    return next;
  }
  if (msg.kind === "delete" && msg.targetMessageId) {
    const deletedAt = msg.deletedAt ?? msg.createdAt;
    const idx = list.findIndex(
      (m) => m.id === msg.targetMessageId && m.direction === msg.direction,
    );
    if (idx < 0) return list;
    const next = [...list];
    next[idx] = {
      ...next[idx],
      text: "",
      deletedAt,
      kind: "delete",
    };
    return next;
  }
  const idx = list.findIndex((m) => m.id === msg.id);
  if (idx >= 0) {
    if (msg.direction !== "out" || list[idx]?.direction !== "out") return list;
    const next = [...list];
    next[idx] = msg;
    return next;
  }
  return [...list, msg];
}
