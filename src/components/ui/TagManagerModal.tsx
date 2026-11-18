import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Tag, Search, Plus, Star, Edit2, Trash2, Check, X,
  ArrowUpDown, Loader2, Sparkles, AlertTriangle, CheckSquare, Square,
} from 'lucide-react';
import { Tooltip } from './Tooltip';
import { showToast } from './Toast';
import {
  TagModule,
  TagStatItem,
  computeTagStats,
  getTagMeta,
  toggleStarTag,
  addCustomTag,
  removeTagFromMeta,
  setTagSortMode,
} from '../../utils/tagStore';

export interface TagManagerModalProps {
  isOpen: boolean;
  module: TagModule;
  allItems: Array<{ tags?: string | null }>;
  onClose: () => void;
  /** 点击标签名时触发侧边栏筛选跳转 */
  onSelectTagFilter?: (tagName: string) => void;
  /** 重命名或合并标签（由外层批量持久化到 SQLite） */
  onRenameTag: (oldName: string, newName: string) => Promise<void>;
  /** 批量删除标签（从所有关联条目中移除并清理元数据） */
  onDeleteTags: (tagNames: string[]) => Promise<void>;
  /** 可选：打开时直接进入某个标签的重命名状态 */
  initialEditTag?: string | null;
}

type FilterTab = 'all' | 'starred' | 'unused';

