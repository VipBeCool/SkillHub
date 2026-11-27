import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { X, Plus, Trash2, Folder, Bot, ArrowRight, Check, FolderOpen } from "lucide-react";
import { Tooltip } from "../ui/Tooltip";
import { showToast } from "../ui/Toast";

interface AgentConfig {
  id: string;
  name: string;
  display_name: string;
  config_path: string;
  skills_path: string;
  sync_method: string;
  version?: string;
}

interface AgentSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  isInline?: boolean;
}

// 常见 AI 客户端快捷预设
const AGENT_PRESETS = [
  {
    name: "Cursor",
    id: "cursor",
    desc: "AI 代码编辑器",
    defaultPath: "~/.cursor/skills",
  },
  {
    name: "Claude Code",
    id: "claude-code",
    desc: "Anthropic 终端 CLI",
    defaultPath: "~/.claude/skills",
  },
  {
    name: "Windsurf",
    id: "windsurf",
    desc: "AI 协作编辑器",
    defaultPath: "~/.codeium/windsurf/skills",
  },
  {
    name: "Antigravity",
    id: "antigravity",
    desc: "Google 智能体协同环境",
    defaultPath: ".agents/skills",
  },
];

export function AgentSettingsDialog({
  isOpen,
  onClose,
  isInline = false,
}: AgentSettingsDialogProps) {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(false);

  // 新增客户端表单状态
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newSkillsPath, setNewSkillsPath] = useState("");

  const fetchAgents = async () => {
    try {
      const data = await invoke<AgentConfig[]>("get_agents");
      setAgents(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAgents();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBrowseSkillsPath = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === "string") {
        setNewSkillsPath(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const newAgent: AgentConfig = {
        id: crypto.randomUUID(),
        name: newName || newDisplayName.toLowerCase().replace(/\s+/g, "-"),
        display_name: newDisplayName,
        config_path: "",
        skills_path: newSkillsPath,
        sync_method: "symlink",
      };
      await invoke("add_agent", { agent: newAgent });
      await fetchAgents();
      setIsAdding(false);
      setNewName("");
      setNewDisplayName("");
      setNewSkillsPath("");
      showToast(`已添加 ${newDisplayName}`, "success");
    } catch (e) {
      console.error(e);
      showToast(`添加失败: ${e}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAgent = async (id: string, name: string) => {
    if (!confirm(`确定移除「${name}」吗？对应的技能符号链接也将取消。`)) return;
    try {
      await invoke("delete_agent", { id });
      await fetchAgents();
      showToast(`已移除 ${name}`, "info");
    } catch (e) {
      console.error(e);
      showToast(`移除失败: ${e}`, "error");
    }
  };

  // 点击预设快速填充表单
  const handleApplyPreset = (preset: (typeof AGENT_PRESETS)[0]) => {
    setNewDisplayName(preset.name);
    setNewName(preset.id);
    setNewSkillsPath("");
    setIsAdding(true);
  };

  const content = (
    <div
      className={`flex-1 flex flex-col ${
        !isInline ? "modal-glass rounded-2xl w-full max-w-2xl max-h-[85vh] relative" : "w-full space-y-6"
      }`}
    >
      {!isInline && (
        <div className="px-6 py-4 border-b border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-[var(--foreground)]">
            <Bot className="w-4 h-4 text-[var(--color-primary)]" />
            <h2 className="text-[15px] font-semibold">Agent 同步</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {isInline && (
        <div>
          <h3 className="text-[17px] font-semibold text-[var(--foreground)] tracking-tight">
            Agent 同步
          </h3>
          <p className="text-[12px] text-[var(--color-muted)] mt-1">
            通过符号链接（Symlink）将已启用技能同步至本地 AI 客户端
          </p>
        </div>
      )}

      <div className={`${isInline ? "" : "p-6 overflow-y-auto"} flex-1 space-y-6`}>
        {isAdding ? (
          <div className="rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-white/[0.02] p-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-black/[0.06] dark:border-white/[0.06]">
              <h4 className="text-[13.5px] font-semibold text-[var(--foreground)]">新增 AI 客户端</h4>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="text-[12px] text-[var(--color-muted)] hover:text-[var(--foreground)] px-2 py-1 rounded-md hover:bg-black/5 transition-colors cursor-pointer"
              >
                取消
              </button>
            </div>

            <form onSubmit={handleAddAgent} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-[var(--foreground)] block">
                    名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newDisplayName}
                    onChange={e => setNewDisplayName(e.target.value)}
                    placeholder="如 Cursor、Claude Code"
                    className="w-full px-3 py-1.5 text-[12.5px] rounded-lg border border-black/[0.1] dark:border-white/[0.12] bg-black/[0.015] dark:bg-white/[0.04] text-[var(--foreground)] focus:bg-white focus:outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-[var(--foreground)] block">
                    标识 <span className="text-[var(--color-muted)] font-normal">(可选)</span>
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="如 cursor"
                    className="w-full px-3 py-1.5 text-[12.5px] font-mono rounded-lg border border-black/[0.1] dark:border-white/[0.12] bg-black/[0.015] dark:bg-white/[0.04] text-[var(--foreground)] focus:bg-white focus:outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-[var(--foreground)] block">
                  Skills 目录 <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    readOnly
                    value={newSkillsPath}
                    placeholder="选择该客户端读取 Skills 的文件夹..."
                    className="flex-1 px-3 py-1.5 text-[12px] font-mono rounded-lg border border-black/[0.1] dark:border-white/[0.12] bg-black/[0.015] dark:bg-white/[0.04] text-[var(--foreground)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleBrowseSkillsPath}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-black/[0.1] dark:border-white/[0.12] bg-white dark:bg-white/[0.05] hover:bg-black/[0.03] rounded-lg text-[12px] font-medium text-[var(--foreground)] transition-colors cursor-pointer shrink-0"
                  >
                    <Folder className="w-3.5 h-3.5 opacity-65" />
                    <span>选择目录</span>
                  </button>
                </div>
                <p className="text-[11.5px] text-[var(--color-muted)]">
                  技能将以系统符号链接挂载到此目录，不额外占用磁盘空间
                </p>
              </div>

              <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.06] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading || !newDisplayName || !newSkillsPath}
                  className="px-3.5 py-1.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg text-[12.5px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {loading ? "保存中..." : "确认添加"}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <>
            {/* 分组 1：已接入客户端 */}
            <section className="space-y-2">
              <div className="flex items-center justify-between px-0.5">
                <h4 className="text-[11.5px] font-medium text-[var(--color-muted)]">
                  已接入客户端{agents.length > 0 ? ` (${agents.length})` : ""}
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setNewDisplayName("");
                    setNewName("");
                    setNewSkillsPath("");
                    setIsAdding(true);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg text-[12px] font-medium transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>新增</span>
                </button>
              </div>

              {agents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-black/[0.1] dark:border-white/[0.12] py-8 px-4 text-center">
                  <p className="text-[13px] font-medium text-[var(--foreground)]">暂无已接入客户端</p>
                  <p className="text-[12px] text-[var(--color-muted)] mt-1">
                    点击右上角「新增」或从下方预设快速添加
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-white/[0.02] divide-y divide-black/[0.06] dark:divide-white/[0.06] overflow-hidden">
                  {agents.map(agent => (
                    <div
                      key={agent.id}
                      className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-black/[0.015] dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] text-[var(--foreground)]/70 flex items-center justify-center shrink-0">
                          <Bot className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium text-[var(--foreground)] truncate">
                              {agent.display_name}
                            </span>
                            <span className="text-[11px] font-mono text-[var(--color-muted)]">
                              {agent.name}
                            </span>
                          </div>
                          <div className="text-[11.5px] text-[var(--color-muted)] flex items-center gap-1.5 font-mono mt-0.5">
                            <FolderOpen className="w-3 h-3 opacity-60 shrink-0" />
                            <span className="truncate select-all">{agent.skills_path}</span>
                          </div>
                        </div>
                      </div>

                      <Tooltip content="移除配置">
                        <button
                          type="button"
                          onClick={() => handleDeleteAgent(agent.id, agent.display_name)}
                          aria-label={`移除 ${agent.display_name}`}
                          className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </Tooltip>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 分组 2：快速添加预设 */}
            <section className="space-y-2">
              <h4 className="text-[11.5px] font-medium text-[var(--color-muted)] px-0.5">
                快速添加预设
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {AGENT_PRESETS.map(preset => {
                  const isConfigured = agents.some(
                    a =>
                      a.name.toLowerCase() === preset.id.toLowerCase() ||
                      a.display_name.toLowerCase() === preset.name.toLowerCase()
                  );
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={isConfigured}
                      onClick={() => !isConfigured && handleApplyPreset(preset)}
                      className={`text-left px-3.5 py-3 rounded-xl border transition-all select-none flex items-center justify-between gap-3 ${
                        isConfigured
                          ? "border-black/[0.06] dark:border-white/[0.06] bg-black/[0.015] dark:bg-white/[0.015] opacity-60 cursor-default"
                          : "border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-white/[0.02] hover:border-black/15 dark:hover:border-white/20 cursor-pointer group"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-[var(--foreground)]">
                          {preset.name}
                        </div>
                        <p className="text-[11.5px] text-[var(--color-muted)] mt-0.5 truncate">
                          {preset.desc}
                        </p>
                      </div>

                      {isConfigured ? (
                        <span className="text-[11.5px] text-[var(--color-muted)] inline-flex items-center gap-1 shrink-0">
                          <Check className="w-3.5 h-3.5" />
                          <span>已接入</span>
                        </span>
                      ) : (
                        <span className="text-[12px] text-[var(--color-primary)] inline-flex items-center gap-0.5 shrink-0 font-medium group-hover:translate-x-0.5 transition-transform">
                          <span>配置</span>
                          <ArrowRight className="w-3 h-3" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );

  if (isInline) return content;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 modal-backdrop transition-opacity" onClick={onClose} />
      {content}
    </div>
  );
}
