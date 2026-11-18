export type TagModule = 'skills' | 'prompts';

export interface TagMeta {
  starredTags: string[];
  recentTags: string[];
  customTags: string[];
  sortMode: 'count' | 'alpha';
}

export interface TagStatItem {
  name: string;
  count: number;
  isStarred: boolean;
  isRecent: boolean;
  isCustomOnly: boolean;
}

const DEFAULT_TAG_META: TagMeta = {
  starredTags: [],
  recentTags: [],
  customTags: [],
  sortMode: 'count',
};

function getStorageKey(module: TagModule): string {
  return `skillhub_tag_meta_${module}`;
}

function dedupeList(list: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of list) {
    const trimmed = item.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

/**
 * 解析逗号分隔的标签字符串（兼容中英文逗号）并去重
 */
export function parseTags(raw?: string | null): string[] {
  if (!raw) return [];
  return dedupeList(raw.split(/[,，]/));
}

/**
 * 将标签数组序列化为存储字符串
 */
export function serializeTags(tags: string[]): string {
  return dedupeList(tags).join(',');
}

/**
 * 获取指定模块的标签元数据（常用、最近使用、预设空标签、排序偏好）
 */
export function getTagMeta(module: TagModule): TagMeta {
  try {
    const raw = localStorage.getItem(getStorageKey(module));
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        starredTags: Array.isArray(parsed.starredTags) ? dedupeList(parsed.starredTags) : [],
        recentTags: Array.isArray(parsed.recentTags) ? dedupeList(parsed.recentTags) : [],
        customTags: Array.isArray(parsed.customTags) ? dedupeList(parsed.customTags) : [],
        sortMode: parsed.sortMode === 'alpha' ? 'alpha' : 'count',
      };
    }
  } catch (err) {
    console.warn('读取标签元数据失败:', err);
  }
  return { ...DEFAULT_TAG_META };
}

/**
 * 保存标签元数据并广播变更事件
 */
export function saveTagMeta(module: TagModule, meta: TagMeta): void {
  const normalized: TagMeta = {
    starredTags: dedupeList(meta.starredTags),
    recentTags: dedupeList(meta.recentTags),
    customTags: dedupeList(meta.customTags),
    sortMode: meta.sortMode === 'alpha' ? 'alpha' : 'count',
  };
  try {
    localStorage.setItem(getStorageKey(module), JSON.stringify(normalized));
  } catch (err) {
    console.warn('保存标签元数据失败:', err);
  }
  window.dispatchEvent(new CustomEvent('skillhub:tag-meta-changed', { detail: { module } }));
}

/**
 * 切换标签的常用星标状态
 */
export function toggleStarTag(module: TagModule, tag: string): TagMeta {
  const name = tag.trim();
  const meta = getTagMeta(module);
  if (!name) return meta;
  const exists = meta.starredTags.includes(name);
  const starredTags = exists
    ? meta.starredTags.filter(t => t !== name)
    : [...meta.starredTags, name];
  const next: TagMeta = { ...meta, starredTags };
  saveTagMeta(module, next);
  return next;
}

/**
 * 记录最近使用标签（队头插入并截断）
 */
export function recordRecentTag(module: TagModule, tag: string, maxRecent = 12): TagMeta {
  const name = tag.trim();
  const meta = getTagMeta(module);
  if (!name) return meta;
  const recentTags = [name, ...meta.recentTags.filter(t => t !== name)].slice(0, maxRecent);
  const next: TagMeta = { ...meta, recentTags };
  saveTagMeta(module, next);
  return next;
}

/**
 * 添加预设空标签（在尚无条目使用该标签时仍可在选择器和管理器中展示）
 */
export function addCustomTag(module: TagModule, tag: string): TagMeta {
  const name = tag.trim();
  const meta = getTagMeta(module);
  if (!name) return meta;
  const customTags = dedupeList([...meta.customTags, name]);
  const next: TagMeta = { ...meta, customTags };
  saveTagMeta(module, next);
  return next;
}

/**
 * 从标签元数据（常用、最近、预设）中清理指定标签
 */
export function removeTagFromMeta(module: TagModule, tag: string): TagMeta {
  const name = tag.trim();
  const meta = getTagMeta(module);
  const next: TagMeta = {
    ...meta,
    starredTags: meta.starredTags.filter(t => t !== name),
    recentTags: meta.recentTags.filter(t => t !== name),
    customTags: meta.customTags.filter(t => t !== name),
  };
  saveTagMeta(module, next);
  return next;
}

/**
 * 重命名元数据中的标签名（若新名称已存在则自动合并去重）
 */
export function renameTagInMeta(module: TagModule, oldName: string, newName: string): TagMeta {
  const oldTrimmed = oldName.trim();
  const newTrimmed = newName.trim();
  const meta = getTagMeta(module);
  if (!oldTrimmed || !newTrimmed || oldTrimmed === newTrimmed) return meta;

  const replaceInList = (list: string[]) =>
    dedupeList(list.map(t => (t === oldTrimmed ? newTrimmed : t)));

  const next: TagMeta = {
    ...meta,
    starredTags: replaceInList(meta.starredTags),
    recentTags: replaceInList(meta.recentTags),
    customTags: replaceInList(meta.customTags),
  };
  saveTagMeta(module, next);
  return next;
}

/**
 * 更新并持久化排序模式
 */
export function setTagSortMode(module: TagModule, sortMode: 'count' | 'alpha'): TagMeta {
  const meta = getTagMeta(module);
  const next: TagMeta = { ...meta, sortMode };
  saveTagMeta(module, next);
  return next;
}

