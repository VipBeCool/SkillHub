import { useState, useCallback } from 'react';
import { Tab, TabType, TabContext, TabHistoryEntry, createDefaultTab } from '../types/tabs';

// Helper to deeply compare two plain objects
function deepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;
  if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) return false;
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  if (keys1.length !== keys2.length) return false;
  for (const key of keys1) {
    if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) return false;
  }
  return true;
}

// 生成唯一 ID
let tabCounter = 0;
const genTabId = () => `tab-${Date.now()}-${++tabCounter}`;

interface UseTabsReturn {
  tabs: Tab[];
  activeTabId: string;
  activeTab: Tab | undefined;
  // 基础操作
  openTab: (type: TabType, title: string, context: TabContext, icon?: string) => string;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
  // 当前标签页内导航（压历史栈）
  navigateTo: (type: TabType, title: string, context: TabContext, icon?: string) => void;
  goBack: () => void;
  goForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  // 更新当前标签页标题/上下文
  updateActiveTab: (updates: Partial<Pick<Tab, 'title' | 'context' | 'type' | 'icon'>>) => void;
}

export function useTabs(initialWorkspaceId?: string): UseTabsReturn {
  const [tabs, setTabs] = useState<Tab[]>(() => {
    // 尝试从 localStorage 恢复
    try {
      const saved = localStorage.getItem('skillhub_tabs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* 忽略错误 */ }
    return [createDefaultTab(initialWorkspaceId)];
  });

  const [activeTabId, setActiveTabId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('skillhub_active_tab');
      if (saved) return saved;
    } catch { /* 忽略 */ }
    return tabs[0]?.id ?? '';
  });

  const activeTab = tabs.find(t => t.id === activeTabId);

  // 持久化到 localStorage
  const persist = (newTabs: Tab[], newActiveId: string) => {
    try {
      localStorage.setItem('skillhub_tabs', JSON.stringify(newTabs));
      localStorage.setItem('skillhub_active_tab', newActiveId);
    } catch { /* 忽略 */ }
  };

  // 打开新标签页
  const openTab = useCallback((
    type: TabType,
    title: string,
    context: TabContext,
    icon?: string,
  ): string => {
    const id = genTabId();
    const newTab: Tab = {
      id,
      type,
      title,
      icon,
      historyStack: [{ type, title, context, icon }],
      historyIndex: 0,
      context,
    };
    setTabs(prev => {
      const next = [...prev, newTab];
      persist(next, id);
      return next;
    });
    setActiveTabId(id);
    return id;
  }, []);

  // 关闭标签页
  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      if (prev.length <= 1) return prev; // 至少保留一个
      const idx = prev.findIndex(t => t.id === tabId);
      const next = prev.filter(t => t.id !== tabId);
      // 如果关闭的是当前活动标签页，切换到相邻的
      setActiveTabId(currentActiveId => {
        if (currentActiveId !== tabId) {
          persist(next, currentActiveId);
          return currentActiveId;
        }
        const newActive = next[Math.min(idx, next.length - 1)]?.id ?? next[0]?.id ?? '';
        persist(next, newActive);
        return newActive;
      });
      return next;
    });
  }, []);

  // 切换标签页
  const switchTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
    setTabs(prev => {
      persist(prev, tabId);
      return prev;
    });
  }, []);

  // 在当前标签页内导航（压历史栈）
  const navigateTo = useCallback((type: TabType, title: string, context: TabContext, icon?: string) => {
    setTabs(prev => {
      const next = prev.map(tab => {
        if (tab.id !== activeTabId) return tab;
        
        const currentEntry = tab.historyStack[tab.historyIndex];
        const isIdentical = 
          currentEntry.type === type &&
          currentEntry.title === title &&
          deepEqual(currentEntry.context, context);

        if (isIdentical) {
          return {
            ...tab,
            icon: icon !== undefined ? icon : tab.icon,
          };
        }

        // 截断前进历史并追加新状态
        const newStack: TabHistoryEntry[] = [
          ...tab.historyStack.slice(0, tab.historyIndex + 1),
          { type, title, context, icon },
        ];
        return {
          ...tab,
          type,
          title,
          context,
          icon: icon !== undefined ? icon : tab.icon,
          historyStack: newStack,
          historyIndex: newStack.length - 1,
        };
      });
      persist(next, activeTabId);
      return next;
    });
  }, [activeTabId]);

  // 后退
  const goBack = useCallback(() => {
    setTabs(prev => {
      const next = prev.map(tab => {
        if (tab.id !== activeTabId) return tab;
        const targetIdx = tab.historyIndex - 1;
        if (targetIdx < 0) return tab;
        const entry = tab.historyStack[targetIdx];
        return {
          ...tab,
          type: entry.type,
          title: entry.title,
          context: entry.context,
          icon: entry.icon !== undefined ? entry.icon : tab.icon,
          historyIndex: targetIdx,
        };
      });
      persist(next, activeTabId);
      return next;
    });
  }, [activeTabId]);

  // 前进
  const goForward = useCallback(() => {
    setTabs(prev => {
      const next = prev.map(tab => {
        if (tab.id !== activeTabId) return tab;
        const targetIdx = tab.historyIndex + 1;
        if (targetIdx >= tab.historyStack.length) return tab;
        const entry = tab.historyStack[targetIdx];
        return {
          ...tab,
          type: entry.type,
          title: entry.title,
          context: entry.context,
          icon: entry.icon !== undefined ? entry.icon : tab.icon,
          historyIndex: targetIdx,
        };
      });
      persist(next, activeTabId);
      return next;
    });
  }, [activeTabId]);

  const canGoBack = (activeTab?.historyIndex ?? 0) > 0;
  const canGoForward = activeTab
    ? activeTab.historyIndex < activeTab.historyStack.length - 1
    : false;

  // 更新当前标签页（轻量更新，不压历史栈）
  const updateActiveTab = useCallback((updates: Partial<Pick<Tab, 'title' | 'context' | 'type' | 'icon'>>) => {
    setTabs(prev => {
      const next = prev.map(tab =>
        tab.id === activeTabId ? { ...tab, ...updates } : tab
      );
      persist(next, activeTabId);
      return next;
    });
  }, [activeTabId]);

  return {
    tabs,
    activeTabId,
    activeTab,
    openTab,
    closeTab,
    switchTab,
    navigateTo,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
    updateActiveTab,
  };
}
