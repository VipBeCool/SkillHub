import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2 } from 'lucide-react';

type ToastMessage = {
  id: number;
  text: string;
};

let listeners: ((msg: ToastMessage) => void)[] = [];
let idCounter = 0;

export function showToast(text: string) {
  const msg = { id: ++idCounter, text };
  listeners.forEach(l => l(msg));
}

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handler = (msg: ToastMessage) => {
      setToasts(prev => [...prev, msg]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== msg.id));
      }, 2500);
    };
    listeners.push(handler);
    return () => {
      listeners = listeners.filter(l => l !== handler);
    };
  }, []);

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[999999] flex flex-col items-center space-y-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className="flex items-center space-x-2 px-4 py-2.5 rounded-full bg-gray-900/95 backdrop-blur-xl text-white text-[13px] font-medium shadow-[0_10px_35px_rgb(0,0,0,0.35)] border border-white/15 animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{t.text}</span>
        </div>
      ))}
    </div>,
    document.body
  );
};
