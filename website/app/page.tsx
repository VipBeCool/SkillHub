"use client";

import { motion, AnimatePresence } from "framer-motion";
import { 
  Download, Zap, Shield, RefreshCw, Layers, ArrowRight, Monitor, Apple, Terminal,
  Cpu, FileText, Search, Sparkles, BookOpen, Edit3, FolderDown, CheckCircle2,
  Eye, Compass, Database, Bot, LayoutGrid, Globe, MousePointerClick, CloudOff,
  Check, MoveRight, ExternalLink
} from "lucide-react";
import { useState, useEffect, useRef, useSyncExternalStore } from "react";

// 顶部高光交互展示：精选 7 个核心高频主功能
const SHOWCASE_TABS = [
  {
    id: "tabs-overview",
    title: "多标签页",
    icon: Layers,
    tag: "多任务并行",
    desc: "像浏览器一样支持顶部多标签页，技能、提示词与多库对照查阅不打架。",
    image: "./screenshots/tabs-overview.png",
  },
  {
    id: "category-management",
    title: "技能分类管理",
    icon: LayoutGrid,
    tag: "井然有序",
    desc: "支持按仓库分类浏览与快速筛选标签，上百技能井井有条，一目了然。",
    image: "./screenshots/category-management.png",
  },
  {
    id: "prompts-list",
    title: "提示词管理",
    icon: FileText,
    tag: "常用灵感",
    desc: "高频业务提示词分组与彩色标签收纳，随时查阅、一键复制调用。",
    image: "./screenshots/prompts-list.png",
  },
  {
    id: "quick-look",
    title: "空格速览",
    icon: Eye,
    tag: "按空格即看",
    desc: "轻按空格键秒开浮层速览 Markdown 内容，看完随手关闭，告别来回进出详情页。",
    image: "./screenshots/quick-look.png",
  },
  {
    id: "smart-prompt",
    title: "智能引用",
    icon: Sparkles,
    tag: "规范调用",
    desc: "自动提取技能目录树与执行规范生成 Cheatsheet 引用词，直接粘贴给 AI 对话框执行。",
    image: "./screenshots/smart-prompt-reference.png",
  },
  {
    id: "sync-agent",
    title: "Agent 同步",
    icon: Bot,
    tag: "即插即用",
    desc: "一键将技能同步安装到你常用的 AI 工具中，卡片状态一目了然，调用自如。",
    image: "./screenshots/sync-agent.png",
  },
  {
    id: "global-search",
    title: "全局秒搜",
    icon: Search,
    tag: "Cmd/Ctrl+K",
    desc: "随时按下快捷键唤起全局搜索，多字段模糊检索所有技能与提示词，即选即览。",
    image: "./screenshots/global-search.png",
  },
];

// 全站所有截图清单（用于提前预加载，消除切换及滚动加载延迟）
const ALL_SCREENSHOTS = [
  "./screenshots/tabs-overview.png",
  "./screenshots/category-management.png",
  "./screenshots/prompts-list.png",
  "./screenshots/quick-look.png",
  "./screenshots/smart-prompt-reference.png",
  "./screenshots/sync-agent.png",
  "./screenshots/global-search.png",
  "./screenshots/clone-progress.png",
  "./screenshots/import-skill.png",
  "./screenshots/drag-drop.png",
  "./screenshots/update-skill.png",
  "./screenshots/doc-outline.png",
  "./screenshots/translate.png",
  "./screenshots/translate-detail.png",
  "./screenshots/prompt-edit.png",
  "./screenshots/multi-select.png",
  "./screenshots/backup-restore.png",
  "./screenshots/skill-detail.png",
];

