import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Plus, Download, Star, LayoutGrid, Trash2, Trash, FolderPlus, MoreHorizontal, X, Languages, Loader2, Folder, Edit2, FolderX, Tag, PanelRightClose } from "lucide-react";
import { Prompt, PromptGroup, PromptVersion } from "./types";
import { PromptCard } from "./components/prompt/PromptCard";
import { SelectionArea, SelectionEvent } from "@viselect/react";
import { PromptEditorDrawer } from "./components/prompt/PromptEditorDrawer";
import { CreateGroupDialog } from "./components/prompt/CreateGroupDialog";
import { PromptExportDialog } from "./components/prompt/PromptExportDialog";
import { ConfirmDialog } from "./components/ui/ConfirmDialog";
import { showToast } from "./components/ui/Toast";
import { Tooltip } from "./components/ui/Tooltip";
import { ContextMenu, useContextMenu } from "./components/ui/ContextMenu";

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
  onGroupsChange: (groups: PromptGroup[]) => void;
  onFilterChange: (filter: PromptFilter) => void;
  onTitleChange: (title: string, icon: string) => void;
  onToggleInspector?: () => void;
}

interface PromptInspectorData {
  prompt: Prompt;
  versions: PromptVersion[];
}

export function PromptModule({ filter, refreshKey, onGroupsChange, onFilterChange, onTitleChange, onToggleInspector }: PromptModuleProps) {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [groups, setGroups] = useState<PromptGroup[]>([]);
  const [search] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [inspectorData, setInspectorData] = useState<PromptInspectorData | null>(null);

  // 弹窗状态
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  
  // Tag editor in inspector
  const [inspectorTagInput, setInspectorTagInput] = useState("");
  const inspectorTagInputRef = useRef<HTMLInputElement>(null);
  const inspectorTagDropdownRef = useRef<HTMLDivElement>(null);

  // Translator state
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [targetLang, setTargetLang] = useState("zh-CN");

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
    } catch (e) {
      showToast("更新标签失败", "error");
      fetchData(); // Revert
    }
  };

  const handleTranslate = async (p: Prompt) => {
    if (!p.content) return;
    setTranslatingId(p.id);
    try {
      const translated = await invoke<string>("translate_text", { text: p.content, targetLang });
      const newContent = p.content + "\n\n---\n" + translated;
      setPrompts(prev => prev.map(pr => pr.id === p.id ? { ...pr, content: newContent } : pr));
      await invoke("update_prompt", { 
        id: p.id, 
        title: p.title, 
        content: newContent,
        description: p.description || null, 
        groupId: p.group_id || null,
        tags: p.tags || null, 
        variables: p.variables || null,
        changeNote: "追加翻译" 
      });
      showToast("翻译已追加到内容底部", "success");
    } catch (e) {
      showToast("翻译失败", "error");
    } finally {
      setTranslatingId(null);
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (isInput) return;

      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (selectedIds.size > 0 && !isEditorOpen) {
          e.preventDefault();
          handleDeleteSelected();
        }
        return;
      }

      if (e.key === 'Enter') {
        if (selectedIds.size === 1 && !isEditorOpen) {
          e.preventDefault();
          const p = prompts.find(p => p.id === Array.from(selectedIds)[0]);
          if (p) {
            setEditingPrompt(p);
            setIsEditorOpen(true);
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
  }, [prompts, selectedIds, lastSelectedId, isEditorOpen]);
  const [exportingPrompts, setExportingPrompts] = useState<Prompt[]>([]);

  // 右键菜单
  const { menuPosition, showContextMenu, hideContextMenu } = useContextMenu();
  const [contextPrompt, setContextPrompt] = useState<Prompt | null>(null);

  // 确认弹窗
  const [confirmData, setConfirmData] = useState<{ title: string, message: string, onConfirm: () => void, onClose: () => void } | null>(null);
  const waitConfirm = (message: string, title: string = "确认操作") => new Promise<boolean>(resolve => {
    setConfirmData({
      title,
      message,
      onConfirm: () => { setConfirmData(null); resolve(true); },
      onClose: () => { setConfirmData(null); resolve(false); }
    });
  });

  const fetchData = useCallback(async () => {
    try {
      const backendGroupId = filter === "all" || filter === "favorites" ? null 
        : filter.startsWith("group:") ? filter.split(":")[1] 
        : filter;
      
      const [ps, gs] = await Promise.all([
        invoke<Prompt[]>("get_prompts", { groupId: backendGroupId, search: search || null }),
        invoke<PromptGroup[]>("get_prompt_groups"),
      ]);
      // 收藏筛选在前端做
      const filtered = filter === "favorites" ? ps.filter(p => p.is_favorite) : ps;
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
  };

  const filterLabel = filter === "all" ? "全部提示词"
    : filter === "favorites" ? "收藏"
    : filter === "ungrouped" ? "未分组"
    : filter === "untagged" ? "未标签"
    : filter === "trash" ? "回收站"
    : filter.startsWith("group:") ? groups.find(g => g.id === filter.split(":")[1])?.name || "未知分组"
    : "提示词";

  const getFilterIconStr = () => {
    if (filter === "all") return 'LayoutGrid';
    if (filter === "favorites") return 'Star';
    if (filter === "ungrouped") return 'FolderMinus';
    if (filter === "untagged") return 'Tag';
    if (filter === "trash") return 'Trash2';
    if (filter.startsWith("group:")) return 'Folder';
    return 'MessageSquareText';
  };

  useEffect(() => {
    if (onTitleChange) {
      onTitleChange(filterLabel, getFilterIconStr());
    }
  }, [filterLabel, filter, groups, onTitleChange]);

  const selectedPrompts = prompts.filter(p => selectedIds.has(p.id));

  const handleSelectionStart = ({ event, selection }: SelectionEvent) => {
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
        {/* 顶栏 */}
        <div 
          data-tauri-drag-region 
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) getCurrentWindow().startDragging();
          }}
          className="py-3 px-6 bg-white flex items-center justify-between shrink-0 relative z-0"
        >
          <div className="flex items-center gap-3">
            <h1 className="text-[15px] font-medium text-[var(--foreground)]">{filterLabel}</h1>
            <span className="bg-black/5 text-[var(--color-muted)] text-[11px] px-2 py-0.5 rounded-full font-medium ml-2">{prompts.length}</span>
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
                onClick={() => { setEditingPrompt(null); setIsEditorOpen(true); }}
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
            className="flex-1 overflow-y-auto"
            onPointerDown={(e) => {
              if (e.button !== 0) return; // Only left click
              if (!(e.target as Element).closest('[data-prompt-id]')) {
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
                  onClick={() => { setEditingPrompt(null); setIsEditorOpen(true); }}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-500 text-white text-[14px] font-medium rounded-xl hover:bg-blue-600 transition-colors shadow-sm shadow-blue-500/20"
                >
                  <Plus className="w-4 h-4" />
                  添加提示词
                </button>
              </div>
            ) : (
              <SelectionArea
            className="min-h-full"
            onStart={handleSelectionStart}
            onMove={handleSelectionMove}
            selectables=".prompt-card"
            features={{ touch: false, range: true, singleTap: { allow: false } }}
          >
            <div 
              className="prompt-grid px-6 pt-3 pb-20 grid grid-cols-2 xl:grid-cols-3 gap-4 min-h-full items-stretch content-start"
                onPointerDown={(e) => {
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
                        setEditingPrompt(p); 
                        setIsEditorOpen(true); 
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
            if (selectedIds.size === 0) {
              return (
                <div className="bg-transparent border-l border-[var(--color-border)] flex flex-col shrink-0 h-full overflow-hidden w-64">
                  <div className="px-4 py-3 flex items-center justify-between shrink-0">
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
                  <div className="flex-1 flex items-center justify-center p-4">
                    <p className="text-[12px] text-[var(--color-muted)] text-center">选择一个提示词查看详情</p>
                  </div>
                </div>
              );
            }
            
            if (selectedIds.size > 1) {
              return (
                <div className="bg-transparent border-l border-[var(--color-border)] flex flex-col shrink-0 h-full overflow-hidden w-64">
                  <div className="px-4 py-3 flex items-center justify-between shrink-0">
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

            const p = selectedPrompts[0];
            if (!p) return null;

            return (
              <div className="bg-transparent border-l border-[var(--color-border)] flex flex-col shrink-0 h-full overflow-hidden w-64">
                <div className="px-4 py-3 flex items-center justify-between shrink-0">
                  <span className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wide"></span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setEditingPrompt(p); setIsEditorOpen(true); }}
                      className="px-1.5 py-1 text-[12px] text-[var(--color-primary)] font-medium hover:text-[var(--color-primary)]/80 transition-colors"
                    >编辑</button>
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
                <div className="flex-1 overflow-y-auto px-6 pt-3 pb-20 space-y-4">
                  <div>
                    <h3 className="text-[14px] font-semibold text-[var(--foreground)] mb-1">{p.title}</h3>
                    {p.description && (
                      <p className="text-[12px] text-[var(--color-muted)] leading-relaxed">{p.description}</p>
                    )}
                  </div>
                  <div className="bg-[var(--color-background)] rounded-lg p-3 max-h-[300px] overflow-y-auto relative group/prompt">
                    <p className="text-[12px] text-[var(--foreground)] leading-relaxed whitespace-pre-wrap font-mono">
                      {p.content}
                    </p>
                    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover/prompt:opacity-100 transition-opacity">
                      <select 
                        value={targetLang}
                        onChange={e => setTargetLang(e.target.value)}
                        className="h-[26px] text-[11px] bg-white border border-[var(--color-border)] rounded-md px-1.5 focus:outline-none focus:border-[var(--color-primary)]/50 shadow-sm"
                        onClick={e => e.stopPropagation()}
                      >
                        <option value="zh-CN">中文</option>
                        <option value="en">English</option>
                        <option value="ja">日本語</option>
                        <option value="ko">한국어</option>
                      </select>
                      <button 
                        onClick={() => handleTranslate(p)}
                        disabled={translatingId === p.id}
                        title="翻译此提示词并追加到底部"
                        className="p-1.5 bg-white border border-[var(--color-border)] rounded-md shadow-sm hover:text-[var(--color-primary)] disabled:opacity-100 disabled:text-[var(--color-muted)]"
                      >
                        {translatingId === p.id ? <Loader2 size={14} className="animate-spin" /> : <Languages size={14} />}
                      </button>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-2">标签</h4>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {(p.tags ? p.tags.split(",").map(t => t.trim()).filter(Boolean) : []).map(tag => (
                        <span key={tag} className="group/tag inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium">
                          #{tag}
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleInspectorRemoveTag(p, tag); }}
                            className="opacity-0 group-hover/tag:opacity-100 hover:text-red-500 transition-all"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      
                      <div className="relative" ref={inspectorTagDropdownRef}>
                        <input
                          ref={inspectorTagInputRef}
                          type="text"
                          value={inspectorTagInput}
                          onChange={e => setInspectorTagInput(e.target.value)}
                          onKeyDown={e => {
                            const tagList = p.tags ? p.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
                            if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
                              e.preventDefault();
                              const newTag = inspectorTagInput.trim().replace(/[,，]/g, '');
                              if (newTag) {
                                handleInspectorAddTag(p, newTag);
                                setInspectorTagInput("");
                              }
                            } else if (e.key === 'Backspace' && !inspectorTagInput && tagList.length > 0) {
                              handleInspectorRemoveTag(p, tagList[tagList.length - 1]);
                            }
                          }}
                          onBlur={() => {
                            setTimeout(() => {
                              const newTag = inspectorTagInput.trim().replace(/[,，]/g, '');
                              if (newTag) {
                                handleInspectorAddTag(p, newTag);
                                setInspectorTagInput("");
                              }
                            }, 150);
                          }}
                          placeholder="加标签..."
                          className="text-[11px] w-20 px-2 py-1 rounded-md border border-transparent bg-black/5 focus:outline-none focus:border-[var(--color-primary)]/50 focus:bg-white transition-colors placeholder:text-[var(--color-muted)]"
                        />
                        
                        {/* Tags Dropdown */}
                        {(inspectorTagInput || document.activeElement === inspectorTagInputRef.current) && (
                          <div className="absolute bottom-full left-0 mb-1 w-[180px] max-h-[160px] overflow-y-auto bg-white border border-[var(--color-border)] rounded-lg shadow-lg z-20">
                            {allTags.filter(t => !(p.tags ? p.tags.split(",").map(x => x.trim()).filter(Boolean) : []).includes(t) && t.toLowerCase().includes(inspectorTagInput.toLowerCase())).length > 0 ? (
                              allTags
                                .filter(t => !(p.tags ? p.tags.split(",").map(x => x.trim()).filter(Boolean) : []).includes(t) && t.toLowerCase().includes(inspectorTagInput.toLowerCase()))
                                .map(tag => (
                                  <button
                                    key={tag}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      handleInspectorAddTag(p, tag);
                                      setInspectorTagInput("");
                                    }}
                                    className="w-full px-3 py-2 text-[12px] text-left hover:bg-black/5 text-[var(--foreground)]"
                                  >
                                    {tag}
                                  </button>
                                ))
                            ) : inspectorTagInput ? (
                              <div className="px-3 py-2 text-[12px] text-[var(--color-muted)]">
                                按回车创建 "{inspectorTagInput}"
                              </div>
                            ) : (
                              <div className="px-3 py-2 text-[12px] text-[var(--color-muted)]">
                                暂无其他标签
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 text-[12px]">
                    {p.group_name && (
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--color-muted)]">分组</span>
                        <span className="text-[var(--foreground)] font-medium">{p.group_name}</span>
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

      {/* 弹窗 */}
      <PromptEditorDrawer
        isOpen={isEditorOpen}
        prompt={editingPrompt}
        groups={groups}
        allTags={allTags}
        onClose={() => setIsEditorOpen(false)}
        onSave={() => {
          // 新建时自动切到全部视图，让用户看见刚创建的提示词
          if (!editingPrompt && filter !== "all") {
            onFilterChange("all");
          } else {
            fetchData();
          }
        }}
      />
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
              { id: 'restore_multi', label: `恢复选中的 ${selectedIds.size} 项`, onClick: () => {
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
              { id: 'hard_delete_multi', label: `彻底删除选中的 ${selectedIds.size} 项`, danger: true, onClick: async () => {
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
              { id: 'export_multi', label: `导出选中的 ${selectedIds.size} 项`, onClick: () => { 
                  setExportingPrompts(prompts.filter(p => selectedIds.has(p.id))); 
                  setIsExportDialogOpen(true); 
                  hideContextMenu(); 
                } 
              },
              { separator: true, id: 'sep1', label: '' },
              { id: 'delete_multi', label: `删除选中的 ${selectedIds.size} 项`, danger: true, onClick: () => {
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
              { id: 'restore', label: '恢复', onClick: () => {
                  invoke("restore_prompts", { ids: [contextPrompt.id] }).then(() => {
                    showToast("已恢复", "success");
                    setSelectedIds(new Set());
                    fetchData();
                  });
                  hideContextMenu();
                }
              },
              { separator: true, id: 'sep1', label: '' },
              { id: 'hard_delete', label: '彻底删除', danger: true, onClick: async () => {
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
              { id: 'edit', label: '编辑', onClick: () => { setEditingPrompt(contextPrompt); setIsEditorOpen(true); hideContextMenu(); } },
              { id: 'copy', label: '复制内容', onClick: async () => { 
                  await navigator.clipboard.writeText(contextPrompt.content); 
                  showToast("已复制", "success"); 
                  hideContextMenu(); 
                } 
              },
              { id: 'favorite', label: contextPrompt.is_favorite ? '取消收藏' : '收藏', onClick: async () => {
                  try {
                    const newVal = await invoke<boolean>("toggle_prompt_favorite", { id: contextPrompt.id });
                    handleFavoriteToggle(contextPrompt.id, newVal);
                  } catch (e) {}
                  hideContextMenu();
                }
              },
              { separator: true, id: 'sep1', label: '' },
              { id: 'delete', label: '删除', danger: true, onClick: () => {
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
              { id: 'empty_trash', label: '清空回收站', danger: true, onClick: async () => {
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
              { id: 'new', label: '新建提示词', onClick: () => { setEditingPrompt(null); setIsEditorOpen(true); hideContextMenu(); } }
            ]
          )
        }
      />
      {confirmData && <ConfirmDialog {...(confirmData as any)} isOpen={true} />}
    </div>
  );
}
