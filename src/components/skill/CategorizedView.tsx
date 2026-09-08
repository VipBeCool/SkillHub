import React, { useState, useTransition, useMemo, useEffect } from 'react';
import { GroupedRepo, Skill, SyncRecord, AgentConfig, CloningRepo } from '../../types';
import { RepoCard } from './RepoCard';
import { SkillCard } from './SkillCard';
import { CloningCard } from './CloningCard';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

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
  // 1. 立即响应的勾选状态（保证勾选框 0 延迟响应，视觉极其跟手）
  const [showSubSkills, setShowSubSkills] = useState(() => {
    return localStorage.getItem('skillhub_show_sub_skills') === 'true';
  });

  // 2. 实际用于重型子技能列表渲染的状态（非阻塞后台过渡调度）
  const [renderedSubSkills, setRenderedSubSkills] = useState(showSubSkills);
  const [isPending, startTransition] = useTransition();

  const [collectionsCollapsed, setCollectionsCollapsed] = useState(() => {
    return localStorage.getItem('skillhub_collections_collapsed') === 'true';
  });
  const [singlesCollapsed, setSinglesCollapsed] = useState(() => {
    return localStorage.getItem('skillhub_singles_collapsed') === 'true';
  });

  const collections = useMemo(() => repos.filter(r => r.repo_type === 'collection'), [repos]);
  const singles = useMemo(() => repos.filter(r => r.repo_type !== 'collection'), [repos]);

  // 将线上收藏统一归为"技能"
  const onlineSingles = useMemo(() => singles.filter(r => r.source_type === 'online'), [singles]);

  // 缓存展平的所有子技能列表，避免重复 flatMap 计算
  const allSubSkillItems = useMemo(() => {
    return collections.flatMap(repo => (repo.skills || []).map(skill => ({ skill, repo })));
  }, [collections]);

  // 3. 渐进分帧挂载限制（首帧极速挂载前 60 个填满视口，次帧瞬间补齐全部，避免一次性塞入成百上千节点卡顿主线程）
  const [renderLimit, setRenderLimit] = useState(showSubSkills ? 99999 : 60);

  useEffect(() => {
    if (renderedSubSkills) {
      setRenderLimit(60);
      const timer = setTimeout(() => {
        setRenderLimit(allSubSkillItems.length);
      }, 40);
      return () => clearTimeout(timer);
    }
  }, [renderedSubSkills, allSubSkillItems.length]);

  // 统计当前实际展示的技能总数（单技能 + 展开的组合包子技能）
  const subSkillsCount = allSubSkillItems.length;
  const displayedSkillsCount = singles.length + (showSubSkills ? subSkillsCount : 0);

  const handleToggleSubSkills = () => {
    const newValue = !showSubSkills;
    // 立即更新复选框视觉，0延迟跟手
    setShowSubSkills(newValue);
    localStorage.setItem('skillhub_show_sub_skills', String(newValue));

    // 后台非阻塞渲染重型子技能列表
    startTransition(() => {
      setRenderedSubSkills(newValue);
    });
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

      {/* 技能分组：当有单技能、线上单技能，或有技能组合包时均展示 */}
      {(singles.length > 0 || onlineSingles.length > 0 || collections.length > 0) && (
        <div className="relative">
          <div className={`flex items-center sticky top-0 bg-white z-10 pt-2 pb-2 -mx-6 px-6 ${singlesCollapsed ? 'mb-0' : 'mb-4'}`}>
            <div className="flex items-center cursor-pointer select-none group" onClick={toggleSingles}>
              <h2 className="text-[12px] font-medium text-[var(--color-muted)] group-hover:text-[var(--foreground)] transition-colors">
                技能 ({displayedSkillsCount})
              </h2>
              {singlesCollapsed ? (
                <ChevronRight className="w-4 h-4 ml-1 text-[var(--color-muted)] group-hover:text-[var(--foreground)] transition-colors" />
              ) : (
                <ChevronDown className="w-4 h-4 ml-1 text-[var(--color-muted)] group-hover:text-[var(--foreground)] transition-colors" />
              )}
            </div>
            
            <div className="flex-1" />
            
            {collections.length > 0 && (
              <div className="flex items-center">
                {isPending && (
                  <div className="flex items-center text-[var(--color-primary)] mr-2 select-none">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  </div>
                )}
                <label className="flex items-center space-x-2 cursor-pointer group select-none">
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
            )}
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
            {renderedSubSkills && allSubSkillItems.slice(0, renderLimit).map(({ skill, repo }) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                isSelected={selectedSkillIds.has(skill.id)}
                onClick={(e) => onSelectSkill(skill, repo, e)}
                onDoubleClick={() => onDoubleClickSkill(skill, repo)}
                onContextMenu={(e) => onContextMenuSkill(e, skill)}
                parentRepoName={repo.name}
                isSubSkill={true}
                syncRecords={syncRecords}
                agents={agents}
                onFavoriteToggle={onFavoriteToggle}
              />
            ))}
          </div>
          )}
        </div>
      )}
    </div>
  );
}
