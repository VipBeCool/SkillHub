import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { X, Save, Upload, ShieldCheck, Database, Globe, Sliders, FolderGit2, Monitor, Power, Check, Info, Key, ExternalLink, Sparkles } from "lucide-react";
import { AgentSettingsDialog } from "../agent/AgentSettingsDialog";
import { showToast } from "./Toast";
import type { SourceDirectory } from "../../types";
import { getDefaultInstallDirId, setDefaultInstallDirId } from "../../utils/storeSettings";
import { getGeneralSettings, saveGeneralSettings, DEFAULT_GENERAL_SETTINGS, type GeneralSettings } from "../../utils/appSettings";
import { getGitHubToken, setGitHubToken } from "../../utils/githubToken";
import { openUrl } from "@tauri-apps/plugin-opener";

interface GlobalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "general" | "agent" | "backup" | "store";
}

export function GlobalSettingsModal({ isOpen, onClose, defaultTab = "general" }: GlobalSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"general" | "agent" | "backup" | "store">(defaultTab);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [directories, setDirectories] = useState<SourceDirectory[]>([]);
  const [defaultInstallDirId, setLocalDefaultInstallDirId] = useState<string>(() => getDefaultInstallDirId() || "");
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(DEFAULT_GENERAL_SETTINGS);
  const [githubTokenInput, setGithubTokenInput] = useState<string>(() => getGitHubToken());

  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
      invoke<SourceDirectory[]>("get_source_directories").then(dirs => {
        if (dirs) setDirectories(dirs);
      }).catch(console.error);
      setLocalDefaultInstallDirId(getDefaultInstallDirId() || "");
      getGeneralSettings().then(setGeneralSettings).catch(console.error);
      setGithubTokenInput(getGitHubToken());
    }
  }, [isOpen, defaultTab]);

  const handleUpdateGeneralSettings = async (updates: Partial<GeneralSettings>) => {
    const updated = { ...generalSettings, ...updates };
    setGeneralSettings(updated);
    try {
      await saveGeneralSettings(updated);
      showToast("偏好设置已更新并生效", "success");
    } catch (err) {
      showToast(`保存偏好设置失败: ${err}`, "error");
    }
  };

  if (!isOpen) return null;

  const handleExport = async () => {
    try {
      const defaultFilename = `SkillHub_Backup_${new Date().toISOString().split('T')[0]}.zip`;
      const savePath = await save({
        defaultPath: defaultFilename,
        filters: [{ name: "ZIP Archive", extensions: ["zip"] }]
      });

      if (!savePath) return;

      setIsExporting(true);
      await invoke("export_database", { targetPath: savePath });
      showToast(`导出成功: 数据已备份至 ${savePath}`, "success");
    } catch (e) {
      console.error("Export failed:", e);
      showToast(`导出失败: ${e}`, "error");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    try {
      const selectedPath = await open({
        multiple: false,
        filters: [{ name: "ZIP Archive", extensions: ["zip"] }]
      });

      if (!selectedPath || typeof selectedPath !== 'string') return;

      const confirmed = window.confirm(
        "警告：导入数据将覆盖当前所有的技能库、提示词和配置。\n\n导入前系统会自动创建一个备份以防万一。\n\n确定要继续导入吗？"
      );
      if (!confirmed) return;

      setIsImporting(true);
      await invoke("import_database", { zipPath: selectedPath });
      
      showToast("导入成功: 数据恢复成功，即将重新加载应用...", "success");
      
      setTimeout(() => {
        window.location.reload();
      }, 1500);

    } catch (e) {
      console.error("Import failed:", e);
      showToast(`导入失败: ${e}`, "error");
    } finally {
      setIsExporting(false);
    }
  };

  // 侧边栏Tab按钮样式
  const tabBtnCls = (tab: string) =>
    `w-full flex items-center px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
      activeTab === tab
        ? "bg-black/5 dark:bg-white/10 text-[var(--foreground)] shadow-sm"
        : "text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 dark:hover:bg-white/5"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 modal-backdrop transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative modal-glass rounded-xl w-full max-w-4xl flex overflow-hidden h-[75vh]">
        
        {/* Sidebar */}
        <div className="w-64 bg-black/[0.02] dark:bg-white/[0.02] border-r border-black/5 dark:border-white/5 flex flex-col">
          <div className="px-6 py-5 shrink-0">
            <h2 className="text-xl font-bold text-[var(--foreground)]">设置</h2>
          </div>
          
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
            <button
              onClick={() => setActiveTab("general")}
              className={tabBtnCls("general")}
            >
              <Sliders className={`w-4 h-4 mr-3 ${activeTab === "general" ? "text-[var(--color-primary)]" : "opacity-70"}`} />
              通用偏好
            </button>
            <button
              onClick={() => setActiveTab("agent")}
              className={tabBtnCls("agent")}
            >
              <ShieldCheck className={`w-4 h-4 mr-3 ${activeTab === "agent" ? "text-[var(--color-primary)]" : "opacity-70"}`} />
              Agent 同步配置
            </button>
            <button
              onClick={() => setActiveTab("store")}
              className={tabBtnCls("store")}
            >
              <Globe className={`w-4 h-4 mr-3 ${activeTab === "store" ? "text-[var(--color-primary)]" : "opacity-70"}`} />
              资源与安装
            </button>
            <button
              onClick={() => setActiveTab("backup")}
              className={tabBtnCls("backup")}
            >
              <Database className={`w-4 h-4 mr-3 ${activeTab === "backup" ? "text-[var(--color-primary)]" : "opacity-70"}`} />
              数据与备份
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col relative bg-white dark:bg-[#1A1A1A]">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-lg text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] transition-colors z-10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

        {/* Content Scroll Area */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "general" && (
            <div className="p-8 max-w-3xl mx-auto h-full space-y-6">
              <div>
                <h3 className="text-2xl font-bold text-[var(--foreground)]">通用偏好</h3>
                <p className="text-[var(--color-muted)] mt-1 text-sm">
                  定制 SkillHub 桌面客户端的运行形态、常驻后台及窗口交互方式。
                </p>
              </div>

              {/* 选项组 1：关闭主窗口时的行为 */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-[var(--foreground)] block">
                  关闭主窗口时
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* 选项 A: 常驻后台 */}
                  <div
                    onClick={() => handleUpdateGeneralSettings({ close_action: 'tray' })}
                    className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer select-none flex flex-col justify-between ${
                      generalSettings.close_action === 'tray'
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 dark:bg-[var(--color-primary)]/10 shadow-sm'
                        : 'border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 bg-black/[0.01] dark:bg-white/[0.01]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-lg ${generalSettings.close_action === 'tray' ? 'bg-[var(--color-primary)] text-white' : 'bg-black/5 dark:bg-white/10 text-[var(--color-muted)]'}`}>
                            <Monitor className="w-4 h-4" />
                          </div>
                          <span className="text-[14px] font-semibold text-[var(--foreground)]">保持后台常驻</span>
                        </div>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                          推荐
                        </span>
                      </div>
                      <p className="text-xs text-[var(--color-muted)] leading-relaxed">
                        关闭窗口后退至后台与菜单栏。点击托盘随时弹出随身快捷助手，点击应用图标秒级恢复主界面。
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-end">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                        generalSettings.close_action === 'tray'
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                          : 'border-black/20 dark:border-white/20'
                      }`}>
                        {generalSettings.close_action === 'tray' && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </div>
                  </div>

                  {/* 选项 B: 直接退出 */}
                  <div
                    onClick={() => handleUpdateGeneralSettings({ close_action: 'quit' })}
                    className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer select-none flex flex-col justify-between ${
                      generalSettings.close_action === 'quit'
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 dark:bg-[var(--color-primary)]/10 shadow-sm'
                        : 'border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 bg-black/[0.01] dark:bg-white/[0.01]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-lg ${generalSettings.close_action === 'quit' ? 'bg-[var(--color-primary)] text-white' : 'bg-black/5 dark:bg-white/10 text-[var(--color-muted)]'}`}>
                            <Power className="w-4 h-4" />
                          </div>
                          <span className="text-[14px] font-semibold text-[var(--foreground)]">直接退出应用</span>
                        </div>
                      </div>
                      <p className="text-xs text-[var(--color-muted)] leading-relaxed">
                        点击红绿灯关闭 (X) 时彻底退出程序，释放系统资源。随身快捷助手与后台任务将同步结束。
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-end">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                        generalSettings.close_action === 'quit'
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                          : 'border-black/20 dark:border-white/20'
                      }`}>
                        {generalSettings.close_action === 'quit' && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 选项组 2：常驻时的程序坞与最小化交互 (当 close_action === 'tray' 时提供) */}
              {generalSettings.close_action === 'tray' && (
                <div className="bg-white dark:bg-[#1A1A1A] border border-black/10 dark:border-white/10 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-[14px] font-semibold text-[var(--foreground)]">
                          常驻时保留程序坞 (Dock) 图标
                        </h4>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/5 dark:bg-white/10 text-[var(--color-muted)]">
                          macOS 原生交互
                        </span>
                      </div>
                      <p className="text-[13px] text-[var(--color-muted)] mt-1.5 leading-relaxed">
                        开启后，关闭窗口仅隐藏界面，Dock 图标持续保留，点击 Dock 可随时秒级唤起主窗口；同时<strong>保障窗口能正常缩入 Dock 栏</strong>（符合 macOS 标准习惯）。
                        关闭后，隐藏窗口时将同步移除 Dock 图标，仅保留顶部菜单栏快捷助手。
                      </p>
                    </div>

                    {/* Switch 开关 */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={generalSettings.keep_dock_icon}
                      onClick={() => handleUpdateGeneralSettings({ keep_dock_icon: !generalSettings.keep_dock_icon })}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        generalSettings.keep_dock_icon ? 'bg-[var(--color-primary)]' : 'bg-black/20 dark:bg-white/20'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          generalSettings.keep_dock_icon ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )}

              {/* 系统交互提示 */}
              <div className="bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5 rounded-xl p-4">
                <div className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5 mb-2">
                  <Info className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  <span>窗口与菜单栏快捷交互提示</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px] text-[var(--color-muted)]">
                  <div className="p-2.5 rounded-lg bg-white/60 dark:bg-[#1f1f1f] border border-black/5 dark:border-white/5">
                    <span className="font-medium text-[var(--foreground)] block mb-1">🍏 macOS</span>
                    点击黄色最小化按钮正常缩入 Dock 栏；点击顶部菜单栏图标弹出快捷助手，失焦自动收起。
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/60 dark:bg-[#1f1f1f] border border-black/5 dark:border-white/5">
                    <span className="font-medium text-[var(--foreground)] block mb-1">🪟 Windows</span>
                    点击最小化正常缩入任务栏；点击关闭按钮常驻系统托盘，左键单击托盘弹出快捷助手。
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/60 dark:bg-[#1f1f1f] border border-black/5 dark:border-white/5">
                    <span className="font-medium text-[var(--foreground)] block mb-1">🐧 Linux</span>
                    支持原生标准窗口模式与托盘唤起，兼容 GNOME、KDE 等各类 Linux 桌面环境。
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "store" && (
            <div className="p-8 max-w-3xl mx-auto h-full">
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-[var(--foreground)]">资源与安装偏好</h3>
                <p className="text-[var(--color-muted)] mt-1 text-sm">
                  管理从资源社区安装、或从全局搜索克隆 GitHub 技能时的默认目标技能库。
                </p>
              </div>

              <div className="bg-white dark:bg-[#1A1A1A] border border-black/5 dark:border-white/5 rounded-xl overflow-hidden p-5 space-y-4">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1">
                    <h4 className="text-[14px] font-semibold text-[var(--foreground)]">默认安装 / 克隆目标技能库</h4>
                    <p className="text-[13px] text-[var(--color-muted)] mt-1 leading-relaxed">
                      从资源社区一键安装或通过全局搜索直接克隆 GitHub 技能库时优先存放的目标目录。若设置为「每次安装时询问」，系统将在每次安装或克隆时弹出选择窗口供您指定。
                    </p>
                  </div>
                  <div className="shrink-0 w-60">
                    <select
                      value={defaultInstallDirId}
                      onChange={(e) => {
                        const newVal = e.target.value;
                        setLocalDefaultInstallDirId(newVal);
                        setDefaultInstallDirId(newVal);
                        showToast(newVal ? "已更新默认安装技能库" : "已设为每次安装时询问", "success");
                      }}
                      className="w-full px-3 py-2 text-[13px] rounded-lg border border-black/10 bg-black/[0.02] text-[var(--foreground)] focus:outline-none focus:border-[var(--color-primary)] cursor-pointer"
                    >
                      <option value="">每次安装时询问</option>
                      {directories.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.label} {d.is_default ? '(主库)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {defaultInstallDirId && (
                  <div className="mt-3 p-3 bg-black/[0.02] rounded-lg border border-black/5 text-[12px] text-[var(--color-muted)] flex items-center gap-2">
                    <FolderGit2 className="w-4 h-4 shrink-0 text-[var(--color-primary)]" />
                    <span className="truncate font-mono">
                      目标路径: {directories.find(d => d.id === defaultInstallDirId)?.path || '未知路径'}
                    </span>
                  </div>
                )}
              </div>

              {/* GitHub 访问令牌配置卡片 */}
              <div className="bg-white dark:bg-[#1A1A1A] border border-black/5 dark:border-white/5 rounded-xl overflow-hidden p-5 space-y-4 mt-5">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-[14px] font-semibold text-[var(--foreground)] flex items-center">
                        <Key className="w-4 h-4 text-[var(--color-primary)] mr-1.5 shrink-0" />
                        GitHub 访问令牌 (Personal Access Token)
                      </h4>
                      {getGitHubToken() ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-600 border border-emerald-200">
                          已配置 (5,000次/小时)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-600 border border-amber-200">
                          未配置 (受限 10次/分)
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] text-[var(--color-muted)] leading-relaxed">
                      用于在全局搜索中实时检索 GitHub 开源技能仓库。配置后独享个人独立配额，避免未登录请求触发 GitHub 官方的频率限制 (Rate Limit 403)。
                    </p>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      placeholder="ghp_xxxx 或 github_pat_xxxx"
                      value={githubTokenInput}
                      onChange={e => setGithubTokenInput(e.target.value)}
                      className="flex-1 px-3 py-2 text-[13px] font-mono rounded-lg border border-black/10 bg-black/[0.02] text-[var(--foreground)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/20"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = githubTokenInput.trim();
                        setGitHubToken(trimmed);
                        showToast(trimmed ? "GitHub Token 保存成功，额度提升至 5,000次/小时" : "已清除 GitHub Token", "success");
                      }}
                      className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg text-[13px] font-medium transition-colors cursor-pointer shrink-0"
                    >
                      保存
                    </button>
                    {githubTokenInput && (
                      <button
                        type="button"
                        onClick={() => {
                          setGithubTokenInput("");
                          setGitHubToken("");
                          showToast("已清除 GitHub Token", "info");
                        }}
                        className="px-3 py-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer shrink-0"
                      >
                        清除
                      </button>
                    )}
                  </div>

                  <div className="p-3.5 bg-blue-50/70 dark:bg-blue-950/20 rounded-xl border border-blue-200/60 dark:border-blue-800/40 text-xs space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-semibold text-blue-900 dark:text-blue-200 text-[12px]">
                        <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
                        <span>快速配置指南</span>
                      </div>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-200/60 flex items-center gap-0.5">
                        <ShieldCheck className="w-3 h-3" /> 本地存储
                      </span>
                    </div>

                    <div className="space-y-2 text-[11px] text-blue-900/90 dark:text-blue-200/90 pl-0.5 leading-relaxed">
                      <div className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-[var(--color-primary)] text-white text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>
                        <span>点击下方链接打开 GitHub 令牌创建页（已自动填好名称 Note）。</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-[var(--color-primary)] text-white text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>
                        <div>
                          <strong className="text-blue-950 dark:text-white">权限选项（Select scopes）：全部留空，一个都不要勾选！</strong>
                          <div className="text-[10px] text-blue-700/80 dark:text-blue-300/70 mt-0.5">
                            检索开源公开库仅需只读身份，全部不勾选最安全，绝不会访问你的私有仓库或个人信息。
                          </div>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-[var(--color-primary)] text-white text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>
                        <span>
                          拉到页面最底部点击绿色按钮 <code className="bg-emerald-100/80 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 px-1 py-0.2 rounded font-mono font-medium">Generate token</code>，复制生成的 <code className="font-mono text-gray-700 dark:text-gray-200">ghp_xxxx</code> 贴到输入框并点击保存即可。
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-blue-200/50 dark:border-blue-800/40 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => openUrl("https://github.com/settings/tokens/new?description=SkillHub-Search&scopes=").catch(console.error)}
                        className="text-[var(--color-primary)] hover:underline flex items-center gap-1 font-semibold text-xs cursor-pointer"
                      >
                        <span>生成Github Personal Token</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeTab === "agent" && (
            <div className="p-8 max-w-3xl mx-auto h-full">
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-[var(--foreground)]">Agent 同步配置</h3>
                <p className="text-[var(--color-muted)] mt-1 text-sm">
                  管理您的 AI 智能体，并配置它们读取技能库的挂载路径。
                </p>
              </div>
              <div className="bg-black/[0.02] dark:bg-white/[0.02] rounded-xl border border-black/5 dark:border-white/5 p-1 h-full">
                <AgentSettingsDialog 
                  isOpen={true} 
                  onClose={() => {}} 
                  isInline={true} 
                />
              </div>
            </div>
          )}

          {activeTab === "backup" && (
            <div className="p-8 max-w-3xl mx-auto h-full">
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-[var(--foreground)]">数据导出与恢复</h3>
                <p className="text-[var(--color-muted)] mt-1 text-sm">
                  备份您的技能库、提示词、Agent 配置及使用记录。
                </p>
              </div>

              <div className="bg-white dark:bg-[#1A1A1A] border border-black/5 dark:border-white/5 rounded-xl overflow-hidden divide-y divide-black/5 dark:divide-white/5">
                <div className="flex items-center justify-between p-5">
                  <div>
                    <h4 className="text-[14px] font-medium text-[var(--foreground)]">导出所有数据</h4>
                    <p className="text-[13px] text-[var(--color-muted)] mt-1">将当前的所有数据打包成 ZIP 文件保存到本地。</p>
                  </div>
                  <button 
                    onClick={handleExport}
                    disabled={isExporting}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-md text-[13px] font-medium hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-50 shadow-sm shrink-0"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isExporting ? "导出中..." : "开始导出"}</span>
                  </button>
                </div>
                
                <div className="flex items-center justify-between p-5">
                  <div>
                    <h4 className="text-[14px] font-medium text-[var(--foreground)]">从备份导入</h4>
                    <p className="text-[13px] text-[var(--color-muted)] mt-1">选择历史备份的 ZIP 文件来恢复数据。</p>
                  </div>
                  <button 
                    onClick={handleImport}
                    disabled={isImporting}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-black/10 rounded-md text-[13px] font-medium text-[var(--foreground)] hover:bg-black/5 transition-colors disabled:opacity-50 shadow-sm shrink-0"
                  >
                    <Upload className="w-4 h-4 opacity-70" />
                    <span>{isImporting ? "恢复中..." : "选择文件导入"}</span>
                  </button>
                </div>
              </div>

              <div className="mt-6 flex items-start space-x-2 text-[12px] text-[var(--color-muted)] px-1">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  为了防止意外覆盖，在您执行导入操作前，系统会自动对当前状态进行一次静默备份。您可以随时在应用数据目录下找到它。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
  );
}
