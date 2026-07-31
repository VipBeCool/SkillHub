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

    Ok(conn)
}

use crate::models::{Skill, SourceDirectory};
use rusqlite::params;
use crate::scanner::ScannedSkill;

pub fn get_all_skills(db: &Connection) -> Result<Vec<Skill>, String> {
    let mut stmt = db.prepare("SELECT id, name, description, local_path, repo_id, source_dir_id, relative_path, source_type, installed_at, updated_at, is_active, category, tags FROM skills").map_err(|e| e.to_string())?;
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

        let repo = repo_map.entry(repo_path.clone()).or_insert_with(|| GroupedRepo {
            id: repo_path.clone(),
            name: repo_name.clone(),
            path: repo_path.clone(),
            source_type: skill.source_type.clone(),
            source_dir_id: Some(skill.source_dir_id.clone()),
            updated_at: skill.updated_at.clone(),
            skills: Vec::new(),
            category: None,
        });

        if !repo.skills.iter().any(|s| s.id == skill.id) {
            repo.skills.push(skill.clone());
        }
        if skill.updated_at > repo.updated_at {
            repo.updated_at = skill.updated_at.clone();
        }
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
        "DELETE FROM source_directories WHERE id = ?1",
        rusqlite::params![id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_source_directory_by_id(db: &Connection, id: &str) -> Result<Option<crate::models::SourceDirectory>, String> {
    let mut stmt = db.prepare("SELECT id, path, label, source_type, is_default, icon, sort_order, is_protected, added_at FROM source_directories WHERE id = ?1").map_err(|e| e.to_string())?;
    let mut dir_iter = stmt.query_map(rusqlite::params![id], |row| {
        Ok(crate::models::SourceDirectory {
            id: row.get(0)?,
            path: row.get(1)?,
            label: row.get(2)?,
            source_type: row.get(3)?,
            is_default: row.get(4)?,
            icon: row.get(5)?,
            sort_order: row.get(6)?,
            is_protected: row.get(7)?,
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
        Ok(SourceDirectory {
            id: row.get(0)?,
            path: row.get(1)?,
            label: row.get(2)?,
            source_type: row.get(3)?,
            is_default: row.get(4)?,
            icon: row.get(5)?,
            sort_order: row.get(6)?,
            is_protected: row.get(7)?,
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
        "INSERT INTO skills (id, name, description, local_path, repo_id, source_dir_id, relative_path, source_type, installed_at, updated_at, is_active, category, tags) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
         ON CONFLICT(local_path) DO UPDATE SET name=excluded.name, description=excluded.description, updated_at=excluded.updated_at, source_type=excluded.source_type, category=excluded.category, tags=excluded.tags",
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
            skill.tags
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
    let mut stmt = db.prepare("SELECT skill_id, agent_id, sync_type, synced_path, synced_at, status FROM sync_records WHERE skill_id = ?1").map_err(|e| e.to_string())?;
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
    for r in iter {
        records.push(r.map_err(|e| e.to_string())?);
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
    for r in iter {
        records.push(r.map_err(|e| e.to_string())?);
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

