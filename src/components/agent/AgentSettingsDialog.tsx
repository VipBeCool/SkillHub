import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { X, Plus, Trash2, Folder } from "lucide-react";
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
  isInline?: boolean;
}

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

  const content = (
    <div className={`flex-1 flex flex-col ${!isInline ? "modal-glass rounded-2xl w-full max-w-2xl max-h-[85vh] relative" : "w-full"}`}>
      {!isInline && (
        <div className="px-6 py-4 border-b border-black/5 dark:border-white/5 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2 text-[var(--foreground)]">
            <h2 className="text-sm font-semibold">Agent 同步配置</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      <div className={`${isInline ? "" : "p-6 overflow-y-auto"} flex-1`}>
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
                      className="flex items-center px-4 py-1.5 bg-[var(--primary-color)] text-white rounded-md text-[13px] font-medium hover:bg-[var(--primary-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
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
                    className="flex items-center px-2.5 py-1.5 bg-white border border-black/10 rounded-md text-[12px] font-medium hover:bg-black/5 transition-colors shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    新增
                  </button>
                </div>
                
                <div className="space-y-2">
                  {agents.length === 0 ? (
                    <div className="text-center py-8 text-[var(--color-muted)] border border-dashed border-black/10 dark:border-white/10 rounded-xl bg-black/[0.01]">
                      <p className="text-[13px] font-medium mb-1 text-[var(--foreground)]">暂未配置任何 Agent</p>
                      <p className="text-[12px]">点击右上角“新增”开始配置</p>
                    </div>
                  ) : (
                    <div className="bg-white dark:bg-[#1A1A1A] border border-black/5 dark:border-white/5 rounded-xl overflow-hidden divide-y divide-black/5 dark:divide-white/5">
                      {agents.map((agent) => (
                        <div key={agent.id} className="flex flex-col p-4 transition-all">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center space-x-3">
                              <div>
                                <h4 className="text-[13px] font-semibold text-[var(--foreground)]">{agent.display_name}</h4>
                                <div className="text-[12px] text-[var(--color-muted)] font-mono mt-0.5">{agent.name}</div>
                              </div>
                            </div>
                            <Tooltip content="删除">
                              <button 
                                onClick={() => handleDeleteAgent(agent.id)}
                                className="p-1 rounded-md text-[var(--color-muted)] hover:bg-red-50 hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </Tooltip>
                          </div>
                          <div className="mt-2 text-[12px] text-[var(--color-muted)] flex items-center">
                            <Folder className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                            <span className="truncate">{agent.skills_path}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
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
