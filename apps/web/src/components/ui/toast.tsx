import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Bell, CheckCircle2, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  body?: string;
}

const ToastContext = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});

const ICON = { success: CheckCircle2, error: XCircle, info: Bell };
const TONE = {
  success: 'text-success',
  error: 'text-destructive',
  info: 'text-primary',
};

/** Small stacked toasts, top of the screen on mobile, bottom-start on desktop. Auto-dismiss after 5 s. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = (id: number) => setToasts((ts) => ts.filter((t) => t.id !== id));
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
    setTimeout(() => dismiss(id), 5000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-3 md:inset-x-auto md:start-5 md:top-auto md:bottom-5 md:items-start"
      >
        {toasts.map((t) => {
          const Icon = ICON[t.tone];
          return (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-popover p-3.5 text-popover-foreground shadow-pop"
            >
              <Icon className={cn('mt-0.5 size-5 shrink-0', TONE[t.tone])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t.title}</p>
                {t.body && <p className="mt-0.5 text-sm text-muted-foreground">{t.body}</p>}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-muted"
                aria-label="إغلاق"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
