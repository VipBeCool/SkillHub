import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FolderGit2, HardDrive, X, Command, PanelRight, Filter, Type, Globe, Copy, FolderOpen, Trash2, RefreshCw, Clock, ArrowDownAZ, Check, MessageSquareQuote, Star, Tag, FileCode, Compass, Download, Loader2, Code2, AlertCircle, GitFork, Key, ExternalLink, Sparkles, ShieldCheck } from 'lucide-react';
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { showToast } from "../ui/Toast";
import { GroupedRepo, Skill, Prompt } from '../../types';
import { ResourceItem } from '../../types/resource';
import { Tooltip } from "../ui/Tooltip";
import { getGitHubToken, setGitHubToken } from '../../utils/githubToken';

// 模块级全局搜索缓存（10分钟有效期，大幅减少重复API调用）
interface GitHubCacheEntry {
  items: GitHubRepo[];
  totalCount: number;
  timestamp: number;
}
const GITHUB_SEARCH_CACHE = new Map<string, GitHubCacheEntry>();
const GITHUB_CACHE_TTL = 10 * 60 * 1000;


// 精美标准 Github SVG 图标
export const GithubIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  clone_url: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics?: string[];
  license?: { name: string; spdx_id?: string } | null;
  updated_at: string;
  pushed_at?: string;
  owner?: {
    login: string;
    avatar_url: string;
  };
}

export type SearchScope = 'local' | 'community' | 'github';

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

  // 资源社区与 GitHub 多域搜索增强
  allResources?: ResourceItem[];
  installedResourceNames?: Set<string>;
  onSelectResource?: (resource: ResourceItem) => void;
  onInstallSkill?: (resource: ResourceItem) => void;
  onInstallPrompt?: (resource: ResourceItem) => void;
  onInstallGitHub?: (repo: GitHubRepo) => void;
}

