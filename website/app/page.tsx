"use client";

import { motion } from "framer-motion";
import { Download, Zap, Shield, RefreshCw, Layers, ArrowRight, Monitor, Apple, Terminal } from "lucide-react";
import { useState, useEffect } from "react";

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

export default function Home() {
  const [downloadUrl, setDownloadUrl] = useState("https://github.com/VipBeCool/SkillHub/releases/latest");
  const [osName, setOsName] = useState("Download");
  const [osIcon, setOsIcon] = useState(<Download className="w-5 h-5" />);

  useEffect(() => {
    // Detect OS
    if (typeof window !== "undefined") {
      const platform = window.navigator.userAgent.toLowerCase();
      if (platform.includes("mac")) {
        setOsName("Download for macOS");
        setOsIcon(<Apple className="w-5 h-5" />);
        setDownloadUrl("https://github.com/VipBeCool/SkillHub/releases/latest/download/SkillHub_0.1.0_universal.dmg");
      } else if (platform.includes("win")) {
        setOsName("Download for Windows");
        setOsIcon(<Monitor className="w-5 h-5" />);
        setDownloadUrl("https://github.com/VipBeCool/SkillHub/releases/latest/download/SkillHub_0.1.0_x64-setup.exe");
      } else if (platform.includes("linux")) {
        setOsName("Download for Linux");
        setOsIcon(<Terminal className="w-5 h-5" />);
        setDownloadUrl("https://github.com/VipBeCool/SkillHub/releases/latest/download/SkillHub_0.1.0_amd64.AppImage");
      }
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col selection:bg-[#00E5FF]/30 overflow-x-hidden">
      {/* Dynamic Background Decorators */}
      <div className="fixed top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-[#00E5FF]/10 blur-[120px] -z-10 animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="fixed top-[20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-[#0055FF]/10 blur-[150px] -z-10 animate-pulse" style={{ animationDuration: '12s' }} />
      <div className="fixed bottom-[-10%] left-[20%] w-[400px] h-[400px] rounded-full bg-purple-400/10 blur-[100px] -z-10 animate-pulse" style={{ animationDuration: '10s' }} />
      
      {/* Grid Pattern Overlay */}
      <div className="fixed inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] -z-20 opacity-20 pointer-events-none" />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/icon.png" alt="SkillHub Logo" className="w-8 h-8 drop-shadow-md rounded-xl" />
            <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-gray-800 to-gray-600">SkillHub</span>
          </div>
          <nav className="flex gap-6 items-center">
            <a href="#downloads" className="text-sm font-medium text-gray-600 hover:text-[#0055FF] transition-colors hidden sm:block">Downloads</a>
            <a href="https://github.com/VipBeCool/SkillHub" target="_blank" rel="noreferrer" className="text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-2 font-medium bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full text-sm">
              <GithubIcon className="w-4 h-4" />
              <span>Star on GitHub</span>
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-grow pt-32 pb-24">
        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-6 pt-16 pb-24 flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-gray-200 text-[#0055FF] font-medium text-sm mb-10 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00E5FF] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#0055FF]"></span>
            </span>
            SkillHub v0.1.0 is now available
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 max-w-4xl leading-[1.15]"
          >
            你的极速本地 <br />
            <span className="text-gradient">AI 技能与 Prompt 引擎</span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-gray-500 mb-12 max-w-2xl leading-relaxed"
          >
            基于 Tauri & Rust 打造的跨平台 AI 工作站。零配置，纯本地，毫秒级响应，轻松管理所有 Agent 技能与提示词库。
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-5 items-center"
          >
            <a 
              href={downloadUrl}
              className="px-8 py-4 rounded-2xl bg-gradient-to-r from-[#0055FF] to-[#0077FF] text-white font-bold text-lg flex items-center justify-center gap-3 btn-glow w-full sm:w-auto"
            >
              {osIcon}
              {osName}
            </a>
            <a 
              href="#downloads" 
              className="px-8 py-4 rounded-2xl bg-white border border-gray-200 text-gray-700 font-bold text-lg flex items-center justify-center gap-2 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm w-full sm:w-auto group"
            >
              其他平台
              <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-gray-700 group-hover:translate-x-1 transition-all" />
            </a>
          </motion.div>
        </section>

        {/* Product Mockup */}
        <section className="max-w-6xl mx-auto px-6 pb-32">
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="relative rounded-3xl overflow-hidden shadow-2xl border border-gray-200/60 bg-white/50 backdrop-blur-sm aspect-[16/10] flex items-center justify-center group"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-[#00E5FF]/5 to-[#0055FF]/5"></div>
            
            {/* Browser/Window Chrome */}
            <div className="absolute top-0 left-0 right-0 h-12 bg-white/80 border-b border-gray-100 flex items-center px-4 gap-2 z-10">
              <div className="w-3 h-3 rounded-full bg-red-400"></div>
              <div className="w-3 h-3 rounded-full bg-amber-400"></div>
              <div className="w-3 h-3 rounded-full bg-green-400"></div>
            </div>

            {/* Placeholder for the actual app screenshot */}
            <div className="text-center p-8 mt-12 transform group-hover:scale-105 transition-transform duration-700">
              <div className="w-24 h-24 mx-auto bg-gradient-to-br from-gray-50 to-gray-100 rounded-3xl flex items-center justify-center mb-6 shadow-inner border border-gray-200">
                <img src="/icon.png" className="w-12 h-12 opacity-80" alt="Icon" />
              </div>
              <h3 className="text-3xl font-bold text-gray-800 mb-3 tracking-tight">令人惊艳的交互体验</h3>
              <p className="text-gray-500 text-lg">（后期可在此替换为真实的高清应用截图）</p>
            </div>
          </motion.div>
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
        <section id="downloads" className="max-w-5xl mx-auto px-6 py-32">
          <div className="bg-gray-900 rounded-[2.5rem] p-12 md:p-20 text-center relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-2xl bg-gradient-to-b from-[#0055FF]/30 to-transparent opacity-50 blur-3xl pointer-events-none"></div>
            
            <h2 className="text-3xl md:text-5xl font-bold mb-6 text-white tracking-tight relative z-10">准备好提升效率了吗？</h2>
            <p className="text-gray-400 text-xl mb-12 max-w-2xl mx-auto relative z-10">SkillHub 完全开源免费，提供全平台原生安装包。选择你的操作系统立即开始体验。</p>
            
            <div className="grid sm:grid-cols-3 gap-4 relative z-10">
              <a href="https://github.com/VipBeCool/SkillHub/releases/latest/download/SkillHub_0.1.0_universal.dmg" className="flex flex-col items-center p-6 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 transition-colors">
                <Apple className="w-10 h-10 text-white mb-4" />
                <span className="text-white font-semibold mb-1">macOS</span>
                <span className="text-gray-400 text-sm">Universal (Intel & Apple Silicon)</span>
              </a>
              <a href="https://github.com/VipBeCool/SkillHub/releases/latest/download/SkillHub_0.1.0_x64-setup.exe" className="flex flex-col items-center p-6 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 transition-colors">
                <Monitor className="w-10 h-10 text-white mb-4" />
                <span className="text-white font-semibold mb-1">Windows</span>
                <span className="text-gray-400 text-sm">Windows 10 / 11 (x64)</span>
              </a>
              <a href="https://github.com/VipBeCool/SkillHub/releases/latest/download/SkillHub_0.1.0_amd64.AppImage" className="flex flex-col items-center p-6 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 transition-colors">
                <Terminal className="w-10 h-10 text-white mb-4" />
                <span className="text-white font-semibold mb-1">Linux</span>
                <span className="text-gray-400 text-sm">AppImage / DEB / RPM</span>
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200/60 bg-white/80 backdrop-blur-md pt-12 pb-12 mt-auto">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <img src="/icon.png" alt="SkillHub Logo" className="w-6 h-6" />
            <span className="font-semibold text-gray-700">SkillHub</span>
          </div>
          <p className="text-gray-400 text-sm">
            © {new Date().getFullYear()} VipBeCool. Open Source under GPL-3.0 License.
          </p>
          <div className="flex gap-4">
            <a href="https://github.com/VipBeCool/SkillHub" className="text-gray-400 hover:text-gray-600 transition-colors">
              <GithubIcon className="w-5 h-5" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
