import {
  Briefcase,
  Heart,
  type LucideIcon,
  MessageSquare,
  Palmtree,
  Users,
  Wallet,
} from "lucide-react";
import {
  type RoomTopicId,
  roomTopicById,
} from "@/services/protocol/roomTopics";

const ICONS: Record<RoomTopicDefIcon, LucideIcon> = {
  message: MessageSquare,
  work: Briefcase,
  family: Users,
  vacation: Palmtree,
  friends: Heart,
  finance: Wallet,
};

type RoomTopicDefIcon =
  | "message"
  | "work"
  | "family"
  | "vacation"
  | "friends"
  | "finance";

export function RoomTopicIcon({
  topicId,
  size = 16,
  className,
}: {
  topicId?: RoomTopicId;
  size?: number;
  className?: string;
}) {
  const def = roomTopicById(topicId);
  const Icon = ICONS[def.icon];
  return <Icon size={size} className={className} aria-hidden />;
}

export function roomTopicLabel(topicId?: RoomTopicId): string {
  return roomTopicById(topicId).label;
}
