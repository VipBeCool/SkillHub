import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  Search,
  RefreshCw,
  Download,
  Loader2,
  ExternalLink,
  Trophy,
  FolderGit2,
  Globe,
  Sparkles,
  ChevronRight,
  SlidersHorizontal,
  Star,
  AlertCircle,
  ArrowUpRight,
  Layers,
  Key,
  Flame,
  X,
  PackageCheck,
  FolderOpen,
  Trash2,
  FileCode,
} from 'lucide-react';
import type {
  CuratedLeaderboard,
  InstalledSkillSource,
  LinklyLeaderboardResponse,
  LinklyListId,
  LinklyRankingItem,
  RemotePromptItem,
  RemoteSkillTarget,
  ResourceNavSection,
  SkillsShItem,
  SkillsShSearchResponse,
  SubscribedRepo,
  SubscribedRepoSkill,
  SubscribedRepoSyncResult,
} from '../../types/resourceHub';
import type { GroupedRepo, SourceDirectory } from '../../types';
import {
  CURATED_LEADERBOARDS,
  LINKLY_CATEGORY_LABELS,
  LINKLY_LIST_TABS,
  SKILLS_SH_QUICK_KEYWORDS,
  formatCompactCount,
} from '../../data/curated-leaderboards';
import { buildRemoteSkillKey } from '../../hooks/useResourceHub';
import { useResourceRegistry } from '../../hooks/useResourceRegistry';
import type { PromptsChatQueryParams } from '../../hooks/usePromptHub';
import { getGitHubToken } from '../../utils/githubToken';
import { RepoManagerDrawer } from './RepoManagerDrawer';
import { RepoSourceFilterPopover } from './RepoSourceFilterPopover';
import { FilterSelectPopover, type FilterSelectOption } from './FilterSelectPopover';
import { PromptCatalogView } from './PromptCatalogView';
import { InstalledActionButton } from './InstalledActionButton';
import type { GitHubRepo } from '../search/SearchModal';

interface ResourceHubViewProps {
  activeSection: ResourceNavSection;
  initialLeaderboardId?: string;
  initialLeaderboardTab?: 'linkly' | 'curated';
  initialRepoFilter?: string;
  initialDirectoryEngine?: 'skills-sh' | 'github';

  subscribedRepos: SubscribedRepo[];
  subscribedRepoSkills: SubscribedRepoSkill[];
  syncingRepoIds: Set<string>;
  reposLoading: boolean;

  linklyCache: Partial<Record<LinklyListId, LinklyLeaderboardResponse>>;
  linklyLoadingIds: Set<LinklyListId>;
  linklyErrors: Partial<Record<LinklyListId, string>>;
  onFetchLinklyList: (listId: LinklyListId, forceRefresh?: boolean) => Promise<LinklyLeaderboardResponse | null>;

  curatedLeaderboards: CuratedLeaderboard[];
  curatedLoading: boolean;
  onRefreshCuratedLeaderboards: (forceRefresh?: boolean) => Promise<void>;

  onRefreshAllSubscribedRepos: (force?: boolean, silent?: boolean) => Promise<void>;
  onSyncSingleSubscribedRepo: (repoId: string, force?: boolean) => Promise<SubscribedRepoSyncResult | null>;
  onReposChanged: () => Promise<void>;

  isRemoteTargetInstalled: (
    target: Pick<RemoteSkillTarget, 'owner' | 'repo' | 'skillName' | 'subpath' | 'installMode'>,
    fallbackInstalledNames?: Set<string>
  ) => boolean;
  installedSources: InstalledSkillSource[];
  groupedRepos: GroupedRepo[];
  directories: SourceDirectory[];
  installedResourceIds: Set<string>;
  installingKeys: Set<string>;
  updatingInstalledPaths: Set<string>;
  onCheckUpdateInstalled: (localPath: string, displayName: string) => Promise<void>;
  onCheckUpdateAllInstalled: (items: Array<{ path: string; name: string }>) => Promise<void>;

  onNavigateSection: (
    section: ResourceNavSection,
    extra?: {
      leaderboardId?: string;
      leaderboardTab?: 'linkly' | 'curated';
      repoFilter?: string;
      directoryEngine?: 'skills-sh' | 'github';
    }
  ) => void;
  onPreviewRemoteSkill: (target: RemoteSkillTarget, parentTitle: string) => void;
  onInstallRemoteSkill: (target: RemoteSkillTarget) => Promise<void>;
  onBatchInstallRemoteSkills: (targets: RemoteSkillTarget[], label: string) => Promise<void>;
  onViewInstalledSkill: (target: RemoteSkillTarget) => void;
  onOpenInstalledFolder: (target: RemoteSkillTarget) => void;
  onUninstallRemoteSkill: (target: RemoteSkillTarget) => void;

  // === 多源提示词广场 ===
  installedPromptTitles: Set<string>;
  installingPromptIds: Set<string>;
  aishortItems: RemotePromptItem[];
  aishortLoading: boolean;
  aishortError: string | null;
  onFetchAishort: (forceRefresh?: boolean) => Promise<unknown>;
  promptsChatItems: RemotePromptItem[];
  promptsChatMeta: { total: number; page: number; hasMore: boolean; usedFallback: boolean };
  promptsChatLoading: boolean;
  promptsChatError: string | null;
  onSearchPromptsChat: (params?: PromptsChatQueryParams) => Promise<unknown>;
  fabricItems: RemotePromptItem[];
  fabricLoading: boolean;
  fabricError: string | null;
  onFetchFabric: (forceRefresh?: boolean) => Promise<unknown>;
  langgptItems: RemotePromptItem[];
  langgptLoading: boolean;
  langgptError: string | null;
  onFetchLanggpt: (forceRefresh?: boolean) => Promise<unknown>;
  onPreviewRemotePrompt: (item: RemotePromptItem, parentTitle: string) => void;
  onQuickInstallRemotePrompt: (item: RemotePromptItem) => Promise<void>;
  onViewInstalledPrompt: (item: RemotePromptItem) => void;

  onOpenSettings?: () => void;
}

/**
 * 排名序号徽章（全榜统一极简中性风格）
 */
function RankBadge({ rank }: { rank: number }) {
  return (
    <span className="w-7 h-7 rounded-lg bg-black/[0.03] text-[var(--color-muted)] text-[11.5px] font-semibold flex items-center justify-center shrink-0 tabular-nums">
      {rank < 10 ? `0${rank}` : rank}
    </span>
  );
}

/**
 * 计算搜索相关度分值：技能名完全匹配 > 前缀/词段开头匹配 > 技能名包含 > 描述包含 > 仅仓库/作者名包含
 */
function scoreSearchMatch(
  queryLower: string,
  name: string,
  description: string,
  sourceText: string
): number {
  const n = name.toLowerCase();
  if (n === queryLower) return 50;
  if (n.startsWith(queryLower)) return 45;
  const segments = n.split(/[-_/\s.]+/);
  if (segments.some(seg => seg.startsWith(queryLower))) return 40;
  if (n.includes(queryLower)) return 30;
  if (description.toLowerCase().includes(queryLower)) return 20;
  if (sourceText.toLowerCase().includes(queryLower)) return 10;
  return 0;
}

/**
 * 搜索关键词柔和蓝高亮组件，让用户一眼看清命中原因
 */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q || !text) return <>{text}</>;
  const lowerText = text.toLowerCase();
  const lowerQ = q.toLowerCase();
  const idx = lowerText.indexOf(lowerQ);
  if (idx === -1) return <>{text}</>;
  const before = text.slice(0, idx);
  const hit = text.slice(idx, idx + q.length);
  const after = text.slice(idx + q.length);
  return (
    <>
      {before}
      <mark className="bg-blue-100/80 text-blue-700 rounded-[3px] px-0.5 font-semibold not-italic">
        {hit}
      </mark>
      {after}
    </>
  );
}

/**
 * 根据专题分类渲染统一的语义线性图标（替代多色彩虹横条，扩展更多专题也能保持极简一致性）
 */
function renderCuratedCategoryIcon(
  category: CuratedLeaderboard['category'],
  className = 'w-4 h-4'
) {
  switch (category) {
    case 'trending':
      return <Trophy className={className} />;
    case 'starter':
      return <Sparkles className={className} />;
    case 'official':
      return <PackageCheck className={className} />;
    default:
      return <Layers className={className} />;
  }
}

const PROVIDER_BADGE_LABEL: Record<string, string> = {
  linkly: 'Linkly 榜单',
  leaderboard: '精选专题榜',
  'repo-source': '订阅仓库',
  'skills.sh': 'skills.sh',
  github: 'GitHub 仓库',
  'git-clone': 'Git 仓库',
  'resource-hub': '资源中心',
};

/**
 * 资源中心主视图（方案 A：发现 / 榜单合集 / 订阅仓库 / 全网目录 / 已安装 / 提示词精选）
 */
