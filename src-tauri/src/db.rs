use rusqlite::{Connection, Result};
use std::path::PathBuf;

pub fn init_db(db_path: &PathBuf) -> Result<Connection> {
    let conn = Connection::open(db_path)?;

    // Create tables if they don't exist
    conn.execute(
        "CREATE TABLE IF NOT EXISTS source_directories (
            id TEXT PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            label TEXT NOT NULL,
            source_type TEXT NOT NULL,
            is_default BOOLEAN NOT NULL DEFAULT 0,
            icon TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_protected BOOLEAN NOT NULL DEFAULT 0,
            added_at DATETIME NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS repositories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            github_url TEXT,
            local_path TEXT NOT NULL UNIQUE,
            source_dir_id TEXT NOT NULL,
            source_type TEXT NOT NULL,
            current_branch TEXT,
            current_commit TEXT,
            last_checked DATETIME,
            has_updates BOOLEAN NOT NULL DEFAULT 0,
            added_at DATETIME NOT NULL,
            FOREIGN KEY (source_dir_id) REFERENCES source_directories(id)
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS skills (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            local_path TEXT NOT NULL UNIQUE,
            repo_id TEXT,
            source_dir_id TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            source_type TEXT NOT NULL,
            installed_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT 1,
            category TEXT NOT NULL DEFAULT 'Other',
            tags TEXT,
            FOREIGN KEY (repo_id) REFERENCES repositories(id),
            FOREIGN KEY (source_dir_id) REFERENCES source_directories(id)
        )",
        [],
    )?;

    // Migrations for existing databases
    {
        let mut stmt = conn.prepare("PRAGMA table_info(skills)")?;
        let mut has_category = false;
        let mut has_tags = false;
        let rows = stmt.query_map([], |row| {
            let name: String = row.get(1)?;
            Ok(name)
        })?;
        for name in rows {
            if let Ok(n) = name {
                if n == "category" { has_category = true; }
                if n == "tags" { has_tags = true; }
            }
        }
        if !has_category {
            let _ = conn.execute("ALTER TABLE skills ADD COLUMN category TEXT NOT NULL DEFAULT 'Other'", []);
        }
        if !has_tags {
            let _ = conn.execute("ALTER TABLE skills ADD COLUMN tags TEXT", []);
        }
        // skill_scope 迁移
        let mut has_skill_scope = false;
        let mut has_online_url = false;
        let rows2 = {
            let mut stmt2 = conn.prepare("PRAGMA table_info(skills)").unwrap();
            stmt2.query_map([], |row| { let name: String = row.get(1)?; Ok(name) }).unwrap()
                .filter_map(|r| r.ok()).collect::<Vec<_>>()
        };
        for col in &rows2 {
            if col == "skill_scope" { has_skill_scope = true; }
            if col == "online_url" { has_online_url = true; }
        }
        if !has_skill_scope {
            let _ = conn.execute("ALTER TABLE skills ADD COLUMN skill_scope TEXT NOT NULL DEFAULT 'repo'", []);
        }
        if !has_online_url {
            let _ = conn.execute("ALTER TABLE skills ADD COLUMN online_url TEXT", []);
        }
        
        let mut has_is_favorite = false;
        let mut has_use_count = false;
        for col in &rows2 {
            if col == "is_favorite" { has_is_favorite = true; }
            if col == "use_count" { has_use_count = true; }
        }
        if !has_is_favorite {
            let _ = conn.execute("ALTER TABLE skills ADD COLUMN is_favorite BOOLEAN NOT NULL DEFAULT 0", []);
        }
        if !has_use_count {
            let _ = conn.execute("ALTER TABLE skills ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0", []);
        }
    }

    {
        let mut stmt = conn.prepare("PRAGMA table_info(source_directories)")?;
        let mut has_icon = false;
        let mut has_sort_order = false;
        let mut has_is_protected = false;
        let rows = stmt.query_map([], |row| {
            let name: String = row.get(1)?;
            Ok(name)
        })?;
        for name in rows {
            if let Ok(n) = name {
                if n == "icon" { has_icon = true; }
                if n == "sort_order" { has_sort_order = true; }
                if n == "is_protected" { has_is_protected = true; }
            }
        }
        if !has_icon {
            let _ = conn.execute("ALTER TABLE source_directories ADD COLUMN icon TEXT", []);
        }
        if !has_sort_order {
            let _ = conn.execute("ALTER TABLE source_directories ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0", []);
        }
        if !has_is_protected {
            let _ = conn.execute("ALTER TABLE source_directories ADD COLUMN is_protected BOOLEAN NOT NULL DEFAULT 0", []);
        }
    }

    conn.execute(
        "CREATE TABLE IF NOT EXISTS agent_configs (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            config_path TEXT NOT NULL,
            skills_path TEXT NOT NULL,
            sync_method TEXT NOT NULL,
            version TEXT
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS sync_records (
            skill_id TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            sync_type TEXT NOT NULL,
            synced_path TEXT NOT NULL,
            synced_at DATETIME NOT NULL,
            status TEXT NOT NULL,
            PRIMARY KEY (skill_id, agent_id),
            FOREIGN KEY (skill_id) REFERENCES skills(id),
            FOREIGN KEY (agent_id) REFERENCES agent_configs(id)
        )",
        [],
    )?;
    // Prompt 分组表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS prompt_groups (
            id         TEXT PRIMARY KEY,
            name       TEXT NOT NULL,
            icon       TEXT,
            color      TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL
        )",
        [],
    )?;

    // 提示词主表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS prompts (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL,
            content     TEXT NOT NULL,
            description TEXT,
            group_id    TEXT,
            tags        TEXT,
            is_favorite BOOLEAN NOT NULL DEFAULT 0,
            use_count   INTEGER NOT NULL DEFAULT 0,
            variables   TEXT,
            version     INTEGER NOT NULL DEFAULT 1,
            created_at  DATETIME NOT NULL,
            updated_at  DATETIME NOT NULL,
            deleted_at  DATETIME,
            FOREIGN KEY (group_id) REFERENCES prompt_groups(id) ON DELETE SET NULL
        )",
        [],
    )?;

    // 提示词版本历史表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS prompt_versions (
            id          TEXT PRIMARY KEY,
            prompt_id   TEXT NOT NULL,
            content     TEXT NOT NULL,
            version     INTEGER NOT NULL,
            change_note TEXT,
            created_at  DATETIME NOT NULL,
            FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // 忽略可能的已存在错误
    let _ = conn.execute("ALTER TABLE prompts ADD COLUMN deleted_at DATETIME", []);

    Ok(conn)
}

