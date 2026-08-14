import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, FolderGit2, HardDrive, Link as LinkIcon, Unlink, Edit2, Save, Loader2, Copy, Folder, Sparkles } from "lucide-react";
import { Tooltip } from '../ui/Tooltip';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { showToast } from '../ui/Toast';

interface Skill {
  id: string;
  name: string;
  description: string;
  local_path: string;
  source_type: string;
  updated_at: string;
  category: string;
  tags?: string;
  skill_scope?: string;
}

interface AgentConfig {
  id: string;
  display_name: string;
}

interface SyncRecord {
  agent_id: string;
}

interface SkillFile {
  name: string;
  content: string;
  absolute_path: string;
}

interface SkillDetailsDrawerProps {
  skill: Skill | null;
  isOpen: boolean;
  onClose: () => void;
  onGeneratePrompt?: (skill: Skill) => void;
}

export function SkillDetailsDrawer({ skill, isOpen, onClose, onGeneratePrompt }: SkillDetailsDrawerProps) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [syncRecords, setSyncRecords] = useState<SyncRecord[]>([]);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  const [files, setFiles] = useState<SkillFile[]>([]);
  const [activeFile, setActiveFile] = useState<string>("");

  useEffect(() => {
    if (isOpen && skill) {
      const loadContent = async () => {
        setLoading(true);
        try {
          const filesData = await invoke<SkillFile[]>("get_skill_files", { path: skill.local_path });
          setFiles(filesData);
          
          if (filesData.length > 0) {
            setActiveFile(filesData[0].name);
            setContent(filesData[0].content);
            setEditContent(filesData[0].content);
          } else {
            setContent("*未找到任何核心文档 (README.md, SKILL.md 等)*");
            setEditContent("");
          }
          
          const [agentsData, syncsData] = await Promise.all([
            invoke<AgentConfig[]>("get_agents"),
            invoke<SyncRecord[]>("get_sync_records_for_skill", { skillId: skill.id })
          ]);
          setAgents(agentsData);
          setSyncRecords(syncsData);
        } catch (e) {
          console.error(e);
          setContent(`*加载内容失败： ${skill.name}*\n\n\`\`\`\n${e}\n\`\`\``);
        } finally {
          setLoading(false);
        }
      };
      loadContent();
    } else {
      setContent("");
      setEditContent("");
      setIsEditing(false);
      setAgents([]);
      setSyncRecords([]);
      setFiles([]);
    }
  }, [isOpen, skill]);

  const handleTabChange = (filename: string) => {
    setActiveFile(filename);
    const file = files.find(f => f.name === filename);
    const text = file ? file.content : "";
    setContent(text);
    setEditContent(text);
    setIsEditing(false);
  };

  const handleToggleSync = async (agentId: string, isSynced: boolean) => {
    if (!skill) return;
    setSyncing(prev => ({ ...prev, [agentId]: true }));
    try {
      if (isSynced) {
        await invoke("unsync_skill", { skillId: skill.id, agentId });
        setSyncRecords(prev => prev.filter(r => r.agent_id !== agentId));
      } else {
        await invoke("sync_skill", { skillId: skill.id, agentId });
        setSyncRecords(prev => [...prev, { agent_id: agentId }]);
      }
    } catch (e) {
      console.error(e);
      alert(`操作失败: ${e}`);
    } finally {
      setSyncing(prev => ({ ...prev, [agentId]: false }));
    }
  };

  const handleSave = async () => {
    if (!skill) return;
    const activeFileData = files.find(f => f.name === activeFile);
    if (!activeFileData) return;
    
    setSaving(true);
    try {
      await invoke("save_skill_file_by_path", { absolutePath: activeFileData.absolute_path, content: editContent });
      setFiles(prev => prev.map(f => f.name === activeFile ? { ...f, content: editContent } : f));
      setContent(editContent);
      setIsEditing(false);
    } catch (e) {
      console.error(e);
      alert(`保存失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/10 backdrop-blur-sm z-40 transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      ></div>

      {/* Drawer */}
      <div 
        className={`fixed inset-y-0 right-0 w-[600px] max-w-[90vw] bg-white/90 backdrop-blur-xl border-l border-[var(--color-border)] z-50 shadow-2xl flex flex-col transition-transform duration-500 ${isOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)] shrink-0">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${skill?.source_type === 'github' ? 'bg-[#024ad8]/10 text-[#024ad8]' : 'bg-fuchsia-500/10 text-fuchsia-600'}`}>
              {skill?.source_type === 'github' ? <FolderGit2 className="w-5 h-5" /> : <HardDrive className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-xl font-medium text-[var(--foreground)] leading-none mb-1">{skill?.name}</h2>
              <div className="flex items-center space-x-1.5 mb-1.5">
                <Tooltip content={skill?.local_path || ""}>
                  <p className="text-[11px] text-[var(--color-muted)] truncate max-w-[380px] cursor-default">{skill?.local_path}</p>
                </Tooltip>
                {skill?.local_path && (
                  <div className="flex items-center space-x-1 shrink-0">
                    <Tooltip content="在本地打开">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await invoke("reveal_in_finder", { path: skill.local_path });
                          } catch (err) {
                            console.error("Failed to open folder:", err);
                          }
                        }}
                        className="p-1 rounded hover:bg-black/5 text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors"
                      >
                        <Folder size={13} />
                      </button>
                    </Tooltip>
                    <Tooltip content="复制路径">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(skill.local_path);
                          showToast("skill文件路径已复制到剪切板");
                        }}
                        className="p-1 rounded hover:bg-black/5 text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors"
                      >
                        <Copy size={13} />
                      </button>
                    </Tooltip>
                  </div>
                )}
              </div>
              
              {/* Category & Tags Display */}
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                {skill?.category && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-[var(--color-muted-bg)] text-[var(--color-muted)] border border-[var(--color-border)] rounded-full">
                    {skill.category === 'Role' ? '角色' :
                     skill.category === 'Guideline' ? '规范' :
                     skill.category === 'Workflow' ? '工作流' :
                     skill.category === 'Knowledge' ? '知识库' : '其他'}
                  </span>
                )}
                {skill?.tags && skill.tags.split(',').map(t => t.trim()).filter(Boolean).map((tag, idx) => (
                  <span key={idx} className="text-[10px] px-1.5 py-0.5 bg-[var(--color-primary)]/10 text-[var(--color-primary)] rounded-full truncate max-w-[100px]">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Tooltip content="智能引用提示词">
              <button
                onClick={() => skill && onGeneratePrompt?.(skill)}
                disabled={!onGeneratePrompt}
                className="p-1.5 rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)] transition-colors disabled:opacity-30"
              >
                <Sparkles className="w-4 h-4" />
              </button>
            </Tooltip>
            {!isEditing && (
              <Tooltip content="编辑文档">
                <button onClick={() => setIsEditing(true)} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)] transition-colors">
                  <Edit2 className="w-4 h-4" />
                </button>
              </Tooltip>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] transition-colors ml-2">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {agents.length > 0 && (
          <div className="px-8 py-4 border-b border-[var(--color-border)] bg-[var(--color-muted-bg)]/30 shrink-0">
            <h3 className="text-xs font-medium text-[var(--color-muted)] mb-3">同步至 AI Agent</h3>
            <div className="flex flex-wrap gap-2">
              {agents.map((agent) => {
                const isSynced = syncRecords.some(r => r.agent_id === agent.id);
                return (
                  <button
                    key={agent.id}
                    disabled={syncing[agent.id]}
                    onClick={() => handleToggleSync(agent.id, isSynced)}
                    className={`flex items-center px-2 py-1 rounded-md border text-xs font-medium transition-all ${
                      isSynced 
                        ? "bg-black/5 border-transparent text-[var(--foreground)] hover:bg-black/10" 
                        : "bg-transparent border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5"
                    } disabled:opacity-50`}
                  >
                    {syncing[agent.id] ? (
                      <div className="w-3.5 h-3.5 mr-1.5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                    ) : isSynced ? (
                      <LinkIcon className="w-3.5 h-3.5 mr-1.5" />
                    ) : (
                      <Unlink className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    {agent.display_name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-8 relative flex flex-col">
          {(!loading && !isEditing && files.length > 0) && (
            <div className="mb-6 shrink-0 w-full overflow-hidden">
              <div className="flex space-x-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] w-full p-1 bg-black/5 rounded-lg border border-black/5">
                {files.map(f => (
                  <button 
                    key={f.name}
                    onClick={() => handleTabChange(f.name)}
                    className={`px-3 py-1 text-[13px] transition-all rounded-md whitespace-nowrap outline-none ${
                      activeFile === f.name 
                        ? 'bg-white text-[var(--foreground)] font-medium border border-black/5' 
                        : 'text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)]'
                    }`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin opacity-50" />
            </div>
          ) : isEditing ? (
            <div className="flex-1 flex flex-col h-full">
              <div className="flex items-center justify-between mb-3 shrink-0">
                <span className="text-sm font-medium text-[var(--color-muted)]">编辑 {activeFile}</span>
                <div className="flex items-center space-x-2">
                  <button onClick={() => setIsEditing(false)} className="px-2.5 py-1 rounded-md text-[13px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-all">
                    取消
                  </button>
                  <button onClick={handleSave} disabled={saving} className="flex items-center px-2.5 py-1 bg-[var(--color-foreground)] text-white rounded-md text-[13px] font-medium hover:bg-black transition-all">
                    {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                    保存
                  </button>
                </div>
              </div>
              <textarea 
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="flex-1 w-full p-4 bg-[var(--color-muted-bg)]/50 border border-[var(--color-border)] rounded-lg outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 resize-none font-mono text-[13px] text-[var(--foreground)] leading-relaxed"
                placeholder="在此编写您的 Markdown 文档..."
              />
            </div>
          ) : (
            <div className="prose max-w-none prose-headings:text-left prose-a:text-[#024ad8] pb-10">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                {content ? content.replace(/^\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/, '') : ""}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