export const TagManagerModal: React.FC<TagManagerModalProps> = ({
  isOpen,
  module,
  allItems,
  onClose,
  onSelectTagFilter,
  onRenameTag,
  onDeleteTags,
  initialEditTag,
}) => {
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [newTagInput, setNewTagInput] = useState('');
  const [metaVersion, setMetaVersion] = useState(0);

  // 内联重命名状态
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [busyTagOp, setBusyTagOp] = useState(false);

  // 多选批量删除
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  // 内部二次确认弹窗（避免被 z-index 更高的模态遮挡）
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    message: string;
    confirmText: string;
    danger?: boolean;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const editInputRef = useRef<HTMLInputElement>(null);
  const newTagInputRef = useRef<HTMLInputElement>(null);

  const unitLabel = module === 'skills' ? '个技能' : '个提示词';
  const moduleTitle = module === 'skills' ? '技能标签管理' : '提示词标签管理';

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

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setFilterTab('all');
      setNewTagInput('');
      setEditingTag(null);
      setEditValue('');
      setSelectedTags(new Set());
      setPendingConfirm(null);
      return;
    }

    if (initialEditTag) {
      setEditingTag(initialEditTag);
      setEditValue(initialEditTag);
      setTimeout(() => {
        editInputRef.current?.focus();
        editInputRef.current?.select();
      }, 60);
    }
  }, [isOpen, initialEditTag]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pendingConfirm) {
          setPendingConfirm(null);
        } else if (editingTag) {
          setEditingTag(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, pendingConfirm, editingTag, onClose]);

  const meta = useMemo(() => getTagMeta(module), [module, metaVersion]);

  const allStats = useMemo(
    () => computeTagStats(module, allItems, meta.sortMode),
    [module, allItems, meta.sortMode, metaVersion]
  );

  const statsSummary = useMemo(() => {
    const total = allStats.length;
    const starred = allStats.filter(t => t.isStarred).length;
    const unused = allStats.filter(t => t.count === 0).length;
    return { total, starred, unused };
  }, [allStats]);

  const filteredStats = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return allStats.filter(item => {
      if (filterTab === 'starred' && !item.isStarred) return false;
      if (filterTab === 'unused' && item.count > 0) return false;
      if (lower && !item.name.toLowerCase().includes(lower)) return false;
      return true;
    });
  }, [allStats, filterTab, search]);

  const handleCreatePresetTag = () => {
    const clean = newTagInput.trim().replace(/[,，]/g, '');
    if (!clean) return;
    const exists = allStats.some(t => t.name === clean);
    addCustomTag(module, clean);
    setNewTagInput('');
    showToast(exists ? `标签 "${clean}" 已存在` : `已新建预设标签 "${clean}"`, exists ? 'info' : 'success');
    newTagInputRef.current?.focus();
  };

  const commitRename = async (oldName: string) => {
    const nextName = editValue.trim().replace(/[,，]/g, '');
    if (!nextName || nextName === oldName) {
      setEditingTag(null);
      return;
    }

    const existsTarget = allStats.some(t => t.name === nextName && t.name !== oldName);
    if (existsTarget) {
      setPendingConfirm({
        title: '合并重复标签',
        message: `目标名称“${nextName}”已存在。继续操作将把“${oldName}”合并到“${nextName}”，并自动对同时包含两者的条目去重。`,
        confirmText: '确认合并',
        onConfirm: async () => {
          setBusyTagOp(true);
          try {
            await onRenameTag(oldName, nextName);
            setEditingTag(null);
            showToast(`已将“${oldName}”合并至“${nextName}”`, 'success');
          } catch (e) {
            showToast(`合并失败: ${e}`, 'error');
          } finally {
            setBusyTagOp(false);
            setPendingConfirm(null);
          }
        },
      });
      return;
    }

    setBusyTagOp(true);
    try {
      await onRenameTag(oldName, nextName);
      setEditingTag(null);
      showToast(`已重命名为“${nextName}”`, 'success');
    } catch (e) {
      showToast(`重命名失败: ${e}`, 'error');
    } finally {
      setBusyTagOp(false);
    }
  };

  const requestDeleteTags = (targets: TagStatItem[]) => {
    if (targets.length === 0) return;
    const names = targets.map(t => t.name);
    const affectedSum = targets.reduce((acc, t) => acc + t.count, 0);

    if (affectedSum === 0) {
      // 全是未关联任何条目的空标签，可直接快速清理
      names.forEach(n => removeTagFromMeta(module, n));
      setSelectedTags(prev => {
        const next = new Set(prev);
        names.forEach(n => next.delete(n));
        return next;
      });
      showToast(`已移除 ${names.length} 个未使用标签`, 'success');
      return;
    }

    setPendingConfirm({
      title: names.length === 1 ? `删除标签“${names[0]}”？` : `批量删除 ${names.length} 个标签？`,
      message:
        names.length === 1
          ? `将从 ${targets[0].count} ${unitLabel}中移除该标签，不会删除${module === 'skills' ? '技能' : '提示词'}本身。`
          : `将清理选中的 ${names.length} 个标签并从关联${module === 'skills' ? '技能' : '提示词'}中移除，不会删除条目本身。`,
      confirmText: '确认删除',
      danger: true,
      onConfirm: async () => {
        setBusyTagOp(true);
        try {
          await onDeleteTags(names);
          setSelectedTags(prev => {
            const next = new Set(prev);
            names.forEach(n => next.delete(n));
            return next;
          });
          showToast(names.length === 1 ? `已删除标签“${names[0]}”` : `已删除 ${names.length} 个标签`, 'success');
        } catch (e) {
          showToast(`删除失败: ${e}`, 'error');
        } finally {
          setBusyTagOp(false);
          setPendingConfirm(null);
        }
      },
    });
  };

  const toggleSelectRow = (name: string) => {
    setSelectedTags(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const allVisibleSelected =
    filteredStats.length > 0 && filteredStats.every(s => selectedTags.has(s.name));

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedTags(prev => {
        const next = new Set(prev);
        filteredStats.forEach(s => next.delete(s.name));
        return next;
      });
    } else {
      setSelectedTags(prev => {
        const next = new Set(prev);
        filteredStats.forEach(s => next.add(s.name));
        return next;
      });
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      <div className="absolute inset-0 modal-backdrop" onClick={onClose} />

      <div
        className="relative modal-glass rounded-2xl w-full max-w-2xl max-h-[82vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-6 py-4 border-b border-[var(--color-border)]/70 flex items-center justify-between shrink-0 bg-white/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--foreground)] leading-tight">
                {moduleTitle}
              </h2>
              <p className="text-[11.5px] text-[var(--color-muted)] mt-0.5">
                共 {statsSummary.total} 个标签 · 常用 {statsSummary.starred} 个 · 未使用 {statsSummary.unused} 个
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 工具栏：新建标签 + 搜索 + 过滤切换 + 排序 */}
        <div className="px-6 py-3.5 border-b border-[var(--color-border)]/50 space-y-3 shrink-0 bg-black/[0.015]">
          {/* 新建预设标签行 */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Plus className="w-3.5 h-3.5 text-[var(--color-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={newTagInputRef}
                type="text"
                value={newTagInput}
                onChange={e => setNewTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
                    e.preventDefault();
                    handleCreatePresetTag();
                  }
                }}
                placeholder="输入新标签名称，提前预设并规划分类..."
                className="w-full pl-8 pr-3 py-1.5 text-[12.5px] rounded-lg border border-[var(--color-border)] bg-white focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all"
              />
            </div>
            <button
              type="button"
              disabled={!newTagInput.trim()}
              onClick={handleCreatePresetTag}
              className="px-3.5 py-1.5 rounded-lg bg-[var(--color-primary)] hover:bg-blue-600 text-white text-[12.5px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              新建标签
            </button>
          </div>

          {/* 过滤 Tabs + 搜索 + 排序 */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 bg-black/[0.05] p-0.5 rounded-lg">
              {[
                { id: 'all' as FilterTab, label: `全部 (${statsSummary.total})` },
                { id: 'starred' as FilterTab, label: `常用 (${statsSummary.starred})` },
                { id: 'unused' as FilterTab, label: `未使用 (${statsSummary.unused})` },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterTab(tab.id)}
                  className={`px-2.5 py-1 rounded-md text-[12px] font-medium transition-all ${
                    filterTab === tab.id
                      ? 'bg-white text-[var(--foreground)] shadow-xs'
                      : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[var(--color-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="搜索标签..."
                  className="w-44 pl-7 pr-6 py-1 text-[12px] rounded-lg border border-[var(--color-border)] bg-white focus:outline-none focus:border-[var(--color-primary)] transition-all"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-[var(--foreground)]"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <Tooltip content={meta.sortMode === 'count' ? '当前：按数量降序' : '当前：按名称排序'}>
                <button
                  type="button"
                  onClick={() => setTagSortMode(module, meta.sortMode === 'count' ? 'alpha' : 'count')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[12px] font-medium transition-colors ${
                    meta.sortMode === 'alpha'
                      ? 'border-[var(--color-primary)]/40 bg-[var(--color-primary)]/8 text-[var(--color-primary)]'
                      : 'border-[var(--color-border)] bg-white text-[var(--color-muted)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <ArrowUpDown className="w-3 h-3" />
                  <span>{meta.sortMode === 'count' ? '热度' : '名称'}</span>
                </button>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* 批量操作条（全选或清理未使用） */}
        {(selectedTags.size > 0 || statsSummary.unused > 0) && (
          <div className="px-6 py-2 bg-black/[0.025] border-b border-[var(--color-border)]/50 flex items-center justify-between text-[12px] shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleSelectAllVisible}
                className="inline-flex items-center gap-1.5 text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors"
              >
                {allVisibleSelected ? (
                  <CheckSquare className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                ) : (
                  <Square className="w-3.5 h-3.5" />
                )}
                <span>全选当前列表</span>
              </button>
              {selectedTags.size > 0 && (
                <span className="text-[var(--color-primary)] font-medium">
                  已选 {selectedTags.size} 个
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {statsSummary.unused > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const unusedTargets = allStats.filter(s => s.count === 0);
                    requestDeleteTags(unusedTargets);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-black/[0.04] hover:bg-black/[0.08] text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>清理未使用 ({statsSummary.unused})</span>
                </button>
              )}
              {selectedTags.size > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const targets = allStats.filter(s => selectedTags.has(s.name));
                    requestDeleteTags(targets);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-50 hover:bg-red-100 text-red-600 font-medium transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>批量删除 ({selectedTags.size})</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 标签列表区 */}
        <div className="flex-1 overflow-y-auto px-6 py-3 divide-y divide-black/[0.05] custom-scrollbar">
          {filteredStats.length === 0 ? (
            <div className="py-12 text-center">
              <Tag className="w-8 h-8 text-[var(--color-muted)]/30 mx-auto mb-2" />
              <p className="text-[13px] text-[var(--color-muted)]">
                {search.trim() ? '未找到匹配的标签' : filterTab === 'starred' ? '暂无常用标签，点击星标即可设为常用' : filterTab === 'unused' ? '暂无未使用的标签' : '暂无标签，在上方创建一个吧'}
              </p>
            </div>
          ) : (
            filteredStats.map(stat => {
              const isEditingRow = editingTag === stat.name;
              const isSelectedRow = selectedTags.has(stat.name);

              return (
                <div
                  key={stat.name}
                  className={`py-2.5 flex items-center justify-between gap-3 group transition-colors ${
                    isSelectedRow ? 'bg-[var(--color-primary)]/[0.04] -mx-2 px-2 rounded-lg' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* 复选框 */}
                    <button
                      type="button"
                      onClick={() => toggleSelectRow(stat.name)}
                      className="text-[var(--color-muted)] hover:text-[var(--color-primary)] shrink-0"
                    >
                      {isSelectedRow ? (
                        <CheckSquare className="w-4 h-4 text-[var(--color-primary)]" />
                      ) : (
                        <Square className="w-4 h-4 opacity-50 group-hover:opacity-100" />
                      )}
                    </button>

                    {/* 常用星标开关 */}
                    <Tooltip content={stat.isStarred ? '取消常用' : '设为常用（在选择器中置顶）'}>
                      <button
                        type="button"
                        onClick={() => toggleStarTag(module, stat.name)}
                        className={`p-1 rounded-md transition-colors shrink-0 ${
                          stat.isStarred
                            ? 'text-amber-500 bg-amber-500/10'
                            : 'text-[var(--color-muted)]/50 hover:text-amber-500 hover:bg-amber-500/10'
                        }`}
                      >
                        <Star className={`w-3.5 h-3.5 ${stat.isStarred ? 'fill-amber-400' : ''}`} />
                      </button>
                    </Tooltip>

                    {/* 标签名或内联重命名输入 */}
                    {isEditingRow ? (
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editValue}
                          disabled={busyTagOp}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitRename(stat.name);
                            } else if (e.key === 'Escape') {
                              e.stopPropagation();
                              setEditingTag(null);
                            }
                          }}
                          className="flex-1 min-w-0 px-2.5 py-1 text-[12.5px] rounded-md border border-[var(--color-primary)] bg-white outline-none"
                        />
                        <button
                          type="button"
                          disabled={busyTagOp}
                          onClick={() => commitRename(stat.name)}
                          className="p-1.5 rounded-md bg-[var(--color-primary)] text-white hover:bg-blue-600 transition-colors shrink-0"
                        >
                          {busyTagOp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          disabled={busyTagOp}
                          onClick={() => setEditingTag(null)}
                          className="p-1.5 rounded-md bg-black/5 text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (onSelectTagFilter) {
                              onSelectTagFilter(stat.name);
                              onClose();
                            }
                          }}
                          title={onSelectTagFilter ? `点击筛选包含 #${stat.name} 的条目` : stat.name}
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[12.5px] font-medium truncate max-w-[260px] transition-colors ${
                            onSelectTagFilter
                              ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/18 cursor-pointer'
                              : 'bg-black/[0.04] text-[var(--foreground)] cursor-default'
                          }`}
                        >
                          <span className="opacity-60">#</span>
                          <span className="truncate">{stat.name}</span>
                        </button>
                        {stat.isStarred && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-medium shrink-0">
                            常用
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 右侧数量 + 重命名 / 删除按钮 */}
                  {!isEditingRow && (
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[11.5px] px-2 py-0.5 rounded-full ${
                          stat.count === 0
                            ? 'bg-black/[0.04] text-[var(--color-muted)]/70'
                            : 'bg-black/[0.04] text-[var(--color-muted)] font-medium'
                        }`}
                      >
                        {stat.count === 0 ? '未使用' : `${stat.count} ${unitLabel}`}
                      </span>

                      <Tooltip content="重命名（输入已有标签名可自动合并）">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTag(stat.name);
                            setEditValue(stat.name);
                            setTimeout(() => {
                              editInputRef.current?.focus();
                              editInputRef.current?.select();
                            }, 30);
                          }}
                          className="p-1.5 rounded-md text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors opacity-60 group-hover:opacity-100"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </Tooltip>

                      <Tooltip content="删除标签">
                        <button
                          type="button"
                          onClick={() => requestDeleteTags([stat])}
                          className="p-1.5 rounded-md text-[var(--color-muted)] hover:text-red-500 hover:bg-red-50 transition-colors opacity-60 group-hover:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </Tooltip>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* 弹窗内部确认弹层 */}
        {pendingConfirm && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-6 bg-black/20 backdrop-blur-[2px] animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl border border-black/10 shadow-2xl max-w-sm w-full overflow-hidden">
              <div className="p-5 flex items-start gap-3.5">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${pendingConfirm.danger ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'}`}>
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[14px] font-semibold text-[var(--foreground)] mb-1">
                    {pendingConfirm.title}
                  </h3>
                  <p className="text-[12.5px] text-[var(--color-muted)] leading-relaxed">
                    {pendingConfirm.message}
                  </p>
                </div>
              </div>
              <div className="px-5 py-3 bg-gray-50/80 border-t border-black/[0.06] flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={busyTagOp}
                  onClick={() => setPendingConfirm(null)}
                  className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={busyTagOp}
                  onClick={() => pendingConfirm.onConfirm()}
                  className={`px-4 py-1.5 rounded-lg text-[12.5px] font-medium text-white transition-colors inline-flex items-center gap-1.5 ${
                    pendingConfirm.danger
                      ? 'bg-red-500 hover:bg-red-600'
                      : 'bg-[var(--color-primary)] hover:bg-blue-600'
                  }`}
                >
                  {busyTagOp && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{pendingConfirm.confirmText}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
