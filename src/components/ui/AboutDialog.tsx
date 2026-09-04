import { useState, useEffect, useRef } from "react";
import { X, RefreshCw, User, GitFork, Coffee, MessageSquare, Mail } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import logo from "../../assets/logo.png";

interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCommunity?: (tab: "qq" | "wechat") => void;
}

// 微信图标（官方纯线性描边风格）
const WechatIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M10.0014 14.6757C10.0011 14.6551 10.001 14.6345 10.001 14.6138C10.001 12.1055 12.0175 9.99564 14.7539 9.38092C14.3904 7.07873 11.9602 5.19995 8.90098 5.19995C5.58037 5.19995 3.00098 7.41344 3.00098 9.9793C3.00098 10.9487 3.36131 11.88 4.04082 12.6781C4.0728 12.7157 4.12443 12.7717 4.19342 12.8427C4.78537 13.4517 5.13709 14.2457 5.19546 15.0805C5.90857 14.6683 6.74285 14.5123 7.55832 14.6392C7.72416 14.665 7.85986 14.6847 7.96345 14.6982C8.27111 14.7383 8.58419 14.7586 8.90098 14.7586C9.27825 14.7586 9.64595 14.7301 10.0014 14.6757ZM10.4581 16.627C9.95467 16.7133 9.43399 16.7586 8.90098 16.7586C8.49441 16.7586 8.09502 16.7323 7.70499 16.6815C7.58312 16.6656 7.4317 16.6436 7.25073 16.6154C6.87693 16.5572 6.49436 16.6321 6.1713 16.8268L4.26653 17.9745C4.12052 18.0646 3.94891 18.1057 3.77733 18.0916C3.33814 18.0554 3.01178 17.6744 3.04837 17.2405L3.19859 15.4596C3.23664 15.0086 3.07664 14.5632 2.75931 14.2367C2.66182 14.1364 2.5814 14.0491 2.51802 13.9747C1.56406 12.8542 1.00098 11.4732 1.00098 9.9793C1.00098 6.23517 4.53793 3.19995 8.90098 3.19995C12.9601 3.19995 16.3041 5.82699 16.7504 9.20788C20.1225 9.36136 22.801 11.723 22.801 14.6138C22.801 15.8068 22.3448 16.9097 21.572 17.8044C21.5206 17.8639 21.4555 17.9336 21.3765 18.0137C21.1194 18.2744 20.9898 18.6301 21.0206 18.9903L21.1423 20.4125C21.172 20.759 20.9076 21.0632 20.5518 21.0921C20.4128 21.1034 20.2738 21.0706 20.1555 20.9986L18.6124 20.0821C18.3506 19.9266 18.0407 19.8668 17.7379 19.9133C17.5913 19.9358 17.4686 19.9533 17.3699 19.966C17.0539 20.0066 16.7303 20.0277 16.401 20.0277C13.7074 20.0277 11.4025 18.6201 10.4581 16.627ZM17.4346 17.9364C18.0019 17.8494 18.5793 17.911 19.1105 18.1111C19.2492 17.5503 19.5373 17.0304 19.9524 16.6094C20.0027 16.5585 20.0388 16.5198 20.0584 16.4971C20.5467 15.9318 20.801 15.2839 20.801 14.6138C20.801 12.8095 18.8983 11.2 16.401 11.2C13.9037 11.2 12.001 12.8095 12.001 14.6138C12.001 16.4181 13.9037 18.0277 16.401 18.0277C16.6424 18.0277 16.8809 18.0124 17.115 17.9823C17.1957 17.972 17.3029 17.9566 17.4346 17.9364Z" />
  </svg>
);

