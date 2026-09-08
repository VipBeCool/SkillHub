import { useState } from 'react';
import { Download, Check, Loader2, Star, Trash2 } from 'lucide-react';
import { ResourceIcon } from './ResourceIcon';
import type { ResourceItem, InstallStatus } from '../../types/resource';

interface ResourceCardProps {
  resource: ResourceItem;
  installStatus?: InstallStatus;
  onInstall?: (resource: ResourceItem) => void;
  onUninstall?: (resource: ResourceItem) => void;
  onClick?: (resource: ResourceItem) => void;
}

/**
 * 资源卡片组件 - 素雅 Apple 风格，与技能/提示词 Tab 一致
 */
export function ResourceCard({
  resource,
  installStatus = 'not_installed',
  onInstall,
  onUninstall,
  onClick,
}: ResourceCardProps) {
  const [isHoveredInstalled, setIsHoveredInstalled] = useState(false);

  const difficultyMap = {
    beginner: { label: '入门' },
    intermediate: { label: '进阶' },
    advanced: { label: '高级' },
  };

  const difficulty = resource.difficulty ? difficultyMap[resource.difficulty] : null;

  return (
    <div
      className="group relative flex flex-col rounded-xl bg-white border border-black/5 hover:border-black/10 transition-all duration-200 cursor-pointer select-none overflow-hidden hover:shadow-sm"
      onClick={() => onClick?.(resource)}
    >
      <div className="p-3.5 flex flex-col flex-1">
        {/* 头部：图标 + 类型 */}
        <div className="flex items-start justify-between mb-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-[var(--color-primary)]/5 text-[var(--color-primary)]">
            <ResourceIcon name={resource.icon} type={resource.type} className="w-4 h-4" />
          </div>
          <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-black/[0.04] text-[var(--color-muted)]">
            {resource.type === 'skill' ? '技能' : '提示词'}
          </span>
        </div>

        {/* 标题 */}
        <h3 className="text-[13px] font-semibold text-[var(--foreground)] leading-tight mb-0.5 line-clamp-1">
          {resource.displayName}
        </h3>

        {/* 作者 */}
        <p className="text-[11px] text-[var(--color-muted)] mb-1.5">
          {resource.author}
        </p>

        {/* 描述 */}
        <p className="text-[12px] text-[var(--color-muted)] leading-relaxed line-clamp-2 flex-1 mb-2.5">
          {resource.description}
        </p>

        {/* 底部 */}
        <div className="flex items-center justify-between mt-auto pt-2 border-t border-[var(--color-border)]/50">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {difficulty && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-black/[0.03] text-[var(--color-muted)]">
                {difficulty.label}
              </span>
            )}
            {resource.stars && resource.stars > 0 && (
              <span
                className="text-[10px] text-[var(--color-muted)] flex items-center gap-0.5 cursor-default"
                title={`${resource.stars.toLocaleString()} 颗星`}
              >
                <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                <span>{resource.stars >= 1000 ? `${(resource.stars / 1000).toFixed(1)}k` : resource.stars}</span>
              </span>
            )}
          </div>

          <button
            type="button"
            onMouseEnter={() => setIsHoveredInstalled(true)}
            onMouseLeave={() => setIsHoveredInstalled(false)}
            className={`shrink-0 flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md transition-all duration-200 cursor-pointer ${
              installStatus === 'installed'
                ? isHoveredInstalled
                  ? 'bg-red-50 text-red-600 border border-red-200 shadow-2xs'
                  : 'bg-black/[0.04] text-[var(--color-muted)]'
                : installStatus === 'installing'
                ? 'bg-black/[0.04] text-[var(--color-muted)] cursor-wait'
                : 'bg-[var(--color-primary)] text-white hover:opacity-90 active:scale-95'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              if (installStatus === 'not_installed') {
                onInstall?.(resource);
              } else if (installStatus === 'installed') {
                if (window.confirm(`确定要卸载「${resource.displayName}」吗？`)) {
                  onUninstall?.(resource);
                }
              }
            }}
            disabled={installStatus === 'installing'}
            title={installStatus === 'installed' ? `点击卸载「${resource.displayName}」` : undefined}
          >
            {installStatus === 'installed' ? (
              isHoveredInstalled ? (
                <><Trash2 className="w-3 h-3" /><span>卸载</span></>
              ) : (
                <><Check className="w-3 h-3" /><span>已安装</span></>
              )
            ) : installStatus === 'installing' ? (
              <><Loader2 className="w-3 h-3 animate-spin" /><span>安装中</span></>
            ) : (
              <><Download className="w-3 h-3" /><span>安装</span></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

