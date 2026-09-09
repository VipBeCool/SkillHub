import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Search, Loader2, RefreshCw, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { useResourceRegistry } from '../../hooks/useResourceRegistry';
import { ResourceCard } from './ResourceCard';
import { CollectionCard } from './CollectionCard';
import { ResourceIcon } from './ResourceIcon';
import type { ResourceItem, FeaturedItem, InstallStatus, Collection } from '../../types/resource';

interface ResourceHomeProps {
  onInstallSkill?: (resource: ResourceItem, targetDirId: string) => Promise<void>;
  onInstallPrompt?: (resource: ResourceItem) => Promise<void>;
  onUninstallSkill?: (resource: ResourceItem) => Promise<void>;
  onUninstallPrompt?: (resource: ResourceItem) => Promise<void>;
  onNavigateToDetail?: (resourceId: string, resourceCategory?: string, categoryName?: string) => void;
  onNavigateToCollection?: (collectionId: string) => void;
  /** 侧边栏传入的分类筛选 */
  sidebarCategory?: string;
  /** 本地已安装的技能或提示词集合（支持 ID 或 name） */
  installedResourceIds?: Set<string>;
  /** 返回发现首页 */
  onBackToHome?: () => void;
}

/** 合辑视图顶部面包屑导航（纯净无返回箭头，支持 Notion 风格同级合辑切换） */
function CollectionTopBar({
  currentCollection,
  collections,
  onBackToHome,
  onNavigateToCollection,
}: {
  currentCollection: { id: string; name: string; resources: ResourceItem[] };
  collections: Collection[];
  onBackToHome?: () => void;
  onNavigateToCollection?: (collectionId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    leaveTimerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 200);
  };

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    };
  }, []);

  return (
    <div className="h-12 border-b border-[var(--color-border)] bg-white/70 backdrop-blur-xl flex items-center px-4 shrink-0 gap-1.5 select-none relative z-30">
      {/* 父级「发现」面包屑节点（纯文本按钮，无返回箭头） */}
      <button
        onClick={() => onBackToHome?.()}
        className="px-2 py-1 -ml-1 rounded-md text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors text-[13px] font-medium cursor-pointer"
        title="发现"
      >
        <span>发现</span>
      </button>

      <span className="text-[var(--color-muted)]/40 text-[13px]">/</span>

      {/* 当前合辑节点（支持鼠标移入/点击展开同级合辑切换菜单） */}
      <div
        ref={containerRef}
        className="relative inline-flex items-center"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <button
          onClick={() => setIsOpen(prev => !prev)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[13px] font-semibold transition-all cursor-pointer ${
            isOpen 
              ? 'bg-black/5 text-[var(--foreground)]' 
              : 'text-[var(--foreground)] hover:bg-black/5'
          }`}
        >
          <span className="truncate max-w-[280px]">{currentCollection.name}</span>
          {collections.length > 1 && (
            <ChevronDown
              className={`w-3 h-3 text-[var(--color-muted)] transition-transform duration-200 ${
                isOpen ? 'rotate-180 text-[var(--foreground)]' : ''
              }`}
            />
          )}
        </button>

        {/* Notion 风格同级合辑切换浮层 */}
        {isOpen && collections.length > 0 && (
          <div
            className="absolute left-0 top-full mt-1 min-w-[240px] max-w-[320px] bg-white rounded-xl shadow-xl shadow-black/10 border border-black/[0.08] p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="max-h-[300px] overflow-y-auto hover-scroll flex flex-col gap-0.5">
              {collections.map(col => {
                const isCurrent = col.id === currentCollection.id;
                return (
                  <button
                    key={col.id}
                    onClick={() => {
                      if (!isCurrent) {
                        onNavigateToCollection?.(col.id);
                      }
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[13px] transition-colors group cursor-pointer ${
                      isCurrent
                        ? 'bg-black/[0.05] text-[var(--color-primary)] font-medium'
                        : 'text-[var(--foreground)] hover:bg-black/[0.04]'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                      isCurrent 
                        ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]' 
                        : 'bg-black/[0.03] text-[var(--color-muted)] group-hover:text-[var(--foreground)]'
                    }`}>
                      <ResourceIcon name={col.icon} className="w-3.5 h-3.5" />
                    </div>

                    <span className="truncate flex-1 leading-snug">
                      {col.name}
                    </span>

                    {isCurrent && (
                      <ChevronRight className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0 opacity-70" />
                    )}
                  </button>
                );
              })}
            </div>

            {collections.length > 1 && (
              <div className="mt-1 pt-1.5 border-t border-black/[0.05] px-2.5 py-1 text-[11px] text-[var(--color-muted)] flex items-center justify-between">
                <span>精选合辑</span>
                <span>共 {collections.length} 个</span>
              </div>
            )}
          </div>
        )}
      </div>

      <span className="text-[12px] text-[var(--color-muted)] ml-0.5">{currentCollection.resources.length} 项</span>
    </div>
  );
}

