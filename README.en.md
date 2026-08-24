<div align="right">
  <a href="./README.md">简体中文</a> | <strong>English</strong>
</div>

<div align="center">
  <img src="src-tauri/icons/icon.png" width="128" height="128" alt="SkillHub Logo" />
  <h1>SkillHub</h1>
  <p>A Cross-Platform AI Skill & Prompt Management Workstation</p>
  <p>
    <img src="https://img.shields.io/github/v/release/VipBeCool/SkillHub?style=flat-square" alt="release" />
    <img src="https://img.shields.io/github/license/VipBeCool/SkillHub?style=flat-square" alt="license" />
    <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue?style=flat-square" alt="platform" />
    <img src="https://img.shields.io/github/downloads/VipBeCool/SkillHub/total?style=flat-square" alt="downloads" />
  </p>
</div>

## Introduction

SkillHub is a desktop application built with Tauri and Rust, designed for unified management of local AI Agent skill files (like Claude Desktop Skills, Cursor Rules, etc.) and Prompt templates.

It supports mounting multiple local skill libraries, GitHub remote repositories, and online skill collections simultaneously. It provides visual browsing, tag categorization, full-text search, batch export, and one-click synchronization features.

## Core Features

- **Multi-Library Management** — Mount multiple local folders, GitHub repositories, and online skill sources simultaneously for unified browsing.
- **Prompt Management** — An independent Prompt template management module supporting grouping, tags, and Token counting.
- **Full-Text Search** — Quickly search all skills and Prompt contents (Cmd/Ctrl + K).
- **GitHub Sync** — One-click pull of remote repository changes, automatically detecting additions/modifications/deletions.
- **Batch Operations** — Select multiple skill libraries for batch exporting (ZIP/JSON) or batch deletion.
- **In-App Updates** — Automatically checks for new versions on startup, with one-click download and installation.
- **Lightweight & High Performance** — Rust backend + SQLite local storage, with significantly lower memory usage compared to Electron solutions.

## Tech Stack

| Layer | Technology |
|------|------|
| Frontend | React 19, TypeScript, Tailwind CSS v4, Vite |
| Backend | Rust, Tauri v2, SQLite (rusqlite) |
| CI/CD | GitHub Actions + tauri-action |

## Download & Install

Head over to the [Releases](https://github.com/VipBeCool/SkillHub/releases/latest) page to download the installer for your platform:

| Platform | Installer |
|------|--------|
| macOS (Intel + Apple Silicon) | `.dmg` |
| Windows (x64) | `.exe` / `.msi` |
| Linux (x64) | `.AppImage` / `.deb` |

> Users who have already installed the app will receive an update prompt in-app and do not need to download manually.

## Local Development

### Requirements

- [Node.js](https://nodejs.org/) v18+
- [Rust](https://www.rust-lang.org/tools/install) stable
- macOS requires Xcode Command Line Tools
- Windows requires Visual Studio C++ Build Tools

### Running

```bash
git clone https://github.com/VipBeCool/SkillHub.git
cd SkillHub
npm install
npm run skillhub dev
```

### Building

```bash
npm run skillhub build
```

The installer will be output to the `src-tauri/target/release/bundle/` directory.

### Version Management

The version number is distributed across `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`. Use the script for one-click synchronization:

```bash
node scripts/bump-version.mjs 0.2.0
```

## License

This project is licensed under the [GPL-3.0](./LICENSE) License. Free use and modification are permitted, but derivative projects must also be open-source. For commercial closed-source use, please contact the author for authorization.

---

Made by [VipBeCool](https://github.com/VipBeCool)
