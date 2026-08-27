import { useRef, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, PanelLeft, PanelLeftClose } from 'lucide-react';
import { Tab, TabType } from '../../types/tabs';
import { Tooltip } from './Tooltip';
import { ContextMenu } from './ContextMenu';

import * as LucideIcons from 'lucide-react';

// 根据 Tab 类型返回图标组件
function TabIcon({ type, iconName }: { type: TabType, iconName?: string }) {
  if (iconName) {
    const IconComponent = (LucideIcons as any)[iconName];
    if (IconComponent) {
      return <IconComponent className="w-3.5 h-3.5 shrink-0" />;
    }
  }
  if (type.startsWith('prompt')) return <LucideIcons.MessageSquareText className="w-3.5 h-3.5 shrink-0" />;
  if (type.startsWith('resource')) return <LucideIcons.Store className="w-3.5 h-3.5 shrink-0" />;
  return <LucideIcons.Puzzle className="w-3.5 h-3.5 shrink-0" />;
}

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onSwitchTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  // 左侧边栏收起/展开
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function TabBar({
  tabs,
  activeTabId,
  canGoBack,
  canGoForward,
  onSwitchTab,
  onCloseTab,
  onNewTab,
  onGoBack,
  onGoForward,
  isSidebarOpen,
  onToggleSidebar,
}: TabBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, tabId: string } | null>(null);

  // 激活标签页切换时，滚动到可视范围
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const activeEl = container.querySelector(`[data-tab-id="${activeTabId}"]`) as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [activeTabId]);

  // 横向滚轮支持
  const handleWheel = (e: React.WheelEvent) => {
    if (scrollRef.current) {
      e.preventDefault();
      scrollRef.current.scrollLeft += e.deltaY + e.deltaX;
    }
  };

  return (
    <div
      data-tauri-drag-region
      className="flex items-end h-10 bg-transparent shrink-0 relative z-30"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* 2处：macOS 红绿灯占位区域 (仅侧边栏收起时需要，展开时红绿灯在侧边栏上方) */}
      {!isSidebarOpen && <div className="w-[72px] shrink-0" data-tauri-drag-region />}

      {/* 左侧控制区：收起侧边栏 + 前进后退 */}
      <div
        className="flex items-center gap-1 px-2 pb-1 shrink-0 h-9"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <Tooltip content={isSidebarOpen ? '收起侧边栏 (⌘\\)' : '展开侧边栏 (⌘\\)'}>
          <button
            onClick={onToggleSidebar}
            className="p-1.5 rounded-md text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/[0.06] transition-colors"
          >
            {isSidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
          </button>
        </Tooltip>

        <Tooltip content="后退 (⌘[)">
          <button
            onClick={onGoBack}
            disabled={!canGoBack}
            className={`p-1.5 rounded-md transition-colors ${
              canGoBack 
                ? 'text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/[0.06]' 
                : 'text-[var(--color-muted)] opacity-30 cursor-default'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </Tooltip>

        <Tooltip content="前进 (⌘])">
          <button
            onClick={onGoForward}
            disabled={!canGoForward}
            className={`p-1.5 rounded-md transition-colors ${
              canGoForward 
                ? 'text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/[0.06]' 
                : 'text-[var(--color-muted)] opacity-30 cursor-default'
            }`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </Tooltip>
      </div>

      {/* 分隔线 (已移除) */}

      {/* 标签页与新建按钮区域（适应内容宽度，超出时内部滚动） */}
      <div className="flex items-end min-w-0 h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* 标签页区域（可横向滚动） */}
        <div
          ref={scrollRef}
          className="flex items-end overflow-x-auto scrollbar-none min-w-0 px-1 h-full"
          onWheel={handleWheel}
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                data-tab-id={tab.id}
                onClick={() => onSwitchTab(tab.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, tabId: tab.id });
                }}
                className={`
                  group relative flex items-center gap-1.5 px-3 h-9 w-[200px] min-w-[90px] shrink
                  cursor-pointer select-none rounded-t-md transition-all duration-150
                  ${isActive
                    ? 'bg-white text-[var(--foreground)] font-medium rounded-t-[10px]'
                    : 'text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/[0.04]'
                  }
                `}
              >
                {/* 激活指示线 */}
                <TabIcon type={tab.type} iconName={tab.icon} />

                <span 
                  className="flex-1 text-[12.5px] whitespace-nowrap overflow-hidden"
                  style={{ WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 20px), transparent 100%)', maskImage: 'linear-gradient(to right, black calc(100% - 20px), transparent 100%)' }}
                >
                  {tab.title}
                </span>

                {/* 关闭按钮 */}
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
                    className={`
                      p-0.5 rounded transition-all
                      ${isActive
                        ? 'text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/[0.08] opacity-100'
                        : 'opacity-0 group-hover:opacity-100 text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/[0.08]'
                      }
                    `}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* 新建标签页按钮（紧贴最后一个标签） */}
        <div className="flex items-center px-1 pb-1 h-9 shrink-0">
          <Tooltip content="新建标签页 (⌘T)">
            <button
              onClick={onNewTab}
              className="p-1.5 rounded-md text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/[0.06] transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          items={[
            {
              id: 'close',
              label: '关闭选项卡',
              onClick: () => onCloseTab(contextMenu.tabId),
              disabled: tabs.length <= 1
            },
            {
              id: 'close-others',
              label: '关闭其他选项卡',
              onClick: () => {
                const others = tabs.filter(t => t.id !== contextMenu.tabId);
                others.forEach(t => onCloseTab(t.id));
              },
              disabled: tabs.length <= 1
            },
            {
              id: 'close-left',
              label: '关闭左侧的选项卡',
              onClick: () => {
                const tabIndex = tabs.findIndex(t => t.id === contextMenu.tabId);
                if (tabIndex > 0) {
                  const leftTabs = tabs.slice(0, tabIndex);
                  leftTabs.forEach(t => onCloseTab(t.id));
                }
              },
              disabled: tabs.findIndex(t => t.id === contextMenu.tabId) <= 0
            },
            {
              id: 'close-right',
              label: '关闭右侧的选项卡',
              onClick: () => {
                const tabIndex = tabs.findIndex(t => t.id === contextMenu.tabId);
                if (tabIndex >= 0 && tabIndex < tabs.length - 1) {
                  const rightTabs = tabs.slice(tabIndex + 1);
                  rightTabs.forEach(t => onCloseTab(t.id));
                }
              },
              disabled: tabs.findIndex(t => t.id === contextMenu.tabId) >= tabs.length - 1
            }
          ]}
        />
      )}

      {/* 1处：标题栏空白处，用于拖动窗口和双击缩放 */}
      <div className="flex-1 h-full min-w-0" data-tauri-drag-region />
    </div>
  );
}
