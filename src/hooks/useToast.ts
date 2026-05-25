import * as React from 'react';
import type { ToastProps } from '@/components/ui/toast';

type ToastVariant = 'default' | 'destructive' | 'success' | 'warning';

interface ToastData extends Omit<ToastProps, 'title'> {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: ToastVariant;
  duration?: number;
}

type ToastInput = Omit<ToastData, 'id'>;

const listeners: ((toasts: ToastData[]) => void)[] = [];
let memoryToasts: ToastData[] = [];

function notify() {
  listeners.forEach((l) => l(memoryToasts));
}

export function toast(t: ToastInput) {
  const id = Math.random().toString(36).slice(2);
  const item: ToastData = {
    id,
    duration: 4000,
    variant: 'default',
    ...t,
  };
  memoryToasts = [item, ...memoryToasts].slice(0, 5);
  notify();
  // Auto-remoção redundante (Toast component já fecha, mas garantimos)
  setTimeout(() => dismiss(id), (item.duration ?? 4000) + 500);
  return id;
}

export function dismiss(id?: string) {
  memoryToasts = id ? memoryToasts.filter((t) => t.id !== id) : [];
  notify();
}

export function useToast() {
  const [toasts, setToasts] = React.useState<ToastData[]>(memoryToasts);
  React.useEffect(() => {
    listeners.push(setToasts);
    return () => {
      const i = listeners.indexOf(setToasts);
      if (i > -1) listeners.splice(i, 1);
    };
  }, []);
  return { toasts, toast, dismiss };
}
