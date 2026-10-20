import React from 'react';
import { Loader2, X } from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';
import { CloningRepo } from '../../types';

export interface CloningCardProps {
  name?: string;
  path?: string;
  repo?: CloningRepo;
  onCancel: (e: React.MouseEvent, path?: string) => void;
  onInspect?: (repo: CloningRepo) => void;
}

export const CloningCard: React.FC<CloningCardProps> = ({
  name: propName,
  path: propPath,
  repo,
  onCancel,
  onInspect,
}) => {
  const name = repo?.name ?? propName ?? '';
  const path = repo?.path ?? propPath ?? '';
  const percent = repo?.progress?.percent;
  const statusMessage = repo?.progress?.message || '正在拉取...';

  const handleClick = () => {
    if (onInspect) {
      onInspect(repo || { path, name });
    }
  };

  return (
    <div 
      onClick={handleClick}
      className="bg-black/[0.015] hover:bg-blue-50/40 dark:hover:bg-blue-950/20 border border-dashed border-black/15 hover:border-blue-300 dark:border-white/15 dark:hover:border-blue-700/50 rounded-xl p-3 flex flex-col justify-between transition-all duration-200 select-none relative group min-h-[78px] cursor-pointer"
      title="点击查看拉取实时过程与日志"
    >
      <div className="flex items-start justify-between w-full">
        <div className="flex items-center space-x-2.5 min-w-0 flex-1 pr-1.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
          </div>
          <div className="min-w-0 flex-1">
            <Tooltip content={`${name} (点击查看日志)`}>
              <h3 className="font-semibold text-[13px] text-[var(--foreground)] group-hover:text-blue-600 dark:group-hover:text-blue-400 mask-fade-x leading-tight transition-colors">
                {name}
              </h3>
            </Tooltip>
            <div className="flex items-center space-x-1.5 mt-0.5">
              <span className="text-[11px] text-[var(--color-muted)] font-normal truncate max-w-[130px]">
                {statusMessage}
              </span>
              {typeof percent === 'number' && (
                <span className="text-[10px] font-mono font-medium text-blue-600 dark:text-blue-400 shrink-0">
                  {percent}%
                </span>
              )}
            </div>
          </div>
        </div>
        <Tooltip content="删除并清理本地已拉取文件">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCancel(e, path);
            }}
            className="p-1 -mr-1 -mt-0.5 rounded-lg text-[var(--color-muted)] hover:text-red-500 hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </Tooltip>
      </div>

      {/* 微型进度条 */}
      <div className="w-full mt-2 h-1 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
        <div 
          className="h-full bg-blue-500 transition-all duration-200 ease-out rounded-full"
          style={{ width: `${typeof percent === 'number' ? Math.max(percent, 4) : 25}%` }}
        />
      </div>
    </div>
  );
};

