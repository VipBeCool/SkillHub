import { useState, useEffect, useRef, useId, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface FilterSelectOption {
  value: string;
  label: string;
  count?: number;
}

interface FilterSelectPopoverProps {
  prefix?: string;
  value: string;
  defaultValue?: string;
  options: FilterSelectOption[];
  onChange: (value: string) => void;
  minMenuWidth?: number;
  ariaLabel?: string;
  showFirstDivider?: boolean;
  /** 是否在非默认值时以蓝色高亮触发器（表单设置场景可设为 false 保持中性） */
  highlightActive?: boolean;
  /** 触发按钮附加样式类 */
  triggerClassName?: string;
}

/**
 * Apple 极简风单选下拉组件：白底微边、视口边缘自适应翻转、完整 Listbox 无障碍与键盘导航
 */
export function FilterSelectPopover({
  prefix,
  value,
  defaultValue = 'all',
  options,
  onChange,
  minMenuWidth = 196,
  ariaLabel,
  showFirstDivider = true,
  highlightActive = true,
  triggerClassName = '',
}: FilterSelectPopoverProps) {
  const listboxId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
    openUp: boolean;
  }>({
    top: 0,
    left: 0,
    width: minMenuWidth,
    openUp: false,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // 根据触发器与视口剩余空间计算下拉面板位置，避免边缘裁切
  const updatePosition = useCallback(() => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, minMenuWidth), window.innerWidth - 24);
    const hasDivider = showFirstDivider && options.length > 1;
    const estimatedHeight = Math.min(options.length * 34 + (hasDivider ? 10 : 0) + 16, 296);
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUp = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;

    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const top = openUp ? rect.top - 6 : rect.bottom + 6;
    setPos({ top, left, width, openUp });
  }, [minMenuWidth, options.length, showFirstDivider]);

  const selectedOption = options.find(opt => opt.value === value) || options[0];
  const isFiltered = highlightActive && value !== defaultValue;

  const openMenu = useCallback(
    (initialIdx?: number) => {
      updatePosition();
      const selectedIdx = options.findIndex(opt => opt.value === value);
      const targetIdx =
        typeof initialIdx === 'number'
          ? initialIdx
          : selectedIdx >= 0
          ? selectedIdx
          : 0;
      setHighlightedIndex(Math.max(0, Math.min(targetIdx, Math.max(0, options.length - 1))));
      setIsOpen(true);
    },
    [options, updatePosition, value]
  );

  const selectByIndex = useCallback(
    (idx: number) => {
      const target = options[idx];
      if (!target) return;
      onChange(target.value);
      setIsOpen(false);
      triggerRef.current?.focus();
    },
    [onChange, options]
  );

  // 打开后将当前高亮选项平滑滚入可视区域
  useEffect(() => {
    if (!isOpen) return;
    const el = optionRefs.current[highlightedIndex];
    el?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, highlightedIndex]);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    const handleScroll = (e: Event) => {
      // 滚动浮层内部列表时不关闭菜单；滚动外部主页面时自动收起以防悬浮脱节
      if (panelRef.current?.contains(e.target as Node)) {
        return;
      }
      setIsOpen(false);
    };

    const handleResize = () => {
      updatePosition();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (options.length === 0) return;

      switch (e.key) {
        case 'Escape': {
          e.preventDefault();
          setIsOpen(false);
          triggerRef.current?.focus();
          break;
        }
        case 'ArrowDown': {
          e.preventDefault();
          setHighlightedIndex(prev => (prev + 1) % options.length);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          setHighlightedIndex(prev => (prev - 1 + options.length) % options.length);
          break;
        }
        case 'Home': {
          e.preventDefault();
          setHighlightedIndex(0);
          break;
        }
        case 'End': {
          e.preventDefault();
          setHighlightedIndex(options.length - 1);
          break;
        }
        case 'Enter':
        case ' ': {
          e.preventDefault();
          selectByIndex(highlightedIndex);
          break;
        }
        case 'Tab': {
          setIsOpen(false);
          break;
        }
      }
    };

    document.addEventListener('mousedown', handleOutside, true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mousedown', handleOutside, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [highlightedIndex, isOpen, options.length, selectByIndex, updatePosition]);

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (isOpen || options.length === 0) return;
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openMenu();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const selectedIdx = options.findIndex(opt => opt.value === value);
      openMenu(selectedIdx >= 0 ? selectedIdx : options.length - 1);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-label={ariaLabel || (selectedOption ? selectedOption.label : undefined)}
        onClick={() => (isOpen ? setIsOpen(false) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
        className={`inline-flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] transition-all cursor-pointer select-none border outline-none ${
          isOpen
            ? 'bg-white border-[var(--color-primary)]/45 text-[var(--foreground)] shadow-2xs ring-2 ring-[var(--color-primary)]/10'
            : isFiltered
            ? 'bg-[var(--color-primary)]/[0.06] border-[var(--color-primary)]/30 text-[var(--color-primary)] shadow-2xs'
            : 'bg-white border-black/[0.08] text-[var(--foreground)] hover:border-black/15'
        } ${triggerClassName}`}
      >
        {prefix && (
          <span className={isFiltered && !isOpen ? 'text-[var(--color-primary)]/75 shrink-0' : 'text-[var(--color-muted)] shrink-0'}>
            {prefix}：
          </span>
        )}
        <span className={`font-medium truncate ${triggerClassName ? 'flex-1 text-left' : 'max-w-[128px]'}`}>
          {selectedOption?.label || ''}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-150 shrink-0 ${
            isFiltered && !isOpen ? 'text-[var(--color-primary)]/75' : 'text-[var(--color-muted)]'
          } ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={panelRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: pos.width,
              transform: pos.openUp ? 'translateY(-100%)' : undefined,
            }}
            className="z-[90] max-w-[calc(100vw-24px)] rounded-2xl bg-white/98 backdrop-blur-md border border-black/[0.09] shadow-[0_12px_32px_rgba(0,0,0,0.11)] p-1.5 overflow-hidden animate-in fade-in zoom-in-95 duration-120 select-none"
          >
            <div className="max-h-[284px] overflow-y-auto hover-scroll space-y-0.5">
              {options.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isHighlighted = idx === highlightedIndex;

                return (
                  <div key={opt.value}>
                    <button
                      ref={el => {
                        optionRefs.current[idx] = el;
                      }}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      onClick={() => selectByIndex(idx)}
                      className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-xl text-[12.5px] transition-colors cursor-pointer text-left outline-none ${
                        isSelected
                          ? 'bg-[var(--color-primary)]/[0.08] text-[var(--color-primary)] font-semibold'
                          : isHighlighted
                          ? 'bg-black/[0.04] text-[var(--foreground)] font-medium'
                          : 'text-[var(--foreground)] hover:bg-black/[0.04] font-medium'
                      }`}
                    >
                      <span className="flex-1 min-w-0 truncate">{opt.label}</span>

                      <span className="flex items-center gap-2 shrink-0">
                        {typeof opt.count === 'number' && (
                          <span
                            className={`text-[11px] tabular-nums ${
                              isSelected ? 'text-[var(--color-primary)]/80 font-medium' : 'text-[var(--color-muted)]'
                            }`}
                          >
                            {opt.count}
                          </span>
                        )}
                        <span className="w-4 flex items-center justify-center">
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[2.5] text-[var(--color-primary)]" />}
                        </span>
                      </span>
                    </button>

                    {showFirstDivider && idx === 0 && options.length > 1 && (
                      <div className="my-1 mx-2 border-t border-black/[0.06]" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
