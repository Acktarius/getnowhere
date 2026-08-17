/** User-set contact labels — not room topics or relationship status. */
export const CONTACT_CATEGORY_TAG_IDS = [
  "family",
  "friend",
  "love",
  "colleague",
  "neighbor",
  "one_night_stand",
] as const;

export type ContactCategoryTag = (typeof CONTACT_CATEGORY_TAG_IDS)[number];

export type ContactCategoryTagDef = {
  id: ContactCategoryTag;
  label: string;
  emoji?: string;
  /** Icon accent — CSS color (theme token). */
  accent?: string;
};

export const CONTACT_CATEGORY_TAGS: readonly ContactCategoryTagDef[] = [
  { id: "family", label: "Family", accent: "var(--accent)" },
  { id: "friend", label: "Friend", accent: "var(--info)" },
  { id: "love", label: "Love", accent: "var(--danger)" },
  { id: "colleague", label: "Colleague", accent: "var(--secondary)" },
  { id: "neighbor", label: "Neighbors", accent: "var(--primary)" },
  { id: "one_night_stand", label: "1_NS", emoji: "🍆" },
] as const;

/** Theme-aware accent for tag icons. */
export function contactCategoryTagAccent(
  tag: ContactCategoryTag,
): string | undefined {
  return CONTACT_CATEGORY_TAGS.find((t) => t.id === tag)?.accent;
}

const LEGACY_CONTACT_CATEGORY_TAGS: Record<string, ContactCategoryTag> = {
  work: "colleague",
};

function normalizeContactCategoryTag(value: unknown): ContactCategoryTag | null {
  if (typeof value !== "string") return null;
  const mapped = LEGACY_CONTACT_CATEGORY_TAGS[value] ?? value;
  return isContactCategoryTag(mapped) ? mapped : null;
}

export function isContactCategoryTag(
  value: unknown,
): value is ContactCategoryTag {
  return (
    typeof value === "string" &&
    (CONTACT_CATEGORY_TAG_IDS as readonly string[]).includes(value)
  );
}

export function contactCategoryTagLabel(
  tag: ContactCategoryTag | undefined,
): string | undefined {
  if (!tag) return undefined;
  return CONTACT_CATEGORY_TAGS.find((t) => t.id === tag)?.label;
}

/** Parse tags from storage — supports legacy single `categoryTag`. */
export function parseContactCategoryTags(
  tags: unknown,
  legacySingle?: unknown,
): ContactCategoryTag[] {
  const rawList = Array.isArray(tags)
    ? tags
    : typeof tags === "string"
      ? [tags]
      : [];
  const parsed = rawList
    .map(normalizeContactCategoryTag)
    .filter((tag): tag is ContactCategoryTag => tag !== null);
  if (parsed.length > 0) return [...new Set(parsed)];
  const legacy = normalizeContactCategoryTag(legacySingle);
  return legacy ? [legacy] : [];
}

export function toggleContactCategoryTag(
  current: ContactCategoryTag[],
  tag: ContactCategoryTag,
): ContactCategoryTag[] {
  if (current.includes(tag)) {
    return current.filter((t) => t !== tag);
  }
  return [...current, tag];
}

export function contactHasCategoryTag(
  contact: { categoryTags?: ContactCategoryTag[] },
  tag: ContactCategoryTag,
): boolean {
  return (contact.categoryTags ?? []).includes(tag);
}

export function contactMatchesCategoryTagFilter(
  contact: { categoryTags?: ContactCategoryTag[] },
  filterTags: ContactCategoryTag[],
): boolean {
  if (filterTags.length === 0) return true;
  const tags = contact.categoryTags ?? [];
  return filterTags.some((tag) => tags.includes(tag));
}
