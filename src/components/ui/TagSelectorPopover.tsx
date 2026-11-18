import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ArrowUpDown, SlidersHorizontal, Star, Clock, Check, Minus, Plus } from 'lucide-react';
import { Tooltip } from './Tooltip';
import {
  TagModule,
  TagStatItem,
  computeTagStats,
  getTagMeta,
  setTagSortMode,
  addCustomTag,
  recordRecentTag,
} from '../../utils/tagStore';

export interface TagSelectorPopoverProps {
  isOpen: boolean;
  anchorEl: HTMLElement | null;
  module: TagModule;
  allItems: Array<{ tags?: string | null }>;
  selectedTags: string[];
  indeterminateTags?: string[];
  onToggleTag: (tag: string, shouldAdd: boolean) => Promise<void> | void;
  onClose: () => void;
  onOpenManager?: () => void;
}

type FlatNavItem =
  | { kind: 'create'; name: string }
  | { kind: 'tag'; stat: TagStatItem };

export const TagSelectorPopover: React.FC<TagSelectorPopoverProps> = ({
  isOpen,
  anchorEl,
  module,
  allItems,
  selectedTags,
  indeterminateTags = [],
  onToggleTag,
  onClose,
  onOpenManager,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [query, setQuery] = useState('');
  const [metaVersion, setMetaVersion] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [coords, setCoords] = useState<{ left: number; top: number; maxHeight: number }>({
    left: 0,
    top: 80,
    maxHeight: 440,
  });

  // 监听元数据变化（常用星标、排序偏好、预设标签等）
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.module === module) {
        setMetaVersion(v => v + 1);
      }
    };
    window.addEventListener('skillhub:tag-meta-changed', handler);
    return () => window.removeEventListener('skillhub:tag-meta-changed', handler);
  }, [module]);

  // 打开时聚焦搜索框并重置临时搜索词
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      const timer = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // 计算悬浮面板位置：当触发点位于右侧检查器内时，优先贴靠检查器左侧弹出（类似 Eagle 体验）
  const updatePosition = useCallback(() => {
    const popoverWidth = 310;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const margin = 12;
    const estimatedHeight = Math.min(460, viewportH - margin * 2);

    let left = viewportW - 256 - popoverWidth - 10;
    let top = 120;

    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const inspectorEl = anchorEl.closest('.inspector-container');
      if (inspectorEl) {
        const insRect = inspectorEl.getBoundingClientRect();
        left = insRect.left - popoverWidth - 10;
        top = rect.top - 16;
      } else if (rect.left > popoverWidth + 24) {
        left = rect.left - popoverWidth - 10;
        top = rect.top;
      } else {
        left = rect.left;
        top = rect.bottom + 8;
      }
    }

    if (left < margin) left = margin;
    if (left + popoverWidth > viewportW - margin) {
      left = Math.max(margin, viewportW - popoverWidth - margin);
    }
    if (top + estimatedHeight > viewportH - margin) {
      top = Math.max(margin, viewportH - estimatedHeight - margin);
    }
    if (top < margin) top = margin;

    setCoords({ left, top, maxHeight: viewportH - top - margin });
  }, [anchorEl]);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  // 点击外部或按 Escape 关闭（但点中 TagManagerModal 不应提前触发冲突）
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (popoverRef.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
      onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKey, true);
    };
  }, [isOpen, anchorEl, onClose]);

  const meta = useMemo(() => getTagMeta(module), [module, metaVersion]);

  const allStats = useMemo(
    () => computeTagStats(module, allItems, meta.sortMode),
    [module, allItems, meta.sortMode, metaVersion]
  );

  // 同时确保当前选中/半选但统计漏掉的标签也被包含
  const mergedStats = useMemo(() => {
    const existing = new Set(allStats.map(s => s.name));
    const extras: TagStatItem[] = [];
    for (const t of [...selectedTags, ...indeterminateTags]) {
      if (t && !existing.has(t)) {
        existing.add(t);
        extras.push({
          name: t,
          count: 0,
          isStarred: meta.starredTags.includes(t),
          isRecent: meta.recentTags.includes(t),
          isCustomOnly: true,
        });
      }
    }
    return extras.length > 0 ? [...allStats, ...extras] : allStats;
  }, [allStats, selectedTags, indeterminateTags, meta]);

  const trimmedQuery = query.trim().replace(/[,，]/g, '');
  const hasExactMatch = trimmedQuery
    ? mergedStats.some(s => s.name === trimmedQuery)
    : false;

  const { starredList, recentList, otherList, searchList } = useMemo(() => {
    if (trimmedQuery) {
      const lower = trimmedQuery.toLowerCase();
      const matched = mergedStats.filter(s => s.name.toLowerCase().includes(lower));
      return { starredList: [], recentList: [], otherList: [], searchList: matched };
    }

    const starredSet = new Set(meta.starredTags);
    const statMap = new Map(mergedStats.map(s => [s.name, s]));

    const starred: TagStatItem[] = [];
    for (const name of meta.starredTags) {
      const found = statMap.get(name);
      if (found) starred.push(found);
    }
    if (meta.sortMode === 'count') {
      starred.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'));
    } else {
      starred.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    }

    const recent: TagStatItem[] = [];
    const recentAdded = new Set<string>();
    for (const name of meta.recentTags) {
      if (starredSet.has(name) || recentAdded.has(name)) continue;
      const found = statMap.get(name);
      if (found) {
        recent.push(found);
        recentAdded.add(name);
        if (recent.length >= 8) break;
      }
    }

    const usedInTop = new Set<string>([...starredSet, ...recentAdded]);
    const other = mergedStats.filter(s => !usedInTop.has(s.name));

    return { starredList: starred, recentList: recent, otherList: other, searchList: [] };
  }, [mergedStats, meta, trimmedQuery]);

  // 扁平化列表用于键盘方向键移动焦点
  const flatItems = useMemo<FlatNavItem[]>(() => {
    const items: FlatNavItem[] = [];
    if (trimmedQuery && !hasExactMatch) {
      items.push({ kind: 'create', name: trimmedQuery });
    }
    if (trimmedQuery) {
      for (const s of searchList) items.push({ kind: 'tag', stat: s });
    } else {
      for (const s of starredList) items.push({ kind: 'tag', stat: s });
      for (const s of recentList) items.push({ kind: 'tag', stat: s });
      for (const s of otherList) items.push({ kind: 'tag', stat: s });
    }
    return items;
  }, [trimmedQuery, hasExactMatch, searchList, starredList, recentList, otherList]);

  useEffect(() => {
    setActiveIndex(prev => (flatItems.length === 0 ? 0 : Math.min(prev, flatItems.length - 1)));
  }, [flatItems.length]);

  const selectedSet = useMemo(() => new Set(selectedTags), [selectedTags]);
  const indeterminateSet = useMemo(() => new Set(indeterminateTags), [indeterminateTags]);

  const handleSelectTag = async (tagName: string) => {
    const clean = tagName.trim().replace(/[,，]/g, '');
    if (!clean) return;
    const isCurrentlySelected = selectedSet.has(clean);
    const shouldAdd = !isCurrentlySelected;
    recordRecentTag(module, clean);
    await onToggleTag(clean, shouldAdd);
  };

  const handleCreateAndSelect = async (newName: string) => {
    const clean = newName.trim().replace(/[,，]/g, '');
    if (!clean) return;
    addCustomTag(module, clean);
    recordRecentTag(module, clean);
    await onToggleTag(clean, true);
    setQuery('');
    setActiveIndex(0);
    inputRef.current?.focus();
  };

  // 基于真实 DOM 坐标的二维方向键导航
  const moveActive2D = (direction: 'up' | 'down' | 'left' | 'right') => {
    if (flatItems.length === 0) return;
    if (direction === 'left') {
      const next = Math.max(0, activeIndex - 1);
      setActiveIndex(next);
      itemRefs.current[next]?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (direction === 'right') {
      const next = Math.min(flatItems.length - 1, activeIndex + 1);
      setActiveIndex(next);
      itemRefs.current[next]?.scrollIntoView({ block: 'nearest' });
      return;
    }

    const curEl = itemRefs.current[activeIndex];
    if (!curEl) return;
    const curRect = curEl.getBoundingClientRect();
    const curCenterX = curRect.left + curRect.width / 2;

    const candidates: { idx: number; verticalDist: number; horizontalDist: number }[] = [];
    for (let i = 0; i < flatItems.length; i++) {
      const el = itemRefs.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (direction === 'down' && r.top >= curRect.bottom - 3) {
        candidates.push({
          idx: i,
          verticalDist: r.top - curRect.top,
          horizontalDist: Math.abs(r.left + r.width / 2 - curCenterX),
        });
      } else if (direction === 'up' && r.bottom <= curRect.top + 3) {
        candidates.push({
          idx: i,
          verticalDist: curRect.top - r.top,
          horizontalDist: Math.abs(r.left + r.width / 2 - curCenterX),
        });
      }
    }

    if (candidates.length === 0) return;
    // 取最近的一行（允许 8px 容差），再取水平距离最近者
    candidates.sort((a, b) => a.verticalDist - b.verticalDist);
    const minRowDist = candidates[0].verticalDist;
    const nearestRow = candidates.filter(c => Math.abs(c.verticalDist - minRowDist) <= 8);
    nearestRow.sort((a, b) => a.horizontalDist - b.horizontalDist);

    const targetIdx = nearestRow[0].idx;
    setActiveIndex(targetIdx);
    itemRefs.current[targetIdx]?.scrollIntoView({ block: 'nearest' });
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      // 当输入框光标在文本内部时左右键不抢占编辑，空输入或在边界时才做网格跳转
      const input = e.currentTarget;
      if (e.key === 'ArrowLeft' && input.selectionStart !== 0) return;
      if (e.key === 'ArrowRight' && input.selectionStart !== input.value.length) return;
      e.preventDefault();
      moveActive2D(e.key.replace('Arrow', '').toLowerCase() as 'up' | 'down' | 'left' | 'right');
      return;
    }

    if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
      e.preventDefault();
      const active = flatItems[activeIndex];
      if (active) {
        if (active.kind === 'create') {
          handleCreateAndSelect(active.name);
        } else {
          handleSelectTag(active.stat.name);
        }
      } else if (trimmedQuery) {
        handleCreateAndSelect(trimmedQuery);
      }
    }
  };

  if (!isOpen) return null;

  // 用于在 JSX 渲染期间递增分配 flat index
  let renderFlatCursor = trimmedQuery && !hasExactMatch ? 1 : 0;

  const renderPill = (stat: TagStatItem, sectionIcon?: 'star' | 'recent') => {
    const idx = renderFlatCursor++;
    const isFocused = activeIndex === idx;
    const isChecked = selectedSet.has(stat.name);
    const isPartial = !isChecked && indeterminateSet.has(stat.name);

    return (
      <button
        key={stat.name}
        ref={el => { itemRefs.current[idx] = el; }}
        type="button"
        onMouseEnter={() => setActiveIndex(idx)}
        onMouseDown={(e) => {
          e.preventDefault();
          handleSelectTag(stat.name);
        }}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-medium border transition-all cursor-pointer max-w-full ${
          isChecked
            ? 'bg-[var(--color-primary)]/12 text-[var(--color-primary)] border-[var(--color-primary)]/35'
            : isPartial
              ? 'bg-amber-500/10 text-amber-700 border-amber-500/35'
              : 'bg-black/[0.035] text-[var(--foreground)] border-transparent hover:bg-black/[0.07]'
        } ${isFocused ? 'ring-2 ring-[var(--color-primary)]/40' : ''}`}
      >
        {isChecked ? (
          <Check className="w-3 h-3 shrink-0" />
        ) : isPartial ? (
          <Minus className="w-3 h-3 shrink-0" />
        ) : sectionIcon === 'star' || stat.isStarred ? (
          <Star className="w-3 h-3 shrink-0 fill-amber-400 text-amber-400" />
        ) : sectionIcon === 'recent' ? (
          <Clock className="w-3 h-3 shrink-0 text-[var(--color-muted)]" />
        ) : null}
        <span className="truncate max-w-[160px]">{stat.name}</span>
        <span className="text-[10.5px] opacity-55 shrink-0">({stat.count})</span>
      </button>
    );
  };

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        left: coords.left,
        top: coords.top,
        maxHeight: Math.min(460, coords.maxHeight),
      }}
      className="fixed w-[310px] z-[90] bg-white/95 backdrop-blur-2xl border border-black/10 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.16)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      onClick={(e) => e.stopPropagation()}
    >
      {/* 顶部搜索与操作栏 */}
      <div className="px-3 py-2.5 border-b border-black/[0.06] flex items-center gap-1.5 shrink-0">
        <Search className="w-3.5 h-3.5 text-[var(--color-muted)] shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleInputKeyDown}
          placeholder="搜索或创建标签..."
          className="flex-1 min-w-0 text-[12.5px] bg-transparent outline-none text-[var(--foreground)] placeholder:text-[var(--color-muted)]/60"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setActiveIndex(0);
              inputRef.current?.focus();
            }}
            className="p-0.5 rounded-full text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <div className="w-px h-3.5 bg-black/10 mx-0.5 shrink-0" />
        <Tooltip content={meta.sortMode === 'count' ? '当前按使用热度排序，点击切换为按名称排序' : '当前按名称排序，点击切换为按使用热度排序'} side="bottom">
          <button
            type="button"
            onClick={() => setTagSortMode(module, meta.sortMode === 'count' ? 'alpha' : 'count')}
            className={`p-1 rounded-md transition-colors shrink-0 ${
              meta.sortMode === 'alpha'
                ? 'text-[var(--color-primary)] bg-[var(--color-primary)]/10'
                : 'text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5'
            }`}
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
        </Tooltip>
        {onOpenManager && (
          <Tooltip content="管理全部标签" side="bottom">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenManager();
              }}
              className="p-1 rounded-md text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors shrink-0"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        )}
      </div>

      {/* 标签流区域 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
        {/* 搜索模式 */}
        {trimmedQuery ? (
          <div className="space-y-2.5">
            {!hasExactMatch && (
              <button
                ref={el => { itemRefs.current[0] = el; }}
                type="button"
                onMouseEnter={() => setActiveIndex(0)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleCreateAndSelect(trimmedQuery);
                }}
                className={`w-full flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[12.5px] font-medium border text-left transition-all cursor-pointer ${
                  activeIndex === 0
                    ? 'bg-[var(--color-primary)]/10 border-[var(--color-primary)]/40 text-[var(--color-primary)]'
                    : 'bg-black/[0.025] border-black/10 text-[var(--foreground)] hover:bg-black/[0.05]'
                }`}
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">新增 &ldquo;{trimmedQuery}&rdquo;</span>
              </button>
            )}

            {searchList.length > 0 ? (
              <div>
                <div className="text-[11px] font-medium text-[var(--color-muted)] mb-1.5">
                  匹配标签 ({searchList.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {searchList.map(stat => renderPill(stat))}
                </div>
              </div>
            ) : hasExactMatch ? null : (
              <p className="text-[11px] text-[var(--color-muted)]/70 px-0.5">
                按回车立即创建并添加该标签
              </p>
            )}
          </div>
        ) : mergedStats.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-[12px] text-[var(--color-muted)] mb-1">暂无可用标签</p>
            <p className="text-[11px] text-[var(--color-muted)]/70">在上方输入框输入名称并按回车创建</p>
          </div>
        ) : (
          <>
            {starredList.length > 0 && (
              <div>
                <div className="text-[11px] font-medium text-[var(--color-muted)] mb-1.5">
                  常用标签 ({starredList.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {starredList.map(stat => renderPill(stat, 'star'))}
                </div>
              </div>
            )}

            {recentList.length > 0 && (
              <div className={starredList.length > 0 ? 'pt-2.5 border-t border-black/[0.05]' : ''}>
                <div className="text-[11px] font-medium text-[var(--color-muted)] mb-1.5">
                  最近使用 ({recentList.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {recentList.map(stat => renderPill(stat, 'recent'))}
                </div>
              </div>
            )}

            {otherList.length > 0 && (
              <div className={starredList.length > 0 || recentList.length > 0 ? 'pt-2.5 border-t border-black/[0.05]' : ''}>
                <div className="text-[11px] font-medium text-[var(--color-muted)] mb-1.5">
                  {starredList.length > 0 || recentList.length > 0
                    ? `其它 (${otherList.length})`
                    : `全部标签 (${otherList.length})`}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {otherList.map(stat => renderPill(stat))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 底部键盘快捷键提示栏（还原 Eagle 快捷交互提示） */}
      <div className="px-3 py-2 border-t border-black/[0.06] bg-black/[0.015] flex items-center justify-between text-[11px] text-[var(--color-muted)] shrink-0">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <span>移动</span>
            <kbd className="px-1 py-0.5 text-[10px] rounded bg-black/[0.06] font-sans leading-none">↑</kbd>
            <kbd className="px-1 py-0.5 text-[10px] rounded bg-black/[0.06] font-sans leading-none">↓</kbd>
            <kbd className="px-1 py-0.5 text-[10px] rounded bg-black/[0.06] font-sans leading-none">←</kbd>
            <kbd className="px-1 py-0.5 text-[10px] rounded bg-black/[0.06] font-sans leading-none">→</kbd>
          </span>
          <span className="inline-flex items-center gap-1">
            <span>选中</span>
            <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-black/[0.06] font-sans leading-none">↵</kbd>
          </span>
        </div>
        <span className="inline-flex items-center gap-1">
          <span>关闭</span>
          <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-black/[0.06] font-sans leading-none">ESC</kbd>
        </span>
      </div>
    </div>,
    document.body
  );
};
