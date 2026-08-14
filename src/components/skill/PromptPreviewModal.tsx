import { useState, useEffect, useRef } from "react";
import { X, Copy, Check, Sparkles, Loader2 } from "lucide-react";

interface PromptPreviewModalProps {
  isOpen: boolean;
  skillName: string;
  content: string;
  loading: boolean;
  onClose: () => void;
}

export function PromptPreviewModal({
  isOpen,
  skillName,
  content,
  loading,
  onClose,
}: PromptPreviewModalProps) {
  const [editedContent, setEditedContent] = useState("");
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 每次弹窗打开或内容更新时同步
  useEffect(() => {
    setEditedContent(content);
    setCopied(false);
  }, [content, isOpen]);

  // 加载完成后自动聚焦
  useEffect(() => {
    if (!loading && isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [loading, isOpen]);

  // ESC 关闭
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editedContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error("复制失败:", e);
    }
  };

  const charCount = editedContent.length;

  if (!isOpen) return null;

  return (
    <>
      {/* 背景遮罩 */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100] transition-opacity duration-200"
        onClick={onClose}
      />

      {/* 弹窗主体 */}
      <div className="fixed inset-0 z-[101] flex items-center justify-center p-6 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-2xl bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-black/[0.08] flex flex-col overflow-hidden"
          style={{ maxHeight: "80vh" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 头部 */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] shrink-0">
            <div className="flex items-center space-x-2.5">
              <div className="w-7 h-7 rounded-lg bg-[var(--color-primary)]/15 text-[var(--color-primary)] flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-[var(--foreground)] leading-none mb-0.5">
                  智能引用提示词
                </h3>
                <p className="text-[11px] text-[var(--color-muted)] leading-none truncate max-w-[360px]">
                  {skillName}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 内容区 */}
          <div className="flex-1 overflow-hidden relative">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 space-y-3">
                <Loader2 className="w-6 h-6 text-[var(--color-primary)] animate-spin" />
                <p className="text-[12px] text-[var(--color-muted)]">正在生成提示词...</p>
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="w-full h-full resize-none border-0 outline-none bg-transparent p-5 font-mono text-[12px] leading-relaxed text-[var(--foreground)] placeholder-[var(--color-muted)]"
                style={{
                  minHeight: "320px",
                  maxHeight: "calc(80vh - 140px)",
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace",
                }}
                placeholder="生成的提示词将在这里显示..."
                spellCheck={false}
              />
            )}
          </div>

          {/* 底部操作栏 */}
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-[var(--color-border)] bg-black/[0.02] shrink-0">
            <span className="text-[11px] text-[var(--color-muted)]">
              {loading ? "生成中..." : `${charCount.toLocaleString()} 字符`}
            </span>
            <div className="flex items-center space-x-2">
              <button
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-lg text-[12px] text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] transition-colors"
              >
                关闭
              </button>
              <button
                onClick={handleCopy}
                disabled={loading || !editedContent}
                className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
                  copied
                    ? "bg-green-500 text-white"
                    : "bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-white"
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>已复制！</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>复制提示词</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