use crate::models::{Skill, SourceDirectory};
use rusqlite::params;
use crate::scanner::ScannedSkill;

pub fn get_all_skills(db: &Connection) -> Result<Vec<Skill>, String> {
    let mut stmt = db.prepare("SELECT id, name, description, local_path, repo_id, source_dir_id, relative_path, source_type, installed_at, updated_at, is_active, category, tags, skill_scope, online_url, is_favorite, use_count FROM skills").map_err(|e| e.to_string())?;
    let skill_iter = stmt.query_map([], |row| {
        Ok(Skill {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            local_path: row.get(3)?,
            repo_id: row.get(4)?,
            source_dir_id: row.get(5)?,
            relative_path: row.get(6)?,
            source_type: row.get(7)?,
            installed_at: row.get(8)?,
            updated_at: row.get(9)?,
            is_active: row.get(10)?,
            category: row.get(11)?,
            tags: row.get(12)?,
            skill_scope: row.get::<_, Option<String>>(13)?.unwrap_or_else(|| "repo".to_string()),
            online_url: row.get(14)?,
            is_favorite: row.get(15)?,
            use_count: row.get(16)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut skills = Vec::new();
    for skill in skill_iter {
        skills.push(skill.map_err(|e| e.to_string())?);
    }
    Ok(skills)
}

use crate::models::GroupedRepo;
use std::collections::HashMap;

pub fn get_repositories_with_skills(db: &Connection) -> Result<Vec<GroupedRepo>, String> {
    let skills = get_all_skills(db)?;
    let dirs = get_source_directories(db)?;
    
    let mut dir_map = HashMap::new();
    for dir in dirs {
        dir_map.insert(dir.id.clone(), dir);
    }

    let mut repo_map: HashMap<String, GroupedRepo> = HashMap::new();

    for skill in skills {
        let mut repo_name = skill.name.clone();
        let mut repo_path = skill.local_path.clone();

        if let Some(dir) = dir_map.get(&skill.source_dir_id) {
            if skill.local_path.starts_with(&dir.path) {
                let relative_path = &skill.local_path[dir.path.len()..];
                let parts: Vec<&str> = relative_path.split(|c| c == '/' || c == '\\').filter(|s| !s.is_empty()).collect();
                if !parts.is_empty() {
                    repo_name = parts[0].to_string();
                    let separator = if dir.path.contains('\\') { "\\" } else { "/" };
                    let safe_dir = if dir.path.ends_with(separator) {
                        &dir.path[..dir.path.len() - 1]
                    } else {
                        &dir.path
                    };
                    repo_path = format!("{}{}{}", safe_dir, separator, repo_name);
                } else {
                    repo_path = dir.path.clone();
                    repo_name = dir.path.split(|c| c == '/' || c == '\\').filter(|s| !s.is_empty()).last().unwrap_or(&dir.path).to_string();
                }
            }
        }

        let exists = std::path::Path::new(&repo_path).exists();
        let repo = repo_map.entry(repo_path.clone()).or_insert_with(|| GroupedRepo {
            id: repo_path.clone(),
            name: repo_name.clone(),
            path: repo_path.clone(),
            source_type: skill.source_type.clone(),
            source_dir_id: Some(skill.source_dir_id.clone()),
            updated_at: skill.updated_at.clone(),
            skills: Vec::new(),
            category: None,
            is_missing: !exists,
            repo_type: "single".to_string(), // 在所有技能收集完后再推断
        });

        if !repo.skills.iter().any(|s| s.id == skill.id) {
            repo.skills.push(skill.clone());
        }
        if skill.updated_at > repo.updated_at {
            repo.updated_at = skill.updated_at.clone();
        }
    }
    
    for dir in dir_map.values() {
        let _exists = std::path::Path::new(&dir.path).exists();
        // Here we do not add empty source directories as repos anymore.
        // The is_missing status for SourceDirectories is returned via get_source_directories
    }

    let mut result: Vec<GroupedRepo> = repo_map.into_values().collect();

    for repo in &mut result {
        let is_official = repo.skills.iter().any(|s| s.local_path.ends_with("SKILL.md") || s.local_path.ends_with("SKILL.mdx"));
        repo.category = Some(if is_official { "正式技能".to_string() } else { "其他".to_string() });
    }

    result.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(result)
}

pub fn update_skill_metadata(db: &Connection, id: &str, name: &str, description: &str, category: &str, tags: Option<&str>) -> Result<(), String> {
    db.execute(
        "UPDATE skills SET name = ?1, description = ?2, category = ?3, tags = ?4, updated_at = ?5 WHERE id = ?6",
        params![name, description, category, tags, chrono::Utc::now().to_rfc3339(), id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_skill_tags(db: &Connection, id: &str, tags: Option<&str>) -> Result<(), String> {
    db.execute(
        "UPDATE skills SET tags = ?1, updated_at = ?2 WHERE id = ?3",
        params![tags, chrono::Utc::now().to_rfc3339(), id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn increment_skill_use_count(db: &Connection, id: &str) -> Result<(), String> {
    db.execute(
        "UPDATE skills SET use_count = use_count + 1, updated_at = ?1 WHERE id = ?2",
        params![chrono::Utc::now().to_rfc3339(), id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn toggle_skill_favorite(db: &Connection, id: &str) -> Result<(), String> {
    db.execute(
        "UPDATE skills SET is_favorite = NOT is_favorite, updated_at = ?1 WHERE id = ?2",
        params![chrono::Utc::now().to_rfc3339(), id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_source_directory_icon(db: &Connection, id: &str, icon: Option<String>) -> Result<(), String> {
    db.execute(
        "UPDATE source_directories SET icon = ?1 WHERE id = ?2",
        rusqlite::params![icon, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_source_directories_order(db: &Connection, ids: Vec<String>) -> Result<(), String> {
    for (i, id) in ids.iter().enumerate() {
        db.execute(
            "UPDATE source_directories SET sort_order = ?1 WHERE id = ?2",
            rusqlite::params![i as i64, id],
        )
        .map_err(|e| format!("Failed to update sort_order: {}", e))?;
    }
    Ok(())
}

pub fn rename_source_directory(db: &Connection, id: &str, new_label: &str) -> Result<(), String> {
    db.execute(
        "UPDATE source_directories SET label = ?1 WHERE id = ?2",
        rusqlite::params![new_label, id],
    )
    .map_err(|e| format!("Failed to update label: {}", e))?;
    Ok(())
}

pub fn remove_source_directory(db: &Connection, id: &str) -> Result<(), String> {
    db.execute(
        "DELETE FROM skills WHERE source_dir_id = ?1",
        rusqlite::params![id],
    ).map_err(|e| format!("Failed to delete skills: {}", e))?;

    db.execute(
        "DELETE FROM repositories WHERE source_dir_id = ?1",
        rusqlite::params![id],
    ).map_err(|e| format!("Failed to delete repositories: {}", e))?;

    db.execute(
        "DELETE FROM source_directories WHERE id = ?1",
        rusqlite::params![id],
    ).map_err(|e| format!("Failed to delete source directory: {}", e))?;
    Ok(())
}

pub fn get_source_directory_by_id(db: &Connection, id: &str) -> Result<Option<crate::models::SourceDirectory>, String> {
    let mut stmt = db.prepare("SELECT id, path, label, source_type, is_default, icon, sort_order, is_protected, added_at FROM source_directories WHERE id = ?1").map_err(|e| e.to_string())?;
    let mut dir_iter = stmt.query_map(rusqlite::params![id], |row| {
        let path_str: String = row.get(1)?;
        Ok(crate::models::SourceDirectory {
            id: row.get(0)?,
            path: path_str.clone(),
            label: row.get(2)?,
            source_type: row.get(3)?,
            is_default: row.get(4)?,
            icon: row.get(5)?,
            sort_order: row.get(6)?,
            is_protected: row.get(7)?,
            is_missing: !std::path::Path::new(&path_str).exists(),
            added_at: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?;
    
    if let Some(dir) = dir_iter.next() {
        Ok(Some(dir.map_err(|e| e.to_string())?))
    } else {
        Ok(None)
    }
}
pub fn get_source_directories(db: &Connection) -> Result<Vec<SourceDirectory>, String> {
    let mut stmt = db.prepare("SELECT id, path, label, source_type, is_default, icon, sort_order, is_protected, added_at FROM source_directories ORDER BY sort_order ASC, added_at DESC").map_err(|e| e.to_string())?;
    let dir_iter = stmt.query_map([], |row| {
        let path_str: String = row.get(1)?;
        Ok(SourceDirectory {
            id: row.get(0)?,
            path: path_str.clone(),
            label: row.get(2)?,
            source_type: row.get(3)?,
            is_default: row.get(4)?,
            icon: row.get(5)?,
            sort_order: row.get(6)?,
            is_protected: row.get(7)?,
            is_missing: !std::path::Path::new(&path_str).exists(),
            added_at: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut dirs = Vec::new();
    for dir in dir_iter {
        dirs.push(dir.map_err(|e| e.to_string())?);
    }
    Ok(dirs)
}

pub fn insert_source_directory(db: &Connection, path: &str, dir_type: &str) -> Result<String, String> {
    // 如果已经存在该路径，则直接复用返回其 ID
    if let Ok(existing_id) = db.query_row::<String, _, _>(
        "SELECT id FROM source_directories WHERE path = ?1",
        rusqlite::params![path],
        |row| row.get(0)
    ) {
        return Ok(existing_id);
    }

    let id = uuid::Uuid::new_v4().to_string();
    let added_at = chrono::Utc::now().to_rfc3339();
    let label = std::path::PathBuf::from(path).file_name().unwrap_or_default().to_string_lossy().to_string();
    
    db.execute(
        "INSERT INTO source_directories (id, path, label, source_type, is_default, icon, sort_order, is_protected, added_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            id,
            path,
            label,
            dir_type,
            false,
            Option::<String>::None,
            0,
            false,
            added_at
        ],
    ).map_err(|e| e.to_string())?;
    
    Ok(id)
}

fn is_in_git_repo(path: &std::path::Path) -> bool {
    let mut current = path;
    loop {
        if current.join(".git").exists() {
            return true;
        }
        match current.parent() {
            Some(p) => current = p,
            None => return false,
        }
    }
}

pub fn insert_skill(db: &Connection, skill: &ScannedSkill, source_dir_id: &str, source_type: &str) -> Result<(), String> {
    let id = uuid::Uuid::new_v4().to_string();
    let installed_at = chrono::Utc::now().to_rfc3339();
    let updated_at = &skill.updated_at;
    
    let mut actual_source_type = source_type.to_string();
    if actual_source_type == "local" {
        if is_in_git_repo(std::path::Path::new(&skill.local_path)) {
            actual_source_type = "github".to_string();
        }
    }

    db.execute(
        "INSERT INTO skills (id, name, description, local_path, repo_id, source_dir_id, relative_path, source_type, installed_at, updated_at, is_active, category, tags, skill_scope, is_favorite, use_count) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 0, 0)
         ON CONFLICT(local_path) DO UPDATE SET name=excluded.name, description=excluded.description, updated_at=excluded.updated_at, source_type=excluded.source_type, category=excluded.category, skill_scope=excluded.skill_scope",
        params![
            id,
            skill.name,
            skill.description,
            skill.local_path,
            None::<String>, // repo_id
            source_dir_id, // source_dir_id
            skill.relative_path,
            actual_source_type,
            installed_at,
            updated_at,
            true,
            skill.category,
            skill.tags,
            skill.skill_scope
        ],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

pub fn add_online_skill(
    db: &Connection,
    id: &str,
    url: &str,
    name: &str,
    description: &str,
    source_dir_id: &str,
    now: &str,
) -> Result<(), String> {
    db.execute(
        "INSERT INTO skills (id, name, description, local_path, repo_id, source_dir_id, relative_path, source_type, installed_at, updated_at, is_active, category, tags, skill_scope, online_url, is_favorite, use_count) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, 0, 0)
         ON CONFLICT(local_path) DO UPDATE SET name=excluded.name, description=excluded.description, updated_at=excluded.updated_at, online_url=excluded.online_url",
        params![
            id,
            name,
            description,
            url, // local_path 用 url 代替
            None::<String>,
            source_dir_id,
            "", // relative_path
            "online", // source_type
            now,
            now,
            true,
            "Other",
            None::<String>,
            "repo",
            url
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

use crate::models::{AgentConfig, SyncRecord};

pub fn get_all_agents(db: &Connection) -> Result<Vec<AgentConfig>, String> {
    let mut stmt = db.prepare("SELECT id, name, display_name, config_path, skills_path, sync_method, version FROM agent_configs").map_err(|e| e.to_string())?;
    let iter = stmt.query_map([], |row| {
        Ok(AgentConfig {
            id: row.get(0)?,
            name: row.get(1)?,
            display_name: row.get(2)?,
            config_path: row.get(3)?,
            skills_path: row.get(4)?,
            sync_method: row.get(5)?,
            version: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut agents = Vec::new();
    for a in iter {
        agents.push(a.map_err(|e| e.to_string())?);
    }
    Ok(agents)
}

pub fn insert_agent_config(db: &Connection, agent: &AgentConfig) -> Result<(), String> {
    db.execute(
        "INSERT INTO agent_configs (id, name, display_name, config_path, skills_path, sync_method, version) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(name) DO UPDATE SET display_name=excluded.display_name, config_path=excluded.config_path, skills_path=excluded.skills_path, sync_method=excluded.sync_method, version=excluded.version",
        params![
            agent.id,
            agent.name,
            agent.display_name,
            agent.config_path,
            agent.skills_path,
            agent.sync_method,
            agent.version,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_agent_config(db: &Connection, id: &str) -> Result<(), String> {
    // Delete related sync records first
    db.execute("DELETE FROM sync_records WHERE agent_id = ?1", params![id]).map_err(|e| e.to_string())?;
    db.execute("DELETE FROM agent_configs WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_sync_records_for_skill(db: &Connection, skill_id: &str) -> Result<Vec<SyncRecord>, String> {
    let mut stmt = db.prepare("SELECT skill_id, agent_id, sync_type, synced_path, synced_at, status FROM sync_records WHERE skill_id = ?1 ORDER BY synced_at DESC").map_err(|e| e.to_string())?;
    let iter = stmt.query_map(params![skill_id], |row| {
        Ok(SyncRecord {
            skill_id: row.get(0)?,
            agent_id: row.get(1)?,
            sync_type: row.get(2)?,
            synced_path: row.get(3)?,
            synced_at: row.get(4)?,
            status: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut records = Vec::new();
    let mut invalid_records = Vec::new();

    for r in iter {
        let record = r.map_err(|e| e.to_string())?;
        if std::path::Path::new(&record.synced_path).exists() {
            records.push(record);
        } else {
            invalid_records.push((record.skill_id, record.agent_id));
        }
    }

    // 自动清理已经失效的同步记录（用户在文件系统上手动删除了软链接）
    for (s_id, a_id) in invalid_records {
        let _ = remove_sync_record(db, &s_id, &a_id);
    }

    Ok(records)
}

pub fn get_sync_records_for_agent(db: &Connection, agent_id: &str) -> Result<Vec<SyncRecord>, String> {
    let mut stmt = db.prepare("SELECT skill_id, agent_id, sync_type, synced_path, synced_at, status FROM sync_records WHERE agent_id = ?1").map_err(|e| e.to_string())?;
    let iter = stmt.query_map(params![agent_id], |row| {
        Ok(SyncRecord {
            skill_id: row.get(0)?,
            agent_id: row.get(1)?,
            sync_type: row.get(2)?,
            synced_path: row.get(3)?,
            synced_at: row.get(4)?,
            status: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut records = Vec::new();
    let mut invalid_records = Vec::new();

    for r in iter {
        let record = r.map_err(|e| e.to_string())?;
        if std::path::Path::new(&record.synced_path).exists() {
            records.push(record);
        } else {
            invalid_records.push((record.skill_id, record.agent_id));
        }
    }

    // 自动清理已经失效的同步记录（用户在文件系统上手动删除了软链接）
    for (s_id, a_id) in invalid_records {
        let _ = remove_sync_record(db, &s_id, &a_id);
    }

    Ok(records)
}

pub fn insert_sync_record(db: &Connection, record: &SyncRecord) -> Result<(), String> {
    db.execute(
        "INSERT INTO sync_records (skill_id, agent_id, sync_type, synced_path, synced_at, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(skill_id, agent_id) DO UPDATE SET sync_type=excluded.sync_type, synced_path=excluded.synced_path, synced_at=excluded.synced_at, status=excluded.status",
        params![
            record.skill_id,
            record.agent_id,
            record.sync_type,
            record.synced_path,
            record.synced_at,
            record.status,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn remove_sync_record(db: &Connection, skill_id: &str, agent_id: &str) -> Result<(), String> {
    db.execute(
        "DELETE FROM sync_records WHERE skill_id = ?1 AND agent_id = ?2",
        params![skill_id, agent_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}


