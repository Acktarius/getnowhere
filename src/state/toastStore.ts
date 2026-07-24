/**
 * Lightweight in-app toasts (no sonner dependency).
 */
import { create } from "zustand";

export type ToastVariant = "error" | "info" | "success";

export type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
};

type ToastStore = {
  items: ToastItem[];
  push: (message: string, variant?: ToastVariant, ttlMs?: number) => void;
  dismiss: (id: string) => void;
};

let seq = 0;

export const useToastStore = create<ToastStore>((set, get) => ({
  items: [],
  push(message, variant = "info", ttlMs = 6_000) {
    const id = `t${++seq}`;
    set((s) => ({
      items: [...s.items.slice(-4), { id, message, variant }],
    }));
    window.setTimeout(() => {
      get().dismiss(id);
    }, ttlMs);
  },
  dismiss(id) {
    set((s) => ({ items: s.items.filter((t) => t.id !== id) }));
  },
}));

export function toastError(message: string, ttlMs = 10_000): void {
  useToastStore.getState().push(message, "error", ttlMs);
}

export function toastInfo(message: string): void {
  useToastStore.getState().push(message, "info");
}

export function toastSuccess(message: string): void {
  useToastStore.getState().push(message, "success", 4_000);
}
