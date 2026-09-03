import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, Edit2, Save, X, FileText, Folder, Copy, Languages, Star, ChevronDown } from "lucide-react";
import { Tooltip } from '../ui/Tooltip';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { showToast } from '../ui/Toast';
import { Prompt, PromptGroup } from "../../types";



interface PromptDetailPageProps {
  promptId?: string; // 如果为空，表示新建
  isEditingInit?: boolean;
  onSaveSuccess?: () => void; // 传递给父组件，比如更新列表
  onCancelNew?: () => void;   // 如果新建取消，关闭标签页
}

export function PromptDetailPage({ promptId, isEditingInit = false, onSaveSuccess, onCancelNew }: PromptDetailPageProps) {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(isEditingInit || !promptId);
  const [saving, setSaving] = useState(false);
  
  // 翻译状态
  const [translating, setTranslating] = useState(false);
  const [targetLang, setTargetLang] = useState("original");
  const [translations, setTranslations] = useState<Record<string, string>>({});

  // 表单状态
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [groupId, setGroupId] = useState<string>("");
  const [tags, setTags] = useState("");
  
  // 分组和标签数据
  const [groups, setGroups] = useState<PromptGroup[]>([]);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const [tagInput, setTagInput] = useState("");
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);

  // TOC 状态
  const [headings, setHeadings] = useState<{ id: string, text: string, level: number }[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [isTocHovered, setIsTocHovered] = useState(false);

  const displayedContent = targetLang === "original" ? (prompt?.content || "") : (translations[targetLang] || prompt?.content || "");

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
  }, [displayedContent, isEditing, prompt?.title, title]);

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
      // 稍微延迟一下确保 DOM 已渲染并可用
      setTimeout(() => {
        handleScroll();
      }, 50);
    }
  }, [headings, handleScroll]);

  // 加载分组数据
  useEffect(() => {
    invoke<PromptGroup[]>("get_prompt_groups")
      .then(setGroups)
      .catch(e => console.error("Failed to load prompt groups", e));
    
    invoke<Prompt[]>("get_prompts", { groupId: null, search: null })
      .catch(console.error);
  }, []);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowGroupDropdown(false);
      }
    };
    if (showGroupDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showGroupDropdown]);

  // 加载 Prompt
  useEffect(() => {
    if (!promptId) {
      // 新建模式
      setPrompt(null);
      setTitle("");
      setContent("");
      setDescription("");
      setGroupId("");
      setTags("");
      setIsEditing(true);
      return;
    }

    const fetchPrompt = async () => {
      setLoading(true);
      try {
        const promptsData = await invoke<Prompt[]>("get_prompts", { groupId: null, search: null });
        const found = promptsData.find(p => p.id === promptId);
        if (found) {
          setPrompt(found);
          setTitle(found.title);
          setContent(found.content);
          setDescription(found.description || "");
          setGroupId(found.group_id || "");
          setTags(found.tags || "");
        }
      } catch (e) {
        showToast("加载提示词失败", "error");
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchPrompt();
  }, [promptId]);

  const tagList = tags.split(/[,，]/).map(t => t.trim()).filter(Boolean);
  
  const addTag = (newTag: string) => {
    if (!tagList.includes(newTag)) {
      setTags([...tagList, newTag].join(","));
    }
    setTagInput("");
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tagList.filter(t => t !== tagToRemove).join(","));
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt?.content || "");
      showToast("已复制到剪贴板", "success");
    } catch (err) {
      showToast("复制失败", "error");
    }
  };

  // 切换提示词时重置翻译状态
  useEffect(() => {
    setTargetLang("original");
    setTranslations({});
  }, [promptId]);

  // 智能推导推荐目标语言（严谨计算字符占比，彻底杜绝混排文本误判）
  const suggestedTarget = useMemo(() => {
    const rawText = prompt?.content || content || "";
    const chineseChars = rawText.match(/[\u4e00-\u9fa5]/g) || [];
    const englishWords = rawText.match(/[a-zA-Z]+/g) || [];
    
    const totalTokens = chineseChars.length + englishWords.length;
    const isChineseContent = totalTokens > 0 && (chineseChars.length / totalTokens) >= 0.45 && chineseChars.length >= 20;

    if (isChineseContent) {
      return { lang: 'en', label: 'English', flag: '🇺🇸', name: '英文' };
    } else {
      return { lang: 'zh-CN', label: '中文', flag: '🇨🇳', name: '中文' };
    }
  }, [prompt?.content, content]);

  const handleTranslate = async (langToTranslate?: string) => {
    const lang = langToTranslate || targetLang;
    const textToTranslate = prompt?.content || content;
    if (!textToTranslate || lang === "original") return;
    if (translations[lang]) return; // 已有翻译缓存直接使用
    setTranslating(true);
    try {
      const translated = await invoke<string>("translate_text", { text: textToTranslate, targetLang: lang });
      setTranslations(prev => ({ ...prev, [lang]: translated }));
      showToast("翻译完成", "success");
    } catch (e) {
      showToast("翻译失败", "error");
    } finally {
      setTranslating(false);
    }
  };

  // 一键快捷翻译 / 切换原文
  const handleQuickTranslateToggle = async () => {
    if (translating) return;
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

  const handleSave = async () => {
    if (!title.trim()) { showToast("请填写标题", "error"); return; }
    if (!content.trim()) { showToast("请填写内容", "error"); return; }
    
    setSaving(true);
    try {
      if (prompt) {
        // 更新
        await invoke("update_prompt", {
          id: prompt.id, title: title.trim(), content: content.trim(),
          description: description.trim() || null, groupId: groupId || null,
          tags: tags.trim() || null, variables: prompt.variables || null,
          changeNote: null,
        });
        showToast("已保存", "success");
        setIsEditing(false);
        // 更新本地 state
        setPrompt({
          ...prompt,
          title: title.trim(),
          content: content.trim(),
          description: description.trim(),
          group_id: groupId || undefined,
          tags: tags.trim() || undefined,
        });
        window.dispatchEvent(new CustomEvent('skillhub:prompt-tags-changed'));
      } else {
        // 新建
        await invoke("create_prompt", {
          title: title.trim(), content: content.trim(),
          description: description.trim() || null, groupId: groupId || null,
          tags: tags.trim() || null, variables: null,
        });
        showToast("已创建", "success");
        window.dispatchEvent(new CustomEvent('skillhub:prompt-tags-changed'));
        if (onSaveSuccess) onSaveSuccess();
      }
    } catch (e) {
      showToast(`保存失败: ${e}`, "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full bg-white">
        <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin opacity-50" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-white relative">
      {/* 顶部操作栏：与技能详情页完全统一的 h-12 紧凑栏 */}
      <div className="h-12 px-6 border-b border-[var(--color-border)] shrink-0 flex items-center justify-between gap-3 bg-white">
        <div className="flex items-center space-x-2.5 min-w-0 flex-1">
          <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-[#024ad8]/10 text-[#024ad8]">
            <FileText className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-1.5 min-w-0 py-0.5">
            <h2 className="text-[16px] font-semibold text-[var(--foreground)] leading-normal truncate">
              {title || prompt?.title || (isEditing ? (promptId ? "编辑提示词" : "新建提示词") : "提示词详情")}
            </h2>
            {prompt && (
              <button
                onClick={async () => {
                  try {
                    await invoke("toggle_prompt_favorite", { id: prompt.id });
                    setPrompt({ ...prompt, is_favorite: !prompt.is_favorite });
                  } catch (e) {
                    showToast(`操作失败: ${e}`, "error");
                  }
                }}
                className={`p-0.5 rounded-md transition-colors ${prompt.is_favorite ? 'text-yellow-500' : 'text-[var(--color-muted)] hover:text-yellow-500 hover:bg-yellow-50'}`}
              >
                <Star className={`w-3.5 h-3.5 ${prompt.is_favorite ? 'fill-current' : ''}`} />
              </button>
            )}
          </div>
        </div>
        
        <div className="flex items-center shrink-0 gap-1">
          {!isEditing ? (
            <>
              {/* 翻译工具小胶囊：智能语言识别与一键快捷翻译 */}
              {(prompt?.content || content) && (
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
                    translating 
                      ? "正在极速翻译中..." 
                      : targetLang !== "original"
                      ? "点击切回原文" 
                      : `一键翻译为${suggestedTarget.name} (${suggestedTarget.flag})`
                  }>
                    <button
                      onClick={handleQuickTranslateToggle}
                      disabled={translating}
                      className={`h-6 px-2 rounded-md flex items-center gap-1 text-[11px] transition-all ${
                        targetLang !== "original"
                          ? 'bg-[var(--color-primary)] text-white shadow-xs font-semibold hover:bg-[var(--color-primary)]/90'
                          : 'bg-white text-[var(--color-primary)] shadow-xs font-medium hover:bg-white/90 hover:scale-105'
                      }`}
                    >
                      {translating ? (
                        <Loader2 size={12} className="animate-spin text-current" />
                      ) : (
                        <Languages size={13} className="text-current" />
                      )}
                      <span>{targetLang !== "original" ? "原文" : "翻译"}</span>
                    </button>
                  </Tooltip>
                </div>
              )}

              <Tooltip content="复制提示词内容">
                <button 
                  onClick={handleCopy} 
                  className="p-1.5 rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)] transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </Tooltip>

              <Tooltip content="编辑提示词">
                <button 
                  onClick={() => setIsEditing(true)} 
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
                  if (!prompt) {
                    onCancelNew?.();
                  } else {
                    setIsEditing(false);
                    setTitle(prompt.title);
                    setContent(prompt.content);
                    setDescription(prompt.description || "");
                    setGroupId(prompt.group_id || "");
                    setTags(prompt.tags || "");
                  }
                }} 
                className="px-2.5 py-1 rounded-md text-[12px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-all"
              >
                取消
              </button>
              <button 
                onClick={handleSave} 
                disabled={saving} 
                className="flex items-center space-x-1 bg-[var(--color-primary)] text-white px-2.5 py-1 rounded-md text-[12px] font-medium hover:bg-[var(--color-primary-hover)] shadow-sm shadow-blue-500/20 transition-all disabled:opacity-50"
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

        {/* 滚动的正文区域 */}
        <div className="flex-1 overflow-y-auto pt-4 pb-48 relative flex flex-col px-6 sm:px-8 xl:px-[100px]" ref={contentScrollRef} onScroll={handleScroll}>
          {isEditing ? (
            <div className="w-full flex-1 flex flex-col h-full animate-in fade-in duration-200">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <span className="text-sm font-medium text-[var(--color-muted)]">
                  {prompt ? `编辑 ${prompt.title}` : "新建提示词"}
                </span>
              </div>

              <div className="space-y-3 mb-4 shrink-0">
                <div className="flex space-x-3">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="flex-1 px-3.5 py-2 bg-white border border-[var(--color-border)] rounded-lg text-[14px] text-[var(--foreground)] font-medium outline-none focus:border-[var(--color-primary)]/50 focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all placeholder:text-[var(--color-muted)]/60"
                    placeholder="提示词标题，例如：自然风格润色"
                  />
                  
                  <div className="w-48 relative" ref={dropdownRef}>
                    <button
                      type="button"
                      onClick={() => setShowGroupDropdown(!showGroupDropdown)}
                      className="w-full h-full flex items-center justify-between px-3 py-2 bg-white border border-[var(--color-border)] rounded-lg text-[13px] text-[var(--foreground)] outline-none hover:bg-black/[0.02] transition-colors"
                    >
                      <div className="flex items-center truncate mr-2">
                        <Folder className="w-4 h-4 text-[var(--color-muted)]/70 mr-1.5 shrink-0" />
                        <span className="truncate">{groupId ? groups.find(g => g.id === groupId)?.name || "未分组" : "未分组"}</span>
                      </div>
                      <ChevronDown className="w-3.5 h-3.5 text-[var(--color-muted)] shrink-0" />
                    </button>
                    {showGroupDropdown && (
                      <div className="absolute top-full right-0 mt-1 w-full bg-white border border-[var(--color-border)] rounded-xl shadow-lg z-50 py-1 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => { setGroupId(""); setShowGroupDropdown(false); }}
                          className={`w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-black/5 transition-colors ${!groupId ? "text-[var(--color-primary)] font-medium bg-[var(--color-primary)]/5" : "text-[var(--foreground)]"}`}
                        >
                          未分组
                        </button>
                        {groups.map(group => (
                          <button
                            key={group.id}
                            type="button"
                            onClick={() => { setGroupId(group.id); setShowGroupDropdown(false); }}
                            className={`w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-black/5 transition-colors truncate ${groupId === group.id ? "text-[var(--color-primary)] font-medium bg-[var(--color-primary)]/5" : "text-[var(--foreground)]"}`}
                          >
                            {group.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2 bg-white border border-[var(--color-border)] rounded-lg text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--color-primary)]/50 focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all placeholder:text-[var(--color-muted)]/60"
                  placeholder="一句话描述这个提示词的作用（可选）"
                />

                <div className="bg-gray-50/60 border border-[var(--color-border)] rounded-lg px-3 py-2">
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {tagList.map(t => (
                      <span 
                        key={t} 
                        className="group/tag h-6 inline-flex items-center text-[11.5px] px-2 rounded-md bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium border border-transparent box-border transition-all duration-150"
                      >
                        <span className="opacity-60 mr-0.5 select-none">#</span>
                        <span className="truncate max-w-[120px]">{t}</span>
                        <button 
                          type="button" 
                          onClick={() => removeTag(t)} 
                          className="w-0 opacity-0 group-hover/tag:w-3.5 group-hover/tag:opacity-100 group-hover/tag:ml-1 overflow-hidden inline-flex items-center justify-center text-[var(--color-primary)] hover:text-red-500 transition-all duration-150"
                          title={`删除标签 #${t}`}
                        >
                          <X className="w-3 h-3 shrink-0" />
                        </button>
                      </span>
                    ))}
                    <div className="flex items-center flex-1 min-w-[120px]">
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (tagInput.trim()) addTag(tagInput.trim());
                          }
                        }}
                        placeholder="输入标签按回车添加..."
                        className="w-full bg-transparent text-[12px] text-[var(--foreground)] outline-none placeholder:text-[var(--color-muted)]/60"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <textarea 
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="flex-1 w-full p-5 bg-[var(--color-muted-bg)]/50 border border-[var(--color-border)] rounded-xl outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 resize-none font-mono text-[13.5px] text-[var(--foreground)] leading-relaxed shadow-inner"
                placeholder="在此编写提示词 Markdown 内容..."
              />
            </div>
          ) : (
            <div className="w-full">
              {/* 大标题：像技能详情页一样展示标题（若正文开头未自带 # 标题） */}
              {(prompt?.title || title) && !displayedContent.trim().startsWith('# ') && (
                <h1 className="text-3xl font-bold tracking-tight text-[var(--foreground)] mb-6">
                  {prompt?.title || title}
                </h1>
              )}

              {/* 描述 */}
              {(prompt?.description || description) && (
                <p className="text-[15px] text-[var(--color-muted)] leading-relaxed mb-6">
                  {prompt?.description || description}
                </p>
              )}

              {/* 正文 Markdown 渲染 */}
              {displayedContent ? (
                <div className="prose max-w-none prose-headings:text-left prose-a:text-[#024ad8] prose-p:leading-relaxed pb-12">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    components={{
                      code({node, inline, className, children, ...props}: any) {
                        return !inline ? (
                          <div className="relative group/code mt-3 mb-5 bg-gray-50 rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <pre className="p-4 m-0 overflow-x-auto text-[13px] leading-relaxed" {...props}>
                              <code className={className}>{children}</code>
                            </pre>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(String(children));
                                showToast("代码已复制", "success");
                              }}
                              className="absolute top-2.5 right-2.5 p-1.5 bg-white border border-gray-200 rounded-md text-gray-400 hover:text-gray-700 opacity-0 group-hover/code:opacity-100 transition-opacity shadow-sm"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <code className="bg-gray-100 text-[13px] px-1.5 py-0.5 rounded-md text-gray-800 font-mono" {...props}>
                            {children}
                          </code>
                        );
                      }
                    }}
                  >
                    {displayedContent}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-[var(--color-muted)] opacity-60">
                  <FileText className="w-12 h-12 mb-3 opacity-20" />
                  <span className="text-[14px]">暂无提示词内容</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
