import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { X, Folder, Plus, Copy, ArrowRightLeft } from 'lucide-react';
import { SourceDirectory } from '../../types';

export const COMMON_AGENT_PATHS = [
  { name: 'Claude Desktop', path: '~/Library/Application Support/Claude/skills', id: 'claude' },
  { name: 'Cursor', path: '~/.cursor/skills', id: 'cursor' },
  { name: 'Trae', path: '~/.trae/skills', id: 'trae' },
  { name: 'Windsurf', path: '~/.windsurf/skills', id: 'windsurf' },
  { name: 'Codebuddy (海外)', path: '~/.codebuddy/skills', id: 'codebuddy_overseas' },
  { name: 'Codebuddy (中文)', path: '~/.codebuddy_cn/skills', id: 'codebuddy_cn' },
  { name: 'Antigravity', path: '~/.gemini/skills', id: 'antigravity' },
];

interface CreateSkillLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (id?: string) => void;
}

export function CreateSkillLibraryModal({ isOpen, onClose, onSuccess }: CreateSkillLibraryModalProps) {
  const [name, setName] = useState('');
  const [folderName, setFolderName] = useState('');
  const [parentPath, setParentPath] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setFolderName('');
      setParentPath('');
      setLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectPath = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: '选择本地路径'
    });
    if (selected && !Array.isArray(selected)) {
      setParentPath(selected);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !folderName || !parentPath) return;
    
    setLoading(true);
    try {
      const fullPath = `${parentPath}/${folderName}`.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
      const id = await invoke<string>('create_local_skill_library', {
        name,
        path: fullPath
      });
      onSuccess(id);
      onClose();
    } catch (err) {
      alert(`创建失败: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 modal-backdrop transition-opacity" onClick={onClose} />
      <div className="modal-glass rounded-2xl w-full max-w-md overflow-hidden flex flex-col relative transition-all duration-300">
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]/60 bg-[#fafbfc]">
          <h2 className="text-[15px] font-semibold text-[var(--foreground)] flex items-center">
            <Plus className="w-4 h-4 mr-2 text-blue-500" />
            创建技能库
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:bg-black/5 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5 flex flex-col space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted)] mb-1.5 uppercase tracking-wider">技能库名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!folderName || folderName === name) setFolderName(e.target.value);
              }}
              placeholder=""
              className="w-full bg-[#f8f9fa] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[13px] text-[var(--foreground)] placeholder:text-gray-400 outline-none focus:border-blue-500 focus:bg-white transition-colors"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted)] mb-1.5 uppercase tracking-wider">本地文件夹名称</label>
            <input
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="将在磁盘上创建此文件夹"
              className="w-full bg-[#f8f9fa] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[13px] text-[var(--foreground)] placeholder:text-gray-400 outline-none focus:border-blue-500 focus:bg-white transition-colors"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted)] mb-1.5 uppercase tracking-wider">技能库本地目录</label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={parentPath}
                readOnly
                placeholder="技能库文件夹的本地存储目录"
                className="flex-1 bg-[#f8f9fa] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[13px] text-[var(--color-muted)] placeholder:text-gray-400 outline-none cursor-pointer"
                onClick={handleSelectPath}
                required
              />
              <button
                type="button"
                onClick={handleSelectPath}
                className="px-3 py-2 bg-white border border-[var(--color-border)] rounded-lg text-[13px] font-medium text-[var(--foreground)] hover:bg-[#f8f9fa] transition-colors"
              >
                浏览...
              </button>
            </div>
          </div>
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || !name || !folderName || !parentPath}
              className="w-full flex items-center justify-center px-4 py-2 bg-blue-500 text-white rounded-lg text-[13px] font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? "创建中..." : "创建技能库"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface OpenSkillLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (id?: string) => void;
}

export function OpenSkillLibraryModal({ isOpen, onClose, onSuccess }: OpenSkillLibraryModalProps) {
  const [tab, setTab] = useState<'local' | 'agent'>('local');
  const [name, setName] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTab('local');
      setName('');
      setLocalPath('');
      setLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectPath = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: '选择技能库文件夹'
    });
    if (selected && !Array.isArray(selected)) {
      setLocalPath(selected);
      // Auto fill name based on folder name
      const folderName = selected.split(/[/\\]/).pop();
      if (folderName && !name) {
        setName(folderName);
      }
    }
  };

  const handleSubmitLocal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !localPath) return;
    setLoading(true);
    try {
      const id = await invoke<string>('add_source_directory', { path: localPath, dirType: 'local' });
      await invoke('scan_and_add_source_directory', { path: localPath, dirType: 'local', strategy: 'none', targetDir: null });
      onSuccess(id);
      onClose();
    } catch (err) {
      alert(`打开失败: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleImportAgent = async (agentPath: string, agentName: string) => {
    setLoading(true);
    try {
      await invoke('create_local_skill_library', { name: `${agentName} 技能库`, path: agentPath });
      onSuccess();
      onClose();
    } catch (err) {
      alert(`导入失败 (可能路径不存在): ${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 modal-backdrop transition-opacity" onClick={onClose} />
      <div className="modal-glass rounded-2xl w-full max-w-md overflow-hidden flex flex-col relative transition-all duration-300">
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]/60 bg-[#fafbfc]">
          <h2 className="text-[15px] font-semibold text-[var(--foreground)] flex items-center">
            <Folder className="w-4 h-4 mr-2 text-blue-500" />
            以本地文件夹创建
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:bg-black/5 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex border-b border-[var(--color-border)]/60">
          <button
            className={`flex-1 py-2 text-[13px] font-medium text-center transition-colors ${tab === 'local' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-[var(--color-muted)] hover:bg-black/5'}`}
            onClick={() => setTab('local')}
          >
            本地技能文件夹
          </button>
          <button
            className={`flex-1 py-2 text-[13px] font-medium text-center transition-colors ${tab === 'agent' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-[var(--color-muted)] hover:bg-black/5'}`}
            onClick={() => setTab('agent')}
          >
            常见Agent技能文件夹
          </button>
        </div>

        <div className="p-5">
          {tab === 'local' ? (
            <form onSubmit={handleSubmitLocal} className="flex flex-col space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--color-muted)] mb-1.5 uppercase tracking-wider">选择本地文件夹</label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={localPath}
                    readOnly
                    placeholder="点击浏览选择文件夹..."
                    className="flex-1 bg-[#f8f9fa] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[13px] text-[var(--color-muted)] outline-none cursor-pointer"
                    onClick={handleSelectPath}
                    required
                  />
                  <button
                    type="button"
                    onClick={handleSelectPath}
                    className="px-3 py-2 bg-white border border-[var(--color-border)] rounded-lg text-[13px] font-medium text-[var(--foreground)] hover:bg-[#f8f9fa] transition-colors"
                  >
                    浏览...
                  </button>
                </div>
              </div>
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading || !localPath}
                  className="w-full flex items-center justify-center px-4 py-2 bg-blue-500 text-white rounded-lg text-[13px] font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loading ? "处理中..." : "打开"}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-col space-y-2">
              <p className="text-xs text-[var(--color-muted)] mb-2">直接接入以下常用 AI 工具的默认技能目录。</p>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {COMMON_AGENT_PATHS.map(agent => (
                  <button
                    key={agent.id}
                    onClick={() => handleImportAgent(agent.path, agent.name)}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-[var(--color-border)] hover:border-blue-400 hover:bg-blue-50 transition-all text-left group"
                  >
                    <div>
                      <div className="text-[13px] font-medium text-[var(--foreground)] group-hover:text-blue-600">{agent.name}</div>
                      <div className="text-[10px] text-[var(--color-muted)] mt-0.5">{agent.path}</div>
                    </div>
                    <Plus className="w-4 h-4 text-[var(--color-muted)] group-hover:text-blue-500" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface MergeSkillLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  targetLibrary: SourceDirectory | null;
}

export function MergeSkillLibraryModal({ isOpen, onClose, onSuccess, targetLibrary }: MergeSkillLibraryModalProps) {
  const [sourcePath, setSourcePath] = useState('');
  const [strategy, setStrategy] = useState<'move' | 'copy'>('move');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSourcePath('');
      setStrategy('move');
      setLoading(false);
    }
  }, [isOpen]);

  if (!isOpen || !targetLibrary) return null;

  const handleSelectPath = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: '选择要被合并的文件夹'
    });
    if (selected && !Array.isArray(selected)) {
      setSourcePath(selected);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourcePath) return;
    
    setLoading(true);
    try {
      const result = await invoke<string>('merge_skill_libraries', {
        targetId: targetLibrary.id,
        sourcePath,
        strategy
      });
      alert(result);
      onSuccess();
      onClose();
    } catch (err) {
      alert(`合并失败: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 modal-backdrop transition-opacity" onClick={onClose} />
      <div className="modal-glass rounded-2xl w-full max-w-md overflow-hidden flex flex-col relative transition-all duration-300">
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]/60 bg-[#fafbfc]">
          <h2 className="text-[15px] font-semibold text-[var(--foreground)] flex items-center">
            <ArrowRightLeft className="w-4 h-4 mr-2 text-blue-500" />
            合并其它技能库
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--color-muted)] hover:bg-black/5 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5 flex flex-col space-y-4">
          <div className="bg-blue-50 text-blue-800 text-[12px] p-3 rounded-lg flex items-start border border-blue-100">
            <div>将把选中文件夹内的技能转移至当前库：<br/><span className="font-semibold">{targetLibrary.label}</span></div>
          </div>
          
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted)] mb-1.5 uppercase tracking-wider">选择要被合并的本地文件夹</label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={sourcePath}
                readOnly
                placeholder="点击浏览..."
                className="flex-1 bg-[#f8f9fa] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[13px] text-[var(--color-muted)] outline-none cursor-pointer"
                onClick={handleSelectPath}
                required
              />
              <button
                type="button"
                onClick={handleSelectPath}
                className="px-3 py-2 bg-white border border-[var(--color-border)] rounded-lg text-[13px] font-medium text-[var(--foreground)] hover:bg-[#f8f9fa] transition-colors"
              >
                浏览...
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-muted)] mb-1.5 uppercase tracking-wider">合并策略</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStrategy('move')}
                className={`flex flex-col items-start p-3 rounded-xl border transition-all ${strategy === 'move' ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm' : 'border-[var(--color-border)] hover:bg-black/5 text-[var(--foreground)]'}`}
              >
                <div className="flex items-center text-[13px] font-semibold mb-1">
                  <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5" />
                  移动 (Move)
                </div>
                <div className="text-[11px] text-left opacity-80 leading-snug">只移动有效技能，非技能文件将保留在原处。若源文件夹变空则自动删除。</div>
              </button>
              
              <button
                type="button"
                onClick={() => setStrategy('copy')}
                className={`flex flex-col items-start p-3 rounded-xl border transition-all ${strategy === 'copy' ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm' : 'border-[var(--color-border)] hover:bg-black/5 text-[var(--foreground)]'}`}
              >
                <div className="flex items-center text-[13px] font-semibold mb-1">
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                  复制 (Copy)
                </div>
                <div className="text-[11px] text-left opacity-80 leading-snug">仅复制有效技能至当前库，不破坏源文件夹任何结构和文件。</div>
              </button>
            </div>
          </div>
          
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || !sourcePath}
              className="w-full flex items-center justify-center px-4 py-2 bg-blue-500 text-white rounded-lg text-[13px] font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? "正在合并..." : "确认合并"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
