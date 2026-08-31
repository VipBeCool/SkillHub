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
    pub source_type: String, // "github" | "local" | "online"
    pub installed_at: String,
    pub updated_at: String,
    pub is_active: bool,
    pub category: String,
    pub tags: Option<String>,
    /// 技能范围（内部逻辑，不对用户暴露）：loose / packed / repo
    #[serde(default = "default_skill_scope")]
    pub skill_scope: String,
    /// 线上地址（仅 source_type="online" 时有值）
    #[serde(default)]
    pub online_url: Option<String>,
    #[serde(default)]
    pub is_favorite: bool,
    #[serde(default)]
    pub use_count: i64,
}


fn default_skill_scope() -> String {
    "repo".to_string()
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
    pub installed_at: String,
    pub updated_at: String,
    pub skills: Vec<Skill>,
    pub category: Option<String>,
    #[serde(default)]
    pub is_missing: bool,
    /// 仓库类型（内部逻辑，不对用户暴露）：single / collection
    #[serde(default = "default_repo_type")]
    pub repo_type: String,
    pub author: Option<String>,
}

fn default_repo_type() -> String {
    "single".to_string()
}

// ===== Prompt 管理相关模型 =====

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PromptGroup {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub sort_order: i32,
    pub created_at: String,
    #[serde(default)]
    pub prompt_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Prompt {
    pub id: String,
    pub title: String,
    pub content: String,
    pub description: Option<String>,
    pub group_id: Option<String>,
    pub group_name: Option<String>,
    pub tags: Option<String>,
    pub is_favorite: bool,
    pub use_count: i64,
    pub variables: Option<String>,
    pub version: i64,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PromptVersion {
    pub id: String,
    pub prompt_id: String,
    pub content: String,
    pub version: i64,
    pub change_note: Option<String>,
    pub created_at: String,
}
