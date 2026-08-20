use std::path::{Path, PathBuf};
use walkdir::WalkDir;
use serde::Deserialize;
use chrono::Utc;
use serde_yaml::Value;

#[derive(Debug, Deserialize)]
struct SkillFrontmatter {
    name: Option<String>,
    description: Option<String>,
    category: Option<String>,
    tags: Option<Value>,
}

#[derive(Debug, Clone)]
pub struct ScannedSkill {
    pub name: String,
    pub description: String,
    pub local_path: String,
    pub relative_path: String,
    pub category: String,
    pub tags: Option<String>,
    pub updated_at: String,
    /// 技能范围（内部逻辑）：loose / packed / repo
    pub skill_scope: String,
}

/// 判断目录是否需要跳过（含白名单：部分隐藏目录可能包含技能）
fn is_hidden_or_excluded(entry: &walkdir::DirEntry) -> bool {
    let file_name = entry.file_name().to_string_lossy();
    if entry.file_type().is_dir() {
        // 白名单：这些 . 开头的目录可能包含技能，不跳过
        let whitelisted = [".claude", ".agents", ".cursor", ".codex",
                           ".hermes-plugin", ".kimi-plugin"];
        if whitelisted.iter().any(|w| file_name == *w) {
            return false;
        }
        file_name.starts_with('.')
            || file_name == "node_modules"
            || file_name == "target"
            || file_name == "dist"
            || file_name == "build"
            || file_name == "out"
    } else {
        false
    }
}

/// 推断技能的 skill_scope：
/// - 入口文件的父目录 == source_dir → repo（整仓）
/// - 同父目录有 ≥2 个技能入口 → loose（散装）
/// - 否则 → packed（独立包）
fn infer_skill_scope(skill_path: &Path, all_paths: &[PathBuf], source_dir: &Path) -> String {
    let parent = match skill_path.parent() {
        Some(p) => p,
        None => return "repo".to_string(),
    };

    // 在 source_dir 根目录 → 整仓
    if parent == source_dir {
        return "repo".to_string();
    }

    // 统计同父目录下有多少个其他技能入口文件
    let siblings = all_paths.iter()
        .filter(|p| p.as_path() != skill_path && p.parent() == Some(parent))
        .count();

    if siblings >= 1 {
        "loose".to_string()   // 同目录有其他技能 → 散装
    } else {
        "packed".to_string()  // 该目录仅此一个技能 → 独立包
    }
}

