import React, { useState } from 'react';
import { GroupedRepo, Skill, SyncRecord, AgentConfig } from '../../types';
import { RepoCard } from './RepoCard';
import { SkillCard } from './SkillCard';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface CategorizedViewProps {
  repos: GroupedRepo[];
  cloningRepos: { path: string; name: string }[];
  selectedRepoIds: Set<string>;
  selectedSkillIds: Set<string>;
  onSelectRepo: (repo: GroupedRepo, e: React.MouseEvent) => void;
  onSelectSkill: (skill: Skill, repo: GroupedRepo, e: React.MouseEvent) => void;
  onDoubleClickRepo: (repoId: string) => void;
  onDoubleClickSkill: (skill: Skill, repo: GroupedRepo) => void;
  onContextMenuRepo: (e: React.MouseEvent, repo: GroupedRepo) => void;
  onContextMenuSkill: (e: React.MouseEvent, skill: Skill) => void;
  handleCancelClone: (e: React.MouseEvent, path: string) => void;
  onFavoriteToggle: (e: React.MouseEvent, skill: Skill) => void;
  syncRecords: SyncRecord[];
  agents: AgentConfig[];
  onUpdateRepo: (e: React.MouseEvent, repo: GroupedRepo) => void;
  onDeleteRepo: (e: React.MouseEvent, repo: GroupedRepo) => void;
}

