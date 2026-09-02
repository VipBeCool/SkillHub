import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FolderGit2, HardDrive, Edit2, Save, Loader2, Copy, Folder, Sparkles, Languages, FileText, List, Star } from "lucide-react";
import { Tooltip } from '../ui/Tooltip';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { showToast } from '../ui/Toast';
import { franc } from "franc-min";
import { formatTokens } from "../../utils";

const extractText = (children: any): string => {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(extractText).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return extractText(children.props.children);
  }
  return '';
};

const generateId = (text: string) => encodeURIComponent(text.trim().toLowerCase());

const HeadingRenderer = (level: number) => ({children, ...props}: any) => {
  const text = extractText(children);
  const id = generateId(text);
  const Tag = `h${level}` as any;
  return <Tag id={id} className="scroll-mt-4" {...props}>{children}</Tag>;
};

import { Skill } from "../../types";

interface SkillFile {
  name: string;
  content: string;
  absolute_path: string;
}

interface SkillDetailPageProps {
  skillId: string;
  onGeneratePrompt?: (skill: Skill) => void;
}

export function SkillDetailPage({ skillId, onGeneratePrompt }: SkillDetailPageProps) {
  const [skill, setSkill] = useState<Skill | null>(null);
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  const [files, setFiles] = useState<SkillFile[]>([]);
  const [activeFile, setActiveFile] = useState<string>("");
  const contentScrollRef = useRef<HTMLDivElement>(null);

  // TOC 状态
  const [headings, setHeadings] = useState<{ id: string, text: string, level: number }[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [isTocHovered, setIsTocHovered] = useState(false);

  // 解析 Markdown 提取标题
  useEffect(() => {
    if (!content) {
      setHeadings([]);
      return;
    }
    // 移除 frontmatter
    const cleanContent = content.replace(/^\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
    // 移除代码块，防止将代码内的注释或内容当做标题
    const withoutCodeBlocks = cleanContent.replace(/```[\s\S]*?```/g, '').replace(/~~~[\s\S]*?~~~/g, '');
    const regex = /^(#{1,6})\s+(.+)$/gm;
    let match;
    const newHeadings = [];
    const idCount: Record<string, number> = {};
    
    while ((match = regex.exec(withoutCodeBlocks)) !== null) {
      const text = match[2].trim();
      let id = generateId(text);
      if (idCount[id]) {
        idCount[id]++;
        id = `${id}-${idCount[id]}`;
      } else {
        idCount[id] = 1;
      }
      newHeadings.push({
        level: match[1].length,
        text,
        id
      });
    }
    setHeadings(newHeadings);
  }, [content]);

  // 处理滚动联动
  const handleScroll = useCallback(() => {
    if (!contentScrollRef.current || headings.length === 0) return;
    const container = contentScrollRef.current;
    const containerTop = container.getBoundingClientRect().top;
    const threshold = containerTop + 60;
    
    let currentActive = "";
    for (const h of headings) {
      const el = document.getElementById(h.id);
      if (el) {
        const top = el.getBoundingClientRect().top;
        if (top <= threshold) {
          currentActive = h.id;
        } else {
          break;
        }
      }
    }
    if (!currentActive && headings.length > 0) {
      currentActive = headings[0].id;
    }
    setActiveId(currentActive);
  }, [headings]);

  // 初始化或 headings 变动时，默认选中
  useEffect(() => {
    if (headings.length > 0) {
      setTimeout(() => {
        handleScroll();
      }, 50);
    }
  }, [headings, handleScroll]);

  // 加载 skill 基本信息
  useEffect(() => {
    if (!skillId) return;
    const fetchSkill = async () => {
      try {
        const skillsData = await invoke<Skill[]>("get_skills");
        const found = skillsData.find(s => s.id === skillId);
        if (found) {
          setSkill(found);
        }
      } catch (e) {
        console.error("Failed to load skill", e);
      }
    };
    fetchSkill();
  }, [skillId]);

  // 翻译状态
  const [detectedLang, setDetectedLang] = useState<string>("");
  const [translationText, setTranslationText] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [targetLang, setTargetLang] = useState("zh-CN");
  const [isTranslationVisible, setIsTranslationVisible] = useState(true);

  type SkillCapacity = {
    file_count: number;
    line_count: number;
    token_count: number;
    char_count: number;
    main_doc_file_count: number;
    main_doc_token_count: number;
    knowledge_file_count: number;
    knowledge_token_count: number;
    script_file_count: number;
    script_token_count: number;
  };
  const [capacity, setCapacity] = useState<SkillCapacity | null>(null);

  useEffect(() => {
    if (content) {
      const cleanText = content.replace(/^\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
      const langCode = franc(cleanText);
      setDetectedLang(langCode);
      setTranslationText("");
      setTargetLang(langCode === 'cmn' ? 'en' : 'zh-CN');
    } else {
      setDetectedLang("");
      setTranslationText("");
    }
  }, [content]);

  const handleTranslate = async () => {
    if (!content) return;
    setIsTranslating(true);
    try {
      const cleanText = content.replace(/^\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
      const res = await invoke<string>("translate_text", {
        text: cleanText,
        targetLang: targetLang
      });
      setTranslationText(res);
      setIsTranslationVisible(true);
    } catch (e) {
      showToast("翻译失败", "error");
      console.error(e);
    } finally {
      setIsTranslating(false);
    }
  };

  useEffect(() => {
    if (skill) {
      const loadContent = async () => {
        setLoading(true);
        setCapacity(null);
        try {
          if (skill.source_type === 'online') {
            setFiles([]);
            const url = skill.online_url || skill.local_path;
            setContent(`这是一个线上收藏的技能，未将任何文件下载到本地。\n\n请点击链接访问：\n[${url}](${url})`);
            setEditContent("");
          } else {
            const filesData = await invoke<SkillFile[]>("get_skill_files", { path: skill.local_path });
            setFiles(filesData);
            
            if (filesData.length > 0) {
              setActiveFile(filesData[0].name);
              setContent(filesData[0].content);
              setEditContent(filesData[0].content);
            } else {
              setContent("*未找到任何核心文档 (README.md, SKILL.md 等)*");
              setEditContent("");
            }
          }
        } catch (e) {
          console.error(e);
          setContent(`*加载内容失败： ${skill.name}*\n\n\`\`\`\n${e}\n\`\`\``);
        } finally {
          setLoading(false);
        }

        try {
          const capacityData = await invoke<SkillCapacity>("get_skill_token_count", { skillId: skill.id });
          setCapacity(capacityData);
        } catch (e) {
          console.error("Token count failed:", e);
          setCapacity(null);
        }
      };
      loadContent();
    }
  }, [skill]);

  const handleTabChange = (filename: string) => {
    setActiveFile(filename);
    const file = files.find(f => f.name === filename);
    const text = file ? file.content : "";
    setContent(text);
    setEditContent(text);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!skill) return;
    const activeFileData = files.find(f => f.name === activeFile);
    if (!activeFileData) return;
    
    setSaving(true);
    try {
      await invoke("save_skill_file_by_path", { absolutePath: activeFileData.absolute_path, content: editContent });
      setFiles(prev => prev.map(f => f.name === activeFile ? { ...f, content: editContent } : f));
      setContent(editContent);
      setIsEditing(false);
    } catch (e) {
      console.error(e);
      alert(`保存失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  if (!skill) {
    return (
      <div className="flex-1 flex items-center justify-center h-full bg-white">
        <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin opacity-50" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-white relative">
      <div className="flex items-start justify-between px-8 py-6 border-b border-[var(--color-border)] shrink-0 gap-4">
        <div className="flex items-start space-x-3 min-w-0 flex-1">
          <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${skill.source_type === 'github' ? 'bg-[#024ad8]/10 text-[#024ad8]' : 'bg-fuchsia-500/10 text-fuchsia-600'}`}>
            {skill.source_type === 'github' ? <FolderGit2 className="w-6 h-6" /> : <HardDrive className="w-6 h-6" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-2xl font-medium text-[var(--foreground)] leading-none truncate">{skill.name}</h2>
              <button
                onClick={async () => {
                  try {
                    await invoke("toggle_skill_favorite", { id: skill.id });
                    setSkill({ ...skill, is_favorite: !skill.is_favorite });
                  } catch (e) {
                    showToast(`操作失败: ${e}`, "error");
                  }
                }}
                className={`p-1 rounded-md transition-colors ${skill.is_favorite ? 'text-yellow-500' : 'text-[var(--color-muted)] hover:text-yellow-500 hover:bg-yellow-50'}`}
              >
                <Star className={`w-5 h-5 ${skill.is_favorite ? 'fill-current' : ''}`} />
              </button>
            </div>
            <div className="flex items-center space-x-1.5 mb-2">
              <Tooltip content={skill.local_path || ""} side="bottom">
                <p className="text-xs text-[var(--color-muted)] truncate max-w-[400px] cursor-default">{skill.local_path}</p>
              </Tooltip>
              {skill.local_path && (
                <div className="flex items-center space-x-1 shrink-0">
                  <Tooltip content="在本地打开">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await invoke("reveal_in_finder", { path: skill.local_path });
                        } catch (err) {
                          console.error("Failed to open folder:", err);
                        }
                      }}
                      className="p-1 rounded hover:bg-black/5 text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors"
                    >
                      <Folder size={14} />
                    </button>
                  </Tooltip>
                  <Tooltip content="复制路径">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(skill.local_path);
                        showToast("skill文件路径已复制到剪切板");
                        invoke('increment_skill_use_count', { id: skill.id });
                      }}
                      className="p-1 rounded hover:bg-black/5 text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors"
                    >
                      <Copy size={14} />
                    </button>
                  </Tooltip>
                </div>
              )}
            </div>
            
            {/* Capacity Display */}
            {capacity && (
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-[var(--color-border)]/50">
                <Tooltip
                  content={
                    <div className="flex flex-col gap-1.5 min-w-[200px]">
                      <div className="font-medium pb-1 border-b border-white/20">上下文占用</div>
                      <div className="flex justify-between items-center text-[11px]">
                        <span>主文档 ({capacity.main_doc_file_count} 个):</span>
                        <span>约 {formatTokens(capacity.main_doc_token_count)} Tokens</span>
                      </div>
                      {capacity.knowledge_file_count > 0 && (
                        <div className="flex justify-between items-center text-[11px]">
                          <span>知识库 ({capacity.knowledge_file_count} 个):</span>
                          <span>约 {formatTokens(capacity.knowledge_token_count)} Tokens</span>
                        </div>
                      )}
                      {capacity.script_file_count > 0 && (
                        <div className="flex justify-between items-center text-[11px]">
                          <span>配套脚本 ({capacity.script_file_count} 个):</span>
                          <span>约 {formatTokens(capacity.script_token_count)} Tokens</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-[11px] font-medium pt-1 border-t border-white/10 mt-1">
                        <span>总基础占用:</span>
                        <span>~{formatTokens(capacity.token_count)} Tokens</span>
                      </div>
                      <div className="text-[10px] opacity-70 mt-1 italic leading-relaxed">
                        * 仅统计当前目录及子目录下的文本实体<br />
                        * 无关依赖已自动过滤 (如 node_modules 等)
                      </div>
                    </div>
                  }
                >
                  <div className="flex flex-wrap items-center gap-2 cursor-help hover:opacity-80 transition-opacity">
                    <span className="text-xs font-medium text-[var(--foreground)] opacity-70 flex items-center">
                      <FileText className="w-3.5 h-3.5 mr-1" />
                      {capacity.file_count} 个文本文件
                    </span>
                    <span className="text-[10px] text-[var(--color-muted)]">•</span>
                    <span className="text-xs font-medium text-[var(--foreground)] opacity-70 flex items-center">
                      <List className="w-3.5 h-3.5 mr-1" />
                      {capacity.line_count.toLocaleString()} 行内容
                    </span>
                    <span className="text-[10px] text-[var(--color-muted)]">•</span>
                    <span className="text-[11px] font-medium text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded cursor-help">
                      ~{formatTokens(capacity.token_count)} Tokens
                    </span>
                  </div>
                </Tooltip>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-1 shrink-0 mt-0.5">
          <Tooltip content="智能引用提示词">
            <button
              onClick={() => onGeneratePrompt?.(skill)}
              disabled={!onGeneratePrompt}
              className="p-2 rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)] transition-colors disabled:opacity-30"
            >
              <Sparkles className="w-5 h-5" />
            </button>
          </Tooltip>
          {!isEditing && (
            <Tooltip content="编辑文档">
              <button onClick={() => setIsEditing(true)} className="p-2 rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)] transition-colors">
                <Edit2 className="w-5 h-5" />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* TOC 侧边导航指示器 (移出滚动容器以保持固定) */}
      {headings.length > 0 && !isEditing && (
        <div className="absolute right-2 top-[30%] -translate-y-1/2 z-20 pointer-events-none flex flex-col justify-start items-end pt-2">
          <div 
            className="pointer-events-auto flex flex-col items-end"
            onMouseEnter={() => setIsTocHovered(true)}
            onMouseLeave={() => setIsTocHovered(false)}
          >
            <div className={`flex flex-col transition-all duration-300 ${isTocHovered ? 'bg-white/90 backdrop-blur-md rounded-xl p-3 shadow-xl border border-[var(--color-border)] w-64' : 'w-8 py-2 items-end gap-[6px] border border-transparent shadow-none bg-transparent'}`}>
              {isTocHovered ? (
                 <div className="max-h-[60vh] w-full overflow-y-auto overflow-x-hidden space-y-0.5 custom-scrollbar">
                    <div className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2 px-1">大纲导航</div>
                    {headings.map(h => (
                      <button
                        key={h.id}
                        onClick={() => {
                          const el = document.getElementById(h.id);
                          if (el && contentScrollRef.current) {
                            const container = contentScrollRef.current;
                            const topPos = el.offsetTop - 20;
                            container.scrollTo({ top: topPos, behavior: 'smooth' });
                          }
                        }}
                        className={`w-full text-left truncate px-2 py-1.5 rounded-lg text-[12px] transition-colors ${activeId === h.id ? 'text-gray-700 bg-black/5 font-medium' : 'text-[var(--foreground)] hover:bg-black/5'}`}
                        style={{ paddingLeft: `${(h.level - 1) * 12 + 8}px` }}
                      >
                        {h.text}
                      </button>
                    ))}
                 </div>
              ) : (
                 headings.map(h => (
                    <div 
                      key={h.id} 
                      className={`h-[2px] rounded-full transition-all ${
                        h.level === 1 ? 'w-5' : h.level === 2 ? 'w-4' : h.level === 3 ? 'w-3' : 'w-2.5'
                      } ${activeId === h.id ? 'bg-gray-400' : 'bg-gray-200/60'}`}
                    />
                 ))
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-10 relative flex flex-col" ref={contentScrollRef} onScroll={handleScroll}>
        {(!loading && !isEditing && files.length > 1) && (
          <div className="mb-8 shrink-0 w-full overflow-hidden">
            <div className="flex space-x-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] w-full p-1 bg-black/5 rounded-lg border border-black/5">
              {files.map(f => (
                <button 
                  key={f.name}
                  onClick={() => handleTabChange(f.name)}
                  className={`px-3 py-1 text-[13px] transition-all rounded-md whitespace-nowrap outline-none ${
                    activeFile === f.name 
                      ? 'bg-white text-[var(--foreground)] font-medium border border-black/5 shadow-sm' 
                      : 'text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)]'
                  }`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin opacity-50" />
          </div>
        ) : isEditing ? (
          <div className="flex-1 flex flex-col h-full">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <span className="text-sm font-medium text-[var(--color-muted)]">编辑 {activeFile}</span>
              <div className="flex items-center space-x-2">
                <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 rounded-md text-[13px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-all">
                  取消
                </button>
                <button onClick={handleSave} disabled={saving} className="flex items-center px-3 py-1.5 bg-[var(--color-foreground)] text-white rounded-md text-[13px] font-medium hover:bg-black transition-all">
                  {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                  保存
                </button>
              </div>
            </div>
            <textarea 
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="flex-1 w-full p-5 bg-[var(--color-muted-bg)]/50 border border-[var(--color-border)] rounded-xl outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 resize-none font-mono text-[13px] text-[var(--foreground)] leading-relaxed shadow-inner"
              placeholder="在此编写您的 Markdown 文档..."
            />
          </div>
        ) : (
          <div className="max-w-4xl mx-auto w-full">
            {/* 翻译模块 */}
            {detectedLang && (
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[var(--color-border)]/50">
                <div className="flex items-center gap-1.5 text-[var(--color-muted)]">
                  <Languages className="w-4 h-4" />
                  <span className="text-xs font-medium">语言: {detectedLang === 'cmn' ? '中文' : detectedLang === 'eng' ? '英文' : detectedLang}</span>
                </div>
                
                <div className="flex items-center overflow-hidden bg-white border border-[var(--color-border)] rounded-lg shadow-sm">
                  <select
                    value={targetLang}
                    onChange={(e) => {
                      setTargetLang(e.target.value);
                      setTranslationText(""); // 切换语言时重置翻译
                    }}
                    className="h-[28px] pl-2 pr-6 text-[12px] bg-transparent border-none focus:outline-none text-gray-600 appearance-none cursor-pointer"
                  >
                    <option value="zh-CN">🇨🇳 中文</option>
                    <option value="en">🇺🇸 English</option>
                    <option value="ja">🇯🇵 日本語</option>
                    <option value="ko">🇰🇷 한국어</option>
                    <option value="fr">🇫🇷 Français</option>
                    <option value="es">🇪🇸 Español</option>
                    <option value="ru">🇷🇺 Русский</option>
                  </select>
                  <div className="w-[1px] h-4 bg-gray-200"></div>
                  <button
                    onClick={() => {
                      if (!translationText) {
                        handleTranslate();
                      } else {
                        setIsTranslationVisible(!isTranslationVisible);
                      }
                    }}
                    disabled={isTranslating}
                    title={translationText ? (isTranslationVisible ? "收起" : "展开") : "翻译此文档"}
                    className="px-3 h-[28px] bg-white hover:bg-gray-50 disabled:bg-gray-50 flex items-center justify-center text-gray-600 disabled:text-gray-400 hover:text-[var(--color-primary)] transition-colors"
                  >
                    {isTranslating ? <Loader2 size={14} className="animate-spin" /> : <Languages size={14} />}
                  </button>
                  {translationText && isTranslationVisible && (
                    <>
                      <div className="w-[1px] h-4 bg-gray-200"></div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(translationText);
                          showToast("翻译结果已复制到剪切板");
                        }}
                        title="复制翻译"
                        className="px-3 h-[28px] bg-white hover:bg-gray-50 flex items-center justify-center text-gray-600 hover:text-[var(--color-primary)] transition-colors"
                      >
                        <Copy size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
            
            {translationText && isTranslationVisible && (
              <div className="mb-6 bg-gray-50/50 rounded-xl p-6 border border-[var(--color-border)]">
                <div className="prose max-w-none prose-headings:text-left prose-a:text-[#024ad8] prose-p:leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                    {translationText}
                  </ReactMarkdown>
                </div>
              </div>
            )}
            
            <div className="prose max-w-none prose-headings:text-left prose-a:text-[#024ad8] prose-p:leading-relaxed pb-12">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]} 
                rehypePlugins={[rehypeRaw]}
                components={{
                  h1: HeadingRenderer(1),
                  h2: HeadingRenderer(2),
                  h3: HeadingRenderer(3),
                  h4: HeadingRenderer(4),
                  h5: HeadingRenderer(5),
                  h6: HeadingRenderer(6),
                }}
              >
                {content ? content.replace(/^\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/, '') : ""}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
