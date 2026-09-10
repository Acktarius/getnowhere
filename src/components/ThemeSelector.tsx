import { Lightbulb, Monitor, Moon, Sun } from "lucide-react";
import { PrivacySettingItem } from "@/components/PrivacySettingItem";
import { resolveAccentVars } from "@/lib/appearance/accentVars";
import { useSettingsStore } from "@/state/settingsStore";
import type { AccentName, AppTheme } from "@/types/models";

const THEMES: { value: AppTheme; label: string; icon: typeof Sun }[] = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
];

const ACCENT_SWATCHES: { value: AccentName; label: string }[] = [
  { value: "teal", label: "Teal" },
  { value: "blue", label: "Blue" },
  { value: "amber", label: "Amber" },
  { value: "violet", label: "Violet" },
  { value: "sky", label: "Sky" },
  { value: "pink", label: "Pink" },
];

/** Theme, accent, and contextual tips — Settings → Appearance. */
export function ThemeSelector() {
  const theme = useSettingsStore((s) => s.theme);
  const accent = useSettingsStore((s) => s.accent);
  const showTips = useSettingsStore((s) => s.showTips);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setAccent = useSettingsStore((s) => s.setAccent);
  const setShowTips = useSettingsStore((s) => s.setShowTips);

  return (
    <div className="section">
      <div className="section__head">
        <span className="section__title">Appearance</span>
      </div>
      <div className="card card--flush">
        <div
          className="row"
          style={{
            flexDirection: "column",
            alignItems: "stretch",
            gap: 10,
          }}
        >
          <div className="row__title">Theme</div>
          <div className="row-flex" style={{ flexWrap: "wrap", gap: 6 }}>
            {THEMES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                className={`btn btn--sm grow ${theme === value ? "btn--primary" : "btn--secondary"}`}
                onClick={() => setTheme(value)}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        </div>
        <hr className="divider divider--flush" />
        <div
          className="row"
          style={{
            flexDirection: "column",
            alignItems: "stretch",
            gap: 10,
          }}
        >
          <div className="row__title">Accent</div>
          <div className="row-flex" style={{ flexWrap: "wrap", gap: 10 }}>
            {ACCENT_SWATCHES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setAccent(value)}
                aria-label={label}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: resolveAccentVars(value, "dark")["--primary"],
                  border:
                    accent === value
                      ? "3px solid var(--text)"
                      : "3px solid transparent",
                  transition:
                    "border-color var(--dur) var(--ease), transform var(--dur) var(--ease)",
                  transform: accent === value ? "scale(1.08)" : "scale(1)",
                }}
              />
            ))}
          </div>
        </div>
        <hr className="divider divider--flush" />
        <PrivacySettingItem
          icon={Lightbulb}
          title="Tips"
          description="Show contextual hints"
          on={showTips}
          onToggle={setShowTips}
        />
      </div>
    </div>
  );
}
