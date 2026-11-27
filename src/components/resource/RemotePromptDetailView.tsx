import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowLeft,
  Copy,
  Check,
  Plus,
  Loader2,
  ExternalLink,
  Languages,
  AlertCircle,
  RefreshCw,
  FileText,
  Code2,
  Trash2,
  MessageSquareQuote,
  ArrowUpRight,
} from 'lucide-react';
import type { PromptSourceId, RemotePromptItem } from '../../types/resourceHub';
import { showToast } from '../ui/Toast';

interface RemotePromptDetailViewProps {
  item: RemotePromptItem;
  parentTitle?: string;
  isInstalled: boolean;
  isInstalling: boolean;
  onBack: () => void;
  onFetchFabricContent: (patternName: string, forceRefresh?: boolean) => Promise<string>;
  onInstall: (item: RemotePromptItem, chosenContent: string, variablesJson: string | null) => Promise<void>;
  onViewInstalled: (item: RemotePromptItem) => void;
  onUninstall: (item: RemotePromptItem) => Promise<void>;
}

const SOURCE_META: Record<PromptSourceId, { name: string; license: string; homeUrl: string }> = {
  aishort: {
    name: 'AiShort 中文精选',
    license: 'MIT',
    homeUrl: 'https://github.com/rockbenben/ChatGPT-Shortcut',
  },
  'prompts-chat': {
    name: 'prompts.chat 全球社区',
    license: 'CC0',
    homeUrl: 'https://prompts.chat',
  },
  fabric: {
    name: 'Fabric 专业工作流',
    license: 'MIT',
    homeUrl: 'https://github.com/danielmiessler/fabric',
  },
  langgpt: {
    name: 'LangGPT 结构化模板',
    license: 'Apache-2.0',
    homeUrl: 'https://github.com/langgptai/LangGPT',
  },
  curated: {
    name: 'SkillHub 严选',
    license: '内置精选',
    homeUrl: '',
  },
};

/**
 * 从提示词正文中提取模板变量（如 {{topic}}）
 */
function extractPromptVariables(text: string): string[] {
  const vars = new Set<string>();
  const mustacheRe = /\{\{\s*([^{}\n]{1,40}?)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = mustacheRe.exec(text)) !== null) {
    const name = m[1].trim();
    if (name) vars.add(name);
  }
  return Array.from(vars);
}

/**
 * 对长文本按段落拆块分段翻译，避免单次请求被免费翻译接口截断
 */
async function translateLongTextToZh(text: string): Promise<string> {
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let buf = '';

  for (const para of paragraphs) {
    if (!buf) {
      buf = para;
    } else if (buf.length + para.length + 2 <= 1100) {
      buf += '\n\n' + para;
    } else {
      chunks.push(buf);
      buf = para;
    }
  }
  if (buf) chunks.push(buf);

  const translatedChunks: string[] = [];
  for (const chunk of chunks) {
    const res = await invoke<string>('translate_text', {
      text: chunk,
      targetLang: 'zh-CN',
    });
    translatedChunks.push(res);
  }
  return translatedChunks.join('\n\n');
}

/**
 * 远程开源提示词全宽预览与入库详情页（对标 RemoteSkillDetailView）
 */
