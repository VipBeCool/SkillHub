import { useState, useEffect } from "react";
import { X, RefreshCw } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import logo from "../../assets/logo.png";

interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  const [appVersion, setAppVersion] = useState<string>("...");
  const [isChecking, setIsChecking] = useState(false);
  const [update, setUpdate] = useState<Update | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      getVersion().then((version) => setAppVersion(version)).catch(console.error);
      // 重置状态
      setUpdate(null);
      setIsDownloading(false);
      setProgress(0);
      setStatusMessage("");
    }
  }, [isOpen]);

  const handleCheckUpdate = async () => {
    if (isChecking || isDownloading) return;
    
    setIsChecking(true);
    setStatusMessage("正在检查更新...");
    try {
      const result = await check();
      if (result?.available) {
        setUpdate(result);
        setStatusMessage(`发现新版本 v${result.version}`);
      } else {
        setStatusMessage("当前已是最新版本");
        setTimeout(() => setStatusMessage(""), 3000);
      }
    } catch (e) {
      console.error(e);
      setStatusMessage("检查更新失败");
      setTimeout(() => setStatusMessage(""), 3000);
    } finally {
      setIsChecking(false);
    }
  };

  const handleDownload = async () => {
    if (!update || isDownloading) return;
    
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
      setStatusMessage("更新完成，正在重启...");
      await relaunch();
    } catch (e) {
      console.error('更新失败:', e);
      setStatusMessage("更新下载失败");
      setIsDownloading(false);
      setTimeout(() => setStatusMessage(`发现新版本 v${update.version}`), 3000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 modal-backdrop transition-opacity"
        onClick={onClose}
      />
      
      {/* Dialog */}
      <div 
        className="relative modal-glass w-[340px] flex flex-col items-center pt-10 pb-8 px-8 animate-in zoom-in-95 duration-200 text-[var(--foreground)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="mb-5">
          <img src={logo} alt="SkillHub Logo" className="w-24 h-24 object-contain" />
        </div>
        
        <h2 className="text-[28px] font-semibold mb-1 tracking-tight">SkillHub</h2>
        <p className="text-[13px] text-[var(--color-muted)] mb-6 font-medium">
          个人技能与 Prompt 管理枢纽
        </p>

        <div className="flex flex-col items-center gap-1.5 mb-7">
          <div className="text-[12px] text-black/30 font-mono tracking-wide">
            v{appVersion}
          </div>
          
          {/* Update Section */}
          <div className="h-6 flex items-center justify-center">
            {isDownloading ? (
              <div className="flex items-center gap-2 text-[12px] text-blue-500 font-medium">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>正在下载... {progress}%</span>
              </div>
            ) : update ? (
              <button 
                onClick={handleDownload}
                className="text-[12px] text-blue-500 hover:text-blue-600 font-semibold transition-colors flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-full"
              >
                {statusMessage || `下载更新 (v${update.version})`}
              </button>
            ) : (
              <button 
                onClick={handleCheckUpdate}
                disabled={isChecking}
                className={`text-[12px] font-medium transition-colors ${
                  statusMessage.includes('失败') 
                    ? 'text-red-500' 
                    : statusMessage.includes('最新')
                    ? 'text-green-500'
                    : 'text-blue-500 hover:text-blue-600'
                } ${isChecking ? 'opacity-70' : ''}`}
              >
                {statusMessage || "检查更新"}
              </button>
            )}
          </div>
        </div>

        <button 
          onClick={onClose}
          className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-[14px] font-medium rounded-lg transition-colors mb-5 shadow-sm"
        >
          确认
        </button>

        <div className="text-[11px] text-black/20 tracking-widest font-medium">
          Copyright © 2024-2026 SkillHub
        </div>
      </div>
    </div>
  );
}
