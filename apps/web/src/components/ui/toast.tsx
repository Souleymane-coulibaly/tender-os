"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { ALERT_TONE_CONFIG, type AlertTone } from "./alert";
import { CloseIcon } from "./icons";

type ToastItem = { id: number; tone: AlertTone; title: string; description?: string | undefined };
type ToastContextValue = { show: (input: { tone?: AlertTone | undefined; title: string; description?: string | undefined }) => void };

const ToastContext = createContext<ToastContextValue | null>(null);
const AUTO_DISMISS_MS = 5000;

/**
 * Design System Checkpoint B (Core Primitives) — mission §21, feedback éphémère GLOBAL (distinct
 * d'`Alert`, qui reste affiché tant que la condition persiste). Contexte React minimal, zéro
 * dépendance externe (mission §45) — même palette/icônes qu'`Alert` (`ALERT_TONE_CONFIG`, jamais un
 * second mapping couleur dupliqué).
 *
 * IMPORTANT (portée de ce Checkpoint) — ce Provider n'est PAS encore monté dans un layout réel
 * (`RootLayout`/`AppShell`) : le câblage dans la coquille applicative relève du Checkpoint C (App
 * Shell), jamais une modification d'écran métier prématurée ici (mission §38/§39).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (input: { tone?: AlertTone | undefined; title: string; description?: string | undefined }) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, tone: input.tone ?? "info", title: input.title, description: input.description }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-4 sm:items-end">
        {toasts.map((toast) => {
          const config = ALERT_TONE_CONFIG[toast.tone];
          const Icon = config.icon;
          return (
            <div key={toast.id} role="status" className={`pointer-events-auto flex w-full items-start gap-3 rounded-lg border p-4 text-sm shadow-lg sm:max-w-sm ${config.classes}`}>
              <Icon className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{toast.title}</p>
                {toast.description ? <p className="mt-0.5 opacity-90">{toast.description}</p> : null}
              </div>
              <button type="button" onClick={() => dismiss(toast.id)} aria-label="Fermer" className="shrink-0 opacity-70 transition hover:opacity-100">
                <CloseIcon size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a <ToastProvider>.");
  return context;
}
