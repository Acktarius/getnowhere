import type { ChatMessage } from "@/types/models";

/** Merge a content envelope into the room transcript (edit/delete patch targets). */
export function mergeContentMessage(
  list: ChatMessage[],
  msg: ChatMessage,
): ChatMessage[] {
  if (msg.kind === "edit" && msg.targetMessageId) {
    const editedAt = msg.editedAt ?? msg.createdAt;
    const idx = list.findIndex((m) => m.id === msg.targetMessageId);
    if (idx < 0) return list;
    const next = [...list];
    next[idx] = { ...next[idx], text: msg.text, editedAt };
    return next;
  }
  if (msg.kind === "delete" && msg.targetMessageId) {
    const deletedAt = msg.deletedAt ?? msg.createdAt;
    const idx = list.findIndex((m) => m.id === msg.targetMessageId);
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
    const next = [...list];
    next[idx] = msg;
    return next;
  }
  return [...list, msg];
}
