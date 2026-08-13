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
            {isAdding ? (
              <div className="animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center space-x-2 mb-4 pb-3 border-b border-[var(--color-border)]/50">
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="p-1.5 rounded-md hover:bg-black/5 text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>
                  <h3 className="text-sm font-medium text-[var(--foreground)]">添加新的 Agent</h3>
                </div>
                
                <form onSubmit={handleAddAgent} className="space-y-5 px-1">
                  <div className="grid grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <label className="text-[13px] font-medium text-[var(--foreground)]">显示名称</label>
                      <input
                        type="text"
                        required
                        value={newDisplayName}
                        onChange={(e) => setNewDisplayName(e.target.value)}
                        placeholder="例如: Cursor"
                        className="input-field w-full py-2"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[13px] font-medium text-[var(--foreground)]">内部标识名 <span className="text-[var(--color-muted)] font-normal">(可选)</span></label>
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="例如: cursor"
                        className="input-field w-full py-2"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[13px] font-medium text-[var(--foreground)]">Skills 挂载目录</label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        required
                        readOnly
                        value={newSkillsPath}
                        placeholder="该 Agent 读取技能的本地目录..."
                        className="input-field flex-1 py-2"
                      />
                      <button type="button" onClick={handleBrowseSkillsPath} className="flex items-center px-4 border border-[var(--color-border)] bg-white rounded-md text-[13px] font-medium hover:bg-black/5 transition-colors">
                        <Folder className="w-4 h-4 mr-1.5 opacity-70" />
                        浏览
                      </button>
                    </div>
                    <p className="text-[12px] text-[var(--color-muted)] mt-1">技能将会以符号链接的形式同步到此文件夹中。</p>
                  </div>
                  <div className="pt-6 pb-2 flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => setIsAdding(false)}
                      className="px-4 py-2 rounded-md text-[13px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-all"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      disabled={loading || !newDisplayName || !newSkillsPath}
                      className="flex items-center px-5 py-2 bg-[var(--color-foreground)] text-white rounded-md text-[13px] font-medium hover:bg-black transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                      {loading ? "保存中..." : "保存 Agent"}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="animate-in fade-in duration-200 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-[var(--foreground)]">已配置的 Agent 列表</h3>
                  <button
                    onClick={() => setIsAdding(true)}
                    className="flex items-center px-3 py-1.5 bg-[var(--color-foreground)] text-white rounded-md text-[13px] font-medium hover:bg-black transition-all shadow-sm"
                  >
                    <Plus className="w-4 h-4 mr-1.5" />
                    新增 Agent
                  </button>
                </div>
                
                <div className="space-y-3">
                  {agents.length === 0 ? (
                    <div className="text-center py-10 text-[var(--color-muted)] border border-dashed border-[var(--color-border)] rounded-xl bg-black/[0.02]">
                      <p className="text-sm font-medium mb-1 text-[var(--foreground)]">暂未配置任何 Agent</p>
                      <p className="text-[13px]">点击右上角“新增 Agent”开始配置</p>
                    </div>
                  ) : (
                    agents.map((agent) => (
                      <div key={agent.id} className="flex flex-col p-4 bg-white rounded-xl border border-[var(--color-border)] hover:border-black/20 hover:shadow-sm transition-all">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
                              <Bot className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="text-[14px] font-semibold text-[var(--foreground)]">{agent.display_name}</h4>
                              <div className="text-[12px] text-[var(--color-muted)] font-mono mt-0.5 opacity-80">ID: {agent.name}</div>
                            </div>
                          </div>
                          <Tooltip content="删除 Agent">
                            <button 
                              onClick={() => handleDeleteAgent(agent.id)}
                              className="p-1.5 rounded-lg text-[var(--color-muted)] hover:bg-red-50 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-4.5 h-4.5" />
                            </button>
                          </Tooltip>
                        </div>
                        <div className="mt-3.5 text-[12px] text-[var(--foreground)] bg-black/[0.03] p-2.5 rounded-lg border border-black/5 break-all flex items-start">
                          <Folder className="w-4 h-4 mr-2 text-[var(--color-muted)] shrink-0 mt-0.5" />
                          <span className="opacity-80 leading-relaxed">{agent.skills_path}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
