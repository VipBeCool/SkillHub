import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, FolderGit2, HardDrive, Edit2, Save, Loader2, Copy, Folder, Sparkles, Languages, FileText, List, Star } from "lucide-react";
import { Tooltip } from '../ui/Tooltip';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { showToast } from '../ui/Toast';
import { franc } from "franc-min";
import { formatTokens } from "../../utils";

import { Skill } from "../../types";

interface SkillFile {
  name: string;
  content: string;
  absolute_path: string;
}

interface SkillDetailsDrawerProps {
  skill: Skill | null;
  isOpen: boolean;
  onClose: () => void;
  onGeneratePrompt?: (skill: Skill) => void;
}

export function SkillDetailsDrawer({ skill, isOpen, onClose, onGeneratePrompt }: SkillDetailsDrawerProps) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  const [files, setFiles] = useState<SkillFile[]>([]);
  const [activeFile, setActiveFile] = useState<string>("");
  // 标签编辑状态
  const [tags, setTags] = useState("");
  const [tagInput, setTagInput] = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (skill) {
      setTags(skill.tags || "");
    }
  }, [skill]);

  const addTag = async (newTag: string) => {
    if (!newTag || tags.split(',').map(t => t.trim()).includes(newTag)) return;
    const newTagsList = [...tags.split(','), newTag].filter(t => t.trim() !== "");
    const newTagsStr = newTagsList.join(',');
    setTags(newTagsStr);
    try {
      await invoke("update_skill_tags", { id: skill?.id, tags: newTagsStr || null });
      if (skill) skill.tags = newTagsStr;
    } catch (e) {
      showToast("更新标签失败", "error");
    }
  };

  const removeTag = async (tagToRemove: string) => {
    const newTagsList = tags.split(',').map(t => t.trim()).filter(t => t !== tagToRemove && t !== "");
    const newTagsStr = newTagsList.join(',');
    setTags(newTagsStr);
    try {
      await invoke("update_skill_tags", { id: skill?.id, tags: newTagsStr || null });
      if (skill) skill.tags = newTagsStr;
    } catch (e) {
      showToast("更新标签失败", "error");
    }
  };

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
    if (isOpen && skill) {
      const loadContent = async () => {
        setLoading(true);
        setCapacity(null); // Reset capacity immediately
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

        // Fetch token count asynchronously without blocking the UI
        try {
          const capacityData = await invoke<SkillCapacity>("get_skill_token_count", { skillId: skill.id });
          setCapacity(capacityData);
        } catch (e) {
          console.error("Token count failed:", e);
          setCapacity(null);
        }
      };
      loadContent();
    } else {
      setContent("");
      setEditContent("");
      setIsEditing(false);
      setFiles([]);
    }
  }, [isOpen, skill]);

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

  return (
    <>
      {/* 背景遮罩 */}
      <div 
        onClick={onClose}
        className={`fixed inset-0 bg-black/10 z-40 transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      />

      {/* 侧边栏 */}
      <div 
        className={`fixed inset-y-0 right-0 w-[750px] max-w-[90vw] bg-white border-l border-[var(--color-border)] z-50 shadow-2xl flex flex-col transition-transform duration-500 ${isOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-start justify-between px-6 py-5 border-b border-[var(--color-border)] shrink-0 gap-4">
          <div className="flex items-start space-x-3 min-w-0 flex-1">
            <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${skill?.source_type === 'github' ? 'bg-[#024ad8]/10 text-[#024ad8]' : 'bg-fuchsia-500/10 text-fuchsia-600'}`}>
              {skill?.source_type === 'github' ? <FolderGit2 className="w-5 h-5" /> : <HardDrive className="w-5 h-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <h2 className="text-xl font-medium text-[var(--foreground)] leading-none truncate">{skill?.name}</h2>
                <button
                  onClick={async () => {
                    if (!skill) return;
                    try {
                      await invoke("toggle_skill_favorite", { id: skill.id });
                      skill.is_favorite = !skill.is_favorite;
                    } catch (e) {
                      showToast(`操作失败: ${e}`, "error");
                    }
                  }}
                  className={`p-1 rounded-md transition-colors ${skill?.is_favorite ? 'text-yellow-500' : 'text-[var(--color-muted)] hover:text-yellow-500 hover:bg-yellow-50'}`}
                >
                  <Star className={`w-4 h-4 ${skill?.is_favorite ? 'fill-current' : ''}`} />
                </button>
              </div>
              <div className="flex items-center space-x-1.5 mb-1.5">
                <Tooltip content={skill?.local_path || ""} side="bottom">
                  <p className="text-[11px] text-[var(--color-muted)] truncate max-w-[280px] cursor-default">{skill?.local_path}</p>
                </Tooltip>
                {skill?.local_path && (
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
                        <Folder size={13} />
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
                        <Copy size={13} />
                      </button>
                    </Tooltip>
                  </div>
                )}
              </div>
              
              {/* Tags Editor Display */}
              <div className="mt-4">
                <div className="flex flex-wrap gap-1.5 items-center">
                  {tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                    <span key={tag} className="group/tag inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium">
                      #{tag}
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
                        className="opacity-0 group-hover/tag:opacity-100 hover:text-red-500 transition-all"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    ref={tagInputRef}
                    type="text"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
                        e.preventDefault();
                        const newTag = tagInput.trim().replace(/[,，]/g, '');
                        if (newTag) {
                          addTag(newTag);
                          setTagInput("");
                        }
                      } else if (e.key === 'Backspace' && !tagInput) {
                        const currentTags = tags.split(',').map(t => t.trim()).filter(Boolean);
                        if (currentTags.length > 0) {
                          removeTag(currentTags[currentTags.length - 1]);
                        }
                      }
                    }}
                    onBlur={() => {
                      const newTag = tagInput.trim().replace(/[,，]/g, '');
                      if (newTag) {
                        addTag(newTag);
                        setTagInput("");
                      }
                    }}
                    placeholder="加标签..."
                    className="text-[11px] w-20 px-2 py-1 rounded-md border border-transparent bg-black/5 focus:outline-none focus:border-[var(--color-primary)]/50 focus:bg-white transition-colors placeholder:text-[var(--color-muted)]"
                  />
                </div>
              </div>
              
              {/* Capacity Display */}
              {capacity && (
                <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-[var(--color-border)]/50">
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
                      <span className="text-[11px] font-medium text-[var(--foreground)] opacity-70 flex items-center">
                        <FileText className="w-3 h-3 mr-1" />
                        {capacity.file_count} 个文本文件
                      </span>
                      <span className="text-[10px] text-[var(--color-muted)]">•</span>
                      <span className="text-[11px] font-medium text-[var(--foreground)] opacity-70 flex items-center">
                        <List className="w-3 h-3 mr-1" />
                        {capacity.line_count.toLocaleString()} 行内容
                      </span>
                      <span className="text-[10px] text-[var(--color-muted)]">•</span>
                      <span className="text-[10px] font-medium text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded cursor-help">
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
                onClick={() => skill && onGeneratePrompt?.(skill)}
                disabled={!onGeneratePrompt}
                className="p-1.5 rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)] transition-colors disabled:opacity-30"
              >
                <Sparkles className="w-4 h-4" />
              </button>
            </Tooltip>
            {!isEditing && (
              <Tooltip content="编辑文档">
                <button onClick={() => setIsEditing(true)} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)] transition-colors">
                  <Edit2 className="w-4 h-4" />
                </button>
              </Tooltip>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] transition-colors ml-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>



        <div className="flex-1 overflow-y-auto p-8 relative flex flex-col">
          {(!loading && !isEditing && files.length > 1) && (
            <div className="mb-6 shrink-0 w-full overflow-hidden">
              <div className="flex space-x-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] w-full p-1 bg-black/5 rounded-lg border border-black/5">
                {files.map(f => (
                  <button 
                    key={f.name}
                    onClick={() => handleTabChange(f.name)}
                    className={`px-3 py-1 text-[13px] transition-all rounded-md whitespace-nowrap outline-none ${
                      activeFile === f.name 
                        ? 'bg-white text-[var(--foreground)] font-medium border border-black/5' 
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
              <div className="flex items-center justify-between mb-3 shrink-0">
                <span className="text-sm font-medium text-[var(--color-muted)]">编辑 {activeFile}</span>
                <div className="flex items-center space-x-2">
                  <button onClick={() => setIsEditing(false)} className="px-2.5 py-1 rounded-md text-[13px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-all">
                    取消
                  </button>
                  <button onClick={handleSave} disabled={saving} className="flex items-center px-2.5 py-1 bg-[var(--color-foreground)] text-white rounded-md text-[13px] font-medium hover:bg-black transition-all">
                    {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                    保存
                  </button>
                </div>
              </div>
              <textarea 
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="flex-1 w-full p-4 bg-[var(--color-muted-bg)]/50 border border-[var(--color-border)] rounded-lg outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 resize-none font-mono text-[13px] text-[var(--foreground)] leading-relaxed"
                placeholder="在此编写您的 Markdown 文档..."
              />
            </div>
          ) : (
            <>
              {/* 翻译模块 */}
              {detectedLang && (
                <div className="bg-[var(--color-primary)]/5 rounded-lg border border-[var(--color-primary)]/20 p-3 flex flex-col gap-2 mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[var(--color-primary)]">
                      <Languages className="w-3.5 h-3.5" />
                      <span className="text-[11px] font-medium">语言: {detectedLang === 'cmn' ? '中文' : detectedLang === 'eng' ? '英文' : detectedLang}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={targetLang}
                        onChange={(e) => {
                          setTargetLang(e.target.value);
                          setTranslationText(""); // 切换语言时重置翻译
                        }}
                        className="h-[24px] text-[11px] bg-white border border-[var(--color-border)] rounded-md px-1.5 focus:outline-none focus:border-[var(--color-primary)]/50"
                      >
                        <option value="zh-CN">中文</option>
                        <option value="en">English</option>
                        <option value="ja">日本語</option>
                        <option value="ko">한국어</option>
                        <option value="fr">Français</option>
                        <option value="es">Español</option>
                        <option value="ru">Русский</option>
                      </select>
                      <button
                        onClick={() => {
                          if (!translationText) {
                            handleTranslate();
                          } else {
                            setIsTranslationVisible(!isTranslationVisible);
                          }
                        }}
                        disabled={isTranslating}
                        className={`h-[24px] flex items-center justify-center text-[11px] px-2.5 rounded-md transition-colors disabled:opacity-50 ${
                          translationText
                            ? "bg-white border border-[var(--color-border)] text-[var(--foreground)] opacity-80 hover:opacity-100 hover:bg-black/5"
                            : "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90"
                        }`}
                      >
                        {isTranslating ? "翻译中..." : translationText ? (isTranslationVisible ? "收起" : "展开") : "翻译"}
                      </button>
                      {translationText && isTranslationVisible && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(translationText);
                            showToast("翻译结果已复制到剪切板");
                          }}
                          className="h-[24px] flex items-center justify-center text-[11px] px-2.5 bg-white border border-[var(--color-border)] text-[var(--foreground)] opacity-80 hover:opacity-100 hover:bg-black/5 rounded-md transition-colors"
                        >
                          复制
                        </button>
                      )}
                    </div>
                  </div>
                  {translationText && isTranslationVisible && (
                    <div className="mt-1 pt-2 border-t border-[var(--color-primary)]/10">
                      <div className="prose max-w-none prose-headings:text-left prose-a:text-[#024ad8]">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                          {translationText}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              <div className="prose max-w-none prose-headings:text-left prose-a:text-[#024ad8] pb-10">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                  {content ? content.replace(/^\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/, '') : ""}
                </ReactMarkdown>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
