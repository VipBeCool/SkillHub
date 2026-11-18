import React from 'react';
import { FileCode, Globe, Star } from 'lucide-react';
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
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 relative ${
            skill.source_type === 'online'
              ? 'bg-emerald-500/10 text-emerald-600'
              : skill.source_type === 'github'
                ? 'bg-[#0066FF]/10 text-[#0066FF]'
                : 'bg-[#86868B]/10 text-[#86868B]'
          }`}>
            {skill.source_type === 'online' ? <Globe className="w-4 h-4" /> : <FileCode className="w-4 h-4" />}
          </div>
          <div className={`min-w-0 flex-1 flex flex-col justify-center gap-0.5 ${onFavoriteToggle && skill.is_favorite ? 'pr-7' : 'pr-1'}`}>
            <Tooltip content={skill.name}>
              <h3 className="font-semibold text-[13px] text-[var(--foreground)] mask-fade-x leading-tight cursor-default">{skill.name}</h3>
            </Tooltip>
            <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
              {skill.source_type === 'online' ? (
                <span className="shrink-0 whitespace-nowrap text-[9px] font-medium text-emerald-600 bg-emerald-500/10 px-1.5 py-[2px] rounded-sm tracking-wide leading-none">线上技能</span>
              ) : isActualSubSkill ? (
                <span className="shrink-0 whitespace-nowrap text-[9px] font-medium text-[var(--color-muted)] bg-black/[0.04] dark:bg-white/[0.06] px-1.5 py-[2px] rounded-sm tracking-wide leading-none">子技能</span>
              ) : !parentRepoName ? (
                <span className="text-[10px] text-[var(--color-muted)] shrink-0 leading-none">
                  {skill.source_type === 'github' ? 'GitHub 技能' : '本地技能'}
                </span>
              ) : null}
              {parentRepoName && (
                <Tooltip content={parentRepoName}>
                  <span className="text-[10px] text-[var(--color-muted)] min-w-0 flex-1 mask-fade-x leading-none cursor-default">{parentRepoName}</span>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 星标按钮：绝对定位盖在右上角，鼠标移入或已星标时呈现，不占据文本流空间 */}
      {onFavoriteToggle && (
        <Tooltip content={skill.is_favorite ? '取消星标' : '星标'}>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onFavoriteToggle(e, skill);
            }}
            className={`absolute top-1.5 right-1.5 w-8 h-8 flex items-center justify-center rounded-lg transition-[opacity,transform,background-color] duration-150 active:scale-90 z-10 cursor-pointer ${
              skill.is_favorite
                ? 'opacity-100 text-amber-500 bg-white/90 dark:bg-black/60 hover:bg-amber-50/90 dark:hover:bg-amber-950/40'
                : 'opacity-0 group-hover:opacity-100 text-[var(--color-muted)] hover:text-amber-500 bg-white/95 dark:bg-black/60 hover:bg-amber-50/90 dark:hover:bg-amber-950/40 shadow-xs backdrop-blur-xs'
            }`}
          >
            <Star className={`w-4 h-4 ${skill.is_favorite ? 'fill-amber-500 text-amber-500' : ''}`} />
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
