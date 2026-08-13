export type PresetOption = {
  label: string;
  value: number;
};

export const INVITE_EXPIRY_PRESETS: readonly PresetOption[] = [
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const).map((h) => ({
    value: h,
    label: h === 1 ? "1 hour" : `${h} hours`,
  })),
  { value: 24, label: "1 day" },
  { value: 48, label: "2 days" },
  { value: 72, label: "3 days" },
  { value: 168, label: "1 week" },
];

export const ROOM_TTL_PRESETS: readonly PresetOption[] = [
  ...([1, 2, 3, 4, 5, 6, 7] as const).map((d) => ({
    value: d,
    label: d === 1 ? "1 day" : `${d} days`,
  })),
  { value: 14, label: "2 weeks" },
  { value: 21, label: "3 weeks" },
  { value: 30, label: "1 month" },
];

export const DEFAULT_INVITE_EXPIRY_HOURS = 24;
export const DEFAULT_ROOM_TTL_DAYS = 7;

export function presetIndexForValue(
  options: readonly PresetOption[],
  value: number,
): number {
  const i = options.findIndex((o) => o.value === value);
  return i >= 0 ? i : 0;
}
