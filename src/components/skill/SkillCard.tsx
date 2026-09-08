import React from 'react';
import { FileText, Star } from 'lucide-react';
import { Skill, SyncRecord, AgentConfig } from '../../types';
import { Tooltip } from '../ui/Tooltip';

export interface SkillCardProps {
  skill: Skill;
  syncRecords?: SyncRecord[];
  agents?: AgentConfig[];
  isSelected?: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onFavoriteToggle?: (e: React.MouseEvent, skill: Skill) => void;
  parentRepoName?: string;
  isSubSkill?: boolean;
}

export const SkillCard: React.FC<SkillCardProps> = ({
  skill,
  syncRecords = [],
  agents = [],
  isSelected = false,
  onClick,
  onDoubleClick,
  onContextMenu,
  onFavoriteToggle,
  parentRepoName,
  isSubSkill,
}) => {
  const skillSyncs = syncRecords.filter(r => r.skill_id === skill.id);
  const syncedAgents = agents.filter(a => skillSyncs.some(r => r.agent_id === a.id));

  // 是否判定为从属于组合包的子技能
  const isActualSubSkill = isSubSkill !== undefined 
    ? isSubSkill 
    : (skill.skill_scope === 'packed' || skill.skill_scope === 'loose');

  return (
    <div 
      data-id={skill.id}
      data-type="skill"
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
      onContextMenu={onContextMenu}
      className={`skill-card bg-white border rounded-xl p-3.5 transition-all duration-200 cursor-pointer group relative flex flex-col select-none ${
        isSelected 
          ? 'border-[var(--color-primary)] shadow-sm shadow-blue-500/10 ring-1 ring-[var(--color-primary)]/20' 
          : 'border-black/5 hover:border-black/10 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center w-full">
        {/* 图标 + 名称 */}
        <div className="flex items-center space-x-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-[var(--color-primary)]/5 text-[var(--color-primary)] relative">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5 pr-1">
            <Tooltip content={skill.name}>
              <h3 className="font-semibold text-[13px] text-[var(--foreground)] mask-fade-x leading-tight cursor-default">{skill.name}</h3>
            </Tooltip>
            <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
              {skill.source_type === 'online' ? (
                <span className="shrink-0 whitespace-nowrap text-[9px] font-medium text-[var(--color-muted)] bg-black/[0.04] dark:bg-white/[0.06] px-1.5 py-[2px] rounded-sm tracking-wide leading-none">URL</span>
              ) : isActualSubSkill ? (
                <span className="shrink-0 whitespace-nowrap text-[9px] font-medium text-[var(--color-muted)] bg-black/[0.04] dark:bg-white/[0.06] px-1.5 py-[2px] rounded-sm tracking-wide leading-none">子技能</span>
              ) : (
                <span className="shrink-0 whitespace-nowrap text-[9px] font-medium text-[var(--color-muted)] bg-black/[0.04] dark:bg-white/[0.06] px-1.5 py-[2px] rounded-sm tracking-wide leading-none">单技能</span>
              )}
              {parentRepoName && (
                <Tooltip content={parentRepoName}>
                  <span className="text-[10px] text-[var(--color-muted)] min-w-0 flex-1 mask-fade-x leading-none cursor-default">{parentRepoName}</span>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 收藏按钮：绝对定位盖在右上角，鼠标移入或已收藏时呈现，不占据文本流空间 */}
      {onFavoriteToggle && (
        <Tooltip content={skill.is_favorite ? '取消收藏' : '收藏'}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFavoriteToggle(e, skill);
            }}
            className={`absolute top-2 right-2 p-1.5 rounded-lg transition-all z-10 ${
              skill.is_favorite 
                ? 'text-amber-500 bg-white/90 dark:bg-black/60 shadow-xs backdrop-blur-xs' 
                : 'text-[var(--color-muted)] opacity-0 group-hover:opacity-100 bg-white/90 dark:bg-black/60 hover:text-amber-500 hover:bg-white shadow-xs backdrop-blur-xs'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${skill.is_favorite ? 'fill-current' : ''}`} />
          </button>
        </Tooltip>
      )}

      {/* 同步 Agent 指示器 */}
      {syncedAgents.length > 0 && (
        <div className="flex -space-x-1 mt-2.5 pt-2 border-t border-black/[0.04]">
          {syncedAgents.slice(0, 4).map((agent) => (
            <Tooltip key={agent.id} content={agent.display_name}>
              <div className="w-5 h-5 rounded-full bg-[var(--color-primary)] border-[1.5px] border-white flex items-center justify-center text-[8px] font-bold text-white cursor-help">
                {agent.display_name.charAt(0).toUpperCase()}
              </div>
            </Tooltip>
          ))}
          {syncedAgents.length > 4 && (
            <div className="w-5 h-5 rounded-full bg-black/10 border-[1.5px] border-white flex items-center justify-center text-[8px] font-bold text-[var(--color-muted)]">
              +{syncedAgents.length - 4}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
