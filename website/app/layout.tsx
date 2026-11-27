import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SkillHub — 跨平台 AI Skills 与 Prompts 发现、管理与同步桌面工具",
  description:
    "基于 Tauri v2 与 Rust 打造的轻量原生桌面工具。一站式完成全球开源技能与提示词发现、预览翻译、单技能精准安装、类访达桌面整理及多 AI Agent 软链接同步。",
  icons: {
    icon: "./icon.png",
    apple: "./icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased selection:bg-[#0055FF]/15 selection:text-[#0055FF]">
        {children}
      </body>
    </html>
  );
}
