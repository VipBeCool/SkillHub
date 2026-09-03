import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, Edit2, Save, X, FileText, Folder, Copy, Languages, Star, ChevronDown } from "lucide-react";
import { Tooltip } from '../ui/Tooltip';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { showToast } from '../ui/Toast';
import { Prompt, PromptGroup } from "../../types";

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

  // 解析 Markdown 提取标题
  useEffect(() => {
    if (!displayedContent) {
      setHeadings([]);
      return;
    }
    // 移除代码块，防止将代码内的注释或内容当做标题
    const withoutCodeBlocks = displayedContent.replace(/```[\s\S]*?```/g, '').replace(/~~~[\s\S]*?~~~/g, '');
    // 匹配 Markdown 标题：# 标题，## 标题...
    const regex = /^(#{1,6})\s+(.+)$/gm;
    let match;
    const newHeadings = [];
    // 为避免ID重复，记录出现次数
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
  }, [displayedContent]);

  // 处理滚动联动
  const handleScroll = useCallback(() => {
    if (!contentScrollRef.current || headings.length === 0) return;
    const container = contentScrollRef.current;
    const containerTop = container.getBoundingClientRect().top;
    const threshold = containerTop + 60; // 偏移量
    
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

  const handleTranslate = async () => {
    if (!prompt || !prompt.content || targetLang === "original") return;
    setTranslating(true);
    try {
      const translated = await invoke<string>("translate_text", { text: prompt.content, targetLang });
      setTranslations(prev => ({ ...prev, [targetLang]: translated }));
      showToast("翻译完成", "success");
    } catch (e) {
      showToast("翻译失败", "error");
    } finally {
      setTranslating(false);
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
              {/* 翻译工具小胶囊 */}
              {prompt?.content && (
                <div className="flex items-center bg-black/5 hover:bg-black/[0.08] rounded-lg p-0.5 transition-colors mr-1.5">
                  <Tooltip content="选择目标语言">
                    <select
                      value={targetLang}
                      onChange={(e) => {
                        const newLang = e.target.value;
                        setTargetLang(newLang);
                        if (newLang !== "original") {
                          handleTranslate();
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
                  
                  <Tooltip content={targetLang === "original" ? "请先选择目标语言" : translating ? "翻译中..." : "重新翻译"}>
                    <button
                      onClick={handleTranslate}
                      disabled={translating}
                      className={`w-6 h-6 rounded-md flex items-center justify-center transition-all ${
                        targetLang !== "original"
                          ? 'bg-white text-[var(--color-primary)] shadow-xs font-semibold hover:bg-white/90 hover:scale-105'
                          : 'text-gray-700 hover:text-black hover:bg-white/60'
                      }`}
                    >
                      {translating ? (
                        <Loader2 size={12} className="animate-spin text-[var(--color-primary)]" />
                      ) : (
                        <Languages size={13} className={targetLang !== "original" ? "text-[var(--color-primary)]" : "text-gray-700"} />
                      )}
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
        {/* TOC 侧边导航指示器 (向下平移至正文右侧，横坐标与交互与技能页完全一致) */}
        {headings.length > 0 && !isEditing && (
          <div className="absolute right-2 top-28 z-20 pointer-events-none flex flex-col justify-start items-end">
            <div 
              className="pointer-events-auto flex flex-col items-end"
              onMouseEnter={() => setIsTocHovered(true)}
              onMouseLeave={() => setIsTocHovered(false)}
            >
              <div className={`flex flex-col transition-all duration-300 ${
                isTocHovered 
                  ? 'bg-white/95 backdrop-blur-md rounded-xl p-3 shadow-xl border border-[var(--color-border)] w-64' 
                  : 'w-8 py-2 items-end gap-[6px] border border-transparent shadow-none bg-transparent'
              }`}>
                {isTocHovered ? (
                   <div className="max-h-[min(360px,calc(100vh-200px))] w-full overflow-y-auto overflow-x-hidden space-y-0.5 custom-scrollbar pr-1">
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

        {/* 滚动的正文区域 */}
        <div className="flex-1 overflow-y-auto pt-4 px-8 pb-8 relative flex flex-col" ref={contentScrollRef} onScroll={handleScroll}>
          {isEditing ? (
            <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col h-full animate-in fade-in duration-200">
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
                      <span key={t} className="h-6 inline-flex items-center gap-1 text-[11.5px] px-2.5 rounded-md bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium border border-transparent box-border">
                        #{t}
                        <button type="button" onClick={() => removeTag(t)} className="hover:text-red-500 transition-colors">
                          <X className="w-3 h-3" />
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
            <div className="max-w-4xl mx-auto w-full">
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
                      h1: HeadingRenderer(1),
                      h2: HeadingRenderer(2),
                      h3: HeadingRenderer(3),
                      h4: HeadingRenderer(4),
                      h5: HeadingRenderer(5),
                      h6: HeadingRenderer(6),
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
