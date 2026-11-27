import { useState, useEffect } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  X,
  Download,
  RefreshCw,
  Maximize2,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import logo from '../../assets/logo.png';
import { Tooltip } from './Tooltip';
import {
  CollapsibleChangelogBox,
  UpdateChangelogModal,
  formatBytes,
  useResolvedReleaseNotes,
} from './UpdateChangelogModal';

/**
 * 应用内更新检查组件
 * 启动后静默检查 GitHub Releases 上的 latest.json，
 * 有新版本时在右下角弹出更新卡片：更新日志默认收起为摘要，支持原地「展开全部」或弹出大窗阅读。
 */
export function UpdateNotifier() {
  const [currentVersion, setCurrentVersion] = useState('');
  const [update, setUpdate] = useState<Update | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { notes, releaseDate, releaseUrl, isLoadingNotes } = useResolvedReleaseNotes(update);

  useEffect(() => {
    getVersion().then((v) => setCurrentVersion(v)).catch(() => {});

    // 延迟 3 秒再检查，避免影响启动体验
    const timer = setTimeout(async () => {
      try {
        const result = await check();
        if (result?.available) {
          setUpdate(result);
        }
      } catch (e) {
        // 静默处理，不干扰用户
        console.log('更新检查跳过:', e);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const handleUpdate = async () => {
    if (!update || isDownloading) return;
    setIsDownloading(true);
    setErrorMessage(null);
    setProgress(0);
    setDownloadedBytes(0);
    setTotalBytes(0);

    try {
      let total = 0;
      let downloaded = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started' && event.data.contentLength) {
          total = event.data.contentLength;
          setTotalBytes(total);
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          setDownloadedBytes(downloaded);
          if (total > 0) {
            setProgress(Math.round((downloaded / total) * 100));
          }
        }
      });
      await relaunch();
    } catch (e) {
      console.error('更新失败:', e);
      setErrorMessage('更新包下载或安装失败，请重试或前往网页下载');
      setIsDownloading(false);
    }
  };

  if (!update || dismissed) return null;

  const cleanCurrent = (update.currentVersion || currentVersion).replace(/^v/i, '');
  const cleanTarget = update.version.replace(/^v/i, '');

  return (
    <>
      <div className="fixed bottom-5 right-5 z-[99998] animate-in slide-in-from-bottom-4 fade-in duration-300">
        <div
          className={`modal-glass rounded-2xl shadow-[0_14px_40px_rgba(0,0,0,0.14)] border border-black/[0.08] dark:border-white/[0.1] p-4 max-w-[calc(100vw-2.5rem)] transition-[width] duration-200 ${
            isExpanded ? 'w-[440px]' : 'w-[360px]'
          }`}
        >
          {/* 顶部版本与操作入口 */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative w-9 h-9 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.05] dark:border-white/[0.08] flex items-center justify-center shrink-0">
                <img src={logo} alt="SkillHub" className="w-6 h-6 object-contain" />
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-white dark:ring-[#1E1E1E]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-[13.5px] font-semibold text-[var(--foreground)] leading-tight">
                    发现新版本
                  </h4>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 leading-none">
                    v{cleanTarget}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-[11px] text-[var(--color-muted)] font-mono">
                  {cleanCurrent && (
                    <>
                      <span>v{cleanCurrent}</span>
                      <ArrowRight className="w-2.5 h-2.5 opacity-60" />
                      <span className="text-[var(--foreground)]/80 font-medium">v{cleanTarget}</span>
                    </>
                  )}
                  {releaseDate && (
                    <>
                      {cleanCurrent && <span className="opacity-40 font-sans">·</span>}
                      <span className="font-sans">{releaseDate}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              <Tooltip content="独立弹窗查看完整更新日志">
                <button
                  type="button"
                  onClick={() => setIsDetailOpen(true)}
                  className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  aria-label="独立弹窗查看完整更新日志"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </Tooltip>
              {!isDownloading && (
                <Tooltip content="稍后提醒">
                  <button
                    type="button"
                    onClick={() => setDismissed(true)}
                    className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                    aria-label="关闭"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </Tooltip>
              )}
            </div>
          </div>

          {/* 默认收起摘要、支持点击原地展开全部的 Changelog 卡片 */}
          <CollapsibleChangelogBox
            notes={notes}
            isLoading={isLoadingNotes}
            releaseUrl={releaseUrl}
            isExpanded={isExpanded}
            onToggleExpand={() => setIsExpanded((v) => !v)}
            collapsedMaxHeightClass="max-h-[70px]"
            expandedMaxHeightClass="max-h-[320px]"
            className="mb-3"
          />

          {/* 错误反馈 */}
          {errorMessage && !isDownloading && (
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 mb-2.5 rounded-lg bg-red-500/[0.08] border border-red-500/20 text-[11px] text-red-600 dark:text-red-400">
              <span className="flex items-center gap-1 min-w-0 truncate">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{errorMessage}</span>
              </span>
              <button
                type="button"
                onClick={() => openUrl('https://github.com/VipBeCool/SkillHub/releases/latest').catch(console.error)}
                className="shrink-0 font-medium underline underline-offset-2 cursor-pointer"
              >
                网页下载
              </button>
            </div>
          )}

          {/* 底部进度条或操作按钮 */}
          {isDownloading ? (
            <div className="space-y-1.5 pt-0.5">
              <div className="w-full bg-black/[0.06] dark:bg-white/[0.1] rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3 animate-spin text-blue-500" />
                  <span>正在下载并准备安装...</span>
                </span>
                <span className="font-mono">
                  {totalBytes > 0
                    ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)} (${progress}%)`
                    : `${progress}%`}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="flex-1 py-1.5 text-[12px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                稍后提醒
              </button>
              <button
                type="button"
                onClick={handleUpdate}
                className="flex-[1.35] inline-flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-medium text-white bg-blue-500 hover:bg-blue-600 active:bg-blue-700 rounded-xl transition-colors shadow-sm cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{errorMessage ? '重试更新' : '立即更新'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <UpdateChangelogModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        currentVersion={cleanCurrent}
        targetVersion={cleanTarget}
        releaseDate={releaseDate}
        releaseUrl={releaseUrl}
        notes={notes}
        isLoadingNotes={isLoadingNotes}
        isDownloading={isDownloading}
        progress={progress}
        downloadedBytes={downloadedBytes}
        totalBytes={totalBytes}
        errorMessage={errorMessage}
        onStartUpdate={handleUpdate}
      />
    </>
  );
}
