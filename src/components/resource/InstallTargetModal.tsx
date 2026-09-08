import { useState, useEffect } from 'react';
import { X, FolderGit2, Check } from 'lucide-react';
import type { SourceDirectory } from '../../types';
import type { ResourceItem } from '../../types/resource';

interface InstallTargetModalProps {
  isOpen: boolean;
  onClose: () => void;
  resource: ResourceItem | null;
  directories: SourceDirectory[];
  defaultSelectedDirId?: string | null;
  onConfirm: (targetDir: SourceDirectory, rememberDefault: boolean) => void;
}

export function InstallTargetModal({
  isOpen,
  onClose,
  resource,
  directories,
  defaultSelectedDirId,
  onConfirm,
}: InstallTargetModalProps) {
  const [selectedDirId, setSelectedDirId] = useState<string>('');
  const [rememberDefault, setRememberDefault] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && directories.length > 0) {
      if (defaultSelectedDirId && directories.some(d => d.id === defaultSelectedDirId)) {
        setSelectedDirId(defaultSelectedDirId);
      } else {
        const def = directories.find(d => d.is_default) || directories[0];
        setSelectedDirId(def ? def.id : directories[0].id);
      }
      setRememberDefault(false);
    }
  }, [isOpen, directories, defaultSelectedDirId]);

  if (!isOpen || !resource) return null;

  const handleConfirm = () => {
    const targetDir = directories.find(d => d.id === selectedDirId);
    if (!targetDir) return;
    onConfirm(targetDir, rememberDefault);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 modal-backdrop transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* 弹窗卡片 */}
      <div className="relative modal-glass rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-black/10 bg-white animate-in zoom-in-95 duration-200 flex flex-col">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]/60">
          <div>
            <h3 className="text-[16px] font-bold text-[var(--foreground)]">选择安装技能库</h3>
            <p className="text-[12px] text-[var(--color-muted)] mt-0.5">
              将「{resource.displayName}」安装至以下目标技能库
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 技能库选择列表 */}
        <div className="p-6 max-h-[360px] overflow-y-auto hover-scroll flex flex-col gap-2.5">
          {directories.length === 0 ? (
            <div className="py-8 text-center text-[var(--color-muted)] text-[13px]">
              未检测到可用技能库，请先在侧边栏或设置中创建技能库。
            </div>
          ) : (
            directories.map(dir => {
              const isSelected = dir.id === selectedDirId;
              return (
                <div
                  key={dir.id}
                  onClick={() => setSelectedDirId(dir.id)}
                  className={`flex items-center gap-3.5 p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/[0.04] shadow-xs'
                      : 'border-black/5 hover:border-black/15 bg-black/[0.01] hover:bg-black/[0.02]'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-black/[0.05] text-[var(--color-muted)]'
                    }`}
                  >
                    <FolderGit2 className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-[var(--foreground)] truncate">
                        {dir.label}
                      </span>
                      {dir.is_default && (
                        <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-black/[0.05] text-[var(--color-muted)]">
                          主库
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--color-muted)] font-mono truncate mt-0.5">
                      {dir.path}
                    </div>
                  </div>

                  <div className="shrink-0">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                        isSelected
                          ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                          : 'border-black/20 bg-white'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 底部配置与操作区 */}
        <div className="px-6 py-4 bg-black/[0.02] border-t border-[var(--color-border)]/60 flex items-center justify-between gap-4">
          <label className="flex items-center gap-2 cursor-pointer select-none text-[12px] text-[var(--color-muted)] hover:text-[var(--foreground)]">
            <input
              type="checkbox"
              checked={rememberDefault}
              onChange={e => setRememberDefault(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-gray-300 text-[var(--color-primary)] focus:ring-0 cursor-pointer"
            />
            <span>下次默认安装到此技能库，不再提示</span>
          </label>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedDirId}
              className="px-4 py-1.5 rounded-lg text-[13px] font-semibold bg-[var(--color-primary)] text-white hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 cursor-pointer shadow-xs"
            >
              确认安装
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
