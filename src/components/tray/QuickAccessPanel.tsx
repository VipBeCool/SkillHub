import React, { useState, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Search,
  MessageSquareQuote,
  Copy,
  Check,
  ExternalLink,
  Settings,
  Power,
  FileCode,
  Tag,
  Star,
  Folder
} from "lucide-react";
import logo from "../../assets/logo.png";
import type { Prompt, GroupedRepo, SourceDirectory } from "../../types";

type TabType = "skills" | "prompts";

interface ListItem {
  id: string;
  type: "prompt" | "skill";
  title: string;
  description?: string;
  contentToCopy: string;
  tags?: string;
  category?: string;
  isFavorite: boolean;
  useCount: number;
  isSubSkill?: boolean;
  badge?: string;
  sourceDirLabel?: string;
  isDuplicate?: boolean;
  matchedTag?: string;
}

export function QuickAccessPanel() {
  const [repos, setRepos] = useState<GroupedRepo[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [directories, setDirectories] = useState<SourceDirectory[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabType>("skills");
  // 默认仅显示主技能，勾选后同时显示子技能
  const [showSubSkills, setShowSubSkills] = useState<boolean>(() => {
    return localStorage.getItem("skillhub_tray_show_sub_skills") === "true";
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [renderLimit, setRenderLimit] = useState(40);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<"content" | "ref" | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);

  // 加载数据：获取完整的仓库聚合数据（单技能+合辑仓库）与提示词及技能库目录
  const loadData = async () => {
    try {
      const [reposData, promptsData, dirsData] = await Promise.all([
        invoke<GroupedRepo[]>("get_repositories_with_skills").catch(() => []),
        invoke<Prompt[]>("get_prompts", { groupId: null, search: null, isFavorite: null, tag: null }).catch(() => []),
        invoke<SourceDirectory[]>("get_source_directories").catch(() => [])
      ]);
      setRepos(reposData || []);
      setPrompts(promptsData || []);
      setDirectories(dirsData || []);
    } catch (e) {
      console.error("Failed to load data in QuickAccessPanel", e);
    }
  };

  useEffect(() => {
    loadData();

    const focusSearchInput = () => {
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    };

    // 组件挂载时默认自动获取焦点，立即可开始搜索
    focusSearchInput();

    // 每次窗口重新获得焦点时聚焦输入框并刷新数据
    const unlistenFocus = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) {
        loadData();
        focusSearchInput();
      }
    });

    // 监听托盘面板显示事件
    const unlistenShown = getCurrentWindow().listen("tray-panel-shown", () => {
      loadData();
      focusSearchInput();
    });

    return () => {
      unlistenFocus.then(un => un());
      unlistenShown.then(un => un());
    };
  }, []);

  // 1. 主技能视图（单技能 + 组合包仓库，默认展示的主项列表）
  // 建立技能库目录映射
  const dirMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of directories) {
      map.set(d.id, d.label);
    }
    return map;
  }, [directories]);

  // 统计主技能/仓库名出现次数（判断是否有跨技能库同名）
  const repoNameCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const repo of repos) {
      const primarySkill = repo.skills[0];
      const isCollection = repo.repo_type === "collection" || repo.skills.length > 1;
      const title = !isCollection && primarySkill ? (primarySkill.name || repo.name) : repo.name;
      map.set(title, (map.get(title) || 0) + 1);
    }
    return map;
  }, [repos]);

  // 1. 主技能视图（单技能 + 组合包仓库，默认展示的主项列表）
  const mainSkillItems: ListItem[] = useMemo(() => {
    return repos.map(repo => {
      const isCollection = repo.repo_type === "collection" || repo.skills.length > 1;
      const primarySkill = repo.skills[0];
      const title = !isCollection && primarySkill ? (primarySkill.name || repo.name) : repo.name;
      const isDup = (repoNameCounts.get(title) || 0) > 1;
      const dirLabel = repo.source_dir_id ? dirMap.get(repo.source_dir_id) : undefined;

      if (!isCollection && primarySkill) {
        return {
          id: `s-${primarySkill.id}`,
          type: "skill" as const,
          title,
          description: primarySkill.description || primarySkill.local_path,
          contentToCopy: primarySkill.local_path,
          tags: primarySkill.tags,
          category: undefined,
          isFavorite: primarySkill.is_favorite,
          useCount: primarySkill.use_count || 0,
          isSubSkill: false,
          badge: "单技能",
          sourceDirLabel: dirLabel,
          isDuplicate: isDup
        };
      }

      // 组合包仓库
      const subNames = repo.skills.slice(0, 3).map(s => s.name).join("、");
      const desc = repo.skills.length > 0
        ? `包含 ${repo.skills.length} 个子技能：${subNames}${repo.skills.length > 3 ? " 等" : ""}`
        : repo.path;

      const maxUseCount = Math.max(0, ...repo.skills.map(s => s.use_count || 0));
      const hasFavorite = repo.skills.some(s => s.is_favorite);

      return {
        id: `r-${repo.id}`,
        type: "skill" as const,
        title: repo.name,
        description: desc,
        contentToCopy: repo.path,
        tags: undefined,
        category: undefined,
        isFavorite: hasFavorite,
        useCount: maxUseCount,
        isSubSkill: false,
        badge: `合辑 (${repo.skills.length})`,
        sourceDirLabel: dirLabel,
        isDuplicate: isDup
      };
    }).sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      return b.useCount - a.useCount;
    });
  }, [repos, dirMap, repoNameCounts]);

  // 2. 全量子技能视图（展平全部子技能）
  const allSubSkillItems: ListItem[] = useMemo(() => {
    const list: ListItem[] = [];
    for (const repo of repos) {
      const isCollection = repo.repo_type === "collection" || repo.skills.length > 1;
      const dirLabel = repo.source_dir_id ? dirMap.get(repo.source_dir_id) : undefined;
      for (const skill of repo.skills) {
        list.push({
          id: `s-${skill.id}`,
          type: "skill" as const,
          title: skill.name,
          description: skill.description || skill.local_path,
          contentToCopy: skill.local_path,
          tags: skill.tags,
          category: isCollection ? repo.name : undefined,
          isFavorite: skill.is_favorite,
          useCount: skill.use_count || 0,
          isSubSkill: isCollection,
          badge: isCollection ? "子技能" : "单技能",
          sourceDirLabel: dirLabel
        });
      }
    }
    return list.sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      return b.useCount - a.useCount;
    });
  }, [repos, dirMap]);

  // 提示词列表数据
  const promptItems: ListItem[] = useMemo(() => {
    const list: ListItem[] = prompts.map(p => ({
      id: `p-${p.id}`,
      type: "prompt",
      title: p.title,
      description: p.description || p.content.slice(0, 100),
      contentToCopy: p.content,
      tags: p.tags,
      category: p.group_name || "未分组",
      isFavorite: p.is_favorite,
      useCount: p.use_count || 0
    }));

    return list.sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      return b.useCount - a.useCount;
    });
  }, [prompts]);

  // 当前激活 Tab 的数据源（默认仅主技能，勾选后同时显示子技能）
  const currentTabItems = useMemo(() => {
    if (activeTab === "prompts") {
      return promptItems;
    }
    return showSubSkills ? allSubSkillItems : mainSkillItems;
  }, [activeTab, promptItems, allSubSkillItems, mainSkillItems, showSubSkills]);

