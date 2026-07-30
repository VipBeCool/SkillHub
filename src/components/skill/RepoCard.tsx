import React from 'react';
import { FolderGit2, Copy, Folder, RefreshCw, Trash2 } from 'lucide-react';
import { GroupedRepo, SyncRecord, AgentConfig } from '../../types';
import { formatTime } from '../../utils';
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from '@tauri-apps/plugin-opener';
import { showToast } from '../ui/Toast';

export interface RepoCardProps {
  repo: GroupedRepo;
  syncRecords: SyncRecord[];
  agents: AgentConfig[];
  onClick: (repoId: string) => void;
  onUpdateRepo: (e: React.MouseEvent, repo: GroupedRepo) => void;
  onDeleteRepo: (e: React.MouseEvent, repo: GroupedRepo) => void;
}

export const RepoCard: React.FC<RepoCardProps> = ({
  repo,
  syncRecords,
  agents,
  onClick,
  onUpdateRepo,
  onDeleteRepo
}) => {
  const repoSyncs = syncRecords.filter(r => repo.skills.some(s => s.id === r.skill_id));
  const syncedAgents = agents.filter(a => repoSyncs.some(r => r.agent_id === a.id));

  return (
    <div 
      onClick={() => onClick(repo.id)}
      className="bg-white border border-black/5 rounded-[14px] p-5 hover:border-black/10 hover:shadow-sm transition-all duration-300 cursor-pointer group relative flex flex-col h-full overflow-hidden"
    >
      <div className="flex items-center justify-between mb-3 relative z-10">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${repo.source_type === 'github' ? 'bg-[#0066FF]/10 text-[#0066FF]' : 'bg-[#86868B]/10 text-[#86868B]'}`}>
          <FolderGit2 className="w-5 h-5" />
        </div>
        
        <div className="flex items-center space-x-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
          <button onClick={async (e) => { 
            e.stopPropagation(); 
            try {
              await invoke("open_local_folder", { path: repo.path });
            } catch (err) {
              console.error("Failed to open folder:", err);
            }
          }} className="flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-white transition-all cursor-pointer bg-white/60 backdrop-blur-md border border-white/40 shadow-sm" style={{ width: '28px', height: '28px', borderRadius: '50%', padding: 0 }} title="在本地打开">
            <Folder size={14} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(repo.path); showToast("skill文件路径已复制到剪切板"); }} className="flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-white transition-all cursor-pointer bg-white/60 backdrop-blur-md border border-white/40 shadow-sm" style={{ width: '28px', height: '28px', borderRadius: '50%', padding: 0 }} title="复制路径">
            <Copy size={14} />
          </button>
          {repo.source_type === 'github' && (
            <button onClick={async (e) => { 
              e.stopPropagation(); 
              try {
                const url = await invoke<string>("get_git_remote_url", { path: repo.path });
                if (url) await openUrl(url);
              } catch (err) {
                console.error(err);
              }
            }} className="flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-white transition-all cursor-pointer bg-white/60 backdrop-blur-md border border-white/40 shadow-sm" style={{ width: '28px', height: '28px', borderRadius: '50%', padding: 0 }} title="在 GitHub 查看">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.24c3-.3 6-1.5 6-6.76a5.5 5.5 0 0 0-1.5-3.8 5.1 5.1 0 0 0-.1-3.8s-1.2-.4-3.9 1.4a13.4 13.4 0 0 0-7 0C6.3 2.4 5.1 2.8 5.1 2.8a5.1 5.1 0 0 0-.1 3.8 5.5 5.5 0 0 0-1.5 3.8c0 5.2 3 6.4 6 6.76a4.8 4.8 0 0 0-1 3.24v4"></path></svg>
            </button>
          )}
          <button onClick={(e) => onUpdateRepo(e, repo)} className="flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-white transition-all cursor-pointer bg-white/60 backdrop-blur-md border border-white/40 shadow-sm" style={{ width: '28px', height: '28px', borderRadius: '50%', padding: 0 }} title="更新">
            <RefreshCw size={14} />
          </button>
          <button onClick={(e) => onDeleteRepo(e, repo)} className="flex items-center justify-center text-[var(--color-muted)] hover:!text-red-600 !text-red-500 hover:bg-red-50 transition-all cursor-pointer bg-white/60 backdrop-blur-md border border-white/40 shadow-sm" style={{ width: '28px', height: '28px', borderRadius: '50%', padding: 0 }} title="删除">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      
      <h3 className="font-semibold text-[15px] text-[var(--foreground)] mb-1 transition-colors line-clamp-1">{repo.name}</h3>
      
      <div className="text-[13px] text-[var(--color-muted)] mt-1 flex-1 flex flex-col">
        {/* 分类与数量信息 */}
        <div className="flex items-center mb-2">
          <span className="flex items-center text-[11px] px-2 py-0.5 rounded-md bg-[var(--color-muted-bg)] text-[var(--color-muted)] font-medium">
            {repo.category}{repo.skills.length > 1 ? ` · ${repo.skills.length}项` : ''}
          </span>
        </div>

        {/* 子技能精简展示 (纯文本带圆点分隔) */}
        <div className="text-[12px] leading-relaxed line-clamp-2 mt-1">
          {repo.skills.slice(0, 8).map(s => s.name).join(" • ")}
          {repo.skills.length > 8 && " ..."}
        </div>
      </div>
      
      <div className="flex items-center justify-between pt-4 mt-auto min-h-[40px]">
        <div className="flex items-center space-x-2">
          <span className={`flex h-2 w-2 rounded-full ${repo.source_type === 'github' ? 'bg-[#0066FF]' : 'bg-[#86868B]'}`}></span>
          <span className="text-[11px] font-medium text-[var(--color-muted)] uppercase tracking-wider">{repo.source_type || 'local'}</span>
        </div>
        
        <div className="flex items-center space-x-3">
          {repo.source_type === 'github' && repo.updated_at && (
            <span className="text-[10px] text-[var(--color-muted)] opacity-70 whitespace-nowrap">
              {formatTime(repo.updated_at)}
            </span>
          )}
          {syncedAgents.length > 0 && (
            <div className="flex -space-x-1.5">
              {syncedAgents.map((agent) => (
                <div key={agent.id} className="w-6 h-6 rounded-full bg-[var(--color-primary)] border-2 border-[var(--color-card)] flex items-center justify-center text-[10px] font-bold text-white shadow-sm" title={agent.display_name}>
                  {agent.display_name.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
