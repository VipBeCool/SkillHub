import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, FolderGit2, HardDrive, X, Command, Sparkles, PanelRight, Filter, Type, Globe, Plus } from 'lucide-react';
import { GroupedRepo, Skill, SyncRecord, AgentConfig } from '../../types';
import { RepoCard } from '../skill/RepoCard';
import { SkillCard } from '../skill/SkillCard';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  repos: GroupedRepo[];
  syncRecords: SyncRecord[];
  agents: AgentConfig[];
  onSelectRepo: (repoId: string) => void;
  onSelectSkill: (skill: Skill, repo: GroupedRepo) => void;
  onUpdateRepo: (e: React.MouseEvent, repo: GroupedRepo) => void;
  onDeleteRepo: (e: React.MouseEvent, repo: GroupedRepo) => void;
  onCopyPath: (e: React.MouseEvent, skill: Skill) => void;
}

type HoveredItem = 
  | { type: 'repo', repo: GroupedRepo }
  | { type: 'skill', skill: Skill, repo: GroupedRepo };

export const SearchModal: React.FC<SearchModalProps> = ({ 
  isOpen, onClose, repos, syncRecords, agents, 
  onSelectRepo, onSelectSkill, onUpdateRepo, onDeleteRepo, onCopyPath
}) => {
  const [query, setQuery] = useState('');
  const [hoveredItem, setHoveredItem] = useState<HoveredItem | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  
  // Filters state
  const [filterNameOnly, setFilterNameOnly] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'repo' | 'skill'>('all');
  const [filterSource, setFilterSource] = useState<'all' | 'github' | 'local'>('all');
  
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setHoveredItem(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const { matchedRepos, matchedSkills } = useMemo(() => {
    if (!query.trim()) return { matchedRepos: [], matchedSkills: [] };

    const lowerQuery = query.toLowerCase();
    
    let matchedRepos = repos.filter(repo => {
      if (filterType === 'skill') return false;
      if (filterSource !== 'all' && repo.source_type !== filterSource) return false;

      const nameMatch = repo.name && repo.name.toLowerCase().includes(lowerQuery);
      if (filterNameOnly) return !!nameMatch;

      return !!nameMatch;
    });
    
    matchedRepos.sort((a, b) => {
      const aName = (a.name || '').toLowerCase();
      const bName = (b.name || '').toLowerCase();
      if (aName === lowerQuery && bName !== lowerQuery) return -1;
      if (bName === lowerQuery && aName !== lowerQuery) return 1;
      if (aName.startsWith(lowerQuery) && !bName.startsWith(lowerQuery)) return -1;
      if (bName.startsWith(lowerQuery) && !aName.startsWith(lowerQuery)) return 1;
      return aName.localeCompare(bName);
    });

    let matchedSkills: { skill: Skill, repo: GroupedRepo }[] = [];
    if (filterType !== 'repo') {
      repos.forEach(repo => {
        if (filterSource !== 'all' && repo.source_type !== filterSource) return;
        // Exclude single-skill repos from showing up in sub-skills
        if (repo.skills.length <= 1) return;
        
        repo.skills.forEach(skill => {
          const nameMatch = skill.name && skill.name.toLowerCase().includes(lowerQuery);
          if (filterNameOnly) {
            if (nameMatch) matchedSkills.push({ skill, repo });
          } else {
            if (nameMatch || (skill.description && skill.description.toLowerCase().includes(lowerQuery))) {
              matchedSkills.push({ skill, repo });
            }
          }
        });
      });
    }
    
    matchedSkills.sort((a, b) => {
      const aName = (a.skill.name || '').toLowerCase();
      const bName = (b.skill.name || '').toLowerCase();
      if (aName === lowerQuery && bName !== lowerQuery) return -1;
      if (bName === lowerQuery && aName !== lowerQuery) return 1;
      if (aName.startsWith(lowerQuery) && !bName.startsWith(lowerQuery)) return -1;
      if (bName.startsWith(lowerQuery) && !aName.startsWith(lowerQuery)) return 1;
      return aName.localeCompare(bName);
    });

    return { matchedRepos, matchedSkills };
  }, [query, repos, filterType, filterSource, filterNameOnly]);

  // Select first item automatically when search results change
  useEffect(() => {
    if (query.trim() && (matchedRepos.length > 0 || matchedSkills.length > 0)) {
      if (matchedRepos.length > 0) {
        setHoveredItem({ type: 'repo', repo: matchedRepos[0] });
      } else if (matchedSkills.length > 0) {
        setHoveredItem({ type: 'skill', skill: matchedSkills[0].skill, repo: matchedSkills[0].repo });
      }
    } else {
      setHoveredItem(null);
    }
  }, [query, matchedRepos, matchedSkills]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] bg-black/30 transition-opacity" onClick={onClose}>
      <div 
        className="w-full max-w-[1000px] bg-white rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] overflow-hidden flex flex-col h-[70vh] border border-black/10 animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
          <div className="flex items-center px-4 py-3 border-b border-black/5 shrink-0">
          <Search className="w-5 h-5 text-gray-400 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 text-lg outline-none bg-transparent placeholder-gray-400 text-[var(--foreground)]"
            placeholder="搜索仓库或技能..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && hoveredItem) {
                if (hoveredItem.type === 'repo') {
                  onSelectRepo(hoveredItem.repo.id);
                  onClose();
                } else {
                  onSelectSkill(hoveredItem.skill, hoveredItem.repo);
                  onClose();
                }
              }
            }}
          />
          <div className="flex items-center space-x-1.5 shrink-0 ml-4">
            <button 
              onClick={() => setShowFilters(!showFilters)} 
              className={`p-1 rounded-md text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors ${showFilters ? 'bg-black/5 text-[var(--foreground)]' : ''}`}
              title="筛选"
            >
              <Filter className="w-4.5 h-4.5" />
            </button>
            <button 
              onClick={() => setShowPreview(!showPreview)} 
              className={`p-1 rounded-md text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors ${showPreview ? 'bg-black/5 text-[var(--foreground)]' : ''}`}
              title="预览面板"
            >
              <PanelRight className="w-4.5 h-4.5" />
            </button>
            <div className="w-px h-4 bg-gray-200 mx-1.5"></div>
            <button onClick={onClose} className="p-1 rounded-md text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors ml-2" title="关闭">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 筛选栏 UI */}
        {showFilters && (
          <div className="flex items-center px-4 py-1.5 border-b border-black/5 shrink-0 space-x-2 bg-[#fafafa] overflow-x-auto">
            <button 
              onClick={() => setFilterNameOnly(!filterNameOnly)}
              className={`flex items-center px-1.5 py-0.5 text-[10.5px] font-medium rounded transition-all hover:bg-black/5 ${filterNameOnly ? 'bg-black/10 text-[var(--foreground)]' : 'text-[var(--color-muted)]'}`}
            >
              <Type className="w-3 h-3 mr-1 opacity-70" />
              仅搜索名称
            </button>
            <button 
              onClick={() => setFilterType(filterType === 'all' ? 'repo' : filterType === 'repo' ? 'skill' : 'all')}
              className={`flex items-center px-1.5 py-0.5 text-[10.5px] font-medium rounded transition-all hover:bg-black/5 ${filterType !== 'all' ? 'bg-black/10 text-[var(--foreground)]' : 'text-[var(--color-muted)]'}`}
            >
              <FolderGit2 className="w-3 h-3 mr-1 opacity-70" />
              {filterType === 'all' ? '全部类型' : filterType === 'repo' ? '仅仓库' : '仅技能'}
            </button>
            <button 
              onClick={() => setFilterSource(filterSource === 'all' ? 'github' : filterSource === 'github' ? 'local' : 'all')}
              className={`flex items-center px-1.5 py-0.5 text-[10.5px] font-medium rounded transition-all hover:bg-black/5 ${filterSource !== 'all' ? 'bg-black/10 text-[var(--foreground)]' : 'text-[var(--color-muted)]'}`}
            >
              <Globe className="w-3 h-3 mr-1 opacity-70" />
              {filterSource === 'all' ? '全部来源' : filterSource === 'github' ? '仅 GitHub' : '仅 Local'}
            </button>
            <div className="w-px h-3 bg-gray-300 mx-1"></div>
            <button className="flex items-center px-1.5 py-0.5 text-[10.5px] font-medium text-gray-400 hover:text-gray-600 hover:bg-black/5 rounded transition-all">
              <Plus className="w-3 h-3 mr-1" />
              添加筛选
            </button>
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          {/* 左侧列表 */}
          <div className={`${showPreview ? 'w-[60%] border-r' : 'w-full'} flex flex-col border-black/5 overflow-hidden transition-all duration-300`}>
            <div className="flex-1 overflow-y-auto">
              {!query.trim() ? (
                <div className="px-6 py-12 text-center text-gray-400 text-sm flex flex-col items-center justify-center h-full">
                  <Command className="w-12 h-12 mb-4 opacity-20" />
                  <p>输入关键词进行搜索</p>
                </div>
              ) : matchedRepos.length === 0 && matchedSkills.length === 0 ? (
                <div className="px-6 py-12 text-center text-gray-500 text-sm flex items-center justify-center h-full">
                  未找到匹配项 "{query}"
                </div>
              ) : (
                <div className="p-2 space-y-4">
                  {matchedRepos.length > 0 && (
                    <div>
                      <h3 className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                        仓库 ({matchedRepos.length})
                      </h3>
                      <div className="space-y-1">
                        {matchedRepos.map(repo => {
                          const isHovered = hoveredItem?.type === 'repo' && hoveredItem.repo.id === repo.id;
                          return (
                            <button
                              key={`repo-${repo.id}`}
                              onMouseEnter={() => setHoveredItem({ type: 'repo', repo })}
                              onClick={() => {
                                onSelectRepo(repo.id);
                                onClose();
                              }}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-all text-left outline-none border-none ${isHovered ? 'bg-black/5 text-[var(--foreground)]' : 'hover:bg-black/5 text-gray-800'}`}
                            >
                              <div className="flex items-center space-x-3 truncate">
                                <div 
                                  className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${isHovered ? 'bg-black/5 text-[var(--foreground)]' : (repo.source_type === 'github' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500')}`}
                                >
                                  <FolderGit2 className="w-4 h-4" />
                                </div>
                                <div>
                                  <div className="text-[13px] font-medium truncate">{repo.name}</div>
                                  <div className="text-[11px] mt-0.5 truncate flex items-center text-[var(--color-muted)]">
                                    <span className="truncate max-w-[200px]">{repo.path}</span>
                                  </div>
                                </div>
                              </div>
                              <span 
                                className="text-[10px] px-2 py-0.5 rounded shrink-0 ml-3 font-medium"
                                style={isHovered ? { backgroundColor: 'rgba(255,255,255,0.2)', color: '#ffffff' } : { backgroundColor: 'rgba(0,0,0,0.05)', color: '#6b7280' }}
                              >
                                {repo.category}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {matchedSkills.length > 0 && (
                    <div>
                      <h3 className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 mt-2">
                        子技能 ({matchedSkills.length})
                      </h3>
                      <div className="space-y-1">
                        {matchedSkills.map(({ skill, repo }) => {
                          const isHovered = hoveredItem?.type === 'skill' && hoveredItem.skill.id === skill.id;
                          return (
                            <button
                              key={`skill-${skill.id}`}
                              onMouseEnter={() => setHoveredItem({ type: 'skill', skill, repo })}
                              onClick={() => {
                                onSelectSkill(skill, repo);
                                onClose();
                              }}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-all text-left outline-none border-none ${isHovered ? 'bg-black/5 text-[var(--foreground)]' : 'hover:bg-black/5 text-gray-800'}`}
                            >
                              <div className="flex items-center space-x-3 truncate">
                                <div 
                                  className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${isHovered ? 'bg-black/10 text-[var(--foreground)]' : 'bg-gray-100 text-gray-500'}`}
                                >
                                  <HardDrive className="w-4 h-4" />
                                </div>
                                <div className="truncate pr-3">
                                  <div className="text-[13px] font-medium truncate">
                                    {skill.name}
                                  </div>
                                  <div className={`text-[11px] mt-0.5 flex items-center space-x-1.5 truncate text-[var(--color-muted)]`}>
                                    <span className="shrink-0">{repo.name}</span>
                                    <span className={isHovered ? 'opacity-70' : 'opacity-50'}>/</span>
                                    <span className="truncate max-w-[150px]">{skill.description || '无描述'}</span>
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="bg-gray-50 px-4 py-2 border-t border-black/5 flex items-center space-x-4 text-[11px] text-gray-400 shrink-0">
              <div className="flex items-center">
                <kbd className="px-1.5 py-0.5 rounded border border-gray-200 bg-white shadow-sm font-sans mr-1.5">↵</kbd>
                <span>进入</span>
              </div>
              <div className="flex items-center">
                <kbd className="px-1.5 py-0.5 rounded border border-gray-200 bg-white shadow-sm font-sans mr-1.5">ESC</kbd>
                <span>关闭</span>
              </div>
            </div>
          </div>

          {/* 右侧预览区 */}
          {showPreview && (
            <div className="w-[40%] bg-[#fcfcfc] overflow-y-auto p-6 relative flex flex-col items-center justify-center border-l border-white shadow-[-4px_0_24px_-12px_rgba(0,0,0,0.05)] z-10 transition-all duration-300">
              {hoveredItem ? (
              <div className="w-full max-w-[320px] mx-auto animate-in fade-in slide-in-from-right-4 duration-200">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center">
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" /> 预览
                </h4>
                {hoveredItem.type === 'repo' && (
                  <RepoCard 
                    repo={hoveredItem.repo} 
                    syncRecords={syncRecords} 
                    agents={agents} 
                    onClick={() => {
                      onSelectRepo(hoveredItem.repo.id);
                      onClose();
                    }}
                    onUpdateRepo={onUpdateRepo}
                    onDeleteRepo={onDeleteRepo}
                  />
                )}
                {hoveredItem.type === 'skill' && (
                  <SkillCard 
                    skill={hoveredItem.skill} 
                    syncRecords={syncRecords} 
                    agents={agents} 
                    onClick={() => {
                      onSelectSkill(hoveredItem.skill, hoveredItem.repo);
                      onClose();
                    }}
                    onCopyPath={onCopyPath}
                  />
                )}
              </div>
            ) : (
              <div className="text-gray-400 flex flex-col items-center">
                <Command className="w-12 h-12 mb-4 opacity-10" />
                <p className="text-sm">选中列表项进行预览</p>
              </div>
            )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
