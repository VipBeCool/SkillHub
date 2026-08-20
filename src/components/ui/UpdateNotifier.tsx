import { useState, useEffect } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { X, Download, RefreshCw } from 'lucide-react';

/**
 * 应用内更新检查组件
 * 启动后静默检查 GitHub Releases 上的 latest.json，
 * 有新版本时在右下角弹出更新提示条。
 */
export function UpdateNotifier() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
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
    if (!update) return;
    setIsDownloading(true);
    try {
      let totalBytes = 0;
      let downloadedBytes = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started' && event.data.contentLength) {
          totalBytes = event.data.contentLength;
        } else if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) {
            setProgress(Math.round((downloadedBytes / totalBytes) * 100));
          }
        }
      });
      // 下载安装完成，提示重启
      await relaunch();
    } catch (e) {
      console.error('更新失败:', e);
      setIsDownloading(false);
    }
  };

  if (!update || dismissed) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[99998] animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-black/5 p-4 w-[320px]">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Download className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <h4 className="text-[13px] font-semibold text-[var(--foreground)]">发现新版本</h4>
              <p className="text-[11px] text-[var(--color-muted)]">v{update.version} 已发布</p>
            </div>
          </div>
          {!isDownloading && (
            <button
              onClick={() => setDismissed(true)}
              className="p-1 rounded-md text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {update.body && (
          <p className="text-[11px] text-[var(--color-muted)] mb-3 line-clamp-2 leading-relaxed">
            {update.body}
          </p>
        )}

        {isDownloading ? (
          <div className="space-y-2">
            <div className="w-full bg-black/5 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--color-muted)]">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>正在下载更新 {progress}%</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDismissed(true)}
              className="flex-1 py-1.5 text-[12px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] rounded-lg hover:bg-black/5 transition-colors"
            >
              稍后提醒
            </button>
            <button
              onClick={handleUpdate}
              className="flex-1 py-1.5 text-[12px] font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors shadow-sm"
            >
              立即更新
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
