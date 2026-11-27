import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { SelectionArea, SelectionEvent } from '@viselect/react';
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen, emit, UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { HardDrive, Settings, Search, Plus, RefreshCw, ChevronRight, ChevronDown, X, LayoutGrid, Rows3, Grip, Sparkles, Globe, FolderX, FolderSearch, Trash2, Info, Folder, FolderPlus, Copy, Link as LinkIcon, Check, Minus, Download, FileArchive, MessageSquareQuote, Store, FileCode, CheckSquare, Star, Clock, Tag, ExternalLink, Users, SlidersHorizontal, Edit2, PanelLeftClose, Trophy, FolderGit2, PackageCheck } from "lucide-react";
import { open } from '@tauri-apps/plugin-dialog';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { AddRepositoryDialog } from "./components/library/AddRepositoryDialog";
import { SkillLibrarySelector, SkillLibrarySelectorRef } from './components/library/SkillLibrarySelector';
import { CreateSkillLibraryModal, OpenSkillLibraryModal, MergeSkillLibraryModal } from "./components/library/LibraryManagementModals";

import { SkillDetailPage } from "./components/skill/SkillDetailPage";
import { PromptPreviewModal } from "./components/skill/PromptPreviewModal";
import { GlobalSettingsModal } from "./components/ui/GlobalSettingsModal";
import { ConfirmDialog } from './components/ui/ConfirmDialog';
import { UnderConstructionModal } from "./components/ui/UnderConstructionModal";
import { SearchModal } from "./components/search/SearchModal";
import { RepoCard } from "./components/skill/RepoCard";
import { SkillCard } from "./components/skill/SkillCard";
import { CategorizedView } from "./components/skill/CategorizedView";
import { CloningCard } from "./components/skill/CloningCard";
import { CloneProgressModal } from "./components/skill/CloneProgressModal";
import { ToastContainer, showToast } from "./components/ui/Toast";
import { Tooltip } from "./components/ui/Tooltip";
import { AboutDialog } from "./components/ui/AboutDialog";
import { CommunityModal } from "./components/ui/CommunityModal";
import { UpdateNotifier } from "./components/ui/UpdateNotifier";
import { QuickLookModal } from "./components/ui/QuickLookModal";
import { InspectorPanel } from "./components/inspector/InspectorPanel";
import { ContextMenu, useContextMenu } from "./components/ui/ContextMenu";
import type { ContextMenuItem } from "./components/ui/ContextMenu";
import { TagManagerModal } from "./components/ui/TagManagerModal";
import {
  computeTagStats,
  parseTags,
  serializeTags,
  toggleStarTag,
  recordRecentTag,
  removeTagFromMeta,
  renameTagInMeta,
  getRepoEffectiveTags,
  setRepoTags,
  renameRepoTagInStore,
  deleteRepoTagsInStore,
  collectSkillModuleTagItems,
  isCollectionRepo,
  type TagStatItem,
} from "./utils/tagStore";
import {
  isRepoItemStarred,
  setReposStarredBatch,
  toggleRepoStarred,
} from "./utils/favoriteStore";
import { getNextElement } from "./utils/navigation";
import { Skill, SourceDirectory, AgentConfig, SyncRecord, GroupedRepo, PromptGroup, Prompt, CloningRepo } from "./types";
import { PromptModule, PromptSidebarNav, PromptFilter } from "./PromptModule";
import { PromptDetailPage } from "./components/prompt/PromptDetailPage";
import { useTabs } from "./hooks/useTabs";
import { Tab, TabType, TabContext } from "./types/tabs";
import { TabBar } from "./components/ui/TabBar";
import { ResourceHubView } from "./components/resource/ResourceHubView";
import { RemoteSkillDetailView } from "./components/resource/RemoteSkillDetailView";
import { RemotePromptDetailView } from "./components/resource/RemotePromptDetailView";
import { ResourceDetail } from "./components/resource/ResourceDetail";
import { InstallTargetModal } from "./components/resource/InstallTargetModal";
import type { ResourceItem } from "./types/resource";
import type { RemotePromptItem, RemoteSkillTarget, ResourceNavSection } from "./types/resourceHub";
import registryData from "./data/resource-registry.json";
import { useResourceHub, buildRemoteSkillKey } from "./hooks/useResourceHub";
import { usePromptHub } from "./hooks/usePromptHub";
import { getGitHubToken } from "./utils/githubToken";
import {
  findStoreResourceForRepo,
  findStoreResourceForSkill,
  findLocalRepoOrSkillForResource,
  findLocalPromptForResource,
} from "./utils/resourceMatch";
import { getDefaultInstallDirId, setDefaultInstallDirId } from "./utils/storeSettings";
import { getGeneralSettings, type GeneralSettings } from "./utils/appSettings";

const isMac = navigator.userAgent.toLowerCase().includes('mac');
const fileManagerName = isMac ? '访达' : '文件管理器';

const getExportTimeStr = () => new Date().toISOString().replace(/[:.]/g, '-');

type AppModule = 'skills' | 'prompts' | 'resources';

