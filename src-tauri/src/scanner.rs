use std::path::{Path, PathBuf};
use walkdir::WalkDir;
use serde::Deserialize;
use uuid::Uuid;
use chrono::Utc;
use rusqlite::params;
use crate::AppState;
use tauri::State;
use serde_yaml::Value;

#[derive(Debug, Deserialize)]
struct SkillFrontmatter {
    name: Option<String>,
    description: Option<String>,
    category: Option<String>,
    tags: Option<Value>,
}

#[derive(Debug)]
pub struct ScannedSkill {
    pub name: String,
    pub description: String,
    pub local_path: String,
    pub relative_path: String,
    pub category: String,
    pub tags: Option<String>,
    pub updated_at: String,
}

fn is_hidden_or_excluded(entry: &walkdir::DirEntry) -> bool {
    let file_name = entry.file_name().to_string_lossy();
    if entry.file_type().is_dir() {
        file_name.starts_with('.') || file_name == "node_modules" || file_name == "target" || file_name == "dist" || file_name == "build" || file_name == "out"
    } else {
        false
    }
}

pub fn scan_directory(dir_path: &Path) -> Result<Vec<ScannedSkill>, String> {
    let mut all_parsed = Vec::new();
    let mut skill_roots = std::collections::HashSet::new();

    if !dir_path.exists() || !dir_path.is_dir() {
        return Err("Directory does not exist or is not a directory".into());
    }

    for entry in WalkDir::new(dir_path).into_iter().filter_entry(|e| !is_hidden_or_excluded(e)).filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            let file_name_str = entry.file_name().to_string_lossy().to_string();
            let is_legacy = file_name_str == "SKILL.md";
            let lower_name = file_name_str.to_lowercase();
            
            // Skip common non-skill markdown files to speed up
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
                    if let Some((name, description, explicit_cat, explicit_tags)) = parse_frontmatter(&content) {
                        let is_skill_def = lower_name == "skill.md" || lower_name == "skill.mdx";
                        if is_skill_def {
                            if let Some(parent) = path.parent() {
                                skill_roots.insert(parent.to_path_buf());
                            }
                        }
                        
                        let parent_dir_name = path.parent()
                            .and_then(|p| p.file_name())
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_default();
                            
                        let mut final_tags = explicit_tags.unwrap_or_default();
                        
                        // Intelligent fallback tag from folder
                        if final_tags.is_empty() && !parent_dir_name.is_empty() && parent_dir_name != "." {
                            if parent_dir_name != "design-md" && parent_dir_name != "src" && parent_dir_name != "agency-agents-zh" {
                                final_tags.push(parent_dir_name.clone());
                            }
                        }

                        let category = if let Some(ref cat) = explicit_cat {
                            cat.clone()
                        } else {
                            if file_name_str == "SKILL.md" {
                                "正式技能".to_string()
                            } else {
                                "其他".to_string()
                            }
                        };

                        let tags_str = if final_tags.is_empty() {
                            None
                        } else {
                            Some(final_tags.join(","))
                        };

                        // IMPORTANT: local_path is now the path to the ACTUAL file, ensuring uniqueness in SQLite
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
                                tags: tags_str,
                                updated_at: mod_time_str,
                            }
                        ));
                    }
                }
            }
        }
    }

    let mut skills = Vec::new();
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
            skills.push(skill);
        }
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


