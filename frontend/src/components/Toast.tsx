'use client';

import { useEffect } from 'react';

interface ToastProps {
  message: string | null;
  onClose: () => void;
  duration?: number;
  type?: 'success' | 'error' | 'info';
}

export function Toast({ message, onClose, duration = 3000, type = 'info' }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [message, duration, onClose]);

  if (!message) return null;

  const toneClass =
    type === 'success'
      ? 'border-budget-safe/80 bg-budget-safe/10 text-text-primary'
      : type === 'error'
        ? 'border-budget-critical/80 bg-budget-critical/10 text-text-primary'
        : 'border-app-border bg-app-panel text-text-primary';

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border px-4 py-3 shadow-lg ${toneClass}`}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}