function App() {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(() => {
    return localStorage.getItem("skillhub_selected_workspace");
  });

  const selectedWorkspaceIdRef = useRef<string | null>(selectedWorkspaceId);
  useEffect(() => {
    selectedWorkspaceIdRef.current = selectedWorkspaceId;
    if (selectedWorkspaceId) {
      localStorage.setItem("skillhub_selected_workspace", selectedWorkspaceId);
    } else {
      localStorage.removeItem("skillhub_selected_workspace");
    }
  }, [selectedWorkspaceId]);

  const { tabs, activeTabId, activeTab: currentTab, openTab, closeTab, switchTab, navigateTo, goBack: tabGoBack, goForward: tabGoForward, canGoBack, canGoForward, updateActiveTab } = useTabs(selectedWorkspaceId || undefined);

  const currentTabRef = useRef<typeof currentTab>(currentTab);
  useEffect(() => {
    currentTabRef.current = currentTab;
  }, [currentTab]);

  // 严格的模块归属判定函数
  const getTabModule = useCallback((tab: Tab | null | undefined): AppModule => {
    if (!tab || !tab.type) return 'skills';
    if (tab.type.startsWith('prompt')) return 'prompts';
    if (tab.type.startsWith('resource')) return 'resources';
    return 'skills';
  }, []);

  const [activeModule, setActiveModuleState] = useState<AppModule>('skills');
  const [isUnderConstructionOpen, setIsUnderConstructionOpen] = useState(false);
  const currentTabModule = getTabModule(currentTab);

  // 记录各模块最近一次激活的有效标签页 ID，以便切回时精准恢复上下文
  const lastActiveTabByModule = useRef<Record<AppModule, string>>({
    skills: '',
    prompts: '',
    resources: '',
  });

  useEffect(() => {
    if (currentTab?.id && currentTab?.type) {
      const mod = getTabModule(currentTab);
      lastActiveTabByModule.current[mod] = currentTab.id;
      setActiveModuleState(mod);
    }
  }, [currentTab?.id, currentTab?.type, getTabModule]);

  const isSidebarMatch = activeModule === currentTabModule;
  const activeTab = currentTab?.context?.filter || "all";

  const setActiveModule = (mod: AppModule) => {
    setActiveModuleState(mod);
  };

  // 统一的模块切换逻辑（方案 1：单 Tab 原地无筛选导航，或 ⌘/中键新开无筛选标签页）
  const handleSwitchModule = useCallback((mod: AppModule, e?: React.MouseEvent) => {
    setActiveModuleState(mod);

    // 针对三大模块定义纯净无筛选的初始目标
    const cleanTargets: Record<AppModule, { type: TabType; title: string; context: TabContext; icon: string }> = {
      skills: {
        type: 'skill-home',
        title: '技能库',
        context: {
          workspaceId: selectedWorkspaceId || undefined,
          repoId: undefined,
          skillId: undefined,
          activeView: 'all',
          selectedTag: 'all',
          activeSourceTab: 'all',
          filter: 'all',
        },
        icon: 'FileCode',
      },
      prompts: {
        type: 'prompt-home',
        title: '提示词',
        context: {
          promptFilter: 'all',
          promptId: undefined,
          promptOpened: false,
          isEditing: false,
          repoId: undefined,
          skillId: undefined,
        },
        icon: 'MessageSquareQuote',
      },
      resources: {
        type: 'resource-home',
        title: '发现',
        context: {
          resourceCategory: 'discover',
          categoryName: '发现',
          resourceId: undefined,
          remoteSkillTarget: undefined,
          remotePromptItem: undefined,
        },
        icon: 'Store',
      },
    };

    const target = cleanTargets[mod];

    // 清理全局卡片多选态与检查器
    setSelectedRepoIds(new Set());
    setSelectedSkillIds(new Set());
    setInspectorSelectedType(null);

    // 广播全局重置事件通知内部可能存在的搜索框或选区清空
    window.dispatchEvent(new CustomEvent('skillhub:reset-filters', { detail: { module: mod } }));

    // 如果用户使用 ⌘/Ctrl+Click 或中键点击，则新开一个无筛选条件的纯净标签页
    if (e && (e.button === 1 || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.stopPropagation();
      const newId = openTab(target.type, target.title, target.context, target.icon);
      lastActiveTabByModule.current[mod] = newId;
      return;
    }

    // 默认行为（方案 1）：在当前活跃标签页原地切换，TabBar 焦点绝对不跳，并彻底清空所有筛选条件
    if (currentTab) {
      navigateTo(target.type, target.title, target.context, target.icon);
      lastActiveTabByModule.current[mod] = currentTab.id;
    } else {
      const newId = openTab(target.type, target.title, target.context, target.icon);
      lastActiveTabByModule.current[mod] = newId;
    }
  }, [currentTab, navigateTo, openTab, selectedWorkspaceId]);

  const handleSidebarNav = (type: TabType, title: string, updates: Partial<import('./types/tabs').TabContext>, icon?: string, e?: React.MouseEvent) => {
    if (e && (e.button === 1 || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.stopPropagation();
      openTab(type, title, { ...currentTab?.context, ...updates, workspaceId: selectedWorkspaceId || undefined }, icon);
      return;
    }
    navigateTo(type, title, { ...currentTab?.context, ...updates }, icon);
  };

  const selectedTag = currentTab?.context?.selectedTag || "all";
  const setSelectedTag = (tag: string, e?: React.MouseEvent) => handleSidebarNav('skill-home', '技能库', { selectedTag: tag, activeView: "all", repoId: undefined }, 'Tag', e);
  const activeView = (currentTab?.context?.activeView as "all" | "starred" | "recent" | "untagged") || "all";
  const setActiveView = (view: "all" | "starred" | "recent" | "untagged", _title: string = "全部技能", icon: string = "LayoutGrid", e?: React.MouseEvent) => handleSidebarNav('skill-home', '技能库', { activeView: view, selectedTag: "all", repoId: undefined }, icon, e);
  // 「星标」视图保留双层层级（技能包与独立单技能继续展示，包内星标子技能收敛至「技能」分组），仅「最近使用」保持平铺
  const isFlatView = activeView === "recent";
  const [skills, setSkills] = useState<Skill[]>([]);
  const [directories, setDirectories] = useState<SourceDirectory[]>([]);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [syncRecords, setSyncRecords] = useState<SyncRecord[]>([]);
  const [openWithApps, setOpenWithApps] = useState<{ name: string, path: string, icon_base64?: string }[]>([]);
  const [groupedRepos, setGroupedRepos] = useState<GroupedRepo[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isCommunityOpen, setIsCommunityOpen] = useState(false);
  const [communityDefaultTab, setCommunityDefaultTab] = useState<"qq" | "wechat">("qq");
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [quickLookOpen, setQuickLookOpen] = useState(false);
  const [installTargetResource, setInstallTargetResource] = useState<ResourceItem | null>(null);
  const [pendingRemoteInstall, setPendingRemoteInstall] = useState<{
    targets: RemoteSkillTarget[];
    batchLabel?: string;
  } | null>(null);
  const [installingRemoteKeys, setInstallingRemoteKeys] = useState<Set<string>>(new Set());
  const [updatingInstalledPaths, setUpdatingInstalledPaths] = useState<Set<string>>(new Set());
  const [libraryRefreshNonce, setLibraryRefreshNonce] = useState(0);

  // 资源中心统一状态：
  // 1) 切到资源模块或打开 ⌘K 时只读本地 SQLite 缓存（0 网络请求）；
  // 2) 仅当用户主动切入「订阅仓库」视图时，才对未同步过的预置仓做首次扫描，杜绝后台偷跑流量
  const isViewingSubscribedRepos =
    activeModule === 'resources' &&
    currentTab?.type === 'resource-home' &&
    currentTab?.context?.resourceCategory === 'repos';
  const resourceHub = useResourceHub(
    activeModule === 'resources' || isSearchModalOpen,
    isViewingSubscribedRepos,
    libraryRefreshNonce
  );

  // 远程开源提示词广场状态（AiShort / prompts.chat / Fabric / LangGPT，按需切换拉取并本地缓存）
  const promptHub = usePromptHub();
  const [installingPromptIds, setInstallingPromptIds] = useState<Set<string>>(new Set());

  // 合并可供全局搜索（⌘K 社区精选）检索的资源集合：精选专题榜 + 订阅仓库技能 + 原社区精选
  const searchableCommunityBundle = useMemo(() => {
    const targetMap = new Map<string, RemoteSkillTarget>();
    const list: ResourceItem[] = [];
    const seenKeys = new Set<string>();

    // 1. 精选专题榜技能（支持远程 JSON 热更新，带中文能力摘要）
    for (const board of resourceHub.curatedLeaderboards) {
      for (const item of board.items) {
        const key = buildRemoteSkillKey(item.owner, item.repo, item.skillName, item.subpath);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        const id = `remote-skill::${key}`;
        const target: RemoteSkillTarget = {
          host: 'github.com',
          owner: item.owner,
          repo: item.repo,
          branch: item.branch,
          skillName: item.skillName,
          displayName: item.displayName || item.skillName,
          description: item.summaryZh,
          subpath: item.subpath,
          installMode: item.installMode,
          provider: 'leaderboard',
          repoUrl: `https://github.com/${item.owner}/${item.repo}`,
          installs: item.installs,
          stars: item.stars,
          tags: item.tags,
        };
        targetMap.set(id, target);
        list.push({
          id,
          name: item.skillName,
          displayName: item.displayName || item.skillName,
          type: 'skill',
          category: 'core-enhancement',
          description: item.summaryZh,
          repoUrl: `https://github.com/${item.owner}/${item.repo}`,
          stars: item.stars || item.installs || 0,
          tags: [...(item.tags || []), board.title, `${item.owner}/${item.repo}`],
          author: `${item.owner}/${item.repo}`,
          updatedAt: board.updatedAt,
        });
      }
    }

    // 2. 已订阅仓库扫描出的技能
    for (const sk of resourceHub.subscribedRepoSkills) {
      const key = buildRemoteSkillKey(sk.owner, sk.repo, sk.skillName, sk.subpath);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const id = `remote-repo-skill::${sk.id}`;
      const target: RemoteSkillTarget = {
        host: sk.host,
        owner: sk.owner,
        repo: sk.repo,
        branch: sk.branch || undefined,
        skillName: sk.skillName,
        displayName: sk.displayName || sk.skillName,
        description: sk.description,
        subpath: sk.subpath,
        installMode: 'subskill',
        provider: 'repo-source',
        repoUrl: `https://${sk.host}/${sk.owner}/${sk.repo}`,
        tags: sk.tags,
      };
      targetMap.set(id, target);
      list.push({
        id,
        name: sk.skillName,
        displayName: sk.displayName || sk.skillName,
        type: 'skill',
        category: 'workflow',
        description: sk.description || `来自订阅仓库 ${sk.owner}/${sk.repo}`,
        repoUrl: `https://${sk.host}/${sk.owner}/${sk.repo}`,
        stars: 0,
        tags: [...(sk.tags || []), `${sk.owner}/${sk.repo}`, '订阅仓库'],
        author: `${sk.owner}/${sk.repo}`,
        updatedAt: new Date().toISOString(),
      });
    }

    // 3. 保留原社区提示词与内置精选资源
    for (const res of registryData.resources as ResourceItem[]) {
      list.push(res);
    }

    return { list, targetMap };
  }, [resourceHub.curatedLeaderboards, resourceHub.subscribedRepoSkills]);

  const selectedRepoId = currentTab?.context?.repoId || null;
  const setSelectedRepoId = (id: string | null) => {
    if (id) {
      navigateTo('skill-repo', '仓库', { ...currentTab?.context, repoId: id });
    } else {
      navigateTo('skill-home', '技能库', { ...currentTab?.context, repoId: undefined });
    }
  };

  // Eagle 风格交互：选中状态
  const [inspectorSelectedType, setInspectorSelectedType] = useState<'repo' | 'skill' | null>(null);
  const [selectedRepoIds, setSelectedRepoIds] = useState<Set<string>>(new Set());
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(new Set());
  const [lastSelectedRepoId, setLastSelectedRepoId] = useState<string | null>(null);
  const [lastSelectedSkillId, setLastSelectedSkillId] = useState<string | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);

  // Prompt 模块状态（提升，供 App 侧边栏和 PromptModule 共享）
  const promptFilter = (currentTab?.context?.promptFilter as PromptFilter) || "all";
  const setPromptFilter = (filter: string, e?: React.MouseEvent) => {
    handleSidebarNav('prompt-home', '提示词', { promptFilter: filter, repoId: undefined }, 'MessageSquareQuote', e);
  };
  const [promptGroups, setPromptGroups] = useState<PromptGroup[]>([]);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [promptRefreshKey, setPromptRefreshKey] = useState(0);
  const [allPrompts, setAllPrompts] = useState<Prompt[]>([]);

  useEffect(() => {
    const handleGroupsChanged = () => {
      invoke<PromptGroup[]>("get_prompt_groups").then(setPromptGroups).catch(console.error);
    };
    window.addEventListener('skillhub:prompt-groups-changed', handleGroupsChanged);
    return () => window.removeEventListener('skillhub:prompt-groups-changed', handleGroupsChanged);
  }, []);

  useEffect(() => {
    if (isSearchModalOpen) {
      invoke<Prompt[]>("get_prompts", { groupId: null, search: null })
        .then(setAllPrompts)
        .catch(console.error);
    }
  }, [isSearchModalOpen]);

  useEffect(() => {
    invoke<Prompt[]>("get_prompts", { groupId: null, search: null })
      .then(setAllPrompts)
      .catch(console.error);
  }, [promptRefreshKey]);

  // 社区资源已安装状态匹配集合（综合本地技能、仓库以及提示词）
  const installedResourceNames = useMemo(() => {
    const names = new Set<string>();
    skills.forEach(s => {
      if (s.name) {
        names.add(s.name.toLowerCase());
        names.add(s.name);
      }
      if (s.id) {
        names.add(s.id.toLowerCase());
        names.add(s.id);
      }
      if (s.online_url) {
        const norm = s.online_url.trim().toLowerCase().replace(/\/$/, '').replace(/\.git$/, '');
        names.add(norm);
      }
    });
    groupedRepos.forEach(repo => {
      if (repo.name) {
        names.add(repo.name.toLowerCase());
        names.add(repo.name);
      }
      repo.skills?.forEach(s => {
        if (s.name) {
          names.add(s.name.toLowerCase());
          names.add(s.name);
        }
        if (s.id) {
          names.add(s.id.toLowerCase());
          names.add(s.id);
        }
        if (s.online_url) {
          const norm = s.online_url.trim().toLowerCase().replace(/\/$/, '').replace(/\.git$/, '');
          names.add(norm);
        }
      });
    });
    allPrompts.forEach(p => {
      if (p.title) {
        names.add(p.title.toLowerCase());
        names.add(p.title);
      }
    });
    return names;
  }, [skills, groupedRepos, allPrompts]);

  // 本地提示词库已存在的标题小写集合，供远程提示词广场实时展示「已添加」状态
  const installedPromptTitles = useMemo(() => {
    const set = new Set<string>();
    allPrompts.forEach(p => {
      const t = p.title?.trim().toLowerCase();
      if (t) set.add(t);
    });
    return set;
  }, [allPrompts]);

  // 右键菜单
  const { menuPosition, menuTarget, showContextMenu, hideContextMenu } = useContextMenu();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isOpenModalOpen, setIsOpenModalOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [addDialogTab, setAddDialogTab] = useState<"local" | "github" | "online" | null>(null);
  const [isLinking, setIsLinking] = useState(false);

  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const isSyncingAllRef = useRef(false);
  const handleSyncAllRef = useRef<(isManual?: boolean, dirsToSync?: SourceDirectory[]) => Promise<void>>(async () => {});
  const isUpdatingReposRef = useRef(false);
  const isCheckingAllInstalledRef = useRef(false);
  const [isRetryingMissing, setIsRetryingMissing] = useState(false);
  const [syncLogs, setSyncLogs] = useState<{ id: string, label: string, status: 'pending' | 'success' | 'error' | 'skipped', message?: string }[]>([]);
  const [isSyncPopupMinimized, setIsSyncPopupMinimized] = useState(false);
  const [cloningRepos, setCloningRepos] = useState<CloningRepo[]>([]);
  const [inspectingCloneRepo, setInspectingCloneRepo] = useState<CloningRepo | null>(null);
  const [deleteConfirmRepos, setDeleteConfirmRepos] = useState<GroupedRepo[] | null>(null);
  const [isAppStarting, setIsAppStarting] = useState(true);
  const [isFileDraggingOver, setIsFileDraggingOver] = useState(false);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const [loadingText, setLoadingText] = useState("SkillHub载入中…");
  const [viewMode, setViewMode] = useState<'grid' | 'categorized'>('categorized');
  const skillLibrarySelectorRef = useRef<SkillLibrarySelectorRef>(null);
  const isDraggingRef = useRef(false);

  // 智能引用提示词弹窗状态
  const [promptModal, setPromptModal] = useState<{ isOpen: boolean; skillName: string; content: string; loading: boolean }>({
    isOpen: false, skillName: '', content: '', loading: false,
  });

  const [confirmData, setConfirmData] = useState<{ title: string, message: string, isOpen: boolean, showCancel?: boolean, confirmText?: string, confirmButtonClassName?: string, onConfirm: () => void, onCancel: () => void } | null>(null);

  const waitConfirm = (message: string, title: string = "确认操作", showCancel: boolean = true, confirmText: string = "确认", confirmButtonClassName?: string) => new Promise<boolean>(resolve => {
    setConfirmData({
      title,
      message,
      isOpen: true,
      showCancel,
      confirmText,
      confirmButtonClassName,
      onConfirm: () => { setConfirmData(null); resolve(true); },
      onCancel: () => { setConfirmData(null); resolve(false); }
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
  const syncLogsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleWorkspaceSelect = (id: string | null) => {
    setSelectedWorkspaceId(id);
    if (id) {
      localStorage.setItem("skillhub_selected_workspace", id);
      invoke("refresh_app_menu", { selectedId: id }).catch(console.error);
    } else {
      localStorage.removeItem("skillhub_selected_workspace");
      invoke("refresh_app_menu", { selectedId: null }).catch(console.error);
    }
    emit("skillhub:workspace-changed", { id }).catch(() => {});
    navigateTo('skill-home', '技能库', { ...currentTab?.context, filter: 'all', selectedTag: 'all', activeView: 'all', repoId: undefined });
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
      setLibraryRefreshNonce(n => n + 1);

      // 获取当前可用的关联应用
      if (fetchedSkills.length > 0 && openWithApps.length === 0) {
        invoke<{ name: string, path: string, icon_base64?: string }[]>('get_open_with_apps', { path: fetchedSkills[0].local_path })
          .then(apps => setOpenWithApps(apps))
          .catch(console.error);
      }

      return fetchedDirs;
    } catch (e) {
      console.error("Failed to load data", e);
      return [];
    }
  };

  // 当处于技能详情页时，确保当前技能在全局缓存中存在
  useEffect(() => {
    if (currentTab?.type === 'skill-detail' && currentTab.context?.skillId) {
      const targetId = currentTab.context.skillId;
      const exists = skills.some(s => s.id === targetId) || groupedRepos.some(r => r.skills.some(s => s.id === targetId));
      if (!exists && skills.length === 0) {
        fetchData();
      }
    }
  }, [currentTab?.type, currentTab?.context?.skillId, skills, groupedRepos, fetchData]);

  useEffect(() => {
    invoke("cleanup_expired_trash").catch(console.error);

    let autoSyncEnabled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const configureAutoSyncTimer = (enabled: boolean) => {
      autoSyncEnabled = enabled;
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      if (!enabled) return;

      // 仅在用户主动开启「后台自动同步」时，才启用每小时静默同步（通过 Ref 调用最新函数，严格遵守防重入锁）
      interval = setInterval(async () => {
        if (!autoSyncEnabled || isSyncingAllRef.current) return;
        try {
          const dirs = await invoke<SourceDirectory[]>("get_source_directories");
          if (dirs && dirs.length > 0) {
            handleSyncAllRef.current(false, dirs);
          }
        } catch (e) {
          console.error("Background sync failed", e);
        }
      }, 60 * 60 * 1000);
    };

    const handleGeneralSettingsChanged = (e: Event) => {
      const detail = (e as CustomEvent<GeneralSettings>).detail;
      if (detail && typeof detail.auto_sync_repos === 'boolean') {
        configureAutoSyncTimer(detail.auto_sync_repos);
      }
    };
    window.addEventListener('skillhub_general_settings_changed', handleGeneralSettingsChanged);

    Promise.all([fetchData(), getGeneralSettings()])
      .then(([dirs, settings]) => {
        configureAutoSyncTimer(!!settings.auto_sync_repos);
        if (dirs && dirs.length > 0) {
          // 仅在用户开启了「后台自动同步」时才在启动时联网同步，默认关闭避免偷跑代理/VPN 流量
          if (settings.auto_sync_repos) {
            handleSyncAllRef.current(false, dirs);
          }
          const savedId = localStorage.getItem("skillhub_selected_workspace");
          if (!savedId || !dirs.some(d => d.id === savedId)) {
            handleWorkspaceSelect(dirs[0].id);
          } else {
            handleWorkspaceSelect(savedId);
          }
        } else {
          handleWorkspaceSelect(null);
        }
      })
      .finally(() => {
        setIsAppStarting(false);
      });

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


    const isPointInMainDropZone = (pos: { x: number; y: number }) => {
      if (!mainContentRef.current) return false;
      // 在 macOS Cocoa (WKWebView) 下，Tauri/wry 返回的 draggingLocation 已经是 points (CSS 逻辑像素)，绝对不应除以 devicePixelRatio
      // 只有在 Windows (WebView2) 且高 DPI 缩放下，系统返回物理像素才需要除以 devicePixelRatio
      const isMac = /macintosh|mac os x/i.test(navigator.userAgent);
      const dpr = (!isMac && window.devicePixelRatio) ? window.devicePixelRatio : 1;
      const logicalX = pos.x / dpr;
      const logicalY = pos.y / dpr;

      const rect = mainContentRef.current.getBoundingClientRect();
      // 顶部留出 45px 容差覆盖到操作栏区域，左右精确限定在主内容区（避开侧边栏与检查器）
      const topBoundary = Math.max(0, rect.top - 45);
      return (
        logicalX >= rect.left &&
        logicalX <= rect.right &&
        logicalY >= topBoundary &&
        logicalY <= rect.bottom
      );
    };

    let isDragDropMounted = true;
    getCurrentWebviewWindow().onDragDropEvent((event) => {
      if (!isDragDropMounted) return;
      if (event.payload.type === 'over' || event.payload.type === 'enter') {
        if (isPointInMainDropZone(event.payload.position)) {
          setIsFileDraggingOver(true);
        } else {
          setIsFileDraggingOver(false);
        }
      } else if (event.payload.type === 'drop') {
        setIsFileDraggingOver(false);
        if (isPointInMainDropZone(event.payload.position)) {
          const paths = event.payload.paths;
          const targetWorkspaceId = selectedWorkspaceIdRef.current || localStorage.getItem("skillhub_selected_workspace");
          // Validate and copy
          setLoadingText("正在导入...");
          setIsAppStarting(true);
          invoke("get_source_directories").then((dirs: any) => {
            if (dirs.length === 0) {
              showToast("你还没有技能库，请先创建", "error");
              setIsAppStarting(false);
              return;
            }
            const effectiveWorkspaceId = (!targetWorkspaceId || targetWorkspaceId === "all") && dirs.length === 1
              ? dirs[0].id
              : targetWorkspaceId;

            if (!effectiveWorkspaceId || effectiveWorkspaceId === "all") {
              showToast("请先在左侧选择一个具体的目标资源库再进行拖入", "error");
              setIsAppStarting(false);
              return;
            }
            const targetWorkspaceDir = dirs.find((d: any) => d.id === effectiveWorkspaceId)?.path;
            if (targetWorkspaceDir) {
              invoke("validate_and_copy_dropped_folders", {
                paths,
                targetWorkspacePath: targetWorkspaceDir
              }).then((msg) => {
                return invoke("rescan_directory", { path: targetWorkspaceDir }).then(() => {
                  return fetchData().then(() => {
                    // 自动确保切到当前目标技能库，并重置筛选为全部，确保新技能立刻展现在屏幕正中
                    if (selectedWorkspaceIdRef.current !== effectiveWorkspaceId) {
                      handleWorkspaceSelect(effectiveWorkspaceId);
                    } else {
                      navigateTo('skill-home', '技能库', { ...currentTabRef.current?.context, filter: 'all', selectedTag: 'all', activeView: 'all', repoId: undefined });
                    }
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
      } else {
        setIsFileDraggingOver(false);
      }
    });


    let unlistenCloneProgress: UnlistenFn | null = null;
    listen<{
      target_dir: string;
      percent?: number;
      stage: string;
      message: string;
      raw_line: string;
    }>("clone-progress", (event) => {
      const payload = event.payload;
      setCloningRepos(prev => prev.map(repo => {
        if (repo.path === payload.target_dir) {
          const oldLines = repo.progress?.rawLines || [];
          const newLines = payload.raw_line ? [...oldLines, payload.raw_line].slice(-200) : oldLines;
          return {
            ...repo,
            progress: {
              percent: payload.percent ?? repo.progress?.percent,
              stage: payload.stage,
              message: payload.message,
              rawLines: newLines,
            }
          };
        }
        return repo;
      }));

      setInspectingCloneRepo(prev => {
        if (prev && prev.path === payload.target_dir) {
          const oldLines = prev.progress?.rawLines || [];
          const newLines = payload.raw_line ? [...oldLines, payload.raw_line].slice(-200) : oldLines;
          return {
            ...prev,
            progress: {
              percent: payload.percent ?? prev.progress?.percent,
              stage: payload.stage,
              message: payload.message,
              rawLines: newLines,
            }
          };
        }
        return prev;
      });
    }).then(un => unlistenCloneProgress = un);

    listen("open-preferences", () => {
      getCurrentWindow().unminimize();
      getCurrentWindow().setFocus();
      setIsSettingsOpen(true);
    }).then(un => unlistenPrefs = un);

    return () => {
      if (interval) clearInterval(interval);
      window.removeEventListener('skillhub_general_settings_changed', handleGeneralSettingsChanged);
      if (unlisten) unlisten();
      if (unlistenPrefs) unlistenPrefs();
      if (unlistenCloneProgress) unlistenCloneProgress();
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
    if (isUpdatingReposRef.current) {
      showToast("正在检查更新中，请稍候...", "info");
      return;
    }
    isUpdatingReposRef.current = true;
    try {
      if (syncLogsHideTimerRef.current) {
        clearTimeout(syncLogsHideTimerRef.current);
        syncLogsHideTimerRef.current = null;
      }

      setIsSyncPopupMinimized(false);
      let totalLogs: { id: string, label: string, status: 'pending' | 'success' | 'error' | 'skipped', message?: string }[] =
        repos.map(r => ({ id: r.path, label: r.name, status: 'pending', message: '' }));
      setSyncLogs(totalLogs);

      const resolveDirPath = (repo: GroupedRepo) =>
        directories.find(d => d.id === repo.source_dir_id)?.path ||
        directories.find(d => repo.path.startsWith(d.path))?.path ||
        null;

      const dirsToRescan = new Set<string>();
      let hasLocalRefreshed = false;

      for (const repo of repos) {
        if (repo.source_type === 'online') {
          totalLogs = totalLogs.map(l => l.id === repo.path ? { ...l, status: 'skipped', message: '线上跳过' } : l);
          setSyncLogs([...totalLogs]);
          continue;
        }

        const dirPath = resolveDirPath(repo);

        if (repo.source_type !== 'github') {
          // 单独针对本地仓库点击“重新扫描目录”时刷新索引；批量混合更新时跳过 Git 拉取
          if (repos.length === 1 && dirPath) {
            try {
              await invoke("rescan_directory", { path: dirPath });
              hasLocalRefreshed = true;
              totalLogs = totalLogs.map(l => l.id === repo.path ? { ...l, status: 'success', message: '已刷新' } : l);
            } catch (err) {
              totalLogs = totalLogs.map(l => l.id === repo.path ? { ...l, status: 'error', message: String(err) } : l);
            }
          } else {
            totalLogs = totalLogs.map(l => l.id === repo.path ? { ...l, status: 'skipped', message: '本地跳过' } : l);
          }
          setSyncLogs([...totalLogs]);
          continue;
        }

        try {
          const msg = await invoke<string>("pull_single_repo", { path: repo.path });
          if (msg === '已是最新') {
            totalLogs = totalLogs.map(l => l.id === repo.path ? { ...l, status: 'skipped', message: msg } : l);
          } else {
            totalLogs = totalLogs.map(l => l.id === repo.path ? { ...l, status: 'success', message: msg } : l);
            if (dirPath) dirsToRescan.add(dirPath);
          }
          setSyncLogs([...totalLogs]);
        } catch (err) {
          totalLogs = totalLogs.map(l => l.id === repo.path ? { ...l, status: 'error', message: String(err) } : l);
          setSyncLogs([...totalLogs]);
        }
      }

      // 仅对实际发生变更的目录重新扫描，减少无谓磁盘 IO
      if (dirsToRescan.size > 0) {
        for (const dirPath of dirsToRescan) {
          await invoke("rescan_directory", { path: dirPath }).catch(console.error);
        }
        await fetchData();
      } else if (hasLocalRefreshed) {
        await fetchData();
      }

      syncLogsHideTimerRef.current = setTimeout(() => {
        setSyncLogs([]);
        syncLogsHideTimerRef.current = null;
      }, 5000);
    } finally {
      isUpdatingReposRef.current = false;
    }
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

  // 执行将技能安装到特定仓库目录
  const executeInstallSkill = async (resource: ResourceItem, targetDir: SourceDirectory) => {
    const repoName = resource.name;
    const targetPath = `${targetDir.path}/${repoName}`.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
    setCloningRepos(prev => [...prev, { path: targetPath, name: repoName }]);
    showToast(`正在安装「${resource.displayName}」...`);
    try {
      await invoke('import_github_skills_to_workspace', {
        url: resource.repoUrl,
        targetDir: targetPath,
        sourceDirId: targetDir.id,
      });
      setCloningRepos(prev => prev.filter(r => r.path !== targetPath));
      setInspectingCloneRepo(prev => prev?.path === targetPath ? null : prev);
      showToast(`「${resource.displayName}」安装成功`, 'success');
      await fetchData();
    } catch (err) {
      setCloningRepos(prev => prev.filter(r => r.path !== targetPath));
      setInspectingCloneRepo(prev => prev?.path === targetPath ? null : prev);
      showToast(String(err), 'error');
      throw err;
    }
  };

  // 请求安装技能：若已配置默认技能库则直接安装，否则弹出选择弹窗
  const requestInstallSkill = async (resource: ResourceItem) => {
    if (directories.length === 0) {
      showToast('请先在侧边栏或设置中添加技能仓库目录', 'error');
      return;
    }

    const defaultDirId = getDefaultInstallDirId();
    const defaultDir = defaultDirId ? directories.find(d => d.id === defaultDirId) : null;

    if (defaultDir) {
      await executeInstallSkill(resource, defaultDir);
    } else {
      setInstallTargetResource(resource);
    }
  };

  // 实际执行单个远程技能安装（支持单技能精准提取 & 整仓技能包克隆）
  const executeInstallRemoteSkill = async (
    target: RemoteSkillTarget,
    targetDir: SourceDirectory,
    silentSuccess = false
  ): Promise<boolean> => {
    const key = buildRemoteSkillKey(target.owner, target.repo, target.skillName, target.subpath);
    setInstallingRemoteKeys(prev => new Set(prev).add(key));
    try {
      if (target.installMode === 'repo') {
        const baseName = target.repo;
        const guessPath = `${targetDir.path}/${baseName}`.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
        const hasNameCollision = groupedRepos.some(
          r => r.path.replace(/\\/g, '/') === guessPath
        );
        const folderName = hasNameCollision ? `${target.owner}-${baseName}` : baseName;
        const targetPath = `${targetDir.path}/${folderName}`.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
        const repoUrl = target.repoUrl || `https://${target.host || 'github.com'}/${target.owner}/${target.repo}`;

        setCloningRepos(prev => [...prev, { path: targetPath, name: folderName }]);
        if (!silentSuccess) {
          showToast(`正在克隆技能仓库「${target.displayName}」到「${targetDir.label}」...`, 'info');
        }
        try {
          await invoke('import_github_skills_to_workspace', {
            url: repoUrl,
            targetDir: targetPath,
            sourceDirId: targetDir.id,
          });
        } finally {
          setCloningRepos(prev => prev.filter(r => r.path !== targetPath));
        }
      } else {
        if (!silentSuccess) {
          showToast(`正在安装「${target.displayName}」到「${targetDir.label}」...`, 'info');
        }
        await invoke('install_remote_subskill_to_workspace', {
          host: target.host || 'github.com',
          owner: target.owner,
          repo: target.repo,
          branch: target.branch || null,
          skillName: target.skillName,
          subpath: target.subpath ?? null,
          targetSourceDirId: targetDir.id,
          folderNameOverride: null,
          provider: target.provider,
          overwrite: false,
          githubToken: getGitHubToken() || null,
        });
      }

      if (!silentSuccess) {
        showToast(`「${target.displayName}」已安装到「${targetDir.label}」`, 'success');
      }
      await fetchData();
      return true;
    } catch (err) {
      if (!silentSuccess) {
        showToast(`安装「${target.displayName}」失败: ${err}`, 'error');
      }
      console.error('Install remote skill failed:', err);
      return false;
    } finally {
      setInstallingRemoteKeys(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  // 批量顺序安装多个远程技能（如专题榜「一键安装未装技能」）
  const executeBatchInstallRemoteSkills = async (
    targets: RemoteSkillTarget[],
    targetDir: SourceDirectory,
    label: string
  ) => {
    if (targets.length === 0) return;
    showToast(`开始将「${label}」中的 ${targets.length} 个技能安装至「${targetDir.label}」...`, 'info');
    let okCount = 0;
    let failCount = 0;
    for (const t of targets) {
      const ok = await executeInstallRemoteSkill(t, targetDir, true);
      if (ok) okCount += 1;
      else failCount += 1;
    }
    if (failCount === 0) {
      showToast(`批量安装完成：成功安装 ${okCount} 个技能至「${targetDir.label}」`, 'success');
    } else {
      showToast(`批量安装结束：成功 ${okCount} 个，失败 ${failCount} 个`, 'info');
    }
  };

  // 请求安装单个远程技能（按默认技能库配置直装或弹出目标库选择器）
  const requestInstallRemoteSkill = async (target: RemoteSkillTarget) => {
    if (directories.length === 0) {
      showToast('请先在技能库侧边栏或设置中添加本地技能库目录', 'error');
      return;
    }
    const defaultDirId = getDefaultInstallDirId();
    const defaultDir = defaultDirId ? directories.find(d => d.id === defaultDirId) : null;
    if (defaultDir) {
      await executeInstallRemoteSkill(target, defaultDir);
    } else {
      setPendingRemoteInstall({ targets: [target] });
    }
  };

  // 请求批量安装一组远程技能
  const requestBatchInstallRemoteSkills = async (targets: RemoteSkillTarget[], label: string) => {
    if (targets.length === 0) return;
    if (directories.length === 0) {
      showToast('请先在技能库侧边栏或设置中添加本地技能库目录', 'error');
      return;
    }
    const defaultDirId = getDefaultInstallDirId();
    const defaultDir = defaultDirId ? directories.find(d => d.id === defaultDirId) : null;
    if (defaultDir) {
      await executeBatchInstallRemoteSkills(targets, defaultDir, label);
    } else {
      setPendingRemoteInstall({ targets, batchLabel: label });
    }
  };

  // 根据远程技能目标匹配本地已安装的溯源记录、所属仓库与精确技能实体
  const resolveLocalMatchForRemoteTarget = useCallback(
    (target: RemoteSkillTarget) => {
      const source = resourceHub.findInstalledSource(target);
      const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');

      let repo = source
        ? groupedRepos.find(r => norm(r.path) === norm(source.localPath))
        : undefined;

      if (!repo) {
        const skLower = target.skillName.trim().toLowerCase();
        const repoLower = target.repo.trim().toLowerCase();
        repo =
          groupedRepos.find(r => r.name.toLowerCase() === skLower) ||
          groupedRepos.find(r => r.name.toLowerCase() === repoLower);
      }

      let matchedSkill: Skill | undefined;
      if (repo) {
        if (repo.skills.length === 1) {
          matchedSkill = repo.skills[0];
        } else {
          const skLower = target.skillName.trim().toLowerCase();
          const subLower = (target.subpath || '').trim().replace(/^\/+|\/+$/g, '').toLowerCase();
          matchedSkill =
            (subLower
              ? repo.skills.find(s => {
                  const normLocal = s.local_path.replace(/\\/g, '/').toLowerCase();
                  return (
                    normLocal.includes(`/${subLower}/`) ||
                    normLocal.endsWith(`/${subLower}`)
                  );
                })
              : undefined) ||
            repo.skills.find(s => s.name.toLowerCase() === skLower);
        }
      }

      const openFolderPath =
        source?.provider === 'git-clone' && matchedSkill?.local_path
          ? matchedSkill.local_path.replace(/[/\\][^/\\]+$/, '')
          : source?.localPath || repo?.path || null;

      const uninstallRootPath = source?.localPath || repo?.path || null;

      return { source, repo, matchedSkill, openFolderPath, uninstallRootPath };
    },
    [resourceHub, groupedRepos]
  );

  // 已安装菜单：查看技能（跳转到本地技能库详情或对应技能包）
  const handleViewInstalledRemoteSkill = useCallback(
    (target: RemoteSkillTarget) => {
      const { repo, matchedSkill } = resolveLocalMatchForRemoteTarget(target);
      if (!repo && !matchedSkill) {
        showToast(`未在本地技能库中定位到「${target.displayName || target.skillName}」`, 'error');
        return;
      }

      const targetWsId = repo?.source_dir_id || matchedSkill?.source_dir_id || selectedWorkspaceId || null;
      if (targetWsId && targetWsId !== selectedWorkspaceId) {
        setSelectedWorkspaceId(targetWsId);
        invoke("refresh_app_menu", { selectedId: targetWsId }).catch(console.error);
        emit("skillhub:workspace-changed", { id: targetWsId }).catch(() => {});
      }

      setActiveModuleState('skills');
      if (matchedSkill) {
        navigateTo(
          'skill-detail',
          matchedSkill.name,
          {
            repoId: repo && isCollectionRepo(repo) ? repo.id : undefined,
            workspaceId: targetWsId || undefined,
            activeView: 'all',
            selectedTag: 'all',
            skillId: matchedSkill.id,
          },
          'FileText'
        );
      } else if (repo) {
        navigateTo(
          'skill-repo',
          repo.name,
          {
            repoId: repo.id,
            workspaceId: targetWsId || undefined,
            activeView: 'all',
            selectedTag: 'all',
          },
          'Folder'
        );
      }
    },
    [resolveLocalMatchForRemoteTarget, selectedWorkspaceId, navigateTo]
  );

  // 已安装菜单：打开本地目录
  const handleOpenInstalledRemoteFolder = useCallback(
    (target: RemoteSkillTarget) => {
      const { openFolderPath } = resolveLocalMatchForRemoteTarget(target);
      if (!openFolderPath) {
        showToast(`未找到「${target.displayName || target.skillName}」的本地目录`, 'error');
        return;
      }
      invoke('open_local_folder', { path: openFolderPath }).catch(err => {
        console.error('Open installed skill folder failed:', err);
        showToast(`打开目录失败: ${err}`, 'error');
      });
    },
    [resolveLocalMatchForRemoteTarget]
  );

  // 已安装菜单：确认并卸载本地技能
  const handleUninstallRemoteSkill = useCallback(
    async (target: RemoteSkillTarget) => {
      const { source, repo, uninstallRootPath } = resolveLocalMatchForRemoteTarget(target);
      if (!uninstallRootPath) {
        showToast(`未在本地技能库中找到「${target.displayName || target.skillName}」的安装路径`, 'error');
        return;
      }

      const isWholeMultiSkillPack =
        source?.provider === 'git-clone' && repo && repo.skills.length > 1;
      const confirmMsg = isWholeMultiSkillPack
        ? `「${target.displayName || target.skillName}」属于本地技能包「${repo.name}」（共 ${repo.skills.length} 个技能）。卸载将删除整个技能包目录并解绑相关同步链接，确定继续吗？`
        : `确定要卸载「${target.displayName || target.skillName}」吗？该技能的本地目录及文件将被永久删除。`;

      const confirmed = await waitConfirm(
        confirmMsg,
        '确认卸载技能',
        true,
        '确认卸载',
        'bg-red-600 hover:bg-red-700'
      );
      if (!confirmed) return;

      try {
        showToast(`正在卸载「${target.displayName || target.skillName}」...`, 'info');
        await invoke('delete_skill_by_path', { path: uninstallRootPath });
        showToast(`「${target.displayName || target.skillName}」已卸载`, 'success');
        await fetchData();
      } catch (err) {
        console.error('Uninstall remote skill failed:', err);
        showToast(`卸载失败: ${err}`, 'error');
      }
    },
    [resolveLocalMatchForRemoteTarget, fetchData]
  );

  // 已安装页：检查并更新单个已安装技能/仓库
  const handleCheckUpdateInstalled = useCallback(
    async (localPath: string, displayName: string) => {
      setUpdatingInstalledPaths(prev => new Set(prev).add(localPath));
      try {
        const msg = await invoke<string>('pull_single_repo', { path: localPath });
        if (msg === '已是最新') {
          showToast(`「${displayName}」已是最新版本`, 'info');
        } else {
          await invoke('rescan_directory', { path: localPath }).catch(() => {});
          await fetchData();
          showToast(`「${displayName}」已更新至最新版本`, 'success');
        }
      } catch (err) {
        console.error('Check update installed skill failed:', err);
        showToast(`检查「${displayName}」更新失败: ${err}`, 'error');
      } finally {
        setUpdatingInstalledPaths(prev => {
          const next = new Set(prev);
          next.delete(localPath);
          return next;
        });
      }
    },
    [fetchData]
  );

  // 已安装页：批量检查全部已安装技能更新（带防重入锁）
  const handleCheckUpdateAllInstalled = useCallback(
    async (items: Array<{ path: string; name: string }>) => {
      if (items.length === 0) return;
      if (isCheckingAllInstalledRef.current) {
        showToast('正在批量检查更新，请稍候...', 'info');
        return;
      }
      isCheckingAllInstalledRef.current = true;
      try {
        showToast(`正在检查 ${items.length} 项已安装技能的上游更新...`, 'info');
        let updatedCount = 0;
        let latestCount = 0;
        let failCount = 0;
        const dirsToRescan = new Set<string>();
        const normPath = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');

        for (const item of items) {
          setUpdatingInstalledPaths(prev => new Set(prev).add(item.path));
          try {
            const msg = await invoke<string>('pull_single_repo', { path: item.path });
            if (msg === '已是最新') {
              latestCount += 1;
            } else {
              const normItem = normPath(item.path);
              const matchedDir = directories.find(
                d => normItem === normPath(d.path) || normItem.startsWith(`${normPath(d.path)}/`)
              );
              dirsToRescan.add(matchedDir ? matchedDir.path : item.path);
              updatedCount += 1;
            }
          } catch {
            failCount += 1;
          } finally {
            setUpdatingInstalledPaths(prev => {
              const next = new Set(prev);
              next.delete(item.path);
              return next;
            });
          }
        }

        if (dirsToRescan.size > 0) {
          for (const dirPath of dirsToRescan) {
            await invoke('rescan_directory', { path: dirPath }).catch(() => {});
          }
          await fetchData();
        } else if (updatedCount > 0) {
          await fetchData();
        }
        if (failCount > 0) {
          showToast(`更新检查完成：更新 ${updatedCount} 项，已是最新 ${latestCount} 项，失败 ${failCount} 项`, 'info');
        } else if (updatedCount > 0) {
          showToast(`已成功更新 ${updatedCount} 项技能（${latestCount} 项已是最新）`, 'success');
        } else {
          showToast(`全部 ${latestCount} 项已安装技能均为最新版本`, 'success');
        }
      } finally {
        isCheckingAllInstalledRef.current = false;
      }
    },
    [fetchData, directories]
  );

  // 确认从弹窗选择目标技能库
  const handleConfirmInstallTarget = async (targetDir: SourceDirectory, rememberDefault: boolean) => {
    if (rememberDefault) {
      setDefaultInstallDirId(targetDir.id);
    }
    if (pendingRemoteInstall) {
      const payload = pendingRemoteInstall;
      setPendingRemoteInstall(null);
      if (payload.targets.length === 1 && !payload.batchLabel) {
        await executeInstallRemoteSkill(payload.targets[0], targetDir);
      } else {
        await executeBatchInstallRemoteSkills(
          payload.targets,
          targetDir,
          payload.batchLabel || '所选技能'
        );
      }
      return;
    }
    if (installTargetResource) {
      const res = installTargetResource;
      setInstallTargetResource(null);
      await executeInstallSkill(res, targetDir);
    }
  };

  // 安装提示词
  const handleInstallPrompt = async (resource: ResourceItem) => {
    const content = resource.promptContent || '';
    if (!content) {
      showToast('暂无提示词内容', 'error');
      return;
    }
    await invoke('create_prompt', {
      title: resource.displayName,
      content,
      description: resource.description,
      groupId: null,
      tags: resource.tags.join(','),
      variables: resource.promptVariables || null,
    });
    showToast(`「${resource.displayName}」已添加到提示词库`, 'success');
    setPromptRefreshKey(k => k + 1);
  };

  // 卸载技能：物理删除本地技能/仓库目录，解绑 Agent 软链接
  const handleUninstallSkill = async (resource: ResourceItem) => {
    try {
      const match = findLocalRepoOrSkillForResource(resource, groupedRepos, skills);
      let targetPath = match?.path;

      if (!targetPath) {
        for (const dir of directories) {
          const guessPath = `${dir.path}/${resource.name}`.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
          const repoExists = groupedRepos.some(r => r.path === guessPath);
          if (repoExists) {
            targetPath = guessPath;
            break;
          }
        }
      }

      if (!targetPath) {
        const matchedSkill = skills.find(s => s.name.toLowerCase() === resource.name.toLowerCase());
        if (matchedSkill && matchedSkill.local_path) {
          targetPath = matchedSkill.local_path;
        }
      }

      if (!targetPath) {
        showToast(`未在本地技能库中找到「${resource.displayName}」的安装路径`, 'error');
        return;
      }

      showToast(`正在卸载「${resource.displayName}」...`);
      await invoke('delete_skill_by_path', { path: targetPath });
      showToast(`「${resource.displayName}」已成功卸载`, 'success');
      await fetchData();
    } catch (err) {
      console.error('Uninstall skill failed:', err);
      showToast(`卸载失败: ${err}`, 'error');
      throw err;
    }
  };

  // 卸载提示词：从提示词库中删除
  const handleUninstallPrompt = async (resource: ResourceItem) => {
    try {
      const matchedPrompt = findLocalPromptForResource(resource, allPrompts);
      if (!matchedPrompt) {
        showToast(`未在本地提示词库中找到「${resource.displayName}」`, 'error');
        return;
      }

      await invoke('hard_delete_prompts', { ids: [matchedPrompt.id] });
      showToast(`「${resource.displayName}」已从提示词库中移除`, 'success');
      setPromptRefreshKey(k => k + 1);
    } catch (err) {
      console.error('Uninstall prompt failed:', err);
      showToast(`移除提示词失败: ${err}`, 'error');
      throw err;
    }
  };

  // 将远程开源提示词保存到本地「提示词」库（Fabric 类型自动按需拉取 system.md 正文）
  const handleInstallRemotePrompt = async (
    item: RemotePromptItem,
    contentOverride?: string,
    variablesJson?: string | null
  ) => {
    if (installingPromptIds.has(item.id)) return;
    setInstallingPromptIds(prev => {
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });
    try {
      let finalContent = (contentOverride ?? item.content ?? '').trim();
      if (!finalContent && item.needsContentFetch && item.slug) {
        finalContent = (await promptHub.fetchFabricContent(item.slug)).trim();
      }
      if (!finalContent) {
        showToast('提示词正文为空，暂无法保存', 'error');
        return;
      }

      // 若未显式传入变量 JSON，则自动提取 {{var}} 占位符
      let varsPayload = variablesJson ?? null;
      if (!varsPayload) {
        const foundVars = new Set<string>();
        const re = /\{\{\s*([^{}\n]{1,40}?)\s*\}\}/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(finalContent)) !== null) {
          const name = m[1].trim();
          if (name) foundVars.add(name);
        }
        if (foundVars.size > 0) {
          varsPayload = JSON.stringify(
            Array.from(foundVars).map(name => ({ name, defaultValue: '' }))
          );
        }
      }

      const tagList = Array.from(
        new Set([...(item.tags || []), ...(item.categoryLabel ? [item.categoryLabel] : [])])
      ).slice(0, 6);

      await invoke('create_prompt', {
        title: item.title,
        content: finalContent,
        description: item.description || null,
        groupId: null,
        tags: tagList.join(','),
        variables: varsPayload,
      });
      showToast(`「${item.title}」已添加到提示词库`, 'success');
      setPromptRefreshKey(k => k + 1);
    } catch (err) {
      console.error('Install remote prompt failed:', err);
      showToast(`添加失败: ${err}`, 'error');
    } finally {
      setInstallingPromptIds(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  // 从本地提示词库移除远程提示词
  const handleUninstallRemotePrompt = async (item: RemotePromptItem) => {
    const targetTitle = item.title.trim().toLowerCase();
    const matched = allPrompts.find(p => p.title?.trim().toLowerCase() === targetTitle);
    if (!matched) {
      showToast(`未在本地提示词库中找到「${item.title}」`, 'error');
      return;
    }
    try {
      await invoke('hard_delete_prompts', { ids: [matched.id] });
      showToast(`已从提示词库移除「${item.title}」`, 'success');
      setPromptRefreshKey(k => k + 1);
    } catch (err) {
      console.error('Uninstall remote prompt failed:', err);
      showToast(`移除失败: ${err}`, 'error');
    }
  };

  // 跳转到本地提示词库查看已添加的提示词详情
  const handleViewInstalledPrompt = (item: RemotePromptItem) => {
    const targetTitle = item.title.trim().toLowerCase();
    const matched = allPrompts.find(p => p.title?.trim().toLowerCase() === targetTitle);
    setActiveModuleState('prompts');
    if (matched) {
      navigateTo('prompt-detail', matched.title, { promptId: matched.id, isEditing: false }, 'FileText');
    } else {
      navigateTo('prompt-home', '提示词', { promptFilter: 'all' }, 'MessageSquareQuote');
    }
  };

  const openAddDialog = (tab: "local" | "github" | "online" | null = null) => {
    if (!selectedWorkspaceId || selectedWorkspaceId === "all") {
      if (directories.length === 0) {
        showToast("你还没有技能库，请先创建", "error");
      } else {
        showToast("请先在左侧选择一个具体的技能库再导入", "error");
      }
      return;
    }
    setAddDialogTab(tab);
    setIsAddDialogOpen(true);
  };

  const handleAddRepo = () => {
    openAddDialog();
  };

  const handleCancelClone = async (e: React.MouseEvent, targetPath?: string) => {
    e.stopPropagation();
    if (!targetPath) return;
    try {
      await invoke("cancel_github_clone", { targetDir: targetPath });
      setCloningRepos(prev => prev.filter(r => r.path !== targetPath));
      showToast("已删除并清理本地已拉取文件", "info");
    } catch (err) {
      showToast(String(err), 'error');
    }
  };

  const handleSyncAll = async (isManual = true, dirsToSync = directories) => {
    if (isSyncingAllRef.current) return;

    const runId = Date.now();
    currentSyncRunId.current = runId;
    isSyncingAllRef.current = true;
    setIsSyncingAll(true);

    try {
      if (isManual) {
        if (syncLogsHideTimerRef.current) {
          clearTimeout(syncLogsHideTimerRef.current);
          syncLogsHideTimerRef.current = null;
        }
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

          let anyRepoUpdated = false;
          for (const repo of repos) {
            if (currentSyncRunId.current !== runId) break;
            try {
              const msg = await invoke<string>("pull_single_repo", { path: repo.path });
              if (currentSyncRunId.current !== runId) break; // Check again after await

              if (msg === '已是最新') {
                totalLogs = totalLogs.map(l => l.id === repo.path ? { ...l, status: 'skipped', message: msg } : l);
              } else {
                anyRepoUpdated = true;
                totalLogs = totalLogs.map(l => l.id === repo.path ? { ...l, status: 'success', message: msg } : l);
              }
              if (isManual) setSyncLogs([...totalLogs]);
            } catch (e) {
              totalLogs = totalLogs.map(l => l.id === repo.path ? { ...l, status: 'error', message: String(e) } : l);
              if (isManual) setSyncLogs([...totalLogs]);
            }
          }

          // 手动同步或存在实际更新时才重扫目录索引
          if (isManual || anyRepoUpdated) {
            await invoke("rescan_directory", { path: dir.path });
          }
        } catch (e) {
          try {
            await invoke("rescan_directory", { path: dir.path });
          } catch (err) { }
        }
      }

      if (currentSyncRunId.current === runId) {
        await fetchData();

        if (isManual) {
          syncLogsHideTimerRef.current = setTimeout(() => {
            if (currentSyncRunId.current === runId) {
              setSyncLogs([]);
            }
            syncLogsHideTimerRef.current = null;
          }, 5000); // 同步完默认5秒自动隐藏
        }
      }
    } finally {
      if (currentSyncRunId.current === runId) {
        isSyncingAllRef.current = false;
        setIsSyncingAll(false);
      }
    }
  };
  handleSyncAllRef.current = handleSyncAll;

  // 标签管理状态与统计（接入统一 tagStore，支持技能包/技能双层独立打标、计数、常用星标置顶、重命名合并、批量操作）
  const [isSkillTagManagerOpen, setIsSkillTagManagerOpen] = useState(false);
  const [skillTagManagerEditTarget, setSkillTagManagerEditTarget] = useState<string | null>(null);
  const [skillTagMetaVersion, setSkillTagMetaVersion] = useState(0);
  const [repoFavoriteVersion, setRepoFavoriteVersion] = useState(0);
  const [isSkillTagsExpanded, setIsSkillTagsExpanded] = useState(false);
  const [openTagPopoverSignal, setOpenTagPopoverSignal] = useState(0);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.module === 'skills') {
        setSkillTagMetaVersion(v => v + 1);
      }
    };
    window.addEventListener('skillhub:tag-meta-changed', handler);
    return () => window.removeEventListener('skillhub:tag-meta-changed', handler);
  }, []);

  useEffect(() => {
    const handleFavoriteChanged = () => setRepoFavoriteVersion(v => v + 1);
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'skillhub_repo_favorites_set') {
        setRepoFavoriteVersion(v => v + 1);
      }
    };
    window.addEventListener('skillhub:repo-favorites-changed', handleFavoriteChanged);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('skillhub:repo-favorites-changed', handleFavoriteChanged);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const baseScopedRepos = useMemo(() => {
    let result = groupedRepos.filter(repo => repo.skills.length > 0);
    if (selectedWorkspaceId !== "all") {
      result = result.filter(repo => repo.source_dir_id === selectedWorkspaceId);
    }
    if (activeTab !== "all") {
      result = result.filter(r => r.source_type === activeTab);
    }
    return result;
  }, [groupedRepos, selectedWorkspaceId, activeTab]);

  const filteredGroupedRepos = useMemo(() => {
    let result = baseScopedRepos;
    if (activeView === "starred") {
      if (!selectedRepoId) {
        // 一级视图保留双层层级：技能包按包自身星标判定，独立单技能按其技能星标判定
        result = result.filter(repo => isRepoItemStarred(repo));
      }
    } else if (activeView === "recent") {
      result = result.map(repo => {
        const matchingSkills = repo.skills.filter(s => s.use_count && s.use_count > 0).sort((a, b) => (b.use_count || 0) - (a.use_count || 0));
        return matchingSkills.length > 0 ? { ...repo, skills: matchingSkills } : null;
      }).filter(Boolean) as GroupedRepo[];
    } else if (activeView === "untagged") {
      if (selectedRepoId) {
        result = result.map(repo => {
          const matchingSkills = repo.skills.filter(s => parseTags(s.tags).length === 0);
          return matchingSkills.length > 0 ? { ...repo, skills: matchingSkills } : null;
        }).filter(Boolean) as GroupedRepo[];
      } else {
        // 一级视图保持层级：技能包按包自身标签判定，单技能按其技能标签判定
        result = result.filter(repo => parseTags(getRepoEffectiveTags(repo)).length === 0);
      }
    }

    if (selectedTag !== "all") {
      result = result.filter(repo => parseTags(getRepoEffectiveTags(repo)).includes(selectedTag));
    }
    return result;
  }, [baseScopedRepos, activeView, selectedTag, selectedRepoId, skillTagMetaVersion, repoFavoriteVersion]);

  // 按标签或「星标」筛选时，额外收集属于各技能包且单独命中的子技能（不拆散整包）
  const matchedExtraSubSkills = useMemo(() => {
    if (selectedRepoId || isFlatView) return [];
    if (selectedTag === "all" && activeView !== "starred") return [];
    const list: { skill: Skill; repo: GroupedRepo }[] = [];
    for (const repo of baseScopedRepos) {
      if (!isCollectionRepo(repo)) continue;
      for (const skill of repo.skills) {
        const matchTag = selectedTag === "all" || parseTags(skill.tags).includes(selectedTag);
        const matchStar = activeView !== "starred" || skill.is_favorite;
        if (matchTag && matchStar) {
          list.push({ skill, repo });
        }
      }
    }
    return list;
  }, [baseScopedRepos, selectedTag, activeView, selectedRepoId, isFlatView]);

  const allLibrarySkills = useMemo(() => groupedRepos.flatMap(r => r.skills), [groupedRepos]);
  const allLibraryTagItems = useMemo(
    () => collectSkillModuleTagItems(groupedRepos),
    [groupedRepos, skillTagMetaVersion]
  );

  const scopedTagItemsForSidebar = useMemo(() => {
    return collectSkillModuleTagItems(baseScopedRepos);
  }, [baseScopedRepos, skillTagMetaVersion]);

  // 侧边栏展示的标签列表：常用星标标签置顶，右侧附带技能包/技能双层引用总计数
  const skillTagStats = useMemo(() => {
    const stats = computeTagStats('skills', scopedTagItemsForSidebar);
    const starred = stats.filter(s => s.isStarred);
    const others = stats.filter(s => !s.isStarred);
    return [...starred, ...others];
  }, [scopedTagItemsForSidebar, skillTagMetaVersion]);

  const handleBatchToggleSkillTags = useCallback(async (targetSkills: Skill[], tagName: string, shouldAdd: boolean) => {
    const clean = tagName.trim().replace(/[,，]/g, '');
    if (!clean || targetSkills.length === 0) return;

    const tasks: Promise<unknown>[] = [];
    let changedCount = 0;

    for (const s of targetSkills) {
      const currentList = parseTags(s.tags);
      const exists = currentList.includes(clean);
      if (shouldAdd && exists) continue;
      if (!shouldAdd && !exists) continue;
      const nextList = shouldAdd ? [...currentList, clean] : currentList.filter(t => t !== clean);
      const nextStr = serializeTags(nextList);
      changedCount++;
      tasks.push(invoke('update_skill_tags', { id: s.id, tags: nextStr || null }));
    }

    if (changedCount === 0) return;
    if (shouldAdd) recordRecentTag('skills', clean);

    try {
      await Promise.all(tasks);
      await fetchData();
      showToast(
        changedCount > 1
          ? `已为 ${changedCount} 个技能${shouldAdd ? '添加' : '移除'}标签 #${clean}`
          : `已${shouldAdd ? '添加' : '移除'}标签 #${clean}`,
        'success'
      );
    } catch (e) {
      showToast(`更新标签失败: ${e}`, 'error');
    }
  }, [fetchData]);

  // 为一级卡片（技能包或独立单技能，支持混合多选）添加/移除标签：技能包仅打在包自身，单技能打在技能实体
  const handleBatchToggleRepoItemsTags = useCallback(async (targetRepos: GroupedRepo[], tagName: string, shouldAdd: boolean) => {
    const clean = tagName.trim().replace(/[,，]/g, '');
    if (!clean || targetRepos.length === 0) return;

    const singleSkillTasks: Promise<unknown>[] = [];
    let changedCount = 0;

    for (const repo of targetRepos) {
      const currentList = parseTags(getRepoEffectiveTags(repo));
      const exists = currentList.includes(clean);
      if (shouldAdd && exists) continue;
      if (!shouldAdd && !exists) continue;

      const nextList = shouldAdd ? [...currentList, clean] : currentList.filter(t => t !== clean);
      const nextStr = serializeTags(nextList);
      changedCount++;

      if (isCollectionRepo(repo)) {
        setRepoTags(repo.id, nextStr);
      } else if (repo.skills[0]) {
        singleSkillTasks.push(invoke('update_skill_tags', { id: repo.skills[0].id, tags: nextStr || null }));
      }
    }

    if (changedCount === 0) return;
    if (shouldAdd) recordRecentTag('skills', clean);

    try {
      if (singleSkillTasks.length > 0) {
        await Promise.all(singleSkillTasks);
        await fetchData();
      }
      showToast(
        changedCount > 1
          ? `已为 ${changedCount} 项${shouldAdd ? '添加' : '移除'}标签 #${clean}`
          : `已${shouldAdd ? '添加' : '移除'}标签 #${clean}`,
        'success'
      );
    } catch (e) {
      showToast(`更新标签失败: ${e}`, 'error');
    }
  }, [fetchData]);

  const handleRenameSkillTag = useCallback(async (oldName: string, newName: string) => {
    const cleanOld = oldName.trim();
    const cleanNew = newName.trim().replace(/[,，]/g, '');
    if (!cleanOld || !cleanNew || cleanOld === cleanNew) return;

    const affected = allLibrarySkills.filter(s => parseTags(s.tags).includes(cleanOld));
    await Promise.all(
      affected.map(s => {
        const nextList = parseTags(s.tags).map(t => (t === cleanOld ? cleanNew : t));
        const nextStr = serializeTags(nextList);
        return invoke('update_skill_tags', { id: s.id, tags: nextStr || null });
      })
    );

    renameRepoTagInStore(cleanOld, cleanNew);
    renameTagInMeta('skills', cleanOld, cleanNew);
    if (selectedTag === cleanOld) {
      setSelectedTag(cleanNew);
    }
    await fetchData();
  }, [allLibrarySkills, fetchData, selectedTag]);

  const handleDeleteSkillTags = useCallback(async (tagNames: string[]) => {
    if (tagNames.length === 0) return;
    const targetSet = new Set(tagNames);
    const affected = allLibrarySkills.filter(s => parseTags(s.tags).some(t => targetSet.has(t)));

    await Promise.all(
      affected.map(s => {
        const nextList = parseTags(s.tags).filter(t => !targetSet.has(t));
        const nextStr = serializeTags(nextList);
        return invoke('update_skill_tags', { id: s.id, tags: nextStr || null });
      })
    );

    deleteRepoTagsInStore(tagNames);
    tagNames.forEach(name => removeTagFromMeta('skills', name));
    if (targetSet.has(selectedTag)) {
      setActiveView('all', '全部技能', 'LayoutGrid');
    }
    await fetchData();
  }, [allLibrarySkills, fetchData, selectedTag]);

  // 构建一级仓库/单技能卡片的右键标签子菜单
  const buildRepoTagSubmenu = useCallback((targetRepos: GroupedRepo[]): ContextMenuItem => {
    const quickTags = skillTagStats.slice(0, 10);
    return {
      id: 'set_tags',
      label: targetRepos.length > 1 ? `设置标签 (${targetRepos.length} 项)` : '设置标签',
      icon: <Tag size={14} />,
      children: [
        {
          id: 'open_tag_popover',
          label: '打开标签面板...',
          icon: <Tag size={14} />,
          onClick: () => {
            setIsInspectorOpen(true);
            setOpenTagPopoverSignal(n => n + 1);
          },
        },
        ...(quickTags.length > 0 ? [{ id: 'tag_quick_sep', label: '', separator: true }] : []),
        ...quickTags.map(t => {
          const ownedCount = targetRepos.filter(r => parseTags(getRepoEffectiveTags(r)).includes(t.name)).length;
          const allHave = targetRepos.length > 0 && ownedCount === targetRepos.length;
          const someHave = ownedCount > 0 && ownedCount < targetRepos.length;
          return {
            id: `quick_repo_tag_${t.name}`,
            label: `#${t.name}`,
            icon: allHave
              ? <Check size={14} className="text-[var(--color-primary)]" />
              : someHave
                ? <Minus size={14} className="text-amber-500" />
                : t.isStarred
                  ? <Star size={14} className="fill-amber-400 text-amber-400" />
                  : undefined,
            onClick: () => handleBatchToggleRepoItemsTags(targetRepos, t.name, !allHave),
          };
        }),
        { id: 'tag_manage_sep', label: '', separator: true },
        {
          id: 'manage_all_tags',
          label: '管理全部标签...',
          icon: <SlidersHorizontal size={14} />,
          onClick: () => {
            setSkillTagManagerEditTarget(null);
            setIsSkillTagManagerOpen(true);
          },
        },
      ],
    };
  }, [skillTagStats, handleBatchToggleRepoItemsTags]);

  // 共用右键子菜单：快速勾选/移除常用标签 + 打开 Eagle 风格悬浮面板 + 管理面板
  const buildSkillTagSubmenu = useCallback((targetSkills: Skill[]): ContextMenuItem => {
    const quickTags = skillTagStats.slice(0, 10);
    return {
      id: 'set_tags',
      label: targetSkills.length > 1 ? `设置标签 (${targetSkills.length} 个技能)` : '设置标签',
      icon: <Tag size={14} />,
      children: [
        {
          id: 'open_tag_popover',
          label: '打开标签面板...',
          icon: <Tag size={14} />,
          onClick: () => {
            setIsInspectorOpen(true);
            setOpenTagPopoverSignal(n => n + 1);
          },
        },
        ...(quickTags.length > 0 ? [{ id: 'tag_quick_sep', label: '', separator: true }] : []),
        ...quickTags.map(t => {
          const ownedCount = targetSkills.filter(s => parseTags(s.tags).includes(t.name)).length;
          const allHave = targetSkills.length > 0 && ownedCount === targetSkills.length;
          const someHave = ownedCount > 0 && ownedCount < targetSkills.length;
          return {
            id: `quick_tag_${t.name}`,
            label: `#${t.name}`,
            icon: allHave
              ? <Check size={14} className="text-[var(--color-primary)]" />
              : someHave
                ? <Minus size={14} className="text-amber-500" />
                : t.isStarred
                  ? <Star size={14} className="fill-amber-400 text-amber-400" />
                  : undefined,
            onClick: () => handleBatchToggleSkillTags(targetSkills, t.name, !allHave),
          };
        }),
        { id: 'tag_manage_sep', label: '', separator: true },
        {
          id: 'manage_all_tags',
          label: '管理全部标签...',
          icon: <SlidersHorizontal size={14} />,
          onClick: () => {
            setSkillTagManagerEditTarget(null);
            setIsSkillTagManagerOpen(true);
          },
        },
      ],
    };
  }, [skillTagStats, handleBatchToggleSkillTags]);

  const buildSidebarTagContextMenu = useCallback((tagStat: TagStatItem): ContextMenuItem[] => [
    {
      id: 'toggle_star_tag',
      label: tagStat.isStarred ? '取消常用' : '设为常用',
      icon: <Star size={14} className={tagStat.isStarred ? 'fill-amber-400 text-amber-400' : ''} />,
      onClick: () => {
        toggleStarTag('skills', tagStat.name);
        showToast(tagStat.isStarred ? `已取消常用 #${tagStat.name}` : `已设为常用标签 #${tagStat.name}`);
      },
    },
    {
      id: 'rename_tag',
      label: '重命名标签...',
      icon: <Edit2 size={14} />,
      onClick: () => {
        setSkillTagManagerEditTarget(tagStat.name);
        setIsSkillTagManagerOpen(true);
      },
    },
    {
      id: 'open_tag_manager',
      label: '打开标签管理面板',
      icon: <SlidersHorizontal size={14} />,
      onClick: () => {
        setSkillTagManagerEditTarget(null);
        setIsSkillTagManagerOpen(true);
      },
    },
    { id: 'sep_sidebar_tag', label: '', separator: true },
    {
      id: 'delete_sidebar_tag',
      label: '删除标签',
      icon: <Trash2 size={14} />,
      danger: true,
      onClick: async () => {
        if (tagStat.count > 0) {
          const ok = await waitConfirm(
            `确认删除标签“${tagStat.name}”吗？\n将从 ${tagStat.count} 个技能中移除该标签，不会删除技能本身。`,
            '删除标签',
            true,
            '确认删除'
          );
          if (!ok) return;
        }
        await handleDeleteSkillTags([tagStat.name]);
        showToast(`已删除标签 #${tagStat.name}`, 'success');
      },
    },
  ], [handleDeleteSkillTags, waitConfirm]);


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
        let allIds = filteredGroupedRepos.map(r => r.id);
        if (viewMode === 'categorized') {
          // CategorizedView 先渲染 collection，再渲染单技能
          const collections = filteredGroupedRepos.filter(r => r.repo_type === 'collection');
          const singles = filteredGroupedRepos.filter(r => r.repo_type !== 'collection');
          allIds = [...collections, ...singles].map(r => r.id);
        }
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
          newSet.clear();
          newSet.add(repo.id);
        }
      } else {
        newSet.clear();
        newSet.add(repo.id);
      }
      return newSet;
    });

    // 只在单选或追加选时更新 anchor，或者跨分组导致了重新单选
    if (!e?.shiftKey) {
      setLastSelectedRepoId(repo.id);
    } else if (e?.shiftKey && lastSelectedRepoId && viewMode === 'categorized') {
      const lastRepo = filteredGroupedRepos.find(r => r.id === lastSelectedRepoId);
      if (lastRepo && (lastRepo.repo_type === 'collection') !== (repo.repo_type === 'collection')) {
        setLastSelectedRepoId(repo.id);
      }
    }
  }, [filteredGroupedRepos, lastSelectedRepoId, viewMode]);

  // 单击选中技能
  const handleSelectSkill = useCallback((skill: Skill, e?: React.MouseEvent) => {
    setInspectorSelectedType('skill');
    setSelectedRepoIds(new Set());

    let visibleSkills = isFlatView
      ? filteredGroupedRepos.flatMap(r => r.skills)
      : selectedRepoId
        ? (filteredGroupedRepos.find(r => r.id === selectedRepoId)?.skills || [])
        : matchedExtraSubSkills.length > 0
          ? matchedExtraSubSkills.map(m => m.skill)
          : baseScopedRepos.filter(isCollectionRepo).flatMap(r => r.skills);

    if (viewMode === 'grid' && !isFlatView && !selectedRepoId) {
      visibleSkills = matchedExtraSubSkills.length > 0
        ? matchedExtraSubSkills.map(m => m.skill)
        : baseScopedRepos.filter(isCollectionRepo).flatMap(r => r.skills);
    }

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
  }, [filteredGroupedRepos, baseScopedRepos, matchedExtraSubSkills, selectedRepoId, isFlatView, viewMode, lastSelectedSkillId]);

  // 立即更新前端技能星标状态（支撑 0ms 乐观响应与详情页双向同步）
  const applySkillsFavoriteState = useCallback((skillIds: string[], isFavorite: boolean) => {
    const idSet = new Set(skillIds);
    setSkills(prev => prev.map(s => idSet.has(s.id) ? { ...s, is_favorite: isFavorite } : s));
    setGroupedRepos(prev =>
      prev.map(r =>
        r.skills.some(s => idSet.has(s.id))
          ? { ...r, skills: r.skills.map(s => idSet.has(s.id) ? { ...s, is_favorite: isFavorite } : s) }
          : r
      )
    );
  }, []);

  const handleToggleFavorite = useCallback(async (id: string) => {
    const currentSkill =
      skills.find(s => s.id === id) ||
      groupedRepos.flatMap(r => r.skills).find(s => s.id === id);
    const prevFavorite = currentSkill?.is_favorite ?? false;
    const nextFavorite = !prevFavorite;

    // 先做乐观更新，避免等待后端/全量刷新导致星星延迟亮灭
    applySkillsFavoriteState([id], nextFavorite);
    try {
      await invoke("toggle_skill_favorite", { id });
    } catch (e) {
      applySkillsFavoriteState([id], prevFavorite);
      showToast(`操作失败: ${e}`, "error");
    }
  }, [skills, groupedRepos, applySkillsFavoriteState]);

  const handleSetSkillsFavoriteBatch = useCallback(async (skillIds: string[], targetState: boolean) => {
    const allCurrentSkills = groupedRepos.flatMap(r => r.skills);
    const idsToToggle = skillIds.filter(id => {
      const s = allCurrentSkills.find(item => item.id === id) || skills.find(item => item.id === id);
      return s ? s.is_favorite !== targetState : true;
    });
    if (idsToToggle.length === 0) return;

    applySkillsFavoriteState(idsToToggle, targetState);
    try {
      await Promise.all(idsToToggle.map(id => invoke("toggle_skill_favorite", { id })));
    } catch (e) {
      fetchData();
      showToast(`操作失败: ${e}`, "error");
    }
  }, [skills, groupedRepos, applySkillsFavoriteState]);

  // 切换顶层卡片星标状态（技能包写入本地 favoriteStore 独立记录，独立单技能同步后端并乐观更新）
  const handleToggleRepoFavorite = useCallback(async (repo: GroupedRepo) => {
    if (isCollectionRepo(repo)) {
      toggleRepoStarred(repo.id);
      setRepoFavoriteVersion(v => v + 1);
      return;
    }
    const singleSkill = repo.skills[0];
    if (singleSkill) {
      await handleToggleFavorite(singleSkill.id);
    }
  }, [handleToggleFavorite]);

  // 批量设置顶层卡片星标状态（兼容技能包、独立单技能及混合多选）
  const handleSetReposFavoriteBatch = useCallback(async (targetRepos: GroupedRepo[], targetState: boolean) => {
    const collectionRepoIds = targetRepos.filter(isCollectionRepo).map(r => r.id);
    const singleSkillIds = targetRepos
      .filter(r => !isCollectionRepo(r) && r.skills.length === 1)
      .map(r => r.skills[0].id);

    if (collectionRepoIds.length > 0) {
      setReposStarredBatch(collectionRepoIds, targetState);
      setRepoFavoriteVersion(v => v + 1);
    }
    if (singleSkillIds.length > 0) {
      await handleSetSkillsFavoriteBatch(singleSkillIds, targetState);
    }
  }, [handleSetSkillsFavoriteBatch]);

  const handleGoBack = useCallback((e?: React.MouseEvent) => {
    if (e && (e.button === 1 || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.stopPropagation();
      openTab('skill-home', '技能库', { ...currentTab?.context, repoId: undefined, workspaceId: selectedWorkspaceId || undefined });
      return;
    }
    navigateTo('skill-home', '技能库', { ...currentTab?.context, repoId: undefined });
    setInspectorSelectedType(null);
    setSelectedRepoIds(new Set());
    setSelectedSkillIds(new Set());
  }, [currentTab, navigateTo, openTab, selectedWorkspaceId]);

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

  // 跳转到资源中心详情页
  const handleViewInStore = useCallback((resource?: ResourceItem) => {
    setActiveModuleState('resources');
    if (resource) {
      navigateTo('resource-detail', resource.displayName, {
        resourceId: resource.id,
        resourceCategory: resource.type === 'prompt' ? 'prompts' : 'discover',
        categoryName: resource.type === 'prompt' ? '提示词精选' : '发现',
      }, 'Store');
    } else {
      navigateTo('resource-home', '发现', { resourceCategory: 'discover', categoryName: '发现' }, 'Store');
    }
  }, [navigateTo]);

  const handleViewInStoreById = useCallback((resourceId: string) => {
    const res = (registryData.resources as ResourceItem[]).find(r => r.id === resourceId);
    setActiveModuleState('resources');
    navigateTo('resource-detail', res?.displayName || '资源详情', {
      resourceId,
      resourceCategory: res?.type === 'prompt' ? 'prompts' : 'discover',
      categoryName: res?.type === 'prompt' ? '提示词精选' : '发现',
    }, 'Store');
  }, [navigateTo]);

  // 构建右键菜单项
  const buildRepoContextMenu = useCallback((repo: GroupedRepo): ContextMenuItem[] => {
    const isMulti = selectedRepoIds.has(repo.id) && selectedRepoIds.size > 1;
    const targetRepos = isMulti ? filteredGroupedRepos.filter(r => selectedRepoIds.has(r.id)) : [repo];
    const storeRes = !isMulti ? findStoreResourceForRepo(repo, registryData.resources as ResourceItem[]) : undefined;
    const isSingle = !isMulti && repo.repo_type !== 'collection' && repo.skills.length === 1;
    const singleSkill = isSingle ? repo.skills[0] : null;
    const isSingleOnline = isSingle && repo.source_type === 'online';

    return [
      {
        id: 'open_current_tab', label: isMulti ? `无法批量打开` : isSingleOnline ? `打开链接` : isSingle ? `查看文档` : `打开`, icon: <ChevronRight size={14} />, onClick: () => {
          if (!isMulti) {
            if (isSingle && singleSkill) {
              if (isSingleOnline) {
                const url = singleSkill.online_url || singleSkill.local_path;
                import('@tauri-apps/plugin-opener').then(m => m.openUrl(url).catch(console.error));
              } else {
                navigateTo('skill-detail', singleSkill.name, { ...currentTab?.context, skillId: singleSkill.id }, 'FileText');
              }
            } else {
              setSelectedRepoId(repo.id);
              setInspectorSelectedType('repo');
              setSelectedRepoIds(new Set([repo.id]));
              setSelectedSkillIds(new Set());
            }
          }
        }
      },
      {
        id: 'open_new_tab', label: isMulti ? `在 ${targetRepos.length} 个新标签页中打开` : `在新标签页中打开`, icon: <Plus size={14} />, onClick: () => {
          targetRepos.forEach(r => {
            if (r.repo_type !== 'collection' && r.skills.length === 1) {
              const s = r.skills[0];
              if (r.source_type === 'online') {
                import('@tauri-apps/plugin-opener').then(m => m.openUrl(s.online_url || s.local_path).catch(console.error));
              } else {
                openTab('skill-detail', s.name, { ...currentTab?.context, skillId: s.id }, 'FileText');
              }
            } else {
              openTab('skill-repo', r.name, { repoId: r.id });
            }
          });
        }
      },
      ...(isSingle && singleSkill ? [{
        id: 'generate_prompt',
        label: '智能引用提示词',
        icon: <Sparkles size={14} />,
        onClick: () => handleGeneratePrompt(singleSkill)
      }] : []),
      ...(storeRes ? [{
        id: 'view_in_store',
        label: '在资源社区中查看',
        icon: <Globe size={14} />,
        onClick: () => handleViewInStore(storeRes)
      }] : []),
      ...(!isSingleOnline ? [{
        id: 'open_folder', label: isMulti ? `在${fileManagerName}中打开` : `在${fileManagerName}中打开`, icon: <Folder size={14} />, onClick: () => {
          targetRepos.forEach(r => invoke('open_local_folder', { path: r.path }).catch(console.error));
        }
      }] : []),
      {
        id: 'copy_path', label: isMulti ? `复制 ${targetRepos.length} 个路径` : isSingleOnline ? '复制链接' : '复制路径', icon: <Copy size={14} />, onClick: () => {
          navigator.clipboard.writeText(targetRepos.map(r => r.source_type === 'online' ? (r.skills[0]?.online_url || r.path) : r.path).join('\n'));
          showToast(isMulti ? '多个路径已复制' : isSingleOnline ? '链接已复制' : '路径已复制');
        }
      },
      { id: 'sep_repo_tag', label: '', separator: true },
      ...(() => {
        const allStarred = targetRepos.length > 0 && targetRepos.every(isRepoItemStarred);
        return [{
          id: 'favorite',
          label: isMulti ? (allStarred ? '批量取消星标' : '批量星标') : (allStarred ? '取消星标' : '星标'),
          icon: <Star size={14} className={allStarred ? 'fill-amber-400 text-amber-500' : ''} />,
          onClick: () => handleSetReposFavoriteBatch(targetRepos, !allStarred),
        }];
      })(),
      buildRepoTagSubmenu(targetRepos),
      ...(agents.length > 0 ? [
        { id: 'sep1', label: '', separator: true },
        {
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
  }, [agents, syncRecords, selectedRepoIds, filteredGroupedRepos, waitConfirm, handleViewInStore, buildRepoTagSubmenu, handleSetReposFavoriteBatch, repoFavoriteVersion]);

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

    // 从当前可见列表或所属库中筛选出当前选中的 skills（兼容平铺与按标签/星标命中子技能）
    const visibleSkills = selectedRepoId
      ? (filteredGroupedRepos.find(r => r.id === selectedRepoId)?.skills || [])
      : matchedExtraSubSkills.length > 0
        ? matchedExtraSubSkills.map(m => m.skill)
        : baseScopedRepos.flatMap(r => r.skills);
    const targetSkills = isMulti ? visibleSkills.filter(s => selectedSkillIds.has(s.id)) : [skill];
    const storeRes = !isMulti ? findStoreResourceForSkill(skill, registryData.resources as ResourceItem[], baseScopedRepos) : undefined;

    return [
      { id: 'open_in_current_tab', label: isMulti ? `无法批量打开` : '打开', icon: <ChevronRight size={14} />, onClick: () => { if (!isMulti) { navigateTo('skill-detail', skill.name, { ...currentTab?.context, skillId: skill.id }, 'FileText'); } } },
      { id: 'view_doc_new_tab', label: isMulti ? `无法批量在新标签页打开` : '在新标签页打开', icon: <ExternalLink size={14} />, onClick: () => { if (!isMulti) { openTab('skill-detail', skill.name, { ...currentTab?.context, skillId: skill.id }, 'FileText'); } } },
      ...(storeRes ? [{
        id: 'view_in_store',
        label: '在资源社区中查看',
        icon: <Globe size={14} />,
        onClick: () => handleViewInStore(storeRes)
      }] : []),
      { id: 'view_doc', label: isMulti ? `无法批量查看文档` : '查看文档', icon: <Search size={14} />, onClick: () => { if (!isMulti) { navigateTo('skill-detail', skill.name, { ...currentTab?.context, skillId: skill.id }, 'FileText'); } } },
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
      { id: 'sep_skill_tag', label: '', separator: true },
      {
        id: 'favorite',
        label: isMulti ? (targetSkills.every(s => s.is_favorite) ? '批量取消星标' : '批量星标') : (skill.is_favorite ? '取消星标' : '星标'),
        icon: <Star size={14} className={targetSkills.every(s => s.is_favorite) ? 'fill-amber-400 text-amber-500' : ''} />,
        onClick: () => handleSetSkillsFavoriteBatch(targetSkills.map(s => s.id), !targetSkills.every(s => s.is_favorite)),
      },
      buildSkillTagSubmenu(targetSkills),
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
  }, [agents, selectedSkillIds, filteredGroupedRepos, baseScopedRepos, matchedExtraSubSkills, selectedRepoId, syncRecords, handleViewInStore, buildSkillTagSubmenu, handleSetSkillsFavoriteBatch]);

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
      if ((e.metaKey || e.ctrlKey)) {
        if (e.key.toLowerCase() === 'k') {
          e.preventDefault();
          setIsSearchModalOpen(prev => !prev);
        } else if (e.key === 't') {
          e.preventDefault();
          openTab('skill-home', '技能库', { workspaceId: selectedWorkspaceId || undefined }, 'home');
        } else if (e.key.toLowerCase() === 'w') {
          e.preventDefault();
          closeTab(activeTabId);
        } else if (e.key === '[') {
          e.preventDefault();
          if (canGoBack) tabGoBack();
        } else if (e.key === ']') {
          e.preventDefault();
          if (canGoForward) tabGoForward();
        } else if (e.key === '\\') {
          e.preventDefault();
          setIsLeftSidebarOpen(prev => !prev);
        }
      }
      if (activeModule !== 'skills') return;
      // Esc 取消选中或取消删除对话框
      if (e.key === 'Escape') {
        if (deleteConfirmRepos) {
          e.preventDefault();
          setDeleteConfirmRepos(null);
          return;
        }
        if (!isAddDialogOpen && !isSettingsOpen && !isSearchModalOpen) {
          if (inspectorSelectedType) {
            handleDeselectAll();
          } else if (selectedRepoId) {
            setSelectedRepoId(null);
          }
        }
      }

      // Quick Look (空格键)
      if (e.key === ' ' && !isAddDialogOpen && !isSettingsOpen && !isSearchModalOpen && !isInput && !deleteConfirmRepos) {
        e.preventDefault();
        if (quickLookOpen) {
          setQuickLookOpen(false);
        } else {
          if (inspectorSelectedType === 'skill' && selectedSkillIds.size > 0) {
            setQuickLookOpen(true);
          } else if (inspectorSelectedType === 'repo' && selectedRepoIds.size > 0) {
            setQuickLookOpen(true);
          }
        }
        return;
      }

      // 方向键导航
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !isAddDialogOpen && !isSettingsOpen && !isSearchModalOpen && !isInput) {
        if (inspectorSelectedType === 'skill' && selectedSkillIds.size === 1) {
          e.preventDefault();
          const currentId = Array.from(selectedSkillIds)[0];
          const currentEl = document.querySelector(`[data-id="${currentId}"]`);
          if (currentEl) {
            const allEls = Array.from(document.querySelectorAll('[data-id]'));
            const nextEl = getNextElement(currentEl, e.key, allEls);
            if (nextEl) {
              const nextId = nextEl.getAttribute('data-id');
              if (nextId) {
                const nextSkill = baseScopedRepos.flatMap(r => r.skills).find(s => s.id === nextId);
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
          const currentEl = document.querySelector(`[data-id="${currentId}"]`);
          if (currentEl) {
            const allEls = Array.from(document.querySelectorAll('[data-id]'));
            const nextEl = getNextElement(currentEl, e.key, allEls);
            if (nextEl) {
              const nextId = nextEl.getAttribute('data-id');
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
        if (!isAddDialogOpen && !isSettingsOpen && !isSearchModalOpen && !isInput) {
          if (inspectorSelectedType === 'skill' && selectedSkillIds.size === 1) {
            e.preventDefault();
            const currentId = Array.from(selectedSkillIds)[0];
            const skill = baseScopedRepos.flatMap(r => r.skills).find(s => s.id === currentId);
            if (skill) {
              navigateTo('skill-detail', skill.name, { ...currentTab?.context, skillId: skill.id }, 'FileText');
            }
          } else if (inspectorSelectedType === 'repo' && selectedRepoIds.size === 1) {
            e.preventDefault();
            const currentId = Array.from(selectedRepoIds)[0];
            const repo = filteredGroupedRepos.find(r => r.id === currentId);
            if (repo) {
              if (repo.repo_type !== 'collection' && repo.skills.length === 1) {
                const s = repo.skills[0];
                if (repo.source_type === 'online') {
                  import('@tauri-apps/plugin-opener').then(m => m.openUrl(s.online_url || s.local_path).catch(console.error));
                } else {
                  navigateTo('skill-detail', s.name, { ...currentTab?.context, skillId: s.id }, 'FileText');
                }
              } else {
                setSelectedRepoId(repo.id);
                setInspectorSelectedType('repo');
                setSelectedRepoIds(new Set([repo.id]));
                setSelectedSkillIds(new Set());
              }
            }
          }
        }
      }

      // Delete / Backspace 删除选中项
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!isInput && !isAddDialogOpen && !isSettingsOpen && !isSearchModalOpen && !deleteConfirmRepos) {
          if (selectedRepoIds.size > 0 && inspectorSelectedType === 'repo') {
            e.preventDefault();
            const reposToDelete = filteredGroupedRepos.filter(r => selectedRepoIds.has(r.id));
            handleDeleteRepos({ stopPropagation: () => { } } as any, reposToDelete);
          } else if (selectedRepoId && !inspectorSelectedType) {
            e.preventDefault();
            const repoToDelete = filteredGroupedRepos.find(r => r.id === selectedRepoId);
            if (repoToDelete) {
              handleDeleteRepos({ stopPropagation: () => { } } as any, [repoToDelete]);
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
            await invoke("rescan_directory", { path: d.path }).catch(() => { });
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
    isAddDialogOpen, isSettingsOpen, isSearchModalOpen,
    handleDeselectAll,
    selectedRepoIds,
    filteredGroupedRepos,
    baseScopedRepos,
    deleteConfirmRepos,
    confirmDeleteRepos,
    selectedSkillIds,
    lastSelectedSkillId,
    lastSelectedRepoId,
    activeModule,
    fetchData,
    openTab,
    closeTab,
    activeTabId,
    canGoBack,
    canGoForward,
    tabGoBack,
    tabGoForward,
    selectedWorkspaceId
  ]);


  const getHeaderTitleStr = useCallback(() => {
    if (selectedRepoId && !isFlatView) {
      const wsLabel = directories.find(d => d.id === selectedWorkspaceId)?.label || "未知技能库";
      return filteredGroupedRepos.find(r => r.id === selectedRepoId)?.name || wsLabel;
    }
    if (selectedTag !== "all") return `标签: ${selectedTag}`;
    if (activeView === "starred") return "星标";
    if (activeView === "recent") return "最近使用";
    if (activeView === "untagged") return "未标签技能";
    if (!selectedRepoId) {
      if (currentTab?.context?.filter === 'local') return '本地技能';
      if (currentTab?.context?.filter === 'github') return 'Github技能';
      if (currentTab?.context?.filter === 'all') return '所有技能';
      if (activeView === 'all' && selectedTag === 'all') return '全部技能';
    }
    return directories.find(d => d.id === selectedWorkspaceId)?.label || "未知技能库";
  }, [isFlatView, selectedTag, activeView, selectedRepoId, filteredGroupedRepos, directories, selectedWorkspaceId, currentTab?.context?.filter]);

  const getHeaderCount = useCallback(() => {
    if (isFlatView) {
      return filteredGroupedRepos.flatMap(r => r.skills).length;
    }
    if (selectedRepoId) {
      return filteredGroupedRepos.find(r => r.id === selectedRepoId)?.skills?.length || 0;
    }
    if (selectedTag !== "all" || activeView === "starred") {
      return filteredGroupedRepos.length + matchedExtraSubSkills.length;
    }
    return filteredGroupedRepos.length;
  }, [isFlatView, filteredGroupedRepos, selectedRepoId, selectedTag, activeView, matchedExtraSubSkills.length]);

  const getHeaderIconStr = useCallback(() => {
    if (selectedRepoId && !isFlatView) {
      const repo = filteredGroupedRepos.find(r => r.id === selectedRepoId);
      if (repo) {
        return repo.source_type === 'online' ? 'Github' : 'Folder';
      }
      return 'Folder';
    }
    if (selectedTag !== "all") return 'Tag';
    if (activeView === "starred") return 'Star';
    if (activeView === "recent") return 'Clock';
    if (activeView === "untagged") return 'Tag';
    if (!selectedRepoId) {
      if (currentTab?.context?.filter === 'local') return 'HardDrive';
      if (currentTab?.context?.filter === 'github') return 'Github';
      if (currentTab?.context?.filter === 'all') return 'FolderSearch';
      if (activeView === 'all' && selectedTag === 'all') return 'LayoutGrid';
    }
    if (selectedRepoId) {
      const repo = filteredGroupedRepos.find(r => r.id === selectedRepoId);
      if (repo) {
        return repo.source_type === 'online' ? 'Github' : 'Folder';
      }
    }
    return 'Library';
  }, [isFlatView, selectedTag, activeView, selectedRepoId, filteredGroupedRepos, currentTab?.context?.filter]);

  useEffect(() => {
    if (currentTab?.type === 'skill-home' || currentTab?.type === 'skill-repo') {
      const title = getHeaderTitleStr();
      const icon = getHeaderIconStr();
      if (currentTab?.title !== title || currentTab?.icon !== icon) {
        updateActiveTab({ title, icon });
      }
    }
  }, [currentTab?.type, getHeaderTitleStr, getHeaderIconStr, currentTab?.title, currentTab?.icon, updateActiveTab]);

  const getHeaderTitle = () => {
    const countBadge = <span className="bg-black/5 text-[var(--color-muted)] text-[11px] px-2 py-0.5 rounded-full font-medium ml-2">{getHeaderCount()}</span>;
    if (isFlatView) {
      return <>最近使用{countBadge}</>;
    }
    const wsLabel = directories.find(d => d.id === selectedWorkspaceId)?.label || "未知技能库";
    if (selectedRepoId && !isFlatView) {
      return (
        <>
          <span className="text-[var(--color-muted)] cursor-pointer hover:text-[var(--foreground)] transition-colors"
            onClick={(e) => handleGoBack(e)}
            onAuxClick={(e) => { if (e.button === 1) handleGoBack(e); }}
          >
            {activeView === "starred" ? "星标" : wsLabel}
          </span>
          <ChevronRight className="w-4 h-4 mx-2 text-[var(--color-muted)] opacity-50" />
          <span>{filteredGroupedRepos.find(r => r.id === selectedRepoId)?.name}</span>
          {countBadge}
        </>
      );
    }
    if (activeView === "starred") {
      return <>星标{countBadge}</>;
    }
    return <>{wsLabel}{countBadge}</>;
  };

  return (
    <div className="flex h-screen w-full bg-[var(--color-background)] text-[var(--foreground)] overflow-hidden font-sans">

      {isLeftSidebarOpen && (
        <div
          className="w-64 bg-transparent flex flex-col h-full shrink-0 relative z-20 text-[13px] border-r border-[var(--color-border)] sidebar-container"
        >
          {/* 侧边栏顶部拖拽区域：左侧 72px 专供 macOS 原生红绿灯按钮，右端放置「收起侧边栏」按钮与右侧检查器对称 */}
          <div className="h-10 w-full shrink-0 flex items-center pr-3.5">
            <div
              className="w-[72px] h-full shrink-0"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            />
            <div
              data-tauri-drag-region
              className="flex-1 h-full"
              style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
              onPointerDown={(e) => { if (e.target === e.currentTarget) getCurrentWindow().startDragging(); }}
              onDoubleClick={(e) => { if (e.target === e.currentTarget) getCurrentWindow().toggleMaximize(); }}
            />
            <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} className="flex items-center">
              <Tooltip content="收起侧边栏 (⌘\)" side="bottom">
                <button
                  type="button"
                  onClick={() => setIsLeftSidebarOpen(false)}
                  className="p-1.5 rounded-md text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/[0.06] transition-colors cursor-pointer"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* 模块 Tab 导航与全局搜索 */}
          <div className="px-3 pb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {([
                { id: 'skills' as AppModule, label: '技能', icon: FileCode },
                { id: 'prompts' as AppModule, label: '提示词', icon: MessageSquareQuote },
                { id: 'resources' as AppModule, label: '资源', icon: Store },
              ]).map(tab => (
                <button
                  key={tab.id}
                  onClick={(e) => handleSwitchModule(tab.id, e)}
                  onAuxClick={(e) => {
                    if (e.button === 1) handleSwitchModule(tab.id, e);
                  }}
                  className={`flex items-center justify-center transition-colors duration-300 outline-none select-none rounded-md h-[32px] ${activeModule === tab.id
                    ? 'bg-black/[0.05] text-[var(--foreground)] font-medium px-2.5'
                    : 'text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/[0.04] px-2.5'
                    }`}
                >
                  <tab.icon className="w-4 h-4 shrink-0" />
                  <div
                    className="grid transition-all duration-300 ease-in-out ml-1"
                    style={{ gridTemplateColumns: activeModule === tab.id ? '1fr' : '0fr' }}
                  >
                    <span className={`overflow-hidden text-[14px] truncate leading-none transition-all duration-300 ${activeModule === tab.id ? 'opacity-100 pl-1' : 'opacity-0 pl-0'}`}>
                      {tab.label}
                    </span>
                  </div>
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


              <div className="flex-1 min-h-0 overflow-y-auto sidebar-scroll-area">
                <div className="px-3 mt-1 mb-5 space-y-0.5">
                  <h3 className="text-[11px] font-semibold text-[var(--color-muted)]/60 mb-1 px-2 uppercase tracking-wide">
                    快捷筛选
                  </h3>
                  <button
                    onClick={(e) => setActiveView("all", "全部技能", "LayoutGrid", e)}
                    onAuxClick={(e) => { if (e.button === 1) setActiveView("all", "全部技能", "LayoutGrid", e); }}
                    className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md transition-colors outline-none select-none ${isSidebarMatch && activeView === "all" && selectedTag === "all" ? "bg-black/5 text-[var(--foreground)] font-semibold" : "text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] font-medium"}`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                    <span>全部技能</span>
                  </button>
                  <button
                    onClick={(e) => setActiveView("starred", "星标", "Star", e)}
                    onAuxClick={(e) => { if (e.button === 1) setActiveView("starred", "星标", "Star", e); }}
                    className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md transition-colors outline-none select-none ${isSidebarMatch && activeView === "starred" ? "bg-black/5 text-[var(--foreground)] font-semibold" : "text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] font-medium"}`}
                  >
                    <Star className="w-4 h-4" />
                    <span>星标</span>
                  </button>
                  <button
                    onClick={(e) => setActiveView("recent", "最近使用", "Clock", e)}
                    onAuxClick={(e) => { if (e.button === 1) setActiveView("recent", "最近使用", "Clock", e); }}
                    className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md transition-colors outline-none select-none ${isSidebarMatch && activeView === "recent" ? "bg-black/5 text-[var(--foreground)] font-semibold" : "text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] font-medium"}`}
                  >
                    <Clock className="w-4 h-4" />
                    <span>最近使用</span>
                  </button>
                  <button
                    onClick={(e) => setActiveView("untagged", "未标签", "Tag", e)}
                    onAuxClick={(e) => { if (e.button === 1) setActiveView("untagged", "未标签", "Tag", e); }}
                    className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md transition-colors outline-none select-none ${isSidebarMatch && activeView === "untagged" ? "bg-black/5 text-[var(--foreground)] font-semibold" : "text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] font-medium"}`}
                  >
                    <Tag className="w-4 h-4" />
                    <span>未标签</span>
                  </button>
                </div>

                <div className="px-3 mb-5">
                  <div className="flex items-center justify-between mb-1 px-2">
                    <h3 className="text-[11px] font-semibold text-[var(--color-muted)]/60 uppercase tracking-wide">
                      标签
                    </h3>
                    <Tooltip content="管理标签">
                      <button
                        type="button"
                        onClick={() => {
                          setSkillTagManagerEditTarget(null);
                          setIsSkillTagManagerOpen(true);
                        }}
                        className="p-0.5 rounded text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                      </button>
                    </Tooltip>
                  </div>
                  <div className="space-y-0.5">
                    {(() => {
                      const visibleTags = isSkillTagsExpanded
                        ? skillTagStats
                        : skillTagStats.slice(0, 10);
                      return (
                        <>
                          {visibleTags.map(tagStat => (
                            <button
                              key={tagStat.name}
                              onClick={(e) => setSelectedTag(tagStat.name, e)}
                              onAuxClick={(e) => { if (e.button === 1) setSelectedTag(tagStat.name, e); }}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                showContextMenu(e, { type: 'sidebar-tag', data: tagStat });
                              }}
                              className={`w-full flex items-center justify-between px-2 py-1 rounded-md transition-colors outline-none select-none ${
                                isSidebarMatch && selectedTag === tagStat.name && activeView === "all"
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
                          {skillTagStats.length > 10 && (
                            <button
                              type="button"
                              onClick={() => setIsSkillTagsExpanded(prev => !prev)}
                              className="w-full flex items-center gap-1 px-2 py-1 text-[11.5px] text-[var(--color-muted)] hover:text-[var(--foreground)] rounded-md hover:bg-black/5 transition-colors"
                            >
                              {isSkillTagsExpanded ? (
                                <>
                                  <ChevronDown className="w-3 h-3" />
                                  <span>收起标签</span>
                                </>
                              ) : (
                                <>
                                  <ChevronRight className="w-3 h-3" />
                                  <span>显示全部 ({skillTagStats.length})</span>
                                </>
                              )}
                            </button>
                          )}
                          {skillTagStats.length === 0 && (
                            <div className="text-[11px] text-[var(--color-muted)]/50 px-2 py-1">暂无标签</div>
                          )}
                        </>
                      );
                    })()}
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
                      onClick={() => handleSidebarNav('skill-home', '技能库', { filter: 'all', repoId: undefined }, 'FolderSearch')}
                    >
                      <FolderSearch className="w-4 h-4" />
                      <span>所有技能</span>
                    </button>
                    <button
                      className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md transition-colors outline-none select-none ${activeTab === "local" ? "bg-black/5 text-[var(--foreground)] font-semibold" : "text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 font-medium"
                        }`}
                      onClick={() => handleSidebarNav('skill-home', '技能库', { filter: 'local', repoId: undefined }, 'HardDrive')}
                    >
                      <HardDrive className="w-4 h-4" />
                      <span>本地技能</span>
                    </button>
                    <button
                      className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md transition-colors outline-none select-none ${activeTab === "github" ? "bg-black/5 text-[var(--foreground)] font-semibold" : "text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 font-medium"
                        }`}
                      onClick={() => handleSidebarNav('skill-home', '技能库', { filter: 'github', repoId: undefined }, 'Github')}
                    >
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.24c3-.3 6-1.5 6-6.76a5.5 5.5 0 0 0-1.5-3.8 5.1 5.1 0 0 0-.1-3.8s-1.2-.4-3.9 1.4a13.4 13.4 0 0 0-7 0C6.3 2.4 5.1 2.8 5.1 2.8a5.1 5.1 0 0 0-.1 3.8 5.5 5.5 0 0 0-1.5 3.8c0 5.2 3 6.4 6 6.76a4.8 4.8 0 0 0-1 3.24v4" />
                      </svg>
                      <span>Github技能</span>
                    </button>
                    <button
                      className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md transition-colors outline-none select-none ${activeTab === "online" ? "bg-black/5 text-[var(--foreground)] font-semibold" : "text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 font-medium"
                        }`}
                      onClick={() => handleSidebarNav('skill-home', '技能库', { filter: 'online', repoId: undefined }, 'Globe')}
                    >
                      <Globe className="w-4 h-4" />
                      <span>线上技能</span>
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : activeModule === 'prompts' ? (
            <div className="flex-1 min-h-0 overflow-y-auto px-0 sidebar-scroll-area">
              <PromptSidebarNav
                filter={isSidebarMatch ? promptFilter : null as any}
                groups={promptGroups}
                onFilterChange={setPromptFilter}
                onCreateGroup={() => setIsCreateGroupOpen(true)}
                isCreateGroupOpen={isCreateGroupOpen}
                onCreateGroupClose={() => setIsCreateGroupOpen(false)}
                onGroupSaved={() => setPromptRefreshKey(k => k + 1)}
              />
            </div>
          ) : (
            /* 资源中心侧边栏（方案 A：发现 / 榜单合集 / 订阅仓库 / 全网目录 + 提示词精选 + 安装目标库快捷切换） */
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto sidebar-scroll-area">
                {(() => {
                  const rawCat = currentTab?.context?.resourceCategory || 'discover';
                  const activeResSection: ResourceNavSection =
                    rawCat === 'leaderboards'
                      ? 'leaderboards'
                      : rawCat === 'repos'
                      ? 'repos'
                      : rawCat === 'directory'
                      ? 'directory'
                      : rawCat === 'installed'
                      ? 'installed'
                      : rawCat === 'prompts' || rawCat === 'all-prompts'
                      ? 'prompts'
                      : 'discover';

                  const navItems: Array<{
                    id: ResourceNavSection;
                    label: string;
                    icon: typeof Sparkles;
                    badge?: number;
                  }> = [
                    { id: 'discover', label: '发现', icon: Sparkles },
                    { id: 'leaderboards', label: '榜单合集', icon: Trophy },
                    {
                      id: 'repos',
                      label: '订阅仓库',
                      icon: FolderGit2,
                      badge: resourceHub.enabledRepoCount > 0 ? resourceHub.enabledRepoCount : undefined,
                    },
                    { id: 'directory', label: '全网目录', icon: Globe },
                    { id: 'prompts', label: '提示词精选', icon: MessageSquareQuote },
                  ];

                  return (
                    <>
                      <div className="px-3 mt-1 mb-5 space-y-0.5">
                        <h3 className="text-[11px] font-semibold text-[var(--color-muted)]/60 mb-1.5 px-2 uppercase tracking-wide">
                          探索
                        </h3>
                        {navItems.map(item => {
                          const Icon = item.icon;
                          const isActive = activeResSection === item.id;
                          return (
                            <button
                              key={item.id}
                              onClick={() =>
                                navigateTo(
                                  'resource-home',
                                  item.label,
                                  {
                                    resourceCategory: item.id,
                                    categoryName: item.label,
                                    resourceId: undefined,
                                    remoteSkillTarget: undefined,
                                    remotePromptItem: undefined,
                                  },
                                  'Store'
                                )
                              }
                              className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors outline-none select-none text-[13px] cursor-pointer ${
                                isActive
                                  ? 'bg-black/[0.06] text-[var(--foreground)] font-semibold'
                                  : 'text-[var(--color-muted)] hover:bg-black/[0.04] hover:text-[var(--foreground)] font-medium'
                              }`}
                            >
                              <span className="flex items-center space-x-2 min-w-0">
                                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[var(--color-primary)]' : ''}`} />
                                <span className="truncate">{item.label}</span>
                              </span>
                              {item.badge !== undefined && (
                                <span className="text-[10.5px] font-semibold px-1.5 py-0.2 rounded-full bg-black/[0.05] text-[var(--color-muted)] tabular-nums">
                                  {item.badge}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <div className="px-3 mb-5 space-y-0.5">
                        <h3 className="text-[11px] font-semibold text-[var(--color-muted)]/60 mb-1.5 px-2 uppercase tracking-wide">
                          我的
                        </h3>
                        <button
                          onClick={() =>
                            navigateTo(
                              'resource-home',
                              '已安装',
                              {
                                resourceCategory: 'installed',
                                categoryName: '已安装',
                                resourceId: undefined,
                                remoteSkillTarget: undefined,
                                remotePromptItem: undefined,
                              },
                              'Store'
                            )
                          }
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors outline-none select-none text-[13px] cursor-pointer ${
                            activeResSection === 'installed'
                              ? 'bg-black/[0.06] text-[var(--foreground)] font-semibold'
                              : 'text-[var(--color-muted)] hover:bg-black/[0.04] hover:text-[var(--foreground)] font-medium'
                          }`}
                        >
                          <span className="flex items-center space-x-2 min-w-0">
                            <PackageCheck
                              className={`w-4 h-4 shrink-0 ${activeResSection === 'installed' ? 'text-[var(--color-primary)]' : ''}`}
                            />
                            <span className="truncate">已安装</span>
                          </span>
                          {resourceHub.installedSources.length > 0 && (
                            <span className="text-[10.5px] font-semibold px-1.5 py-0.2 rounded-full bg-black/[0.05] text-[var(--color-muted)] tabular-nums">
                              {resourceHub.installedSources.length}
                            </span>
                          )}
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          <div className="p-2 border-t border-[var(--color-border)]/50 mt-auto flex items-center justify-between gap-1.5">
            <button
              onClick={() => {
                setCommunityDefaultTab("qq");
                setIsCommunityOpen(true);
              }}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[var(--foreground)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors outline-none select-none active:scale-[0.98] group"
            >
              <div className="w-5 h-5 rounded-md bg-blue-500/[0.08] dark:bg-blue-400/[0.14] text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:bg-blue-500/[0.14] transition-all">
                <Users className="w-3.5 h-3.5" strokeWidth={2} />
              </div>
              <span className="text-[12.5px] font-medium tracking-tight truncate">加入用户社群</span>
              <ChevronRight className="w-3.5 h-3.5 text-[var(--foreground)]/40 group-hover:text-[var(--foreground)]/80 group-hover:translate-x-0.5 transition-all shrink-0 -ml-0.5" />
            </button>
            <div className="flex items-center gap-0.5 shrink-0">
              <Tooltip content="设置">
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="p-1.5 rounded-md text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors outline-none select-none active:scale-[0.98]"
                  aria-label="设置"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </Tooltip>
              <Tooltip content="关于 SkillHub">
                <button
                  onClick={() => setIsAboutOpen(true)}
                  className="p-1.5 rounded-md text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors outline-none select-none active:scale-[0.98]"
                  aria-label="关于"
                >
                  <Info className="w-4 h-4" />
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-row h-full min-w-0 bg-[var(--color-background)] relative">
        <div className="flex-1 flex flex-col min-w-0 h-full relative">
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            onSwitchTab={switchTab}
            onCloseTab={closeTab}
            onNewTab={() => {
              if (currentTabModule === 'prompts') {
                openTab('prompt-home', '提示词', { promptFilter: 'all' }, 'MessageSquareQuote');
              } else if (currentTabModule === 'resources') {
                openTab('resource-home', '发现', { resourceCategory: 'discover', categoryName: '发现' }, 'Store');
              } else {
                openTab('skill-home', '技能库', { workspaceId: selectedWorkspaceId || undefined, activeView: 'all', selectedTag: 'all', filter: 'all' }, 'FileCode');
              }
            }}
            onGoBack={tabGoBack}
            onGoForward={tabGoForward}
            isSidebarOpen={isLeftSidebarOpen}
            onToggleSidebar={() => setIsLeftSidebarOpen(prev => !prev)}
            isRightSidebarOpen={isInspectorOpen}
            onToggleRightSidebar={['skills', 'prompts'].includes(currentTabModule) ? () => setIsInspectorOpen(prev => !prev) : undefined}
          />
          <div className="flex-1 flex flex-row min-h-0 relative">
            {currentTabModule === 'skills' ? (
              currentTab?.type === 'skill-detail' && currentTab.context.skillId ? (
                <SkillDetailPage
                  skillId={currentTab.context.skillId}
                  onGeneratePrompt={handleGeneratePrompt}
                  onFavoriteChange={(skillId, isFavorite) => applySkillsFavoriteState([skillId], isFavorite)}
                />
              ) : (
                <div className="flex-1 flex flex-col h-full min-w-0 bg-[var(--color-background)] relative">
                  {directories.length > 0 && (
                    <div className="pt-5 pb-3 px-6 bg-white flex items-center justify-between shrink-0 relative z-0">
                      <div className="flex items-center space-x-3">

                        <h1 className="text-[15px] font-medium tracking-tight text-[var(--foreground)] flex items-center">
                          {getHeaderTitle()}
                        </h1>
                      </div>
                      <div className="flex items-center gap-2">
                        {!selectedRepoId && !isFlatView && (
                          <div className="h-7 box-border flex items-center bg-black/[0.05] border border-black/[0.06] rounded-lg p-[2px]">
                            <Tooltip content="分组视图" side="bottom">
                              <button
                                type="button"
                                onClick={() => setViewMode('categorized')}
                                className={`h-full px-2 flex items-center justify-center rounded-[6px] transition-all cursor-pointer ${viewMode === 'categorized'
                                  ? 'bg-white shadow-xs text-[var(--foreground)]'
                                  : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                                  }`}
                              >
                                <Rows3 className="w-3.5 h-3.5" />
                              </button>
                            </Tooltip>
                            <Tooltip content="平铺视图" side="bottom">
                              <button
                                type="button"
                                onClick={() => setViewMode('grid')}
                                className={`h-full px-2 flex items-center justify-center rounded-[6px] transition-all cursor-pointer ${viewMode === 'grid'
                                  ? 'bg-white shadow-xs text-[var(--foreground)]'
                                  : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                                  }`}
                              >
                                <Grip className="w-3.5 h-3.5" />
                              </button>
                            </Tooltip>
                          </div>
                        )}
                        <button
                          onClick={() => handleSyncAll(true, directories.filter(d => d.id === selectedWorkspaceId))}
                          disabled={isSyncingAll}
                          className="h-7 box-border inline-flex items-center justify-center gap-1.5 px-2.5 rounded-lg border border-black/[0.08] bg-white hover:bg-black/[0.03] hover:border-black/[0.15] text-[12px] leading-none font-medium text-[var(--foreground)] shadow-xs transition-all cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-spin text-[var(--color-primary)]' : 'text-[var(--color-muted)]'}`} />
                          <span>{isSyncingAll ? '正在同步...' : '同步当前库'}</span>
                        </button>
                        <button
                          onClick={handleAddRepo}
                          className="h-7 box-border inline-flex items-center justify-center gap-1 bg-blue-500 hover:bg-blue-600 text-white px-2.5 rounded-lg text-[12px] leading-none font-medium border border-transparent shadow-xs transition-all cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>添加技能</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <div
                    ref={mainContentRef}
                    className="flex-1 overflow-y-auto hover-scroll relative z-0 bg-white flex flex-col"
                    onClick={() => { if (!isDraggingRef.current) handleDeselectAll(); }}
                    onContextMenu={(e) => {
                      // Because cards call stopPropagation(), this only fires for blank space
                      showContextMenu(e, { type: 'empty', data: null });
                    }}
                  >
                    <div className="min-h-full w-full flex flex-col">
                      <SelectionArea
                        onBeforeStart={({ event }: SelectionEvent) => {
                          if ((event?.target as Element)?.closest?.('[data-id]')) return false;

                          // Smart scrollbar detection (works for both Windows physical and Mac overlay scrollbars)
                          if (event instanceof MouseEvent && mainContentRef.current) {
                            const el = mainContentRef.current;
                            const rect = el.getBoundingClientRect();
                            // Calculate the exact left position of the vertical scrollbar
                            const scrollbarLeftEdge = rect.left + el.clientLeft + el.clientWidth;
                            // If the click is on or to the right of the scrollbar edge, ignore it
                            if (event.clientX > scrollbarLeftEdge) {
                              return false;
                            }
                          }

                          return true;
                        }}
                        onStart={({ event, selection }: SelectionEvent) => {
                          // Fix z-index for the clipping container (viselect sets inline z-index:1)
                          const area = selection.getSelectionArea();
                          if (area?.parentElement) {
                            area.parentElement.style.zIndex = '10000';
                          }
                          if (!event?.ctrlKey && !event?.metaKey && !event?.shiftKey) {
                            selection.clearSelection();
                            setSelectedRepoIds(new Set());
                            setSelectedSkillIds(new Set());
                          }
                        }}
                        onMove={({ store: { changed: { added, removed } } }: SelectionEvent) => {
                          isDraggingRef.current = true;
                          let lastAddedType: 'repo' | 'skill' | null = null;

                          // Determine what was added in this exact move event synchronously
                          added.forEach((el: Element) => {
                            const type = el.getAttribute('data-type');
                            if (type === 'repo' || type === 'skill') {
                              lastAddedType = type;
                            }
                          });

                          setSelectedRepoIds(prev => {
                            const next = new Set(prev);
                            added.forEach((el: Element) => {
                              const id = el.getAttribute('data-id');
                              if (id && el.getAttribute('data-type') === 'repo') {
                                next.add(id);
                              }
                            });
                            removed.forEach((el: Element) => {
                              const id = el.getAttribute('data-id');
                              if (id && el.getAttribute('data-type') === 'repo') next.delete(id);
                            });
                            return next;
                          });

                          setSelectedSkillIds(prev => {
                            const next = new Set(prev);
                            added.forEach((el: Element) => {
                              const id = el.getAttribute('data-id');
                              if (id && el.getAttribute('data-type') === 'skill') {
                                next.add(id);
                              }
                            });
                            removed.forEach((el: Element) => {
                              const id = el.getAttribute('data-id');
                              if (id && el.getAttribute('data-type') === 'skill') next.delete(id);
                            });
                            return next;
                          });

                          if (lastAddedType) {
                            setInspectorSelectedType(lastAddedType);
                          }
                        }}
                        onStop={() => { setTimeout(() => { isDraggingRef.current = false; }, 100); }}
                        selectables="[data-id]"
                        features={{ touch: false, range: true, singleTap: { allow: false } }}
                        className="flex-1 flex flex-col min-h-0"
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
                          <div className="flex flex-col items-center justify-center h-full text-[var(--color-muted)] animate-in fade-in duration-500 p-6">
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
                        ) : directories.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-full text-[var(--color-muted)] animate-in fade-in duration-500 p-6">
                            <div className="w-32 h-32 mb-6 relative group">
                              <div className="relative bg-white/60 backdrop-blur-xl rounded-3xl p-8 flex items-center justify-center shadow-sm">
                                <FolderPlus className="w-12 h-12 text-blue-400 drop-shadow-sm relative z-10" />
                              </div>
                            </div>
                            <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2 tracking-tight">欢迎使用，请先创建技能库</h2>
                            <p className="text-sm text-[var(--color-muted)] mb-8 text-center max-w-sm leading-relaxed">
                              技能库就像是文件夹，可以帮你把不同类型的 AI 技能分门别类地存放起来。在添加技能前，请先创建你的第一个技能库。
                            </p>
                            <div className="flex flex-col items-center gap-3">
                              <button
                                onClick={() => setIsCreateModalOpen(true)}
                                className="flex items-center justify-center w-64 px-6 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors shadow-sm"
                              >
                                <Plus className="w-4 h-4 mr-2" />
                                创建第一个技能库
                              </button>
                              <button
                                disabled={isLinking}
                                onClick={async () => {
                                  try {
                                    const { open: openDialog } = await import('@tauri-apps/plugin-dialog');
                                    const selected = await openDialog({ directory: true, multiple: false, title: '选择已有技能文件夹' });
                                    if (selected && typeof selected === 'string') {
                                      setIsLinking(true);
                                      const dirId = await invoke<string>('scan_and_add_source_directory', {
                                        path: selected,
                                        dirType: 'local',
                                        strategy: null,
                                        targetDir: null,
                                      });
                                      await fetchData();
                                      handleWorkspaceSelect(dirId);
                                      showToast('技能库关联成功', 'success');
                                      setIsLinking(false);
                                    }
                                  } catch (e: any) {
                                    console.error(e);
                                    showToast('关联失败：' + (e?.message || String(e)), 'error');
                                    setIsLinking(false);
                                  }
                                }}
                                className="flex items-center justify-center w-64 px-6 py-2.5 bg-white border border-[var(--color-border)] text-[var(--foreground)] rounded-lg font-medium hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-70 disabled:pointer-events-none"
                              >
                                {isLinking ? (
                                  <RefreshCw className="w-4 h-4 mr-2 text-blue-400 animate-spin" />
                                ) : (
                                  <Folder className="w-4 h-4 mr-2 text-blue-400" />
                                )}
                                {isLinking ? '正在关联...' : '关联现有技能文件夹'}
                              </button>
                              <p className="text-xs text-[var(--color-muted)] mt-1 text-center max-w-xs">
                                已有 GitHub 仓库或本地技能文件夹？直接选择关联进来，不会移动或复制文件。
                              </p>
                            </div>
                          </div>
                        ) : (filteredGroupedRepos.length === 0 && matchedExtraSubSkills.length === 0) ? (
                          <div className="flex flex-col items-center justify-center h-full text-[var(--color-muted)] animate-in fade-in duration-500 p-6">
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
                          viewMode === 'categorized' ? (
                            <CategorizedView
                              repos={filteredGroupedRepos}
                              cloningRepos={cloningRepos}
                              selectedRepoIds={selectedRepoIds}
                              selectedSkillIds={selectedSkillIds}
                              onSelectRepo={handleSelectRepo}
                              onSelectSkill={(skill, _repo, e) => {
                                handleSelectSkill(skill, e);
                              }}
                              onDoubleClickRepo={(repoId) => {
                                const targetRepo = filteredGroupedRepos.find(r => r.id === repoId);
                                if (targetRepo && targetRepo.repo_type !== 'collection' && targetRepo.skills.length === 1) {
                                  const s = targetRepo.skills[0];
                                  if (targetRepo.source_type === 'online') {
                                    import('@tauri-apps/plugin-opener').then(m => m.openUrl(s.online_url || s.local_path).catch(console.error));
                                  } else {
                                    navigateTo('skill-detail', s.name, { ...currentTab?.context, skillId: s.id }, 'FileText');
                                  }
                                  return;
                                }
                                setSelectedRepoId(repoId);
                                setInspectorSelectedType('repo');
                                setSelectedRepoIds(new Set([repoId]));
                                setSelectedSkillIds(new Set());
                              }}
                              onDoubleClickSkill={(skill, _repo) => {
                                navigateTo('skill-detail', skill.name, { ...currentTab?.context, skillId: skill.id }, 'FileText');
                              }}
                              onContextMenuRepo={(e, repo) => {
                                if (!selectedRepoIds.has(repo.id)) handleSelectRepo(repo, e);
                                showContextMenu(e, { type: 'repo', data: repo });
                              }}
                              onContextMenuSkill={(e, skill) => {
                                if (!selectedSkillIds.has(skill.id)) handleSelectSkill(skill, e);
                                showContextMenu(e, { type: 'skill', data: skill });
                              }}
                              onFavoriteToggle={(_e, skill) => handleToggleFavorite(skill.id)}
                              onRepoFavoriteToggle={(_e, repo) => handleToggleRepoFavorite(repo)}
                              repoFavoriteVersion={repoFavoriteVersion}
                              handleCancelClone={handleCancelClone}
                              syncRecords={syncRecords}
                              agents={agents}
                              onUpdateRepo={(e, r) => handleUpdateRepos(e, [r])}
                              onDeleteRepo={(e, r) => handleDeleteRepos(e, [r])}
                              onInspectClone={setInspectingCloneRepo}
                              extraMatchedSubSkills={(selectedTag !== "all" || activeView === "starred") ? matchedExtraSubSkills : undefined}
                            />
                          ) : (
                            <>
                              <div className="flex-1 grid gap-3 content-start px-6 pt-3 pb-20" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                                {cloningRepos.map((repo) => (
                                  <CloningCard
                                    key={repo.path}
                                    name={repo.name}
                                    path={repo.path}
                                    repo={repo}
                                    onCancel={handleCancelClone}
                                    onInspect={setInspectingCloneRepo}
                                  />
                                ))}
                                {filteredGroupedRepos.map((repo) => (
                                  <RepoCard
                                    key={repo.id}
                                    repo={repo}
                                    syncRecords={syncRecords}
                                    agents={agents}
                                    isFavorite={isRepoItemStarred(repo)}
                                    isSelected={inspectorSelectedType === 'repo' && selectedRepoIds.has(repo.id)}
                                    onClick={(e) => handleSelectRepo(repo, e)}
                                    onDoubleClick={(e) => {
                                      const isSingle = repo.repo_type !== 'collection' && repo.skills.length === 1;
                                      if (isSingle) {
                                        const s = repo.skills[0];
                                        if (repo.source_type === 'online') {
                                          import('@tauri-apps/plugin-opener').then(m => m.openUrl(s.online_url || s.local_path).catch(console.error));
                                        } else if (e.metaKey || e.ctrlKey) {
                                          openTab('skill-detail', s.name, { ...currentTab?.context, skillId: s.id }, 'FileText');
                                        } else {
                                          navigateTo('skill-detail', s.name, { ...currentTab?.context, skillId: s.id }, 'FileText');
                                        }
                                        return;
                                      }
                                      if (e.metaKey || e.ctrlKey) {
                                        handleSidebarNav('skill-repo', repo.name || '仓库', { repoId: repo.id }, 'Folder', e);
                                        return;
                                      }
                                      setSelectedRepoId(repo.id);
                                      setInspectorSelectedType('repo');
                                      setSelectedRepoIds(new Set([repo.id]));
                                      setSelectedSkillIds(new Set());
                                    }}
                                    onAuxClick={(e) => {
                                      if (e.button === 1) {
                                        e.stopPropagation();
                                        if (repo.repo_type !== 'collection' && repo.skills.length === 1) {
                                          const s = repo.skills[0];
                                          if (repo.source_type === 'online') {
                                            import('@tauri-apps/plugin-opener').then(m => m.openUrl(s.online_url || s.local_path).catch(console.error));
                                          } else {
                                            openTab('skill-detail', s.name, { ...currentTab?.context, skillId: s.id }, 'FileText');
                                          }
                                          return;
                                        }
                                        handleSidebarNav('skill-repo', repo.name || '仓库', { repoId: repo.id }, 'Folder', e);
                                      }
                                    }}
                                    onContextMenu={(e) => {
                                      if (!selectedRepoIds.has(repo.id)) handleSelectRepo(repo, e);
                                      showContextMenu(e, { type: 'repo', data: repo });
                                    }}
                                    onUpdateRepo={(e, r) => handleUpdateRepos(e, [r])}
                                    onDeleteRepo={(e, r) => handleDeleteRepos(e, [r])}
                                    onFavoriteToggle={(_e, r) => handleToggleRepoFavorite(r)}
                                  />
                                ))}
                                {matchedExtraSubSkills.map(({ skill, repo }) => (
                                  <SkillCard
                                    key={skill.id}
                                    skill={skill}
                                    isSubSkill={true}
                                    parentRepoName={repo.name}
                                    syncRecords={syncRecords}
                                    agents={agents}
                                    isSelected={inspectorSelectedType === 'skill' && selectedSkillIds.has(skill.id)}
                                    onClick={(e) => handleSelectSkill(skill, e)}
                                    onDoubleClick={() => { navigateTo('skill-detail', skill.name, { ...currentTab?.context, skillId: skill.id }, 'FileText'); }}
                                    onContextMenu={(e) => {
                                      if (!selectedSkillIds.has(skill.id)) handleSelectSkill(skill, e);
                                      showContextMenu(e, { type: 'skill', data: skill });
                                    }}
                                    onFavoriteToggle={(_, s) => handleToggleFavorite(s.id)}
                                  />
                                ))}
                              </div>
                            </>
                          )
                        ) : (
                          <>
                            <div className="flex-1 grid gap-3 content-start px-6 pt-3 pb-20" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                              {(() => {
                                const currentRepo = !isFlatView ? filteredGroupedRepos.find(r => r.id === selectedRepoId) : undefined;
                                const skillsToRender = isFlatView
                                  ? filteredGroupedRepos.flatMap(r => r.skills)
                                  : currentRepo?.skills || [];

                                return skillsToRender.map((skill) => {
                                  const ownerRepo = currentRepo || filteredGroupedRepos.find(r => r.skills.some(s => s.id === skill.id));
                                  const isSub = ownerRepo ? (ownerRepo.repo_type === 'collection' || ownerRepo.skills.length > 1) : false;

                                  return (
                                    <SkillCard
                                      key={skill.id}
                                      skill={skill}
                                      isSubSkill={isSub}
                                      parentRepoName={isSub && ownerRepo ? ownerRepo.name : undefined}
                                      syncRecords={syncRecords}
                                      agents={agents}
                                      isSelected={inspectorSelectedType === 'skill' && selectedSkillIds.has(skill.id)}
                                      onClick={(e) => handleSelectSkill(skill, e)}
                                      onDoubleClick={() => { navigateTo('skill-detail', skill.name, { ...currentTab?.context, skillId: skill.id }, 'FileText'); }}
                                      onContextMenu={(e) => {
                                        if (!selectedSkillIds.has(skill.id)) handleSelectSkill(skill, e);
                                        showContextMenu(e, { type: 'skill', data: skill });
                                      }}
                                      onFavoriteToggle={(_, s) => handleToggleFavorite(s.id)}
                                    />
                                  );
                                });
                              })()}
                            </div>
                          </>
                        )}

                      </SelectionArea>
                    </div>

                  </div>

                  {/* Sync Progress Panel */}
                  {syncLogs.length > 0 && (
                    <div
                      className={`absolute bottom-8 right-8 bg-white/90 backdrop-blur-xl border border-[var(--color-border)] rounded-2xl shadow-2xl transition-all duration-300 z-50 ${isSyncPopupMinimized ? 'w-auto p-3 flex items-center space-x-3 cursor-pointer hover:bg-white hover:scale-105' : 'w-80 p-4'}`}
                      onClick={() => { if (isSyncPopupMinimized) setIsSyncPopupMinimized(false); }}
                    >
                      {isSyncPopupMinimized ? (
                        <>
                          <RefreshCw className={`w-5 h-5 ${(isSyncingAll || syncLogs.some(l => l.status === 'pending')) ? 'animate-spin text-[var(--color-primary)]' : 'text-green-500'}`} />
                          <div className="flex flex-col pr-2">
                            <span className="text-sm font-medium text-[var(--foreground)]">{(isSyncingAll || syncLogs.some(l => l.status === 'pending')) ? "正在同步更新..." : "同步完成"}</span>
                            <span className="text-[10px] text-[var(--color-muted)]">{syncLogs.length} 仓库 ({syncLogs.filter(l => l.status === 'success').length} 同步, {syncLogs.filter(l => l.status === 'error').length} 失败)</span>
                          </div>
                          <button onClick={(e) => {
                            e.stopPropagation();
                            if (syncLogsHideTimerRef.current) {
                              clearTimeout(syncLogsHideTimerRef.current);
                              syncLogsHideTimerRef.current = null;
                            }
                            if (isSyncingAll) {
                              currentSyncRunId.current = 0;
                              isSyncingAllRef.current = false;
                              setIsSyncingAll(false);
                            }
                            setSyncLogs([]);
                          }} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors ml-2 border-l border-[var(--color-border)] pl-2">
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between items-center mb-3 text-sm">
                            <span className="font-medium text-[var(--foreground)] flex items-center">
                              <RefreshCw className={`w-4 h-4 mr-2 ${(isSyncingAll || syncLogs.some(l => l.status === 'pending')) ? 'animate-spin text-[var(--color-primary)]' : 'text-green-500'}`} />
                              {(isSyncingAll || syncLogs.some(l => l.status === 'pending')) ? "正在同步更新..." : "同步完成"}
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
                                  if (syncLogsHideTimerRef.current) {
                                    clearTimeout(syncLogsHideTimerRef.current);
                                    syncLogsHideTimerRef.current = null;
                                  }
                                  if (isSyncingAll) {
                                    currentSyncRunId.current = 0;
                                    isSyncingAllRef.current = false;
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
                            共 {syncLogs.length} 个 GitHub 仓库 <span className="text-green-500 font-semibold ml-1">同步 {syncLogs.filter(l => l.status === 'success').length}</span> <span className="text-gray-500 font-semibold ml-1">跳过 {syncLogs.filter(l => l.status === 'skipped').length}</span> <span className="text-red-500 font-semibold ml-1">失败 {syncLogs.filter(l => l.status === 'error').length}</span>
                          </div>

                          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-5 custom-scrollbar">
                            {syncLogs.map(log => (
                              <div key={log.id} className="flex items-center justify-between text-xs py-0.5 pr-2">
                                <Tooltip content={log.label}>
                                  <span className="text-[var(--color-muted)] truncate flex-1 mr-3 cursor-default">{log.label}</span>
                                </Tooltip>
                                {log.status === 'pending' && <span className="text-blue-500 font-medium shrink-0 animate-pulse">正在扫描...</span>}
                                {log.status === 'success' && <span className="text-green-500 font-medium shrink-0 text-right w-16 truncate">{log.message || '更新成功'}</span>}
                                {log.status === 'skipped' && <span className="text-gray-500 font-medium shrink-0 text-right w-16 truncate">{log.message || '已跳过'}</span>}
                                {log.status === 'error' && (
                                  <Tooltip content={log.message || '更新失败'}>
                                    <span className="text-red-500 font-medium shrink-0 truncate max-w-[80px] text-right cursor-default">更新失败</span>
                                  </Tooltip>
                                )}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )) : currentTabModule === 'prompts' ? (
                /* 提示词管理模块 */
                <div className="flex-1 flex h-full min-w-0 overflow-hidden relative">
                  {currentTab?.type === 'prompt-detail' && (
                    <div className="absolute inset-0 z-10 bg-[var(--color-background)]">
                      <PromptDetailPage
                        promptId={currentTab.context?.promptId}
                        isEditingInit={currentTab.context?.isEditing}
                        onSaveSuccess={() => {
                          // Trigger a refresh of the prompts list if needed
                          setPromptRefreshKey(prev => prev + 1);
                          if (!currentTab.context?.promptId) {
                            if (canGoBack) tabGoBack(); else closeTab(currentTab.id);
                          }
                        }}
                        onCancelNew={() => {
                          if (!currentTab.context?.promptId) {
                            if (canGoBack) tabGoBack(); else closeTab(currentTab.id);
                          }
                        }}
                      />
                    </div>
                  )}

                  <div
                    className="flex-1 flex h-full min-w-0"
                    style={{ display: currentTab?.type === 'prompt-detail' ? 'none' : 'flex' }}
                  >
                    <PromptModule
                      refreshKey={promptRefreshKey}
                      filter={promptFilter}
                      activePromptId={currentTab?.type === 'prompt-detail' ? currentTab.context?.promptId : undefined}
                      onGroupsChange={setPromptGroups}
                      onFilterChange={setPromptFilter}
                      onTitleChange={(title, icon) => {
                        if (activeModule === 'prompts' && currentTab?.type === 'prompt-home' && (currentTab?.title !== title || currentTab?.icon !== icon)) {
                          updateActiveTab({ title, icon });
                        }
                      }}
                      onToggleInspector={() => setIsInspectorOpen(!isInspectorOpen)}
                      onOpenInspector={() => setIsInspectorOpen(true)}
                      onOpenPromptDetail={(title, promptId, isEditing, newTab) => {
                        if (newTab) {
                          openTab('prompt-detail', title, { promptId, isEditing }, 'FileText');
                        } else {
                          navigateTo('prompt-detail', title, { promptId, isEditing }, 'FileText');
                        }
                      }}
                      onViewInStore={handleViewInStoreById}
                    />
                  </div>
                </div>
              ) : (
              /* 资源中心页面（纯白底色与上方白色激活选项卡无缝衔接） */
              <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 bg-white relative overflow-hidden">
                {currentTab?.type === 'resource-detail' && currentTab.context.remotePromptItem ? (
                  (() => {
                    const promptItem = currentTab.context.remotePromptItem;
                    return (
                      <RemotePromptDetailView
                        item={promptItem}
                        parentTitle={currentTab.context.categoryName || '提示词精选'}
                        isInstalled={installedPromptTitles.has(promptItem.title.trim().toLowerCase())}
                        isInstalling={installingPromptIds.has(promptItem.id)}
                        onBack={() => {
                          if (canGoBack) {
                            tabGoBack();
                          } else {
                            navigateTo(
                              'resource-home',
                              '提示词精选',
                              {
                                resourceCategory: 'prompts',
                                categoryName: '提示词精选',
                                remotePromptItem: undefined,
                                remoteSkillTarget: undefined,
                                resourceId: undefined,
                              },
                              'Store'
                            );
                          }
                        }}
                        onFetchFabricContent={promptHub.fetchFabricContent}
                        onInstall={handleInstallRemotePrompt}
                        onViewInstalled={handleViewInstalledPrompt}
                        onUninstall={handleUninstallRemotePrompt}
                      />
                    );
                  })()
                ) : currentTab?.type === 'resource-detail' && currentTab.context.remoteSkillTarget ? (
                  (() => {
                    const target = currentTab.context.remoteSkillTarget;
                    const key = buildRemoteSkillKey(target.owner, target.repo, target.skillName, target.subpath);
                    return (
                      <RemoteSkillDetailView
                        target={target}
                        parentTitle={currentTab.context.categoryName || '资源中心'}
                        isInstalled={resourceHub.isRemoteTargetInstalled(target, installedResourceNames)}
                        isInstalling={installingRemoteKeys.has(key)}
                        onBack={() => {
                          if (canGoBack) {
                            tabGoBack();
                          } else {
                            navigateTo('resource-home', '发现', { resourceCategory: 'discover', categoryName: '发现' }, 'Store');
                          }
                        }}
                        onInstall={async (resolvedTarget, mode) => {
                          await requestInstallRemoteSkill({ ...resolvedTarget, installMode: mode });
                        }}
                        onViewInstalledSkill={handleViewInstalledRemoteSkill}
                        onOpenInstalledFolder={handleOpenInstalledRemoteFolder}
                        onUninstallRemoteSkill={handleUninstallRemoteSkill}
                      />
                    );
                  })()
                ) : currentTab?.type === 'resource-detail' && currentTab.context.resourceId ? (
                  <ResourceDetail
                    resourceId={currentTab.context.resourceId}
                    parentCategoryName={currentTab.context.categoryName}
                    parentCategory={currentTab.context.resourceCategory}
                    installedResourceIds={installedResourceNames}
                    isInstalled={
                      installedResourceNames.has(currentTab.context.resourceId.toLowerCase()) ||
                      (currentTab.title ? installedResourceNames.has(currentTab.title.toLowerCase()) : false)
                    }
                    onBack={() => {
                      if (canGoBack) {
                        tabGoBack();
                      } else {
                        navigateTo('resource-home', '提示词精选', { resourceCategory: 'prompts', categoryName: '提示词精选' }, 'Store');
                      }
                    }}
                    onSelectSibling={(sibling) => {
                      navigateTo('resource-detail', sibling.displayName, {
                        ...currentTab.context,
                        resourceId: sibling.id,
                      }, 'Store');
                    }}
                    onInstallSkill={requestInstallSkill}
                    onInstallPrompt={handleInstallPrompt}
                    onUninstallSkill={handleUninstallSkill}
                    onUninstallPrompt={handleUninstallPrompt}
                  />
                ) : (
                  (() => {
                    const rawCat = currentTab?.context?.resourceCategory || 'discover';
                    const activeSection: ResourceNavSection =
                      rawCat === 'leaderboards'
                        ? 'leaderboards'
                        : rawCat === 'repos'
                        ? 'repos'
                        : rawCat === 'directory'
                        ? 'directory'
                        : rawCat === 'installed'
                        ? 'installed'
                        : rawCat === 'prompts' || rawCat === 'all-prompts'
                        ? 'prompts'
                        : 'discover';

                    const sectionTitleMap: Record<ResourceNavSection, string> = {
                      discover: '发现',
                      leaderboards: '榜单合集',
                      repos: '订阅仓库',
                      directory: '全网目录',
                      installed: '已安装',
                      prompts: '提示词精选',
                    };

                    return (
                      <ResourceHubView
                        activeSection={activeSection}
                        initialLeaderboardId={currentTab?.context?.leaderboardId}
                        initialLeaderboardTab={currentTab?.context?.leaderboardTab}
                        initialRepoFilter={currentTab?.context?.repoFilter}
                        initialDirectoryEngine={currentTab?.context?.directoryEngine}
                        subscribedRepos={resourceHub.subscribedRepos}
                        subscribedRepoSkills={resourceHub.subscribedRepoSkills}
                        syncingRepoIds={resourceHub.syncingRepoIds}
                        reposLoading={resourceHub.reposLoading}
                        linklyCache={resourceHub.linklyCache}
                        linklyLoadingIds={resourceHub.linklyLoadingIds}
                        linklyErrors={resourceHub.linklyErrors}
                        onFetchLinklyList={resourceHub.fetchLinklyList}
                        curatedLeaderboards={resourceHub.curatedLeaderboards}
                        curatedLoading={resourceHub.curatedLoading}
                        onRefreshCuratedLeaderboards={resourceHub.fetchCuratedLeaderboards}
                        onRefreshAllSubscribedRepos={resourceHub.refreshAllSubscribedRepos}
                        onSyncSingleSubscribedRepo={resourceHub.syncSingleSubscribedRepo}
                        onReposChanged={async () => {
                          await resourceHub.loadSubscribedReposData();
                        }}
                        isRemoteTargetInstalled={resourceHub.isRemoteTargetInstalled}
                        installedSources={resourceHub.installedSources}
                        groupedRepos={groupedRepos}
                        directories={directories}
                        installedResourceIds={installedResourceNames}
                        installingKeys={installingRemoteKeys}
                        updatingInstalledPaths={updatingInstalledPaths}
                        onCheckUpdateInstalled={handleCheckUpdateInstalled}
                        onCheckUpdateAllInstalled={handleCheckUpdateAllInstalled}
                        onNavigateSection={(section, extra) => {
                          navigateTo(
                            'resource-home',
                            sectionTitleMap[section],
                            {
                              resourceCategory: section,
                              categoryName: sectionTitleMap[section],
                              leaderboardId: extra?.leaderboardId,
                              leaderboardTab: extra?.leaderboardTab,
                              repoFilter: extra?.repoFilter,
                              directoryEngine: extra?.directoryEngine,
                              resourceId: undefined,
                              remoteSkillTarget: undefined,
                              remotePromptItem: undefined,
                            },
                            'Store'
                          );
                        }}
                        onPreviewRemoteSkill={(target, parentTitle) => {
                          navigateTo(
                            'resource-detail',
                            target.displayName || target.skillName,
                            {
                              resourceCategory: activeSection,
                              categoryName: parentTitle,
                              remoteSkillTarget: target,
                              remotePromptItem: undefined,
                              resourceId: undefined,
                            },
                            'Store'
                          );
                        }}
                        onInstallRemoteSkill={requestInstallRemoteSkill}
                        onBatchInstallRemoteSkills={requestBatchInstallRemoteSkills}
                        onViewInstalledSkill={handleViewInstalledRemoteSkill}
                        onOpenInstalledFolder={handleOpenInstalledRemoteFolder}
                        onUninstallRemoteSkill={handleUninstallRemoteSkill}
                        installedPromptTitles={installedPromptTitles}
                        installingPromptIds={installingPromptIds}
                        aishortItems={promptHub.aishortResp?.items || []}
                        aishortLoading={promptHub.aishortLoading}
                        aishortError={promptHub.aishortError}
                        onFetchAishort={promptHub.fetchAishort}
                        promptsChatItems={promptHub.promptsChatItems}
                        promptsChatMeta={promptHub.promptsChatMeta}
                        promptsChatLoading={promptHub.promptsChatLoading}
                        promptsChatError={promptHub.promptsChatError}
                        onSearchPromptsChat={promptHub.searchPromptsChat}
                        fabricItems={promptHub.fabricResp?.items || []}
                        fabricLoading={promptHub.fabricLoading}
                        fabricError={promptHub.fabricError}
                        onFetchFabric={promptHub.fetchFabric}
                        langgptItems={promptHub.langgptResp?.items || []}
                        langgptLoading={promptHub.langgptLoading}
                        langgptError={promptHub.langgptError}
                        onFetchLanggpt={promptHub.fetchLanggpt}
                        onPreviewRemotePrompt={(item, parentTitle) => {
                          navigateTo(
                            'resource-detail',
                            item.title,
                            {
                              resourceCategory: 'prompts',
                              categoryName: parentTitle,
                              remotePromptItem: item,
                              remoteSkillTarget: undefined,
                              resourceId: undefined,
                            },
                            'Store'
                          );
                        }}
                        onQuickInstallRemotePrompt={item => handleInstallRemotePrompt(item)}
                        onViewInstalledPrompt={handleViewInstalledPrompt}
                        onOpenSettings={() => setIsSettingsOpen(true)}
                      />
                    );
                  })()
                )}
              </div>
            )}
          </div>
        </div>

        {/* Global Inspector Panel Area (Currently just for skills) */}
        {currentTabModule === 'skills' && (() => {
          const isDetailView = currentTab?.type === 'skill-detail' && currentTab.context.skillId;
          // 核心修复：优先从全局 skills 或 groupedRepos 中查找当前详情技能，绝不能从被筛选器过滤的 filteredGroupedRepos 查找！
          const detailSkill = isDetailView
            ? (skills.find(s => s.id === currentTab.context.skillId) || groupedRepos.flatMap(r => r.skills).find(s => s.id === currentTab.context.skillId) || null)
            : null;

          return (
            <InspectorPanel
              selectedItemType={isDetailView ? 'skill' : inspectorSelectedType}
              selectedRepos={isDetailView ? [] : filteredGroupedRepos.filter(r => selectedRepoIds.has(r.id))}
              selectedSkills={isDetailView ? (detailSkill ? [detailSkill] : []) : baseScopedRepos.flatMap(r => r.skills).filter(s => selectedSkillIds.has(s.id))}
              agents={agents}
              syncRecords={syncRecords}
              currentLibrary={selectedWorkspaceDir || null}
              allRepos={groupedRepos}
              onOpenDrawer={(skill) => { navigateTo('skill-detail', skill.name, { ...currentTab?.context, skillId: skill.id }, 'FileText'); }}
              onSelectRepo={(repoId) => setSelectedRepoId(repoId)}
              onRefreshData={fetchData}
              onUpdateRepos={handleUpdateRepos}
              onDeleteRepos={(e, r) => handleDeleteRepos(e as any, r)}
              isOpen={isInspectorOpen}
              onToggle={() => setIsInspectorOpen(!isInspectorOpen)}
              onGeneratePrompt={handleGeneratePrompt}
              onViewInStore={handleViewInStore}
              onSelectTagFilter={(tag) => setSelectedTag(tag)}
              onOpenTagManager={() => {
                setSkillTagManagerEditTarget(null);
                setIsSkillTagManagerOpen(true);
              }}
              openTagPopoverSignal={openTagPopoverSignal}
              onToggleRepoFavorite={handleToggleRepoFavorite}
              onToggleSkillFavorite={handleToggleFavorite}
              repoFavoriteVersion={repoFavoriteVersion}
              isDetailView={Boolean(isDetailView)}
            />
          );
        })()}
        <div id="global-inspector-slot" className="shrink-0 h-full bg-transparent" style={{ display: isInspectorOpen ? 'block' : 'none' }}></div>
      </div>

      <ContextMenu
        items={
          menuTarget?.type === 'repo'
            ? buildRepoContextMenu(menuTarget.data)
            : menuTarget?.type === 'skill'
              ? buildSkillContextMenu(menuTarget.data)
              : menuTarget?.type === 'sidebar-tag'
                ? buildSidebarTagContextMenu(menuTarget.data)
                : menuTarget?.type === 'empty'
                  ? buildEmptyContextMenu()
                  : []
        }
        position={menuPosition}
        onClose={hideContextMenu}
      />

      <TagManagerModal
        isOpen={isSkillTagManagerOpen}
        module="skills"
        allItems={allLibraryTagItems}
        initialEditTag={skillTagManagerEditTarget}
        onClose={() => {
          setIsSkillTagManagerOpen(false);
          setSkillTagManagerEditTarget(null);
        }}
        onSelectTagFilter={(tagName) => setSelectedTag(tagName)}
        onRenameTag={handleRenameSkillTag}
        onDeleteTags={handleDeleteSkillTags}
      />

      <AddRepositoryDialog
        isOpen={isAddDialogOpen}
        onClose={() => { setIsAddDialogOpen(false); setAddDialogTab(null); }}
        onSuccess={fetchData}
        onCloningStart={(path, name) => setCloningRepos(prev => [...prev, { path, name }])}
        onCloningSuccess={(path) => { setCloningRepos(prev => prev.filter(r => r.path !== path)); }}
        onCloningError={(path, err) => { setCloningRepos(prev => prev.filter(r => r.path !== path)); if (err) showToast(`克隆失败: ${err}`, 'error'); }}
        defaultTab={addDialogTab}
        defaultTargetDir={selectedWorkspaceId !== "all" ? directories.find(d => d.id === selectedWorkspaceId)?.path || undefined : undefined}
        defaultWorkspaceLabel={selectedWorkspaceId !== "all" ? directories.find(d => d.id === selectedWorkspaceId)?.label : undefined}
        defaultSourceDirId={selectedWorkspaceId !== "all" ? (selectedWorkspaceId || undefined) : undefined}
        existingRepoNames={[
          ...groupedRepos.filter(r => selectedWorkspaceId === "all" || r.source_dir_id === selectedWorkspaceId).map(r => r.name),
          ...skills.filter(s => selectedWorkspaceId === "all" || s.source_dir_id === selectedWorkspaceId).map(s => s.name)
        ]}
      />

      <CloneProgressModal
        isOpen={Boolean(inspectingCloneRepo)}
        repo={inspectingCloneRepo}
        onClose={() => setInspectingCloneRepo(null)}
        onCancel={handleCancelClone}
      />


      <PromptPreviewModal
        isOpen={promptModal.isOpen}
        skillName={promptModal.skillName}
        content={promptModal.content}
        loading={promptModal.loading}
        onClose={() => setPromptModal(prev => ({ ...prev, isOpen: false }))}
      />

      <GlobalSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => { setIsSettingsOpen(false); fetchData(); }}
        defaultTab="general"
      />

      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        repos={groupedRepos}
        prompts={allPrompts}
        allResources={searchableCommunityBundle.list}
        installedResourceNames={installedResourceNames}
        onDeleteRepo={(e, r) => handleDeleteRepos(e as any, [r])}
        onCopyPath={handleCopyPath}
        onSelectRepo={(repoId) => {
          const repo = groupedRepos.find(r => r.id === repoId);
          const targetWsId = repo?.source_dir_id || selectedWorkspaceId || null;
          if (repo && repo.source_dir_id !== selectedWorkspaceId) {
            setSelectedWorkspaceId(targetWsId);
            invoke("refresh_app_menu", { selectedId: targetWsId }).catch(console.error);
            emit("skillhub:workspace-changed", { id: targetWsId }).catch(() => {});
          }
          setActiveModule('skills');
          if (repo && !isCollectionRepo(repo) && repo.skills.length === 1) {
            const targetSkill = repo.skills[0];
            navigateTo('skill-detail', targetSkill.name, { workspaceId: targetWsId || undefined, activeView: 'all', selectedTag: 'all', skillId: targetSkill.id }, 'FileText');
          } else {
            navigateTo('skill-repo', repo?.name || '技能包', { repoId, workspaceId: targetWsId || undefined, activeView: 'all', selectedTag: 'all' }, 'Folder');
            setInspectorSelectedType('repo');
            setSelectedRepoIds(new Set([repoId]));
            setSelectedSkillIds(new Set());
          }
        }}
        onSelectSkill={(skill, repo) => {
          const targetWsId = repo?.source_dir_id || selectedWorkspaceId || null;
          if (repo && repo.source_dir_id !== selectedWorkspaceId) {
            setSelectedWorkspaceId(targetWsId);
            invoke("refresh_app_menu", { selectedId: targetWsId }).catch(console.error);
            emit("skillhub:workspace-changed", { id: targetWsId }).catch(() => {});
          }
          setActiveModule('skills');
          navigateTo('skill-detail', skill.name, {
            repoId: repo && isCollectionRepo(repo) ? repo.id : undefined,
            workspaceId: targetWsId || undefined,
            activeView: 'all',
            selectedTag: 'all',
            skillId: skill.id,
          }, 'FileText');
        }}
        onSelectPrompt={(prompt) => {
          setActiveModule('prompts');
          setPromptFilter(prompt.group_id || 'all');
          // 直接打开提示词详情页，中间展示提示词内容
          navigateTo('prompt-detail', prompt.title || '无标题提示词', { promptId: prompt.id, isEditing: false }, 'FileText');
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('select-prompt', { detail: prompt.id }));
          }, 100);
        }}
        onSelectResource={(resource) => {
          setActiveModuleState('resources');
          const remoteTarget = searchableCommunityBundle.targetMap.get(resource.id);
          if (remoteTarget) {
            navigateTo(
              'resource-detail',
              remoteTarget.displayName || remoteTarget.skillName,
              {
                resourceCategory: remoteTarget.provider === 'repo-source' ? 'repos' : 'leaderboards',
                categoryName: remoteTarget.provider === 'repo-source' ? '订阅仓库' : '榜单合集',
                remoteSkillTarget: remoteTarget,
                resourceId: undefined,
              },
              'Store'
            );
          } else {
            navigateTo(
              'resource-detail',
              resource.displayName,
              {
                resourceId: resource.id,
                resourceCategory: resource.type === 'prompt' ? 'prompts' : 'discover',
                categoryName: resource.type === 'prompt' ? '提示词精选' : '发现',
                remoteSkillTarget: undefined,
              },
              'Store'
            );
          }
        }}
        onInstallSkill={async (resource) => {
          const remoteTarget = searchableCommunityBundle.targetMap.get(resource.id);
          if (remoteTarget) {
            await requestInstallRemoteSkill(remoteTarget);
          } else {
            await requestInstallSkill(resource);
          }
        }}
        onInstallPrompt={handleInstallPrompt}
        onInstallGitHub={async (repo) => {
          const owner = repo.owner?.login || repo.full_name.split('/')[0] || '';
          await requestInstallRemoteSkill({
            host: 'github.com',
            owner,
            repo: repo.name,
            skillName: repo.name,
            displayName: repo.full_name,
            description: repo.description || '',
            installMode: 'repo',
            provider: 'github',
            repoUrl: repo.clone_url || repo.html_url,
            externalUrl: repo.html_url,
            stars: repo.stargazers_count,
          });
        }}
      />

      <InstallTargetModal
        isOpen={!!installTargetResource || !!pendingRemoteInstall}
        onClose={() => {
          setInstallTargetResource(null);
          setPendingRemoteInstall(null);
        }}
        resource={installTargetResource}
        targetTitle={
          pendingRemoteInstall
            ? pendingRemoteInstall.batchLabel ||
              pendingRemoteInstall.targets[0]?.displayName ||
              pendingRemoteInstall.targets[0]?.skillName
            : undefined
        }
        targetSubtitle={
          pendingRemoteInstall
            ? pendingRemoteInstall.batchLabel
              ? `将「${pendingRemoteInstall.batchLabel}」中的 ${pendingRemoteInstall.targets.length} 个未装技能批量安装至以下目标技能库`
              : pendingRemoteInstall.targets[0]
              ? `将「${pendingRemoteInstall.targets[0].displayName}」(${pendingRemoteInstall.targets[0].owner}/${pendingRemoteInstall.targets[0].repo}) 安装至以下目标技能库`
              : undefined
            : undefined
        }
        directories={directories}
        defaultSelectedDirId={selectedWorkspaceId !== "all" ? selectedWorkspaceId : null}
        onConfirm={handleConfirmInstallTarget}
      />

      <UnderConstructionModal
        isOpen={isUnderConstructionOpen}
        onClose={() => setIsUnderConstructionOpen(false)}
      />

      <CreateSkillLibraryModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={async (id) => { await fetchData(); if (id) handleWorkspaceSelect(id); }}
      />

      <OpenSkillLibraryModal
        isOpen={isOpenModalOpen}
        onClose={() => setIsOpenModalOpen(false)}
        onSuccess={async (id) => { await fetchData(); if (id) handleWorkspaceSelect(id); }}
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
        onOpenCommunity={(tab) => {
          setIsAboutOpen(false);
          setCommunityDefaultTab(tab);
          setIsCommunityOpen(true);
        }}
      />

      <CommunityModal
        isOpen={isCommunityOpen}
        onClose={() => setIsCommunityOpen(false)}
        defaultTab={communityDefaultTab}
      />

      {deleteConfirmRepos && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/10 backdrop-blur-sm p-4">
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

      {/* Quick Look Modal */}
      {(() => {
        const activeSkillForQuickLook = (quickLookOpen && inspectorSelectedType === 'skill' && selectedSkillIds.size > 0)
          ? baseScopedRepos.flatMap(r => r.skills).find(s => s.id === ((lastSelectedSkillId && selectedSkillIds.has(lastSelectedSkillId)) ? lastSelectedSkillId : Array.from(selectedSkillIds).pop()))
          : undefined;
        const activeRepoForQuickLook = (quickLookOpen && inspectorSelectedType === 'repo' && selectedRepoIds.size > 0)
          ? filteredGroupedRepos.find(r => r.id === ((lastSelectedRepoId && selectedRepoIds.has(lastSelectedRepoId)) ? lastSelectedRepoId : Array.from(selectedRepoIds).pop()))
          : undefined;
        const isSingleRepoForQuickLook = activeRepoForQuickLook && activeRepoForQuickLook.repo_type !== 'collection' && activeRepoForQuickLook.skills.length === 1;
        const resolvedQuickLookSkill = activeSkillForQuickLook || (isSingleRepoForQuickLook ? activeRepoForQuickLook.skills[0] : undefined);
        const resolvedPreviewType: 'skill' | 'repo' | null = resolvedQuickLookSkill ? 'skill' : activeRepoForQuickLook ? 'repo' : null;

        return (
          <QuickLookModal
            isOpen={quickLookOpen}
            onClose={() => setQuickLookOpen(false)}
            previewType={resolvedPreviewType}
            skill={resolvedQuickLookSkill}
            repo={!isSingleRepoForQuickLook ? activeRepoForQuickLook : undefined}
            onOpenDetail={() => {
              setQuickLookOpen(false);
              if (resolvedQuickLookSkill) {
                if (resolvedQuickLookSkill.source_type === 'online') {
                  const url = resolvedQuickLookSkill.online_url || resolvedQuickLookSkill.local_path;
                  import('@tauri-apps/plugin-opener').then(m => m.openUrl(url).catch(console.error));
                } else {
                  navigateTo('skill-detail', resolvedQuickLookSkill.name, { ...currentTab?.context, skillId: resolvedQuickLookSkill.id }, 'FileText');
                }
              } else if (activeRepoForQuickLook) {
                setSelectedRepoId(activeRepoForQuickLook.id);
                setInspectorSelectedType('repo');
                setSelectedRepoIds(new Set([activeRepoForQuickLook.id]));
                setSelectedSkillIds(new Set());
              }
            }}
            onNavigate={(direction) => {
              const key = direction === 'up' ? 'ArrowUp' : 'ArrowDown';
              if (inspectorSelectedType === 'skill') {
                const skillId = (lastSelectedSkillId && selectedSkillIds.has(lastSelectedSkillId)) ? lastSelectedSkillId : Array.from(selectedSkillIds).pop();
                if (skillId) {
                  const currentEl = document.querySelector(`[data-id="${skillId}"]`);
                  if (currentEl) {
                    const allEls = Array.from(document.querySelectorAll('[data-id]'));
                    const nextEl = getNextElement(currentEl, key, allEls);
                    if (nextEl) {
                      const nextId = nextEl.getAttribute('data-id');
                      if (nextId) {
                        const nextSkill = baseScopedRepos.flatMap(r => r.skills).find(s => s.id === nextId);
                        if (nextSkill) {
                          setSelectedSkillIds(new Set([nextId]));
                          setLastSelectedSkillId(nextId);
                          nextEl.scrollIntoView({ block: 'nearest' });
                        }
                      }
                    }
                  }
                }
              } else if (inspectorSelectedType === 'repo') {
                const repoId = (lastSelectedRepoId && selectedRepoIds.has(lastSelectedRepoId)) ? lastSelectedRepoId : Array.from(selectedRepoIds).pop();
                if (repoId) {
                  const currentEl = document.querySelector(`[data-id="${repoId}"]`);
                  if (currentEl) {
                    const allEls = Array.from(document.querySelectorAll('[data-id]'));
                    const nextEl = getNextElement(currentEl, key, allEls);
                    if (nextEl) {
                      const nextId = nextEl.getAttribute('data-id');
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
            }}
          />
        );
      })()}
      <UpdateNotifier />
    </div>
  );
}

export default App;
