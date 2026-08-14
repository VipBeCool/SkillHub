import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { X, Download, FileText, Braces, AlignLeft } from "lucide-react";
import { Prompt } from "../../types";
import { showToast } from "../ui/Toast";

interface PromptExportDialogProps {
  isOpen: boolean;
  prompts: Prompt[];
  onClose: () => void;
}

type ExportFormat = "markdown" | "json" | "txt";

export function PromptExportDialog({ isOpen, prompts, onClose }: PromptExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("markdown");
  const [exporting, setExporting] = useState(false);

  const formatOptions = [
    { value: "markdown" as ExportFormat, label: "Markdown", ext: ".md", icon: FileText, desc: "含标题、分组、标签结构，适合阅读和分享" },
    { value: "json" as ExportFormat, label: "JSON", ext: ".json", icon: Braces, desc: "结构化数据，适合程序处理和备份" },
    { value: "txt" as ExportFormat, label: "纯文本", ext: ".txt", icon: AlignLeft, desc: "仅包含标题和内容，最简洁" },
  ];

  const handleExport = async () => {
    setExporting(true);
    try {
      const ids = prompts.map(p => p.id);
      const content = await invoke<string>("export_prompts", { ids, format });

      const extMap: Record<ExportFormat, string> = { markdown: "md", json: "json", txt: "txt" };
      const defaultName = prompts.length === 1
        ? `${prompts[0].title}.${extMap[format]}`
        : `prompts-export-${new Date().toISOString().slice(0, 10)}.${extMap[format]}`;

      const filePath = await save({
        defaultPath: defaultName,
        filters: [{ name: format.toUpperCase(), extensions: [extMap[format]] }],
      });

      if (filePath) {
        // 通过后端写文件（与项目其他写文件操作保持一致）
        await invoke("save_skill_file_by_path", { absolutePath: filePath, content });
        showToast(`已导出到 ${filePath.split("/").pop()}`, "success");
        onClose();
      }
    } catch (err) {
      showToast(`导出失败: ${err}`, "error");
    } finally {
      setExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-sm p-4">
      <div className="bg-white/95 backdrop-blur-xl border border-[var(--color-border)] rounded-2xl w-full max-w-sm shadow-2xl animate-in zoom-in-95 fade-in duration-150">
        <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--foreground)]">导出提示词</h2>
            <p className="text-[12px] text-[var(--color-muted)] mt-0.5">共 {prompts.length} 个提示词</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {formatOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setFormat(opt.value)}
              className={`w-full flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${
                format === opt.value
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5"
                  : "border-[var(--color-border)] hover:border-[var(--color-primary)]/30"
              }`}
            >
              <opt.icon className={`w-4 h-4 mt-0.5 shrink-0 ${format === opt.value ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"}`} />
              <div>
                <div className={`text-[13px] font-semibold ${format === opt.value ? "text-[var(--color-primary)]" : "text-[var(--foreground)]"}`}>
                  {opt.label} <span className="font-normal text-[var(--color-muted)]">{opt.ext}</span>
                </div>
                <div className="text-[11px] text-[var(--color-muted)] mt-0.5">{opt.desc}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors">
            取消
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-4 py-2 text-[13px] font-semibold rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? "导出中..." : "导出"}
          </button>
        </div>
      </div>
    </div>
  );
}
