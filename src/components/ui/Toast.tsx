import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, XCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

type ToastMessage = {
  id: number;
  text: string;
  type: ToastType;
  action?: {
    label: string;
    onClick: () => void;
  };
};

let idCounter = 0;

// 使用 window 自定义事件作为通信机制，完全绕过 HMR 模块缓存污染
const TOAST_EVENT = 'skillhub:toast';

export function showToast(text: string, type: ToastType = 'success', action?: ToastMessage['action']) {
  const msg: ToastMessage = { id: ++idCounter, text, type, action };
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: msg }));
}

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent<ToastMessage>).detail;
      setToasts([msg]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== msg.id));
      }, msg.type === 'error' ? 5000 : (msg.action ? 5000 : 2500));
    };

    window.addEventListener(TOAST_EVENT, handler);
    return () => window.removeEventListener(TOAST_EVENT, handler);
  }, []);

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[999999] flex flex-col items-center space-y-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-full bg-gray-900/95 backdrop-blur-xl text-white text-[13px] font-medium shadow-[0_10px_35px_rgb(0,0,0,0.35)] border border-white/15 animate-in fade-in slide-in-from-bottom-3 duration-200 ${t.action ? 'pointer-events-auto' : ''}`}
        >
          {t.type === 'error' ? (
            <XCircle className="w-4 h-4 text-red-500 shrink-0" />
          ) : t.type === 'info' ? (
            <Info className="w-4 h-4 text-blue-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{t.text}</span>
          {t.action && (
            <>
              <div className="w-[1px] h-3 bg-white/20 mx-1" />
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  t.action!.onClick();
                  setToasts(prev => prev.filter(msg => msg.id !== t.id));
                }} 
                className="text-[var(--color-primary)] hover:text-[var(--color-primary)]/80 font-semibold cursor-pointer transition-colors"
              >
                {t.action.label}
              </button>
            </>
          )}
        </div>
      ))}
    </div>,
    document.body
  );
};