/**
 * 单词边界匹配检测：
 * 检查 text 是否包含以 q 开头的独立分词（支持按空格、横线-、下划线_、斜杠/、点. 分隔）
 */
function hasWordPrefix(text: string, q: string): boolean {
  if (!text || !q) return false;
  const words = text.toLowerCase().split(/[\s\-_\/\\:.]+/);
  return words.some(w => w.startsWith(q));
}

/**
 * 计算检索项与搜索关键词的相关度得分与匹配标签
 * 得分越高越靠前，返回 0 表示未命中任何关键词
 */
function calculateRelevance(item: ListItem, query: string): { score: number; matchedTag?: string } {
  const q = query.toLowerCase().trim();
  if (!q) return { score: 1 };

  const title = (item.title || "").toLowerCase();
  const desc = (item.description || "").toLowerCase();
  const tags = (item.tags || "").toLowerCase();
  const cat = (item.category || "").toLowerCase();
  const content = item.type === "prompt" ? (item.contentToCopy || "").toLowerCase() : "";

  let score = 0;
  let matchedTag: string | undefined = undefined;

  // 1. 标题匹配
  if (title === q) {
    // 标题完全精准匹配（例如搜 ui，标题就是 ui）
    score += 10000;
  } else if (title.startsWith(q)) {
    // 标题以关键词开头（例如搜 ui，标题是 ui-ux-pro-max-skill）
    score += 6000;
  } else if (hasWordPrefix(title, q)) {
    // 标题中某个单词以关键词开头（例如搜 ui，标题是 modern-web-ui-kit）
    score += 4500;
  } else if (title.includes(q)) {
    // 关键拦截：当搜索词很短（<= 2 个字符，如 u, ui, ai）时，
    // 如果既不是词首，也不是分词开头，仅仅是某个单词内部的字母组合（如 guizang 里的 ui，slides 里的 u）
    // 绝对不判定为标题命中！
    if (q.length > 2) {
      const idx = title.indexOf(q);
      score += Math.max(1200, 3000 - idx * 60);
    }
  }

  // 2. 标签匹配（非常重要！例如 frontend-slides 的标签是 UI/UX）
  if (tags) {
    const rawTagList = (item.tags || "").split(/[,，\s]+/);
    for (const rawTag of rawTagList) {
      const t = rawTag.toLowerCase().trim();
      if (!t) continue;
      if (t === q) {
        score += 3500;
        matchedTag = rawTag;
        break;
      } else if (t.startsWith(q) || hasWordPrefix(t, q)) {
        score += 2500;
        matchedTag = rawTag;
        break;
      } else if (t.includes(q) && q.length > 2) {
        score += 1200;
        matchedTag = rawTag;
        break;
      }
    }
  }

  // 3. 分类/合辑名称匹配
  if (cat) {
    if (cat === q) {
      score += 1500;
    } else if (cat.startsWith(q) || hasWordPrefix(cat, q)) {
      score += 800;
    } else if (cat.includes(q) && q.length > 2) {
      score += 400;
    }
  }

  // 4. 描述匹配（低权重，仅当长词或描述中为独立单词开头时才匹配，绝不让杂乱描述抢跑）
  if (desc) {
    if (hasWordPrefix(desc, q)) {
      score += 250;
    } else if (q.length > 2 && desc.includes(q)) {
      const descIdx = desc.indexOf(q);
      score += Math.max(50, 180 - Math.min(descIdx, 120));
    }
  }

  // 5. 提示词正文全文匹配（仅对 prompt 正文，且短词不触发内部乱匹配）
  if (content) {
    if (hasWordPrefix(content, q)) {
      score += 150;
    } else if (q.length > 2 && content.includes(q)) {
      score += 80;
    }
  }

  // 如果以上字段均未命中任何内容，则过滤掉
  if (score === 0) return { score: 0 };

  // 6. 辅助微调项：同梯队下收藏优先、常用优先、标题更短聚焦优先
  if (item.isFavorite) {
    score += 40;
  }
  score += Math.min(item.useCount || 0, 30);
  score += Math.max(0, 30 - Math.min(title.length, 30));

  return { score, matchedTag };
}

  // 搜索过滤与相关度动态排序
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) {
      return currentTabItems;
    }

    const q = searchQuery.toLowerCase().trim();
    const scoredList: { item: ListItem; score: number }[] = [];

    for (const item of currentTabItems) {
      const { score, matchedTag } = calculateRelevance(item, q);
      if (score > 0) {
        scoredList.push({
          item: matchedTag ? { ...item, matchedTag } : item,
          score
        });
      }
    }

    // 按相关度得分降序排序，得分高的排在前面
    scoredList.sort((a, b) => b.score - a.score);

    return scoredList.map(s => s.item);
  }, [currentTabItems, searchQuery]);

  // 重置选中下标与渲染限制
  useEffect(() => {
    setSelectedIndex(0);
    setRenderLimit(40);
  }, [searchQuery, activeTab, showSubSkills]);

  // 当键盘向下导航到接近渲染边界时，自动扩充分片渲染上限
  useEffect(() => {
    if (selectedIndex >= renderLimit - 5) {
      setRenderLimit(prev => Math.min(prev + 40, filteredItems.length));
    }
  }, [selectedIndex, renderLimit, filteredItems.length]);

  // 分片展示的实际渲染数组
  const displayedItems = useMemo(() => {
    return filteredItems.slice(0, renderLimit);
  }, [filteredItems, renderLimit]);

  // 列表滚动监听：动态分片扩充
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 150) {
      setRenderLimit(prev => Math.min(prev + 40, filteredItems.length));
    }
  };

  // 滚动聚焦对应项
  useEffect(() => {
    if (listRef.current && listRef.current.children[selectedIndex]) {
      const itemEl = listRef.current.children[selectedIndex] as HTMLElement;
      itemEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  // 复制内容并触发微动效
  const handleCopy = async (item: ListItem, e?: React.MouseEvent, isReference = false) => {
    if (e) e.stopPropagation();

    try {
      let textToCopy = item.contentToCopy;
      let label = item.type === "prompt" ? "提示词" : "技能路径";

      // 如果请求智能引用 Prompt 且为技能
      if (isReference && item.type === "skill") {
        if (item.id.startsWith("s-")) {
          const rawId = item.id.replace("s-", "");
          setToastMsg("正在生成智能引用...");
          textToCopy = await invoke<string>("generate_skill_reference_prompt", { skillId: rawId });
          label = "智能引用Prompt";
        } else {
          textToCopy = item.contentToCopy;
          label = "仓库路径";
        }
      }

      await navigator.clipboard.writeText(textToCopy);
      setCopiedId(item.id);
      setCopiedType(isReference ? "ref" : "content");
      setToastMsg(`✓ 已复制${label}`);

      // 增加使用计数
      if (item.type === "prompt") {
        const rawId = item.id.replace("p-", "");
        invoke("increment_prompt_use_count", { id: rawId }).catch(() => {});
      } else if (item.id.startsWith("s-")) {
        const rawId = item.id.replace("s-", "");
        invoke("increment_skill_use_count", { id: rawId }).catch(() => {});
      }

      setTimeout(() => {
        setCopiedId(null);
        setCopiedType(null);
        setToastMsg(null);
      }, 1500);
    } catch (err) {
      console.error("Failed to copy text", err);
      setToastMsg(`复制失败: ${err}`);
      setTimeout(() => setToastMsg(null), 2000);
    }
  };

  // 全局键盘快捷键捕获（Tab / Esc / 方向键 / Enter / Cmd+Enter）
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 1. ESC 键：无论在何处按下，立即收起面板
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        invoke("hide_tray_panel").catch(() => getCurrentWindow().hide());
        return;
      }

      // 2. Tab 键：在「技能」与「提示词」之间直接切换，阻止焦点乱跳
      if (e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        setActiveTab(prev => (prev === "skills" ? "prompts" : "skills"));
        return;
      }

      // 3. 方向键导航（让输入框失焦，列表快速上下切换）
      if (e.key === "ArrowDown") {
        e.preventDefault();
        inputRef.current?.blur();
        setSelectedIndex(prev => {
          const next = prev < filteredItems.length - 1 ? prev + 1 : prev;
          setRenderLimit(l => (next >= l - 5 ? Math.min(l + 40, filteredItems.length) : l));
          return next;
        });
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        inputRef.current?.blur();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
        return;
      }

      // 4. 当输入框未聚焦时，按下任意普通可输入字符键自动唤醒输入框焦点
      if (
        document.activeElement !== inputRef.current &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        e.key.length === 1
      ) {
        inputRef.current?.focus();
      }

      // 4. Enter 回车键 (含 Cmd/Ctrl + Enter)：
      // 关键防冲突逻辑：如果正在使用中文拼音输入法选词，绝对不触发复制！
      if (e.key === "Enter") {
        if (
          isComposingRef.current ||
          e.isComposing ||
          (e as any).keyCode === 229
        ) {
          // 正在打拼音/选词，直接放行给输入法
          return;
        }

        // 只有列表有结果时才触发复制
        if (filteredItems.length > 0 && filteredItems[selectedIndex]) {
          e.preventDefault();
          const isMod = e.metaKey || e.ctrlKey;
          const currentItem = filteredItems[selectedIndex];

          // 如果按下 Cmd/Ctrl + Enter 且当前选中的是 Skill，复制智能引用 Prompt
          if (isMod && currentItem.type === "skill") {
            handleCopy(currentItem, undefined, true);
          } else {
            handleCopy(currentItem, undefined, false);
          }
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown, true);
    };
  }, [filteredItems, selectedIndex]);

  // 打开主窗口
  const handleOpenMain = () => {
    invoke("show_main_window").catch(console.error);
  };

  // 打开偏好设置
  const handleOpenPreferences = () => {
    invoke("open_preferences").catch(console.error);
  };

  // 退出整个应用
  const handleExitApp = () => {
    invoke("exit_app").catch(console.error);
  };

  return (
    <div className="w-full h-full flex flex-col justify-center items-center select-none overflow-hidden bg-transparent">
      {/* 悬浮核心卡片：纯净圆角，极浅浅色微边框，系统原生阴影 */}
      <div className="flex flex-col w-full h-full overflow-hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl text-slate-800 dark:text-slate-100 border border-black/[0.03] dark:border-white/[0.08] rounded-2xl font-sans">
      
      {/* 顶部标题栏区域（带应用 Logo 与快捷键指示） */}
      <div
        className="flex items-center justify-between px-3.5 pt-3 pb-2 border-b border-black/[0.05] dark:border-white/[0.06] cursor-default shrink-0"
        data-tauri-drag-region
      >
        <div className="flex items-center space-x-2 shrink-0 pointer-events-none">
          <img
            src={logo}
            alt="SkillHub Logo"
            className="w-5 h-5 rounded-md object-contain shrink-0 drop-shadow-sm"
          />
          <span className="text-xs font-semibold tracking-wide text-slate-800 dark:text-slate-100 whitespace-nowrap shrink-0">
            SkillHub
          </span>
        </div>

        {/* 紧凑精致的快捷键提示（只放 tab、enter、esc） */}
        <div className="flex items-center space-x-1.5 text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
          <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[9px]">Tab</kbd>
          <span>切换</span>
          <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[9px] ml-0.5">↵</kbd>
          <span>复制</span>
          <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[9px] ml-0.5">Esc</kbd>
          <span>收起</span>
        </div>
      </div>

      {/* 搜索框 */}
      <div className="px-3 pt-2.5 pb-2 shrink-0">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 absolute left-3 text-slate-400 dark:text-slate-500 pointer-events-none" />
          <input
            ref={inputRef}
            autoFocus
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onCompositionStart={() => { isComposingRef.current = true; }}
            onCompositionEnd={() => { isComposingRef.current = false; }}
            onKeyDown={e => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                inputRef.current?.blur();
                if (e.key === "ArrowDown") {
                  setSelectedIndex(prev => {
                    const next = prev < filteredItems.length - 1 ? prev + 1 : prev;
                    setRenderLimit(l => (next >= l - 5 ? Math.min(l + 40, filteredItems.length) : l));
                    return next;
                  });
                } else {
                  setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
                }
              }
            }}
            placeholder={activeTab === "skills" ? "搜索已安装技能..." : "搜索常用提示词..."}
            className="w-full pl-9 pr-8 py-2 text-xs bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/[0.1] rounded-xl outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 text-slate-800 dark:text-slate-100 shadow-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xs px-1"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Tab 切换栏：仅保留两个（技能在前，提示词在后） */}
      <div className="flex items-center px-3 pb-2 space-x-2 border-b border-black/[0.05] dark:border-white/[0.06] shrink-0">
        <button
          onClick={() => setActiveTab("skills")}
          className={`flex-1 py-1.5 px-3 text-[11px] font-medium rounded-lg transition-all flex items-center justify-center space-x-1.5 ${
            activeTab === "skills"
              ? "bg-blue-600 text-white shadow-sm shadow-blue-500/25"
              : "text-slate-500 dark:text-slate-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
          }`}
        >
          <FileCode className="w-3.5 h-3.5" />
          <span>技能</span>
          <span className={`text-[10px] ml-0.5 ${activeTab === "skills" ? "text-blue-100" : "opacity-70"}`}>
            ({showSubSkills ? allSubSkillItems.length : mainSkillItems.length})
          </span>
        </button>

        <button
          onClick={() => setActiveTab("prompts")}
          className={`flex-1 py-1.5 px-3 text-[11px] font-medium rounded-lg transition-all flex items-center justify-center space-x-1.5 ${
            activeTab === "prompts"
              ? "bg-blue-600 text-white shadow-sm shadow-blue-500/25"
              : "text-slate-500 dark:text-slate-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
          }`}
        >
          <MessageSquareQuote className="w-3.5 h-3.5" />
          <span>提示词</span>
          <span className={`text-[10px] ml-0.5 ${activeTab === "prompts" ? "text-blue-100" : "opacity-70"}`}>
            ({prompts.length})
          </span>
        </button>
      </div>

      {/* 仅在技能 Tab 下展示：子技能复选框控制条 */}
      {activeTab === "skills" && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-black/[0.02] dark:bg-white/[0.02] border-b border-black/[0.04] dark:border-white/[0.04] shrink-0 select-none">
          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
            {showSubSkills ? `全部技能 (${allSubSkillItems.length})` : `主技能 (${mainSkillItems.length})`}
          </span>

          <label className="flex items-center space-x-1.5 cursor-pointer group select-none">
            <div className="relative flex items-center justify-center">
              <input 
                type="checkbox" 
                checked={showSubSkills}
                onChange={(e) => {
                  const val = e.target.checked;
                  setShowSubSkills(val);
                  localStorage.setItem("skillhub_tray_show_sub_skills", String(val));
                }}
                className="peer appearance-none w-3.5 h-3.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 checked:bg-blue-600 checked:border-blue-600 transition-all cursor-pointer shadow-xs"
              />
              <svg className="absolute w-2.5 h-2.5 text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200 transition-colors">
              同时显示子技能
            </span>
          </label>
        </div>
      )}

      {/* 列表主体区域 */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700"
      >
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-slate-400 dark:text-slate-500">
            <Search className="w-8 h-8 stroke-1 mb-2 opacity-35" />
            <p className="text-xs">未找到匹配的{activeTab === "skills" ? "技能" : "提示词"}</p>
          </div>
        ) : (
          <>
            {displayedItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              const isItemCopied = copiedId === item.id;

              return (
                <div
                  key={item.id}
                  onClick={e => handleCopy(item, e)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`group relative flex items-start p-2.5 rounded-xl cursor-pointer transition-all border ${
                    isSelected
                      ? "bg-blue-50/80 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/60 shadow-sm"
                      : "bg-white/60 dark:bg-slate-800/40 border-transparent hover:bg-white dark:hover:bg-slate-800/80"
                  }`}
                >
                  {/* 类别图标 */}
                  <div
                    className={`mt-0.5 p-1.5 rounded-lg flex-shrink-0 mr-2.5 transition-colors ${
                      item.type === "prompt"
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        : "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
                    }`}
                  >
                    {item.type === "prompt" ? (
                      <MessageSquareQuote className="w-3.5 h-3.5" />
                    ) : (
                      <FileCode className="w-3.5 h-3.5" />
                    )}
                  </div>

                  {/* 文本内容 */}
                  <div className="flex-1 min-w-0 pr-1">
                    <div className="flex items-center space-x-1.5">
                      <span className="font-semibold text-xs text-slate-800 dark:text-slate-100 truncate">
                        {item.title}
                      </span>
                      {item.isFavorite && (
                        <Star className="w-3 h-3 text-amber-500 fill-amber-500 flex-shrink-0" />
                      )}
                      {item.type === "skill" && item.badge && (
                        <span className={`text-[9px] px-1.5 py-[1px] rounded font-normal flex-shrink-0 ${
                          item.isSubSkill 
                            ? "bg-black/[0.04] dark:bg-white/[0.06] text-slate-400 dark:text-slate-500"
                            : item.badge.startsWith("合辑")
                            ? "bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 font-medium"
                            : "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-medium"
                        }`}>
                          {item.badge}
                        </span>
                      )}
                      {item.category && item.category !== item.badge && !["正式技能", "其他", "other", "skill"].includes(item.category.toLowerCase().trim()) && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-normal flex-shrink-0">
                          {item.category}
                        </span>
                      )}
                      {/* 如果有跨库同名项，直观标出来源技能库 */}
                      {item.sourceDirLabel && item.isDuplicate && (
                        <span className="text-[9px] px-1.5 py-[1px] rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-normal flex-shrink-0 flex items-center gap-1" title={`所在技能库：${item.sourceDirLabel}`}>
                          <Folder className="w-2.5 h-2.5 shrink-0" />
                          <span>{item.sourceDirLabel}</span>
                        </span>
                      )}
                      {/* 如果搜索命中了标签，标出命中的标签（如 UI/UX） */}
                      {item.matchedTag && (
                        <span className="text-[9px] px-1.5 py-[1px] rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-normal flex-shrink-0 flex items-center gap-1">
                          <Tag className="w-2.5 h-2.5 shrink-0" />
                          <span>{item.matchedTag}</span>
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
                        {item.description}
                      </p>
                    )}
                  </div>

                  {/* 右侧动作按钮区 */}
                  <div className="flex items-center space-x-1 flex-shrink-0 ml-1">
                    {item.type === "skill" && (
                      <button
                        title="复制智能引用Prompt (⌘/Ctrl + Enter)"
                        onClick={e => handleCopy(item, e, true)}
                        className={`p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/50 transition-all opacity-0 group-hover:opacity-100 ${
                          isItemCopied && copiedType === "ref" ? "!opacity-100 text-emerald-600 bg-emerald-50" : ""
                        }`}
                      >
                        {isItemCopied && copiedType === "ref" ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Tag className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                    <button
                      title="复制内容 (Enter)"
                      onClick={e => handleCopy(item, e, false)}
                      className={`p-1.5 rounded-lg transition-all ${
                        isItemCopied && copiedType === "content"
                          ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40"
                          : "text-slate-400 group-hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/50"
                      }`}
                    >
                      {isItemCopied && copiedType === "content" ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}

            {displayedItems.length < filteredItems.length && (
              <div className="py-2.5 text-center text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                已展示 {displayedItems.length} / {filteredItems.length} 项（滚动或向下键加载更多）
              </div>
            )}
          </>
        )}
      </div>

      {/* 底部悬浮 Toast 提示 */}
      {toastMsg && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 px-3 py-1 bg-slate-900/90 dark:bg-white/90 text-white dark:text-slate-900 text-xs rounded-full shadow-lg pointer-events-none transition-all flex items-center space-x-1 animate-in fade-in zoom-in-95 duration-150">
          <span>{toastMsg}</span>
        </div>
      )}

      {/* 底部操作工具条（完全贴底，与卡片圆角一体化） */}
      <div className="px-3 py-2 border-t border-black/[0.04] dark:border-white/[0.05] bg-slate-50/60 dark:bg-slate-900/60 flex items-center justify-between text-xs shrink-0 rounded-b-2xl">
        <div className="flex items-center space-x-1">
          <button
            onClick={handleOpenMain}
            className="flex items-center space-x-1 px-2 py-1 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/70 dark:hover:bg-blue-950/40 rounded-lg transition-colors cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="font-medium text-[11px] whitespace-nowrap">打开SkillHub</span>
          </button>

          <button
            onClick={handleOpenPreferences}
            className="flex items-center space-x-1 px-2 py-1 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/70 dark:hover:bg-blue-950/40 rounded-lg transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="font-medium text-[11px] whitespace-nowrap">偏好设置</span>
          </button>
        </div>

        <div className="flex items-center space-x-1">
          {/* 分割线 */}
          <div className="h-3 w-[1px] bg-black/[0.1] dark:bg-white/[0.12] mx-1 shrink-0" />

          <button
            onClick={handleExitApp}
            className="flex items-center space-x-1 px-2 py-1 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50/70 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
          >
            <Power className="w-3.5 h-3.5" />
            <span className="font-medium text-[11px] whitespace-nowrap">退出</span>
          </button>
        </div>
      </div>
    </div>
  </div>
  );
}