export function ResourceHome({
  onInstallSkill,
  onInstallPrompt,
  onUninstallSkill,
  onUninstallPrompt,
  onNavigateToDetail,
  onNavigateToCollection,
  sidebarCategory = 'all',
  installedResourceIds,
  onBackToHome,
}: ResourceHomeProps) {
  const { loading, categories, allResources, collections, featured, popularResources, searchResources, getCollectionWithResources, getResourcesByType } = useResourceRegistry();
  const [searchQuery, setSearchQuery] = useState('');
  const [bannerIndex, setBannerIndex] = useState(0);
  const [installStatuses, setInstallStatuses] = useState<Record<string, InstallStatus>>({});
  const [popularOffset, setPopularOffset] = useState(0);

  // 热门推荐：严格按红框单行4列展示，左右与Banner及合辑严格对齐，支持换一批
  const displayedPopular = useMemo(() => {
    if (popularResources.length <= 4) return popularResources;
    const count = 4;
    const start = popularOffset % popularResources.length;
    const result: ResourceItem[] = [];
    for (let i = 0; i < count; i++) {
      result.push(popularResources[(start + i) % popularResources.length]);
    }
    return result;
  }, [popularResources, popularOffset]);

  // Banner 自动轮播
  useEffect(() => {
    if (featured.length <= 1) return;
    const timer = setInterval(() => setBannerIndex(i => (i + 1) % featured.length), 5000);
    return () => clearInterval(timer);
  }, [featured.length]);

  // 监听重置筛选事件，清空本地搜索词，还原纯净发现首页
  useEffect(() => {
    const handleReset = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.module === 'resources') {
        setSearchQuery('');
      }
    };
    window.addEventListener('skillhub:reset-filters', handleReset);
    return () => window.removeEventListener('skillhub:reset-filters', handleReset);
  }, []);

  // 根据侧边栏分类和搜索过滤资源
  const displayResources = (() => {
    if (searchQuery.trim()) return searchResources(searchQuery);
    if (sidebarCategory === 'all' || !sidebarCategory) return allResources;
    if (sidebarCategory === 'all-skills') return getResourcesByType('skill');
    if (sidebarCategory === 'all-prompts') return getResourcesByType('prompt');
    if (sidebarCategory.startsWith('collection:')) return []; // 合辑走单独展示
    return allResources.filter(r => r.category === sidebarCategory);
  })();

  // 是否显示发现首页（非筛选模式）
  const isDiscoverMode = (sidebarCategory === 'all' || !sidebarCategory) && !searchQuery.trim();
  // 是否是合辑模式
  const collectionMode = sidebarCategory?.startsWith('collection:') ? sidebarCategory.replace('collection:', '') : null;

  // 获取资源的安装状态（优先取当前会话变更，其次匹配本地已安装集合）
  const getResourceInstallStatus = useCallback((r: ResourceItem): InstallStatus => {
    if (installStatuses[r.id]) return installStatuses[r.id];
    if (installedResourceIds) {
      if (installedResourceIds.has(r.id) || installedResourceIds.has(r.name) || installedResourceIds.has(r.displayName)) {
        return 'installed';
      }
      const idLower = r.id.toLowerCase();
      const nameLower = r.name.toLowerCase();
      const titleLower = r.displayName.toLowerCase();
      const urlNorm = r.repoUrl ? r.repoUrl.trim().toLowerCase().replace(/\/$/, '').replace(/\.git$/, '') : '';
      if (installedResourceIds.has(idLower) || installedResourceIds.has(nameLower) || installedResourceIds.has(titleLower) || (urlNorm !== '' && installedResourceIds.has(urlNorm))) {
        return 'installed';
      }
    }
    return 'not_installed';
  }, [installStatuses, installedResourceIds]);

  const handleInstall = async (resource: ResourceItem) => {
    setInstallStatuses(prev => ({ ...prev, [resource.id]: 'installing' }));
    try {
      if (resource.type === 'skill' && onInstallSkill) {
        await onInstallSkill(resource, '');
      } else if (resource.type === 'prompt' && onInstallPrompt) {
        await onInstallPrompt(resource);
      }
      setInstallStatuses(prev => ({ ...prev, [resource.id]: 'installed' }));
    } catch {
      setInstallStatuses(prev => ({ ...prev, [resource.id]: 'error' }));
    }
  };

  const handleUninstall = async (resource: ResourceItem) => {
    try {
      if (resource.type === 'skill' && onUninstallSkill) {
        await onUninstallSkill(resource);
      } else if (resource.type === 'prompt' && onUninstallPrompt) {
        await onUninstallPrompt(resource);
      }
      setInstallStatuses(prev => ({ ...prev, [resource.id]: 'not_installed' }));
    } catch (err) {
      console.error('Uninstall failed:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  // 合辑详情视图
  if (collectionMode) {
    const colData = getCollectionWithResources(collectionMode);
    if (!colData) return <div className="flex-1 flex items-center justify-center text-[var(--color-muted)]">未找到合辑</div>;
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--color-background)]">
        <CollectionTopBar
          currentCollection={colData}
          collections={collections}
          onBackToHome={onBackToHome}
          onNavigateToCollection={onNavigateToCollection}
        />
        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-[13px] text-[var(--color-muted)] mb-4 leading-relaxed">{colData.description}</p>
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
          >
            {colData.resources.map(r => (
              <ResourceCard
                key={r.id}
                resource={r}
                installStatus={getResourceInstallStatus(r)}
                onInstall={handleInstall}
                onUninstall={handleUninstall}
                onClick={() => onNavigateToDetail?.(r.id, `collection:${colData.id}`, colData.name)}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 获取当前分类名称
  const getCategoryTitle = () => {
    if (sidebarCategory === 'all-skills') return '技能';
    if (sidebarCategory === 'all-prompts') return '提示词';
    const cat = categories.find(c => c.id === sidebarCategory);
    return cat?.name || '发现';
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--color-background)]">
      {/* 顶部栏 */}
      <div className="h-12 border-b border-[var(--color-border)] bg-white/70 backdrop-blur-xl flex items-center px-5 shrink-0 gap-3">
        <h1 className="text-[14px] font-semibold text-[var(--foreground)] tracking-tight">{getCategoryTitle()}</h1>
        {!isDiscoverMode && <span className="text-[12px] text-[var(--color-muted)]">{displayResources.length} 项</span>}
        <div className="flex-1" />
        <div className="relative w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-muted)]" />
          <input
            type="text"
            placeholder="搜索社区资源..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-7 pr-3 py-1 text-[13px] bg-black/[0.04] rounded-lg border-none outline-none focus:ring-1 focus:ring-[var(--color-primary)]/30 focus:bg-white transition-all placeholder:text-[var(--color-muted)]"
          />
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto">
        {searchQuery.trim() ? (
          /* 搜索结果 */
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] text-[var(--color-muted)]">找到 {displayResources.length} 个结果</p>
              <button
                onClick={() => setSearchQuery('')}
                className="text-[12px] text-[var(--color-muted)] hover:text-[var(--foreground)] flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> 清除
              </button>
            </div>
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
            >
              {displayResources.map(r => (
                <ResourceCard
                  key={r.id}
                  resource={r}
                  installStatus={getResourceInstallStatus(r)}
                  onInstall={handleInstall}
                  onUninstall={handleUninstall}
                  onClick={() => onNavigateToDetail?.(r.id, sidebarCategory, getCategoryTitle())}
                />
              ))}
            </div>
            {displayResources.length === 0 && (
              <div className="py-16 text-center text-[var(--color-muted)] text-[14px]">
                没有找到相关资源
              </div>
            )}
          </div>
        ) : isDiscoverMode ? (
          /* 发现首页 */
          <div>
            {/* Banner */}
            {featured.length > 0 && (
              <div className="p-5 pb-0">
                <BannerCarousel
                  items={featured}
                  currentIndex={bannerIndex}
                  onIndexChange={setBannerIndex}
                  onNavigateToCollection={onNavigateToCollection}
                />
              </div>
            )}

            {/* 热门推荐 */}
            {popularResources.length > 0 && (
              <Section 
                title="热门推荐"
                action={
                  popularResources.length > 4 ? (
                    <button
                      onClick={() => setPopularOffset(prev => prev + 4)}
                      className="text-[12px] text-[var(--color-muted)] hover:text-[var(--foreground)] flex items-center gap-1 transition-colors px-2 py-0.5 rounded-md hover:bg-black/5 cursor-pointer select-none"
                      title="换一批热门推荐"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>换一批</span>
                    </button>
                  ) : undefined
                }
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 px-5">
                  {displayedPopular.map(r => (
                    <ResourceCard
                      key={r.id}
                      resource={r}
                      installStatus={getResourceInstallStatus(r)}
                      onInstall={handleInstall}
                      onUninstall={handleUninstall}
                      onClick={() => onNavigateToDetail?.(r.id, 'all', '发现')}
                    />
                  ))}
                </div>
              </Section>
            )}

            {/* 合辑精选 */}
            {collections.filter(c => c.featured).length > 0 && (
              <Section title="精选合辑">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 px-5">
                  {collections.filter(c => c.featured).map(c => {
                    const data = getCollectionWithResources(c.id);
                    return (
                      <CollectionCard
                        key={c.id}
                        collection={c}
                        resources={data?.resources || []}
                        onClick={() => onNavigateToCollection?.(c.id)}
                      />
                    );
                  })}
                </div>
              </Section>
            )}

            {/* 全部资源 */}
            <Section title="全部资源">
              <div
                className="grid gap-3 px-5 pb-6"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
              >
                {allResources.map(r => (
                  <ResourceCard
                    key={r.id}
                    resource={r}
                    installStatus={getResourceInstallStatus(r)}
                    onInstall={handleInstall}
                    onUninstall={handleUninstall}
                    onClick={() => onNavigateToDetail?.(r.id, 'all', '发现')}
                  />
                ))}
              </div>
            </Section>
          </div>
        ) : (
          /* 分类/筛选结果 */
          <div className="p-5">
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
            >
              {displayResources.map(r => (
                <ResourceCard
                  key={r.id}
                  resource={r}
                  installStatus={getResourceInstallStatus(r)}
                  onInstall={handleInstall}
                  onUninstall={handleUninstall}
                  onClick={() => onNavigateToDetail?.(r.id, sidebarCategory, getCategoryTitle())}
                />
              ))}
            </div>
            {displayResources.length === 0 && (
              <div className="py-16 text-center text-[var(--color-muted)] text-[14px]">
                该分类暂无资源
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- 子组件 ---- */

function Section({ 
  title, 
  action, 
  children 
}: { 
  title: string; 
  action?: React.ReactNode; 
  children: React.ReactNode; 
}) {
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between px-5 mb-3">
        <h2 className="text-[14px] font-semibold text-[var(--foreground)]">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function BannerCarousel({
  items,
  currentIndex,
  onIndexChange,
  onNavigateToCollection,
}: {
  items: FeaturedItem[];
  currentIndex: number;
  onIndexChange: (i: number) => void;
  onNavigateToCollection?: (id: string) => void;
}) {
  const item = items[currentIndex];

  return (
    <div className="relative">
      <div
        className="relative rounded-xl overflow-hidden cursor-pointer h-32 flex flex-col justify-end p-5 transition-transform duration-200 active:scale-[0.99]"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(245,245,247,0.95) 100%)',
          border: '1px solid rgba(0, 0, 0, 0.08)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
        }}
        onClick={() => {
          if (item.targetType === 'collection') {
            onNavigateToCollection?.(item.targetId);
          }
        }}
      >
        {/* 背景矢量轮廓图标（完全摒弃 emoji） */}
        <div className="absolute -top-3 -right-3 w-32 h-32 opacity-[0.06] text-[var(--foreground)] flex items-center justify-center pointer-events-none select-none">
          <ResourceIcon name={item.icon || 'Sparkles'} className="w-24 h-24 stroke-[1.5]" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/[0.04] text-[var(--color-primary)] flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              精选合辑
            </span>
          </div>
          <h3 className="text-[16px] font-bold text-[var(--foreground)] leading-tight mb-0.5">{item.title}</h3>
          {item.subtitle && <p className="text-[12px] text-[var(--color-muted)]">{item.subtitle}</p>}
        </div>
      </div>

      {/* 分页指示器 */}
      {items.length > 1 && (
        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1 z-10">
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => onIndexChange(i)}
              className={`rounded-full transition-all ${i === currentIndex ? 'w-3.5 h-1.5 bg-[var(--foreground)]' : 'w-1.5 h-1.5 bg-[var(--color-muted)]/30'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
