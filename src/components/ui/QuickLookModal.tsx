import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, FileText, FolderGit2, Loader2, Link as LinkIcon, Database } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Skill, GroupedRepo, Prompt } from '../../types';

interface SkillFile {
  name: string;
  content: string;
  absolute_path: string;
}

interface QuickLookModalProps {
  isOpen: boolean;
  onClose: () => void;
  previewType: 'skill' | 'repo' | 'prompt' | null;
  skill?: Skill;
  repo?: GroupedRepo;
  prompt?: Prompt;
  onOpenDetail: () => void;
  // If navigating using arrow keys when QuickLook is open
  onNavigate?: (direction: 'up' | 'down') => void;
}

export function QuickLookModal({
  isOpen,
  onClose,
  previewType,
  skill,
  repo,
  prompt,
  onOpenDetail,
  onNavigate
}: QuickLookModalProps) {
  const [loading, setLoading] = useState(false);
  const [skillFiles, setSkillFiles] = useState<SkillFile[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (previewType === 'skill' && skill) {
        if (skill.source_type === 'online') {
            setSkillFiles([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        setActiveFileIndex(0);
        invoke<SkillFile[]>('get_skill_files', { path: skill.local_path })
          .then(files => {
            if (files && files.length > 0) {
              setSkillFiles(files);
            } else {
              setError("未找到 SKILL.md 或相关文件");
              setSkillFiles([]);
            }
          })
          .catch(e => {
            setError(String(e));
            setSkillFiles([]);
          })
          .finally(() => setLoading(false));
      } else {
        setSkillFiles([]);
        setError(null);
        setLoading(false);
      }
    }
  }, [isOpen, previewType, skill?.id]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid intercepting if user is focused on an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        onOpenDetail();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.stopPropagation();
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            if (onNavigate) {
                e.preventDefault();
                onNavigate(e.key === 'ArrowUp' ? 'up' : 'down');
            }
        } else {
            // Switch tabs if there are multiple files
            if (skillFiles.length > 1) {
              e.preventDefault();
              setActiveFileIndex(prev => {
                if (e.key === 'ArrowLeft') {
                  return prev > 0 ? prev - 1 : skillFiles.length - 1;
                } else {
                  return prev < skillFiles.length - 1 ? prev + 1 : 0;
                }
              });
            }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isOpen, onClose, onOpenDetail, onNavigate, skillFiles.length]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/30 backdrop-blur-md transition-opacity duration-200" 
        onClick={onClose} 
      />
      
      <div 
        className="relative bg-white/95 dark:bg-[#1a1b1e]/95 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        style={{ width: '640px', height: '70vh', maxHeight: '800px' }}
        ref={containerRef}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
              {previewType === 'skill' ? <FileText className="w-4 h-4" /> : previewType === 'repo' ? <FolderGit2 className="w-4 h-4" /> : <Database className="w-4 h-4" />}
            </div>
            <div className="flex flex-col min-w-0">
              <h2 className="text-[15px] font-semibold text-[var(--foreground)] truncate">
                {previewType === 'skill' && skill?.name}
                {previewType === 'repo' && repo?.name}
                {previewType === 'prompt' && prompt?.title}
              </h2>
              <div className="flex items-center gap-2 text-[11px] text-[var(--color-muted)] mt-0.5">
                {previewType === 'skill' && (
                  <>
                    <span className="uppercase tracking-wider font-medium">{skill?.source_type}</span>
                    {skill?.category && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-[var(--color-muted)]/50" />
                        <span>{skill.category}</span>
                      </>
                    )}
                  </>
                )}
                {previewType === 'repo' && (
                  <>
                    <span className="uppercase tracking-wider font-medium">{repo?.source_type}</span>
                    <span className="w-1 h-1 rounded-full bg-[var(--color-muted)]/50" />
                    <span>{repo?.skills?.length || 0} Skills</span>
                  </>
                )}
                {previewType === 'prompt' && (
                  <>
                    <span className="uppercase tracking-wider font-medium">PROMPT</span>
                    {prompt?.group_name && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-[var(--color-muted)]/50" />
                        <span>{prompt.group_name}</span>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-[var(--color-muted)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-white dark:bg-transparent relative">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--color-muted)]">
              <Loader2 className="w-6 h-6 animate-spin mb-3 text-[var(--color-primary)]" />
              <span className="text-[13px]">加载中...</span>
            </div>
          ) : previewType === 'skill' && skill ? (
            error ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-12 h-12 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-3">
                    <X className="w-6 h-6" />
                  </div>
                  <h3 className="text-[14px] font-medium text-[var(--foreground)] mb-1">加载失败</h3>
                  <p className="text-[13px] text-[var(--color-muted)] max-w-[300px] mx-auto">{error}</p>
                </div>
              </div>
            ) : skillFiles.length > 0 ? (
              <article className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-semibold prose-a:text-[var(--color-primary)]">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                  {skillFiles[activeFileIndex]?.content || ''}
                </ReactMarkdown>
              </article>
            ) : (
              <div className="h-full flex items-center justify-center text-[13px] text-[var(--color-muted)]">
                {skill.source_type === 'online' ? (
                  <div className="text-center flex flex-col items-center">
                    <LinkIcon className="w-8 h-8 mb-3 opacity-50" />
                    <p>{skill.description || '无描述'}</p>
                    <a href={skill.online_url} target="_blank" rel="noreferrer" className="mt-4 text-[var(--color-primary)] hover:underline">
                      打开链接
                    </a>
                  </div>
                ) : (
                  "无内容"
                )}
              </div>
            )
          ) : previewType === 'repo' && repo ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-[400px] mx-auto">
              <div className="w-16 h-16 bg-[var(--color-primary)]/10 text-[var(--color-primary)] rounded-2xl flex items-center justify-center mb-5">
                <FolderGit2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">{repo.name}</h3>
              <p className="text-[13px] text-[var(--color-muted)] mb-6 truncate w-full" title={repo.path}>
                {repo.path}
              </p>
              
              <div className="grid grid-cols-2 gap-4 w-full">
                <div className="bg-black/5 dark:bg-white/5 rounded-xl p-4 flex flex-col items-center">
                  <span className="text-2xl font-bold text-[var(--foreground)] mb-1">{repo.skills?.length || 0}</span>
                  <span className="text-[11px] font-medium text-[var(--color-muted)] uppercase tracking-wider">技能数</span>
                </div>
                <div className="bg-black/5 dark:bg-white/5 rounded-xl p-4 flex flex-col items-center">
                  <span className="text-[13px] font-bold text-[var(--foreground)] mb-1 mt-1 truncate w-full">{repo.category || '未分类'}</span>
                  <span className="text-[11px] font-medium text-[var(--color-muted)] uppercase tracking-wider mt-1">分类</span>
                </div>
              </div>
            </div>
          ) : previewType === 'prompt' && prompt ? (
            <article className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-semibold prose-a:text-[var(--color-primary)]">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                {prompt.content || '*空内容*'}
              </ReactMarkdown>
            </article>
          ) : null}
        </div>

        {/* Footer */}
        <div className="shrink-0 bg-[#fafbfc] dark:bg-[#1f2023] border-t border-black/5 dark:border-white/5 px-5 py-3 flex items-center justify-between">
          <div className="flex flex-1">
            {previewType === 'skill' && skillFiles.length > 1 && (
              <div className="flex space-x-1 overflow-x-auto custom-scrollbar pb-1">
                {skillFiles.map((f, i) => (
                  <button
                    key={i}
                    onClick={(e) => { e.stopPropagation(); setActiveFileIndex(i); }}
                    className={`px-3 py-1.5 rounded-md text-[12px] font-medium whitespace-nowrap transition-colors ${
                      i === activeFileIndex 
                        ? 'bg-[var(--color-primary)] text-white shadow-sm' 
                        : 'text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)]'
                    }`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-2 shrink-0">
            <button 
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="px-4 py-1.5 rounded-lg text-[13px] font-medium text-[var(--color-muted)] hover:bg-black/5 transition-colors"
            >
              取消 (Esc/空格)
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onClose(); onOpenDetail(); }}
              className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-[var(--color-primary)] text-white shadow-sm hover:bg-[var(--color-primary-hover)] transition-colors"
            >
              打开详情 (Enter)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
