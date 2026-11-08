import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, CircleAlert } from 'lucide-react';

interface ToastItem {
  id: number;
  message: string;
  tone: 'ok' | 'bad';
  action?: { label: string; run: () => void };
}

interface ToastApi {
  show: (message: string, options?: { tone?: 'ok' | 'bad'; action?: ToastItem['action']; duration?: number }) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const counter = useRef(0);

  const show = useCallback<ToastApi['show']>((message, options = {}) => {
    window.clearTimeout(timer.current);
    const id = ++counter.current;
    setToast({ id, message, tone: options.tone ?? 'ok', action: options.action });
    timer.current = window.setTimeout(() => setToast((t) => (t?.id === id ? null : t)), options.duration ?? 2200);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
        {toast && (
          <div
            key={toast.id}
            className="toast-enter pointer-events-auto flex max-w-full items-center gap-2.5 rounded-[10px] bg-ink py-2 pr-2 pl-3 text-small font-medium text-cream shadow-raised"
          >
            {toast.tone === 'ok' ? (
              <Check size={15} className="shrink-0 text-[#9ea4ff]" aria-hidden />
            ) : (
              <CircleAlert size={15} className="shrink-0 text-[#ff9d8f]" aria-hidden />
            )}
            <span className="min-w-0 truncate pr-1">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.run();
                  setToast(null);
                }}
                className="rounded-[6px] px-2 py-1 font-semibold text-[#b9bdff] hover:bg-white/10"
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
