import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import { PromptGroup } from "../../types";
import { showToast } from "../ui/Toast";

const PRESET_COLORS = ["#64748b", "#3b82f6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6"];

interface CreateGroupDialogProps {
  isOpen: boolean;
  group?: PromptGroup | null;  // null = 新建，有值 = 编辑
  onClose: () => void;
  onSave: () => void;
}

export function CreateGroupDialog({ isOpen, group, onClose, onSave }: CreateGroupDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#64748b");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (group) {
        setName(group.name);
        setColor(group.color || "#64748b");
      } else {
        setName("");
        setColor("#64748b");
      }
    }
  }, [isOpen, group]);

  const handleSave = async () => {
    if (!name.trim()) { showToast("请输入分组名称", "error"); return; }
    setSaving(true);
    try {
      if (group) {
        await invoke("update_prompt_group", { id: group.id, name: name.trim(), icon: "Folder", color });
        showToast("分组已更新", "success");
      } else {
        await invoke("create_prompt_group", { name: name.trim(), icon: "Folder", color });
        showToast("分组已创建", "success");
      }
      onSave();
      onClose();
    } catch (err) {
      showToast(`操作失败: ${err}`, "error");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-sm p-4">
      <div className="bg-white/95 backdrop-blur-xl border border-[var(--color-border)] rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col relative transition-all duration-300 animate-in zoom-in-95 fade-in">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between relative">
          <h2 className="text-lg font-medium text-[var(--foreground)] flex-1 text-left">
            {group ? "编辑分组" : "新增分组"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors absolute right-4">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* 名称 */}
          <div className="flex flex-col gap-2.5">
            <label className="text-[13px] font-medium text-[var(--foreground)]">分组名称</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSave()}
              placeholder="例如：代码生成"
              autoFocus
              className="w-full px-3 py-2 text-[13px] border border-[var(--color-border)] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] transition-all"
            />
          </div>

          {/* 颜色 */}
          <div className="flex flex-col gap-2.5">
            <label className="text-[13px] font-medium text-[var(--foreground)]">标识色</label>
            <div className="flex items-center gap-2.5">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${color === c ? "border-white scale-110 shadow-md ring-2 ring-offset-1" : "border-transparent hover:scale-105"} focus:outline-none`}
                  style={{ backgroundColor: c, '--tw-ring-color': c } as React.CSSProperties}
                />
              ))}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1 rounded-md text-[13px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-all"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="flex items-center justify-center space-x-1.5 bg-[var(--color-primary)] text-white px-3 py-1.5 rounded-md text-[13px] font-medium hover:bg-[var(--color-primary)]/90 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <span>{group ? "保存修改" : "确认创建"}</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