// QQ图标（官方纯线性描边风格）
const QQIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.5359 12.5144L16.8402 10.7175C16.8408 10.6968 16.8494 10.3429 16.8494 10.1604C16.8494 7.08792 15.448 4.0003 12.0012 4C8.55459 4.0003 7.15292 7.08792 7.15292 10.1604C7.15292 10.3429 7.16151 10.6968 7.16209 10.7175L6.4667 12.5144C6.27608 13.0285 6.08776 13.564 5.94988 14.0232C5.29262 16.2126 5.50559 17.1186 5.66783 17.139C6.01581 17.1823 7.02221 15.4908 7.02221 15.4908C7.02221 16.4704 7.5095 17.7487 8.56405 18.6719C8.16963 18.7976 7.68635 18.9911 7.37564 19.2284C7.09645 19.442 7.13142 19.6594 7.18158 19.7473C7.40258 20.1329 10.9713 19.9935 12.0017 19.8733C13.0319 19.9935 16.6009 20.1329 16.8216 19.7473C16.872 19.6594 16.9067 19.442 16.6275 19.2284C16.3168 18.9911 15.8333 18.7976 15.4386 18.6716C16.4928 17.7487 16.9801 16.4704 16.9801 15.4908C16.9801 15.4908 17.9868 17.1823 18.3348 17.139C18.4967 17.1186 18.7131 16.2108 18.0524 14.0232C17.9125 13.56 17.7265 13.0285 17.5359 12.5144ZM18.5574 20.7407C18.1843 21.3926 17.7237 21.6334 17.1187 21.7981C16.8792 21.8633 16.621 21.9056 16.325 21.936C15.8844 21.9814 15.3392 22.001 14.712 22C13.786 21.9985 12.693 21.9491 12.0017 21.884C11.3103 21.9491 10.2173 21.9985 9.29129 22C8.66414 22.001 8.11889 21.9814 7.67832 21.936C7.38236 21.9056 7.12409 21.8633 6.88467 21.7981C6.27994 21.6335 5.81954 21.393 5.44496 20.7393C5.15165 20.2258 5.07747 19.6406 5.20612 19.0866C4.61376 18.9546 4.20483 18.6045 3.92733 18.1757C3.77911 17.9466 3.68408 17.7127 3.61845 17.4663C3.53001 17.1344 3.49486 16.7666 3.50184 16.3601C3.51532 15.5749 3.68902 14.5984 4.03435 13.4481C4.17427 12.9821 4.3614 12.4396 4.6015 11.7926L5.15467 10.3632C5.1536 10.287 5.15292 10.2154 5.15292 10.1604C5.15292 5.6047 7.58875 2.00038 12.0013 2C16.4138 2.00038 18.8494 5.60454 18.8494 10.1604C18.8494 10.2154 18.8487 10.2869 18.8477 10.3631L19.401 11.7923L19.4112 11.8191C19.636 12.4254 19.8242 12.9722 19.967 13.445C20.3145 14.5956 20.4889 15.5735 20.5018 16.361C20.5085 16.768 20.4728 17.1365 20.3837 17.4689C20.3178 17.7148 20.2226 17.9483 20.0746 18.1768C19.7976 18.6041 19.3905 18.9532 18.7974 19.0862C18.9266 19.6411 18.8523 20.2274 18.5574 20.7407Z" />
  </svg>
);

interface AboutCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  isActive?: boolean;
}

function AboutCard({ icon, title, subtitle, onClick, isActive }: AboutCardProps) {
  return (
    <button
      onClick={onClick}
      className={`group flex flex-col items-center justify-center gap-1.5 py-2.5 px-1.5 rounded-xl border transition-all duration-150 cursor-pointer text-center active:scale-[0.97] w-full h-full ${
        isActive
          ? "border-blue-500/40 bg-blue-50/50 dark:bg-blue-900/25 ring-2 ring-blue-500/20"
          : "border-black/[0.06] dark:border-white/[0.08] bg-black/[0.015] dark:bg-white/[0.02] hover:bg-blue-50/40 dark:hover:bg-blue-900/15 hover:border-blue-500/25"
      }`}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-500/[0.07] dark:bg-blue-400/[0.12] text-blue-600 dark:text-blue-400 group-hover:bg-blue-500/[0.12] dark:group-hover:bg-blue-400/[0.18] group-hover:scale-110 transition-all duration-150 shrink-0">
        {icon}
      </div>
      <div className="w-full px-0.5">
        <div className="text-[11.5px] font-semibold text-[var(--foreground)] truncate">{title}</div>
        <div className="text-[9.5px] text-[var(--color-muted)] mt-0.5 leading-tight truncate">{subtitle}</div>
      </div>
    </button>
  );
}

