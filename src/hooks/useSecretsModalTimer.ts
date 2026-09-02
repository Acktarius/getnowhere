import { useCallback, useEffect, useRef, useState } from "react";

/** Fade window before Need more time enables. Measured from SeedRevealModal. */
export const FADE_MS = 30_000;
/** Extra window after fade before auto-close. Measured from SeedRevealModal. */
export const GRACE_MS = 5_000;

type Options = {
  open: boolean;
  onClose: () => void;
};

type Result = {
  needMoreEnabled: boolean;
  needMoreOpacity: number;
  requestMoreTime: () => void;
  fadeMs: number;
};

/** 30s fade + 5s grace for secrets / export-QR Need more time controls. */
export function useSecretsModalTimer({ open, onClose }: Options): Result {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [cycle, setCycle] = useState(0);
  const [needMoreEnabled, setNeedMoreEnabled] = useState(false);
  const [needMoreOpacity, setNeedMoreOpacity] = useState(0);

  useEffect(() => {
    if (!open) {
      setNeedMoreEnabled(false);
      setNeedMoreOpacity(0);
      return;
    }

    setNeedMoreEnabled(false);
    setNeedMoreOpacity(0);

    const kickFade = setTimeout(() => {
      setNeedMoreOpacity(1);
    }, 0);

    const enableTimer = setTimeout(() => {
      setNeedMoreEnabled(true);
      setNeedMoreOpacity(1);
    }, FADE_MS);

    const graceTimer = setTimeout(() => {
      onCloseRef.current();
    }, FADE_MS + GRACE_MS);

    return () => {
      clearTimeout(kickFade);
      clearTimeout(enableTimer);
      clearTimeout(graceTimer);
    };
  }, [open, cycle]);

  const requestMoreTime = useCallback(() => {
    if (!needMoreEnabled) return;
    setCycle((c) => c + 1);
  }, [needMoreEnabled]);

  return {
    needMoreEnabled,
    needMoreOpacity,
    requestMoreTime,
    fadeMs: FADE_MS,
  };
}
