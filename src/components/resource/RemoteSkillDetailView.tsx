import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import {
  ArrowLeft,
  Download,
  Check,
  Loader2,
  ExternalLink,
  Copy,
  FileText,
  FolderOpen,
  Package,
  Languages,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import type { RemoteSkillPreview, RemoteSkillTarget } from '../../types/resourceHub';
import { formatByteSize, formatCompactCount } from '../../data/curated-leaderboards';
import { getGitHubToken } from '../../utils/githubToken';
import { InstalledActionButton } from './InstalledActionButton';
import { showToast } from '../ui/Toast';

interface RemoteSkillDetailViewProps {
  target: RemoteSkillTarget;
  parentTitle?: string;
  isInstalled: boolean;
  isInstalling: boolean;
  onBack: () => void;
  onInstall: (target: RemoteSkillTarget, mode: 'subskill' | 'repo') => Promise<void>;
  onViewInstalledSkill: (target: RemoteSkillTarget) => void;
  onOpenInstalledFolder: (target: RemoteSkillTarget) => void;
  onUninstallRemoteSkill: (target: RemoteSkillTarget) => void;
}

/**
 * 统一的安装前远程技能详情与 SKILL.md 实时预览页
 */
export function RemoteSkillDetailView({
  target,
  parentTitle = '资源中心',
  isInstalled,
  isInstalling,
  onBack,
  onInstall,
  onViewInstalledSkill,
  onOpenInstalledFolder,
  onUninstallRemoteSkill,
}: RemoteSkillDetailViewProps) {
  const [preview, setPreview] = useState<RemoteSkillPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [translatedDesc, setTranslatedDesc] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);

  const loadPreview = async () => {
    setLoading(true);
    setError(null);
    setTranslatedDesc(null);
    try {
      const data = await invoke<RemoteSkillPreview>('fetch_remote_skill_preview', {
        host: target.host || 'github.com',
        owner: target.owner,
        repo: target.repo,
        branch: target.branch || null,
        skillName: target.skillName,
        subpath: target.subpath ?? null,
        githubToken: getGitHubToken() || null,
      });
      setPreview(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPreview();
  }, [target.owner, target.repo, target.skillName, target.subpath, target.branch]);

  const effectiveDesc = target.description || preview?.description || '';
  const hasChinese = /[\u4e00-\u9fa5]/.test(effectiveDesc);

  const handleTranslateDesc = async () => {
    if (!effectiveDesc || translating) return;
    setTranslating(true);
    try {
      const zh = await invoke<string>('translate_text', {
        text: effectiveDesc,
        targetLang: 'zh-CN',
      });
      setTranslatedDesc(zh);
    } catch (err) {
      showToast(`翻译失败: ${err}`, 'error');
    } finally {
      setTranslating(false);
    }
  };

  const handleCopyMarkdown = () => {
    if (!preview?.content) return;
    navigator.clipboard.writeText(preview.content);
    setCopied(true);
    showToast('已复制 SKILL.md 原文', 'success');
    setTimeout(() => setCopied(false), 1800);
  };

  const resolvedTarget: RemoteSkillTarget = preview
    ? {
        ...target,
        branch: preview.branch,
        subpath: preview.subpath,
        displayName: target.displayName || preview.displayName || target.skillName,
        description: target.description || preview.description,
        repoUrl: preview.repoUrl,
      }
    : target;

  const githubUrl =
    preview?.browseUrl ||
    target.externalUrl ||
    target.repoUrl ||
    `https://${target.host || 'github.com'}/${target.owner}/${target.repo}`;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-white">
      {/* 顶部返回与面包屑栏 */}
      <div className="shrink-0 h-11 px-5 border-b border-black/[0.06] bg-white flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[12.5px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{parentTitle}</span>
          </button>
          <span className="text-[var(--color-muted)]/40 text-xs">/</span>
          <span className="text-[12.5px] font-semibold text-[var(--foreground)] truncate">
            {target.displayName || target.skillName}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => openUrl(githubUrl).catch(console.error)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>在 GitHub 查看</span>
          </button>
        </div>
      </div>

      {/* 主体滚动区 */}
      <div className="flex-1 min-h-0 overflow-y-auto hover-scroll">
        <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
          {/* 顶部信息卡片 */}
          <div className="bg-[#FAFAFC] rounded-2xl border border-black/[0.07] p-5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-start gap-3.5 min-w-0 flex-1">
                <div className="w-12 h-12 rounded-xl bg-[var(--color-primary)]/[0.08] text-[var(--color-primary)] flex items-center justify-center shrink-0">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center flex-wrap gap-2">
                    <h1 className="text-[19px] font-bold text-[var(--foreground)] tracking-tight">
                      {target.displayName || target.skillName}
                    </h1>
                    {target.installs && target.installs > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-600">
                        ↓ {formatCompactCount(target.installs)} 安装
                      </span>
                    )}
                    {preview && preview.repoSkillCount > 1 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-black/[0.04] text-[var(--color-muted)]">
                        所属仓库含 {preview.repoSkillCount} 个技能
                      </span>
                    )}
                  </div>

                  <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-[12px] text-[var(--color-muted)] mt-1 font-mono">
                    <span>
                      {target.owner}/{target.repo}
                    </span>
                    {preview?.subpath && (
                      <>
                        <span>·</span>
                        <span className="px-1.5 py-0.2 rounded bg-black/[0.04] text-[var(--foreground)]/80">
                          {preview.subpath}
                        </span>
                      </>
                    )}
                    {preview?.branch && (
                      <>
                        <span>·</span>
                        <span>@{preview.branch}</span>
                      </>
                    )}
                  </div>

                  {effectiveDesc && (
                    <div className="mt-2.5 text-[13px] text-[var(--foreground)]/85 leading-relaxed">
                      <p>{translatedDesc || effectiveDesc}</p>
                      {!hasChinese && !translatedDesc && (
                        <button
                          type="button"
                          disabled={translating}
                          onClick={handleTranslateDesc}
                          className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-medium text-[var(--color-primary)] hover:underline cursor-pointer disabled:opacity-50"
                        >
                          {translating ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Languages className="w-3 h-3" />
                          )}
                          <span>{translating ? '正在翻译简介...' : '翻译为中文'}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 右侧安装操作组 */}
              <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
                {isInstalled && !isInstalling ? (
                  <InstalledActionButton
                    label="已安装"
                    onViewSkill={() => onViewInstalledSkill(resolvedTarget)}
                    onOpenFolder={() => onOpenInstalledFolder(resolvedTarget)}
                    onUninstall={() => onUninstallRemoteSkill(resolvedTarget)}
                  />
                ) : (
                  <button
                    type="button"
                    disabled={isInstalling}
                    onClick={() => onInstall(resolvedTarget, target.installMode === 'repo' ? 'repo' : 'subskill')}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] active:scale-[0.98] transition-all cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {isInstalling ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>正在安装...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        <span>{target.installMode === 'repo' ? '安装技能仓库' : '安装此技能'}</span>
                      </>
                    )}
                  </button>
                )}

                {preview && preview.repoSkillCount > 1 && target.installMode !== 'repo' && (
                  <button
                    type="button"
                    disabled={isInstalling}
                    onClick={() => onInstall(resolvedTarget, 'repo')}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] bg-black/[0.03] hover:bg-black/[0.06] transition-colors cursor-pointer disabled:opacity-40"
                    title="克隆完整仓库作为技能包加入本地库"
                  >
                    <Package className="w-3.5 h-3.5" />
                    <span>安装所属完整技能包（{preview.repoSkillCount} 个）</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 下半区：SKILL.md 预览 + 配套文件清单 */}
          {loading ? (
            <div className="bg-white rounded-2xl border border-black/[0.06] p-12 flex flex-col items-center justify-center gap-2.5 text-[var(--color-muted)]">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
              <p className="text-[13px]">正在实时拉取 SKILL.md 与配套目录结构...</p>
            </div>
          ) : error ? (
            <div className="bg-white rounded-2xl border border-red-200/80 p-8 flex flex-col items-center justify-center gap-3 text-center">
              <AlertCircle className="w-7 h-7 text-red-500" />
              <div className="space-y-1">
                <p className="text-[13.5px] font-semibold text-[var(--foreground)]">未能加载远程技能预览</p>
                <p className="text-[12px] text-[var(--color-muted)] max-w-md">{error}</p>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  onClick={loadPreview}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-medium bg-[var(--color-primary)] text-white hover:opacity-90 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>重试加载</span>
                </button>
                <button
                  type="button"
                  onClick={() => openUrl(githubUrl).catch(console.error)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-medium bg-black/[0.05] text-[var(--foreground)] hover:bg-black/[0.09] cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>打开 GitHub 查看</span>
                </button>
              </div>
            </div>
          ) : preview ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* 左侧：SKILL.md 正文 */}
              <div className="lg:col-span-8 bg-white rounded-2xl border border-black/[0.08] overflow-hidden">
                <div className="px-5 py-3 border-b border-black/[0.05] flex items-center justify-between bg-black/[0.015]">
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--foreground)]">
                    <FileText className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                    <span className="font-mono">{preview.skillMdPath}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyMarkdown}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11.5px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? '已复制' : '复制原文'}</span>
                  </button>
                </div>

                <div className="p-6 prose prose-sm max-w-none prose-headings:text-[var(--foreground)] prose-p:text-[var(--foreground)]/85 prose-a:text-[var(--color-primary)] prose-pre:bg-[#1E1E24] prose-pre:text-gray-100 prose-code:before:content-none prose-code:after:content-none select-text">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                    {preview.content}
                  </ReactMarkdown>
                </div>
              </div>

              {/* 右侧：配套文件清单与安装说明 */}
              <div className="lg:col-span-4 space-y-4">
                <div className="bg-[#FAFAFC] rounded-2xl border border-black/[0.07] p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[12.5px] font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                      <span>包含文件（{preview.files.length}）</span>
                    </h3>
                    <span className="text-[11px] text-[var(--color-muted)]">
                      {formatByteSize(preview.files.reduce((acc, f) => acc + f.size, 0))}
                    </span>
                  </div>
                  {preview.files.length === 0 ? (
                    <p className="text-[12px] text-[var(--color-muted)]">暂无文件列表</p>
                  ) : (
                    <div className="space-y-1 max-h-[320px] overflow-y-auto hover-scroll pr-1">
                      {preview.files.map(f => (
                        <div
                          key={f.path}
                          className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-black/[0.02] text-[11.5px]"
                        >
                          <span className="font-mono text-[var(--foreground)]/85 truncate" title={f.path}>
                            {f.path}
                          </span>
                          <span className="text-[10.5px] text-[var(--color-muted)] shrink-0">
                            {formatByteSize(f.size)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-[#FAFAFC] rounded-2xl border border-black/[0.07] p-4 space-y-2 text-[12px] text-[var(--color-muted)] leading-relaxed">
                  <h3 className="text-[12.5px] font-semibold text-[var(--foreground)]">安装说明</h3>
                  <p>
                    {preview.subpath?.trim()
                      ? `点击「${target.installMode === 'repo' ? '安装技能仓库' : '安装此技能'}」将仅提取当前技能目录及配套文件到你的目标技能库，无需下载整个仓库，并支持后续一键检查更新。`
                      : `该技能为独立 Git 仓库，点击「${target.installMode === 'repo' ? '安装技能仓库' : '安装此技能'}」将完整拉取到你的目标技能库（与直接导入 Git 仓库一致），支持后续直接拉取更新。`}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
