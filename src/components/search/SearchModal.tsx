import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, FolderGit2, HardDrive, X, Command, PanelRight, Filter, Type, Globe, Plus, Copy, FolderOpen, Trash2, RefreshCw, Clock, ArrowDownAZ, Check, MessageSquareText, Star, Tag, Puzzle } from 'lucide-react';
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { showToast } from "../ui/Toast";
import { GroupedRepo, Skill, Prompt } from '../../types';
import { Tooltip } from "../ui/Tooltip";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  repos: GroupedRepo[];
  onSelectRepo: (repoId: string) => void;
  onSelectSkill: (skill: Skill, repo: GroupedRepo) => void;
  onDeleteRepo: (e: React.MouseEvent, repo: GroupedRepo) => void;
  onCopyPath: (e: React.MouseEvent, skill: Skill) => void;
  prompts: Prompt[];
  onSelectPrompt: (prompt: Prompt) => void;
}

const formatDateTime = (dateStr: string) => {
  const d = new Date(dateStr);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const SmartTooltipText: React.FC<{ text: string, className?: string, tooltipContent?: string }> = ({ text, className, tooltipContent }) => {
  const textRef = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const checkTruncation = () => {
      if (textRef.current) {
        setIsTruncated(textRef.current.scrollHeight > textRef.current.clientHeight || textRef.current.scrollWidth > textRef.current.clientWidth);
      }
    };
    
    checkTruncation();
    // Re-check on window resize
    window.addEventListener('resize', checkTruncation);
    return () => window.removeEventListener('resize', checkTruncation);
  }, [text]);

  return (
    <>
      <span 
        ref={textRef} 
        className={className}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onMouseMove={(e) => {
          if (isTruncated) {
            setMousePos({ x: e.clientX, y: e.clientY });
          }
        }}
      >
        {text}
      </span>
      {isTruncated && showTooltip && createPortal(
        <div 
          style={{ left: mousePos.x, top: mousePos.y + 20 }}
          className="fixed z-[100] max-w-[300px] rounded-[4px] bg-black/90 backdrop-blur-md px-1.5 py-0.5 text-[12px] font-medium text-white border border-black/5 shadow-sm pointer-events-none"
        >
          {tooltipContent || text}
        </div>,
        document.body
      )}
    </>
  );
};

type HoveredItem = 
  | { type: 'repo', repo: GroupedRepo }
  | { type: 'skill', skill: Skill, repo: GroupedRepo }
  | { type: 'prompt', prompt: Prompt };

