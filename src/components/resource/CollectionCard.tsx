import { ChevronRight } from 'lucide-react';
import { ResourceIcon } from './ResourceIcon';
import type { Collection, ResourceItem } from '../../types/resource';

interface CollectionCardProps {
  collection: Collection;
  resources?: ResourceItem[];
  onClick?: (collection: Collection) => void;
}

/**
 * 合辑卡片组件 - 素雅风格，白底卡片
 */
export function CollectionCard({ collection, resources = [], onClick }: CollectionCardProps) {
  const previewResources = resources.slice(0, 3);

  return (
    <div
      className="group relative flex flex-col rounded-xl border border-black/5 bg-white hover:border-black/10 hover:shadow-sm transition-all duration-200 cursor-pointer select-none overflow-hidden"
      onClick={() => onClick?.(collection)}
    >
      {/* 顶部色条 */}
      <div className="h-1 w-full" style={{ background: collection.coverColor || 'var(--color-primary)' }} />

      <div className="p-3.5 flex flex-col flex-1">
        {/* 头部 */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-[10px] font-medium text-[var(--color-muted)] uppercase tracking-wider mb-0.5">技能合辑</p>
            <h3 className="text-[14px] font-semibold text-[var(--foreground)] leading-snug">{collection.name}</h3>
          </div>
          <div className="w-7 h-7 rounded-lg bg-black/[0.04] flex items-center justify-center shrink-0 group-hover:bg-black/[0.08] transition-colors">
            <ChevronRight className="w-3.5 h-3.5 text-[var(--color-muted)]" />
          </div>
        </div>

        {/* 描述 */}
        <p className="text-[12px] text-[var(--color-muted)] leading-relaxed line-clamp-2 mb-3">
          {collection.description}
        </p>

        {/* 资源预览列表 */}
        {previewResources.length > 0 && (
          <div className="mt-auto space-y-1.5">
            {previewResources.map((r) => (
              <div key={r.id} className="flex items-center gap-1.5 min-w-0">
                <ResourceIcon name={r.icon} type={r.type} className="w-3 h-3 text-[var(--color-muted)] shrink-0 opacity-70" />
                <span className="text-[11px] text-[var(--color-muted)] truncate">{r.displayName}</span>
              </div>
            ))}
            {resources.length > 3 && (
              <p className="text-[10px] text-[var(--color-muted)] pl-4">
                +{resources.length - 3} 个资源
              </p>
            )}
          </div>
        )}

        {/* 底部统计 */}
        <div className="mt-3 pt-2 border-t border-[var(--color-border)]/50 flex items-center justify-between">
          <span className="text-[11px] text-[var(--color-muted)]">
            共 {collection.resourceIds.length} 个资源
          </span>
          <span className="text-[11px] font-medium text-[var(--color-primary)] flex items-center gap-0.5">
            查看 <ChevronRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </div>
  );
}
