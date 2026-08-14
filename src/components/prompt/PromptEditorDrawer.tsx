import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Type, FileText, Tag, Folder, Save, ChevronDown } from "lucide-react";
import { Prompt, PromptGroup } from "../../types";
import { showToast } from "../ui/Toast";

interface PromptEditorDrawerProps {
  isOpen: boolean;
  prompt: Prompt | null;  // null = 新建模式
  groups: PromptGroup[];
  onClose: () => void;
  onSave: () => void;
}

type EditorMode = "text" | "markdown";

export function PromptEditorDrawer({ isOpen, prompt, groups, onClose, onSave }: PromptEditorDrawerProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [groupId, setGroupId] = useState<string>("");
  const [tags, setTags] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>("text");
  const [saving, setSaving] = useState(false);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (prompt) {
        setTitle(prompt.title);
        setContent(prompt.content);
        setDescription(prompt.description || "");
        setGroupId(prompt.group_id || "");
        setTags(prompt.tags || "");
        setChangeNote("");
      } else {
        setTitle("");
        setContent("");
        setDescription("");
        setGroupId("");
        setTags("");
        setChangeNote("");
      }
      setEditorMode("text");
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen, prompt]);

  const handleSave = async () => {
    if (!title.trim()) { showToast("请填写标题", "error"); return; }
    if (!content.trim()) { showToast("请填写内容", "error"); return; }
    setSaving(true);
    try {
      if (prompt) {
        await invoke("update_prompt", {
          id: prompt.id, title: title.trim(), content: content.trim(),
          description: description.trim() || null, groupId: groupId || null,
          tags: tags.trim() || null, variables: prompt.variables || null,
          changeNote: changeNote.trim() || null,
        });
        showToast("已保存", "success");
      } else {
        await invoke("create_prompt", {
          title: title.trim(), content: content.trim(),
          description: description.trim() || null, groupId: groupId || null,
          tags: tags.trim() || null, variables: null,
        });
        showToast("提示词已创建", "success");
      }
      onSave();
      onClose();
    } catch (err) {
      showToast(`保存失败: ${err}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const selectedGroup = groups.find(g => g.id === groupId);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch pointer-events-none">
      {/* 背景遮罩 */}
      <div className="flex-1 pointer-events-auto" onClick={onClose} />

      {/* 抽屉面板 */}
      <div className="w-[560px] bg-white/95 backdrop-blur-xl border-l border-[var(--color-border)] shadow-2xl flex flex-col pointer-events-auto animate-in slide-in-from-right duration-200">
        {/* 顶栏 */}
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--foreground)]">
              {prompt ? "编辑提示词" : "新建提示词"}
            </h2>
            {prompt && <p className="text-[12px] text-[var(--color-muted)] mt-0.5">当前版本 v{prompt.version} · 保存后生成新版本</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-5">
            {/* 标题 */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-[var(--color-muted)] uppercase tracking-wide">标题 *</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="例如：代码审查专家"
                className="w-full px-3 py-2 text-[14px] border border-[var(--color-border)] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] transition-all"
              />
            </div>

            {/* 内容编辑器 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-semibold text-[var(--color-muted)] uppercase tracking-wide">内容 *</label>
                {/* 模式切换 */}
                <div className="flex items-center rounded-lg border border-[var(--color-border)] overflow-hidden bg-[var(--color-background)] p-0.5 gap-0.5">
                  <button
                    onClick={() => setEditorMode("text")}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${editorMode === "text" ? "bg-white shadow-sm text-[var(--foreground)]" : "text-[var(--color-muted)] hover:text-[var(--foreground)]"}`}
                  >
                    <Type className="w-3 h-3" /> 纯文本
                  </button>
                  <button
                    onClick={() => setEditorMode("markdown")}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${editorMode === "markdown" ? "bg-white shadow-sm text-[var(--foreground)]" : "text-[var(--color-muted)] hover:text-[var(--foreground)]"}`}
                  >
                    <FileText className="w-3 h-3" /> MD 预览
                  </button>
                </div>
              </div>

              {editorMode === "text" ? (
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="在这里输入你的 Prompt 内容..."
                  rows={12}
                  className="w-full px-3 py-2.5 text-[13px] leading-relaxed border border-[var(--color-border)] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] transition-all resize-none font-mono"
                />
              ) : (
                <div className="flex gap-2 h-[280px]">
                  <textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder="在这里输入你的 Prompt 内容..."
                    className="flex-1 px-3 py-2.5 text-[13px] leading-relaxed border border-[var(--color-border)] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] transition-all resize-none font-mono"
                  />
                  <div className="flex-1 px-3 py-2.5 text-[13px] leading-relaxed border border-[var(--color-border)] rounded-lg bg-[var(--color-background)] overflow-y-auto prose prose-sm max-w-none">
                    <MDPreview content={content} />
                  </div>
                </div>
              )}

              <p className="text-[11px] text-[var(--color-muted)]">
                提示：使用 {"{{变量名}}"} 语法定义可替换的占位符，如 {"{{语言}}"} {"{{任务}}"}
              </p>
            </div>

            {/* 描述（可选） */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-[var(--color-muted)] uppercase tracking-wide">描述 <span className="font-normal normal-case">(可选)</span></label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="简要说明这个 Prompt 的用途..."
                className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] transition-all"
              />
            </div>

            {/* 分组 + 标签 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-[var(--color-muted)] uppercase tracking-wide flex items-center gap-1"><Folder className="w-3 h-3" /> 分组</label>
                <div className="relative">
                  <button
                    onClick={() => setShowGroupDropdown(!showGroupDropdown)}
                    className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded-lg bg-white flex items-center justify-between hover:border-[var(--color-primary)]/40 transition-colors"
                  >
                    <span className={selectedGroup ? "text-[var(--foreground)]" : "text-[var(--color-muted)]"}>
                      {selectedGroup ? `${selectedGroup.icon || "📁"} ${selectedGroup.name}` : "未分组"}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-[var(--color-muted)]" />
                  </button>
                  {showGroupDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[var(--color-border)] rounded-lg shadow-lg z-10 overflow-hidden">
                      <button
                        onClick={() => { setGroupId(""); setShowGroupDropdown(false); }}
                        className="w-full px-3 py-2 text-[13px] text-left hover:bg-black/5 text-[var(--color-muted)]"
                      >未分组</button>
                      {groups.map(g => (
                        <button
                          key={g.id}
                          onClick={() => { setGroupId(g.id); setShowGroupDropdown(false); }}
                          className={`w-full px-3 py-2 text-[13px] text-left hover:bg-black/5 ${groupId === g.id ? "text-[var(--color-primary)] font-medium" : "text-[var(--foreground)]"}`}
                        >
                          {g.icon || "📁"} {g.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-[var(--color-muted)] uppercase tracking-wide flex items-center gap-1"><Tag className="w-3 h-3" /> 标签</label>
                <input
                  type="text"
                  value={tags}
                  onChange={e => setTags(e.target.value)}
                  placeholder="代码,Python,调试"
                  className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] transition-all"
                />
                <p className="text-[11px] text-[var(--color-muted)]">用逗号分隔多个标签</p>
              </div>
            </div>

            {/* 版本说明（仅编辑模式） */}
            {prompt && (
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-[var(--color-muted)] uppercase tracking-wide">版本说明 <span className="font-normal normal-case">(可选)</span></label>
                <input
                  type="text"
                  value={changeNote}
                  onChange={e => setChangeNote(e.target.value)}
                  placeholder="例如：修改了角色定义，加强了输出格式约束"
                  className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] transition-all"
                />
              </div>
            )}
          </div>
        </div>

        {/* 底栏操作 */}
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-between shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors">
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim() || !content.trim()}
            className="px-5 py-2 text-[13px] font-semibold rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "保存中..." : prompt ? "保存修改" : "创建提示词"}
          </button>
        </div>
      </div>
    </div>
  );
}

// 简单 Markdown 渲染组件（基于 marked 或纯正则）
function MDPreview({ content }: { content: string }) {
  const html = content
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code class="bg-black/5 px-1 rounded text-[12px]">$1</code>')
    .replace(/\n/g, "<br/>");

  return (
    <div
      className="text-[13px] leading-relaxed text-[var(--foreground)] [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_strong]:font-semibold"
      dangerouslySetInnerHTML={{ __html: html || '<span class="text-[var(--color-muted)]">预览内容将显示在这里...</span>' }}
    />
  );
}