export const SearchModal: React.FC<SearchModalProps> = ({ 
  isOpen, onClose, repos, prompts,
  onSelectRepo, onSelectSkill, onSelectPrompt, onDeleteRepo, onCopyPath
}) => {
  const [query, setQuery] = useState('');
  const [hoveredItem, setHoveredItem] = useState<HoveredItem | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [showFilters, setShowFilters] = useState(true);
  
  // Filters state
  const [filterNameOnly, setFilterNameOnly] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'repo' | 'skill' | 'prompt'>('all');
  const [filterSource, setFilterSource] = useState<'all' | 'github' | 'local'>('all');
  const [sortOrder, setSortOrder] = useState<'best_match' | 'updated_desc' | 'updated_asc'>('best_match');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      const lastSearch = localStorage.getItem('skillhub_last_search') || '';
      setQuery(lastSearch);
      setHoveredItem(null);
      setTimeout(() => inputRef.current?.select(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    localStorage.setItem('skillhub_last_search', query);
  }, [query]);

  const { matchedRepos, matchedSkills, matchedPrompts } = useMemo(() => {
    if (!query.trim()) return { matchedRepos: [], matchedSkills: [], matchedPrompts: [] };

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
      if (sortOrder === 'best_match') {
        if (aName === lowerQuery && bName !== lowerQuery) return -1;
        if (bName === lowerQuery && aName !== lowerQuery) return 1;
        if (aName.startsWith(lowerQuery) && !bName.startsWith(lowerQuery)) return -1;
        if (bName.startsWith(lowerQuery) && !aName.startsWith(lowerQuery)) return 1;
        return aName.localeCompare(bName);
      } else {
        const timeA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const timeB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        if (timeA === timeB) return aName.localeCompare(bName);
        return sortOrder === 'updated_desc' ? timeB - timeA : timeA - timeB;
      }
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
      if (sortOrder === 'best_match') {
        if (aName === lowerQuery && bName !== lowerQuery) return -1;
        if (bName === lowerQuery && aName !== lowerQuery) return 1;
        if (aName.startsWith(lowerQuery) && !bName.startsWith(lowerQuery)) return -1;
        if (bName.startsWith(lowerQuery) && !aName.startsWith(lowerQuery)) return 1;
        return aName.localeCompare(bName);
      } else {
        const timeA = a.skill.updated_at ? new Date(a.skill.updated_at).getTime() : 0;
        const timeB = b.skill.updated_at ? new Date(b.skill.updated_at).getTime() : 0;
        if (timeA === timeB) return aName.localeCompare(bName);
        return sortOrder === 'updated_desc' ? timeB - timeA : timeA - timeB;
      }
    });

    let matchedPrompts: Prompt[] = [];
    if (filterType !== 'repo' && filterType !== 'skill') {
      matchedPrompts = prompts.filter(p => {
        if (p.deleted_at) return false;
        const nameMatch = p.title?.toLowerCase().includes(lowerQuery);
        if (filterNameOnly) return !!nameMatch;
        return !!nameMatch || 
               (p.content?.toLowerCase().includes(lowerQuery)) ||
               (p.description?.toLowerCase().includes(lowerQuery));
      });

      matchedPrompts.sort((a, b) => {
        const aName = (a.title || '').toLowerCase();
        const bName = (b.title || '').toLowerCase();
        if (sortOrder === 'best_match') {
          if (aName === lowerQuery && bName !== lowerQuery) return -1;
          if (bName === lowerQuery && aName !== lowerQuery) return 1;
          if (aName.startsWith(lowerQuery) && !bName.startsWith(lowerQuery)) return -1;
          if (bName.startsWith(lowerQuery) && !aName.startsWith(lowerQuery)) return 1;
          return aName.localeCompare(bName);
        } else {
          const timeA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
          const timeB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
          if (timeA === timeB) return aName.localeCompare(bName);
          return sortOrder === 'updated_desc' ? timeB - timeA : timeA - timeB;
        }
      });
    }

    return { matchedRepos, matchedSkills, matchedPrompts };
  }, [query, repos, prompts, filterType, filterSource, filterNameOnly, sortOrder]);

  // Select first item automatically when search results change
  useEffect(() => {
    if (query.trim() && (matchedRepos.length > 0 || matchedSkills.length > 0 || matchedPrompts.length > 0)) {
      if (matchedRepos.length > 0) {
        setHoveredItem({ type: 'repo', repo: matchedRepos[0] });
      } else if (matchedSkills.length > 0) {
        setHoveredItem({ type: 'skill', skill: matchedSkills[0].skill, repo: matchedSkills[0].repo });
      } else if (matchedPrompts.length > 0) {
        setHoveredItem({ type: 'prompt', prompt: matchedPrompts[0] });
      }
    } else {
      setHoveredItem(null);
    }
  }, [query, matchedRepos, matchedSkills, matchedPrompts]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 modal-backdrop transition-opacity" onClick={onClose} />
      <div 
        className="modal-glass w-full max-w-[1000px] rounded-2xl overflow-hidden flex flex-col max-h-[70vh] animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
          <div className="flex items-center px-4 py-3 border-b border-black/5 shrink-0">
          <Search className="w-5 h-5 text-gray-400 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 text-lg outline-none bg-transparent placeholder-gray-400 text-[var(--foreground)]"
            placeholder="搜索技能、子技能或提示词..."
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              localStorage.setItem('skillhub_last_search', e.target.value);
            }}
            onKeyDown={e => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && hoveredItem) {
                if (hoveredItem.type === 'repo') {
                  onSelectRepo(hoveredItem.repo.id);
                  onClose();
                } else if (hoveredItem.type === 'skill') {
                  onSelectSkill(hoveredItem.skill, hoveredItem.repo);
                  onClose();
                } else if (hoveredItem.type === 'prompt') {
                  onSelectPrompt(hoveredItem.prompt);
                  onClose();
                }
              }
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const allItems = [
                  ...matchedRepos.map(repo => ({ type: 'repo' as const, repo })),
                  ...matchedSkills.map(s => ({ type: 'skill' as const, skill: s.skill, repo: s.repo })),
                  ...matchedPrompts.map(p => ({ type: 'prompt' as const, prompt: p }))
                ];
                if (allItems.length === 0) return;
                
                const currentIndex = allItems.findIndex(item => {
                  if (!hoveredItem) return false;
                  if (item.type !== hoveredItem.type) return false;
                  if (item.type === 'repo' && hoveredItem.type === 'repo') return item.repo.id === hoveredItem.repo.id;
                  if (item.type === 'skill' && hoveredItem.type === 'skill') return item.skill.id === hoveredItem.skill.id;
                  if (item.type === 'prompt' && hoveredItem.type === 'prompt') return item.prompt.id === hoveredItem.prompt.id;
                  return false;
                });
                
                let nextIndex = currentIndex;
                if (e.key === 'ArrowDown') {
                  nextIndex = currentIndex < allItems.length - 1 ? currentIndex + 1 : 0;
                } else {
                  nextIndex = currentIndex > 0 ? currentIndex - 1 : allItems.length - 1;
                }
                
                const nextItem = allItems[nextIndex];
                setHoveredItem(nextItem);
                
                setTimeout(() => {
                  const id = nextItem.type === 'repo' ? `search-item-repo-${nextItem.repo.id}` 
                           : nextItem.type === 'skill' ? `search-item-skill-${nextItem.skill.id}`
                           : `search-item-prompt-${nextItem.prompt.id}`;
                  const el = document.getElementById(id);
                  if (el) el.scrollIntoView({ block: 'nearest' });
                }, 0);
              }
            }}
          />
          <div className="flex items-center space-x-1.5 shrink-0 ml-4">
            <Tooltip content="筛选">
              <button 
                onClick={() => setShowFilters(!showFilters)} 
                className={`p-1 rounded-md text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors ${showFilters ? 'bg-black/5 text-[var(--foreground)]' : ''}`}
              >
                <Filter className="w-4.5 h-4.5" />
              </button>
            </Tooltip>
            <Tooltip content="预览面板">
              <button 
                onClick={() => setShowPreview(!showPreview)} 
                className={`p-1 rounded-md text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors ${showPreview ? 'bg-black/5 text-[var(--foreground)]' : ''}`}
              >
                <PanelRight className="w-4.5 h-4.5" />
              </button>
            </Tooltip>
            <div className="w-px h-4 bg-gray-200 mx-1.5"></div>
            <Tooltip content="关闭">
              <button onClick={onClose} className="p-1 rounded-md text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors ml-2">
                <X className="w-5 h-5" />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* 筛选栏 UI */}
        {showFilters && (
          <div className="flex items-center px-4 py-1.5 border-b border-black/5 shrink-0 space-x-2 bg-[#fafafa]">
            <button 
              onClick={() => setFilterNameOnly(!filterNameOnly)}
              className={`flex items-center px-2 py-1 text-xs font-medium rounded transition-all hover:bg-black/5 ${filterNameOnly ? 'bg-black/10 text-[var(--foreground)]' : 'text-[var(--color-muted)]'}`}
            >
              <Type className="w-3.5 h-3.5 mr-1.5 opacity-70" />
              仅搜索名称
            </button>
            <button 
              onClick={() => setFilterType(filterType === 'all' ? 'repo' : filterType === 'repo' ? 'skill' : filterType === 'skill' ? 'prompt' : 'all')}
              className={`flex items-center px-2 py-1 text-xs font-medium rounded transition-all hover:bg-black/5 ${filterType !== 'all' ? 'bg-black/10 text-[var(--foreground)]' : 'text-[var(--color-muted)]'}`}
            >
              <FolderGit2 className="w-3.5 h-3.5 mr-1.5 opacity-70" />
              {filterType === 'all' ? '全部类型' : filterType === 'repo' ? '仅技能' : filterType === 'skill' ? '仅子技能' : '仅提示词'}
            </button>
            {filterType !== 'prompt' && (
              <button 
                onClick={() => setFilterSource(filterSource === 'all' ? 'github' : filterSource === 'github' ? 'local' : 'all')}
                className={`flex items-center px-2 py-1 text-xs font-medium rounded transition-all hover:bg-black/5 ${filterSource !== 'all' ? 'bg-black/10 text-[var(--foreground)]' : 'text-[var(--color-muted)]'}`}
              >
                <Globe className="w-3.5 h-3.5 mr-1.5 opacity-70" />
                {filterSource === 'all' ? '所有来源' : filterSource === 'github' ? '仅 Github' : '仅本地'}
              </button>
            )}
            
            <div className="w-px h-3.5 bg-gray-200 mx-1"></div>
            
            {/* 排序菜单 */}
            <div className="relative">
              <button 
                onClick={() => setShowSortDropdown(!showSortDropdown)}
                className={`flex items-center px-2 py-1 text-xs font-medium rounded transition-all hover:bg-black/5 ${sortOrder !== 'best_match' ? 'bg-black/10 text-[var(--foreground)]' : 'text-[var(--color-muted)]'}`}
              >
                <ArrowDownAZ className="w-3.5 h-3.5 mr-1.5 opacity-70" />
                {sortOrder === 'best_match' ? '最佳匹配' : sortOrder === 'updated_desc' ? '最新更新优先' : '最早更新优先'}
              </button>
              {showSortDropdown && (
                <>
                  <div className="fixed inset-0 z-[100]" onClick={() => setShowSortDropdown(false)}></div>
                  <div className="absolute top-full left-0 mt-1 w-36 bg-white rounded-lg shadow-lg border border-black/5 py-1 z-[110] text-xs font-medium text-gray-700 animate-in fade-in slide-in-from-top-1 duration-100">
                    <button 
                      onClick={() => { setSortOrder('best_match'); setShowSortDropdown(false); }}
                      className={`w-full text-left px-3 py-1.5 hover:bg-black/5 transition-colors flex justify-between items-center ${sortOrder === 'best_match' ? 'text-blue-600 bg-blue-50/50' : ''}`}
                    >
                      <span>最佳匹配</span>
                      {sortOrder === 'best_match' && <Check className="w-3.5 h-3.5" />}
                    </button>
                    <button 
                      onClick={() => { setSortOrder('updated_desc'); setShowSortDropdown(false); }}
                      className={`w-full text-left px-3 py-1.5 hover:bg-black/5 transition-colors flex justify-between items-center ${sortOrder === 'updated_desc' ? 'text-blue-600 bg-blue-50/50' : ''}`}
                    >
                      <span>最新更新优先</span>
                      {sortOrder === 'updated_desc' && <Check className="w-3.5 h-3.5" />}
                    </button>
                    <button 
                      onClick={() => { setSortOrder('updated_asc'); setShowSortDropdown(false); }}
                      className={`w-full text-left px-3 py-1.5 hover:bg-black/5 transition-colors flex justify-between items-center ${sortOrder === 'updated_asc' ? 'text-blue-600 bg-blue-50/50' : ''}`}
                    >
                      <span>最早更新优先</span>
                      {sortOrder === 'updated_asc' && <Check className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="w-px h-3.5 bg-gray-300 mx-1"></div>
            <button className="flex items-center px-2 py-1 text-xs font-medium text-gray-400 hover:text-gray-600 hover:bg-black/5 rounded transition-all">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              添加筛选
            </button>
            
            <div className="flex-1"></div>
            
            {(matchedRepos.length > 0 || matchedSkills.length > 0 || matchedPrompts.length > 0) && (
              <div className="flex items-center space-x-2 text-xs">
                <span className="text-[var(--color-muted)] mr-1">
                  搜索结果 ({(matchedRepos.length + matchedSkills.length + matchedPrompts.length) > 999 ? '999+' : (matchedRepos.length + matchedSkills.length + matchedPrompts.length)})
                </span>
                {matchedRepos.length > 0 && (
                  <button 
                    onClick={() => document.getElementById('search-group-repos')?.scrollIntoView({ behavior: 'smooth' })}
                    className="px-2 py-1 rounded bg-black/5 hover:bg-black/10 text-[var(--foreground)] transition-colors"
                  >
                    技能
                  </button>
                )}
                {matchedSkills.length > 0 && (
                  <button 
                    onClick={() => document.getElementById('search-group-skills')?.scrollIntoView({ behavior: 'smooth' })}
                    className="px-2 py-1 rounded bg-black/5 hover:bg-black/10 text-[var(--foreground)] transition-colors"
                  >
                    子技能
                  </button>
                )}
                {matchedPrompts.length > 0 && (
                  <button 
                    onClick={() => document.getElementById('search-group-prompts')?.scrollIntoView({ behavior: 'smooth' })}
                    className="px-2 py-1 rounded bg-black/5 hover:bg-black/10 text-[var(--foreground)] transition-colors"
                  >
                    提示词
                  </button>
                )}
              </div>
            )}
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
              ) : matchedRepos.length === 0 && matchedSkills.length === 0 && matchedPrompts.length === 0 ? (
                <div className="px-6 py-12 text-center text-gray-500 text-sm flex items-center justify-center h-full">
                  未找到匹配项 "{query}"
                </div>
              ) : (
                <div className="p-2 space-y-4">
                  {matchedRepos.length > 0 && (
                    <div id="search-group-repos">
                      <h3 className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 sticky top-0 bg-white z-10 shadow-[0_4px_10px_-10px_rgba(0,0,0,0.1)]">
                        技能 ({matchedRepos.length})
                      </h3>
                      <div className="space-y-1">
                        {matchedRepos.map(repo => {
                          const isHovered = hoveredItem?.type === 'repo' && hoveredItem.repo.id === repo.id;
                          return (
                            <button
                              id={`search-item-repo-${repo.id}`}
                              key={`repo-${repo.id}`}
                              onMouseEnter={() => setHoveredItem({ type: 'repo', repo })}
                              onClick={() => {
                                onSelectRepo(repo.id);
                                onClose();
                              }}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-all text-left outline-none border-none ${isHovered ? 'bg-blue-50/60 ring-1 ring-blue-500/50 text-blue-900 shadow-sm' : 'hover:bg-black/5 text-gray-800'}`}
                            >
                              <div className="flex items-center space-x-3 truncate">
                                <div 
                                  className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                                    isHovered 
                                      ? 'bg-black/5 text-[var(--foreground)]' 
                                      : repo.source_type === 'online'
                                        ? 'bg-emerald-500/10 text-emerald-600'
                                        : repo.source_type === 'github' 
                                          ? 'bg-blue-50 text-blue-600' 
                                          : 'bg-gray-100 text-gray-500'
                                  }`}
                                >
                                  <Puzzle className="w-4 h-4 stroke-[2px]" />
                                </div>
                                <div>
                                  <div className="text-[13px] font-medium truncate">{repo.name}</div>
                                  <div className="text-[11px] mt-0.5 flex items-center text-[var(--color-muted)] min-w-0">
                                    <span className="truncate min-w-0">{repo.path.replace(/[/\\\\][^/\\\\]+$/, '')}</span>
                                  </div>
                                </div>
                              </div>
                              <span 
                                className={`flex items-center text-[10px] px-2 py-1 rounded-sm shrink-0 ml-3 font-medium transition-colors ${isHovered ? 'bg-white/60 text-gray-500' : 'bg-gray-50 text-gray-400'}`}
                              >
                                <Clock className="w-3 h-3 mr-1 opacity-50" />
                                {repo.updated_at ? formatDateTime(repo.updated_at) : ''}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {matchedSkills.length > 0 && (
                    <div id="search-group-skills">
                      <h3 className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky top-0 bg-white z-10 shadow-[0_4px_10px_-10px_rgba(0,0,0,0.1)] pt-2 mb-1">
                        子技能 ({matchedSkills.length})
                      </h3>
                      <div className="space-y-1">
                        {matchedSkills.map(({ skill, repo }) => {
                          const isHovered = hoveredItem?.type === 'skill' && hoveredItem.skill.id === skill.id;
                          return (
                            <button
                              id={`search-item-skill-${skill.id}`}
                              key={`skill-${skill.id}`}
                              onMouseEnter={() => setHoveredItem({ type: 'skill', skill, repo })}
                              onClick={() => {
                                onSelectSkill(skill, repo);
                                onClose();
                              }}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-all text-left outline-none border-none ${isHovered ? 'bg-blue-50/60 ring-1 ring-blue-500/50 text-blue-900 shadow-sm' : 'hover:bg-black/5 text-gray-800'}`}
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
                                  <div className={`text-[11px] mt-0.5 flex items-center space-x-1.5 text-[var(--color-muted)] min-w-0`}>
                                    <span className="shrink-0">{repo.name}</span>
                                    <span className={isHovered ? 'opacity-70' : 'opacity-50'}>/</span>
                                    <span className="truncate min-w-0">{skill.description || '无描述'}</span>
                                  </div>
                                </div>
                              </div>
                              <span 
                                className={`flex items-center text-[10px] px-2 py-1 rounded-sm shrink-0 ml-3 font-medium transition-colors ${isHovered ? 'bg-white/60 text-gray-500' : 'bg-gray-50 text-gray-400'}`}
                              >
                                <Clock className="w-3 h-3 mr-1 opacity-50" />
                                {skill.updated_at ? formatDateTime(skill.updated_at) : ''}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {matchedPrompts.length > 0 && (
                    <div id="search-group-prompts">
                      <h3 className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider sticky top-0 bg-white z-10 shadow-[0_4px_10px_-10px_rgba(0,0,0,0.1)] pt-2 mb-1">
                        提示词 ({matchedPrompts.length})
                      </h3>
                      <div className="space-y-1">
                        {matchedPrompts.map((prompt) => {
                          const isHovered = hoveredItem?.type === 'prompt' && hoveredItem.prompt.id === prompt.id;
                          return (
                            <button
                              id={`search-item-prompt-${prompt.id}`}
                              key={`prompt-${prompt.id}`}
                              onMouseEnter={() => setHoveredItem({ type: 'prompt', prompt })}
                              onClick={() => {
                                onSelectPrompt(prompt);
                                onClose();
                              }}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-all text-left outline-none border-none ${isHovered ? 'bg-purple-50/60 ring-1 ring-purple-500/50 text-purple-900 shadow-sm' : 'hover:bg-black/5 text-gray-800'}`}
                            >
                              <div className="flex items-center space-x-3 truncate">
                                <div 
                                  className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${isHovered ? 'bg-purple-100 text-purple-600' : 'bg-purple-50 text-purple-500'}`}
                                >
                                  <MessageSquareText className="w-4 h-4" />
                                </div>
                                <div className="truncate pr-3">
                                  <div className="text-[13px] font-medium truncate">
                                    {prompt.title}
                                  </div>
                                  <div className={`text-[11px] mt-0.5 flex items-center space-x-1.5 text-[var(--color-muted)] min-w-0`}>
                                    <span className="shrink-0">{prompt.group_name || '未分组'}</span>
                                    <span className={isHovered ? 'opacity-70' : 'opacity-50'}>/</span>
                                    <span className="truncate min-w-0">{prompt.content}</span>
                                  </div>
                                </div>
                              </div>
                              <span 
                                className={`flex items-center text-[10px] px-2 py-1 rounded-sm shrink-0 ml-3 font-medium transition-colors ${isHovered ? 'bg-white/60 text-gray-500' : 'bg-gray-50 text-gray-400'}`}
                              >
                                <Clock className="w-3 h-3 mr-1 opacity-50" />
                                {prompt.updated_at ? formatDateTime(prompt.updated_at) : ''}
                              </span>
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

                {hoveredItem.type === 'repo' && (
                  <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm w-full flex flex-col group relative">
                    <div className="flex items-center space-x-3 mb-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        hoveredItem.repo.source_type === 'online'
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : hoveredItem.repo.source_type === 'github'
                            ? 'bg-blue-50 text-blue-600'
                            : 'bg-gray-100 text-gray-500'
                      }`}>
                        <Puzzle className="w-5 h-5 stroke-[2px]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-gray-800 text-base truncate">{hoveredItem.repo.name}</h3>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center ${
                            hoveredItem.repo.source_type === 'online' ? 'bg-emerald-50 text-emerald-600' :
                            hoveredItem.repo.source_type === 'github' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {hoveredItem.repo.source_type === 'online' ? <Globe className="w-3 h-3 mr-1" /> :
                             hoveredItem.repo.source_type === 'github' ? <Globe className="w-3 h-3 mr-1" /> : <FolderOpen className="w-3 h-3 mr-1" />}
                            {hoveredItem.repo.source_type === 'online' ? '线上技能' :
                             hoveredItem.repo.source_type === 'github' ? 'Github' : '本地'}
                          </span>
                          <span className="text-[10px] text-gray-500 font-medium px-1.5 py-0.5 bg-gray-100 rounded">
                            {hoveredItem.repo.skills.length} 技能
                          </span>
                          {hoveredItem.repo.category === '正式技能' ? (
                            <span className="text-[10px] text-green-600 font-medium px-1.5 py-0.5 bg-green-50 rounded">正式技能</span>
                          ) : (
                            <span className="text-[10px] text-orange-600 font-medium px-1.5 py-0.5 bg-orange-50 rounded">其他</span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-3 text-sm text-gray-600 flex-1">
                      <div className="flex flex-col py-2 border-b border-gray-50">
                        <span className="text-gray-400 text-[10px] uppercase tracking-wider mb-1">描述</span>
                        {hoveredItem.repo.skills[0]?.description ? (
                          <SmartTooltipText 
                            text={hoveredItem.repo.skills[0].description} 
                            className="text-[11px] leading-relaxed text-[var(--color-muted)] line-clamp-4 cursor-default"
                          />
                        ) : (
                          <span className="text-[11px] leading-relaxed text-[var(--color-muted)]">暂无描述信息</span>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-gray-400 text-[10px] uppercase tracking-wider mb-1">路径</span>
                        <span className="break-all bg-gray-50 p-2 rounded text-[11px] font-mono text-[var(--color-muted)] block cursor-default">
                          {hoveredItem.repo.path.replace(/[/\\\\][^/\\\\]+$/, '')}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                      <div className="flex items-center space-x-1.5">
                        <Tooltip content="复制路径">
                          <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(hoveredItem.repo.path); showToast('路径已复制'); }} className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors">
                            <Copy className="w-4 h-4" />
                          </button>
                        </Tooltip>
                        <Tooltip content="刷新当前内容">
                          <button onClick={(e) => { 
                            e.stopPropagation(); 
                            if (hoveredItem.repo.source_dir_id) {
                              invoke('rescan_directory', { path: hoveredItem.repo.source_dir_id })
                                .then(() => showToast('已下发刷新指令，稍后可重开搜索面板查看最新内容'))
                                .catch((err) => { console.error(err); showToast('刷新失败'); });
                            } else {
                              showToast('无法刷新此目录');
                            }
                          }} className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors">
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        </Tooltip>
                        <Tooltip content="在文件管理器中打开">
                          <button onClick={(e) => { e.stopPropagation(); invoke('open_local_folder', { path: hoveredItem.repo.path }).catch(console.error); }} className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors">
                            <FolderOpen className="w-4 h-4" />
                          </button>
                        </Tooltip>
                        {hoveredItem.repo.source_type === 'github' && (
                          <Tooltip content="在浏览器中打开 GitHub">
                            <button onClick={(e) => { e.stopPropagation(); openUrl(`https://github.com/${hoveredItem.repo.name}`).catch(console.error); }} className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors">
                              <Globe className="w-4 h-4" />
                            </button>
                          </Tooltip>
                        )}
                        <Tooltip content="删除">
                          <button onClick={(e) => onDeleteRepo(e, hoveredItem.repo)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </Tooltip>
                      </div>
                      <kbd className="px-1.5 py-0.5 bg-gray-50 border border-gray-200 rounded text-[10px] text-gray-400 font-sans shadow-sm flex items-center">
                        ↵ Enter 打开
                      </kbd>
                    </div>
                  </div>
                )}
                {hoveredItem.type === 'skill' && (
                  <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm w-full flex flex-col">
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center shrink-0">
                        <HardDrive className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-gray-800 text-base truncate">{hoveredItem.skill.name}</h3>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center ${hoveredItem.repo.source_type === 'github' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                            {hoveredItem.repo.source_type === 'github' ? <Globe className="w-3 h-3 mr-1" /> : <FolderOpen className="w-3 h-3 mr-1" />}
                            {hoveredItem.repo.source_type === 'github' ? 'Github' : 'Local'}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-3 text-sm text-gray-600 flex-1">
                      <div className="flex flex-col">
                        <span className="text-gray-400 text-[10px] uppercase tracking-wider mb-1">所属技能</span>
                        <span className="font-medium text-[12px] flex items-center">
                          <FolderGit2 className="w-3.5 h-3.5 mr-1.5 text-blue-500" />
                          {hoveredItem.repo.name}
                        </span>
                      </div>
                      <div className="flex flex-col py-2 border-t border-gray-50">
                        <span className="text-gray-400 text-[10px] uppercase tracking-wider mb-1">描述</span>
                        {hoveredItem.skill.description ? (
                          <SmartTooltipText 
                            text={hoveredItem.skill.description} 
                            className="text-[11px] leading-relaxed text-[var(--color-muted)] line-clamp-4 cursor-default"
                          />
                        ) : (
                          <span className="text-[11px] leading-relaxed text-[var(--color-muted)]">暂无描述信息</span>
                        )}
                      </div>
                      <div className="flex flex-col py-2 border-t border-gray-50">
                        <span className="text-gray-400 text-[10px] uppercase tracking-wider mb-1">本地路径</span>
                        <span className="break-all bg-gray-50 p-2 rounded text-[11px] font-mono text-[var(--color-muted)] block cursor-default">
                          {hoveredItem.skill.local_path.replace(/[/\\\\][^/\\\\]+$/, '')}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                      <div className="flex items-center space-x-1.5">
                        <Tooltip content="复制路径">
                          <button onClick={(e) => onCopyPath(e, hoveredItem.skill)} className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors">
                            <Copy className="w-4 h-4" />
                          </button>
                        </Tooltip>
                        <Tooltip content="在文件管理器中打开">
                          <button onClick={(e) => { e.stopPropagation(); invoke('reveal_in_finder', { path: hoveredItem.skill.local_path }).catch(console.error); }} className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors">
                            <FolderOpen className="w-4 h-4" />
                          </button>
                        </Tooltip>
                      </div>
                      <kbd className="px-1.5 py-0.5 bg-gray-50 border border-gray-200 rounded text-[10px] text-gray-400 font-sans shadow-sm flex items-center">
                        ↵ Enter 打开
                      </kbd>
                    </div>
                  </div>
                )}
                {hoveredItem.type === 'prompt' && (
                  <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm w-full flex flex-col">
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                        <MessageSquareText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-gray-800 text-base truncate flex items-center gap-2">
                          {hoveredItem.prompt.title}
                          {hoveredItem.prompt.is_favorite && <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500 shrink-0" />}
                        </h3>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className="text-[10px] text-gray-500 font-medium px-1.5 py-0.5 bg-gray-100 rounded flex items-center">
                            <FolderOpen className="w-3 h-3 mr-1" />
                            {hoveredItem.prompt.group_name || '未分组'}
                          </span>
                          {hoveredItem.prompt.tags && hoveredItem.prompt.tags.split(',').map((tag, idx) => (
                            <span key={idx} className="text-[10px] text-blue-600 font-medium px-1.5 py-0.5 bg-blue-50 rounded flex items-center">
                              <Tag className="w-3 h-3 mr-1" />
                              {tag.trim()}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-3 text-sm text-gray-600 flex-1">
                      <div className="flex flex-col py-2 border-t border-gray-50">
                        <span className="text-gray-400 text-[10px] uppercase tracking-wider mb-2">内容预览</span>
                        <div className="bg-gray-50 p-2.5 rounded-lg text-[12px] leading-relaxed text-[var(--color-muted)] whitespace-pre-wrap line-clamp-6">
                          {hoveredItem.prompt.content}
                        </div>
                      </div>
                      {hoveredItem.prompt.variables && (() => {
                        try {
                          const vars = JSON.parse(hoveredItem.prompt.variables);
                          if (vars.length > 0) {
                            return (
                              <div className="flex flex-col py-2 border-t border-gray-50">
                                <span className="text-gray-400 text-[10px] uppercase tracking-wider mb-2">变量 ({vars.length})</span>
                                <div className="flex flex-wrap gap-1.5">
                                  {vars.map((v: any, idx: number) => (
                                    <span key={idx} className="text-[10px] font-mono px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                                      {v.name}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            );
                          }
                        } catch (e) {}
                        return null;
                      })()}
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                      <div className="flex items-center space-x-1.5">
                        <Tooltip content="复制内容">
                          <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(hoveredItem.prompt.content); showToast('内容已复制'); }} className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors">
                            <Copy className="w-4 h-4" />
                          </button>
                        </Tooltip>
                      </div>
                      <kbd className="px-1.5 py-0.5 bg-gray-50 border border-gray-200 rounded text-[10px] text-gray-400 font-sans shadow-sm flex items-center">
                        ↵ Enter 打开
                      </kbd>
                    </div>
                  </div>
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
