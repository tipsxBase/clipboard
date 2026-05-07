import { create } from 'zustand';

export interface ConfirmOptions {
  title?: string;
  description?: string;
  cancelText?: string;
  actionText?: string;
  variant?: 'default' | 'destructive';
}

interface ConfirmTask {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

interface ConfirmState {
  isOpen: boolean;
  title: string;
  description: string;
  cancelText: string;
  actionText: string;
  variant: 'default' | 'destructive';
  currentResolve: ((value: boolean) => void) | null;
  queue: ConfirmTask[];
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  handleResult: (result: boolean) => void;
  processQueue: () => void;
}

const defaultState: Pick<
  ConfirmState,
  | 'isOpen'
  | 'title'
  | 'description'
  | 'cancelText'
  | 'actionText'
  | 'variant'
  | 'currentResolve'
  | 'queue'
> = {
  isOpen: false,
  title: '',
  description: '',
  cancelText: '取消',
  actionText: '确定',
  variant: 'default' as const,
  currentResolve: null,
  queue: [],
};

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  ...defaultState,
  confirm: (options) =>
    new Promise((resolve) => {
      set((state) => ({
        queue: [...state.queue, { options, resolve }],
      }));
      queueMicrotask(() => get().processQueue());
    }),
  processQueue: () => {
    const state = get();
    if (state.isOpen || state.queue.length === 0) return;

    const [task, ...queue] = state.queue;

    set({
      queue,
      title: task.options.title || '确认操作',
      description: task.options.description || '',
      cancelText: task.options.cancelText || '取消',
      actionText: task.options.actionText || '确定',
      variant: task.options.variant || 'default',
      currentResolve: task.resolve,
      isOpen: true,
    });
  },
  handleResult: (result) => {
    const resolve = get().currentResolve;

    set({
      isOpen: false,
      currentResolve: null,
    });

    window.setTimeout(() => {
      resolve?.(result);
      get().processQueue();
    }, 300);
  },
}));

export function confirm(options: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().confirm(options);
}
