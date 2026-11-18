import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Download, Star, LayoutGrid, Trash2, Trash, FolderPlus, MoreHorizontal, X, Folder, Edit2, FolderX, Tag, PanelRightClose, ChevronRight, ChevronDown, Loader2, Copy, RotateCcw, MessageSquareQuote, Globe, SlidersHorizontal, Check, Minus } from "lucide-react";
import { Prompt, PromptGroup, PromptVersion } from "./types";
import { PromptCard } from "./components/prompt/PromptCard";
import { SelectionArea, SelectionEvent } from "@viselect/react";
import { findStoreResourceForPrompt } from "./utils/resourceMatch";
import registryData from "./data/resource-registry.json";

import { CreateGroupDialog } from "./components/prompt/CreateGroupDialog";
import { PromptExportDialog } from "./components/prompt/PromptExportDialog";
import { ConfirmDialog } from "./components/ui/ConfirmDialog";
import { showToast } from "./components/ui/Toast";
import { Tooltip } from "./components/ui/Tooltip";
import { ContextMenu, useContextMenu, type ContextMenuItem } from "./components/ui/ContextMenu";
import { QuickLookModal } from "./components/ui/QuickLookModal";
import { TagSelectorPopover } from "./components/ui/TagSelectorPopover";
import { TagManagerModal } from "./components/ui/TagManagerModal";
import {
  computeTagStats,
  parseTags,
  serializeTags,
  toggleStarTag,
  recordRecentTag,
  removeTagFromMeta,
  renameTagInMeta,
  type TagStatItem,
} from "./utils/tagStore";

// 全库提示词标签批量重命名 / 合并工具（供侧边栏与主模块共用）
async function renamePromptTagInDb(oldName: string, newName: string): Promise<void> {
  const cleanOld = oldName.trim();
  const cleanNew = newName.trim().replace(/[,，]/g, '');
  if (!cleanOld || !cleanNew || cleanOld === cleanNew) return;

  const all = await invoke<Prompt[]>("get_prompts", { groupId: null, search: null });
  const affected = all.filter(p => parseTags(p.tags).includes(cleanOld));

  await Promise.all(
    affected.map(p => {
      const nextTags = serializeTags(parseTags(p.tags).map(t => (t === cleanOld ? cleanNew : t)));
      return invoke("update_prompt", {
        id: p.id,
        title: p.title,
        content: p.content,
        description: p.description || null,
        groupId: p.group_id || null,
        tags: nextTags || null,
        variables: p.variables || null,
        changeNote: `重命名标签 ${cleanOld} -> ${cleanNew}`,
      });
    })
  );

  renameTagInMeta('prompts', cleanOld, cleanNew);
  window.dispatchEvent(new CustomEvent('skillhub:prompt-tags-changed'));
}