function ProductShowcase() {
  const showcaseRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState(0);
  const current = SHOWCASE_TABS[activeTab];

  // 预加载所有展示截图
  useEffect(() => {
    ALL_SCREENSHOTS.forEach((src) => {
      const img = new window.Image();
      img.src = src;
    });
  }, []);

  const handleTabChange = (newIdx: number) => {
    setActiveTab(newIdx);
    if (showcaseRef.current) {
      const topOffset = 112;
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
      {/* 核心主技能单行胶囊切换栏 */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 p-1.5 bg-slate-100/90 backdrop-blur-2xl border border-slate-200/80 rounded-2xl shadow-inner mb-6 max-w-full z-20">
        {SHOWCASE_TABS.map((tab, idx) => {
          const Icon = tab.icon;
          const isActive = idx === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(idx)}
              className={`relative flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors duration-200 cursor-pointer ${
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
              <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-colors ${isActive ? "text-[#0055FF]" : "text-gray-400"}`} />
              <span>{tab.title}</span>
            </button>
          );
        })}
      </div>

      {/* 主展示画板 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="w-full rounded-2xl md:rounded-[2rem] bg-gradient-to-b from-white via-slate-50/80 to-slate-100/80 border border-slate-200/80 shadow-2xl backdrop-blur-xl relative flex flex-col group overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-[#0055FF]/10 via-[#00E5FF]/08 to-purple-500/06 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-25 pointer-events-none" />

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
              <div className="absolute inset-x-12 inset-y-8 bg-gradient-to-r from-[#0055FF]/15 via-[#00E5FF]/12 to-purple-500/10 blur-2xl -z-10 rounded-3xl pointer-events-none" />
              
              <img
                src={current.image}
                alt={current.title}
                className="h-auto max-h-[58vh] w-auto mx-auto block rounded-xl sm:rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.10)]"
                loading="eager"
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 底部功能说明条 */}
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

const FALLBACK_VERSION = "0.2.7";

const OS_INFO: Record<OsType, { name: string; icon: React.ComponentType<{ className?: string }>; getUrl: (v: string) => string }> = {
  mac: {
    name: "下载 macOS 版",
    icon: Apple,
    getUrl: (v) => `https://github.com/VipBeCool/SkillHub/releases/download/v${v}/SkillHub_${v}_universal.dmg`,
  },
  win: {
    name: "下载 Windows 版",
    icon: Monitor,
    getUrl: (v) => `https://github.com/VipBeCool/SkillHub/releases/download/v${v}/SkillHub_${v}_x64-setup.exe`,
  },
  linux: {
    name: "下载 Linux 版",
    icon: Terminal,
    getUrl: (v) => `https://github.com/VipBeCool/SkillHub/releases/download/v${v}/SkillHub_${v}_amd64.AppImage`,
  },
  default: {
    name: "立即下载",
    icon: Download,
    getUrl: () => "https://github.com/VipBeCool/SkillHub/releases/latest",
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
  
  const [latestVersion, setLatestVersion] = useState(FALLBACK_VERSION);

  useEffect(() => {
    fetch("https://api.github.com/repos/VipBeCool/SkillHub/releases/latest")
      .then(res => res.json())
      .then(data => {
        if (data && data.tag_name) {
          setLatestVersion(data.tag_name.replace(/^v/, ""));
        }
      })
      .catch(err => console.error("获取最新版本失败:", err));
  }, []);

  const activeOs = OS_INFO[osType];
  const OsIcon = activeOs.icon;

  return (
    <div className="min-h-screen flex flex-col selection:bg-[#00E5FF]/30 overflow-x-hidden">
      {/* 动态渐变背景微光 */}
      <div className="fixed top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-[#00E5FF]/10 blur-[120px] -z-10 animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="fixed top-[20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-[#0055FF]/10 blur-[150px] -z-10 animate-pulse" style={{ animationDuration: '12s' }} />
      <div className="fixed bottom-[-10%] left-[20%] w-[400px] h-[400px] rounded-full bg-purple-400/10 blur-[100px] -z-10 animate-pulse" style={{ animationDuration: '10s' }} />
      
      {/* 网格纹理 */}
      <div 
        className="fixed inset-0 bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] -z-20 opacity-20 pointer-events-none" 
        style={{ backgroundImage: "url('./grid.svg')" }}
      />

      {/* 顶部导航栏 */}
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
        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-6 pt-6 sm:pt-10 pb-12 sm:pb-16 md:pb-20 flex flex-col items-center text-center">
          <motion.a
            href={`https://github.com/VipBeCool/SkillHub/releases/tag/v${latestVersion}`}
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
            <span className="text-[#FF5500] font-bold">SkillHub v{latestVersion}</span> 已正式发布
          </motion.a>

          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight mb-5 sm:mb-6 max-w-4xl leading-[1.12]"
          >
            你的跨平台必备 <br />
            <span className="text-gradient">AI Skills 搜集与管理工具</span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-base sm:text-xl text-gray-500 mb-8 sm:mb-10 max-w-2xl leading-relaxed"
          >
            不管是用 AI 做 PPT、写文案、分析表格，还是打理专属 Agent 智能体。把散落各处的技能包与高频提示词归纳在一个清爽工作台里，即拿即用，井井有条。
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 sm:gap-5 items-center"
          >
            <a 
              href={activeOs.getUrl(latestVersion)}
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

        {/* 顶部 Showcase 核心主技能交互区 */}
        <section className="max-w-6xl mx-auto px-6 pt-4 sm:pt-6 pb-20">
          <ProductShowcase />
        </section>

        {/* ================================================================ */}
        {/* Apple 风格楼层 1：全源搜集与后台管理 */}
        {/* ================================================================ */}
        <section className="max-w-7xl mx-auto px-6 py-24 border-t border-slate-200/60">
          <div className="flex flex-col items-center text-center mb-16">
            <span className="text-xs font-bold tracking-widest text-[#0055FF] uppercase bg-[#0055FF]/10 px-3 py-1 rounded-full mb-4">
              Ingestion & Background Tasks
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-gray-900 tracking-tight mb-4 max-w-3xl">
              全源收录技能，后台静默拉取
            </h2>
            <p className="text-gray-500 text-base sm:text-lg max-w-2xl leading-relaxed">
              支持直接粘贴 GitHub 仓库链接、导入本地目录或直接拖拽文件。后台安静下载绝不卡死界面，有新版本一键同步。
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* 左侧功能叙事与特性卡片 */}
            <div className="lg:col-span-5 flex flex-col gap-5">
              <div className="p-6 rounded-3xl bg-white/80 border border-slate-200/80 shadow-sm hover:shadow-md transition-all">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0055FF] flex items-center justify-center mb-3">
                  <FolderDown className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-1.5">直接拖拽，告别复杂命令</h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  把电脑里的技能文件夹或 zip 包直接拖入窗口，秒级完成导入。支持直接粘贴 GitHub 链接，自动解析 YAML 规范。
                </p>
              </div>

              <div className="p-6 rounded-3xl bg-white/80 border border-slate-200/80 shadow-sm hover:shadow-md transition-all">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-1.5">后台异步拉取，状态实时可感知</h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  拉取线上大仓库时无需原地等待。主界面顶部动态展示拉取进度卡片，下载中可随意切换页面，随时点击取消并彻底清理本地残留。
                </p>
              </div>

              <div className="p-6 rounded-3xl bg-white/80 border border-slate-200/80 shadow-sm hover:shadow-md transition-all">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-1.5">上游更新，一键无感同步</h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  关注的开源技能包有了新提交？卡片右上角直观提示更新，点击同步按钮即刻拉取最新版本，免去反复重新配置。
                </p>
              </div>
            </div>

            {/* 右侧大图展示：后台拉取与导入 */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              <div className="relative rounded-3xl overflow-hidden bg-gradient-to-b from-white to-slate-100/90 border border-slate-200/80 shadow-xl p-4 sm:p-6 group">
                <div className="absolute top-4 left-6 flex items-center gap-2 z-10">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-semibold text-gray-700">实时后台任务感知卡片</span>
                </div>
                <img
                  src="./screenshots/clone-progress.png"
                  alt="后台拉取进度展示"
                  className="w-full h-auto rounded-2xl shadow-md mt-6 group-hover:scale-[1.01] transition-transform duration-300"
                  loading="lazy"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white border border-slate-200/70 shadow-sm">
                  <span className="text-xs font-bold text-gray-500 block mb-2">多源导入弹窗</span>
                  <img src="./screenshots/import-skill.png" alt="导入技能" className="w-full h-auto rounded-xl shadow-xs" loading="lazy" />
                </div>
                <div className="p-4 rounded-2xl bg-white border border-slate-200/70 shadow-sm">
                  <span className="text-xs font-bold text-gray-500 block mb-2">一键同步检测</span>
                  <img src="./screenshots/update-skill.png" alt="更新技能" className="w-full h-auto rounded-xl shadow-xs" loading="lazy" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* Apple 风格楼层 2：沉浸阅读与极速双轨翻译 */}
        {/* ================================================================ */}
        <section className="max-w-7xl mx-auto px-6 py-24 border-t border-slate-200/60 bg-gradient-to-b from-transparent via-slate-100/40 to-transparent">
          <div className="flex flex-col items-center text-center mb-16">
            <span className="text-xs font-bold tracking-widest text-[#0055FF] uppercase bg-[#0055FF]/10 px-3 py-1 rounded-full mb-4">
              Reading & Translation
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-gray-900 tracking-tight mb-4 max-w-3xl">
              长篇规范轻松读，外文技能无障碍
            </h2>
            <p className="text-gray-500 text-base sm:text-lg max-w-2xl leading-relaxed">
              针对上百章节的复杂规则，大纲目录帮你秒定章节；面对纯外文的优秀开源技能包，双轨自愈引擎一键完成双语对照。
            </p>
          </div>

          {/* Part 1: 大纲目录导航展示 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center mb-16">
            <div className="lg:col-span-7 rounded-3xl overflow-hidden bg-white border border-slate-200/80 shadow-xl p-4 sm:p-6 group">
              <img
                src="./screenshots/doc-outline.png"
                alt="大纲目录导航"
                className="w-full h-auto rounded-2xl shadow-sm group-hover:scale-[1.01] transition-transform duration-300"
                loading="lazy"
              />
            </div>
            <div className="lg:col-span-5 flex flex-col justify-center">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mb-5">
                <Compass className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">智能悬浮大纲，长文通读不迷路</h3>
              <p className="text-gray-600 text-base leading-relaxed mb-4">
                很多高质量的 AI Skill 包含长达数千行的规范指南与指令参数。SkillHub 自动提取多级标题生成悬浮大纲目录（TOC）。
              </p>
              <ul className="flex flex-col gap-2.5 text-sm text-gray-700">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>随页面滚动实时定位高亮当前章节</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>智能动态间距分层，章节再多也不拥挤</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>正文底部弹性留白，末尾段落也能滑入黄金视区</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Part 2: 双轨翻译引擎展示 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-5 flex flex-col justify-center order-2 lg:order-1">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#0055FF] flex items-center justify-center mb-5">
                <Globe className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">双轨自愈翻译，国内秒级直连</h3>
              <p className="text-gray-600 text-base leading-relaxed mb-4">
                想借鉴 GitHub 上的英文神级技能包，却被复杂的专业术语劝退？SkillHub 内置 Google ➔ 腾讯 Transmart 双轨极速引擎。
              </p>
              <ul className="flex flex-col gap-2.5 text-sm text-gray-700">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#0055FF] shrink-0" />
                  <span>国内免代理极速响应，译文自然地道说人话</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#0055FF] shrink-0" />
                  <span>原文与双语一键切换，中英互照理解更透彻</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#0055FF] shrink-0" />
                  <span>智能探活与自愈机制，告别死等加载转圈</span>
                </li>
              </ul>
            </div>
            <div className="lg:col-span-7 rounded-3xl overflow-hidden bg-white border border-slate-200/80 shadow-xl p-4 sm:p-6 group order-1 lg:order-2">
              <img
                src="./screenshots/translate.png"
                alt="双轨自愈翻译"
                className="w-full h-auto rounded-2xl shadow-sm group-hover:scale-[1.01] transition-transform duration-300"
                loading="lazy"
              />
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* Apple 风格楼层 3：提示词自适应创作与智能引用 */}
        {/* ================================================================ */}
        <section className="max-w-7xl mx-auto px-6 py-24 border-t border-slate-200/60">
          <div className="flex flex-col items-center text-center mb-16">
            <span className="text-xs font-bold tracking-widest text-[#0055FF] uppercase bg-[#0055FF]/10 px-3 py-1 rounded-full mb-4">
              Prompt Crafting & Cheatsheet
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-gray-900 tracking-tight mb-4 max-w-3xl">
              自适应排版编辑，常用 Prompt 随叫随到
            </h2>
            <p className="text-gray-500 text-base sm:text-lg max-w-2xl leading-relaxed">
              告别在便签纸和聊天记录里反复翻找。提供舒服的原生写作排版，还能一键生成结构化规则精准喂给 AI。
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* 卡片 1：自适应编辑 */}
            <div className="flex flex-col rounded-3xl bg-white border border-slate-200/80 shadow-lg p-6 sm:p-8 overflow-hidden group">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                  沉浸编写
                </span>
                <span className="text-xs text-gray-400 font-mono">自适应文本框</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">随内容自适应，标签智能推荐</h3>
              <p className="text-gray-600 text-sm leading-relaxed mb-6">
                移除繁琐的内框嵌套与固定滚动条，编辑器随内容自适应撑高。键入标签时支持模糊联想推荐已有标签，让高频 Prompt 分门别类。
              </p>
              <div className="mt-auto rounded-2xl overflow-hidden border border-slate-100 shadow-inner bg-slate-50 p-2">
                <img
                  src="./screenshots/prompt-edit.png"
                  alt="提示词沉浸式编辑"
                  className="w-full h-auto rounded-xl shadow-xs group-hover:scale-[1.01] transition-transform duration-300"
                  loading="lazy"
                />
              </div>
            </div>

            {/* 卡片 2：智能引用 */}
            <div className="flex flex-col rounded-3xl bg-white border border-slate-200/80 shadow-lg p-6 sm:p-8 overflow-hidden group">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-purple-600 bg-purple-50 px-3 py-1 rounded-full">
                  智能引用 Cheatsheet
                </span>
                <span className="text-xs text-gray-400 font-mono">一键结构化调用</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">提取技能规范，精准喂给 AI</h3>
              <p className="text-gray-600 text-sm leading-relaxed mb-6">
                自动解析技能包目录结构与核心执行条目，生成格式标准的引用词。点击一键复制，直接粘贴给任意 AI 聊天框，AI 严格按章执行。
              </p>
              <div className="mt-auto rounded-2xl overflow-hidden border border-slate-100 shadow-inner bg-slate-50 p-2">
                <img
                  src="./screenshots/smart-prompt-reference.png"
                  alt="智能引用提示词"
                  className="w-full h-auto rounded-xl shadow-xs group-hover:scale-[1.01] transition-transform duration-300"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* Apple 风格楼层 4：生产力细节与纯本地隐私 Bento Grid */}
        {/* ================================================================ */}
        <section className="max-w-7xl mx-auto px-6 py-24 border-t border-slate-200/60">
          <div className="flex flex-col items-center text-center mb-16">
            <span className="text-xs font-bold tracking-widest text-[#0055FF] uppercase bg-[#0055FF]/10 px-3 py-1 rounded-full mb-4">
              Productivity & Privacy
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-gray-900 tracking-tight mb-4 max-w-3xl">
              考究的原生桌面体验，本地纯净可信
            </h2>
            <p className="text-gray-500 text-base sm:text-lg max-w-2xl leading-relaxed">
              不连第三方云端，不保存敏感词，数据 100% 存在你自己的电脑上。配合如 macOS 访达般的直觉操作。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Bento 1: 鼠标框选多选批量操作（跨 2 列） */}
            <div className="md:col-span-2 rounded-3xl bg-white border border-slate-200/80 shadow-lg p-6 sm:p-8 flex flex-col justify-between group overflow-hidden">
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0055FF] flex items-center justify-center mb-4">
                  <MousePointerClick className="w-5 h-5" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">像桌面文件一样，鼠标框选批量操作</h3>
                <p className="text-gray-600 text-sm leading-relaxed mb-6 max-w-xl">
                  按住鼠标随手划过卡片即可框选多项，支持批量收藏、批量删除、批量导出与统一打标签。告别逐个点击的烦琐。
                </p>
              </div>
              <div className="rounded-2xl overflow-hidden border border-slate-100 shadow-sm bg-slate-50 p-2">
                <img
                  src="./screenshots/multi-select.png"
                  alt="多选批量操作"
                  className="w-full h-auto rounded-xl group-hover:scale-[1.01] transition-transform duration-300"
                  loading="lazy"
                />
              </div>
            </div>

            {/* Bento 2: 数据一键备份与无忧迁移 */}
            <div className="rounded-3xl bg-white border border-slate-200/80 shadow-lg p-6 sm:p-8 flex flex-col justify-between group overflow-hidden">
              <div>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
                  <Database className="w-5 h-5" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">数据一键打包，换机无忧迁移</h3>
                <p className="text-gray-600 text-sm leading-relaxed mb-6">
                  整库支持一键导出为标准 ZIP 归档包。换新电脑直接载入恢复，每次导入前系统自动静默备份兜底，数据安全无忧。
                </p>
              </div>
              <div className="rounded-2xl overflow-hidden border border-slate-100 shadow-sm bg-slate-50 p-2 mt-auto">
                <img
                  src="./screenshots/backup-restore.png"
                  alt="数据备份与恢复"
                  className="w-full h-auto rounded-xl group-hover:scale-[1.01] transition-transform duration-300"
                  loading="lazy"
                />
              </div>
            </div>

            {/* Bento 3: 纯本地 SQLite 存储 */}
            <div className="rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 text-white p-8 shadow-xl flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-white/10 text-[#00E5FF] flex items-center justify-center mb-6">
                  <CloudOff className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-bold mb-3">纯本地存储，零数据上传</h3>
                <p className="text-slate-300 text-sm leading-relaxed">
                  无需注册登录任何账号，不设云端同步服务器。你的私有 Prompt、业务技能与使用记录都在本地 SQLite 中，断网离线也能顺畅使用。
                </p>
              </div>
              <div className="mt-8 pt-6 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
                <span>本地 SQLite 数据库</span>
                <span className="text-[#00E5FF] font-semibold">100% 隐私可信</span>
              </div>
            </div>

            {/* Bento 4: 适配主流 Agent 生态（跨 2 列） */}
            <div className="md:col-span-2 rounded-3xl bg-white border border-slate-200/80 shadow-lg p-6 sm:p-8 flex flex-col justify-between group overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-3">
                    <Bot className="w-5 h-5" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-1.5">广泛挂载，无缝装进各类 AI Agent</h3>
                  <p className="text-gray-600 text-sm leading-relaxed max-w-lg">
                    一键把技能安装到 Claude Code、Antigravity、Cursor、Windsurf、Trae 等常用 AI 开发工具中，右键一键部署。
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-gray-700">即插即用</span>
                </div>
              </div>
              <div className="rounded-2xl overflow-hidden border border-slate-100 shadow-sm bg-slate-50 p-2">
                <img
                  src="./screenshots/sync-agent.png"
                  alt="安装技能到 AI Agent"
                  className="w-full h-auto rounded-xl group-hover:scale-[1.01] transition-transform duration-300"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </section>

        {/* 核心亮点总结 Bento */}
        <section className="max-w-7xl mx-auto px-6 py-20 border-t border-slate-200/60">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-4xl font-bold mb-4 tracking-tight text-gray-900">
              为每一位 AI 使用者打磨的实用细节
            </h2>
            <p className="text-gray-500 text-base sm:text-lg max-w-2xl mx-auto">
              把技能和提示词收拢在手边，开箱即用。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <div className="p-6 rounded-2xl bg-white border border-slate-200/70 shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center mb-3">
                <Zap className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-gray-900 text-base mb-1">轻巧秒开</h4>
              <p className="text-gray-500 text-xs leading-relaxed">安装包仅十几兆，常驻后台几乎不占内存，随时秒级唤起。</p>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-slate-200/70 shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
                <Eye className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-gray-900 text-base mb-1">按空格速览</h4>
              <p className="text-gray-500 text-xs leading-relaxed">列表轻按空格即出全屏速览，看完随手关，省去频繁进出页面。</p>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-slate-200/70 shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
                <Search className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-gray-900 text-base mb-1">全局秒级搜索</h4>
              <p className="text-gray-500 text-xs leading-relaxed">Cmd/Ctrl+K 随时唤起，拼音、名称、描述多字段快速匹配。</p>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-slate-200/70 shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                <Shield className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-gray-900 text-base mb-1">GPL-3.0 开源</h4>
              <p className="text-gray-500 text-xs leading-relaxed">代码完全开源透明，接受全球社区审阅，长期持续迭代维护。</p>
            </div>
          </div>
        </section>

        {/* Downloads Section */}
        <section id="downloads" className="max-w-7xl mx-auto px-6 py-28">
          <div className="relative rounded-[2.5rem] p-10 md:p-20 text-center overflow-hidden border border-[#0055FF]/15 bg-white/60 shadow-[0_20px_60px_-15px_rgba(0,85,255,0.1)] backdrop-blur-xl">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-[#0055FF]/15 via-[#00E5FF]/5 to-transparent blur-3xl pointer-events-none -z-10 rounded-full" />
            
            <h2 className="text-3xl md:text-5xl font-bold mb-6 text-gray-900 tracking-tight relative z-10">
              即刻下载，整理你的 <span className="text-[#0055FF]">AI 技能库</span>
            </h2>
            <p className="text-gray-500 text-lg md:text-xl mb-14 max-w-2xl mx-auto relative z-10">
              SkillHub 完全开源免费，提供全平台原生安装包。<br className="hidden md:block"/>选择你的操作系统立即开始使用。
            </p>
            
            <div className="grid md:grid-cols-3 gap-6 relative z-10 max-w-5xl mx-auto">
              <a href={OS_INFO.mac.getUrl(latestVersion)} className="group flex flex-col items-center p-8 rounded-3xl bg-white/80 hover:bg-white border border-gray-200/80 hover:border-[#0055FF]/30 hover:shadow-2xl hover:shadow-[#0055FF]/10 transition-all duration-300 transform hover:-translate-y-1">
                <div className="w-16 h-16 rounded-2xl bg-gray-50 group-hover:bg-[#0055FF]/5 flex items-center justify-center mb-5 transition-colors border border-gray-100 group-hover:border-[#0055FF]/10">
                  <Apple className="w-8 h-8 text-gray-700 group-hover:text-[#0055FF] transition-colors" />
                </div>
                <span className="text-gray-900 font-bold text-lg mb-1 group-hover:text-[#0055FF] transition-colors">macOS</span>
                <span className="text-gray-500 text-sm">通用二进制 (Intel & Apple Silicon)</span>
              </a>
              <a href={OS_INFO.win.getUrl(latestVersion)} className="group flex flex-col items-center p-8 rounded-3xl bg-white/80 hover:bg-white border border-gray-200/80 hover:border-[#0055FF]/30 hover:shadow-2xl hover:shadow-[#0055FF]/10 transition-all duration-300 transform hover:-translate-y-1">
                <div className="w-16 h-16 rounded-2xl bg-gray-50 group-hover:bg-[#0055FF]/5 flex items-center justify-center mb-5 transition-colors border border-gray-100 group-hover:border-[#0055FF]/10">
                  <Monitor className="w-8 h-8 text-gray-700 group-hover:text-[#0055FF] transition-colors" />
                </div>
                <span className="text-gray-900 font-bold text-lg mb-1 group-hover:text-[#0055FF] transition-colors">Windows</span>
                <span className="text-gray-500 text-sm">Windows 10 / 11 (64 位)</span>
              </a>
              <a href={OS_INFO.linux.getUrl(latestVersion)} className="group flex flex-col items-center p-8 rounded-3xl bg-white/80 hover:bg-white border border-gray-200/80 hover:border-[#0055FF]/30 hover:shadow-2xl hover:shadow-[#0055FF]/10 transition-all duration-300 transform hover:-translate-y-1">
                <div className="w-16 h-16 rounded-2xl bg-gray-50 group-hover:bg-[#0055FF]/5 flex items-center justify-center mb-5 transition-colors border border-gray-100 group-hover:border-[#0055FF]/10">
                  <Terminal className="w-8 h-8 text-gray-700 group-hover:text-[#0055FF] transition-colors" />
                </div>
                <span className="text-gray-900 font-bold text-lg mb-1 group-hover:text-[#0055FF] transition-colors">Linux</span>
                <span className="text-gray-500 text-sm">AppImage / DEB</span>
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
            © {new Date().getFullYear()} VipBeCool. 基于 GPL-3.0 协议开源.
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
