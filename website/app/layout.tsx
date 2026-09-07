import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SkillHub - 你的跨平台必备 AI Skills 搜集与管理工具",
  description: "基于 Tauri & Rust 打造的轻量桌面工具。即插即用，纯本地存储，随时整理、管理与调用各类 AI 技能包与提示词库。",
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
