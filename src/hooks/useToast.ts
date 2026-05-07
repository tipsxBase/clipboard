import { useToastStore } from '@/stores/toastStore';

export function useToast() {
  const toastMessage = useToastStore((state) => state.toastMessage);
  const showToast = useToastStore((state) => state.showToast);
  const clearToast = useToastStore((state) => state.clearToast);

  return {
    toastMessage,
    showToast,
    clearToast,
  };
}
