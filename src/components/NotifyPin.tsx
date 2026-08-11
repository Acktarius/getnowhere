type Variant = "invite" | "register" | "relay" | "pending";

type Props = {
  count?: number;
  variant: Variant;
  /** Hide numeric label — dot only. */
  dot?: boolean;
  /** Mempool preview — match wallet tx pulse. */
  pulse?: boolean;
};

/** Session notification pin for contact / room list rows. */
export function NotifyPin({ count = 1, variant, dot, pulse }: Props) {
  if (count <= 0 && !dot) return null;
  const label = dot || count === 1 ? undefined : count > 99 ? "99+" : count;
  return (
    <span
      className={`notify-pin notify-pin--${variant}${label ? "" : " notify-pin--dot"}${pulse ? " notify-pin--pulse" : ""}`}
      aria-hidden
    >
      {label}
    </span>
  );
}
