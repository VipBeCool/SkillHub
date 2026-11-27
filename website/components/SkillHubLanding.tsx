"use client";

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  ChevronDown,
  Compass,
  Database,
  Download,
  Eye,
  FileText,
  FolderGit2,
  Globe,
  Heart,
  History,
  Languages,
  Layers,
  Maximize2,
  Menu,
  MousePointerClick,
  Search,
  Shield,
  Sparkles,
  Star,
  Users,
  X,
  Zap,
} from "lucide-react";
import type { ChangelogRelease } from "../lib/changelog";
import {
  AgentBrandId,
  EcosystemSourceId,
  Locale,
  OPEN_ECOSYSTEM_SOURCES,
  SITE_CONTENT,
  SUPPORTED_AGENTS,
} from "../lib/siteContent";

interface SkillHubLandingProps {
  latestChangelogVersion: string;
  packageVersion: string;
  releases: ChangelogRelease[];
}

type OsType = "mac" | "win" | "linux" | "default";
type DownloadMirror = "github" | "mirror";

interface ReleaseAssetsMap {
  version: string;
  macUrl: string;
  winUrl: string;
  linuxUrl: string;
}

const MIRROR_PREFIX = "https://gh-proxy.com/";
const GITHUB_REPO_URL = "https://github.com/VipBeCool/SkillHub";

function buildDefaultReleaseAssets(version: string): ReleaseAssetsMap {
  const clean = version.replace(/^v/, "");
  return {
    version: clean,
    macUrl: `${GITHUB_REPO_URL}/releases/download/v${clean}/SkillHub_${clean}_universal.dmg`,
    winUrl: `${GITHUB_REPO_URL}/releases/download/v${clean}/SkillHub_${clean}_x64-setup.exe`,
    linuxUrl: `${GITHUB_REPO_URL}/releases/download/v${clean}/SkillHub_${clean}_amd64.AppImage`,
  };
}

function applyMirror(url: string, mirror: DownloadMirror): string {
  if (mirror === "mirror" && url.startsWith("https://github.com/")) {
    return `${MIRROR_PREFIX}${url}`;
  }
  return url;
}

function detectOsType(): OsType {
  if (typeof window === "undefined") return "default";
  const ua = window.navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "win";
  if (ua.includes("linux")) return "linux";
  return "default";
}

const noopSubscribe = () => () => {};

function GithubMark({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.2c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

/** macOS 官方标准 Apple 实心标志 */
function MacAppleIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

/** Windows 11 标准四格窗实心标志 */
function WindowsLogoIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="2.5" y="2.5" width="8.7" height="8.7" rx="1.1" />
      <rect x="12.8" y="2.5" width="8.7" height="8.7" rx="1.1" />
      <rect x="2.5" y="12.8" width="8.7" height="8.7" rx="1.1" />
      <rect x="12.8" y="12.8" width="8.7" height="8.7" rx="1.1" />
    </svg>
  );
}

/** Linux 官方标准 Tux 企鹅标志 */
function LinuxTuxIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.146-.133.183-.198.053-.128.082-.264.088-.402v-.02a1.21 1.21 0 00-.061-.4c-.045-.134-.101-.2-.183-.333-.084-.066-.167-.132-.267-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.4v.019c.002.089.008.179.02.267-.193-.067-.438-.135-.607-.202a1.635 1.635 0 01-.018-.2v-.02a1.772 1.772 0 01.15-.768c.082-.22.232-.406.43-.533a.985.985 0 01.594-.2zm-2.962.059h.036c.142 0 .27.048.399.135.146.129.264.288.344.465.09.199.14.4.153.667v.004c.007.134.006.2-.002.266v.08c-.03.007-.056.018-.083.024-.152.055-.274.135-.393.2.012-.09.013-.18.003-.267v-.015c-.012-.133-.04-.2-.082-.333a.613.613 0 00-.166-.267.248.248 0 00-.183-.064h-.021c-.071.006-.13.04-.186.132a.552.552 0 00-.12.27.944.944 0 00-.023.33v.015c.012.135.037.2.08.334.046.134.098.2.166.268.01.009.02.018.034.024-.07.057-.117.07-.176.136a.304.304 0 01-.131.068 2.62 2.62 0 01-.275-.402 1.772 1.772 0 01-.155-.667 1.759 1.759 0 01.08-.668 1.43 1.43 0 01.283-.535c.128-.133.26-.2.418-.2zm1.37 1.706c.332 0 .733.065 1.216.399.293.2.523.269 1.052.468h.003c.255.136.405.266.478.399v-.131a.571.571 0 01.016.47c-.123.31-.516.643-1.063.842v.002c-.268.135-.501.333-.775.465-.276.135-.588.292-1.012.267a1.139 1.139 0 01-.448-.067 3.566 3.566 0 01-.322-.198c-.195-.135-.363-.332-.612-.465v-.005h-.005c-.4-.246-.616-.512-.686-.71-.07-.268-.005-.47.193-.6.224-.135.38-.271.483-.336.104-.074.143-.102.176-.131h.002v-.003c.169-.202.436-.47.839-.601.139-.036.294-.065.466-.065zm2.8 2.142c.358 1.417 1.196 3.475 1.735 4.473.286.534.855 1.659 1.102 3.024.156-.005.33.018.513.064.646-1.671-.546-3.467-1.089-3.966-.22-.2-.232-.335-.123-.335.59.534 1.365 1.572 1.646 2.757.13.535.16 1.104.021 1.67.067.028.135.06.205.067 1.032.534 1.413.938 1.23 1.537v-.043c-.06-.003-.12 0-.18 0h-.016c.151-.467-.182-.825-1.065-1.224-.915-.4-1.646-.336-1.77.465-.008.043-.013.066-.018.135-.068.023-.139.053-.209.064-.43.268-.662.669-.793 1.187-.13.533-.17 1.156-.205 1.869v.003c-.02.334-.17.838-.319 1.35-1.5 1.072-3.58 1.538-5.348.334a2.645 2.645 0 00-.402-.533 1.45 1.45 0 00-.275-.333c.182 0 .338-.03.465-.067a.615.615 0 00.314-.334c.108-.267 0-.697-.345-1.163-.345-.467-.931-.995-1.788-1.521-.63-.4-.986-.87-1.15-1.396-.165-.534-.143-1.085-.015-1.645.245-1.07.873-2.11 1.274-2.763.107-.065.037.135-.408.974-.396.751-1.14 2.497-.122 3.854a8.123 8.123 0 01.647-2.876c.564-1.278 1.743-3.504 1.836-5.268.048.036.217.135.289.202.218.133.38.333.59.465.21.201.477.335.876.335.039.003.075.006.11.006.412 0 .73-.134.997-.268.29-.134.52-.334.74-.4h.005c.467-.135.835-.402 1.044-.7zm2.185 8.958c.037.6.343 1.245.882 1.377.588.134 1.434-.333 1.791-.765l.211-.01c.315-.007.577.01.847.268l.003.003c.208.199.305.53.391.876.085.4.154.78.409 1.066.486.527.645.906.636 1.14l.003-.007v.018l-.003-.012c-.015.262-.185.396-.498.595-.63.401-1.746.712-2.457 1.57-.618.737-1.37 1.14-2.036 1.191-.664.053-1.237-.2-1.574-.898l-.005-.003c-.21-.4-.12-1.025.056-1.69.176-.668.428-1.344.463-1.897.037-.714.076-1.335.195-1.814.12-.465.308-.797.641-.984l.045-.022zm-10.814.049h.01c.053 0 .105.005.157.014.376.055.706.333 1.023.752l.91 1.664.003.003c.243.533.754 1.064 1.189 1.637.434.598.77 1.131.729 1.57v.006c-.057.744-.48 1.148-1.125 1.294-.645.135-1.52.002-2.395-.464-.968-.536-2.118-.469-2.857-.602-.369-.066-.61-.2-.723-.4-.11-.2-.113-.602.123-1.23v-.004l.002-.003c.117-.334.03-.752-.027-1.118-.055-.401-.083-.71.043-.94.16-.334.396-.4.69-.533.294-.135.64-.202.915-.47h.002v-.002c.256-.268.445-.601.668-.838.19-.201.38-.336.663-.336zm7.159-9.074c-.435.201-.945.535-1.488.535-.542 0-.97-.267-1.28-.466-.154-.134-.28-.268-.373-.335-.164-.134-.144-.333-.074-.333.109.016.129.134.199.2.096.066.215.2.36.333.292.2.68.467 1.167.467.485 0 1.053-.267 1.398-.466.195-.135.445-.334.648-.467.156-.136.149-.267.279-.267.128.016.034.134-.147.332a8.097 8.097 0 01-.69.468zm-1.082-1.583V5.64c-.006-.02.013-.042.029-.05.074-.043.18-.027.26.004.063 0 .16.067.15.135-.006.049-.085.066-.135.066-.055 0-.092-.043-.141-.068-.052-.018-.146-.008-.163-.065zm-.551 0c-.02.058-.113.049-.166.066-.047.025-.086.068-.14.068-.05 0-.13-.02-.136-.068-.01-.066.088-.133.15-.133.08-.031.184-.047.259-.005.019.009.036.03.03.05v.02h.003z" />
    </svg>
  );
}

