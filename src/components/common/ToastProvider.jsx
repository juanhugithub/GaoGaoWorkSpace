import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

const DEFAULT_DURATION = 3200;
const ToastContext = createContext(null);

const TOAST_TONE_META = {
  info: {
    icon: Info,
    panelClassName: "border-blue-200 bg-white text-gray-900",
    iconClassName: "text-blue-600",
  },
  success: {
    icon: CheckCircle2,
    panelClassName: "border-emerald-200 bg-white text-gray-900",
    iconClassName: "text-emerald-600",
  },
  warning: {
    icon: TriangleAlert,
    panelClassName: "border-amber-200 bg-white text-gray-900",
    iconClassName: "text-amber-500",
  },
  error: {
    icon: AlertCircle,
    panelClassName: "border-red-200 bg-white text-gray-900",
    iconClassName: "text-red-600",
  },
};

let toastSequence = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timeoutMapRef = useRef(new Map());

  function dismissToast(id) {
    const timeoutId = timeoutMapRef.current.get(id);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutMapRef.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function showToast(input) {
    const id = `toast-${Date.now()}-${toastSequence++}`;
    const toast = {
      id,
      title: input.title || "",
      description: input.description || "",
      tone: input.tone || "info",
      duration: input.duration ?? DEFAULT_DURATION,
    };

    setToasts((current) => [...current, toast]);
    if (toast.duration > 0) {
      const timeoutId = window.setTimeout(() => dismissToast(id), toast.duration);
      timeoutMapRef.current.set(id, timeoutId);
    }

    return id;
  }

  useEffect(() => {
    return () => {
      timeoutMapRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeoutMapRef.current.clear();
    };
  }, []);

  const contextValue = useMemo(
    () => ({
      dismissToast,
      showToast,
    }),
    [],
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}

      <div className="pointer-events-none fixed right-5 top-5 z-[90] flex w-full max-w-sm flex-col gap-3">
        {toasts.map((toast) => {
          const meta = TOAST_TONE_META[toast.tone] ?? TOAST_TONE_META.info;
          const Icon = meta.icon;
          return (
            <div
              key={toast.id}
              role={toast.tone === "error" ? "alert" : "status"}
              className={`pointer-events-auto rounded-3xl border px-4 py-4 shadow-xl shadow-black/5 backdrop-blur ${meta.panelClassName}`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 shrink-0 ${meta.iconClassName}`}>
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  {toast.title && <div className="text-sm font-bold text-gray-900">{toast.title}</div>}
                  {toast.description && (
                    <div className={`text-sm text-gray-600 ${toast.title ? "mt-1" : ""}`}>{toast.description}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="rounded-xl p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  aria-label="关闭通知"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
