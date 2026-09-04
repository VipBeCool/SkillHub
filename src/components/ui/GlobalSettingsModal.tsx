import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { X, Save, Upload, ShieldCheck, Database } from "lucide-react";
import { AgentSettingsDialog } from "../agent/AgentSettingsDialog";
import { showToast } from "./Toast";

interface GlobalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "agent" | "backup";
}

export function GlobalSettingsModal({ isOpen, onClose, defaultTab = "agent" }: GlobalSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"agent" | "backup">(defaultTab);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
    }
  }, [isOpen, defaultTab]);

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
      setIsImporting(false);
    }
  };

  // 侧边栏Tab按钮样式
  const tabBtnCls = (tab: string) =>
    `w-full flex items-center px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
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
              onClick={() => setActiveTab("agent")}
              className={tabBtnCls("agent")}
            >
              <ShieldCheck className={`w-4 h-4 mr-3 ${activeTab === "agent" ? "text-[var(--color-primary)]" : "opacity-70"}`} />
              Agent 同步配置
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
            className="absolute top-4 right-4 p-2 rounded-lg text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] transition-colors z-10"
          >
            <X className="w-5 h-5" />
          </button>

        {/* Content Scroll Area */}
        <div className="flex-1 overflow-y-auto">
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
