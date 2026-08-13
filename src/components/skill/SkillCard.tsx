import React from 'react';
import { HardDrive } from 'lucide-react';
import { Skill, SyncRecord, AgentConfig } from '../../types';
import { Tooltip } from '../ui/Tooltip';

export interface SkillCardProps {
  skill: Skill;
  syncRecords: SyncRecord[];
  agents: AgentConfig[];
  isSelected?: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onCopyPath: (e: React.MouseEvent, skill: Skill) => void;
}

export const SkillCard: React.FC<SkillCardProps> = ({
  skill,
  syncRecords,
  agents,
  isSelected = false,
  onClick,
  onDoubleClick,
  onContextMenu,
}) => {
  const skillSyncs = syncRecords.filter(r => r.skill_id === skill.id);
  const syncedAgents = agents.filter(a => skillSyncs.some(r => r.agent_id === a.id));

  return (
    <div 
      data-id={skill.id}
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
      onContextMenu={onContextMenu}
      className={`bg-white border rounded-xl p-3.5 transition-all duration-200 cursor-pointer group relative flex flex-col select-none ${
        isSelected 
          ? 'border-[var(--color-primary)] shadow-sm shadow-blue-500/10 ring-1 ring-[var(--color-primary)]/20' 
          : 'border-black/5 hover:border-black/10 hover:shadow-sm'
      }`}
    >
      {/* 图标 + 名称 */}
      <div className="flex items-center space-x-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-[var(--color-muted-bg)] text-[var(--color-muted)]">
          <HardDrive className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-[13px] text-[var(--foreground)] truncate leading-tight">{skill.name}</h3>
          <span className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider">SKILL</span>
        </div>
      </div>

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
