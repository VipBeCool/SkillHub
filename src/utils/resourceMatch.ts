import type { Prompt, Skill, GroupedRepo } from '../types';
import type { ResourceItem } from '../types/resource';

/**
 * 规范化 Git / GitHub 仓库地址用于精确比对
 * 例如: "https://github.com/obra/superpowers.git/" -> "github.com/obra/superpowers"
 */
function normalizeRepoUrl(url?: string): string {
  if (!url) return '';
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '');
}

/**
 * 反查提示词对应的社区资源条目
 */
export function findStoreResourceForPrompt(
  prompt: Prompt | null | undefined,
  resources: ResourceItem[]
): ResourceItem | undefined {
  if (!prompt) return undefined;

  const promptTitle = (prompt.title || '').trim().toLowerCase();
  if (!promptTitle) return undefined;

  // 1. 优先通过标题/显示名称/ID匹配
  const foundByName = resources.find(r => {
    if (r.type !== 'prompt') return false;
    const resTitle = (r.displayName || '').trim().toLowerCase();
    const resName = (r.name || '').trim().toLowerCase();
    const resId = (r.id || '').trim().toLowerCase();
    return resTitle === promptTitle || resName === promptTitle || resId === promptTitle;
  });

  if (foundByName) return foundByName;

  // 2. 兜底策略：若用户略微修改过标题，比对核心 Prompt 内容
  if (prompt.content) {
    const trimmedContent = prompt.content.trim();
    const foundByContent = resources.find(
      r => r.type === 'prompt' && r.promptContent && r.promptContent.trim() === trimmedContent
    );
    if (foundByContent) return foundByContent;
  }

  return undefined;
}

/**
 * 反查技能对应的社区资源条目
 */
export function findStoreResourceForSkill(
  skill: Skill | null | undefined,
  resources: ResourceItem[],
  allRepos?: GroupedRepo[]
): ResourceItem | undefined {
  if (!skill) return undefined;

  const skillName = (skill.name || '').trim().toLowerCase();
  const skillUrlNorm = normalizeRepoUrl(skill.online_url);

  // 1. URL 精准比对
  if (skillUrlNorm) {
    const byUrl = resources.find(
      r => r.type === 'skill' && r.repoUrl && normalizeRepoUrl(r.repoUrl) === skillUrlNorm
    );
    if (byUrl) return byUrl;
  }

  // 2. 技能名称/ID 匹配
  if (skillName) {
    const byName = resources.find(r => {
      if (r.type !== 'skill') return false;
      const resName = (r.name || '').trim().toLowerCase();
      const resDisplayName = (r.displayName || '').trim().toLowerCase();
      const resId = (r.id || '').trim().toLowerCase();
      return resName === skillName || resDisplayName === skillName || resId === skillName;
    });
    if (byName) return byName;
  }

  // 3. 检查所属仓库是否匹配（如果当前技能是某个合辑仓库下的子技能）
  if (allRepos && allRepos.length > 0) {
    const parentRepo = allRepos.find(r => r.skills.some(s => s.id === skill.id));
    if (parentRepo) {
      const byRepo = findStoreResourceForRepo(parentRepo, resources);
      if (byRepo) return byRepo;
    }
  }

  // 4. 路径包含比对（针对克隆到本地以 resource.name 命名的目录）
  if (skill.local_path) {
    const normPath = skill.local_path.replace(/\\/g, '/').toLowerCase();
    const byPath = resources.find(r => {
      if (r.type !== 'skill') return false;
      const rName = r.name.toLowerCase();
      return normPath.includes(`/${rName}/`) || normPath.endsWith(`/${rName}`);
    });
    if (byPath) return byPath;
  }

  return undefined;
}

/**
 * 反查仓库对应的社区资源条目
 */
