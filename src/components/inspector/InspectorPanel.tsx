import { useState, useEffect, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { openUrl } from '@tauri-apps/plugin-opener';
import { open } from '@tauri-apps/plugin-dialog';
import { 
  FolderGit2, HardDrive, Folder, Copy, Link as LinkIcon, Unlink, Globe,
  FileText, ChevronRight, Loader2, PanelRightClose, Plus,
  Database, RefreshCw, Trash2, Download, FileArchive, Sparkles, X, Search
} from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';
import { DynamicIcon } from "../ui/DynamicIcon";
import { parseIconConfig } from "../../lib/iconTypes";
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { showToast } from '../ui/Toast';
import { formatTokens } from "../../utils";
import { Skill, GroupedRepo, AgentConfig, SyncRecord, SourceDirectory } from '../../types';

interface InspectorPanelProps {
  // 选中状态
  selectedItemType: 'repo' | 'skill' | null;
  selectedRepos: GroupedRepo[];
  selectedSkills: Skill[];
  // 数据
  agents: AgentConfig[];
  syncRecords: SyncRecord[];
  currentLibrary: SourceDirectory | null;
  allRepos: GroupedRepo[];
  // 回调
  onOpenDrawer: (skill: Skill) => void;
  onSelectRepo: (_repoId: string) => void;
  onRefreshData: () => void;
  onUpdateRepos?: (e: React.MouseEvent, repos: GroupedRepo[]) => void;
  onDeleteRepos?: (e: React.MouseEvent, repos: GroupedRepo[]) => void;
  onGeneratePrompt: (skill: Skill) => void;
  isOpen: boolean;
  onToggle: () => void;
}

type SkillCapacity = {
  file_count: number;
  line_count: number;
  token_count: number;
  char_count: number;
  main_doc_file_count: number;
  main_doc_token_count: number;
  knowledge_file_count: number;
  knowledge_token_count: number;
  script_file_count: number;
  script_token_count: number;
};

export function InspectorPanel({
  selectedItemType,
  selectedRepos,
  selectedSkills,
  agents,
  syncRecords,
  currentLibrary,
  allRepos,
  onOpenDrawer,
  onSelectRepo: _onSelectRepo,
  onRefreshData,
  onUpdateRepos,
  onDeleteRepos,
  onGeneratePrompt,
  isOpen,
  onToggle,
}: InspectorPanelProps) {
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [skillSyncRecords, setSkillSyncRecords] = useState<SyncRecord[]>([]);
  const [isSkillsExpanded, setIsSkillsExpanded] = useState(false);

  // 标签编辑状态
  const [tags, setTags] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部收起标签下拉面板
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) {
        setIsTagDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    allRepos.forEach(repo => {
      repo.skills.forEach(skill => {
        if (skill.tags) {
          skill.tags.split(',').forEach(t => {
            const tag = t.trim();
            if (tag) tagSet.add(tag);
          });
        }
      });
    });
    return Array.from(tagSet).sort();
  }, [allRepos]);

  useEffect(() => {
    setIsSkillsExpanded(false);
  }, [selectedRepos]);

  // 技能容量统计状态
  const [skillCapacity, setSkillCapacity] = useState<SkillCapacity | null>(null);

  // 当选中唯一技能时，加载该技能的同步记录、标签和容量统计
  useEffect(() => {
    if (selectedItemType === 'skill' && selectedSkills.length === 1) {
      setTags(selectedSkills[0].tags || "");
      invoke<SyncRecord[]>('get_sync_records_for_skill', { skillId: selectedSkills[0].id })
        .then(setSkillSyncRecords)
        .catch(console.error);
      invoke<SkillCapacity>('get_skill_token_count', { skillId: selectedSkills[0].id })
        .then(setSkillCapacity)
        .catch(() => setSkillCapacity(null));
    } else {
      setSkillSyncRecords([]);
      setTags("");
      setSkillCapacity(null);
    }
  }, [selectedItemType, selectedSkills.length === 1 ? selectedSkills[0].id : null]);

  const addTag = async (newTag: string, skill: Skill) => {
    if (!newTag || tags.split(',').map(t => t.trim()).includes(newTag)) return;
    const newTagsList = [...tags.split(','), newTag].filter(t => t.trim() !== "");
    const newTagsStr = newTagsList.join(',');
    setTags(newTagsStr);
    try {
      await invoke("update_skill_tags", { id: skill.id, tags: newTagsStr || null });
      skill.tags = newTagsStr;
      onRefreshData(); // 触发上层数据刷新
    } catch (e) {
      showToast("更新标签失败", "error");
    }
  };

  const removeTag = async (tagToRemove: string, skill: Skill) => {
    const newTagsList = tags.split(',').map(t => t.trim()).filter(t => t !== tagToRemove && t !== "");
    const newTagsStr = newTagsList.join(',');
    setTags(newTagsStr);
    try {
      await invoke("update_skill_tags", { id: skill.id, tags: newTagsStr || null });
      skill.tags = newTagsStr;
      onRefreshData(); // 触发上层数据刷新
    } catch (e) {
      showToast("更新标签失败", "error");
    }
  };

  // 同步/取消同步
  const handleToggleSync = async (agentId: string, skillId: string, isSynced: boolean) => {
    setSyncing(prev => ({ ...prev, [agentId]: true }));
    try {
      if (isSynced) {
        await invoke('unsync_skill', { skillId, agentId });
      } else {
        await invoke('sync_skill', { skillId, agentId });
      }
      // 刷新同步记录
      if (selectedSkills.length === 1) {
        const records = await invoke<SyncRecord[]>('get_sync_records_for_skill', { skillId: selectedSkills[0].id });
        setSkillSyncRecords(records);
      }
      onRefreshData();
    } catch (e) {
      console.error(e);
      showToast(`操作失败: ${e}`, 'error');
    } finally {
      setSyncing(prev => ({ ...prev, [agentId]: false }));
    }
  };

  // 同步或取消同步整个仓库到 Agent
  const handleSyncRepoToAgent = async (agentId: string, repo: GroupedRepo) => {
    setSyncing(prev => ({ ...prev, [`repo_${agentId}`]: true }));
    try {
      // 检查当前同步状态
      const syncedCount = repo.skills.filter(s => 
        syncRecords.some(r => r.skill_id === s.id && r.agent_id === agentId)
      ).length;

      if (syncedCount > 0) {
        // 只要有任何同步记录，就全取消
        for (const skill of repo.skills) {
          await invoke('unsync_skill', { skillId: skill.id, agentId });
        }
        showToast(`已取消 "${repo.name}" 的所有同步`);
      } else {
        // 完全没有同步时，全部同步
        for (const skill of repo.skills) {
          const isAlreadySynced = syncRecords.some(r => r.skill_id === skill.id && r.agent_id === agentId);
          if (!isAlreadySynced) {
            await invoke('sync_skill', { skillId: skill.id, agentId });
          }
        }
        showToast(`已将 "${repo.name}" 的技能同步至目标 Agent`);
      }
      onRefreshData();
    } catch (e) {
      console.error(e);
      showToast(`操作失败: ${e}`, 'error');
    } finally {
      setSyncing(prev => ({ ...prev, [`repo_${agentId}`]: false }));
    }
  };

  const [showExportMenu, setShowExportMenu] = useState(false);
  // key: repo.path, value: 进度文字（空字符串表示未在导出）
  const [exportingMap, setExportingMap] = useState<Record<string, string>>({});
  const [confirmData, setConfirmData] = useState<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null);

  const waitConfirm = (msg: string) => new Promise<boolean>((resolve) => {
    setConfirmData({
      isOpen: true,
      message: msg,
      onConfirm: () => { setConfirmData(null); resolve(true); },
      onCancel: () => { setConfirmData(null); resolve(false); }
    });
  });

  const setRepoExporting = (path: string, status: string | null) => {
    setExportingMap(prev => {
      const next = { ...prev };
      if (status === null) delete next[path];
      else next[path] = status;
      return next;
    });
  };

  // 并发安全：每个 handleExport 只锁自己那个 repo
  const handleExport = async (repo: GroupedRepo, isZip: boolean) => {
    // 统一让用户选择导出的目标父目录
    const destDir = await open({ directory: true, title: '选择导出位置', multiple: false });
    if (!destDir) return;

    let targetPath = isZip ? `${destDir}/${repo.name}.zip` : `${destDir}/${repo.name}`;
    
    let exists = false;
    try {
      exists = await invoke<boolean>('check_exists', { path: targetPath });
    } catch (e) {
      showToast(`检测文件冲突失败，请确认是否已重启应用: ${e}`, 'error');
      return;
    }

    if (exists) {
      const typeStr = isZip ? '压缩包' : '文件夹';
      const yes = await waitConfirm(`导出路径 ${destDir} 下已有同名${typeStr} "${repo.name}${isZip ? '.zip' : ''}"，确定要覆盖重复的文件吗？`);
      if (!yes) return;
    }

    setRepoExporting(repo.path, '导出中...');
    try {
      await invoke('export_batch', {
        sourcePaths: [repo.path],
        destPath: targetPath,
        isZip: isZip,
      });
      showToast(`仓库 "${repo.name}" 已导出${isZip ? '为压缩包' : ''}`);
    } catch (e) {
      console.error(e);
      showToast(`导出失败: ${e}`, 'error');
    } finally {
      setRepoExporting(repo.path, null);
    }
  };

  const handleBatchExport = async (repos: GroupedRepo[], isZip: boolean) => {
    const destDir = await open({ directory: true, title: '选择批量导出位置', multiple: false });
    if (!destDir) return;

    const getExportTimeStr = () => new Date().toISOString().replace(/[:.]/g, '-');
    const zipName = `SkillHub_Batch_${getExportTimeStr()}.zip`;
    let targetPath = isZip ? `${destDir}/${zipName}` : (destDir as string);

    if (isZip) {
      try {
        const exists = await invoke<boolean>('check_exists', { path: targetPath });
        if (exists) {
          const yes = await waitConfirm(`导出路径下已有同名压缩包，确定要覆盖吗？`);
          if (!yes) return;
        }
      } catch (e) {
        showToast(`检测文件冲突失败，请确认是否已重启应用: ${e}`, 'error');
        return;
      }
    } else {
      let conflictCount = 0;
      try {
        for (const repo of repos) {
          const exists = await invoke<boolean>('check_exists', { path: `${destDir}/${repo.name}` });
          if (exists) conflictCount++;
        }
      } catch (e) {
        showToast(`检测文件冲突失败，请确认是否已重启应用: ${e}`, 'error');
        return;
      }
      if (conflictCount > 0) {
        const yes = await waitConfirm(`选定的目录中已有 ${conflictCount} 个同名仓库文件夹，确定要覆盖重复的文件吗？`);
        if (!yes) return;
      }
    }

    repos.forEach(r => setRepoExporting(r.path, '导出中...'));

    try {
      await invoke('export_batch', {
        sourcePaths: repos.map(r => r.path),
        destPath: targetPath,
        isZip: isZip,
      });
      showToast(`成功导出 ${repos.length} 个仓库`);
    } catch (e) {
      console.error(e);
      showToast(`批量导出失败: ${e}`, 'error');
    } finally {
      repos.forEach(r => setRepoExporting(r.path, null));
    }
  };

  // 辅助：当前展示的仓库是否正在导出
  const selectedRepo = selectedItemType === 'repo' && selectedRepos.length === 1 ? selectedRepos[0] : null;
  const isExporting = selectedRepo ? !!exportingMap[selectedRepo.path] : false;
  const exportProgress = selectedRepo ? (exportingMap[selectedRepo.path] ?? '') : '';
  const isBatchExporting = selectedRepos.length > 0 && selectedRepos.some(r => !!exportingMap[r.path]);

  // 收起按钮

  const toggleButton = (
    <Tooltip content="收起检查器 (⌘/)">
      <button
        onClick={onToggle}
        className="p-1.5 rounded-md text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/[0.06] transition-colors"
      >
        <PanelRightClose className="w-4 h-4" />
      </button>
    </Tooltip>
  );

  if (!isOpen) {
    return null;
  }

  // ========== 库概览模式 ==========
  if (!selectedItemType) {
    const totalSkills = allRepos.reduce((sum, r) => sum + r.skills.length, 0);
    const githubCount = allRepos.filter(r => r.source_type === 'github').length;
    const localCount = allRepos.filter(r => r.source_type === 'local').length;
    const onlineCount = allRepos.filter(r => r.source_type === 'online').length;

    return (
      <div 
        className="w-64 border-l border-[var(--color-border)] bg-transparent flex flex-col shrink-0 h-full overflow-hidden inspector-container"
        onMouseEnter={e => e.currentTarget.style.setProperty('--scroll-thumb-color', 'rgba(0,0,0,0.18)')}
        onMouseLeave={e => e.currentTarget.style.setProperty('--scroll-thumb-color', 'transparent')}
      >
        {/* 头部 */}
        <div 
          data-tauri-drag-region
          onPointerDown={(e) => { if (e.target === e.currentTarget) getCurrentWindow().startDragging(); }}
          onDoubleClick={(e) => { if (e.target === e.currentTarget) getCurrentWindow().toggleMaximize(); }}
          className="px-4 h-10 flex items-center justify-between shrink-0"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <span className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider"></span>
          {toggleButton}
        </div>

        <div className="flex-1 overflow-y-auto p-4 inspector-scroll-area">
          {/* 库名称 */}
          <div className="mb-5">
            <div className="flex items-center space-x-2 mb-1">
              {currentLibrary?.icon ? (
                <div 
                  className="w-5 h-5 rounded-md flex items-center justify-center bg-gray-100 shrink-0"
                  style={(() => {
                    const config = parseIconConfig(currentLibrary.icon);
                    return config?.type === 'icon' && config.color ? { backgroundColor: `${config.color}26` } : {};
                  })()}
                >
                  <DynamicIcon config={parseIconConfig(currentLibrary.icon)} size={14} />
                </div>
              ) : (
                <div className="w-5 h-5 rounded-md flex items-center justify-center bg-blue-500 shrink-0">
                  <Database className="w-3 h-3 text-white fill-white/20" />
                </div>
              )}
              <span className="text-[14px] font-semibold text-[var(--foreground)] truncate">
                {currentLibrary?.label || '未选择技能库'}
              </span>
            </div>
            {currentLibrary?.path && (
              <Tooltip content={currentLibrary.path} side="bottom">
                <p 
                  className="text-[11px] text-[var(--color-muted)] truncate ml-6 cursor-default select-none"
                  onDoubleClick={() => { navigator.clipboard.writeText(currentLibrary.path); showToast('路径已复制'); }}
                >
                  {currentLibrary.path.replace(/[/\\][^/\\]+$/, '')}
                </p>
              </Tooltip>
            )}
          </div>

          {/* 统计卡片 */}
          <div className="grid grid-cols-2 gap-2 mb-5">
            <div className="bg-black/[0.03] rounded-lg p-3 text-center">
              <div className="text-[20px] font-bold text-[var(--foreground)]">{allRepos.length}</div>
              <div className="text-[11px] text-[var(--color-muted)]">仓库</div>
            </div>
            <div className="bg-black/[0.03] rounded-lg p-3 text-center">
              <div className="text-[20px] font-bold text-[var(--foreground)]">{totalSkills}</div>
              <div className="text-[11px] text-[var(--color-muted)]">技能</div>
            </div>
          </div>

          {/* 来源分布 */}
          <div className="mb-5">
            <h4 className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">来源分布</h4>
            <div className="space-y-1.5">
              {githubCount > 0 && (
                <div className="flex items-center justify-between text-[12px]">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#0066FF]" />
                    <span className="text-[var(--foreground)]">GitHub</span>
                  </div>
                  <span className="text-[var(--color-muted)] font-medium">{githubCount}</span>
                </div>
              )}
              {localCount > 0 && (
                <div className="flex items-center justify-between text-[12px]">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#86868B]" />
                    <span className="text-[var(--foreground)]">本地</span>
                  </div>
                  <span className="text-[var(--color-muted)] font-medium">{localCount}</span>
                </div>
              )}
              {onlineCount > 0 && (
                <div className="flex items-center justify-between text-[12px]">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-[var(--foreground)]">线上技能</span>
                  </div>
                  <span className="text-[var(--color-muted)] font-medium">{onlineCount}</span>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    );
  }

  // ========== 多选模式 (仓库) ==========
  if (selectedItemType === 'repo' && selectedRepos.length > 1) {
    return (
      <div className="w-64 border-l border-[var(--color-border)] bg-transparent flex flex-col shrink-0 h-full overflow-hidden">
        <div 
          data-tauri-drag-region
          onPointerDown={(e) => { if (e.target === e.currentTarget) getCurrentWindow().startDragging(); }}
          onDoubleClick={(e) => { if (e.target === e.currentTarget) getCurrentWindow().toggleMaximize(); }}
          className="px-4 h-10 flex items-center justify-between shrink-0"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <span className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider"></span>
          {toggleButton}
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-16 h-16 bg-[var(--color-primary)]/10 rounded-full flex items-center justify-center mb-4">
             <span className="text-2xl font-bold text-[var(--color-primary)]">{selectedRepos.length}</span>
          </div>
          <h3 className="text-[15px] font-semibold text-[var(--foreground)] mb-1">已选 {selectedRepos.length} 个技能</h3>
          <p className="text-[12px] text-[var(--color-muted)] text-center mb-6">你可以对选中的技能进行批量操作</p>
          
          <div className="flex flex-col space-y-2 w-full px-2">
            <div className="relative w-full">
              <button
                onClick={() => !isBatchExporting && setShowExportMenu(!showExportMenu)}
                disabled={isBatchExporting}
                className="w-full flex items-center justify-center space-x-1.5 py-2 bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 text-[var(--color-primary)] rounded-lg transition-colors text-[13px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isBatchExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                <span>{isBatchExporting ? `导出中 (${selectedRepos.filter(r => !exportingMap[r.path]).length}/${selectedRepos.length} 完成)` : '批量导出'}</span>
              </button>

              {showExportMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                  <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-lg shadow-lg border border-[var(--color-border)]/60 p-1 z-50">
                    <button
                      onClick={() => {
                        setShowExportMenu(false);
                        handleBatchExport(selectedRepos, false);
                      }}
                      className="w-full flex items-center space-x-2 px-2 py-1.5 rounded hover:bg-black/5 text-[12px] text-[var(--foreground)] text-left"
                    >
                      <Folder size={12} />
                      <span>直接导出目录</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowExportMenu(false);
                        handleBatchExport(selectedRepos, true);
                      }}
                      className="w-full flex items-center space-x-2 px-2 py-1.5 rounded hover:bg-black/5 text-[12px] text-[var(--foreground)] text-left"
                    >
                      <FileArchive size={12} />
                      <span>打包为 ZIP</span>
                    </button>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={async () => {
                try {
                  for (const repo of selectedRepos) {
                    await invoke('rescan_directory', { dirId: repo.source_dir_id || repo.id });
                  }
                  showToast(`已批量下发更新指令 (${selectedRepos.length} 个)`);
                } catch (e) {
                  console.error(e);
                  showToast('批量更新失败', 'error');
                }
              }}
              className="flex items-center justify-center space-x-2 w-full py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors text-[13px] font-medium"
            >
              <RefreshCw size={14} />
              <span>批量更新</span>
            </button>
            <button
              onClick={(e) => {
                if (onDeleteRepos) onDeleteRepos(e, selectedRepos);
              }}
              className="flex items-center justify-center space-x-2 w-full py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors text-[13px] font-medium"
            >
              <Trash2 size={14} />
              <span>批量删除</span>
            </button>
          </div>
        </div>
        {confirmData && <ConfirmDialog {...confirmData} />}
      </div>
    );
  }

  // ========== 仓库详情模式 ==========
  if (selectedItemType === 'repo' && selectedRepos.length === 1) {
    const selectedRepo = selectedRepos[0];
    const isGithub = selectedRepo.source_type === 'github';
    const isOnline = selectedRepo.source_type === 'online';
    // online 就只有一个技能，取其 online_url
    const onlineUrl = isOnline ? (selectedRepo.skills[0]?.online_url || selectedRepo.path) : null;
    return (
      <div 
        className="w-64 border-l border-[var(--color-border)] bg-transparent flex flex-col shrink-0 h-full overflow-hidden inspector-container"
        onMouseEnter={e => e.currentTarget.style.setProperty('--scroll-thumb-color', 'rgba(0,0,0,0.18)')}
        onMouseLeave={e => e.currentTarget.style.setProperty('--scroll-thumb-color', 'transparent')}
      >
        {/* 头部 */}
        <div 
          data-tauri-drag-region
          onPointerDown={(e) => { if (e.target === e.currentTarget) getCurrentWindow().startDragging(); }}
          onDoubleClick={(e) => { if (e.target === e.currentTarget) getCurrentWindow().toggleMaximize(); }}
          className="px-4 h-10 flex items-center justify-between shrink-0"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <span className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider"></span>
          {toggleButton}
        </div>

        <div className="flex-1 overflow-y-auto p-4 inspector-scroll-area">
          {/* 仓库名与图标及同步按钮 */}
          <div className="flex items-center space-x-2.5 mb-4">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              isOnline ? 'bg-emerald-500/10 text-emerald-600' :
              isGithub ? 'bg-[#0066FF]/10 text-[#0066FF]' : 'bg-[#86868B]/10 text-[#86868B]'
            }`}>
              {isOnline ? <Globe size={16} /> : <FolderGit2 className="w-4.5 h-4.5" />}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-[14px] font-semibold text-[var(--foreground)] truncate">{selectedRepo.name}</h3>
              <span className={`text-[10px] font-medium uppercase tracking-wider ${
                isOnline ? 'text-emerald-600' : isGithub ? 'text-[#0066FF]' : 'text-[#86868B]'
              }`}>
                {isOnline ? '线上收藏' : selectedRepo.source_type}
                {selectedRepo.author && (
                  <span className="ml-1 text-[var(--color-muted)]">@{selectedRepo.author}</span>
                )}
              </span>
            </div>
            {!isOnline && (
              <Tooltip content="更新当前仓库">
                <button
                  onClick={(e) => {
                    if (onUpdateRepos) {
                      onUpdateRepos(e, [selectedRepo]);
                    } else {
                      invoke('rescan_directory', { dirId: selectedRepo.source_dir_id || selectedRepo.id })
                        .then(() => showToast('已下发更新指令，请稍候查看'))
                        .catch(console.error);
                    }
                  }}
                  className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors shrink-0 border border-black/5"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </Tooltip>
            )}
            {isOnline && onlineUrl && (
              <Tooltip content="在浏览器中打开">
                <a
                  href={onlineUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-emerald-600 hover:bg-emerald-500/10 transition-colors shrink-0 border border-black/5"
                >
                  <Globe className="w-4 h-4" />
                </a>
              </Tooltip>
            )}
          </div>

          {/* 路径/URL */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-1.5">
              <h4 className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">
                {isOnline ? '技能地址' : '路径'}
              </h4>
              {!isOnline && (
                <div className="flex items-center space-x-0.5">
                  <Tooltip content="复制路径">
                    <button
                      onClick={() => { navigator.clipboard.writeText(selectedRepo.path); showToast('路径已复制'); }}
                      className="p-1 rounded hover:bg-black/5 text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors shrink-0"
                    >
                      <Copy size={12} />
                    </button>
                  </Tooltip>
                  <Tooltip content="在 Finder 中打开">
                    <button
                      onClick={async () => {
                        try { await invoke('open_local_folder', { path: selectedRepo.path }); } catch (e) { console.error(e); }
                      }}
                      className="p-1 rounded hover:bg-black/5 text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors shrink-0"
                    >
                      <Folder size={12} />
                    </button>
                  </Tooltip>
                  {isGithub && (
                    <Tooltip content="在 GitHub 中查看">
                      <button
                        onClick={async () => {
                          try {
                            const url = await invoke<string>('get_git_remote_url', { path: selectedRepo.path });
                            if (url) {
                              await openUrl(url);
                            } else {
                              showToast('未找到远程仓库地址', 'error');
                            }
                          } catch (e) {
                            showToast(`获取仓库地址失败: ${e}`, 'error');
                          }
                        }}
                        className="p-1 rounded hover:bg-black/5 text-[var(--color-muted)] hover:text-[#0066FF] transition-colors shrink-0"
                      >
                        <Globe size={12} />
                      </button>
                    </Tooltip>
                  )}
                </div>
              )}
            </div>
            {isOnline && onlineUrl ? (
              <a
                href={onlineUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-[11px] text-[var(--color-primary)] hover:underline break-all bg-[var(--color-primary)]/5 px-2 py-1.5 rounded border border-[var(--color-primary)]/10 transition-colors"
              >
                {onlineUrl}
              </a>
            ) : (
              <Tooltip content={selectedRepo.path} side="bottom">
                <p 
                  onDoubleClick={() => { navigator.clipboard.writeText(selectedRepo.path); showToast('路径已复制'); }}
                  className="text-[11px] text-[var(--color-muted)] truncate w-full bg-black/[0.03] border border-black/[0.04] px-2 py-1.5 rounded cursor-default select-none"
                >
                  {selectedRepo.path}
                </p>
              </Tooltip>
            )}
          </div>

          {/* 同步至 AI Agent（线上收藏模式不显示） */}
          {!isOnline && agents.length > 0 && (
            <div className="mb-4">
              <h4 className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">同步至 AI Agent</h4>
              <div className="space-y-1.5">
                {agents.map(agent => {
                  // 检查仓库下所有技能是否都同步了
                  const syncedCount = selectedRepo.skills.filter(s => 
                    syncRecords.some(r => r.skill_id === s.id && r.agent_id === agent.id)
                  ).length;
                  const allSynced = syncedCount === selectedRepo.skills.length && syncedCount > 0;
                  const partialSynced = syncedCount > 0 && !allSynced;
                  const isBusy = syncing[`repo_${agent.id}`];
                  
                  return (
                    <button
                      key={agent.id}
                      disabled={isBusy}
                      onClick={() => handleSyncRepoToAgent(agent.id, selectedRepo)}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg border text-[12px] font-medium transition-all ${
                        allSynced
                          ? 'bg-green-50 border-green-200 text-green-700'
                          : partialSynced
                            ? 'bg-amber-50 border-amber-200 text-amber-700'
                            : 'bg-transparent border-[var(--color-border)] text-[var(--color-muted)] hover:bg-black/5'
                      } disabled:opacity-50`}
                    >
                      <div className="flex items-center space-x-2">
                        {isBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : allSynced ? (
                          <LinkIcon className="w-3.5 h-3.5" />
                        ) : (
                          <Unlink className="w-3.5 h-3.5" />
                        )}
                        <span>{agent.display_name}</span>
                      </div>
                      <span className="text-[10px] opacity-60">
                        {syncedCount}/{selectedRepo.skills.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 子技能列表 */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">
                子技能 ({selectedRepo.skills.length})
              </h4>
              {selectedRepo.skills.length > 5 && isSkillsExpanded && (
                <button
                  onClick={() => setIsSkillsExpanded(false)}
                  className="text-[11px] text-[var(--color-primary)] hover:underline shrink-0"
                >
                  收起
                </button>
              )}
            </div>
            <div className="space-y-0.5 max-h-[300px] overflow-y-auto inspector-scroll-area">
              {(isSkillsExpanded ? selectedRepo.skills : selectedRepo.skills.slice(0, 5)).map(skill => (
                <button
                  key={skill.id}
                  onClick={() => onOpenDrawer(skill)}
                  className="w-full flex items-center space-x-2 px-2 py-1.5 rounded-md text-left hover:bg-black/5 transition-colors group"
                >
                  <FileText className="w-3.5 h-3.5 text-[var(--color-muted)] shrink-0" />
                  <span className="text-[12px] text-[var(--foreground)] truncate flex-1">{skill.name}</span>
                  <ChevronRight className="w-3 h-3 text-[var(--color-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              ))}
              {!isSkillsExpanded && selectedRepo.skills.length > 5 && (
                <button
                  onClick={() => setIsSkillsExpanded(true)}
                  className="w-full text-center py-1.5 mt-1 text-[11px] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 rounded transition-colors"
                >
                  查看全部 (+{selectedRepo.skills.length - 5})
                </button>
              )}
            </div>
          </div>

          {/* 信息 */}
          <div>
            <h4 className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">信息</h4>
            <div className="space-y-1.5 text-[12px]">
              {selectedRepo.category && (
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-muted)]">分类</span>
                  <span className="text-[var(--foreground)] font-medium">{selectedRepo.category}</span>
                </div>
              )}
              {selectedRepo.updated_at && (
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-muted)]">更新时间</span>
                  <span className="text-[var(--foreground)] font-medium">
                    {new Date(selectedRepo.updated_at).toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* 底部固定操作区 */}
        <div className="p-4 border-t border-[var(--color-border)]/60 bg-white/30 shrink-0">
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <button
                onClick={() => !isExporting && setShowExportMenu(!showExportMenu)}
                disabled={isExporting}
                className="w-full flex items-center justify-center space-x-1.5 py-1.5 bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 text-[var(--color-primary)] rounded-lg transition-colors text-[12px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                <span>{isExporting ? exportProgress : '导出'}</span>
              </button>
              
              {showExportMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                  <div className="absolute bottom-full left-0 mb-2 w-full bg-white rounded-lg shadow-lg border border-[var(--color-border)]/60 p-1 z-50">
                    <button
                      onClick={() => {
                        setShowExportMenu(false);
                        handleExport(selectedRepo, false);
                      }}
                      className="w-full flex items-center space-x-2 px-2 py-1.5 rounded hover:bg-black/5 text-[12px] text-[var(--foreground)] text-left"
                    >
                      <Folder size={12} />
                      <span>导出文件</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowExportMenu(false);
                        handleExport(selectedRepo, true);
                      }}
                      className="w-full flex items-center space-x-2 px-2 py-1.5 rounded hover:bg-black/5 text-[12px] text-[var(--foreground)] text-left"
                    >
                      <FileArchive size={12} />
                      <span>压缩并导出</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={(e) => {
                if (onDeleteRepos) onDeleteRepos(e, [selectedRepo]);
              }}
              className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors text-[12px] font-medium"
            >
              <Trash2 size={12} />
              <span>删除仓库</span>
            </button>
          </div>
        </div>
        {confirmData && <ConfirmDialog {...confirmData} />}
      </div>
    );
  }

  // ========== 多选模式 (技能) ==========
  if (selectedItemType === 'skill' && selectedSkills.length > 1) {
    return (
      <div 
        className="w-64 border-l border-[var(--color-border)] bg-transparent flex flex-col shrink-0 h-full overflow-hidden inspector-container"
        onMouseEnter={e => e.currentTarget.style.setProperty('--scroll-thumb-color', 'rgba(0,0,0,0.18)')}
        onMouseLeave={e => e.currentTarget.style.setProperty('--scroll-thumb-color', 'transparent')}
      >
        <div 
          data-tauri-drag-region
          onPointerDown={(e) => { if (e.target === e.currentTarget) getCurrentWindow().startDragging(); }}
          onDoubleClick={(e) => { if (e.target === e.currentTarget) getCurrentWindow().toggleMaximize(); }}
          className="px-4 h-10 flex items-center justify-between shrink-0"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <span className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider"></span>
          {toggleButton}
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-16 h-16 bg-[var(--color-primary)]/10 rounded-full flex items-center justify-center mb-4">
             <span className="text-2xl font-bold text-[var(--color-primary)]">{selectedSkills.length}</span>
          </div>
          <h3 className="text-[15px] font-semibold text-[var(--foreground)] mb-1">已选 {selectedSkills.length} 个技能文件</h3>
          <p className="text-[12px] text-[var(--color-muted)] text-center mb-6">你可以对选中的技能进行批量操作</p>
        </div>
      </div>
    );
  }

  // ========== 技能详情模式 ==========
  if (selectedItemType === 'skill' && selectedSkills.length === 1) {
    const selectedSkill = selectedSkills[0];
    const parentRepo = allRepos.find(r => r.skills.some(s => s.id === selectedSkill.id));
    return (
      <div 
        className="w-64 border-l border-[var(--color-border)] bg-transparent flex flex-col shrink-0 h-full overflow-hidden inspector-container"
        onMouseEnter={e => e.currentTarget.style.setProperty('--scroll-thumb-color', 'rgba(0,0,0,0.18)')}
        onMouseLeave={e => e.currentTarget.style.setProperty('--scroll-thumb-color', 'transparent')}
      >
        {/* 头部 */}
        <div 
          data-tauri-drag-region
          onPointerDown={(e) => { if (e.target === e.currentTarget) getCurrentWindow().startDragging(); }}
          onDoubleClick={(e) => { if (e.target === e.currentTarget) getCurrentWindow().toggleMaximize(); }}
          className="px-4 h-10 flex items-center justify-between shrink-0"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <span className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider"></span>
          {toggleButton}
        </div>

        <div className="flex-1 overflow-y-auto p-4 inspector-scroll-area">
          {/* 技能名 */}
          <div className="mb-4">
            <div className="flex items-center space-x-2.5 mb-2">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-[var(--color-muted-bg)] text-[var(--color-muted)]">
                <HardDrive className="w-4.5 h-4.5" />
              </div>
              <h3 className="text-[14px] font-semibold text-[var(--foreground)] line-clamp-2">{selectedSkill.name}</h3>
            </div>
            {selectedSkill.description && (
              <p 
                className="text-[12px] text-[var(--color-muted)] leading-relaxed max-h-[64px] overflow-hidden"
                style={{
                  WebkitMaskImage: 'linear-gradient(to bottom, black calc(100% - 20px), transparent 100%)',
                  maskImage: 'linear-gradient(to bottom, black calc(100% - 20px), transparent 100%)'
                }}
              >
                {selectedSkill.description}
              </p>
            )}
          </div>

          {/* 操作按钮区 */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              onClick={() => onOpenDrawer(selectedSkill)}
              className="flex items-center justify-center space-x-1.5 px-3 py-2 bg-black/[0.04] hover:bg-black/[0.07] rounded-lg text-[12px] font-medium text-[var(--foreground)] transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>查看文档</span>
            </button>
            <button
              onClick={() => onGeneratePrompt(selectedSkill)}
              className="flex items-center justify-center space-x-1.5 px-3 py-2 bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 text-[var(--color-primary)] rounded-lg text-[12px] font-medium transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>引用提示词</span>
            </button>
          </div>

          {/* 路径 */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-1.5">
              <h4 className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">路径</h4>
              <div className="flex items-center space-x-0.5">
                <Tooltip content="复制路径">
                  <button
                    onClick={() => { 
                      navigator.clipboard.writeText(selectedSkill.local_path); 
                      showToast('路径已复制'); 
                      invoke('increment_skill_use_count', { id: selectedSkill.id });
                    }}
                    className="p-1 rounded hover:bg-black/5 text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors shrink-0"
                  >
                    <Copy size={12} />
                  </button>
                </Tooltip>
                <Tooltip content="在 Finder 中打开">
                  <button
                    onClick={async () => {
                      try { await invoke('reveal_in_finder', { path: selectedSkill.local_path }); } catch (e) { console.error(e); }
                    }}
                    className="p-1 rounded hover:bg-black/5 text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors shrink-0"
                  >
                    <Folder size={12} />
                  </button>
                </Tooltip>
              </div>
            </div>
            <Tooltip content={selectedSkill.local_path} side="bottom">
              <p 
                onDoubleClick={() => { 
                  navigator.clipboard.writeText(selectedSkill.local_path); 
                  showToast('路径已复制'); 
                  invoke('increment_skill_use_count', { id: selectedSkill.id });
                }}
                className="text-[11px] text-[var(--color-muted)] truncate w-full bg-black/[0.03] border border-black/[0.04] px-2 py-1.5 rounded cursor-default select-none"
              >
                {selectedSkill.local_path}
              </p>
            </Tooltip>
          </div>

          {/* 上下文占用 / 规模 */}
          {skillCapacity && (
            <div className="mb-4">
              <div className="flex justify-between items-center mb-1.5">
                <h4 className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">上下文占用</h4>
              </div>
              <Tooltip
                content={
                  <div className="flex flex-col gap-1.5 min-w-[210px]">
                    <div className="font-medium pb-1 border-b border-white/20 flex justify-between items-center">
                      <span>上下文与规模</span>
                      <span className="text-[10px] opacity-80">{skillCapacity.file_count} 个文件 · {skillCapacity.line_count.toLocaleString()} 行</span>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span>主文档 ({skillCapacity.main_doc_file_count} 个):</span>
                      <span>约 {formatTokens(skillCapacity.main_doc_token_count)} Tokens</span>
                    </div>
                    {skillCapacity.knowledge_file_count > 0 && (
                      <div className="flex justify-between items-center text-[11px]">
                        <span>知识库 ({skillCapacity.knowledge_file_count} 个):</span>
                        <span>约 {formatTokens(skillCapacity.knowledge_token_count)} Tokens</span>
                      </div>
                    )}
                    {skillCapacity.script_file_count > 0 && (
                      <div className="flex justify-between items-center text-[11px]">
                        <span>配套脚本 ({skillCapacity.script_file_count} 个):</span>
                        <span>约 {formatTokens(skillCapacity.script_token_count)} Tokens</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center text-[11px] font-medium pt-1 border-t border-white/10 mt-1">
                      <span>总基础占用:</span>
                      <span>~{formatTokens(skillCapacity.token_count)} Tokens</span>
                    </div>
                    <div className="text-[10px] opacity-70 mt-1 italic leading-relaxed">
                      * 仅统计当前目录及子目录下的文本实体<br />
                      * 无关依赖已自动过滤 (如 node_modules 等)
                    </div>
                  </div>
                }
              >
                <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-black/[0.03] border border-black/[0.04] text-[11px] text-[var(--color-muted)] cursor-default select-none hover:bg-black/[0.05] transition-colors">
                  <span className="flex items-center gap-0.5">
                    <span className="font-medium text-[var(--foreground)]">{skillCapacity.file_count}</span>
                    <span>文件</span>
                  </span>
                  <span className="text-[10px] text-[var(--color-muted)]/40">•</span>
                  <span className="flex items-center gap-0.5">
                    <span className="font-medium text-[var(--foreground)]">
                      {skillCapacity.line_count >= 10000 
                        ? `${(skillCapacity.line_count / 10000).toFixed(1)}w` 
                        : skillCapacity.line_count.toLocaleString()}
                    </span>
                    <span>行</span>
                  </span>
                  <span className="text-[10px] text-[var(--color-muted)]/40">•</span>
                  <span className="flex items-center gap-0.5 shrink-0">
                    <span>约</span>
                    <span className="font-medium text-[var(--foreground)]">{formatTokens(skillCapacity.token_count)}</span>
                    <span>Tokens</span>
                  </span>
                </div>
              </Tooltip>
            </div>
          )}

          {/* 同步至 AI Agent */}
          {agents.length > 0 && (
            <div className="mb-4">
              <h4 className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">同步至 AI Agent</h4>
              <div className="space-y-1.5">
                {agents.map(agent => {
                  const isSynced = skillSyncRecords.some(r => r.agent_id === agent.id);
                  const isBusy = syncing[agent.id];
                  return (
                    <button
                      key={agent.id}
                      disabled={isBusy}
                      onClick={() => handleToggleSync(agent.id, selectedSkill.id, isSynced)}
                      className={`w-full flex items-center px-2.5 py-2 rounded-lg border text-[12px] font-medium transition-all ${
                        isSynced
                          ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                          : 'bg-transparent border-[var(--color-border)] text-[var(--color-muted)] hover:bg-black/5'
                      } disabled:opacity-50`}
                    >
                      {isBusy ? (
                        <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                      ) : isSynced ? (
                        <LinkIcon className="w-3.5 h-3.5 mr-2" />
                      ) : (
                        <Unlink className="w-3.5 h-3.5 mr-2" />
                      )}
                      <span>{agent.display_name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 标签 */}
          <div className="mb-4">
            <h4 className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">标签</h4>
            <div className="relative" ref={tagDropdownRef}>
              {tags.split(',').map(t => t.trim()).filter(Boolean).length === 0 ? (
                /* 无标签时：展示全宽按钮 */
                <button
                  type="button"
                  onClick={() => {
                    setIsTagDropdownOpen(prev => {
                      const next = !prev;
                      if (next) {
                        setTimeout(() => tagInputRef.current?.focus(), 50);
                      }
                      return next;
                    });
                  }}
                  className={`w-full py-1.5 px-3 rounded-md border text-[12px] flex items-center justify-center gap-1.5 transition-all ${
                    isTagDropdownOpen
                      ? 'bg-[var(--color-primary)]/5 border-[var(--color-primary)]/40 text-[var(--color-primary)] font-medium'
                      : 'bg-black/5 hover:bg-black/10 border-transparent text-[var(--color-muted)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>添加标签</span>
                </button>
              ) : (
                /* 拥有1个及以上标签时：展示标签胶囊并在末尾追加小按钮 */
                <div className="flex flex-wrap gap-1.5 items-center">
                  {tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                    <span 
                      key={tag} 
                      className="group/tag h-6 inline-flex items-center text-[11.5px] px-2 rounded-md bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium border border-transparent box-border transition-all duration-150"
                    >
                      <span className="opacity-60 mr-0.5 select-none">#</span>
                      <span className="truncate max-w-[120px]">{tag}</span>
                      <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeTag(tag, selectedSkill); }}
                        className="w-0 opacity-0 group-hover/tag:w-3.5 group-hover/tag:opacity-100 group-hover/tag:ml-1 overflow-hidden inline-flex items-center justify-center text-[var(--color-primary)] hover:text-red-500 transition-all duration-150"
                        title={`删除标签 #${tag}`}
                      >
                        <X className="w-3 h-3 shrink-0" />
                      </button>
                    </span>
                  ))}

                  {/* 紧随最后一个标签的添加按钮：极简 + 号图标按钮，极致省空间避免换行 */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsTagDropdownOpen(prev => {
                        const next = !prev;
                        if (next) {
                          setTimeout(() => tagInputRef.current?.focus(), 50);
                        }
                        return next;
                      });
                    }}
                    className={`h-6 w-6 inline-flex items-center justify-center rounded-md border border-dashed box-border shrink-0 transition-all ${
                      isTagDropdownOpen 
                        ? 'border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary)]/10 font-medium' 
                        : 'border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5'
                    }`}
                    title="添加标签"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              
              {/* 浮动的搜索与选择面板 */}
              {isTagDropdownOpen && (
                <div className="absolute top-full mt-1.5 left-0 right-0 w-full bg-white/95 backdrop-blur-xl border border-[var(--color-border)] rounded-xl shadow-2xl p-2 z-[100] animate-in fade-in zoom-in-95 duration-150">
                  <div className="relative mb-1.5">
                    <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-[var(--color-muted)] pointer-events-none" />
                    <input
                      ref={tagInputRef}
                      type="text"
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          setIsTagDropdownOpen(false);
                          return;
                        }
                        if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
                          e.preventDefault();
                          const newTag = tagInput.trim().replace(/[,，]/g, '');
                          if (newTag) {
                            addTag(newTag, selectedSkill);
                            setTagInput("");
                            setIsTagDropdownOpen(false);
                          }
                        }
                      }}
                      placeholder="搜索或创建标签..."
                      className="w-full text-[12px] pl-8 pr-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-gray-50/80 focus:bg-white focus:outline-none focus:border-[var(--color-primary)]/50 focus:ring-2 focus:ring-[var(--color-primary)]/10 transition-all placeholder:text-[var(--color-muted)]/70"
                    />
                  </div>

                  <div className="max-h-44 overflow-y-auto custom-scrollbar flex flex-col gap-0.5">
                    {allTags.filter(t => !tags.split(',').map(x => x.trim()).filter(Boolean).includes(t) && t.toLowerCase().includes(tagInput.toLowerCase())).length > 0 ? (
                      allTags
                        .filter(t => !tags.split(',').map(x => x.trim()).filter(Boolean).includes(t) && t.toLowerCase().includes(tagInput.toLowerCase()))
                        .map(tag => (
                          <button
                            key={tag}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              addTag(tag, selectedSkill);
                              setTagInput("");
                              setIsTagDropdownOpen(false);
                            }}
                            className="w-full px-2.5 py-1.5 text-[12px] text-left rounded-md hover:bg-black/5 text-[var(--foreground)] transition-colors flex items-center justify-between group"
                          >
                            <span>#{tag}</span>
                            <Plus className="w-3 h-3 text-[var(--color-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        ))
                    ) : tagInput.trim() ? (
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          const newTag = tagInput.trim().replace(/[,，]/g, '');
                          if (newTag) {
                            addTag(newTag, selectedSkill);
                            setTagInput("");
                            setIsTagDropdownOpen(false);
                          }
                        }}
                        className="w-full px-2.5 py-1.5 text-[12px] text-left rounded-md hover:bg-[var(--color-primary)]/10 text-[var(--color-primary)] transition-colors flex items-center gap-1.5 font-medium"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>按回车创建 "{tagInput.trim()}"</span>
                      </button>
                    ) : (
                      <div className="px-2 py-3 text-[11px] text-[var(--color-muted)] text-center">
                        输入文字搜索或按回车创建
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 信息 */}
          <div>
            <h4 className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">信息</h4>
            <div className="space-y-1.5 text-[12px]">
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-muted)]">来源</span>
                <span className="text-[var(--foreground)] font-medium uppercase text-[11px]">
                  {selectedSkill.source_type}
                  {parentRepo?.author && (
                    <span className="ml-1 text-[var(--color-muted)]">@{parentRepo.author}</span>
                  )}
                </span>
              </div>
              {selectedSkill.updated_at && (
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-muted)]">更新时间</span>
                  <span className="text-[var(--foreground)] font-medium">
                    {new Date(selectedSkill.updated_at).toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 兜底
  return (
    <div className="w-64 border-l border-[var(--color-border)] bg-transparent flex flex-col shrink-0 h-full">
      <div 
        data-tauri-drag-region
        onPointerDown={(e) => { if (e.target === e.currentTarget) getCurrentWindow().startDragging(); }}
        onDoubleClick={(e) => { if (e.target === e.currentTarget) getCurrentWindow().toggleMaximize(); }}
        className="px-4 h-10 flex items-center justify-between shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider"></span>
        {toggleButton}
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-[12px] text-[var(--color-muted)] text-center">选择一个仓库或技能查看详情</p>
      </div>
    </div>
  );
}
