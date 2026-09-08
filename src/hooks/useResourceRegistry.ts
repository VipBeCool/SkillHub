import { useState, useEffect, useMemo, useCallback } from 'react';
import type { RegistryIndex, ResourceItem, Collection, CategoryDef, FeaturedItem } from '../types/resource';
import registryData from '../data/resource-registry.json';

const STARS_CACHE_KEY = 'skillhub_github_stars_cache_v1';
const RATE_LIMIT_KEY = 'skillhub_github_stars_rate_limit_until';
const LAST_CHECK_KEY = 'skillhub_github_stars_last_check_ts';

// 缓存有效期：7 天（按周更新，作为参考指标无需高频刷新，彻底规避封禁）
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// 每日最多检查一次后台静默更新
const MIN_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  stars: number;
  timestamp: number;
}

// 全局内存共享状态与订阅者，确保所有页面卡片、合辑与详情页星标实时统一
let memoryStarsMap: Record<string, number> = {};
let memoryCacheRaw: Record<string, CacheEntry> = {};
const listeners = new Set<(stars: Record<string, number>) => void>();

// 初始化尝试从 localStorage 恢复缓存
try {
  const raw = localStorage.getItem(STARS_CACHE_KEY);
  if (raw) {
    memoryCacheRaw = JSON.parse(raw);
    const loaded: Record<string, number> = {};
    for (const [k, v] of Object.entries(memoryCacheRaw)) {
      if (v && typeof v.stars === 'number' && v.stars > 0) {
        loaded[k] = v.stars;
      }
    }
    memoryStarsMap = loaded;
  }
} catch {
  // 忽略不可读异常
}

function updateGlobalStar(repoKey: string, stars: number) {
  memoryCacheRaw[repoKey] = { stars, timestamp: Date.now() };
  memoryStarsMap = { ...memoryStarsMap, [repoKey]: stars };
  try {
    localStorage.setItem(STARS_CACHE_KEY, JSON.stringify(memoryCacheRaw));
  } catch {
    // 忽略存储空间超限
  }
  listeners.forEach(l => l(memoryStarsMap));
}

function isRateLimited(): boolean {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY);
    if (!raw) return false;
    const until = parseInt(raw, 10);
    return Date.now() < until;
  } catch {
    return false;
  }
}

function setRateLimited() {
  try {
    // 触发 GitHub 限流时，自我保护锁定 24 小时绝对不发请求
    localStorage.setItem(RATE_LIMIT_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
  } catch {
    // 忽略
  }
}

// 提取 github 规范 key: 如 "obra/superpowers"
export function extractRepoKey(repoUrl?: string): string | null {
  if (!repoUrl) return null;
  const match = repoUrl.match(/github\.com\/([^/]+\/[^/]+)/);
  if (!match) return null;
  return match[1].replace(/\.git$/, '').toLowerCase();
}

/**
 * 外部可按需调用的单项实时刷新函数（例如详情页优先实时拉取）
 */
export async function refreshSingleRepoStar(repoUrl: string): Promise<number | null> {
  const key = extractRepoKey(repoUrl);
  if (!key) return null;

  // 若处于限流冷却期，直接返回本地缓存（宁缺毋错，不发网络请求）
  if (isRateLimited()) {
    return memoryStarsMap[key] ?? null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://api.github.com/repos/${key}`, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.status === 403 || res.status === 429) {
      setRateLimited();
      return memoryStarsMap[key] ?? null;
    }

    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.stargazers_count === 'number' && data.stargazers_count >= 0) {
        updateGlobalStar(key, data.stargazers_count);
        return data.stargazers_count;
      }
    }
  } catch {
    // 优雅静默降级，宁缺毋错
  }
  return memoryStarsMap[key] ?? null;
}

/**
 * 资源索引数据 Hook
 * 支持权威预置数据 + 本地智能缓存 + 超低频极度温和单项后台更新
 */