export function findStoreResourceForRepo(
  repo: GroupedRepo | null | undefined,
  resources: ResourceItem[]
): ResourceItem | undefined {
  if (!repo) return undefined;

  const repoName = (repo.name || '').trim().toLowerCase();

  // 1. 仓库名称与 resource.name 精准比对
  if (repoName) {
    const byName = resources.find(r => {
      if (r.type !== 'skill') return false;
      const resName = (r.name || '').trim().toLowerCase();
      const resDisplayName = (r.displayName || '').trim().toLowerCase();
      const resId = (r.id || '').trim().toLowerCase();
      return resName === repoName || resDisplayName === repoName || resId === repoName;
    });
    if (byName) return byName;
  }

  // 2. 通过仓库下任意子技能的 online_url 比对
  if (repo.skills && repo.skills.length > 0) {
    for (const skill of repo.skills) {
      const skillUrlNorm = normalizeRepoUrl(skill.online_url);
      if (skillUrlNorm) {
        const bySkillUrl = resources.find(
          r => r.type === 'skill' && r.repoUrl && normalizeRepoUrl(r.repoUrl) === skillUrlNorm
        );
        if (bySkillUrl) return bySkillUrl;
      }
    }
  }

  // 3. 路径末尾匹配
  if (repo.path) {
    const normPath = repo.path.replace(/\\/g, '/').toLowerCase();
    const byPath = resources.find(r => {
      if (r.type !== 'skill') return false;
      const rName = r.name.toLowerCase();
      return normPath.endsWith(`/${rName}`);
    });
    if (byPath) return byPath;
  }

  return undefined;
}

/**
 * 从社区资源反查本地已安装的仓库或单项技能信息（用于执行卸载、删除物理路径等操作）
 */
export function findLocalRepoOrSkillForResource(
  resource: ResourceItem,
  repos: GroupedRepo[],
  skills: Skill[]
): { type: 'repo' | 'skill'; path: string; name: string } | null {
  if (!resource || resource.type !== 'skill') return null;

  const resName = (resource.name || '').trim().toLowerCase();
  const resDisplayName = (resource.displayName || '').trim().toLowerCase();
  const resId = (resource.id || '').trim().toLowerCase();
  const resUrlNorm = normalizeRepoUrl(resource.repoUrl);

  // 1. 优先比对仓库
  for (const repo of repos) {
    const repoName = (repo.name || '').trim().toLowerCase();
    const repoPathNorm = (repo.path || '').replace(/\\/g, '/').toLowerCase();

    // 仓库名称匹配
    if (repoName && (repoName === resName || repoName === resDisplayName || repoName === resId)) {
      return { type: 'repo', path: repo.path, name: repo.name };
    }

    // 路径末尾匹配
    if (resName && (repoPathNorm.endsWith(`/${resName}`) || repoPathNorm.includes(`/${resName}/`))) {
      return { type: 'repo', path: repo.path, name: repo.name };
    }

    // 通过仓库子技能的远程 URL 匹配
    if (resUrlNorm && repo.skills && repo.skills.length > 0) {
      const matchSkillUrl = repo.skills.some(s => normalizeRepoUrl(s.online_url) === resUrlNorm);
      if (matchSkillUrl) {
        return { type: 'repo', path: repo.path, name: repo.name };
      }
    }
  }

  // 2. 其次比对单项技能
  for (const skill of skills) {
    const sName = (skill.name || '').trim().toLowerCase();
    const sPathNorm = (skill.local_path || '').replace(/\\/g, '/').toLowerCase();
    const sUrlNorm = normalizeRepoUrl(skill.online_url);

    if (sUrlNorm && resUrlNorm && sUrlNorm === resUrlNorm) {
      return { type: 'skill', path: skill.local_path, name: skill.name };
    }

    if (sName && (sName === resName || sName === resDisplayName || sName === resId)) {
      return { type: 'skill', path: skill.local_path, name: skill.name };
    }

    if (resName && (sPathNorm.endsWith(`/${resName}`) || sPathNorm.includes(`/${resName}/`))) {
      return { type: 'skill', path: skill.local_path, name: skill.name };
    }
  }

  return null;
}

/**
 * 从社区资源反查本地已安装的提示词对象
 */
export function findLocalPromptForResource(
  resource: ResourceItem,
  prompts: Prompt[]
): Prompt | null {
  if (!resource || resource.type !== 'prompt') return null;

  const resId = (resource.id || '').trim().toLowerCase();
  const resDisplayName = (resource.displayName || '').trim().toLowerCase();
  const resName = (resource.name || '').trim().toLowerCase();
  const resContent = (resource.promptContent || '').trim();

  // 1. 优先按 ID 匹配
  const byId = prompts.find(p => (p.id || '').toLowerCase() === resId);
  if (byId) return byId;

  // 2. 按标题匹配
  const byTitle = prompts.find(p => {
    const titleLower = (p.title || '').trim().toLowerCase();
    return titleLower === resDisplayName || titleLower === resName;
  });
  if (byTitle) return byTitle;

  // 3. 按内容全等匹配
  if (resContent) {
    const byContent = prompts.find(p => (p.content || '').trim() === resContent);
    if (byContent) return byContent;
  }

  return null;
}
