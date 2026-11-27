import { useState, useEffect, useMemo, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import {
  X,
  Save,
  Upload,
  Database,
  Globe,
  Sliders,
  FolderGit2,
  Monitor,
  Power,
  Check,
  Key,
  ExternalLink,
  Rocket,
  EyeOff,
  AppWindow,
  RefreshCw,
  Bot,
} from "lucide-react";
import { AgentSettingsDialog } from "../agent/AgentSettingsDialog";
import { FilterSelectPopover, type FilterSelectOption } from "../resource/FilterSelectPopover";
import { showToast } from "./Toast";
import type { SourceDirectory } from "../../types";
import { getDefaultInstallDirId, setDefaultInstallDirId } from "../../utils/storeSettings";
import {
  getGeneralSettings,
  saveGeneralSettings,
  DEFAULT_GENERAL_SETTINGS,
  type GeneralSettings,
} from "../../utils/appSettings";
import { getGitHubToken, setGitHubToken } from "../../utils/githubToken";
import { openUrl } from "@tauri-apps/plugin-opener";

const isMac = typeof navigator !== "undefined" && /macintosh|mac os x/i.test(navigator.userAgent);

interface GlobalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "general" | "agent" | "backup" | "store";
}

interface SettingSwitchProps {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  ariaLabel: string;
}

/**
 * 克制比例的系统风格开关
 */
