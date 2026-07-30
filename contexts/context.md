# SkillHub (技能管理助手)

## 1. 项目简介
SkillHub 是一个基于 Tauri + React (TypeScript) 构建的跨平台桌面客户端软件。
其核心目标是**统一管理本地与云端的 AI Agent Skills（技能库）**，支持从 GitHub 仓库自动克隆，或直接挂载本地技能目录，并能将这些技能方便地分发和同步给不同的本地 AI Agent 环境（如 Cursor, Claude Code, Antigravity 等）。

## 2. 核心架构
* **前端 (Frontend)**: React + Vite + Tailwind CSS。采用通透的浅色毛玻璃风格 (Glassmorphism)，UI 使用 Lucide React 图标。
* **后端 (Backend)**: Rust (Tauri)。
* **数据库 (Database)**: 采用 `rusqlite` 构建本地 SQLite 数据库，位于 `~/.skillhub/database.sqlite`。
* **核心引擎 (Engine)**:
  - 文件系统扫描：用于遍历目标目录中的 `SKILL.md` 文件。
  - Git 引擎：基于 `git2-rs`，负责从远程仓库克隆技能并执行 `git pull` 同步。

## 3. 数据模型 (Models)
1. **SourceDirectory (技能仓库/源目录)**
   - `id`: 唯一标识
   - `path`: 本地绝对路径
   - `source_type`: 'local' (本地目录) 或 'github' (Git 仓库)
   - `url`: (可选) GitHub 远程仓库地址
2. **Skill (单体技能)**
   - `id`: 唯一标识
   - `name`: 技能名称 (从 SKILL.md frontmatter 解析)
   - `description`: 技能描述 (从 SKILL.md 解析)
   - `local_path`: `SKILL.md` 所在的本地目录路径
   - `source_id`: 关联的 SourceDirectory
3. **AgentConfig (待实现)**
   - `id`: Agent 的名称或标识（如 Cursor, Antigravity 等）
   - `config_path`: 该 Agent 读取技能的本地路径（如 `~/.gemini/config/skills`）
4. **SyncRecord (待实现)**
   - 记录某个 Skill 被同步/分发到哪个 Agent，以何种形式（Symlink / Copy）分发。

## 4. 后续功能规划
* **Agent 目标配置**：配置并管理各个本地 Agent 的技能存放路径。
* **同步分发机制**：将特定的 Skill 软链接或复制到指定 Agent 的目录下。
* **单体技能在线编辑**：提供对 SKILL.md 的修改能力。
