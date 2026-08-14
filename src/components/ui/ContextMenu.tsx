import React, { useState, useEffect, useRef, useCallback } from 'react';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  children?: ContextMenuItem[];
  onClick?: () => void;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number } | null;
  onClose: () => void;
}

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [subMenuId, setSubMenuId] = useState<string | null>(null);
  const [adjustedPos, setAdjustedPos] = useState<{ x: number; y: number } | null>(null);

  // 当菜单关闭时，重置所有状态
  useEffect(() => {
    if (!position) {
      setSubMenuId(null);
    }
  }, [position]);

  // 计算菜单位置，防止溢出屏幕
  useEffect(() => {
    if (!position || !menuRef.current) {
      setAdjustedPos(position);
      return;
    }
    const rect = menuRef.current.getBoundingClientRect();
    const x = position.x + rect.width > window.innerWidth ? window.innerWidth - rect.width - 8 : position.x;
    const y = position.y + rect.height > window.innerHeight ? window.innerHeight - rect.height - 8 : position.y;
    setAdjustedPos({ x: Math.max(8, x), y: Math.max(8, y) });
  }, [position]);

  // 点击外部关闭
  useEffect(() => {
    if (!position) return;
    const handleClick = () => onClose();
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // 延迟一帧绑定，避免触发右键的同一帧就关闭
    requestAnimationFrame(() => {
      window.addEventListener('click', handleClick);
      window.addEventListener('contextmenu', handleClick);
      window.addEventListener('keydown', handleEscape);
    });
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('contextmenu', handleClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [position, onClose]);

  if (!position) return null;

  const finalPos = adjustedPos || position;

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[200px] py-1 bg-white border border-[var(--color-border)] rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-100"
      style={{ left: finalPos.x, top: finalPos.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item) => {
        if (item.separator) {
          return <div key={item.id} className="my-1 mx-2 border-t border-black/8" />;
        }

        const hasChildren = item.children && item.children.length > 0;

        return (
          <div
            key={item.id}
            className="relative"
            onMouseEnter={() => hasChildren && setSubMenuId(item.id)}
            onMouseLeave={() => hasChildren && setSubMenuId(null)}
          >
            <button
              disabled={item.disabled}
              onClick={() => {
                if (hasChildren) return;
                item.onClick?.();
                onClose();
              }}
              className={`w-full flex items-center px-3 py-1.5 text-[13px] text-left transition-colors outline-none ${
                item.disabled
                  ? 'text-black/25 cursor-not-allowed'
                  : item.danger
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-[var(--foreground)] hover:bg-black/5'
              }`}
            >
              {item.icon && (
                <span className="w-4 h-4 mr-2.5 flex items-center justify-center shrink-0 opacity-70">
                  {item.icon}
                </span>
              )}
              <span className="flex-1">{item.label}</span>
              {item.shortcut && (
                <span className="text-[11px] text-black/30 ml-4 font-mono">{item.shortcut}</span>
              )}
              {hasChildren && (
                <svg className="w-3 h-3 ml-2 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              )}
            </button>

            {hasChildren && subMenuId === item.id && (
              <div className="absolute left-[calc(100%-8px)] top-[-4px] min-w-[180px] max-h-[300px] overflow-y-auto py-1 bg-white border border-[var(--color-border)] rounded-lg shadow-xl animate-in fade-in slide-in-from-left-1 duration-100 z-[110] custom-scrollbar">
                {item.children!.map((child) => (
                  <button
                    key={child.id}
                    disabled={child.disabled}
                    onClick={() => {
                      child.onClick?.();
                      onClose();
                    }}
                    className={`w-full flex items-center px-3 py-1.5 text-[13px] text-left transition-colors outline-none ${
                      child.disabled
                        ? 'text-black/25 cursor-not-allowed'
                        : 'text-[var(--foreground)] hover:bg-black/5'
                    }`}
                  >
                    {child.icon && (
                      <span className="w-4 h-4 mr-2.5 flex items-center justify-center shrink-0 opacity-70">
                        {child.icon}
                      </span>
                    )}
                    <span className="flex-1">{child.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// 便捷 Hook：管理右键菜单状态
export function useContextMenu() {
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [menuTarget, setMenuTarget] = useState<any>(null);

  const showContextMenu = useCallback((e: React.MouseEvent, target?: any) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setMenuTarget(target ?? null);
  }, []);

  const hideContextMenu = useCallback(() => {
    setMenuPosition(null);
    setMenuTarget(null);
  }, []);

  return { menuPosition, menuTarget, showContextMenu, hideContextMenu };
}