/**
 * 统计指定条目集合的标签分布，并融合常用、最近及预设标签元数据
 */
export function computeTagStats(
  module: TagModule,
  items: Array<{ tags?: string | null }>,
  sortModeOverride?: 'count' | 'alpha'
): TagStatItem[] {
  const meta = getTagMeta(module);
  const sortMode = sortModeOverride || meta.sortMode;
  const countMap = new Map<string, number>();

  for (const item of items) {
    const itemTags = parseTags(item.tags);
    for (const t of itemTags) {
      countMap.set(t, (countMap.get(t) || 0) + 1);
    }
  }

  // 合并预设标签（保留 0 引用标签以供提前规划分类使用）
  for (const custom of meta.customTags) {
    if (!countMap.has(custom)) {
      countMap.set(custom, 0);
    }
  }

  const recentSet = new Set(meta.recentTags);
  const starredSet = new Set(meta.starredTags);

  const list: TagStatItem[] = Array.from(countMap.entries()).map(([name, count]) => ({
    name,
    count,
    isStarred: starredSet.has(name),
    isRecent: recentSet.has(name),
    isCustomOnly: count === 0,
  }));

  list.sort((a, b) => {
    if (sortMode === 'alpha') {
      return a.name.localeCompare(b.name, 'zh-CN');
    }
    return b.count - a.count || a.name.localeCompare(b.name, 'zh-CN');
  });

  return list;
}

// ===== 技能包（Collection）独立标签存储与双层汇总工具 =====

const REPO_TAGS_STORAGE_KEY = 'skillhub_repo_tags_map';

function getRepoTagsMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(REPO_TAGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, string>;
      }
    }
  } catch (err) {
    console.warn('读取技能包标签失败:', err);
  }
  return {};
}

function saveRepoTagsMap(map: Record<string, string>): void {
  try {
    localStorage.setItem(REPO_TAGS_STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('保存技能包标签失败:', err);
  }
  window.dispatchEvent(new CustomEvent('skillhub:tag-meta-changed', { detail: { module: 'skills' } }));
}

export function isCollectionRepo(repo: { repo_type?: string; skills: Array<unknown> }): boolean {
  return repo.repo_type === 'collection' || repo.skills.length > 1;
}

/**
 * 读取指定技能包自身的标签字符串
 */
export function getRepoTags(repoId: string): string {
  if (!repoId) return '';
  const map = getRepoTagsMap();
  return serializeTags(parseTags(map[repoId] || ''));
}

/**
 * 保存指定技能包自身的标签字符串
 */
export function setRepoTags(repoId: string, tags: string): void {
  if (!repoId) return;
  const map = getRepoTagsMap();
  const normalized = serializeTags(parseTags(tags));
  if (normalized) {
    map[repoId] = normalized;
  } else {
    delete map[repoId];
  }
  saveRepoTagsMap(map);
}

/**
 * 重命名或合并所有技能包上的指定标签
 */
export function renameRepoTagInStore(oldName: string, newName: string): void {
  const cleanOld = oldName.trim();
  const cleanNew = newName.trim().replace(/[,，]/g, '');
  if (!cleanOld || !cleanNew || cleanOld === cleanNew) return;

  const map = getRepoTagsMap();
  let changed = false;
  for (const repoId of Object.keys(map)) {
    const list = parseTags(map[repoId]);
    if (!list.includes(cleanOld)) continue;
    changed = true;
    const nextStr = serializeTags(list.map(t => (t === cleanOld ? cleanNew : t)));
    if (nextStr) map[repoId] = nextStr;
    else delete map[repoId];
  }
  if (changed) {
    saveRepoTagsMap(map);
  }
}

/**
 * 从所有技能包中删除指定标签
 */
export function deleteRepoTagsInStore(tagNames: string[]): void {
  if (tagNames.length === 0) return;
  const targetSet = new Set(tagNames);
  const map = getRepoTagsMap();
  let changed = false;

  for (const repoId of Object.keys(map)) {
    const list = parseTags(map[repoId]);
    const filtered = list.filter(t => !targetSet.has(t));
    if (filtered.length !== list.length) {
      changed = true;
      const nextStr = serializeTags(filtered);
      if (nextStr) map[repoId] = nextStr;
      else delete map[repoId];
    }
  }
  if (changed) {
    saveRepoTagsMap(map);
  }
}

/**
 * 获取仓库卡片的有效标签：技能包取包自身标签，独立单技能取其唯一技能标签
 */
export function getRepoEffectiveTags(repo: {
  id: string;
  repo_type?: string;
  skills: Array<{ tags?: string | null }>;
}): string {
  if (isCollectionRepo(repo)) {
    return getRepoTags(repo.id);
  }
  return serializeTags(parseTags(repo.skills[0]?.tags || ''));
}

/**
 * 双层汇总技能模块用于标签统计的条目集合：
 * - 技能包：包本身计 1 项，其下拥有独立标签的子技能各自计 1 项
 * - 独立单技能：计 1 项
 */
export function collectSkillModuleTagItems(
  repos: Array<{ id: string; repo_type?: string; skills: Array<{ tags?: string | null }> }>
): Array<{ tags?: string | null }> {
  const items: Array<{ tags?: string | null }> = [];
  const map = getRepoTagsMap();

  for (const repo of repos) {
    if (isCollectionRepo(repo)) {
      items.push({ tags: map[repo.id] || '' });
      for (const skill of repo.skills) {
        if (parseTags(skill.tags).length > 0) {
          items.push({ tags: skill.tags });
        }
      }
    } else {
      items.push({ tags: repo.skills[0]?.tags || '' });
    }
  }
  return items;
}