export function CategorizedView({
  repos,
  cloningRepos,
  selectedRepoIds,
  selectedSkillIds,
  onSelectRepo,
  onSelectSkill,
  onDoubleClickRepo,
  onDoubleClickSkill,
  onContextMenuRepo,
  onContextMenuSkill,
  handleCancelClone,
  onFavoriteToggle,
  syncRecords,
  agents,
  onUpdateRepo,
  onDeleteRepo
}: CategorizedViewProps) {
  const [showSubSkills, setShowSubSkills] = useState(() => {
    return localStorage.getItem('skillhub_show_sub_skills') === 'true';
  });
  
  const [collectionsCollapsed, setCollectionsCollapsed] = useState(() => {
    return localStorage.getItem('skillhub_collections_collapsed') === 'true';
  });
  const [singlesCollapsed, setSinglesCollapsed] = useState(() => {
    return localStorage.getItem('skillhub_singles_collapsed') === 'true';
  });

  const collections = repos.filter(r => r.repo_type === 'collection');
  const singles = repos.filter(r => r.repo_type !== 'collection');

  // 将线上收藏统一归为"技能"
  const onlineSingles = singles.filter(r => r.source_type === 'online');

  const handleToggleSubSkills = () => {
    const newValue = !showSubSkills;
    setShowSubSkills(newValue);
    localStorage.setItem('skillhub_show_sub_skills', String(newValue));
  };
  
  const toggleCollections = () => {
    const newValue = !collectionsCollapsed;
    setCollectionsCollapsed(newValue);
    localStorage.setItem('skillhub_collections_collapsed', String(newValue));
  };

  const toggleSingles = () => {
    const newValue = !singlesCollapsed;
    setSinglesCollapsed(newValue);
    localStorage.setItem('skillhub_singles_collapsed', String(newValue));
  };

  return (
    <div
      className="flex-1 flex flex-col px-6 pt-3 pb-20 overflow-y-auto hover-scroll"
      onMouseEnter={e => e.currentTarget.style.setProperty('--scroll-thumb-color', 'rgba(0,0,0,0.18)')}
      onMouseLeave={e => e.currentTarget.style.setProperty('--scroll-thumb-color', 'transparent')}
    >
      {/* 技能组合包分组 */}
      {collections.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center mb-4 cursor-pointer select-none group w-fit" onClick={toggleCollections}>
            <h2 className="text-[12px] font-medium text-[var(--color-muted)] group-hover:text-[var(--foreground)] transition-colors">技能组合包 ({collections.length})</h2>
            {collectionsCollapsed ? (
              <ChevronRight className="w-4 h-4 ml-1 text-[var(--color-muted)] group-hover:text-[var(--foreground)] transition-colors" />
            ) : (
              <ChevronDown className="w-4 h-4 ml-1 text-[var(--color-muted)] group-hover:text-[var(--foreground)] transition-colors" />
            )}
            
            <div className="flex-1" />
          </div>
          
          {!collectionsCollapsed && (
            <>
              <div className="grid gap-3 content-start mb-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                {cloningRepos.map((repo, idx) => (
                  <div key={`cloning-${idx}`} className="group bg-[var(--color-muted-bg)]/30 backdrop-blur-md rounded-xl p-4 border border-dashed border-[var(--color-border)] shadow-sm flex flex-col h-24 animate-pulse">
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 rounded-lg bg-[var(--color-muted-bg)] flex items-center justify-center shrink-0">
                        <div className="w-4 h-4 border-2 border-[var(--color-muted)] border-t-transparent rounded-full animate-spin"></div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[13px] font-semibold text-[var(--foreground)] truncate" title={repo.name}>{repo.name}</h3>
                        <span className="text-[10px] text-[var(--color-muted)]">正在拉取...</span>
                      </div>
                      <button onClick={(e) => handleCancelClone(e, repo.path)} className="p-1 rounded text-[var(--color-muted)] hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      </button>
                    </div>
                  </div>
                ))}
                {collections.map((repo) => (
                  <RepoCard
                    key={repo.id}
                    repo={repo}
                    isSelected={selectedRepoIds.has(repo.id)}
                    onClick={(e) => onSelectRepo(repo, e)}
                    onDoubleClick={() => onDoubleClickRepo(repo.id)}
                    onContextMenu={(e) => onContextMenuRepo(e, repo)}
                    syncRecords={syncRecords}
                    agents={agents}
                    onUpdateRepo={onUpdateRepo}
                    onDeleteRepo={onDeleteRepo}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 单技能分组 */}
      {(singles.length > 0 || onlineSingles.length > 0) && (
        <div>
          <div className="flex items-center sticky top-0 bg-white/80 backdrop-blur-md z-10 pt-2 pb-2 -mt-2 mb-4">
            <div className="flex items-center cursor-pointer select-none group" onClick={toggleSingles}>
              <h2 className="text-[12px] font-medium text-[var(--color-muted)] group-hover:text-[var(--foreground)] transition-colors">技能 ({singles.length})</h2>
              {singlesCollapsed ? (
                <ChevronRight className="w-4 h-4 ml-1 text-[var(--color-muted)] group-hover:text-[var(--foreground)] transition-colors" />
              ) : (
                <ChevronDown className="w-4 h-4 ml-1 text-[var(--color-muted)] group-hover:text-[var(--foreground)] transition-colors" />
              )}
            </div>
            
            <div className="flex-1" />
            
            <label className="flex items-center space-x-2 cursor-pointer group">
              <div className="relative flex items-center justify-center">
                <input 
                  type="checkbox" 
                  checked={showSubSkills}
                  onChange={handleToggleSubSkills}
                  className="peer appearance-none w-4 h-4 border border-[var(--color-border)] rounded shadow-sm bg-white checked:bg-[var(--color-primary)] checked:border-[var(--color-primary)] transition-all"
                />
                <svg className="absolute w-3 h-3 text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <span className="text-[12px] font-medium text-[var(--color-muted)] group-hover:text-[var(--foreground)] transition-colors">
                显示组合包中的子技能
              </span>
            </label>
          </div>
          
          {!singlesCollapsed && (
          <div className="grid gap-3 content-start pb-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {singles.map((repo) => (
              <RepoCard
                key={repo.id}
                repo={repo}
                isSelected={selectedRepoIds.has(repo.id)}
                onClick={(e) => onSelectRepo(repo, e)}
                onDoubleClick={() => onDoubleClickRepo(repo.id)}
                onContextMenu={(e) => onContextMenuRepo(e, repo)}
                syncRecords={syncRecords}
                agents={agents}
                onUpdateRepo={onUpdateRepo}
                onDeleteRepo={onDeleteRepo}
              />
            ))}
            {showSubSkills && collections.flatMap(repo => repo.skills.map(skill => (
              <SkillCard
                key={skill.id}
                skill={skill}
                isSelected={selectedSkillIds.has(skill.id)}
                onClick={(e) => onSelectSkill(skill, repo, e)}
                onDoubleClick={() => onDoubleClickSkill(skill, repo)}
                onContextMenu={(e) => onContextMenuSkill(e, skill)}
                parentRepoName={repo.name}
                syncRecords={syncRecords}
                agents={agents}
                onFavoriteToggle={onFavoriteToggle}
              />
            )))}
          </div>
          )}
        </div>
      )}
    </div>
  );
}
