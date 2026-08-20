import type { LucideIcon } from "lucide-react";
import { Briefcase, Heart, Home, User, Users } from "lucide-react";
import {
  CONTACT_CATEGORY_TAGS,
  type ContactCategoryTag,
  contactCategoryTagAccent,
  toggleContactCategoryTag,
} from "@/lib/contactCategoryTags";

const TAG_ICONS: Partial<Record<ContactCategoryTag, LucideIcon>> = {
  family: Users,
  friend: User,
  love: Heart,
  colleague: Briefcase,
  neighbor: Home,
};

type Props = {
  selected: ContactCategoryTag[];
  onChange: (next: ContactCategoryTag[]) => void;
  /** When true, show an "All" pill that clears tag filters (contacts list). */
  showAll?: boolean;
};

export function ContactCategoryTagPills({
  selected,
  onChange,
  showAll = false,
}: Props) {
  const allActive = showAll && selected.length === 0;

  return (
    <div
      className="row-flex"
      style={{ gap: 6, overflowX: "auto", paddingBottom: 4 }}
    >
      {showAll ? (
        <TagButton
          active={allActive}
          label="All"
          onClick={() => onChange([])}
        />
      ) : null}
      {CONTACT_CATEGORY_TAGS.map((tag) => {
        const Icon = TAG_ICONS[tag.id];
        const active = selected.includes(tag.id);
        return (
          <TagButton
            key={tag.id}
            tagId={tag.id}
            active={active}
            label={tag.label}
            icon={Icon}
            emoji={tag.emoji}
            onClick={() => onChange(toggleContactCategoryTag(selected, tag.id))}
          />
        );
      })}
    </div>
  );
}

function TagButton({
  tagId,
  active,
  label,
  icon: Icon,
  emoji,
  onClick,
}: {
  tagId?: ContactCategoryTag;
  active: boolean;
  label: string;
  icon?: LucideIcon;
  emoji?: string;
  onClick: () => void;
}) {
  const accent = tagId ? contactCategoryTagAccent(tagId) : undefined;

  return (
    <button
      type="button"
      className={`btn btn--sm btn--pill no-shrink ${active ? "btn--primary" : "btn--secondary"}`}
      onClick={onClick}
    >
      {emoji ? (
        <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>
          {emoji}
        </span>
      ) : Icon && tagId ? (
        <CategoryTagIcon tagId={tagId} icon={Icon} accent={accent} />
      ) : null}
      {label}
    </button>
  );
}

function CategoryTagIcon({
  tagId,
  icon: Icon,
  accent,
}: {
  tagId: ContactCategoryTag;
  icon: LucideIcon;
  accent?: string;
}) {
  const color = accent ?? "currentColor";

  if (tagId === "love") {
    return (
      <Heart
        size={14}
        aria-hidden
        style={{ color }}
        fill={color}
        stroke={color}
      />
    );
  }

  return <Icon size={14} aria-hidden style={{ color }} stroke={color} />;
}
