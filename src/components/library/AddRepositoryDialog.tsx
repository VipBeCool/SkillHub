import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Globe, X, HardDrive, Link as LinkIcon, Copy, FileOutput, AlertTriangle } from "lucide-react";
import { Tooltip } from '../ui/Tooltip';
import { showToast } from "../ui/Toast";

interface AddRepositoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onCloningStart?: (path: string, name: string) => void;
  onCloningSuccess?: (path: string) => void;
  onCloningError?: (path: string, err: any) => void;
  defaultTab?: "local" | "github" | "online" | null;
  defaultTargetDir?: string | null;
  defaultSourceDirId?: string;
  defaultWorkspaceLabel?: string | null;
}


// 从 URL 中尝试提取技能名称
function guessNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return "";
    const last = parts[parts.length - 1];
    // 去掉 .md / .git 后缀
    return last.replace(/\.(md|mdx|git)$/i, "").replace(/[-_]/g, " ");
  } catch {
    return "";
  }
}

export function AddRepositoryDialog({
  isOpen,
  onClose,
  onSuccess,
  onCloningStart,
  onCloningSuccess,
  onCloningError,
  defaultTab,
  defaultTargetDir,
  defaultSourceDirId,
  defaultWorkspaceLabel,
}: AddRepositoryDialogProps) {
  const [step, setStep] = useState<"select" | "form">("select");
  const [tab, setTab] = useState<"local" | "github" | "online">("local");
  const [loading, setLoading] = useState(false);
  
  // Local state
  const [localPath, setLocalPath] = useState("");
  const [strategy, setStrategy] = useState<"link" | "copy" | "move">("copy");
  const [localTargetDir, setLocalTargetDir] = useState("");

  // GitHub state
  const [githubUrl, setGithubUrl] = useState("");
  const [githubTargetDir, setGithubTargetDir] = useState("");

  // Online state
  const [onlineUrl, setOnlineUrl] = useState("");
  const [onlineName, setOnlineName] = useState("");
  const [urlAutoNamed, setUrlAutoNamed] = useState(false); // 是否由 URL 自动填充了名称

  useEffect(() => {
    if (isOpen) {
      // 每次打开弹窗时，清空之前残留的表单状态
      setLocalPath("");
      setGithubUrl("");
      setOnlineUrl("");
      setOnlineName("");
      setUrlAutoNamed(false);

      if (defaultTab) {
        setTab(defaultTab);
        setStep("form");
      } else {
        setStep("select");
      }
      
      if (defaultTargetDir) {
         setLocalTargetDir(defaultTargetDir);
         setGithubTargetDir(defaultTargetDir);
      } else {
         setLocalTargetDir("");
         setGithubTargetDir("");
      }
    }
  }, [isOpen, defaultTab, defaultTargetDir]);

  if (!isOpen) return null;

  const handleSelectType = (type: "local" | "github" | "online") => {
    setTab(type);
    setStep("form");
  };

  const handleBrowseLocal = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === "string") setLocalPath(selected);
    } catch (e) { console.error(e); }
  };


  const handleOnlineUrlChange = (url: string) => {
    setOnlineUrl(url);
    // 如果名称还没被手动编辑过，自动从 URL 推断
    if (!urlAutoNamed || !onlineName) {
      const guessed = guessNameFromUrl(url);
      if (guessed) {
        setOnlineName(guessed);
        setUrlAutoNamed(true);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (tab === "local") {
        await invoke("import_local_skills_to_workspace", {
          path: localPath,
          strategy: strategy,
          targetDir: (strategy === "copy" || strategy === "move") ? localTargetDir : null,
          sourceDirId: defaultSourceDirId || ""
        });
        onSuccess();
        onClose();
        setLoading(false);
        setTimeout(() => setStep("select"), 300);
      } else if (tab === "online") {
        // 线上收藏：直接存 URL，不下载
        const sourceDirId = defaultSourceDirId || "";
        await invoke("add_online_skill", {
          url: onlineUrl,
          name: onlineName.trim() || onlineUrl,
          description: "",
          sourceDirId: sourceDirId,
        });
        showToast(`「${onlineName || onlineUrl}」已收藏`);
        onSuccess();
        onClose();
        // 重置表单
        setOnlineUrl(""); setOnlineName(""); setUrlAutoNamed(false);
        setTimeout(() => setStep("select"), 300);
      } else {
        // GitHub 克隆
        const repoName = githubUrl.split('/').filter(Boolean).pop()?.replace('.git', '') || 'repo';
        const finalTargetDir = `${githubTargetDir}/${repoName}`.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
        
        let isSlow = false;
        const slowTimer = setTimeout(() => {
          isSlow = true;
          onCloningStart?.(finalTargetDir, repoName);
          onClose();
          setGithubUrl("");
          setTimeout(() => setStep("select"), 300);
          setLoading(false);
        }, 150);

        invoke("import_github_skills_to_workspace", {
          url: githubUrl,
          targetDir: finalTargetDir,
          sourceDirId: defaultSourceDirId || "",
        }).then(() => {
          clearTimeout(slowTimer);
          if (!isSlow) {
            onClose();
            setGithubUrl("");
            setTimeout(() => setStep("select"), 300);
            setLoading(false);
          }
          onCloningSuccess?.(finalTargetDir);
          onSuccess();
        }).catch(err => {
          clearTimeout(slowTimer);
          if (!isSlow) {
            showToast(`${err}`, 'error');
            setLoading(false);
          } else {
            onCloningError?.(finalTargetDir, err);
          }
        });
        
        return;
      }
    } catch (err) {
      showToast(`导入出错: ${err}`, 'error');
      console.error(err);
      setLoading(false);
    }
  };


  const submitDisabled =
    loading ||
    (tab === "local" && !localPath) ||
    (tab === "local" && (strategy === "copy" || strategy === "move") && !localTargetDir) ||
    (tab === "github" && (!githubUrl || !githubTargetDir)) ||
    (tab === "online" && !onlineUrl);

  const titleMap = {
    select: "添加技能",
    form: tab === "local" ? "导入本地技能" : tab === "github" ? "克隆 GitHub 技能库" : "收藏线上技能",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-sm p-4">
      <div className="bg-white/95 backdrop-blur-xl border border-[var(--color-border)] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col relative transition-all duration-300">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between relative">
          <h2 className="text-lg font-medium text-[var(--foreground)] flex-1 text-left">
            {titleMap[step]}
          </h2>
          <button onClick={onClose} className={`p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors ${step === "form" ? 'absolute right-4' : ''}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="relative">
          
          {/* Step 1: Selection View */}
          {step === "select" && (
            <div className="p-4 space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-300">
              {/* GitHub 克隆 */}
              <button 
                onClick={() => handleSelectType("github")}
                className="w-full text-left group flex items-start p-3 bg-transparent hover:bg-black/[0.02] dark:hover:bg-white/[0.02] rounded-xl transition-all border border-transparent hover:border-black/5 dark:hover:border-white/10"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105 group-hover:shadow-sm group-hover:shadow-blue-500/20">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.24c3-.3 6-1.5 6-6.76a5.5 5.5 0 0 0-1.5-3.8 5.1 5.1 0 0 0-.1-3.8s-1.2-.4-3.9 1.4a13.4 13.4 0 0 0-7 0C6.3 2.4 5.1 2.8 5.1 2.8a5.1 5.1 0 0 0-.1 3.8 5.5 5.5 0 0 0-1.5 3.8c0 5.2 3 6.4 6 6.76a4.8 4.8 0 0 0-1 3.24v4" />
                  </svg>
                </div>
                <div className="ml-3.5 flex-1">
                  <h3 className="text-sm font-medium text-[var(--foreground)] group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">克隆 GitHub 技能库</h3>
                  <p className="text-xs text-[var(--color-muted)] mt-1 leading-relaxed">
                    输入 GitHub 仓库链接，后台将自动克隆并提取仓库内所有可用技能到本地。
                  </p>
                </div>
              </button>

              {/* 本地导入 */}
              <button 
                onClick={() => handleSelectType("local")}
                className="w-full text-left group flex items-start p-3 bg-transparent hover:bg-black/[0.02] dark:hover:bg-white/[0.02] rounded-xl transition-all border border-transparent hover:border-black/5 dark:hover:border-white/10"
              >
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105 group-hover:shadow-sm group-hover:shadow-purple-500/20">
                  <HardDrive className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="ml-3.5 flex-1">
                  <h3 className="text-sm font-medium text-[var(--foreground)] group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">导入本地技能</h3>
                  <p className="text-xs text-[var(--color-muted)] mt-1 leading-relaxed">
                    选择一个本地文件夹，支持单项技能或包含多个子技能的根目录，系统会自动扫描并提取。
                  </p>
                </div>
              </button>

              {/* 线上地址收藏 */}
              <button 
                onClick={() => handleSelectType("online")}
                className="w-full text-left group flex items-start p-3 bg-transparent hover:bg-black/[0.02] dark:hover:bg-white/[0.02] rounded-xl transition-all border border-transparent hover:border-black/5 dark:hover:border-white/10"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105 group-hover:shadow-sm group-hover:shadow-emerald-500/20">
                  <Globe className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="ml-3.5 flex-1">
                  <h3 className="text-sm font-medium text-[var(--foreground)] group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">收藏线上地址</h3>
                  <p className="text-xs text-[var(--color-muted)] mt-1 leading-relaxed">
                    保存任意公开链接（GitHub 文件/目录/仓库等），零磁盘占用，随时生成引用提示词。
                  </p>
                </div>
              </button>
            </div>
          )}

          {/* Step 2: Form View */}
          {step === "form" && (
            <form onSubmit={handleSubmit} className="p-6 flex flex-col space-y-4 animate-in fade-in slide-in-from-right-8 duration-300">
              
              {/* 顶部目标技能库提示 */}
              {defaultWorkspaceLabel && (
                <div className="flex items-center p-2.5 bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/20 rounded-lg -mt-2 mb-2">
                  <div className="w-6 h-6 rounded-md bg-[var(--color-primary)]/10 flex items-center justify-center shrink-0 mr-2.5">
                    <svg className="w-3.5 h-3.5 text-[var(--color-primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-[var(--color-primary)]/70 font-medium leading-none mb-1">将导入至技能库</p>
                    <p className="text-[13px] font-medium text-[var(--color-primary)] truncate leading-none">
                      {defaultWorkspaceLabel} <span className="text-[11px] opacity-70 font-normal ml-1">({defaultTargetDir})</span>
                    </p>
                  </div>
                </div>
              )}

              {tab === "local" ? (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[var(--foreground)]">选择要导入的技能</label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        required
                        readOnly
                        value={localPath}
                        placeholder="导入技能所在的文件夹"
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
                      <button type="button" onClick={() => setStrategy("copy")}
                        className={`flex flex-col items-center justify-center py-2 px-2 rounded-md border transition-all ${strategy === "copy" ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-transparent border-[var(--color-border)] text-[var(--color-muted)] hover:bg-black/5"}`}>
                        <Copy className="w-4 h-4 mb-1.5" />
                        <span className="text-[11px] font-semibold">复制导入</span>
                      </button>
                      <button type="button" onClick={() => setStrategy("move")}
                        className={`flex flex-col items-center justify-center py-2 px-2 rounded-md border transition-all ${strategy === "move" ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-transparent border-[var(--color-border)] text-[var(--color-muted)] hover:bg-black/5"}`}>
                        <FileOutput className="w-4 h-4 mb-1.5" />
                        <span className="text-[11px] font-semibold">剪切导入</span>
                      </button>
                      <button type="button" onClick={() => setStrategy("link")}
                        className={`flex flex-col items-center justify-center py-2 px-2 rounded-md border transition-all ${strategy === "link" ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-transparent border-[var(--color-border)] text-[var(--color-muted)] hover:bg-black/5"}`}>
                        <LinkIcon className="w-4 h-4 mb-1.5" />
                        <span className="text-[11px] font-semibold">原址引用</span>
                      </button>
                    </div>
                    <div className="text-[11px] mt-2 leading-relaxed bg-blue-50/50 text-blue-800 p-2.5 rounded-md border border-blue-100">
                      {strategy === "link" && <><span className="font-semibold text-blue-900">仅挂载读取：</span>保持你上面选择的文件夹在原地不动。</>}
                      {strategy === "copy" && <><span className="font-semibold text-blue-900">创建副本：</span>将上面选中的源文件夹安全复制到顶部的「目标技能库」中，保留双份。</>}
                      {strategy === "move" && <><span className="font-semibold text-blue-900">物理转移：</span>将上面选中的源文件夹直接剪切到顶部的「目标技能库」中，节约空间。</>}
                    </div>
                  </div>

                </>
              ) : tab === "online" ? (
                <>
                  {/* URL 输入 */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-[var(--foreground)]">技能地址</label>
                    <input
                      type="url"
                      required
                      value={onlineUrl}
                      onChange={(e) => handleOnlineUrlChange(e.target.value)}
                      placeholder="https://github.com/user/repo/blob/main/SKILL.md"
                      className="input-field w-full"
                    />
                    <p className="text-[11px] text-[var(--color-muted)]">支持 GitHub 文件/目录/仓库链接，或任意公开 URL</p>
                  </div>

                  {/* 技能名称 */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-[var(--foreground)]">技能名称</label>
                    <input
                      type="text"
                      required
                      value={onlineName}
                      onChange={(e) => { setOnlineName(e.target.value); setUrlAutoNamed(false); }}
                      placeholder="技能名称（可自动从 URL 解析）"
                      className="input-field w-full"
                    />
                  </div>

                  {/* 说明 */}
                  <div className="flex items-start space-x-2.5 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-amber-800">关于线上收藏</p>
                      <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
                        线上模式仅保存地址，不下载文件，零磁盘占用，无法同步至 AI Agent，但可用于生成引用提示词。<br/>
                        如需完整功能或管理整个仓库，建议使用「克隆 GitHub 技能库」。
                      </p>
                    </div>
                  </div>
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
                  {githubUrl && githubTargetDir && (
                    <div className="mt-1 p-2.5 bg-blue-50/80 rounded-lg border border-blue-100 flex items-start space-x-2.5 animate-in fade-in zoom-in-95 duration-200">
                      <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.24c3-.3 6-1.5 6-6.76a5.5 5.5 0 0 0-1.5-3.8 5.1 5.1 0 0 0-.1-3.8s-1.2-.4-3.9 1.4a13.4 13.4 0 0 0-7 0C6.3 2.4 5.1 2.8 5.1 2.8a5.1 5.1 0 0 0-.1 3.8 5.5 5.5 0 0 0-1.5 3.8c0 5.2 3 6.4 6 6.76a4.8 4.8 0 0 0-1 3.24v4" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-blue-900 mb-0.5">将克隆至：</p>
                        <Tooltip content={`${githubTargetDir.replace(/\\/g, '/')}/${githubUrl.split('/').filter(Boolean).pop()?.replace('.git', '') || 'repo'}`}>
                          <p className="text-[11px] font-mono text-blue-700/90 truncate cursor-default">
                            {githubTargetDir.replace(/\\/g, '/')}/{githubUrl.split('/').filter(Boolean).pop()?.replace('.git', '') || 'repo'}
                          </p>
                        </Tooltip>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="pt-1 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-2.5 py-1 rounded-md text-[13px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-all"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitDisabled}
                  className="flex items-center justify-center space-x-1.5 bg-[var(--color-primary)] text-white px-3 py-1.5 rounded-md text-[13px] font-medium hover:bg-[var(--color-primary)]/90 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      {tab === "online" && <Globe className="w-3.5 h-3.5" />}
                      <span>
                        {tab === "local" ? "开始导入" : tab === "github" ? "克隆仓库" : "确认收藏"}
                      </span>
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
