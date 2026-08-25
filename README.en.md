<div align="right">
  <a href="./README.md">简体中文</a> | <strong>English</strong>
</div>

<div align="center">
  <img src="src-tauri/icons/icon.png" width="128" height="128" alt="SkillHub Logo" />
  <h1>SkillHub</h1>
  <p>Manage all your AI skills and prompts in one place</p>
  <p>
    <img src="https://img.shields.io/github/v/release/VipBeCool/SkillHub?style=flat-square" alt="release" />
    <img src="https://img.shields.io/github/license/VipBeCool/SkillHub?style=flat-square" alt="license" />
    <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue?style=flat-square" alt="platform" />
    <img src="https://img.shields.io/github/downloads/VipBeCool/SkillHub/total?style=flat-square" alt="downloads" />
  </p>
</div>

<p align="center">
  <a href="#the-problem">Why</a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="#features">Features</a> ·
  <a href="#download">Download</a> ·
  <a href="#development">Dev</a>
</p>

## The Problem

If you use AI coding tools like Claude Code, Cursor, or Codex, you've probably accumulated a pile of skill files (Skills, Rules) and prompt templates — some in local folders, some in GitHub repos, some bookmarked from the web. Finding a skill you used last week means digging through multiple places. And when a GitHub skill repo gets updated, you don't know unless you check manually.

SkillHub is a desktop app that brings all of these into one interface. Import local folders, clone GitHub repos, bookmark online links — then search, browse, and manage them together. When a skill repo gets updated, sync it with one click instead of running `git pull` by hand. Prompt templates get their own module with grouping, tags, and version history.

## Screenshots

> Screenshots are from macOS. Windows and Linux look largely the same.

### Skill Library

Mount multiple sources (local folders, GitHub repos, online links). Right-click to open in Finder, sync to an AI Agent, export, or update.

<img src="docs/screenshots/技能管理.png" width="800" alt="Skill library management" />

### Skill Detail

View skill content, file count, line count, and token count. Built-in translation lets you read English skills in Chinese (or other languages).

<img src="docs/screenshots/技能详情.png" width="800" alt="Skill detail view" />

### Global Search

`Cmd/Ctrl + K` opens search across all repos and skills. The right panel shows a live preview of the selected result.

<img src="docs/screenshots/全局搜索.png" width="800" alt="Global search" />

### Prompt Management

A separate module for prompt templates — with grouping, tags, usage count tracking, and multi-language support.

<img src="docs/screenshots/提示词管理.png" width="800" alt="Prompt management" />

### Smart Reference Prompt

Select a skill and SkillHub generates a reference prompt containing the directory structure, execution instructions, and repo context. Copy it into your AI conversation and the agent will follow that skill.

<img src="docs/screenshots/智能引用提示词.png" width="800" alt="Smart reference prompt" />

### Import & Sync

Three ways to add skills: import a local folder, clone from GitHub, or bookmark an online link. You can also drag folders directly into the window. Once imported, the tool automatically parses various types of skill formats in the background, so you don't have to worry about the file structure. GitHub repos support batch sync.

<table>
  <tr>
    <td><img src="docs/screenshots/导入技能.png" alt="Import options" /></td>
    <td><img src="docs/screenshots/更新技能.png" alt="Sync progress" /></td>
  </tr>
</table>

### Batch Operations & Drag-and-Drop

Select multiple skill repos for batch export, update, or delete. Drag folders into the window to add them.

<table>
  <tr>
    <td><img src="docs/screenshots/多选操作.png" alt="Batch operations" /></td>
    <td><img src="docs/screenshots/拖动导入.png" alt="Drag-and-drop import" /></td>
  </tr>
</table>

### Classification & Details

Enjoy a flexible tag classification system and use custom Emoji icons to differentiate your skill libraries, making organization and retrieval effortless.

<img src="docs/screenshots/技能分类管理.png" width="800" alt="Skill classification management" />

## Features

| Feature | Description |
|---------|-------------|
| Multi-source management | Mount local folders, GitHub repos, and online links side by side. Sub-skills are automatically scanned and various skill formats are seamlessly parsed. |
| Classification & Display | Supports flexible tag classifications and custom Emoji icons for skill libraries. |
| Prompt management | Separate module with grouping, tags, usage stats, version history, and Markdown preview. |
| Global search | `Cmd/Ctrl + K` to search repos and skills at once, with a live preview panel. |
| GitHub sync | One-click pull for all GitHub repos, with per-repo status display. |
| Smart reference | Auto-generates a reference prompt with directory structure and execution instructions. |
| Sync to Agent | Push skills directly to Antigravity, Codex, or other AI Agents. |
| Batch operations | Select multiple repos to batch export (ZIP/JSON), update, or delete. |
| Drag-and-drop import | Drop folders into the window to add them. |
| Built-in translation | Translate skills between languages with one click. |
| In-app updates | Checks for new versions on startup. One-click install. |

## Download

Go to [Releases](https://github.com/VipBeCool/SkillHub/releases/latest) to grab the installer for your platform:

| Platform | Installer |
|----------|-----------|
| macOS (Intel + Apple Silicon) | `.dmg` |
| Windows (x64) | `.exe` / `.msi` |
| Linux (x64) | `.AppImage` / `.deb` |

If you already have it installed, you'll get an update prompt inside the app.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Tailwind CSS v4, Vite |
| Backend | Rust, Tauri v2, SQLite (rusqlite) |
| CI/CD | GitHub Actions + tauri-action |

Built with Tauri instead of Electron — smaller bundle, lower memory usage.

## Development

### Requirements

- [Node.js](https://nodejs.org/) v18+
- [Rust](https://www.rust-lang.org/tools/install) stable
- macOS: Xcode Command Line Tools
- Windows: Visual Studio C++ Build Tools

### Run

```bash
git clone https://github.com/VipBeCool/SkillHub.git
cd SkillHub
npm install
npm run skillhub dev
```

### Build

```bash
npm run skillhub build
```

Output goes to `src-tauri/target/release/bundle/`.

### Version Management

The version number lives in three files: `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`. Update all at once with:

```bash
node scripts/bump-version.mjs 0.2.0
```

## License

[GPL-3.0](./LICENSE). Free to use and modify, but derivative projects must also be open-source. Contact the author for commercial closed-source licensing.

---

Made by [VipBeCool](https://github.com/VipBeCool)
