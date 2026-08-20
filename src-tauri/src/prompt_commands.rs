use rusqlite::params;
use crate::AppState;
use crate::models::{Prompt, PromptGroup, PromptVersion};
use tauri::State;

// ===== 分组管理 =====

#[tauri::command]
pub fn get_prompt_groups(state: State<AppState>) -> Result<Vec<PromptGroup>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT g.id, g.name, g.icon, g.color, g.sort_order, g.created_at,
                (SELECT COUNT(*) FROM prompts p WHERE p.group_id = g.id AND p.deleted_at IS NULL) as prompt_count
         FROM prompt_groups g
         ORDER BY g.sort_order ASC, g.created_at ASC"
    ).map_err(|e| e.to_string())?;

    let groups = stmt.query_map([], |row| {
        Ok(PromptGroup {
            id: row.get(0)?,
            name: row.get(1)?,
            icon: row.get(2)?,
            color: row.get(3)?,
            sort_order: row.get(4)?,
            created_at: row.get(5)?,
            prompt_count: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(groups)
}

#[tauri::command]
pub fn create_prompt_group(state: State<AppState>, name: String, icon: Option<String>, color: Option<String>) -> Result<PromptGroup, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let max_order: i32 = db.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) FROM prompt_groups",
        [],
        |row| row.get(0),
    ).unwrap_or(-1);

    db.execute(
        "INSERT INTO prompt_groups (id, name, icon, color, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, name, icon, color, max_order + 1, now],
    ).map_err(|e| e.to_string())?;

    Ok(PromptGroup { id, name, icon, color, sort_order: max_order + 1, created_at: now, prompt_count: 0 })
}

