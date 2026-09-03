import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Download, Star, LayoutGrid, Trash2, Trash, FolderPlus, MoreHorizontal, X, Folder, Edit2, FolderX, Tag, PanelRightClose, ChevronRight, Search, Loader2, Copy, RotateCcw, MessageSquareText } from "lucide-react";
import { Prompt, PromptGroup, PromptVersion } from "./types";
import { PromptCard } from "./components/prompt/PromptCard";
import { SelectionArea, SelectionEvent } from "@viselect/react";

import { CreateGroupDialog } from "./components/prompt/CreateGroupDialog";
import { PromptExportDialog } from "./components/prompt/PromptExportDialog";
import { ConfirmDialog } from "./components/ui/ConfirmDialog";
import { showToast } from "./components/ui/Toast";
import { Tooltip } from "./components/ui/Tooltip";
import { ContextMenu, useContextMenu } from "./components/ui/ContextMenu";
import { QuickLookModal } from "./components/ui/QuickLookModal";

// ===== 侧边栏导航（嵌入 App.tsx 左侧栏）=====
export type PromptFilter = "all" | "favorites" | string;

interface PromptSidebarNavProps {
  filter: PromptFilter;
  groups: PromptGroup[];
  onFilterChange: (filter: PromptFilter, e?: React.MouseEvent) => void;
  onCreateGroup: () => void;
  onGroupSaved: () => void;
  isCreateGroupOpen: boolean;
  onCreateGroupClose: () => void;
}

