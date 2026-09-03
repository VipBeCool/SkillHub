import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FolderGit2, HardDrive, Edit2, Save, Loader2, Sparkles, Languages, Star } from "lucide-react";
import { Tooltip } from '../ui/Tooltip';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { showToast } from '../ui/Toast';
import { franc } from "franc-min";

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
    if (!displayedContent) {
      setHeadings([]);
      return;
    }
    // 移除代码块，防止将代码内的注释或内容当做标题
    const withoutCodeBlocks = displayedContent.replace(/```[\s\S]*?```/g, '').replace(/~~~[\s\S]*?~~~/g, '');
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
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [isTranslating, setIsTranslating] = useState(false);
  const [targetLang, setTargetLang] = useState("original");

  const displayedContent = targetLang === "original" 
    ? (content ? content.replace(/^\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/, '') : "") 
    : (translations[targetLang] || (content ? content.replace(/^\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/, '') : ""));


  useEffect(() => {
    if (content) {
      const cleanText = content.replace(/^\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
      const langCode = franc(cleanText);
      setDetectedLang(langCode);
      // setTargetLang("original"); // keep default targetLang to original
    } else {
      setDetectedLang("");
    }
  }, [content]);

  const handleTranslate = async () => {
    if (!content || targetLang === "original") return;
    setIsTranslating(true);
    try {
      const cleanText = content.replace(/^\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
      const res = await invoke<string>("translate_text", {
        text: cleanText,
        targetLang: targetLang
      });
      setTranslations(prev => ({ ...prev, [targetLang]: res }));
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
      <div className="flex items-center justify-between px-8 py-3.5 border-b border-[var(--color-border)] shrink-0 gap-4">
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${skill.source_type === 'github' ? 'bg-[#024ad8]/10 text-[#024ad8]' : 'bg-fuchsia-500/10 text-fuchsia-600'}`}>
            {skill.source_type === 'github' ? <FolderGit2 className="w-5 h-5" /> : <HardDrive className="w-5 h-5" />}
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-xl font-semibold text-[var(--foreground)] leading-none truncate">{skill.name}</h2>
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
              <Star className={`w-4 h-4 ${skill.is_favorite ? 'fill-current' : ''}`} />
            </button>
          </div>
        </div>
        <div className="flex items-center space-x-1.5 shrink-0">
          {/* 翻译工具小胶囊：移至顶栏右侧 */}
          {!isEditing && detectedLang && (
            <div className="flex items-center bg-black/5 hover:bg-black/[0.08] rounded-lg p-0.5 transition-colors mr-1">
              <Tooltip content={`文档源语言: ${detectedLang === 'cmn' ? '中文' : detectedLang === 'eng' ? '英文' : detectedLang}`}>
                <select
                  value={targetLang}
                  onChange={(e) => setTargetLang(e.target.value)}
                  className="h-7 pl-2 pr-1 text-[12px] bg-transparent border-none focus:outline-none text-[var(--foreground)] font-medium cursor-pointer"
                >
                  <option value="original">🌐 原文</option>
                  <option value="zh-CN">🇨🇳 中文</option>
                  <option value="en">🇺🇸 English</option>
                  <option value="ja">🇯🇵 日本語</option>
                  <option value="ko">🇰🇷 한국어</option>
                  <option value="fr">🇫🇷 Français</option>
                  <option value="es">🇪🇸 Español</option>
                  <option value="de">🇩🇪 Deutsch</option>
                  <option value="ru">🇷🇺 Русский</option>
                </select>
              </Tooltip>
              <div className="w-[1px] h-3.5 bg-black/10 mx-0.5" />
              <button
                onClick={handleTranslate}
                disabled={isTranslating || targetLang === "original"}
                title={targetLang === "original" ? "请先选择目标语言后点击翻译" : "翻译此文档"}
                className="w-7 h-7 rounded-md hover:bg-white flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--color-primary)] disabled:opacity-30 transition-all shadow-none hover:shadow-xs"
              >
                {isTranslating ? <Loader2 size={13} className="animate-spin" /> : <Languages size={13} />}
              </button>
            </div>
          )}

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

      <div className="flex-1 overflow-y-auto pt-6 px-10 pb-10 relative flex flex-col" ref={contentScrollRef} onScroll={handleScroll}>
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
                {displayedContent}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
