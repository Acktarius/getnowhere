import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  value?: ReactNode;
  on?: boolean;
  onToggle?: (next: boolean) => void;
  trailing?: ReactNode;
  icon?: LucideIcon;
};

/**
 * Settings toggle row. Uses standard `.row` horizontal padding so it aligns
 * inside `card--flush` with other settings rows (Sync, Advanced, Privacy).
 */
export function PrivacySettingItem({
  title,
  description,
  value,
  on,
  onToggle,
  trailing,
  icon: Icon,
}: Props) {
  return (
    <div className="row privacy-setting-item">
      {Icon ? (
        <div className="privacy-setting-item__icon" aria-hidden>
          <Icon size={17} />
        </div>
      ) : null}
      <div className="grow stack stack--gap-1" style={{ minWidth: 0 }}>
        <span className="privacy-setting-item__title">{title}</span>
        {description ? (
          <span className="privacy-setting-item__desc field__hint">
            {description}
          </span>
        ) : null}
        {value ? <div style={{ marginTop: 4 }}>{value}</div> : null}
      </div>
      {onToggle ? (
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={title}
          onClick={() => onToggle(!on)}
          className="privacy-setting-item__switch"
          data-on={on ? "true" : "false"}
        >
          <span className="privacy-setting-item__knob" />
        </button>
      ) : (
        trailing
      )}
    </div>
  );
}