/** 专属定制的 AI Agent 品牌微标 */
function AgentBrandLogo({ id }: { id: AgentBrandId }) {
  switch (id) {
    case "claude-code":
      return (
        <span className="w-5 h-5 rounded-[6px] bg-[#D97757]/12 text-[#D97757] inline-flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" />
          </svg>
        </span>
      );
    case "cursor":
      return (
        <span className="w-5 h-5 rounded-[6px] bg-black/[0.07] text-[#1D1D1F] inline-flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L3 7.2v9.6L12 22l9-5.2V7.2L12 2zm0 2.3l6.8 3.9L12 12.1 5.2 8.2 12 4.3zm-7 5.6l6.2 3.6v6.2L5 16.1V9.9zm8.2 9.8v-6.2l6.2-3.6v6.2l-6.2 3.6z" />
          </svg>
        </span>
      );
    case "windsurf":
      return (
        <span className="w-5 h-5 rounded-[6px] bg-[#0B9E88]/12 text-[#0B9E88] inline-flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 15c3.5-4.5 7-4.5 10.5 0S19 19 21 14" />
            <path d="M3 9.5c3.5-4.5 7-4.5 10.5 0S19 13.5 21 8.5" />
          </svg>
        </span>
      );
    case "antigravity":
      return (
        <span className="w-5 h-5 rounded-[6px] bg-[#0055FF]/10 text-[#0055FF] inline-flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 3 20 18 12 14.5 4 18 12 3" />
          </svg>
        </span>
      );
    case "codex":
      return (
        <span className="w-5 h-5 rounded-[6px] bg-[#10A37F]/12 text-[#10A37F] inline-flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
          </svg>
        </span>
      );
    case "trae":
      return (
        <span className="w-5 h-5 rounded-[6px] bg-[#0066FF]/10 text-[#0066FF] inline-flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 7h14M12 7v11M8 18h8" />
          </svg>
        </span>
      );
    case "cline":
      return (
        <span className="w-5 h-5 rounded-[6px] bg-slate-900/[0.07] text-slate-700 inline-flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="6" width="16" height="12" rx="3" />
            <circle cx="9" cy="12" r="1.2" fill="currentColor" />
            <circle cx="15" cy="12" r="1.2" fill="currentColor" />
          </svg>
        </span>
      );
  }
}

/** 专属定制的开放生态源微标 */
function EcosystemSourceLogo({ id }: { id: EcosystemSourceId }) {
  switch (id) {
    case "skills-sh":
      return (
        <span className="w-5 h-5 rounded-[6px] bg-black/[0.07] text-[#1D1D1F] inline-flex items-center justify-center shrink-0 font-mono text-[10px] font-bold">
          {">_"}
        </span>
      );
    case "linkly":
      return (
        <span className="w-5 h-5 rounded-[6px] bg-[#0055FF]/10 text-[#0055FF] inline-flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
            <polyline points="16 7 22 7 22 13" />
          </svg>
        </span>
      );
    case "aishort":
      return (
        <span className="w-5 h-5 rounded-[6px] bg-[#0B9E88]/12 text-[#0B9E88] inline-flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </span>
      );
    case "prompts-chat":
      return (
        <span className="w-5 h-5 rounded-[6px] bg-[#0055FF]/10 text-[#0055FF] inline-flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </span>
      );
    case "fabric":
      return (
        <span className="w-5 h-5 rounded-[6px] bg-slate-900/[0.07] text-[#1D1D1F] inline-flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
            <path d="M4 8h16M4 16h16M8 4v16M16 4v16" />
          </svg>
        </span>
      );
    case "langgpt":
      return (
        <span className="w-5 h-5 rounded-[6px] bg-[#D97757]/12 text-[#D97757] inline-flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="16" height="16" rx="3" />
            <path d="M8 9h8M8 13h8M8 17h5" />
          </svg>
        </span>
      );
    case "github":
      return (
        <span className="w-5 h-5 rounded-[6px] bg-black/[0.07] text-[#1D1D1F] inline-flex items-center justify-center shrink-0">
          <GithubMark className="w-3.5 h-3.5" />
        </span>
      );
  }
}

/** 渲染带行内反引号代码的更新日志文本 */
function InlineRichText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, idx) => {
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return (
            <code
              key={idx}
              className="px-1.5 py-0.5 mx-0.5 rounded-md bg-black/[0.045] text-[#1D1D1F] font-mono text-[12px]"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return (
            <strong key={idx} className="font-semibold text-[#1D1D1F]">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <React.Fragment key={idx}>{part}</React.Fragment>;
      })}
    </>
  );
}

/** 为不支持 <dialog closedby="any"> 的浏览器（如旧版 Safari）注册标准背景点击关闭兜底 */
function useDialogLightDismissFallback(ref: React.RefObject<HTMLDialogElement | null>) {
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || typeof HTMLDialogElement === "undefined") return;
    if ("closedBy" in HTMLDialogElement.prototype) return;

    const handleClick = (event: MouseEvent) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isDialogContent =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (!isDialogContent) {
        dialog.close();
      }
    };

    dialog.addEventListener("click", handleClick);
    return () => dialog.removeEventListener("click", handleClick);
  }, [ref]);
}

