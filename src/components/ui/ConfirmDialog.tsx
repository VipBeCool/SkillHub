import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  message: string;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  confirmButtonClassName?: string;
  showCancel?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  message,
  title = "确认",
  confirmText = "确认",
  cancelText = "取消",
  confirmButtonClassName = "bg-[var(--color-primary)] hover:bg-blue-600",
  showCancel = true,
  onConfirm,
  onCancel
}) => {
  if (!isOpen) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 modal-backdrop transition-opacity" onClick={onCancel} />
      <div 
        className="modal-glass rounded-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-orange-500" />
            </div>
            <div className="flex-1 pt-1">
              <h3 className="text-[15px] font-semibold text-[var(--foreground)] mb-2">
                {title}
              </h3>
              <p className="text-[var(--color-muted)] text-[13px] leading-relaxed whitespace-pre-wrap">
                {message}
              </p>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50/50 border-t border-[var(--color-border)]/60 flex items-center justify-end gap-3">
          {showCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-xl text-[13px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`px-6 py-2 rounded-xl text-[13px] font-medium text-white transition-colors shadow-sm ${confirmButtonClassName}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
