<div align="right">
  <strong>简体中文</strong> | <a href="./README.en.md">English</a>
</div>

<div align="center">
  <img src="src-tauri/icons/icon.png" width="128" height="128" alt="SkillHub Logo" />
  <h1>SkillHub</h1>
  <p>跨平台的 AI 技能与 Prompt 管理工作站</p>
  <p>
    <img src="https://img.shields.io/github/v/release/VipBeCool/SkillHub?style=flat-square" alt="release" />
    <img src="https://img.shields.io/github/license/VipBeCool/SkillHub?style=flat-square" alt="license" />
    <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue?style=flat-square" alt="platform" />
    <img src="https://img.shields.io/github/downloads/VipBeCool/SkillHub/total?style=flat-square" alt="downloads" />
  </p>
</div>

## 简介

SkillHub 是一款基于 Tauri + Rust 的桌面应用，用于统一管理本地 AI Agent 技能文件（如 Claude Desktop Skills、Cursor Rules 等）和 Prompt 模板。

支持同时挂载多个本地技能库、GitHub 远程仓库、在线技能收藏，提供可视化浏览、标签分类、全文搜索、批量导出、一键同步等功能。

## 核心功能

- **多库管理** — 同时挂载多个本地文件夹、GitHub 仓库、在线技能源，统一浏览
- **Prompt 管理** — 独立的 Prompt 模板管理模块，支持分组、标签、Token 统计
- **全文搜索** — 快速检索所有技能和 Prompt 内容（Cmd/Ctrl + K）
- **GitHub 同步** — 一键拉取远程仓库变更，自动检测新增/修改/删除
- **批量操作** — 框选多个技能库，支持批量导出（ZIP/JSON）、批量删除
- **应用内更新** — 启动时自动检查新版本，一键下载安装
- **轻量高性能** — Rust 后端 + SQLite 本地存储，内存占用远低于 Electron 方案

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19, TypeScript, Tailwind CSS v4, Vite |
| 后端 | Rust, Tauri v2, SQLite (rusqlite) |
| CI/CD | GitHub Actions + tauri-action |

## 下载安装

前往 [Releases](https://github.com/VipBeCool/SkillHub/releases/latest) 页面下载对应平台的安装包：

| 平台 | 安装包 |
|------|--------|
| macOS (Intel + Apple Silicon) | `.dmg` |
| Windows (x64) | `.exe` / `.msi` |
| Linux (x64) | `.AppImage` / `.deb` |

> 已安装的用户会在应用内收到更新提示，无需手动下载。

## 本地开发

### 环境要求

- [Node.js](https://nodejs.org/) v18+
- [Rust](https://www.rust-lang.org/tools/install) 稳定版
- macOS 需要 Xcode Command Line Tools
- Windows 需要 Visual Studio C++ Build Tools

### 运行

```bash
git clone https://github.com/VipBeCool/SkillHub.git
cd SkillHub
npm install
npm run skillhub dev
```

### 构建

```bash
npm run skillhub build
```

安装包输出到 `src-tauri/target/release/bundle/` 目录。

### 版本号管理

版本号分布在 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 三处，使用脚本一键同步：

```bash
node scripts/bump-version.mjs 0.2.0
```

## 开源协议

本项目采用 [GPL-3.0](./LICENSE) 协议。允许自由使用和修改，但衍生项目必须同样开源。商业闭源使用请联系作者获取授权。

---

Made by [VipBeCool](https://github.com/VipBeCool)
