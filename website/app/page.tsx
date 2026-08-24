"use client";

import { motion, AnimatePresence } from "framer-motion";
import { 
  Download, Zap, Shield, RefreshCw, Layers, ArrowRight, Monitor, Apple, Terminal,
  Cpu, FileText, Search, Sparkles, BookOpen, Edit3, FolderDown, CheckCircle2
} from "lucide-react";
import { useState, useEffect, useRef, useSyncExternalStore } from "react";

const SHOWCASE_TABS = [
  {
    id: "skills-list",
    title: "技能管理",
    icon: Cpu,
    tag: "核心功能",
    desc: "直观的可视化卡片与列表视图，支持多选批量管理、启用/禁用、标签分类与快速过滤。",
    image: "./screenshots/skills-list.png",
  },
  {
    id: "skill-detail",
    title: "技能详情",
    icon: BookOpen,
    tag: "完整解析",
    desc: "清晰展现技能的说明、输入输出结构、版本历史与底层配置，一览无余。",
    image: "./screenshots/skill-detail.png",
  },
  {
    id: "smart-prompt",
    title: "智能引用",
    icon: Sparkles,
    tag: "AI 联动",
    desc: "支持在编写 Agent 技能时随时智能引用现有的 Prompt 库，模块化组装复杂的 AI 任务。",
    image: "./screenshots/smart-prompt-reference.png",
  },
  {
    id: "prompts-list",
    title: "提示词库",
    icon: FileText,
    tag: "高效复用",
    desc: "集中存储与分类高频 Prompt 模板，毫秒级复制与调用，彻底告别零散记录。",
    image: "./screenshots/prompts-list.png",
  },
  {
    id: "prompt-edit",
    title: "提示词编辑",
    icon: Edit3,
    tag: "沉浸创作",
    desc: "专为提示词工程打造的编辑器，支持动态变量插入、Markdown 语法与实时预览。",
    image: "./screenshots/prompt-edit.png",
  },
  {
    id: "global-search",
    title: "全局秒搜",
    icon: Search,
    tag: "快捷调度",
    desc: "支持全局快捷键唤醒，秒级模糊检索所有技能、提示词与命令，指尖即达。",
    image: "./screenshots/global-search.png",
  },
  {
    id: "import-skill",
    title: "导入与更新",
    icon: FolderDown,
    tag: "生态互通",
    desc: "支持本地文件夹拖拽导入、GitHub 仓库一键挂载与自动版本更新检测。",
    image: "./screenshots/import-skill.png",
  },
];

