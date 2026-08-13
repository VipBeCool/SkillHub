import React from 'react';
import { FolderGit2 } from 'lucide-react';
import { GroupedRepo, SyncRecord, AgentConfig } from '../../types';
import { Tooltip } from '../ui/Tooltip';

export interface RepoCardProps {
  repo: GroupedRepo;
  syncRecords: SyncRecord[];
  agents: AgentConfig[];
  isSelected?: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onUpdateRepo: (e: React.MouseEvent, repo: GroupedRepo) => void;
  onDeleteRepo: (e: React.MouseEvent, repo: GroupedRepo) => void;
}

export const RepoCard: React.FC<RepoCardProps> = ({
  repo,
  syncRecords,
  agents,
  isSelected = false,
  onClick,
  onDoubleClick,
  onContextMenu,
}) => {
  const repoSyncs = syncRecords.filter(r => repo.skills.some(s => s.id === r.skill_id));
  const syncedAgents = agents.filter(a => repoSyncs.some(r => r.agent_id === a.id));

  return (
    <div 
      data-id={repo.id}
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
      onContextMenu={onContextMenu}
      className={`bg-white border rounded-xl p-3.5 transition-all duration-200 cursor-pointer group relative flex flex-col select-none ${
        isSelected 
          ? 'border-[var(--color-primary)] shadow-sm shadow-blue-500/10 ring-1 ring-[var(--color-primary)]/20' 
          : 'border-black/5 hover:border-black/10 hover:shadow-sm'
      } ${repo.is_missing ? 'opacity-60 grayscale-[50%]' : ''}`}
    >
      {/* 顶部：图标 + 名称 + 技能数 */}
      <div className="flex items-center space-x-2.5">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 relative ${repo.source_type === 'github' ? 'bg-[#0066FF]/10 text-[#0066FF]' : 'bg-[#86868B]/10 text-[#86868B]'}`}>
          <FolderGit2 className="w-4 h-4" />
          {repo.is_missing && (
            <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center text-white text-[8px] font-bold border border-white">!</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-[13px] text-[var(--foreground)] truncate leading-tight">{repo.name}</h3>
          <div className="flex items-center space-x-1.5 mt-0.5">
            <span className="text-[10px] text-[var(--color-muted)]">{repo.skills.length} 个技能</span>
            <span className={`w-1.5 h-1.5 rounded-full ${repo.source_type === 'github' ? 'bg-[#0066FF]' : 'bg-[#86868B]'}`} />
          </div>
        </div>
      </div>

      {/* 底部：同步 Agent 指示器 */}
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
