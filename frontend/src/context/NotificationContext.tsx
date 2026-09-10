import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, Info, X } from 'lucide-react';

type NoticeKind = 'info' | 'success' | 'error';

interface Notice {
  id: number;
  message: string;
  kind: NoticeKind;
}

interface NotificationContextValue {
  notify: (message: string, kind?: NoticeKind) => void;
  confirmAction: (message: string, title?: string) => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [confirmation, setConfirmation] = useState<{ message: string; title: string } | null>(null);
  const resolver = useRef<((accepted: boolean) => void) | null>(null);
  const nextId = useRef(1);

  const notify = useCallback((message: string, kind: NoticeKind = 'info') => {
    const id = nextId.current++;
    setNotices(current => [...current, { id, message, kind }].slice(-4));
    window.setTimeout(() => setNotices(current => current.filter(notice => notice.id !== id)), 4500);
  }, []);

  const confirmAction = useCallback((message: string, title = 'Please confirm') => new Promise<boolean>(resolve => {
    resolver.current?.(false);
    resolver.current = resolve;
    setConfirmation({ message, title });
  }), []);

  const finishConfirmation = (accepted: boolean) => {
    resolver.current?.(accepted);
    resolver.current = null;
    setConfirmation(null);
  };

  useEffect(() => {
    const nativeAlert = window.alert;
    window.alert = (message?: unknown) => notify(String(message ?? ''), /fail|error|could not|unable/i.test(String(message)) ? 'error' : 'success');
    return () => { window.alert = nativeAlert; };
  }, [notify]);

  useEffect(() => () => resolver.current?.(false), []);

  return (
    <NotificationContext.Provider value={{ notify, confirmAction }}>
      {children}
      <div className="fixed right-4 top-4 z-[120] w-[min(380px,calc(100vw-2rem))] space-y-2" aria-live="polite">
        {notices.map(notice => {
          const Icon = notice.kind === 'error' ? AlertTriangle : notice.kind === 'success' ? CheckCircle : Info;
          const colour = notice.kind === 'error' ? 'border-red-500/30 text-red-200' : notice.kind === 'success' ? 'border-emerald-500/30 text-emerald-100' : 'border-sky-500/30 text-sky-100';
          return (
            <div key={notice.id} className={`flex items-start gap-3 rounded-xl border bg-[#27083D] px-4 py-3 shadow-2xl ${colour}`}>
              <Icon size={18} className="mt-0.5 shrink-0" />
              <p className="flex-1 text-sm leading-5">{notice.message}</p>
              <button onClick={() => setNotices(current => current.filter(item => item.id !== notice.id))} aria-label="Dismiss notification"><X size={16} /></button>
            </div>
          );
        })}
      </div>
      {confirmation && (
        <div className="fixed inset-0 z-[130] grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="crm-confirm-title">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-input)] bg-[var(--bg-card)] p-6 shadow-2xl">
            <h2 id="crm-confirm-title" className="text-lg font-semibold text-[var(--text-primary)]">{confirmation.title}</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{confirmation.message}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button className="rounded-lg border border-[var(--border-input)] px-4 py-2 text-sm text-[var(--text-secondary)]" onClick={() => finishConfirmation(false)}>Cancel</button>
              <button className="rounded-lg bg-[#DC006D] px-4 py-2 text-sm font-semibold text-white" onClick={() => finishConfirmation(true)}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  );
}

// Shared with event handlers throughout the CRM; keeping it beside the provider
// prevents a second context instance during hot reload.
// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within NotificationProvider');
  return context;
}
