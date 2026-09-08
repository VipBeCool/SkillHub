// 资源社区类型定义

// 资源分类定义
export interface CategoryDef {
  id: string;           // "core-enhancement"
  name: string;         // "核心增强"
  icon: string;         // lucide 图标名
  description: string;
}

// 单个资源项
export interface ResourceItem {
  id: string;
  name: string;                   // "prompt-engineering"
  displayName: string;            // "提示词工程"
  type: 'skill' | 'prompt';
  description: string;
  category: string;               // CategoryDef.id
  tags: string[];
  author: string;
  icon?: string;                  // lucide 图标名
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  compatibleWith?: string[];      // ['gemini', 'claude', 'cursor']

  // 技能专有
  repoUrl?: string;               // GitHub 仓库 URL（用于 clone）

  // 提示词专有
  promptContent?: string;         // 短提示词直接内联
  promptContentUrl?: string;      // 长提示词的远程 URL
  promptVariables?: string;       // 变量定义 JSON

  // 展示用
  previewContent?: string;        // 预览文本（前几行）
  stars?: number;
  downloadCount?: number;
  updatedAt: string;
}

// 合辑（一组相关资源的逻辑集合）
export interface Collection {
  id: string;
  name: string;                   // "AI 编程必备合辑"
  description: string;
  icon?: string;
  category: string;
  resourceIds: string[];          // 包含的资源 ID 列表
  featured?: boolean;
  coverColor?: string;            // 封面背景色
}

// 精选推荐项
export interface FeaturedItem {
  type: 'banner' | 'topic';
  title: string;
  subtitle?: string;
  backgroundColor?: string;
  gradient?: string;              // CSS 渐变
  icon?: string;                  // Lucide 图标名
  emoji?: string;                 // 兼容旧字段
  targetType: 'resource' | 'collection' | 'category' | 'url';
  targetId: string;
}

// 索引主结构
export interface RegistryIndex {
  version: string;
  updatedAt: string;
  categories: CategoryDef[];
  resources: ResourceItem[];
  collections: Collection[];
  featured: FeaturedItem[];
}

// 资源安装状态
export type InstallStatus = 'not_installed' | 'installing' | 'installed' | 'error';
