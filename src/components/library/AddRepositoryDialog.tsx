import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Globe, X, FolderGit2, HardDrive, ArrowLeft, Link as LinkIcon, Copy, FileOutput } from "lucide-react";

interface AddRepositoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onCloningStart?: (path: string, name: string) => void;
  onCloningSuccess?: (path: string) => void;
  onCloningError?: (path: string, err: any) => void;
  defaultTab?: "local" | "github" | null;
  defaultTargetDir?: string;
}

export function AddRepositoryDialog({ isOpen, onClose, onSuccess, onCloningStart, onCloningSuccess, onCloningError, defaultTab, defaultTargetDir }: AddRepositoryDialogProps) {
  const [step, setStep] = useState<"select" | "form">("select");
  const [tab, setTab] = useState<"local" | "github">("local");
  const [loading, setLoading] = useState(false);
  
  // Local state
  const [localPath, setLocalPath] = useState("");
  const [strategy, setStrategy] = useState<"link" | "copy" | "move">("link");
  const [localTargetDir, setLocalTargetDir] = useState("");

  // GitHub state
  const [githubUrl, setGithubUrl] = useState("");
  const [githubTargetDir, setGithubTargetDir] = useState("");

  useEffect(() => {
    if (isOpen) {
      if (defaultTab) {
        setTab(defaultTab);
        setStep("form");
      } else {
        setStep("select");
      }
      if (defaultTargetDir) {
         setLocalTargetDir(defaultTargetDir);
         setGithubTargetDir(defaultTargetDir);
      }
    }
  }, [isOpen, defaultTab, defaultTargetDir]);

  if (!isOpen) return null;

  const handleSelectType = (type: "local" | "github") => {
    setTab(type);
    setStep("form");
  };

  const handleBack = () => {
    if (defaultTab) {
      onClose();
    } else {
      setStep("select");
    }
  };

  const handleBrowseLocal = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === "string") {
        setLocalPath(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleBrowseLocalTarget = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === "string") {
        setLocalTargetDir(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleBrowseTarget = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === "string") {
        setGithubTargetDir(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (tab === "local") {
        await invoke("scan_and_add_source_directory", {
          path: localPath,
          dirType: "local",
          strategy: strategy,
          targetDir: (strategy === "copy" || strategy === "move") ? localTargetDir : null
        });
        onSuccess();
        onClose();
        // Reset state after close
        setTimeout(() => setStep("select"), 300);
      } else {
        const repoName = githubUrl.split('/').filter(Boolean).pop()?.replace('.git', '') || 'repo';
        const finalTargetDir = `${githubTargetDir}/${repoName}`.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
        
        onCloningStart?.(finalTargetDir, repoName);
        onClose(); // 立即关闭弹窗
        setGithubUrl(""); // 清空输入框
        setTimeout(() => setStep("select"), 300);

        // 后台继续执行克隆
        invoke("add_github_repository", {
          url: githubUrl,
          targetDir: finalTargetDir,
          parentDir: githubTargetDir,
        }).then(() => {
          onCloningSuccess?.(finalTargetDir);
          onSuccess();
        }).catch(err => {
          onCloningError?.(finalTargetDir, err);
          alert(`克隆失败: ${err}`);
        });
      }
    } catch (err) {
      alert(`Error: ${err}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-sm p-4">
      <div className="bg-white/95 backdrop-blur-xl border border-[var(--color-border)] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col relative transition-all duration-300">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between relative">
          {step === "form" && (
            <button 
              onClick={handleBack} 
              className="absolute left-4 p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h2 className={`text-lg font-medium text-[var(--foreground)] flex-1 ${step === "form" ? 'text-center' : 'text-left'}`}>
            {step === "select" ? "添加技能" : (tab === "local" ? "导入本地技能" : "克隆 GitHub 技能库")}
          </h2>
          <button onClick={onClose} className={`p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors ${step === "form" ? 'absolute right-4' : ''}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="relative">
          
          {/* Step 1: Selection View */}
          {step === "select" && (
            <div className="p-4 space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <button 
                onClick={() => handleSelectType("local")}
                className="w-full text-left group flex items-start p-2 bg-transparent hover:bg-black/5 rounded-md transition-all"
              >
                <div className="w-8 h-8 rounded-md bg-black/5 group-hover:bg-black/10 flex items-center justify-center shrink-0 transition-colors">
                  <HardDrive className="w-4 h-4 text-[var(--color-muted)] group-hover:text-[var(--foreground)] transition-colors" />
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-[13px] font-medium text-[var(--foreground)] transition-colors">导入本地技能</h3>
                  <p className="text-[11px] text-[var(--color-muted)] mt-0.5 leading-relaxed">
                    选择一个本地文件夹。无论是单项技能还是包含多个子技能的根目录，系统都会聪明地自动扫描并提取。
                  </p>
                </div>
              </button>

              <button 
                onClick={() => handleSelectType("github")}
                className="w-full text-left group flex items-start p-2 bg-transparent hover:bg-black/5 rounded-md transition-all"
              >
                <div className="w-8 h-8 rounded-md bg-black/5 group-hover:bg-black/10 flex items-center justify-center shrink-0 transition-colors">
                  <Globe className="w-4 h-4 text-[var(--color-muted)] group-hover:text-[var(--foreground)] transition-colors" />
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-[13px] font-medium text-[var(--foreground)] transition-colors">克隆 GitHub 技能库</h3>
                  <p className="text-[11px] text-[var(--color-muted)] mt-0.5 leading-relaxed">
                    输入 GitHub 仓库链接，后台将自动克隆并提取仓库内所有的可用技能到本地。
                  </p>
                </div>
              </button>
            </div>
          )}

          {/* Step 2: Form View */}
          {step === "form" && (
            <form onSubmit={handleSubmit} className="p-6 flex flex-col space-y-5 animate-in fade-in slide-in-from-right-8 duration-300">
              {tab === "local" ? (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[var(--foreground)]">技能目录路径</label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        required
                        readOnly
                        value={localPath}
                        placeholder="选择一个文件夹..."
                        className="input-field flex-1"
                      />
                      <button type="button" onClick={handleBrowseLocal} className="px-2.5 py-0.5 rounded-md border border-[var(--color-border)] bg-white text-[12px] font-medium hover:bg-black/5 transition-colors">
                        浏览
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[var(--foreground)]">导入策略</label>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => setStrategy("link")}
                        className={`flex flex-col items-center justify-center py-2 px-2 rounded-md border transition-all ${strategy === "link" ? "bg-black/5 border-[var(--color-border)] text-[var(--foreground)]" : "bg-transparent border-[var(--color-border)] text-[var(--color-muted)] hover:bg-black/5"}`}
                      >
                        <LinkIcon className="w-4 h-4 mb-1.5" />
                        <span className="text-[11px] font-semibold">原址引用</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setStrategy("copy")}
                        className={`flex flex-col items-center justify-center py-2 px-2 rounded-md border transition-all ${strategy === "copy" ? "bg-black/5 border-[var(--color-border)] text-[var(--foreground)]" : "bg-transparent border-[var(--color-border)] text-[var(--color-muted)] hover:bg-black/5"}`}
                      >
                        <Copy className="w-4 h-4 mb-1.5" />
                        <span className="text-[11px] font-semibold">复制导入</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setStrategy("move")}
                        className={`flex flex-col items-center justify-center py-2 px-2 rounded-md border transition-all ${strategy === "move" ? "bg-black/5 border-[var(--color-border)] text-[var(--foreground)]" : "bg-transparent border-[var(--color-border)] text-[var(--color-muted)] hover:bg-black/5"}`}
                      >
                        <FileOutput className="w-4 h-4 mb-1.5" />
                        <span className="text-[11px] font-semibold">移动导入</span>
                      </button>
                    </div>
                    <div className="text-[11px] text-[var(--color-muted)] mt-2 leading-relaxed bg-[var(--color-muted-bg)] p-2.5 rounded-md border border-[var(--color-border)]/50">
                      {strategy === "link" && <><span className="font-semibold text-[var(--foreground)]">仅挂载读取：</span>保持你上面选择的文件夹在原地不动。开发者首选，支持热更新测试。</>}
                      {strategy === "copy" && <><span className="font-semibold text-[var(--foreground)]">创建副本：</span>将上面选中的源文件夹安全复制到下方选择的「目标集中目录」中，保留双份。</>}
                      {strategy === "move" && <><span className="font-semibold text-[var(--foreground)]">物理转移：</span>将上面选中的源文件夹直接剪切到下方选择的「目标集中目录」中，节约空间。</>}
                    </div>
                  </div>

                  {(strategy === "copy" || strategy === "move") && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                      <label className="text-sm font-medium text-[var(--foreground)]">目标集中目录</label>
                      <div className="flex space-x-2">
                        <input
                          type="text"
                          required
                          readOnly
                          value={localTargetDir}
                          placeholder="选择你要集中管理 Skill 的文件夹..."
                          className="input-field flex-1"
                        />
                        <button type="button" onClick={handleBrowseLocalTarget} className="px-2.5 py-0.5 rounded-md border border-[var(--color-border)] bg-white text-[12px] font-medium hover:bg-black/5 transition-colors">
                          浏览
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[var(--foreground)]">GitHub 存储库链接</label>
                    <input
                      type="url"
                      required
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      placeholder="https://github.com/user/repo.git"
                      className="input-field w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[var(--foreground)]">本地保存目录</label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        required
                        readOnly
                        value={githubTargetDir}
                        placeholder="选择下载位置..."
                        className="input-field flex-1"
                      />
                      <button type="button" onClick={handleBrowseTarget} className="px-2.5 py-0.5 rounded-md border border-[var(--color-border)] bg-white text-[12px] font-medium hover:bg-black/5 transition-colors">
                        浏览
                      </button>
                    </div>
                    <p className="text-[11px] text-[var(--color-muted)] mt-1.5 leading-relaxed h-8">
                      {githubUrl && githubTargetDir ? (
                        <span className="font-mono break-all text-[var(--color-primary)]">
                          目标: {githubTargetDir.replace(/\\/g, '/')}/{githubUrl.split('/').filter(Boolean).pop()?.replace('.git', '') || 'repo'}
                        </span>
                      ) : "我们将把存储库克隆到该目录下。"}
                    </p>
                  </div>
                </>
              )}

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-2.5 py-1 rounded-md text-[13px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-all"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading || (tab === "local" && !localPath) || (tab === "local" && (strategy === "copy" || strategy === "move") && !localTargetDir) || (tab === "github" && (!githubUrl || !githubTargetDir))}
                  className="flex items-center justify-center space-x-1.5 bg-[var(--color-foreground)] text-white px-2.5 py-1 rounded-md text-[13px] font-medium hover:bg-black transition-all"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <>
                      {tab === 'local' ? <FolderGit2 className="w-4 h-4 mr-2" /> : <Globe className="w-4 h-4 mr-2" />}
                      <span>{tab === 'local' ? '开始导入' : '克隆仓库'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
