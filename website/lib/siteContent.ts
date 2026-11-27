export type Locale = "zh" | "en";

export interface HeroStageTab {
  id: string;
  label: string;
  badge: string;
  caption: string;
  image: string;
  alt: string;
}

export interface DiscoverStep {
  id: string;
  step: string;
  title: string;
  desc: string;
  highlights: string[];
  image: string;
  alt: string;
}

export interface PromptSlide {
  id: string;
  label: string;
  title: string;
  desc: string;
  image: string;
  alt: string;
}

export interface SiteDictionary {
  metaTitle: string;
  metaDesc: string;
  nav: {
    desktop: string;
    agents: string;
    prompts: string;
    discover: string;
    changelog: string;
    download: string;
    community: string;
    freeDownload: string;
  };
  hero: {
    announcementPrefix: string;
    announcementText: string;
    titleLine1: string;
    titleHighlight: string;
    titleSuffix: string;
    titleLine2: string;
    subtitle: string;
    downloadFor: {
      mac: string;
      win: string;
      linux: string;
      default: string;
    };
    allPlatforms: string;
    viewChangelog: string;
    runtimeNote: string;
    clickToZoom: string;
    tabs: HeroStageTab[];
  };
  ecosystem: {
    agentsLabel: string;
    sourcesLabel: string;
  };
  desktopSection: {
    eyebrow: string;
    title: string;
    subtitle: string;
    marqueeCard: {
      tag: string;
      title: string;
      desc: string;
    };
    dragCard: {
      tag: string;
      title: string;
      desc: string;
    };
    quickLookCard: {
      tag: string;
      title: string;
      desc: string;
    };
    readingCard: {
      tag: string;
      title: string;
      desc: string;
      tabOutline: string;
      tabTranslate: string;
    };
    twoTierCard: {
      tag: string;
      title: string;
      desc: string;
    };
    asyncGitCard: {
      tag: string;
      title: string;
      desc: string;
    };
  };
  agentSection: {
    eyebrow: string;
    title: string;
    subtitle: string;
    cards: Array<{
      id: string;
      tag: string;
      title: string;
      desc: string;
      images: Array<{ label: string; src: string; alt: string }>;
    }>;
  };
  promptsSection: {
    eyebrow: string;
    title: string;
    subtitle: string;
    channels: Array<{ name: string; meta: string }>;
    slides: PromptSlide[];
  };
  discoverSection: {
    eyebrow: string;
    title: string;
    subtitle: string;
    steps: DiscoverStep[];
  };
  specsSection: {
    eyebrow: string;
    title: string;
    subtitle: string;
    items: Array<{
      title: string;
      desc: string;
    }>;
    backupCaption: string;
  };
  changelogSection: {
    eyebrow: string;
    title: string;
    subtitle: string;
    latestBadge: string;
    autoSyncHint: string;
    viewOnGithub: string;
    showAllPrefix: string;
    showAllSuffix: string;
    collapseHistory: string;
    zhNotice?: string;
  };
  downloadSection: {
    titlePrefix: string;
    titleHighlight: string;
    subtitle: string;
    sourceLabel: string;
    sourceGithub: string;
    sourceMirror: string;
    mirrorHint: string;
    currentReleaseLabel: string;
    platforms: {
      macDesc: string;
      macFormat: string;
      winDesc: string;
      winFormat: string;
      linuxDesc: string;
      linuxFormat: string;
    };
    allReleasesLink: string;
  };
  communityModal: {
    title: string;
    subtitle: string;
    qqTitle: string;
    qqSub: string;
    wechatTitle: string;
    wechatSub: string;
    close: string;
  };
  footer: {
    tagline: string;
    creditsTitle: string;
    linksTitle: string;
    donate: string;
    issues: string;
    releases: string;
    copyright: string;
  };
}

export type AgentBrandId =
  | "claude-code"
  | "cursor"
  | "windsurf"
  | "antigravity"
  | "codex"
  | "trae"
  | "cline";

export type EcosystemSourceId =
  | "skills-sh"
  | "linkly"
  | "aishort"
  | "prompts-chat"
  | "fabric"
  | "langgpt"
  | "github";

export const SUPPORTED_AGENTS: Array<{ id: AgentBrandId; name: string }> = [
  { id: "claude-code", name: "Claude Code" },
  { id: "cursor", name: "Cursor" },
  { id: "windsurf", name: "Windsurf" },
  { id: "antigravity", name: "Antigravity" },
  { id: "codex", name: "Codex" },
  { id: "trae", name: "Trae" },
  { id: "cline", name: "Cline" },
];

