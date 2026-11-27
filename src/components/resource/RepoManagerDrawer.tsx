import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  X,
  Plus,
  ExternalLink,
  Trash2,
  RefreshCw,
  Key,
  Check,
  Loader2,
  Sparkles,
  FolderGit2,
} from 'lucide-react';
import type { HostTokenInfo, SubscribedRepo, SubscribedRepoSyncResult } from '../../types/resourceHub';
import { RECOMMENDED_REPOS } from '../../data/curated-leaderboards';
import { getGitHubToken, setGitHubToken } from '../../utils/githubToken';
import { showToast } from '../ui/Toast';

interface RepoManagerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  repos: SubscribedRepo[];
  syncingRepoIds: Set<string>;
  onReposChanged: () => Promise<void>;
  onSyncSingleRepo: (repoId: string, force?: boolean) => Promise<SubscribedRepoSyncResult | null>;
}

/**
 * 右侧滑出抽屉：管理技能仓库源与多站点只读访问令牌
 */
export function RepoManagerDrawer({
  isOpen,
  onClose,
  repos,
  syncingRepoIds,
  onReposChanged,
  onSyncSingleRepo,
}: RepoManagerDrawerProps) {
  const [repoInput, setRepoInput] = useState('');
  const [branchInput, setBranchInput] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const [tokens, setTokens] = useState<HostTokenInfo[]>([]);
  const [hostInput, setHostInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [isSavingToken, setIsSavingToken] = useState(false);

  const loadTokens = useCallback(async () => {
    try {
      const list = await invoke<HostTokenInfo[]>('get_host_tokens');
      setTokens(list);
    } catch (err) {
      console.error('Failed to load host tokens:', err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadTokens();
    }
  }, [isOpen, loadTokens]);

  if (!isOpen) return null;

  const existingIds = new Set(repos.map(r => r.id.toLowerCase()));
  const unsubscribedRecommendations = RECOMMENDED_REPOS.filter(
    r => !existingIds.has(`github.com/${r.owner.toLowerCase()}/${r.repo.toLowerCase()}`)
  );

  const handleAddRepo = async (overrideUrl?: string, overrideBranch?: string) => {
    const raw = (overrideUrl ?? repoInput).trim();
    const br = (overrideBranch ?? branchInput).trim();
    if (!raw) {
      showToast('请输入 owner/name 或完整的仓库 URL', 'error');
      return;
    }

    setIsAdding(true);
    try {
      const created = await invoke<SubscribedRepo>('add_subscribed_repo', {
        repoUrl: raw,
        branch: br || null,
      });
      if (!overrideUrl) {
        setRepoInput('');
        setBranchInput('');
      }
      showToast(`已添加仓库 ${created.owner}/${created.repo}，正在扫描技能...`, 'success');
      await onReposChanged();
      // 添加后自动触发一次扫描，立即可见技能列表
      await onSyncSingleRepo(created.id, true);
    } catch (err) {
      showToast(String(err), 'error');
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggleRepo = async (repo: SubscribedRepo) => {
    try {
      await invoke('toggle_subscribed_repo', {
        repoId: repo.id,
        enabled: !repo.enabled,
      });
      await onReposChanged();
    } catch (err) {
      showToast(`切换状态失败: ${err}`, 'error');
    }
  };

  const handleDeleteRepo = async (repo: SubscribedRepo) => {
    try {
      await invoke('delete_subscribed_repo', { repoId: repo.id });
      showToast(`已移除订阅仓库 ${repo.owner}/${repo.repo}`, 'info');
      await onReposChanged();
    } catch (err) {
      showToast(`移除失败: ${err}`, 'error');
    }
  };

  const handleSaveToken = async () => {
    const host = hostInput.trim() || 'github.com';
    const token = tokenInput.trim();
    if (!token) {
      showToast('请粘贴访问令牌', 'error');
      return;
    }
    setIsSavingToken(true);
    try {
      await invoke('save_host_token', { host, token });
      // 若配置的是 github.com，同时与全局 GitHub Token 设置保持同步
      if (host.toLowerCase().includes('github.com')) {
        setGitHubToken(token);
      }
      setHostInput('');
      setTokenInput('');
      await loadTokens();
      showToast(`已保存 ${host} 的只读访问令牌`, 'success');
    } catch (err) {
      showToast(`保存令牌失败: ${err}`, 'error');
    } finally {
      setIsSavingToken(false);
    }
  };

  const handleDeleteToken = async (host: string) => {
    try {
      await invoke('delete_host_token', { host });
      if (host === 'github.com') {
        setGitHubToken('');
      }
      await loadTokens();
      showToast(`已删除 ${host} 的访问令牌`, 'info');
    } catch (err) {
      showToast(`删除失败: ${err}`, 'error');
    }
  };

  const hasLegacyGithubToken = !!getGitHubToken() && !tokens.some(t => t.host === 'github.com');

  return (
    <div className="fixed inset-0 z-[75] flex justify-end">
      {/* 半透明遮罩 */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px] animate-in fade-in duration-150"
        onClick={onClose}
      />

      {/* 右侧抽屉面板 */}
      <div className="relative w-full max-w-[440px] h-full bg-white shadow-2xl border-l border-black/10 flex flex-col animate-in slide-in-from-right duration-200">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]/70 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center">
              <FolderGit2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-[var(--foreground)] leading-tight">
                管理技能仓库
              </h2>
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                订阅公开或私有 Git 仓库，自动识别其中的全部 SKILL.md
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 滚动内容体 */}
        <div className="flex-1 overflow-y-auto hover-scroll p-5 space-y-6">
          {/* 1. 添加技能仓库 */}
          <section className="space-y-3">
            <h3 className="text-[12px] font-semibold text-[var(--foreground)]">添加技能仓库</h3>
            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] font-medium text-[var(--color-muted)] mb-1">
                  仓库 URL 或简写
                </label>
                <input
                  type="text"
                  value={repoInput}
                  onChange={e => setRepoInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddRepo();
                  }}
                  placeholder="owner/name、https://github.com/owner/name 或自建 GitLab"
                  className="w-full px-3 py-2 rounded-lg text-[12.5px] bg-black/[0.03] border border-black/10 text-[var(--foreground)] placeholder:text-[var(--color-muted)]/60 focus:outline-none focus:border-[var(--color-primary)] focus:bg-white transition-all"
                />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-[11px] font-medium text-[var(--color-muted)] mb-1">
                    分支（留空自动探测默认分支）
                  </label>
                  <input
                    type="text"
                    value={branchInput}
                    onChange={e => setBranchInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAddRepo();
                    }}
                    placeholder="main"
                    className="w-full px-3 py-1.5 rounded-lg text-[12.5px] bg-black/[0.03] border border-black/10 text-[var(--foreground)] placeholder:text-[var(--color-muted)]/60 focus:outline-none focus:border-[var(--color-primary)] focus:bg-white transition-all"
                  />
                </div>
                <button
                  type="button"
                  disabled={isAdding || !repoInput.trim()}
                  onClick={() => handleAddRepo()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-45 transition-all cursor-pointer shrink-0 h-[34px] shadow-xs"
                >
                  {isAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>添加仓库</span>
                </button>
              </div>
            </div>
          </section>

          {/* 2. 推荐一键订阅 */}
          {unsubscribedRecommendations.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                <h3 className="text-[12px] font-semibold text-[var(--foreground)]">推荐仓库一键订阅</h3>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {unsubscribedRecommendations.map(rec => (
                  <button
                    key={rec.label}
                    type="button"
                    disabled={isAdding}
                    onClick={() => handleAddRepo(`${rec.owner}/${rec.repo}`, rec.branch)}
                    title={rec.description}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11.5px] font-medium bg-black/[0.03] hover:bg-[var(--color-primary)]/10 text-[var(--foreground)] hover:text-[var(--color-primary)] border border-black/[0.06] hover:border-[var(--color-primary)]/25 transition-all cursor-pointer"
                  >
                    <Plus className="w-3 h-3 opacity-70" />
                    <span>{rec.label}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* 3. 已添加的仓库列表 */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-[12px] font-semibold text-[var(--foreground)]">
                已添加的仓库（{repos.length}）
              </h3>
              <span className="text-[11px] text-[var(--color-muted)]">勾选控制是否在列表中展示</span>
            </div>

            {repos.length === 0 ? (
              <div className="py-6 text-center rounded-xl border border-dashed border-black/10 text-[12px] text-[var(--color-muted)]">
                暂无订阅仓库，请在上方输入仓库地址或点击推荐仓库添加
              </div>
            ) : (
              <div className="rounded-xl border border-black/[0.07] divide-y divide-black/[0.05] overflow-hidden bg-white">
                {repos.map(repo => {
                  const isSyncing = syncingRepoIds.has(repo.id);
                  const repoWebUrl = `https://${repo.host}/${repo.owner}/${repo.repo}`;
                  return (
                    <div
                      key={repo.id}
                      className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-black/[0.015] transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleRepo(repo)}
                        className={`w-4 h-4 rounded-[4px] flex items-center justify-center border transition-colors shrink-0 cursor-pointer ${
                          repo.enabled
                            ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                            : 'bg-white border-black/20 hover:border-black/40'
                        }`}
                        title={repo.enabled ? '停用此仓库源' : '启用此仓库源'}
                      >
                        {repo.enabled && <Check className="w-3 h-3 stroke-[3]" />}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold text-[var(--foreground)] truncate">
                          {repo.owner}/{repo.repo}
                        </div>
                        <div className="text-[11px] text-[var(--color-muted)] flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono">{repo.branch || 'auto'}</span>
                          <span>·</span>
                          {isSyncing ? (
                            <span className="text-[var(--color-primary)] inline-flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              正在扫描...
                            </span>
                          ) : repo.lastSyncedAt ? (
                            <span>识别到 {repo.skillCount} 个技能</span>
                          ) : (
                            <span>尚未扫描</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          disabled={isSyncing}
                          onClick={() => onSyncSingleRepo(repo.id, true)}
                          className="p-1.5 rounded-md text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:bg-black/5 transition-colors cursor-pointer disabled:opacity-40"
                          title="刷新此仓库索引"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openUrl(repoWebUrl).catch(console.error)}
                          className="p-1.5 rounded-md text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors cursor-pointer"
                          title="在浏览器打开仓库"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRepo(repo)}
                          className="p-1.5 rounded-md text-[var(--color-muted)] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          title="移除订阅"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 4. 访问令牌（多站点只读） */}
          <section className="space-y-3 pt-2 border-t border-black/[0.06]">
            <div>
              <h3 className="text-[12px] font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-amber-500" />
                <span>访问令牌（可选）</span>
              </h3>
              <p className="text-[11px] text-[var(--color-muted)] mt-1 leading-relaxed">
                读取私有仓库或提升 GitHub API 额度（5,000 次/小时）时使用。令牌仅保存在本机数据库，不随云同步，只需只读权限。
              </p>
            </div>

            {(tokens.length > 0 || hasLegacyGithubToken) && (
              <div className="space-y-1.5">
                {tokens.map(t => (
                  <div
                    key={t.host}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-50/70 border border-emerald-200/70 text-[12px]"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-[var(--foreground)]">{t.host}</span>
                      <span className="ml-2 font-mono text-[11px] text-[var(--color-muted)]">
                        {t.maskedToken}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteToken(t.host)}
                      className="p-1 rounded text-[var(--color-muted)] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      title="删除此站点令牌"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {hasLegacyGithubToken && (
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-50/70 border border-emerald-200/70 text-[12px]">
                    <div>
                      <span className="font-semibold text-[var(--foreground)]">github.com</span>
                      <span className="ml-2 text-[11px] text-emerald-700">已复用全局设置中的 Token</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <input
                type="text"
                value={hostInput}
                onChange={e => setHostInput(e.target.value)}
                placeholder="站点：github.com 或 gitlab.example.com（默认 github.com）"
                className="w-full px-3 py-1.5 rounded-lg text-[12px] bg-black/[0.03] border border-black/10 text-[var(--foreground)] placeholder:text-[var(--color-muted)]/60 focus:outline-none focus:border-[var(--color-primary)] focus:bg-white transition-all"
              />
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={tokenInput}
                  onChange={e => setTokenInput(e.target.value)}
                  placeholder="粘贴只读访问令牌 (ghp_... / glpat-...)"
                  className="flex-1 px-3 py-1.5 rounded-lg text-[12px] font-mono bg-black/[0.03] border border-black/10 text-[var(--foreground)] placeholder:text-[var(--color-muted)]/60 focus:outline-none focus:border-[var(--color-primary)] focus:bg-white transition-all"
                />
                <button
                  type="button"
                  disabled={isSavingToken || !tokenInput.trim()}
                  onClick={handleSaveToken}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-black/[0.05] hover:bg-black/[0.09] text-[var(--foreground)] disabled:opacity-40 transition-colors cursor-pointer shrink-0"
                >
                  {isSavingToken ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                  <span>保存令牌</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
