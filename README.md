<div align="center">
  <img src="src-tauri/icons/icon.png" width="128" height="128" alt="SkillHub Logo" />
  <h1>SkillHub</h1>
  <p>🚀 一款基于 Rust 打造的高性能跨平台 AI 技能（Agent Skill）管理与分发工作站</p>
</div>

## ✨ 核心卖点

- ⚡️ **极速轻量**：采用 Tauri + Rust 底层重构，内存占用极低（相比 Electron 节省 80% 以上内存），启动快如闪电。
- 🔄 **多库同频**：支持同时挂载和管理本地多个 AI 技能文件夹（如 Claude Desktop 的 Skills），自动侦测变化。
- 🎨 **极客美学**：现代化的 React + TailwindCSS 界面设计，支持明暗模式无缝切换。
- 📦 **全平台支持**：一套代码同时编译为 macOS (.dmg)、Windows (.exe) 和 Linux 安装包。
- 🛡 **隐私至上**：当前架构下所有技能与配置均保存在本地磁盘，无需依赖云端服务器。

## 🛠 技术栈

* **前端（GUI）**：React, TypeScript, TailwindCSS, Vite
* **后端（核心逻辑 & OS 交互）**：Rust, Tauri v2
* **其他构建工具**：Node.js, Cargo

## 🚀 快速开始

### 环境依赖

在开始之前，请确保您的电脑已经安装了以下环境：

1. [Node.js](https://nodejs.org/) (v18+)
2. [Rust 编译环境](https://www.rust-lang.org/tools/install)
3. 对应的原生系统开发工具（macOS 需要 Xcode Command Line Tools，Windows 需要 C++ Build Tools）

### 本地运行

```bash
# 1. 克隆仓库
git clone https://github.com/VipBeCool/SkillHub.git
cd SkillHub

# 2. 安装前端依赖
npm install

# 3. 启动开发服务器与桌面窗口
npm run tauri dev
```

### 构建打包

如果你想在本地生成可安装的 `.dmg` / `.exe` 文件：

```bash
npm run tauri build
```

生成的安装包将位于 `src-tauri/target/release/bundle/` 目录下。

## 🤝 参与贡献与商业授权

欢迎提交 PR (Pull Request) 或 Issue 来共同改进 SkillHub！

**开源协议与商用说明**：
本项目采用 **[GPL-3.0 License](./LICENSE)** 协议开源。
这意味着：

1. 任何人都可以免费下载、使用、修改本项目的源代码。
2. 任何使用了本项目源代码的衍生软件，**也必须以 GPL-3.0 协议开源**，严禁闭源套壳。
3. 如果您所在的商业公司希望将本代码用于闭源的商业产品，请联系作者获取**商业授权 (Commercial License)**。

---

*Made with ❤️ by VipBeCool*
