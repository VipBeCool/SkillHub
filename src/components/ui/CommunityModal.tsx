import { useState, useEffect } from "react";
import { X, Copy, Check, MessageSquare, Mail } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import wechatGroupQR from "../../assets/wechat-group.png";
import qqGroupQR from "../../assets/qq-group.png";

interface CommunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "qq" | "wechat";
}

// 微信图标
const WechatIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-7.063-6.122zm-3.89 3.829c.535 0 .969.44.969.983a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.543.434-.983.97-.983zm5.6 0c.535 0 .969.44.969.983a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.543.434-.983.969-.983z" />
  </svg>
);

// QQ图标（标准腾讯QQ企鹅）
const QQIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.9139 14.529C19.7336 13.955 19.4877 13.2856 19.2385 12.643L18.3288 10.3969C18.3295 10.371 18.3408 9.92858 18.3408 9.70053C18.3408 5.8599 16.5082 2.00037 12.0009 2C7.49403 2.00037 5.66113 5.8599 5.66113 9.70053C5.66113 9.92858 5.67237 10.371 5.67312 10.3969L4.76379 12.643C4.51453 13.2856 4.26827 13.955 4.08798 14.529C3.2285 17.2657 3.507 18.3982 3.71915 18.4238C4.17419 18.4779 5.49021 16.3635 5.49021 16.3635C5.49021 17.5879 6.12741 19.1858 7.5064 20.3398C6.99064 20.4971 6.35868 20.7388 5.95237 21.0355C5.58729 21.3025 5.63302 21.5743 5.69861 21.6841C5.9876 22.1661 10.6542 21.9918 12.0017 21.8417C13.3488 21.9918 18.0158 22.1661 18.3044 21.6841C18.3704 21.5743 18.4157 21.3025 18.0507 21.0355C17.6443 20.7388 17.012 20.4971 16.4959 20.3395C17.8745 19.1858 18.5117 17.5879 18.5117 16.3635C18.5117 16.3635 19.8281 18.4779 20.2831 18.4238C20.4949 18.3982 20.7734 17.2657 19.9139 14.529Z" />
  </svg>
);

const QQ_NUMBER = "1049282993";

