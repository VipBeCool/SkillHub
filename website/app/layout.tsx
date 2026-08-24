import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SkillHub - 极速本地 AI 技能引擎",
  description: "基于 Tauri & Rust 打造的跨平台 AI Agent 技能与 Prompt 管理工作站。零配置，纯本地，毫秒级响应，重新定义你的 AI 工作流。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
