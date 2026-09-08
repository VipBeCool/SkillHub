import React from 'react';
import { Loader2, X } from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';
import { CloningRepo } from '../../types';

export interface CloningCardProps {
  name?: string;
  path?: string;
  repo?: CloningRepo;
  onCancel: (e: React.MouseEvent, path?: string) => void;
}

export const CloningCard: React.FC<CloningCardProps> = ({
  name: propName,
  path: propPath,
  repo,
  onCancel,
}) => {
  const name = repo?.name ?? propName ?? '';
  const path = repo?.path ?? propPath ?? '';

  return (
    <div 
      className="bg-black/[0.015] hover:bg-black/[0.03] dark:bg-white/[0.02] border border-dashed border-black/15 dark:border-white/15 rounded-xl p-3.5 flex items-start justify-between transition-all duration-200 select-none relative group h-[74px]"
    >
      <div className="flex items-center space-x-3 min-w-0 flex-1 pr-2 mt-0.5">
        <div className="w-9 h-9 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] text-[var(--color-muted)] flex items-center justify-center shrink-0">
          <Loader2 className="w-4 h-4 animate-spin text-gray-400 dark:text-gray-500" />
        </div>
        <div className="min-w-0 flex-1">
          <Tooltip content={name}>
            <h3 className="font-semibold text-[13px] text-[var(--foreground)] mask-fade-x leading-tight cursor-default">
              {name}
            </h3>
          </Tooltip>
          <div className="flex items-center space-x-1.5 mt-1">
            <span className="text-[11px] text-[var(--color-muted)] font-normal">正在拉取...</span>
          </div>
        </div>
      </div>
      <Tooltip content="删除并清理本地已拉取文件">
        <button
          type="button"
          onClick={(e) => onCancel(e, path)}
          className="p-1 -mr-1 -mt-0.5 rounded-lg text-[var(--color-muted)] hover:text-red-500 hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </Tooltip>
    </div>
  );
};