// 全库提示词标签批量删除工具（供侧边栏与主模块共用）
async function deletePromptTagsInDb(tagNames: string[]): Promise<void> {
  if (tagNames.length === 0) return;
  const targetSet = new Set(tagNames);
  const all = await invoke<Prompt[]>("get_prompts", { groupId: null, search: null });
  const affected = all.filter(p => parseTags(p.tags).some(t => targetSet.has(t)));

  await Promise.all(
    affected.map(p => {
      const nextTags = serializeTags(parseTags(p.tags).filter(t => !targetSet.has(t)));
      return invoke("update_prompt", {
        id: p.id,
        title: p.title,
        content: p.content,
        description: p.description || null,
        groupId: p.group_id || null,
        tags: nextTags || null,
        variables: p.variables || null,
        changeNote: '删除标签',
      });
    })
  );

  tagNames.forEach(n => removeTagFromMeta('prompts', n));
  window.dispatchEvent(new CustomEvent('skillhub:prompt-tags-changed'));
}

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
  const { menuPosition, menuTarget, showContextMenu, hideContextMenu } = useContextMenu();
  const [editGroup, setEditGroup] = useState<PromptGroup | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<PromptGroup | null>(null);

  const [allPromptsForTags, setAllPromptsForTags] = useState<Prompt[]>([]);
  const [tagMetaVersion, setTagMetaVersion] = useState(0);
  const [isTagsExpanded, setIsTagsExpanded] = useState(false);
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [tagManagerEditTarget, setTagManagerEditTarget] = useState<string | null>(null);
  const [deleteTagTarget, setDeleteTagTarget] = useState<TagStatItem | null>(null);
  const [localGroups, setLocalGroups] = useState<PromptGroup[]>(groups);

  useEffect(() => {
    setLocalGroups(groups);
  }, [groups]);

  const fetchGroups = useCallback(async () => {
    try {
      const gs = await invoke<PromptGroup[]>("get_prompt_groups");
      setLocalGroups(gs);
    } catch (e) {
      console.error("加载提示词分组失败", e);
    }
  }, []);

  const fetchTags = useCallback(async () => {
    try {
      const all = await invoke<Prompt[]>("get_prompts", { groupId: null, search: null });
      setAllPromptsForTags(all);
    } catch (e) {
      console.error("加载提示词标签失败", e);
    }
  }, []);

  useEffect(() => {
    fetchTags();
    fetchGroups();
  }, [fetchTags, fetchGroups, filter]);

  useEffect(() => {
    const handleTags = () => fetchTags();
    const handleGroups = () => {
      fetchGroups();
      fetchTags();
    };
    const handleMeta = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.module === 'prompts') {
        setTagMetaVersion(v => v + 1);
      }
    };
    window.addEventListener('skillhub:prompt-tags-changed', handleTags);
    window.addEventListener('skillhub:prompt-groups-changed', handleGroups);
    window.addEventListener('skillhub:tag-meta-changed', handleMeta);
    return () => {
      window.removeEventListener('skillhub:prompt-tags-changed', handleTags);
      window.removeEventListener('skillhub:prompt-groups-changed', handleGroups);
      window.removeEventListener('skillhub:tag-meta-changed', handleMeta);
    };
  }, [fetchTags, fetchGroups]);

  // 侧边栏展示的提示词标签：常用星标置顶，右侧附带计数
  const tagList = useMemo(() => {
    const stats = computeTagStats('prompts', allPromptsForTags);
    const starred = stats.filter(s => s.isStarred);
    const others = stats.filter(s => !s.isStarred);
    return [...starred, ...others];
  }, [allPromptsForTags, tagMetaVersion]);

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

  const buildSidebarContextMenuItems = (): ContextMenuItem[] => {
    if (menuTarget?.type === 'tag') {
      const tagStat = menuTarget.data as TagStatItem;
      return [
        {
          id: 'toggle-star-prompt-tag',
          label: tagStat.isStarred ? '取消常用' : '设为常用',
          icon: <Star className={`w-3.5 h-3.5 ${tagStat.isStarred ? 'fill-amber-400 text-amber-400' : ''}`} />,
          onClick: () => {
            toggleStarTag('prompts', tagStat.name);
            showToast(tagStat.isStarred ? `已取消常用 #${tagStat.name}` : `已设为常用标签 #${tagStat.name}`);
            hideContextMenu();
          },
        },
        {
          id: 'rename-prompt-tag',
          label: '重命名标签...',
          icon: <Edit2 className="w-3.5 h-3.5" />,
          onClick: () => {
            setTagManagerEditTarget(tagStat.name);
            setIsTagManagerOpen(true);
            hideContextMenu();
          },
        },
        {
          id: 'open-prompt-tag-manager',
          label: '打开标签管理面板',
          icon: <SlidersHorizontal className="w-3.5 h-3.5" />,
          onClick: () => {
            setTagManagerEditTarget(null);
            setIsTagManagerOpen(true);
            hideContextMenu();
          },
        },
        { id: 'sep-prompt-tag', label: '', separator: true },
        {
          id: 'delete-prompt-tag',
          label: '删除标签',
          icon: <Trash2 className="w-3.5 h-3.5" />,
          danger: true,
          onClick: async () => {
            hideContextMenu();
            if (tagStat.count === 0) {
              removeTagFromMeta('prompts', tagStat.name);
              showToast(`已移除标签 #${tagStat.name}`, "success");
            } else {
              setDeleteTagTarget(tagStat);
            }
          },
        },
      ];
    }

    const group = menuTarget?.type === 'group' ? (menuTarget.data as PromptGroup) : null;
    return [
      {
        id: 'edit-group',
        label: '编辑分组',
        icon: <Edit2 className="w-3.5 h-3.5" />,
        onClick: () => {
          if (group) setEditGroup(group);
          hideContextMenu();
        },
      },
      { id: 'delete-group-separator', label: '', separator: true },
      {
        id: 'delete-group',
        label: '删除分组',
        icon: <Trash2 className="w-3.5 h-3.5" />,
        danger: true,
        onClick: () => {
          if (group) setDeleteGroup(group);
          hideContextMenu();
        },
      },
    ];
  };

  return (
    <>
      {/* 快捷筛选 */}
      <div className="px-3 mt-1 mb-5">
        <h3 className="text-[11px] font-semibold text-[var(--color-muted)]/60 mb-1 px-2 uppercase tracking-wide">快捷筛选</h3>
        <div className="space-y-0.5">
          {[
            { id: "all", label: "全部提示词", icon: LayoutGrid },
            { id: "favorites", label: "星标", icon: Star },
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

      {/* 标签栏（与技能左侧栏完全对齐） */}
      <div className="px-3 mb-5">
        <div className="flex items-center justify-between mb-1 px-2">
          <h3 className="text-[11px] font-semibold text-[var(--color-muted)]/60 uppercase tracking-wide">
            标签
          </h3>
          <Tooltip content="管理标签">
            <button
              type="button"
              onClick={() => {
                setTagManagerEditTarget(null);
                setIsTagManagerOpen(true);
              }}
              className="p-0.5 rounded text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        </div>
        <div className="space-y-0.5">
          {(isTagsExpanded ? tagList : tagList.slice(0, 10)).map(tagStat => (
            <button
              key={tagStat.name}
              onClick={(e) => onFilterChange(`tag:${tagStat.name}` as PromptFilter, e)}
              onAuxClick={(e) => { if (e.button === 1) onFilterChange(`tag:${tagStat.name}` as PromptFilter, e); }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                showContextMenu(e, { type: 'tag', data: tagStat });
              }}
              className={`w-full flex items-center justify-between px-2 py-1 rounded-md transition-colors outline-none select-none text-[13px] ${
                filter === `tag:${tagStat.name}`
                  ? "bg-black/5 text-[var(--foreground)] font-semibold"
                  : "text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] font-medium"
              }`}
            >
              <span className="flex items-center gap-1.5 truncate min-w-0">
                {tagStat.isStarred ? (
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
                ) : (
                  <Tag className="w-3.5 h-3.5 opacity-70 shrink-0" />
                )}
                <span className="truncate">{tagStat.name}</span>
              </span>
              <span className="text-[11px] text-[var(--color-muted)] shrink-0 ml-1">{tagStat.count}</span>
            </button>
          ))}
          {tagList.length > 10 && (
            <button
              type="button"
              onClick={() => setIsTagsExpanded(prev => !prev)}
              className="w-full flex items-center gap-1 px-2 py-1 text-[11.5px] text-[var(--color-muted)] hover:text-[var(--foreground)] rounded-md hover:bg-black/5 transition-colors"
            >
              {isTagsExpanded ? (
                <>
                  <ChevronDown className="w-3 h-3" />
                  <span>收起标签</span>
                </>
              ) : (
                <>
                  <ChevronRight className="w-3 h-3" />
                  <span>显示全部 ({tagList.length})</span>
                </>
              )}
            </button>
          )}
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
          {localGroups.map(group => (
            <button
              key={group.id}
              onClick={(e) => onFilterChange(`group:${group.id}` as PromptFilter, e)}
              onAuxClick={(e) => { if (e.button === 1) onFilterChange(`group:${group.id}` as PromptFilter, e); }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                showContextMenu(e, { type: 'group', data: group });
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
          {localGroups.length === 0 && (
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
        items={buildSidebarContextMenuItems()}
      />

      <ConfirmDialog
        isOpen={!!deleteGroup}
        title="确认删除分组？"
        message={deleteGroup ? `您正在删除分组“${deleteGroup.name}”。\n删除分组不会删除提示词本身，它们将被移回“全部提示词”状态。` : ""}
        onConfirm={handleDeleteGroup}
        onCancel={() => setDeleteGroup(null)}
      />

      <ConfirmDialog
        isOpen={!!deleteTagTarget}
        title={deleteTagTarget ? `删除标签“${deleteTagTarget.name}”？` : "确认删除标签？"}
        message={deleteTagTarget ? `将从 ${deleteTagTarget.count} 个提示词中移除该标签，不会删除提示词本身。` : ""}
        onConfirm={async () => {
          if (!deleteTagTarget) return;
          const name = deleteTagTarget.name;
          setDeleteTagTarget(null);
          await deletePromptTagsInDb([name]);
          if (filter === `tag:${name}`) {
            onFilterChange('all');
          }
          showToast(`已删除标签 #${name}`, "success");
        }}
        onCancel={() => setDeleteTagTarget(null)}
      />

      <TagManagerModal
        isOpen={isTagManagerOpen}
        module="prompts"
        allItems={allPromptsForTags}
        initialEditTag={tagManagerEditTarget}
        onClose={() => {
          setIsTagManagerOpen(false);
          setTagManagerEditTarget(null);
        }}
        onSelectTagFilter={(tagName) => onFilterChange(`tag:${tagName}`)}
        onRenameTag={async (oldName, newName) => {
          await renamePromptTagInDb(oldName, newName);
          if (filter === `tag:${oldName}`) {
            onFilterChange(`tag:${newName}`);
          }
        }}
        onDeleteTags={async (tagNames) => {
          await deletePromptTagsInDb(tagNames);
          if (filter.startsWith('tag:') && tagNames.includes(filter.slice(4))) {
            onFilterChange('all');
          }
        }}
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
  onOpenInspector?: () => void;
  onOpenPromptDetail?: (title: string, promptId?: string, isEditing?: boolean, newTab?: boolean) => void;
  onViewInStore?: (resourceId: string) => void;
}

interface PromptInspectorData {
  prompt: Prompt;
  versions: PromptVersion[];
}

export function PromptModule({ filter, refreshKey, activePromptId, onGroupsChange, onFilterChange, onTitleChange, onToggleInspector, onOpenInspector, onOpenPromptDetail, onViewInStore }: PromptModuleProps) {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [allPromptsPool, setAllPromptsPool] = useState<Prompt[]>([]);
  const [groups, setGroups] = useState<PromptGroup[]>([]);
  const [search] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [, setInspectorData] = useState<PromptInspectorData | null>(null);
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

  // 监听全局重置筛选事件，清空卡片选中状态
  useEffect(() => {
    const handleReset = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.module === 'prompts') {
        setSelectedIds(new Set());
        setLastSelectedId(null);
      }
    };
    window.addEventListener('skillhub:reset-filters', handleReset);
    return () => window.removeEventListener('skillhub:reset-filters', handleReset);
  }, []);

  // Eagle 风格标签选择器与专属管理弹窗状态
  const [isPromptTagPopoverOpen, setIsPromptTagPopoverOpen] = useState(false);
  const [isPromptTagManagerOpen, setIsPromptTagManagerOpen] = useState(false);
  const [promptTagMetaVersion, setPromptTagMetaVersion] = useState(0);
  const tagAnchorRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.module === 'prompts') {
        setPromptTagMetaVersion(v => v + 1);
      }
    };
    window.addEventListener('skillhub:tag-meta-changed', handler);
    return () => window.removeEventListener('skillhub:tag-meta-changed', handler);
  }, []);

  // 切换选中提示词或过滤条件时收起悬浮选择器
  useEffect(() => {
    setIsPromptTagPopoverOpen(false);
  }, [selectedIds, filter, activePromptId]);

  const promptTagStats = useMemo(() => {
    const stats = computeTagStats('prompts', allPromptsPool.length > 0 ? allPromptsPool : prompts);
    const starred = stats.filter(s => s.isStarred);
    const others = stats.filter(s => !s.isStarred);
    return [...starred, ...others];
  }, [allPromptsPool, prompts, promptTagMetaVersion]);

  const handleBatchTogglePromptTags = async (targetPrompts: Prompt[], newTag: string, shouldAdd: boolean) => {
    const clean = newTag.trim().replace(/[,，]/g, '');
    if (!clean || targetPrompts.length === 0) return;

    const updates: { prompt: Prompt; nextTags: string }[] = [];
    const patchMap = new Map<string, string>();

    for (const p of targetPrompts) {
      const currentList = parseTags(p.tags);
      const exists = currentList.includes(clean);
      if (shouldAdd && exists) continue;
      if (!shouldAdd && !exists) continue;
      const nextList = shouldAdd ? [...currentList, clean] : currentList.filter(t => t !== clean);
      const nextTags = serializeTags(nextList);
      updates.push({ prompt: p, nextTags });
      patchMap.set(p.id, nextTags);
    }

    if (updates.length === 0) return;

    // 乐观更新当前列表、全局池和详情缓存
    setPrompts(prev => prev.map(p => (patchMap.has(p.id) ? { ...p, tags: patchMap.get(p.id) } : p)));
    setAllPromptsPool(prev => prev.map(p => (patchMap.has(p.id) ? { ...p, tags: patchMap.get(p.id) } : p)));
    setDetailPromptCache(prev => (prev && patchMap.has(prev.id) ? { ...prev, tags: patchMap.get(prev.id) } : prev));

    if (shouldAdd) {
      recordRecentTag('prompts', clean);
    }

    try {
      await Promise.all(
        updates.map(({ prompt, nextTags }) =>
          invoke("update_prompt", {
            id: prompt.id,
            title: prompt.title,
            content: prompt.content,
            description: prompt.description || null,
            groupId: prompt.group_id || null,
            tags: nextTags || null,
            variables: prompt.variables || null,
            changeNote: shouldAdd ? "添加标签" : "移除标签",
          })
        )
      );
      if (updates.length > 1) {
        showToast(`已为 ${updates.length} 个提示词${shouldAdd ? '添加' : '移除'}标签 #${clean}`, 'success');
      }
      window.dispatchEvent(new CustomEvent('skillhub:prompt-tags-changed'));
    } catch (e) {
      showToast("更新标签失败", "error");
      fetchData();
    }
  };

  // 共用右键子菜单：快速勾选常用标签 + 打开悬浮打标面板 + 管理全部标签
  const buildPromptTagSubmenu = (targetPrompts: Prompt[]): ContextMenuItem => {
    const quickTags = promptTagStats.slice(0, 10);
    return {
      id: 'set_prompt_tags',
      label: targetPrompts.length > 1 ? `设置标签 (${targetPrompts.length} 项)` : '设置标签',
      icon: <Tag size={14} />,
      children: [
        {
          id: 'open_prompt_tag_popover',
          label: '打开标签面板...',
          icon: <Tag size={14} />,
          onClick: () => {
            onOpenInspector?.();
            setTimeout(() => setIsPromptTagPopoverOpen(true), 60);
            hideContextMenu();
          },
        },
        ...(quickTags.length > 0 ? [{ id: 'prompt_tag_sep', label: '', separator: true }] : []),
        ...quickTags.map(t => {
          const ownedCount = targetPrompts.filter(p => parseTags(p.tags).includes(t.name)).length;
          const allHave = targetPrompts.length > 0 && ownedCount === targetPrompts.length;
          const someHave = ownedCount > 0 && ownedCount < targetPrompts.length;
          return {
            id: `quick_prompt_tag_${t.name}`,
            label: `#${t.name}`,
            icon: allHave
              ? <Check size={14} className="text-[var(--color-primary)]" />
              : someHave
                ? <Minus size={14} className="text-amber-500" />
                : t.isStarred
                  ? <Star size={14} className="fill-amber-400 text-amber-400" />
                  : undefined,
            onClick: () => {
              handleBatchTogglePromptTags(targetPrompts, t.name, !allHave);
              hideContextMenu();
            },
          };
        }),
        { id: 'prompt_tag_manage_sep', label: '', separator: true },
        {
          id: 'manage_all_prompt_tags',
          label: '管理全部标签...',
          icon: <SlidersHorizontal size={14} />,
          onClick: () => {
            setIsPromptTagManagerOpen(true);
            hideContextMenu();
          },
        },
      ],
    };
  };

  // 通用右侧检查器标签区（单选与多选共用）
  const renderPromptTagSection = (targetPrompts: Prompt[], title: string = '标签') => {
    const total = targetPrompts.length;
    const tagCountMap = new Map<string, number>();
    for (const p of targetPrompts) {
      for (const t of parseTags(p.tags)) {
        tagCountMap.set(t, (tagCountMap.get(t) || 0) + 1);
      }
    }

    const fullTags: string[] = [];
    const partialTags: { name: string; count: number }[] = [];
    for (const [name, count] of tagCountMap.entries()) {
      if (count >= total) {
        fullTags.push(name);
      } else {
        partialTags.push({ name, count });
      }
    }
    fullTags.sort((a, b) => a.localeCompare(b, 'zh-CN'));
    partialTags.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'));
    const hasAnyTags = fullTags.length > 0 || partialTags.length > 0;

    return (
      <div className="mb-4 w-full">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <h4 className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wide">{title}</h4>
            {total > 1 && (
              <span className="text-[10px] text-[var(--color-muted)]/80">({total} 项)</span>
            )}
          </div>
          <Tooltip content="管理标签" side="left">
            <button
              type="button"
              onClick={() => setIsPromptTagManagerOpen(true)}
              className="p-0.5 rounded text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors"
            >
              <SlidersHorizontal className="w-3 h-3" />
            </button>
          </Tooltip>
        </div>

        {!hasAnyTags ? (
          <button
            ref={tagAnchorRef}
            type="button"
            onClick={() => setIsPromptTagPopoverOpen(prev => !prev)}
            className={`w-full py-1.5 px-3 rounded-md border text-[12px] flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              isPromptTagPopoverOpen
                ? 'bg-[var(--color-primary)]/5 border-[var(--color-primary)]/40 text-[var(--color-primary)] font-medium'
                : 'bg-black/5 hover:bg-black/10 border-transparent text-[var(--color-muted)] hover:text-[var(--foreground)]'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>添加标签</span>
          </button>
        ) : (
          <div className="flex flex-wrap gap-1.5 items-center">
            {fullTags.map(tag => (
              <span
                key={tag}
                className="group/tag h-6 inline-flex items-center text-[11.5px] px-2 rounded-md bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium border border-transparent box-border transition-all duration-150"
              >
                <span className="opacity-60 mr-0.5 select-none">#</span>
                <span className="truncate max-w-[120px]">{tag}</span>
                <Tooltip content={total > 1 ? `从全部 ${total} 个提示词移除 #${tag}` : `删除标签 #${tag}`}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBatchTogglePromptTags(targetPrompts, tag, false);
                    }}
                    className="w-0 opacity-0 group-hover/tag:w-3.5 group-hover/tag:opacity-100 group-hover/tag:ml-1 overflow-hidden inline-flex items-center justify-center text-[var(--color-primary)] hover:text-red-500 transition-all duration-150"
                  >
                    <X className="w-3 h-3 shrink-0" />
                  </button>
                </Tooltip>
              </span>
            ))}

            {partialTags.map(({ name: tag, count }) => (
              <Tooltip
                key={tag}
                content={`部分包含 (${count}/${total})，点击 + 面板可统一设为全部拥有，或点击 × 移除`}
              >
                <span className="group/tag h-6 inline-flex items-center text-[11.5px] px-2 rounded-md bg-amber-500/10 text-amber-700 font-medium border border-dashed border-amber-500/35 box-border transition-all duration-150">
                  <span className="opacity-60 mr-0.5 select-none">#</span>
                  <span className="truncate max-w-[96px]">{tag}</span>
                  <span className="text-[9.5px] opacity-70 ml-1 shrink-0">{count}/{total}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBatchTogglePromptTags(targetPrompts, tag, false);
                    }}
                    className="w-0 opacity-0 group-hover/tag:w-3.5 group-hover/tag:opacity-100 group-hover/tag:ml-1 overflow-hidden inline-flex items-center justify-center text-amber-700 hover:text-red-500 transition-all duration-150"
                  >
                    <X className="w-3 h-3 shrink-0" />
                  </button>
                </span>
              </Tooltip>
            ))}

            <Tooltip content="添加或批量设置标签">
              <button
                ref={tagAnchorRef}
                type="button"
                onClick={() => setIsPromptTagPopoverOpen(prev => !prev)}
                className={`h-6 w-6 inline-flex items-center justify-center rounded-md border border-dashed box-border shrink-0 transition-all cursor-pointer ${
                  isPromptTagPopoverOpen
                    ? 'border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary)]/10 font-medium'
                    : 'border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          </div>
        )}

        <TagSelectorPopover
          isOpen={isPromptTagPopoverOpen}
          anchorEl={tagAnchorRef.current}
          module="prompts"
          allItems={allPromptsPool.length > 0 ? allPromptsPool : prompts}
          selectedTags={fullTags}
          indeterminateTags={partialTags.map(p => p.name)}
          onToggleTag={(tag, shouldAdd) => handleBatchTogglePromptTags(targetPrompts, tag, shouldAdd)}
          onClose={() => setIsPromptTagPopoverOpen(false)}
          onOpenManager={() => setIsPromptTagManagerOpen(true)}
        />
      </div>
    );
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
      fetchData();
      window.dispatchEvent(new CustomEvent('skillhub:prompt-groups-changed'));
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
      // 星标与标签筛选在前端做
      let filtered = ps;
      if (filter === "favorites") {
        filtered = ps.filter(p => p.is_favorite);
      } else if (filter.startsWith("tag:")) {
        const targetTag = filter.slice(4);
        filtered = ps.filter(p => parseTags(p.tags).includes(targetTag));
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
      setAllPromptsPool(all);
      let fav = 0;
      let grp = 0;
      let ungrp = 0;
      let tagCount = 0;

      all.forEach(p => {
        if (p.is_favorite) fav++;
        if (p.group_id) grp++; else ungrp++;
        const tags = parseTags(p.tags);
        if (tags.length > 0) {
          tagCount++;
        }
      });

      const topTags = computeTagStats('prompts', all, 'count')
        .filter(t => t.count > 0)
        .slice(0, 10)
        .map(t => ({ name: t.name, count: t.count }));

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

  const applyPromptsFavoriteState = useCallback((ids: string[], isFavorite: boolean) => {
    const idSet = new Set(ids);
    setPrompts(prev => {
      const updated = prev.map(p => idSet.has(p.id) ? { ...p, is_favorite: isFavorite } : p);
      return filter === "favorites" && !isFavorite ? updated.filter(p => p.is_favorite) : updated;
    });
    setAllPromptsPool(prev => {
      if (prev.length === 0) return prev;
      const next = prev.map(p => idSet.has(p.id) ? { ...p, is_favorite: isFavorite } : p);
      const fav = next.filter(p => p.is_favorite).length;
      setOverviewStats(s => ({ ...s, favorites: fav }));
      return next;
    });
    setInspectorData(prev =>
      prev && idSet.has(prev.prompt.id)
        ? { ...prev, prompt: { ...prev.prompt, is_favorite: isFavorite } }
        : prev
    );
  }, [filter]);

  useEffect(() => {
    const handleGroupsChanged = () => {
      fetchData();
      fetchOverviewStats();
    };
    const handleTagsChanged = () => {
      fetchData();
      fetchOverviewStats();
    };
    const handleFavoriteChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; isFavorite: boolean }>).detail;
      if (detail?.id) {
        applyPromptsFavoriteState([detail.id], detail.isFavorite);
        if (filter === "favorites" && detail.isFavorite) {
          fetchData();
        }
      }
    };
    window.addEventListener('skillhub:prompt-groups-changed', handleGroupsChanged);
    window.addEventListener('skillhub:prompt-tags-changed', handleTagsChanged);
    window.addEventListener('skillhub:prompt-favorite-changed', handleFavoriteChanged);
    return () => {
      window.removeEventListener('skillhub:prompt-groups-changed', handleGroupsChanged);
      window.removeEventListener('skillhub:prompt-tags-changed', handleTagsChanged);
      window.removeEventListener('skillhub:prompt-favorite-changed', handleFavoriteChanged);
    };
  }, [fetchData, fetchOverviewStats, applyPromptsFavoriteState, filter]);

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

  const handleFavoriteToggle = useCallback((id: string, newVal: boolean) => {
    applyPromptsFavoriteState([id], newVal);
  }, [applyPromptsFavoriteState]);

  const handleSetPromptsFavoriteBatch = useCallback(async (targetPrompts: Prompt[], targetState: boolean) => {
    const toToggle = targetPrompts.filter(p => p.is_favorite !== targetState);
    if (toToggle.length === 0) return;
    const ids = toToggle.map(p => p.id);
    applyPromptsFavoriteState(ids, targetState);
    try {
      await Promise.all(ids.map(id => invoke<boolean>("toggle_prompt_favorite", { id })));
    } catch {
      fetchData();
      fetchOverviewStats();
      showToast("操作失败", "error");
    }
  }, [applyPromptsFavoriteState, fetchData, fetchOverviewStats]);

  const filterLabel = filter === "all" ? "全部提示词"
    : filter === "favorites" ? "星标提示词"
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
    return 'MessageSquareQuote';
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
          <div className="flex items-center gap-2">
            {prompts.length > 0 && filter === "trash" && (
              <button
                onClick={handleEmptyTrash}
                className="h-7 box-border inline-flex items-center justify-center gap-1.5 px-2.5 rounded-lg border border-red-200 bg-red-50/70 hover:bg-red-100 text-[12px] leading-none font-medium text-red-600 shadow-xs transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>清空回收站</span>
              </button>
            )}
            {prompts.length > 0 && filter !== "trash" && (
              <button 
                onClick={() => setIsExportDialogOpen(true)}
                className="h-7 box-border inline-flex items-center justify-center gap-1.5 px-2.5 rounded-lg border border-black/[0.08] bg-white hover:bg-black/[0.03] hover:border-black/[0.15] text-[12px] leading-none font-medium text-[var(--foreground)] shadow-xs transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[var(--color-muted)]" />
                <span>导出全部</span>
              </button>
            )}
            {filter !== "trash" && (
              <button 
                onClick={() => onOpenPromptDetail?.("新建提示词", undefined, true)}
                className="h-7 box-border inline-flex items-center justify-center gap-1 bg-blue-500 hover:bg-blue-600 text-white px-2.5 rounded-lg text-[12px] leading-none font-medium border border-transparent shadow-xs transition-all cursor-pointer"
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
                  : filter === "favorites" ? "星标提示词"
                  : filter === "ungrouped" ? "未分组提示词"
                  : filter === "untagged" ? "未标签提示词"
                  : filter === "trash" ? "回收站"
                  : filter.startsWith("group:") ? (groups.find(g => g.id === filter.split(":")[1])?.name || "提示词分组")
                  : filter.startsWith("tag:") ? `#${filter.slice(4)}`
                  : "提示词库";

                const overviewSubtitle = filter === "all" ? "本地提示词统一存储与管理"
                  : filter === "favorites" ? "已星标的高频提示词"
                  : filter === "ungrouped" ? "暂未分配到任何分组"
                  : filter === "untagged" ? "暂未添加任何标签"
                  : filter === "trash" ? "已移入回收站的提示词"
                  : filter.startsWith("group:") ? "自定义提示词分组"
                  : filter.startsWith("tag:") ? "按标签智能分类"
                  : "提示词管理";

                const currentGroup = filter.startsWith("group:") ? groups.find(g => g.id === filter.split(":")[1]) : null;

                return (
                  <div 
                    className="w-64 border-l border-[var(--color-border)] bg-transparent flex flex-col shrink-0 h-full overflow-hidden inspector-container"
                  >
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
                            className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-white shadow-sm ${!currentGroup?.color ? 'bg-blue-500' : ''}`}
                            style={currentGroup?.color ? { backgroundColor: currentGroup.color } : undefined}
                          >
                            <MessageSquareQuote className="w-3 h-3" />
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
                              <span className="text-[var(--foreground)]">已星标</span>
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
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">热门标签</h4>
                          <Tooltip content="管理标签" side="left">
                            <button
                              type="button"
                              onClick={() => setIsPromptTagManagerOpen(true)}
                              className="p-0.5 rounded text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors"
                            >
                              <SlidersHorizontal className="w-3 h-3" />
                            </button>
                          </Tooltip>
                        </div>
                        {overviewStats.topTags.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {overviewStats.topTags.map(t => (
                              <button
                                key={t.name}
                                type="button"
                                onClick={() => onFilterChange(`tag:${t.name}`)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/[0.04] hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)] text-[11px] text-[var(--foreground)] transition-colors cursor-pointer"
                              >
                                <Tag className="w-2.5 h-2.5 opacity-60 shrink-0" />
                                <span className="truncate max-w-[110px]">{t.name}</span>
                                <span className="text-[var(--color-muted)] text-[10px]">({t.count})</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-[var(--color-muted)]/70">暂无热门标签，点击右上角可管理预设标签</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }
              
              if (selectedIds.size > 1) {
                return (
                  <div 
                    className="bg-transparent border-l border-[var(--color-border)] flex flex-col shrink-0 h-full overflow-hidden w-64 inspector-container"
                  >
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
                    <div className="flex-1 overflow-y-auto p-4 inspector-scroll-area flex flex-col">
                      <div className="flex flex-col items-center pt-6 pb-6">
                        <div className="w-16 h-16 bg-[var(--color-primary)]/10 rounded-full flex items-center justify-center mb-4">
                           <span className="text-2xl font-bold text-[var(--color-primary)]">{selectedIds.size}</span>
                        </div>
                        <h3 className="text-[15px] font-semibold text-[var(--foreground)] mb-1">已选 {selectedIds.size} 个</h3>
                        <p className="text-[12px] text-[var(--color-muted)] text-center">你可以对选中提示词进行批量打标或操作</p>
                      </div>

                      {renderPromptTagSection(selectedPrompts, '批量标签')}
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
              <div 
                className="bg-transparent border-l border-[var(--color-border)] flex flex-col shrink-0 h-full overflow-hidden w-64 inspector-container"
              >
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
                      <p 
                        className="text-[12px] text-[var(--color-muted)] leading-relaxed max-h-[58px] overflow-hidden"
                        style={{
                          WebkitMaskImage: 'linear-gradient(to bottom, black calc(100% - 20px), transparent 100%)',
                          maskImage: 'linear-gradient(to bottom, black calc(100% - 20px), transparent 100%)'
                        }}
                      >
                        {p.description}
                      </p>
                    )}
                  </div>
                  <div 
                    className="bg-[var(--color-background)] rounded-lg p-3 max-h-[148px] overflow-hidden relative select-text"
                    style={{
                      WebkitMaskImage: 'linear-gradient(to bottom, black calc(100% - 36px), transparent 100%)',
                      maskImage: 'linear-gradient(to bottom, black calc(100% - 36px), transparent 100%)'
                    }}
                  >
                    <p className="text-[12px] text-[var(--foreground)] leading-relaxed whitespace-pre-wrap font-mono select-text">
                      {p.content}
                    </p>
                  </div>
                  
                  {renderPromptTagSection([p], '标签')}

                  <div className="space-y-2 text-[12px]">
                    {(() => {
                      const storeRes = findStoreResourceForPrompt(p, registryData.resources as any);
                      if (!storeRes) return null;
                      return (
                        <div className="flex items-center justify-between">
                          <span className="text-[var(--color-muted)]">来源</span>
                          <button
                            type="button"
                            onClick={() => onViewInStore?.(storeRes.id)}
                            className="inline-flex items-center gap-1 text-[12px] text-[var(--color-primary)] hover:underline font-medium cursor-pointer"
                            title="在资源社区中查看此提示词"
                          >
                            <Globe size={12} />
                            <span>在资源社区中查看</span>
                          </button>
                        </div>
                      );
                    })()}
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
            ] : (() => {
              const selectedTargetPrompts = prompts.filter(p => selectedIds.has(p.id));
              const allStarred = selectedTargetPrompts.length > 0 && selectedTargetPrompts.every(p => p.is_favorite);
              return [
                {
                  id: 'favorite_multi',
                  label: allStarred ? '批量取消星标' : '批量星标',
                  icon: <Star size={14} className={allStarred ? "fill-amber-400 text-amber-500" : ""} />,
                  onClick: () => {
                    handleSetPromptsFavoriteBatch(selectedTargetPrompts, !allStarred);
                    hideContextMenu();
                  }
                },
                buildPromptTagSubmenu(selectedTargetPrompts),
                { separator: true, id: 'sep_tag_multi', label: '' },
                { id: 'export_multi', label: `导出选中的 ${selectedIds.size} 项`, icon: <Download size={14} />, onClick: () => { 
                    setExportingPrompts(selectedTargetPrompts); 
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
            ];
            })()
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
            ] : (() => {
              const matchedStoreRes = contextPrompt ? findStoreResourceForPrompt(contextPrompt, registryData.resources as any) : undefined;
              return [
                { id: 'open', label: '打开', icon: <ChevronRight size={14} />, onClick: () => { onOpenPromptDetail?.(contextPrompt.title || '无标题', contextPrompt.id, false); hideContextMenu(); } },
                ...(onOpenPromptDetail ? [{ id: 'open_new_tab', label: '在新标签页中打开', icon: <Plus size={14} />, onClick: () => { onOpenPromptDetail(contextPrompt.title || '无标题提示词', contextPrompt.id, false, true); hideContextMenu(); } }] : []),
                ...(matchedStoreRes ? [{
                  id: 'view_in_store',
                  label: '在资源社区中查看',
                  icon: <Globe size={14} />,
                  onClick: () => {
                    onViewInStore?.(matchedStoreRes.id);
                    hideContextMenu();
                  }
                }] : []),
                { id: 'edit', label: '编辑', icon: <Edit2 size={14} />, onClick: () => { onOpenPromptDetail?.(contextPrompt.title || '无标题', contextPrompt.id, true); hideContextMenu(); } },
              { id: 'copy', label: '复制内容', icon: <Copy size={14} />, onClick: async () => { 
                  await navigator.clipboard.writeText(contextPrompt.content); 
                  showToast("已复制", "success"); 
                  hideContextMenu(); 
                } 
              },
              { id: 'favorite', label: contextPrompt.is_favorite ? '取消星标' : '星标', icon: <Star size={14} className={contextPrompt.is_favorite ? "fill-amber-400 text-amber-500" : ""} />, onClick: async () => {
                  const prevVal = contextPrompt.is_favorite;
                  const nextVal = !prevVal;
                  handleFavoriteToggle(contextPrompt.id, nextVal);
                  hideContextMenu();
                  try {
                    const actualVal = await invoke<boolean>("toggle_prompt_favorite", { id: contextPrompt.id });
                    if (actualVal !== nextVal) {
                      handleFavoriteToggle(contextPrompt.id, actualVal);
                    }
                  } catch (e) {
                    handleFavoriteToggle(contextPrompt.id, prevVal);
                    showToast("操作失败", "error");
                  }
                }
              },
              buildPromptTagSubmenu([contextPrompt]),
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
            ];
          })()
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
      <TagManagerModal
        isOpen={isPromptTagManagerOpen}
        module="prompts"
        allItems={allPromptsPool.length > 0 ? allPromptsPool : prompts}
        onClose={() => setIsPromptTagManagerOpen(false)}
        onSelectTagFilter={(tagName) => onFilterChange(`tag:${tagName}`)}
        onRenameTag={async (oldName, newName) => {
          await renamePromptTagInDb(oldName, newName);
          if (filter === `tag:${oldName}`) {
            onFilterChange(`tag:${newName}`);
          }
        }}
        onDeleteTags={async (tagNames) => {
          await deletePromptTagsInDb(tagNames);
          if (filter.startsWith('tag:') && tagNames.includes(filter.slice(4))) {
            onFilterChange('all');
          }
        }}
      />
    </div>
  );
}