function SettingSwitch({ checked, disabled = false, onChange, ariaLabel }: SettingSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={ariaLabel}
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-[22px] w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? "bg-[var(--color-primary)]" : "bg-black/15 dark:bg-white/20"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-[18px]" : "translate-x-0"
        }`}
      />
    </button>
  );
}

interface SettingRowProps {
  icon: ReactNode;
  title: string;
  description: string;
  right: ReactNode;
}

/**
 * 统一的设置项单行布局：中性微灰图标 + 单行精简文案 + 右侧控件
 */
function SettingRow({ icon, title, description, right }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] text-[var(--foreground)]/70 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-[13px] font-medium text-[var(--foreground)] leading-snug">{title}</h4>
          <p className="text-[12px] text-[var(--color-muted)] mt-0.5 leading-snug">{description}</p>
        </div>
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  );
}

export function GlobalSettingsModal({
  isOpen,
  onClose,
  defaultTab = "general",
}: GlobalSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"general" | "agent" | "backup" | "store">(defaultTab);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);
  const [directories, setDirectories] = useState<SourceDirectory[]>([]);
  const [defaultInstallDirId, setLocalDefaultInstallDirId] = useState<string>(
    () => getDefaultInstallDirId() || ""
  );
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(DEFAULT_GENERAL_SETTINGS);
  const [githubTokenInput, setGithubTokenInput] = useState<string>(() => getGitHubToken());
  const [savedGithubToken, setSavedGithubToken] = useState<string>(() => getGitHubToken());

  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
      invoke<SourceDirectory[]>("get_source_directories")
        .then(dirs => {
          if (dirs) setDirectories(dirs);
        })
        .catch(console.error);
      setLocalDefaultInstallDirId(getDefaultInstallDirId() || "");
      getGeneralSettings().then(setGeneralSettings).catch(console.error);
      const token = getGitHubToken();
      setGithubTokenInput(token);
      setSavedGithubToken(token);
    }
  }, [isOpen, defaultTab]);

  // 构造默认安装目标技能库下拉选项
  const installDirOptions = useMemo<FilterSelectOption[]>(
    () => [
      { value: "", label: "每次安装时询问" },
      ...directories.map(d => ({
        value: d.id,
        label: d.is_default ? `${d.label} (主库)` : d.label,
      })),
    ],
    [directories]
  );

  const handleUpdateGeneralSettings = async (updates: Partial<GeneralSettings>) => {
    if (isSavingGeneral) return;
    const prevSettings = generalSettings;
    const updated = { ...generalSettings, ...updates };
    setGeneralSettings(updated);
    setIsSavingGeneral(true);
    try {
      await saveGeneralSettings(updated);
      showToast("设置已保存", "success");
    } catch (err) {
      // 后端写入系统登录项或配置失败时回滚界面开关状态
      setGeneralSettings(prevSettings);
      showToast(`保存失败: ${err}`, "error");
    } finally {
      setIsSavingGeneral(false);
    }
  };

  if (!isOpen) return null;

  const handleExport = async () => {
    try {
      const defaultFilename = `SkillHub_Backup_${new Date().toISOString().split("T")[0]}.zip`;
      const savePath = await save({
        defaultPath: defaultFilename,
        filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
      });

      if (!savePath) return;

      setIsExporting(true);
      await invoke("export_database", { targetPath: savePath });
      showToast(`已导出备份至 ${savePath}`, "success");
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
        filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
      });

      if (!selectedPath || typeof selectedPath !== "string") return;

      const confirmed = window.confirm(
        "导入备份将覆盖当前的技能库、提示词与配置。导入前系统会自动备份当前数据，确定继续吗？"
      );
      if (!confirmed) return;

      setIsImporting(true);
      await invoke("import_database", { zipPath: selectedPath });

      showToast("数据恢复成功，即将重新加载应用...", "success");

      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (e) {
      console.error("Import failed:", e);
      showToast(`导入失败: ${e}`, "error");
    } finally {
      setIsImporting(false);
    }
  };

  // 侧边栏导航项样式
  const tabBtnCls = (tab: string) =>
    `w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
      activeTab === tab
        ? "bg-white dark:bg-white/10 text-[var(--foreground)] shadow-2xs ring-1 ring-black/[0.05] dark:ring-white/[0.08]"
        : "text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 遮罩背景 */}
      <div className="absolute inset-0 modal-backdrop transition-opacity" onClick={onClose} />

      {/* 弹窗主体 */}
      <div className="relative modal-glass rounded-2xl w-full max-w-[820px] flex overflow-hidden h-[72vh] min-h-[520px] max-h-[680px]">
        {/* 左侧导航栏 */}
        <div className="w-52 shrink-0 bg-[#F7F7F9] dark:bg-white/[0.025] border-r border-black/[0.06] dark:border-white/[0.06] flex flex-col">
          <div className="px-5 pt-5 pb-3 shrink-0">
            <h2 className="text-[15px] font-semibold text-[var(--foreground)] tracking-tight">设置</h2>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1">
            <button onClick={() => setActiveTab("general")} className={tabBtnCls("general")}>
              <Sliders
                className={`w-4 h-4 shrink-0 ${
                  activeTab === "general" ? "text-[var(--color-primary)]" : "opacity-65"
                }`}
              />
              <span>通用</span>
            </button>
            <button onClick={() => setActiveTab("agent")} className={tabBtnCls("agent")}>
              <Bot
                className={`w-4 h-4 shrink-0 ${
                  activeTab === "agent" ? "text-[var(--color-primary)]" : "opacity-65"
                }`}
              />
              <span>Agent 同步</span>
            </button>
            <button onClick={() => setActiveTab("store")} className={tabBtnCls("store")}>
              <Globe
                className={`w-4 h-4 shrink-0 ${
                  activeTab === "store" ? "text-[var(--color-primary)]" : "opacity-65"
                }`}
              />
              <span>资源与安装</span>
            </button>
            <button onClick={() => setActiveTab("backup")} className={tabBtnCls("backup")}>
              <Database
                className={`w-4 h-4 shrink-0 ${
                  activeTab === "backup" ? "text-[var(--color-primary)]" : "opacity-65"
                }`}
              />
              <span>数据与备份</span>
            </button>
          </div>
        </div>

        {/* 右侧内容区 */}
        <div className="flex-1 min-w-0 flex flex-col relative bg-white dark:bg-[#1A1A1A]">
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭设置"
            className="absolute top-4 right-4 p-1.5 rounded-lg text-[var(--color-muted)] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--foreground)] transition-colors z-10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex-1 overflow-y-auto hover-scroll">
            {/* Tab 1：通用 */}
            {activeTab === "general" && (
              <div className="px-8 py-6 max-w-2xl mx-auto space-y-6 pb-8">
                <div>
                  <h3 className="text-[17px] font-semibold text-[var(--foreground)] tracking-tight">
                    通用
                  </h3>
                  <p className="text-[12px] text-[var(--color-muted)] mt-1">
                    应用启动、窗口关闭与后台同步偏好
                  </p>
                </div>

                {/* 分组 1：启动与登录 */}
                <section className="space-y-2">
                  <h4 className="text-[11.5px] font-medium text-[var(--color-muted)] px-0.5">
                    启动与登录
                  </h4>
                  <div className="rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-white/[0.02] divide-y divide-black/[0.06] dark:divide-white/[0.06] overflow-hidden">
                    <SettingRow
                      icon={<Rocket className="w-4 h-4" />}
                      title="开机自动启动"
                      description="登录系统时自动启动 SkillHub"
                      right={
                        <SettingSwitch
                          ariaLabel="开机自动启动"
                          checked={generalSettings.autostart}
                          disabled={isSavingGeneral}
                          onChange={() =>
                            handleUpdateGeneralSettings({ autostart: !generalSettings.autostart })
                          }
                        />
                      }
                    />

                    {generalSettings.autostart && (
                      <div className="animate-in fade-in slide-in-from-top-1 duration-150">
                        <SettingRow
                          icon={<EyeOff className="w-4 h-4" />}
                          title="启动时静默隐藏"
                          description={
                            isMac
                              ? "自启后隐藏主窗口至菜单栏，不打断当前工作"
                              : "自启后隐藏主窗口至系统托盘，不打断当前工作"
                          }
                          right={
                            <SettingSwitch
                              ariaLabel="启动时静默隐藏"
                              checked={generalSettings.autostart_silent}
                              disabled={isSavingGeneral}
                              onChange={() =>
                                handleUpdateGeneralSettings({
                                  autostart_silent: !generalSettings.autostart_silent,
                                })
                              }
                            />
                          }
                        />
                      </div>
                    )}
                  </div>
                </section>

                {/* 分组 2：窗口与托盘 */}
                <section className="space-y-2.5">
                  <h4 className="text-[11.5px] font-medium text-[var(--color-muted)] px-0.5">
                    关闭主窗口时
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* 选项 A：保持后台运行 */}
                    <button
                      type="button"
                      onClick={() => handleUpdateGeneralSettings({ close_action: "tray" })}
                      className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer select-none flex flex-col gap-1.5 ${
                        generalSettings.close_action === "tray"
                          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/[0.03] dark:bg-[var(--color-primary)]/10 ring-1 ring-[var(--color-primary)]/15"
                          : "border-black/[0.08] dark:border-white/[0.1] hover:border-black/15 dark:hover:border-white/20 bg-white dark:bg-white/[0.02]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Monitor
                            className={`w-4 h-4 shrink-0 ${
                              generalSettings.close_action === "tray"
                                ? "text-[var(--color-primary)]"
                                : "text-[var(--color-muted)]"
                            }`}
                          />
                          <span className="text-[13px] font-medium text-[var(--foreground)]">
                            保持后台运行
                          </span>
                        </div>
                        <span
                          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                            generalSettings.close_action === "tray"
                              ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                              : "border-black/20 dark:border-white/25"
                          }`}
                        >
                          {generalSettings.close_action === "tray" && (
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          )}
                        </span>
                      </div>
                      <p className="text-[12px] text-[var(--color-muted)] leading-snug pl-6">
                        {isMac
                          ? "隐藏主窗口，点击菜单栏图标可随时唤出"
                          : "隐藏主窗口，点击托盘图标可随时唤出"}
                      </p>
                    </button>

                    {/* 选项 B：直接退出 */}
                    <button
                      type="button"
                      onClick={() => handleUpdateGeneralSettings({ close_action: "quit" })}
                      className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer select-none flex flex-col gap-1.5 ${
                        generalSettings.close_action === "quit"
                          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/[0.03] dark:bg-[var(--color-primary)]/10 ring-1 ring-[var(--color-primary)]/15"
                          : "border-black/[0.08] dark:border-white/[0.1] hover:border-black/15 dark:hover:border-white/20 bg-white dark:bg-white/[0.02]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Power
                            className={`w-4 h-4 shrink-0 ${
                              generalSettings.close_action === "quit"
                                ? "text-[var(--color-primary)]"
                                : "text-[var(--color-muted)]"
                            }`}
                          />
                          <span className="text-[13px] font-medium text-[var(--foreground)]">
                            直接退出
                          </span>
                        </div>
                        <span
                          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                            generalSettings.close_action === "quit"
                              ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                              : "border-black/20 dark:border-white/25"
                          }`}
                        >
                          {generalSettings.close_action === "quit" && (
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          )}
                        </span>
                      </div>
                      <p className="text-[12px] text-[var(--color-muted)] leading-snug pl-6">
                        关闭窗口时结束进程并退出快捷助手
                      </p>
                    </button>
                  </div>

                  {generalSettings.close_action === "tray" && (
                    <div className="rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-white/[0.02] overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                      <SettingRow
                        icon={<AppWindow className="w-4 h-4" />}
                        title={isMac ? "在程序坞保留图标" : "在任务栏保留图标"}
                        description={
                          isMac
                            ? "关闭窗口后继续在 Dock 显示图标，关闭则仅留菜单栏图标"
                            : "关闭窗口后继续在任务栏显示图标，关闭则仅留系统托盘图标"
                        }
                        right={
                          <SettingSwitch
                            ariaLabel={isMac ? "在程序坞保留图标" : "在任务栏保留图标"}
                            checked={generalSettings.keep_dock_icon}
                            disabled={isSavingGeneral}
                            onChange={() =>
                              handleUpdateGeneralSettings({
                                keep_dock_icon: !generalSettings.keep_dock_icon,
                              })
                            }
                          />
                        }
                      />
                    </div>
                  )}
                </section>

                {/* 分组 3：后台同步 */}
                <section className="space-y-2">
                  <h4 className="text-[11.5px] font-medium text-[var(--color-muted)] px-0.5">
                    后台同步
                  </h4>
                  <div className="rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-white/[0.02] overflow-hidden">
                    <SettingRow
                      icon={<RefreshCw className="w-4 h-4" />}
                      title="后台自动同步仓库"
                      description="开启后启动及每小时自动检查仓库更新；关闭则仅手动触发联网"
                      right={
                        <SettingSwitch
                          ariaLabel="后台自动同步仓库"
                          checked={generalSettings.auto_sync_repos}
                          disabled={isSavingGeneral}
                          onChange={() =>
                            handleUpdateGeneralSettings({
                              auto_sync_repos: !generalSettings.auto_sync_repos,
                            })
                          }
                        />
                      }
                    />
                  </div>
                </section>
              </div>
            )}

            {/* Tab 2：Agent 同步 */}
            {activeTab === "agent" && (
              <div className="px-8 py-6 max-w-2xl mx-auto pb-8">
                <AgentSettingsDialog isOpen={true} onClose={() => {}} isInline={true} />
              </div>
            )}

            {/* Tab 3：资源与安装 */}
            {activeTab === "store" && (
              <div className="px-8 py-6 max-w-2xl mx-auto space-y-6 pb-8">
                <div>
                  <h3 className="text-[17px] font-semibold text-[var(--foreground)] tracking-tight">
                    资源与安装
                  </h3>
                  <p className="text-[12px] text-[var(--color-muted)] mt-1">
                    默认安装目录与 GitHub API 访问令牌
                  </p>
                </div>

                {/* 分组 1：安装目录 */}
                <section className="space-y-2">
                  <h4 className="text-[11.5px] font-medium text-[var(--color-muted)] px-0.5">
                    安装目录
                  </h4>
                  <div className="rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-white/[0.02] divide-y divide-black/[0.06] dark:divide-white/[0.06]">
                    <SettingRow
                      icon={<FolderGit2 className="w-4 h-4" />}
                      title="默认目标技能库"
                      description="从资源中心安装或克隆技能时的默认保存目录"
                      right={
                        <FilterSelectPopover
                          value={defaultInstallDirId}
                          defaultValue=""
                          options={installDirOptions}
                          highlightActive={false}
                          minMenuWidth={208}
                          triggerClassName="w-48 py-1.5"
                          ariaLabel="选择默认目标技能库"
                          onChange={newVal => {
                            setLocalDefaultInstallDirId(newVal);
                            setDefaultInstallDirId(newVal);
                            showToast(
                              newVal ? "已更新默认安装技能库" : "已设为每次安装时询问",
                              "success"
                            );
                          }}
                        />
                      }
                    />

                    {defaultInstallDirId && (
                      <div className="px-4 py-2.5 bg-black/[0.015] dark:bg-white/[0.02] flex items-center justify-between gap-3 text-[11.5px]">
                        <span className="text-[var(--color-muted)] shrink-0">存储路径</span>
                        <span className="font-mono text-[var(--foreground)]/80 truncate select-all">
                          {directories.find(d => d.id === defaultInstallDirId)?.path || "未知路径"}
                        </span>
                      </div>
                    )}
                  </div>
                </section>

                {/* 分组 2：GitHub 访问令牌 */}
                <section className="space-y-2">
                  <div className="flex items-center justify-between px-0.5">
                    <h4 className="text-[11.5px] font-medium text-[var(--color-muted)]">
                      GitHub API
                    </h4>
                    <span className="text-[11px] text-[var(--color-muted)] tabular-nums">
                      {savedGithubToken ? "已配置 · 5,000 次/小时" : "未配置 · 匿名限 10 次/分"}
                    </span>
                  </div>

                  <div className="rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-white/[0.02] p-4 space-y-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] text-[var(--foreground)]/70 flex items-center justify-center shrink-0">
                        <Key className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-[13px] font-medium text-[var(--foreground)] leading-snug">
                          Personal Access Token
                        </h4>
                        <p className="text-[12px] text-[var(--color-muted)] mt-0.5 leading-snug">
                          用于提升 GitHub 仓库搜索与技能预览的速率限制，仅保存在本地
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="password"
                          placeholder="ghp_xxxx 或 github_pat_xxxx"
                          value={githubTokenInput}
                          onChange={e => setGithubTokenInput(e.target.value)}
                          className="w-full pl-3 pr-8 py-1.5 text-[12.5px] font-mono rounded-lg border border-black/[0.1] dark:border-white/[0.12] bg-black/[0.015] dark:bg-white/[0.04] text-[var(--foreground)] focus:bg-white dark:focus:bg-white/[0.06] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                        />
                        {githubTokenInput && (
                          <button
                            type="button"
                            onClick={() => {
                              setGithubTokenInput("");
                              setSavedGithubToken("");
                              setGitHubToken("");
                              showToast("已清除 GitHub Token", "info");
                            }}
                            aria-label="清除 Token"
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const trimmed = githubTokenInput.trim();
                          setGitHubToken(trimmed);
                          setSavedGithubToken(trimmed);
                          showToast(
                            trimmed ? "Token 已保存（5,000 次/小时）" : "已清除 GitHub Token",
                            "success"
                          );
                        }}
                        className="px-3.5 py-1.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg text-[12.5px] font-medium transition-colors cursor-pointer shrink-0"
                      >
                        保存
                      </button>
                    </div>

                    <div className="pt-2.5 border-t border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between gap-3 text-[11.5px] text-[var(--color-muted)]">
                      <span>生成时无需勾选任何权限（Scopes 留空），复制密钥粘贴保存即可</span>
                      <button
                        type="button"
                        onClick={() =>
                          openUrl(
                            "https://github.com/settings/tokens/new?description=SkillHub-Search&scopes="
                          ).catch(console.error)
                        }
                        className="inline-flex items-center gap-1 text-[var(--color-primary)] hover:underline font-medium shrink-0 cursor-pointer"
                      >
                        <span>前往生成</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {/* Tab 4：数据与备份 */}
            {activeTab === "backup" && (
              <div className="px-8 py-6 max-w-2xl mx-auto space-y-6 pb-8">
                <div>
                  <h3 className="text-[17px] font-semibold text-[var(--foreground)] tracking-tight">
                    数据与备份
                  </h3>
                  <p className="text-[12px] text-[var(--color-muted)] mt-1">
                    导出或恢复本地技能库、提示词与偏好配置
                  </p>
                </div>

                <section className="space-y-2">
                  <h4 className="text-[11.5px] font-medium text-[var(--color-muted)] px-0.5">
                    备份管理
                  </h4>
                  <div className="rounded-xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-white/[0.02] divide-y divide-black/[0.06] dark:divide-white/[0.06] overflow-hidden">
                    <SettingRow
                      icon={<Save className="w-4 h-4" />}
                      title="导出备份"
                      description="将当前技能库、提示词与配置打包为 ZIP 文件保存到本地"
                      right={
                        <button
                          type="button"
                          onClick={handleExport}
                          disabled={isExporting}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg text-[12.5px] font-medium transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          <span>{isExporting ? "导出中..." : "导出"}</span>
                        </button>
                      }
                    />

                    <SettingRow
                      icon={<Upload className="w-4 h-4" />}
                      title="恢复备份"
                      description="从历史 ZIP 备份恢复，导入前系统会自动备份当前数据"
                      right={
                        <button
                          type="button"
                          onClick={handleImport}
                          disabled={isImporting}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-white/[0.05] border border-black/[0.1] dark:border-white/[0.12] rounded-lg text-[12.5px] font-medium text-[var(--foreground)] hover:bg-black/[0.03] dark:hover:bg-white/[0.08] transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          <span>{isImporting ? "恢复中..." : "选择文件"}</span>
                        </button>
                      }
                    />
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
