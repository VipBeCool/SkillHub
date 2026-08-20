export interface Skill {
  id: string;
  name: string;
  description: string;
  local_path: string;
  source_type: string; // "github" | "local" | "online"
  updated_at: string;
  source_dir_id?: string;
  category: string;
  tags?: string;
  skill_scope?: string;
  online_url?: string;
  is_favorite: boolean;
  use_count: number;
}

export interface SourceDirectory {
  id: string;
  path: string;
  label: string;
  source_type: string;
  is_default: boolean;
  icon?: string | null;
  sort_order?: number;
  is_protected?: boolean;
  is_missing?: boolean;
  added_at: string;
  updated_at?: string;
}

export interface AgentConfig {
  id: string;
  display_name: string;
}

export interface SyncRecord {
  skill_id: string;
  agent_id: string;
}

export interface GroupedRepo {
  id: string;
  name: string;
  path: string;
  source_type: string;
  source_dir_id?: string;
  updated_at: string;
  skills: Skill[];
  category?: string;
  is_missing?: boolean;
}

// ===== Prompt 管理相关类型 =====

export interface PromptGroup {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  sort_order: number;
  created_at: string;
  prompt_count: number;
}

export interface Prompt {
  id: string;
  title: string;
  content: string;
  description?: string;
  group_id?: string;
  group_name?: string;
  tags?: string;
  is_favorite: boolean;
  use_count: number;
  variables?: string;      // JSON string: PromptVariable[]
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface PromptVersion {
  id: string;
  prompt_id: string;
  content: string;
  version: number;
  change_note?: string;
  created_at: string;
}

export interface PromptVariable {
  name: string;    // 变量名，如 {{lang}}
  label: string;   // 显示标签
  default?: string;
}
