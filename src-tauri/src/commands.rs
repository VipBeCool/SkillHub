use tauri::State;
use crate::models::{Skill, SourceDirectory, Repository};
use crate::scanner;
use crate::git_engine;
use std::path::Path;
use crate::AppState;

#[derive(serde::Serialize)]
pub struct GitRepoInfo {
    pub name: String,
    pub path: String,
}

#[derive(serde::Serialize)]
pub struct SkillFile {
    pub name: String,
    pub content: String,
    pub absolute_path: String,
}

fn read_file_case_insensitive_with_name(dir: &Path, name: &str) -> Option<(String, String, String)> {
    let lower_name = name.to_lowercase();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Some(fname) = entry.file_name().to_str() {
                if fname.to_lowercase() == lower_name {
                    let path_buf = entry.path();
                    if let Ok(content) = std::fs::read_to_string(&path_buf) {
                        return Some((fname.to_string(), content, path_buf.to_string_lossy().into_owned()));
                    }
                }
            }
        }
    }
    None
}

fn is_single_skill_repo(skill_dir: &Path) -> bool {
    if let Some(parent) = skill_dir.parent() {
        if let Ok(entries) = std::fs::read_dir(parent) {
            let mut dir_count = 0;
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_dir() {
                        let fname = entry.file_name();
                        let fname_str = fname.to_string_lossy();
                        if !fname_str.starts_with('.') {
                            dir_count += 1;
                        }
                    }
                }
            }
            return dir_count <= 1;
        }
    }
    true
}

fn find_file_in_tree(start_dir: &Path, name: &str, is_skill: bool, is_single_skill: bool) -> Option<(String, String, String)> {
    let mut current_dir = start_dir;
    let mut max_depth = if is_skill || !is_single_skill { 0 } else { 3 }; 

    loop {
        if let Some(res) = read_file_case_insensitive_with_name(current_dir, name) {
            return Some(res);
        }
        if max_depth == 0 {
            break;
        }
        if let Some(parent) = current_dir.parent() {
            current_dir = parent;
            max_depth -= 1;
        } else {
            break;
        }
    }
    None
}

#[tauri::command]
pub fn get_git_repos_in_directory(path: String) -> Result<Vec<GitRepoInfo>, String> {
    let target_path = Path::new(&path);
    let mut repos = Vec::new();

    // 如果根目录本身就是 Git 仓库
    if target_path.join(".git").exists() {
        if let Some(name) = target_path.file_name().and_then(|n| n.to_str()) {
            repos.push(GitRepoInfo {
                name: name.to_string(),
                path: path.clone(),
            });
        }
        return Ok(repos);
    }

    // 否则扫描其直接子目录
    if let Ok(entries) = std::fs::read_dir(target_path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() && p.join(".git").exists() {
                if let (Some(name), Some(path_str)) = (p.file_name().and_then(|n| n.to_str()), p.to_str()) {
                    repos.push(GitRepoInfo {
                        name: name.to_string(),
                        path: path_str.to_string(),
                    });
                }
            }
        }
    }

    Ok(repos)
}

#[tauri::command]
pub async fn pull_single_repo(path: String) -> Result<String, String> {
    crate::git_engine::pull_repository(std::path::Path::new(&path)).await
}

#[tauri::command]
pub fn get_git_remote_url(path: String) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .current_dir(&path)
        .args(["config", "--get", "remote.origin.url"])
        .output()
        .map_err(|e| e.to_string())?;
        
    if output.status.success() {
        let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
        // 如果是 SSH 格式的 URL (git@github.com:user/repo.git)，转成 HTTPS 格式以便浏览器打开
        if url.starts_with("git@") {
            let https_url = url.replace(":", "/").replace("git@", "https://");
            let clean_url = if https_url.ends_with(".git") {
                https_url[..https_url.len()-4].to_string()
            } else {
                https_url
            };
            Ok(clean_url)
        } else {
            let clean_url = if url.ends_with(".git") {
                url[..url.len()-4].to_string()
            } else {
                url
            };
            Ok(clean_url)
        }
    } else {
        Err("Failed to get remote url".to_string())
    }
}