export function RemotePromptDetailView({
  item,
  parentTitle = '提示词精选',
  isInstalled,
  isInstalling,
  onBack,
  onFetchFabricContent,
  onInstall,
  onViewInstalled,
  onUninstall,
}: RemotePromptDetailViewProps) {
  const [loadedContent, setLoadedContent] = useState<string>(item.content || '');
  const [loadingContent, setLoadingContent] = useState<boolean>(
    item.needsContentFetch && !item.content
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  // 内容版本切换：primary(主版本) | alt(双语备选版，如 AiShort 英文原版) | translated(即时中文译文)
  const [contentVariant, setContentVariant] = useState<'primary' | 'alt' | 'translated'>('primary');
  const [viewMode, setViewMode] = useState<'rendered' | 'raw'>(
    item.source === 'fabric' || item.source === 'langgpt' ? 'rendered' : 'raw'
  );
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState(false);

  const loadRemoteBody = async (force = false) => {
    if (!item.needsContentFetch || !item.slug) {
      setLoadedContent(item.content || '');
      setLoadingContent(false);
      setLoadError(null);
      return;
    }
    setLoadingContent(true);
    setLoadError(null);
    try {
      const body = await onFetchFabricContent(item.slug, force);
      setLoadedContent(body);
    } catch (err) {
      setLoadError(String(err));
    } finally {
      setLoadingContent(false);
    }
  };

  useEffect(() => {
    setContentVariant('primary');
    setTranslatedContent(null);
    setViewMode(item.source === 'fabric' || item.source === 'langgpt' ? 'rendered' : 'raw');
    if (item.needsContentFetch && !item.content) {
      loadRemoteBody(false);
    } else {
      setLoadedContent(item.content || '');
      setLoadingContent(false);
      setLoadError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  // 当前展示与复制/入库对应的正文内容
  const activeContent = useMemo(() => {
    if (contentVariant === 'translated' && translatedContent) {
      return translatedContent;
    }
    if (contentVariant === 'alt' && item.contentAlt) {
      return item.contentAlt;
    }
    return loadedContent;
  }, [contentVariant, translatedContent, item.contentAlt, loadedContent]);

  const hasChinesePrimary = /[\u4e00-\u9fa5]/.test(loadedContent);
  const canTranslatePrimary = Boolean(loadedContent.trim()) && !hasChinesePrimary;
  const detectedVars = useMemo(() => extractPromptVariables(activeContent), [activeContent]);
  const sourceMeta = SOURCE_META[item.source] || SOURCE_META.curated;

  const handleCopy = async () => {
    if (!activeContent) return;
    try {
      await navigator.clipboard.writeText(activeContent);
      setCopied(true);
      showToast('已复制提示词内容', 'success');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast('复制失败', 'error');
    }
  };

  const handleTranslate = async () => {
    if (!loadedContent || translating) return;
    if (translatedContent) {
      setContentVariant('translated');
      return;
    }
    setTranslating(true);
    try {
      const zh = await translateLongTextToZh(loadedContent);
      setTranslatedContent(zh);
      setContentVariant('translated');
    } catch (err) {
      showToast(`翻译失败: ${err}`, 'error');
    } finally {
      setTranslating(false);
    }
  };

  const handleInstallClick = async () => {
    if (!activeContent.trim()) {
      showToast('提示词正文尚未加载完成', 'error');
      return;
    }
    const varsJson =
      detectedVars.length > 0
        ? JSON.stringify(detectedVars.map(name => ({ name, defaultValue: '' })))
        : null;
    await onInstall(item, activeContent, varsJson);
  };

  const handleUninstallClick = async () => {
    if (removing) return;
    setRemoving(true);
    try {
      await onUninstall(item);
    } finally {
      setRemoving(false);
    }
  };

  const installBtnText =
    contentVariant === 'translated'
      ? '存入中文译文'
      : contentVariant === 'alt' && item.contentAltLabel
      ? `存入${item.contentAltLabel}`
      : '添加到提示词库';

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-white">
      {/* 顶部返回与面包屑栏 */}
      <div className="shrink-0 h-11 px-5 border-b border-black/[0.06] bg-white flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[12.5px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{parentTitle}</span>
          </button>
          <span className="text-[var(--color-muted)]/40 text-xs">/</span>
          <span className="text-[12.5px] font-semibold text-[var(--foreground)] truncate">
            {item.title}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {item.sourceUrl && (
            <button
              type="button"
              onClick={() => openUrl(item.sourceUrl!).catch(console.error)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>查看原出处</span>
            </button>
          )}
        </div>
      </div>

      {/* 主体滚动区 */}
      <div className="flex-1 min-h-0 overflow-y-auto hover-scroll">
        <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
          {/* 顶部信息卡片 */}
          <div className="bg-[#FAFAFC] rounded-2xl border border-black/[0.07] p-5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-start gap-3.5 min-w-0 flex-1">
                <div className="w-11 h-11 rounded-xl bg-[var(--color-primary)]/[0.08] text-[var(--color-primary)] flex items-center justify-center shrink-0">
                  <MessageSquareQuote className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center flex-wrap gap-2">
                    <h1 className="text-[19px] font-bold text-[var(--foreground)] tracking-tight">
                      {item.title}
                    </h1>
                    {item.categoryLabel && (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-black/[0.045] text-[var(--foreground)]/75">
                        {item.categoryLabel}
                      </span>
                    )}
                    {item.votes != null && item.votes > 0 && item.source === 'prompts-chat' && (
                      <span className="text-[11.5px] text-[var(--color-muted)] tabular-nums">
                        {item.votes} 赞
                      </span>
                    )}
                  </div>

                  <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-[12px] text-[var(--color-muted)] mt-1">
                    <span>{sourceMeta.name}</span>
                    {item.author && (
                      <>
                        <span>·</span>
                        <span>{item.author}</span>
                      </>
                    )}
                    {item.slug && item.source === 'fabric' && (
                      <>
                        <span>·</span>
                        <span className="font-mono text-[11.5px]">{item.slug}</span>
                      </>
                    )}
                  </div>

                  {item.description && (
                    <p className="mt-2.5 text-[13px] text-[var(--foreground)]/80 leading-relaxed">
                      {item.description}
                    </p>
                  )}
                </div>
              </div>

              {/* 右侧操作按钮组 */}
              <div className="flex items-center gap-2 shrink-0 flex-wrap sm:justify-end">
                <button
                  type="button"
                  disabled={!activeContent || loadingContent}
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-medium bg-white border border-black/[0.1] hover:border-black/20 text-[var(--foreground)] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                      <span>已复制</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 opacity-70" />
                      <span>复制</span>
                    </>
                  )}
                </button>

                {isInstalled && !isInstalling ? (
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onViewInstalled(item)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12.5px] font-medium bg-black/[0.045] hover:bg-black/[0.08] text-[var(--foreground)] transition-colors cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                      <span>在提示词库查看</span>
                      <ArrowUpRight className="w-3.5 h-3.5 opacity-60" />
                    </button>
                    <button
                      type="button"
                      disabled={removing}
                      onClick={handleUninstallClick}
                      title="从本地提示词库移除"
                      className="p-2 rounded-xl text-[var(--color-muted)] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {removing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isInstalling || loadingContent || !activeContent}
                    onClick={handleInstallClick}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white transition-all cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {isInstalling ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>正在保存...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        <span>{installBtnText}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 正文区 + 右侧元信息 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
            {/* 左侧：Prompt 正文预览卡片 */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-black/[0.08] overflow-hidden">
              {/* 工具栏：双语 / 翻译 / 渲染模式切换 */}
              <div className="px-4 py-2.5 border-b border-black/[0.06] bg-[#FAFAFC] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* 双语版本切换（如 AiShort 中文版 / 英文原版） */}
                  {item.contentAlt && (
                    <div className="inline-flex p-0.5 rounded-lg bg-black/[0.05] text-[11.5px]">
                      <button
                        type="button"
                        onClick={() => setContentVariant('primary')}
                        className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                          contentVariant === 'primary'
                            ? 'bg-white text-[var(--foreground)] shadow-2xs'
                            : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                        }`}
                      >
                        {item.contentLabel || '中文版'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setContentVariant('alt')}
                        className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                          contentVariant === 'alt'
                            ? 'bg-white text-[var(--foreground)] shadow-2xs'
                            : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                        }`}
                      >
                        {item.contentAltLabel || '英文原版'}
                      </button>
                    </div>
                  )}

                  {/* 英文提示词即时翻译切换 */}
                  {canTranslatePrimary && !item.contentAlt && (
                    <>
                      {translatedContent ? (
                        <div className="inline-flex p-0.5 rounded-lg bg-black/[0.05] text-[11.5px]">
                          <button
                            type="button"
                            onClick={() => setContentVariant('translated')}
                            className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                              contentVariant === 'translated'
                                ? 'bg-white text-[var(--foreground)] shadow-2xs'
                                : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                            }`}
                          >
                            中文译文
                          </button>
                          <button
                            type="button"
                            onClick={() => setContentVariant('primary')}
                            className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                              contentVariant === 'primary'
                                ? 'bg-white text-[var(--foreground)] shadow-2xs'
                                : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                            }`}
                          >
                            英文原文
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={translating || loadingContent}
                          onClick={handleTranslate}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11.5px] font-medium bg-white border border-black/[0.09] hover:border-[var(--color-primary)]/40 text-[var(--foreground)] hover:text-[var(--color-primary)] transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {translating ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Languages className="w-3 h-3" />
                          )}
                          <span>{translating ? '翻译中...' : '翻译为中文'}</span>
                        </button>
                      )}
                    </>
                  )}

                  {!item.contentAlt && !canTranslatePrimary && (
                    <span className="text-[12px] font-medium text-[var(--color-muted)]">
                      提示词正文
                    </span>
                  )}
                </div>

                {/* 渲染 / 源码模式切换 */}
                <div className="inline-flex p-0.5 rounded-lg bg-black/[0.05] text-[11.5px]">
                  <button
                    type="button"
                    onClick={() => setViewMode('rendered')}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-medium transition-all cursor-pointer ${
                      viewMode === 'rendered'
                        ? 'bg-white text-[var(--foreground)] shadow-2xs'
                        : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    <FileText className="w-3 h-3" />
                    <span>阅读</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('raw')}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-medium transition-all cursor-pointer ${
                      viewMode === 'raw'
                        ? 'bg-white text-[var(--foreground)] shadow-2xs'
                        : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    <Code2 className="w-3 h-3" />
                    <span>源码</span>
                  </button>
                </div>
              </div>

              {/* 内容展示区 */}
              {loadingContent ? (
                <div className="py-16 flex flex-col items-center justify-center gap-2.5 text-[var(--color-muted)]">
                  <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
                  <span className="text-[13px]">正在加载提示词正文...</span>
                </div>
              ) : loadError ? (
                <div className="py-14 px-6 flex flex-col items-center justify-center gap-2.5 text-center">
                  <AlertCircle className="w-6 h-6 text-red-500" />
                  <p className="text-[13px] font-semibold text-[var(--foreground)]">加载失败</p>
                  <p className="text-[12px] text-[var(--color-muted)] max-w-md">{loadError}</p>
                  <button
                    type="button"
                    onClick={() => loadRemoteBody(true)}
                    className="mt-1 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-medium bg-[var(--color-primary)] text-white cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>重试</span>
                  </button>
                </div>
              ) : viewMode === 'raw' ? (
                <pre className="p-5 text-[12.5px] leading-relaxed font-mono text-[var(--foreground)]/90 whitespace-pre-wrap break-words bg-white selection:bg-blue-100">
                  {activeContent}
                </pre>
              ) : (
                <div className="p-5 prose prose-sm max-w-none text-[13px] leading-relaxed text-[var(--foreground)]/90 prose-headings:font-semibold prose-headings:text-[var(--foreground)] prose-code:text-[12px] prose-pre:bg-[#F7F7F9] prose-pre:text-[var(--foreground)]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeContent}</ReactMarkdown>
                </div>
              )}
            </div>

            {/* 右侧：属性、变量与使用说明 */}
            <div className="space-y-4">
              {item.tags.length > 0 && (
                <div className="bg-[#FAFAFC] rounded-2xl border border-black/[0.07] p-4 space-y-2.5">
                  <h3 className="text-[12.5px] font-semibold text-[var(--foreground)]">相关标签</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {item.tags.map(tag => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-md text-[11px] bg-white border border-black/[0.07] text-[var(--foreground)]/80"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {detectedVars.length > 0 && (
                <div className="bg-[#FAFAFC] rounded-2xl border border-black/[0.07] p-4 space-y-2.5">
                  <h3 className="text-[12.5px] font-semibold text-[var(--foreground)]">
                    可替换变量 ({detectedVars.length})
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {detectedVars.map(v => (
                      <code
                        key={v}
                        className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-blue-50 text-blue-700 border border-blue-200/60"
                      >
                        {`{{${v}}}`}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-[#FAFAFC] rounded-2xl border border-black/[0.07] p-4 space-y-2 text-[12px] text-[var(--color-muted)] leading-relaxed">
                <h3 className="text-[12.5px] font-semibold text-[var(--foreground)]">使用说明</h3>
                <p>
                  点击「{installBtnText}」将把当前展示的版本保存到本地「提示词」库，随时可在主窗口或随身快捷助手中一键调用与二次编辑。
                </p>
                {sourceMeta.homeUrl && (
                  <div className="pt-2 border-t border-black/[0.06] flex items-center justify-between text-[11.5px]">
                    <span>开源协议：{sourceMeta.license}</span>
                    <button
                      type="button"
                      onClick={() => openUrl(sourceMeta.homeUrl).catch(console.error)}
                      className="text-[var(--color-primary)] hover:underline cursor-pointer"
                    >
                      访问项目
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
