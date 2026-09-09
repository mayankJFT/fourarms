import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface UIStore {
  toasts: Toast[];
  sidebarCollapsed: boolean;

  addToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
  toggleSidebar: () => void;

  // Convenience helpers
  toast: {
    success: (msg: string) => void;
    error: (msg: string) => void;
    info: (msg: string) => void;
    warning: (msg: string) => void;
  };
}

export const useUIStore = create<UIStore>()((set, get) => ({
  toasts: [],
  sidebarCollapsed: false,

  addToast: (message, type = 'info', duration = 4000) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    set((s) => ({ toasts: [...s.toasts, { id, type, message, duration }] }));
    if (duration > 0) {
      setTimeout(() => get().removeToast(id), duration);
    }
  },

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  toast: {
    success: (msg) => get().addToast(msg, 'success'),
    error: (msg) => get().addToast(msg, 'error'),
    info: (msg) => get().addToast(msg, 'info'),
    warning: (msg) => get().addToast(msg, 'warning'),
  },
}));
