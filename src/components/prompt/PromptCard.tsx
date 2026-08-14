import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Star, Copy, Tag, Check, RotateCcw, Trash2 } from "lucide-react";
import { Prompt } from "../../types";
import { showToast } from "../ui/Toast";

interface PromptCardProps {
  prompt: Prompt;
  selected: boolean;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onClick: (prompt: Prompt) => void;
  onDoubleClick: (prompt: Prompt) => void;
  onContextMenu: (e: React.MouseEvent, prompt: Prompt) => void;
  onFavoriteToggle: (id: string, newVal: boolean) => void;
  onCopy: (prompt: Prompt) => void;
  isTrashMode?: boolean;
  onRestore?: (prompt: Prompt) => void;
  onHardDelete?: (prompt: Prompt) => void;
}

export function PromptCard({ prompt, selected, onSelect, onClick, onDoubleClick, onContextMenu, onFavoriteToggle, onCopy, isTrashMode, onRestore, onHardDelete }: PromptCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(prompt.content);
    await invoke("increment_prompt_use_count", { id: prompt.id }).catch(() => {});
    onCopy(prompt);
    setCopied(true);
    showToast("已复制到剪贴板", "success");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const newVal = await invoke<boolean>("toggle_prompt_favorite", { id: prompt.id });
      onFavoriteToggle(prompt.id, newVal);
    } catch (err) {
      showToast("操作失败", "error");
    }
  };

  const tags = prompt.tags ? prompt.tags.split(",").map(t => t.trim()).filter(Boolean) : [];

  // 计算剩余天数
  let remainingDays = 0;
  if (isTrashMode && prompt.deleted_at) {
    const deletedDate = new Date(prompt.deleted_at);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - deletedDate.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    remainingDays = Math.max(0, 30 - diffDays);
  }

  return (
    <div
      onMouseDown={(e) => onSelect(prompt.id, e)}
      onClick={() => onClick(prompt)}
      onDoubleClick={() => onDoubleClick(prompt)}
      onContextMenu={(e) => onContextMenu(e, prompt)}
      className={`group relative flex flex-col rounded-xl border transition-all duration-150 cursor-pointer select-none overflow-hidden mb-4 break-inside-avoid
        ${selected
          ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 shadow-sm ring-1 ring-[var(--color-primary)]/20"
          : "border-[var(--color-border)] bg-white hover:border-[var(--color-primary)]/20 hover:shadow-sm"
        }`}
    >
      {/* 收藏色条 */}
      {prompt.is_favorite && (
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-amber-400 to-orange-400" />
      )}

      <div className="p-4 flex flex-col gap-2 flex-1">
        {/* 标题行 */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-[var(--foreground)] leading-tight line-clamp-1 flex-1">
            {prompt.title}
          </h3>
          {isTrashMode ? (
            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-md bg-red-50 text-red-500 font-medium border border-red-100">
              {remainingDays}天后清除
            </span>
          ) : (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button onClick={handleFavorite} className={`p-1 rounded-md transition-colors ${prompt.is_favorite ? "text-amber-500" : "text-[var(--color-muted)] hover:text-amber-500 hover:bg-amber-50"}`}>
                <Star className={`w-3.5 h-3.5 ${prompt.is_favorite ? "fill-amber-500" : ""}`} />
              </button>
              <button onClick={handleCopy} className={`p-1 rounded-md transition-colors ${copied ? "text-green-500" : "text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"}`}>
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
        </div>

        {/* 内容预览 */}
        <p className="text-[12px] text-[var(--color-muted)] leading-relaxed line-clamp-3 flex-1">
          {prompt.content}
        </p>

        {/* 底部：标签 + 元信息 */}
        <div className="flex items-end justify-between gap-2 mt-auto pt-1">
          <div className="flex flex-wrap gap-1 flex-1 min-w-0">
            {tags.slice(0, 3).map((tag) => (
              <span key={tag} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--color-primary)]/8 text-[var(--color-primary)] font-medium truncate max-w-[80px]">
                <Tag className="w-2.5 h-2.5 shrink-0" />
                {tag}
              </span>
            ))}
            {tags.length > 3 && (
              <span className="text-[10px] text-[var(--color-muted)]">+{tags.length - 3}</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {prompt.use_count > 0 && (
              <span className="text-[10px] text-[var(--color-muted)]">已用 {prompt.use_count} 次</span>
            )}
            <span className="text-[10px] text-[var(--color-muted)]">v{prompt.version}</span>
          </div>
        </div>
      </div>

      {/* 底部操作栏（悬浮显示或选中显示） */}
      <div className={`border-t border-[var(--color-border)] px-4 py-2 bg-[var(--color-background)]/50 flex items-center transition-all
        ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}
        ${isTrashMode ? "justify-end" : "justify-between"}
      `}>
        {isTrashMode ? (
          <div className="flex items-center gap-4">
            <button
              onClick={(e) => { e.stopPropagation(); onRestore?.(prompt); }}
              className="flex items-center gap-1.5 text-[11px] font-medium text-green-600 hover:text-green-700 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              恢复
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onHardDelete?.(prompt); }}
              className="flex items-center gap-1.5 text-[11px] font-medium text-red-500 hover:text-red-600 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              彻底删除
            </button>
          </div>
        ) : (
          <>
            <span className="text-[11px] text-[var(--color-muted)]">
              {prompt.group_name ? `📁 ${prompt.group_name}` : "未分组"}
            </span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-[11px] font-medium text-[var(--color-primary)] hover:text-[var(--color-primary)]/80 transition-colors"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? "已复制" : "复制"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
