import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import { PromptGroup } from "../../types";
import { showToast } from "../ui/Toast";

const PRESET_ICONS = ["💡", "💻", "✍️", "🎨", "📊", "🔍", "🤖", "📝", "🔬", "🌐", "🎯", "⚡", "📖", "🛠️", "🎭"];
const PRESET_COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#64748b"];

interface CreateGroupDialogProps {
  isOpen: boolean;
  group?: PromptGroup | null;  // null = 新建，有值 = 编辑
  onClose: () => void;
  onSave: () => void;
}

export function CreateGroupDialog({ isOpen, group, onClose, onSave }: CreateGroupDialogProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📁");
  const [color, setColor] = useState("#6366f1");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (group) {
        setName(group.name);
        setIcon(group.icon || "📁");
        setColor(group.color || "#6366f1");
      } else {
        setName("");
        setIcon("📁");
        setColor("#6366f1");
      }
    }
  }, [isOpen, group]);

  const handleSave = async () => {
    if (!name.trim()) { showToast("请输入分组名称", "error"); return; }
    setSaving(true);
    try {
      if (group) {
        await invoke("update_prompt_group", { id: group.id, name: name.trim(), icon, color });
        showToast("分组已更新", "success");
      } else {
        await invoke("create_prompt_group", { name: name.trim(), icon, color });
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-sm p-4">
      <div className="bg-white/95 backdrop-blur-xl border border-[var(--color-border)] rounded-2xl w-full max-w-sm shadow-2xl animate-in zoom-in-95 fade-in duration-150">
        {/* 顶栏 */}
        <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[var(--foreground)]">
            {group ? "编辑分组" : "新建分组"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* 预览 */}
          <div className="flex items-center justify-center">
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-[var(--color-border)]" style={{ borderColor: color + "60" }}>
              <span className="text-2xl">{icon}</span>
              <span className="text-[14px] font-semibold" style={{ color }}>{name || "分组名称"}</span>
            </div>
          </div>

          {/* 名称 */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-[var(--color-muted)]">分组名称</label>
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

          {/* 图标 */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-[var(--color-muted)]">图标</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_ICONS.map(i => (
                <button
                  key={i}
                  onClick={() => setIcon(i)}
                  className={`w-9 h-9 text-lg rounded-lg border-2 transition-all ${icon === i ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5" : "border-transparent hover:border-[var(--color-border)]"}`}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          {/* 颜色 */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-semibold text-[var(--color-muted)]">标识色</label>
            <div className="flex items-center gap-2">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${color === c ? "border-white scale-110 shadow-md" : "border-transparent hover:scale-105"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* 底栏 */}
        <div className="px-5 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors">
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-4 py-2 text-[13px] font-semibold rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-colors disabled:opacity-50"
          >
            {saving ? "保存中..." : group ? "保存" : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}
