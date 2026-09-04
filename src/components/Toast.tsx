import { createContext, useCallback, useContext, useState } from "react";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

let nextToastId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = nextToastId++;
    setToasts((prev) => [...prev, { id, type, message }]);
    // Auto-dismiss after 6 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const iconFor = (type: ToastType) =>
    type === "success" ? "✅" : type === "error" ? "❌" : "ℹ️";

  const styleFor = (type: ToastType) =>
    type === "success"
      ? "bg-green-600 text-white"
      : type === "error"
        ? "bg-red-600 text-white"
        : "bg-gray-800 text-white";

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast container - fixed top-right, above everything */}
      <div className="fixed top-4 right-4 z-[10000] flex flex-col gap-2 w-96 max-w-[90vw]">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast-enter flex items-start gap-3 px-4 py-3 rounded-lg shadow-xl text-sm ${styleFor(toast.type)}`}
          >
            <span className="shrink-0">{iconFor(toast.type)}</span>
            <span className="flex-1 break-words whitespace-pre-wrap">
              {toast.message}
            </span>
            <button
              onClick={() => dismiss(toast.id)}
              className="shrink-0 opacity-60 hover:opacity-100 text-lg leading-none"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
