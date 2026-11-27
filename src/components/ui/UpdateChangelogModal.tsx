import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Update } from '@tauri-apps/plugin-updater';
import { openUrl } from '@tauri-apps/plugin-opener';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  X,
  Download,
  RefreshCw,
  ExternalLink,
  Calendar,
  ArrowRight,
  AlertCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  Maximize2,
} from 'lucide-react';
import logo from '../../assets/logo.png';

const REPO_RELEASES_URL = 'https://github.com/VipBeCool/SkillHub/releases';

/** 过滤构建占位符与底部安装表格，提取纯净的更新日志 Markdown */
export function normalizeReleaseNotes(raw?: string | null): string {
  if (!raw) return '';
  let text = raw.replace(/\r\n/g, '\n').trim();
  if (!text) return '';

  const placeholderPatterns = [
    /^安装包正在构建中[，,]?请稍候\.{0,3}$/,
    /^See the assets to download this version and install\.?$/i,
  ];
  if (placeholderPatterns.some((re) => re.test(text))) {
    return '';
  }

  // 去掉 release.yml 自动拼接的 "## 下载安装" 尾部区块，只保留 Changelog 正文
  text = text.replace(/\n+---\s*\n+##\s*下载安装[\s\S]*$/i, '').trim();
  // 去掉可能带入的顶层版本标题（如 "## [0.2.10] - 2026-10-20"），标题已在弹窗头部展示
  text = text.replace(/^##\s*\[[^\]]+\][^\n]*\n+/, '').trim();

  return text;
}

/** 从完整 CHANGELOG.md 中按版本号提取对应章节 */
export function extractVersionNotesFromChangelog(changelog: string, version: string): string {
  const cleanVer = version.replace(/^v/i, '').trim();
  if (!cleanVer) return '';
  const escaped = cleanVer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`##\\s*\\[${escaped}\\][^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s*\\[|$)`);
  const match = changelog.replace(/\r\n/g, '\n').match(regex);
  return match?.[1] ? normalizeReleaseNotes(match[1]) : '';
}

/** 将发布时间格式化为 YYYY-MM-DD */
export function formatUpdateDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) {
    const simpleMatch = dateStr.match(/\d{4}-\d{2}-\d{2}/);
    return simpleMatch ? simpleMatch[0] : '';
  }
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 格式化下载字节数（KB / MB） */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 当 latest.json 未包含 notes 时，尝试从 GitHub Release 或 CHANGELOG.md 兜底补全 */
async function fetchFallbackReleaseNotes(
  version: string,
  signal?: AbortSignal
): Promise<{ notes: string; date?: string } | null> {
  const cleanVer = version.replace(/^v/i, '').trim();
  if (!cleanVer) return null;

  const fetchWithTimeout = async (url: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const onOuterAbort = () => controller.abort();
    signal?.addEventListener('abort', onOuterAbort);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onOuterAbort);
    }
  };

  // 1. 优先查对应 Tag 的 GitHub Release 正文
  try {
    const res = await fetchWithTimeout(
      `https://api.github.com/repos/VipBeCool/SkillHub/releases/tags/v${cleanVer}`
    );
    if (res.ok) {
      const data = await res.json();
      const notes = normalizeReleaseNotes(data?.body);
      if (notes) {
        return { notes, date: data?.published_at };
      }
    }
  } catch {
    // 忽略超时或限流，进入下一级兜底
  }

  // 2. 兜底读取仓库根目录下 CHANGELOG.md（兼容镜像直连）
  const changelogUrls = [
    'https://gh-proxy.com/https://raw.githubusercontent.com/VipBeCool/SkillHub/main/CHANGELOG.md',
    'https://raw.githubusercontent.com/VipBeCool/SkillHub/main/CHANGELOG.md',
  ];
  for (const url of changelogUrls) {
    if (signal?.aborted) break;
    try {
      const res = await fetchWithTimeout(url);
      if (res.ok) {
        const md = await res.text();
        const notes = extractVersionNotesFromChangelog(md, cleanVer);
        if (notes) {
          return { notes };
        }
      }
    } catch {
      // 继续尝试下一个地址
    }
  }

  return null;
}