export function useResourceRegistry() {
  const [registry, setRegistry] = useState<RegistryIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveStars, setLiveStars] = useState<Record<string, number>>(memoryStarsMap);

  // 监听全局星标动态变更
  useEffect(() => {
    listeners.add(setLiveStars);
    return () => {
      listeners.delete(setLiveStars);
    };
  }, []);

  useEffect(() => {
    try {
      setRegistry(registryData as RegistryIndex);
      setLoading(false);
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  }, []);

  // 后台超低频极度温和更新：
  // 1. 检查距离上次检查是否已超过 24 小时（每天最多检查一次）
  // 2. 检查是否在 403 限流自保锁定中
  // 3. 每次最多只更新 1 个超过 7 天未刷新的仓库
  useEffect(() => {
    if (!registry) return;
    if (isRateLimited()) return;

    let isCancelled = false;
    const now = Date.now();

    // 每天最多检查 1 次
    try {
      const lastCheck = localStorage.getItem(LAST_CHECK_KEY);
      if (lastCheck && now - parseInt(lastCheck, 10) < MIN_CHECK_INTERVAL_MS) {
        return;
      }
    } catch {
      // 忽略
    }

    // 找出所有超过 7 天未更新的技能仓库
    const expiredRepos: { key: string; originalUrl: string }[] = [];
    for (const r of registry.resources) {
      if (r.type === 'skill' && r.repoUrl) {
        const key = extractRepoKey(r.repoUrl);
        if (key) {
          const entry = memoryCacheRaw[key];
          if (!entry || now - entry.timestamp > CACHE_TTL_MS) {
            expiredRepos.push({ key, originalUrl: r.repoUrl });
          }
        }
      }
    }

    if (expiredRepos.length === 0) return;

    // 记录本次检查时间
    try {
      localStorage.setItem(LAST_CHECK_KEY, String(now));
    } catch {
      // 忽略
    }

    // 极度保守策略：每次启动/进入，最多只静默更新 1 个过期仓库，完全杜绝 GitHub 限流
    const target = expiredRepos[0];

    const runSilentUpdate = async () => {
      // 延迟 5 秒再启动，不占用应用启动阶段的网络与资源
      await new Promise(r => setTimeout(r, 5000));
      if (isCancelled || isRateLimited()) return;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`https://api.github.com/repos/${target.key}`, { signal: controller.signal });
        clearTimeout(timeout);

        if (res.status === 403 || res.status === 429) {
          setRateLimited();
          return;
        }

        if (res.ok) {
          const data = await res.json();
          if (data && typeof data.stargazers_count === 'number' && data.stargazers_count >= 0) {
            updateGlobalStar(target.key, data.stargazers_count);
          }
        }
      } catch {
        // 网络断网或超时，静默跳过，绝不报错或制造脏数据
      }
    };

    runSilentUpdate();

    return () => {
      isCancelled = true;
    };
  }, [registry]);

  // 将动态 liveStars 映射回资源列表
  const allResources = useMemo((): ResourceItem[] => {
    if (!registry) return [];
    return registry.resources.map(r => {
      if (r.type === 'skill' && r.repoUrl) {
        const key = extractRepoKey(r.repoUrl);
        if (key && typeof liveStars[key] === 'number') {
          return { ...r, stars: liveStars[key] };
        }
      }
      return r;
    });
  }, [registry, liveStars]);

  // 按分类获取资源
  const getResourcesByCategory = useCallback((categoryId: string): ResourceItem[] => {
    return allResources.filter(r => r.category === categoryId);
  }, [allResources]);

  // 按类型获取资源
  const getResourcesByType = useCallback((type: 'skill' | 'prompt'): ResourceItem[] => {
    return allResources.filter(r => r.type === type);
  }, [allResources]);

  // 获取单个资源
  const getResourceById = useCallback((id: string): ResourceItem | undefined => {
    return allResources.find(r => r.id === id);
  }, [allResources]);

  // 获取合辑详情（含资源列表）
  const getCollectionWithResources = useCallback((collectionId: string) => {
    if (!registry) return null;
    const collection = registry.collections.find(c => c.id === collectionId);
    if (!collection) return null;
    const resources = collection.resourceIds
      .map(rid => allResources.find(r => r.id === rid))
      .filter(Boolean) as ResourceItem[];
    return { ...collection, resources };
  }, [registry, allResources]);

  // 搜索资源
  const searchResources = useCallback((query: string): ResourceItem[] => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return allResources.filter(r =>
      r.displayName.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      r.tags.some(t => t.toLowerCase().includes(q))
    );
  }, [allResources]);

  // 热门资源（实时按最新动态 stars 倒序排序）
  const popularResources = useMemo(() => {
    return [...allResources]
      .sort((a, b) => (b.stars || 0) - (a.stars || 0))
      .slice(0, 8);
  }, [allResources]);

  // 分类列表
  const categories = useMemo((): CategoryDef[] => {
    return registry?.categories || [];
  }, [registry]);

  // 合辑列表
  const collections = useMemo((): Collection[] => {
    return registry?.collections || [];
  }, [registry]);

  // 精选推荐
  const featured = useMemo((): FeaturedItem[] => {
    return registry?.featured || [];
  }, [registry]);

  return {
    registry,
    loading,
    error,
    categories,
    collections,
    featured,
    allResources,
    popularResources,
    getResourcesByCategory,
    getResourcesByType,
    getResourceById,
    getCollectionWithResources,
    searchResources,
  };
}