#[tauri::command]
pub fn update_prompt_group(state: State<AppState>, id: String, name: String, icon: Option<String>, color: Option<String>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE prompt_groups SET name = ?1, icon = ?2, color = ?3 WHERE id = ?4",
        params![name, icon, color, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_prompt_group(state: State<AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("UPDATE prompts SET group_id = NULL WHERE group_id = ?1", params![id]).map_err(|e| e.to_string())?;
    db.execute("DELETE FROM prompt_groups WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn reorder_prompt_groups(state: State<AppState>, ids: Vec<String>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    for (i, id) in ids.iter().enumerate() {
        db.execute("UPDATE prompt_groups SET sort_order = ?1 WHERE id = ?2", params![i as i32, id]).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ===== 提示词 CRUD =====

#[tauri::command]
pub fn get_prompts(state: State<AppState>, group_id: Option<String>, search: Option<String>) -> Result<Vec<Prompt>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let mut conditions: Vec<String> = Vec::new();
    let mut order_clause = "ORDER BY p.is_favorite DESC, p.updated_at DESC".to_string();
    if let Some(ref gid) = group_id {
        match gid.as_str() {
            "all" => conditions.push("p.deleted_at IS NULL".to_string()),
            "favorites" => {
                conditions.push("p.is_favorite = 1".to_string());
                conditions.push("p.deleted_at IS NULL".to_string());
            }
            "recent" => {
                conditions.push("p.use_count > 0".to_string());
                conditions.push("p.deleted_at IS NULL".to_string());
                order_clause = "ORDER BY p.use_count DESC, p.updated_at DESC".to_string();
            }
            "ungrouped" => {
                conditions.push("p.group_id IS NULL".to_string());
                conditions.push("p.deleted_at IS NULL".to_string());
            }
            "trash" => conditions.push("p.deleted_at IS NOT NULL".to_string()),
            _ => {
                conditions.push(format!("p.group_id = '{}'", gid.replace('\'', "''")));
                conditions.push("p.deleted_at IS NULL".to_string());
            }
        }
    } else {
        conditions.push("p.deleted_at IS NULL".to_string());
    }
    if let Some(ref q) = search {
        if !q.is_empty() {
            let esc = q.replace('\'', "''");
            conditions.push(format!("(p.title LIKE '%{esc}%' OR p.content LIKE '%{esc}%' OR p.tags LIKE '%{esc}%')"));
        }
    }

    let where_clause = if conditions.is_empty() { String::new() } else { format!("WHERE {}", conditions.join(" AND ")) };
    let sql = format!(
        "SELECT p.id, p.title, p.content, p.description, p.group_id, g.name,
                p.tags, p.is_favorite, p.use_count, p.variables, p.version, p.created_at, p.updated_at, p.deleted_at
         FROM prompts p LEFT JOIN prompt_groups g ON p.group_id = g.id
         {} {}",
        where_clause, order_clause
    );

    let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
    let prompts = stmt.query_map([], |row| {
        Ok(Prompt {
            id: row.get(0)?, title: row.get(1)?, content: row.get(2)?,
            description: row.get(3)?, group_id: row.get(4)?, group_name: row.get(5)?,
            tags: row.get(6)?, is_favorite: row.get(7)?, use_count: row.get(8)?,
            variables: row.get(9)?, version: row.get(10)?, created_at: row.get(11)?, updated_at: row.get(12)?, deleted_at: row.get(13)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(prompts)
}

#[tauri::command]
pub fn create_prompt(
    state: State<AppState>,
    title: String, content: String, description: Option<String>,
    group_id: Option<String>, tags: Option<String>, variables: Option<String>,
) -> Result<Prompt, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    db.execute(
        "INSERT INTO prompts (id, title, content, description, group_id, tags, is_favorite, use_count, variables, version, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,0,0,?7,1,?8,?8)",
        params![id, title, content, description, group_id, tags, variables, now],
    ).map_err(|e| e.to_string())?;

    let ver_id = uuid::Uuid::new_v4().to_string();
    db.execute(
        "INSERT INTO prompt_versions (id, prompt_id, content, version, change_note, created_at) VALUES (?1,?2,?3,1,'初始版本',?4)",
        params![ver_id, id, content, now],
    ).map_err(|e| e.to_string())?;

    let group_name: Option<String> = group_id.as_ref().and_then(|gid| {
        db.query_row("SELECT name FROM prompt_groups WHERE id = ?1", params![gid], |row| row.get(0)).ok()
    });

    Ok(Prompt { id, title, content, description, group_id, group_name, tags, is_favorite: false, use_count: 0, variables, version: 1, created_at: now.clone(), updated_at: now, deleted_at: None })
}

#[tauri::command]
pub fn update_prompt(
    state: State<AppState>,
    id: String, title: String, content: String, description: Option<String>,
    group_id: Option<String>, tags: Option<String>, variables: Option<String>, change_note: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let current_version: i64 = db.query_row("SELECT version FROM prompts WHERE id = ?1", params![id], |row| row.get(0)).map_err(|e| e.to_string())?;
    let new_version = current_version + 1;

    let ver_id = uuid::Uuid::new_v4().to_string();
    db.execute(
        "INSERT INTO prompt_versions (id, prompt_id, content, version, change_note, created_at) VALUES (?1,?2,?3,?4,?5,?6)",
        params![ver_id, id, content, new_version, change_note, now],
    ).map_err(|e| e.to_string())?;

    db.execute(
        "UPDATE prompts SET title=?1,content=?2,description=?3,group_id=?4,tags=?5,variables=?6,version=?7,updated_at=?8 WHERE id=?9",
        params![title, content, description, group_id, tags, variables, new_version, now, id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn delete_prompts(state: State<AppState>, ids: Vec<String>) -> Result<(), String> {
    if ids.is_empty() { return Ok(()); }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let placeholders: Vec<String> = ids.iter().map(|_| "?".to_string()).collect();
    let query = format!("UPDATE prompts SET deleted_at = ?1 WHERE id IN ({})", placeholders.join(","));
    let now = chrono::Utc::now().to_rfc3339();
    
    let mut params = vec![rusqlite::types::ToSqlOutput::from(now)];
    for id in ids.iter() {
        params.push(rusqlite::types::ToSqlOutput::from(id.clone()));
    }
    db.execute(&query, rusqlite::params_from_iter(params)).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn restore_prompts(state: State<AppState>, ids: Vec<String>) -> Result<(), String> {
    if ids.is_empty() { return Ok(()); }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let placeholders: Vec<String> = ids.iter().map(|_| "?".to_string()).collect();
    let query = format!("UPDATE prompts SET deleted_at = NULL WHERE id IN ({})", placeholders.join(","));
    
    let params: Vec<&dyn rusqlite::ToSql> = ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
    db.execute(&query, params.as_slice()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn hard_delete_prompts(state: State<AppState>, ids: Vec<String>) -> Result<(), String> {
    if ids.is_empty() { return Ok(()); }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let placeholders: Vec<String> = ids.iter().map(|_| "?".to_string()).collect();
    let query = format!("DELETE FROM prompts WHERE id IN ({})", placeholders.join(","));
    
    let params: Vec<&dyn rusqlite::ToSql> = ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
    db.execute(&query, params.as_slice()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn empty_trash(state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM prompts WHERE deleted_at IS NOT NULL", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn cleanup_expired_trash(state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    // SQLite datetime() function with "-30 days" modifier
    db.execute("DELETE FROM prompts WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-30 days')", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn toggle_prompt_favorite(state: State<AppState>, id: String) -> Result<bool, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let current: bool = db.query_row("SELECT is_favorite FROM prompts WHERE id = ?1", params![id], |row| row.get(0)).map_err(|e| e.to_string())?;
    let new_val = !current;
    db.execute("UPDATE prompts SET is_favorite = ?1 WHERE id = ?2", params![new_val, id]).map_err(|e| e.to_string())?;
    Ok(new_val)
}

#[tauri::command]
pub fn increment_prompt_use_count(state: State<AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("UPDATE prompts SET use_count = use_count + 1 WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn move_prompts_to_group(state: State<AppState>, ids: Vec<String>, group_id: Option<String>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    for id in &ids {
        db.execute("UPDATE prompts SET group_id = ?1, updated_at = ?2 WHERE id = ?3", params![group_id, now, id]).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ===== 版本历史 =====

#[tauri::command]
pub fn get_prompt_versions(state: State<AppState>, prompt_id: String) -> Result<Vec<PromptVersion>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT id, prompt_id, content, version, change_note, created_at FROM prompt_versions WHERE prompt_id = ?1 ORDER BY version DESC"
    ).map_err(|e| e.to_string())?;

    let versions = stmt.query_map(params![prompt_id], |row| {
        Ok(PromptVersion { id: row.get(0)?, prompt_id: row.get(1)?, content: row.get(2)?, version: row.get(3)?, change_note: row.get(4)?, created_at: row.get(5)? })
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(versions)
}

#[tauri::command]
pub fn rollback_prompt_version(state: State<AppState>, prompt_id: String, version_id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let (target_content, target_version): (String, i64) = db.query_row(
        "SELECT content, version FROM prompt_versions WHERE id = ?1",
        params![version_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| e.to_string())?;

    let current_version: i64 = db.query_row("SELECT version FROM prompts WHERE id = ?1", params![prompt_id], |row| row.get(0)).map_err(|e| e.to_string())?;
    let new_version = current_version + 1;
    let ver_id = uuid::Uuid::new_v4().to_string();

    db.execute(
        "INSERT INTO prompt_versions (id, prompt_id, content, version, change_note, created_at) VALUES (?1,?2,?3,?4,?5,?6)",
        params![ver_id, prompt_id, target_content, new_version, format!("回滚到 v{}", target_version), now],
    ).map_err(|e| e.to_string())?;

    db.execute(
        "UPDATE prompts SET content = ?1, version = ?2, updated_at = ?3 WHERE id = ?4",
        params![target_content, new_version, now, prompt_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

// ===== 导出 =====

#[tauri::command]
pub fn export_prompts(state: State<AppState>, ids: Vec<String>, format: String) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let placeholders: Vec<String> = ids.iter().enumerate().map(|(i, _)| format!("?{}", i + 1)).collect();
    let sql = format!(
        "SELECT p.title, p.content, p.description, p.tags, g.name, p.created_at FROM prompts p LEFT JOIN prompt_groups g ON p.group_id = g.id WHERE p.id IN ({})",
        placeholders.join(", ")
    );
    let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
    let params_vec: Vec<rusqlite::types::Value> = ids.iter().map(|s| rusqlite::types::Value::Text(s.clone())).collect();

    let rows: Vec<(String, String, Option<String>, Option<String>, Option<String>)> = stmt
        .query_map(rusqlite::params_from_iter(params_vec.iter()), |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
        }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let output = match format.as_str() {
        "markdown" => {
            let mut md = String::new();
            for (title, content, desc, tags, group) in &rows {
                md.push_str(&format!("# {}\n\n", title));
                if let Some(g) = group { md.push_str(&format!("> **分组**: {}\n\n", g)); }
                if let Some(d) = desc { md.push_str(&format!("{}\n\n", d)); }
                if let Some(t) = tags { md.push_str(&format!("> **标签**: {}\n\n", t)); }
                md.push_str("```\n");
                md.push_str(content);
                md.push_str("\n```\n\n---\n\n");
            }
            md
        }
        "txt" => rows.iter().map(|(title, content, _, _, _)| format!("=== {} ===\n{}", title, content)).collect::<Vec<_>>().join("\n\n"),
        _ => {
            let items: Vec<String> = rows.iter().map(|(title, content, desc, tags, group)| {
                format!(r#"{{"title":{},"content":{},"description":{},"tags":{},"group":{}}}"#,
                    serde_json::to_string(title).unwrap_or_default(),
                    serde_json::to_string(content).unwrap_or_default(),
                    serde_json::to_string(desc).unwrap_or("null".into()),
                    serde_json::to_string(tags).unwrap_or("null".into()),
                    serde_json::to_string(group).unwrap_or("null".into()),
                )
            }).collect();
            format!("[{}]", items.join(","))
        }
    };

    Ok(output)
}
