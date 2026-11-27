import { useState, useEffect, useMemo, useRef } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  Search,
  RefreshCw,
  Loader2,
  AlertCircle,
  Check,
  Plus,
  X,
  ExternalLink,
} from 'lucide-react';
import type { PromptSourceId, RemotePromptItem } from '../../types/resourceHub';
import type { ResourceItem } from '../../types/resource';
import { FilterSelectPopover, type FilterSelectOption } from './FilterSelectPopover';
import type { PromptsChatQueryParams } from '../../hooks/usePromptHub';

type PromptChannelTab = 'aishort' | 'prompts-chat' | 'fabric' | 'langgpt';

interface PromptCatalogViewProps {
  /** 内置精选提示词（来自本地 registry，合并到结构化模板频道并兼做离线兜底） */
  curatedLegacyPrompts: ResourceItem[];
  /** 本地提示词库已存在的标题小写集合，用于实时展示已添加状态 */
  installedPromptTitles: Set<string>;
  /** 正在入库的提示词 ID 集合 */
  installingPromptIds: Set<string>;

  // === Hook 数据与方法 ===
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

  onPreviewPrompt: (item: RemotePromptItem, parentTitle: string) => void;
  onQuickInstallPrompt: (item: RemotePromptItem) => Promise<void>;
  onViewInstalledPrompt: (item: RemotePromptItem) => void;
}

const CHANNEL_TABS: Array<{
  id: PromptChannelTab;
  label: string;
  description: string;
  attributionName: string;
  attributionUrl: string;
  attributionLicense: string;
}> = [
  {
    id: 'aishort',
    label: '中文精选',
    description: '高口碑中文场景提示词，自带中英双语切换与使用解读',
    attributionName: 'AiShort (ChatGPT-Shortcut)',
    attributionUrl: 'https://github.com/rockbenben/ChatGPT-Shortcut',
    attributionLicense: 'MIT',
  },
  {
    id: 'prompts-chat',
    label: '全球社区',
    description: '全球最大开源提示词库，覆盖编程、写作、分析与角色设定',
    attributionName: 'prompts.chat',
    attributionUrl: 'https://prompts.chat',
    attributionLicense: 'CC0',
  },
  {
    id: 'fabric',
    label: '专业工作流',
    description: '工程化系统提示词集合，专注论文精读、代码审查与深度提炼',
    attributionName: 'danielmiessler/fabric',
    attributionUrl: 'https://github.com/danielmiessler/fabric',
    attributionLicense: 'MIT',
  },
  {
    id: 'langgpt',
    label: '结构化模板',
    description: '角色、能力与工作流分层的结构化提示词标杆与严选合集',
    attributionName: 'LangGPT',
    attributionUrl: 'https://github.com/langgptai/LangGPT',
    attributionLicense: 'Apache-2.0',
  },
];

const PROMPTS_CHAT_HOT_KEYWORDS = [
  { label: '代码审查', query: 'code' },
  { label: '架构设计', query: 'architecture' },
  { label: '英语润色', query: 'english' },
  { label: 'SQL / 数据', query: 'sql' },
  { label: '写作助手', query: 'writing' },
  { label: '面试官', query: 'interviewer' },
  { label: '产品规划', query: 'product' },
  { label: '安全审计', query: 'security' },
];

const PROMPTS_CHAT_SORT_OPTIONS: FilterSelectOption[] = [
  { value: 'upvotes', label: '按热度排序' },
  { value: 'newest', label: '按最新排序' },
];

const PROMPTS_CHAT_TYPE_OPTIONS: FilterSelectOption[] = [
  { value: 'all', label: '全部类型' },
  { value: 'TEXT', label: '通用文本' },
  { value: 'STRUCTURED', label: '结构化提示词' },
];

/**
 * 关键词柔和蓝高亮组件
 */
