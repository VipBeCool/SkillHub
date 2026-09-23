import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Store, Sparkles, X } from 'lucide-react';

interface UnderConstructionModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
}

export const UnderConstructionModal: React.FC<UnderConstructionModalProps> = ({
  isOpen,
  onClose,
  title = "功能建设中",
  description = "资源社区功能正在深度升级建设中，海量精选开源技能与提示词即将上线，敬请期待！"
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* 背景遮罩 */}
      <div 
        className="absolute inset-0 modal-backdrop transition-opacity" 
        onClick={onClose} 
      />

      {/* 弹窗主体卡片 */}
      <div 
        className="modal-glass rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-black/10 relative z-10 animate-in zoom-in-95 fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 右上角关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 p-1.5 text-gray-400 hover:text-gray-700 hover:bg-black/5 rounded-lg transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 flex flex-col items-center text-center">
          {/* 发光图标容器 */}
          <div className="relative mb-4 mt-2">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[var(--color-primary)] flex items-center justify-center shadow-inner">
              <Store className="w-7 h-7" />
            </div>
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-400 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-3 h-3 fill-current" />
            </div>
          </div>

          {/* 标题与徽章 */}
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-base font-semibold text-[var(--foreground)]">
              {title}
            </h3>
            <span className="px-2 py-0.5 text-[10px] font-medium bg-blue-50/80 text-[var(--color-primary)] rounded-full border border-blue-200/50">
              敬请期待
            </span>
          </div>

          {/* 描述信息 */}
          <p className="text-[var(--color-muted)] text-xs leading-relaxed max-w-[260px]">
            {description}
          </p>

          {/* 确认操作按钮 */}
          <div className="mt-6 w-full">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-xl text-xs font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] active:scale-[0.98] transition-all shadow-sm shadow-blue-500/20 cursor-pointer"
            >
              我知道了
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
