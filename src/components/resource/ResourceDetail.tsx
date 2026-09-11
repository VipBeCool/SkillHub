import { useState, useEffect, useMemo, useRef } from 'react';
import { Download, ExternalLink, Check, Loader2, FileText, Code, Star, Copy, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useResourceRegistry, refreshSingleRepoStar } from '../../hooks/useResourceRegistry';
import { ResourceIcon } from './ResourceIcon';
import type { ResourceItem, InstallStatus } from '../../types/resource';

interface ResourceDetailProps {
  resourceId: string;
  onBack: () => void;
  onInstallSkill?: (resource: ResourceItem, targetDirId: string) => Promise<void>;
  onInstallPrompt?: (resource: ResourceItem) => Promise<void>;
  onUninstallSkill?: (resource: ResourceItem) => Promise<void>;
  onUninstallPrompt?: (resource: ResourceItem) => Promise<void>;
  isInstalled?: boolean;
  installedResourceIds?: Set<string>;
  parentCategoryName?: string;
  parentCategory?: string;
  onSelectSibling?: (sibling: ResourceItem) => void;
}

export function ResourceDetail({
  resourceId,
  onBack,
  onInstallSkill,
  onInstallPrompt,
  onUninstallSkill,
  onUninstallPrompt,
  isInstalled = false,
  installedResourceIds,
  parentCategoryName,
  parentCategory,
  onSelectSibling,
}: ResourceDetailProps) {
  const { getResourceById, categories, collections, allResources } = useResourceRegistry();
  const resource = getResourceById(resourceId);

  // 计算面包屑上一级的展示名称（如「内容创作」、「发现」等）
  const parentName = useMemo(() => {
    if (parentCategoryName && parentCategoryName !== '资源详情') {
      return parentCategoryName;
    }
    if (parentCategory) {
      if (parentCategory === 'all') return '发现';
      if (parentCategory === 'all-skills') return '技能';
      if (parentCategory === 'all-prompts') return '提示词';
      if (parentCategory.startsWith('collection:')) {
        const colId = parentCategory.replace('collection:', '');
        const col = collections.find(c => c.id === colId);
        if (col) return col.name;
      }
      const cat = categories.find(c => c.id === parentCategory);
      if (cat) return cat.name;
    }
    if (resource?.category) {
      const cat = categories.find(c => c.id === resource.category);
      if (cat) return cat.name;
    }
    return '发现';
  }, [parentCategoryName, parentCategory, resource?.category, categories, collections]);

  // 计算当前分类/合辑下的同级资源列表（用于 Notion 风格的同级下拉快速切换）
  const siblingResources = useMemo((): ResourceItem[] => {
    if (!resource) return [];

    // 1. 如果来自特定合辑 (collection:xxx)
    if (parentCategory && parentCategory.startsWith('collection:')) {
      const colId = parentCategory.replace('collection:', '');
      const col = collections.find(c => c.id === colId);
      if (col && col.resourceIds.length > 0) {
        return col.resourceIds
          .map(id => allResources.find(r => r.id === id))
          .filter(Boolean) as ResourceItem[];
      }
    }

    // 2. 如果来自全部技能 (all-skills)
    if (parentCategory === 'all-skills') {
      return allResources.filter(r => r.type === 'skill');
    }

    // 3. 如果来自全部提示词 (all-prompts)
    if (parentCategory === 'all-prompts') {
      return allResources.filter(r => r.type === 'prompt');
    }

    // 4. 指定分类或当前资源所属分类
    const targetCategory = (parentCategory && parentCategory !== 'all') ? parentCategory : resource.category;
    if (targetCategory) {
      const inCat = allResources.filter(r => r.category === targetCategory);
      if (inCat.length > 0) return inCat;
    }

    // 5. 兜底同类型资源
    return allResources.filter(r => r.type === resource.type);
  }, [resource, parentCategory, allResources, collections]);

  // 计算多维精准已安装状态（兼顾 ID、名称、标题及规范化 GitHub 地址）
  const isActuallyInstalled = useMemo(() => {
    if (isInstalled) return true;
    if (!resource || !installedResourceIds) return false;
    const idLower = resource.id.toLowerCase();
    const nameLower = resource.name.toLowerCase();
    const titleLower = resource.displayName.toLowerCase();
    const urlNorm = resource.repoUrl ? resource.repoUrl.trim().toLowerCase().replace(/\/$/, '').replace(/\.git$/, '') : '';
    return (
      installedResourceIds.has(resource.id) ||
      installedResourceIds.has(resource.name) ||
      installedResourceIds.has(resource.displayName) ||
      installedResourceIds.has(idLower) ||
      installedResourceIds.has(nameLower) ||
      installedResourceIds.has(titleLower) ||
      (urlNorm !== '' && installedResourceIds.has(urlNorm))
    );
  }, [isInstalled, resource, installedResourceIds]);

  const [installStatus, setInstallStatus] = useState<InstallStatus>(isActuallyInstalled ? 'installed' : 'not_installed');
  const [copied, setCopied] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [showUninstallConfirm, setShowUninstallConfirm] = useState(false);

  // 解析提示词中包含的变量占位符
  const parsedVariables = useMemo(() => {
    if (!resource?.promptVariables) return [];
    try {
      const vars = JSON.parse(resource.promptVariables);
      return Array.isArray(vars) ? vars : [];
    } catch {
      return [];
    }
  }, [resource?.promptVariables]);

  // 实时同步 GitHub 官方 Star 数（静默拉取并写入全局共享缓存）
  useEffect(() => {
    if (!resource?.repoUrl) return;
    refreshSingleRepoStar(resource.repoUrl);
  }, [resource?.repoUrl]);

  useEffect(() => {
    if (isActuallyInstalled) {
      setInstallStatus('installed');
    }
  }, [isActuallyInstalled]);

  if (!resource) {
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-[var(--color-background)]">
        <TopBar onBack={onBack} title="" />
        <div className="flex-1 flex items-center justify-center text-[var(--color-muted)] text-[14px]">
          未找到该资源
        </div>
      </div>
    );
  }

  const handleInstall = async () => {
    setInstallStatus('installing');
    try {
      if (resource.type === 'skill') {
        await onInstallSkill?.(resource, '');
      } else {
        await onInstallPrompt?.(resource);
      }
      setInstallStatus('installed');
    } catch {
      setInstallStatus('error');
    }
  };

  const handleUninstall = async () => {
    setIsUninstalling(true);
    try {
      if (resource.type === 'skill') {
        await onUninstallSkill?.(resource);
      } else {
        await onUninstallPrompt?.(resource);
      }
      setInstallStatus('not_installed');
      setShowUninstallConfirm(false);
    } catch (err) {
      console.error('Uninstall failed:', err);
    } finally {
      setIsUninstalling(false);
    }
  };

  const handleCopyContent = () => {
    const text = resource.promptContent || resource.previewContent || '';
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const difficultyMap = {
    beginner: { label: '入门' },
    intermediate: { label: '进阶' },
    advanced: { label: '高级' },
  };
  const difficulty = resource.difficulty ? difficultyMap[resource.difficulty] : null;
  const currentStars = resource.stars;

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden bg-[var(--color-background)] relative">
      <TopBar 
        onBack={onBack} 
        title={resource.displayName} 
        parentName={parentName}
        siblings={siblingResources}
        currentResourceId={resource.id}
        onSelectSibling={onSelectSibling}
      />

      <div className="flex-1 min-h-0 overflow-y-auto hover-scrollbar pb-16">
        {/* 头部卡片 */}
        <div className="m-5 p-5 bg-white rounded-xl border border-black/5 shadow-xs">
          <div className="flex items-start gap-4">
            {/* 规范矢量图标 */}
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-[var(--color-primary)]/5 text-[var(--color-primary)]">
              <ResourceIcon name={resource.icon} type={resource.type} className="w-6 h-6" />
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-[17px] font-bold text-[var(--foreground)] leading-tight mb-1">
                {resource.displayName}
              </h1>
              <p className="text-[12px] text-[var(--color-muted)] mb-2.5">{resource.author}</p>

              {/* 标签 */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-black/[0.04] text-[var(--color-muted)]">
                  {resource.type === 'skill' ? '技能' : '提示词'}
                </span>
                {difficulty && (
                  <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-black/[0.04] text-[var(--color-muted)]">
                    {difficulty.label}
                  </span>
                )}
                {currentStars && currentStars > 0 && (
                  <span
                    className="text-[11px] text-[var(--color-muted)] flex items-center gap-0.5 cursor-default"
                    title={`${currentStars.toLocaleString()} 颗星（GitHub 官方统计）`}
                  >
                    <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                    <span>{currentStars >= 1000 ? `${(currentStars / 1000).toFixed(1)}k` : currentStars}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2.5 mt-5 pt-4 border-t border-[var(--color-border)]/50">
            {installStatus === 'installed' ? (
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 select-none">
                  <Check className="w-4 h-4" /> 已安装
                </div>
                <button
                  type="button"
                  onClick={() => setShowUninstallConfirm(true)}
                  disabled={isUninstalling}
                  className="px-4 py-2 rounded-lg text-[13px] font-medium text-red-600 bg-red-50 hover:bg-red-100/80 border border-red-200 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title={`卸载「${resource.displayName}」`}
                >
                  {isUninstalling ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 卸载中...</>
                  ) : (
                    <><Trash2 className="w-3.5 h-3.5" /> 卸载</>
                  )}
                </button>
              </div>
            ) : (
              <button
                onClick={handleInstall}
                disabled={installStatus === 'installing'}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-semibold transition-all active:scale-[0.98] ${
                  installStatus === 'installing'
                    ? 'bg-black/[0.04] text-[var(--color-muted)] cursor-wait'
                    : installStatus === 'error'
                    ? 'bg-red-500/10 text-red-600 hover:bg-red-500/15 cursor-pointer'
                    : 'bg-[var(--color-primary)] text-white hover:opacity-90 cursor-pointer'
                }`}
              >
                {installStatus === 'installing' ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> 安装中...</>
                ) : installStatus === 'error' ? (
                  <><Download className="w-4 h-4" /> 重试安装</>
                ) : (
                  <><Download className="w-4 h-4" /> 安装{resource.type === 'skill' ? '技能' : '提示词'}</>
                )}
              </button>
            )}

            {resource.repoUrl && (
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-black/[0.04] text-[var(--foreground)] hover:bg-black/[0.08] transition-colors flex items-center gap-1.5 select-none cursor-pointer"
                onClick={async (e) => {
                  e.stopPropagation();
                  const cleanUrl = resource.repoUrl?.replace(/\.git$/, '');
                  if (cleanUrl) {
                    try {
                      await openUrl(cleanUrl);
                    } catch (err) {
                      console.error('打开 GitHub 链接失败', err);
                    }
                  }
                }}
              >
                <ExternalLink className="w-3.5 h-3.5 text-[var(--color-muted)]" /> GitHub
              </button>
            )}
          </div>
        </div>

        {/* 卸载确认二次弹窗 */}
        {showUninstallConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 modal-backdrop"
              onClick={() => !isUninstalling && setShowUninstallConfirm(false)}
            />
            <div className="relative modal-glass rounded-2xl w-full max-w-sm overflow-hidden p-6 shadow-2xl border border-black/10 bg-white animate-in zoom-in-95 duration-150">
              <h3 className="text-[15px] font-bold text-[var(--foreground)]">确认卸载</h3>
              <p className="text-[13px] text-[var(--color-muted)] mt-2 leading-relaxed">
                {resource.type === 'skill'
                  ? `确定要卸载「${resource.displayName}」吗？卸载将删除本地技能文件并解除关联的 Agent 软链接。`
                  : `确定要从提示词库中移除「${resource.displayName}」吗？`}
              </p>
              <div className="flex items-center justify-end gap-2.5 mt-6">
                <button
                  type="button"
                  onClick={() => setShowUninstallConfirm(false)}
                  disabled={isUninstalling}
                  className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleUninstall}
                  disabled={isUninstalling}
                  className="px-4 py-1.5 rounded-lg text-[13px] font-semibold bg-red-600 text-white hover:bg-red-700 active:scale-[0.98] transition-all cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isUninstalling && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isUninstalling ? '正在卸载...' : '确认卸载'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 详细信息区块 */}
        <div className="mx-5 mb-5 bg-white rounded-xl border border-black/5 p-5 space-y-4 shadow-xs">

          {/* 描述 */}
          <div>
            <h2 className="text-[12px] font-semibold text-[var(--foreground)] mb-1.5">描述</h2>
            <p className="text-[13px] text-[var(--color-muted)] leading-relaxed">{resource.description}</p>
          </div>

          {/* 标签 */}
          {resource.tags.length > 0 && (
            <div>
              <h2 className="text-[12px] font-semibold text-[var(--foreground)] mb-2">标签</h2>
              <div className="flex flex-wrap gap-1">
                {resource.tags.map(tag => (
                  <span key={tag} className="text-[11px] px-2 py-0.5 bg-black/[0.04] text-[var(--color-muted)] rounded-md">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 提示词插槽变量（若有） */}
          {parsedVariables.length > 0 && (
            <div className="pt-3 border-t border-[var(--color-border)]/40">
              <h2 className="text-[12px] font-semibold text-[var(--foreground)] mb-2.5 flex items-center gap-1.5">
                <span>插槽变量</span>
                <span className="text-[11px] font-normal text-[var(--color-muted)]">（提示词执行时的动态参数占位符）</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {parsedVariables.map((v: any, idx: number) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-black/[0.02] border border-black/5 text-[12px]">
                    <div className="flex items-center gap-1.5 font-mono font-medium text-[var(--color-primary)]">
                      <span>{`{{${v.name}}}`}</span>
                      {v.default && (
                        <span className="text-[10px] text-[var(--color-muted)] font-normal font-sans">
                          (默认: {v.default})
                        </span>
                      )}
                    </div>
                    {(v.label || v.description) && (
                      <p className="text-[11px] text-[var(--color-muted)] mt-1">{v.label || v.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 内容预览 / 提示词内容 */}
          {(resource.previewContent || resource.promptContent) && (
            <div className="pt-3 border-t border-[var(--color-border)]/40">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5">
                  {resource.type === 'skill' ? (
                    <FileText className="w-4 h-4 text-[var(--color-primary)]" />
                  ) : (
                    <Code className="w-4 h-4 text-[var(--color-primary)]" />
                  )}
                  <h2 className="text-[13px] font-bold text-[var(--foreground)]">
                    {resource.type === 'skill' ? '内容预览' : '提示词正文'}
                  </h2>
                </div>
                <button
                  onClick={handleCopyContent}
                  className="flex items-center gap-1 text-[11.5px] text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/[0.05] active:scale-[0.98] px-2.5 py-1 rounded-md transition-all cursor-pointer font-medium"
                >
                  {copied ? (
                    <><Check className="w-3.5 h-3.5 text-emerald-500" /> 已复制</>
                  ) : (
                    <><Copy className="w-3.5 h-3.5" /> 复制内容</>
                  )}
                </button>
              </div>
              <div className="bg-black/[0.02] border border-black/6 rounded-xl p-4 shadow-2xs">
                <pre className="text-[12px] text-[var(--foreground)] leading-relaxed whitespace-pre-wrap font-mono select-text break-words">
                  {resource.promptContent || resource.previewContent}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* 底部充足的呼吸留白空间 */}
        <div className="h-12 shrink-0" />
      </div>
    </div>
  );
}

function TopBar({
  onBack,
  title,
  parentName = '发现',
  siblings = [],
  currentResourceId = '',
  onSelectSibling,
}: {
  onBack: () => void;
  title: string;
  parentName?: string;
  siblings?: ResourceItem[];
  currentResourceId?: string;
  onSelectSibling?: (sibling: ResourceItem) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
      {/* 父级分类面包屑节点（无左箭头图标） */}
      <button
        onClick={onBack}
        className="px-2 py-1 -ml-1 rounded-md text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors text-[13px] font-medium cursor-pointer"
        title={`返回「${parentName}」`}
      >
        <span>{parentName}</span>
      </button>

      {title && (
        <>
          <span className="text-[var(--color-muted)]/40 text-[13px]">/</span>

          {/* 当前项面包屑节点（鼠标移入/点击展开 Notion 风格同级菜单） */}
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
              <span className="truncate max-w-[280px]">{title}</span>
              {siblings.length > 1 && (
                <ChevronDown
                  className={`w-3 h-3 text-[var(--color-muted)] transition-transform duration-200 ${
                    isOpen ? 'rotate-180 text-[var(--foreground)]' : ''
                  }`}
                />
              )}
            </button>

            {/* Notion 风格同级资源浮层 */}
            {isOpen && siblings.length > 0 && (
              <div
                className="absolute left-0 top-full mt-1 min-w-[240px] max-w-[320px] bg-white rounded-xl shadow-xl shadow-black/10 border border-black/[0.08] p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              >
                <div className="max-h-[300px] overflow-y-auto hover-scroll flex flex-col gap-0.5">
                  {siblings.map(item => {
                    const isCurrent = item.id === currentResourceId;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          if (!isCurrent) {
                            onSelectSibling?.(item);
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
                          <ResourceIcon name={item.icon} type={item.type} className="w-3.5 h-3.5" />
                        </div>

                        <span className="truncate flex-1 leading-snug">
                          {item.displayName}
                        </span>

                        {isCurrent && (
                          <ChevronRight className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0 opacity-70" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {siblings.length > 6 && (
                  <div className="mt-1 pt-1.5 border-t border-black/[0.05] px-2.5 py-1 text-[11px] text-[var(--color-muted)] flex items-center justify-between">
                    <span>同类资源</span>
                    <span>共 {siblings.length} 项</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
