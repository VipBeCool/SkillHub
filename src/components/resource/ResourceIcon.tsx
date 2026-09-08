import React from 'react';
import {
  Puzzle,
  MessageSquareText,
  Lightbulb,
  Code,
  PenTool,
  Palette,
  Briefcase,
  Search,
  MessageSquare,
  Zap,
  Layers,
  FileEdit,
  BarChart3,
  Sparkles,
  Brain,
  Bot,
  FileText,
  Terminal,
  Globe,
  Languages,
  Cpu,
  Star,
  CheckCircle2,
  TestTube2,
  ClipboardList,
  TrendingUp,
  FolderCode,
  Sliders,
  LucideProps,
} from 'lucide-react';

// 图标名称到 Lucide 组件的映射表
const ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  // 分类与通用
  Lightbulb,
  Code,
  PenTool,
  Palette,
  Briefcase,
  Search,
  MessageSquare,
  MessageSquareText,
  ClipboardList,
  Globe,

  // 合辑
  Zap,
  Layers,
  FileEdit,
  BarChart3,
  TrendingUp,

  // 资源专有
  Sparkles,
  Brain,
  Bot,
  FileText,
  Terminal,
  Languages,
  Cpu,
  Star,
  CheckCircle2,
  TestTube2,
  FolderCode,
  Sliders,
  Puzzle,
};

interface ResourceIconProps extends LucideProps {
  /** 指定的 Lucide 图标名称 */
  name?: string;
  /** 资源类型（作为降级回退依据） */
  type?: 'skill' | 'prompt';
}

/**
 * 统一资源社区图标组件
 * 彻底告别 emoji，统一采用 Apple 风格的标准 Lucide 矢量线条图标
 */
export function ResourceIcon({ name, type = 'skill', className = 'w-4 h-4', ...props }: ResourceIconProps) {
  if (name && ICON_MAP[name]) {
    const IconComponent = ICON_MAP[name];
    return <IconComponent className={className} {...props} />;
  }

  // 降级回退：技能使用 Puzzle，提示词使用 MessageSquareText
  if (type === 'prompt') {
    return <MessageSquareText className={className} {...props} />;
  }

  return <Puzzle className={className} {...props} />;
}