export function PromptSidebarNav({
  filter, groups, onFilterChange, onCreateGroup,
  isCreateGroupOpen, onCreateGroupClose, onGroupSaved,
}: PromptSidebarNavProps) {
  const { menuPosition, showContextMenu, hideContextMenu } = useContextMenu();
  const [contextMenuGroup, setContextMenuGroup] = useState<PromptGroup | null>(null);
  const [editGroup, setEditGroup] = useState<PromptGroup | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<PromptGroup | null>(null);

  const [tagList, setTagList] = useState<{ name: string; count: number }[]>([]);

  const fetchTags = useCallback(async () => {
    try {
      const all = await invoke<Prompt[]>("get_prompts", { groupId: null, search: null });
      const map = new Map<string, number>();
      all.forEach(p => {
        if (p.tags) {
          p.tags.split(',').forEach(t => {
            const tr = t.trim();
            if (tr) {
              map.set(tr, (map.get(tr) || 0) + 1);
            }
          });
        }
      });
      const sorted = Array.from(map.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      setTagList(sorted);
    } catch (e) {
      console.error("加载提示词标签失败", e);
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags, filter]);

  useEffect(() => {
    const handler = () => fetchTags();
    window.addEventListener('skillhub:prompt-tags-changed', handler);
    return () => window.removeEventListener('skillhub:prompt-tags-changed', handler);
  }, [fetchTags]);

  const handleDeleteGroup = async () => {
    if (!deleteGroup) return;
    try {
      await invoke("delete_prompt_group", { id: deleteGroup.id });
      onGroupSaved();
      setDeleteGroup(null);
    } catch (e) {
      showToast(`删除失败: ${e}`, "error");
    }
  };

  return (
    <>
      {/* 快捷筛选 */}
      <div className="px-3 mt-1 mb-5">
        <h3 className="text-[11px] font-semibold text-[var(--color-muted)]/60 mb-1 px-2 uppercase tracking-wide">快捷筛选</h3>
        <div className="space-y-0.5">
          {[
            { id: "all", label: "全部提示词", icon: LayoutGrid },
            { id: "favorites", label: "收藏", icon: Star },
            { id: "ungrouped", label: "未分组", icon: FolderX },
            { id: "untagged", label: "未标签", icon: Tag },
            { id: "trash", label: "回收站", icon: Trash },
          ].map(item => (
            <button
              key={item.id}
              onClick={(e) => onFilterChange(item.id as PromptFilter, e)}
              onAuxClick={(e) => { if (e.button === 1) onFilterChange(item.id as PromptFilter, e); }}
              className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md transition-colors outline-none select-none text-[13px] ${
                filter === item.id
                  ? "bg-black/5 text-[var(--foreground)] font-semibold"
                  : "text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] font-medium"
              }`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 标签栏（与技能左侧栏对齐） */}
      <div className="px-3 mb-5">
        <h3 className="text-[11px] font-semibold text-[var(--color-muted)]/60 mb-1 px-2 uppercase tracking-wide">
          标签
        </h3>
        <div className="space-y-0.5">
          {tagList.map(({ name, count }) => (
            <button
              key={name}
              onClick={(e) => onFilterChange(`tag:${name}` as PromptFilter, e)}
              onAuxClick={(e) => { if (e.button === 1) onFilterChange(`tag:${name}` as PromptFilter, e); }}
              className={`w-full flex items-center justify-between px-2 py-1 rounded-md transition-colors outline-none select-none text-[13px] ${
                filter === `tag:${name}`
                  ? "bg-black/5 text-[var(--foreground)] font-semibold"
                  : "text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] font-medium"
              }`}
            >
              <span className="flex items-center gap-1.5 truncate min-w-0">
                <Tag className="w-3.5 h-3.5 opacity-70 shrink-0" />
                <span className="truncate">{name}</span>
              </span>
              <span className="text-[11px] text-[var(--color-muted)] shrink-0 ml-1">{count}</span>
            </button>
          ))}
          {tagList.length === 0 && (
            <div className="text-[11px] text-[var(--color-muted)]/50 px-2 py-1">暂无标签</div>
          )}
        </div>
      </div>

      {/* 分组列表 */}
      <div className="px-3">
        <div className="flex items-center justify-between mb-1 px-2">
          <h3 className="text-[11px] font-semibold text-[var(--color-muted)]/60 uppercase tracking-wide">我的分组</h3>
          <Tooltip content="新建分组">
            <button
              onClick={onCreateGroup}
              className="p-0.5 rounded text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        </div>
        <div className="space-y-0.5">
          {groups.map(group => (
            <button
              key={group.id}
              onClick={(e) => onFilterChange(`group:${group.id}` as PromptFilter, e)}
              onAuxClick={(e) => { if (e.button === 1) onFilterChange(`group:${group.id}` as PromptFilter, e); }}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenuGroup(group);
                showContextMenu(e);
              }}
              className={`w-full flex items-center justify-between px-2 py-1 rounded-md transition-colors outline-none select-none text-[13px] ${
                filter === `group:${group.id}`
                  ? "bg-black/5 text-[var(--foreground)] font-semibold"
                  : "text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] font-medium"
              }`}
            >
              <span className="flex items-center gap-1.5 truncate min-w-0">
                <Folder className="w-3.5 h-3.5 shrink-0" style={{ color: group.color || "var(--color-muted)" }} />
                <span className="truncate">{group.name}</span>
              </span>
              <span className="text-[11px] text-[var(--color-muted)] shrink-0 ml-1">{group.prompt_count}</span>
            </button>
          ))}
          {groups.length === 0 && (
            <p className="text-[12px] text-[var(--color-muted)] px-2 py-1.5">暂无分组</p>
          )}
        </div>
      </div>

      {/* 创建/编辑分组弹窗 */}
      <CreateGroupDialog
        isOpen={isCreateGroupOpen || !!editGroup}
        group={editGroup}
        onClose={() => {
          onCreateGroupClose();
          setEditGroup(null);
        }}
        onSave={onGroupSaved}
      />

      <ContextMenu
        position={menuPosition}
        onClose={hideContextMenu}
        items={[
          {
            id: 'edit-group',
            label: '编辑分组',
            icon: <Edit2 className="w-3.5 h-3.5" />,
            onClick: () => {
              if (contextMenuGroup) setEditGroup(contextMenuGroup);
              hideContextMenu();
            }
          },
          {
            id: 'delete-group-separator',
            label: '',
            separator: true
          },
          {
            id: 'delete-group',
            label: '删除分组',
            icon: <Trash2 className="w-3.5 h-3.5" />,
            danger: true,
            onClick: () => {
              if (contextMenuGroup) setDeleteGroup(contextMenuGroup);
              hideContextMenu();
            }
          }
        ]}
      />

      <ConfirmDialog
        isOpen={!!deleteGroup}
        title="确认删除分组？"
        message={deleteGroup ? `您正在删除分组“${deleteGroup.name}”。\n删除分组不会删除提示词本身，它们将被移回“全部提示词”状态。` : ""}
        onConfirm={handleDeleteGroup}
        onCancel={() => setDeleteGroup(null)}
      />
    </>
  );
}

// ===== 主内容区（不含侧边栏）=====
interface PromptModuleProps {
  filter: PromptFilter;
  refreshKey?: number;
  activePromptId?: string;
  onGroupsChange: (groups: PromptGroup[]) => void;
  onFilterChange: (filter: PromptFilter) => void;
  onTitleChange: (title: string, icon: string) => void;
  onToggleInspector?: () => void;
  onOpenPromptDetail?: (title: string, promptId?: string, isEditing?: boolean, newTab?: boolean) => void;
}

interface PromptInspectorData {
  prompt: Prompt;
  versions: PromptVersion[];
}

export function PromptModule({ filter, refreshKey, activePromptId, onGroupsChange, onTitleChange, onToggleInspector, onOpenPromptDetail }: PromptModuleProps) {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [groups, setGroups] = useState<PromptGroup[]>([]);
  const [search] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [inspectorData, setInspectorData] = useState<PromptInspectorData | null>(null);
  const [detailPromptCache, setDetailPromptCache] = useState<Prompt | null>(null);
  const isDraggingRef = useRef(false); // 追踪框选状态，避免干扰
  const [quickLookOpen, setQuickLookOpen] = useState(false);

  // 当处于 prompt-detail 时，确保能拿到当前详情对应的 prompt 对象，哪怕它不在被当前过滤条件的 prompts 列表中
  useEffect(() => {
    if (activePromptId) {
      const found = prompts.find(p => p.id === activePromptId);
      if (found) {
        setDetailPromptCache(found);
      } else {
        invoke<Prompt[]>("get_prompts", { groupId: null, search: null })
          .then(all => {
            const f = all.find(p => p.id === activePromptId);
            if (f) setDetailPromptCache(f);
          })
          .catch(console.error);
      }
    } else {
      setDetailPromptCache(null);
    }
  }, [activePromptId, prompts]);

  // 弹窗状态

  
  // Tag editor in inspector
  const [inspectorTagInput, setInspectorTagInput] = useState("");
  const [isInspectorTagDropdownOpen, setIsInspectorTagDropdownOpen] = useState(false);
  const inspectorTagInputRef = useRef<HTMLInputElement>(null);
  const inspectorTagDropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部收起标签下拉面板
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (inspectorTagDropdownRef.current && !inspectorTagDropdownRef.current.contains(e.target as Node)) {
        setIsInspectorTagDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Derived tags for autocomplete
  const allTags = Array.from(new Set(prompts.flatMap(p => p.tags ? p.tags.split(",").map(t => t.trim()).filter(Boolean) : [])));

  const handleInspectorAddTag = async (prompt: Prompt, newTag: string) => {
    if (!newTag) return;
    const currentTags = prompt.tags || "";
    const tagList = currentTags ? currentTags.split(",").map(t => t.trim()).filter(Boolean) : [];
    if (tagList.includes(newTag)) return;
    const newTags = [...tagList, newTag].join(",");
    
    // Optimistic update
    setPrompts(prev => prev.map(p => p.id === prompt.id ? { ...p, tags: newTags } : p));
    
    try {
      await invoke("update_prompt", { 
        id: prompt.id, 
        title: prompt.title, 
        content: prompt.content,
        description: prompt.description || null, 
        groupId: prompt.group_id || null,
        tags: newTags || null, 
        variables: prompt.variables || null,
        changeNote: "添加标签" 
      });
      window.dispatchEvent(new CustomEvent('skillhub:prompt-tags-changed'));
    } catch (e) {
      showToast("更新标签失败", "error");
      fetchData(); // Revert
    }
  };

  const handleInspectorRemoveTag = async (prompt: Prompt, tagToRemove: string) => {
    const currentTags = prompt.tags || "";
    const tagList = currentTags ? currentTags.split(",").map(t => t.trim()).filter(Boolean) : [];
    const newTags = tagList.filter(t => t !== tagToRemove).join(",");
    
    // Optimistic update
    setPrompts(prev => prev.map(p => p.id === prompt.id ? { ...p, tags: newTags } : p));
    
    try {
      await invoke("update_prompt", { 
        id: prompt.id, 
        title: prompt.title, 
        content: prompt.content,
        description: prompt.description || null, 
        groupId: prompt.group_id || null,
        tags: newTags || null, 
        variables: prompt.variables || null,
        changeNote: "移除标签" 
      });
      window.dispatchEvent(new CustomEvent('skillhub:prompt-tags-changed'));
    } catch (e) {
      showToast("更新标签失败", "error");
      fetchData(); // Revert
    }
  };

  const handleInspectorUpdateGroup = async (prompt: Prompt, groupId: string | null) => {
    // Optimistic update
    setPrompts(prev => prev.map(p => p.id === prompt.id ? { ...p, group_id: groupId || undefined } : p));
    
    try {
      await invoke("update_prompt", { 
        id: prompt.id, 
        title: prompt.title, 
        content: prompt.content,
        description: prompt.description || null, 
        groupId: groupId,
        tags: prompt.tags || null, 
        variables: prompt.variables || null,
        changeNote: "修改分组" 
      });
      showToast("分组已更新");
    } catch (e) {
      showToast("更新分组失败", "error");
      fetchData(); // Revert
    }
  };
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);

  // 获取下一个元素的辅助函数
  const getNextElement = (currentId: string | null, direction: 'up' | 'down' | 'left' | 'right', columns: number) => {
    if (!currentId) return null;
    const currentIndex = prompts.findIndex(p => p.id === currentId);
    if (currentIndex === -1) return null;
    
    let nextIndex = currentIndex;
    if (direction === 'left') nextIndex = currentIndex - 1;
    else if (direction === 'right') nextIndex = currentIndex + 1;
    else if (direction === 'up') nextIndex = currentIndex - columns;
    else if (direction === 'down') nextIndex = currentIndex + columns;
    
    if (nextIndex >= 0 && nextIndex < prompts.length) {
      return prompts[nextIndex];
    }
    return null;
  };



  // 从本地加载分组（仅前端缓存或读取真实数据）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (isInput) return;

      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (selectedIds.size > 0) {
          e.preventDefault();
          handleDeleteSelected();
        }
        return;
      }

      if (e.key === ' ') {
        if (selectedIds.size > 0) {
          e.preventDefault();
          setQuickLookOpen(prev => !prev);
        }
        return;
      }

      if (e.key === 'Enter') {
        if (selectedIds.size === 1) {
          e.preventDefault();
          const p = prompts.find(p => p.id === Array.from(selectedIds)[0]);
          if (p) {
            if (onOpenPromptDetail) {
              onOpenPromptDetail(p.title || '无标题提示词', p.id, false);
            }
          }
        }
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (selectedIds.size === 0) return;
        
        e.preventDefault();
        
        // 计算列数
        const grid = document.querySelector('.prompt-grid');
        let columns = 3; // 默认
        if (grid) {
          const gridStyle = window.getComputedStyle(grid);
          columns = gridStyle.gridTemplateColumns.split(' ').length;
        }

        const currentId = lastSelectedId || Array.from(selectedIds)[0];
        const nextPrompt = getNextElement(
          currentId,
          e.key.replace('Arrow', '').toLowerCase() as 'up' | 'down' | 'left' | 'right',
          columns
        );

        if (nextPrompt) {
          if (e.shiftKey) {
            setSelectedIds(prev => {
              const next = new Set(prev);
              next.add(nextPrompt.id);
              return next;
            });
            setLastSelectedId(nextPrompt.id);
            setInspectorData(null);
            const el = document.querySelector(`[data-prompt-id="${nextPrompt.id}"]`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          } else {
            handleSelectPrompt(nextPrompt);
          }
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prompts, selectedIds, lastSelectedId, quickLookOpen]);
  const [exportingPrompts, setExportingPrompts] = useState<Prompt[]>([]);

  // 右键菜单
  const { menuPosition, showContextMenu, hideContextMenu } = useContextMenu();
  const [contextPrompt, setContextPrompt] = useState<Prompt | null>(null);

  // 确认弹窗
  const [confirmData, setConfirmData] = useState<{ title: string, message: string, onConfirm: () => void, onCancel: () => void } | null>(null);
  const waitConfirm = (message: string, title: string = "确认操作") => new Promise<boolean>(resolve => {
    setConfirmData({
      title,
      message,
      onConfirm: () => { setConfirmData(null); resolve(true); },
      onCancel: () => { setConfirmData(null); resolve(false); }
    });
  });

  const fetchData = useCallback(async () => {
    try {
      const backendGroupId = filter === "all" || filter === "favorites" || filter.startsWith("tag:") ? null 
        : filter.startsWith("group:") ? filter.split(":")[1] 
        : filter;
      
      const [ps, gs] = await Promise.all([
        invoke<Prompt[]>("get_prompts", { groupId: backendGroupId, search: search || null }),
        invoke<PromptGroup[]>("get_prompt_groups"),
      ]);
      // 收藏与标签筛选在前端做
      let filtered = ps;
      if (filter === "favorites") {
        filtered = ps.filter(p => p.is_favorite);
      } else if (filter.startsWith("tag:")) {
        const targetTag = filter.slice(4);
        filtered = ps.filter(p => {
          if (!p.tags) return false;
          return p.tags.split(',').map(t => t.trim()).includes(targetTag);
        });
      }
      setPrompts(filtered);
      setGroups(gs);
      onGroupsChange(gs);
    } catch (err) {
      showToast(`加载失败: ${err}`, "error");
    }
  }, [filter, search, onGroupsChange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // refreshKey 变化时（如新建分组后）强制刷新
  useEffect(() => {
    if (refreshKey && refreshKey > 0) fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // 提示词库整体概览统计（未选中时在右侧检查器展示）
  const [overviewStats, setOverviewStats] = useState<{
    total: number;
    favorites: number;
    grouped: number;
    ungrouped: number;
    tagged: number;
    topTags: { name: string; count: number }[];
  }>({ total: 0, favorites: 0, grouped: 0, ungrouped: 0, tagged: 0, topTags: [] });

  const fetchOverviewStats = useCallback(async () => {
    try {
      const all = await invoke<Prompt[]>("get_prompts", { groupId: null, search: null });
      const tagMap = new Map<string, number>();
      let fav = 0;
      let grp = 0;
      let ungrp = 0;
      let tagCount = 0;

      all.forEach(p => {
        if (p.is_favorite) fav++;
        if (p.group_id) grp++; else ungrp++;
        if (p.tags) {
          const tags = p.tags.split(',').map(t => t.trim()).filter(Boolean);
          if (tags.length > 0) {
            tagCount++;
            tags.forEach(t => tagMap.set(t, (tagMap.get(t) || 0) + 1));
          }
        }
      });

      const topTags = Array.from(tagMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      setOverviewStats({
        total: all.length,
        favorites: fav,
        grouped: grp,
        ungrouped: ungrp,
        tagged: tagCount,
        topTags,
      });
    } catch (e) {
      console.error("获取提示词概览失败", e);
    }
  }, []);

  useEffect(() => {
    fetchOverviewStats();
  }, [fetchOverviewStats, refreshKey]);

  useEffect(() => {
    const handler = () => fetchOverviewStats();
    window.addEventListener('skillhub:prompt-tags-changed', handler);
    return () => window.removeEventListener('skillhub:prompt-tags-changed', handler);
  }, [fetchOverviewStats]);

  // 当 filter 切换时清空选中和 inspector
  useEffect(() => {
    setSelectedIds(new Set());
    setInspectorData(null);
  }, [filter]);

  const handleSelectPrompt = (prompt: Prompt, e?: React.MouseEvent) => {
    if (e && (e.metaKey || e.ctrlKey || e.shiftKey)) {
      return;
    }
    setSelectedIds(new Set([prompt.id]));
    setLastSelectedId(prompt.id);
    const el = document.querySelector(`[data-prompt-id="${prompt.id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  useEffect(() => {
    const handleSelectPromptEvent = (e: CustomEvent<string>) => {
      const id = e.detail;
      const prompt = prompts.find(p => p.id === id);
      if (prompt) {
        handleSelectPrompt(prompt);
      }
    };
    window.addEventListener('select-prompt', handleSelectPromptEvent as EventListener);
    return () => window.removeEventListener('select-prompt', handleSelectPromptEvent as EventListener);
  }, [prompts]);

  const handleCardSelect = (id: string, e: React.MouseEvent) => {
    if (e.button === 2) return; // 忽略右键点击，避免在多选时右键清空选中状态
    if (e.metaKey || e.ctrlKey) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      setLastSelectedId(id);
    } else if (e.shiftKey && lastSelectedId) {
      const currentIndex = prompts.findIndex(p => p.id === id);
      const lastIndex = prompts.findIndex(p => p.id === lastSelectedId);
      if (currentIndex !== -1 && lastIndex !== -1) {
        const start = Math.min(currentIndex, lastIndex);
        const end = Math.max(currentIndex, lastIndex);
        const newSelected = new Set(selectedIds);
        for (let i = start; i <= end; i++) {
          newSelected.add(prompts[i].id);
        }
        setSelectedIds(newSelected);
      }
    } else {
      setSelectedIds(new Set([id]));
      setLastSelectedId(id);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    if (filter === "trash") {
      if (!(await waitConfirm(`确认彻底删除选中的 ${ids.length} 个提示词吗？此操作不可恢复！`, "彻底删除"))) return;
      try {
        await invoke("hard_delete_prompts", { ids });
        setSelectedIds(new Set());
        setInspectorData(null);
        fetchData();
        showToast(`已彻底删除 ${ids.length} 个提示词`, "success");
      } catch (err) {
        showToast(`删除失败: ${err}`, "error");
      }
    } else {
      try {
        await invoke("delete_prompts", { ids });
        setSelectedIds(new Set());
        setInspectorData(null);
        fetchData();
        showToast(`已移入回收站`, "success", {
          label: "撤销",
          onClick: async () => {
            await invoke("restore_prompts", { ids });
            showToast(`已撤销删除`, "success");
            fetchData();
          }
        });
      } catch (err) {
        showToast(`删除失败: ${err}`, "error");
      }
    }
  };

  const handleEmptyTrash = async () => {
    if (!(await waitConfirm("确认清空回收站吗？清空后所有提示词将永久丢失！", "清空回收站"))) return;
    try {
      await invoke("empty_trash");
      setSelectedIds(new Set());
      setInspectorData(null);
      fetchData();
      showToast("回收站已清空", "success");
    } catch (err) {
      showToast(`清空失败: ${err}`, "error");
    }
  };

  const handleFavoriteToggle = (id: string, newVal: boolean) => {
    setPrompts(prev => prev.map(p => p.id === id ? { ...p, is_favorite: newVal } : p));
    if (inspectorData?.prompt.id === id) {
      setInspectorData(prev => prev ? { ...prev, prompt: { ...prev.prompt, is_favorite: newVal } } : null);
    }
    fetchOverviewStats();
  };

  const filterLabel = filter === "all" ? "全部提示词"
    : filter === "favorites" ? "收藏"
    : filter === "ungrouped" ? "未分组"
    : filter === "untagged" ? "未标签"
    : filter === "trash" ? "回收站"
    : filter.startsWith("group:") ? groups.find(g => g.id === filter.split(":")[1])?.name || "未知分组"
    : filter.startsWith("tag:") ? filter.slice(4)
    : "提示词";

  const getFilterIconStr = () => {
    if (filter === "all") return 'LayoutGrid';
    if (filter === "favorites") return 'Star';
    if (filter === "ungrouped") return 'FolderMinus';
    if (filter === "untagged") return 'Tag';
    if (filter === "trash") return 'Trash2';
    if (filter.startsWith("group:")) return 'Folder';
    if (filter.startsWith("tag:")) return 'Tag';
    return 'MessageSquareText';
  };

  useEffect(() => {
    if (onTitleChange) {
      onTitleChange(filterLabel, getFilterIconStr());
    }
  }, [filterLabel, filter, groups, onTitleChange]);

  const selectedPrompts = prompts.filter(p => selectedIds.has(p.id));

  const handleSelectionStart = ({ event, selection }: SelectionEvent) => {
    // Fix z-index for the clipping container (viselect sets inline z-index:1)
    const area = selection.getSelectionArea();
    if (area?.parentElement) {
      area.parentElement.style.zIndex = '10000';
    }
    if (!event?.ctrlKey && !event?.metaKey && !event?.shiftKey) {
      selection.clearSelection();
      setSelectedIds(new Set());
    }
  };

  const handleSelectionMove = ({ store: { changed: { added, removed } } }: SelectionEvent) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      added.forEach(el => {
        const id = el.getAttribute('data-prompt-id');
        if (id) next.add(id);
      });
      removed.forEach(el => {
        const id = el.getAttribute('data-prompt-id');
        if (id) next.delete(id);
      });
      return next;
    });
    setInspectorData(null); // 多选时清空单项详情
  };

  return (
    <div className="flex flex-1 h-full min-w-0 overflow-hidden bg-transparent">
      {/* 主内容区 */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-white">
        <div 
          className="pt-5 pb-3 px-6 bg-white flex items-center justify-between shrink-0 relative z-0"
        >
          <div className="flex items-center space-x-3">
            <h1 className="text-[15px] font-medium tracking-tight text-[var(--foreground)] flex items-center">
              {filterLabel}
              <span className="bg-black/5 text-[var(--color-muted)] text-[11px] px-2 py-0.5 rounded-full font-medium ml-2">{prompts.length}</span>
            </h1>
          </div>
          <div className="flex items-center gap-1">
            {prompts.length > 0 && filter === "trash" && (
              <button
                onClick={handleEmptyTrash}
                className="flex items-center space-x-1 px-2 py-1 rounded-md font-medium text-[12px] text-red-500 hover:text-red-600 hover:bg-red-50 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                清空回收站
              </button>
            )}
            {prompts.length > 0 && filter !== "trash" && (
              <button 
                onClick={() => setIsExportDialogOpen(true)}
                className="flex items-center space-x-1 px-2 py-1 rounded-md font-medium text-[12px] text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>导出全部</span>
              </button>
            )}
            {filter !== "trash" && (
              <button 
                onClick={() => onOpenPromptDetail?.("新建提示词", undefined, true)}
                className="flex items-center space-x-1 bg-blue-500 text-white px-2.5 py-1 rounded-md text-[12px] font-medium hover:bg-blue-600 shadow-sm shadow-blue-500/20 transition-all ml-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>添加提示词</span>
              </button>
            )}
          </div>
        </div>

        {/* 内容 */}
          {/* 卡片网格 */}
          <div 
            className="flex-1 overflow-y-auto hover-scroll relative z-0 bg-white"
            onMouseEnter={e => e.currentTarget.style.setProperty('--scroll-thumb-color', 'rgba(0,0,0,0.18)')}
            onMouseLeave={e => e.currentTarget.style.setProperty('--scroll-thumb-color', 'transparent')}
            onContextMenu={(e) => {
              if (e.target === e.currentTarget) {
                e.preventDefault();
                setContextPrompt(null);
                showContextMenu(e);
              }
            }}
          >
            {prompts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8">
                <div className="w-16 h-16 mb-4 rounded-2xl bg-[var(--color-primary)]/10 flex items-center justify-center">
                  <MoreHorizontal className="w-8 h-8 text-[var(--color-primary)]/40" />
                </div>
                <h3 className="text-[15px] font-semibold text-[var(--foreground)] mb-2">还没有提示词</h3>
                <p className="text-[13px] text-[var(--color-muted)] mb-4 text-center max-w-xs">
                  点击「添加提示词」开始收集你常用的 AI Prompt，随时快速复用
                </p>
                <button 
                  onClick={() => onOpenPromptDetail?.("新建提示词", undefined, true)}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-500 text-white text-[14px] font-medium rounded-xl hover:bg-blue-600 transition-colors shadow-sm shadow-blue-500/20"
                >
                  <Plus className="w-4 h-4" />
                  添加提示词
                </button>
              </div>
            ) : (
              // 框选容器：完全擑满可滚动区域，包括卡片下方的空白区
              <SelectionArea
                className="min-h-full flex flex-col"
                onBeforeStart={({ event }: SelectionEvent) => {
                  // 点击在 prompt-card 上不启动框选
                  if ((event?.target as Element)?.closest?.('[data-prompt-id]')) return false;
                  // 点击空白区：立即清空选中（取消高亮），然后允许框选继续
                  setSelectedIds(new Set());
                  setInspectorData(null);
                  return true;
                }}
                onStart={handleSelectionStart}
                onMove={(e) => {
                  isDraggingRef.current = true;
                  handleSelectionMove(e);
                }}
                onStop={() => { setTimeout(() => { isDraggingRef.current = false; }, 200); }}
                selectables=".prompt-card"
                features={{ touch: false, range: true, singleTap: { allow: false } }}
              >
                {/* grid 内容区，flex-1 确保空白区也在 SelectionArea 范围内 */}
                <div 
                  className="prompt-grid flex-1 px-6 pt-3 pb-20 grid grid-cols-2 xl:grid-cols-3 gap-4 content-start"
                  onPointerDown={(e) => {
                    // 点击网格空白处（非卡片）时清空选择，不调用 stopPropagation 确保事件继续冒泡给 SelectionArea
                    if (e.target === e.currentTarget) {
                      setSelectedIds(new Set());
                      setInspectorData(null);
                    }
                  }}
                  onContextMenu={(e) => {
                    if (e.target === e.currentTarget) {
                      e.preventDefault();
                      setContextPrompt(null);
                      showContextMenu(e);
                    }
                  }}
                >
                  {prompts.map(prompt => (
                    <PromptCard
                      key={prompt.id}
                      prompt={prompt}
                      isTrashMode={filter === "trash"}
                      onRestore={(p) => {
                        invoke("restore_prompts", { ids: [p.id] }).then(() => {
                          showToast("已恢复", "success");
                          setSelectedIds(new Set());
                          setInspectorData(null);
                          fetchData();
                        });
                      }}
                      onHardDelete={async (p) => {
                        if (!(await waitConfirm("确认彻底删除该提示词吗？此操作不可恢复！", "彻底删除"))) return;
                        invoke("hard_delete_prompts", { ids: [p.id] }).then(() => {
                          showToast("已彻底删除", "success");
                          setSelectedIds(new Set());
                          setInspectorData(null);
                          fetchData();
                        });
                      }}
                      selected={selectedIds.has(prompt.id)}
                      onSelect={handleCardSelect}
                      onClick={(e, p) => handleSelectPrompt(p, e)}
                      onDoubleClick={(p) => { 
                        if (filter !== "trash") {
                          if (onOpenPromptDetail) {
                            onOpenPromptDetail(p.title || '无标题提示词', p.id, false);
                          }
                        }
                      }}
                      onContextMenu={(e, p) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextPrompt(p);
                        if (!selectedIds.has(p.id)) {
                          setSelectedIds(new Set([p.id]));
                          invoke<PromptVersion[]>("get_prompt_versions", { promptId: p.id })
                            .then(versions => setInspectorData({ prompt: p, versions }))
                            .catch(() => setInspectorData({ prompt: p, versions: [] }));
                        }
                        showContextMenu(e);
                      }}
                      onFavoriteToggle={handleFavoriteToggle}
                      onCopy={() => {}}
                    />
                  ))}
                </div>
              </SelectionArea>
            )}
          </div>
        </div>

        {/* Inspector 面板 */}
        {document.getElementById('global-inspector-slot') ? createPortal(
          (() => {
            const isDetailMode = Boolean(activePromptId);
            const detailTargetPrompt = isDetailMode ? (prompts.find(x => x.id === activePromptId) || detailPromptCache) : null;

            if (!isDetailMode) {
              if (selectedIds.size === 0) {
                const overviewTitle = filter === "all" ? "我的提示词库"
                  : filter === "favorites" ? "星标收藏"
                  : filter === "ungrouped" ? "未分组提示词"
                  : filter === "untagged" ? "未标签提示词"
                  : filter === "trash" ? "回收站"
                  : filter.startsWith("group:") ? (groups.find(g => g.id === filter.split(":")[1])?.name || "提示词分组")
                  : filter.startsWith("tag:") ? `#${filter.slice(4)}`
                  : "提示词库";

                const overviewSubtitle = filter === "all" ? "本地提示词统一存储与管理"
                  : filter === "favorites" ? "已收藏的高频提示词"
                  : filter === "ungrouped" ? "暂未分配到任何分组"
                  : filter === "untagged" ? "暂未添加任何标签"
                  : filter === "trash" ? "已移入回收站的提示词"
                  : filter.startsWith("group:") ? "自定义提示词分组"
                  : filter.startsWith("tag:") ? "按标签智能分类"
                  : "提示词管理";

                const currentGroup = filter.startsWith("group:") ? groups.find(g => g.id === filter.split(":")[1]) : null;
                const iconBgColor = currentGroup?.color || 'var(--color-primary)';

                return (
                  <div className="w-64 border-l border-[var(--color-border)] bg-transparent flex flex-col shrink-0 h-full overflow-hidden inspector-container">
                    {/* 头部 */}
                    <div 
                      className="px-4 h-10 flex items-center justify-between shrink-0"
                      data-tauri-drag-region
                      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
                      onPointerDown={(e) => { if (e.target === e.currentTarget) import('@tauri-apps/api/window').then(m => m.getCurrentWindow().startDragging()); }}
                      onDoubleClick={(e) => { if (e.target === e.currentTarget) import('@tauri-apps/api/window').then(m => m.getCurrentWindow().toggleMaximize()); }}
                    >
                      <span className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider"></span>
                      {onToggleInspector && (
                        <Tooltip content="收起检查器 (⌘/)">
                          <button
                            onClick={onToggleInspector}
                            className="p-1.5 rounded-md text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/[0.06] transition-colors"
                          >
                            <PanelRightClose className="w-4 h-4" />
                          </button>
                        </Tooltip>
                      )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 inspector-scroll-area">
                      {/* 库/分组名称 */}
                      <div className="mb-5">
                        <div className="flex items-center space-x-2 mb-1">
                          <div 
                            className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-white shadow-sm"
                            style={{ backgroundColor: iconBgColor }}
                          >
                            <MessageSquareText className="w-3 h-3" />
                          </div>
                          <span className="text-[14px] font-semibold text-[var(--foreground)] truncate">
                            {overviewTitle}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--color-muted)] truncate ml-7">
                          {overviewSubtitle}
                        </p>
                      </div>

                      {/* 统计卡片 */}
                      <div className="grid grid-cols-2 gap-2 mb-5">
                        <div className="bg-black/[0.03] rounded-lg p-3 text-center">
                          <div className="text-[20px] font-bold text-[var(--foreground)]">{groups.length}</div>
                          <div className="text-[11px] text-[var(--color-muted)]">分组</div>
                        </div>
                        <div className="bg-black/[0.03] rounded-lg p-3 text-center">
                          <div className="text-[20px] font-bold text-[var(--foreground)]">{overviewStats.total}</div>
                          <div className="text-[11px] text-[var(--color-muted)]">提示词</div>
                        </div>
                      </div>

                      {/* 分类分布 */}
                      <div className="mb-5">
                        <h4 className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">分类分布</h4>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[12px]">
                            <div className="flex items-center space-x-1.5">
                              <span className="w-2 h-2 rounded-full bg-amber-400" />
                              <span className="text-[var(--foreground)]">星标收藏</span>
                            </div>
                            <span className="text-[var(--color-muted)] font-medium">{overviewStats.favorites}</span>
                          </div>
                          <div className="flex items-center justify-between text-[12px]">
                            <div className="flex items-center space-x-1.5">
                              <span className="w-2 h-2 rounded-full bg-[var(--color-primary)]" />
                              <span className="text-[var(--foreground)]">已分组</span>
                            </div>
                            <span className="text-[var(--color-muted)] font-medium">{overviewStats.grouped}</span>
                          </div>
                          <div className="flex items-center justify-between text-[12px]">
                            <div className="flex items-center space-x-1.5">
                              <span className="w-2 h-2 rounded-full bg-[#86868B]" />
                              <span className="text-[var(--foreground)]">未分组</span>
                            </div>
                            <span className="text-[var(--color-muted)] font-medium">{overviewStats.ungrouped}</span>
                          </div>
                          <div className="flex items-center justify-between text-[12px]">
                            <div className="flex items-center space-x-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              <span className="text-[var(--foreground)]">已标签</span>
                            </div>
                            <span className="text-[var(--color-muted)] font-medium">{overviewStats.tagged}</span>
                          </div>
                        </div>
                      </div>

                      {/* 热门标签 */}
                      {overviewStats.topTags.length > 0 && (
                        <div>
                          <h4 className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">热门标签</h4>
                          <div className="flex flex-wrap gap-1.5">
                            {overviewStats.topTags.map(t => (
                              <span
                                key={t.name}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/[0.03] text-[11px] text-[var(--foreground)]"
                              >
                                <Tag className="w-2.5 h-2.5 opacity-60 text-[var(--color-muted)]" />
                                <span>{t.name}</span>
                                <span className="text-[var(--color-muted)] text-[10px]">({t.count})</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }
              
              if (selectedIds.size > 1) {
                return (
                  <div className="bg-transparent border-l border-[var(--color-border)] flex flex-col shrink-0 h-full overflow-hidden w-64 inspector-container">
                    <div 
                      className="px-4 h-10 flex items-center justify-between shrink-0"
                      data-tauri-drag-region
                      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
                      onPointerDown={(e) => { if (e.target === e.currentTarget) import('@tauri-apps/api/window').then(m => m.getCurrentWindow().startDragging()); }}
                      onDoubleClick={(e) => { if (e.target === e.currentTarget) import('@tauri-apps/api/window').then(m => m.getCurrentWindow().toggleMaximize()); }}
                    >
                      <span className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wide"></span>
                      {onToggleInspector && (
                        <Tooltip content="收起检查器 (⌘/)">
                          <button
                            onClick={onToggleInspector}
                            className="p-1.5 rounded-md text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/[0.06] transition-colors"
                          >
                            <PanelRightClose className="w-4 h-4" />
                          </button>
                        </Tooltip>
                      )}
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-center p-4">
                      <div className="w-16 h-16 bg-[var(--color-primary)]/10 rounded-full flex items-center justify-center mb-4">
                         <span className="text-2xl font-bold text-[var(--color-primary)]">{selectedIds.size}</span>
                      </div>
                      <h3 className="text-[15px] font-semibold text-[var(--foreground)] mb-1">已选 {selectedIds.size} 个</h3>
                      <p className="text-[12px] text-[var(--color-muted)] text-center mb-6">你可以进行批量操作</p>
                    </div>
                    <div className="p-4 border-t border-[var(--color-border)]/60 shrink-0">
                      <div className="flex items-center space-x-2">
                        {filter !== "trash" && (
                          <button
                            onClick={() => { setExportingPrompts(selectedPrompts); setIsExportDialogOpen(true); }}
                            className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 text-[var(--color-primary)] rounded-lg transition-colors text-[12px] font-medium"
                          >
                            <Download size={12} />
                            <span>导出 ({selectedIds.size})</span>
                          </button>
                        )}
                        <button
                          onClick={handleDeleteSelected}
                          className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors text-[12px] font-medium"
                        >
                          <Trash2 size={12} />
                          <span>{filter === "trash" ? "彻底删除" : "删除"}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }
            }

            const p = isDetailMode ? detailTargetPrompt : selectedPrompts[0];
            if (!p) {
              if (isDetailMode) {
                return (
                  <div className="bg-transparent border-l border-[var(--color-border)] flex flex-col shrink-0 h-full overflow-hidden w-64 items-center justify-center p-4">
                    <Loader2 className="w-5 h-5 text-[var(--color-muted)] animate-spin" />
                  </div>
                );
              }
              return null;
            }

            return (
              <div className="bg-transparent border-l border-[var(--color-border)] flex flex-col shrink-0 h-full overflow-hidden w-64 inspector-container">
                <div 
                  className="px-4 h-10 flex items-center justify-between shrink-0"
                  data-tauri-drag-region
                  style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
                  onPointerDown={(e) => { if (e.target === e.currentTarget) import('@tauri-apps/api/window').then(m => m.getCurrentWindow().startDragging()); }}
                  onDoubleClick={(e) => { if (e.target === e.currentTarget) import('@tauri-apps/api/window').then(m => m.getCurrentWindow().toggleMaximize()); }}
                >
                  <span className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wide"></span>
                  <div className="flex items-center gap-1">

                    {onToggleInspector && (
                      <Tooltip content="收起检查器 (⌘/)">
                        <button
                          onClick={onToggleInspector}
                          className="p-1.5 rounded-md text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/[0.06] transition-colors"
                        >
                          <PanelRightClose className="w-4 h-4" />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-6 pt-3 pb-20 space-y-4 inspector-scroll-area">
                  <div>
                    <h3 className="text-[14px] font-semibold text-[var(--foreground)] mb-1">{p.title}</h3>
                    {p.description && (
                      <p className="text-[12px] text-[var(--color-muted)] leading-relaxed">{p.description}</p>
                    )}
                  </div>
                  <div className="bg-[var(--color-background)] rounded-lg p-3 max-h-[300px] overflow-y-auto relative group/prompt inspector-scroll-area">
                    <p className="text-[12px] text-[var(--foreground)] leading-relaxed whitespace-pre-wrap font-mono">
                      {p.content}
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-2">标签</h4>
                    <div className="relative" ref={inspectorTagDropdownRef}>
                      {(p.tags ? p.tags.split(",").map(t => t.trim()).filter(Boolean) : []).length === 0 ? (
                        /* 无标签时：展示全宽按钮 */
                        <button
                          type="button"
                          onClick={() => {
                            setIsInspectorTagDropdownOpen(prev => {
                              const next = !prev;
                              if (next) {
                                setTimeout(() => inspectorTagInputRef.current?.focus(), 50);
                              }
                              return next;
                            });
                          }}
                          className={`w-full py-1.5 px-3 rounded-md border text-[12px] flex items-center justify-center gap-1.5 transition-all ${
                            isInspectorTagDropdownOpen
                              ? 'bg-[var(--color-primary)]/5 border-[var(--color-primary)]/40 text-[var(--color-primary)] font-medium'
                              : 'bg-black/5 hover:bg-black/10 border-transparent text-[var(--color-muted)] hover:text-[var(--foreground)]'
                          }`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>添加标签</span>
                        </button>
                      ) : (
                        /* 拥有1个及以上标签时：展示标签胶囊并在末尾追加小按钮 */
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {(p.tags ? p.tags.split(",").map(t => t.trim()).filter(Boolean) : []).map(tag => (
                            <span key={tag} className="group/tag h-6 inline-flex items-center gap-1 text-[11.5px] px-2.5 rounded-md bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium border border-transparent box-border">
                              #{tag}
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleInspectorRemoveTag(p, tag); }}
                                className="opacity-0 group-hover/tag:opacity-100 hover:text-red-500 transition-all"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}

                          {/* 紧随最后一个标签的添加按钮：极简 + 号图标按钮，极致省空间避免换行 */}
                          <button
                            type="button"
                            onClick={() => {
                              setIsInspectorTagDropdownOpen(prev => {
                                const next = !prev;
                                if (next) {
                                  setTimeout(() => inspectorTagInputRef.current?.focus(), 50);
                                }
                                return next;
                              });
                            }}
                            className={`h-6 w-6 inline-flex items-center justify-center rounded-md border border-dashed box-border shrink-0 transition-all ${
                              isInspectorTagDropdownOpen 
                                ? 'border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary)]/10 font-medium' 
                                : 'border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5'
                            }`}
                            title="添加标签"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      
                      {/* 浮动的搜索与选择面板 */}
                      {isInspectorTagDropdownOpen && (
                        <div className="absolute top-full mt-1.5 left-0 right-0 w-full bg-white/95 backdrop-blur-xl border border-[var(--color-border)] rounded-xl shadow-2xl p-2 z-[100] animate-in fade-in zoom-in-95 duration-150">
                          <div className="relative mb-1.5">
                            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-[var(--color-muted)] pointer-events-none" />
                            <input
                              ref={inspectorTagInputRef}
                              type="text"
                              value={inspectorTagInput}
                              onChange={e => setInspectorTagInput(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Escape') {
                                  setIsInspectorTagDropdownOpen(false);
                                  return;
                                }
                                if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
                                  e.preventDefault();
                                  const newTag = inspectorTagInput.trim().replace(/[,，]/g, '');
                                  if (newTag) {
                                    handleInspectorAddTag(p, newTag);
                                    setInspectorTagInput("");
                                    setIsInspectorTagDropdownOpen(false);
                                  }
                                }
                              }}
                              placeholder="搜索或创建标签..."
                              className="w-full text-[12px] pl-8 pr-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-gray-50/80 focus:bg-white focus:outline-none focus:border-[var(--color-primary)]/50 focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all placeholder:text-[var(--color-muted)]/70"
                            />
                          </div>

                          <div className="max-h-44 overflow-y-auto custom-scrollbar flex flex-col gap-0.5">
                            {allTags.filter(t => !(p.tags ? p.tags.split(",").map(x => x.trim()).filter(Boolean) : []).includes(t) && t.toLowerCase().includes(inspectorTagInput.toLowerCase())).length > 0 ? (
                              allTags
                                .filter(t => !(p.tags ? p.tags.split(",").map(x => x.trim()).filter(Boolean) : []).includes(t) && t.toLowerCase().includes(inspectorTagInput.toLowerCase()))
                                .map(tag => (
                                  <button
                                    key={tag}
                                    type="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      handleInspectorAddTag(p, tag);
                                      setInspectorTagInput("");
                                      setIsInspectorTagDropdownOpen(false);
                                    }}
                                    className="w-full px-2.5 py-1.5 text-[12px] text-left rounded-md hover:bg-black/5 text-[var(--foreground)] transition-colors flex items-center justify-between group"
                                  >
                                    <span>#{tag}</span>
                                    <Plus className="w-3 h-3 text-[var(--color-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </button>
                                ))
                            ) : inspectorTagInput.trim() ? (
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  const newTag = inspectorTagInput.trim().replace(/[,，]/g, '');
                                  if (newTag) {
                                    handleInspectorAddTag(p, newTag);
                                    setInspectorTagInput("");
                                    setIsInspectorTagDropdownOpen(false);
                                  }
                                }}
                                className="w-full px-2.5 py-1.5 text-[12px] text-left rounded-md hover:bg-[var(--color-primary)]/10 text-[var(--color-primary)] transition-colors flex items-center gap-1.5 font-medium"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>按回车创建 "{inspectorTagInput.trim()}"</span>
                              </button>
                            ) : (
                              <div className="px-2 py-3 text-[11px] text-[var(--color-muted)] text-center">
                                输入文字搜索或按回车创建
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 text-[12px]">
                    {p.group_name && (
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--color-muted)]">分组</span>
                        <select 
                          value={p.group_id || ""} 
                          onChange={(e) => handleInspectorUpdateGroup(p, e.target.value || null)}
                          className="text-[12px] text-[var(--foreground)] font-medium bg-transparent border-none outline-none text-right appearance-none cursor-pointer hover:text-[var(--color-primary)] transition-colors pr-0"
                        >
                          <option value="">未分组</option>
                          {groups.map(g => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--color-muted)]">使用次数</span>
                      <span className="text-[var(--foreground)]">{p.use_count} 次</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--color-muted)]">更新</span>
                      <span className="text-[var(--foreground)]">{new Date(p.updated_at).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(/\//g, "-")}</span>
                    </div>
                  </div>
                </div>
                <div className="p-4 border-t border-[var(--color-border)]/60 shrink-0">
                  <div className="flex items-center space-x-2">
                    {filter !== "trash" && (
                      <button
                        onClick={() => { setExportingPrompts([p]); setIsExportDialogOpen(true); }}
                        className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 text-[var(--color-primary)] rounded-lg transition-colors text-[12px] font-medium"
                      >
                        <Download size={12} />
                        <span>导出</span>
                      </button>
                    )}
                    <button
                      onClick={handleDeleteSelected}
                      className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors text-[12px] font-medium"
                    >
                      <Trash2 size={12} />
                      <span>{filter === "trash" ? "彻底删除" : "删除"}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })(),
          document.getElementById('global-inspector-slot')!
        ) : null}


      <PromptExportDialog
        isOpen={isExportDialogOpen}
        prompts={exportingPrompts}
        onClose={() => setIsExportDialogOpen(false)}
      />
      <ContextMenu
        position={menuPosition}
        onClose={hideContextMenu}
        items={
          contextPrompt && selectedIds.size > 1 ? (
            filter === "trash" ? [
              { id: 'restore_multi', label: `恢复选中的 ${selectedIds.size} 项`, icon: <RotateCcw size={14} />, onClick: () => {
                  const ids = Array.from(selectedIds);
                  invoke("restore_prompts", { ids }).then(() => {
                    showToast(`已恢复 ${ids.length} 项`, "success");
                    setSelectedIds(new Set());
                    fetchData();
                  });
                  hideContextMenu();
                }
              },
              { separator: true, id: 'sep1', label: '' },
              { id: 'hard_delete_multi', label: `彻底删除选中的 ${selectedIds.size} 项`, danger: true, icon: <Trash2 size={14} className="text-red-500" />, onClick: async () => {
                  const ids = Array.from(selectedIds);
                  if (!(await waitConfirm(`确认彻底删除选中的 ${ids.length} 个提示词吗？此操作不可恢复！`, "彻底删除"))) { hideContextMenu(); return; }
                  invoke("hard_delete_prompts", { ids }).then(() => {
                    showToast(`已彻底删除 ${ids.length} 项`, "success");
                    setSelectedIds(new Set());
                    fetchData();
                  });
                  hideContextMenu();
                }
              }
            ] : [
              { id: 'export_multi', label: `导出选中的 ${selectedIds.size} 项`, icon: <Download size={14} />, onClick: () => { 
                  setExportingPrompts(prompts.filter(p => selectedIds.has(p.id))); 
                  setIsExportDialogOpen(true); 
                  hideContextMenu(); 
                } 
              },
              { separator: true, id: 'sep1', label: '' },
              { id: 'delete_multi', label: `删除选中的 ${selectedIds.size} 项`, danger: true, icon: <Trash2 size={14} className="text-red-500" />, onClick: () => {
                  const ids = Array.from(selectedIds);
                  invoke("delete_prompts", { ids }).then(() => {
                    showToast(`已移入回收站 ${ids.length} 项`, "success", {
                      label: "撤销",
                      onClick: async () => {
                        await invoke("restore_prompts", { ids });
                        showToast(`已撤销删除`, "success");
                        fetchData();
                      }
                    });
                    setSelectedIds(new Set());
                    fetchData();
                  });
                  hideContextMenu();
                }
              }
            ]
          ) : contextPrompt ? (
            filter === "trash" ? [
              { id: 'restore', label: '恢复', icon: <RotateCcw size={14} />, onClick: () => {
                  invoke("restore_prompts", { ids: [contextPrompt.id] }).then(() => {
                    showToast("已恢复", "success");
                    setSelectedIds(new Set());
                    fetchData();
                  });
                  hideContextMenu();
                }
              },
              { separator: true, id: 'sep1', label: '' },
              { id: 'hard_delete', label: '彻底删除', danger: true, icon: <Trash2 size={14} className="text-red-500" />, onClick: async () => {
                  if (!(await waitConfirm("确认彻底删除该提示词吗？此操作不可恢复！", "彻底删除"))) { hideContextMenu(); return; }
                  invoke("hard_delete_prompts", { ids: [contextPrompt.id] }).then(() => {
                    showToast("已彻底删除", "success");
                    setSelectedIds(new Set());
                    fetchData();
                  });
                  hideContextMenu();
                }
              }
            ] : [
              { id: 'open', label: '打开', icon: <ChevronRight size={14} />, onClick: () => { onOpenPromptDetail?.(contextPrompt.title || '无标题', contextPrompt.id, false); hideContextMenu(); } },
              ...(onOpenPromptDetail ? [{ id: 'open_new_tab', label: '在新标签页中打开', icon: <Plus size={14} />, onClick: () => { onOpenPromptDetail(contextPrompt.title || '无标题提示词', contextPrompt.id, false, true); hideContextMenu(); } }] : []),
              { id: 'edit', label: '编辑', icon: <Edit2 size={14} />, onClick: () => { onOpenPromptDetail?.(contextPrompt.title || '无标题', contextPrompt.id, true); hideContextMenu(); } },
              { id: 'copy', label: '复制内容', icon: <Copy size={14} />, onClick: async () => { 
                  await navigator.clipboard.writeText(contextPrompt.content); 
                  showToast("已复制", "success"); 
                  hideContextMenu(); 
                } 
              },
              { id: 'favorite', label: contextPrompt.is_favorite ? '取消收藏' : '收藏', icon: <Star size={14} className={contextPrompt.is_favorite ? "fill-amber-400 text-amber-500" : ""} />, onClick: async () => {
                  try {
                    const newVal = await invoke<boolean>("toggle_prompt_favorite", { id: contextPrompt.id });
                    handleFavoriteToggle(contextPrompt.id, newVal);
                  } catch (e) {}
                  hideContextMenu();
                }
              },
              { id: 'export', label: '导出', icon: <Download size={14} />, onClick: () => {
                  setExportingPrompts([contextPrompt]);
                  setIsExportDialogOpen(true);
                  hideContextMenu();
                }
              },
              { separator: true, id: 'sep1', label: '' },
              { id: 'delete', label: '删除', danger: true, icon: <Trash2 size={14} className="text-red-500" />, onClick: () => {
                  // 根据 Option B 的决策，移入回收站不再弹窗
                  invoke("delete_prompts", { ids: [contextPrompt.id] }).then(() => {
                    showToast("已移入回收站", "success", {
                      label: "撤销",
                      onClick: async () => {
                        await invoke("restore_prompts", { ids: [contextPrompt.id] });
                        showToast("已撤销删除", "success");
                        fetchData();
                      }
                    });
                    setSelectedIds(new Set());
                    fetchData();
                  });
                  hideContextMenu();
                }
              }
            ]
          ) : (
            filter === "trash" ? [
              { id: 'empty_trash', label: '清空回收站', danger: true, icon: <Trash2 size={14} className="text-red-500" />, onClick: async () => {
                  if (!(await waitConfirm("确认清空回收站吗？清空后所有提示词将永久丢失！", "清空回收站"))) { hideContextMenu(); return; }
                  invoke("empty_trash").then(() => {
                    showToast("回收站已清空", "success");
                    setSelectedIds(new Set());
                    setInspectorData(null);
                    fetchData();
                  });
                  hideContextMenu();
                }
              }
            ] : [
              { id: 'new', label: '新建提示词', icon: <Plus size={14} />, onClick: () => { onOpenPromptDetail?.('新建提示词', undefined, true); hideContextMenu(); } }
            ]
          )
        }
      />
      {confirmData && <ConfirmDialog {...(confirmData as any)} isOpen={true} />}
      
      {/* Quick Look Modal for Prompts */}
      <QuickLookModal
        isOpen={quickLookOpen}
        onClose={() => setQuickLookOpen(false)}
        previewType={quickLookOpen && selectedIds.size > 0 ? 'prompt' : null}
        prompt={quickLookOpen && selectedIds.size > 0 ? prompts.find(p => p.id === (lastSelectedId && selectedIds.has(lastSelectedId) ? lastSelectedId : Array.from(selectedIds).pop())) : undefined}
        onOpenDetail={() => {
            setQuickLookOpen(false);
            const promptId = lastSelectedId && selectedIds.has(lastSelectedId) ? lastSelectedId : Array.from(selectedIds).pop();
            const prompt = prompts.find(p => p.id === promptId);
            if (prompt && onOpenPromptDetail) {
                onOpenPromptDetail(prompt.title || '无标题提示词', prompt.id, false);
            }
        }}
        onNavigate={(direction) => {
            if (selectedIds.size === 0) return;
            const grid = document.querySelector('.prompt-grid');
            let columns = 3;
            if (grid) {
                const gridStyle = window.getComputedStyle(grid);
                columns = gridStyle.gridTemplateColumns.split(' ').length;
            }
            const currentId = lastSelectedId || Array.from(selectedIds)[0];
            const nextPrompt = getNextElement(
                currentId,
                direction,
                columns
            );
            if (nextPrompt) {
                setSelectedIds(new Set([nextPrompt.id]));
                setLastSelectedId(nextPrompt.id);
                setInspectorData(null);
                const el = document.querySelector(`[data-prompt-id="${nextPrompt.id}"]`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }}
      />
    </div>
  );
}