function HighlightText({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q || !text) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-blue-100/80 text-blue-700 rounded-[3px] px-0.5 font-semibold not-italic">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

/**
 * 将本地内置提示词资源转成统一 RemotePromptItem 模型
 */
function legacyPromptToRemoteItem(res: ResourceItem): RemotePromptItem {
  return {
    id: `curated:${res.id}`,
    source: 'curated',
    title: res.displayName,
    slug: res.name,
    description: res.description,
    content: res.promptContent || '',
    contentAlt: null,
    contentLabel: '中文精选',
    contentAltLabel: null,
    category: res.category || '精选',
    categoryLabel: res.tags?.[0] || '内置严选',
    tags: res.tags || [],
    author: res.author || 'SkillHub',
    votes: null,
    promptType: 'STRUCTURED',
    sourceUrl: res.repoUrl || null,
    needsContentFetch: false,
  };
}

/**
 * 提示词本地搜索相关度打分
 */
function scorePromptSearch(q: string, item: RemotePromptItem): number {
  const title = item.title.toLowerCase();
  if (title === q) return 50;
  if (title.startsWith(q)) return 40;
  if (title.includes(q)) return 30;
  if ((item.slug || '').toLowerCase().includes(q)) return 25;
  if (item.tags.some(t => t.toLowerCase().includes(q))) return 20;
  if (item.description.toLowerCase().includes(q)) return 15;
  if (item.content.toLowerCase().includes(q)) return 8;
  return 0;
}

/**
 * 资源中心「提示词精选」多源动态广场视图
 */
export function PromptCatalogView({
  curatedLegacyPrompts,
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
  onPreviewPrompt,
  onQuickInstallPrompt,
  onViewInstalledPrompt,
}: PromptCatalogViewProps) {
  const [activeChannel, setActiveChannel] = useState<PromptChannelTab>('aishort');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [onlyUninstalled, setOnlyUninstalled] = useState(false);
  const [visibleCount, setVisibleCount] = useState(36);

  // prompts.chat 专属筛选条件
  const [pchatSort, setPchatSort] = useState<'upvotes' | 'newest'>('upvotes');
  const [pchatType, setPchatType] = useState<'all' | 'TEXT' | 'STRUCTURED'>('all');
  const pchatDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeMeta = CHANNEL_TABS.find(t => t.id === activeChannel) || CHANNEL_TABS[0];

  // 切换频道时按需拉取数据并重置筛选
  useEffect(() => {
    setCategoryFilter('all');
    setVisibleCount(36);
    setSearchQuery('');

    if (activeChannel === 'aishort') {
      onFetchAishort(false);
    } else if (activeChannel === 'fabric') {
      onFetchFabric(false);
    } else if (activeChannel === 'langgpt') {
      onFetchLanggpt(false);
    }
  }, [activeChannel, onFetchAishort, onFetchFabric, onFetchLanggpt]);

  // prompts.chat 搜索、排序或类型变更时防抖请求后端
  useEffect(() => {
    if (activeChannel !== 'prompts-chat') return;
    if (pchatDebounceRef.current) clearTimeout(pchatDebounceRef.current);
    const delay = searchQuery.trim() ? 350 : 0;
    pchatDebounceRef.current = setTimeout(() => {
      onSearchPromptsChat({
        query: searchQuery.trim(),
        sort: pchatSort,
        promptType: pchatType,
        page: 1,
        perPage: 24,
        append: false,
      });
    }, delay);
    return () => {
      if (pchatDebounceRef.current) clearTimeout(pchatDebounceRef.current);
    };
  }, [activeChannel, searchQuery, pchatSort, pchatType, onSearchPromptsChat]);

  // 内置精选（离线兜底 + 融入「结构化模板」）
  const curatedItems = useMemo(
    () => curatedLegacyPrompts.map(legacyPromptToRemoteItem),
    [curatedLegacyPrompts]
  );

  // 当前本地过滤型频道（aishort / fabric / langgpt）的数据源集合
  const currentLocalItems = useMemo<RemotePromptItem[]>(() => {
    if (activeChannel === 'aishort') {
      return aishortItems;
    }
    if (activeChannel === 'fabric') {
      return fabricItems;
    }
    if (activeChannel === 'langgpt') {
      // 合并 LangGPT 远程模板 + 本地严选中文提示词（按标题去重）
      const seen = new Set<string>();
      const merged: RemotePromptItem[] = [];
      for (const item of [...langgptItems, ...curatedItems]) {
        const key = item.title.trim().toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(item);
        }
      }
      return merged;
    }
    return [];
  }, [activeChannel, aishortItems, fabricItems, langgptItems, curatedItems]);

  // 构造当前频道的分类下拉选项（aishort / fabric / langgpt）
  const categoryOptions = useMemo<FilterSelectOption[]>(() => {
    if (activeChannel === 'prompts-chat') return [];
    const counts = new Map<string, number>();
    for (const item of currentLocalItems) {
      const cat = item.categoryLabel?.trim();
      if (cat) {
        counts.set(cat, (counts.get(cat) || 0) + 1);
      }
    }
    if (counts.size <= 1) return [];
    const sorted = Array.from(counts.entries())
      .map(([label, count]) => ({ value: label, label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN'));
    return [{ value: 'all', label: '全部分类', count: currentLocalItems.length }, ...sorted];
  }, [activeChannel, currentLocalItems]);

  // 当前展示的过滤列表
  const displayedItems = useMemo<RemotePromptItem[]>(() => {
    if (activeChannel === 'prompts-chat') {
      if (!onlyUninstalled) return promptsChatItems;
      return promptsChatItems.filter(
        item => !installedPromptTitles.has(item.title.trim().toLowerCase())
      );
    }

    const q = searchQuery.trim().toLowerCase();
    const matched: Array<{ item: RemotePromptItem; score: number }> = [];

    for (const item of currentLocalItems) {
      if (categoryFilter !== 'all' && item.categoryLabel !== categoryFilter) continue;
      if (onlyUninstalled && installedPromptTitles.has(item.title.trim().toLowerCase())) continue;

      if (!q) {
        matched.push({ item, score: 0 });
        continue;
      }
      const score = scorePromptSearch(q, item);
      if (score > 0) {
        matched.push({ item, score });
      }
    }

    if (q) {
      matched.sort((a, b) => b.score - a.score);
    }
    return matched.map(m => m.item);
  }, [
    activeChannel,
    promptsChatItems,
    currentLocalItems,
    categoryFilter,
    onlyUninstalled,
    installedPromptTitles,
    searchQuery,
  ]);

  const isLoading =
    activeChannel === 'aishort'
      ? aishortLoading
      : activeChannel === 'prompts-chat'
      ? promptsChatLoading
      : activeChannel === 'fabric'
      ? fabricLoading
      : langgptLoading;

  const currentError =
    activeChannel === 'aishort'
      ? aishortError
      : activeChannel === 'prompts-chat'
      ? promptsChatError
      : activeChannel === 'fabric'
      ? fabricError
      : langgptError;

  const handleForceRefresh = () => {
    if (activeChannel === 'aishort') {
      onFetchAishort(true);
    } else if (activeChannel === 'fabric') {
      onFetchFabric(true);
    } else if (activeChannel === 'langgpt') {
      onFetchLanggpt(true);
    } else {
      onSearchPromptsChat({
        query: searchQuery.trim(),
        sort: pchatSort,
        promptType: pchatType,
        page: 1,
        perPage: 24,
        forceRefresh: true,
        append: false,
      });
    }
  };

  const renderSourceBadge = (source: PromptSourceId, item: RemotePromptItem) => {
    if (item.categoryLabel) {
      return (
        <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-black/[0.04] text-[var(--color-muted)] shrink-0">
          {item.categoryLabel}
        </span>
      );
    }
    if (source === 'curated') {
      return (
        <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-black/[0.04] text-[var(--color-muted)] shrink-0">
          内置严选
        </span>
      );
    }
    return null;
  };

  const slicedItems =
    activeChannel === 'prompts-chat' ? displayedItems : displayedItems.slice(0, visibleCount);

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
      {/* 顶部标题 + 4 频道分段切换控件 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold text-[var(--foreground)] tracking-tight">
            提示词精选
          </h1>
          <p className="text-[12.5px] text-[var(--color-muted)] mt-0.5">
            聚合全球开源提示词社区与工程工作流，支持预览、中文翻译与一键存入本地提示词库
          </p>
        </div>

        <div className="inline-flex p-1 rounded-xl bg-black/[0.05] self-start md:self-auto flex-wrap">
          {CHANNEL_TABS.map(tab => {
            const active = tab.id === activeChannel;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveChannel(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-[12.5px] font-semibold transition-all cursor-pointer ${
                  active
                    ? 'bg-white text-[var(--foreground)] shadow-xs'
                    : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 筛选与搜索工具栏 */}
      <div className="bg-[#F7F7F9] rounded-xl border border-black/[0.07] px-3.5 py-2.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center flex-wrap gap-2.5 flex-1 min-w-[220px]">
            <div className="relative flex-1 min-w-[190px] max-w-sm">
              <Search className="w-3.5 h-3.5 text-[var(--color-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setVisibleCount(36);
                }}
                placeholder={
                  activeChannel === 'prompts-chat'
                    ? '搜索全球 3,000+ 开源提示词（如 code、sql、writing）...'
                    : `筛选「${activeMeta.label}」中的提示词...`
                }
                className="w-full pl-8 pr-7 py-1.5 rounded-lg text-[12px] bg-white border border-black/[0.08] focus:border-[var(--color-primary)] outline-none transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-[var(--foreground)] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {categoryOptions.length > 0 && (
              <FilterSelectPopover
                prefix="分类"
                value={categoryFilter}
                options={categoryOptions}
                onChange={val => {
                  setCategoryFilter(val);
                  setVisibleCount(36);
                }}
                ariaLabel="按分类筛选提示词"
              />
            )}

            {activeChannel === 'prompts-chat' && (
              <>
                <FilterSelectPopover
                  value={pchatSort}
                  defaultValue="upvotes"
                  options={PROMPTS_CHAT_SORT_OPTIONS}
                  highlightActive={false}
                  showFirstDivider={false}
                  minMenuWidth={136}
                  onChange={val => setPchatSort(val as 'upvotes' | 'newest')}
                  ariaLabel="切换排序方式"
                />
                <FilterSelectPopover
                  prefix="类型"
                  value={pchatType}
                  defaultValue="all"
                  options={PROMPTS_CHAT_TYPE_OPTIONS}
                  minMenuWidth={148}
                  onChange={val => setPchatType(val as 'all' | 'TEXT' | 'STRUCTURED')}
                  ariaLabel="按提示词类型筛选"
                />
              </>
            )}

            <label className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-muted)] cursor-pointer select-none px-1">
              <input
                type="checkbox"
                checked={onlyUninstalled}
                onChange={e => setOnlyUninstalled(e.target.checked)}
                className="rounded border-gray-300 text-[var(--color-primary)]"
              />
              <span>只看未添加</span>
            </label>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {activeChannel === 'prompts-chat' && promptsChatMeta.total > 0 && (
              <span className="text-[11px] text-[var(--color-muted)] tabular-nums">
                共 {promptsChatMeta.total} 条
              </span>
            )}
            <button
              type="button"
              disabled={isLoading}
              onClick={handleForceRefresh}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium bg-white border border-black/[0.08] hover:border-black/15 text-[var(--foreground)] transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>刷新</span>
            </button>
          </div>
        </div>

        {/* prompts.chat 快捷检索热词 */}
        {activeChannel === 'prompts-chat' && (
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            <span className="text-[11px] text-[var(--color-muted)] mr-0.5">常用方向：</span>
            {PROMPTS_CHAT_HOT_KEYWORDS.map(kw => (
              <button
                key={kw.query}
                type="button"
                onClick={() => setSearchQuery(kw.query)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                  searchQuery.trim().toLowerCase() === kw.query
                    ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                    : 'bg-white/80 border border-black/[0.06] text-[var(--color-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                {kw.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 频道简介行 */}
      <div className="flex items-center justify-between gap-2 px-1 text-[12px] text-[var(--color-muted)]">
        <span>{activeMeta.description}</span>
        {activeChannel === 'prompts-chat' && promptsChatMeta.usedFallback && (
          <span className="text-[11px] text-[var(--color-muted)] shrink-0">
            已自动切换至开源镜像索引
          </span>
        )}
      </div>

      {/* 内容主区 */}
      {isLoading && slicedItems.length === 0 ? (
        <div className="bg-white rounded-2xl border border-black/[0.09] py-16 flex flex-col items-center justify-center gap-2.5 text-[var(--color-muted)]">
          <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
          <span className="text-[13px]">正在同步「{activeMeta.label}」提示词...</span>
        </div>
      ) : currentError && slicedItems.length === 0 ? (
        <div className="bg-white rounded-2xl border border-red-200/70 py-12 px-6 flex flex-col items-center justify-center gap-2 text-center">
          <AlertCircle className="w-6 h-6 text-red-500" />
          <p className="text-[13px] font-semibold text-[var(--foreground)]">加载失败</p>
          <p className="text-[12px] text-[var(--color-muted)] max-w-md">{currentError}</p>
          <button
            type="button"
            onClick={handleForceRefresh}
            className="mt-2 px-3.5 py-1.5 rounded-lg text-[12px] font-medium bg-[var(--color-primary)] text-white cursor-pointer"
          >
            重试拉取
          </button>
        </div>
      ) : slicedItems.length === 0 ? (
        <div className="bg-white rounded-2xl border border-black/[0.09] py-14 text-center text-[13px] text-[var(--color-muted)]">
          当前筛选条件下暂无匹配提示词
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {slicedItems.map(item => {
              const isInstalled = installedPromptTitles.has(item.title.trim().toLowerCase());
              const isInstalling = installingPromptIds.has(item.id);

              return (
                <div
                  key={item.id}
                  onClick={() => onPreviewPrompt(item, activeMeta.label)}
                  className="group bg-white rounded-2xl border border-black/[0.08] hover:border-[var(--color-primary)]/35 hover:shadow-[0_6px_18px_rgba(0,85,255,0.06)] p-4 flex flex-col justify-between gap-3 transition-all cursor-pointer"
                >
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-[13.5px] font-semibold text-[var(--foreground)] group-hover:text-[var(--color-primary)] transition-colors leading-snug line-clamp-1">
                        <HighlightText text={item.title} query={searchQuery} />
                      </h3>
                      {renderSourceBadge(item.source, item)}
                    </div>

                    <p className="text-[12px] text-[var(--color-muted)] leading-relaxed line-clamp-2 min-h-[36px]">
                      <HighlightText
                        text={item.description || '点击查看完整提示词正文并一键导入本地库'}
                        query={searchQuery}
                      />
                    </p>
                  </div>

                  <div className="pt-2.5 border-t border-black/[0.05] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                      {item.contentAlt && (
                        <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-black/[0.035] text-[var(--color-muted)] shrink-0">
                          双语
                        </span>
                      )}
                      {item.source === 'fabric' && item.slug && (
                        <span className="text-[10.5px] font-mono text-[var(--color-muted)] truncate">
                          {item.slug}
                        </span>
                      )}
                      {item.source === 'prompts-chat' && item.votes != null && item.votes > 0 && (
                        <span className="text-[11px] text-[var(--color-muted)] tabular-nums shrink-0">
                          {item.votes} 赞
                        </span>
                      )}
                      {item.source !== 'fabric' &&
                        item.tags
                          .filter(t => t !== item.categoryLabel)
                          .slice(0, 1)
                          .map(tag => (
                            <span
                              key={tag}
                              className="text-[10.5px] px-1.5 py-0.5 rounded bg-black/[0.035] text-[var(--color-muted)] truncate"
                            >
                              {tag}
                            </span>
                          ))}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isInstalled && !isInstalling ? (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            onViewInstalledPrompt(item);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11.5px] font-medium bg-black/[0.04] hover:bg-black/[0.08] text-[var(--foreground)] transition-colors cursor-pointer"
                        >
                          <Check className="w-3 h-3 text-[var(--color-primary)]" />
                          <span>已添加</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isInstalling}
                          onClick={e => {
                            e.stopPropagation();
                            onQuickInstallPrompt(item);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11.5px] font-medium bg-[var(--color-primary)]/[0.07] hover:bg-[var(--color-primary)] text-[var(--color-primary)] hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {isInstalling ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>添加中</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3" />
                              <span>添加</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 分页 / 加载更多 */}
          {activeChannel === 'prompts-chat' && promptsChatMeta.hasMore && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                disabled={promptsChatLoading}
                onClick={() =>
                  onSearchPromptsChat({
                    query: searchQuery.trim(),
                    sort: pchatSort,
                    promptType: pchatType,
                    page: promptsChatMeta.page + 1,
                    perPage: 24,
                    append: true,
                  })
                }
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-medium bg-white border border-black/10 text-[var(--foreground)] hover:border-black/20 cursor-pointer shadow-2xs disabled:opacity-50"
              >
                {promptsChatLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>加载更多</span>
              </button>
            </div>
          )}

          {activeChannel !== 'prompts-chat' && displayedItems.length > visibleCount && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => setVisibleCount(c => c + 36)}
                className="px-4 py-1.5 rounded-lg text-[12px] font-medium bg-white border border-black/10 text-[var(--foreground)] hover:border-black/20 cursor-pointer shadow-2xs"
              >
                加载更多（剩余 {displayedItems.length - visibleCount} 条）
              </button>
            </div>
          )}

          {/* 开源数据合规署名 */}
          <div className="flex items-center justify-center gap-1.5 pt-2 text-[11.5px] text-[var(--color-muted)]">
            <span>数据源自</span>
            <button
              type="button"
              onClick={() => openUrl(activeMeta.attributionUrl).catch(console.error)}
              className="inline-flex items-center gap-0.5 font-medium text-[var(--foreground)]/80 hover:text-[var(--color-primary)] hover:underline cursor-pointer"
            >
              <span>{activeMeta.attributionName}</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
            </button>
            <span>({activeMeta.attributionLicense})</span>
          </div>
        </>
      )}
    </div>
  );
}