/** 统一解析并补全 Update 对象的更新日志与发布日期 */
export function useResolvedReleaseNotes(update: Update | null) {
  const initialNotes = useMemo(() => normalizeReleaseNotes(update?.body), [update?.body]);
  const [fallbackNotes, setFallbackNotes] = useState<string>('');
  const [fallbackDate, setFallbackDate] = useState<string>('');
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);

  useEffect(() => {
    setFallbackNotes('');
    setFallbackDate('');
    if (!update || initialNotes) {
      setIsLoadingNotes(false);
      return;
    }

    const controller = new AbortController();
    setIsLoadingNotes(true);
    fetchFallbackReleaseNotes(update.version, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted && res) {
          setFallbackNotes(res.notes);
          if (res.date) setFallbackDate(res.date);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingNotes(false);
        }
      });

    return () => controller.abort();
  }, [update?.version, initialNotes]);

  const notes = initialNotes || fallbackNotes;
  const releaseDate = formatUpdateDate(update?.date || fallbackDate);
  const releaseUrl = update ? `${REPO_RELEASES_URL}/tag/v${update.version.replace(/^v/i, '')}` : `${REPO_RELEASES_URL}/latest`;

  return { notes, releaseDate, releaseUrl, isLoadingNotes };
}

interface ReleaseNotesViewProps {
  notes: string;
  isLoading?: boolean;
  compact?: boolean;
  releaseUrl?: string;
}

/** 渲染结构化版本更新日志正文（支持 compact 紧凑卡片模式与标准详情模式） */
export function ReleaseNotesView({
  notes,
  isLoading = false,
  compact = false,
  releaseUrl = `${REPO_RELEASES_URL}/latest`,
}: ReleaseNotesViewProps) {
  if (isLoading) {
    return (
      <div className={compact ? 'space-y-2 py-1' : 'space-y-2.5 py-2'}>
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-muted)]">
          <RefreshCw className="w-3 h-3 animate-spin" />
          <span>正在获取更新日志...</span>
        </div>
        <div className="space-y-1.5 animate-pulse">
          <div className="h-2.5 bg-black/[0.06] dark:bg-white/[0.08] rounded w-1/3" />
          <div className="h-2.5 bg-black/[0.05] dark:bg-white/[0.06] rounded w-11/12" />
          <div className="h-2.5 bg-black/[0.05] dark:bg-white/[0.06] rounded w-4/5" />
        </div>
      </div>
    );
  }

  if (!notes) {
    return (
      <div className={`flex flex-col items-start gap-1.5 ${compact ? 'py-1' : 'py-3'}`}>
        <p className="text-[11.5px] text-[var(--color-muted)] leading-relaxed">
          暂未获取到本次版本的文字更新说明。
        </p>
        <button
          type="button"
          onClick={() => openUrl(releaseUrl).catch(console.error)}
          className="inline-flex items-center gap-1 text-[11.5px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-medium"
        >
          <span>前往 GitHub Release 查看详情</span>
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    );
  }

  const getHeadingDotColor = (text: string) => {
    if (/新增|feat|feature|亮点/i.test(text)) return 'bg-blue-500';
    if (/修复|fix|bug/i.test(text)) return 'bg-emerald-500';
    if (/优化|perf|改进|提升|chore/i.test(text)) return 'bg-amber-500';
    return 'bg-slate-400';
  };

  return (
    <div
      className={compact ? 'text-[11.5px] leading-relaxed text-[var(--foreground)]/85' : 'text-[13px] leading-relaxed text-[var(--foreground)]/90'}
      style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children }) => {
            const label = String(children ?? '');
            return (
              <div className={`flex items-center gap-1.5 font-semibold text-[var(--foreground)] ${compact ? 'text-[11.5px] mt-2.5 first:mt-0 mb-1' : 'text-[13px] mt-4 first:mt-0 mb-2'}`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${getHeadingDotColor(label)}`} />
                <span>{children}</span>
              </div>
            );
          },
          h3: ({ children }) => {
            const label = String(children ?? '');
            return (
              <div className={`flex items-center gap-1.5 font-semibold text-[var(--foreground)] ${compact ? 'text-[11.5px] mt-2.5 first:mt-0 mb-1' : 'text-[12.5px] mt-3.5 first:mt-0 mb-1.5'}`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${getHeadingDotColor(label)}`} />
                <span>{children}</span>
              </div>
            );
          },
          ul: ({ children }) => (
            <ul className={compact ? 'space-y-1 pl-3.5 list-disc marker:text-black/25 dark:marker:text-white/30 mb-2 last:mb-0' : 'space-y-1.5 pl-4 list-disc marker:text-black/30 dark:marker:text-white/35 mb-3 last:mb-0'}>
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className={compact ? 'space-y-1 pl-4 list-decimal marker:text-black/35 mb-2 last:mb-0' : 'space-y-1.5 pl-4 list-decimal marker:text-black/40 mb-3 last:mb-0'}>
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-[var(--color-muted)] dark:text-white/70 [&>strong]:text-[var(--foreground)] [&>strong]:font-semibold">
              {children}
            </li>
          ),
          p: ({ children }) => (
            <p className={compact ? 'mb-1.5 last:mb-0 text-[var(--color-muted)] dark:text-white/70' : 'mb-2.5 last:mb-0 text-[var(--color-muted)] dark:text-white/75'}>
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-[var(--foreground)]">{children}</strong>
          ),
          code: ({ children }) => (
            <code className="px-1 py-0.5 rounded bg-black/[0.05] dark:bg-white/[0.08] font-mono text-[0.9em] text-[var(--foreground)]">
              {children}
            </code>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault();
                if (href) openUrl(href).catch(console.error);
              }}
              className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              {children}
            </a>
          ),
        }}
      >
        {notes}
      </ReactMarkdown>
    </div>
  );
}