#[tauri::command]
pub fn delete_skill_by_path(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    
    // `path` 是前端传入的仓库目录路径，我们需要匹配所有 `local_path` 在该目录下的技能
    let path_prefix = format!("{}%", path);
    
    let mut stmt = db.prepare("SELECT id FROM skills WHERE local_path LIKE ?1").map_err(|e| e.to_string())?;
    let skill_ids: Vec<String> = stmt.query_map(rusqlite::params![path_prefix], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    
    for skill_id in skill_ids {
        // 清理绑定的 Agent 同步记录和软链接
        let records = crate::db::get_sync_records_for_skill(&db, &skill_id).unwrap_or_default();
        for record in records {
            let _ = crate::agent_sync::remove_symlink(&record.synced_path);
            let _ = crate::db::remove_sync_record(&db, &skill_id, &record.agent_id);
        }
        
        // 删除数据库中的技能记录
        let _ = db.execute("DELETE FROM skills WHERE id = ?1", rusqlite::params![skill_id]);
    }
    
    // 尝试删除可能直接注册为 source_directory 的目录记录
    let _ = db.execute("DELETE FROM source_directories WHERE path = ?1", rusqlite::params![path]);
    
    // 物理删除目录
    let p = Path::new(&path);
    if p.exists() && p.is_dir() {
        std::fs::remove_dir_all(p).map_err(|e| format!("无法删除目录: {}", e))?;
    }
    
    Ok(())
}

#[tauri::command]
pub fn get_skills(state: State<'_, AppState>) -> Result<Vec<Skill>, String> {
    let db = state.db.lock().unwrap();
    crate::db::get_all_skills(&db)
}

#[tauri::command]
pub fn get_source_directories(state: State<'_, AppState>) -> Result<Vec<SourceDirectory>, String> {
    let db = state.db.lock().unwrap();
    crate::db::get_source_directories(&db)
}

use crate::models::GroupedRepo;

#[tauri::command]
pub fn get_repositories_with_skills(state: State<'_, AppState>) -> Result<Vec<GroupedRepo>, String> {
    let db = state.db.lock().unwrap();
    crate::db::get_repositories_with_skills(&db)
}

#[tauri::command]
pub fn update_skill_metadata(
    state: State<'_, AppState>,
    id: String,
    name: String,
    description: String,
    category: String,
    tags: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    crate::db::update_skill_metadata(&db, &id, &name, &description, &category, tags.as_deref())
}

#[tauri::command]
pub fn add_source_directory(state: State<'_, AppState>, path: String, dir_type: String) -> Result<String, String> {
    let db = state.db.lock().unwrap();
    crate::db::insert_source_directory(&db, &path, &dir_type)
}

use tauri::Manager;
use std::io;
use std::path::PathBuf;

fn copy_dir_all(src: impl AsRef<Path>, dst: impl AsRef<Path>) -> io::Result<()> {
    std::fs::create_dir_all(&dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(entry.path(), dst.as_ref().join(entry.file_name()))?;
        } else {
            std::fs::copy(entry.path(), dst.as_ref().join(entry.file_name()))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn scan_and_add_source_directory(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    path: String,
    dir_type: String,
    strategy: Option<String>,
    target_dir: Option<String>
) -> Result<(), String> {
    let mut final_path = path.clone();

    if let Some(strat) = strategy {
        if strat == "copy" || strat == "move" {
            let base_target_dir = if let Some(td) = target_dir {
                PathBuf::from(td)
            } else {
                let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
                app_data_dir.join("local_skills")
            };
            std::fs::create_dir_all(&base_target_dir).map_err(|e| e.to_string())?;
            
            let src_path = Path::new(&path);
            let dir_name = src_path.file_name().ok_or("Invalid directory name")?;
            let mut final_target_dir = base_target_dir.join(dir_name);
            
            // Handle name collision
            let mut counter = 1;
            while final_target_dir.exists() {
                let new_name = format!("{}_{}", dir_name.to_string_lossy(), counter);
                final_target_dir = base_target_dir.join(new_name);
                counter += 1;
            }

            if strat == "copy" {
                copy_dir_all(src_path, &final_target_dir).map_err(|e| e.to_string())?;
            } else if strat == "move" {
                // Try rename first, fallback to copy+delete
                if std::fs::rename(src_path, &final_target_dir).is_err() {
                    copy_dir_all(src_path, &final_target_dir).map_err(|e| e.to_string())?;
                    std::fs::remove_dir_all(src_path).map_err(|e| e.to_string())?;
                }
            }
            
            final_path = final_target_dir.to_string_lossy().to_string();
        }
    }

    let path_clone = final_path.clone();
    
    // Scan for skills in a background thread
    let skills = tauri::async_runtime::spawn_blocking(move || {
        scanner::scan_directory(Path::new(&path_clone))
    })
    .await
    .map_err(|e| format!("Scan task panicked: {}", e))?
    ?;
    
    let mut db = state.db.lock().unwrap();
    
    // 1. Insert directory using the final_path
    let dir_id = crate::db::insert_source_directory(&db, &final_path, &dir_type)?;
    
    // 2. Begin transaction and insert skills
    let tx = db.transaction().map_err(|e| e.to_string())?;
    for skill in skills {
        crate::db::insert_skill(&tx, &skill, &dir_id, &dir_type)?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    
    #[cfg(target_os = "macos")]
    {
        set_macos_folder_icon(&final_path);
    }
    
    Ok(())
}

#[cfg(target_os = "macos")]
fn set_macos_folder_icon(folder_path: &str) {
    let icon_data = include_bytes!("../../src/assets/folder_icon.png");
    let temp_icon_path = std::env::temp_dir().join("skillhub_folder_icon.png");
    if std::fs::write(&temp_icon_path, icon_data).is_ok() {
        let script = format!(r#"
use framework "AppKit"
use scripting additions
on run
    set iconPath to "{icon}"
    set folderPath to "{folder}"
    set workspace to current application's NSWorkspace's sharedWorkspace()
    set img to current application's NSImage's alloc()'s initWithContentsOfFile:iconPath
    workspace's setIcon:img forFile:folderPath options:0
end run
"#, icon = temp_icon_path.to_string_lossy(), folder = folder_path);

        let _ = std::process::Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output();
    }
}

#[tauri::command]
pub async fn add_github_repository(app: tauri::AppHandle, state: State<'_, AppState>, url: String, target_dir: String, parent_dir: String) -> Result<(), String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    {
        let mut tokens = state.clone_cancel_tokens.lock().unwrap();
        tokens.insert(target_dir.clone(), tx);
    }
    
    let target_path = std::path::PathBuf::from(&target_dir);
    let url_clone = url.clone();
    
    let clone_future = crate::git_engine::clone_repository(&url_clone, &target_path);
    
    let res = tokio::select! {
        res = clone_future => res,
        _ = rx => {
            let _ = std::fs::remove_dir_all(&target_path);
            Err("克隆已被取消".to_string())
        }
    };
    
    {
        let mut tokens = state.clone_cancel_tokens.lock().unwrap();
        tokens.remove(&target_dir);
    }
    
    res?;
    
    scan_and_add_source_directory(app, state, parent_dir, "github".to_string(), None, None).await?;
    
    Ok(())
}

#[tauri::command]
pub async fn cancel_github_clone(state: State<'_, AppState>, target_dir: String) -> Result<(), String> {
    let mut tokens = state.clone_cancel_tokens.lock().unwrap();
    if let Some(tx) = tokens.remove(&target_dir) {
        let _ = tx.send(());
    }
    Ok(())
}

fn sync_skills_to_db(db: &mut rusqlite::Connection, path: &Path, source_dir_id: &str, source_type: &str) -> Result<(), String> {
    let skills = scanner::scan_directory(path).unwrap_or_default();
    let tx = db.transaction().map_err(|e| e.to_string())?;
    
    let mut current_paths = std::collections::HashSet::new();
    for skill in &skills {
        crate::db::insert_skill(&tx, skill, source_dir_id, source_type)?;
        current_paths.insert(skill.local_path.clone());
    }
    
    // 查询该目录下的所有旧技能记录，如果有不存在于 current_paths 中的，就予以删除
    let mut existing_skills: Vec<(String, String)> = Vec::new();
    {
        let mut stmt = tx.prepare("SELECT id, local_path FROM skills WHERE source_dir_id = ?1").map_err(|e| e.to_string())?;
        let rows = stmt.query_map(rusqlite::params![source_dir_id], |row| Ok((row.get(0)?, row.get(1)?))).map_err(|e| e.to_string())?;
        for row in rows {
            if let Ok(r) = row {
                existing_skills.push(r);
            }
        }
    }
        
    for (id, local_path) in existing_skills {
        if !current_paths.contains(&local_path) {
            // 如果本地文件已经删除，从数据库中一并删除该记录及绑定的同步状态
            let records = crate::db::get_sync_records_for_skill(&tx, &id).unwrap_or_default();
            for record in records {
                let _ = crate::agent_sync::remove_symlink(&record.synced_path);
                let _ = crate::db::remove_sync_record(&tx, &id, &record.agent_id);
            }
            let _ = tx.execute("DELETE FROM skills WHERE id = ?1", rusqlite::params![id]);
        }
    }
    
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn pull_repository(state: State<'_, AppState>, path: String) -> Result<String, String> {
    let target_path = Path::new(&path);
    
    // Pull from git asynchronously
    let msg = crate::git_engine::pull_repository(target_path).await?;
    
    let mut db = state.db.lock().unwrap();
    let (source_dir_id, source_type): (String, String) = db.query_row(
        "SELECT id, source_type FROM source_directories WHERE path = ?1",
        rusqlite::params![path],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| e.to_string())?;

    // Perform database synchronization
    sync_skills_to_db(&mut db, target_path, &source_dir_id, &source_type)?;
    
    Ok(msg)
}

#[tauri::command]
pub async fn rescan_directory(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let mut db = state.db.lock().unwrap();
    
    let (source_dir_id, source_type): (String, String) = db.query_row(
        "SELECT id, source_type FROM source_directories WHERE path = ?1",
        rusqlite::params![path],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| e.to_string())?;

    // Perform database synchronization
    sync_skills_to_db(&mut db, Path::new(&path), &source_dir_id, &source_type)?;
    
    Ok(())
}

#[tauri::command]
pub async fn update_source_directory_path(state: State<'_, AppState>, id: String, new_path: String) -> Result<(), String> {
    {
        let db = state.db.lock().unwrap();
        db.execute(
            "UPDATE source_directories SET path = ?1 WHERE id = ?2",
            rusqlite::params![new_path, id],
        ).map_err(|e| format!("Failed to update path: {}", e))?;
    }
    
    rescan_directory(state, new_path).await?;
    
    Ok(())
}

#[tauri::command]
pub fn get_skill_content(path: String) -> Result<String, String> {
    let base = Path::new(&path);
    if base.is_file() {
        return std::fs::read_to_string(base).map_err(|e| e.to_string());
    }

    let skill_md_path = base.join("SKILL.md");
    let design_md_path = base.join("DESIGN.md");
    if skill_md_path.exists() {
        std::fs::read_to_string(skill_md_path).map_err(|e| e.to_string())
    } else if design_md_path.exists() {
        std::fs::read_to_string(design_md_path).map_err(|e| e.to_string())
    } else {
        Err("Skill markdown file not found in the specified path".to_string())
    }
}

#[tauri::command]
pub fn save_skill_content(path: String, content: String) -> Result<(), String> {
    let base = Path::new(&path);
    if base.is_file() {
        return std::fs::write(&base, content).map_err(|e| format!("Failed to save file: {}", e));
    }
    
    let skill_md_path = base.join("SKILL.md");
    std::fs::write(&skill_md_path, content).map_err(|e| format!("Failed to save SKILL.md: {}", e))
}

#[tauri::command]
pub fn get_skill_files(path: String) -> Result<Vec<SkillFile>, String> {
    let base = Path::new(&path);
    let mut files = Vec::new();
    
    if base.is_file() {
        if let Ok(content) = std::fs::read_to_string(base) {
            let filename = base.file_name().unwrap_or_default().to_string_lossy().to_string();
            files.push(SkillFile {
                name: filename,
                content,
                absolute_path: base.to_string_lossy().to_string(),
            });
        }
        return Ok(files);
    }
    
    let is_single_skill = is_single_skill_repo(base);
    let target_files = vec!["SKILL.md", "DESIGN.md", "README.md", "AGENTS.md", "README_CN.md", "CLAUDE.md"];
    
    for target in target_files {
        let is_skill = target == "SKILL.md" || target == "DESIGN.md";
        if let Some((actual_name, content, absolute_path)) = find_file_in_tree(base, target, is_skill, is_single_skill) {
            files.push(SkillFile {
                name: actual_name,
                content,
                absolute_path,
            });
        }
    }
    
    Ok(files)
}

#[tauri::command]
pub fn save_skill_file(path: String, filename: String, content: String) -> Result<(), String> {
    // 兼容老的 API，不做修改，但前端将改用新的 save_skill_file_by_path
    let base = Path::new(&path);
    let lower_name = filename.to_lowercase();
    let mut target_path = base.join(&filename);
    
    if let Ok(entries) = std::fs::read_dir(base) {
        for entry in entries.flatten() {
            if let Some(fname) = entry.file_name().to_str() {
                if fname.to_lowercase() == lower_name {
                    target_path = entry.path();
                    break;
                }
            }
        }
    }
    std::fs::write(&target_path, content).map_err(|e| format!("Failed to save {}: {}", filename, e))
}

#[tauri::command]
pub fn save_skill_file_by_path(absolute_path: String, content: String) -> Result<(), String> {
    std::fs::write(&absolute_path, content).map_err(|e| format!("Failed to save file: {}", e))
}

#[tauri::command]
pub fn open_local_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

use crate::models::{AgentConfig, SyncRecord};
use crate::agent_sync;

#[tauri::command]
pub fn get_agents(state: State<'_, AppState>) -> Result<Vec<AgentConfig>, String> {
    let db = state.db.lock().unwrap();
    crate::db::get_all_agents(&db)
}

#[tauri::command]
pub fn add_agent(state: State<'_, AppState>, agent: AgentConfig) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    crate::db::insert_agent_config(&db, &agent)
}

#[tauri::command]
pub fn delete_agent(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    crate::db::delete_agent_config(&db, &id)
}

#[tauri::command]
pub fn sync_skill(state: State<'_, AppState>, skill_id: String, agent_id: String) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    
    // 1. Fetch skill and agent to get their paths
    // Actually we need `get_skill` and `get_agent_config` functions in `db.rs` which we didn't add.
    // Instead of doing multiple queries here, we can do it with inline queries or add to db.rs.
    let skill_path: String = db.query_row(
        "SELECT local_path FROM skills WHERE id = ?1",
        rusqlite::params![skill_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let agent_skills_path: String = db.query_row(
        "SELECT skills_path FROM agent_configs WHERE id = ?1",
        rusqlite::params![agent_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let skill_name: String = db.query_row(
        "SELECT name FROM skills WHERE id = ?1",
        rusqlite::params![skill_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    // 2. Determine actual source path to symlink
    let mut actual_source_path = std::path::PathBuf::from(&skill_path);
    let is_skill_md = actual_source_path.file_name().map_or(false, |n| {
        let n_lower = n.to_string_lossy().to_lowercase();
        n_lower == "skill.md" || n_lower == "skill.mdx"
    });
    
    // If it's a folder-based skill (identified by SKILL.md), symlink the entire folder
    if is_skill_md {
        if let Some(parent) = actual_source_path.parent() {
            actual_source_path = parent.to_path_buf();
        }
    }

    // 3. Create Symlink
    let actual_source_str = actual_source_path.to_string_lossy().to_string();
    let synced_path = agent_sync::create_symlink(&actual_source_str, &agent_skills_path, &skill_name)?;

    // 4. Record in DB
    let record = SyncRecord {
        skill_id: skill_id.clone(),
        agent_id: agent_id.clone(),
        sync_type: "symlink".to_string(),
        synced_path,
        synced_at: chrono::Utc::now().to_rfc3339(),
        status: "success".to_string(),
    };
    crate::db::insert_sync_record(&db, &record)?;

    Ok(())
}

/// 从给定路径向上遍历，找到最近的 .git 目录所在的仓库根路径
fn find_git_root(path: &std::path::Path) -> Option<std::path::PathBuf> {
    let mut current = path.to_path_buf();
    if current.is_file() {
        if let Some(parent) = current.parent() {
            current = parent.to_path_buf();
        }
    }
    loop {
        if current.join(".git").exists() {
            return Some(current);
        }
        if !current.pop() {
            return None;
        }
    }
}

/// 将整个 Git 仓库（或目录）作为一个软链接单元同步到指定 Agent 的 skills 目录
#[tauri::command]
pub fn sync_repo_to_agent(
    state: State<'_, AppState>,
    repo_path: String,
    agent_id: String,
    repo_name: String,
) -> Result<String, String> {
    let db = state.db.lock().unwrap();

    let agent_skills_path: String = db.query_row(
        "SELECT skills_path FROM agent_configs WHERE id = ?1",
        rusqlite::params![agent_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    // 优先找 Git 根目录，否则直接使用 repo_path
    let source_path = std::path::Path::new(&repo_path);
    let link_target = find_git_root(source_path)
        .unwrap_or_else(|| source_path.to_path_buf());

    let link_target_str = link_target.to_string_lossy().to_string();
    let synced_path = agent_sync::create_symlink(&link_target_str, &agent_skills_path, &repo_name)?;

    Ok(synced_path)
}

#[tauri::command]
pub fn unsync_skill(state: State<'_, AppState>, skill_id: String, agent_id: String) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    
    // 1. Get sync record
    let record_res = db.query_row(
        "SELECT synced_path FROM sync_records WHERE skill_id = ?1 AND agent_id = ?2",
        rusqlite::params![skill_id, agent_id],
        |row| row.get::<_, String>(0),
    );

    if let Ok(synced_path) = record_res {
        // 2. Remove Symlink
        agent_sync::remove_symlink(&synced_path)?;
    }

    // 3. Remove record
    crate::db::remove_sync_record(&db, &skill_id, &agent_id)?;

    Ok(())
}

#[tauri::command]
pub fn get_sync_records_for_skill(state: State<'_, AppState>, skill_id: String) -> Result<Vec<SyncRecord>, String> {
    let db = state.db.lock().unwrap();
    crate::db::get_sync_records_for_skill(&db, &skill_id)
}

#[tauri::command]
pub fn get_sync_records_for_agent(state: State<'_, AppState>, agent_id: String) -> Result<Vec<SyncRecord>, String> {
    let db = state.db.lock().unwrap();
    crate::db::get_sync_records_for_agent(&db, &agent_id)
}

#[tauri::command]
pub fn update_source_directory_icon(state: State<'_, AppState>, id: String, icon: Option<String>) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    crate::db::update_source_directory_icon(&db, &id, icon)
}

#[tauri::command]
pub fn update_source_directories_order(state: State<'_, AppState>, ids: Vec<String>) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "Failed to lock database")?;
    crate::db::update_source_directories_order(&db, ids)
}

#[tauri::command]
pub fn rename_source_directory(state: State<'_, AppState>, id: String, new_label: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "Failed to lock database")?;
    crate::db::rename_source_directory(&db, &id, &new_label)
}

#[tauri::command]
pub fn remove_source_directory(state: State<'_, AppState>, id: String, delete_local: bool) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    if let Ok(Some(dir)) = crate::db::get_source_directory_by_id(&db, &id) {
        if dir.is_protected && delete_local {
            return Err("This is a protected system folder and cannot be deleted from disk.".to_string());
        }
        crate::db::remove_source_directory(&db, &id)?;
        if delete_local && !dir.is_protected {
            let _ = std::fs::remove_dir_all(&dir.path);
        }
        Ok(())
    } else {
        Err("Directory not found".to_string())
    }
}

#[tauri::command]
pub fn create_local_skill_library(state: State<'_, AppState>, name: String, path: String) -> Result<String, String> {
    let db = state.db.lock().unwrap();
    if let Err(e) = std::fs::create_dir_all(&path) {
        return Err(format!("Failed to create directory: {}", e));
    }
    let id = uuid::Uuid::new_v4().to_string();
    let added_at = chrono::Utc::now().to_rfc3339();
    db.execute(
        "INSERT INTO source_directories (id, path, label, source_type, is_default, icon, sort_order, is_protected, added_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![id, path, name, "local", false, Option::<String>::None, 0, false, added_at],
    ).map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    {
        set_macos_folder_icon(&path);
    }
    
    Ok(id)
}


#[tauri::command]
pub fn merge_skill_libraries(state: State<'_, AppState>, target_id: String, source_path: String, strategy: String) -> Result<String, String> {
    let db = state.db.lock().unwrap();
    let target_dir = crate::db::get_source_directory_by_id(&db, &target_id)?
        .ok_or_else(|| "Target directory not found".to_string())?;
        
    let source_path_buf = Path::new(&source_path);
    let target_path_buf = Path::new(&target_dir.path);
    
    if !source_path_buf.exists() || !source_path_buf.is_dir() {
        return Err("Source path is invalid".to_string());
    }
    
    let mut has_non_skill_files = false;
    let mut merged_count = 0;
    
    if let Ok(entries) = std::fs::read_dir(&source_path_buf) {
        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = entry.file_name();
            if path.is_dir() {
                let dest = target_path_buf.join(&file_name);
                if strategy == "move" {
                    if std::fs::rename(&path, &dest).is_err() {
                        if copy_dir_all(&path, &dest).is_ok() {
                            let _ = std::fs::remove_dir_all(&path);
                        }
                    }
                } else {
                    let _ = copy_dir_all(&path, &dest);
                }
                merged_count += 1;
            } else {
                let fname_str = file_name.to_string_lossy();
                if !fname_str.starts_with('.') {
                    has_non_skill_files = true;
                }
            }
        }
    }
    
    if strategy == "move" {
        if has_non_skill_files {
            return Ok(format!("Merged {} skills. The source folder was kept because it contains non-skill files.", merged_count));
        } else {
            let _ = std::fs::remove_dir_all(&source_path_buf);
            return Ok(format!("Merged {} skills and deleted the source folder.", merged_count));
        }
    }
    
    Ok(format!("Copied {} skills to the target library.", merged_count))
}
