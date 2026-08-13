import { useEffect, useRef } from "react";
import { getChatTopicTileMaskUrl } from "@/lib/chatTopicTiles";
import type { RoomTopicId } from "@/services/protocol/roomTopics";

type Props = {
  topicId?: RoomTopicId;
};

/** Keet-style tiled topic wallpaper; fixed layer behind chat messages. */
export function ChatTopicBackdrop({ topicId }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty(
      "--chat-topic-tile",
      `url("${getChatTopicTileMaskUrl(topicId)}")`,
    );
  }, [topicId]);

  return <div ref={ref} className="chat-topic-backdrop" aria-hidden />;
}
