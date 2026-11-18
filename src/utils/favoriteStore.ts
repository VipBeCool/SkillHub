import { emit } from '@tauri-apps/api/event';
import { isCollectionRepo } from './tagStore';

const REPO_FAVORITES_STORAGE_KEY = 'skillhub_repo_favorites_set';

function readRepoFavoritesArray(): string[] {
  try {
    const raw = localStorage.getItem(REPO_FAVORITES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return Array.from(new Set(parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)));
      }
    }
  } catch (err) {
    console.warn('读取技能包星标列表失败:', err);
  }
  return [];
}

function saveRepoFavoritesSet(set: Set<string>, changedRepoIds: string[]): void {
  try {
    localStorage.setItem(REPO_FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch (err) {
    console.warn('保存技能包星标列表失败:', err);
  }
  window.dispatchEvent(new CustomEvent('skillhub:repo-favorites-changed', { detail: { repoIds: changedRepoIds } }));
  emit('skillhub:repo-favorites-changed', { repoIds: changedRepoIds }).catch(() => {});
}

/**
 * 获取当前已星标的技能包 ID 集合
 */
export function getRepoFavoritesSet(): Set<string> {
  return new Set(readRepoFavoritesArray());
}

/**
 * 判断指定技能包自身是否已被星标（与包内子技能的星标互相独立）
 */
export function isRepoStarred(repoId: string): boolean {
  if (!repoId) return false;
  return getRepoFavoritesSet().has(repoId);
}

/**
 * 设置指定技能包的星标状态
 */
export function setRepoStarred(repoId: string, starred: boolean): boolean {
  if (!repoId) return false;
  const set = getRepoFavoritesSet();
  if (starred) {
    set.add(repoId);
  } else {
    set.delete(repoId);
  }
  saveRepoFavoritesSet(set, [repoId]);
  return starred;
}

/**
 * 批量设置多个技能包的星标状态
 */
export function setReposStarredBatch(repoIds: string[], starred: boolean): void {
  if (repoIds.length === 0) return;
  const set = getRepoFavoritesSet();
  let changed = false;
  for (const id of repoIds) {
    if (!id) continue;
    if (starred && !set.has(id)) {
      set.add(id);
      changed = true;
    } else if (!starred && set.has(id)) {
      set.delete(id);
      changed = true;
    }
  }
  if (changed) {
    saveRepoFavoritesSet(set, repoIds);
  }
}

/**
 * 切换指定技能包的星标状态，返回切换后的状态
 */
export function toggleRepoStarred(repoId: string): boolean {
  const next = !isRepoStarred(repoId);
  return setRepoStarred(repoId, next);
}

/**
 * 双层口径判断一级条目（技能包或独立单技能）是否已星标：
 * - 技能包：仅检查技能包自身的独立星标
 * - 独立单技能：检查其唯一 Skill 实体的 is_favorite
 */
export function isRepoItemStarred(repo: {
  id: string;
  repo_type?: string;
  skills: Array<{ is_favorite?: boolean }>;
}): boolean {
  if (isCollectionRepo(repo)) {
    return isRepoStarred(repo.id);
  }
  return Boolean(repo.skills[0]?.is_favorite);
}
