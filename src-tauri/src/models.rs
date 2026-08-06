use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SourceDirectory {
    pub id: String,
    pub path: String,
    pub label: String,
    pub source_type: String,
    pub is_default: bool,
    pub icon: Option<String>,
    pub sort_order: i32,
    pub is_protected: bool,
    #[serde(default)]
    pub is_missing: bool,
    pub added_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Repository {
    pub id: String,
    pub name: String,
    pub github_url: Option<String>,
    pub local_path: String,
    pub source_dir_id: String,
    pub source_type: String, // "github" or "local"
    pub current_branch: Option<String>,
    pub current_commit: Option<String>,
    pub last_checked: Option<String>,
    pub has_updates: bool,
    pub added_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub local_path: String,
    pub repo_id: Option<String>,
    pub source_dir_id: String,
    pub relative_path: String,
    pub source_type: String, // "github" or "local"
    pub installed_at: String,
    pub updated_at: String,
    pub is_active: bool,
    pub category: String,
    pub tags: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentConfig {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub config_path: String,
    pub skills_path: String,
    pub sync_method: String, // "symlink" or "copy"
    pub version: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncRecord {
    pub skill_id: String,
    pub agent_id: String,
    pub sync_type: String,
    pub synced_path: String,
    pub synced_at: String,
    pub status: String, // "success", "failed", "pending"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GroupedRepo {
    pub id: String,
    pub name: String,
    pub path: String,
    pub source_type: String,
    pub source_dir_id: Option<String>,
    pub updated_at: String,
    pub skills: Vec<Skill>,
    pub category: Option<String>,
    #[serde(default)]
    pub is_missing: bool,
}
