import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FolderGit2, HardDrive, Edit2, Save, Loader2, Sparkles, Languages, Star } from "lucide-react";
import { Tooltip } from '../ui/Tooltip';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { showToast } from '../ui/Toast';
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
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  // 动态自适应 textarea 高度（随内容输入自动撑开，确保全部内容完整展示，绝不截断）
  useEffect(() => {
    if (isEditing && editTextareaRef.current) {
      const el = editTextareaRef.current;
      const adjustHeight = () => {
        if (!el) return;
        // 关键核心：临时将 height 置 0，强制浏览器摆脱原有 height 和 minHeight 约束，精准测量真实 scrollHeight
        el.style.height = "0px";
        const targetH = Math.max(el.scrollHeight, 600);
        el.style.height = `${targetH}px`;
      };
      adjustHeight();
      const rafId = requestAnimationFrame(adjustHeight);
      const timer = setTimeout(adjustHeight, 80);
      return () => {
        cancelAnimationFrame(rafId);
        clearTimeout(timer);
      };
    }
  }, [editContent, isEditing]);

  // 翻译状态
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [isTranslating, setIsTranslating] = useState(false);
  const [targetLang, setTargetLang] = useState("original");

  // 切换技能或查看文件变更时，重置翻译状态为原文
  useEffect(() => {
    setTargetLang("original");
    setTranslations({});
  }, [skillId, activeFile]);

  const displayedContent = targetLang === "original" 
    ? (content ? content.replace(/^\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/, '') : "") 
    : (translations[targetLang] || (content ? content.replace(/^\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/, '') : ""));

  // TOC 状态
  const [headings, setHeadings] = useState<{ id: string, text: string, level: number }[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [isTocHovered, setIsTocHovered] = useState(false);

  // 基于 DOM 真实渲染提取标题，确保与页面 100% 对应，不论是原文还是多语言译文
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!contentScrollRef.current) return;
      const container = contentScrollRef.current;
      const elements = container.querySelectorAll<HTMLElement>('.prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6');
      const list: { id: string; text: string; level: number }[] = [];
      elements.forEach((el, index) => {
        const id = `toc-heading-${index}`;
        el.id = id;
        el.classList.add('scroll-mt-4');
        const level = parseInt(el.tagName.replace('H', ''), 10) || 2;
        list.push({
          id,
          text: el.innerText.trim(),
          level
        });
      });
      setHeadings(list);
    }, 60);
    return () => clearTimeout(timer);
  }, [displayedContent, activeFile, isEditing]);

  const isClickScrollingRef = useRef(false);

  // 处理滚动联动（触底感知与视口倒序匹配，解决页面底部标题无法选中的顽疾）
  const handleScroll = useCallback(() => {
    if (!contentScrollRef.current || headings.length === 0) return;
    if (isClickScrollingRef.current) return;
    
    const container = contentScrollRef.current;
    const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    
    // 1. 触底检测（距离最底部小于 45px）
    if (scrollBottom < 45) {
      const containerRect = container.getBoundingClientRect();
      for (let i = headings.length - 1; i >= 0; i--) {
        const el = document.getElementById(headings[i].id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top < containerRect.bottom - 30) {
            setActiveId(headings[i].id);
            return;
          }
        }
      }
      setActiveId(headings[headings.length - 1].id);
      return;
    }

    // 2. 常规顶部阈值检测
    const containerTop = container.getBoundingClientRect().top;
    const threshold = containerTop + 90;
    
    let currentActive = headings[0].id;
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



  // 智能推导推荐目标语言（严谨计算字符占比，彻底杜绝混排文本误判）
  const suggestedTarget = useMemo(() => {
    const cleanText = content ? content.replace(/^\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/, '') : '';
    const chineseChars = cleanText.match(/[\u4e00-\u9fa5]/g) || [];
    const englishWords = cleanText.match(/[a-zA-Z]+/g) || [];
    
    // 中文字符数与英文单词数的相对权重
    const totalTokens = chineseChars.length + englishWords.length;
    
    // 只有当汉字数量在有效词元中占比达到 45% 以上，且总汉字数不少于 20 个时，才确认为中文文章
    const isChineseContent = totalTokens > 0 && (chineseChars.length / totalTokens) >= 0.45 && chineseChars.length >= 20;

    if (isChineseContent) {
      return { lang: 'en', label: 'English', flag: '🇺🇸', name: '英文' };
    } else {
      return { lang: 'zh-CN', label: '中文', flag: '🇨🇳', name: '中文' };
    }
  }, [content]);

  const handleTranslate = async (langToTranslate?: string) => {
    const lang = langToTranslate || targetLang;
    if (!content || lang === "original") return;
    if (translations[lang]) return; // 已有翻译缓存直接使用
    setIsTranslating(true);
    try {
      const cleanText = content.replace(/^\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
      const res = await invoke<string>("translate_text", {
        text: cleanText,
        targetLang: lang
      });
      setTranslations(prev => ({ ...prev, [lang]: res }));
    } catch (e) {
      showToast("翻译失败", "error");
      console.error(e);
    } finally {
      setIsTranslating(false);
    }
  };

  // 一键快捷翻译 / 切换原文
  const handleQuickTranslateToggle = async () => {
    if (isTranslating) return;
    if (targetLang !== "original") {
      // 当前在查看译文，一键切回原文
      setTargetLang("original");
    } else {
      // 当前在查看原文，一键翻译并切换为推荐目标语言
      const target = suggestedTarget.lang;
      setTargetLang(target);
      if (!translations[target]) {
        await handleTranslate(target);
      }
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
      showToast("保存成功", "success");
    } catch (e) {
      console.error(e);
      showToast(`保存失败: ${e}`, "error");
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
      <div className="h-12 px-6 border-b border-[var(--color-border)] shrink-0 flex items-center justify-between gap-3 bg-white">
        <div className="flex items-center space-x-2.5 min-w-0 flex-1">
          <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${skill.source_type === 'github' ? 'bg-[#024ad8]/10 text-[#024ad8]' : 'bg-fuchsia-500/10 text-fuchsia-600'}`}>
            {skill.source_type === 'github' ? <FolderGit2 className="w-4 h-4" /> : <HardDrive className="w-4 h-4" />}
          </div>
          <div className="flex items-center gap-1.5 min-w-0 py-0.5">
            <h2 className="text-[16px] font-semibold text-[var(--foreground)] leading-normal truncate">{skill.name}</h2>
            <button
              onClick={async () => {
                try {
                  await invoke("toggle_skill_favorite", { id: skill.id });
                  setSkill({ ...skill, is_favorite: !skill.is_favorite });
                } catch (e) {
                  showToast(`操作失败: ${e}`, "error");
                }
              }}
              className={`p-0.5 rounded-md transition-colors ${skill.is_favorite ? 'text-yellow-500' : 'text-[var(--color-muted)] hover:text-yellow-500 hover:bg-yellow-50'}`}
            >
              <Star className={`w-3.5 h-3.5 ${skill.is_favorite ? 'fill-current' : ''}`} />
            </button>
          </div>
        </div>
        <div className="flex items-center shrink-0 gap-1">
          {!isEditing ? (
            <>
              {/* 翻译工具小胶囊：智能语言识别与一键快捷翻译 */}
              {content && (
                <div className="flex items-center bg-black/5 hover:bg-black/[0.08] rounded-lg p-0.5 transition-colors mr-1.5">
                  <Tooltip content={targetLang === 'original' ? `源内容: ${suggestedTarget.lang === 'en' ? '中文' : '外文'}` : `当前显示: ${targetLang === 'zh-CN' ? '中文译文' : targetLang}`}>
                    <select
                      value={targetLang}
                      onChange={(e) => {
                        const newLang = e.target.value;
                        setTargetLang(newLang);
                        if (newLang !== "original") {
                          handleTranslate(newLang);
                        }
                      }}
                      className="h-6 pl-1.5 pr-0.5 text-[11.5px] bg-transparent border-none focus:outline-none text-[var(--foreground)] font-medium cursor-pointer"
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
                  
                  <div className="w-[1px] h-3 bg-black/10 mx-0.5" />
                  
                  <Tooltip content={
                    isTranslating 
                      ? "正在极速翻译中..." 
                      : targetLang !== "original"
                      ? "点击切回原文" 
                      : `一键翻译为${suggestedTarget.name} (${suggestedTarget.flag})`
                  }>
                    <button
                      onClick={handleQuickTranslateToggle}
                      disabled={isTranslating}
                      className={`h-6 px-2 rounded-md flex items-center gap-1 text-[11px] transition-all ${
                        targetLang !== "original"
                          ? 'bg-[var(--color-primary)] text-white shadow-xs font-semibold hover:bg-[var(--color-primary)]/90'
                          : 'bg-white text-[var(--color-primary)] shadow-xs font-medium hover:bg-white/90 hover:scale-105'
                      }`}
                    >
                      {isTranslating ? (
                        <Loader2 size={12} className="animate-spin text-current" />
                      ) : (
                        <Languages size={13} className="text-current" />
                      )}
                      <span>{targetLang !== "original" ? "原文" : "翻译"}</span>
                    </button>
                  </Tooltip>
                </div>
              )}

              <Tooltip content="智能引用提示词">
                <button
                  onClick={() => onGeneratePrompt?.(skill)}
                  disabled={!onGeneratePrompt}
                  className="p-1.5 rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)] transition-colors disabled:opacity-30"
                >
                  <Sparkles className="w-4 h-4" />
                </button>
              </Tooltip>
              <Tooltip content="编辑文档">
                <button 
                  onClick={() => {
                    setTargetLang("original");
                    setEditContent(content);
                    setIsEditing(true);
                  }} 
                  className="p-1.5 rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)] transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </Tooltip>
            </>
          ) : (
            <div className="flex items-center space-x-2">
              <button 
                onClick={() => {
                  setIsEditing(false);
                  setEditContent(content);
                }} 
                className="px-2.5 py-1 rounded-md text-[12px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-all cursor-pointer"
              >
                取消
              </button>
              <button 
                onClick={handleSave} 
                disabled={saving} 
                className="flex items-center space-x-1 bg-[var(--color-primary)] text-white px-2.5 py-1 rounded-md text-[12px] font-medium hover:bg-[var(--color-primary-hover)] shadow-sm shadow-blue-500/20 transition-all disabled:opacity-50 cursor-pointer"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>保存</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 内容展示区包裹容器：建立独立的定位上下文，严格位于顶栏红线下方 */}
      <div className="flex-1 relative min-h-0 flex flex-col overflow-hidden">
        {/* TOC 侧边导航指示器：下移至正文右侧舒适视野区，支持长章节多标题自适应 */}
        {headings.length > 0 && !isEditing && (
          <div className="absolute right-3 top-36 bottom-8 z-20 pointer-events-none flex flex-col justify-start items-end">
            <div 
              className="pointer-events-auto flex flex-col items-end max-h-full min-h-0"
              onMouseEnter={() => setIsTocHovered(true)}
              onMouseLeave={() => setIsTocHovered(false)}
            >
              <div className={`flex flex-col transition-all duration-200 max-h-full min-h-0 ${
                isTocHovered 
                  ? 'bg-white/95 backdrop-blur-md rounded-xl p-3.5 shadow-xl border border-[var(--color-border)] w-72 flex flex-col' 
                  : `w-9 py-2 px-1 items-end border border-transparent shadow-none bg-transparent overflow-y-auto no-scrollbar ${
                      headings.length > 60 ? 'gap-1' : headings.length > 35 ? 'gap-1.5' : 'gap-2.5'
                    }`
              }`}>
                {isTocHovered ? (
                   <div className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden space-y-0.5 custom-scrollbar pr-1">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2 px-1">
                        <span>大纲导航</span>
                        <span className="text-[10px] opacity-70 font-normal">{headings.length} 节</span>
                      </div>
                    {headings.map(h => (
                      <button
                        key={h.id}
                        onClick={() => {
                          setActiveId(h.id);
                          isClickScrollingRef.current = true;
                          const el = document.getElementById(h.id);
                          if (el && contentScrollRef.current) {
                            const container = contentScrollRef.current;
                            const topPos = el.offsetTop - 20;
                            container.scrollTo({ top: topPos, behavior: 'smooth' });
                          }
                          setTimeout(() => {
                            isClickScrollingRef.current = false;
                          }, 650);
                        }}
                        className={`w-full text-left truncate px-2 py-1.5 rounded-lg text-[12px] transition-colors ${activeId === h.id ? 'text-[var(--color-primary)] bg-[var(--color-primary)]/10 font-medium' : 'text-[var(--foreground)] hover:bg-black/5'}`}
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
                      title={h.text}
                      className={`h-[2px] rounded-full transition-all duration-200 ${
                        h.level === 1 
                          ? (activeId === h.id ? 'w-6' : 'w-5') 
                          : h.level === 2 
                          ? (activeId === h.id ? 'w-5' : 'w-4') 
                          : h.level === 3 
                          ? (activeId === h.id ? 'w-4' : 'w-3') 
                          : (activeId === h.id ? 'w-3.5' : 'w-2.5')
                      } ${activeId === h.id ? 'bg-[var(--color-primary)] shadow-[0_0_4px_rgba(2,74,216,0.35)]' : 'bg-gray-300 hover:bg-gray-400'}`}
                    />
                 ))
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto pt-4 pb-48 relative flex flex-col px-6 sm:px-8 xl:px-[100px]" ref={contentScrollRef} onScroll={handleScroll}>
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
          <div className="w-full flex flex-col animate-in fade-in duration-200 pb-32">
            <textarea 
              ref={editTextareaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full bg-transparent border-0 outline-none p-0 resize-none font-mono text-[14px] text-[var(--foreground)] leading-relaxed placeholder:text-[var(--color-muted)]/40 overflow-y-auto [field-sizing:content]"
              placeholder="在此编写您的 Markdown 文档..."
              style={{ minHeight: "600px" }}
            />
          </div>
        ) : (
          <div className="w-full">
            <div className="prose max-w-none prose-headings:text-left prose-a:text-[#024ad8] prose-p:leading-relaxed pb-12">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]} 
                rehypePlugins={[rehypeRaw]}
              >
                {displayedContent}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
);
}
