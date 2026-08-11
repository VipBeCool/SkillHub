import { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { FolderGit2, HardDrive, Settings, Search, Plus, RefreshCw, ChevronRight, ChevronLeft, X, LayoutGrid, Sparkles, FileQuestion, Globe, FolderX, FolderSearch, Trash2, Info } from "lucide-react";
import { confirm } from '@tauri-apps/plugin-dialog';
import { AddRepositoryDialog } from "./components/library/AddRepositoryDialog";
import { SkillLibrarySelector, SkillLibrarySelectorRef } from './components/library/SkillLibrarySelector';
import { CreateSkillLibraryModal, OpenSkillLibraryModal, MergeSkillLibraryModal } from "./components/library/LibraryManagementModals";
import { SkillDetailsDrawer } from "./components/skill/SkillDetailsDrawer";
import { AgentSettingsDialog } from "./components/agent/AgentSettingsDialog";
import { SearchModal } from "./components/search/SearchModal";
import { RepoCard } from "./components/skill/RepoCard";
import { SkillCard } from "./components/skill/SkillCard";
import { ToastContainer, showToast } from "./components/ui/Toast";
import { Tooltip } from "./components/ui/Tooltip";
import { AboutDialog } from "./components/ui/AboutDialog";
import { Skill, SourceDirectory, AgentConfig, SyncRecord, GroupedRepo } from "./types";

function App() {
  const [activeTab, setActiveTab] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [, setSkills] = useState<Skill[]>([]);
  const [directories, setDirectories] = useState<SourceDirectory[]>([]);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [syncRecords, setSyncRecords] = useState<SyncRecord[]>([]);
  const [groupedRepos, setGroupedRepos] = useState<GroupedRepo[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(() => {
    return localStorage.getItem("skillhub_selected_workspace");
  });
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isOpenModalOpen, setIsOpenModalOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [addDialogTab, setAddDialogTab] = useState<"local" | "github" | null>(null);

  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [isRetryingMissing, setIsRetryingMissing] = useState(false);
  const [syncLogs, setSyncLogs] = useState<{ id: string, label: string, status: 'pending' | 'success' | 'error' | 'skipped', message?: string }[]>([]);
  const [isSyncPopupMinimized, setIsSyncPopupMinimized] = useState(false);
  const [cloningRepos, setCloningRepos] = useState<{ path: string, name: string }[]>([]);
  const [isAppStarting, setIsAppStarting] = useState(true);
  const [loadingText, setLoadingText] = useState("资源加载中...");
  const skillLibrarySelectorRef = useRef<SkillLibrarySelectorRef>(null);

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
    setSelectedCategory("all");
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
      return fetchedDirs;
    } catch (e) {
      console.error("Failed to load data", e);
      return [];
    }
  };

  useEffect(() => {
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
      } else if (action === "clear_history") {
        showToast("暂不支持该操作");
      } else if (action === "reload_cache") {
        window.location.reload();
      } else if (action.startsWith("select_")) {
        const id = action.replace("select_", "");
        handleWorkspaceSelect(id);
      }
    }).then(un => unlisten = un);

    return () => {
      clearInterval(interval);
      if (unlisten) unlisten();
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

  const handleUpdateRepo = async (e: React.MouseEvent, repo: GroupedRepo) => {
    e.stopPropagation();
    if (repo.source_type !== 'github') return;
    
    setIsSyncPopupMinimized(true);
    setSyncLogs([{ id: repo.path, label: repo.name, status: 'pending' }]);
    try {
      const msg = await invoke<string>("pull_single_repo", { path: repo.path });
      setSyncLogs([{ id: repo.path, label: repo.name, status: msg === '已是最新' ? 'skipped' : 'success', message: msg }]);
      
      const dirPath = directories.find(d => d.id === repo.source_dir_id)?.path;
      if (dirPath) {
        await invoke("rescan_directory", { path: dirPath });
      }
      await fetchData();
      setTimeout(() => setSyncLogs([]), 5000);
    } catch (err) {
      setSyncLogs([{ id: repo.path, label: repo.name, status: 'error', message: String(err) }]);
      setTimeout(() => setSyncLogs([]), 5000);
    }
  };

  const handleDeleteRepo = async (e: React.MouseEvent, repo: GroupedRepo) => {
    e.stopPropagation();
    const yes = await confirm(`确定要彻底删除整个仓库 "${repo.name}" 及其所有 ${repo.skills.length} 个子技能吗？此操作不可恢复。`, { title: '永久删除整个仓库', kind: 'warning' });
    if (yes) {
      try {
        await invoke("delete_skill_by_path", { path: repo.path });
        await fetchData();
        if (selectedRepoId === repo.id) setSelectedRepoId(null);
      } catch (err) {
        alert(String(err));
      }
    }
  };

  const handleAddRepo = () => {
    setAddDialogTab(null);
    setIsAddDialogOpen(true);
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
        const repos = await invoke<{name: string, path: string}[]>("get_git_repos_in_directory", { path: dir.path });
        
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
        } catch (err) {}
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
    if (selectedCategory !== "all") {
      result = result.filter(r => r.category === selectedCategory);
    }
    return result;
  }, [groupedRepos, selectedWorkspaceId, activeTab, selectedCategory]);

  useEffect(() => {
    // If selected repo is deleted, clear selection
    if (selectedRepoId && !filteredGroupedRepos.some(r => r.id === selectedRepoId)) {
      setSelectedRepoId(null);
    }
  }, [filteredGroupedRepos, selectedRepoId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchModalOpen(true);
      }
    };
    
    const handleFocus = () => {
      fetchData();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('focus', handleFocus);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const selectedWorkspaceDir = directories.find(d => d.id === selectedWorkspaceId);

  return (
    <div className="flex h-screen w-full bg-transparent text-[var(--foreground)] overflow-hidden font-sans">
      
      <div className="w-64 bg-[var(--color-sidebar)] flex flex-col h-full shrink-0 relative z-20 text-[13px] border-r border-black/[0.05]">
        <div data-tauri-drag-region onPointerDown={() => getCurrentWindow().startDragging()} className="h-10 w-full shrink-0"></div>

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

        <div className="px-3 pb-3">
          <button 
            onClick={() => setIsSearchModalOpen(true)}
            className="w-full relative group flex items-center px-2 py-1 rounded-md bg-black/5 hover:bg-black/10 transition-all text-left outline-none select-none"
          >
            <Search className="w-4 h-4 text-[var(--color-muted)] mr-2 shrink-0 group-hover:text-[var(--color-primary)] transition-colors" />
            <span className="text-[13px] text-[var(--color-muted)]/70 font-medium flex-1">搜索技能...</span>
            <div className="flex items-center space-x-0.5 text-[10px] text-[var(--color-muted)] font-sans border border-black/5 rounded bg-black/[0.02] px-1.5 py-0.5">
              <span>⌘</span><span>K</span>
            </div>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-3 mb-5">
            <h3 className="text-[11px] font-semibold text-[var(--color-muted)]/60 mb-1 px-2">
              分类视图
            </h3>
            <div className="space-y-0.5">
              {[
                { id: "all", label: "全部分类", icon: LayoutGrid },
                { id: "正式技能", label: "正式技能", icon: Sparkles },
                { id: "其他", label: "其他", icon: FileQuestion }
              ].map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md transition-colors outline-none select-none ${
                    selectedCategory === cat.id
                      ? "bg-black/5 text-[var(--foreground)] font-semibold"
                      : "text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] font-medium"
                  }`}
                >
                  <cat.icon className="w-4 h-4" />
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="px-3 mb-5">
            <h3 className="text-[11px] font-semibold text-[var(--color-muted)]/60 mb-1 px-2">
              数据源
            </h3>
            <div className="space-y-0.5">
              <button
                className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md transition-colors outline-none select-none ${
                  activeTab === "all" ? "bg-black/5 text-[var(--foreground)] font-semibold" : "text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 font-medium"
                }`}
                onClick={() => setActiveTab("all")}
              >
                <FolderGit2 className="w-4 h-4" />
                <span>所有技能</span>
              </button>
              <button
                className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md transition-colors outline-none select-none ${
                  activeTab === "local" ? "bg-black/5 text-[var(--foreground)] font-semibold" : "text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 font-medium"
                }`}
                onClick={() => setActiveTab("local")}
              >
                <HardDrive className="w-4 h-4" />
                <span>本地技能</span>
              </button>
              <button
                className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md transition-colors outline-none select-none ${
                  activeTab === "github" ? "bg-black/5 text-[var(--foreground)] font-semibold" : "text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 font-medium"
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

      <div className="flex-1 flex flex-col h-full min-w-0 bg-transparent relative">
        <div data-tauri-drag-region onPointerDown={(e) => {
          if (e.target === e.currentTarget) {
            getCurrentWindow().startDragging();
          }
        }} className="h-16 border-b border-[var(--color-border)] bg-white/70 backdrop-blur-xl flex items-center justify-between px-8 shrink-0 relative z-0">
          <div className="flex items-center space-x-3">
            {selectedRepoId && (
              <button onClick={() => setSelectedRepoId(null)} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] transition-colors mr-1">
                <ChevronLeft className="w-5 h-5 text-[var(--color-muted)]" />
              </button>
            )}
            <h1 className="text-xl font-medium tracking-tight text-[var(--foreground)] flex items-center">
              {selectedRepoId ? (
                <>
                  <span className="text-[var(--color-muted)] cursor-pointer hover:text-[var(--foreground)] transition-colors" onClick={() => setSelectedRepoId(null)}>
                    {directories.find(d => d.id === selectedWorkspaceId)?.label || "未知技能库"}
                  </span>
                  <ChevronRight className="w-4 h-4 mx-2 text-[var(--color-muted)] opacity-50" />
                  <span>{filteredGroupedRepos.find(r => r.id === selectedRepoId)?.name}</span>
                </>
              ) : (
                directories.find(d => d.id === selectedWorkspaceId)?.label || "未知技能库"
              )}
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

        <div className="flex-1 overflow-y-auto p-8 relative z-0 bg-[var(--color-background)]">
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
              <div className="flex items-center space-x-3">
                <button onClick={() => { setAddDialogTab("local"); setIsAddDialogOpen(true); }} className="flex flex-col items-center justify-center p-3 bg-black/5 rounded-md hover:bg-black/10 transition-all group">
                  <div className="p-1.5 rounded-md bg-white shadow-sm transition-colors mr-2">
                    <HardDrive className="w-3.5 h-3.5 text-[var(--color-muted)] group-hover:text-[var(--foreground)]" />
                  </div>
                  <span className="text-[12px] font-medium text-[var(--foreground)] mt-2">导入本地技能</span>
                </button>
                <button onClick={() => { setAddDialogTab("github"); setIsAddDialogOpen(true); }} className="flex flex-col items-center justify-center p-3 bg-black/5 rounded-md hover:bg-black/10 transition-all group">
                  <div className="p-1.5 rounded-md bg-white shadow-sm transition-colors mr-2">
                    <Globe className="w-3.5 h-3.5 text-[var(--color-muted)] group-hover:text-[var(--foreground)]" />
                  </div>
                  <span className="text-[12px] font-medium text-[var(--foreground)] mt-2">克隆 GitHub 库</span>
                </button>
              </div>
            </div>
          ) : !selectedRepoId ? (
            <div className="grid gap-6 content-start pb-20" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {cloningRepos.map((repo, idx) => (
                <div key={`cloning-${idx}`} className="group bg-[var(--color-muted-bg)]/30 backdrop-blur-md rounded-2xl p-6 border border-dashed border-[var(--color-border)] shadow-sm flex flex-col h-56 animate-pulse">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-muted-bg)] flex items-center justify-center shrink-0">
                      <div className="w-5 h-5 border-2 border-[var(--color-muted)] border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <Tooltip content="取消拉取">
                      <button 
                        onClick={(e) => handleCancelClone(e, repo.path)}
                        className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-red-500 hover:bg-red-50 transition-colors z-10 relative"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </Tooltip>
                  </div>
                  <h3 className="text-lg font-semibold text-[var(--foreground)] truncate pr-2 mt-2" title={repo.name}>
                    {repo.name}
                  </h3>
                  <div className="mt-3">
                    <span className="inline-flex items-center px-2 py-1 rounded-md bg-[var(--color-muted-bg)] text-xs font-medium text-[var(--color-muted)]">
                      正在从 Git 拉取...
                    </span>
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-4 border-t border-[var(--color-border)]/50">
                    <div className="flex items-center space-x-1.5 text-xs font-medium text-[var(--color-primary)]">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-ping" />
                      <span>GITHUB</span>
                    </div>
                  </div>
                </div>
              ))}
              {filteredGroupedRepos.map((repo) => {
                return (
                  <RepoCard
                    key={repo.id}
                    repo={repo}
                    syncRecords={syncRecords}
                    agents={agents}
                    onClick={(id) => setSelectedRepoId(id)}
                    onUpdateRepo={handleUpdateRepo}
                    onDeleteRepo={(e, repo) => handleDeleteRepo(e, repo)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {filteredGroupedRepos.find(r => r.id === selectedRepoId)?.skills.map((skill) => {
                return (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    syncRecords={syncRecords}
                    agents={agents}
                    onClick={(s) => { setSelectedSkill(s); setIsDrawerOpen(true); }}
                    onCopyPath={handleCopyPath}
                  />
                );
              })}
            </div>
          )}
        </div>
        
        {/* Sync Progress Panel */}
        {syncLogs.length > 0 && (
          <div 
            className={`absolute bottom-8 right-8 bg-white/90 backdrop-blur-xl border border-[var(--color-border)] rounded-2xl shadow-2xl transition-all duration-300 z-50 ${isSyncPopupMinimized ? 'w-auto p-3 flex items-center space-x-3 cursor-pointer hover:bg-white hover:scale-105' : 'w-80 p-4'}`} 
            onClick={() => { if(isSyncPopupMinimized) setIsSyncPopupMinimized(false); }}
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
      
      <AddRepositoryDialog 
        isOpen={isAddDialogOpen} 
        onClose={() => { setIsAddDialogOpen(false); setAddDialogTab(null); }} 
        onSuccess={fetchData} 
        onCloningStart={(path, name) => setCloningRepos(prev => [...prev, { path, name }])}
        onCloningSuccess={(path) => {
          setCloningRepos(prev => prev.filter(r => r.path !== path));
          // 可选：克隆成功后提示
        }}
        onCloningError={(path, err) => {
           setCloningRepos(prev => prev.filter(r => r.path !== path));
           if (err) {
             showToast(`克隆失败: ${err}`, 'error');
           }
        }}
        defaultTab={addDialogTab}
        defaultTargetDir={selectedWorkspaceId !== "all" ? directories.find(d => d.id === selectedWorkspaceId)?.path : undefined}
      />

      <SkillDetailsDrawer 
        isOpen={isDrawerOpen} 
        skill={selectedSkill} 
        onClose={() => {
          setIsDrawerOpen(false);
          fetchData(); // 重新加载数据以刷新徽标
        }} 
      />

      <AgentSettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => {
          setIsSettingsOpen(false);
          fetchData();
        }}
      />
      
      <SearchModal 
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        repos={groupedRepos}
        syncRecords={syncRecords}
        agents={agents}
        onUpdateRepo={handleUpdateRepo}
        onDeleteRepo={handleDeleteRepo}
        onCopyPath={handleCopyPath}
        onSelectRepo={(repoId) => {
          // If the selected repo is hidden by current filters, we should clear the filters so it's visible
          const repo = groupedRepos.find(r => r.id === repoId);
          if (repo) {
            if (activeTab !== "all" && repo.source_type !== activeTab) {
              setActiveTab("all");
            }
            if (selectedCategory !== "all" && repo.category !== selectedCategory) {
              setSelectedCategory("all");
            }
          }
          setSelectedRepoId(repoId);
        }}
        onSelectSkill={(skill, repo) => {
          if (activeTab !== "all" && repo.source_type !== activeTab) {
            setActiveTab("all");
          }
          if (selectedCategory !== "all" && repo.category !== selectedCategory) {
            setSelectedCategory("all");
          }
          setSelectedRepoId(repo.id);
          setSelectedSkill(skill);
          setIsDrawerOpen(true);
        }}
      />

      <CreateSkillLibraryModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={async (id) => {
          await fetchData();
          if (id) {
            setSelectedWorkspaceId(id);
          }
        }}
      />
      
      <OpenSkillLibraryModal
        isOpen={isOpenModalOpen}
        onClose={() => setIsOpenModalOpen(false)}
        onSuccess={async (id) => {
          await fetchData();
          if (id) {
            setSelectedWorkspaceId(id);
          }
        }}
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

      <ToastContainer />
    </div>
  );
}

export default App;
