import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type {
  CuratedLeaderboard,
  InstalledSkillSource,
  LinklyLeaderboardResponse,
  LinklyListId,
  RemoteSkillTarget,
  SubscribedRepo,
  SubscribedRepoSkill,
  SubscribedRepoSyncResult,
} from '../types/resourceHub';
import { CURATED_LEADERBOARDS, CURATED_LEADERBOARDS_REMOTE_URL } from '../data/curated-leaderboards';
import { getGitHubToken } from '../utils/githubToken';
import { showToast } from '../components/ui/Toast';

/**
 * 统一构造跨来源技能匹配键，用于精确判定「已安装 / 安装中」状态
 */
export function buildRemoteSkillKey(owner: string, repo: string, skillName: string, subpath?: string): string {
  const o = owner.trim().toLowerCase();
  const r = repo.trim().toLowerCase();
  const sub = (subpath || '').trim().replace(/^\/+|\/+$/g, '').toLowerCase();
  const sk = skillName.trim().toLowerCase();
  if (sub) {
    return `${o}/${r}::${sub}`;
  }
  return `${o}/${r}/${sk}`;
}

export function useResourceHub(
  loadCacheEnabled: boolean,
  autoSyncReposEnabled: boolean,
  libraryRefreshNonce: number
) {
  const [subscribedRepos, setSubscribedRepos] = useState<SubscribedRepo[]>([]);
  const [subscribedRepoSkills, setSubscribedRepoSkills] = useState<SubscribedRepoSkill[]>([]);
  const [syncingRepoIds, setSyncingRepoIds] = useState<Set<string>>(new Set());
  const [reposLoading, setReposLoading] = useState(false);

  const [installedSources, setInstalledSources] = useState<InstalledSkillSource[]>([]);
  const [linklyCache, setLinklyCache] = useState<Partial<Record<LinklyListId, LinklyLeaderboardResponse>>>({});
  const [linklyLoadingIds, setLinklyLoadingIds] = useState<Set<LinklyListId>>(new Set());
  const [linklyErrors, setLinklyErrors] = useState<Partial<Record<LinklyListId, string>>>({});

  // 精选专题榜：默认内置 JSON 零延迟展示，进入资源中心后静默检查远程热更新（24h 缓存）
  const [curatedLeaderboards, setCuratedLeaderboards] = useState<CuratedLeaderboard[]>(CURATED_LEADERBOARDS);
  const [curatedLoading, setCuratedLoading] = useState(false);

  const autoSyncedOnceRef = useRef(false);
  const curatedCheckedOnceRef = useRef(false);
  const isBatchSyncingReposRef = useRef(false);
  const linklyCacheRef = useRef<Partial<Record<LinklyListId, LinklyLeaderboardResponse>>>({});
  const linklyInFlightRef = useRef<Set<LinklyListId>>(new Set());

  // 加载已安装来源元数据（精准匹配 owner/repo/subpath）
  const loadInstalledSources = useCallback(async () => {
    try {
      const list = await invoke<InstalledSkillSource[]>('get_installed_skill_sources');
      setInstalledSources(list);
    } catch (err) {
      console.error('Failed to load installed skill sources:', err);
    }
  }, []);

  useEffect(() => {
    loadInstalledSources();
  }, [loadInstalledSources, libraryRefreshNonce]);

  // 加载订阅仓库及其缓存技能
  const loadSubscribedReposData = useCallback(async () => {
    setReposLoading(true);
    try {
      const [repos, skills] = await Promise.all([
        invoke<SubscribedRepo[]>('get_subscribed_repos'),
        invoke<SubscribedRepoSkill[]>('get_subscribed_repo_skills', { onlyEnabled: true }),
      ]);
      setSubscribedRepos(repos);
      setSubscribedRepoSkills(skills);
      return repos;
    } catch (err) {
      console.error('Failed to load subscribed repos:', err);
      return [] as SubscribedRepo[];
    } finally {
      setReposLoading(false);
    }
  }, []);

  // 同步单个订阅仓库
  const syncSingleSubscribedRepo = useCallback(
    async (repoId: string, force = false): Promise<SubscribedRepoSyncResult | null> => {
      setSyncingRepoIds(prev => new Set(prev).add(repoId));
      try {
        const res = await invoke<SubscribedRepoSyncResult>('sync_subscribed_repo', {
          repoId,
          force,
          githubToken: getGitHubToken() || null,
        });
        await loadSubscribedReposData();
        return res;
      } catch (err) {
        console.error(`Sync repo ${repoId} failed:`, err);
        showToast(`刷新仓库失败: ${err}`, 'error');
        return null;
      } finally {
        setSyncingRepoIds(prev => {
          const next = new Set(prev);
          next.delete(repoId);
          return next;
        });
      }
    },
    [loadSubscribedReposData]
  );

  // 批量同步全部已启用仓库（限制并发为 2，带防重入锁；未变更仓库由后端 500 字节 SHA 比对 0 流量秒过）
  const refreshAllSubscribedRepos = useCallback(
    async (force = true, silent = false) => {
      if (isBatchSyncingReposRef.current) {
        if (!silent) showToast('正在刷新订阅仓库，请稍候...', 'info');
        return;
      }
      isBatchSyncingReposRef.current = true;
      try {
        const repos = await loadSubscribedReposData();
        const targets = repos.filter(r => r.enabled && (force || !r.lastSyncedAt));
        if (targets.length === 0) {
          if (!silent) showToast('所有已启用仓库均为最新状态', 'info');
          return;
        }

        if (!silent) {
          showToast(`正在检查 ${targets.length} 个订阅仓库更新...`, 'info');
        }

        let okCount = 0;
        let skippedCount = 0;
        let totalSkills = 0;
        const queue = [...targets];

        const worker = async () => {
          while (queue.length > 0) {
            const item = queue.shift();
            if (!item) break;
            setSyncingRepoIds(prev => new Set(prev).add(item.id));
            try {
              const res = await invoke<SubscribedRepoSyncResult>('sync_subscribed_repo', {
                repoId: item.id,
                force,
                githubToken: getGitHubToken() || null,
              });
              okCount += 1;
              if (res.skippedUnchanged) skippedCount += 1;
              totalSkills += res.skillCount;
            } catch (err) {
              console.error(`Batch sync ${item.id} failed:`, err);
            } finally {
              setSyncingRepoIds(prev => {
                const next = new Set(prev);
                next.delete(item.id);
                return next;
              });
            }
          }
        };

        await Promise.all([worker(), worker()]);
        await loadSubscribedReposData();

        if (!silent) {
          const updatedCount = okCount - skippedCount;
          if (updatedCount === 0 && skippedCount === targets.length) {
            showToast(`全部 ${targets.length} 个仓库均为最新，共索引 ${totalSkills} 个技能`, 'success');
          } else {
            showToast(
              `刷新完成：更新 ${updatedCount} 个、无变更跳过 ${skippedCount} 个（共索引 ${totalSkills} 个技能）`,
              'success'
            );
          }
        }
      } finally {
        isBatchSyncingReposRef.current = false;
      }
    },
    [loadSubscribedReposData]
  );

  // 拉取 Linkly AI 每日榜单（带内存 + SQLite 双层缓存，使用 Ref 保证回调稳定与并发去重）
  const fetchLinklyList = useCallback(
    async (listId: LinklyListId, forceRefresh = false): Promise<LinklyLeaderboardResponse | null> => {
      if (!forceRefresh && linklyCacheRef.current[listId]) {
        return linklyCacheRef.current[listId] || null;
      }
      if (linklyInFlightRef.current.has(listId)) {
        return linklyCacheRef.current[listId] || null;
      }
      linklyInFlightRef.current.add(listId);
      setLinklyLoadingIds(prev => new Set(prev).add(listId));
      setLinklyErrors(prev => ({ ...prev, [listId]: undefined }));
      try {
        const resp = await invoke<LinklyLeaderboardResponse>('fetch_linkly_leaderboard', {
          listId,
          forceRefresh,
        });
        linklyCacheRef.current = { ...linklyCacheRef.current, [listId]: resp };
        setLinklyCache(prev => ({ ...prev, [listId]: resp }));
        return resp;
      } catch (err) {
        const msg = String(err);
        setLinklyErrors(prev => ({ ...prev, [listId]: msg }));
        return null;
      } finally {
        linklyInFlightRef.current.delete(listId);
        setLinklyLoadingIds(prev => {
          const next = new Set(prev);
          next.delete(listId);
          return next;
        });
      }
    },
    []
  );

  // 拉取精选专题榜远程热更新 JSON（24h SQLite 缓存 + 国内镜像；失败则静默保持内置 JSON）
  const fetchCuratedLeaderboards = useCallback(async (forceRefresh = false) => {
    setCuratedLoading(true);
    try {
      const resp = await invoke<{ leaderboards?: CuratedLeaderboard[] }>(
        'fetch_curated_leaderboards',
        {
          remoteUrl: CURATED_LEADERBOARDS_REMOTE_URL,
          forceRefresh,
        }
      );
      if (Array.isArray(resp?.leaderboards) && resp.leaderboards.length > 0) {
        setCuratedLeaderboards(resp.leaderboards);
        if (forceRefresh) {
          showToast(`精选专题榜已同步最新清单（共 ${resp.leaderboards.length} 个专题）`, 'success');
        }
      }
    } catch (err) {
      console.warn('Curated leaderboards remote fetch skipped, using bundled JSON:', err);
      if (forceRefresh) {
        showToast('远程清单暂不可用，当前展示内置精选专题榜', 'info');
      }
    } finally {
      setCuratedLoading(false);
    }
  }, []);

  // 打开资源中心或 ⌘K 全局搜索时：仅从本地 SQLite 读取已有缓存 + 静默检查一次精选专题榜热更新（24h 缓存）
  useEffect(() => {
    if (!loadCacheEnabled) return;
    loadSubscribedReposData();
    if (!curatedCheckedOnceRef.current) {
      curatedCheckedOnceRef.current = true;
      fetchCuratedLeaderboards(false);
    }
  }, [loadCacheEnabled, loadSubscribedReposData, fetchCuratedLeaderboards]);

  // 仅当用户主动进入「资源中心 -> 订阅仓库」视图时，才对从未扫描过的预置仓库执行一次首次索引
  useEffect(() => {
    if (!autoSyncReposEnabled) return;
    let cancelled = false;
    loadSubscribedReposData().then(repos => {
      if (cancelled) return;
      if (!autoSyncedOnceRef.current) {
        autoSyncedOnceRef.current = true;
        const needInitialSync = repos.some(r => r.enabled && !r.lastSyncedAt);
        if (needInitialSync) {
          refreshAllSubscribedRepos(false, true);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [autoSyncReposEnabled, loadSubscribedReposData, refreshAllSubscribedRepos]);

  // 精准已安装匹配索引（同时保留对应 InstalledSkillSource 便于查看技能/打开目录/卸载）
  const installedLookup = useMemo(() => {
    const exactSubpaths = new Map<string, InstalledSkillSource>();
    const repoAndSkill = new Map<string, InstalledSkillSource>();
    const wholeRepos = new Map<string, InstalledSkillSource>();

    for (const src of installedSources) {
      const o = src.owner.toLowerCase();
      const r = src.repo.toLowerCase();
      const sub = src.subpath.replace(/^\/+|\/+$/g, '').toLowerCase();
      const sk = src.skillName.toLowerCase();

      if (src.provider === 'git-clone') {
        wholeRepos.set(`${o}/${r}`, src);
      } else {
        if (sub) {
          exactSubpaths.set(`${o}/${r}::${sub}`, src);
        }
        if (sk) {
          repoAndSkill.set(`${o}/${r}/${sk}`, src);
        }
        if (!sub) {
          wholeRepos.set(`${o}/${r}`, src);
        }
      }
    }

    return { exactSubpaths, repoAndSkill, wholeRepos };
  }, [installedSources]);

  /**
   * 查找远程技能目标在本地对应的已安装溯源记录
   */
  const findInstalledSource = useCallback(
    (
      target: Pick<RemoteSkillTarget, 'owner' | 'repo' | 'skillName' | 'subpath' | 'installMode'>
    ): InstalledSkillSource | null => {
      const o = target.owner.trim().toLowerCase();
      const r = target.repo.trim().toLowerCase();
      const sk = target.skillName.trim().toLowerCase();
      const sub = (target.subpath || '').trim().replace(/^\/+|\/+$/g, '').toLowerCase();

      if (sub) {
        const hit = installedLookup.exactSubpaths.get(`${o}/${r}::${sub}`);
        if (hit) return hit;
      }
      if (sk) {
        const hit = installedLookup.repoAndSkill.get(`${o}/${r}/${sk}`);
        if (hit) return hit;
      }
      const repoHit = installedLookup.wholeRepos.get(`${o}/${r}`);
      if (repoHit) return repoHit;
      return null;
    },
    [installedLookup]
  );

  /**
   * 判断某个远程技能目标是否已安装在本地技能库中
   */
  const isRemoteTargetInstalled = useCallback(
    (
      target: Pick<RemoteSkillTarget, 'owner' | 'repo' | 'skillName' | 'subpath' | 'installMode'>,
      fallbackInstalledNames?: Set<string>
    ): boolean => {
      if (findInstalledSource(target)) {
        return true;
      }
      // 整仓模式下也检查规范化 repoUrl
      if (target.installMode === 'repo' && fallbackInstalledNames) {
        const o = target.owner.trim().toLowerCase();
        const r = target.repo.trim().toLowerCase();
        const normUrl = `https://github.com/${o}/${r}`;
        if (fallbackInstalledNames.has(normUrl)) {
          return true;
        }
      }
      return false;
    },
    [findInstalledSource]
  );

  const enabledRepoCount = useMemo(
    () => subscribedRepos.filter(r => r.enabled).length,
    [subscribedRepos]
  );

  return {
    subscribedRepos,
    subscribedRepoSkills,
    enabledRepoCount,
    syncingRepoIds,
    reposLoading,
    installedSources,
    linklyCache,
    linklyLoadingIds,
    linklyErrors,
    curatedLeaderboards,
    curatedLoading,
    loadInstalledSources,
    loadSubscribedReposData,
    syncSingleSubscribedRepo,
    refreshAllSubscribedRepos,
    fetchLinklyList,
    fetchCuratedLeaderboards,
    findInstalledSource,
    isRemoteTargetInstalled,
  };
}
