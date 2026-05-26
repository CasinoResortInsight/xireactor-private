// Minimal toast bus — call `toast.success("Saved")` / `toast.error("…")` from
// anywhere; the <ToastHost/> mounted once in App renders them.

import { useEffect, useState } from "react";

type ToastKind = "success" | "error";
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

let nextId = 1;
const items: ToastItem[] = [];
const listeners = new Set<(items: ToastItem[]) => void>();

function emit() {
  for (const l of listeners) l([...items]);
}

function push(kind: ToastKind, message: string) {
  const item: ToastItem = { id: nextId++, kind, message };
  items.push(item);
  emit();
  setTimeout(() => {
    const i = items.findIndex((t) => t.id === item.id);
    if (i >= 0) {
      items.splice(i, 1);
      emit();
    }
  }, 4000);
}

export const toast = {
  success: (m: string) => push("success", m),
  error: (m: string) => push("error", m),
};

export function ToastHost() {
  const [current, setCurrent] = useState<ToastItem[]>([]);
  useEffect(() => {
    listeners.add(setCurrent);
    return () => {
      listeners.delete(setCurrent);
    };
  }, []);
  return (
    <div className="toast-host">
      {current.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