interface CollapsibleChangelogBoxProps {
  notes: string;
  isLoading?: boolean;
  releaseUrl?: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOpenModal?: () => void;
  headerExtra?: ReactNode;
  collapsedMaxHeightClass?: string;
  expandedMaxHeightClass?: string;
  className?: string;
  footerSlot?: ReactNode;
}

/** 可收起/原地展开全部的更新日志内嵌卡片，供右下角更新提示与「关于」弹窗共用 */
export function CollapsibleChangelogBox({
  notes,
  isLoading = false,
  releaseUrl,
  isExpanded,
  onToggleExpand,
  onOpenModal,
  headerExtra,
  collapsedMaxHeightClass = 'max-h-[72px]',
  expandedMaxHeightClass = 'max-h-[300px]',
  className = '',
  footerSlot,
}: CollapsibleChangelogBoxProps) {
  const canToggle = Boolean(notes) && !isLoading;

  return (
    <div
      className={`rounded-xl bg-black/[0.025] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] overflow-hidden ${className}`}
    >
      {/* 卡片顶栏：标题 + 展开/收起按钮 + 独立大窗入口 */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-black/[0.04] dark:border-white/[0.05] bg-black/[0.015] dark:bg-white/[0.015]">
        <div className="flex items-center gap-1.5 min-w-0">
          <FileText className="w-3 h-3 text-blue-500 shrink-0" />
          <span className="text-[11px] font-semibold text-[var(--foreground)] shrink-0">
            更新内容
          </span>
          {headerExtra}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {canToggle && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10.5px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 transition-colors cursor-pointer"
            >
              <span>{isExpanded ? '收起' : '展开全部'}</span>
              {isExpanded ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          )}
          {onOpenModal && (
            <button
              type="button"
              onClick={onOpenModal}
              title="在独立大窗中查看"
              className="p-1 rounded-md text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="在独立大窗中查看"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* 正文摘要 / 全部内容区 */}
      <div
        onClick={() => {
          if (!isExpanded && canToggle) onToggleExpand();
        }}
        className={`relative px-3 py-2 text-left transition-all duration-200 ${
          isExpanded
            ? `${expandedMaxHeightClass} overflow-y-auto hover-scroll`
            : `${collapsedMaxHeightClass} overflow-hidden ${canToggle ? 'cursor-pointer' : ''}`
        }`}
      >
        <ReleaseNotesView
          notes={notes}
          isLoading={isLoading}
          compact
          releaseUrl={releaseUrl}
        />

        {!isExpanded && canToggle && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-[#f8f8f9] via-[#f8f8f9]/85 to-transparent dark:from-[#222224] dark:via-[#222224]/85" />
        )}
      </div>

      {/* 收起态底部的快捷展开条 */}
      {!isExpanded && canToggle && (
        <button
          type="button"
          onClick={onToggleExpand}
          className="w-full py-1 border-t border-black/[0.04] dark:border-white/[0.05] text-[10.5px] font-medium text-[var(--color-muted)] hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/[0.04] transition-colors flex items-center justify-center gap-1 cursor-pointer"
        >
          <span>点击展开全部更新内容</span>
          <ChevronDown className="w-3 h-3" />
        </button>
      )}

      {footerSlot}
    </div>
  );
}

interface UpdateChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentVersion: string;
  targetVersion: string;
  releaseDate?: string;
  releaseUrl?: string;
  notes: string;
  isLoadingNotes?: boolean;
  isDownloading: boolean;
  progress: number;
  downloadedBytes?: number;
  totalBytes?: number;
  errorMessage?: string | null;
  onStartUpdate: () => void;
}

/** 居中的版本更新详情弹窗：展示版本跨度、完整更新日志与下载进度 */
export function UpdateChangelogModal({
  isOpen,
  onClose,
  currentVersion,
  targetVersion,
  releaseDate,
  releaseUrl = `${REPO_RELEASES_URL}/latest`,
  notes,
  isLoadingNotes = false,
  isDownloading,
  progress,
  downloadedBytes = 0,
  totalBytes = 0,
  errorMessage,
  onStartUpdate,
}: UpdateChangelogModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDownloading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDownloading, onClose]);

  if (!isOpen) return null;

  const cleanCurrent = currentVersion.replace(/^v/i, '');
  const cleanTarget = targetVersion.replace(/^v/i, '');

  return createPortal(
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 modal-backdrop transition-opacity"
        onClick={() => {
          if (!isDownloading) onClose();
        }}
      />

      <div
        className="relative modal-glass rounded-2xl w-[520px] max-w-[92vw] overflow-hidden flex flex-col animate-in zoom-in-95 fade-in duration-200 text-[var(--foreground)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部：应用标识、版本跃迁与发布日期 */}
        <div className="px-6 pt-5 pb-4 border-b border-black/[0.06] dark:border-white/[0.08] flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <img src={logo} alt="SkillHub Logo" className="w-11 h-11 rounded-xl object-contain shrink-0 drop-shadow-xs" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[16px] font-bold tracking-tight text-[var(--foreground)]">
                  发现新版本 SkillHub
                </h3>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono">
                  v{cleanTarget}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-[11.5px] text-[var(--color-muted)] flex-wrap">
                {cleanCurrent && cleanCurrent !== '...' && (
                  <span className="inline-flex items-center gap-1 font-mono">
                    <span>v{cleanCurrent}</span>
                    <ArrowRight className="w-3 h-3 opacity-60" />
                    <span className="text-[var(--foreground)] font-medium">v{cleanTarget}</span>
                  </span>
                )}
                {releaseDate && (
                  <>
                    <span className="opacity-40">·</span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3 opacity-70" />
                      <span>{releaseDate}</span>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {!isDownloading && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
              aria-label="关闭"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 更新日志内容区 */}
        <div className="px-6 py-4 max-h-[52vh] overflow-y-auto hover-scroll">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-3">
            <FileText className="w-3.5 h-3.5" />
            <span>更新日志</span>
          </div>
          <ReleaseNotesView
            notes={notes}
            isLoading={isLoadingNotes}
            releaseUrl={releaseUrl}
          />
        </div>

        {/* 底部：下载进度 / 异常反馈 / 操作按钮 */}
        <div className="px-6 py-4 bg-black/[0.02] dark:bg-white/[0.02] border-t border-black/[0.06] dark:border-white/[0.08]">
          {isDownloading ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[12px]">
                <span className="flex items-center gap-1.5 font-medium text-blue-600 dark:text-blue-400">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>正在下载安装包，完成后将自动重启...</span>
                </span>
                <span className="font-mono text-[11.5px] text-[var(--color-muted)]">
                  {totalBytes > 0
                    ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)} (${progress}%)`
                    : `${progress}%`}
                </span>
              </div>
              <div className="w-full bg-black/[0.06] dark:bg-white/[0.1] rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {errorMessage && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-red-500/[0.08] border border-red-500/20 text-[12px] text-red-600 dark:text-red-400">
                  <span className="flex items-center gap-1.5 min-w-0 truncate">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{errorMessage}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => openUrl(`${REPO_RELEASES_URL}/latest`).catch(console.error)}
                    className="shrink-0 font-medium underline underline-offset-2 hover:opacity-80 cursor-pointer"
                  >
                    前往网页下载
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => openUrl(releaseUrl).catch(console.error)}
                  className="inline-flex items-center gap-1 text-[12px] text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>GitHub Release</span>
                </button>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl text-[12.5px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    稍后提醒
                  </button>
                  <button
                    type="button"
                    onClick={onStartUpdate}
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-[12.5px] font-medium text-white bg-blue-500 hover:bg-blue-600 active:bg-blue-700 transition-colors shadow-sm cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{errorMessage ? '重试更新' : '立即更新并重启'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
