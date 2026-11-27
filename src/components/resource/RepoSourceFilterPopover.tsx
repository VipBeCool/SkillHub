import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import type { SubscribedRepo } from '../../types/resourceHub';

interface RepoSourceFilterPopoverProps {
  repos: SubscribedRepo[];
  /** null 表示全选（全部来源）；Set 表示精确勾选的仓库 ID 集合 */
  selectedRepoIds: Set<string> | null;
  syncingRepoIds: Set<string>;
  onChangeSelected: (next: Set<string> | null) => void;
  onOpenManageRepos: () => void;
}

/**
 * 订阅仓库多选来源筛选浮层（复刻高可读性多选勾选 + 分支 + 技能数 + 添加或管理仓库入口）
 */
export function RepoSourceFilterPopover({
  repos,
  selectedRepoIds,
  syncingRepoIds,
  onChangeSelected,
  onOpenManageRepos,
}: RepoSourceFilterPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const panelWidth = 344;

  const updatePosition = () => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - panelWidth - 12));
    const top = rect.bottom + 8;
    setPos({ top, left });
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    const handleViewportChange = () => {
      updatePosition();
    };

    document.addEventListener('mousedown', handleOutside, true);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', handleViewportChange);

    return () => {
      document.removeEventListener('mousedown', handleOutside, true);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [isOpen]);

  const allRepoIds = repos.map(r => r.id);
  const isAllSelected =
    selectedRepoIds === null ||
    (repos.length > 0 && allRepoIds.every(id => selectedRepoIds.has(id)));

  const effectiveSelectedCount =
    selectedRepoIds === null
      ? repos.length
      : allRepoIds.filter(id => selectedRepoIds.has(id)).length;

  const triggerLabel = (() => {
    if (repos.length === 0 || isAllSelected) return '全部';
    if (effectiveSelectedCount === 0) return '未选择';
    if (effectiveSelectedCount === 1) {
      const only = repos.find(r => selectedRepoIds?.has(r.id));
      return only ? `${only.owner}/${only.repo}` : '已选 1 个';
    }
    return `已选 ${effectiveSelectedCount}/${repos.length}`;
  })();

  const handleToggleRepo = (repoId: string) => {
    const next = new Set<string>(selectedRepoIds === null ? allRepoIds : selectedRepoIds);
    if (next.has(repoId)) {
      next.delete(repoId);
    } else {
      next.add(repoId);
    }

    // 全部选中时归一化为 null，以便后续新订阅仓库自动包含在“全部”中
    if (repos.length > 0 && allRepoIds.every(id => next.has(id))) {
      onChangeSelected(null);
    } else {
      onChangeSelected(next);
    }
  };

  const handleOnlyRepo = (e: React.MouseEvent, repoId: string) => {
    e.stopPropagation();
    onChangeSelected(new Set([repoId]));
  };

  const handleToggleOpen = () => {
    if (!isOpen) {
      updatePosition();
    }
    setIsOpen(prev => !prev);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggleOpen}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] transition-colors cursor-pointer select-none border ${
          isOpen
            ? 'bg-white border-[var(--color-primary)]/40 text-[var(--foreground)] shadow-2xs'
            : 'bg-white border-black/[0.08] text-[var(--color-muted)] hover:border-black/15 hover:text-[var(--foreground)]'
        }`}
      >
        <span className="text-[var(--color-muted)]">来源：</span>
        <span className="font-medium text-[var(--foreground)] max-w-[160px] truncate">
          {triggerLabel}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[var(--color-muted)] transition-transform duration-150 shrink-0 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: panelWidth,
            }}
            className="z-[90] max-w-[calc(100vw-24px)] rounded-2xl bg-white/98 backdrop-blur-md border border-black/[0.09] shadow-[0_12px_36px_rgba(0,0,0,0.12)] overflow-hidden animate-in fade-in zoom-in-95 duration-120 select-none"
          >
            {/* 仓库多选列表 */}
            <div className="p-2 max-h-[300px] overflow-y-auto hover-scroll space-y-0.5">
              {repos.length === 0 ? (
                <div className="py-5 px-3 text-center text-[12px] text-[var(--color-muted)]">
                  暂无已启用的订阅仓库
                </div>
              ) : (
                repos.map(repo => {
                  const checked = selectedRepoIds === null || selectedRepoIds.has(repo.id);
                  const isSyncing = syncingRepoIds.has(repo.id);
                  const fullName = `${repo.owner}/${repo.repo}`;

                  return (
                    <div
                      key={repo.id}
                      onClick={() => handleToggleRepo(repo.id)}
                      className="group flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-black/[0.04] transition-colors cursor-pointer"
                    >
                      <span
                        className={`w-[17px] h-[17px] rounded-[5px] flex items-center justify-center border transition-colors shrink-0 ${
                          checked
                            ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                            : 'bg-white border-black/20 group-hover:border-black/35'
                        }`}
                      >
                        {checked && <Check className="w-3 h-3 stroke-[3]" />}
                      </span>

                      <span
                        className="flex-1 min-w-0 font-mono text-[12.5px] font-medium text-[var(--foreground)] truncate"
                        title={fullName}
                      >
                        {fullName}
                      </span>

                      {/* 悬停快捷「仅看」，一键单选当前仓库 */}
                      <button
                        type="button"
                        onClick={e => handleOnlyRepo(e, repo.id)}
                        className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded text-[10.5px] font-medium text-[var(--color-primary)] bg-[var(--color-primary)]/[0.08] hover:bg-[var(--color-primary)]/[0.15] transition-all cursor-pointer shrink-0"
                        title={`只看 ${fullName}`}
                      >
                        仅看
                      </button>

                      <span className="text-[11.5px] text-[var(--color-muted)] shrink-0 max-w-[64px] truncate">
                        {repo.branch || 'auto'}
                      </span>

                      <span className="w-9 text-right text-[12px] text-[var(--color-muted)] tabular-nums shrink-0 flex items-center justify-end">
                        {isSyncing ? (
                          <Loader2 className="w-3 h-3 animate-spin text-[var(--color-primary)]" />
                        ) : (
                          repo.skillCount
                        )}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* 底部操作区 */}
            <div className="border-t border-black/[0.06] px-2 py-1.5 flex items-center justify-between gap-2 bg-black/[0.01]">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenManageRepos();
                }}
                className="flex-1 text-left px-2.5 py-1.5 rounded-lg text-[12.5px] font-medium text-[var(--foreground)] hover:bg-black/[0.05] transition-colors cursor-pointer"
              >
                添加或管理仓库
              </button>

              {!isAllSelected && repos.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChangeSelected(null)}
                  className="px-2.5 py-1 rounded-lg text-[11.5px] font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/[0.08] transition-colors cursor-pointer shrink-0"
                >
                  全选
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
