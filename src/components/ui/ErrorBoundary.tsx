import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an unhandled error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetCache = () => {
    try {
      localStorage.removeItem("skillhub_tabs");
      localStorage.removeItem("skillhub_active_tab");
      localStorage.removeItem("skillhub_selected_workspace");
    } catch {
      // 忽略
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#F5F5F7] dark:bg-[#1C1C1E] p-6 text-[#1D1D1F] dark:text-[#F5F5F7] select-none font-sans">
          <div className="w-full max-w-[480px] bg-white dark:bg-[#2C2C2E] border border-black/10 dark:border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h2 className="text-[17px] font-semibold mb-2">界面渲染遇到问题</h2>
            <p className="text-[13px] text-black/60 dark:text-white/60 mb-5 leading-relaxed">
              SkillHub 遇到未预期的前端异常。你可以尝试重新加载页面，或重置缓存恢复初始状态。
            </p>

            {this.state.error && (
              <div className="w-full bg-black/[0.04] dark:bg-white/[0.04] border border-black/5 dark:border-white/5 rounded-lg p-3 text-left mb-5 max-h-[140px] overflow-y-auto font-mono text-[11px] text-red-500/90 break-all select-text">
                {this.state.error.toString()}
              </div>
            )}

            <div className="flex items-center gap-3 w-full">
              <button
                onClick={this.handleReload}
                className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-[#0055FF] hover:bg-[#0044CC] text-white font-medium text-[13px] transition-colors shadow-sm cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                重新加载
              </button>
              <button
                onClick={this.handleResetCache}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 text-black/70 dark:text-white/70 font-medium text-[13px] transition-colors cursor-pointer"
                title="清理本地标签和工作区缓存并重新加载"
              >
                <Trash2 className="w-4 h-4" />
                清理缓存并重试
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
