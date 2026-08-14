import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Plus, Download, Star, LayoutGrid, Trash2, Trash, FolderPlus, MoreHorizontal } from "lucide-react";
import { Prompt, PromptGroup, PromptVersion } from "./types";
import { PromptCard } from "./components/prompt/PromptCard";
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
  onFilterChange: (f: PromptFilter) => void;
  onCreateGroup: () => void;
  onGroupSaved: () => void;
  isCreateGroupOpen: boolean;
  onCreateGroupClose: () => void;
}

export function PromptSidebarNav({
  filter, groups, onFilterChange, onCreateGroup,
  isCreateGroupOpen, onCreateGroupClose, onGroupSaved,
}: PromptSidebarNavProps) {
  return (
    <>
      {/* 快捷筛选 */}
      <div className="px-3 mb-3">
        <h3 className="text-[11px] font-semibold text-[var(--color-muted)]/60 mb-1 px-2 uppercase tracking-wide">快捷筛选</h3>
        <div className="space-y-0.5">
          {[
            { id: "all", label: "全部提示词", icon: LayoutGrid },
            { id: "favorites", label: "收藏", icon: Star },
            { id: "trash", label: "回收站", icon: Trash },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => onFilterChange(item.id)}
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
              onClick={() => onFilterChange(group.id)}
              className={`w-full flex items-center justify-between px-2 py-1 rounded-md transition-colors outline-none select-none text-[13px] ${
                filter === group.id
                  ? "bg-black/5 text-[var(--foreground)] font-semibold"
                  : "text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] font-medium"
              }`}
            >
              <span className="flex items-center gap-1.5 truncate min-w-0">
                <span className="shrink-0">{group.icon || "📁"}</span>
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

      {/* 创建分组弹窗 */}
      <CreateGroupDialog
        isOpen={isCreateGroupOpen}
        group={null}
        onClose={onCreateGroupClose}
        onSave={onGroupSaved}
      />
    </>
  );
}

// ===== 主内容区（不含侧边栏）=====
interface PromptModuleProps {
  filter: PromptFilter;
  refreshKey?: number;
  onGroupsChange: (groups: PromptGroup[]) => void;
  onFilterChange: (f: PromptFilter) => void;
}

interface PromptInspectorData {
  prompt: Prompt;
  versions: PromptVersion[];
}

export function PromptModule({ filter, refreshKey, onGroupsChange, onFilterChange }: PromptModuleProps) {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [groups, setGroups] = useState<PromptGroup[]>([]);
  const [search] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inspectorData, setInspectorData] = useState<PromptInspectorData | null>(null);

  // 弹窗状态
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
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
      const [ps, gs] = await Promise.all([
        invoke<Prompt[]>("get_prompts", { groupId: filter === "all" ? null : filter === "favorites" ? null : filter, search: search || null }),
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

  const handleSelectPrompt = (prompt: Prompt) => {
    setSelectedIds(new Set([prompt.id]));
    invoke<PromptVersion[]>("get_prompt_versions", { promptId: prompt.id })
      .then(versions => setInspectorData({ prompt, versions }))
      .catch(() => setInspectorData({ prompt, versions: [] }));
  };

  const handleCardSelect = (id: string, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    } else {
      setSelectedIds(new Set([id]));
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
        showToast(`已移入回收站`, "success");
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
    : filter === "trash" ? "回收站"
    : groups.find(g => g.id === filter)?.name || "";

  const selectedPrompts = prompts.filter(p => selectedIds.has(p.id));

  return (
    <div className="flex flex-1 h-full min-w-0 overflow-hidden">
      {/* 主内容区 */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-[var(--color-background)]">
        {/* 顶栏 */}
        <div 
          data-tauri-drag-region 
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) getCurrentWindow().startDragging();
          }}
          className="h-16 border-b border-[var(--color-border)] bg-white/70 backdrop-blur-xl flex items-center justify-between px-6 shrink-0 relative z-0"
        >
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-[var(--foreground)]">{filterLabel}</h1>
            <span className="text-[12px] text-[var(--color-muted)] bg-black/5 px-2 py-0.5 rounded-full">{prompts.length}</span>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <>
                {filter !== "trash" && (
                  <button
                    onClick={() => { setExportingPrompts(selectedPrompts); setIsExportDialogOpen(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 rounded-lg transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    导出 ({selectedIds.size})
                  </button>
                )}
                <button
                  onClick={handleDeleteSelected}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {filter === "trash" ? "彻底删除" : "删除"}
                </button>
              </>
            )}
            {selectedIds.size === 0 && prompts.length > 0 && filter === "trash" && (
              <button
                onClick={handleEmptyTrash}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                清空回收站
              </button>
            )}
            {selectedIds.size === 0 && prompts.length > 0 && filter !== "trash" && (
              <button
                onClick={() => { setExportingPrompts(prompts); setIsExportDialogOpen(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                导出全部
              </button>
            )}
            {filter !== "trash" && (
              <button
                onClick={() => { setEditingPrompt(null); setIsEditorOpen(true); }}
                className="flex items-center gap-1.5 px-4 py-1.5 text-[13px] font-semibold rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                新建提示词
              </button>
            )}
          </div>
        </div>

        {/* 内容 + Inspector */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* 卡片网格 */}
          <div 
            className="flex-1 overflow-y-auto"
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
            {prompts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8">
                <div className="w-16 h-16 mb-4 rounded-2xl bg-[var(--color-primary)]/10 flex items-center justify-center">
                  <MoreHorizontal className="w-8 h-8 text-[var(--color-primary)]/40" />
                </div>
                <h3 className="text-[15px] font-semibold text-[var(--foreground)] mb-2">还没有提示词</h3>
                <p className="text-[13px] text-[var(--color-muted)] mb-4 text-center max-w-xs">
                  点击「新建提示词」开始收集你常用的 AI Prompt，随时快速复用
                </p>
                <button
                  onClick={() => { setEditingPrompt(null); setIsEditorOpen(true); }}
                  className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  新建提示词
                </button>
              </div>
            ) : (
              <div 
                className="p-6 columns-2 xl:columns-3 gap-4 min-h-full"
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
                    onClick={handleSelectPrompt}
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
            )}
          </div>

          {/* Inspector 面板 */}
          {inspectorData && (
            <div className="bg-white/80 backdrop-blur-xl border-l border-[var(--color-border)] flex flex-col shrink-0 overflow-hidden" style={{ width: "264px" }}>
              <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
                <span className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wide">概览</span>
                <button
                  onClick={() => { setEditingPrompt(inspectorData.prompt); setIsEditorOpen(true); }}
                  className="text-[12px] text-[var(--color-primary)] font-medium hover:text-[var(--color-primary)]/80 transition-colors"
                >编辑</button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--foreground)] mb-1">{inspectorData.prompt.title}</h3>
                  {inspectorData.prompt.description && (
                    <p className="text-[12px] text-[var(--color-muted)] leading-relaxed">{inspectorData.prompt.description}</p>
                  )}
                </div>
                <div className="bg-[var(--color-background)] rounded-lg p-3">
                  <p className="text-[12px] text-[var(--foreground)] leading-relaxed whitespace-pre-wrap line-clamp-8 font-mono">
                    {inspectorData.prompt.content}
                  </p>
                </div>
                <div className="space-y-2 text-[12px]">
                  {inspectorData.prompt.group_name && (
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--color-muted)]">分组</span>
                      <span className="text-[var(--foreground)] font-medium">{inspectorData.prompt.group_name}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--color-muted)]">使用次数</span>
                    <span className="text-[var(--foreground)]">{inspectorData.prompt.use_count} 次</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--color-muted)]">版本</span>
                    <span className="text-[var(--foreground)]">v{inspectorData.prompt.version}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--color-muted)]">更新</span>
                    <span className="text-[var(--foreground)]">{new Date(inspectorData.prompt.updated_at).toLocaleDateString("zh-CN")}</span>
                  </div>
                </div>
                {inspectorData.prompt.tags && (
                  <div className="flex flex-wrap gap-1">
                    {inspectorData.prompt.tags.split(",").map(t => t.trim()).filter(Boolean).map(tag => (
                      <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
                {inspectorData.versions.length > 0 && (
                  <div>
                    <h4 className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-2">版本历史</h4>
                    <div className="space-y-2">
                      {inspectorData.versions.slice(0, 5).map((v, i) => (
                        <div key={v.id} className="flex items-start gap-2">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
                            i === 0 ? "bg-[var(--color-primary)] text-white" : "bg-black/5 text-[var(--color-muted)]"
                          }`}>{v.version}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-[var(--foreground)] truncate">{v.change_note || "版本更新"}</p>
                            <p className="text-[10px] text-[var(--color-muted)]">
                              {new Date(v.created_at).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 弹窗 */}
      <PromptEditorDrawer
        isOpen={isEditorOpen}
        prompt={editingPrompt}
        groups={groups}
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
          contextPrompt ? (
            filter === "trash" ? [
              { id: 'restore', label: '恢复', onClick: () => {
                  invoke("restore_prompts", { ids: [contextPrompt.id] }).then(() => {
                    showToast("已恢复", "success");
                    setSelectedIds(new Set());
                    setInspectorData(null);
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
                    setInspectorData(null);
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
                    showToast("已移入回收站", "success");
                    setSelectedIds(new Set());
                    setInspectorData(null);
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
