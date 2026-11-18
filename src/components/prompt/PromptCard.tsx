import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Star, Copy, Tag, Check, RotateCcw, Trash2 } from "lucide-react";
import { Prompt } from "../../types";
import { showToast } from "../ui/Toast";
import { Tooltip } from "../ui/Tooltip";

interface PromptCardProps {
  prompt: Prompt;
  selected: boolean;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onClick: (e: React.MouseEvent, prompt: Prompt) => void;
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
    const prevVal = prompt.is_favorite;
    const nextVal = !prevVal;
    // 立即乐观更新星星点亮/熄灭状态
    onFavoriteToggle(prompt.id, nextVal);
    try {
      const actualVal = await invoke<boolean>("toggle_prompt_favorite", { id: prompt.id });
      if (actualVal !== nextVal) {
        onFavoriteToggle(prompt.id, actualVal);
      }
    } catch (err) {
      onFavoriteToggle(prompt.id, prevVal);
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
      data-prompt-id={prompt.id}
      onMouseDown={(e) => onSelect(prompt.id, e)}
      onClick={(e) => onClick(e, prompt)}
      onDoubleClick={() => onDoubleClick(prompt)}
      onContextMenu={(e) => onContextMenu(e, prompt)}
      className={`prompt-card group relative flex flex-col rounded-xl border transition-all duration-200 cursor-pointer select-none overflow-hidden bg-white
        ${selected
          ? "border-[var(--color-primary)] shadow-sm shadow-blue-500/10 ring-1 ring-[var(--color-primary)]/20"
          : "border-black/5 hover:border-black/10 hover:shadow-sm"
        }`}
    >
      {/* 星标色条 */}
      {prompt.is_favorite && (
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-amber-400 to-orange-400" />
      )}

      <div className="p-4 flex flex-col gap-2 grow">
        {/* 标题行 */}
        <div className="flex items-start justify-between gap-2">
          <Tooltip content={prompt.title}>
            <h3 className="text-[13px] font-semibold text-[var(--foreground)] leading-tight mask-fade-x flex-1 cursor-default">
              {prompt.title}
            </h3>
          </Tooltip>
          {isTrashMode ? (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <span className="text-[10px] px-1.5 py-0.5 mr-1 rounded-md bg-red-50 text-red-500 font-medium border border-red-100">
                {remainingDays}天后清除
              </span>
              <Tooltip content="恢复">
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onRestore?.(prompt); }}
                  className="w-7 h-7 -my-1 flex items-center justify-center rounded-lg text-[var(--color-muted)] hover:text-green-600 hover:bg-green-50 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </Tooltip>
              <Tooltip content="彻底删除">
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onHardDelete?.(prompt); }}
                  className="w-7 h-7 -my-1 -mr-1.5 flex items-center justify-center rounded-lg text-[var(--color-muted)] hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </Tooltip>
            </div>
          ) : (
            <div className="flex items-center gap-0.5 shrink-0">
              <Tooltip content="复制内容">
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onClick={handleCopy}
                  className={`w-7 h-7 -my-1 flex items-center justify-center rounded-lg transition-[opacity,transform,background-color] duration-150 active:scale-90 cursor-pointer opacity-0 group-hover:opacity-100 ${copied ? "text-green-500 opacity-100" : "text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"}`}
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </Tooltip>
              <Tooltip content={prompt.is_favorite ? "取消星标" : "星标"}>
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onClick={handleFavorite}
                  className={`w-7 h-7 -my-1 -mr-1.5 flex items-center justify-center rounded-lg transition-[opacity,transform,background-color] duration-150 active:scale-90 cursor-pointer ${
                    prompt.is_favorite
                      ? "opacity-100 text-amber-500 hover:bg-amber-50/90"
                      : "opacity-0 group-hover:opacity-100 text-[var(--color-muted)] hover:text-amber-500 hover:bg-amber-50/90"
                  }`}
                >
                  <Star className={`w-4 h-4 ${prompt.is_favorite ? "fill-amber-500 text-amber-500" : ""}`} />
                </button>
              </Tooltip>
            </div>
          )}
        </div>

        {/* 内容预览 */}
        <p className="text-[12px] text-[var(--color-muted)] leading-relaxed line-clamp-3">
          {prompt.content}
        </p>

        {/* 底部：标签 + 元信息 */}
        <div className="flex items-end justify-between gap-2 mt-auto pt-1">
          <div className="flex flex-wrap gap-1 flex-1 min-w-0 items-center">
            {tags.slice(0, 3).map((tag) => (
              <Tooltip key={tag} content={tag}>
                <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--color-primary)]/8 text-[var(--color-primary)] font-medium mask-fade-x max-w-[90px] cursor-default">
                  <Tag className="w-2.5 h-2.5 shrink-0" />
                  <span>{tag}</span>
                </span>
              </Tooltip>
            ))}
            {tags.length > 3 && (
              <span className="text-[10px] text-[var(--color-muted)]">+{tags.length - 3}</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {prompt.use_count > 0 && (
              <span className="text-[10px] text-[var(--color-muted)]">已用 {prompt.use_count} 次</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