export function AboutDialog({ isOpen, onClose, onOpenCommunity }: AboutDialogProps) {
  const [appVersion, setAppVersion] = useState<string>("...");
  const [isChecking, setIsChecking] = useState(false);
  const [update, setUpdate] = useState<Update | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [feedbackMenuOpen, setFeedbackMenuOpen] = useState(false);
  const feedbackMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      getVersion().then((version) => setAppVersion(version)).catch(console.error);
      setUpdate(null);
      setIsDownloading(false);
      setProgress(0);
      setStatusMessage("");
      setFeedbackMenuOpen(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!feedbackMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (feedbackMenuRef.current && !feedbackMenuRef.current.contains(e.target as Node)) {
        setFeedbackMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [feedbackMenuOpen]);

  const handleOpenGitHubIssue = () => {
    openUrl("https://github.com/VipBeCool/SkillHub/issues/new?template=feedback.yml&title=%5B%E5%8F%8D%E9%A6%88%5D+&labels=feedback").catch(console.error);
  };

  const handleOpenEmail = async () => {
    const osName = /mac/i.test(navigator.userAgent)
      ? "macOS"
      : /win/i.test(navigator.userAgent)
      ? "Windows"
      : /linux/i.test(navigator.userAgent)
      ? "Linux"
      : "Mac / Windows";

    const email = "vipbecool@gmail.com";
    const subject = "【SkillHub 反馈】用户意见与建议";
    const cleanVersion = appVersion.startsWith("v") ? appVersion : `v${appVersion}`;
    const body = `你好！我在使用 SkillHub 时遇到以下问题 / 有以下建议：\n\n【反馈内容】：\n\n\n【系统环境】：${osName}\n【应用版本】：SkillHub ${cleanVersion}\n`;

    try {
      await invoke("open_email", { to: email, subject, body });
    } catch (e) {
      console.warn("invoke open_email failed:", e);
      try {
        const mailtoUrl = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        await invoke("open_local_folder", { path: mailtoUrl });
      } catch {
        window.location.href = `mailto:${email}`;
      }
    }

    try {
      await navigator.clipboard.writeText(email);
    } catch {}
  };

  const handleCheckUpdate = async () => {
    if (isChecking || isDownloading) return;
    
    setIsChecking(true);
    setStatusMessage("正在检查更新...");
    try {
      const result = await check();
      if (result?.available) {
        setUpdate(result);
        setStatusMessage(`发现新版本 v${result.version}`);
      } else {
        setStatusMessage("当前已是最新版本");
        setTimeout(() => setStatusMessage(""), 3000);
      }
    } catch (e) {
      console.error(e);
      setStatusMessage("检查更新失败");
      setTimeout(() => setStatusMessage(""), 3000);
    } finally {
      setIsChecking(false);
    }
  };

  const handleDownload = async () => {
    if (!update || isDownloading) return;
    
    setIsDownloading(true);
    try {
      let totalBytes = 0;
      let downloadedBytes = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started' && event.data.contentLength) {
          totalBytes = event.data.contentLength;
        } else if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) {
            setProgress(Math.round((downloadedBytes / totalBytes) * 100));
          }
        } else if (event.event === 'Finished') {
          setStatusMessage("更新完成，正在重启...");
        }
      });
      await relaunch();
    } catch (e) {
      console.error('更新失败:', e);
      setStatusMessage("更新下载失败");
      setIsDownloading(false);
      setTimeout(() => setStatusMessage(`发现新版本 v${update.version}`), 3000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center">
        <div 
          className="absolute inset-0 modal-backdrop transition-opacity"
          onClick={onClose}
        />
        
        <div 
          className="relative modal-glass rounded-xl w-[460px] flex flex-col items-center pt-8 pb-6 px-8 animate-in zoom-in-95 duration-200 text-[var(--foreground)]"
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-lg text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="mb-3">
            <img src={logo} alt="SkillHub Logo" className="w-20 h-20 object-contain drop-shadow-sm" />
          </div>
          
          <h2 className="text-[24px] font-bold mb-1 tracking-tight">SkillHub</h2>
          <p className="text-[13px] text-[var(--color-muted)] mb-2.5 font-normal">
            个人 Prompt 与技能管理工具
          </p>

          <div className="flex items-center gap-2 mb-6">
            <span className="text-[11px] text-black/45 dark:text-white/45 font-mono tracking-wide px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06]">
              v{appVersion}
            </span>
            <span className="text-black/20 dark:text-white/20">·</span>
            {isDownloading ? (
              <div className="flex items-center gap-1.5 text-[12px] text-blue-500 font-medium">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>正在下载... {progress}%</span>
              </div>
            ) : update ? (
              <button 
                onClick={handleDownload}
                className="text-[12px] text-blue-500 hover:text-blue-600 font-semibold transition-colors flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 px-2.5 py-0.5 rounded-full"
              >
                {statusMessage || `下载更新 (v${update.version})`}
              </button>
            ) : (
              <button 
                onClick={handleCheckUpdate}
                disabled={isChecking}
                className={`text-[12px] font-medium transition-colors ${
                  statusMessage.includes('失败') 
                    ? 'text-red-500' 
                    : statusMessage.includes('最新')
                    ? 'text-green-500'
                    : 'text-blue-500 hover:text-blue-600'
                } ${isChecking ? 'opacity-70' : ''}`}
              >
                {statusMessage || "检查更新"}
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2.5 w-full mb-5">
            <AboutCard
              icon={<User className="w-4 h-4" strokeWidth={1.75} />}
              title="作者"
              subtitle="VipBeCool"
              onClick={() => openUrl("https://github.com/VipBeCool")}
            />
            <AboutCard
              icon={<GitFork className="w-4 h-4" strokeWidth={1.75} />}
              title="开源仓库"
              subtitle="VipBeCool/SkillHub"
              onClick={() => openUrl("https://github.com/VipBeCool/SkillHub")}
            />
            <AboutCard
              icon={<QQIcon className="w-4 h-4" />}
              title="QQ 群"
              subtitle="加入 QQ 交流群"
              onClick={() => {
                onClose();
                onOpenCommunity?.("qq");
              }}
            />
            <AboutCard
              icon={<WechatIcon className="w-4 h-4" />}
              title="公众号"
              subtitle="扫码关注官方公众号"
              onClick={() => {
                onClose();
                onOpenCommunity?.("wechat");
              }}
            />
            <AboutCard
              icon={<Coffee className="w-4 h-4" strokeWidth={1.75} />}
              title="请我咖啡"
              subtitle="支持项目持续开发"
              onClick={() => openUrl("https://github.com/VipBeCool/SkillHub/blob/main/docs/DONATE.md")}
            />
            <div className="relative w-full h-full flex flex-col" ref={feedbackMenuRef}>
              <AboutCard
                icon={<MessageSquare className="w-4 h-4" strokeWidth={1.75} />}
                title="意见反馈"
                subtitle="报告问题或提建议"
                isActive={feedbackMenuOpen}
                onClick={() => setFeedbackMenuOpen((prev) => !prev)}
              />

              {feedbackMenuOpen && (
                <div className="absolute bottom-[calc(100%+10px)] right-0 w-[216px] p-1.5 rounded-xl bg-white dark:bg-[#1E1E1E] border border-black/10 dark:border-white/10 shadow-2xl z-40 animate-in fade-in-50 zoom-in-95 duration-150">
                  {/* 小三角指示箭头 */}
                  <div className="absolute -bottom-1.5 right-[57px] w-3 h-3 rotate-45 bg-white dark:bg-[#1E1E1E] border-r border-b border-black/10 dark:border-white/10" />

                  <div className="px-2 pt-1 pb-1.5 text-[11px] font-semibold text-[var(--color-muted)] border-b border-black/5 dark:border-white/5 mb-1">
                    选择反馈方式
                  </div>

                  <button
                    onClick={() => {
                      setFeedbackMenuOpen(false);
                      handleOpenGitHubIssue();
                    }}
                    className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-left transition-colors group cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-md bg-blue-500/[0.08] dark:bg-blue-400/[0.15] text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <MessageSquare className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium text-[var(--foreground)] group-hover:text-blue-600 dark:group-hover:text-blue-400 leading-tight">
                        GitHub Issues
                      </div>
                      <div className="text-[10px] text-[var(--color-muted)] mt-0.5 truncate">
                        在 GitHub 上提交反馈
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setFeedbackMenuOpen(false);
                      handleOpenEmail();
                    }}
                    className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-left transition-colors group cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-md bg-blue-500/[0.08] dark:bg-blue-400/[0.15] text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <Mail className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium text-[var(--foreground)] group-hover:text-blue-600 dark:group-hover:text-blue-400 leading-tight">
                        发送邮件
                      </div>
                      <div className="text-[10px] text-[var(--color-muted)] mt-0.5 truncate">
                        给作者发送意见反馈邮件
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>

          <button 
            onClick={onClose}
            className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-[14px] font-medium rounded-lg transition-colors mb-4 shadow-sm"
          >
            确认
          </button>

          <div className="text-[11px] text-black/20 dark:text-white/20 tracking-widest font-medium">
            Copyright © 2024-2026 SkillHub
          </div>
        </div>
      </div>
  );
}
