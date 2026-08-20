import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { SelectionArea, SelectionEvent } from '@viselect/react';
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { HardDrive, Settings, Search, Plus, RefreshCw, ChevronRight, ChevronLeft, X, LayoutGrid, Sparkles, Globe, FolderX, FolderSearch, Trash2, Info, Folder, Copy, Link as LinkIcon, Check, Download, FileArchive, MessageSquareText, Store, Puzzle, CheckSquare, Star, Clock, Tag } from "lucide-react";
import { open } from '@tauri-apps/plugin-dialog';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { AddRepositoryDialog } from "./components/library/AddRepositoryDialog";
import { SkillLibrarySelector, SkillLibrarySelectorRef } from './components/library/SkillLibrarySelector';
import { CreateSkillLibraryModal, OpenSkillLibraryModal, MergeSkillLibraryModal } from "./components/library/LibraryManagementModals";
import { SkillDetailsDrawer } from "./components/skill/SkillDetailsDrawer";
import { PromptPreviewModal } from "./components/skill/PromptPreviewModal";
import { AgentSettingsDialog } from "./components/agent/AgentSettingsDialog";
import { ConfirmDialog } from './components/ui/ConfirmDialog';
import { SearchModal } from "./components/search/SearchModal";
import { RepoCard } from "./components/skill/RepoCard";
import { SkillCard } from "./components/skill/SkillCard";
import { ToastContainer, showToast } from "./components/ui/Toast";
import { Tooltip } from "./components/ui/Tooltip";
import { AboutDialog } from "./components/ui/AboutDialog";
import { InspectorPanel } from "./components/inspector/InspectorPanel";
import { ContextMenu, useContextMenu } from "./components/ui/ContextMenu";
import type { ContextMenuItem } from "./components/ui/ContextMenu";
import { getNextElement } from "./utils/navigation";
import { Skill, SourceDirectory, AgentConfig, SyncRecord, GroupedRepo, PromptGroup } from "./types";
import { PromptModule, PromptSidebarNav, PromptFilter } from "./PromptModule";

const isMac = navigator.userAgent.toLowerCase().includes('mac');
const fileManagerName = isMac ? '访达' : '文件管理器';

const getExportTimeStr = () => new Date().toISOString().replace(/[:.]/g, '-');

type AppModule = 'skills' | 'prompts' | 'resources';

