import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { X, Plus, Trash2, Folder, Bot, Sparkles, ArrowRight, Check, FolderOpen, Info } from "lucide-react";
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

// 常见主流智能体预设推荐
const AGENT_PRESETS = [
  {
    name: "Cursor",
    id: "cursor",
    tag: "代码编辑器",
    desc: "AI 驱动的现代 IDE，支持项目与全局技能挂载",
    defaultPath: "~/.cursor/skills"
  },
  {
    name: "Claude Code",
    id: "claude-code",
    tag: "终端 CLI",
    desc: "Anthropic 官方终端智能体，直读技能目录",
    defaultPath: "~/.claude/skills"
  },
  {
    name: "Windsurf",
    id: "windsurf",
    tag: "Cascade",
    desc: "Codeium 打造的流式深度协作代码编辑器",
    defaultPath: "~/.codeium/windsurf/skills"
  },
  {
    name: "Antigravity",
    id: "antigravity",
    tag: "智能协同",
    desc: "Google DeepMind 高级智能体协同架构",
    defaultPath: ".agents/skills"
  }
];

export function AgentSettingsDialog({ isOpen, onClose, isInline = false }: AgentSettingsDialogProps) {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(false);

  // New agent form
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
        name: newName || newDisplayName.toLowerCase().replace(/\s+/g, '-'),
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
      showToast(`已成功添加智能体 ${newDisplayName}`, "success");
    } catch (e) {
      console.error(e);
      showToast(`添加失败: ${e}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAgent = async (id: string, name: string) => {
    if (!confirm(`确定要移除智能体「${name}」的配置吗？相关技能软链接将同步取消。`)) return;
    try {
      await invoke("delete_agent", { id });
      await fetchAgents();
      showToast(`已移除智能体 ${name}`, "info");
    } catch (e) {
      console.error(e);
      showToast(`删除失败: ${e}`, "error");
    }
  };

  // 点击预设快速填充
  const handleApplyPreset = (preset: typeof AGENT_PRESETS[0]) => {
    setNewDisplayName(preset.name);
    setNewName(preset.id);
    setNewSkillsPath("");
    setIsAdding(true);
  };

  const content = (
    <div className={`flex-1 flex flex-col ${!isInline ? "modal-glass rounded-2xl w-full max-w-2xl max-h-[85vh] relative" : "w-full space-y-4"}`}>
      {!isInline && (
        <div className="px-6 py-4 border-b border-black/5 dark:border-white/5 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2 text-[var(--foreground)]">
            <Bot className="w-5 h-5 text-[var(--color-primary)]" />
            <h2 className="text-base font-semibold">Agent 同步配置</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {isInline && (
        <div className="mb-2">
          <h3 className="text-xl font-bold text-[var(--foreground)]">Agent 同步配置</h3>
          <p className="text-[var(--color-muted)] mt-0.5 text-xs">
            管理您的本地 AI 智能体，并通过系统级软链接 (Symlink) 将已启用的技能自动挂载到其工作目录。
          </p>
        </div>
      )}

      <div className={`${isInline ? "" : "p-6 overflow-y-auto"} flex-1 space-y-4`}>
        {isAdding ? (
          <div className="bg-white dark:bg-[#1A1A1A] border border-black/5 dark:border-white/5 rounded-xl p-5 shadow-sm animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-black/5 dark:border-white/5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                  <Plus className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-[var(--foreground)]">添加新的 AI 智能体</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="text-xs text-[var(--color-muted)] hover:text-[var(--foreground)] px-2 py-1 rounded hover:bg-black/5 transition-colors cursor-pointer"
              >
                取消
              </button>
            </div>
            
            <form onSubmit={handleAddAgent} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--foreground)]">
                    智能体名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    placeholder="例如: Cursor / Claude Code"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] text-[var(--foreground)] focus:outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--foreground)]">
                    内部标识名 <span className="text-[var(--color-muted)] font-normal text-[11px]">(用于配置识别，可选)</span>
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="例如: cursor"
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] text-[var(--foreground)] focus:outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--foreground)]">
                  Skills 挂载目录 <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    readOnly
                    value={newSkillsPath}
                    placeholder="点击右侧浏览选择该智能体读取 Skills 的文件夹..."
                    className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] text-[var(--foreground)] focus:outline-none focus:border-[var(--color-primary)]"
                  />
                  <button
                    type="button"
                    onClick={handleBrowseSkillsPath}
                    className="flex items-center px-3.5 py-2 border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.05] hover:bg-black/5 dark:hover:bg-white/10 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0"
                  >
                    <Folder className="w-3.5 h-3.5 mr-1.5 opacity-70" />
                    选择目录
                  </button>
                </div>
                <p className="text-[11px] text-[var(--color-muted)] mt-1">
                  💡 技能将以原生符号链接的形式挂载至此目录中，智能体可实时读取，不消耗双份磁盘。
                </p>
              </div>

              <div className="pt-3 border-t border-black/5 dark:border-white/5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading || !newDisplayName || !newSkillsPath}
                  className="flex items-center px-4 py-1.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm cursor-pointer"
                >
                  {loading ? "保存中..." : "确认添加"}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 卡片 1：已配置的 Agent 列表 */}
            <div className="bg-white dark:bg-[#1A1A1A] border border-black/5 dark:border-white/5 rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-[13px] font-semibold text-[var(--foreground)]">已接入的智能体</h4>
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-black/5 dark:bg-white/10 text-[var(--color-muted)]">
                        {agents.length} 个配置
                      </span>
                    </div>
                    <p className="text-xs text-[var(--color-muted)] mt-0.5">
                      管理当前已建立软链接同步的 AI Agent 客户端
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setNewDisplayName("");
                    setNewName("");
                    setNewSkillsPath("");
                    setIsAdding(true);
                  }}
                  className="flex items-center px-3 py-1.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg text-xs font-medium transition-colors shadow-sm cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  新增 Agent
                </button>
              </div>

              {/* 列表渲染 */}
              {agents.length === 0 ? (
                <div className="text-center py-7 px-4 border border-dashed border-black/10 dark:border-white/10 rounded-xl bg-black/[0.01] dark:bg-white/[0.01]">
                  <Bot className="w-8 h-8 text-[var(--color-muted)]/50 mx-auto mb-2" />
                  <p className="text-xs font-medium text-[var(--foreground)]">暂未配置任何 Agent 挂载路径</p>
                  <p className="text-[11px] text-[var(--color-muted)] mt-1">
                    点击右上角“新增 Agent”或在下方选择常用客户端预设快速接入
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-black/5 dark:divide-white/5 border border-black/5 dark:border-white/5 rounded-lg overflow-hidden bg-black/[0.01] dark:bg-white/[0.01]">
                  {agents.map((agent) => (
                    <div key={agent.id} className="p-3.5 flex items-center justify-between gap-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* 动态 Avatar */}
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/15 to-blue-500/15 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs shrink-0 shadow-xs">
                          {agent.display_name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold text-[var(--foreground)]">
                              {agent.display_name}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono text-[var(--color-muted)] bg-black/5 dark:bg-white/10">
                              {agent.name}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              Symlink 实时同步
                            </span>
                          </div>
                          <div className="text-[11px] text-[var(--color-muted)] flex items-center gap-1.5 font-mono">
                            <FolderOpen className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
                            <span className="truncate select-all max-w-[460px]">{agent.skills_path}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Tooltip content="删除该智能体配置">
                          <button
                            onClick={() => handleDeleteAgent(agent.id, agent.display_name)}
                            className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 卡片 2：常用 AI 智能体推荐挂载预设（消除空白，提升易用性） */}
            <div className="bg-white dark:bg-[#1A1A1A] border border-black/5 dark:border-white/5 rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-[13px] font-semibold text-[var(--foreground)]">常用智能体快速接入预设</h4>
                    <p className="text-[11px] text-[var(--color-muted)]">点击预设可自动填充参数，方便快速指定挂载路径</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {AGENT_PRESETS.map((preset) => {
                  const isConfigured = agents.some(a => a.name.toLowerCase() === preset.id.toLowerCase() || a.display_name.toLowerCase() === preset.name.toLowerCase());
                  return (
                    <div
                      key={preset.id}
                      onClick={() => !isConfigured && handleApplyPreset(preset)}
                      className={`p-3 rounded-xl border transition-all select-none flex items-center justify-between gap-3 ${
                        isConfigured
                          ? "border-black/5 dark:border-white/5 bg-black/[0.01] dark:bg-white/[0.01] opacity-60 cursor-default"
                          : "border-black/5 dark:border-white/5 hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/[0.02] bg-black/[0.01] dark:bg-white/[0.01] cursor-pointer group"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-[var(--foreground)]">{preset.name}</span>
                          <span className="text-[10px] text-[var(--color-muted)] px-1 rounded bg-black/5 dark:bg-white/10 font-mono">
                            {preset.tag}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--color-muted)] mt-0.5 truncate">{preset.desc}</p>
                      </div>

                      {isConfigured ? (
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5 shrink-0 font-medium">
                          <Check className="w-3.5 h-3.5" /> 已接入
                        </span>
                      ) : (
                        <span className="text-[11px] text-[var(--color-primary)] flex items-center gap-0.5 shrink-0 font-medium group-hover:translate-x-0.5 transition-transform">
                          配置 <ArrowRight className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 卡片 3：底层同步机制说明 */}
            <div className="p-3 bg-black/[0.02] dark:bg-white/[0.02] rounded-xl border border-black/5 dark:border-white/5 flex items-start gap-2.5 text-xs text-[var(--color-muted)] leading-relaxed">
              <Info className="w-4 h-4 text-blue-500/80 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-[var(--foreground)]">说明：</span>
                SkillHub 通过操作系统底层符号链接（Symlink）与各 Agent 挂载目录互联，技能无需多份拷贝即可被智能体秒级感知。当您在 SkillHub 安装、启用或修改任何技能时，所有已配置的 Agent 均会实时保持最新。
              </div>
            </div>
          </div>
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
