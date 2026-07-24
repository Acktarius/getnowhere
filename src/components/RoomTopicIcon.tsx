import {
  Briefcase,
  Heart,
  MessageSquare,
  Palmtree,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  roomTopicById,
  type RoomTopicId,
} from "@/services/protocol/roomTopics";

const ICONS: Record<RoomTopicDefIcon, LucideIcon> = {
  message: MessageSquare,
  work: Briefcase,
  family: Users,
  vacation: Palmtree,
  friends: Heart,
};

type RoomTopicDefIcon = "message" | "work" | "family" | "vacation" | "friends";

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