function App() {
  const [activeModule, setActiveModule] = useState<AppModule>('skills');
  const [activeTab, setActiveTab] = useState("all");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [activeView, setActiveView] = useState<"all" | "starred" | "recent" | "untagged">("all");
  const [, setSkills] = useState<Skill[]>([]);
  const [directories, setDirectories] = useState<SourceDirectory[]>([]);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [syncRecords, setSyncRecords] = useState<SyncRecord[]>([]);
  const [openWithApps, setOpenWithApps] = useState<{name: string, path: string, icon_base64?: string}[]>([]);
  const [groupedRepos, setGroupedRepos] = useState<GroupedRepo[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);

  // Eagle 风格交互：选中状态
  const [inspectorSelectedType, setInspectorSelectedType] = useState<'repo' | 'skill' | null>(null);
  const [selectedRepoIds, setSelectedRepoIds] = useState<Set<string>>(new Set());
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(new Set());
  const [lastSelectedRepoId, setLastSelectedRepoId] = useState<string | null>(null);
  const [lastSelectedSkillId, setLastSelectedSkillId] = useState<string | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);

  // Prompt 模块状态（提升，供 App 侧边栏和 PromptModule 共享）
  const [promptFilter, setPromptFilter] = useState<PromptFilter>("all");
  const [promptGroups, setPromptGroups] = useState<PromptGroup[]>([]);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [promptRefreshKey, setPromptRefreshKey] = useState(0);

  // 右键菜单
  const { menuPosition, menuTarget, showContextMenu, hideContextMenu } = useContextMenu();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(() => {
    return localStorage.getItem("skillhub_selected_workspace");
  });
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isOpenModalOpen, setIsOpenModalOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [addDialogTab, setAddDialogTab] = useState<"local" | "github" | "online" | null>(null);

  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [isRetryingMissing, setIsRetryingMissing] = useState(false);
  const [syncLogs, setSyncLogs] = useState<{ id: string, label: string, status: 'pending' | 'success' | 'error' | 'skipped', message?: string }[]>([]);
  const [isSyncPopupMinimized, setIsSyncPopupMinimized] = useState(false);
  const [cloningRepos, setCloningRepos] = useState<{ path: string, name: string }[]>([]);
  const [deleteConfirmRepos, setDeleteConfirmRepos] = useState<GroupedRepo[] | null>(null);
  const [isAppStarting, setIsAppStarting] = useState(true);
  const [isFileDraggingOver, setIsFileDraggingOver] = useState(false);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const [loadingText, setLoadingText] = useState("SkillHub载入中…");
  const skillLibrarySelectorRef = useRef<SkillLibrarySelectorRef>(null);
  const isDraggingRef = useRef(false);

  // 智能引用提示词弹窗状态
  const [promptModal, setPromptModal] = useState<{ isOpen: boolean; skillName: string; content: string; loading: boolean }>({
    isOpen: false, skillName: '', content: '', loading: false,
  });

  const [confirmData, setConfirmData] = useState<{ title: string, message: string, onConfirm: () => void, onClose: () => void } | null>(null);

  const waitConfirm = (message: string) => new Promise<boolean>(resolve => {
    setConfirmData({
      title: '确认操作',
      message,
      onConfirm: () => { setConfirmData(null); resolve(true); },
      onClose: () => { setConfirmData(null); resolve(false); }
    });
  });

  useEffect(() => {
    if (isAppStarting) {
      const timer = setTimeout(() => {
        setLoadingText("即将完成...");
      }, 500); // 500ms 后切换文案
      return () => clearTimeout(timer);
    }
  }, [isAppStarting]);

  const currentSyncRunId = useRef<number>(0);

  const handleWorkspaceSelect = (id: string | null) => {
    setSelectedWorkspaceId(id);
    if (id) {
      localStorage.setItem("skillhub_selected_workspace", id);
      invoke("refresh_app_menu", { selectedId: id }).catch(console.error);
    } else {
      localStorage.removeItem("skillhub_selected_workspace");
      invoke("refresh_app_menu", { selectedId: null }).catch(console.error);
    }
    setActiveTab("all");
    setSelectedTag("all");
    setActiveView("all");
  };

  const fetchData = async () => {
    try {
      const fetchedSkills = await invoke<Skill[]>("get_skills");
      const fetchedDirs = await invoke<SourceDirectory[]>("get_source_directories");
      const fetchedRepos = await invoke<GroupedRepo[]>("get_repositories_with_skills");

      const fetchedAgents = await invoke<AgentConfig[]>("get_agents");
      const allSyncs = await Promise.all(
        fetchedSkills.map(s => invoke<SyncRecord[]>("get_sync_records_for_skill", { skillId: s.id }))
      );

      setSkills(fetchedSkills);
      setDirectories(fetchedDirs);
      await invoke("refresh_app_menu", {
        selectedId: localStorage.getItem("skillhub_selected_workspace")
      }).catch(console.error);
      setGroupedRepos(fetchedRepos);
      setAgents(fetchedAgents);
      setSyncRecords(allSyncs.flat());
      
      // 获取当前可用的关联应用
      if (fetchedSkills.length > 0 && openWithApps.length === 0) {
        invoke<{name: string, path: string, icon_base64?: string}[]>('get_open_with_apps', { path: fetchedSkills[0].local_path })
          .then(apps => setOpenWithApps(apps))
          .catch(console.error);
      }
      
      return fetchedDirs;
    } catch (e) {
      console.error("Failed to load data", e);
      return [];
    }
  };

  useEffect(() => {
    invoke("cleanup_expired_trash").catch(console.error);
    fetchData().then((dirs) => {
      // 启动时静默同步一次
      if (dirs && dirs.length > 0) {
        handleSyncAll(false, dirs);
        const savedId = localStorage.getItem("skillhub_selected_workspace");
        if (!savedId || !dirs.some(d => d.id === savedId)) {
          handleWorkspaceSelect(dirs[0].id);
        } else {
          handleWorkspaceSelect(savedId);
        }
      } else {
        handleWorkspaceSelect(null);
      }
    }).finally(() => {
      setIsAppStarting(false);
    });

    // 后台定时静默同步 (每小时)
    const interval = setInterval(async () => {
      try {
        const dirs = await invoke<SourceDirectory[]>("get_source_directories");
        if (dirs && dirs.length > 0) {
          handleSyncAll(false, dirs);
        }
      } catch (e) {
        console.error("Background sync failed", e);
      }
    }, 60 * 60 * 1000);

    let unlisten: UnlistenFn | null = null;
    let unlistenPrefs: UnlistenFn | null = null;

    listen<string>("menu-action", (event) => {
      const action = event.payload;
      getCurrentWindow().unminimize();
      getCurrentWindow().setFocus();

      if (action === "create_library") {
        setIsCreateModalOpen(true);
      } else if (action === "open_library") {
        setIsOpenModalOpen(true);
      } else if (action === "merge_library") {
        setIsMergeModalOpen(true);
      } else if (action === "prefs") {
        setIsSettingsOpen(true);
      } else if (action === "clear_history") {
        showToast("暂不支持该操作");
      } else if (action === "reload_cache") {
        window.location.reload();
      } else if (action.startsWith("select_")) {
        const id = action.replace("select_", "");
        handleWorkspaceSelect(id);
      }
    }).then(un => unlisten = un);

    
    let isDragDropMounted = true;
    getCurrentWebviewWindow().onDragDropEvent((event) => {
      if (!isDragDropMounted) return;
      if (event.payload.type === 'over' || event.payload.type === 'enter') {
        const { x, y } = event.payload.position;
        if (mainContentRef.current) {
          const rect = mainContentRef.current.getBoundingClientRect();
          const logicalX = x / window.devicePixelRatio;
          const logicalY = y / window.devicePixelRatio;
          if (logicalX >= rect.left && logicalX <= rect.right && logicalY >= rect.top && logicalY <= rect.bottom) {
            setIsFileDraggingOver(true);
          } else {
            setIsFileDraggingOver(false);
          }
        }
      } else if (event.payload.type === 'drop') {
        setIsFileDraggingOver(false);
        const { x, y } = event.payload.position;
        if (mainContentRef.current) {
          const rect = mainContentRef.current.getBoundingClientRect();
          const logicalX = x / window.devicePixelRatio;
          const logicalY = y / window.devicePixelRatio;
          if (logicalX >= rect.left && logicalX <= rect.right && logicalY >= rect.top && logicalY <= rect.bottom) {
            const paths = event.payload.paths;
            const targetWorkspaceId = localStorage.getItem("skillhub_selected_workspace");
            if (!targetWorkspaceId || targetWorkspaceId === "all") {
              showToast("请先在左侧选择一个具体的目标资源库再进行拖入", "error");
              return;
            }
            
            // Validate and copy
            setLoadingText("正在导入...");
            setIsAppStarting(true);
            invoke("get_source_directories").then((dirs: any) => {
              const targetWorkspaceDir = dirs.find((d: any) => d.id === targetWorkspaceId)?.path;
              if (targetWorkspaceDir) {
                 invoke("validate_and_copy_dropped_folders", {
                   paths,
                   targetWorkspacePath: targetWorkspaceDir
                 }).then((msg) => {
                   return invoke("rescan_directory", { path: targetWorkspaceDir }).then(() => {
                     return fetchData().then(() => {
                       showToast(msg as string, "success");
                     });
                   });
                 }).catch((err) => {
                   showToast(err as string, "error");
                 }).finally(() => {
                   setIsAppStarting(false);
                 });
              } else {
                 showToast("目标资源库路径不存在", "error");
                 setIsAppStarting(false);
              }
            });
          }
        }
      } else {
        setIsFileDraggingOver(false);
      }
    });


    listen("open-preferences", () => {
      getCurrentWindow().unminimize();
      getCurrentWindow().setFocus();
      setIsSettingsOpen(true);
    }).then(un => unlistenPrefs = un);

    return () => {
      clearInterval(interval);
      if (unlisten) unlisten();
      if (unlistenPrefs) unlistenPrefs();
      isDragDropMounted = false;
      // We do NOT call unlistenDragDrop() because in Tauri v2, unlistening the drag-drop event
      // can sometimes globally disable drag-drop for the webview due to a race condition in StrictMode.
      // Setting isDragDropMounted = false is enough to prevent double-firing.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopyPath = async (e: React.MouseEvent, skill: Skill) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(skill.local_path);
      showToast("skill文件路径已复制到剪切板");
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateRepos = async (e: React.MouseEvent, repos: GroupedRepo[]) => {
    e.stopPropagation();
    if (repos.length === 0) return;
    setSyncLogs(repos.map(r => ({ id: r.path, label: r.name, status: 'pending', message: '' })));
    setIsSyncPopupMinimized(false);

    let totalLogs: { id: string, label: string, status: 'pending' | 'success' | 'error' | 'skipped', message?: string }[] = repos.map(r => ({ id: r.path, label: r.name, status: 'pending', message: '' }));

    for (const repo of repos) {
      if (repo.source_type !== 'github') {
        totalLogs = totalLogs.map(l => l.id === repo.path ? { ...l, status: 'skipped', message: '本地跳过' } : l);
        setSyncLogs([...totalLogs]);
        continue;
      }
      try {
        const msg = await invoke<string>("pull_single_repo", { path: repo.path });
        if (msg === '已是最新') {
          totalLogs = totalLogs.map(l => l.id === repo.path ? { ...l, status: 'skipped', message: msg } : l);
        } else {
          totalLogs = totalLogs.map(l => l.id === repo.path ? { ...l, status: 'success', message: msg } : l);
        }
        setSyncLogs([...totalLogs]);
        await invoke("rescan_directory", { path: repo.source_dir_id! });
        await fetchData();
      } catch (err) {
        totalLogs = totalLogs.map(l => l.id === repo.path ? { ...l, status: 'error', message: String(err) } : l);
        setSyncLogs([...totalLogs]);
      }
    }
    setTimeout(() => setSyncLogs([]), 5000);
  };

  const handleDeleteRepos = async (e: React.MouseEvent, repos: GroupedRepo[]) => {
    e.stopPropagation();
    if (repos.length === 0) return;
    setDeleteConfirmRepos(repos);
  };

  const confirmDeleteRepos = async () => {
    if (!deleteConfirmRepos) return;
    const repos = deleteConfirmRepos;
    try {
      for (const r of repos) {
        await invoke("delete_skill_by_path", { path: r.path });
      }
      await fetchData();
      if (repos.some(r => r.id === selectedRepoId)) setSelectedRepoId(null);
      setSelectedRepoIds(new Set());
    } catch (err) {
      alert(String(err));
    }
    setDeleteConfirmRepos(null);
  };

  const openAddDialog = (tab: "local" | "github" | "online" | null = null) => {
    if (!selectedWorkspaceId || selectedWorkspaceId === "all") {
      showToast("请先在左侧选择一个具体的技能库再导入", "error");
      return;
    }
    setAddDialogTab(tab);
    setIsAddDialogOpen(true);
  };

  const handleAddRepo = () => {
    openAddDialog();
  };

  const handleCancelClone = async (e: React.MouseEvent, targetPath: string) => {
    e.stopPropagation();
    try {
      await invoke("cancel_github_clone", { targetDir: targetPath });
      setCloningRepos(prev => prev.filter(r => r.path !== targetPath));
    } catch (err) {
      showToast(String(err), 'error');
    }
  };

  const handleSyncAll = async (isManual = true, dirsToSync = directories) => {
    if (isSyncingAll) return;

    const runId = Date.now();
    currentSyncRunId.current = runId;
    setIsSyncingAll(true);

    if (isManual) {
      setSyncLogs([]);
      setIsSyncPopupMinimized(true); // 手动同步时默认最小化
    }

    let totalLogs: { id: string, label: string, status: 'pending' | 'success' | 'error' | 'skipped', message?: string }[] = [];

    for (const dir of dirsToSync) {
      try {
        if (currentSyncRunId.current !== runId) break;
        const repos = await invoke<{ name: string, path: string }[]>("get_git_repos_in_directory", { path: dir.path });

        if (repos.length === 0) {
          await invoke("rescan_directory", { path: dir.path });
          continue;
        }

        if (isManual) {
          const newLogs = repos.map(r => ({ id: r.path, label: r.name, status: 'pending' as const, message: '' }));
          totalLogs = [...totalLogs, ...newLogs];
          setSyncLogs([...totalLogs]);
        }

        for (const repo of repos) {
          if (currentSyncRunId.current !== runId) break;
          try {
            const msg = await invoke<string>("pull_single_repo", { path: repo.path });
            if (currentSyncRunId.current !== runId) break; // Check again after await

            if (msg === '已是最新') {
              totalLogs = totalLogs.map(l => l.id === repo.path ? { ...l, status: 'skipped', message: msg } : l);
            } else {
              totalLogs = totalLogs.map(l => l.id === repo.path ? { ...l, status: 'success', message: msg } : l);
            }
            if (isManual) setSyncLogs([...totalLogs]);
          } catch (e) {
            totalLogs = totalLogs.map(l => l.id === repo.path ? { ...l, status: 'error', message: String(e) } : l);
            if (isManual) setSyncLogs([...totalLogs]);
          }
        }

        await invoke("rescan_directory", { path: dir.path });
      } catch (e) {
        try {
          await invoke("rescan_directory", { path: dir.path });
        } catch (err) { }
      }
    }

    if (currentSyncRunId.current === runId) {
      await fetchData();
      setIsSyncingAll(false);

      if (isManual) {
        setTimeout(() => {
          if (currentSyncRunId.current === runId) {
            setSyncLogs([]);
          }
        }, 5000); // 同步完默认5秒自动隐藏
      }
    }
  };

  const filteredGroupedRepos = useMemo(() => {
    let result = groupedRepos.filter(repo => repo.skills.length > 0);
    if (selectedWorkspaceId !== "all") {
      result = result.filter(repo => repo.source_dir_id === selectedWorkspaceId);
    }
    if (activeTab !== "all") {
      result = result.filter(r => r.source_type === activeTab);
    }
    if (activeView !== "all") {
      result = result.map(repo => {
        let matchingSkills = repo.skills;
        if (activeView === "starred") {
          matchingSkills = matchingSkills.filter(s => s.is_favorite);
        } else if (activeView === "recent") {
          matchingSkills = matchingSkills.filter(s => s.use_count && s.use_count > 0).sort((a, b) => (b.use_count || 0) - (a.use_count || 0));
        } else if (activeView === "untagged") {
          matchingSkills = matchingSkills.filter(s => !s.tags || s.tags.trim() === "");
        }
        if (matchingSkills.length > 0) {
          return { ...repo, skills: matchingSkills };
        }
        return null;
      }).filter(Boolean) as GroupedRepo[];
    }
    if (selectedTag !== "all") {
      result = result.map(repo => {
        const matchingSkills = repo.skills.filter(s => s.tags?.split(',').map(t=>t.trim()).includes(selectedTag));
        if (matchingSkills.length > 0) {
          return { ...repo, skills: matchingSkills };
        }
        return null;
      }).filter(Boolean) as GroupedRepo[];
    }
    return result;
  }, [groupedRepos, selectedWorkspaceId, activeTab, selectedTag, activeView]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    groupedRepos.forEach(repo => {
      if (selectedWorkspaceId !== "all" && repo.source_dir_id !== selectedWorkspaceId) return;
      if (activeTab !== "all" && repo.source_type !== activeTab) return;
      repo.skills.forEach(skill => {
        if (skill.tags) {
          skill.tags.split(",").forEach(t => {
            const tr = t.trim();
            if (tr) tags.add(tr);
          });
        }
      });
    });
    return Array.from(tags).sort();
  }, [groupedRepos, selectedWorkspaceId, activeTab]);

  useEffect(() => {
    // If selected repo is deleted, clear selection
    if (selectedRepoId && !filteredGroupedRepos.some(r => r.id === selectedRepoId)) {
      setSelectedRepoId(null);
    }
  }, [filteredGroupedRepos, selectedRepoId]);

  // 清除检查器选中（当过滤条件变化时）
  useEffect(() => {
    setInspectorSelectedType(null);
    setSelectedRepoIds(new Set());
    setSelectedSkillIds(new Set());
    setLastSelectedRepoId(null);
    setLastSelectedSkillId(null);
  }, [selectedWorkspaceId, activeTab, selectedTag, activeView]);

  // 单击选中仓库
  const handleSelectRepo = useCallback((repo: GroupedRepo, e?: React.MouseEvent) => {
    setInspectorSelectedType('repo');
    setSelectedSkillIds(new Set());

    setSelectedRepoIds(prev => {
      const newSet = new Set(prev);
      if (e?.metaKey || e?.ctrlKey) {
        if (newSet.has(repo.id)) newSet.delete(repo.id);
        else newSet.add(repo.id);
      } else if (e?.shiftKey && lastSelectedRepoId) {
        const allIds = filteredGroupedRepos.map(r => r.id);
        const startIdx = allIds.indexOf(lastSelectedRepoId);
        const endIdx = allIds.indexOf(repo.id);
        if (startIdx !== -1 && endIdx !== -1) {
          const minIdx = Math.min(startIdx, endIdx);
          const maxIdx = Math.max(startIdx, endIdx);
          newSet.clear();
          for (let i = minIdx; i <= maxIdx; i++) {
            newSet.add(allIds[i]);
          }
        } else {
          newSet.add(repo.id);
        }
      } else {
        newSet.clear();
        newSet.add(repo.id);
      }
      return newSet;
    });

    // 只在单选或追加选时更新 anchor
    if (!e?.shiftKey) {
      setLastSelectedRepoId(repo.id);
    }
  }, [filteredGroupedRepos, lastSelectedRepoId]);

  // 单击选中技能
  const handleSelectSkill = useCallback((skill: Skill, e?: React.MouseEvent) => {
    setInspectorSelectedType('skill');
    setSelectedRepoIds(new Set());

    const visibleSkills = filteredGroupedRepos.find(r => r.id === selectedRepoId)?.skills || [];

    setSelectedSkillIds(prev => {
      const newSet = new Set(prev);
      if (e?.metaKey || e?.ctrlKey) {
        if (newSet.has(skill.id)) newSet.delete(skill.id);
        else newSet.add(skill.id);
      } else if (e?.shiftKey && lastSelectedSkillId) {
        const allIds = visibleSkills.map(s => s.id);
        const startIdx = allIds.indexOf(lastSelectedSkillId);
        const endIdx = allIds.indexOf(skill.id);
        if (startIdx !== -1 && endIdx !== -1) {
          const minIdx = Math.min(startIdx, endIdx);
          const maxIdx = Math.max(startIdx, endIdx);
          newSet.clear();
          for (let i = minIdx; i <= maxIdx; i++) {
            newSet.add(allIds[i]);
          }
        } else {
          newSet.add(skill.id);
        }
      } else {
        newSet.clear();
        newSet.add(skill.id);
      }
      return newSet;
    });

    if (!e?.shiftKey) {
      setLastSelectedSkillId(skill.id);
    }
  }, [filteredGroupedRepos, selectedRepoId, lastSelectedSkillId]);

  // 返回上一级
  const handleToggleFavorite = async (id: string) => {
    try {
      await invoke("toggle_skill_favorite", { id });
      fetchData();
    } catch (e) {
      showToast(`操作失败: ${e}`, "error");
    }
  };

  const handleGoBack = useCallback(() => {
    setSelectedRepoId(null);
    setInspectorSelectedType(null);
    setSelectedRepoIds(new Set());
    setSelectedSkillIds(new Set());
  }, []);

  // 点击空白取消选中
  const handleDeselectAll = useCallback(() => {
    if (selectedRepoId) {
      setInspectorSelectedType('repo');
      setSelectedRepoIds(new Set([selectedRepoId]));
      setSelectedSkillIds(new Set());
    } else {
      setInspectorSelectedType(null);
      setSelectedRepoIds(new Set());
      setSelectedSkillIds(new Set());
    }
  }, [selectedRepoId]);

  // 构建右键菜单项
  const buildRepoContextMenu = useCallback((repo: GroupedRepo): ContextMenuItem[] => {
    const isMulti = selectedRepoIds.has(repo.id) && selectedRepoIds.size > 1;
    const targetRepos = isMulti ? filteredGroupedRepos.filter(r => selectedRepoIds.has(r.id)) : [repo];

    return [
      {
        id: 'open_folder', label: isMulti ? `在${fileManagerName}中打开` : `在${fileManagerName}中打开`, icon: <Folder size={14} />, onClick: () => {
          targetRepos.forEach(r => invoke('open_local_folder', { path: r.path }).catch(console.error));
        }
      },
      {
        id: 'copy_path', label: isMulti ? `复制 ${targetRepos.length} 个路径` : '复制路径', icon: <Copy size={14} />, onClick: () => {
          navigator.clipboard.writeText(targetRepos.map(r => r.path).join('\n'));
          showToast(isMulti ? '多个路径已复制' : '路径已复制');
        }
      },
      { id: 'sep1', label: '', separator: true },
      ...(agents.length > 0 ? [{
        id: 'sync_to_agent',
        label: isMulti ? `将 ${targetRepos.length} 个仓库同步至 Agent` : '同步至 AI Agent',
        icon: <LinkIcon size={14} />,
        children: agents.map(agent => {
          const syncedCount = targetRepos.flatMap(r => r.skills).filter(skill => syncRecords.some(sr => sr.skill_id === skill.id && sr.agent_id === agent.id)).length;
          return {
            id: `sync_${agent.id}`,
            label: agent.display_name,
            icon: syncedCount > 0 ? <Check size={14} className="text-[var(--color-primary)]" /> : undefined,
            onClick: async () => {
              try {
                if (syncedCount > 0) {
                  for (const r of targetRepos) {
                    for (const skill of r.skills) {
                      await invoke('unsync_skill', { skillId: skill.id, agentId: agent.id });
                    }
                  }
                  showToast(isMulti ? `已批量取消同步至 ${agent.display_name}` : `已取消同步 "${repo.name}" 至 ${agent.display_name}`);
                } else {
                  for (const r of targetRepos) {
                    for (const skill of r.skills) {
                      const isAlreadySynced = syncRecords.some(sr => sr.skill_id === skill.id && sr.agent_id === agent.id);
                      if (!isAlreadySynced) await invoke('sync_skill', { skillId: skill.id, agentId: agent.id });
                    }
                  }
                  showToast(isMulti ? `已批量同步至 ${agent.display_name}` : `已同步 "${repo.name}" 至 ${agent.display_name}`);
                }
                fetchData();
              } catch (e) { showToast(`操作失败: ${e}`, 'error'); }
            }
          };
        })
      }] : []),
      { id: 'sep2', label: '', separator: true },
      {
        id: 'export',
        label: '导出',
        icon: <Download size={14} />,
        children: [
          {
            id: 'export_folder',
            label: '直接导出目录',
            icon: <Download size={14} />,
            onClick: async () => {
              try {
                const destDir = await open({ directory: true, title: isMulti ? '选择批量导出位置' : '选择导出位置', multiple: false });
                if (!destDir) return;

                if (isMulti) {
                  let conflictCount = 0;
                  try {
                    for (const r of targetRepos) {
                      if (await invoke<boolean>('check_exists', { path: `${destDir}/${r.name}` })) conflictCount++;
                    }
                  } catch (e) {
                    showToast(`检测文件冲突失败: ${e}`, 'error'); return;
                  }
                  if (conflictCount > 0) {
                    if (!(await waitConfirm(`选定的目录中已有 ${conflictCount} 个同名仓库文件夹，确定要覆盖吗？`))) return;
                  }
                  await invoke('export_batch', { sourcePaths: targetRepos.map(r => r.path), destPath: destDir, isZip: false });
                  showToast(`成功导出 ${targetRepos.length} 个仓库`);
                } else {
                  const r = targetRepos[0];
                  try {
                    if (await invoke<boolean>('check_exists', { path: `${destDir}/${r.name}` })) {
                      if (!(await waitConfirm(`导出路径下已有同名文件夹 "${r.name}"，确定要覆盖吗？`))) return;
                    }
                  } catch (e) {
                    showToast(`检测文件冲突失败: ${e}`, 'error'); return;
                  }
                  await invoke('export_batch', { sourcePaths: [r.path], destPath: destDir as string, isZip: false });
                  showToast(`仓库已导出`);
                }
              } catch (e) {
                console.error(e);
                showToast(`导出失败: ${e}`, 'error');
              }
            }
          },
          {
            id: 'export_zip',
            label: '打包为 ZIP',
            icon: <FileArchive size={14} />,
            onClick: async () => {
              try {
                const destDir = await open({ directory: true, title: isMulti ? '选择批量导出位置' : '选择导出位置', multiple: false });
                if (!destDir) return;

                const targetPath = isMulti
                  ? `${destDir}/SkillHub_Batch_${getExportTimeStr()}.zip`
                  : `${destDir}/${targetRepos[0].name}_${getExportTimeStr()}.zip`;

                try {
                  if (await invoke<boolean>('check_exists', { path: targetPath })) {
                    if (!(await waitConfirm(`导出路径下已有同名压缩包，确定要覆盖吗？`))) return;
                  }
                } catch (e) {
                  showToast(`检测文件冲突失败: ${e}`, 'error'); return;
                }
                await invoke('export_batch', { sourcePaths: targetRepos.map(r => r.path), destPath: targetPath, isZip: true });
                showToast(isMulti ? `成功打包 ${targetRepos.length} 个仓库` : `仓库 ZIP 已生成`);
              } catch (e) {
                console.error(e);
                showToast(`打包失败: ${e}`, 'error');
              }
            }
          }
        ]
      },
      { id: 'sep3', label: '', separator: true },
      { id: 'update', label: isMulti ? `批量更新仓库` : '更新仓库', icon: <RefreshCw size={14} />, onClick: (e?: any) => handleUpdateRepos(e || ({ stopPropagation: () => { } } as any), targetRepos) },
      { id: 'sep4', label: '', separator: true },
      { id: 'delete', label: isMulti ? `批量删除` : '删除', icon: <Trash2 size={14} />, danger: true, onClick: (e?: any) => handleDeleteRepos(e || ({ stopPropagation: () => { } } as any), targetRepos) },
    ];
  }, [agents, syncRecords, selectedRepoIds, filteredGroupedRepos, waitConfirm]);

  // 智能引用提示词：打开预览弹窗并生成内容
  const handleGeneratePrompt = useCallback(async (skill: Skill) => {
    setPromptModal({ isOpen: true, skillName: skill.name, content: '', loading: true });
    try {
      const prompt = await invoke<string>('generate_skill_reference_prompt', { skillId: skill.id });
      setPromptModal(prev => ({ ...prev, content: prompt, loading: false }));
    } catch (e) {
      setPromptModal(prev => ({ ...prev, content: `生成失败: ${e}`, loading: false }));
    }
  }, []);

  const buildSkillContextMenu = useCallback((skill: Skill): ContextMenuItem[] => {
    const isMulti = selectedSkillIds.has(skill.id) && selectedSkillIds.size > 1;

    // 从所有可见的 skill 中筛选出当前选中的 skills
    const visibleSkills = filteredGroupedRepos.find(r => r.id === selectedRepoId)?.skills || [];
    const targetSkills = isMulti ? visibleSkills.filter(s => selectedSkillIds.has(s.id)) : [skill];

    return [
      { id: 'view_doc', label: isMulti ? `无法批量查看文档` : '查看文档', icon: <Search size={14} />, onClick: () => { if (!isMulti) { setSelectedSkill(skill); setIsDrawerOpen(true); } } },
      {
        id: 'generate_prompt', label: isMulti ? `无法批量生成提示词` : '智能引用提示词', icon: <Sparkles size={14} />, onClick: () => {
          if (!isMulti) handleGeneratePrompt(skill);
        }
      },
      {
        id: 'open_default', label: `用默认应用打开`, icon: <Folder size={14} />, onClick: () => {
          targetSkills.forEach(s => invoke('open_local_folder', { path: s.local_path }).catch(console.error));
        }
      },
      ...(openWithApps.length > 0 ? [{
        id: 'open_with_other', label: `在其它应用打开`, icon: <Folder size={14} />,
        children: openWithApps.map((app, index) => ({
          id: `open_with_${index}`,
          label: app.name,
          icon: app.icon_base64 ? <img src={`data:image/png;base64,${app.icon_base64}`} className="w-3.5 h-3.5 object-contain" /> : undefined,
          onClick: () => {
            targetSkills.forEach(s => invoke('open_with_app', { file_path: s.local_path, app_path: app.path }).catch(console.error));
          }
        }))
      }] : []),
      {
        id: 'reveal_finder', label: `在${fileManagerName}中显示`, icon: <Folder size={14} />, onClick: () => {
          targetSkills.forEach(s => invoke('reveal_in_finder', { path: s.local_path }).catch(console.error));
        }
      },
      {
        id: 'copy_path', label: isMulti ? `复制 ${targetSkills.length} 个路径` : '复制路径', icon: <Copy size={14} />, onClick: () => {
          navigator.clipboard.writeText(targetSkills.map(s => s.local_path).join('\n'));
          showToast(isMulti ? '多个路径已复制' : '路径已复制');
        }
      },
      ...(agents.length > 0 ? [
        { id: 'sep1', label: '', separator: true },
        {
          id: 'sync_to_agent',
          label: isMulti ? `将 ${targetSkills.length} 个技能同步至 Agent` : '同步至 AI Agent',
          icon: <LinkIcon size={14} />,
          children: agents.map(agent => {
            const syncedCount = targetSkills.filter(s => syncRecords.some(sr => sr.skill_id === s.id && sr.agent_id === agent.id)).length;
            return {
              id: `sync_${agent.id}`,
              label: agent.display_name,
              icon: syncedCount > 0 ? <Check size={14} className="text-[var(--color-primary)]" /> : undefined,
              onClick: async () => {
                try {
                  if (syncedCount > 0) {
                    for (const s of targetSkills) {
                      await invoke('unsync_skill', { skillId: s.id, agentId: agent.id });
                    }
                    showToast(isMulti ? `已批量取消同步至 ${agent.display_name}` : `已取消同步至 ${agent.display_name}`);
                  } else {
                    for (const s of targetSkills) {
                      const isAlreadySynced = syncRecords.some(sr => sr.skill_id === s.id && sr.agent_id === agent.id);
                      if (!isAlreadySynced) await invoke('sync_skill', { skillId: s.id, agentId: agent.id });
                    }
                    showToast(isMulti ? `已批量同步至 ${agent.display_name}` : `已同步至 ${agent.display_name}`);
                  }
                  fetchData();
                } catch (e) { showToast(`操作失败: ${e}`, 'error'); }
              }
            };
          })
        }
      ] : []),
    ];
  }, [agents, selectedSkillIds, filteredGroupedRepos, selectedRepoId, syncRecords]);

  const selectedWorkspaceDir = directories.find(d => d.id === selectedWorkspaceId);

  const buildEmptyContextMenu = useCallback((): ContextMenuItem[] => {
    return [
      {
        id: 'sync-all',
        label: '同步当前技能库',
        icon: <RefreshCw size={14} />,
        onClick: () => handleSyncAll(true, directories.filter(d => d.id === selectedWorkspaceId))
      },
      {
        id: 'add-skill',
        label: '添加技能',
        icon: <Plus size={14} />,
        children: [
          {
            id: 'add-local',
            label: '导入本地技能',
            icon: <HardDrive size={14} />,
            onClick: () => openAddDialog("local")
          },
          {
            id: 'add-github',
            label: '克隆 GitHub 库',
            icon: <Globe size={14} />,
            onClick: () => openAddDialog("github")
          },
          {
            id: 'add-online',
            label: '收藏线上地址',
            icon: <LinkIcon size={14} />,
            onClick: () => openAddDialog("online")
          }
        ]
      },
      { separator: true, id: 's1', label: '' },
      {
        id: 'select-all',
        label: '全选',
        icon: <CheckSquare size={14} />,
        onClick: () => {
          if (selectedRepoId) {
            // Select all skills
            const repo = filteredGroupedRepos.find(r => r.id === selectedRepoId);
            if (repo) {
              setSelectedSkillIds(new Set(repo.skills.map(s => s.id)));
              setInspectorSelectedType('skill');
            }
          } else {
            // Select all repos
            setSelectedRepoIds(new Set(filteredGroupedRepos.map(r => r.id)));
            setInspectorSelectedType('repo');
          }
        }
      },
      { separator: true, id: 's2', label: '' },
      {
        id: 'reveal-workspace',
        label: `在${fileManagerName}中显示技能库`,
        icon: <Folder size={14} />,
        disabled: !selectedWorkspaceDir || selectedWorkspaceDir.is_missing,
        onClick: async () => {
          if (selectedWorkspaceDir && !selectedWorkspaceDir.is_missing) {
            try {
              await revealItemInDir(selectedWorkspaceDir.path);
            } catch (e) {
              console.error(`Failed to reveal path ${selectedWorkspaceDir.path}:`, e);
            }
          }
        }
      }
    ];
  }, [directories, selectedWorkspaceId, filteredGroupedRepos, selectedRepoId, selectedWorkspaceDir]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchModalOpen(true);
      }
      if (activeModule !== 'skills') return;
      // Esc 取消选中或取消删除对话框
      if (e.key === 'Escape') {
        if (deleteConfirmRepos) {
          e.preventDefault();
          setDeleteConfirmRepos(null);
          return;
        }
        if (!isDrawerOpen && !isAddDialogOpen && !isSettingsOpen && !isSearchModalOpen) {
          if (inspectorSelectedType) {
            handleDeselectAll();
          } else if (selectedRepoId) {
            setSelectedRepoId(null);
          }
        }
      }

      // 方向键导航
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !isDrawerOpen && !isAddDialogOpen && !isSettingsOpen && !isSearchModalOpen && !isInput) {
        if (inspectorSelectedType === 'skill' && selectedSkillIds.size === 1) {
          e.preventDefault();
          const currentId = Array.from(selectedSkillIds)[0];
          const currentEl = document.querySelector(`[data-skill-id="${currentId}"]`);
          if (currentEl) {
            const allEls = Array.from(document.querySelectorAll('[data-skill-id]'));
            const nextEl = getNextElement(currentEl, e.key, allEls);
            if (nextEl) {
              const nextId = nextEl.getAttribute('data-skill-id');
              if (nextId) {
                const nextSkill = filteredGroupedRepos.flatMap(r => r.skills).find(s => s.id === nextId);
                if (nextSkill) {
                  setSelectedSkillIds(new Set([nextId]));
                  setLastSelectedSkillId(nextId);
                  nextEl.scrollIntoView({ block: 'nearest' });
                }
              }
            }
          }
        } else if (inspectorSelectedType === 'repo' && selectedRepoIds.size === 1) {
          e.preventDefault();
          const currentId = Array.from(selectedRepoIds)[0];
          const currentEl = document.querySelector(`[data-repo-id="${currentId}"]`);
          if (currentEl) {
            const allEls = Array.from(document.querySelectorAll('[data-repo-id]'));
            const nextEl = getNextElement(currentEl, e.key, allEls);
            if (nextEl) {
              const nextId = nextEl.getAttribute('data-repo-id');
              if (nextId) {
                const nextRepo = filteredGroupedRepos.find(r => r.id === nextId);
                if (nextRepo) {
                  setSelectedRepoIds(new Set([nextId]));
                  setLastSelectedRepoId(nextId);
                  nextEl.scrollIntoView({ block: 'nearest' });
                }
              }
            }
          }
        }
      }

      // Enter 确认删除 / 双击卡片
      if (e.key === 'Enter') {
        if (deleteConfirmRepos) {
          e.preventDefault();
          confirmDeleteRepos();
          return;
        }
        if (!isDrawerOpen && !isAddDialogOpen && !isSettingsOpen && !isSearchModalOpen && !isInput) {
          if (inspectorSelectedType === 'skill' && selectedSkillIds.size === 1) {
             e.preventDefault();
             const currentId = Array.from(selectedSkillIds)[0];
             const skill = filteredGroupedRepos.flatMap(r => r.skills).find(s => s.id === currentId);
             if (skill) {
               setSelectedSkill(skill);
               setIsDrawerOpen(true);
             }
          } else if (inspectorSelectedType === 'repo' && selectedRepoIds.size === 1) {
             e.preventDefault();
             const currentId = Array.from(selectedRepoIds)[0];
             const repo = filteredGroupedRepos.find(r => r.id === currentId);
             if (repo) {
               setSelectedRepoId(repo.id);
               setInspectorSelectedType('repo');
               setSelectedRepoIds(new Set([repo.id]));
               setSelectedSkillIds(new Set());
             }
          }
        }
      }

      // Delete / Backspace 删除选中项
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!isInput && !isDrawerOpen && !isAddDialogOpen && !isSettingsOpen && !isSearchModalOpen && !deleteConfirmRepos) {
          if (selectedRepoIds.size > 0 && inspectorSelectedType === 'repo') {
            e.preventDefault();
            const reposToDelete = filteredGroupedRepos.filter(r => selectedRepoIds.has(r.id));
            handleDeleteRepos({ stopPropagation: () => {} } as any, reposToDelete);
          } else if (selectedRepoId && !inspectorSelectedType) {
            e.preventDefault();
            const repoToDelete = filteredGroupedRepos.find(r => r.id === selectedRepoId);
            if (repoToDelete) {
              handleDeleteRepos({ stopPropagation: () => {} } as any, [repoToDelete]);
            }
          }
        }
      }
    };

    let isRescanning = false;
    const handleFocus = async () => {
      if (isRescanning) return;
      isRescanning = true;
      try {
        const dirs = await invoke<SourceDirectory[]>("get_source_directories");
        if (dirs && dirs.length > 0) {
          for (const d of dirs) {
            await invoke("rescan_directory", { path: d.path }).catch(() => {});
          }
        }
        await fetchData();
      } catch (e) {
        console.error("Focus rescan failed", e);
      } finally {
        isRescanning = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('focus', handleFocus);
    };
  }, [
    inspectorSelectedType, 
    selectedRepoId, 
    isDrawerOpen, 
    isAddDialogOpen, 
    isSettingsOpen, 
    isSearchModalOpen, 
    handleDeselectAll,
    selectedRepoIds,
    filteredGroupedRepos,
    deleteConfirmRepos,
    confirmDeleteRepos,
    selectedSkillIds
  ]);

  const isFlatView = activeView !== "all" || selectedTag !== "all";

  const getHeaderTitle = () => {
    if (isFlatView) {
      if (selectedTag !== "all") return `标签: ${selectedTag}`;
      if (activeView === "starred") return "星标技能";
      if (activeView === "recent") return "最近使用";
      if (activeView === "untagged") return "未标签技能";
    }
    const wsLabel = directories.find(d => d.id === selectedWorkspaceId)?.label || "未知技能库";
    if (selectedRepoId && !isFlatView) {
      return (
        <>
          <span className="text-[var(--color-muted)] cursor-pointer hover:text-[var(--foreground)] transition-colors" onClick={handleGoBack}>
            {wsLabel}
          </span>
          <ChevronRight className="w-4 h-4 mx-2 text-[var(--color-muted)] opacity-50" />
          <span>{filteredGroupedRepos.find(r => r.id === selectedRepoId)?.name}</span>
        </>
      );
    }
    return wsLabel;
  };

  return (
    <div className="flex h-screen w-full bg-transparent text-[var(--foreground)] overflow-hidden font-sans">

      <div className="w-64 bg-white/70 backdrop-blur-xl flex flex-col h-full shrink-0 relative z-20 text-[13px] border-r border-black/[0.05]">
        <div data-tauri-drag-region className="h-10 w-full shrink-0"></div>

        {/* 模块 Tab 导航与全局搜索 */}
        <div className="px-3 pb-3 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-1 p-1 rounded-lg bg-black/[0.04]">
            {([
              { id: 'skills' as AppModule, label: '技能', icon: Puzzle },
              { id: 'prompts' as AppModule, label: '提示词', icon: MessageSquareText },
              { id: 'resources' as AppModule, label: '资源', icon: Store },
            ]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveModule(tab.id)}
                className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded-md transition-all duration-200 outline-none select-none ${
                  activeModule === tab.id
                    ? 'bg-white text-[var(--foreground)] font-semibold shadow-sm flex-1'
                    : 'text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/[0.04]'
                }`}
              >
                <tab.icon className="w-4 h-4 shrink-0" />
                {activeModule === tab.id && (
                  <span className="text-[14px] truncate animate-in fade-in slide-in-from-left-1 duration-200">{tab.label}</span>
                )}
              </button>
            ))}
          </div>
          <Tooltip content="全局搜索 (⌘K)">
            <button
              onClick={() => setIsSearchModalOpen(true)}
              className="p-2 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/[0.06] transition-colors shrink-0"
            >
              <Search className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>

        {activeModule === 'skills' ? (
          <>
            {/* Workspace Switcher */}
            <SkillLibrarySelector
              ref={skillLibrarySelectorRef}
              directories={directories}
              selectedId={selectedWorkspaceId}
              onSelect={handleWorkspaceSelect}
              onDirectoriesChange={fetchData}
              onCreateLibrary={() => setIsCreateModalOpen(true)}
              onOpenLibrary={() => setIsOpenModalOpen(true)}
              onMergeLibrary={() => setIsMergeModalOpen(true)}
            />


            <div className="flex-1 overflow-y-auto">
              <div className="px-3 mb-5 mt-2 space-y-0.5">
                <button
                  onClick={() => { setActiveView("all"); setSelectedTag("all"); }}
                  className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md transition-colors outline-none select-none ${activeView === "all" && selectedTag === "all" ? "bg-black/5 text-[var(--foreground)] font-semibold" : "text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] font-medium"}`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span>全部技能</span>
                </button>
                <button
                  onClick={() => { setActiveView("starred"); setSelectedTag("all"); }}
                  className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md transition-colors outline-none select-none ${activeView === "starred" ? "bg-black/5 text-[var(--foreground)] font-semibold" : "text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] font-medium"}`}
                >
                  <Star className="w-4 h-4" />
                  <span>星标</span>
                </button>
                <button
                  onClick={() => { setActiveView("recent"); setSelectedTag("all"); }}
                  className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md transition-colors outline-none select-none ${activeView === "recent" ? "bg-black/5 text-[var(--foreground)] font-semibold" : "text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] font-medium"}`}
                >
                  <Clock className="w-4 h-4" />
                  <span>最近使用</span>
                </button>
                <button
                  onClick={() => { setActiveView("untagged"); setSelectedTag("all"); }}
                  className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md transition-colors outline-none select-none ${activeView === "untagged" ? "bg-black/5 text-[var(--foreground)] font-semibold" : "text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] font-medium"}`}
                >
                  <Tag className="w-4 h-4" />
                  <span>未标签</span>
                </button>
              </div>

              <div className="px-3 mb-5">
                <h3 className="text-[11px] font-semibold text-[var(--color-muted)]/60 mb-1 px-2">
                  标签
                </h3>
                <div className="space-y-0.5">
                  {allTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => { setSelectedTag(tag); setActiveView("all"); }}
                      className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md transition-colors outline-none select-none ${selectedTag === tag && activeView === "all"
                          ? "bg-black/5 text-[var(--foreground)] font-semibold"
                          : "text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] font-medium"
                        }`}
                    >
                      <Tag className="w-3.5 h-3.5 opacity-70" />
                      <span className="truncate">{tag}</span>
                    </button>
                  ))}
                  {allTags.length === 0 && (
                    <div className="text-[11px] text-[var(--color-muted)]/50 px-2 py-1">暂无标签</div>
                  )}
                </div>
              </div>

              <div className="px-3 mb-5">
                <h3 className="text-[11px] font-semibold text-[var(--color-muted)]/60 mb-1 px-2">
                  数据源
                </h3>
                <div className="space-y-0.5">
                  <button
                    className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md transition-colors outline-none select-none ${activeTab === "all" ? "bg-black/5 text-[var(--foreground)] font-semibold" : "text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 font-medium"
                      }`}
                    onClick={() => setActiveTab("all")}
                  >
                    <FolderSearch className="w-4 h-4" />
                    <span>所有技能</span>
                  </button>
                  <button
                    className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md transition-colors outline-none select-none ${activeTab === "local" ? "bg-black/5 text-[var(--foreground)] font-semibold" : "text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 font-medium"
                      }`}
                    onClick={() => setActiveTab("local")}
                  >
                    <HardDrive className="w-4 h-4" />
                    <span>本地技能</span>
                  </button>
                  <button
                    className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md transition-colors outline-none select-none ${activeTab === "github" ? "bg-black/5 text-[var(--foreground)] font-semibold" : "text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 font-medium"
                      }`}
                    onClick={() => setActiveTab("github")}
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.24c3-.3 6-1.5 6-6.76a5.5 5.5 0 0 0-1.5-3.8 5.1 5.1 0 0 0-.1-3.8s-1.2-.4-3.9 1.4a13.4 13.4 0 0 0-7 0C6.3 2.4 5.1 2.8 5.1 2.8a5.1 5.1 0 0 0-.1 3.8 5.5 5.5 0 0 0-1.5 3.8c0 5.2 3 6.4 6 6.76a4.8 4.8 0 0 0-1 3.24v4" />
                    </svg>
                    <span>Github技能</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto px-0">
            {activeModule === 'prompts' && (
              <PromptSidebarNav
                filter={promptFilter}
                groups={promptGroups}
                onFilterChange={setPromptFilter}
                onCreateGroup={() => setIsCreateGroupOpen(true)}
                isCreateGroupOpen={isCreateGroupOpen}
                onCreateGroupClose={() => setIsCreateGroupOpen(false)}
                onGroupSaved={() => setPromptRefreshKey(k => k + 1)}
              />
            )}
          </div>
        )}

        <div className="p-3 mt-auto">
          <button onClick={() => setIsSettingsOpen(true)} className="w-full flex items-center space-x-2 px-2 py-1.5 rounded-md font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors outline-none select-none active:scale-[0.98]">
            <Settings className="w-4 h-4" />
            <span>设置</span>
          </button>
          <button onClick={() => setIsAboutOpen(true)} className="w-full flex items-center space-x-2 px-2 py-1.5 rounded-md font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors outline-none select-none active:scale-[0.98]">
            <Info className="w-4 h-4" />
            <span>关于</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex h-full min-w-0 bg-transparent relative">
        {activeModule === 'skills' ? (
          <>
            <div className="flex-1 flex flex-col h-full min-w-0 bg-transparent relative">
          <div data-tauri-drag-region className="h-16 border-b border-[var(--color-border)] bg-white/70 backdrop-blur-xl flex items-center justify-between px-8 shrink-0 relative z-0">
            <div className="flex items-center space-x-3">
              {selectedRepoId && !isFlatView && (
                <button onClick={handleGoBack} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] transition-colors mr-1">
                  <ChevronLeft className="w-5 h-5 text-[var(--color-muted)]" />
                </button>
              )}
              <h1 className="text-xl font-medium tracking-tight text-[var(--foreground)] flex items-center">
                {getHeaderTitle()}
              </h1>
            </div>
            <div className="flex items-center space-x-3">
              <button onClick={() => handleSyncAll(true, directories.filter(d => d.id === selectedWorkspaceId))} disabled={isSyncingAll} className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md font-medium text-[13px] text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-all disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${isSyncingAll ? 'animate-spin text-[var(--color-primary)]' : ''}`} />
                <span>{isSyncingAll ? '正在同步...' : '同步当前库'}</span>
              </button>
              <button onClick={handleAddRepo} className="flex items-center space-x-1.5 bg-blue-500 text-white px-3 py-1.5 rounded-md text-[13px] font-medium hover:bg-blue-600 shadow-sm shadow-blue-500/20 transition-all ml-2">
                <Plus className="w-4 h-4" />
                <span>添加技能</span>
              </button>
            </div>
          </div>

          <div
            ref={mainContentRef}
            className="flex-1 overflow-y-auto p-6 relative z-0 bg-[var(--color-background)]"
            onClick={(e) => { if (e.target === e.currentTarget) handleDeselectAll(); }}
            onContextMenu={(e) => {
              // Because cards call stopPropagation(), this only fires for blank space
              showContextMenu(e, { type: 'empty', data: null });
            }}
          >

            {isFileDraggingOver && (
              <div className="absolute inset-0 z-50 m-6 flex flex-col items-center justify-end pb-10 bg-[var(--color-primary)]/5 border-4 border-dashed border-[var(--color-primary)] rounded-xl pointer-events-none transition-all duration-200 backdrop-blur-[2px]">
                 <div className="bg-[var(--color-primary)] text-white px-6 py-3 rounded-full font-medium shadow-lg flex items-center space-x-2 animate-bounce">
                    <Folder className="w-5 h-5" />
                    <span>将文件拖放到这里进行添加</span>
                 </div>
              </div>
            )}

            {selectedWorkspaceDir?.is_missing ? (
              <div className="flex flex-col items-center justify-center h-full text-[var(--color-muted)] animate-in fade-in duration-500">
                <div className="w-32 h-32 mb-6 relative group">
                  <div className="relative bg-white/60 backdrop-blur-xl rounded-3xl p-8 flex items-center justify-center">
                    <FolderX className="w-12 h-12 text-red-500 drop-shadow-sm relative z-10" />
                  </div>
                </div>
                <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2 tracking-tight">无法载入当前资源库</h2>
                <p className="text-sm text-[var(--color-muted)] mb-4 text-center whitespace-nowrap overflow-hidden text-ellipsis">
                  找不到资源库的路径，可能已被移动、重命名或从磁盘中删除。
                </p>
                <div className="text-[13px] text-[var(--color-muted)] font-mono bg-black/5 px-3 py-1.5 rounded mb-8 truncate max-w-[400px] w-full text-center">
                  {selectedWorkspaceDir.path}
                </div>
                <div className="flex flex-col items-center gap-3 w-full max-w-[280px]">
                  <button
                    onClick={async () => {
                      setIsRetryingMissing(true);
                      await fetchData();
                      setTimeout(() => setIsRetryingMissing(false), 500);
                    }}
                    disabled={isRetryingMissing}
                    className="flex items-center justify-center gap-2 w-full px-6 py-2.5 bg-white border border-[var(--color-border)] hover:bg-black/5 text-[var(--foreground)] font-medium rounded-lg transition-colors shadow-sm disabled:opacity-70"
                  >
                    <RefreshCw className={`w-4 h-4 ${isRetryingMissing ? 'animate-spin' : ''}`} />
                    {isRetryingMissing ? '正在检测...' : '再试一次'}
                  </button>
                  <button
                    onClick={() => skillLibrarySelectorRef.current?.openDropdown()}
                    className="flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors w-full shadow-sm"
                  >
                    <FolderSearch className="w-4 h-4" />
                    切换其他资源库
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await invoke('remove_source_directory', { id: selectedWorkspaceDir.id, deleteLocal: false });
                        const nextDir = directories.find(d => d.id !== selectedWorkspaceDir.id && !d.is_missing) || directories.find(d => d.id !== selectedWorkspaceDir.id);
                        handleWorkspaceSelect(nextDir ? nextDir.id : null);
                        await fetchData();
                      } catch (e) { console.error(e); }
                    }}
                    className="flex items-center justify-center gap-2 w-full px-6 py-2.5 bg-transparent hover:bg-red-50 text-red-500 font-medium rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    移除记录
                  </button>
                </div>
              </div>
            ) : filteredGroupedRepos.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[var(--color-muted)] animate-in fade-in duration-500">
                <div className="w-32 h-32 mb-6 relative group">
                  <div className="relative bg-white/60 backdrop-blur-xl rounded-3xl p-8 flex items-center justify-center">
                    <HardDrive className="w-12 h-12 text-blue-400 drop-shadow-sm relative z-10" />
                  </div>
                </div>
                <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2 tracking-tight">空空如也，拖放技能到这里</h2>
                <p className="text-sm text-[var(--color-muted)] mb-8 text-center max-w-sm leading-relaxed">
                  你可以一次拖拽多个文件到这里添加，也可以通过下方按钮导入本地或云端技能库
                </p>
                <div className="flex items-center justify-center space-x-4 mt-2">
                  {/* 本地导入 */}
                  <button 
                    onClick={() => openAddDialog("local")}
                    className="flex items-center px-4 py-1.5 bg-white border border-[var(--color-border)] rounded-lg hover:border-[var(--color-primary)] hover:shadow-sm transition-all group"
                  >
                    <HardDrive className="w-4 h-4 text-[var(--color-muted)] group-hover:text-[var(--color-primary)] transition-colors mr-2.5" />
                    <span className="text-[13px] font-medium text-[var(--foreground)] group-hover:text-[var(--color-primary)] transition-colors">导入本地技能</span>
                  </button>

                  {/* GitHub 克隆 */}
                  <button 
                    onClick={() => openAddDialog("github")}
                    className="flex items-center px-4 py-1.5 bg-white border border-[var(--color-border)] rounded-lg hover:border-[var(--color-primary)] hover:shadow-sm transition-all group"
                  >
                    <svg className="w-4 h-4 text-[var(--color-muted)] group-hover:text-[var(--color-primary)] transition-colors mr-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.24c3-.3 6-1.5 6-6.76a5.5 5.5 0 0 0-1.5-3.8 5.1 5.1 0 0 0-.1-3.8s-1.2-.4-3.9 1.4a13.4 13.4 0 0 0-7 0C6.3 2.4 5.1 2.8 5.1 2.8a5.1 5.1 0 0 0-.1 3.8 5.5 5.5 0 0 0-1.5 3.8c0 5.2 3 6.4 6 6.76a4.8 4.8 0 0 0-1 3.24v4" />
                    </svg>
                    <span className="text-[13px] font-medium text-[var(--foreground)] group-hover:text-[var(--color-primary)] transition-colors">克隆 GitHub 库</span>
                  </button>

                  {/* 线上地址收藏 */}
                  <button 
                    onClick={() => openAddDialog("online")}
                    className="flex items-center px-4 py-1.5 bg-white border border-[var(--color-border)] rounded-lg hover:border-[var(--color-primary)] hover:shadow-sm transition-all group"
                  >
                    <Globe className="w-4 h-4 text-[var(--color-muted)] group-hover:text-[var(--color-primary)] transition-colors mr-2.5" />
                    <span className="text-[13px] font-medium text-[var(--foreground)] group-hover:text-[var(--color-primary)] transition-colors">收藏线上地址</span>
                  </button>
                </div>
              </div>
            ) : !selectedRepoId && !isFlatView ? (
              <SelectionArea
                onBeforeStart={({ event }: SelectionEvent) => {
                  if ((event?.target as Element)?.closest?.('[data-id]')) return false;
                  return true;
                }}
                onStart={({ event, selection }: SelectionEvent) => {
                  if (!event?.ctrlKey && !event?.metaKey && !event?.shiftKey) {
                    selection.clearSelection();
                    setSelectedRepoIds(new Set());
                  }
                }}
                onMove={({ store: { changed: { added, removed } } }: SelectionEvent) => {
                  isDraggingRef.current = true;
                  setSelectedRepoIds(prev => {
                    const next = new Set(prev);
                    added.forEach((el: Element) => {
                      const id = el.getAttribute('data-id');
                      if (id) next.add(id);
                    });
                    removed.forEach((el: Element) => {
                      const id = el.getAttribute('data-id');
                      if (id) next.delete(id);
                    });
                    return next;
                  });
                  setInspectorSelectedType('repo');
                }}
                onStop={() => { setTimeout(() => { isDraggingRef.current = false; }, 0); }}
                selectables="[data-id]"
                className="w-full"
              >
                <div className="grid gap-3 content-start pb-20" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }} onClick={(e) => { if (e.target === e.currentTarget && !isDraggingRef.current) handleDeselectAll(); }}>
                  {cloningRepos.map((repo, idx) => (
                    <div key={`cloning-${idx}`} className="group bg-[var(--color-muted-bg)]/30 backdrop-blur-md rounded-xl p-4 border border-dashed border-[var(--color-border)] shadow-sm flex flex-col h-24 animate-pulse">
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 rounded-lg bg-[var(--color-muted-bg)] flex items-center justify-center shrink-0">
                          <div className="w-4 h-4 border-2 border-[var(--color-muted)] border-t-transparent rounded-full animate-spin"></div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-[13px] font-semibold text-[var(--foreground)] truncate" title={repo.name}>{repo.name}</h3>
                          <span className="text-[10px] text-[var(--color-muted)]">正在拉取...</span>
                        </div>
                        <Tooltip content="取消拉取">
                          <button onClick={(e) => handleCancelClone(e, repo.path)} className="p-1 rounded text-[var(--color-muted)] hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                  ))}
                  {filteredGroupedRepos.map((repo) => (
                    <RepoCard
                      key={repo.id}
                      repo={repo}
                      syncRecords={syncRecords}
                      agents={agents}
                      isSelected={inspectorSelectedType === 'repo' && selectedRepoIds.has(repo.id)}
                      onClick={(e) => handleSelectRepo(repo, e)}
                      onDoubleClick={() => {
                        setSelectedRepoId(repo.id);
                        setInspectorSelectedType('repo');
                        setSelectedRepoIds(new Set([repo.id]));
                        setSelectedSkillIds(new Set());
                      }}
                      onContextMenu={(e) => {
                        if (!selectedRepoIds.has(repo.id)) handleSelectRepo(repo, e);
                        showContextMenu(e, { type: 'repo', data: repo });
                      }}
                      onUpdateRepo={(e, r) => handleUpdateRepos(e, [r])}
                      onDeleteRepo={(e, r) => handleDeleteRepos(e, [r])}
                    />
                  ))}
                </div>
              </SelectionArea>
            ) : (
              <SelectionArea
                onBeforeStart={({ event }: SelectionEvent) => {
                  if ((event?.target as Element)?.closest?.('[data-id]')) return false;
                  return true;
                }}
                onStart={({ event, selection }: SelectionEvent) => {
                  if (!event?.ctrlKey && !event?.metaKey && !event?.shiftKey) {
                    selection.clearSelection();
                    setSelectedSkillIds(new Set());
                  }
                }}
                onMove={({ store: { changed: { added, removed } } }: SelectionEvent) => {
                  isDraggingRef.current = true;
                  setSelectedSkillIds(prev => {
                    const next = new Set(prev);
                    added.forEach((el: Element) => {
                      const id = el.getAttribute('data-id');
                      if (id) next.add(id);
                    });
                    removed.forEach((el: Element) => {
                      const id = el.getAttribute('data-id');
                      if (id) next.delete(id);
                    });
                    return next;
                  });
                  setInspectorSelectedType('skill');
                }}
                onStop={() => { setTimeout(() => { isDraggingRef.current = false; }, 0); }}
                selectables="[data-id]"
                className="w-full"
              >
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }} onClick={(e) => { if (e.target === e.currentTarget && !isDraggingRef.current) handleDeselectAll(); }}>
                  {(() => {
                    const skillsToRender = isFlatView 
                      ? filteredGroupedRepos.flatMap(r => r.skills)
                      : filteredGroupedRepos.find(r => r.id === selectedRepoId)?.skills || [];
                    
                    return skillsToRender.map((skill) => (
                      <SkillCard
                        key={skill.id}
                      skill={skill}
                      syncRecords={syncRecords}
                      agents={agents}
                      isSelected={inspectorSelectedType === 'skill' && selectedSkillIds.has(skill.id)}
                      onClick={(e) => handleSelectSkill(skill, e)}
                      onDoubleClick={() => { setSelectedSkill(skill); setIsDrawerOpen(true); }}
                      onContextMenu={(e) => {
                        if (!selectedSkillIds.has(skill.id)) handleSelectSkill(skill, e);
                        showContextMenu(e, { type: 'skill', data: skill });
                      }}
                      onFavoriteToggle={(_, s) => handleToggleFavorite(s.id)}
                    />
                  ));
                  })()}
                </div>
              </SelectionArea>
            )}
          </div>

          {/* Sync Progress Panel */}
          {syncLogs.length > 0 && (
            <div
              className={`absolute bottom-8 right-8 bg-white/90 backdrop-blur-xl border border-[var(--color-border)] rounded-2xl shadow-2xl transition-all duration-300 z-50 ${isSyncPopupMinimized ? 'w-auto p-3 flex items-center space-x-3 cursor-pointer hover:bg-white hover:scale-105' : 'w-80 p-4'}`}
              onClick={() => { if (isSyncPopupMinimized) setIsSyncPopupMinimized(false); }}
            >
              {isSyncPopupMinimized ? (
                <>
                  <RefreshCw className={`w-5 h-5 ${isSyncingAll ? 'animate-spin text-[var(--color-primary)]' : 'text-green-500'}`} />
                  <div className="flex flex-col pr-2">
                    <span className="text-sm font-medium text-[var(--foreground)]">{isSyncingAll ? "正在同步更新..." : "同步完成"}</span>
                    <span className="text-[10px] text-[var(--color-muted)]">{syncLogs.length} 仓库 ({syncLogs.filter(l => l.status === 'success').length} 同步, {syncLogs.filter(l => l.status === 'error').length} 失败)</span>
                  </div>
                  <button onClick={(e) => {
                    e.stopPropagation();
                    if (isSyncingAll) {
                      currentSyncRunId.current = 0;
                      setIsSyncingAll(false);
                    }
                    setSyncLogs([]);
                  }} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors ml-2 border-l border-[var(--color-border)] rounded-none pl-2">
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <div className="flex justify-between items-center mb-3 text-sm">
                    <span className="font-medium text-[var(--foreground)] flex items-center">
                      <RefreshCw className={`w-4 h-4 mr-2 ${isSyncingAll ? 'animate-spin text-[var(--color-primary)]' : 'text-green-500'}`} />
                      {isSyncingAll ? "正在同步更新..." : "同步完成"}
                    </span>
                    <div className="flex items-center">
                      <Tooltip content="最小化">
                        <button onClick={(e) => { e.stopPropagation(); setIsSyncPopupMinimized(true); }} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors mr-1">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        </button>
                      </Tooltip>
                      <Tooltip content="停止/关闭">
                        <button onClick={(e) => {
                          e.stopPropagation();
                          if (isSyncingAll) {
                            currentSyncRunId.current = 0;
                            setIsSyncingAll(false);
                          }
                          setSyncLogs([]);
                        }} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </Tooltip>
                    </div>
                  </div>

                  <div className="text-[10px] text-[var(--color-muted)] mb-3 pb-2 border-b border-[var(--color-border)]">
                    共 {syncLogs.length} 个仓库 <span className="text-green-500 font-semibold ml-1">同步 {syncLogs.filter(l => l.status === 'success').length}</span> <span className="text-gray-500 font-semibold ml-1">跳过 {syncLogs.filter(l => l.status === 'skipped').length}</span> <span className="text-red-500 font-semibold ml-1">失败 {syncLogs.filter(l => l.status === 'error').length}</span>
                  </div>

                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-5 custom-scrollbar">
                    {syncLogs.map(log => (
                      <div key={log.id} className="flex items-center justify-between text-xs py-0.5 pr-2">
                        <span className="text-[var(--color-muted)] truncate flex-1 mr-3" title={log.label}>{log.label}</span>
                        {log.status === 'pending' && <span className="text-blue-500 font-medium shrink-0 animate-pulse">正在扫描...</span>}
                        {log.status === 'success' && <span className="text-green-500 font-medium shrink-0 text-right w-16 truncate">{log.message || '更新成功'}</span>}
                        {log.status === 'skipped' && <span className="text-gray-500 font-medium shrink-0 text-right w-16 truncate">{log.message || '已跳过'}</span>}
                        {log.status === 'error' && <span className="text-red-500 font-medium shrink-0 truncate max-w-[80px] text-right" title={log.message}>更新失败</span>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <InspectorPanel
          selectedItemType={inspectorSelectedType}
          selectedRepos={filteredGroupedRepos.filter(r => selectedRepoIds.has(r.id))}
          selectedSkills={(filteredGroupedRepos.find(r => r.id === selectedRepoId)?.skills || []).filter(s => selectedSkillIds.has(s.id))}
          agents={agents}
          syncRecords={syncRecords}
          currentLibrary={selectedWorkspaceDir || null}
          allRepos={filteredGroupedRepos}
          onOpenDrawer={(skill) => { setSelectedSkill(skill); setIsDrawerOpen(true); }}
          onSelectRepo={(repoId) => setSelectedRepoId(repoId)}
          onRefreshData={fetchData}
          onUpdateRepos={handleUpdateRepos}
          onDeleteRepos={(e, r) => handleDeleteRepos(e as any, r)}
          isOpen={isInspectorOpen}
          onToggle={() => setIsInspectorOpen(!isInspectorOpen)}
          onGeneratePrompt={handleGeneratePrompt}
        />
          </>
        ) : activeModule === 'prompts' ? (
          /* 提示词管理模块 */
          <div className="flex-1 flex h-full min-w-0 overflow-hidden">
            <PromptModule
              refreshKey={promptRefreshKey}
              filter={promptFilter}
              onGroupsChange={setPromptGroups}
              onFilterChange={setPromptFilter}
            />
          </div>
        ) : (
          /* 资源社区占位页面 */
          <div className="flex-1 flex flex-col h-full min-w-0 bg-transparent relative">
            <div data-tauri-drag-region className="h-16 border-b border-[var(--color-border)] bg-white/70 backdrop-blur-xl flex items-center px-8 shrink-0 relative z-0">
              <h1 className="text-xl font-medium tracking-tight text-[var(--foreground)]">资源社区</h1>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[var(--color-background)]">
              <div className="w-24 h-24 mb-6 rounded-3xl bg-white flex items-center justify-center">
                <Store className="w-10 h-10 text-blue-500" strokeWidth={1.5} />
              </div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2 tracking-tight">资源社区</h2>
              <p className="text-sm text-[var(--color-muted)] mb-2 text-center max-w-sm leading-relaxed">
                发现优质 Skill 和 Prompt 资源，一键导入使用，与社区共享你的创作
              </p>
              <div className="mt-4 flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/10">
                <div className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-pulse"></div>
                <span className="text-[13px] font-medium text-[var(--color-primary)]">功能建设中，敬请期待</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <ContextMenu
        items={menuTarget?.type === 'repo' ? buildRepoContextMenu(menuTarget.data) : menuTarget?.type === 'skill' ? buildSkillContextMenu(menuTarget.data) : menuTarget?.type === 'empty' ? buildEmptyContextMenu() : []}
        position={menuPosition}
        onClose={hideContextMenu}
      />

      <AddRepositoryDialog
        isOpen={isAddDialogOpen}
        onClose={() => { setIsAddDialogOpen(false); setAddDialogTab(null); }}
        onSuccess={fetchData}
        onCloningStart={(path, name) => setCloningRepos(prev => [...prev, { path, name }])}
        onCloningSuccess={(path) => { setCloningRepos(prev => prev.filter(r => r.path !== path)); }}
        onCloningError={(path, err) => { setCloningRepos(prev => prev.filter(r => r.path !== path)); if (err) showToast(`克隆失败: ${err}`, 'error'); }}
        defaultTab={addDialogTab}
        defaultTargetDir={selectedWorkspaceId !== "all" ? directories.find(d => d.id === selectedWorkspaceId)?.path : undefined}
        defaultSourceDirId={selectedWorkspaceId !== "all" ? selectedWorkspaceId : undefined}
      />

      <SkillDetailsDrawer
        isOpen={isDrawerOpen}
        skill={selectedSkill}
        onClose={() => { setIsDrawerOpen(false); fetchData(); }}
        onGeneratePrompt={handleGeneratePrompt}
      />

      <PromptPreviewModal
        isOpen={promptModal.isOpen}
        skillName={promptModal.skillName}
        content={promptModal.content}
        loading={promptModal.loading}
        onClose={() => setPromptModal(prev => ({ ...prev, isOpen: false }))}
      />

      <AgentSettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => { setIsSettingsOpen(false); fetchData(); }}
      />

      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        repos={groupedRepos}
        onDeleteRepo={(e, r) => handleDeleteRepos(e as any, [r])}
        onCopyPath={handleCopyPath}
        onSelectRepo={(repoId) => {
          const repo = groupedRepos.find(r => r.id === repoId);
          if (repo) {
            if (activeTab !== "all" && repo.source_type !== activeTab) setActiveTab("all");
            if (activeView !== "all" || selectedTag !== "all") { setActiveView("all"); setSelectedTag("all"); }
          }
          setSelectedRepoId(repoId);
        }}
        onSelectSkill={(skill, repo) => {
          if (activeTab !== "all" && repo.source_type !== activeTab) setActiveTab("all");
          if (activeView !== "all" || selectedTag !== "all") { setActiveView("all"); setSelectedTag("all"); }
          setSelectedRepoId(repo.id);
          setSelectedSkill(skill);
          setIsDrawerOpen(true);
        }}
      />

      <CreateSkillLibraryModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={async (id) => { await fetchData(); if (id) setSelectedWorkspaceId(id); }}
      />

      <OpenSkillLibraryModal
        isOpen={isOpenModalOpen}
        onClose={() => setIsOpenModalOpen(false)}
        onSuccess={async (id) => { await fetchData(); if (id) setSelectedWorkspaceId(id); }}
      />

      <MergeSkillLibraryModal
        isOpen={isMergeModalOpen}
        onClose={() => setIsMergeModalOpen(false)}
        onSuccess={fetchData}
        targetLibrary={directories.find(d => d.id === selectedWorkspaceId) || null}
      />

      {/* 真实的初始化加载层 */}
      {isAppStarting && (
        <div className="fixed inset-0 z-[200] bg-white/40 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200">
          <div className="w-[320px] rounded-xl border border-black/[0.08] bg-white/95 backdrop-blur-2xl p-8 shadow-[0_20px_40px_rgb(0,0,0,0.08)] flex flex-col items-center">
            <span className="text-[13px] font-medium text-[var(--foreground)] opacity-70 mb-5 tracking-widest transition-opacity duration-300">
              {loadingText}
            </span>
            <div className="w-full h-1 bg-black/5 rounded-full overflow-hidden relative shadow-inner">
              <div
                className="absolute top-0 left-0 h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
                style={{
                  width: '100%',
                  animation: 'progress-bar 0.4s ease-out forwards'
                }}
              />
            </div>
            <style>{`
              @keyframes progress-bar {
                0% { width: 0%; opacity: 0.8; }
                50% { width: 70%; opacity: 1; }
                100% { width: 100%; opacity: 0.9; }
              }
            `}</style>
          </div>
        </div>
      )}

      <AboutDialog
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />

      {deleteConfirmRepos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-sm p-4">
          <div className="bg-white/95 backdrop-blur-xl border border-[var(--color-border)] rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col relative transition-all duration-300">
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]/60 bg-[#fafbfc]">
              <h2 className="text-[15px] font-semibold text-[var(--foreground)] flex items-center">
                <Trash2 className="w-4 h-4 mr-2 text-red-500" />
                永久删除仓库
              </h2>
              <button onClick={() => setDeleteConfirmRepos(null)} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:bg-black/5 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 text-[13px] text-[var(--foreground)] leading-relaxed">
              {deleteConfirmRepos.length === 1
                ? `确定要彻底删除整个仓库 "${deleteConfirmRepos[0].name}" 及其所有 ${deleteConfirmRepos[0].skills.length} 个子技能吗？此操作不可恢复。`
                : `确定要彻底删除选中的 ${deleteConfirmRepos.length} 个仓库及其子技能吗？此操作不可恢复。`
              }
            </div>

            <div className="flex items-center justify-end p-4 border-t border-[var(--color-border)]/60 bg-[#fafbfc] space-x-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmRepos(null)}
                className="px-4 py-2 text-[13px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmDeleteRepos}
                className="px-4 py-2 text-[13px] font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg shadow-sm transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
      {confirmData && <ConfirmDialog {...(confirmData as any)} />}
    </div>
  );
}

export default App;