export const OPEN_ECOSYSTEM_SOURCES: Array<{
  id: EcosystemSourceId;
  name: string;
  href: string;
}> = [
  { id: "skills-sh", name: "skills.sh", href: "https://skills.sh" },
  { id: "linkly", name: "Linkly Best Skills", href: "https://github.com/LinklyAI/best-skills" },
  { id: "aishort", name: "AiShort", href: "https://github.com/rockbenben/ChatGPT-Shortcut" },
  { id: "prompts-chat", name: "prompts.chat", href: "https://prompts.chat" },
  { id: "fabric", name: "Fabric", href: "https://github.com/danielmiessler/fabric" },
  { id: "langgpt", name: "LangGPT", href: "https://github.com/langgptai/LangGPT" },
  { id: "github", name: "GitHub / GitLab", href: "https://github.com" },
];

export const SITE_CONTENT: Record<Locale, SiteDictionary> = {
  zh: {
    metaTitle: "SkillHub — 跨平台 AI Skills 与提示词桌面管理工具",
    metaDesc:
      "基于 Tauri v2 与 Rust 构建的轻量原生桌面管理工具。像管理本地文件一样整理、速览、翻译你的 AI 技能包与提示词，一键同步至常用 AI Agent，并内置全球开源资源中心。",
    nav: {
      desktop: "桌面整理",
      agents: "随手调用",
      prompts: "提示词库",
      discover: "资源中心",
      changelog: "更新日志",
      download: "下载",
      community: "交流群",
      freeDownload: "免费下载",
    },
    hero: {
      announcementPrefix: "全新发布",
      announcementText: "全新资源中心 · 四大开源提示词精选 · 单技能精准安装",
      titleLine1: "像管理本地文件一样",
      titleHighlight: "整理与同步",
      titleSuffix: "你的 AI Skills",
      titleLine2: "",
      subtitle:
        "把技能包与提示词收进原生桌面工作台，支持拖拽框选、空格速览、菜单栏随手调用与一键同步 AI 工具，并内置资源中心按需直装。",
      downloadFor: {
        mac: "下载 macOS 版",
        win: "下载 Windows 版",
        linux: "下载 Linux 版",
        default: "免费下载安装包",
      },
      allPlatforms: "全部平台安装包",
      viewChangelog: "查看更新日志",
      runtimeNote:
        "支持 macOS · Windows · Linux ｜ Tauri v2 原生构建 ｜ 100% 本地 SQLite 存储 ｜ GPL-3.0 开源",
      clickToZoom: "点击画面查看高清原图",
      tabs: [
        {
          id: "workspace",
          label: "类访达桌面整理",
          badge: "多标签 + 分层管理",
          caption:
            "浏览器式多标签页并行查阅，自动区分多技能包与独立单技能，拖拽入库、框选批量、原生右键一应俱全。",
          image: "./screenshots/tabs-overview.png",
          alt: "SkillHub 多标签页与分层技能管理",
        },
        {
          id: "tray",
          label: "菜单栏随身助手",
          badge: "即搜即复制",
          caption:
            "写代码或对话时无需切回主窗口，轻点菜单栏/系统托盘图标即可毫秒级检索并复制 @skill 引用或 Prompt 正文。",
          image: "./screenshots/tray-panel.png",
          alt: "SkillHub 菜单栏与系统托盘随身快捷面板",
        },
        {
          id: "prompt-studio",
          label: "提示词双视图管理",
          badge: "100% 格式保真",
          caption:
            "按工作流分组收纳高频指令，支持 Markdown 排版渲染与纯文本视图无损切换，保留原始换行与缩进。",
          image: "./screenshots/prompt-dual-view.png",
          alt: "SkillHub 提示词排版与纯文本双视图管理",
        },
        {
          id: "discover",
          label: "资源中心 · 发现",
          badge: "v0.3.0 新增",
          caption:
            "内置中文场景严选专题、全球每日风向榜单与可订阅 Git 技能仓库，预览全文后单技能精准落盘。",
          image: "./screenshots/hub-discover.png",
          alt: "SkillHub 资源中心发现首页",
        },
        {
          id: "prompts-hub",
          label: "多源提示词精选",
          badge: "4 大开源生态",
          caption:
            "聚合 AiShort、prompts.chat、Fabric 与 LangGPT，双语预览翻译后一键存入本地提示词库。",
          image: "./screenshots/hub-prompts.png",
          alt: "SkillHub 多源提示词精选广场",
        },
      ],
    },
    ecosystem: {
      agentsLabel: "一键软链接同步至",
      sourcesLabel: "直接聚合开放生态",
    },
    desktopSection: {
      eyebrow: "Desktop File-Manager UX",
      title: "像在「访达 / 此电脑」里管文件一样顺手",
      subtitle:
        "拒绝生硬的网页套壳感。SkillHub 按原生桌面软件的直觉打磨每一处键鼠交互细节，让成百上千个技能包与提示词始终井井有条。",
      marqueeCard: {
        tag: "拉框多选 & 原生右键",
        title: "空白处按住拉框连选，批量处理一气呵成",
        desc: "支持鼠标拉框多选、Shift 连选与 Cmd/Ctrl 点选；搭配完整上下文右键菜单，批量星标、批量打标、批量更新、导出目录/ZIP 或在文件管理器中定位一触即达。",
      },
      dragCard: {
        tag: "拖拽即导入",
        title: "文件夹拖进窗口直接入库",
        desc: "把本地技能文件夹拖入主界面即可完成挂载与解析；侧边栏多技能库与提示词分组同样支持拖拽排序与归类。",
      },
      quickLookCard: {
        tag: "Spacebar QuickLook",
        title: "轻按空格键，原地速览文档",
        desc: "只想确认某个技能或提示词写了什么？选中卡片按一下空格键即刻弹出磨砂预览层，再按空格或 Esc 立即收起，省去来回进出详情页。",
      },
      readingCard: {
        tag: "长文精读体验",
        title: "自动章节大纲 + 三轨自愈中英翻译",
        desc: "数千行的英文 SKILL.md 也能轻松读透：右侧自动提取标题层级随滚动高亮跳转；内置「Google → 腾讯交互翻译 → MyMemory」三轨引擎，国内免代理秒出地道中文并支持原文对照。",
        tabOutline: "自动目录大纲",
        tabTranslate: "中英翻译对照",
      },
      twoTierCard: {
        tag: "双层独立整理",
        title: "技能包与子技能独立星标、专属标签面板",
        desc: "技能包与包内子技能各自独立加星标、打标签互不污染；内置标签管理面板支持常用置顶、引用计数、重命名合并与清理，支持自定义多技能库图标。",
      },
      asyncGitCard: {
        tag: "多源统一收纳",
        title: "本地目录、GitHub 仓库与在线链接一处统管",
        desc: "既能直接关联本地已有开发目录，也能克隆任意 Git 仓库或收藏网页技能书签，满足个人沉淀与团队共享的不同习惯。",
      },
    },
    agentSection: {
      eyebrow: "Quick Access & Agent Sync",
      title: "一次整理，在你所有的 AI 工具里随叫随到",
      subtitle:
        "不用在多个编辑器之间重复拷贝技能文件夹，也不用每次翻聊天记录找提示词。菜单栏浮窗与系统级软链接让日常调用零阻力。",
      cards: [
        {
          id: "tray-helper",
          tag: "菜单栏 / 托盘常驻",
          title: "无需切回主窗口，写代码时伸手即复制",
          desc: "常驻 macOS 顶部菜单栏与 Windows 系统托盘，自动跟随当前技能库，模糊检索技能包、单技能与提示词，回车或点击即复制，切回编辑器自动收起。",
          images: [
            {
              label: "托盘面板",
              src: "./screenshots/tray-panel.png",
              alt: "悬浮在编辑器上方的托盘快捷面板",
            },
          ],
        },
        {
          id: "agent-symlink",
          tag: "Symlink 同步",
          title: "一键挂载常用 AI Agent，零拷贝实时生效",
          desc: "内置 Claude Code、Cursor、Windsurf、Antigravity、Codex 等路径预设，勾选即通过软链接挂载，修改一处全局生效；也可一键生成带目录树的引用提示词。",
          images: [
            { label: "Agent 挂载", src: "./screenshots/sync-agent.png", alt: "一键同步技能到 AI Agent" },
            {
              label: "引用指令",
              src: "./screenshots/smart-prompt-reference.png",
              alt: "生成结构化智能引用提示词",
            },
          ],
        },
        {
          id: "cmdk-search",
          tag: "⌘K 全局搜索",
          title: "一个搜索框，同时穿透本地库与 GitHub",
          desc: "按下 Cmd/Ctrl + K 同时检索本地技能、提示词、专题榜、订阅仓与 GitHub 开源仓库；填入零权限只读 Token 即可畅享 5,000 次/小时搜索额度。",
          images: [
            { label: "全局检索", src: "./screenshots/github-search.png", alt: "Cmd+K 全局搜索与 GitHub 检索" },
            { label: "Token 配置", src: "./screenshots/github-token.png", alt: "极简 GitHub Token 配置弹窗" },
          ],
        },
      ],
    },
    promptsSection: {
      eyebrow: "Prompt Studio & Open Catalog",
      title: "本地双视图精修工作台，直通四大开源提示词生态",
      subtitle:
        "日常高频模板按工作流分组精细管理、无损切换排版与纯文本；需要新灵感时，在「提示词精选」一键浏览全球社区并直接入库。",
      channels: [
        { name: "AiShort 中文精选", meta: "中英双语切换 · 场景说明" },
        { name: "prompts.chat 社区", meta: "3,000+ 条 · 镜像自动兜底" },
        { name: "Fabric 专业工作流", meta: "266 个工程化系统模式" },
        { name: "LangGPT 结构化模板", meta: "角色化 Markdown 框架" },
      ],
      slides: [
        {
          id: "prompt-dual",
          label: "排版 / 纯文本双视图",
          title: "100% 保留原始换行与缩进，改写参数不走样",
          desc: "复杂结构化提示词在 Markdown 渲染阅读与原始纯文本视图间一键无损切换，避免空格和空行被意外合并，调校系统提示词更精准。",
          image: "./screenshots/prompt-dual-view.png",
          alt: "提示词排版与纯文本双视图切换",
        },
        {
          id: "prompt-manage",
          label: "本地分组与多格式导出",
          title: "按工作流分组收纳，支持 MD / JSON / TXT 导出",
          desc: "提供独立标签栏、常用星标与编辑器标签智能联想补全，成体系沉淀你的高频指令资产。",
          image: "./screenshots/prompts-list.png",
          alt: "本地提示词分组与标签管理",
        },
        {
          id: "prompt-catalog",
          label: "多源精选广场",
          title: "四大开源频道实时检索，全宽预览一键入库",
          desc: "支持按分类过滤与「只看未添加」，详情页提供双语切换、长文本分段中文翻译与 {{变量}} 自动识别，点击「+ 添加」实时同步至本地库。",
          image: "./screenshots/hub-prompts.png",
          alt: "多源提示词精选广场",
        },
      ],
    },
    discoverSection: {
      eyebrow: "Built-in Resource Hub",
      title: "内置资源中心：先读懂全文，再按需精准装入本地库",
      subtitle:
        "想扩充新技能时，无需为了一个子技能克隆整个百兆仓库再手动翻找目录。从发现、预览翻译到单技能提取与后续更新，全程在应用内闭环完成。",
      steps: [
        {
          id: "step-boards",
          step: "01",
          title: "每日实时 6 榜 + 可热更场景专题榜",
          desc: "同步全球安装量与社区讨论热度，按研发工程、设计创意、办公自动化等分类精准过滤；精选专题榜支持一键补齐未装技能，并通过 24 小时远程热更新持续扩充。",
          highlights: [
            "过滤不可直装项，列表所见皆可一键安装",
            "支持订阅任意公开/私有 GitHub 与 GitLab 仓库",
            "内置 skills.sh 全球目录与 GitHub 双检索",
          ],
          image: "./screenshots/hub-leaderboards.png",
          alt: "技能榜单合集页面",
        },
        {
          id: "step-preview",
          step: "02",
          title: "安装前在线预览 SKILL.md 与配套文件",
          desc: "点开任意远程技能即可直接阅读完整 SKILL.md、一键翻译英文简介并查看目录文件大小；多技能仓库仅精准提取当前子目录，也可按需安装所属完整技能包。",
          highlights: [
            "无需克隆到本地即可提前审阅完整指令规则",
            "智能区分单技能仓库克隆与子目录精准提取",
            "所有远程安装项统一归入「已安装」随时检查更新",
          ],
          image: "./screenshots/hub-skill-preview.png",
          alt: "安装前在线预览 SKILL.md 与安装说明",
        },
        {
          id: "step-git",
          step: "03",
          title: "后台异步拉取，流式进度与一键更新",
          desc: "无论是提取单技能还是克隆完整仓库，全程后台异步执行不阻塞整理操作；卡片实时显示拉取进度，点击可展开流式终端日志。",
          highlights: [
            "自动清洗粘贴的 git clone 前缀与网页多余后缀",
            "实时进度条反馈，支持展开查看原生终端输出",
            "已安装仓库与技能支持一键检测并同步上游更新",
          ],
          image: "./screenshots/clone-progress.png",
          alt: "后台异步拉取实时进度卡片",
        },
      ],
    },
    specsSection: {
      eyebrow: "Local-First & Native Architecture",
      title: "原生轻量架构，数据 100% 留在本地",
      subtitle:
        "无需注册登录任何账号，不依赖第三方云端服务。断网离线照常查阅调用，换新电脑一键完整迁移。",
      items: [
        {
          title: "Tauri v2 + Rust 原生内核",
          desc: "告别臃肿套壳，安装包仅十余兆；依托系统原生 WebView，冷启动秒开，长久驻留菜单栏内存占用极低。",
        },
        {
          title: "本地 SQLite + ZIP 快照迁移",
          desc: "全量索引、提示词与偏好配置均存于本地 SQLite；支持一键导出标准 ZIP 归档包，恢复前自动留存安全备份。",
        },
        {
          title: "多通道网络容错与静默常驻",
          desc: "拉取与更新内置「系统代理 → 直连 → 国内镜像」自动切换，弱网环境依然稳健；支持随系统开机静默启动待命。",
        },
        {
          title: "GPL-3.0 完全开源透明",
          desc: "前后端全部代码公开可审阅，内置结构化版本日志与应用内一键平滑升级，长期持续迭代。",
        },
      ],
      backupCaption: "极简设置中心：支持全库打包导出 ZIP 与带自动安全快照的一键恢复",
    },
    changelogSection: {
      eyebrow: "Changelog",
      title: "版本更新日志",
      subtitle: "直接同步自代码仓库 CHANGELOG.md，记录 SkillHub 每一次功能进化与细节打磨。",
      latestBadge: "最新版本",
      autoSyncHint: "与 GitHub 仓库实时同步",
      viewOnGithub: "GitHub Releases",
      showAllPrefix: "展开其余 ",
      showAllSuffix: " 个历史版本记录",
      collapseHistory: "收起早期历史版本",
    },
    downloadSection: {
      titlePrefix: "即刻下载 ",
      titleHighlight: "SkillHub",
      subtitle: "开源免费，无账号门槛，支持 macOS、Windows 与 Linux 全平台桌面端。",
      sourceLabel: "下载线路：",
      sourceGithub: "GitHub 官方源",
      sourceMirror: "国内加速镜像",
      mirrorHint: "已启用 gh-proxy 高速镜像通道，适合国内无代理网络直接满速下载安装包。",
      currentReleaseLabel: "当前最新正式安装包",
      platforms: {
        macDesc: "通用架构 (Apple Silicon & Intel)",
        macFormat: "下载 .dmg 安装包",
        winDesc: "Windows 10 / 11 (64 位)",
        winFormat: "下载 .exe 安装程序",
        linuxDesc: "Ubuntu / Debian / 主流发行版 (x64)",
        linuxFormat: "下载 .AppImage",
      },
      allReleasesLink: "前往 GitHub Releases 查看 .msi / .deb 及全部历史安装包 →",
    },
    communityModal: {
      title: "加入 SkillHub 用户交流群",
      subtitle: "遇到问题、有新功能点子或想分享好用的 Skills，欢迎随时进群交流",
      qqTitle: "QQ 交流群",
      qqSub: "群号：1049282993",
      wechatTitle: "微信公众号",
      wechatSub: "扫码关注获取更新推送",
      close: "关闭",
    },
    footer: {
      tagline: "跨平台的 AI Skills 与 Prompts 发现、管理与同步桌面工具。",
      creditsTitle: "开放生态致谢",
      linksTitle: "项目与反馈",
      donate: "请作者喝杯咖啡",
      issues: "问题反馈 (Issues)",
      releases: "历史版本下载",
      copyright: "基于 GPL-3.0 协议开源。",
    },
  },

  en: {
    metaTitle: "SkillHub — Native Desktop Manager for AI Skills & Prompts",
    metaDesc:
      "A lightweight native desktop manager built with Tauri v2 & Rust. Organize, preview, translate, and symlink-sync your AI skills and prompts just like local files—complete with a built-in open-source Resource Hub.",
    nav: {
      desktop: "Desktop UX",
      agents: "Quick Access",
      prompts: "Prompts",
      discover: "Resource Hub",
      changelog: "Changelog",
      download: "Download",
      community: "Community",
      freeDownload: "Download",
    },
    hero: {
      announcementPrefix: "New Release",
      announcementText: "All-New Resource Hub · 4 Open Prompt Ecosystems · Sub-Skill Install",
      titleLine1: "Organize & Sync Your ",
      titleHighlight: "AI Skills",
      titleSuffix: "",
      titleLine2: "Just Like Local Desktop Files",
      subtitle:
        "Organize skills and prompts with drag-and-drop, Spacebar QuickLook, and menu bar launcher—sync to AI agents in one click or install from the built-in Resource Hub.",
      downloadFor: {
        mac: "Download for macOS",
        win: "Download for Windows",
        linux: "Download for Linux",
        default: "Download Installer",
      },
      allPlatforms: "All Platforms",
      viewChangelog: "View Changelog",
      runtimeNote:
        "macOS · Windows · Linux ｜ Native Tauri v2 + Rust ｜ 100% Local SQLite ｜ GPL-3.0 Open Source",
      clickToZoom: "Click screenshot to inspect full size",
      tabs: [
        {
          id: "workspace",
          label: "File-Manager UX",
          badge: "Multi-Tab + Layered",
          caption:
            "Browser-style tabs, automatic package vs. standalone skill separation, drag-drop, box-select, and native context menus.",
          image: "./screenshots/tabs-overview.png",
          alt: "SkillHub Multi-Tab Workspace",
        },
        {
          id: "tray",
          label: "Menu Bar Launcher",
          badge: "Instant Copy",
          caption:
            "Summon from the macOS menu bar or Windows tray without leaving your editor—fuzzy-search and copy @skill refs or prompts.",
          image: "./screenshots/tray-panel.png",
          alt: "SkillHub System Tray Quick Panel",
        },
        {
          id: "prompt-studio",
          label: "Dual-View Prompts",
          badge: "100% Format Fidelity",
          caption:
            "Organize prompts by workflow group and switch seamlessly between formatted Markdown and lossless raw text views.",
          image: "./screenshots/prompt-dual-view.png",
          alt: "SkillHub Dual-View Prompt Studio",
        },
        {
          id: "discover",
          label: "Resource Hub",
          badge: "New in v0.3.0",
          caption:
            "Explore curated thematic packs, daily global leaderboards, and subscribed Git skill feeds—preview before extracting single skills.",
          image: "./screenshots/hub-discover.png",
          alt: "SkillHub Resource Hub Discover view",
        },
        {
          id: "prompts-hub",
          label: "Prompt Catalog",
          badge: "4 Open Ecosystems",
          caption:
            "Browse AiShort, prompts.chat, Fabric, and LangGPT—preview, translate, and save straight into your local library.",
          image: "./screenshots/hub-prompts.png",
          alt: "SkillHub Multi-Source Prompt Catalog",
        },
      ],
    },
    ecosystem: {
      agentsLabel: "One-Click Symlink Sync To",
      sourcesLabel: "Powered By Open Ecosystems",
    },
    desktopSection: {
      eyebrow: "Desktop File-Manager UX",
      title: "Feels Just Like Finder & File Explorer",
      subtitle:
        "Crafted with native desktop ergonomics—keyboard shortcuts, rubber-band box selection, drag-and-drop, and rich context menus keep hundreds of skills effortless to organize.",
      marqueeCard: {
        tag: "Box Select & Context Menu",
        title: "Drag-Select Multiple Cards for Instant Batch Actions",
        desc: "Rubber-band select across empty space (with Shift & Cmd/Ctrl modifiers) and right-click to batch star, tag, update, sync to agents, export ZIP, or reveal in Finder/Explorer.",
      },
      dragCard: {
        tag: "Drag & Drop",
        title: "Drop Folders Straight Into the Window",
        desc: "Drag local skill folders onto the canvas to import immediately, and reorder libraries or prompt groups directly in the sidebar.",
      },
      quickLookCard: {
        tag: "Spacebar QuickLook",
        title: "Tap Spacebar to Peek Without Leaving Your List",
        desc: "Select any skill or prompt card and hit Spacebar for an instant frosted Markdown overlay—press Spacebar or Esc again to dismiss.",
      },
      readingCard: {
        tag: "Long-Doc Reading",
        title: "Auto Heading Outline (TOC) & Tri-Engine Translation",
        desc: "Navigate thousand-line SKILL.md files with a scroll-tracking right-hand TOC, and toggle side-by-side translation powered by a self-healing 3-engine pipeline.",
        tabOutline: "Auto Outline",
        tabTranslate: "Translation",
      },
      twoTierCard: {
        tag: "Two-Tier Organization",
        title: "Independent Stars & Dedicated Tag Manager",
        desc: "Star and tag Skill Packages and inner Sub-Skills independently without interference. Manage pinned tags, counts, merges, and custom folder icons with ease.",
      },
      asyncGitCard: {
        tag: "Unified Sources",
        title: "Local Folders, Git Repos & Web Bookmarks Together",
        desc: "Mount local dev folders, clone GitHub repositories, or bookmark online skill links inside unified multi-library workspaces.",
      },
    },
    agentSection: {
      eyebrow: "Quick Access & Agent Sync",
      title: "Organize Once. Summon Everywhere You Work.",
      subtitle:
        "No more duplicating skill directories across IDEs or digging through chat logs. The floating tray launcher and OS-level symlinks keep everything one click away.",
      cards: [
        {
          id: "tray-helper",
          tag: "Menu Bar / Tray",
          title: "Copy @skill Refs & Prompts Without Switching Windows",
          desc: "Click the menu bar or tray icon over your editor, fuzzy-search your active library, copy in one click, and auto-hide as soon as you click back.",
          images: [
            {
              label: "Tray Panel",
              src: "./screenshots/tray-panel.png",
              alt: "Floating menu bar quick panel",
            },
          ],
        },
        {
          id: "agent-symlink",
          tag: "Symlink Sync",
          title: "One-Click Presets for Every Major AI Agent",
          desc: "Mount skills into Claude Code, Cursor, Windsurf, Antigravity, Codex, and more via real-time symlinks—or generate structured reference prompts ready to paste.",
          images: [
            { label: "Agent Sync", src: "./screenshots/sync-agent.png", alt: "Sync skills to AI agents" },
            {
              label: "Ref Prompt",
              src: "./screenshots/smart-prompt-reference.png",
              alt: "Smart reference prompt generator",
            },
          ],
        },
        {
          id: "cmdk-search",
          tag: "⌘K Global Search",
          title: "Search Local Libraries & Live GitHub in One Bar",
          desc: "Press Cmd/Ctrl + K to search local skills, prompts, curated packs, subscribed repos, and GitHub—add a zero-scope read-only PAT for 5,000 req/hr.",
          images: [
            { label: "Search", src: "./screenshots/github-search.png", alt: "Global search across local and GitHub" },
            { label: "PAT Token", src: "./screenshots/github-token.png", alt: "Minimal GitHub Token dialog" },
          ],
        },
      ],
    },
    promptsSection: {
      eyebrow: "Prompt Studio & Open Catalog",
      title: "Lossless Local Dual-View Editor Connected to 4 Open Ecosystems",
      subtitle:
        "Manage recurring templates locally with workflow groups and dual-view editing—and explore thousands of community prompts under Explore → Prompt Catalog whenever you need inspiration.",
      channels: [
        { name: "AiShort Curated", meta: "Bilingual EN/ZH · Usage notes" },
        { name: "prompts.chat", meta: "3,000+ prompts · Mirror fallback" },
        { name: "Fabric Patterns", meta: "266 system prompt workflows" },
        { name: "LangGPT Templates", meta: "Structured Markdown frameworks" },
      ],
      slides: [
        {
          id: "prompt-dual",
          label: "Formatted / Raw Dual View",
          title: "100% Line-Break & Indentation Fidelity",
          desc: "Switch seamlessly between rendered Markdown and raw plain-text views so complex structured system prompts never lose spacing or indentation.",
          image: "./screenshots/prompt-dual-view.png",
          alt: "Prompt formatted and raw dual view",
        },
        {
          id: "prompt-manage",
          label: "Groups & Multi-Format Export",
          title: "Organize by Workflow & Export as MD / JSON / TXT",
          desc: "Keep high-frequency prompts organized with custom groups, tag autocomplete, stars, and flexible batch export.",
          image: "./screenshots/prompts-list.png",
          alt: "Local prompt management",
        },
        {
          id: "prompt-catalog",
          label: "Open Prompt Catalog",
          title: "Search 4 Live Feeds & Save in One Click",
          desc: "Filter by category or uninstalled items, preview full text with chunked translation and {{variable}} detection, and save straight into your local prompt library.",
          image: "./screenshots/hub-prompts.png",
          alt: "Multi-source Prompt Catalog",
        },
      ],
    },
    discoverSection: {
      eyebrow: "Built-in Resource Hub",
      title: "Built-in Resource Hub: Read First, Extract Only What You Need",
      subtitle:
        "When you want to discover new skills, skip cloning massive monorepos just to grab one subfolder. Inspect SKILL.md, extract a single skill in milliseconds, and check updates in one place.",
      steps: [
        {
          id: "step-boards",
          step: "01",
          title: "6 Daily Live Leaderboards & Hot-Updated Collections",
          desc: "Track global install momentum and community buzz with instant category filters. Curated scenario packs support batch installing missing skills and 24-hour remote JSON hot-updates.",
          highlights: [
            "Every listed item is directly installable inside the app",
            "Subscribe to public or private GitHub & GitLab repositories",
            "Dual search engines: skills.sh global directory + GitHub",
          ],
          image: "./screenshots/hub-leaderboards.png",
          alt: "Skill Leaderboards view",
        },
        {
          id: "step-preview",
          step: "02",
          title: "Pre-Install SKILL.md Preview & File Manifest",
          desc: "Inspect the full SKILL.md, translate summaries, and check bundled files before installing. Extract just the selected sub-skill directory or install the entire skill package on demand.",
          highlights: [
            "Review complete agent instructions before touching disk",
            "Smart handling for sub-skill folders vs. standalone Git repos",
            "Unified update checks & management under Installed",
          ],
          image: "./screenshots/hub-skill-preview.png",
          alt: "Pre-install SKILL.md live preview",
        },
        {
          id: "step-git",
          step: "03",
          title: "Async Background Clones & Live Terminal Logs",
          desc: "Extractions and Git clones run asynchronously without blocking your workspace, with live progress bars and expandable console output.",
          highlights: [
            "Auto-cleans pasted git clone commands and web branch URLs",
            "Real-time progress cards with streaming Git logs",
            "One-click upstream update detection and pull",
          ],
          image: "./screenshots/clone-progress.png",
          alt: "Asynchronous background clone progress card",
        },
      ],
    },
    specsSection: {
      eyebrow: "Local-First & Native Architecture",
      title: "Native Lightweight Core. 100% Stored on Your Machine.",
      subtitle:
        "No sign-ups, no cloud lock-in. Browse and summon everything offline, and migrate across computers in a single ZIP archive.",
      items: [
        {
          title: "Tauri v2 + Rust Core",
          desc: "Compact ~15 MB installer powered by your OS native WebView—launches instantly and idles quietly in the menu bar with minimal RAM.",
        },
        {
          title: "Local SQLite & Safe ZIP Backups",
          desc: "All indexes, prompts, and preferences live in local SQLite. Export a full ZIP backup anytime with automatic pre-restore safety snapshots.",
        },
        {
          title: "Resilient Multi-Channel Sync",
          desc: "Built-in proxy → direct → mirror fallback keeps clones and updates reliable across network conditions, with optional silent launch-at-login.",
        },
        {
          title: "GPL-3.0 Open Source",
          desc: "Fully auditable frontend and Rust backend source code on GitHub, complete with structured changelogs and one-click in-app updates.",
        },
      ],
      backupCaption:
        "Streamlined Settings: One-click full ZIP export and restore with automatic local safety snapshots",
    },
    changelogSection: {
      eyebrow: "Changelog",
      title: "Release History",
      subtitle: "Automatically synced from the repository's CHANGELOG.md on every release.",
      latestBadge: "Latest",
      autoSyncHint: "Synced from CHANGELOG.md",
      viewOnGithub: "GitHub Releases",
      showAllPrefix: "Show ",
      showAllSuffix: " earlier releases",
      collapseHistory: "Hide earlier releases",
      zhNotice: "Release notes are synced directly from CHANGELOG.md (maintained in Chinese).",
    },
    downloadSection: {
      titlePrefix: "Download ",
      titleHighlight: "SkillHub",
      subtitle: "Free & open-source native installers for macOS, Windows, and Linux.",
      sourceLabel: "Mirror:",
      sourceGithub: "GitHub Official",
      sourceMirror: "CN Fast Mirror",
      mirrorHint: "Using gh-proxy accelerated mirror for faster downloads in Mainland China.",
      currentReleaseLabel: "Latest Published Installer",
      platforms: {
        macDesc: "Universal Binary (Apple Silicon & Intel)",
        macFormat: "Download .dmg",
        winDesc: "Windows 10 / 11 (64-bit)",
        winFormat: "Download .exe Setup",
        linuxDesc: "Ubuntu / Debian / Linux (x64)",
        linuxFormat: "Download .AppImage",
      },
      allReleasesLink: "View .msi, .deb, and all historical builds on GitHub Releases →",
    },
    communityModal: {
      title: "Join the SkillHub Community",
      subtitle: "Questions, feature requests, or workflow tips—connect with us directly",
      qqTitle: "QQ Group",
      qqSub: "Group ID: 1049282993",
      wechatTitle: "WeChat Official Account",
      wechatSub: "Scan QR code for release updates",
      close: "Close",
    },
    footer: {
      tagline: "A cross-platform desktop manager to organize, preview, and sync AI skills & prompts.",
      creditsTitle: "Open Ecosystem Credits",
      linksTitle: "Project & Links",
      donate: "Buy Me a Coffee",
      issues: "Report an Issue",
      releases: "All Releases",
      copyright: "Open-sourced under GPL-3.0.",
    },
  },
};
