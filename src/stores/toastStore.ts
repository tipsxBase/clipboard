import { create } from 'zustand';

interface ToastState {
  toastMessage: string | null;
  showToast: (message: string) => void;
  clearToast: () => void;
}

let toastTimeout: number | null = null;

export const useToastStore = create<ToastState>((set) => ({
  toastMessage: null,
  showToast: (message) => {
    if (toastTimeout) {
      window.clearTimeout(toastTimeout);
    }

    set({ toastMessage: message });

    toastTimeout = window.setTimeout(() => {
      set({ toastMessage: null });
      toastTimeout = null;
    }, 2000);
  },
  clearToast: () => {
    if (toastTimeout) {
      window.clearTimeout(toastTimeout);
      toastTimeout = null;
    }
    set({ toastMessage: null });
  },
}));
