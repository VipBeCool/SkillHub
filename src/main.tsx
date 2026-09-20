import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { TooltipProvider } from "./components/ui/Tooltip";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { initGlobalScrollbarBehavior } from "./utils/scrollbar";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { QuickAccessPanel } from "./components/tray/QuickAccessPanel";
import "./index.css";

// 启动全局滚动条智能控制器
initGlobalScrollbarBehavior();

// 禁用默认浏览器右键菜单以更贴近原生桌面应用体验（按住 Alt/Option 可临时调出系统菜单以辅助排查）
document.addEventListener("contextmenu", (e) => {
  if (!e.altKey) {
    e.preventDefault();
  }
});

const currentWindow = getCurrentWindow();
const isTrayPanel = currentWindow.label === "tray-panel";

if (isTrayPanel) {
  document.documentElement.classList.add("tray-panel-mode");
  document.body.classList.add("tray-panel-mode");
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
  const style = document.createElement("style");
  style.innerHTML = `
    html, body, #root {
      width: 100% !important;
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      background: transparent !important;
      background-color: transparent !important;
      box-shadow: none !important;
      overflow: hidden !important;
    }
  `;
  document.head.appendChild(style);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      {isTrayPanel ? (
        <QuickAccessPanel />
      ) : (
        <TooltipProvider>
          <App />
        </TooltipProvider>
      )}
    </ErrorBoundary>
  </React.StrictMode>,
);