export default function SkillHubLanding({
  latestChangelogVersion,
  packageVersion,
  releases,
}: SkillHubLandingProps) {
  const osType = useSyncExternalStore<OsType>(noopSubscribe, detectOsType, () => "default");

  const [locale, setLocale] = useState<Locale>("zh");
  const [heroTabIdx, setHeroTabIdx] = useState(0);
  const [discoverStepIdx, setDiscoverStepIdx] = useState(0);
  const [readingTab, setReadingTab] = useState<"outline" | "translate">("outline");
  const [promptSlideIdx, setPromptSlideIdx] = useState(0);
  const [agentCardImgIdx, setAgentCardImgIdx] = useState<Record<string, number>>({});
  const [showAllReleases, setShowAllReleases] = useState(false);
  const [expandedOldVersions, setExpandedOldVersions] = useState<Record<string, boolean>>({});
  const [mirror, setMirror] = useState<DownloadMirror>("github");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [starCount, setStarCount] = useState<number | null>(null);

  // 下载安装包版本：初始采用 packageVersion（已发布版本安全兜底），异步同步 GitHub 最新正式 Release
  const [releaseAssets, setReleaseAssets] = useState<ReleaseAssetsMap>(() =>
    buildDefaultReleaseAssets(packageVersion)
  );

  // 原生 <dialog> 引用：社群二维码弹窗 & 高清截图放大灯箱
  const communityDialogRef = useRef<HTMLDialogElement | null>(null);
  const lightboxDialogRef = useRef<HTMLDialogElement | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);

  useDialogLightDismissFallback(communityDialogRef);
  useDialogLightDismissFallback(lightboxDialogRef);

  const t = SITE_CONTENT[locale];

  // 初始化读取本地记忆的语言偏好
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("skillhub_site_locale");
      if (saved === "zh" || saved === "en") {
        setLocale(saved);
      }
    } catch {
      // 忽略存储异常
    }
  }, []);

  const toggleLocale = () => {
    const next: Locale = locale === "zh" ? "en" : "zh";
    setLocale(next);
    document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
    try {
      window.localStorage.setItem("skillhub_site_locale", next);
    } catch {
      // 忽略存储异常
    }
  };

  // 动态获取 GitHub 最新正式 Release（含真实资产下载直链）与仓库 Star 数，失败自动回退镜像 latest.json
  useEffect(() => {
    let cancelled = false;

    async function syncLatestRelease() {
      try {
        const res = await fetch("https://api.github.com/repos/VipBeCool/SkillHub/releases/latest");
        if (!res.ok) throw new Error("GitHub API rate-limited");
        const data = await res.json();
        if (cancelled || !data?.tag_name) return;

        const ver = String(data.tag_name).replace(/^v/, "");
        const fallback = buildDefaultReleaseAssets(ver);
        const assets: Array<{ name?: string; browser_download_url?: string }> = Array.isArray(
          data.assets
        )
          ? data.assets
          : [];

        const findAsset = (pred: (name: string) => boolean) =>
          assets.find((a) => a.name && pred(a.name.toLowerCase()))?.browser_download_url;

        setReleaseAssets({
          version: ver,
          macUrl: findAsset((n) => n.endsWith(".dmg")) || fallback.macUrl,
          winUrl:
            findAsset((n) => n.endsWith("-setup.exe") || n.endsWith(".exe")) ||
            findAsset((n) => n.endsWith(".msi")) ||
            fallback.winUrl,
          linuxUrl:
            findAsset((n) => n.endsWith(".appimage")) ||
            findAsset((n) => n.endsWith(".deb")) ||
            fallback.linuxUrl,
        });
      } catch {
        try {
          const mirrorRes = await fetch(
            `${MIRROR_PREFIX}${GITHUB_REPO_URL}/releases/latest/download/latest.json`
          );
          if (!mirrorRes.ok) return;
          const latestJson = await mirrorRes.json();
          if (!cancelled && latestJson?.version) {
            const ver = String(latestJson.version).replace(/^v/, "");
            setReleaseAssets(buildDefaultReleaseAssets(ver));
          }
        } catch {
          // 保持构建期安全兜底版本
        }
      }
    }

    async function syncRepoStars() {
      try {
        const res = await fetch("https://api.github.com/repos/VipBeCool/SkillHub");
        if (!res.ok) return;
        const repo = await res.json();
        if (!cancelled && typeof repo?.stargazers_count === "number") {
          setStarCount(repo.stargazers_count);
        }
      } catch {
        // 忽略 Star 获取异常
      }
    }

    syncLatestRelease();
    syncRepoStars();
    return () => {
      cancelled = true;
    };
  }, []);

  const openCommunityModal = () => {
    setMobileMenuOpen(false);
    communityDialogRef.current?.showModal();
  };

  const openLightbox = (src: string, alt: string) => {
    setLightboxImage({ src, alt });
    requestAnimationFrame(() => {
      lightboxDialogRef.current?.showModal();
    });
  };

  const primaryDownload = useMemo(() => {
    if (osType === "mac") {
      return {
        label: t.hero.downloadFor.mac,
        icon: MacAppleIcon,
        href: applyMirror(releaseAssets.macUrl, mirror),
      };
    }
    if (osType === "win") {
      return {
        label: t.hero.downloadFor.win,
        icon: WindowsLogoIcon,
        href: applyMirror(releaseAssets.winUrl, mirror),
      };
    }
    if (osType === "linux") {
      return {
        label: t.hero.downloadFor.linux,
        icon: LinuxTuxIcon,
        href: applyMirror(releaseAssets.linuxUrl, mirror),
      };
    }
    return {
      label: t.hero.downloadFor.default,
      icon: Download,
      href: "#downloads",
    };
  }, [osType, t.hero.downloadFor, releaseAssets, mirror]);

  const PrimaryOsIcon = primaryDownload.icon;
  const activeHeroTab = t.hero.tabs[heroTabIdx] || t.hero.tabs[0];
  const activeDiscoverStep =
    t.discoverSection.steps[discoverStepIdx] || t.discoverSection.steps[0];
  const activePromptSlide =
    t.promptsSection.slides[promptSlideIdx] || t.promptsSection.slides[0];

  const featuredReleases = releases.slice(0, 3);
  const olderReleases = releases.slice(3);

  const specIcons = [Zap, Database, Globe, FolderGit2];

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden bg-[#FAFAFC] text-[#1D1D1F]">
      {/* 顶部克制的柔和单色微光 */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 h-[460px] -z-10"
        style={{
          background:
            "radial-gradient(65% 55% at 50% 0%, rgba(0, 85, 255, 0.06) 0%, rgba(0, 85, 255, 0.015) 55%, transparent 100%)",
        }}
      />

      {/* ===================================================================== */}
      {/* 顶部悬浮导航栏（按「桌面整理 → 随手调用 → 提示词库 → 资源中心 → 更新日志 → 下载」排序） */}
      {/* ===================================================================== */}
      <header className="fixed top-0 inset-x-0 z-40 nav-glass">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* 品牌标识 + 最新版本胶囊 */}
          <div className="flex items-center gap-2.5 shrink-0">
            <a href="#" className="flex items-center gap-2.5 group">
              <img
                src="./icon.png"
                alt="SkillHub Logo"
                width={30}
                height={30}
                className="w-[30px] h-[30px] rounded-lg shadow-2xs"
              />
              <span className="font-bold text-[17px] tracking-tight text-[#1D1D1F]">
                SkillHub
              </span>
            </a>
            <a
              href="#changelog"
              className="px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-[#0055FF]/[0.08] text-[#0055FF] hover:bg-[#0055FF]/[0.14] transition-colors"
            >
              v{latestChangelogVersion}
            </a>
          </div>

          {/* 桌面端主导航栏目 */}
          <nav className="hidden lg:flex items-center gap-6 text-[13.5px] font-medium text-[#6E6E73]">
            <a href="#desktop" className="hover:text-[#1D1D1F] transition-colors">
              {t.nav.desktop}
            </a>
            <a href="#agents" className="hover:text-[#1D1D1F] transition-colors">
              {t.nav.agents}
            </a>
            <a href="#prompts" className="hover:text-[#1D1D1F] transition-colors">
              {t.nav.prompts}
            </a>
            <a href="#discover" className="hover:text-[#1D1D1F] transition-colors">
              {t.nav.discover}
            </a>
            <a
              href="#changelog"
              className="hover:text-[#1D1D1F] transition-colors inline-flex items-center gap-1"
            >
              <span>{t.nav.changelog}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#0055FF]" />
            </a>
            <a href="#downloads" className="hover:text-[#1D1D1F] transition-colors">
              {t.nav.download}
            </a>
          </nav>

          {/* 右侧工具区 */}
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={openCommunityModal}
              className="px-2.5 py-1.5 rounded-lg text-[12.5px] font-medium text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-black/[0.04] transition-colors cursor-pointer"
            >
              {t.nav.community}
            </button>

            <button
              type="button"
              onClick={toggleLocale}
              aria-label="切换语言 / Switch language"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-black/[0.04] transition-colors cursor-pointer"
            >
              <Languages className="w-3.5 h-3.5" />
              <span>{locale === "zh" ? "EN" : "中文"}</span>
            </button>

            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-medium text-[#1D1D1F] bg-white border border-black/[0.09] hover:border-black/20 transition-colors shadow-2xs"
            >
              <GithubMark className="w-3.5 h-3.5" />
              <span>GitHub</span>
              {starCount !== null && starCount > 0 && (
                <span className="inline-flex items-center gap-0.5 pl-1.5 ml-0.5 border-l border-black/10 text-[11.5px] text-[#6E6E73] tabular-nums">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  {starCount}
                </span>
              )}
            </a>

            <a
              href="#downloads"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold text-white bg-[#0055FF] hover:bg-[#0044CC] transition-colors shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t.nav.freeDownload}</span>
            </a>
          </div>

          {/* 移动端菜单按钮 */}
          <div className="flex sm:hidden items-center gap-1.5">
            <button
              type="button"
              onClick={toggleLocale}
              className="px-2 py-1 rounded-md text-xs font-medium text-[#6E6E73] border border-black/[0.08] bg-white"
            >
              {locale === "zh" ? "EN" : "中"}
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="打开导航菜单"
              className="p-2 rounded-lg text-[#1D1D1F] hover:bg-black/[0.05]"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* 移动端折叠抽屉 */}
        {mobileMenuOpen && (
          <div className="sm:hidden bg-white border-b border-black/[0.08] px-5 py-4 space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 font-medium text-[#1D1D1F]">
              <a href="#desktop" onClick={() => setMobileMenuOpen(false)} className="py-1.5">
                {t.nav.desktop}
              </a>
              <a href="#agents" onClick={() => setMobileMenuOpen(false)} className="py-1.5">
                {t.nav.agents}
              </a>
              <a href="#prompts" onClick={() => setMobileMenuOpen(false)} className="py-1.5">
                {t.nav.prompts}
              </a>
              <a href="#discover" onClick={() => setMobileMenuOpen(false)} className="py-1.5">
                {t.nav.discover}
              </a>
              <a
                href="#changelog"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 text-[#0055FF]"
              >
                {t.nav.changelog} (v{latestChangelogVersion})
              </a>
              <button
                type="button"
                onClick={openCommunityModal}
                className="py-1.5 text-left text-[#1D1D1F]"
              >
                {t.nav.community}
              </button>
            </div>
            <div className="pt-2 border-t border-black/[0.06] flex items-center gap-2">
              <a
                href="#downloads"
                onClick={() => setMobileMenuOpen(false)}
                className="flex-1 py-2 rounded-lg bg-[#0055FF] text-white text-center font-semibold text-xs"
              >
                {t.nav.freeDownload}
              </a>
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-lg border border-black/10 bg-white text-xs font-medium inline-flex items-center gap-1.5"
              >
                <GithubMark className="w-3.5 h-3.5" />
                <span>GitHub</span>
              </a>
            </div>
          </div>
        )}
      </header>

      <main className="flex-grow pt-24 sm:pt-28">
        {/* =================================================================== */}
        {/* 第 1 屏：Hero 定位 + 原生交互主舞台（管理整理优先） */}
        {/* =================================================================== */}
        <section className="max-w-6xl mx-auto px-5 sm:px-6 pt-4 sm:pt-8 pb-14 sm:pb-20">
          <div className="flex flex-col items-center text-center">
            {/* 版本动态提示条 */}
            <a
              href="#changelog"
              className="group inline-flex items-center gap-2 pl-3 pr-3.5 py-1.5 rounded-full bg-white border border-black/[0.08] hover:border-[#0055FF]/30 shadow-2xs transition-colors mb-6 text-[12.5px]"
            >
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#0055FF]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0055FF]" />
                v{latestChangelogVersion} {t.hero.announcementPrefix}
              </span>
              <span className="text-black/15">|</span>
              <span className="text-[#6E6E73] group-hover:text-[#1D1D1F] transition-colors">
                {t.hero.announcementText}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-[#6E6E73] group-hover:text-[#0055FF] group-hover:translate-x-0.5 transition-all" />
            </a>

            {/* 主标题 */}
            <h1 className="text-[32px] sm:text-[48px] md:text-[56px] font-bold tracking-[-0.025em] leading-[1.16] max-w-4xl text-[#1D1D1F]">
              {t.hero.titleLine1}
              <br />
              <span className="text-[#0055FF]">{t.hero.titleHighlight}</span>
              {t.hero.titleSuffix}
              {t.hero.titleLine2}
            </h1>

            <p className="mt-5 text-[15px] sm:text-[17px] text-[#6E6E73] max-w-2xl leading-[1.68] text-balance">
              {t.hero.subtitle}
            </p>

            {/* 主副行动按钮（饱满 48px 标准高度 h-12，彻底修复高度压扁问题） */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3.5 w-full sm:w-auto">
              <a
                href={primaryDownload.href}
                className="w-full sm:w-auto h-12 px-7 rounded-xl bg-[#0055FF] hover:bg-[#0044CC] text-white font-semibold text-[15.5px] inline-flex items-center justify-center gap-2.5 shadow-[0_10px_28px_-6px_rgba(0,85,255,0.36)] transition-all active:scale-[0.99]"
              >
                <PrimaryOsIcon className="w-[18px] h-[18px] shrink-0" />
                <span>{primaryDownload.label}</span>
                <span className="text-[12px] font-mono font-normal text-white/80 pl-0.5">
                  v{releaseAssets.version}
                </span>
              </a>

              <a
                href="#downloads"
                className="w-full sm:w-auto h-12 px-6 rounded-xl bg-white hover:bg-black/[0.025] border border-black/[0.11] text-[#1D1D1F] font-medium text-[15px] inline-flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
              >
                <span>{t.hero.allPlatforms}</span>
              </a>

              <a
                href="#changelog"
                className="w-full sm:w-auto h-12 px-4 rounded-xl text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-black/[0.03] font-medium text-[14.5px] inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <History className="w-4 h-4 shrink-0" />
                <span>{t.hero.viewChangelog}</span>
              </a>
            </div>

            <p className="mt-4 text-[12px] text-[#6E6E73]/85">{t.hero.runtimeNote}</p>
          </div>

          {/* 交互主舞台：管理类 Tab 置前 */}
          <div className="mt-10 sm:mt-12">
            <div
              role="tablist"
              aria-label="SkillHub 核心界面预览"
              className="flex items-center justify-start sm:justify-center gap-5 sm:gap-7 overflow-x-auto border-b border-black/[0.08] mb-5 px-1"
            >
              {t.hero.tabs.map((tab, idx) => {
                const active = idx === heroTabIdx;
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={active}
                    type="button"
                    onClick={() => setHeroTabIdx(idx)}
                    className={`relative pb-3 pt-1 text-[13.5px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      active ? "text-[#1D1D1F]" : "text-[#6E6E73] hover:text-[#1D1D1F]"
                    }`}
                  >
                    {tab.label}
                    <span
                      className={`absolute left-0 right-0 -bottom-[1px] h-[2px] rounded-full transition-opacity ${
                        active ? "bg-[#0055FF] opacity-100" : "opacity-0"
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            <div className="studio-window rounded-2xl sm:rounded-[22px] overflow-hidden">
              <div
                onClick={() => openLightbox(activeHeroTab.image, activeHeroTab.alt)}
                className="relative bg-[#F5F6F9] p-2.5 sm:p-4 md:p-5 cursor-zoom-in group"
              >
                <AnimatePresence mode="wait">
                  <motion.img
                    key={activeHeroTab.id}
                    src={activeHeroTab.image}
                    alt={activeHeroTab.alt}
                    fetchPriority={heroTabIdx === 0 ? "high" : undefined}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="w-full h-auto rounded-xl sm:rounded-2xl border border-black/[0.06] shadow-[0_12px_36px_rgba(0,0,0,0.07)] block"
                  />
                </AnimatePresence>

                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/65 text-white text-[11px] backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-7 right-7 pointer-events-none">
                  <Maximize2 className="w-3 h-3" />
                  <span>{t.hero.clickToZoom}</span>
                </span>
              </div>

              {/* 舞台底部一句话信息栏 */}
              <div className="px-4 sm:px-6 py-3.5 bg-white border-t border-black/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center flex-wrap gap-2.5">
                  <span className="px-2.5 py-0.5 rounded-md text-[11.5px] font-medium bg-[#0055FF]/[0.08] text-[#0055FF]">
                    {activeHeroTab.badge}
                  </span>
                  <p className="text-[13px] text-[#6E6E73]">{activeHeroTab.caption}</p>
                </div>
                <span className="text-[11.5px] text-[#6E6E73]/75 shrink-0 font-mono">
                  {heroTabIdx + 1} / {t.hero.tabs.length}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* =================================================================== */}
        {/* 第 2 屏：双生态连接带（带定制品牌矢量 Logo 装饰） */}
        {/* =================================================================== */}
        <section className="border-y border-black/[0.06] bg-white">
          <div className="max-w-6xl mx-auto px-5 sm:px-6 py-7 grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 lg:divide-x lg:divide-black/[0.06]">
            <div className="space-y-3">
              <div className="text-[11.5px] font-semibold uppercase tracking-wider text-[#6E6E73]">
                {t.ecosystem.agentsLabel}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {SUPPORTED_AGENTS.map((agent) => (
                  <span
                    key={agent.id}
                    className="inline-flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl text-[12.5px] font-medium bg-[#FAFAFC] border border-black/[0.07] text-[#1D1D1F]"
                  >
                    <AgentBrandLogo id={agent.id} />
                    <span>{agent.name}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-3 lg:pl-10">
              <div className="text-[11.5px] font-semibold uppercase tracking-wider text-[#6E6E73]">
                {t.ecosystem.sourcesLabel}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {OPEN_ECOSYSTEM_SOURCES.map((src) => (
                  <a
                    key={src.id}
                    href={src.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-xl text-[12.5px] font-medium bg-[#FAFAFC] border border-black/[0.07] text-[#1D1D1F]/85 hover:text-[#0055FF] hover:border-[#0055FF]/25 transition-colors"
                  >
                    <EcosystemSourceLogo id={src.id} />
                    <span>{src.name}</span>
                    <ArrowUpRight className="w-3 h-3 text-[#6E6E73] opacity-65" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* =================================================================== */}
        {/* 板块一 (#desktop)：类系统资源管理器的桌面手感（核心看家本领排第一！） */}
        {/* =================================================================== */}
        <section
          id="desktop"
          className="deferred-section py-20 sm:py-24 scroll-mt-16"
        >
          <div className="max-w-6xl mx-auto px-5 sm:px-6">
            <div className="max-w-2xl mb-12">
              <span className="text-[12px] font-semibold tracking-wider uppercase text-[#0055FF]">
                {t.desktopSection.eyebrow}
              </span>
              <h2 className="mt-2 text-[28px] sm:text-[38px] font-bold tracking-tight text-[#1D1D1F] leading-[1.2]">
                {t.desktopSection.title}
              </h2>
              <p className="mt-3 text-[15px] sm:text-[16px] text-[#6E6E73] leading-relaxed">
                {t.desktopSection.subtitle}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Bento 1 (7列)：拉框多选 & 原生右键 */}
              <div className="lg:col-span-7 rounded-2xl bg-white border border-black/[0.07] p-6 flex flex-col justify-between shadow-2xs">
                <div className="mb-5">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#0055FF]/[0.08] text-[#0055FF] text-[11.5px] font-medium mb-3">
                    <MousePointerClick className="w-3.5 h-3.5" />
                    <span>{t.desktopSection.marqueeCard.tag}</span>
                  </div>
                  <h3 className="text-[19px] font-bold text-[#1D1D1F]">
                    {t.desktopSection.marqueeCard.title}
                  </h3>
                  <p className="mt-1.5 text-[13.5px] text-[#6E6E73] leading-relaxed">
                    {t.desktopSection.marqueeCard.desc}
                  </p>
                </div>
                <div
                  onClick={() =>
                    openLightbox(
                      "./screenshots/multi-select.png",
                      t.desktopSection.marqueeCard.title
                    )
                  }
                  className="rounded-xl overflow-hidden border border-black/[0.07] bg-[#FAFAFC] cursor-zoom-in"
                >
                  <img
                    src="./screenshots/multi-select.png"
                    alt={t.desktopSection.marqueeCard.title}
                    loading="lazy"
                    className="w-full h-auto block"
                  />
                </div>
              </div>

              {/* Bento 2 (5列)：拖拽文件夹直接导入 */}
              <div className="lg:col-span-5 rounded-2xl bg-white border border-black/[0.07] p-6 flex flex-col justify-between shadow-2xs">
                <div className="mb-5">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-black/[0.05] text-[#1D1D1F] text-[11.5px] font-medium mb-3">
                    <Layers className="w-3.5 h-3.5" />
                    <span>{t.desktopSection.dragCard.tag}</span>
                  </div>
                  <h3 className="text-[19px] font-bold text-[#1D1D1F]">
                    {t.desktopSection.dragCard.title}
                  </h3>
                  <p className="mt-1.5 text-[13.5px] text-[#6E6E73] leading-relaxed">
                    {t.desktopSection.dragCard.desc}
                  </p>
                </div>
                <div
                  onClick={() =>
                    openLightbox("./screenshots/drag-drop.png", t.desktopSection.dragCard.title)
                  }
                  className="rounded-xl overflow-hidden border border-black/[0.07] bg-[#FAFAFC] cursor-zoom-in"
                >
                  <img
                    src="./screenshots/drag-drop.png"
                    alt={t.desktopSection.dragCard.title}
                    loading="lazy"
                    className="w-full h-auto block"
                  />
                </div>
              </div>

              {/* Bento 3 (5列)：空格键 QuickLook 速览 */}
              <div className="lg:col-span-5 rounded-2xl bg-white border border-black/[0.07] p-6 flex flex-col justify-between shadow-2xs">
                <div className="mb-5">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-black/[0.05] text-[#1D1D1F] text-[11.5px] font-medium mb-3">
                    <Eye className="w-3.5 h-3.5" />
                    <span>{t.desktopSection.quickLookCard.tag}</span>
                  </div>
                  <h3 className="text-[19px] font-bold text-[#1D1D1F]">
                    {t.desktopSection.quickLookCard.title}
                  </h3>
                  <p className="mt-1.5 text-[13.5px] text-[#6E6E73] leading-relaxed">
                    {t.desktopSection.quickLookCard.desc}
                  </p>
                </div>
                <div
                  onClick={() =>
                    openLightbox(
                      "./screenshots/quick-look.png",
                      t.desktopSection.quickLookCard.title
                    )
                  }
                  className="rounded-xl overflow-hidden border border-black/[0.07] bg-[#FAFAFC] cursor-zoom-in"
                >
                  <img
                    src="./screenshots/quick-look.png"
                    alt={t.desktopSection.quickLookCard.title}
                    loading="lazy"
                    className="w-full h-auto block"
                  />
                </div>
              </div>

              {/* Bento 4 (7列)：长文大纲导航 + 三轨中英翻译（卡内双图切换） */}
              <div className="lg:col-span-7 rounded-2xl bg-white border border-black/[0.07] p-6 flex flex-col justify-between shadow-2xs">
                <div className="mb-5">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#0055FF]/[0.08] text-[#0055FF] text-[11.5px] font-medium whitespace-nowrap shrink-0">
                      <Compass className="w-3.5 h-3.5 shrink-0" />
                      <span>{t.desktopSection.readingCard.tag}</span>
                    </div>

                    <div className="inline-flex p-0.5 rounded-lg bg-black/[0.05] text-[12px] shrink-0">
                      <button
                        type="button"
                        onClick={() => setReadingTab("outline")}
                        className={`px-2.5 py-1 rounded-md font-medium whitespace-nowrap transition-colors cursor-pointer ${
                          readingTab === "outline"
                            ? "bg-white text-[#1D1D1F] shadow-2xs"
                            : "text-[#6E6E73] hover:text-[#1D1D1F]"
                        }`}
                      >
                        {t.desktopSection.readingCard.tabOutline}
                      </button>
                      <button
                        type="button"
                        onClick={() => setReadingTab("translate")}
                        className={`px-2.5 py-1 rounded-md font-medium whitespace-nowrap transition-colors cursor-pointer ${
                          readingTab === "translate"
                            ? "bg-white text-[#1D1D1F] shadow-2xs"
                            : "text-[#6E6E73] hover:text-[#1D1D1F]"
                        }`}
                      >
                        {t.desktopSection.readingCard.tabTranslate}
                      </button>
                    </div>
                  </div>

                  <h3 className="text-[19px] font-bold text-[#1D1D1F]">
                    {t.desktopSection.readingCard.title}
                  </h3>
                  <p className="mt-1.5 text-[13.5px] text-[#6E6E73] leading-relaxed">
                    {t.desktopSection.readingCard.desc}
                  </p>
                </div>

                <div
                  onClick={() =>
                    openLightbox(
                      readingTab === "outline"
                        ? "./screenshots/doc-outline.png"
                        : "./screenshots/translate.png",
                      t.desktopSection.readingCard.title
                    )
                  }
                  className="rounded-xl overflow-hidden border border-black/[0.07] bg-[#FAFAFC] cursor-zoom-in"
                >
                  <img
                    src={
                      readingTab === "outline"
                        ? "./screenshots/doc-outline.png"
                        : "./screenshots/translate.png"
                    }
                    alt={t.desktopSection.readingCard.title}
                    loading="lazy"
                    className="w-full h-auto block"
                  />
                </div>
              </div>

              {/* Bento 5 (6列)：双层独立星标与标签面板 */}
              <div className="lg:col-span-6 rounded-2xl bg-white border border-black/[0.07] p-6 flex flex-col justify-between shadow-2xs">
                <div className="mb-5">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-black/[0.05] text-[#1D1D1F] text-[11.5px] font-medium mb-3">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{t.desktopSection.twoTierCard.tag}</span>
                  </div>
                  <h3 className="text-[18px] font-bold text-[#1D1D1F]">
                    {t.desktopSection.twoTierCard.title}
                  </h3>
                  <p className="mt-1.5 text-[13.5px] text-[#6E6E73] leading-relaxed">
                    {t.desktopSection.twoTierCard.desc}
                  </p>
                </div>
                <div
                  onClick={() =>
                    openLightbox(
                      "./screenshots/category-management.png",
                      t.desktopSection.twoTierCard.title
                    )
                  }
                  className="rounded-xl overflow-hidden border border-black/[0.07] bg-[#FAFAFC] cursor-zoom-in"
                >
                  <img
                    src="./screenshots/category-management.png"
                    alt={t.desktopSection.twoTierCard.title}
                    loading="lazy"
                    className="w-full h-auto block"
                  />
                </div>
              </div>

              {/* Bento 6 (6列)：多源统一收纳 */}
              <div className="lg:col-span-6 rounded-2xl bg-white border border-black/[0.07] p-6 flex flex-col justify-between shadow-2xs">
                <div className="mb-5">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-black/[0.05] text-[#1D1D1F] text-[11.5px] font-medium mb-3">
                    <Globe className="w-3.5 h-3.5" />
                    <span>{t.desktopSection.asyncGitCard.tag}</span>
                  </div>
                  <h3 className="text-[18px] font-bold text-[#1D1D1F]">
                    {t.desktopSection.asyncGitCard.title}
                  </h3>
                  <p className="mt-1.5 text-[13.5px] text-[#6E6E73] leading-relaxed">
                    {t.desktopSection.asyncGitCard.desc}
                  </p>
                </div>
                <div
                  onClick={() =>
                    openLightbox("./screenshots/import-skill.png", t.desktopSection.asyncGitCard.title)
                  }
                  className="rounded-xl overflow-hidden border border-black/[0.07] bg-[#FAFAFC] cursor-zoom-in"
                >
                  <img
                    src="./screenshots/import-skill.png"
                    alt={t.desktopSection.asyncGitCard.title}
                    loading="lazy"
                    className="w-full h-auto block"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =================================================================== */}
        {/* 板块二 (#agents)：随手调用 & 跨 Agent 软链接挂载（确保顶栏 100% 单行不折行） */}
        {/* =================================================================== */}
        <section
          id="agents"
          className="deferred-section border-t border-black/[0.06] bg-white py-20 sm:py-24 scroll-mt-16"
        >
          <div className="max-w-6xl mx-auto px-5 sm:px-6">
            <div className="max-w-2xl mb-12">
              <span className="text-[12px] font-semibold tracking-wider uppercase text-[#0055FF]">
                {t.agentSection.eyebrow}
              </span>
              <h2 className="mt-2 text-[28px] sm:text-[38px] font-bold tracking-tight text-[#1D1D1F] leading-[1.2]">
                {t.agentSection.title}
              </h2>
              <p className="mt-3 text-[15px] sm:text-[16px] text-[#6E6E73] leading-relaxed">
                {t.agentSection.subtitle}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {t.agentSection.cards.map((card, cIdx) => {
                const activeIdx = agentCardImgIdx[card.id] || 0;
                const activeImg = card.images[activeIdx] || card.images[0];
                const CardIcon = cIdx === 0 ? Zap : cIdx === 1 ? Bot : Search;
                return (
                  <div
                    key={card.id}
                    className="rounded-2xl bg-[#FAFAFC] border border-black/[0.07] p-5 sm:p-6 flex flex-col justify-between"
                  >
                    <div className="mb-5">
                      {/* 顶部标签与图片切换器强制单行对齐，绝不折行 */}
                      <div className="flex items-center justify-between gap-2 flex-nowrap mb-3.5 min-h-[28px]">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0055FF]/[0.08] text-[#0055FF] text-[11.5px] font-medium whitespace-nowrap shrink-0">
                          <CardIcon className="w-3.5 h-3.5 shrink-0" />
                          <span>{card.tag}</span>
                        </span>

                        {card.images.length > 1 && (
                          <div className="inline-flex items-center p-0.5 rounded-lg bg-black/[0.05] text-[11.5px] shrink-0">
                            {card.images.map((img, iIdx) => (
                              <button
                                key={img.label}
                                type="button"
                                onClick={() =>
                                  setAgentCardImgIdx((prev) => ({ ...prev, [card.id]: iIdx }))
                                }
                                className={`px-2 py-0.5 rounded-md font-medium whitespace-nowrap transition-colors cursor-pointer ${
                                  iIdx === activeIdx
                                    ? "bg-white text-[#1D1D1F] shadow-2xs"
                                    : "text-[#6E6E73] hover:text-[#1D1D1F]"
                                }`}
                              >
                                {img.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <h3 className="text-[17px] font-bold text-[#1D1D1F] leading-snug">
                        {card.title}
                      </h3>
                      <p className="mt-2 text-[13.5px] text-[#6E6E73] leading-relaxed">
                        {card.desc}
                      </p>
                    </div>

                    <div
                      onClick={() => openLightbox(activeImg.src, activeImg.alt)}
                      className="rounded-xl overflow-hidden border border-black/[0.07] bg-white shadow-xs cursor-zoom-in mt-auto"
                    >
                      <img
                        src={activeImg.src}
                        alt={activeImg.alt}
                        loading="lazy"
                        className="w-full h-auto block"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* =================================================================== */}
        {/* 板块三 (#prompts)：本地双视图提示词管理 + 四大开源提示词生态 */}
        {/* =================================================================== */}
        <section
          id="prompts"
          className="deferred-section border-t border-black/[0.06] py-20 sm:py-24 scroll-mt-16"
        >
          <div className="max-w-6xl mx-auto px-5 sm:px-6">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10">
              <div className="max-w-2xl">
                <span className="text-[12px] font-semibold tracking-wider uppercase text-[#0055FF]">
                  {t.promptsSection.eyebrow}
                </span>
                <h2 className="mt-2 text-[28px] sm:text-[38px] font-bold tracking-tight text-[#1D1D1F] leading-[1.2]">
                  {t.promptsSection.title}
                </h2>
                <p className="mt-3 text-[15px] sm:text-[16px] text-[#6E6E73] leading-relaxed">
                  {t.promptsSection.subtitle}
                </p>
              </div>

              {/* 视图切换器 */}
              <div className="inline-flex p-1 rounded-xl bg-black/[0.05] self-start shrink-0">
                {t.promptsSection.slides.map((slide, idx) => (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => setPromptSlideIdx(idx)}
                    className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      idx === promptSlideIdx
                        ? "bg-white text-[#1D1D1F] shadow-xs"
                        : "text-[#6E6E73] hover:text-[#1D1D1F]"
                    }`}
                  >
                    {slide.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 4 大开源频道说明条 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {t.promptsSection.channels.map((ch) => (
                <div
                  key={ch.name}
                  className="bg-white rounded-xl border border-black/[0.07] px-4 py-3"
                >
                  <div className="text-[13.5px] font-semibold text-[#1D1D1F] flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-[#0055FF] shrink-0" />
                    <span className="truncate">{ch.name}</span>
                  </div>
                  <div className="text-[12px] text-[#6E6E73] mt-0.5 truncate">{ch.meta}</div>
                </div>
              ))}
            </div>

            <div className="studio-window rounded-2xl overflow-hidden bg-white">
              <div
                onClick={() => openLightbox(activePromptSlide.image, activePromptSlide.alt)}
                className="p-3 sm:p-4 bg-[#F5F6F9] cursor-zoom-in"
              >
                <img
                  src={activePromptSlide.image}
                  alt={activePromptSlide.alt}
                  loading="lazy"
                  className="w-full h-auto rounded-xl border border-black/[0.06] block"
                />
              </div>
              <div className="px-5 sm:px-6 py-4 bg-white border-t border-black/[0.06]">
                <h3 className="text-[16px] font-bold text-[#1D1D1F]">
                  {activePromptSlide.title}
                </h3>
                <p className="text-[13.5px] text-[#6E6E73] mt-0.5">{activePromptSlide.desc}</p>
              </div>
            </div>
          </div>
        </section>

        {/* =================================================================== */}
        {/* 板块四 (#discover)：全新内置「资源中心」—— 按需发现与单技能精准安装 */}
        {/* =================================================================== */}
        <section
          id="discover"
          className="deferred-section border-t border-black/[0.06] bg-white py-20 sm:py-24 scroll-mt-16"
        >
          <div className="max-w-6xl mx-auto px-5 sm:px-6">
            <div className="max-w-2xl mb-12">
              <span className="text-[12px] font-semibold tracking-wider uppercase text-[#0055FF]">
                {t.discoverSection.eyebrow}
              </span>
              <h2 className="mt-2 text-[28px] sm:text-[38px] font-bold tracking-tight text-[#1D1D1F] leading-[1.2]">
                {t.discoverSection.title}
              </h2>
              <p className="mt-3 text-[15px] sm:text-[16px] text-[#6E6E73] leading-relaxed">
                {t.discoverSection.subtitle}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
              {/* 左侧可切换三步卡 */}
              <div className="lg:col-span-5 flex flex-col gap-3">
                {t.discoverSection.steps.map((step, idx) => {
                  const active = idx === discoverStepIdx;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => setDiscoverStepIdx(idx)}
                      className={`w-full text-left p-5 rounded-2xl border transition-all cursor-pointer ${
                        active
                          ? "bg-[#FAFAFC] border-[#0055FF]/35 shadow-[0_8px_28px_-8px_rgba(0,85,255,0.10)]"
                          : "bg-white hover:bg-[#FAFAFC]/60 border-black/[0.07]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 mb-2">
                        <span
                          className={`px-2 py-0.5 rounded-md font-mono text-[11.5px] font-semibold ${
                            active
                              ? "bg-[#0055FF] text-white"
                              : "bg-black/[0.05] text-[#6E6E73]"
                          }`}
                        >
                          {step.step}
                        </span>
                        <h3 className="text-[16px] font-bold text-[#1D1D1F]">{step.title}</h3>
                      </div>
                      <p className="text-[13.5px] text-[#6E6E73] leading-relaxed">{step.desc}</p>

                      {active && (
                        <ul className="mt-3.5 pt-3 border-t border-black/[0.06] space-y-1.5">
                          {step.highlights.map((hl) => (
                            <li
                              key={hl}
                              className="flex items-center gap-2 text-[12.5px] text-[#1D1D1F]/85"
                            >
                              <Check className="w-3.5 h-3.5 text-[#0055FF] shrink-0" />
                              <span>{hl}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 右侧联动窗口 */}
              <div className="lg:col-span-7 studio-window rounded-2xl p-3 sm:p-4 bg-white">
                <div
                  onClick={() => openLightbox(activeDiscoverStep.image, activeDiscoverStep.alt)}
                  className="rounded-xl overflow-hidden bg-[#F5F6F9] border border-black/[0.06] cursor-zoom-in"
                >
                  <img
                    src={activeDiscoverStep.image}
                    alt={activeDiscoverStep.alt}
                    loading="lazy"
                    className="w-full h-auto block"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =================================================================== */}
        {/* 板块五：原生轻量架构与本地优先底座 */}
        {/* =================================================================== */}
        <section className="deferred-section border-t border-black/[0.06] py-20 sm:py-24">
          <div className="max-w-6xl mx-auto px-5 sm:px-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-6 space-y-6">
                <div>
                  <span className="text-[12px] font-semibold tracking-wider uppercase text-[#0055FF]">
                    {t.specsSection.eyebrow}
                  </span>
                  <h2 className="mt-2 text-[28px] sm:text-[36px] font-bold tracking-tight text-[#1D1D1F] leading-[1.2]">
                    {t.specsSection.title}
                  </h2>
                  <p className="mt-3 text-[15px] text-[#6E6E73] leading-relaxed">
                    {t.specsSection.subtitle}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {t.specsSection.items.map((item, idx) => {
                    const SpecIcon = specIcons[idx] || Shield;
                    return (
                      <div
                        key={item.title}
                        className="p-4 rounded-xl bg-white border border-black/[0.07]"
                      >
                        <div className="w-8 h-8 rounded-lg bg-[#0055FF]/[0.08] text-[#0055FF] flex items-center justify-center mb-2.5">
                          <SpecIcon className="w-4 h-4" />
                        </div>
                        <h3 className="text-[14.5px] font-bold text-[#1D1D1F]">{item.title}</h3>
                        <p className="mt-1 text-[12.5px] text-[#6E6E73] leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="lg:col-span-6">
                <div className="studio-window rounded-2xl overflow-hidden bg-white">
                  <div
                    onClick={() =>
                      openLightbox("./screenshots/backup-restore.png", t.specsSection.backupCaption)
                    }
                    className="p-3 bg-[#F5F6F9] cursor-zoom-in"
                  >
                    <img
                      src="./screenshots/backup-restore.png"
                      alt={t.specsSection.backupCaption}
                      loading="lazy"
                      className="w-full h-auto rounded-xl border border-black/[0.06] block"
                    />
                  </div>
                  <div className="px-4 py-3 text-[12.5px] text-[#6E6E73] border-t border-black/[0.06] bg-white">
                    {t.specsSection.backupCaption}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =================================================================== */}
        {/* 板块六 (#changelog)：构建期全自动同步的「更新日志（Changelog）」专栏 */}
        {/* =================================================================== */}
        <section
          id="changelog"
          className="deferred-section border-t border-black/[0.06] bg-white py-20 sm:py-24 scroll-mt-16"
        >
          <div className="max-w-4xl mx-auto px-5 sm:px-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
              <div>
                <span className="text-[12px] font-semibold tracking-wider uppercase text-[#0055FF]">
                  {t.changelogSection.eyebrow}
                </span>
                <h2 className="mt-1.5 text-[28px] sm:text-[36px] font-bold tracking-tight text-[#1D1D1F]">
                  {t.changelogSection.title}
                </h2>
                <p className="mt-2 text-[14.5px] text-[#6E6E73]">{t.changelogSection.subtitle}</p>
                {t.changelogSection.zhNotice && (
                  <p className="mt-1 text-[12px] text-[#6E6E73]/80">
                    {t.changelogSection.zhNotice}
                  </p>
                )}
              </div>

              <a
                href={`${GITHUB_REPO_URL}/releases`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium bg-[#FAFAFC] border border-black/[0.09] text-[#1D1D1F] hover:border-black/20 transition-colors self-start sm:self-auto shrink-0"
              >
                <span>{t.changelogSection.viewOnGithub}</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-[#6E6E73]" />
              </a>
            </div>

            {/* 近期重点版本完整展示（前 3 个版本） */}
            <div className="space-y-6">
              {featuredReleases.map((rel, rIdx) => {
                const isLatest = rIdx === 0;
                return (
                  <article
                    key={rel.version}
                    className={`rounded-2xl border p-6 sm:p-7 ${
                      isLatest
                        ? "bg-[#FAFAFC] border-[#0055FF]/25 shadow-[0_8px_30px_-12px_rgba(0,85,255,0.10)]"
                        : "bg-white border-black/[0.08]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-5 border-b border-black/[0.06]">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[20px] font-bold font-mono text-[#1D1D1F]">
                          v{rel.version}
                        </span>
                        {isLatest && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#0055FF]/[0.09] text-[#0055FF]">
                            {t.changelogSection.latestBadge}
                          </span>
                        )}
                      </div>
                      {rel.date && (
                        <time className="text-[12.5px] font-mono text-[#6E6E73]">{rel.date}</time>
                      )}
                    </div>

                    <div className="space-y-5">
                      {rel.sections.map((sec) => (
                        <div key={sec.title} className="space-y-2.5">
                          <h3 className="text-[12.5px] font-semibold text-[#6E6E73] uppercase tracking-wider">
                            {sec.title}
                          </h3>
                          <ul className="space-y-2">
                            {sec.items.map((item, iIdx) => (
                              <li
                                key={iIdx}
                                className="text-[13.5px] text-[#1D1D1F]/85 leading-relaxed pl-4 relative before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-[#0055FF]/60 before:absolute before:left-0 before:top-[9px]"
                              >
                                {item.lead && (
                                  <strong className="font-semibold text-[#1D1D1F]">
                                    {item.lead}：
                                  </strong>
                                )}
                                <InlineRichText text={item.body} />
                                {item.subItems && item.subItems.length > 0 && (
                                  <ul className="mt-1.5 space-y-1 pl-3 border-l border-black/[0.08]">
                                    {item.subItems.map((sub, sIdx) => (
                                      <li key={sIdx} className="text-[12.5px] text-[#6E6E73]">
                                        <InlineRichText text={sub} />
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>

            {/* 更早历史版本折叠手风琴 */}
            {olderReleases.length > 0 && (
              <div className="mt-6">
                {!showAllReleases ? (
                  <button
                    type="button"
                    onClick={() => setShowAllReleases(true)}
                    className="w-full py-3 rounded-xl bg-[#FAFAFC] hover:bg-black/[0.03] border border-black/[0.08] text-[13px] font-medium text-[#1D1D1F] inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>
                      {t.changelogSection.showAllPrefix}
                      {olderReleases.length}
                      {t.changelogSection.showAllSuffix}
                    </span>
                    <ChevronDown className="w-4 h-4 text-[#6E6E73]" />
                  </button>
                ) : (
                  <div className="space-y-3 mt-4">
                    <div className="rounded-2xl border border-black/[0.08] divide-y divide-black/[0.06] overflow-hidden bg-white">
                      {olderReleases.map((rel) => {
                        const isOpen = !!expandedOldVersions[rel.version];
                        const totalCount = rel.sections.reduce(
                          (acc, s) => acc + s.items.length,
                          0
                        );
                        return (
                          <div key={rel.version}>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedOldVersions((prev) => ({
                                  ...prev,
                                  [rel.version]: !prev[rel.version],
                                }))
                              }
                              className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-black/[0.015] transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-3">
                                <span className="font-mono font-bold text-[15px] text-[#1D1D1F]">
                                  v{rel.version}
                                </span>
                                {rel.date && (
                                  <span className="text-[12px] font-mono text-[#6E6E73]">
                                    {rel.date}
                                  </span>
                                )}
                                <span className="text-[11.5px] px-2 py-0.5 rounded bg-black/[0.04] text-[#6E6E73]">
                                  {totalCount} 项更新
                                </span>
                              </div>
                              <ChevronDown
                                className={`w-4 h-4 text-[#6E6E73] transition-transform ${
                                  isOpen ? "rotate-180" : ""
                                }`}
                              />
                            </button>

                            {isOpen && (
                              <div className="px-5 pb-5 pt-2 bg-[#FAFAFC]/60 space-y-4">
                                {rel.sections.map((sec) => (
                                  <div key={sec.title} className="space-y-1.5">
                                    <div className="text-[11.5px] font-semibold text-[#6E6E73]">
                                      {sec.title}
                                    </div>
                                    <ul className="space-y-1.5">
                                      {sec.items.map((item, idx) => (
                                        <li
                                          key={idx}
                                          className="text-[13px] text-[#1D1D1F]/80 leading-relaxed pl-3.5 relative before:content-[''] before:w-1 before:h-1 before:rounded-full before:bg-[#6E6E73] before:absolute before:left-0 before:top-[9px]"
                                        >
                                          {item.lead && (
                                            <strong className="font-medium text-[#1D1D1F]">
                                              {item.lead}：
                                            </strong>
                                          )}
                                          <InlineRichText text={item.body} />
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowAllReleases(false)}
                      className="w-full py-2.5 text-[12.5px] font-medium text-[#6E6E73] hover:text-[#1D1D1F] cursor-pointer"
                    >
                      {t.changelogSection.collapseHistory}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* =================================================================== */}
        {/* 板块七 (#downloads)：全平台下载中心（支持官方源 / 国内镜像切换） */}
        {/* =================================================================== */}
        <section
          id="downloads"
          className="deferred-section border-t border-black/[0.06] py-20 sm:py-28 scroll-mt-16"
        >
          <div className="max-w-5xl mx-auto px-5 sm:px-6">
            <div className="studio-window rounded-3xl p-8 sm:p-12 md:p-14 bg-white text-center">
              <h2 className="text-[28px] sm:text-[40px] font-bold tracking-tight text-[#1D1D1F]">
                {t.downloadSection.titlePrefix}
                <span className="text-[#0055FF]">{t.downloadSection.titleHighlight}</span>
              </h2>
              <p className="mt-3 text-[15px] sm:text-[16.5px] text-[#6E6E73] max-w-xl mx-auto">
                {t.downloadSection.subtitle}
              </p>

              {/* 下载源切换开关：GitHub 官方 / 国内加速镜像 */}
              <div className="mt-6 flex flex-col items-center gap-2">
                <div className="inline-flex items-center gap-2 p-1 rounded-xl bg-black/[0.05] text-[12.5px]">
                  <span className="pl-2.5 text-[#6E6E73] font-medium">
                    {t.downloadSection.sourceLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMirror("github")}
                    className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                      mirror === "github"
                        ? "bg-white text-[#1D1D1F] shadow-2xs"
                        : "text-[#6E6E73] hover:text-[#1D1D1F]"
                    }`}
                  >
                    {t.downloadSection.sourceGithub}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMirror("mirror")}
                    className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                      mirror === "mirror"
                        ? "bg-white text-[#0055FF] shadow-2xs"
                        : "text-[#6E6E73] hover:text-[#1D1D1F]"
                    }`}
                  >
                    {t.downloadSection.sourceMirror}
                  </button>
                </div>

                {mirror === "mirror" && (
                  <p className="text-[12px] text-[#0055FF]">{t.downloadSection.mirrorHint}</p>
                )}
              </div>

              {/* 三大操作系统下载卡片 */}
              <div className="mt-9 grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
                {[
                  {
                    key: "mac" as const,
                    name: "macOS",
                    icon: MacAppleIcon,
                    desc: t.downloadSection.platforms.macDesc,
                    btn: t.downloadSection.platforms.macFormat,
                    url: applyMirror(releaseAssets.macUrl, mirror),
                  },
                  {
                    key: "win" as const,
                    name: "Windows",
                    icon: WindowsLogoIcon,
                    desc: t.downloadSection.platforms.winDesc,
                    btn: t.downloadSection.platforms.winFormat,
                    url: applyMirror(releaseAssets.winUrl, mirror),
                  },
                  {
                    key: "linux" as const,
                    name: "Linux",
                    icon: LinuxTuxIcon,
                    desc: t.downloadSection.platforms.linuxDesc,
                    btn: t.downloadSection.platforms.linuxFormat,
                    url: applyMirror(releaseAssets.linuxUrl, mirror),
                  },
                ].map((plat) => {
                  const Icon = plat.icon;
                  const isCurrentOs = osType === plat.key;
                  return (
                    <a
                      key={plat.key}
                      href={plat.url}
                      className={`group rounded-2xl p-6 border transition-all flex flex-col justify-between ${
                        isCurrentOs
                          ? "bg-[#0055FF]/[0.03] border-[#0055FF]/35 shadow-xs"
                          : "bg-[#FAFAFC] hover:bg-white border-black/[0.08] hover:border-black/20"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <div className="w-11 h-11 rounded-xl bg-white border border-black/[0.08] shadow-2xs flex items-center justify-center text-[#1D1D1F]">
                            <Icon className="w-5 h-5" />
                          </div>
                          <span className="text-[11.5px] font-mono text-[#6E6E73]">
                            v{releaseAssets.version}
                          </span>
                        </div>
                        <h3 className="text-[18px] font-bold text-[#1D1D1F]">{plat.name}</h3>
                        <p className="text-[12.5px] text-[#6E6E73] mt-1">{plat.desc}</p>
                      </div>

                      <div
                        className={`mt-6 h-10 px-3.5 rounded-lg text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
                          isCurrentOs
                            ? "bg-[#0055FF] group-hover:bg-[#0044CC] text-white"
                            : "bg-[#0055FF]/[0.08] group-hover:bg-[#0055FF] text-[#0055FF] group-hover:text-white"
                        }`}
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{plat.btn}</span>
                      </div>
                    </a>
                  );
                })}
              </div>

              <div className="mt-7">
                <a
                  href={`${GITHUB_REPO_URL}/releases`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] font-medium text-[#6E6E73] hover:text-[#0055FF] transition-colors"
                >
                  {t.downloadSection.allReleasesLink}
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ===================================================================== */}
      {/* 页脚 */}
      {/* ===================================================================== */}
      <footer className="border-t border-black/[0.07] bg-white py-12">
        <div className="max-w-6xl mx-auto px-5 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-8 border-b border-black/[0.06]">
            <div className="md:col-span-5 space-y-3">
              <div className="flex items-center gap-2.5">
                <img
                  src="./icon.png"
                  alt="SkillHub Logo"
                  width={26}
                  height={26}
                  className="w-[26px] h-[26px] rounded-md"
                />
                <span className="font-bold text-[16px] text-[#1D1D1F]">SkillHub</span>
              </div>
              <p className="text-[13px] text-[#6E6E73] max-w-sm leading-relaxed">
                {t.footer.tagline}
              </p>
            </div>

            <div className="md:col-span-4 space-y-2.5">
              <h4 className="text-[12px] font-semibold uppercase tracking-wider text-[#1D1D1F]">
                {t.footer.creditsTitle}
              </h4>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[12.5px] text-[#6E6E73]">
                {OPEN_ECOSYSTEM_SOURCES.map((src) => (
                  <a
                    key={src.id}
                    href={src.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#0055FF] transition-colors"
                  >
                    {src.name}
                  </a>
                ))}
              </div>
            </div>

            <div className="md:col-span-3 space-y-2.5">
              <h4 className="text-[12px] font-semibold uppercase tracking-wider text-[#1D1D1F]">
                {t.footer.linksTitle}
              </h4>
              <div className="flex flex-col gap-1.5 text-[13px] text-[#6E6E73]">
                <button
                  type="button"
                  onClick={openCommunityModal}
                  className="text-left hover:text-[#0055FF] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>{t.nav.community}</span>
                </button>
                <a
                  href={`${GITHUB_REPO_URL}/issues`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#0055FF] transition-colors"
                >
                  {t.footer.issues}
                </a>
                <a
                  href={`${GITHUB_REPO_URL}/blob/main/docs/DONATE.md`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#0055FF] transition-colors inline-flex items-center gap-1.5"
                >
                  <Heart className="w-3.5 h-3.5" />
                  <span>{t.footer.donate}</span>
                </a>
              </div>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[12.5px] text-[#6E6E73]">
            <p>
              © {new Date().getFullYear()}{" "}
              <a
                href="https://github.com/VipBeCool"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#1D1D1F] hover:text-[#0055FF]"
              >
                VipBeCool
              </a>
              . {t.footer.copyright}
            </p>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[#6E6E73] hover:text-[#1D1D1F] transition-colors"
            >
              <GithubMark className="w-4 h-4" />
              <span>VipBeCool/SkillHub</span>
            </a>
          </div>
        </div>
      </footer>

      {/* ===================================================================== */}
      {/* 原生 <dialog closedby="any"> 1：用户交流群二维码弹窗 */}
      {/* ===================================================================== */}
      <dialog
        ref={communityDialogRef}
        {...({ closedby: "any" } as Record<string, string>)}
        aria-labelledby="community-dialog-title"
        className="native-modal rounded-2xl w-[92vw] max-w-lg"
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 id="community-dialog-title" className="text-[17px] font-bold text-[#1D1D1F]">
                {t.communityModal.title}
              </h2>
              <p className="text-[12.5px] text-[#6E6E73] mt-0.5">{t.communityModal.subtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => communityDialogRef.current?.close()}
              aria-label={t.communityModal.close}
              className="p-1.5 rounded-lg text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-black/[0.05] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-black/[0.07] bg-[#FAFAFC] p-4 flex flex-col items-center text-center">
              <div className="text-[13.5px] font-semibold text-[#1D1D1F]">
                {t.communityModal.qqTitle}
              </div>
              <div className="text-[11.5px] font-mono text-[#6E6E73] mt-0.5 mb-3">
                {t.communityModal.qqSub}
              </div>
              <img
                src="./images/qq-group.png"
                alt={t.communityModal.qqTitle}
                fetchPriority="low"
                loading="lazy"
                className="w-44 h-auto rounded-lg border border-black/[0.06] bg-white p-1"
              />
            </div>

            <div className="rounded-xl border border-black/[0.07] bg-[#FAFAFC] p-4 flex flex-col items-center text-center">
              <div className="text-[13.5px] font-semibold text-[#1D1D1F]">
                {t.communityModal.wechatTitle}
              </div>
              <div className="text-[11.5px] text-[#6E6E73] mt-0.5 mb-3">
                {t.communityModal.wechatSub}
              </div>
              <img
                src="./images/wechat-group.png"
                alt={t.communityModal.wechatTitle}
                fetchPriority="low"
                loading="lazy"
                className="w-44 h-auto rounded-lg border border-black/[0.06] bg-white p-1"
              />
            </div>
          </div>
        </div>
      </dialog>

      {/* ===================================================================== */}
      {/* 原生 <dialog closedby="any"> 2：高清截图放大预览灯箱 */}
      {/* ===================================================================== */}
      <dialog
        ref={lightboxDialogRef}
        {...({ closedby: "any" } as Record<string, string>)}
        aria-label={lightboxImage?.alt || "Screenshot preview"}
        className="native-modal rounded-2xl w-[95vw] max-w-6xl bg-transparent border-none shadow-none"
      >
        {lightboxImage && (
          <div className="relative bg-white rounded-2xl p-2 sm:p-3 border border-black/10 shadow-2xl">
            <button
              type="button"
              onClick={() => lightboxDialogRef.current?.close()}
              aria-label={t.communityModal.close}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/65 hover:bg-black/80 text-white backdrop-blur-md transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={lightboxImage.src}
              alt={lightboxImage.alt}
              className="w-full max-h-[86vh] object-contain rounded-xl block"
            />
          </div>
        )}
      </dialog>
    </div>
  );
}
