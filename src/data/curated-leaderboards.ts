import type { CuratedLeaderboard, LinklyListId, RecommendedRepoDef } from '../types/resourceHub';
import curatedLeaderboardsJson from './curated-leaderboards.json';

/**
 * 精选专题榜远程热更新清单地址（托管在 GitHub main 分支，支持 24 小时缓存与国内镜像回退）
 */
export const CURATED_LEADERBOARDS_REMOTE_URL =
  'https://raw.githubusercontent.com/VipBeCool/SkillHub/main/src/data/curated-leaderboards.json';

/**
 * Linkly AI 每日榜单维度定义（对应 LinklyAI/best-skills 每日更新的开放 CSV）
 */
export const LINKLY_LIST_TABS: Array<{
  id: LinklyListId;
  label: string;
  description: string;
}> = [
    { id: 'best-100', label: '综合精选', description: '综合热度、增速、口碑、维护与可信度加权评分（WIS）' },
    { id: 'trending-7d', label: '本周飙升', description: '近 7 天全球安装量增长最快的 Agent Skills' },
    { id: 'top-installs', label: '累计安装', description: '跨平台总安装量与下载量最高的头部技能' },
    { id: 'rising-stars', label: '新星榜', description: '近 30 天内新晋涌现且快速起量的潜力技能' },
    { id: 'official-100', label: '官方严选', description: '经过官方平台认证与高可信发布者维护的标杆技能' },
    { id: 'social-buzz', label: '社区热议', description: '近 7 天在 X / Hacker News / GitHub 讨论度最高' },
  ];

/**
 * 榜单内通用分类中文映射（适配 Linkly AI CSV category 字段）
 */
export const LINKLY_CATEGORY_LABELS: Record<string, string> = {
  'ai-agent': 'AI Agent',
  'dev-programming': '研发工程',
  'design-media': '设计创意',
  'it-ops-security': '运维安全',
  'security-ops': '运维安全',
  'data-analysis': '数据分析',
  'office-efficiency': '办公效率',
  'knowledge-management': '知识管理',
  'business-ops': '商业运营',
  'content-creation': '内容创作',
  'content-marketing': '内容营销',
  'life-service': '生活服务',
  'professional': '行业专业',
  'education': '学习培训',
  'research': '深度调研',
};

/**
 * SkillHub 内置默认策展专题榜单（来源 curated-leaderboards.json，作为启动首屏与离线兜底）
 */
export const CURATED_LEADERBOARDS: CuratedLeaderboard[] =
  curatedLeaderboardsJson.leaderboards as CuratedLeaderboard[];

/**
 * 仓库管理抽屉中的「推荐一键订阅」精选仓库池
 */
export const RECOMMENDED_REPOS: RecommendedRepoDef[] = [
  {
    owner: 'mattpocock',
    repo: 'skills',
    branch: 'main',
    label: 'mattpocock/skills',
    description: '高人气工程工作流（grill-me / tdd / handoff / triage）',
  },
  {
    owner: 'vercel-labs',
    repo: 'agent-skills',
    branch: 'main',
    label: 'vercel-labs/agent-skills',
    description: 'React / Next.js / Web 性能与设计规范官方技能集',
  },
  {
    owner: 'cexll',
    repo: 'myclaude',
    branch: 'master',
    label: 'cexll/myclaude',
    description: '实战型 Claude Code 实用技能与多模型协作流',
  },
  {
    owner: 'openai',
    repo: 'skills',
    branch: 'main',
    label: 'openai/skills',
    description: 'OpenAI 官方开源技能规范与跨 Agent 技能合集',
  },
  {
    owner: 'nexscope-ai',
    repo: 'ecommerce-skills',
    branch: 'main',
    label: 'nexscope-ai/ecommerce-skills',
    description: '跨境电商选品、竞品对标与评论洞察技能库',
  },
  {
    owner: 'VoltAgent',
    repo: 'awesome-agent-skills',
    branch: 'main',
    label: 'VoltAgent/awesome-agent-skills',
    description: '社区精选工程团队实战 Agent Skills 合集',
  },
];

/**
 * skills.sh 快捷探索热词
 */
export const SKILLS_SH_QUICK_KEYWORDS = [
  { label: 'PPT 演示', query: 'ppt' },
  { label: '界面设计', query: 'design' },
  { label: 'React / 前端', query: 'react' },
  { label: '浏览器自动化', query: 'browser' },
  { label: 'SEO 增长', query: 'seo' },
  { label: 'TDD 测试', query: 'tdd' },
  { label: '文档办公', query: 'docx' },
  { label: '小红书 / 内容', query: 'xhs' },
  { label: 'MCP 开发', query: 'mcp' },
];

/**
 * 优雅格式化大数字（如 3800000 -> "380万"，261382 -> "26.1万"，8829 -> "8,829"）
 */
export function formatCompactCount(num?: number | null): string {
  if (num == null || Number.isNaN(num) || num <= 0) return '';
  if (num >= 100_000_000) {
    return `${(num / 100_000_000).toFixed(1).replace(/\.0$/, '')}亿`;
  }
  if (num >= 10_000) {
    const w = num / 10_000;
    return w >= 100 ? `${Math.round(w)}万` : `${w.toFixed(1).replace(/\.0$/, '')}万`;
  }
  return num.toLocaleString();
}

/**
 * 格式化字节大小
 */
export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
