import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, FileCode, FolderOpen, Trash2 } from 'lucide-react';

interface InstalledActionButtonProps {
  compact?: boolean;
  label?: string;
  onViewSkill: () => void;
  onOpenFolder: () => void;
  onUninstall: () => void;
}

/**
 * 已安装状态操作按钮：点击展开悬浮菜单（查看技能 / 打开目录 / 卸载）
 */
export function InstalledActionButton({
  compact = false,
  label = '已安装',
  onViewSkill,
  onOpenFolder,
  onUninstall,
}: InstalledActionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; openUp: boolean }>({
    top: 0,
    left: 0,
    openUp: false,
  });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updateMenuPosition = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuWidth = 148;
    const menuEstimatedHeight = 132;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuEstimatedHeight + 16 && rect.top > menuEstimatedHeight + 16;

    const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
    const top = openUp ? rect.top - 6 : rect.bottom + 6;
    setMenuPos({ top, left, openUp });
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleOutsideClick, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen) {
      updateMenuPosition();
    }
    setIsOpen(prev => !prev);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className={`shrink-0 inline-flex items-center justify-center gap-1 font-medium transition-all cursor-pointer select-none ${
          compact
            ? 'px-2.5 py-1 rounded-lg text-[11.5px] bg-black/[0.04] text-[var(--color-muted)] hover:bg-black/[0.08] hover:text-[var(--foreground)]'
            : 'px-3.5 py-2 rounded-xl text-[13px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100/80 shadow-xs'
        }`}
      >
        <Check className={compact ? 'w-3 h-3 text-emerald-600' : 'w-4 h-4 text-emerald-600'} />
        <span>{label}</span>
        <ChevronDown
          className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} opacity-70 transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              transform: menuPos.openUp ? 'translateY(-100%)' : undefined,
              width: 148,
            }}
            className="z-[90] rounded-xl bg-white/95 backdrop-blur-md border border-black/[0.09] shadow-xl py-1.5 px-1 animate-in fade-in zoom-in-95 duration-100 select-none"
          >
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                setIsOpen(false);
                onViewSkill();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12.5px] font-medium text-[var(--foreground)] hover:bg-black/[0.05] transition-colors cursor-pointer text-left"
            >
              <FileCode className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
              <span>查看技能</span>
            </button>

            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                setIsOpen(false);
                onOpenFolder();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12.5px] font-medium text-[var(--foreground)] hover:bg-black/[0.05] transition-colors cursor-pointer text-left"
            >
              <FolderOpen className="w-3.5 h-3.5 text-[var(--color-muted)] shrink-0" />
              <span>打开目录</span>
            </button>

            <div className="my-1 mx-1.5 border-t border-black/[0.06]" />

            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                setIsOpen(false);
                onUninstall();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12.5px] font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer text-left"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>卸载</span>
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
