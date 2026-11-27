// 资源中心统一类型定义（榜单合集 / 订阅仓库 / 全网目录 / 安装前预览）

export type ResourceNavSection =
  | 'discover'
  | 'leaderboards'
  | 'repos'
  | 'directory'
  | 'installed'
  | 'prompts';

export type LinklyListId =
  | 'best-100'
  | 'trending-7d'
  | 'top-installs'
  | 'rising-stars'
  | 'official-100'
  | 'social-buzz';

export interface SubscribedRepo {
  id: string;
  host: string;
  owner: string;
  repo: string;
  branch: string;
  enabled: boolean;
  lastCommitSha?: string | null;
  skillCount: number;
  lastSyncedAt?: string | null;
  createdAt: string;
}

export interface SubscribedRepoSkill {
  id: string;
  repoId: string;
  host: string;
  owner: string;
  repo: string;
  branch: string;
  skillName: string;
  displayName: string;
  description: string;
  subpath: string;
  skillMdPath: string;
  treeSha?: string | null;
  tags: string[];
}

export interface SubscribedRepoSyncResult {
  repoId: string;
  branch: string;
  skillCount: number;
  skippedUnchanged: boolean;
  commitSha?: string | null;
}

export interface HostTokenInfo {
  host: string;
  maskedToken: string;
  updatedAt: string;
}

export interface LinklyRankingItem {
  rank: number;
  skill: string;
  skillKey: string;
  platform: string;
  vendor: string;
  sourceSkillssh: string;
  slugClawhub: string;
  url: string;
  repoUrl: string;
  installCmd: string;
  description: string;
  descriptionZh: string;
  category: string;
  installsSkillssh?: number | null;
  downloadsClawhub?: number | null;
  downloadsSkillhubCn?: number | null;
  installsOrDownloads?: number | null;
  wis?: number | null;
  weeklyRecent?: number | null;
  growthPct?: number | null;
  firstSeenDays?: number | null;
  verifiedBy?: string | null;
  buzzScore?: number | null;
  lastUpdate?: string | null;
  canDirectInstall: boolean;
  githubOwner?: string | null;
  githubRepo?: string | null;
}

export interface LinklyLeaderboardResponse {
  listId: string;
  lastUpdated?: string | null;
  fetchedAt: string;
  fromCache: boolean;
  items: LinklyRankingItem[];
}

export interface SkillsShItem {
  id: string;
  source: string;
  skillId: string;
  name: string;
  installs: number;
  owner: string;
  repo: string;
}

export interface SkillsShSearchResponse {
  query: string;
  skills: SkillsShItem[];
  count: number;
  durationMs?: number | null;
}

export interface RemoteSkillFileEntry {
  path: string;
  size: number;
}

export interface RemoteSkillPreview {
  host: string;
  owner: string;
  repo: string;
  branch: string;
  subpath: string;
  skillMdPath: string;
  skillName: string;
  displayName: string;
  description: string;
  content: string;
  files: RemoteSkillFileEntry[];
  repoUrl: string;
  browseUrl: string;
  treeSha?: string | null;
  commitSha?: string | null;
  repoSkillCount: number;
}

export interface InstalledSkillSource {
  localPath: string;
  owner: string;
  repo: string;
  subpath: string;
  skillName: string;
  repoUrl: string;
  provider: string;
}

export interface InstallRemoteSkillResult {
  installedPath: string;
  folderName: string;
  skillCount: number;
}

/**
 * 跨来源统一的远程技能目标描述（供预览页与安装器共用）
 */
export interface RemoteSkillTarget {
  host?: string;
  owner: string;
  repo: string;
  branch?: string;
  skillName: string;
  displayName: string;
  description?: string;
  subpath?: string;
  installMode: 'subskill' | 'repo';
  provider: 'leaderboard' | 'linkly' | 'repo-source' | 'skills.sh' | 'github' | 'curated';
  repoUrl?: string;
  externalUrl?: string;
  installs?: number;
  stars?: number;
  tags?: string[];
}

export interface CuratedLeaderboardItem {
  rank: number;
  skillName: string;
  displayName?: string;
  summaryZh: string;
  reason?: string;
  installMode: 'subskill' | 'repo';
  owner: string;
  repo: string;
  branch?: string;
  subpath?: string;
  installs?: number;
  stars?: number;
  tags?: string[];
  stepLabel?: string; // 可选工作流阶段徽章，如 "01 PLAN"
}

export interface CuratedLeaderboard {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  category: 'trending' | 'starter' | 'domain' | 'official';
  accentColor?: string;
  sourceAttribution?: string;
  sourceLinkLabel?: string; // 署名文案中需要渲染为可点击外链的片段
  sourceLinkUrl?: string; // 对应外链跳转地址
  updatedAt: string;
  items: CuratedLeaderboardItem[];
}

export interface RecommendedRepoDef {
  owner: string;
  repo: string;
  branch?: string;
  label: string;
  description: string;
}

// ============================================================================
// 远程开源提示词广场类型定义（AiShort / prompts.chat / Fabric / LangGPT）
// ============================================================================

export type PromptSourceId = 'aishort' | 'prompts-chat' | 'fabric' | 'langgpt' | 'curated';

export interface RemotePromptItem {
  id: string;
  source: PromptSourceId;
  title: string;
  slug?: string | null;
  description: string;
  content: string;
  contentAlt?: string | null;
  contentLabel?: string | null;
  contentAltLabel?: string | null;
  category?: string | null;
  categoryLabel?: string | null;
  tags: string[];
  author?: string | null;
  votes?: number | null;
  promptType?: string | null;
  sourceUrl?: string | null;
  needsContentFetch: boolean;
}

export interface RemotePromptListResponse {
  source: PromptSourceId;
  items: RemotePromptItem[];
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
  fromCache: boolean;
  usedFallback: boolean;
  fetchedAt: string;
}