pub fn scan_directory(dir_path: &Path) -> Result<Vec<ScannedSkill>, String> {
    let mut all_parsed: Vec<(PathBuf, bool, ScannedSkill)> = Vec::new();
    let mut skill_roots = std::collections::HashSet::new();

    if !dir_path.exists() || !dir_path.is_dir() {
        return Err("Directory does not exist or is not a directory".into());
    }

    for entry in WalkDir::new(dir_path).into_iter().filter_entry(|e| !is_hidden_or_excluded(e)).filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            let file_name_str = entry.file_name().to_string_lossy().to_string();
            let is_legacy = file_name_str == "SKILL.md";
            let lower_name = file_name_str.to_lowercase();
            
            // 跳过常见的非技能 md 文件
            if lower_name == "readme.md" || lower_name == "contributing.md" {
                continue;
            }

            if is_legacy || lower_name.ends_with(".md") || lower_name.ends_with(".mdx") {
                let path = entry.path();
                
                let mut mod_time_str = Utc::now().to_rfc3339();
                if let Ok(metadata) = std::fs::metadata(&path) {
                    if let Ok(modified) = metadata.modified() {
                        let dt: chrono::DateTime<Utc> = modified.into();
                        mod_time_str = dt.to_rfc3339();
                    }
                }

                if let Ok(content) = std::fs::read_to_string(path) {
                    if let Some((name, description, explicit_cat, _explicit_tags)) = parse_frontmatter(&content) {
                        let is_skill_def = lower_name == "skill.md" || lower_name == "skill.mdx";
                        if is_skill_def {
                            if let Some(parent) = path.parent() {
                                skill_roots.insert(parent.to_path_buf());
                            }
                        }
                        
                        let _parent_dir_name = path.parent()
                            .and_then(|p| p.file_name())
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_default();
                        let category = if let Some(ref cat) = explicit_cat {
                            cat.clone()
                        } else {
                            if file_name_str == "SKILL.md" {
                                "正式技能".to_string()
                            } else {
                                "其他".to_string()
                            }
                        };
                        // local_path 指向具体文件，保证 SQLite 唯一性
                        let local_path = path.to_string_lossy().to_string();
                        
                        let relative_path = path.strip_prefix(dir_path)
                            .unwrap_or(path)
                            .parent()
                            .unwrap_or(Path::new(""))
                            .to_string_lossy()
                            .to_string();

                        all_parsed.push((
                            path.to_path_buf(),
                            is_skill_def,
                            ScannedSkill {
                                name,
                                description,
                                local_path,
                                relative_path,
                                category,
                                tags: None, // 标签完全由用户手动管理，不再从文件或目录解析
                                updated_at: mod_time_str,
                                skill_scope: "repo".to_string(), // 占位，后面第二遍推断
                            }
                        ));
                    }
                }
            }
        }
    }

    // 第一遍过滤：去掉被 skill_roots 覆盖的嵌套文件
    let mut filtered: Vec<(PathBuf, ScannedSkill)> = Vec::new();
    for (path, is_skill_def, skill) in all_parsed {
        let mut is_ignored = false;
        
        let mut current = path.parent();
        while let Some(p) = current {
            if skill_roots.contains(p) {
                if is_skill_def && p == path.parent().unwrap() {
                    let mut higher = p.parent();
                    let mut found_higher = false;
                    while let Some(h) = higher {
                        if skill_roots.contains(h) {
                            found_higher = true;
                            break;
                        }
                        higher = h.parent();
                    }
                    if found_higher {
                        is_ignored = true;
                    }
                } else {
                    is_ignored = true;
                }
                break;
            }
            current = p.parent();
        }
        
        if !is_ignored {
            filtered.push((path, skill));
        }
    }

    // 第二遍：推断每个技能的 skill_scope
    let all_paths: Vec<PathBuf> = filtered.iter().map(|(p, _)| p.clone()).collect();
    let mut skills = Vec::new();
    for (path, mut skill) in filtered {
        skill.skill_scope = infer_skill_scope(&path, &all_paths, dir_path);
        skills.push(skill);
    }

    Ok(skills)
}

fn parse_tags(val: &Option<serde_yaml::Value>) -> Vec<String> {
    let mut tags = Vec::new();
    if let Some(v) = val {
        if let Some(seq) = v.as_sequence() {
            for item in seq {
                if let Some(s) = item.as_str() {
                    tags.push(s.to_string());
                }
            }
        } else if let Some(s) = v.as_str() {
            for p in s.split(',') {
                let t = p.trim();
                if !t.is_empty() {
                    tags.push(t.to_string());
                }
            }
        }
    }
    tags
}

fn parse_frontmatter(content: &str) -> Option<(String, String, Option<String>, Option<Vec<String>>)> {
    if !content.starts_with("---") {
        return None;
    }

    let parts: Vec<&str> = content.split("---").collect();
    if parts.len() < 3 {
        return None;
    }

    let frontmatter_str = parts[1];
    let frontmatter: Result<SkillFrontmatter, _> = serde_yaml::from_str(frontmatter_str);

    if let Ok(fm) = frontmatter {
        if let (Some(name), Some(description)) = (fm.name, fm.description) {
            let tags = parse_tags(&fm.tags);
            return Some((name, description, fm.category, Some(tags)));
        }
    }

    None
}
