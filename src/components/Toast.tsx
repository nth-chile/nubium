import { useState, useEffect, useSyncExternalStore } from "react";

type ToastType = "info" | "error" | "success";

interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
}

let nextId = 0;
let toasts: ToastMessage[] = [];
const listeners = new Set<() => void>();

function notify() {
  for (const cb of listeners) cb();
}

export function showToast(message: string, type: ToastType = "info") {
  const id = nextId++;
  toasts = [...toasts, { id, message, type }];
  notify();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  }, 3000);
}

const typeStyles: Record<ToastType, string> = {
  info: "bg-muted text-foreground border-border",
  success: "bg-muted text-foreground border-green-600/40",
  error: "bg-muted text-foreground border-red-600/40",
};

export function ToastContainer() {
  const items = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => toasts,
  );

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none">
      {items.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: ToastMessage }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => setVisible(false), 2600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`px-4 py-2 rounded-md border shadow-lg text-sm transition-all duration-300 ${typeStyles[toast.type]} ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      {toast.message}
    </div>
  );
}
