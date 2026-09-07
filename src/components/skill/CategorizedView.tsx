import React, { useState } from 'react';
import { GroupedRepo, Skill, SyncRecord, AgentConfig, CloningRepo } from '../../types';
import { RepoCard } from './RepoCard';
import { SkillCard } from './SkillCard';
import { CloningCard } from './CloningCard';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface CategorizedViewProps {
  repos: GroupedRepo[];
  cloningRepos: CloningRepo[];
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
      className="flex-1 flex flex-col px-6 pt-0 pb-20 overflow-y-auto hover-scroll"
    >
      {/* 正在拉取分组（独立展示，拉取中无需分类，完成后自动归类） */}
      {cloningRepos.length > 0 && (
        <div className="mb-5 relative">
          <div className="flex items-center sticky top-0 bg-white z-10 pt-3 pb-2 -mx-6 px-6">
            <h2 className="text-[12px] font-medium text-[var(--color-muted)] flex items-center gap-1.5">
              <span>正在拉取</span>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              <span>({cloningRepos.length})</span>
            </h2>
          </div>
          <div className="grid gap-3 content-start" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {cloningRepos.map((repo) => (
              <CloningCard
                key={repo.path}
                name={repo.name}
                path={repo.path}
                onCancel={(e) => handleCancelClone(e, repo.path)}
              />
            ))}
          </div>
        </div>
      )}

      {/* 技能组合包分组 */}
      {collections.length > 0 && (
        <div className="mb-4 relative">
          <div className={`flex items-center sticky top-0 bg-white z-10 pt-3 pb-2 -mx-6 px-6 cursor-pointer select-none group ${collectionsCollapsed ? 'mb-0' : 'mb-4'}`} onClick={toggleCollections}>
            <h2 className="text-[12px] font-medium text-[var(--color-muted)] group-hover:text-[var(--foreground)] transition-colors">
              技能组合包 ({collections.length})
            </h2>
            {collectionsCollapsed ? (
              <ChevronRight className="w-4 h-4 ml-1 text-[var(--color-muted)] group-hover:text-[var(--foreground)] transition-colors" />
            ) : (
              <ChevronDown className="w-4 h-4 ml-1 text-[var(--color-muted)] group-hover:text-[var(--foreground)] transition-colors" />
            )}
            
            <div className="flex-1" />
          </div>
          
          {!collectionsCollapsed && (
            <div className="grid gap-3 content-start mb-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
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
          )}
        </div>
      )}

      {/* 单技能分组 */}
      {(singles.length > 0 || onlineSingles.length > 0) && (
        <div className="relative">
          <div className={`flex items-center sticky top-0 bg-white z-10 pt-2 pb-2 -mx-6 px-6 ${singlesCollapsed ? 'mb-0' : 'mb-4'}`}>
            <div className="flex items-center cursor-pointer select-none group" onClick={toggleSingles}>
              <h2 className="text-[12px] font-medium text-[var(--color-muted)] group-hover:text-[var(--foreground)] transition-colors">
                技能 ({singles.length})
              </h2>
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
