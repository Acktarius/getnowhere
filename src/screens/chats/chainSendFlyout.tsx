/**
 * Chain-fallback send: tap = TTL 0; long-press flyout = 60 / 6 / 0.
 * @see openspec/changes/l1-prime-ttl-relay/specs/l1-prime-ttl-relay/spec.md
 */
import { Hourglass, Link2, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** Spec ~2s hold before the TTL flyout appears. */
export const CHAIN_TTL_LONG_PRESS_MS = 1500;

const PRESET_MINUTES = [60, 6, 0] as const;
const FLYOUT_GAP_PX = 8;

export function showChainTtlFlyout(viaChain: boolean): boolean {
  return viaChain;
}

/** Duration 0 omits TTL (mined). Else unix expiry = now + duration. */
export function ttlUnixFromDuration(
  durationSeconds: number,
  nowSec: number,
): number | undefined {
  return durationSeconds > 0 ? nowSec + durationSeconds : undefined;
}

function flyoutAriaLabel(minutes: number): string {
  return minutes === 0 ? "Send" : `Send ${minutes}-minute TTL`;
}

function flyoutTestId(minutes: number): string {
  return `ttl-flyout-${minutes}`;
}

export function ChainSendFlyout({
  viaChain,
  onSend,
  disabled = false,
}: {
  viaChain: boolean;
  onSend: (durationSeconds: number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const holdTimer = useRef<number | null>(null);
  const openedByHold = useRef(false);

  useEffect(() => {
    if (!viaChain || disabled) setOpen(false);
  }, [viaChain, disabled]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);

  function clearHold() {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  function onPointerDown() {
    if (disabled || !showChainTtlFlyout(viaChain)) return;
    openedByHold.current = false;
    clearHold();
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      openedByHold.current = true;
      setOpen(true);
    }, CHAIN_TTL_LONG_PRESS_MS);
  }

  function pick(minutes: number) {
    openedByHold.current = false;
    onSend(minutes * 60);
  }

  function onPrimaryClick() {
    if (disabled) return;
    if (openedByHold.current) {
      openedByHold.current = false;
      return;
    }
    pick(0);
  }

  const flyoutOpen = open && showChainTtlFlyout(viaChain);

  return (
    <div
      ref={rootRef}
      style={{ position: "relative", zIndex: 10, flexShrink: 0, width: 56 }}
    >
      {flyoutOpen && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            gap: FLYOUT_GAP_PX,
            paddingBottom: FLYOUT_GAP_PX,
            zIndex: 10,
          }}
        >
          {PRESET_MINUTES.filter((m) => m > 0).map((minutes) => (
            <button
              key={minutes}
              type="button"
              className="btn btn--primary"
              data-testid={flyoutTestId(minutes)}
              aria-label={flyoutAriaLabel(minutes)}
              disabled={disabled}
              onClick={() => pick(minutes)}
              style={{
                width: "100%",
                height: 48,
                flexDirection: "column",
                gap: 2,
                padding: "5px 4px 4px",
              }}
            >
              <Hourglass size={20} aria-hidden style={{ flexShrink: 0 }} />
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  fontSize: 9,
                  fontWeight: 600,
                  lineHeight: 1,
                }}
              >
                {minutes}min
                <Link2 aria-hidden size={9} />
              </span>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="btn btn--primary"
        disabled={disabled}
        onClick={onPrimaryClick}
        onPointerDown={onPointerDown}
        onPointerUp={clearHold}
        onPointerLeave={clearHold}
        onPointerCancel={clearHold}
        aria-label={flyoutAriaLabel(0)}
        data-testid={flyoutOpen ? flyoutTestId(0) : undefined}
        style={{ position: "relative", width: "100%", padding: 0 }}
      >
        <Send size={16} />
        {viaChain && (
          <Link2
            aria-hidden
            size={11}
            style={{ position: "absolute", right: 4, bottom: 4 }}
          />
        )}
      </button>
    </div>
  );
}
