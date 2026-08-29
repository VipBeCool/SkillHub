import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, Edit2, Save, X, Type, FileText, Tag, Folder, Copy, Languages } from "lucide-react";
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
      } else {
        // 新建
        await invoke("create_prompt", {
          title: title.trim(), content: content.trim(),
          description: description.trim() || null, groupId: groupId || null,
          tags: tags.trim() || null, variables: null,
        });
        showToast("已创建", "success");
        // 通知外部（例如 App.tsx）刷新列表并可能关闭这个"新建"标签
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
      <div className="flex-1 flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin opacity-50" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-white relative">
      {/* 顶部操作栏 */}
      <div className="h-14 border-b border-[var(--color-border)] px-8 flex items-center justify-between shrink-0 bg-white sticky top-0 z-10">
        <div className="flex items-center space-x-3">
          <FileText className="w-5 h-5 text-[var(--color-primary)] opacity-80" />
          <h1 className="text-[15px] font-medium tracking-tight text-[var(--foreground)] truncate max-w-md">
            {isEditing ? (prompt ? "编辑提示词" : "新建提示词") : (prompt?.title || "提示词详情")}
          </h1>
        </div>
        
        <div className="flex items-center space-x-2 shrink-0">
          {!isEditing ? (
            <>
              <Tooltip content="复制提示词内容">
                <button onClick={handleCopy} className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium text-[var(--color-muted)] hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)] transition-colors border border-transparent">
                  <Copy className="w-4 h-4" />
                  <span>复制</span>
                </button>
              </Tooltip>
              <Tooltip content="编辑提示词">
                <button onClick={() => setIsEditing(true)} className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium text-[var(--color-muted)] hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)] transition-colors border border-transparent">
                  <Edit2 className="w-4 h-4" />
                  <span>编辑</span>
                </button>
              </Tooltip>
            </>
          ) : (
            <>
              <button 
                onClick={() => {
                  if (!prompt) {
                    onCancelNew?.();
                  } else {
                    setIsEditing(false);
                    // 恢复表单数据
                    setTitle(prompt.title);
                    setContent(prompt.content);
                    setDescription(prompt.description || "");
                    setGroupId(prompt.group_id || "");
                    setTags(prompt.tags || "");
                  }
                }} 
                className="px-3 py-1.5 rounded-md text-[13px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-all"
              >
                取消
              </button>
              <button 
                onClick={handleSave} 
                disabled={saving} 
                className="flex items-center px-4 py-1.5 bg-blue-500 text-white rounded-md text-[13px] font-medium hover:bg-blue-600 transition-all shadow-sm shadow-blue-500/20"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                保存
              </button>
            </>
          )}
        </div>
      </div>

      {/* 主体内容区 */}
      <div className="flex-1 overflow-y-auto p-10 relative flex flex-col">
        <div className="max-w-4xl mx-auto w-full flex flex-col h-full">
          {isEditing ? (
            <div className="flex flex-col space-y-5 flex-1 pb-10">
              <div className="flex space-x-4">
                <div className="flex-1 relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <Type className="h-4 w-4 text-[var(--color-muted)]/50" />
                  </div>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-[var(--color-border)] rounded-xl text-[14px] text-[var(--foreground)] font-medium outline-none focus:border-[var(--color-primary)]/50 focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all shadow-sm"
                    placeholder="提示词标题，例如：英文校对助手"
                  />
                </div>
                
                <div className="w-48 relative" ref={dropdownRef}>
                  <button
                    onClick={() => setShowGroupDropdown(!showGroupDropdown)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-white border border-[var(--color-border)] rounded-xl text-[13px] text-[var(--foreground)] outline-none hover:bg-black/[0.02] transition-colors shadow-sm"
                  >
                    <div className="flex items-center truncate mr-2">
                      <Folder className="w-4 h-4 text-[var(--color-muted)]/70 mr-2 shrink-0" />
                      <span className="truncate">{groupId ? groups.find(g => g.id === groupId)?.name || "未分组" : "未分组"}</span>
                    </div>
                  </button>
                  {showGroupDropdown && (
                    <div className="absolute top-full right-0 mt-1 w-full bg-white border border-[var(--color-border)] rounded-xl shadow-lg z-50 py-1 overflow-hidden">
                      <button
                        onClick={() => { setGroupId(""); setShowGroupDropdown(false); }}
                        className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-black/5 transition-colors ${!groupId ? "text-[var(--color-primary)] font-medium bg-[var(--color-primary)]/5" : "text-[var(--foreground)]"}`}
                      >
                        未分组
                      </button>
                      {groups.map(group => (
                        <button
                          key={group.id}
                          onClick={() => { setGroupId(group.id); setShowGroupDropdown(false); }}
                          className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-black/5 transition-colors truncate ${groupId === group.id ? "text-[var(--color-primary)] font-medium bg-[var(--color-primary)]/5" : "text-[var(--foreground)]"}`}
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
                className="w-full px-3 py-2 bg-white border border-[var(--color-border)] rounded-xl text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--color-primary)]/50 focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all shadow-sm"
                placeholder="一句话描述这个提示词的作用（可选）"
              />

              <div className="flex-1 flex flex-col min-h-[300px]">
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="flex-1 w-full p-4 bg-white border border-[var(--color-border)] rounded-xl outline-none focus:border-[var(--color-primary)]/50 focus:ring-2 focus:ring-[var(--color-primary)]/10 resize-none font-mono text-[13px] text-[var(--foreground)] leading-relaxed shadow-sm transition-all"
                  placeholder="在此输入提示词内容..."
                />
              </div>

              <div className="bg-white border border-[var(--color-border)] rounded-xl p-3 shadow-sm">
                <div className="flex items-center text-[12px] font-medium text-[var(--color-muted)] mb-2">
                  <Tag className="w-3.5 h-3.5 mr-1.5" />
                  <span>标签</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {tagList.map(t => (
                    <span key={t} className="inline-flex items-center px-2 py-0.5 rounded border border-[var(--color-border)] bg-black/[0.02] text-[12px] text-[var(--foreground)]">
                      {t}
                      <button onClick={() => removeTag(t)} className="ml-1 text-[var(--color-muted)] hover:text-red-500 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center">
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
                    placeholder="输入标签后按回车"
                    className="flex-1 bg-transparent text-[13px] text-[var(--foreground)] outline-none placeholder:text-[var(--color-muted)]/50"
                  />
                </div>
              </div>
            </div>
          ) : (
            // 详情模式
            <div className="flex flex-col space-y-6 flex-1 pb-10">
              <div className="space-y-3">
                <h2 className="text-2xl font-bold text-[var(--foreground)]">{prompt?.title}</h2>
                {prompt?.description && (
                  <p className="text-[14px] text-[var(--color-muted)] leading-relaxed">{prompt.description}</p>
                )}
                
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {prompt?.group_id && (
                    <div className="inline-flex items-center px-2 py-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-muted-bg)]/30 text-[12px] text-[var(--color-muted)]">
                      <Folder className="w-3 h-3 mr-1" />
                      {groups.find(g => g.id === prompt.group_id)?.name || "未分组"}
                    </div>
                  )}
                  {tagList.map(t => (
                    <span key={t} className="inline-flex items-center px-2 py-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-muted-bg)]/30 text-[12px] text-[var(--color-muted)]">
                      <Tag className="w-3 h-3 mr-1" />
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex-1 bg-white border border-[var(--color-border)] rounded-xl p-5 shadow-sm overflow-y-auto relative group">
                {prompt?.content ? (
                  <div className="prose prose-sm max-w-none text-[var(--foreground)]">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw]}
                      components={{
                        code({node, inline, className, children, ...props}: any) {
                          return !inline ? (
                            <div className="relative group/code mt-2 mb-4 bg-gray-50 rounded-lg border border-gray-100">
                              <pre className="p-4 m-0 overflow-x-auto text-[13px] leading-relaxed" {...props}>
                                <code className={className}>{children}</code>
                              </pre>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(String(children));
                                  showToast("代码已复制", "success");
                                }}
                                className="absolute top-2 right-2 p-1.5 bg-white border border-gray-200 rounded text-gray-400 hover:text-gray-700 opacity-0 group-hover/code:opacity-100 transition-opacity shadow-sm"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <code className="bg-gray-100 text-[13px] px-1.5 py-0.5 rounded text-gray-800 font-mono" {...props}>
                              {children}
                            </code>
                          )
                        }
                      }}
                    >
                      {targetLang === "original" ? prompt.content : (translations[targetLang] || prompt.content)}
                    </ReactMarkdown>
                    
                    <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <select 
                        value={targetLang}
                        onChange={e => setTargetLang(e.target.value)}
                        className="h-[28px] text-[12px] bg-white border border-[var(--color-border)] rounded-md px-2 focus:outline-none focus:border-[var(--color-primary)]/50 shadow-sm"
                        onClick={e => e.stopPropagation()}
                      >
                        <option value="original">原文</option>
                        <option value="zh-CN">中文</option>
                        <option value="en">English</option>
                        <option value="ja">日本語</option>
                        <option value="ko">한국어</option>
                      </select>
                      <button 
                        onClick={handleTranslate}
                        disabled={translating || targetLang === "original"}
                        title="翻译此提示词"
                        className="p-1.5 bg-white border border-[var(--color-border)] rounded-md shadow-sm hover:text-[var(--color-primary)] disabled:opacity-100 disabled:text-[var(--color-muted)] flex items-center justify-center w-[28px] h-[28px]"
                      >
                        {translating ? <Loader2 size={14} className="animate-spin" /> : <Languages size={14} />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-[var(--color-muted)] text-[13px]">暂无内容</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
