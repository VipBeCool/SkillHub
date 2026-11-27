import fs from "node:fs";
import path from "node:path";

export interface ChangelogItem {
  lead?: string;
  body: string;
  subItems?: string[];
}

export interface ChangelogSection {
  title: string;
  items: ChangelogItem[];
}

export interface ChangelogRelease {
  version: string;
  date: string;
  sections: ChangelogSection[];
}

export interface BuildTimeRepoMeta {
  packageVersion: string;
  latestChangelogVersion: string;
  releases: ChangelogRelease[];
}

function parseBulletText(raw: string): { lead?: string; body: string } {
  const boldColonMatch = raw.match(/^\*\*(.+?)\*\*\s*[：:]\s*(.+)$/);
  if (boldColonMatch) {
    return {
      lead: boldColonMatch[1].trim(),
      body: boldColonMatch[2].trim(),
    };
  }
  return { body: raw.trim() };
}

export function parseChangelogMarkdown(markdown: string): ChangelogRelease[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const releases: ChangelogRelease[] = [];

  let currentRelease: ChangelogRelease | null = null;
  let currentSection: ChangelogSection | null = null;
  let lastItem: ChangelogItem | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // 匹配版本头：## [0.3.0] - 2026-11-27
    const versionMatch = trimmed.match(/^##\s+\[([^\]]+)\]\s*(?:-\s*(.+))?$/);
    if (versionMatch) {
      currentRelease = {
        version: versionMatch[1].trim(),
        date: (versionMatch[2] || "").trim(),
        sections: [],
      };
      releases.push(currentRelease);
      currentSection = null;
      lastItem = null;
      continue;
    }

    if (!currentRelease) continue;

    // 匹配分组头：### 新增特性 / ### 优化与修复
    const sectionMatch = trimmed.match(/^###\s+(.+)$/);
    if (sectionMatch) {
      currentSection = {
        title: sectionMatch[1].trim(),
        items: [],
      };
      currentRelease.sections.push(currentSection);
      lastItem = null;
      continue;
    }

    // 匹配二级缩进子条目（如 0.2.5 中的缩进列表）
    const isIndentedSubBullet = /^\s{2,}[-*]\s+(.+)$/.test(rawLine) && lastItem !== null;
    if (isIndentedSubBullet && lastItem && currentSection) {
      const subMatch = rawLine.match(/^\s{2,}[-*]\s+(.+)$/);
      if (subMatch) {
        if (!lastItem.subItems) lastItem.subItems = [];
        lastItem.subItems.push(subMatch[1].trim());
        continue;
      }
    }

    // 匹配常规一级条目：- **标题**：内容
    const itemMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (itemMatch) {
      if (!currentSection) {
        currentSection = { title: "更新内容", items: [] };
        currentRelease.sections.push(currentSection);
      }
      const parsed = parseBulletText(itemMatch[1]);
      lastItem = {
        lead: parsed.lead,
        body: parsed.body,
      };
      currentSection.items.push(lastItem);
    }
  }

  return releases;
}

export function getBuildTimeRepoMeta(): BuildTimeRepoMeta {
  const repoRoot = path.resolve(process.cwd(), "..");
  let packageVersion = "0.3.0";
  let releases: ChangelogRelease[] = [];

  try {
    const pkgRaw = fs.readFileSync(path.join(repoRoot, "package.json"), "utf-8");
    const pkg = JSON.parse(pkgRaw) as { version?: string };
    if (pkg.version) {
      packageVersion = pkg.version;
    }
  } catch {
    // 忽略读取异常，使用默认版本兜底
  }

  try {
    const changelogRaw = fs.readFileSync(path.join(repoRoot, "CHANGELOG.md"), "utf-8");
    releases = parseChangelogMarkdown(changelogRaw);
  } catch {
    releases = [];
  }

  const latestChangelogVersion = releases[0]?.version || packageVersion;

  return {
    packageVersion,
    latestChangelogVersion,
    releases,
  };
}