function ProductShowcase() {
  const showcaseRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState(0);
  const current = SHOWCASE_TABS[activeTab];

  // 提前预加载所有截图，消除切图时的解码延迟与闪烁
  useEffect(() => {
    SHOWCASE_TABS.forEach((tab) => {
      const img = new window.Image();
      img.src = tab.image;
    });
  }, []);

  const handleTabChange = (newIdx: number) => {
    setActiveTab(newIdx);
    // 丝滑滚动到展示区域，预留舒适的顶部间距
    if (showcaseRef.current) {
      const topOffset = 112; // 导航栏高度 64px + 48px 呼吸间距
      const elementPosition = showcaseRef.current.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - topOffset;
      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
      });
    }
  };

  return (
    <div ref={showcaseRef} id="showcase" className="flex flex-col items-center w-full max-w-5xl md:max-w-[1060px] mx-auto scroll-mt-28">
      {/* Tab Switcher Pills - Apple/Linear Segmented Style (Single Row) */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 p-1.5 bg-slate-100/90 backdrop-blur-2xl border border-slate-200/80 rounded-2xl shadow-inner mb-6 max-w-full z-20">
        {SHOWCASE_TABS.map((tab, idx) => {
          const Icon = tab.icon;
          const isActive = idx === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(idx)}
              className={`relative flex items-center gap-2 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-colors duration-200 cursor-pointer ${
                isActive
                  ? "text-gray-900 font-semibold"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="activeShowcaseTab"
                  className="absolute inset-0 bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] border border-slate-200/60 -z-10"
                  transition={{ type: "spring", stiffness: 450, damping: 35 }}
                />
              )}
              <Icon className={`w-4 h-4 transition-colors ${isActive ? "text-[#0055FF]" : "text-gray-400"}`} />
              <span>{tab.title}</span>
            </button>
          );
        })}
      </div>

      {/* Showcase Stage Backdrop Container */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="w-full rounded-2xl md:rounded-[2rem] bg-gradient-to-b from-white via-slate-50/80 to-slate-100/80 border border-slate-200/80 shadow-2xl backdrop-blur-xl relative flex flex-col group overflow-hidden"
      >
        {/* Soft, Balanced Stage Ambient Glow & Grid Background */}
        <div className="absolute inset-0 bg-gradient-to-tr from-[#0055FF]/10 via-[#00E5FF]/08 to-purple-500/06 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-25 pointer-events-none" />

        {/* Dynamic Height Crossfade Image Area - Guaranteed to fit on 1 screen */}
        <div className="relative z-10 w-full p-4 sm:p-6 md:p-8 pb-4 sm:pb-6 flex items-center justify-center min-h-[300px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 15, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -15, scale: 0.98 }}
              transition={{ duration: 0.35, ease: "easeInOut" }}
              className="w-full flex justify-center items-center"
            >
              {/* Backlight Glow exactly behind the active image */}
              <div className="absolute inset-x-12 inset-y-8 bg-gradient-to-r from-[#0055FF]/15 via-[#00E5FF]/12 to-purple-500/10 blur-2xl -z-10 rounded-3xl pointer-events-none" />
              
              <img
                src={current.image}
                alt={current.title}
                /* 高度限制让整卡片单屏内完整显示，w-auto 等比缩放自然留出两侧空余 */
                className="h-auto max-h-[58vh] w-auto mx-auto block rounded-xl sm:rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.10)]"
                loading="eager"
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom Full-Width Docked Caption Bar */}
        <div className="relative z-10 w-full border-t border-slate-200/80 bg-white/95 backdrop-blur-xl px-5 sm:px-8 py-3.5 sm:py-4 flex items-center justify-between gap-3 mt-auto">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#0055FF] text-white shadow-sm shadow-[#0055FF]/20 shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm sm:text-base font-bold text-gray-900">{current.title}</h4>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#0055FF]/10 text-[#0055FF]">
                  {current.tag}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 mt-0.5">{current.desc}</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.2c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

type OsType = "mac" | "win" | "linux" | "default";

const VERSION = "0.1.0";
const BASE_DOWNLOAD_URL = `https://github.com/VipBeCool/SkillHub/releases/download/v${VERSION}`;

const OS_INFO: Record<OsType, { name: string; icon: React.ComponentType<{ className?: string }>; url: string }> = {
  mac: {
    name: "下载 macOS 版",
    icon: Apple,
    url: `${BASE_DOWNLOAD_URL}/SkillHub_${VERSION}_universal.dmg`,
  },
  win: {
    name: "下载 Windows 版",
    icon: Monitor,
    url: `${BASE_DOWNLOAD_URL}/SkillHub_${VERSION}_x64-setup.exe`,
  },
  linux: {
    name: "下载 Linux 版",
    icon: Terminal,
    url: `${BASE_DOWNLOAD_URL}/SkillHub_${VERSION}_amd64.AppImage`,
  },
  default: {
    name: "立即下载",
    icon: Download,
    url: "https://github.com/VipBeCool/SkillHub/releases/latest",
  },
};

function getOsType(): OsType {
  if (typeof window === "undefined") return "default";
  const platform = window.navigator.userAgent.toLowerCase();
  if (platform.includes("mac")) return "mac";
  if (platform.includes("win")) return "win";
  if (platform.includes("linux")) return "linux";
  return "default";
}

const emptySubscribe = () => () => {};

export default function Home() {
  const osType: OsType = useSyncExternalStore<OsType>(
    emptySubscribe,
    getOsType,
    () => "default"
  );

  const activeOs = OS_INFO[osType];
  const OsIcon = activeOs.icon;

  return (
    <div className="min-h-screen flex flex-col selection:bg-[#00E5FF]/30 overflow-x-hidden">
      {/* Dynamic Background Decorators */}
      <div className="fixed top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-[#00E5FF]/10 blur-[120px] -z-10 animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="fixed top-[20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-[#0055FF]/10 blur-[150px] -z-10 animate-pulse" style={{ animationDuration: '12s' }} />
      <div className="fixed bottom-[-10%] left-[20%] w-[400px] h-[400px] rounded-full bg-purple-400/10 blur-[100px] -z-10 animate-pulse" style={{ animationDuration: '10s' }} />
      
      {/* Grid Pattern Overlay */}
      <div className="fixed inset-0 bg-[url('./grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] -z-20 opacity-20 pointer-events-none" />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="./icon.png" alt="SkillHub Logo" className="w-8 h-8 drop-shadow-md rounded-xl" />
            <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-gray-800 to-gray-600">SkillHub</span>
          </div>
          <nav className="flex gap-3 sm:gap-4 items-center">
            <a
              href="#downloads"
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-[#0055FF] to-[#0077FF] hover:shadow-md hover:shadow-[#0055FF]/25 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>免费下载</span>
            </a>
            <a href="https://github.com/VipBeCool/SkillHub" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-gray-900 transition-colors flex items-center gap-2 font-medium bg-gray-100 hover:bg-gray-200/80 px-3 py-1.5 rounded-full text-xs sm:text-sm border border-gray-200/60 shadow-sm">
              <GithubIcon className="w-4 h-4" />
              <span>Star on GitHub</span>
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-grow pt-28 pb-20">
        {/* Hero Section - Compact & Elevated with Comfortable Breathing Room */}
        <section className="max-w-7xl mx-auto px-6 pt-6 sm:pt-10 pb-12 sm:pb-16 md:pb-20 flex flex-col items-center text-center">
          <motion.a
            href="https://github.com/VipBeCool/SkillHub/releases/tag/v0.1.0"
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 sm:py-2 rounded-full bg-white border border-gray-200 text-gray-600 font-medium text-xs sm:text-sm mb-6 sm:mb-8 shadow-sm hover:shadow-md hover:border-[#FF5500]/30 transition-all cursor-pointer"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#FF5500]"></span>
            </span>
            <span className="text-[#FF5500] font-bold">SkillHub v0.1.0</span> is now available
          </motion.a>

          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight mb-5 sm:mb-6 max-w-4xl leading-[1.12]"
          >
            你的极速本地 <br />
            <span className="text-gradient">AI 技能与 Prompt 引擎</span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-base sm:text-xl text-gray-500 mb-8 sm:mb-10 max-w-2xl leading-relaxed"
          >
            基于 Tauri & Rust 打造的跨平台 AI 工作站。零配置，纯本地，毫秒级响应，轻松管理所有 Agent 技能与提示词库。
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 sm:gap-5 items-center"
          >
            <a 
              href={activeOs.url}
              className="px-7 py-3.5 sm:px-8 sm:py-4 rounded-2xl bg-gradient-to-r from-[#0055FF] to-[#0077FF] text-white font-bold text-base sm:text-lg flex items-center justify-center gap-3 btn-glow w-full sm:w-auto"
            >
              <OsIcon className="w-5 h-5" />
              {activeOs.name}
            </a>
            <a 
              href="#downloads" 
              className="px-7 py-3.5 sm:px-8 sm:py-4 rounded-2xl bg-white border border-gray-200 text-gray-700 font-bold text-base sm:text-lg flex items-center justify-center gap-2 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm w-full sm:w-auto group"
            >
              其他平台
              <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-gray-700 group-hover:translate-x-1 transition-all" />
            </a>
          </motion.div>
        </section>

        {/* Product Mockup & Interactive Showcase */}
        <section className="max-w-6xl mx-auto px-6 pt-4 sm:pt-8 pb-16">
          <ProductShowcase />
        </section>

        {/* Features Bento Box */}
        <section className="max-w-7xl mx-auto px-6 py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-6 tracking-tight text-gray-900">不仅是管理，更是<span className="text-[#0055FF]">效率革命</span></h2>
            <p className="text-gray-500 text-xl max-w-2xl mx-auto">采用 Tauri 现代架构，我们剔除了所有多余的设计，只为你保留最硬核的性能与最纯粹的体验。</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 glass p-10 rounded-3xl hover:shadow-xl transition-all duration-300 border border-gray-200/60 bg-white/60">
              <div className="w-14 h-14 rounded-2xl bg-[#00E5FF]/10 text-[#00E5FF] flex items-center justify-center mb-6 border border-[#00E5FF]/20">
                <Zap className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold mb-4 text-gray-900">极速轻量，毫秒级启动</h3>
              <p className="text-gray-600 text-lg leading-relaxed max-w-xl">彻底告别臃肿的 Electron 框架。SkillHub 基于 Tauri & Rust 重构底层，内存占用极低（仅需不到 50MB），无论是在老旧设备还是最新 Mac 上，都能实现瞬间冷启动，永远不拖慢你的系统。</p>
            </div>
            
            <div className="glass p-10 rounded-3xl hover:shadow-xl transition-all duration-300 border border-gray-200/60 bg-white/60">
              <div className="w-14 h-14 rounded-2xl bg-[#0055FF]/10 text-[#0055FF] flex items-center justify-center mb-6 border border-[#0055FF]/20">
                <Shield className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold mb-4 text-gray-900">本地优先，绝对安全</h3>
              <p className="text-gray-600 text-lg leading-relaxed">所有的配置、Prompt 与核心技能数据均使用 SQLite 加密存储在你的本地硬盘中。0 云端上传，保障你的商业机密与隐私。</p>
            </div>

            <div className="glass p-10 rounded-3xl hover:shadow-xl transition-all duration-300 border border-gray-200/60 bg-white/60">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mb-6 border border-indigo-500/20">
                <RefreshCw className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold mb-4 text-gray-900">多端同步，一键更新</h3>
              <p className="text-gray-600 text-lg leading-relaxed">支持同时挂载多个本地文件夹与远程 GitHub 仓库，一键检测更新，统一管理所有 AI 技能包，永不掉队。</p>
            </div>

            <div className="md:col-span-2 glass p-10 rounded-3xl hover:shadow-xl transition-all duration-300 border border-gray-200/60 bg-white/60">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-6 border border-emerald-500/20">
                <Layers className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold mb-4 text-gray-900">可视化沉浸式管理</h3>
              <p className="text-gray-600 text-lg leading-relaxed max-w-xl">提供可视化的技能浏览、标签分类、全局快捷搜索以及批量导出功能。不仅是一个存放代码的工具，更是你专属的 AI 技能军火库。</p>
            </div>
          </div>
        </section>

        {/* Downloads Section */}
        <section id="downloads" className="max-w-7xl mx-auto px-6 py-32">
          <div className="relative rounded-[2.5rem] p-10 md:p-20 text-center overflow-hidden border border-[#0055FF]/15 bg-white/60 shadow-[0_20px_60px_-15px_rgba(0,85,255,0.1)] backdrop-blur-xl">
            {/* Ambient Background Glow inside the CTA */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-[#0055FF]/15 via-[#00E5FF]/5 to-transparent blur-3xl pointer-events-none -z-10 rounded-full" />
            
            <h2 className="text-3xl md:text-5xl font-bold mb-6 text-gray-900 tracking-tight relative z-10">
              准备好提升<span className="text-[#0055FF]">效率</span>了吗？
            </h2>
            <p className="text-gray-500 text-lg md:text-xl mb-14 max-w-2xl mx-auto relative z-10">
              SkillHub 完全开源免费，提供全平台原生安装包。<br className="hidden md:block"/>选择你的操作系统立即开始体验。
            </p>
            
            <div className="grid md:grid-cols-3 gap-6 relative z-10 max-w-5xl mx-auto">
              <a href={`${BASE_DOWNLOAD_URL}/SkillHub_${VERSION}_universal.dmg`} className="group flex flex-col items-center p-8 rounded-3xl bg-white/80 hover:bg-white border border-gray-200/80 hover:border-[#0055FF]/30 hover:shadow-2xl hover:shadow-[#0055FF]/10 transition-all duration-300 transform hover:-translate-y-1">
                <div className="w-16 h-16 rounded-2xl bg-gray-50 group-hover:bg-[#0055FF]/5 flex items-center justify-center mb-5 transition-colors border border-gray-100 group-hover:border-[#0055FF]/10">
                  <Apple className="w-8 h-8 text-gray-700 group-hover:text-[#0055FF] transition-colors" />
                </div>
                <span className="text-gray-900 font-bold text-lg mb-1 group-hover:text-[#0055FF] transition-colors">macOS</span>
                <span className="text-gray-500 text-sm">Universal (Intel & Apple Silicon)</span>
              </a>
              <a href={`${BASE_DOWNLOAD_URL}/SkillHub_${VERSION}_x64-setup.exe`} className="group flex flex-col items-center p-8 rounded-3xl bg-white/80 hover:bg-white border border-gray-200/80 hover:border-[#0055FF]/30 hover:shadow-2xl hover:shadow-[#0055FF]/10 transition-all duration-300 transform hover:-translate-y-1">
                <div className="w-16 h-16 rounded-2xl bg-gray-50 group-hover:bg-[#0055FF]/5 flex items-center justify-center mb-5 transition-colors border border-gray-100 group-hover:border-[#0055FF]/10">
                  <Monitor className="w-8 h-8 text-gray-700 group-hover:text-[#0055FF] transition-colors" />
                </div>
                <span className="text-gray-900 font-bold text-lg mb-1 group-hover:text-[#0055FF] transition-colors">Windows</span>
                <span className="text-gray-500 text-sm">Windows 10 / 11 (x64)</span>
              </a>
              <a href={`${BASE_DOWNLOAD_URL}/SkillHub_${VERSION}_amd64.AppImage`} className="group flex flex-col items-center p-8 rounded-3xl bg-white/80 hover:bg-white border border-gray-200/80 hover:border-[#0055FF]/30 hover:shadow-2xl hover:shadow-[#0055FF]/10 transition-all duration-300 transform hover:-translate-y-1">
                <div className="w-16 h-16 rounded-2xl bg-gray-50 group-hover:bg-[#0055FF]/5 flex items-center justify-center mb-5 transition-colors border border-gray-100 group-hover:border-[#0055FF]/10">
                  <Terminal className="w-8 h-8 text-gray-700 group-hover:text-[#0055FF] transition-colors" />
                </div>
                <span className="text-gray-900 font-bold text-lg mb-1 group-hover:text-[#0055FF] transition-colors">Linux</span>
                <span className="text-gray-500 text-sm">AppImage / DEB / RPM</span>
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200/60 bg-white/80 backdrop-blur-md pt-12 pb-12 mt-auto">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <img src="./icon.png" alt="SkillHub Logo" className="w-6 h-6" />
            <span className="font-semibold text-gray-700">SkillHub</span>
          </div>
          <p className="text-gray-400 text-sm">
            © {new Date().getFullYear()} VipBeCool. Open Source under GPL-3.0 License.
          </p>
          <div className="flex gap-4">
            <a href="https://github.com/VipBeCool/SkillHub" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-600 transition-colors">
              <GithubIcon className="w-5 h-5" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