export function CommunityModal({ isOpen, onClose, defaultTab = "qq" }: CommunityModalProps) {
  const [activeTab, setActiveTab] = useState<"qq" | "wechat">(defaultTab);
  const [copiedQQ, setCopiedQQ] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
      setCopiedQQ(false);
    }
  }, [isOpen, defaultTab]);

  if (!isOpen) return null;

  const handleCopyQQ = async () => {
    try {
      await navigator.clipboard.writeText(QQ_NUMBER);
      setCopiedQQ(true);
      setTimeout(() => setCopiedQQ(false), 2000);
    } catch {
      const el = document.createElement("textarea");
      el.value = QQ_NUMBER;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopiedQQ(true);
      setTimeout(() => setCopiedQQ(false), 2000);
    }
  };

  const handleOpenGitHubIssue = () => {
    openUrl("https://github.com/VipBeCool/SkillHub/issues/new?template=feedback.yml&title=%5B%E5%8F%8D%E9%A6%88%5D+&labels=feedback").catch(console.error);
  };

  const handleOpenEmail = async () => {
    let appVersion = "v0.2.5";
    try {
      const v = await getVersion();
      if (v) {
        appVersion = v.startsWith("v") ? v : `v${v}`;
      }
    } catch {}

    const osName = /mac/i.test(navigator.userAgent)
      ? "macOS"
      : /win/i.test(navigator.userAgent)
      ? "Windows"
      : /linux/i.test(navigator.userAgent)
      ? "Linux"
      : "Mac / Windows";

    const email = "vipbecool@gmail.com";
    const subject = "【SkillHub 反馈】用户意见与建议";
    const body = `你好！我在使用 SkillHub 时遇到以下问题 / 有以下建议：\n\n【反馈内容】：\n\n\n【系统环境】：${osName}\n【应用版本】：SkillHub ${appVersion}\n`;

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

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 modal-backdrop transition-opacity" onClick={onClose} />
      
      {/* Dialog */}
      <div
        className="relative modal-glass rounded-xl w-[460px] flex flex-col items-center pt-8 pb-6 px-8 animate-in zoom-in-95 duration-200 text-[var(--foreground)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 p-1.5 rounded-lg text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--foreground)] transition-colors z-10"
          aria-label="关闭"
        >
          <X className="w-4 h-4" />
        </button>

        {/* 标题与标语 */}
        <div className="text-center mb-5">
          <h2 className="text-[22px] font-semibold mb-1 tracking-tight">加入 SkillHub 社群</h2>
          <p className="text-[13px] text-[var(--color-muted)] font-normal">
            交流反馈问题 · 体验最新版本 · 探索实用功能
          </p>
        </div>

        {/* QQ / 微信公众号 切换 Tab */}
        <div className="flex w-full max-w-[280px] mb-5 bg-black/[0.04] dark:bg-white/[0.04] rounded-lg p-1 border border-black/5 dark:border-white/5">
          <button
            onClick={() => setActiveTab("qq")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[13px] font-medium transition-all ${
              activeTab === "qq"
                ? "bg-white dark:bg-white/10 shadow-sm text-[var(--foreground)]"
                : "text-[var(--color-muted)] hover:text-[var(--foreground)]"
            }`}
          >
            <QQIcon className="w-3.5 h-3.5 text-[#12B7F5]" />
            QQ 群
          </button>
          <button
            onClick={() => setActiveTab("wechat")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[13px] font-medium transition-all ${
              activeTab === "wechat"
                ? "bg-white dark:bg-white/10 shadow-sm text-[var(--foreground)]"
                : "text-[var(--color-muted)] hover:text-[var(--foreground)]"
            }`}
          >
            <WechatIcon className="w-3.5 h-3.5 text-[#07C160]" />
            微信公众号
          </button>
        </div>

        {/* 二维码展示卡片（固定高度消除Tab切换抖动） */}
        <div className="flex flex-col items-center justify-center w-full min-h-[300px] mb-5">
          {activeTab === "qq" ? (
            <div className="flex flex-col items-center w-full animate-in fade-in-50 duration-150">
              <div className="bg-white rounded-xl p-3 shadow-sm border border-black/5 flex items-center justify-center">
                <img src={qqGroupQR} alt="QQ群二维码" className="w-[240px] h-[240px] object-contain" />
              </div>
              <div className="h-7 flex items-center justify-center gap-2 mt-3">
                <span className="text-[12px] text-[var(--color-muted)]">
                  群号：<span className="font-mono font-semibold text-[var(--foreground)]">{QQ_NUMBER}</span>
                </span>
                <button
                  onClick={handleCopyQQ}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                    copiedQQ
                      ? "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400"
                      : "bg-black/5 dark:bg-white/5 text-[var(--color-muted)] hover:bg-black/10 hover:text-[var(--foreground)]"
                  }`}
                >
                  {copiedQQ ? (
                    <><Check className="w-3 h-3" />已复制</>
                  ) : (
                    <><Copy className="w-3 h-3" />复制</>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center w-full animate-in fade-in-50 duration-150">
              <div className="bg-white rounded-xl p-3 shadow-sm border border-black/5 flex items-center justify-center">
                <img src={wechatGroupQR} alt="微信公众号二维码" className="w-[240px] h-[240px] object-contain" />
              </div>
              <div className="h-7 flex items-center justify-center text-[12px] text-[var(--color-muted)] mt-3">
                微信扫码关注官方公众号
              </div>
            </div>
          )}
        </div>

        {/* 居中分割线与标题 */}
        <div className="w-full flex items-center gap-3 mb-3">
          <div className="h-px bg-black/[0.06] dark:bg-white/[0.06] flex-1" />
          <span className="text-[12px] font-medium text-[var(--color-muted)]">意见反馈</span>
          <div className="h-px bg-black/[0.06] dark:bg-white/[0.06] flex-1" />
        </div>

        {/* 反馈按钮网格 */}
        <div className="w-full grid grid-cols-2 gap-3">
          <button
            onClick={handleOpenGitHubIssue}
            className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-[13px] font-medium bg-black/[0.04] dark:bg-white/[0.04] text-[var(--foreground)] hover:bg-black/[0.08] dark:hover:bg-white/[0.08] transition-all border border-black/5 dark:border-white/5 active:scale-[0.98]"
          >
            <MessageSquare className="w-4 h-4 text-[var(--color-muted)]" />
            <span>GitHub Issues</span>
          </button>
          <button
            onClick={handleOpenEmail}
            className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-[13px] font-medium bg-black/[0.04] dark:bg-white/[0.04] text-[var(--foreground)] hover:bg-black/[0.08] dark:hover:bg-white/[0.08] transition-all border border-black/5 dark:border-white/5 active:scale-[0.98]"
            title="拉起邮件客户端"
          >
            <Mail className="w-4 h-4 text-[var(--color-muted)]" />
            <span>发送邮件</span>
          </button>
        </div>
      </div>
    </div>
  );
}
