import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { TooltipProvider } from "./components/ui/Tooltip";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import "./index.css";

// 禁用默认浏览器右键菜单以更贴近原生桌面应用体验（按住 Alt/Option 可临时调出系统菜单以辅助排查）
document.addEventListener("contextmenu", (e) => {
  if (!e.altKey) {
    e.preventDefault();
  }
});

// 全局未捕获异常兜底输出
window.addEventListener("error", (event) => {
  console.error("Global unhandled error:", event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Global unhandled promise rejection:", event.reason);
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