export function ResourceHubView({
  activeSection,
  initialLeaderboardId,
  initialLeaderboardTab,
  initialRepoFilter,
  initialDirectoryEngine,
  subscribedRepos,
  subscribedRepoSkills,
  syncingRepoIds,
  reposLoading,
  linklyCache,
  linklyLoadingIds,
  linklyErrors,
  onFetchLinklyList,
  curatedLeaderboards,
  curatedLoading,
  onRefreshCuratedLeaderboards,
  onRefreshAllSubscribedRepos,
  onSyncSingleSubscribedRepo,
  onReposChanged,
  isRemoteTargetInstalled,
  installedSources,
  groupedRepos,
  directories,
  installedResourceIds,
  installingKeys,
  updatingInstalledPaths,
  onCheckUpdateInstalled,
  onCheckUpdateAllInstalled,
  onNavigateSection,
  onPreviewRemoteSkill,
  onInstallRemoteSkill,
  onBatchInstallRemoteSkills,
  onViewInstalledSkill,
  onOpenInstalledFolder,
  onUninstallRemoteSkill,
  installedPromptTitles,
  installingPromptIds,
  aishortItems,
  aishortLoading,
  aishortError,
  onFetchAishort,
  promptsChatItems,
  promptsChatMeta,
  promptsChatLoading,
  promptsChatError,
  onSearchPromptsChat,
  fabricItems,
  fabricLoading,
  fabricError,
  onFetchFabric,
  langgptItems,
  langgptLoading,
  langgptError,
  onFetchLanggpt,
  onPreviewRemotePrompt,
  onQuickInstallRemotePrompt,
  onViewInstalledPrompt,
  onOpenSettings,
}: ResourceHubViewProps) {
  // === 榜单合集状态 ===
  const [leaderboardMode, setLeaderboardMode] = useState<'linkly' | 'curated'>(
    initialLeaderboardTab || 'linkly'
  );
  const [activeLinklyList, setActiveLinklyList] = useState<LinklyListId>('best-100');
  const [activeCuratedId, setActiveCuratedId] = useState<string>(
    initialLeaderboardId || CURATED_LEADERBOARDS[0].id
  );
  const [linklySearch, setLinklySearch] = useState('');
  const [linklyCategoryFilter, setLinklyCategoryFilter] = useState<string>('all');
  const [linklyOnlyUninstalled, setLinklyOnlyUninstalled] = useState(false);
  const [linklyVisibleCount, setLinklyVisibleCount] = useState(40);

  // === 订阅仓库状态 ===
  const [repoSearch, setRepoSearch] = useState('');
  const [selectedRepoIds, setSelectedRepoIds] = useState<Set<string> | null>(() =>
    initialRepoFilter && initialRepoFilter !== 'all' ? new Set([initialRepoFilter]) : null
  );
  const [repoOnlyUninstalled, setRepoOnlyUninstalled] = useState(false);
  const [repoVisibleCount, setRepoVisibleCount] = useState(50);
  const [isRepoDrawerOpen, setIsRepoDrawerOpen] = useState(false);

  // === 全网目录状态（skills.sh & GitHub 仓库）===
  const [directoryEngine, setDirectoryEngine] = useState<'skills-sh' | 'github'>(
    initialDirectoryEngine || 'skills-sh'
  );
  // skills.sh 状态
  const [skillsShQuery, setSkillsShQuery] = useState('');
  const [skillsShLimit, setSkillsShLimit] = useState(20);
  const [skillsShResults, setSkillsShResults] = useState<SkillsShItem[]>([]);
  const [skillsShLoading, setSkillsShLoading] = useState(false);
  const [skillsShError, setSkillsShError] = useState<string | null>(null);
  const [skillsShOnlyUninstalled, setSkillsShOnlyUninstalled] = useState(false);
  const [skillsShHasSearched, setSkillsShHasSearched] = useState(false);
  const skillsShTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // GitHub 仓库状态
  const [ghQuery, setGhQuery] = useState('');
  const [ghSort, setGhSort] = useState<'best_match' | 'stars' | 'updated'>('stars');
  const [ghPage, setGhPage] = useState(1);
  const [ghResults, setGhResults] = useState<GitHubRepo[]>([]);
  const [ghTotalCount, setGhTotalCount] = useState(0);
  const [ghLoading, setGhLoading] = useState(false);
  const [ghError, setGhError] = useState<string | null>(null);

  // 内置精选提示词（作为结构化模板频道的内置严选与断网兜底）
  const { allResources: legacyResources } = useResourceRegistry();

  // === 「已安装」页面筛选状态 ===
  const [installedSearch, setInstalledSearch] = useState('');
  const [installedLibraryFilter, setInstalledLibraryFilter] = useState<string>('all');
  const [installedProviderFilter, setInstalledProviderFilter] = useState<'all' | 'resource' | 'git'>('all');

  // 响应外部跳转参数（如从发现页点击某个专题榜或某订阅仓库）
  useEffect(() => {
    if (initialLeaderboardTab) {
      setLeaderboardMode(initialLeaderboardTab);
    }
  }, [initialLeaderboardTab]);

  useEffect(() => {
    if (initialLeaderboardId) {
      setActiveCuratedId(initialLeaderboardId);
      setLeaderboardMode('curated');
    }
  }, [initialLeaderboardId]);

  useEffect(() => {
    if (initialRepoFilter && initialRepoFilter !== 'all') {
      setSelectedRepoIds(new Set([initialRepoFilter]));
    } else if (initialRepoFilter === 'all') {
      setSelectedRepoIds(null);
    }
  }, [initialRepoFilter]);

  useEffect(() => {
    if (initialDirectoryEngine) {
      setDirectoryEngine(initialDirectoryEngine);
    }
  }, [initialDirectoryEngine]);

  // 进入「发现」或「榜单合集」时自动拉取对应的 Linkly AI 每日榜单
  useEffect(() => {
    if (activeSection === 'discover') {
      onFetchLinklyList('best-100', false);
    } else if (activeSection === 'leaderboards' && leaderboardMode === 'linkly') {
      onFetchLinklyList(activeLinklyList, false);
    }
  }, [activeSection, leaderboardMode, activeLinklyList, onFetchLinklyList]);

  // 切换 Linkly 榜单维度时重置分页与分类筛选
  useEffect(() => {
    setLinklyVisibleCount(40);
    setLinklyCategoryFilter('all');
  }, [activeLinklyList]);

  // 切换仓库筛选条件时重置分页
  useEffect(() => {
    setRepoVisibleCount(50);
  }, [repoSearch, selectedRepoIds, repoOnlyUninstalled]);

  // 执行 skills.sh 搜索
  const runSkillsShSearch = useCallback(async (q: string, limit: number) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setSkillsShResults([]);
      setSkillsShError(null);
      setSkillsShHasSearched(false);
      return;
    }
    setSkillsShLoading(true);
    setSkillsShError(null);
    setSkillsShHasSearched(true);
    try {
      const resp = await invoke<SkillsShSearchResponse>('search_skills_sh', {
        query: trimmed,
        limit,
      });
      setSkillsShResults(resp.skills || []);
    } catch (err) {
      setSkillsShError(String(err));
    } finally {
      setSkillsShLoading(false);
    }
  }, []);

  // skills.sh 输入防抖（380ms）
  useEffect(() => {
    if (activeSection !== 'directory' || directoryEngine !== 'skills-sh') return;
    if (skillsShTimerRef.current) clearTimeout(skillsShTimerRef.current);
    if (!skillsShQuery.trim()) {
      setSkillsShResults([]);
      setSkillsShHasSearched(false);
      return;
    }
    skillsShTimerRef.current = setTimeout(() => {
      setSkillsShLimit(20);
      runSkillsShSearch(skillsShQuery, 20);
    }, 380);
    return () => {
      if (skillsShTimerRef.current) clearTimeout(skillsShTimerRef.current);
    };
  }, [skillsShQuery, activeSection, directoryEngine, runSkillsShSearch]);

  // 执行 GitHub 仓库检索（复用后端三通道 search_github_repositories）
  const runGitHubSearch = useCallback(
    async (q: string, sort: 'best_match' | 'stars' | 'updated', page: number, append: boolean) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      setGhLoading(true);
      setGhError(null);
      try {
        const searchTerm = trimmed.toLowerCase().includes('skill')
          ? trimmed
          : `${trimmed} skill`;
        let url = `https://api.github.com/search/repositories?q=${encodeURIComponent(searchTerm)}&page=${page}&per_page=20`;
        if (sort === 'stars') url += '&sort=stars&order=desc';
        else if (sort === 'updated') url += '&sort=updated&order=desc';

        const resp = await invoke<{ status: number; body: string }>('search_github_repositories', {
          queryUrl: url,
          token: getGitHubToken() || null,
        });

        if (resp.status === 403 || resp.status === 429) {
          setGhError('GitHub 匿名搜索已触发频率限制，请先在设置或仓库管理中配置免费 GitHub Token');
          return;
        }
        if (resp.status !== 200) {
          setGhError(`GitHub 搜索返回 HTTP ${resp.status}`);
          return;
        }
        const data = JSON.parse(resp.body);
        const items: GitHubRepo[] = Array.isArray(data.items) ? data.items : [];
        setGhTotalCount(data.total_count || items.length);
        setGhResults(prev => (append ? [...prev, ...items] : items));
        setGhPage(page);
      } catch (err) {
        setGhError(String(err));
      } finally {
        setGhLoading(false);
      }
    },
    []
  );

  // 将 Linkly 条目转成标准 RemoteSkillTarget
  const linklyItemToTarget = (item: LinklyRankingItem): RemoteSkillTarget | null => {
    if (!item.canDirectInstall || !item.githubOwner || !item.githubRepo) return null;
    return {
      host: 'github.com',
      owner: item.githubOwner,
      repo: item.githubRepo,
      skillName: item.skill,
      displayName: item.skill,
      description: item.descriptionZh || item.description,
      installMode: 'subskill',
      provider: 'linkly',
      repoUrl: item.repoUrl || `https://github.com/${item.githubOwner}/${item.githubRepo}`,
      externalUrl: item.url || item.repoUrl,
      installs:
        item.installsSkillssh ||
        item.installsOrDownloads ||
        item.downloadsClawhub ||
        item.downloadsSkillhubCn ||
        undefined,
    };
  };

  // 将订阅仓库技能转成标准 RemoteSkillTarget
  const repoSkillToTarget = (sk: SubscribedRepoSkill): RemoteSkillTarget => ({
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
  });

  // 将 skills.sh 条目转成标准 RemoteSkillTarget
  const skillsShToTarget = (item: SkillsShItem): RemoteSkillTarget => ({
    host: 'github.com',
    owner: item.owner,
    repo: item.repo,
    skillName: item.skillId || item.name,
    displayName: item.name,
    installMode: 'subskill',
    provider: 'skills.sh',
    repoUrl: `https://github.com/${item.owner}/${item.repo}`,
    externalUrl: `https://skills.sh/${item.id}`,
    installs: item.installs,
  });

  // === 计算当前 Linkly 榜单过滤结果 ===
  const currentLinklyResp = linklyCache[activeLinklyList];
  const currentLinklyLoading = linklyLoadingIds.has(activeLinklyList);
  const currentLinklyError = linklyErrors[activeLinklyList];

  // 仅保留可在应用内直接预览与安装的技能，并重排连续展示序号避免过滤外部平台后跳号
  const installableLinklyItems = useMemo<Array<{ item: LinklyRankingItem; displayRank: number }>>(() => {
    const items = currentLinklyResp?.items || [];
    return items
      .filter(i => i.canDirectInstall && Boolean(i.githubOwner && i.githubRepo))
      .map((item, idx) => ({ item, displayRank: idx + 1 }));
  }, [currentLinklyResp]);

  const linklyCategoryOptions = useMemo<FilterSelectOption[]>(() => {
    const counts = new Map<string, number>();
    installableLinklyItems.forEach(({ item }) => {
      if (item.category) {
        counts.set(item.category, (counts.get(item.category) || 0) + 1);
      }
    });
    if (counts.size === 0) return [];

    const sorted = Array.from(counts.entries())
      .map(([cat, count]) => ({
        value: cat,
        label: LINKLY_CATEGORY_LABELS[cat] || cat,
        count,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN'));

    return [{ value: 'all', label: '全部分类', count: installableLinklyItems.length }, ...sorted];
  }, [installableLinklyItems]);

  const filteredLinklyItems = useMemo<Array<{ item: LinklyRankingItem; displayRank: number }>>(() => {
    const q = linklySearch.trim().toLowerCase();
    const matched: Array<{ item: LinklyRankingItem; displayRank: number; score: number }> = [];

    for (const { item, displayRank } of installableLinklyItems) {
      if (linklyCategoryFilter !== 'all' && item.category !== linklyCategoryFilter) continue;
      if (linklyOnlyUninstalled) {
        const t = linklyItemToTarget(item);
        if (t && isRemoteTargetInstalled(t, installedResourceIds)) continue;
      }
      if (!q) {
        matched.push({ item, displayRank, score: 0 });
        continue;
      }
      const desc = `${item.descriptionZh} ${item.description}`;
      const sourceText = `${item.githubOwner || ''}/${item.githubRepo || ''} ${item.vendor} ${item.sourceSkillssh}`;
      const score = scoreSearchMatch(q, item.skill, desc, sourceText);
      if (score > 0) {
        matched.push({ item, displayRank, score });
      }
    }

    if (q) {
      matched.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.displayRank - b.displayRank;
      });
    }

    return matched.map(({ item, displayRank }) => ({ item, displayRank }));
  }, [
    installableLinklyItems,
    linklySearch,
    linklyCategoryFilter,
    linklyOnlyUninstalled,
    isRemoteTargetInstalled,
    installedResourceIds,
  ]);

  // === 计算当前订阅仓库过滤结果 ===
  const enabledRepos = useMemo(() => subscribedRepos.filter(r => r.enabled), [subscribedRepos]);
  const isAnyRepoSyncing = syncingRepoIds.size > 0;

  const filteredRepoSkills = useMemo(() => {
    const q = repoSearch.trim().toLowerCase();
    const matched: Array<{ sk: SubscribedRepoSkill; score: number }> = [];

    for (const sk of subscribedRepoSkills) {
      if (selectedRepoIds !== null && !selectedRepoIds.has(sk.repoId)) continue;
      if (repoOnlyUninstalled) {
        const target = repoSkillToTarget(sk);
        if (isRemoteTargetInstalled(target, installedResourceIds)) continue;
      }
      if (!q) {
        matched.push({ sk, score: 0 });
        continue;
      }
      const sourceText = `${sk.owner}/${sk.repo} ${sk.subpath}`;
      const score = Math.max(
        scoreSearchMatch(q, sk.skillName, sk.description, sourceText),
        scoreSearchMatch(q, sk.displayName, sk.description, sourceText)
      );
      if (score > 0) {
        matched.push({ sk, score });
      }
    }

    if (q) {
      matched.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.sk.skillName.localeCompare(b.sk.skillName);
      });
    }

    return matched.map(m => m.sk);
  }, [
    subscribedRepoSkills,
    repoSearch,
    selectedRepoIds,
    repoOnlyUninstalled,
    isRemoteTargetInstalled,
    installedResourceIds,
  ]);

  // === 计算当前 skills.sh 过滤结果 ===
  const filteredSkillsShItems = useMemo(() => {
    if (!skillsShOnlyUninstalled) return skillsShResults;
    return skillsShResults.filter(
      item => !isRemoteTargetInstalled(skillsShToTarget(item), installedResourceIds)
    );
  }, [skillsShResults, skillsShOnlyUninstalled, isRemoteTargetInstalled, installedResourceIds]);

  // === 内置精选提示词（与 LangGPT 结构化模板合并）===
  const curatedLegacyPrompts = useMemo(
    () => legacyResources.filter(r => r.type === 'prompt'),
    [legacyResources]
  );

  // 辅助渲染单个安装按钮（已安装时点击弹出操作菜单：查看技能 / 打开目录 / 卸载）
  const renderInstallButton = (
    target: RemoteSkillTarget,
    compact = false
  ) => {
    const installed = isRemoteTargetInstalled(target, installedResourceIds);
    const key = buildRemoteSkillKey(target.owner, target.repo, target.skillName, target.subpath);
    const installing = installingKeys.has(key);

    if (installed && !installing) {
      return (
        <InstalledActionButton
          compact={compact}
          onViewSkill={() => onViewInstalledSkill(target)}
          onOpenFolder={() => onOpenInstalledFolder(target)}
          onUninstall={() => onUninstallRemoteSkill(target)}
        />
      );
    }

    return (
      <button
        type="button"
        disabled={installing}
        onClick={e => {
          e.stopPropagation();
          onInstallRemoteSkill(target);
        }}
        className={`shrink-0 inline-flex items-center justify-center gap-1 font-medium transition-colors cursor-pointer ${
          compact ? 'px-3 py-1 rounded-lg text-[11.5px]' : 'px-3.5 py-1.5 rounded-lg text-[12px]'
        } ${
          installing
            ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] cursor-wait'
            : 'bg-[var(--color-primary)]/[0.07] hover:bg-[var(--color-primary)] text-[var(--color-primary)] hover:text-white'
        }`}
      >
        {installing ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>安装中</span>
          </>
        ) : (
          <span>安装</span>
        )}
      </button>
    );
  };

  // ============================================================================
  // 视图 1：发现 (discover)
  // ============================================================================
  const renderDiscoverSection = () => {
    // 发现页仅展示可在应用内直接预览与安装的技能，并保留连续 Top 8
    const best100 = (linklyCache['best-100']?.items || [])
      .filter(i => i.canDirectInstall && Boolean(i.githubOwner && i.githubRepo))
      .slice(0, 8);
    const best100Loading = linklyLoadingIds.has('best-100');
    const lastUpdated = linklyCache['best-100']?.lastUpdated;

    return (
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-8">
        {/* 顶部精选导览横幅（素雅 Apple 质感） */}
        <div className="rounded-2xl bg-gradient-to-br from-[#0055FF] via-[#1B66FF] to-[#3B82F6] text-white p-6 shadow-sm relative overflow-hidden">
          <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="space-y-1.5 max-w-xl">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/15 text-[11px] font-medium backdrop-blur-xs">
                <Sparkles className="w-3 h-3" />
                <span>SkillHub 资源中心</span>
              </div>
              <h1 className="text-[22px] font-bold tracking-tight leading-snug">
                发现全球高口碑 AI Skills，精准装入你的本地技能库
              </h1>
              <p className="text-[13px] text-white/85 leading-relaxed">
                聚合每日实时风向榜单、场景严选专题、可订阅 Git 技能仓库与 skills.sh 全网检索；支持安装前预览 SKILL.md，单技能毫秒级精准落盘。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onNavigateSection('leaderboards', { leaderboardTab: 'linkly' })}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-[#0055FF] text-[12.5px] font-semibold hover:bg-white/95 transition-all cursor-pointer shadow-xs"
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>技能榜单</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateSection('repos')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-[12.5px] font-medium backdrop-blur-xs transition-all cursor-pointer"
              >
                <FolderGit2 className="w-3.5 h-3.5" />
                <span>订阅仓库</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateSection('directory', { directoryEngine: 'skills-sh' })}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-[12.5px] font-medium backdrop-blur-xs transition-all cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>全网目录</span>
              </button>
            </div>
          </div>
        </div>

        {/* 区块 1：精选专题榜 */}
        <section className="space-y-3.5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[16px] font-bold text-[var(--foreground)]">精选专题榜单</h2>
              <p className="text-[12px] text-[var(--color-muted)] mt-0.5">
                按岗位、场景与新手工作流严选整理，附中文能力解读，开箱即装
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateSection('leaderboards', { leaderboardTab: 'curated' })}
              className="text-[12px] font-medium text-[var(--color-primary)] hover:underline inline-flex items-center gap-0.5 cursor-pointer"
            >
              <span>全部专题</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {(curatedLeaderboards.length > 0 ? curatedLeaderboards : CURATED_LEADERBOARDS).map(board => (
              <div
                key={board.id}
                onClick={() =>
                  onNavigateSection('leaderboards', {
                    leaderboardTab: 'curated',
                    leaderboardId: board.id,
                  })
                }
                className="group bg-white rounded-2xl border border-black/[0.08] hover:border-[var(--color-primary)]/25 hover:shadow-[0_6px_20px_rgba(0,0,0,0.05)] transition-all cursor-pointer overflow-hidden flex flex-col"
              >
                <div className="p-4 flex flex-col flex-1">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-md bg-black/[0.04] text-[var(--foreground)]/75">
                      {renderCuratedCategoryIcon(board.category, 'w-3 h-3 text-[var(--color-primary)]')}
                      <span>{board.badge}</span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-[var(--color-muted)] group-hover:translate-x-0.5 transition-transform shrink-0" />
                  </div>
                  <h3 className="text-[14.5px] font-bold text-[var(--foreground)] leading-snug">
                    {board.title}
                  </h3>
                  <p className="text-[12px] text-[var(--color-muted)] mt-1 line-clamp-1">
                    {board.subtitle}
                  </p>

                  {/* Top 3 紧凑预览 */}
                  <div className="mt-3 pt-3 border-t border-black/[0.05] space-y-1.5 flex-1">
                    {board.items.slice(0, 3).map(item => (
                      <div key={item.skillName} className="flex items-center gap-2 text-[12px] min-w-0">
                        <span className="text-[10.5px] font-bold text-[var(--color-muted)] w-4 shrink-0 tabular-nums">
                          0{item.rank}
                        </span>
                        <span className="font-semibold text-[var(--foreground)] shrink-0">
                          {item.displayName || item.skillName}
                        </span>
                        <span className="text-[var(--color-muted)] truncate flex-1">
                          {item.summaryZh}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-black/[0.04] flex items-center justify-between text-[11px] text-[var(--color-muted)]">
                    <span>收录 {board.items.length} 个精选技能</span>
                    <span className="text-[var(--color-primary)] font-medium">查看榜单 →</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 区块 2：今日全球风向速览（Linkly AI Best 100 实时同步） */}
        <section className="space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-500" />
              <h2 className="text-[16px] font-bold text-[var(--foreground)]">今日全球风向 Top 8</h2>
              {lastUpdated && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-black/[0.04] text-[var(--color-muted)]">
                  每日同步 · {lastUpdated}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onNavigateSection('leaderboards', { leaderboardTab: 'linkly' })}
              className="text-[12px] font-medium text-[var(--color-primary)] hover:underline inline-flex items-center gap-0.5 cursor-pointer"
            >
              <span>查看全部实时榜</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {best100Loading && best100.length === 0 ? (
            <div className="bg-white rounded-2xl border border-black/[0.09] p-8 flex items-center justify-center gap-2 text-[13px] text-[var(--color-muted)]">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary)]" />
              <span>正在拉取 Linkly AI 今日实时榜单...</span>
            </div>
          ) : best100.length === 0 ? (
            <div className="bg-white rounded-2xl border border-black/[0.09] p-6 flex items-center justify-between text-[12.5px] text-[var(--color-muted)]">
              <span>暂未能加载今日风向榜，请检查网络后重试</span>
              <button
                type="button"
                onClick={() => onFetchLinklyList('best-100', true)}
                className="px-3 py-1 rounded-lg bg-black/[0.05] text-[var(--foreground)] hover:bg-black/[0.09] cursor-pointer"
              >
                重试
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {best100.map((item, idx) => {
                const target = linklyItemToTarget(item)!;
                const installs = item.installsSkillssh || item.downloadsClawhub || item.downloadsSkillhubCn;
                return (
                  <div
                    key={item.skillKey || `${item.rank}-${item.skill}`}
                    onClick={() => onPreviewRemoteSkill(target, '发现')}
                    className="bg-white rounded-xl border border-black/[0.09] hover:border-black/15 px-3.5 py-3 flex items-center gap-3 transition-all cursor-pointer group"
                  >
                    <RankBadge rank={idx + 1} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[13px] font-semibold text-[var(--foreground)] truncate group-hover:text-[var(--color-primary)] transition-colors">
                          {item.skill}
                        </span>
                        {installs && installs > 0 && (
                          <span className="text-[10.5px] text-[var(--color-muted)] shrink-0 tabular-nums">
                            ↓{formatCompactCount(installs)}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--color-muted)] truncate mt-0.5">
                        {item.descriptionZh ||
                          item.description ||
                          item.sourceSkillssh ||
                          `${item.githubOwner}/${item.githubRepo}`}
                      </div>
                    </div>
                    {renderInstallButton(target, true)}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 区块 3：已订阅的技能仓库源 */}
        <section className="space-y-3.5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[16px] font-bold text-[var(--foreground)]">已订阅技能仓库源</h2>
              <p className="text-[12px] text-[var(--color-muted)] mt-0.5">
                自由订阅开源或私有 Git 仓库，像软件源一样一键检索并提取单个技能
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsRepoDrawerOpen(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white border border-black/10 text-[var(--foreground)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>管理仓库</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {enabledRepos.map(repo => {
              const syncing = syncingRepoIds.has(repo.id);
              return (
                <div
                  key={repo.id}
                  onClick={() => onNavigateSection('repos', { repoFilter: repo.id })}
                  className="bg-white rounded-xl border border-black/[0.09] hover:border-black/15 p-3.5 flex items-center justify-between gap-3 cursor-pointer transition-all group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)]/[0.07] text-[var(--color-primary)] flex items-center justify-center shrink-0">
                      <FolderGit2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-[var(--foreground)] truncate group-hover:text-[var(--color-primary)] transition-colors">
                        {repo.owner}/{repo.repo}
                      </div>
                      <div className="text-[11px] text-[var(--color-muted)] mt-0.5">
                        {syncing
                          ? '正在扫描技能...'
                          : repo.lastSyncedAt
                          ? `已识别 ${repo.skillCount} 个技能`
                          : '点击进入同步'}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[var(--color-muted)] shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </div>
              );
            })}
          </div>
        </section>
      </div>
    );
  };

  // ============================================================================
  // 视图 2：榜单合集 (leaderboards)
  // ============================================================================
  const renderLeaderboardsSection = () => {
    const boards = curatedLeaderboards.length > 0 ? curatedLeaderboards : CURATED_LEADERBOARDS;
    const activeCurated =
      boards.find(b => b.id === activeCuratedId) || boards[0];

    const uninstalledCuratedTargets: RemoteSkillTarget[] = activeCurated.items
      .map(item => ({
        host: 'github.com',
        owner: item.owner,
        repo: item.repo,
        branch: item.branch,
        skillName: item.skillName,
        displayName: item.displayName || item.skillName,
        description: item.summaryZh,
        subpath: item.subpath,
        installMode: item.installMode,
        provider: 'leaderboard' as const,
        repoUrl: `https://github.com/${item.owner}/${item.repo}`,
        installs: item.installs,
        stars: item.stars,
        tags: item.tags,
      }))
      .filter(t => !isRemoteTargetInstalled(t, installedResourceIds));

    const activeLinklyMeta = LINKLY_LIST_TABS.find(t => t.id === activeLinklyList) || LINKLY_LIST_TABS[0];

    return (
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
        {/* 顶部标题 + 两大榜单模式分段控件 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-bold text-[var(--foreground)] tracking-tight">
              技能榜单合集
            </h1>
            <p className="text-[12.5px] text-[var(--color-muted)] mt-0.5">
              每日自动同步的全球生态风向榜 + 人工严选中文场景专题榜
            </p>
          </div>

          <div className="inline-flex p-1 rounded-xl bg-black/[0.05] self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setLeaderboardMode('linkly')}
              className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold transition-all cursor-pointer ${
                leaderboardMode === 'linkly'
                  ? 'bg-white text-[var(--foreground)] shadow-xs'
                  : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              每日实时榜
            </button>
            <button
              type="button"
              onClick={() => setLeaderboardMode('curated')}
              className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold transition-all cursor-pointer ${
                leaderboardMode === 'curated'
                  ? 'bg-white text-[var(--foreground)] shadow-xs'
                  : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              精选专题榜
            </button>
          </div>
        </div>

        {leaderboardMode === 'linkly' ? (
          <div className="space-y-4">
            {/* 实时榜单维度标签栏 */}
            <div className="flex items-center gap-5 flex-wrap border-b border-black/[0.07]">
              {LINKLY_LIST_TABS.map(tab => {
                const active = tab.id === activeLinklyList;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveLinklyList(tab.id)}
                    className={`relative pb-2.5 pt-1 text-[13px] font-medium transition-colors cursor-pointer ${
                      active
                        ? 'text-[var(--foreground)]'
                        : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    {tab.label}
                    <span
                      className={`absolute left-0 right-0 -bottom-[1px] h-[2px] rounded-full transition-opacity ${
                        active ? 'bg-[var(--color-primary)] opacity-100' : 'opacity-0'
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            {/* 筛选与刷新条 */}
            <div className="bg-[#F7F7F9] rounded-xl border border-black/[0.07] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center flex-wrap gap-2.5 flex-1 min-w-[220px]">
                <div className="relative flex-1 min-w-[180px] max-w-xs">
                  <Search className="w-3.5 h-3.5 text-[var(--color-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={linklySearch}
                    onChange={e => setLinklySearch(e.target.value)}
                    placeholder="筛选当前榜单内的技能..."
                    className="w-full pl-8 pr-7 py-1.5 rounded-lg text-[12px] bg-white border border-black/[0.08] focus:border-[var(--color-primary)] outline-none transition-all"
                  />
                  {linklySearch && (
                    <button
                      type="button"
                      onClick={() => setLinklySearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-[var(--foreground)] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {linklyCategoryOptions.length > 0 && (
                  <FilterSelectPopover
                    prefix="分类"
                    value={linklyCategoryFilter}
                    options={linklyCategoryOptions}
                    onChange={setLinklyCategoryFilter}
                    ariaLabel="按分类筛选榜单"
                  />
                )}

                <label className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-muted)] cursor-pointer select-none px-1">
                  <input
                    type="checkbox"
                    checked={linklyOnlyUninstalled}
                    onChange={e => setLinklyOnlyUninstalled(e.target.checked)}
                    className="rounded border-gray-300 text-[var(--color-primary)]"
                  />
                  <span>只看未安装</span>
                </label>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {currentLinklyResp?.lastUpdated && (
                  <span className="text-[11px] text-[var(--color-muted)]">
                    更新日期：{currentLinklyResp.lastUpdated}
                  </span>
                )}
                <button
                  type="button"
                  disabled={currentLinklyLoading}
                  onClick={() => onFetchLinklyList(activeLinklyList, true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium bg-white border border-black/[0.08] hover:border-black/15 text-[var(--foreground)] transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${currentLinklyLoading ? 'animate-spin' : ''}`} />
                  <span>刷新</span>
                </button>
              </div>
            </div>

            <p className="text-[12px] text-[var(--color-muted)] px-1">{activeLinklyMeta.description}</p>

            {/* 榜单列表 */}
            {currentLinklyLoading && !currentLinklyResp ? (
              <div className="bg-white rounded-2xl border border-black/[0.09] py-16 flex flex-col items-center justify-center gap-2.5 text-[var(--color-muted)]">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
                <span className="text-[13px]">正在同步「{activeLinklyMeta.label}」每日数据...</span>
              </div>
            ) : currentLinklyError && !currentLinklyResp ? (
              <div className="bg-white rounded-2xl border border-red-200/70 py-12 px-6 flex flex-col items-center justify-center gap-2 text-center">
                <AlertCircle className="w-6 h-6 text-red-500" />
                <p className="text-[13px] font-semibold text-[var(--foreground)]">榜单加载失败</p>
                <p className="text-[12px] text-[var(--color-muted)] max-w-md">{currentLinklyError}</p>
                <button
                  type="button"
                  onClick={() => onFetchLinklyList(activeLinklyList, true)}
                  className="mt-2 px-3.5 py-1.5 rounded-lg text-[12px] font-medium bg-[var(--color-primary)] text-white cursor-pointer"
                >
                  重试拉取
                </button>
              </div>
            ) : filteredLinklyItems.length === 0 ? (
              <div className="bg-white rounded-2xl border border-black/[0.09] py-12 text-center text-[13px] text-[var(--color-muted)]">
                当前筛选条件下暂无匹配技能
              </div>
            ) : (
              <>
                <div className="bg-white rounded-2xl border border-black/[0.09] divide-y divide-black/[0.05] overflow-hidden shadow-2xs">
                  {filteredLinklyItems.slice(0, linklyVisibleCount).map(({ item, displayRank }) => {
                    const target = linklyItemToTarget(item)!;
                    const totalMetric =
                      item.installsSkillssh ||
                      item.installsOrDownloads ||
                      item.downloadsClawhub ||
                      item.downloadsSkillhubCn;
                    const externalHref = item.url || item.repoUrl || target.repoUrl;

                    return (
                      <div
                        key={item.skillKey || `${item.rank}-${item.skill}`}
                        onClick={() => onPreviewRemoteSkill(target, activeLinklyMeta.label)}
                        className="px-4 py-3 flex items-center gap-3.5 hover:bg-black/[0.015] transition-colors cursor-pointer group"
                      >
                        <RankBadge rank={displayRank} />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
                            <span className="text-[13.5px] font-semibold text-[var(--foreground)] group-hover:text-[var(--color-primary)] transition-colors">
                              <HighlightMatch text={item.skill} query={linklySearch} />
                            </span>
                            <span className="text-[11.5px] font-mono text-[var(--color-muted)] truncate">
                              <HighlightMatch
                                text={`${item.githubOwner}/${item.githubRepo}`}
                                query={linklySearch}
                              />
                            </span>
                            {item.category && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/[0.04] text-[var(--color-muted)]">
                                {LINKLY_CATEGORY_LABELS[item.category] || item.category}
                              </span>
                            )}
                          </div>

                          <p className="text-[12px] text-[var(--color-muted)] mt-0.5 line-clamp-1">
                            <HighlightMatch
                              text={
                                item.descriptionZh ||
                                item.description ||
                                '点击查看该技能的完整 SKILL.md 文档与配套文件'
                              }
                              query={linklySearch}
                            />
                          </p>
                        </div>

                        {/* 核心指标区 */}
                        <div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0 text-right min-w-[78px]">
                          {totalMetric && totalMetric > 0 ? (
                            <span className="text-[12px] font-semibold text-[var(--foreground)] tabular-nums">
                              ↓ {formatCompactCount(totalMetric)}
                            </span>
                          ) : null}
                          {item.wis != null && (
                            <span className="text-[10.5px] text-[var(--color-muted)] tabular-nums">
                              评分 {item.wis.toFixed(1)}
                            </span>
                          )}
                          {item.weeklyRecent != null && item.weeklyRecent > 0 && (
                            <span className="text-[10.5px] text-emerald-600 font-medium tabular-nums">
                              本周 +{formatCompactCount(item.weeklyRecent)}
                            </span>
                          )}
                          {item.firstSeenDays != null && (
                            <span className="text-[10.5px] text-orange-600 font-medium">
                              新晋 {item.firstSeenDays} 天
                            </span>
                          )}
                          {item.buzzScore != null && (
                            <span className="text-[10.5px] text-purple-600 font-medium">
                              热议 {(item.buzzScore * 100).toFixed(0)}
                            </span>
                          )}
                        </div>

                        {/* 操作按钮 */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {renderInstallButton(target, true)}

                          {externalHref && (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                openUrl(externalHref).catch(console.error);
                              }}
                              className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors cursor-pointer"
                              title="打开来源详情页"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {filteredLinklyItems.length > linklyVisibleCount && (
                  <div className="flex justify-center pt-1">
                    <button
                      type="button"
                      onClick={() => setLinklyVisibleCount(c => c + 40)}
                      className="px-4 py-1.5 rounded-lg text-[12px] font-medium bg-white border border-black/10 text-[var(--foreground)] hover:border-black/20 cursor-pointer shadow-2xs"
                    >
                      加载更多（剩余 {filteredLinklyItems.length - linklyVisibleCount} 条）
                    </button>
                  </div>
                )}

                {/* CC BY 4.0 合规来源署名 */}
                <div className="flex items-center justify-center gap-1.5 pt-2 text-[11.5px] text-[var(--color-muted)]">
                  <span>数据源自</span>
                  <button
                    type="button"
                    onClick={() => openUrl('https://linkly.ai/zh/skills/trending').catch(console.error)}
                    className="font-medium text-[var(--foreground)]/80 hover:text-[var(--color-primary)] hover:underline cursor-pointer"
                  >
                    Linkly AI · Best Skills
                  </button>
                  <span>(CC BY 4.0) · 每日自动同步</span>
                </div>
              </>
            )}
          </div>
        ) : (
          /* === 精选专题榜 === */
          <div className="space-y-4">
            {/* 专题选择器 + 远程清单手动刷新 */}
            <div className="flex items-end justify-between gap-4 border-b border-black/[0.07]">
              <div className="flex items-center gap-5 flex-wrap">
                {boards.map(b => {
                  const active = b.id === activeCurated.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setActiveCuratedId(b.id)}
                      className={`relative pb-2.5 pt-1 text-[13px] font-medium transition-colors cursor-pointer ${
                        active
                          ? 'text-[var(--foreground)]'
                          : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      {b.title}
                      <span
                        className={`absolute left-0 right-0 -bottom-[1px] h-[2px] rounded-full transition-opacity ${
                          active ? 'bg-[var(--color-primary)] opacity-100' : 'opacity-0'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={curatedLoading}
                onClick={() => onRefreshCuratedLeaderboards(true)}
                title="检查远程专题清单更新"
                className="mb-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium bg-white border border-black/[0.08] hover:border-black/15 text-[var(--foreground)] transition-colors cursor-pointer disabled:opacity-50 shadow-2xs shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${curatedLoading ? 'animate-spin' : ''}`} />
                <span>刷新</span>
              </button>
            </div>

            {/* 专题头部卡片 */}
            <div className="bg-gradient-to-br from-[#FAFBFC] via-white to-[#F4F7FC] rounded-2xl border border-black/[0.08] shadow-2xs p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-[var(--color-primary)]/[0.08] border border-[var(--color-primary)]/12 text-[var(--color-primary)] flex items-center justify-center shrink-0 mt-0.5">
                  {renderCuratedCategoryIcon(activeCurated.category, 'w-5 h-5')}
                </div>
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-black/[0.045] text-[var(--foreground)]/75">
                      {activeCurated.badge}
                    </span>
                    <span className="text-[11.5px] text-[var(--color-muted)]">
                      · 共 {activeCurated.items.length} 个精选技能
                    </span>
                  </div>
                  <h2 className="text-[17px] font-bold text-[var(--foreground)]">
                    {activeCurated.title}
                  </h2>
                  <p className="text-[12.5px] text-[var(--color-muted)]">{activeCurated.subtitle}</p>
                </div>
              </div>

              <button
                type="button"
                disabled={uninstalledCuratedTargets.length === 0}
                onClick={() =>
                  onBatchInstallRemoteSkills(uninstalledCuratedTargets, activeCurated.title)
                }
                className="shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-[12.5px] font-semibold bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-45 transition-all cursor-pointer shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>
                  {uninstalledCuratedTargets.length === 0
                    ? '本榜技能已全部安装'
                    : `一键安装未装技能 (${uninstalledCuratedTargets.length})`}
                </span>
              </button>
            </div>

            {/* 专题榜单条目 */}
            <div className="bg-white rounded-2xl border border-black/[0.09] divide-y divide-black/[0.05] overflow-hidden shadow-2xs">
              {activeCurated.items.map(item => {
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

                return (
                  <div
                    key={`${activeCurated.id}-${item.rank}-${item.skillName}`}
                    onClick={() => onPreviewRemoteSkill(target, activeCurated.title)}
                    className="px-4 py-3.5 flex items-center gap-3.5 hover:bg-black/[0.015] transition-colors cursor-pointer group"
                  >
                    <RankBadge rank={item.rank} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2">
                        {item.stepLabel && (
                          <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                            {item.stepLabel}
                          </span>
                        )}
                        <span className="text-[13.5px] font-semibold text-[var(--foreground)] group-hover:text-[var(--color-primary)] transition-colors">
                          {item.displayName || item.skillName}
                        </span>
                        <span className="text-[11.5px] font-mono text-[var(--color-muted)]">
                          {item.owner}/{item.repo}
                        </span>
                        {item.installMode === 'repo' && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/[0.04] text-[var(--color-muted)]">
                            完整仓库
                          </span>
                        )}
                      </div>
                      <p className="text-[12.5px] text-[var(--foreground)]/75 mt-0.5 leading-relaxed">
                        {item.summaryZh}
                      </p>
                    </div>

                    <div className="hidden sm:flex items-center gap-3 shrink-0">
                      {item.installs && item.installs > 0 && (
                        <span className="text-[12px] font-semibold text-blue-600 tabular-nums">
                          ↓ {formatCompactCount(item.installs)}
                        </span>
                      )}
                      {item.stars && item.stars > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[12px] font-medium text-amber-600 tabular-nums">
                          <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                          {formatCompactCount(item.stars)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {renderInstallButton(target, true)}
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          openUrl(`https://github.com/${item.owner}/${item.repo}`).catch(console.error);
                        }}
                        className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors cursor-pointer"
                        title="在 GitHub 打开"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {activeCurated.sourceAttribution && (
              <div className="flex items-center justify-center flex-wrap gap-1 pt-1 text-[11.5px] text-[var(--color-muted)]">
                {(() => {
                  const text = activeCurated.sourceAttribution;
                  const label = activeCurated.sourceLinkLabel;
                  const url = activeCurated.sourceLinkUrl;
                  const idx = label && url ? text.indexOf(label) : -1;
                  if (idx !== -1 && label && url) {
                    const before = text.slice(0, idx);
                    const after = text.slice(idx + label.length);
                    return (
                      <span>
                        {before}
                        <button
                          type="button"
                          onClick={() => openUrl(url).catch(console.error)}
                          className="font-medium text-[var(--foreground)]/80 hover:text-[var(--color-primary)] hover:underline cursor-pointer"
                        >
                          {label}
                        </button>
                        {after}
                      </span>
                    );
                  }
                  return <span>{text}</span>;
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ============================================================================
  // 视图 3：订阅仓库源 (repos — CC Switch 风格)
  // ============================================================================
  const renderReposSection = () => (
    <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">
      {/* 头部标题 + 刷新与管理仓库 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold text-[var(--foreground)] tracking-tight">
            订阅技能仓库
          </h1>
          <p className="text-[12.5px] text-[var(--color-muted)] mt-0.5">
            自动索引已订阅仓库中的全部技能（当前已启用 {enabledRepos.length} 个仓库，共索引{' '}
            {subscribedRepoSkills.length} 个技能）
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={isAnyRepoSyncing}
            onClick={() => onRefreshAllSubscribedRepos(true, false)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-medium bg-white border border-black/10 text-[var(--foreground)] hover:border-black/20 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAnyRepoSyncing ? 'animate-spin' : ''}`} />
            <span>{isAnyRepoSyncing ? '正在刷新...' : '刷新仓库'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsRepoDrawerOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] transition-all cursor-pointer shadow-xs"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>管理仓库 · {subscribedRepos.length}</span>
          </button>
        </div>
      </div>

      {/* 筛选控制条（多选来源浮层 + 仅看未安装） */}
      <div className="bg-[#F7F7F9] rounded-xl border border-black/[0.07] px-3.5 py-2.5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-[var(--color-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={repoSearch}
            onChange={e => setRepoSearch(e.target.value)}
            placeholder="搜索技能名称、描述或仓库..."
            className="w-full pl-8 pr-7 py-1.5 rounded-lg text-[12.5px] bg-white border border-black/[0.08] focus:border-[var(--color-primary)] outline-none transition-all"
          />
          {repoSearch && (
            <button
              type="button"
              onClick={() => setRepoSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-[var(--foreground)] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <RepoSourceFilterPopover
          repos={enabledRepos}
          selectedRepoIds={selectedRepoIds}
          syncingRepoIds={syncingRepoIds}
          onChangeSelected={setSelectedRepoIds}
          onOpenManageRepos={() => setIsRepoDrawerOpen(true)}
        />

        <label className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-muted)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={repoOnlyUninstalled}
            onChange={e => setRepoOnlyUninstalled(e.target.checked)}
            className="rounded border-gray-300 text-[var(--color-primary)]"
          />
          <span>只看未安装</span>
        </label>
      </div>

      {/* 技能列表 */}
      {reposLoading && subscribedRepoSkills.length === 0 ? (
        <div className="bg-white rounded-2xl border border-black/[0.09] py-16 flex flex-col items-center justify-center gap-2 text-[var(--color-muted)]">
          <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
          <span className="text-[13px]">正在加载订阅仓库索引...</span>
        </div>
      ) : filteredRepoSkills.length === 0 ? (
        <div className="bg-white rounded-2xl border border-black/[0.09] py-14 px-6 flex flex-col items-center justify-center gap-2.5 text-center">
          {isAnyRepoSyncing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
              <p className="text-[13px] font-medium text-[var(--foreground)]">
                首次同步预置技能仓库中，马上呈现...
              </p>
              <p className="text-[12px] text-[var(--color-muted)]">
                正在后台扫描 {syncingRepoIds.size} 个仓库的 SKILL.md 索引
              </p>
            </>
          ) : (
            <>
              <FolderGit2 className="w-7 h-7 text-[var(--color-muted)]/50" />
              <p className="text-[13.5px] font-semibold text-[var(--foreground)]">
                {subscribedRepoSkills.length === 0 ? '尚未拉取到仓库技能' : '没有符合条件的技能'}
              </p>
              <p className="text-[12px] text-[var(--color-muted)]">
                {subscribedRepoSkills.length === 0
                  ? '点击右上角「刷新仓库」扫描预置源，或打开「管理仓库」添加自定义 Git 仓库'
                  : '尝试调整关键词或切换「来源」筛选条件'}
              </p>
              {subscribedRepoSkills.length === 0 && (
                <button
                  type="button"
                  onClick={() => onRefreshAllSubscribedRepos(true, false)}
                  className="mt-1 px-4 py-1.5 rounded-lg text-[12px] font-semibold bg-[var(--color-primary)] text-white cursor-pointer"
                >
                  立即扫描仓库
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-black/[0.09] divide-y divide-black/[0.05] overflow-hidden shadow-2xs">
            {filteredRepoSkills.slice(0, repoVisibleCount).map(sk => {
              const target = repoSkillToTarget(sk);
              const repoWebUrl = sk.subpath
                ? `https://${sk.host}/${sk.owner}/${sk.repo}/tree/${sk.branch || 'main'}/${sk.subpath}`
                : `https://${sk.host}/${sk.owner}/${sk.repo}`;

              return (
                <div
                  key={sk.id}
                  onClick={() => onPreviewRemoteSkill(target, '订阅仓库')}
                  className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-black/[0.015] transition-colors cursor-pointer group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
                      <span className="text-[13.5px] font-semibold text-[var(--foreground)] group-hover:text-[var(--color-primary)] transition-colors">
                        <HighlightMatch text={sk.skillName} query={repoSearch} />
                      </span>
                      <span className="text-[11.5px] font-mono text-[var(--color-muted)]">
                        <HighlightMatch text={`${sk.owner}/${sk.repo}`} query={repoSearch} />
                      </span>
                      {sk.subpath && sk.subpath !== sk.skillName && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/[0.035] text-[var(--color-muted)] truncate max-w-[200px]">
                          <HighlightMatch text={sk.subpath} query={repoSearch} />
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-[var(--color-muted)] mt-0.5 line-clamp-1">
                      <HighlightMatch
                        text={sk.description || '点击预览该技能的完整 SKILL.md 文档'}
                        query={repoSearch}
                      />
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {renderInstallButton(target, true)}
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        openUrl(repoWebUrl).catch(console.error);
                      }}
                      className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors cursor-pointer"
                      title="在浏览器查看源文件"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredRepoSkills.length > repoVisibleCount && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => setRepoVisibleCount(c => c + 50)}
                className="px-4 py-1.5 rounded-lg text-[12px] font-medium bg-white border border-black/10 text-[var(--foreground)] hover:border-black/20 cursor-pointer shadow-2xs"
              >
                加载更多（已显示 {repoVisibleCount} / {filteredRepoSkills.length}）
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );

  // ============================================================================
  // 视图 4：全网目录检索 (directory — skills.sh + GitHub 仓库)
  // ============================================================================
  const renderDirectorySection = () => {
    const hasGithubToken = !!getGitHubToken();

    return (
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-bold text-[var(--foreground)] tracking-tight">
              全网技能目录
            </h1>
            <p className="text-[12.5px] text-[var(--color-muted)] mt-0.5">
              免配置实时检索全网公开 AI Skills（按全球安装量或 GitHub Star 排序）
            </p>
          </div>

          <div className="inline-flex p-1 rounded-xl bg-black/[0.05] self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setDirectoryEngine('skills-sh')}
              className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold transition-all cursor-pointer ${
                directoryEngine === 'skills-sh'
                  ? 'bg-white text-[var(--foreground)] shadow-xs'
                  : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              skills.sh 目录
            </button>
            <button
              type="button"
              onClick={() => setDirectoryEngine('github')}
              className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold transition-all cursor-pointer ${
                directoryEngine === 'github'
                  ? 'bg-white text-[var(--foreground)] shadow-xs'
                  : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              GitHub 仓库搜索
            </button>
          </div>
        </div>

        {directoryEngine === 'skills-sh' ? (
          <div className="space-y-4">
            {/* 搜索框 + 筛选 */}
            <div className="bg-[#F7F7F9] rounded-xl border border-black/[0.07] p-3.5 space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[var(--color-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={skillsShQuery}
                    onChange={e => setSkillsShQuery(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && skillsShQuery.trim()) {
                        if (skillsShTimerRef.current) clearTimeout(skillsShTimerRef.current);
                        setSkillsShLimit(20);
                        runSkillsShSearch(skillsShQuery, 20);
                      }
                    }}
                    placeholder="输入技能关键词搜索 skills.sh（例如 ppt、design、react、browser、seo...）"
                    className="w-full pl-9 pr-8 py-2 rounded-lg text-[13px] bg-black/[0.03] border border-transparent focus:border-[var(--color-primary)] focus:bg-white outline-none transition-all"
                  />
                  {skillsShQuery && (
                    <button
                      type="button"
                      onClick={() => setSkillsShQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-[var(--foreground)] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <label className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-muted)] cursor-pointer select-none shrink-0">
                  <input
                    type="checkbox"
                    checked={skillsShOnlyUninstalled}
                    onChange={e => setSkillsShOnlyUninstalled(e.target.checked)}
                    className="rounded border-gray-300 text-[var(--color-primary)]"
                  />
                  <span>只看未安装</span>
                </label>
              </div>

              {/* 快捷热词 */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-[var(--color-muted)] mr-1">热门探索：</span>
                {SKILLS_SH_QUICK_KEYWORDS.map(kw => (
                  <button
                    key={kw.query}
                    type="button"
                    onClick={() => {
                      setSkillsShQuery(kw.query);
                      setSkillsShLimit(20);
                      runSkillsShSearch(kw.query, 20);
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer ${
                      skillsShQuery.trim().toLowerCase() === kw.query
                        ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                        : 'bg-black/[0.03] text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/[0.06]'
                    }`}
                  >
                    {kw.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 结果列表 */}
            {skillsShLoading && skillsShResults.length === 0 ? (
              <div className="bg-white rounded-2xl border border-black/[0.09] py-14 flex flex-col items-center justify-center gap-2 text-[var(--color-muted)]">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
                <span className="text-[13px]">正在检索 skills.sh...</span>
              </div>
            ) : skillsShError ? (
              <div className="bg-white rounded-2xl border border-red-200/70 py-10 px-6 flex flex-col items-center justify-center gap-2 text-center">
                <AlertCircle className="w-6 h-6 text-red-500" />
                <p className="text-[13px] font-semibold text-[var(--foreground)]">检索 skills.sh 失败</p>
                <p className="text-[12px] text-[var(--color-muted)]">{skillsShError}</p>
              </div>
            ) : !skillsShHasSearched ? (
              <div className="bg-white rounded-2xl border border-black/[0.09] py-14 px-6 flex flex-col items-center justify-center gap-2 text-center">
                <Globe className="w-8 h-8 text-[var(--color-primary)]/50" />
                <p className="text-[14px] font-semibold text-[var(--foreground)]">
                  输入关键词或点选上方热词，实时搜索 skills.sh 全网技能
                </p>
                <p className="text-[12px] text-[var(--color-muted)] max-w-md">
                  返回结果按全球真实安装量排序，点击任意项可预览完整 SKILL.md 并精准提取单个技能到你的本地库
                </p>
              </div>
            ) : filteredSkillsShItems.length === 0 ? (
              <div className="bg-white rounded-2xl border border-black/[0.09] py-12 text-center text-[13px] text-[var(--color-muted)]">
                未找到与「{skillsShQuery}」匹配的 skills.sh 技能
              </div>
            ) : (
              <>
                <div className="bg-white rounded-2xl border border-black/[0.09] divide-y divide-black/[0.05] overflow-hidden shadow-2xs">
                  {filteredSkillsShItems.map(item => {
                    const target = skillsShToTarget(item);
                    return (
                      <div
                        key={item.id}
                        onClick={() => onPreviewRemoteSkill(target, 'skills.sh')}
                        className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-black/[0.015] transition-colors cursor-pointer group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13.5px] font-semibold text-[var(--foreground)] group-hover:text-[var(--color-primary)] transition-colors">
                              {item.name}
                            </span>
                            {item.installs > 0 && (
                              <span className="text-[11.5px] font-medium text-[var(--color-muted)] tabular-nums">
                                ↓ {formatCompactCount(item.installs)}
                              </span>
                            )}
                          </div>
                          <div className="text-[11.5px] text-[var(--color-muted)] font-mono mt-0.5 truncate">
                            skills.sh · {item.source}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {renderInstallButton(target, true)}
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              openUrl(`https://skills.sh/${item.id}`).catch(console.error);
                            }}
                            className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors cursor-pointer"
                            title="在 skills.sh 查看"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 加载更多（通过增大 limit 拉取更多） */}
                {skillsShResults.length >= skillsShLimit && skillsShLimit < 100 && (
                  <div className="flex justify-center pt-1">
                    <button
                      type="button"
                      disabled={skillsShLoading}
                      onClick={() => {
                        const nextLimit = Math.min(skillsShLimit + 20, 100);
                        setSkillsShLimit(nextLimit);
                        runSkillsShSearch(skillsShQuery, nextLimit);
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-medium bg-white border border-black/10 text-[var(--foreground)] hover:border-black/20 cursor-pointer shadow-2xs disabled:opacity-50"
                    >
                      {skillsShLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>加载更多</span>
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-center gap-1 pt-1 text-[11.5px] text-[var(--color-muted)]">
                  <span>由</span>
                  <button
                    type="button"
                    onClick={() => openUrl('https://skills.sh').catch(console.error)}
                    className="font-medium text-[var(--foreground)]/80 hover:text-[var(--color-primary)] hover:underline cursor-pointer"
                  >
                    skills.sh
                  </button>
                  <span>提供</span>
                </div>
              </>
            )}
          </div>
        ) : (
          /* === GitHub 仓库搜索 === */
          <div className="space-y-4">
            <div className="bg-[#F7F7F9] rounded-xl border border-black/[0.07] p-3.5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[var(--color-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={ghQuery}
                    onChange={e => setGhQuery(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && ghQuery.trim()) {
                        runGitHubSearch(ghQuery, ghSort, 1, false);
                      }
                    }}
                    placeholder="搜索 GitHub 开源技能仓库（按回车检索）..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg text-[13px] bg-black/[0.03] border border-transparent focus:border-[var(--color-primary)] focus:bg-white outline-none transition-all"
                  />
                </div>
                <button
                  type="button"
                  disabled={ghLoading || !ghQuery.trim()}
                  onClick={() => runGitHubSearch(ghQuery, ghSort, 1, false)}
                  className="px-4 py-2 rounded-lg text-[12.5px] font-semibold bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-45 cursor-pointer shrink-0"
                >
                  {ghLoading ? '搜索中...' : '搜索'}
                </button>
              </div>

              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 text-[11.5px]">
                  <span className="text-[var(--color-muted)]">排序：</span>
                  {(
                    [
                      { id: 'stars', label: '最多 Star' },
                      { id: 'best_match', label: '最佳匹配' },
                      { id: 'updated', label: '最近更新' },
                    ] as const
                  ).map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setGhSort(opt.id);
                        if (ghQuery.trim()) {
                          runGitHubSearch(ghQuery, opt.id, 1, false);
                        }
                      }}
                      className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                        ghSort === opt.id
                          ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                          : 'bg-black/[0.03] text-[var(--color-muted)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => (onOpenSettings ? onOpenSettings() : setIsRepoDrawerOpen(true))}
                  className={`inline-flex items-center gap-1 text-[11.5px] px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                    hasGithubToken
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  }`}
                >
                  <Key className="w-3 h-3" />
                  <span>{hasGithubToken ? 'GitHub Token 已生效' : '配置 Token 解除限频'}</span>
                </button>
              </div>
            </div>

            {ghError ? (
              <div className="bg-white rounded-2xl border border-red-200/70 p-6 text-center space-y-2">
                <p className="text-[13px] font-semibold text-[var(--foreground)]">{ghError}</p>
              </div>
            ) : ghResults.length === 0 && !ghLoading ? (
              <div className="bg-white rounded-2xl border border-black/[0.09] py-14 px-6 text-center space-y-1.5">
                <Layers className="w-7 h-7 text-[var(--color-muted)]/50 mx-auto" />
                <p className="text-[13.5px] font-semibold text-[var(--foreground)]">
                  直接检索 GitHub 公开技能仓库
                </p>
                <p className="text-[12px] text-[var(--color-muted)]">
                  支持完整仓库克隆入库，或顺手加入「订阅仓库」拆选其中的单个子技能
                </p>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-2xl border border-black/[0.09] divide-y divide-black/[0.05] overflow-hidden shadow-2xs">
                  {ghResults.map(repo => {
                    const owner = repo.owner?.login || repo.full_name.split('/')[0] || '';
                    const target: RemoteSkillTarget = {
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
                    };

                    return (
                      <div
                        key={repo.id}
                        className="px-4 py-3.5 flex items-center justify-between gap-4 hover:bg-black/[0.015] transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13.5px] font-semibold text-[var(--foreground)] truncate">
                              {repo.full_name}
                            </span>
                            <span className="inline-flex items-center gap-0.5 text-[11.5px] text-amber-600 shrink-0 tabular-nums">
                              <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                              {formatCompactCount(repo.stargazers_count)}
                            </span>
                            {repo.language && (
                              <span className="text-[10.5px] px-1.5 py-0.2 rounded bg-black/[0.04] text-[var(--color-muted)] shrink-0">
                                {repo.language}
                              </span>
                            )}
                          </div>
                          <p className="text-[12px] text-[var(--color-muted)] mt-0.5 line-clamp-2">
                            {repo.description || '暂无仓库简介'}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {renderInstallButton(target, true)}
                          <button
                            type="button"
                            onClick={() => openUrl(repo.html_url).catch(console.error)}
                            className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 cursor-pointer"
                            title="在 GitHub 查看"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {ghResults.length < ghTotalCount && (
                  <div className="flex justify-center pt-1">
                    <button
                      type="button"
                      disabled={ghLoading}
                      onClick={() => runGitHubSearch(ghQuery, ghSort, ghPage + 1, true)}
                      className="px-4 py-1.5 rounded-lg text-[12px] font-medium bg-white border border-black/10 text-[var(--foreground)] hover:border-black/20 cursor-pointer shadow-2xs disabled:opacity-50"
                    >
                      {ghLoading ? '加载中...' : '加载更多仓库'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  // ============================================================================
  // 视图 5：已安装与更新 (installed — 类应用商店「已安装」管理页)
  // ============================================================================
  const renderInstalledSection = () => {
    const normPath = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
    const dirMap = new Map(directories.map(d => [d.id, d]));

    const enrichedItems = installedSources.map(src => {
      const matchedRepo = groupedRepos.find(r => normPath(r.path) === normPath(src.localPath));
      const matchedDir =
        (matchedRepo?.source_dir_id ? dirMap.get(matchedRepo.source_dir_id) : undefined) ||
        directories.find(d => normPath(src.localPath).startsWith(`${normPath(d.path)}/`));

      const displayName =
        src.provider === 'git-clone'
          ? matchedRepo?.name || src.repo
          : src.skillName || matchedRepo?.name || src.repo;

      const description =
        matchedRepo && matchedRepo.skills.length === 1
          ? matchedRepo.skills[0].description
          : matchedRepo && matchedRepo.skills.length > 1
          ? `技能组合包 · 包含 ${matchedRepo.skills.length} 个技能`
          : '';

      const isFromResourceHub = src.provider !== 'git-clone';
      const target: RemoteSkillTarget = {
        host: 'github.com',
        owner: src.owner,
        repo: src.repo,
        skillName: src.skillName || src.repo,
        displayName,
        description,
        subpath: src.subpath || undefined,
        installMode: src.provider === 'git-clone' ? 'repo' : 'subskill',
        provider:
          src.provider === 'linkly' ||
          src.provider === 'leaderboard' ||
          src.provider === 'repo-source' ||
          src.provider === 'skills.sh' ||
          src.provider === 'github'
            ? src.provider
            : 'curated',
        repoUrl: src.repoUrl,
      };

      return {
        src,
        displayName,
        description,
        libraryId: matchedDir?.id || '',
        libraryLabel: matchedDir?.label || '本地技能库',
        skillCount: matchedRepo?.skills.length || 1,
        isFromResourceHub,
        target,
      };
    });

    const q = installedSearch.trim().toLowerCase();
    const filtered = enrichedItems
      .filter(item => {
        if (installedLibraryFilter !== 'all' && item.libraryId !== installedLibraryFilter) {
          return false;
        }
        if (installedProviderFilter === 'resource' && !item.isFromResourceHub) {
          return false;
        }
        if (installedProviderFilter === 'git' && item.isFromResourceHub) {
          return false;
        }
        if (!q) return true;
        return (
          item.displayName.toLowerCase().includes(q) ||
          `${item.src.owner}/${item.src.repo}`.toLowerCase().includes(q) ||
          item.src.subpath.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // 资源中心精准安装的排在前面，方便优先管理
        if (a.isFromResourceHub !== b.isFromResourceHub) {
          return a.isFromResourceHub ? -1 : 1;
        }
        return a.displayName.localeCompare(b.displayName);
      });

    const isCheckingAny = updatingInstalledPaths.size > 0;
    const resourceInstalledCount = enrichedItems.filter(i => i.isFromResourceHub).length;
    const gitInstalledCount = enrichedItems.length - resourceInstalledCount;
    const libraryCountMap = new Map<string, number>();
    enrichedItems.forEach(item => {
      if (item.libraryId) {
        libraryCountMap.set(item.libraryId, (libraryCountMap.get(item.libraryId) || 0) + 1);
      }
    });
    const installedLibraryOptions: FilterSelectOption[] = [
      { value: 'all', label: '全部技能库', count: enrichedItems.length },
      ...directories.map(d => ({
        value: d.id,
        label: d.label,
        count: libraryCountMap.get(d.id) || 0,
      })),
    ];

    return (
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
        {/* 头部标题 + 全部检查更新 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-bold text-[var(--foreground)] tracking-tight flex items-center gap-2">
              <PackageCheck className="w-5 h-5 text-[var(--color-primary)]" />
              <span>已安装技能</span>
            </h1>
            <p className="text-[12.5px] text-[var(--color-muted)] mt-0.5">
              集中管理从资源中心与 Git 仓库安装的远程技能（共 {enrichedItems.length} 项），支持一键检查上游更新、查看与卸载
            </p>
          </div>

          <button
            type="button"
            disabled={isCheckingAny || filtered.length === 0}
            onClick={() =>
              onCheckUpdateAllInstalled(
                filtered.map(i => ({ path: i.src.localPath, name: i.displayName }))
              )
            }
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-45 transition-all cursor-pointer shrink-0 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingAny ? 'animate-spin' : ''}`} />
            <span>{isCheckingAny ? '正在检查更新...' : '全部检查更新'}</span>
          </button>
        </div>

        {/* 筛选控制条 */}
        <div className="bg-[#F7F7F9] rounded-xl border border-black/[0.07] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center flex-wrap gap-2 flex-1 min-w-[200px]">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="w-3.5 h-3.5 text-[var(--color-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={installedSearch}
                onChange={e => setInstalledSearch(e.target.value)}
                placeholder="搜索已安装技能或来源仓库..."
                className="w-full pl-8 pr-7 py-1.5 rounded-lg text-[12px] bg-white border border-black/[0.08] focus:border-[var(--color-primary)] outline-none transition-all"
              />
              {installedSearch && (
                <button
                  type="button"
                  onClick={() => setInstalledSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-[var(--foreground)] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {directories.length > 1 && (
              <FilterSelectPopover
                prefix="技能库"
                value={installedLibraryFilter}
                options={installedLibraryOptions}
                onChange={setInstalledLibraryFilter}
                ariaLabel="按技能库筛选已安装技能"
              />
            )}
          </div>

          <div className="inline-flex p-0.5 rounded-lg bg-black/[0.05] text-[11.5px]">
            {(
              [
                { id: 'all', label: `全部 (${enrichedItems.length})` },
                { id: 'resource', label: `资源中心 (${resourceInstalledCount})` },
                { id: 'git', label: `Git 仓库 (${gitInstalledCount})` },
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setInstalledProviderFilter(tab.id)}
                className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                  installedProviderFilter === tab.id
                    ? 'bg-white text-[var(--foreground)] shadow-2xs'
                    : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 已安装列表 */}
        {filtered.length === 0 ? (
          <div className="bg-[#FAFAFC] rounded-2xl border border-black/[0.07] py-16 px-6 flex flex-col items-center justify-center gap-2.5 text-center">
            <PackageCheck className="w-8 h-8 text-[var(--color-muted)]/45" />
            <p className="text-[14px] font-semibold text-[var(--foreground)]">
              {enrichedItems.length === 0 ? '暂未通过资源中心或 Git 安装技能' : '没有符合筛选条件的已安装技能'}
            </p>
            <p className="text-[12px] text-[var(--color-muted)] max-w-md">
              去「榜单合集」「订阅仓库」或「全网目录」挑选心仪的 AI Skills，安装后会集中展示在这里方便检查更新与管理
            </p>
            {enrichedItems.length === 0 && (
              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => onNavigateSection('leaderboards')}
                  className="px-3.5 py-1.5 rounded-lg text-[12px] font-semibold bg-[var(--color-primary)] text-white cursor-pointer"
                >
                  去逛技能榜单
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateSection('directory', { directoryEngine: 'skills-sh' })}
                  className="px-3.5 py-1.5 rounded-lg text-[12px] font-medium bg-white border border-black/10 text-[var(--foreground)] cursor-pointer"
                >
                  搜索 skills.sh
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-black/[0.08] divide-y divide-black/[0.05] overflow-hidden">
            {filtered.map(item => {
              const isUpdating = updatingInstalledPaths.has(item.src.localPath);
              const providerLabel = PROVIDER_BADGE_LABEL[item.src.provider] || '资源中心';

              return (
                <div
                  key={item.src.localPath}
                  onClick={() => onViewInstalledSkill(item.target)}
                  className="px-4 py-3.5 flex items-center justify-between gap-4 hover:bg-black/[0.015] transition-colors cursor-pointer group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-1.5">
                      <span className="text-[13.5px] font-semibold text-[var(--foreground)] group-hover:text-[var(--color-primary)] transition-colors">
                        {item.displayName}
                      </span>
                      <span className="text-[10.5px] font-medium px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200/60">
                        {item.libraryLabel}
                      </span>
                      <span className="text-[10.5px] px-1.5 py-0.2 rounded bg-black/[0.04] text-[var(--color-muted)]">
                        {providerLabel}
                      </span>
                      {item.skillCount > 1 && (
                        <span className="text-[10.5px] px-1.5 py-0.2 rounded bg-black/[0.04] text-[var(--color-muted)]">
                          {item.skillCount} 个技能
                        </span>
                      )}
                    </div>

                    <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[11.5px] text-[var(--color-muted)] font-mono mt-0.5">
                      <span>
                        {item.src.owner}/{item.src.repo}
                      </span>
                      {item.src.subpath && (
                        <>
                          <span>·</span>
                          <span className="truncate max-w-[260px]">{item.src.subpath}</span>
                        </>
                      )}
                    </div>

                    {item.description && (
                      <p className="text-[12px] text-[var(--color-muted)] mt-1 line-clamp-1">
                        {item.description}
                      </p>
                    )}
                  </div>

                  {/* 操作组：检查更新 / 查看技能 / 打开目录 / 卸载 */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={e => {
                        e.stopPropagation();
                        onCheckUpdateInstalled(item.src.localPath, item.displayName);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11.5px] font-medium bg-white border border-black/12 text-[var(--foreground)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors cursor-pointer disabled:opacity-50"
                      title="检查并同步上游最新版本"
                    >
                      <RefreshCw className={`w-3 h-3 ${isUpdating ? 'animate-spin' : ''}`} />
                      <span>{isUpdating ? '更新中' : '检查更新'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onViewInstalledSkill(item.target);
                      }}
                      className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:bg-black/5 transition-colors cursor-pointer"
                      title="查看技能"
                    >
                      <FileCode className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onOpenInstalledFolder(item.target);
                      }}
                      className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors cursor-pointer"
                      title="打开本地目录"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onUninstallRemoteSkill(item.target);
                      }}
                      className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      title="卸载技能"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ============================================================================
  // 视图 6：提示词精选（多源动态广场：AiShort / prompts.chat / Fabric / LangGPT）
  // ============================================================================
  const renderPromptsSection = () => (
    <PromptCatalogView
      curatedLegacyPrompts={curatedLegacyPrompts}
      installedPromptTitles={installedPromptTitles}
      installingPromptIds={installingPromptIds}
      aishortItems={aishortItems}
      aishortLoading={aishortLoading}
      aishortError={aishortError}
      onFetchAishort={onFetchAishort}
      promptsChatItems={promptsChatItems}
      promptsChatMeta={promptsChatMeta}
      promptsChatLoading={promptsChatLoading}
      promptsChatError={promptsChatError}
      onSearchPromptsChat={onSearchPromptsChat}
      fabricItems={fabricItems}
      fabricLoading={fabricLoading}
      fabricError={fabricError}
      onFetchFabric={onFetchFabric}
      langgptItems={langgptItems}
      langgptLoading={langgptLoading}
      langgptError={langgptError}
      onFetchLanggpt={onFetchLanggpt}
      onPreviewPrompt={onPreviewRemotePrompt}
      onQuickInstallPrompt={onQuickInstallRemotePrompt}
      onViewInstalledPrompt={onViewInstalledPrompt}
    />
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-white relative">
      <div className="flex-1 min-h-0 overflow-y-auto hover-scroll">
        {activeSection === 'discover' && renderDiscoverSection()}
        {activeSection === 'leaderboards' && renderLeaderboardsSection()}
        {activeSection === 'repos' && renderReposSection()}
        {activeSection === 'directory' && renderDirectorySection()}
        {activeSection === 'installed' && renderInstalledSection()}
        {activeSection === 'prompts' && renderPromptsSection()}
      </div>

      {/* 管理技能仓库右侧抽屉 */}
      <RepoManagerDrawer
        isOpen={isRepoDrawerOpen}
        onClose={() => setIsRepoDrawerOpen(false)}
        repos={subscribedRepos}
        syncingRepoIds={syncingRepoIds}
        onReposChanged={onReposChanged}
        onSyncSingleRepo={onSyncSingleSubscribedRepo}
      />
    </div>
  );
}
