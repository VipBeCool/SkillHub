// Tab 系统类型定义

export type TabType =
  | 'skill-home'      // 技能首页（仓库列表）
  | 'skill-repo'      // 某个仓库的技能列表
  | 'skill-detail'    // 单个技能详情（全宽页面）
  | 'prompt-home'     // 提示词首页
  | 'prompt-detail'   // 单个提示词详情（全宽页面）
  | 'resource-home'   // 资源社区首页
  | 'resource-detail' // 社区资源详情
  ;

export interface TabContext {
  workspaceId?: string;   // 所在技能库 ID
  repoId?: string;        // 仓库 ID
  skillId?: string;       // 技能 ID
  promptId?: string;      // 提示词 ID
  promptOpened?: boolean; // 提示词是否已打开过编辑弹窗
  isEditing?: boolean;    // 打开时是否进入编辑模式
  resourceId?: string;    // 社区资源 ID
  filter?: string;        // 筛选条件
  // 用于 prompt-home 展示
  promptFilter?: string;
  
  // 用于 skill-home 展示
  activeView?: 'all' | 'starred' | 'recent' | 'untagged';
  selectedTag?: string;
  activeSourceTab?: string;
}

export interface TabHistoryEntry {
  type: TabType;
  title: string;
  context: TabContext;
  icon?: string;
}

export interface Tab {
  id: string;                         // 唯一标识 (nanoid)
  type: TabType;
  title: string;                      // 标签页显示文本
  icon?: string;                      // lucide 图标名称
  historyStack: TabHistoryEntry[];    // 导航历史栈
  historyIndex: number;               // 当前历史位置
  context: TabContext;                // 当前页面上下文
}

export function createDefaultTab(workspaceId?: string): Tab {
  const initialState = {
    type: 'skill-home' as TabType,
    title: '技能库',
    context: {
      workspaceId,
      activeView: 'all' as const,
      selectedTag: 'all',
      activeSourceTab: 'all',
    }
  };
  return {
    id: `tab-${Date.now()}`,
    ...initialState,
    icon: 'Puzzle',
    historyStack: [initialState],
    historyIndex: 0,
  };
}
