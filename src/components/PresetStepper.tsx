import { Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import type { PresetOption } from "@/lib/roomTtlPresets";
import { presetIndexForValue } from "@/lib/roomTtlPresets";

const HOLD_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 80;

type Props = {
  label: string;
  options: readonly PresetOption[];
  value: number;
  onChange: (value: number) => void;
  hint?: string;
};

/** Fixed preset list with − / +; hold either button to cycle faster. */
export function PresetStepper({
  label,
  options,
  value,
  onChange,
  hint,
}: Props) {
  const index = presetIndexForValue(options, value);
  const current = options[index];
  const atMin = index <= 0;
  const atMax = index >= options.length - 1;

  const repeatTimer = useRef<number | null>(null);
  const repeatInterval = useRef<number | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const clearRepeat = useCallback(() => {
    if (repeatTimer.current !== null) {
      window.clearTimeout(repeatTimer.current);
      repeatTimer.current = null;
    }
    if (repeatInterval.current !== null) {
      window.clearInterval(repeatInterval.current);
      repeatInterval.current = null;
    }
  }, []);

  const step = useCallback(
    (delta: -1 | 1) => {
      const i = presetIndexForValue(options, valueRef.current);
      const nextIndex = i + delta;
      if (nextIndex < 0 || nextIndex >= options.length) {
        clearRepeat();
        return;
      }
      onChange(options[nextIndex].value);
    },
    [clearRepeat, onChange, options],
  );

  useEffect(() => clearRepeat, [clearRepeat]);

  function bindRepeat(delta: -1 | 1, disabled: boolean) {
    return {
      onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
        if (disabled) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        step(delta);
        clearRepeat();
        repeatTimer.current = window.setTimeout(() => {
          repeatInterval.current = window.setInterval(() => {
            step(delta);
          }, REPEAT_INTERVAL_MS);
        }, HOLD_DELAY_MS);
      },
      onPointerUp: clearRepeat,
      onPointerLeave: clearRepeat,
      onPointerCancel: clearRepeat,
    };
  }

  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="preset-stepper">
        <button
          type="button"
          className="btn btn--secondary preset-stepper__btn"
          aria-label={`Previous ${label}`}
          disabled={atMin}
          {...bindRepeat(-1, atMin)}
        >
          <Minus size={16} />
        </button>
        <output className="preset-stepper__value" aria-live="polite">
          {current.label}
        </output>
        <button
          type="button"
          className="btn btn--secondary preset-stepper__btn"
          aria-label={`Next ${label}`}
          disabled={atMax}
          {...bindRepeat(1, atMax)}
        >
          <Plus size={16} />
        </button>
      </div>
      {hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  );
}
