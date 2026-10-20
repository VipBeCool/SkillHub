import React, { useEffect, useRef, useState } from 'react';
import { Terminal, X, Copy, Check, AlertCircle, Loader2 } from 'lucide-react';
import { CloningRepo } from '../../types';
import { showToast } from '../ui/Toast';

interface CloneProgressModalProps {
  repo: CloningRepo | null;
  isOpen: boolean;
  onClose: () => void;
  onCancel: (e: React.MouseEvent, path: string) => void;
}

export const CloneProgressModal: React.FC<CloneProgressModalProps> = ({
  repo,
  isOpen,
  onClose,
  onCancel,
}) => {
  const [copied, setCopied] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // 每次日志更新时自动滚动到底部
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [repo?.progress?.rawLines]);

  if (!isOpen || !repo) return null;

  const rawLines = repo.progress?.rawLines || [];
  const percent = repo.progress?.percent;
  const statusMessage = repo.progress?.message || '正在拉取...';

  const handleCopyLogs = () => {
    if (rawLines.length === 0) return;
    navigator.clipboard.writeText(rawLines.join('\n'));
    setCopied(true);
    showToast('日志已复制到剪贴板');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 遮罩层 */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity animate-in fade-in duration-200" 
        onClick={onClose} 
      />

      {/* 弹窗主体 */}
      <div className="modal-glass rounded-2xl w-full max-w-xl overflow-hidden flex flex-col relative z-10 shadow-2xl border border-[var(--color-border)] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[var(--color-border)]/70 flex items-center justify-between bg-white/70 dark:bg-black/30">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Terminal className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[var(--foreground)] truncate">
                正在拉取: {repo.name}
              </h3>
              <p className="text-[11px] text-[var(--color-muted)] truncate font-mono">
                {repo.path}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 状态与进度条 */}
        <div className="px-5 py-3 border-b border-[var(--color-border)]/50 bg-[#fafbfc]/60 dark:bg-white/[0.02]">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-medium text-[var(--foreground)] flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
              <span>{statusMessage}</span>
            </span>
            {typeof percent === 'number' && (
              <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                {percent}%
              </span>
            )}
          </div>
          <div className="w-full h-1.5 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 transition-all duration-200 ease-out rounded-full"
              style={{ width: `${typeof percent === 'number' ? Math.max(percent, 5) : 30}%` }}
            />
          </div>
        </div>

        {/* 终端控制台日志区 */}
        <div className="p-4 bg-[#0d1117] flex-1 flex flex-col min-h-[220px] max-h-[340px]">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 text-[11px] text-gray-400">
            <span>Git 控制台实时输出</span>
            <button
              onClick={handleCopyLogs}
              disabled={rawLines.length === 0}
              className="flex items-center space-x-1 px-2 py-0.5 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
            >
              {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? '已复制' : '复制日志'}</span>
            </button>
          </div>
          
          <div 
            ref={logContainerRef}
            className="flex-1 overflow-y-auto space-y-1 font-mono text-[11px] text-gray-300 leading-relaxed pr-1 select-text scrollbar-thin"
          >
            {rawLines.length === 0 ? (
              <div className="text-gray-500 flex items-center space-x-2 py-4 justify-center">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>等待 Git 输出...</span>
              </div>
            ) : (
              rawLines.map((line, idx) => (
                <div key={idx} className="break-all whitespace-pre-wrap">
                  <span className="text-gray-600 mr-2 select-none">{String(idx + 1).padStart(2, '0')}</span>
                  {line}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer 操作区 */}
        <div className="px-5 py-3 border-t border-[var(--color-border)] flex items-center justify-between bg-white/70 dark:bg-black/20">
          <span className="text-[11px] text-[var(--color-muted)] flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5 text-blue-500" />
            <span>关闭弹窗不影响拉取，卡片将在完成后自动就绪</span>
          </span>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={(e) => {
                onCancel(e, repo.path);
                onClose();
              }}
              className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors border border-red-200 dark:border-red-900/50"
            >
              取消拉取
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium bg-black/5 dark:bg-white/10 text-[var(--foreground)] hover:bg-black/10 dark:hover:bg-white/20 rounded-lg transition-colors"
            >
              关闭
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
