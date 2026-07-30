export interface Skill {
  id: string;
  name: string;
  description: string;
  local_path: string;
  source_type: string;
  updated_at: string;
  source_dir_id?: string;
  category: string;
  tags?: string;
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
}