const formatDateTime = (dateStr: string) => {
  const d = new Date(dateStr);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const SmartTooltipText: React.FC<{ 
  text: string; 
  className?: string; 
  tooltipContent?: string;
  delay?: number;
}> = ({ text, className, tooltipContent, delay = 600 }) => {
  const textRef = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const timerRef = useRef<any>(null);

  useEffect(() => {
    const checkTruncation = () => {
      if (textRef.current) {
        setIsTruncated(textRef.current.scrollHeight > textRef.current.clientHeight || textRef.current.scrollWidth > textRef.current.clientWidth);
      }
    };
    
    checkTruncation();
    // Re-check on window resize
    window.addEventListener('resize', checkTruncation);
    return () => {
      window.removeEventListener('resize', checkTruncation);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [text]);

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const targetX = e.clientX;
    const targetY = e.clientY;
    // 鼠标必须悬停停留超过 delay（默认 600ms）才显示，避免划过时瞬间弹出打扰
    timerRef.current = setTimeout(() => {
      setMousePos({ x: targetX, y: targetY });
      setShowTooltip(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setShowTooltip(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!showTooltip) {
      setMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  return (
    <>
      <span 
        ref={textRef} 
        className={className}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
      >
        {text}
      </span>
      {isTruncated && showTooltip && createPortal(
        <div 
          style={{ 
            left: Math.min(mousePos.x, window.innerWidth - 360), 
            top: mousePos.y + 16 
          }}
          className="fixed z-[100] max-w-[340px] rounded-lg bg-black/90 backdrop-blur-md px-3 py-2 text-[12px] leading-relaxed font-normal text-white border border-white/10 shadow-xl pointer-events-none animate-in fade-in-0 zoom-in-95 duration-150 break-words"
        >
          {tooltipContent || text}
        </div>,
        document.body
      )}
    </>
  );
};

export type HoveredItem = 
  | { type: 'repo', repo: GroupedRepo }
  | { type: 'skill', skill: Skill, repo: GroupedRepo }
  | { type: 'prompt', prompt: Prompt }
  | { type: 'resource', resource: ResourceItem }
  | { type: 'github-repo', repo: GitHubRepo };

export const SearchModal: React.FC<SearchModalProps> = ({ 
  isOpen, onClose, repos, prompts,
  onSelectRepo, onSelectSkill, onSelectPrompt, onDeleteRepo, onCopyPath,
  allResources = [], installedResourceNames = new Set(), onSelectResource, onInstallSkill, onInstallPrompt, onInstallGitHub
}) => {
  const [query, setQuery] = useState('');
  const [hoveredItem, setHoveredItem] = useState<HoveredItem | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [showFilters, setShowFilters] = useState(true);
  
const SEARCH_SCOPE_STORAGE_KEY = 'skillhub_last_search_scope';

  // 搜索域状态: 'local' (默认我的资源) | 'community' (社区精选) | 'github' (Github)
  const [searchScope, setSearchScope] = useState<SearchScope>(() => {
    const saved = localStorage.getItem(SEARCH_SCOPE_STORAGE_KEY);
    if (saved === 'local' || saved === 'community' || saved === 'github') {
      return saved;
    }
    return 'local';
  });
  // 鼠标悬停在左侧书签标签上时的预览域（null 表示未悬停）
  const [hoveredScope, setHoveredScope] = useState<SearchScope | null>(null);
  // 点击后强制折叠收起的状态（支持在选中状态下再次点击缩回）
  const [forceCollapsedScope, setForceCollapsedScope] = useState<SearchScope | null>(null);
  
  // Logo 老虎机/赌博机 3D 机械翻轴状态
  const currentLogoScopeRef = useRef<SearchScope>(searchScope);
  const [logoDisplayScope, setLogoDisplayScope] = useState<SearchScope>(searchScope);
  const [isFlipping, setIsFlipping] = useState<boolean>(false);
  const [flipAnimKey, setFlipAnimKey] = useState<number>(0);
  const slotSpinTimerRef = useRef<any>(null);
  const slotSwapTimerRef = useRef<any>(null);

  // 本地库 Filters state
  const [filterNameOnly, setFilterNameOnly] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'repo' | 'skill' | 'prompt'>('all');
  const [filterSource, setFilterSource] = useState<'all' | 'github' | 'local'>('all');
  const [sortOrder, setSortOrder] = useState<'best_match' | 'updated_desc' | 'updated_asc'>('best_match');
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  // 资源社区 Filters state
  const [communityFilterType, setCommunityFilterType] = useState<'all' | 'skill' | 'prompt'>('all');
  const [communityFilterCategory, setCommunityFilterCategory] = useState<string>('all');
  const [communitySortOrder, setCommunitySortOrder] = useState<'best_match' | 'stars_desc'>('best_match');

  // GitHub 在线搜索状态与 Token 鉴权
  const [githubResults, setGithubResults] = useState<GitHubRepo[]>([]);
  const [githubTotalCount, setGithubTotalCount] = useState<number>(0);
  const [githubLoading, setGithubLoading] = useState<boolean>(false);
  const [githubLoadingMore, setGithubLoadingMore] = useState<boolean>(false);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [githubPage, setGithubPage] = useState<number>(1);
  const [githubSort, setGithubSort] = useState<'best_match' | 'stars' | 'updated'>('best_match');
  const [githubLanguage, setGithubLanguage] = useState<string>('all');
  const [githubToken, setGithubTokenState] = useState<string>(() => getGitHubToken());
  const [showTokenDialog, setShowTokenDialog] = useState<boolean>(false);
  const [tempTokenValue, setTempTokenValue] = useState<string>('');
  const [githubRateLimitResetSec, setGithubRateLimitResetSec] = useState<number | null>(null);
  const [isRateLimited, setIsRateLimited] = useState<boolean>(false);
  const githubSearchTimerRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 监听 GitHub Token 全局变更
  useEffect(() => {
    const handleTokenChange = () => {
      setGithubTokenState(getGitHubToken());
    };
    window.addEventListener('skillhub_github_token_changed', handleTokenChange);
    return () => window.removeEventListener('skillhub_github_token_changed', handleTokenChange);
  }, []);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const reposHeaderRef = useRef<HTMLHeadingElement>(null);
  const skillsHeaderRef = useRef<HTMLHeadingElement>(null);
  const promptsHeaderRef = useRef<HTMLHeadingElement>(null);
  const [stuckGroup, setStuckGroup] = useState<string | null>(null);

  // 键盘导航模式（屏蔽鼠标指针焦点冲突）
  const isKeyboardNavRef = useRef(false);
  const lastMousePosRef = useRef({ x: -1, y: -1 });
  const [isKeyboardNav, setIsKeyboardNav] = useState(false);

  // 搜索域配置
  const SCOPE_CONFIG: Record<SearchScope, { scope: SearchScope; icon: React.FC<{ className?: string }>; placeholder: string; label: string; shortcut: string }> = {
    local: { scope: 'local', icon: HardDrive, placeholder: '技能&提示词...', label: '我的资源', shortcut: '⌘1' },
    community: { scope: 'community', icon: Compass, placeholder: '社区资源...', label: '社区精选', shortcut: '⌘2' },
    github: { scope: 'github', icon: GithubIcon, placeholder: 'Github开源仓库...', label: 'Github', shortcut: '⌘3' },
  };
  const BOOKMARK_TABS = [SCOPE_CONFIG.local, SCOPE_CONFIG.community, SCOPE_CONFIG.github];

  // 触发 Logo 老虎机 3D 机械快速反转翻动
  const spinLogoTo = useCallback((targetScope: SearchScope) => {
    const prevCurrent = currentLogoScopeRef.current;
    if (targetScope === prevCurrent) return;
    currentLogoScopeRef.current = targetScope;

    if (slotSpinTimerRef.current) clearTimeout(slotSpinTimerRef.current);
    if (slotSwapTimerRef.current) clearTimeout(slotSwapTimerRef.current);

    setIsFlipping(true);
    setFlipAnimKey(prev => prev + 1);

    // 翻转到仰面 -360° 的中程点（190ms）时换为目标域图标，随下半程顺势翻转入位
    slotSwapTimerRef.current = setTimeout(() => {
      setLogoDisplayScope(targetScope);
    }, 190);

    // 420ms 翻转结束并弹簧卡位
    slotSpinTimerRef.current = setTimeout(() => {
      setIsFlipping(false);
    }, 420);
  }, []);

  // 鼠标移入左侧书签标签：更新预览占位符，恢复展开，并触发 Logo 老虎机翻滚
  const handleTabMouseEnter = useCallback((scope: SearchScope) => {
    setHoveredScope(scope);
    setForceCollapsedScope(null);
    spinLogoTo(scope);
  }, [spinLogoTo]);

  // 鼠标移出书签栏整体：恢复当前选中域占位符，清空折叠状态，并触发 Logo 翻滚复位
  const handleContainerMouseLeave = useCallback(() => {
    setHoveredScope(null);
    setForceCollapsedScope(null);
    spinLogoTo(searchScope);
  }, [searchScope, spinLogoTo]);

  // 点击书签按钮或快捷键确认切换（在已选中状态下再次点击即可折叠缩回去，支持 Toggle）
  const handleTabClick = useCallback((scope: SearchScope) => {
    setSearchScope(scope);
    localStorage.setItem(SEARCH_SCOPE_STORAGE_KEY, scope);
    setHoveredItem(null);
    inputRef.current?.focus();
    spinLogoTo(scope);

    // 点击后立即将当前书签收缩回去；再次点击可重新展开
    setForceCollapsedScope(prev => (prev === scope ? null : scope));
  }, [spinLogoTo]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (lastMousePosRef.current.x === -1) {
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    const dx = Math.abs(e.clientX - lastMousePosRef.current.x);
    const dy = Math.abs(e.clientY - lastMousePosRef.current.y);
    // 只有当鼠标产生真实的物理位移（大于 2px）时才解除键盘锁定，恢复鼠标焦点
    if (dx > 2 || dy > 2) {
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      if (isKeyboardNavRef.current) {
        isKeyboardNavRef.current = false;
        setIsKeyboardNav(false);
      }
    }
  };

  const handleListScroll = () => {
    if (!listScrollRef.current) return;
    const container = listScrollRef.current;
    
    // 只有当容器已经向下滚动（scrollTop > 4）时，才可能产生吸顶效果
    if (container.scrollTop <= 4) {
      if (stuckGroup !== null) setStuckGroup(null);
      return;
    }

    const containerTop = container.getBoundingClientRect().top;
    const groups: { id: string; el: HTMLHeadingElement | null }[] = [
      { id: 'repos', el: reposHeaderRef.current },
      { id: 'skills', el: skillsHeaderRef.current },
      { id: 'prompts', el: promptsHeaderRef.current },
    ];

    let currentStuck: string | null = null;
    for (const g of groups) {
      if (!g.el) continue;
      const rect = g.el.getBoundingClientRect();
      // 当标题顶部到达或紧贴容器顶部时（误差 2px 内）
      if (rect.top <= containerTop + 2) {
        currentStuck = g.id;
      }
    }

    if (stuckGroup !== currentStuck) {
      setStuckGroup(currentStuck);
    }
  };

  // 弹窗打开时的初始聚焦与持久化状态恢复（仅在 isOpen 由 false 变为 true 时触发一次，防止切换 Tab 时重复执行覆盖）
  const prevIsOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      const lastSearch = localStorage.getItem('skillhub_last_search') || '';
      setQuery(lastSearch);
      setHoveredItem(null);
      setStuckGroup(null);
      setHoveredScope(null);
      setForceCollapsedScope(null);

      // 读取并恢复上一次记忆的 Tab
      const savedScope = (localStorage.getItem(SEARCH_SCOPE_STORAGE_KEY) as SearchScope) || 'local';
      if (savedScope === 'local' || savedScope === 'community' || savedScope === 'github') {
        setSearchScope(savedScope);
        currentLogoScopeRef.current = savedScope;
        setLogoDisplayScope(savedScope);
      }

      setIsFlipping(false);
      setFlipAnimKey(0);
      setTimeout(() => inputRef.current?.select(), 100);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    localStorage.setItem('skillhub_last_search', query);
    setStuckGroup(null);
  }, [query]);

  // 全局 ⌘K（关闭）、⌘1, ⌘2, ⌘3 快捷键监听
  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key.toLowerCase() === 'k') {
          e.preventDefault();
          e.stopImmediatePropagation();
          e.stopPropagation();
          onClose();
          return;
        }
        // 输入法打字合成过程中屏蔽快捷键切换
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === '1') {
          e.preventDefault();
          handleTabClick('local');
        } else if (e.key === '2') {
          e.preventDefault();
          handleTabClick('community');
        } else if (e.key === '3') {
          e.preventDefault();
          handleTabClick('github');
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, handleTabClick, onClose]);

  // 本地库匹配计算
  const { matchedRepos, matchedSkills, matchedPrompts } = useMemo(() => {
    if (!query.trim()) return { matchedRepos: [], matchedSkills: [], matchedPrompts: [] };

    const lowerQuery = query.toLowerCase();
    
    // 单词边界与短词匹配检查
    const isWordMatch = (text?: string | null, q?: string) => {
      if (!text || !q) return false;
      const lower = text.toLowerCase();
      if (lower.startsWith(q)) return true;
      const words = lower.split(/[\s\-_\/\\:.]+/);
      if (words.some(w => w.startsWith(q))) return true;
      if (q.length > 2 && lower.includes(q)) return true;
      return false;
    };

    let matchedRepos = repos.filter(repo => {
      if (filterType === 'skill') return false;
      if (filterSource !== 'all' && repo.source_type !== filterSource) return false;

      const nameMatch = isWordMatch(repo.name, lowerQuery);
      if (filterNameOnly) return !!nameMatch;

      return !!nameMatch;
    });
    
    // 计算名称与关键词的相关度得分（标题精准 > 标题前缀 > 分词前缀 > 标题包含 > 仅描述命中）
    const getRelevanceScore = (name: string, q: string, hasDescOrContentMatch: boolean = false) => {
      const lower = (name || '').toLowerCase();
      if (lower === q) return 10000;
      if (lower.startsWith(q)) return 6000;
      const words = lower.split(/[\s\-_\/\\:.]+/);
      if (words.some(w => w.startsWith(q))) return 4500;
      if (q.length > 2) {
        const idx = lower.indexOf(q);
        if (idx !== -1) return Math.max(1200, 3000 - idx * 50);
      }
      return hasDescOrContentMatch ? 100 : 0;
    };
    
    matchedRepos.sort((a, b) => {
      const aName = (a.name || '').toLowerCase();
      const bName = (b.name || '').toLowerCase();
      if (sortOrder === 'best_match') {
        const scoreA = getRelevanceScore(aName, lowerQuery);
        const scoreB = getRelevanceScore(bName, lowerQuery);
        if (scoreA !== scoreB) return scoreB - scoreA;
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
          const nameMatch = isWordMatch(skill.name, lowerQuery);
          if (filterNameOnly) {
            if (nameMatch) matchedSkills.push({ skill, repo });
          } else {
            const descMatch = isWordMatch(skill.description, lowerQuery);
            if (nameMatch || descMatch) {
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
        const scoreA = getRelevanceScore(aName, lowerQuery, true);
        const scoreB = getRelevanceScore(bName, lowerQuery, true);
        if (scoreA !== scoreB) return scoreB - scoreA;
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
        const nameMatch = isWordMatch(p.title, lowerQuery);
        if (filterNameOnly) return !!nameMatch;
        return !!nameMatch || 
               isWordMatch(p.content, lowerQuery) ||
               isWordMatch(p.description, lowerQuery);
      });

      matchedPrompts.sort((a, b) => {
        const aName = (a.title || '').toLowerCase();
        const bName = (b.title || '').toLowerCase();
        if (sortOrder === 'best_match') {
          const scoreA = getRelevanceScore(aName, lowerQuery, true);
          const scoreB = getRelevanceScore(bName, lowerQuery, true);
          if (scoreA !== scoreB) return scoreB - scoreA;
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

  // 资源社区匹配计算
  const matchedCommunityResources = useMemo(() => {
    if (!allResources || allResources.length === 0) return [];
    let list = allResources;

    // 类型过滤
    if (communityFilterType !== 'all') {
      list = list.filter(r => r.type === communityFilterType);
    }

    // 分类过滤
    if (communityFilterCategory !== 'all') {
      list = list.filter(r => r.category === communityFilterCategory);
    }

    // 搜索关键词过滤
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(r =>
        r.displayName.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q)) ||
        (r.author && r.author.toLowerCase().includes(q)) ||
        r.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    // 排序
    if (communitySortOrder === 'stars_desc') {
      list = [...list].sort((a, b) => (b.stars || 0) - (a.stars || 0));
    }

    return list;
  }, [allResources, communityFilterType, communityFilterCategory, query, communitySortOrder]);

  // GitHub Rate Limit 频率限制恢复倒计时
  useEffect(() => {
    if (githubRateLimitResetSec === null || githubRateLimitResetSec <= 0) return;
    const interval = setInterval(() => {
      setGithubRateLimitResetSec(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          setIsRateLimited(false);
          if (query.trim() && searchScope === 'github') {
            fetchGitHubRepos(query, 1, false, true);
          }
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [githubRateLimitResetSec, query, searchScope]);

  // GitHub 在线搜索方法（集成内存缓存、Token 鉴权、RateLimit 解析）
  const fetchGitHubRepos = useCallback(async (searchQuery: string, page = 1, append = false, force = false) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setGithubResults([]);
      setGithubTotalCount(0);
      setGithubLoading(false);
      setGithubError(null);
      setIsRateLimited(false);
      return;
    }

    let q = trimmed;
    if (githubLanguage !== 'all') {
      q += ` language:${githubLanguage}`;
    }

    // 缓存匹配（仅针对非追加请求、且非强制刷新的请求）
    const cacheKey = `${q}__${githubSort}__${page}`;
    if (!force && !append && GITHUB_SEARCH_CACHE.has(cacheKey)) {
      const cached = GITHUB_SEARCH_CACHE.get(cacheKey)!;
      if (Date.now() - cached.timestamp < GITHUB_CACHE_TTL) {
        setGithubResults(cached.items);
        setGithubTotalCount(cached.totalCount);
        setGithubLoading(false);
        setGithubError(null);
        setIsRateLimited(false);
        setGithubPage(page);
        return;
      }
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (append) {
      setGithubLoadingMore(true);
    } else {
      setGithubLoading(true);
      setGithubError(null);
    }

    try {
      let url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&page=${page}&per_page=30`;
      if (githubSort === 'stars') {
        url += '&sort=stars&order=desc';
      } else if (githubSort === 'updated') {
        url += '&sort=updated&order=desc';
      }

      const currentToken = getGitHubToken();
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
      };
      if (currentToken) {
        headers['Authorization'] = `Bearer ${currentToken}`;
      }

      const res = await fetch(url, {
        signal: controller.signal,
        headers,
      });

      if (!res.ok) {
        if (res.status === 403 || res.status === 429) {
          setIsRateLimited(true);
          const resetHeader = res.headers.get('x-ratelimit-reset');
          let remainingSec = 60;
          if (resetHeader) {
            const resetTime = parseInt(resetHeader, 10) * 1000;
            remainingSec = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));
          }
          setGithubRateLimitResetSec(remainingSec);
          throw new Error('RATE_LIMITED');
        }
        throw new Error(`GitHub 接口响应异常 (HTTP ${res.status})`);
      }

      const data = await res.json();
      const items: GitHubRepo[] = data.items || [];

      if (append) {
        setGithubResults(prev => [...prev, ...items]);
      } else {
        setGithubResults(items);
        setGithubTotalCount(data.total_count || 0);
        GITHUB_SEARCH_CACHE.set(cacheKey, {
          items,
          totalCount: data.total_count || 0,
          timestamp: Date.now(),
        });
      }
      setGithubPage(page);
      setIsRateLimited(false);
      setGithubRateLimitResetSec(null);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('GitHub 搜索异常:', err);
      const msg = err.message || '';
      const isRate = msg === 'RATE_LIMITED' || msg.includes('403') || msg.includes('429') || msg.toLowerCase().includes('rate limit');
      if (isRate) {
        setIsRateLimited(true);
        setGithubError('GitHub API 请求过于频繁（Rate Limit 频率受限）');
      } else {
        const isNetworkFail = msg.includes('Failed to fetch') || msg.includes('NetworkError');
        setGithubError(isNetworkFail ? '网络连接失败，请检查网络连接或代理配置' : msg || '搜索 GitHub 仓库失败');
      }
      if (!append) {
        setGithubResults([]);
        setGithubTotalCount(0);
      }
    } finally {
      setGithubLoading(false);
      setGithubLoadingMore(false);
    }
  }, [githubLanguage, githubSort]);

  // 当处于 github 模式下时，防抖 600ms 触发搜索（减少频繁输入时的 API 消耗）
  useEffect(() => {
    if (searchScope !== 'github') return;

    if (githubSearchTimerRef.current) {
      clearTimeout(githubSearchTimerRef.current);
    }

    if (!query.trim()) {
      setGithubResults([]);
      setGithubTotalCount(0);
      setGithubLoading(false);
      setGithubError(null);
      setIsRateLimited(false);
      return;
    }

    githubSearchTimerRef.current = setTimeout(() => {
      fetchGitHubRepos(query, 1, false);
    }, 600);

    return () => {
      if (githubSearchTimerRef.current) clearTimeout(githubSearchTimerRef.current);
    };
  }, [query, searchScope, githubSort, githubLanguage, fetchGitHubRepos]);

  // 自动根据当前搜索域联动默认选中第一项
  useEffect(() => {
    if (searchScope === 'local') {
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
    } else if (searchScope === 'community') {
      if (matchedCommunityResources.length > 0) {
        setHoveredItem({ type: 'resource', resource: matchedCommunityResources[0] });
      } else {
        setHoveredItem(null);
      }
    } else if (searchScope === 'github') {
      if (githubResults.length > 0) {
        setHoveredItem({ type: 'github-repo', repo: githubResults[0] });
      } else {
        setHoveredItem(null);
      }
    }
  }, [searchScope, query, matchedRepos, matchedSkills, matchedPrompts, matchedCommunityResources, githubResults]);

  const handleOpenItem = (item: HoveredItem | null) => {
    if (!item) return;
    if (item.type === 'repo') {
      onSelectRepo(item.repo.id);
      onClose();
    } else if (item.type === 'skill') {
      onSelectSkill(item.skill, item.repo);
      onClose();
    } else if (item.type === 'prompt') {
      onSelectPrompt(item.prompt);
      onClose();
    } else if (item.type === 'resource') {
      if (onSelectResource) {
        onSelectResource(item.resource);
        onClose();
      } else if (item.resource.repoUrl) {
        openUrl(item.resource.repoUrl).catch(console.error);
      }
    } else if (item.type === 'github-repo') {
      if (onInstallGitHub) {
        onInstallGitHub(item.repo);
        onClose();
      } else {
        openUrl(item.repo.html_url).catch(console.error);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onMouseMove={handleMouseMove}
    >
      <div className="absolute inset-0 modal-backdrop transition-opacity" onClick={onClose} />
      
      {/* 整体容器 */}
      <div className="w-full max-w-[960px] flex flex-col relative animate-in fade-in zoom-in-95 duration-200">
        {/* 左侧抽屉式书签导航（长条形设计，右边缘紧密贴合防漏底，鼠标悬停平滑展开） */}
        <div 
          className="absolute right-full mr-[-1px] top-5 flex flex-col space-y-2.5 z-30 select-none"
          onMouseLeave={handleContainerMouseLeave}
        >
          {BOOKMARK_TABS.map((tab, idx) => {
            const TabIcon = tab.icon;
            const isActive = searchScope === tab.scope;
            const isExpanded = hoveredScope === tab.scope && forceCollapsedScope !== tab.scope;
            return (
              <div 
                key={tab.scope} 
                className="flex justify-end group animate-tab-pop-spring"
                style={{
                  animationDelay: `${100 + idx * 70}ms`,
                }}
              >
                <button
                  type="button"
                  onClick={() => handleTabClick(tab.scope)}
                  onMouseEnter={() => handleTabMouseEnter(tab.scope)}
                  className={`relative h-9 rounded-l-2xl border border-r-0 flex items-center px-2.5 cursor-pointer transition-all duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    isExpanded ? 'w-[104px]' : 'w-[48px]'
                  } overflow-hidden ${
                    isActive
                      ? 'bg-white dark:bg-[#2c2c2e] text-[var(--color-primary)] border-black/10 dark:border-white/10 shadow-sm font-semibold z-20'
                      : 'bg-white/90 dark:bg-[#202023]/90 hover:bg-white dark:hover:bg-[#2c2c2e] text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 border-black/5 dark:border-white/5 backdrop-blur-md shadow-xs z-10'
                  }`}
                >
                  {/* 激活状态指示竖条（紧贴按钮内侧左边缘，绝不会脱节漂移） */}
                  {isActive && (
                    <span className="absolute left-1 top-2.5 bottom-2.5 w-1 rounded-full bg-[var(--color-primary)] pointer-events-none" />
                  )}

                  {/* 默认常驻露出的 Logo */}
                  <div className="w-5 h-5 shrink-0 flex items-center justify-center ml-0.5">
                    <TabIcon className="w-4 h-4 text-current" />
                  </div>

                  {/* 悬停向左展开时显示的标题（受控于 isExpanded，点击缩回时立即淡出） */}
                  <div className={`ml-2 flex items-center flex-1 overflow-hidden whitespace-nowrap transition-opacity duration-150 ${
                    isExpanded ? 'opacity-100 delay-50' : 'opacity-0 pointer-events-none'
                  }`}>
                    <span className="text-xs font-medium whitespace-nowrap">{tab.label}</span>
                  </div>

                  {/* 右侧无缝延伸舌片：向右穿透 14px 深入主面板，彻底杜绝任何动画位移或边缘微隙漏底 */}
                  <div className="absolute -top-[1px] -bottom-[1px] -right-[14px] w-[16px] bg-inherit border-y border-inherit pointer-events-none" />
                </button>
              </div>
            );
          })}
        </div>

        {/* 主搜索面板 */}
        <div 
          className="modal-glass w-full rounded-2xl overflow-hidden flex flex-col max-h-[70vh] shadow-2xl relative z-10"
          onClick={e => e.stopPropagation()}
          onMouseDown={() => {
            if (isKeyboardNavRef.current) {
              isKeyboardNavRef.current = false;
              setIsKeyboardNav(false);
            }
          }}
        >
          {/* 搜索框行 */}
          <div className="flex items-center px-4 py-3 border-b border-black/5 shrink-0 bg-white/70">
            {/* 左侧动态图标（赌博机/老虎机 3D 机械滚筒大反转，带景深与弹簧咬合；点击安全聚焦输入框） */}
            <div 
              className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg mr-2 select-none relative overflow-hidden cursor-default"
              onClick={() => {
                inputRef.current?.focus();
              }}
            >
              {/* 老虎机凹槽立体反光与上下微弧阴影遮罩 */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/[0.08] via-transparent to-black/[0.08] dark:from-white/10 dark:via-transparent dark:to-white/10 z-20 rounded-lg" />

              {/* 3D 沿 X 轴翻滚容器（720度机械大反转） */}
              <div 
                key={flipAnimKey}
                className={`w-7 h-7 flex items-center justify-center ${isFlipping ? 'animate-slot-machine-flip' : ''}`}
                style={{ transformStyle: 'preserve-3d' }}
              >
                {React.createElement(SCOPE_CONFIG[logoDisplayScope].icon, {
                  className: "w-4.5 h-4.5 text-neutral-700 dark:text-neutral-200 shrink-0"
                })}
              </div>
            </div>

            {/* 输入框与联动即时占位符（无需动效，文本随 hover/active 即刻更新） */}
            <div className="relative flex-1 flex items-center min-w-0">
              <input
                ref={inputRef}
                type="text"
                className="w-full text-lg outline-none bg-transparent text-[var(--foreground)] relative z-10"
                value={query}
                onChange={e => {
                  setQuery(e.target.value);
                  localStorage.setItem('skillhub_last_search', e.target.value);
                }}
                onKeyDown={e => {
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    onClose();
                    return;
                  }
                  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                    e.preventDefault();
                    e.nativeEvent.stopImmediatePropagation();
                    e.stopPropagation();
                    onClose();
                    return;
                  }
                  if (e.key === 'Enter') {
                    if (hoveredItem) {
                      handleOpenItem(hoveredItem);
                    } else if (searchScope === 'github' && query.trim()) {
                      if (githubSearchTimerRef.current) clearTimeout(githubSearchTimerRef.current);
                      fetchGitHubRepos(query, 1, false, true);
                    }
                  }
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    isKeyboardNavRef.current = true;
                    setIsKeyboardNav(true);
                    
                    let allItems: HoveredItem[] = [];
                    if (searchScope === 'local') {
                      allItems = [
                        ...matchedRepos.map(repo => ({ type: 'repo' as const, repo })),
                        ...matchedSkills.map(s => ({ type: 'skill' as const, skill: s.skill, repo: s.repo })),
                        ...matchedPrompts.map(p => ({ type: 'prompt' as const, prompt: p }))
                      ];
                    } else if (searchScope === 'community') {
                      allItems = matchedCommunityResources.map(r => ({ type: 'resource' as const, resource: r }));
                    } else if (searchScope === 'github') {
                      allItems = githubResults.map(repo => ({ type: 'github-repo' as const, repo }));
                    }
                    
                    if (allItems.length === 0) return;
                    
                    const currentIndex = allItems.findIndex(item => {
                      if (!hoveredItem) return false;
                      if (item.type !== hoveredItem.type) return false;
                      if (item.type === 'repo' && hoveredItem.type === 'repo') return item.repo.id === hoveredItem.repo.id;
                      if (item.type === 'skill' && hoveredItem.type === 'skill') return item.skill.id === hoveredItem.skill.id;
                      if (item.type === 'prompt' && hoveredItem.type === 'prompt') return item.prompt.id === hoveredItem.prompt.id;
                      if (item.type === 'resource' && hoveredItem.type === 'resource') return item.resource.id === hoveredItem.resource.id;
                      if (item.type === 'github-repo' && hoveredItem.type === 'github-repo') return item.repo.id === hoveredItem.repo.id;
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
                      const container = listScrollRef.current;
                      if (!container) return;

                      if (nextIndex === 0) {
                        container.scrollTop = 0;
                        setStuckGroup(null);
                        return;
                      }

                      if (nextIndex === allItems.length - 1) {
                        container.scrollTop = container.scrollHeight;
                        return;
                      }

                      let id = '';
                      if (nextItem.type === 'repo') id = `search-item-repo-${nextItem.repo.id}`;
                      else if (nextItem.type === 'skill') id = `search-item-skill-${nextItem.skill.id}`;
                      else if (nextItem.type === 'prompt') id = `search-item-prompt-${nextItem.prompt.id}`;
                      else if (nextItem.type === 'resource') id = `search-item-resource-${nextItem.resource.id}`;
                      else if (nextItem.type === 'github-repo') id = `search-item-gh-${nextItem.repo.id}`;
                      
                      const el = document.getElementById(id);
                      if (el) {
                        const headerOffset = 38;
                        const elRect = el.getBoundingClientRect();
                        const containerRect = container.getBoundingClientRect();

                        if (elRect.top < containerRect.top + headerOffset) {
                          container.scrollTop -= (containerRect.top + headerOffset - elRect.top);
                        } else if (elRect.bottom > containerRect.bottom) {
                          container.scrollTop += (elRect.bottom - containerRect.bottom);
                        }
                      }
                    }, 0);
                  }
                }}
              />

              {/* 占位符提示（随 hover 预览即时切换，输入时透明） */}
              <div className={`absolute left-0 top-0 bottom-0 right-0 flex items-center pointer-events-none overflow-hidden select-none transition-opacity duration-150 ${query ? 'opacity-0' : 'opacity-100'}`}>
                <span className="text-lg text-neutral-400 dark:text-neutral-500 font-normal truncate">
                  {SCOPE_CONFIG[hoveredScope ?? searchScope].placeholder}
                </span>
              </div>
            </div>
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
                <button onClick={onClose} className="p-1 rounded-md text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors ml-2 cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* 动态筛选栏 UI */}
          {showFilters && (
            <div className="flex items-center px-4 py-1.5 border-b border-black/5 shrink-0 space-x-2 bg-[#fafafa]">
              {searchScope === 'local' ? (
                <>
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
                </>
              ) : searchScope === 'community' ? (
                <>
                  <button 
                    onClick={() => setCommunityFilterType(communityFilterType === 'all' ? 'skill' : communityFilterType === 'skill' ? 'prompt' : 'all')}
                    className={`flex items-center px-2 py-1 text-xs font-medium rounded transition-all hover:bg-black/5 ${communityFilterType !== 'all' ? 'bg-black/10 text-[var(--foreground)]' : 'text-[var(--color-muted)]'}`}
                  >
                    {communityFilterType === 'prompt' ? (
                      <MessageSquareQuote className="w-3.5 h-3.5 mr-1.5 opacity-70" />
                    ) : (
                      <FileCode className="w-3.5 h-3.5 mr-1.5 opacity-70" />
                    )}
                    {communityFilterType === 'all' ? '全部类型' : communityFilterType === 'skill' ? '仅技能' : '仅提示词'}
                  </button>
                  <button 
                    onClick={() => setCommunitySortOrder(communitySortOrder === 'best_match' ? 'stars_desc' : 'best_match')}
                    className={`flex items-center px-2 py-1 text-xs font-medium rounded transition-all hover:bg-black/5 ${communitySortOrder !== 'best_match' ? 'bg-black/10 text-[var(--foreground)]' : 'text-[var(--color-muted)]'}`}
                  >
                    <Star className="w-3.5 h-3.5 mr-1.5 opacity-70" />
                    {communitySortOrder === 'best_match' ? '默认匹配' : '最多星标优先'}
                  </button>

                  <div className="w-px h-3.5 bg-gray-200 mx-1"></div>

                  <div className="flex items-center space-x-1">
                    {[
                      { id: 'all', label: '全部' },
                      { id: 'workflow', label: '工作流' },
                      { id: 'coding', label: '开发' },
                      { id: 'productivity', label: '效率' },
                    ].map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => setCommunityFilterCategory(cat.id)}
                        className={`px-2 py-0.5 text-xs rounded transition-colors ${
                          communityFilterCategory === cat.id ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium' : 'text-gray-500 hover:bg-black/5'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex-1"></div>
                  <div className="text-xs text-[var(--color-muted)]">
                    社区精选 ({matchedCommunityResources.length})
                  </div>
                </>
              ) : (
                <>
                  {/* GitHub 域筛选 */}
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs text-gray-400 mr-1 flex items-center">
                      <Code2 className="w-3.5 h-3.5 mr-1" />
                      语言:
                    </span>
                    {['all', 'TypeScript', 'Python', 'Markdown', 'Shell'].map(lang => (
                      <button
                        key={lang}
                        onClick={() => setGithubLanguage(lang)}
                        className={`px-2 py-0.5 text-xs rounded transition-colors ${
                          githubLanguage === lang ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium' : 'text-gray-500 hover:bg-black/5'
                        }`}
                      >
                        {lang === 'all' ? '全部' : lang}
                      </button>
                    ))}
                  </div>

                  <div className="w-px h-3.5 bg-gray-200 mx-1"></div>

                  <button
                    onClick={() => setGithubSort(githubSort === 'best_match' ? 'stars' : githubSort === 'stars' ? 'updated' : 'best_match')}
                    className={`flex items-center px-2 py-1 text-xs font-medium rounded transition-all hover:bg-black/5 ${githubSort !== 'best_match' ? 'bg-black/10 text-[var(--foreground)]' : 'text-[var(--color-muted)]'}`}
                  >
                    <ArrowDownAZ className="w-3.5 h-3.5 mr-1.5 opacity-70" />
                    {githubSort === 'best_match' ? '最佳匹配' : githubSort === 'stars' ? '最多星标' : '最近更新'}
                  </button>

                  <div className="flex-1"></div>

                  <div className="flex items-center space-x-2 text-xs text-[var(--color-muted)]">
                    {githubLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 mr-1" />}
                    <span>{githubLoading ? '正在检索 GitHub...' : `共 ${githubTotalCount.toLocaleString()} 个仓库`}</span>
                    
                    <Tooltip content={githubToken ? "GitHub Token 已生效（额度 5000次/小时），点击修改" : "配置免费 GitHub Token 可解除 10次/分 的频率限制"}>
                      <button
                        type="button"
                        onClick={() => {
                          setTempTokenValue(githubToken);
                          setShowTokenDialog(true);
                        }}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                          githubToken
                            ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                            : 'bg-black/5 text-gray-500 hover:bg-black/10'
                        }`}
                      >
                        <Key className="w-3 h-3" />
                        <span>{githubToken ? 'Token 有效' : '配置 Token'}</span>
                      </button>
                    </Tooltip>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex-1 flex overflow-hidden">
            {/* 左侧列表 */}
            <div className={`${showPreview ? 'w-[60%] border-r' : 'w-full'} flex flex-col border-black/5 overflow-hidden transition-all duration-300 relative`}>
              
              {/* 本地搜索域吸顶条 */}
              {searchScope === 'local' && stuckGroup && (
                <div className="absolute top-0 left-0 right-0 z-20 bg-white/95 backdrop-blur-md px-4 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider border-b border-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.03)] pointer-events-none select-none animate-in fade-in duration-100">
                  {stuckGroup === 'repos' && `技能 (${matchedRepos.length})`}
                  {stuckGroup === 'skills' && `子技能 (${matchedSkills.length})`}
                  {stuckGroup === 'prompts' && `提示词 (${matchedPrompts.length})`}
                </div>
              )}

              <div ref={listScrollRef} onScroll={handleListScroll} className="flex-1 overflow-y-auto">
                {/* 1. 本地搜索域列表渲染 */}
                {searchScope === 'local' && (
                  !query.trim() ? (
                    <div className="px-6 py-12 text-center text-gray-400 text-sm flex flex-col items-center justify-center h-full">
                      <Command className="w-12 h-12 mb-4 opacity-20" />
                      <p>输入关键词搜索本地技能和提示词</p>
                    </div>
                  ) : matchedRepos.length === 0 && matchedSkills.length === 0 && matchedPrompts.length === 0 ? (
                    <div className="px-6 py-12 text-center text-gray-500 text-sm flex items-center justify-center h-full">
                      本地未找到匹配项 "{query}"
                    </div>
                  ) : (
                    <div className="space-y-3 pb-3">
                      {matchedRepos.length > 0 && (
                        <div id="search-group-repos">
                          <h3 ref={reposHeaderRef} className="px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                            技能 ({matchedRepos.length})
                          </h3>
                          <div className="p-2 space-y-1">
                            {matchedRepos.map(repo => {
                              const isHovered = hoveredItem?.type === 'repo' && hoveredItem.repo.id === repo.id;
                              return (
                                <button
                                  id={`search-item-repo-${repo.id}`}
                                  key={`repo-${repo.id}`}
                                  onMouseEnter={() => {
                                    if (isKeyboardNavRef.current) return;
                                    setHoveredItem({ type: 'repo', repo });
                                  }}
                                  onClick={() => handleOpenItem({ type: 'repo', repo })}
                                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-all text-left outline-none border-none cursor-pointer ${
                                    isHovered 
                                      ? 'bg-blue-50/60 ring-1 ring-blue-500/50 text-blue-900 shadow-sm' 
                                      : isKeyboardNav 
                                        ? 'text-gray-800' 
                                        : 'hover:bg-black/5 text-gray-800'
                                  }`}
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
                                      <FileCode className="w-4 h-4 stroke-[2px]" />
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
                          <h3 ref={skillsHeaderRef} className="px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                            子技能 ({matchedSkills.length})
                          </h3>
                          <div className="p-2 space-y-1">
                            {matchedSkills.map(({ skill, repo }) => {
                              const isHovered = hoveredItem?.type === 'skill' && hoveredItem.skill.id === skill.id;
                              return (
                                <button
                                  id={`search-item-skill-${skill.id}`}
                                  key={`skill-${skill.id}`}
                                  onMouseEnter={() => {
                                    if (isKeyboardNavRef.current) return;
                                    setHoveredItem({ type: 'skill', skill, repo });
                                  }}
                                  onClick={() => handleOpenItem({ type: 'skill', skill, repo })}
                                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-all text-left outline-none border-none cursor-pointer ${
                                    isHovered 
                                      ? 'bg-blue-50/60 ring-1 ring-blue-500/50 text-blue-900 shadow-sm' 
                                      : isKeyboardNav 
                                        ? 'text-gray-800' 
                                        : 'hover:bg-black/5 text-gray-800'
                                  }`}
                                >
                                  <div className="flex items-center space-x-3 truncate">
                                    <div className="w-7 h-7 rounded-md bg-gray-100 text-gray-500 flex items-center justify-center shrink-0">
                                      <HardDrive className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <div className="text-[13px] font-medium truncate">{skill.name}</div>
                                      <div className="text-[11px] mt-0.5 flex items-center text-[var(--color-muted)] min-w-0">
                                        <span className="truncate min-w-0">{repo.name}</span>
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
                          <h3 ref={promptsHeaderRef} className="px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                            提示词 ({matchedPrompts.length})
                          </h3>
                          <div className="p-2 space-y-1">
                            {matchedPrompts.map(prompt => {
                              const isHovered = hoveredItem?.type === 'prompt' && hoveredItem.prompt.id === prompt.id;
                              return (
                                <button
                                  id={`search-item-prompt-${prompt.id}`}
                                  key={`prompt-${prompt.id}`}
                                  onMouseEnter={() => {
                                    if (isKeyboardNavRef.current) return;
                                    setHoveredItem({ type: 'prompt', prompt });
                                  }}
                                  onClick={() => handleOpenItem({ type: 'prompt', prompt })}
                                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-all text-left outline-none border-none cursor-pointer ${
                                    isHovered 
                                      ? 'bg-blue-50/60 ring-1 ring-blue-500/50 text-blue-900 shadow-sm' 
                                      : isKeyboardNav 
                                        ? 'text-gray-800' 
                                        : 'hover:bg-black/5 text-gray-800'
                                  }`}
                                >
                                  <div className="flex items-center space-x-3 truncate">
                                    <div className="w-7 h-7 rounded-md bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                                      <MessageSquareQuote className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <div className="text-[13px] font-medium truncate flex items-center gap-1.5">
                                        <span>{prompt.title}</span>
                                        {prompt.is_favorite && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 shrink-0" />}
                                      </div>
                                      <div className="text-[11px] mt-0.5 flex items-center text-[var(--color-muted)] min-w-0">
                                        <span className="truncate min-w-0">{prompt.group_name || '未分组'}</span>
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
                  )
                )}

                {/* 2. 资源社区搜索域列表渲染 */}
                {searchScope === 'community' && (
                  matchedCommunityResources.length === 0 ? (
                    <div className="px-6 py-12 text-center text-gray-500 text-sm flex flex-col items-center justify-center h-full">
                      <Compass className="w-12 h-12 mb-3 text-gray-300" />
                      <p>未找到匹配的社区资源 "{query}"</p>
                    </div>
                  ) : (
                    <div className="p-2 space-y-1">
                      {matchedCommunityResources.map(resource => {
                        const isHovered = hoveredItem?.type === 'resource' && hoveredItem.resource.id === resource.id;
                        const isInstalled = Boolean(
                          installedResourceNames.has(resource.name) || 
                          installedResourceNames.has(resource.id) ||
                          installedResourceNames.has(resource.displayName)
                        );
                        return (
                          <button
                            id={`search-item-resource-${resource.id}`}
                            key={`res-${resource.id}`}
                            onMouseEnter={() => {
                              if (isKeyboardNavRef.current) return;
                              setHoveredItem({ type: 'resource', resource });
                            }}
                            onClick={() => handleOpenItem({ type: 'resource', resource })}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all text-left outline-none border-none cursor-pointer ${
                              isHovered 
                                ? 'bg-blue-50/70 ring-1 ring-blue-500/50 text-blue-950 shadow-xs' 
                                : 'hover:bg-black/5 text-gray-800'
                            }`}
                          >
                            <div className="flex items-center space-x-3 truncate">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                resource.type === 'skill' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                              }`}>
                                {resource.type === 'skill' ? <FileCode className="w-4 h-4" /> : <MessageSquareQuote className="w-4 h-4" />}
                              </div>
                              <div className="min-w-0">
                                <div className="text-[13px] font-medium truncate flex items-center space-x-2">
                                  <span>{resource.displayName}</span>
                                  {isInstalled && (
                                    <span className="text-[10px] px-1.5 py-0.2 bg-emerald-50 text-emerald-600 border border-emerald-200/60 rounded font-normal shrink-0 flex items-center">
                                      <Check className="w-2.5 h-2.5 mr-0.5" /> 已安装
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-[var(--color-muted)] truncate max-w-[340px] mt-0.5">
                                  {resource.description || '暂无描述'}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2 shrink-0 ml-3">
                              {resource.stars && resource.stars > 0 && (
                                <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-medium flex items-center">
                                  <Star className="w-2.5 h-2.5 mr-1 fill-amber-500" />
                                  {resource.stars.toLocaleString()}
                                </span>
                              )}
                              <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded font-mono">
                                {resource.author || '官方'}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )
                )}

                {/* 3. GitHub 在线搜索域列表渲染 */}
                {searchScope === 'github' && (
                  githubError ? (
                    <div className="px-6 py-9 text-center text-gray-500 text-sm flex flex-col items-center justify-center h-full max-w-md mx-auto animate-in fade-in duration-200">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-3 text-amber-500 shadow-xs">
                        <AlertCircle className="w-6 h-6" />
                      </div>
                      <p className="font-semibold text-gray-800 text-base mb-1">
                        {isRateLimited ? 'GitHub API 请求过于频繁（Rate Limit 频率受限）' : githubError}
                      </p>
                      <p className="text-xs text-gray-500 leading-relaxed mb-3">
                        {isRateLimited ? (
                          githubToken ? (
                            '当前 Token 频率配额已用尽，请等待倒计时结束后重试，或更换其他 Token。'
                          ) : (
                            'GitHub 官方对未登录的匿名请求限制为每分钟 10 次。配置个人免费 Token 即可解除限制，独享 5,000 次/小时高频额度。'
                          )
                        ) : (
                          '请求未能成功完成，请检查网络连接或稍后重新搜索。'
                        )}
                      </p>

                      {/* 倒计时提示 */}
                      {isRateLimited && githubRateLimitResetSec !== null && githubRateLimitResetSec > 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200/60 text-amber-700 text-xs font-medium mb-3">
                          <Clock className="w-3.5 h-3.5 animate-pulse" />
                          <span>预计还需等待 {githubRateLimitResetSec} 秒后自动恢复</span>
                        </div>
                      )}

                      {/* 专属 Token 配置推荐引导卡片（未配置时常驻展示） */}
                      {!githubToken && (
                        <div 
                          onClick={() => {
                            setTempTokenValue(githubToken);
                            setShowTokenDialog(true);
                          }}
                          className="w-full bg-blue-50/80 hover:bg-blue-50 border border-blue-200/70 rounded-xl p-3 mb-4 text-left flex items-center justify-between gap-2.5 cursor-pointer transition-all hover:shadow-xs group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-blue-100 text-[var(--color-primary)] flex items-center justify-center shrink-0">
                              <Key className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-[12px] font-semibold text-blue-950 flex items-center gap-1.5">
                                <span>配置免费 GitHub Token</span>
                                <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded font-normal border border-emerald-200/50">无需任何权限</span>
                              </div>
                              <div className="text-[11px] text-blue-700/80 truncate mt-0.5">
                                解除每分钟 10 次限制，独享 5,000次/小时 独立额度
                              </div>
                            </div>
                          </div>
                          <span className="text-xs text-[var(--color-primary)] font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 shrink-0">
                            去配置 →
                          </span>
                        </div>
                      )}

                      {/* 核心操作按钮栏 */}
                      <div className="flex flex-wrap items-center justify-center gap-2 w-full">
                        {!githubToken ? (
                          <>
                            {/* 未配置 Token 时：原本的“重新搜索”主按钮直接换为【配置 Token（解除限制）】 */}
                            <button
                              type="button"
                              onClick={() => {
                                setTempTokenValue(githubToken);
                                setShowTokenDialog(true);
                              }}
                              className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] active:scale-95 text-white rounded-xl text-xs font-medium transition-all shadow-sm shadow-blue-500/20 flex items-center gap-1.5 cursor-pointer"
                            >
                              <Key className="w-3.5 h-3.5" />
                              <span>配置 Token（解除限制）</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => fetchGitHubRepos(query, 1, false, true)}
                              disabled={isRateLimited && (githubRateLimitResetSec || 0) > 0}
                              className="px-3.5 py-2 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40 text-gray-700 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                            >
                              重新搜索
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => fetchGitHubRepos(query, 1, false, true)}
                              disabled={isRateLimited && (githubRateLimitResetSec || 0) > 0}
                              className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] active:scale-95 text-white rounded-xl text-xs font-medium transition-all shadow-sm shadow-blue-500/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                            >
                              <span>重新搜索</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setTempTokenValue(githubToken);
                                setShowTokenDialog(true);
                              }}
                              className="px-3.5 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                            >
                              <Key className="w-3.5 h-3.5" />
                              <span>更新 Token</span>
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            openUrl(`https://github.com/search?q=${encodeURIComponent(query)}&type=repositories`).catch(console.error);
                          }}
                          className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>在 GitHub 网页查看</span>
                        </button>
                      </div>
                    </div>
                  ) : !query.trim() ? (
                    <div className="px-6 py-12 text-center text-gray-400 text-sm flex flex-col items-center justify-center h-full">
                      <GithubIcon className="w-12 h-12 mb-3 text-gray-300" />
                      <p className="font-medium text-gray-600 mb-1">在线搜索 GitHub 开源技能库</p>
                      <p className="text-xs text-gray-400 mb-4 max-w-md">
                        支持输入关键字或「作者/仓库名」，如 <span className="font-mono text-gray-600 bg-gray-100 px-1 py-0.5 rounded text-[11px]">VipBeCool/SkillHub</span>、<span className="font-mono text-gray-600 bg-gray-100 px-1 py-0.5 rounded text-[11px]">claude-skill</span>
                      </p>
                      <div className="flex flex-wrap gap-1.5 max-w-sm justify-center">
                        {['VipBeCool/SkillHub', 'anthropic-quickstarts', 'claude-skills', 'cursor-rules', 'prompts'].map(k => (
                          <button
                            key={k}
                            onClick={() => { setQuery(k); }}
                            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs transition-colors cursor-pointer"
                          >
                            {k}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : githubLoading && githubResults.length === 0 ? (
                    <div className="px-6 py-12 text-center text-gray-400 text-sm flex flex-col items-center justify-center h-full">
                      <Loader2 className="w-8 h-8 mb-3 animate-spin text-blue-500" />
                      <p>正在从 GitHub 检索相关仓库...</p>
                    </div>
                  ) : githubResults.length === 0 ? (
                    <div className="px-6 py-12 text-center text-gray-500 text-sm flex flex-col items-center justify-center h-full">
                      <GithubIcon className="w-12 h-12 mb-3 text-gray-300" />
                      <p>未在 GitHub 找到关于 "{query}" 的仓库</p>
                    </div>
                  ) : (
                    <div className="p-2 space-y-1">
                      {githubResults.map(repo => {
                        const isHovered = hoveredItem?.type === 'github-repo' && hoveredItem.repo.id === repo.id;
                        return (
                          <button
                            id={`search-item-gh-${repo.id}`}
                            key={`gh-${repo.id}`}
                            onMouseEnter={() => {
                              if (isKeyboardNavRef.current) return;
                              setHoveredItem({ type: 'github-repo', repo });
                            }}
                            onClick={() => handleOpenItem({ type: 'github-repo', repo })}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all text-left outline-none border-none cursor-pointer ${
                              isHovered 
                                ? 'bg-blue-50/70 ring-1 ring-blue-500/50 text-blue-950 shadow-xs' 
                                : 'hover:bg-black/5 text-gray-800'
                            }`}
                          >
                            <div className="flex items-center space-x-3 truncate">
                              <div className="w-8 h-8 rounded-lg bg-gray-900 text-white flex items-center justify-center shrink-0">
                                <GithubIcon className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-[13px] font-medium truncate flex items-center space-x-2">
                                  <span>{repo.full_name}</span>
                                </div>
                                <div className="text-[11px] text-[var(--color-muted)] truncate max-w-[340px] mt-0.5">
                                  {repo.description || '暂无描述信息'}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2.5 shrink-0 ml-3">
                              {repo.language && (
                                <span className="text-[10px] text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded font-medium">
                                  {repo.language}
                                </span>
                              )}
                              <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-medium flex items-center">
                                <Star className="w-2.5 h-2.5 mr-1 fill-amber-500" />
                                {repo.stargazers_count > 999 ? `${(repo.stargazers_count / 1000).toFixed(1)}k` : repo.stargazers_count}
                              </span>
                            </div>
                          </button>
                        );
                      })}

                      {/* 加载更多按钮 */}
                      {githubResults.length < githubTotalCount && (
                        <div 
                          className="pt-3 pb-2 text-center"
                          style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                        >
                          <button
                            type="button"
                            disabled={githubLoadingMore}
                            onClick={() => fetchGitHubRepos(query, githubPage + 1, true)}
                            style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                            className="px-4 py-1.5 text-xs text-blue-600 hover:text-blue-700 bg-blue-50/90 hover:bg-blue-100 rounded-lg transition-colors duration-150 font-medium disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center mx-auto space-x-1.5 min-h-[32px] select-none"
                          >
                            {githubLoadingMore ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 shrink-0" />
                                <span>正在检索更多仓库...</span>
                              </>
                            ) : (
                              <span>加载更多 GitHub 仓库 ({githubResults.length}/{githubTotalCount.toLocaleString()})</span>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
              
              {/* 底部快捷键条 */}
              <div className="bg-gray-50 px-4 py-2 border-t border-black/5 flex items-center justify-between text-[11px] text-gray-400 shrink-0">
                <div className="flex items-center space-x-3">
                  <div className="flex items-center">
                    <kbd className="px-1.5 py-0.5 rounded border border-gray-200 bg-white shadow-sm font-sans mr-1">↵</kbd>
                    <span>确认</span>
                  </div>
                  <div className="flex items-center">
                    <kbd className="px-1.5 py-0.5 rounded border border-gray-200 bg-white shadow-sm font-sans mr-1">ESC</kbd>
                    <span>关闭</span>
                  </div>
                  <div className="flex items-center">
                    <kbd className="px-1.5 py-0.5 rounded border border-gray-200 bg-white shadow-sm font-sans mr-1">↑↓</kbd>
                    <span>切换</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 text-[10px]">
                  <span className="hover:text-gray-700 cursor-pointer" onClick={() => handleTabClick('local')}>⌘1 我的资源</span>
                  <span>·</span>
                  <span className="hover:text-gray-700 cursor-pointer" onClick={() => handleTabClick('community')}>⌘2 社区精选</span>
                  <span>·</span>
                  <span className="hover:text-gray-700 cursor-pointer" onClick={() => handleTabClick('github')}>⌘3 Github</span>
                </div>
              </div>
            </div>

            {/* 右侧预览区 */}
            {showPreview && (
              <div className="w-[40%] bg-[#fcfcfc] overflow-y-auto p-6 relative flex flex-col items-center justify-center border-l border-white shadow-[-4px_0_24px_-12px_rgba(0,0,0,0.05)] z-10 transition-all duration-300">
                {hoveredItem ? (
                  <div className="w-full max-w-[320px] mx-auto animate-in fade-in slide-in-from-right-4 duration-200">
                    
                    {/* 1. 本地 Repo 预览 */}
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
                            <FileCode className="w-5 h-5 stroke-[2px]" />
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
                              <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(hoveredItem.repo.path); showToast('路径已复制'); }} className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors cursor-pointer">
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
                              }} className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors cursor-pointer">
                                <RefreshCw className="w-4 h-4" />
                              </button>
                            </Tooltip>
                            <Tooltip content="在文件管理器中打开">
                              <button onClick={(e) => { e.stopPropagation(); invoke('open_local_folder', { path: hoveredItem.repo.path }).catch(console.error); }} className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors cursor-pointer">
                                <FolderOpen className="w-4 h-4" />
                              </button>
                            </Tooltip>
                            {hoveredItem.repo.source_type === 'github' && (
                              <Tooltip content="在浏览器中打开 GitHub">
                                <button onClick={(e) => { e.stopPropagation(); openUrl(`https://github.com/${hoveredItem.repo.name}`).catch(console.error); }} className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors cursor-pointer">
                                  <GithubIcon className="w-4 h-4" />
                                </button>
                              </Tooltip>
                            )}
                            <Tooltip content="删除">
                              <button onClick={(e) => onDeleteRepo(e, hoveredItem.repo)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </Tooltip>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenItem(hoveredItem)}
                            className="px-2 py-1 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded text-[10px] text-gray-600 font-sans shadow-sm flex items-center transition-colors cursor-pointer"
                          >
                            ↵ Enter 打开
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 2. 本地 Skill 预览 */}
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
                              <button onClick={(e) => onCopyPath(e, hoveredItem.skill)} className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors cursor-pointer">
                                <Copy className="w-4 h-4" />
                              </button>
                            </Tooltip>
                            <Tooltip content="在文件管理器中打开">
                              <button onClick={(e) => { e.stopPropagation(); invoke('reveal_in_finder', { path: hoveredItem.skill.local_path }).catch(console.error); }} className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors cursor-pointer">
                                <FolderOpen className="w-4 h-4" />
                              </button>
                            </Tooltip>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenItem(hoveredItem)}
                            className="px-2 py-1 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded text-[10px] text-gray-600 font-sans shadow-sm flex items-center transition-colors cursor-pointer"
                          >
                            ↵ Enter 打开
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 3. 本地 Prompt 预览 */}
                    {hoveredItem.type === 'prompt' && (
                      <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm w-full flex flex-col">
                        <div className="flex items-center space-x-3 mb-4">
                          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                            <MessageSquareQuote className="w-5 h-5" />
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
                            <div 
                              className="bg-gray-50 p-2.5 rounded-lg text-[12px] leading-relaxed text-[var(--color-muted)] whitespace-pre-wrap max-h-[130px] overflow-hidden select-text"
                              style={{
                                WebkitMaskImage: 'linear-gradient(to bottom, black calc(100% - 30px), transparent 100%)',
                                maskImage: 'linear-gradient(to bottom, black calc(100% - 30px), transparent 100%)'
                              }}
                            >
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
                              <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(hoveredItem.prompt.content); showToast('内容已复制'); }} className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors cursor-pointer">
                                <Copy className="w-4 h-4" />
                              </button>
                            </Tooltip>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenItem(hoveredItem)}
                            className="px-2 py-1 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded text-[10px] text-gray-600 font-sans shadow-sm flex items-center transition-colors cursor-pointer"
                          >
                            ↵ Enter 打开
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 4. 资源社区预览卡片 */}
                    {hoveredItem.type === 'resource' && (() => {
                      const res = hoveredItem.resource;
                      const isInstalled = Boolean(
                        installedResourceNames.has(res.name) || 
                        installedResourceNames.has(res.id) ||
                        installedResourceNames.has(res.displayName)
                      );
                      return (
                        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm w-full flex flex-col">
                          <div className="flex items-center space-x-3 mb-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              res.type === 'skill' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                            }`}>
                              {res.type === 'skill' ? <FileCode className="w-5 h-5" /> : <MessageSquareQuote className="w-5 h-5" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="font-semibold text-gray-800 text-base truncate">{res.displayName}</h3>
                              <div className="flex items-center space-x-1.5 mt-1">
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                                  {res.type === 'skill' ? '技能' : '提示词'}
                                </span>
                                {isInstalled && (
                                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 flex items-center">
                                    <Check className="w-2.5 h-2.5 mr-0.5" /> 已安装
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3 text-sm text-gray-600 flex-1">
                            <div className="flex flex-col py-2 border-t border-gray-50">
                              <span className="text-gray-400 text-[10px] uppercase tracking-wider mb-1">简介</span>
                              <p className="text-[11px] leading-relaxed text-[var(--color-muted)] line-clamp-4">
                                {res.description || '暂无描述信息'}
                              </p>
                            </div>

                            <div className="flex items-center justify-between py-2 border-t border-gray-50 text-xs">
                              <span className="text-gray-400 text-[10px] uppercase tracking-wider">作者 / 来源</span>
                              <span className="font-medium text-gray-700">{res.author || 'SkillHub 社区'}</span>
                            </div>

                            {res.stars && res.stars > 0 && (
                              <div className="flex items-center justify-between py-2 border-t border-gray-50 text-xs">
                                <span className="text-gray-400 text-[10px] uppercase tracking-wider">GitHub Stars</span>
                                <span className="font-medium text-amber-600 flex items-center">
                                  <Star className="w-3 h-3 mr-1 fill-amber-500" />
                                  {res.stars.toLocaleString()}
                                </span>
                              </div>
                            )}

                            {res.tags && res.tags.length > 0 && (
                              <div className="py-2 border-t border-gray-50">
                                <span className="text-gray-400 text-[10px] uppercase tracking-wider block mb-1.5">标签</span>
                                <div className="flex flex-wrap gap-1">
                                  {res.tags.map((t, idx) => (
                                    <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50/70 text-blue-600">
                                      #{t}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between gap-2">
                            <div className="flex items-center space-x-1.5">
                              {res.repoUrl && (
                                <Tooltip content="在浏览器打开官方地址">
                                  <button
                                    onClick={() => openUrl(res.repoUrl!).catch(console.error)}
                                    className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
                                  >
                                    <Globe className="w-4 h-4" />
                                  </button>
                                </Tooltip>
                              )}
                            </div>

                            <div className="flex items-center space-x-1.5">
                              {!isInstalled ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (res.type === 'skill' && onInstallSkill) {
                                      onInstallSkill(res);
                                    } else if (res.type === 'prompt' && onInstallPrompt) {
                                      onInstallPrompt(res);
                                    }
                                  }}
                                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-medium shadow-sm flex items-center transition-colors cursor-pointer"
                                >
                                  <Download className="w-3.5 h-3.5 mr-1" />
                                  {res.type === 'skill' ? '安装技能' : '导入提示词'}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (onSelectResource) onSelectResource(res);
                                    onClose();
                                  }}
                                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium flex items-center transition-colors cursor-pointer"
                                >
                                  在商店中查看
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* 5. GitHub 仓库预览卡片 */}
                    {hoveredItem.type === 'github-repo' && (() => {
                      const repo = hoveredItem.repo;
                      return (
                        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm w-full flex flex-col">
                          <div className="flex items-center space-x-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-gray-900 text-white flex items-center justify-center shrink-0">
                              <GithubIcon className="w-5 h-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="font-semibold text-gray-800 text-sm truncate">{repo.full_name}</h3>
                              <div className="flex items-center space-x-2 mt-1">
                                {repo.owner && (
                                  <span className="text-[10px] text-gray-500 font-medium">
                                    @{repo.owner.login}
                                  </span>
                                )}
                                {repo.language && (
                                  <span className="text-[10px] px-1.5 py-0.2 bg-blue-50 text-blue-600 rounded font-medium">
                                    {repo.language}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3 text-sm text-gray-600 flex-1">
                            {/* 关键统计四宫格 */}
                            <div className="grid grid-cols-2 gap-2 p-2 bg-gray-50 rounded-lg">
                              <div className="flex flex-col">
                                <span className="text-[10px] text-gray-400 uppercase">Stars</span>
                                <span className="text-xs font-semibold text-gray-800 flex items-center mt-0.5">
                                  <Star className="w-3 h-3 mr-1 text-amber-500 fill-amber-500" />
                                  {repo.stargazers_count.toLocaleString()}
                                </span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[10px] text-gray-400 uppercase">Forks</span>
                                <span className="text-xs font-semibold text-gray-800 flex items-center mt-0.5">
                                  <GitFork className="w-3 h-3 mr-1 text-blue-500" />
                                  {repo.forks_count.toLocaleString()}
                                </span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[10px] text-gray-400 uppercase">License</span>
                                <span className="text-xs font-medium text-gray-700 truncate mt-0.5">
                                  {repo.license?.spdx_id || repo.license?.name || '无许可证'}
                                </span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[10px] text-gray-400 uppercase">最近更新</span>
                                <span className="text-xs font-medium text-gray-700 truncate mt-0.5">
                                  {repo.updated_at ? repo.updated_at.split('T')[0] : '未知'}
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-col py-2 border-t border-gray-50">
                              <span className="text-gray-400 text-[10px] uppercase tracking-wider mb-1">简介</span>
                              <p className="text-[11px] leading-relaxed text-[var(--color-muted)] line-clamp-4">
                                {repo.description || '该仓库暂无描述'}
                              </p>
                            </div>

                            {repo.topics && repo.topics.length > 0 && (
                              <div className="py-2 border-t border-gray-50">
                                <span className="text-gray-400 text-[10px] uppercase tracking-wider block mb-1.5">Topics 标签</span>
                                <div className="flex flex-wrap gap-1">
                                  {repo.topics.slice(0, 6).map((t, idx) => (
                                    <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                                      #{t}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between gap-2">
                            <div className="flex items-center space-x-1.5">
                              <Tooltip content="复制 Clone 链接">
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(repo.clone_url || repo.html_url);
                                    showToast('Git Clone 地址已复制');
                                  }}
                                  className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
                                >
                                  <Copy className="w-4 h-4" />
                                </button>
                              </Tooltip>
                              <Tooltip content="在浏览器打开 GitHub">
                                <button
                                  onClick={() => openUrl(repo.html_url).catch(console.error)}
                                  className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
                                >
                                  <GithubIcon className="w-4 h-4" />
                                </button>
                              </Tooltip>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleOpenItem({ type: 'github-repo', repo })}
                              className="px-2 py-1 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded text-[10px] text-gray-600 font-sans shadow-sm flex items-center transition-colors cursor-pointer"
                            >
                              ↵ Enter 克隆到技能库
                            </button>
                          </div>
                        </div>
                      );
                    })()}

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

      {/* GitHub Token 配置对话框 */}
      {showTokenDialog && (
        <div 
          className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setShowTokenDialog(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl border border-black/10 w-full max-w-md p-6 animate-in zoom-in-95 duration-150 relative"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setShowTokenDialog(false)}
              className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-700 hover:bg-black/5 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-[var(--color-primary)] flex items-center justify-center shrink-0">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">配置 GitHub Personal Token</h3>
                <p className="text-xs text-gray-500">解除 10次/分 限制，独享 5,000次/小时 额度</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  GitHub Token
                </label>
                <input
                  type="password"
                  placeholder="ghp_xxxx 或 github_pat_xxxx"
                  value={tempTokenValue}
                  onChange={e => setTempTokenValue(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-gray-200 rounded-lg outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 transition-all bg-gray-50/50"
                  autoFocus
                />
              </div>

              <div className="p-3.5 bg-blue-50/70 dark:bg-blue-950/20 rounded-xl border border-blue-200/60 dark:border-blue-800/40 text-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-blue-900 dark:text-blue-200 text-[12px]">
                    <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
                    <span>快速配置指南</span>
                  </div>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-200/60 flex items-center gap-0.5">
                    <ShieldCheck className="w-3 h-3" /> 本地存储
                  </span>
                </div>

                <div className="space-y-2 text-[11px] text-blue-900/90 dark:text-blue-200/90 pl-0.5 leading-relaxed">
                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-[var(--color-primary)] text-white text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>
                    <span>点击下方链接打开 GitHub 令牌创建页（已自动填好名称 Note）。</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-[var(--color-primary)] text-white text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>
                    <div>
                      <strong className="text-blue-950 dark:text-white">权限选项（Select scopes）：全部留空，一个都不要勾选！</strong>
                      <div className="text-[10px] text-blue-700/80 dark:text-blue-300/70 mt-0.5">
                        检索开源公开库仅需只读身份，全部不勾选最安全，绝不会访问你的私有仓库或个人信息。
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-[var(--color-primary)] text-white text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>
                    <span>
                      拉到页面最底部点击绿色按钮 <code className="bg-emerald-100/80 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 px-1 py-0.2 rounded font-mono font-medium">Generate token</code>，复制生成的 <code className="font-mono text-gray-700 dark:text-gray-200">ghp_xxxx</code> 贴到上方输入框即可。
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-blue-200/50 dark:border-blue-800/40 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      openUrl("https://github.com/settings/tokens/new?description=SkillHub-Search&scopes=").catch(console.error);
                    }}
                    className="text-[var(--color-primary)] hover:underline flex items-center gap-1 font-semibold text-xs cursor-pointer"
                  >
                    <span>生成Github Personal Token</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                {githubToken ? (
                  <button
                    type="button"
                    onClick={() => {
                      setGitHubToken('');
                      setTempTokenValue('');
                      setShowTokenDialog(false);
                      showToast('已清除 GitHub Token', 'info');
                      if (query.trim()) fetchGitHubRepos(query, 1, false, true);
                    }}
                    className="px-3 py-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  >
                    清除 Token
                  </button>
                ) : <div />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTokenDialog(false)}
                    className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const trimmed = tempTokenValue.trim();
                      setGitHubToken(trimmed);
                      setShowTokenDialog(false);
                      if (trimmed) {
                        showToast('GitHub Token 已保存，额度已提升至 5000次/小时', 'success');
                      }
                      if (query.trim()) {
                        fetchGitHubRepos(query, 1, false, true);
                      }
                    }}
                    className="px-4 py-1.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-medium rounded-lg shadow-sm transition-colors cursor-pointer"
                  >
                    保存并生效
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
