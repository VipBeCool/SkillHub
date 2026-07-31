import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { X, Plus, Trash2, Bot, Folder } from "lucide-react";
import { Tooltip } from "../ui/Tooltip";

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
}

export function AgentSettingsDialog({ isOpen, onClose }: AgentSettingsDialogProps) {
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
      setAgents(data);
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
    } catch (e) {
      console.error(e);
      alert(`添加失败: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAgent = async (id: string) => {
    if (!confirm("确定要删除此 Agent 吗？相关同步记录也将被删除。")) return;
    try {
      await invoke("delete_agent", { id });
      await fetchAgents();
    } catch (e) {
      console.error(e);
      alert(`删除失败: ${e}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-sm p-4">
      <div className="bg-white/90 backdrop-blur-xl border border-[var(--color-border)] rounded-2xl w-full max-w-2xl max-h-[85vh] shadow-2xl flex flex-col relative">
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2 text-[var(--foreground)]">
            <Bot className="w-5 h-5 text-[var(--color-primary)]" />
            <h2 className="text-lg font-medium">Agent 设置与同步</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-[var(--foreground)]">已配置的 Agent 列表</h3>
              {!isAdding && (
                <button
                  onClick={() => setIsAdding(true)}
                  className="flex items-center px-2.5 py-1 bg-[var(--color-foreground)] text-white rounded-md text-[13px] font-medium hover:bg-black transition-all"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  新增 Agent
                </button>
              )}
            </div>

            {isAdding && (
              <form onSubmit={handleAddAgent} className="p-4 bg-[var(--color-muted-bg)]/50 border border-[var(--color-border)] rounded-xl space-y-4">
                <h4 className="text-sm font-medium text-[var(--foreground)] mb-2">添加新的 Agent</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--foreground)]">显示名称</label>
                    <input
                      type="text"
                      required
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                      placeholder="例如: Cursor"
                      className="input-field w-full"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--foreground)]">内部标识名</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="选填 (如: cursor)"
                      className="input-field w-full"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--foreground)]">Skills 挂载目录</label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      required
                      readOnly
                      value={newSkillsPath}
                      placeholder="该 Agent 读取技能的本地目录..."
                      className="input-field flex-1"
                    />
                    <button type="button" onClick={handleBrowseSkillsPath} className="flex items-center px-2.5 py-0.5 border border-[var(--color-border)] bg-white rounded-md text-[12px] font-medium hover:bg-black/5 transition-colors">
                      <Folder className="w-4 h-4 mr-1" />
                      浏览
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--color-muted)] mt-1">技能将会以符号链接的形式同步到此文件夹中。</p>
                </div>
                <div className="pt-2 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="px-3 py-1.5 rounded-md text-[13px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-all"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !newDisplayName || !newSkillsPath}
                    className="flex items-center px-2.5 py-1 bg-[var(--color-foreground)] text-white rounded-md text-[13px] font-medium hover:bg-black transition-all"
                  >
                    {loading ? "保存中..." : "保存 Agent"}
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2">
              {agents.length === 0 && !isAdding ? (
                <div className="text-center py-8 text-[var(--color-muted)] border border-dashed border-[var(--color-border)] rounded-xl">
                  <p className="text-sm">暂未配置任何 Agent。</p>
                  <p className="text-xs mt-1">点击右上角“新增 Agent”开始配置。</p>
                </div>
              ) : (
                agents.map((agent) => (
                  <div key={agent.id} className="flex flex-col p-4 bg-black/5 rounded-xl hover:bg-black/10 transition-colors border border-transparent">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-lg bg-[var(--color-muted-bg)] border border-[var(--color-border)] flex items-center justify-center shrink-0">
                          <Bot className="w-5 h-5 text-[var(--color-primary)]" />
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-[var(--foreground)]">{agent.display_name}</h4>
                          <div className="text-xs text-[var(--color-muted)] font-mono mt-0.5">ID: {agent.name}</div>
                        </div>
                      </div>
                      <Tooltip content="删除 Agent">
                        <button 
                          onClick={() => handleDeleteAgent(agent.id)}
                          className="p-1.5 rounded-lg text-[var(--color-muted)] hover:bg-red-50 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </Tooltip>
                    </div>
                    <div className="mt-3 text-xs text-[var(--foreground)] bg-[var(--color-muted-bg)]/50 p-2 rounded border border-[var(--color-border)] break-all flex items-start">
                      <Folder className="w-3.5 h-3.5 mr-1.5 text-[var(--color-muted)] shrink-0 mt-0.5" />
                      <span className="opacity-80">{agent.skills_path}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
