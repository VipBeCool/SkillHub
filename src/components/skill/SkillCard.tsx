import React from 'react';
import { HardDrive, Copy, Folder } from 'lucide-react';
import { invoke } from "@tauri-apps/api/core";
import { Tooltip } from "../ui/Tooltip";
import { Skill, SyncRecord, AgentConfig } from '../../types';

export interface SkillCardProps {
  skill: Skill;
  syncRecords: SyncRecord[];
  agents: AgentConfig[];
  onClick: (skill: Skill) => void;
  onCopyPath: (e: React.MouseEvent, skill: Skill) => void;
}

export const SkillCard: React.FC<SkillCardProps> = ({
  skill,
  syncRecords,
  agents,
  onClick,
  onCopyPath
}) => {
  const skillSyncs = syncRecords.filter(r => r.skill_id === skill.id);
  const syncedAgents = agents.filter(a => skillSyncs.some(r => r.agent_id === a.id));

  return (
    <div 
      onClick={() => onClick(skill)}
      className="bg-white border border-black/5 rounded-[14px] p-5 hover:border-black/10 hover:shadow-sm transition-all duration-300 cursor-pointer group relative flex flex-col h-full"
    >
      <div className="flex items-center justify-between mb-3 relative z-10">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-[var(--color-muted-bg)] text-[var(--color-muted)]`}>
          <HardDrive className="w-5 h-5" />
        </div>
        
        <div className="flex items-center space-x-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
          <Tooltip content="在本地打开">
            <button
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await invoke("open_local_folder", { path: skill.local_path });
                } catch (err) {
                  console.error("Failed to open folder:", err);
                }
              }}
              className="flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-white transition-all cursor-pointer bg-white/60 backdrop-blur-md border border-white/40 shadow-sm"
              style={{ width: '28px', height: '28px', borderRadius: '50%', padding: 0 }}
            >
              <Folder size={14} />
            </button>
          </Tooltip>
          <Tooltip content="复制路径">
            <button
              onClick={(e) => onCopyPath(e, skill)}
              className="flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-white transition-all cursor-pointer bg-white/60 backdrop-blur-md border border-white/40 shadow-sm"
              style={{ width: '28px', height: '28px', borderRadius: '50%', padding: 0 }}
            >
              <Copy size={14} />
            </button>
          </Tooltip>
        </div>
      </div>
      
      <h3 className="font-semibold text-[15px] text-[var(--foreground)] mb-1 transition-colors line-clamp-1">{skill.name}</h3>
      <Tooltip content={skill.description}>
        <p className="text-[13px] text-[var(--color-muted)] line-clamp-2 leading-relaxed flex-1 cursor-default">
          {skill.description}
        </p>
      </Tooltip>
      
      <div className="flex items-center justify-between pt-4 mt-auto border-t border-[var(--color-border)] min-h-[40px]">
        <div className="flex items-center space-x-2">
          <span className="text-[11px] font-medium text-[var(--color-muted)] uppercase tracking-wider">SKILL</span>
        </div>
        <div className="flex items-center space-x-3">
          {syncedAgents.length > 0 && (
            <div className="flex -space-x-1.5">
              {syncedAgents.map((agent) => (
                <Tooltip key={agent.id} content={agent.display_name}>
                  <div className="w-6 h-6 rounded-full bg-[var(--color-primary)] border-2 border-[var(--color-card)] flex items-center justify-center text-[10px] font-bold text-white shadow-sm cursor-help">
                    {agent.display_name.charAt(0).toUpperCase()}
                  </div>
                </Tooltip>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
