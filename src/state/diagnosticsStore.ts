import { create } from "zustand";
import type { DiagnosticsEntry } from "@/types/models";
import { uid } from "@/utils/format";

type DiagnosticsStore = {
  entries: DiagnosticsEntry[];
  log: (
    level: DiagnosticsEntry["level"],
    source: string,
    message: string,
  ) => void;
  clear: () => void;
};

const MAX_ENTRIES = 200;

export const useDiagnosticsStore = create<DiagnosticsStore>((set) => ({
  entries: [],
  log: (level, source, message) =>
    set((s) => ({
      entries: [
        {
          id: uid("diag"),
          level,
          source,
          message,
          timestamp: new Date().toISOString(),
        },
        ...s.entries,
      ].slice(0, MAX_ENTRIES),
    })),
  clear: () => set({ entries: [] }),
}));
