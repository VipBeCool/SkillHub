use tauri::State;
use crate::models::{Skill, SourceDirectory};
use crate::scanner;
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
    let path_prefix_slash = format!("{}/%", path);
    let path_prefix_backslash = format!("{}\\%", path); // For windows
    
    let mut stmt = db.prepare("SELECT id FROM skills WHERE local_path = ?1 OR local_path LIKE ?2 OR local_path LIKE ?3").map_err(|e| e.to_string())?;
    let skill_ids: Vec<String> = stmt.query_map(rusqlite::params![path, path_prefix_slash, path_prefix_backslash], |row| row.get(0))
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
pub fn update_skill_tags(
    state: State<'_, AppState>,
    id: String,
    tags: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    crate::db::update_skill_tags(&db, &id, tags.as_deref())
}

#[tauri::command]
pub fn increment_skill_use_count(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    crate::db::increment_skill_use_count(&db, &id)
}

#[tauri::command]
pub fn toggle_skill_favorite(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    crate::db::toggle_skill_favorite(&db, &id)
}

#[tauri::command]
pub fn add_source_directory(state: State<'_, AppState>, path: String, dir_type: String) -> Result<String, String> {
    let db = state.db.lock().unwrap();
    let result = crate::db::insert_source_directory(&db, &path, &dir_type);
    
    if result.is_ok() {
        #[cfg(target_os = "macos")]
        {
            set_folder_icon(&path);
        }
    }
    
    result
}

use tauri::Manager;
use std::io;
use std::path::PathBuf;

fn copy_dir_all(src: impl AsRef<Path>, dst: impl AsRef<Path>) -> io::Result<()> {
    std::fs::create_dir_all(&dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let fname = entry.file_name();
        let fname_str = fname.to_string_lossy();
        
        // 跳过体积大且无关的目录
        if ty.is_dir() && (fname_str == "node_modules" || fname_str == ".git" || fname_str == "dist" || fname_str == "build" || fname_str == "target") {
            continue;
        }
        
        if ty.is_dir() {
            copy_dir_all(entry.path(), dst.as_ref().join(&fname))?;
        } else {
            std::fs::copy(entry.path(), dst.as_ref().join(&fname))?;
        }
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn remove_macos_folder_icon(folder_path: &str) {
    let script = format!(r#"
use framework "AppKit"
use scripting additions
on run
    set folderPath to "{folder}"
    set workspace to current application's NSWorkspace's sharedWorkspace()
    workspace's setIcon:(missing value) forFile:folderPath options:0
end run
"#, folder = folder_path);

    let _ = std::process::Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output();
}

#[tauri::command]
pub async fn import_skills_to_directory(
    paths: Vec<String>,
    target_dir: String,
    strategy: String
) -> Result<(), String> {
    let base_target_dir = PathBuf::from(target_dir);
    if !base_target_dir.exists() {
        return Err("目标技能库不存在".into());
    }

    for path in paths {
        let src_path = Path::new(&path);
        
        // 防止无限套娃：禁止将技能文件夹导入到它自身或其子目录中
        if base_target_dir.starts_with(&src_path) {
            return Err("不能将技能文件夹导入到其自身或其子目录中".into());
        }

        // 只接受文件夹（非文件）
        if !src_path.is_dir() {
            let name = src_path.file_name().unwrap_or_default().to_string_lossy();
            return Err(format!("「{}」是文件而非文件夹，请拖入技能文件夹", name));
        }



        let file_name = src_path.file_name().ok_or("无效的文件名")?;
        let mut final_target_dir = base_target_dir.join(file_name);
        
        // Handle name collision
        let mut counter = 1;
        while final_target_dir.exists() {
            let name_str = file_name.to_string_lossy();
            let new_name = if src_path.is_file() {
                let stem = src_path.file_stem().unwrap_or_default().to_string_lossy();
                let ext = src_path.extension().unwrap_or_default().to_string_lossy();
                if ext.is_empty() {
                    format!("{}_{}", stem, counter)
                } else {
                    format!("{}_{}.{}", stem, counter, ext)
                }
            } else {
                format!("{}_{}", name_str, counter)
            };
            final_target_dir = base_target_dir.join(new_name);
            counter += 1;
        }

        if strategy == "copy" || strategy == "move" {
            if src_path.is_dir() {
                copy_dir_all(&src_path, &final_target_dir).map_err(|e| e.to_string())?;
                if strategy == "move" {
                    std::fs::remove_dir_all(&src_path).map_err(|e| e.to_string())?;
                }
                
                #[cfg(target_os = "macos")]
                {
                    remove_folder_icon(&final_target_dir.to_string_lossy());
                }
            } else {
                std::fs::copy(&src_path, &final_target_dir).map_err(|e| e.to_string())?;
                if strategy == "move" {
                    std::fs::remove_file(&src_path).map_err(|e| e.to_string())?;
                }
            }
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
) -> Result<String, String> {
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
            
            let src_path = PathBuf::from(&path);
            let dir_name = src_path.file_name().ok_or("Invalid directory name")?.to_owned();
            let mut final_target_dir = base_target_dir.join(&dir_name);
            
            // Handle name collision
            let mut counter = 1;
            while final_target_dir.exists() {
                let new_name = format!("{}_{}", dir_name.to_string_lossy(), counter);
                final_target_dir = base_target_dir.join(new_name);
                counter += 1;
            }

            let src_clone = src_path.clone();
            let target_clone = final_target_dir.clone();
            let strat_clone = strat.clone();
            
            tauri::async_runtime::spawn_blocking(move || {
                if strat_clone == "copy" {
                    copy_dir_all(&src_clone, &target_clone).map_err(|e| e.to_string())
                } else if strat_clone == "move" {
                    if std::fs::rename(&src_clone, &target_clone).is_err() {
                        copy_dir_all(&src_clone, &target_clone).map_err(|e| e.to_string())?;
                        std::fs::remove_dir_all(&src_clone).map_err(|e| e.to_string())?;
                    }
                    Ok(())
                } else {
                    Ok(())
                }
            })
            .await
            .map_err(|e| format!("Task panicked: {}", e))?
            ?;
            
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
    
    #[cfg(target_os = "macos")]
    {
        set_folder_icon(&final_path);
    }
    
    // 2. Begin transaction and insert skills
    let tx = db.transaction().map_err(|e| e.to_string())?;
    for skill in skills {
        crate::db::insert_skill(&tx, &skill, &dir_id, &dir_type)?;
    }
    tx.commit().map_err(|e| e.to_string())?;

    
    Ok(dir_id)
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
    
    let _ = scan_and_add_source_directory(app, state, parent_dir, "github".to_string(), None, None).await?;
    
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


#[tauri::command]
pub async fn import_local_skills_to_workspace(
    _app: tauri::AppHandle,
    state: State<'_, AppState>,
    path: String,
    strategy: Option<String>,
    target_dir: Option<String>,
    source_dir_id: String
) -> Result<(), String> {
    let mut final_path = path.clone();

    if let Some(strat) = strategy {
        if strat == "copy" || strat == "move" {
            let base_target_dir = PathBuf::from(target_dir.ok_or("Missing target_dir for copy/move")?);
            std::fs::create_dir_all(&base_target_dir).map_err(|e| e.to_string())?;
            
            let src_path = PathBuf::from(&path);
            let dir_name = src_path.file_name().ok_or("Invalid directory name")?.to_owned();
            let mut final_target_dir = base_target_dir.join(&dir_name);
            
            let mut counter = 1;
            while final_target_dir.exists() {
                let new_name = format!("{}_{}", dir_name.to_string_lossy(), counter);
                final_target_dir = base_target_dir.join(new_name);
                counter += 1;
            }

            let src_clone = src_path.clone();
            let target_clone = final_target_dir.clone();
            let strat_clone = strat.clone();
            
            tauri::async_runtime::spawn_blocking(move || {
                if strat_clone == "copy" {
                    copy_dir_all(&src_clone, &target_clone).map_err(|e| e.to_string())
                } else if strat_clone == "move" {
                    if std::fs::rename(&src_clone, &target_clone).is_err() {
                        copy_dir_all(&src_clone, &target_clone).map_err(|e| e.to_string())?;
                        std::fs::remove_dir_all(&src_clone).map_err(|e| e.to_string())?;
                    }
                    Ok(())
                } else {
                    Ok(())
                }
            })
            .await
            .map_err(|e| format!("Task panicked: {}", e))??;
            
            final_path = final_target_dir.to_string_lossy().to_string();
        }
    }

    let path_clone = final_path.clone();
    
    // Scan for skills in a background thread
    let skills = tauri::async_runtime::spawn_blocking(move || {
        scanner::scan_directory(Path::new(&path_clone))
    })
    .await
    .map_err(|e| format!("Scan task panicked: {}", e))??;
    
    let mut db = state.db.lock().unwrap();
    let tx = db.transaction().map_err(|e| e.to_string())?;
    
    let source_type: String = tx.query_row(
        "SELECT source_type FROM source_directories WHERE id = ?1",
        rusqlite::params![source_dir_id],
        |row| row.get(0)
    ).unwrap_or("local".to_string());

    for skill in skills {
        crate::db::insert_skill(&tx, &skill, &source_dir_id, &source_type)?;
    }
    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn import_github_skills_to_workspace(
    _app: tauri::AppHandle,
    state: State<'_, AppState>,
    url: String,
    target_dir: String,
    source_dir_id: String
) -> Result<(), String> {
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
    
    let path_clone = target_dir.clone();
    let skills = tauri::async_runtime::spawn_blocking(move || {
        scanner::scan_directory(Path::new(&path_clone))
    })
    .await
    .map_err(|e| format!("Scan task panicked: {}", e))??;
    
    let mut db = state.db.lock().unwrap();
    let tx = db.transaction().map_err(|e| e.to_string())?;
    
    let source_type: String = tx.query_row(
        "SELECT source_type FROM source_directories WHERE id = ?1",
        rusqlite::params![source_dir_id],
        |row| row.get(0)
    ).unwrap_or("github".to_string());

    for skill in skills {
        crate::db::insert_skill(&tx, &skill, &source_dir_id, &source_type)?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    
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
        let mut stmt = tx.prepare("SELECT id, local_path FROM skills WHERE source_dir_id = ?1 AND source_type != 'online'").map_err(|e| e.to_string())?;
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
pub fn open_email(to: String, subject: String, body: String) -> Result<(), String> {
    let encoded_subject = urlencoding::encode(&subject);
    let encoded_body = urlencoding::encode(&body);
    let mailto_url = format!("mailto:{}?subject={}&body={}", to, encoded_subject, encoded_body);

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&mailto_url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32")
            .args(&["url.dll,FileProtocolHandler", &mailto_url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&mailto_url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
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
        if path.starts_with("mailto:") || path.starts_with("http://") || path.starts_with("https://") {
            std::process::Command::new("rundll32")
                .args(&["url.dll,FileProtocolHandler", &path])
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            std::process::Command::new("explorer")
                .arg(&path)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
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

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        // Linux 下通常只能打开父目录
        if let Some(parent) = std::path::Path::new(&path).parent() {
            std::process::Command::new("xdg-open")
                .arg(parent)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[derive(serde::Serialize, Clone)]
pub struct AppInfo {
    pub name: String,
    pub path: String,
    pub icon_base64: Option<String>,
}

#[tauri::command]
pub fn get_open_with_apps(path: String) -> Result<Vec<AppInfo>, String> {
    #[cfg(target_os = "macos")]
    {
        let script = format!(r#"
import Cocoa
let fileURL = URL(fileURLWithPath: "{}")
if let appURLs = LSCopyApplicationURLsForURL(fileURL as CFURL, [.viewer, .editor])?.takeRetainedValue() as? [URL] {{
    var seen = Set<String>()
    for url in appURLs {{
        let path = url.path
        if seen.contains(path) {{ continue }}
        seen.insert(path)
        let name = url.deletingPathExtension().lastPathComponent
        var base64Str = ""
        if let icon = NSWorkspace.shared.icon(forFile: path) as NSImage? {{
            let size = NSSize(width: 32, height: 32)
            let newImage = NSImage(size: size)
            newImage.lockFocus()
            icon.draw(in: NSRect(origin: .zero, size: size), from: NSRect(origin: .zero, size: icon.size), operation: .copy, fraction: 1.0)
            newImage.unlockFocus()
            if let tiffData = newImage.tiffRepresentation, 
               let bitmap = NSBitmapImageRep(data: tiffData), 
               let pngData = bitmap.representation(using: .png, properties: [:]) {{
                base64Str = pngData.base64EncodedString()
            }}
        }}
        print("\(name)||\(path)||\(base64Str)")
    }}
}}
"#, path.replace("\"", "\\\""));

        let output = std::process::Command::new("swift")
            .arg("-e")
            .arg(&script)
            .output()
            .map_err(|e| e.to_string())?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut apps = Vec::new();
        for line in stdout.lines() {
            let parts: Vec<&str> = line.split("||").collect();
            if parts.len() >= 2 {
                apps.push(AppInfo {
                    name: parts[0].to_string(),
                    path: parts[1].to_string(),
                    icon_base64: if parts.len() > 2 && !parts[2].is_empty() { Some(parts[2].to_string()) } else { None },
                });
            }
        }
        Ok(apps)
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(vec![])
    }
}

#[tauri::command]
pub fn open_with_app(file_path: String, app_path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-a")
            .arg(&app_path)
            .arg(&file_path)
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
        n_lower == "skill.md" || n_lower == "skill.mdx" || n_lower == "design.md"
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
    // 展开 ~ 为用户 home 目录
    let path = if path.starts_with("~/") {
        if let Some(home) = dirs::home_dir() {
            home.join(&path[2..]).to_string_lossy().to_string()
        } else {
            path
        }
    } else {
        path
    };

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
        set_folder_icon(&path);
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

// ========================= 智能引用提示词 =========================

/// 从路径向上找 .git 目录，返回仓库根路径
fn find_git_root(path: &Path) -> Option<std::path::PathBuf> {
    let mut current = path;
    loop {
        if current.join(".git").exists() {
            return Some(current.to_path_buf());
        }
        match current.parent() {
            Some(p) => current = p,
            None => return None,
        }
    }
}

/// 生成目录树字符串（最多 2 层深，过滤噪音目录）
fn generate_file_tree(dir: &Path, entry_file: &Path, max_depth: usize) -> String {
    let excluded = [
        // 构建与依赖
        "node_modules", "target", "dist", "build", "out", ".git",
        // Python 噪音
        "tests", "test", "__pycache__", "venv", ".venv",
        ".pytest_cache", ".mypy_cache", "coverage", ".coverage",
        // 系统元数据
        "__MACOSX", "__tests__",
    ];
    let mut lines = Vec::new();
    collect_tree(entry_file, dir, 0, max_depth, &excluded, &mut lines);
    lines.join("\n")
}

/// 每个目录超过此数量时触发折叠
const FOLD_THRESHOLD: usize = 6;
/// 折叠时展示的条目数
const FOLD_SHOW: usize = 4;

fn collect_tree(
    entry_file: &Path,
    current: &Path,
    depth: usize,
    max_depth: usize,
    excluded: &[&str],
    lines: &mut Vec<String>,
) {
    if depth > max_depth {
        return;
    }
    let Ok(all_entries) = std::fs::read_dir(current) else { return };
    let mut all_items: Vec<_> = all_entries.flatten().collect();
    // 目录在前，文件在后，同类按名排序
    all_items.sort_by_key(|e| {
        let is_file = e.path().is_file();
        (if is_file { 1u8 } else { 0u8 }, e.file_name())
    });

    // 过滤隐藏条目和黑名单目录
    let visible: Vec<_> = all_items.into_iter().filter(|e| {
        let name = e.file_name().to_string_lossy().to_string();
        !name.starts_with('.') && !excluded.contains(&name.as_str())
    }).collect();

    let total = visible.len();
    let show_count = if total > FOLD_THRESHOLD { FOLD_SHOW } else { total };
    let remaining = total.saturating_sub(show_count);

    for (i, entry) in visible.iter().take(show_count).enumerate() {
        let name = entry.file_name().to_string_lossy().to_string();
        // 当无省略行时，最后一项用 └── ；否则省略行才是最后一项
        let is_last = i == show_count - 1 && remaining == 0;
        let prefix = if depth == 0 {
            "".to_string()
        } else {
            "│   ".repeat(depth - 1) + if is_last { "└── " } else { "├── " }
        };
        let path = entry.path();
        let is_entry = path == entry_file;
        let suffix = if is_entry { "     ← 主文件（请先阅读）" } else { "" };

        if path.is_dir() {
            lines.push(format!("{}{}/{}", prefix, name, suffix));
            if depth < max_depth {
                collect_tree(entry_file, &path, depth + 1, max_depth, excluded, lines);
            }
        } else {
            lines.push(format!("{}{}{}", prefix, name, suffix));
        }
    }

    // 折叠省略行（始终是最后一条）
    if remaining > 0 {
        let prefix = if depth == 0 {
            "".to_string()
        } else {
            "│   ".repeat(depth - 1) + "└── "
        };
        lines.push(format!("{}... 及其他 {} 个文件/目录", prefix, remaining));
    }
}

/// 生成仓库一级目录概览（用于 scope=repo 场景）
fn generate_top_level_overview(repo_root: &Path, entry_file: &Path) -> String {
    let Ok(entries) = std::fs::read_dir(repo_root) else { return String::new() };
    let mut items: Vec<_> = entries.flatten().collect();
    items.sort_by_key(|e| e.file_name());

    let excluded = ["node_modules", "target", "dist", "build", "out", ".git"];
    let mut lines = Vec::new();
    for entry in items {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || excluded.contains(&name.as_str()) {
            continue;
        }
        let path = entry.path();
        let is_entry = path == entry_file;
        let suffix = if is_entry { "     ← 技能主文件" } else { "" };
        if path.is_dir() {
            lines.push(format!("├── {}/{}", name, suffix));
        } else {
            lines.push(format!("├── {}{}", name, suffix));
        }
    }
    if let Some(last) = lines.last_mut() {
        *last = last.replacen("├──", "└──", 1);
    }
    lines.join("\n")
}

/// 获取仓库下所有技能数量（用于推断 repo_type）
fn count_skills_in_repo(all_skills: &[crate::models::Skill], repo_root: &Path) -> usize {
    let root_str = repo_root.to_string_lossy();
    all_skills.iter()
        .filter(|s| s.local_path.starts_with(root_str.as_ref()))
        .count()
}

#[tauri::command]
pub fn generate_skill_reference_prompt(state: State<'_, AppState>, skill_id: String) -> Result<String, String> {
    let db = state.db.lock().unwrap();

    // 查询技能信息
    let skill = {
        let mut stmt = db.prepare(
            "SELECT id, name, description, local_path, source_type, skill_scope, online_url FROM skills WHERE id = ?1"
        ).map_err(|e| e.to_string())?;
        let result = stmt.query_row(rusqlite::params![skill_id], |row| {
            Ok((
                row.get::<_, String>(0)?,  // id
                row.get::<_, String>(1)?,  // name
                row.get::<_, String>(2)?,  // description
                row.get::<_, String>(3)?,  // local_path
                row.get::<_, String>(4)?,  // source_type
                row.get::<_, Option<String>>(5)?.unwrap_or_else(|| "repo".to_string()), // skill_scope
                row.get::<_, Option<String>>(6)?,  // online_url
            ))
        }).map_err(|e| format!("找不到技能: {}", e))?;
        result
    };

    let (_id, name, description, local_path, source_type, skill_scope, online_url) = skill;

    // 场景 5：线上收藏技能
    if source_type == "online" {
        let mut url = online_url.unwrap_or_else(|| local_path.clone());
        if url.ends_with(".git") {
            url.truncate(url.len() - 4);
        }
        let desc_line = if description.is_empty() {
            String::new()
        } else {
            format!("- 描述: {}\n", description)
        };
        return Ok(format!(
"## 技能引用：{name}

{desc_line}
### 技能地址
{url}

⚠️ 此技能以线上地址管理，未在本地存储。
请访问上述地址阅读技能文件及相关内容。",
            name = name,
            desc_line = desc_line,
            url = url,
        ));
    }

    let skill_path = Path::new(&local_path);

    // 查询所有技能（用于 repo_type 推断）
    let all_skills = crate::db::get_all_skills(&db)?;

    // 找仓库根目录
    let repo_root = find_git_root(skill_path)
        .or_else(|| skill_path.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| skill_path.parent().unwrap_or(skill_path).to_path_buf());

    // 推断 repo_type
    let skills_in_repo = count_skills_in_repo(&all_skills, &repo_root);
    let repo_type = if skills_in_repo >= 2 { "collection" } else { "single" };

    // 仓库名（取目录最后一段）
    let repo_name = repo_root.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "未知仓库".to_string());

    // 生成提示词
    let prompt = match skill_scope.as_str() {
        "loose" => {
            // 场景 1：散装技能 —— 单文件 + 仓库根兜底
            format!(
"## 技能引用：{name}

- 描述: {description}
- 来源: {repo_name}

### 技能文件
{local_path}

请阅读上述文件，按照其中定义的角色、规则和工作流程执行任务。

### 执行指令
请主动读取包含此入口文件的所在目录结构。如果该目录下存在 `scripts`、`references`、`assets`、`agents` 等配套文件夹或其他相关文件，请务必一并阅读并结合相对路径进行理解。**不要仅仅只阅读入口文件本身。**在执行任务前，请确认你已掌握了该技能所需的全部配套上下文。

### 仓库上下文
如需参考共享资源（包括但不限于脚本、示例、文档等），
可在仓库根目录中查找：
{repo_root}",
                name = name,
                description = description,
                repo_name = repo_name,
                local_path = local_path,
                repo_root = repo_root.display(),
            )
        }
        "packed" => {
            let skill_dir = skill_path.parent()
                .unwrap_or(skill_path);
            let entry_file_name = skill_path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "主文件".to_string());
            let file_tree = generate_file_tree(skill_dir, skill_path, 2);

            if repo_type == "collection" {
                // 场景 2：独立包 × 合集
                format!(
"## 技能引用：{name}

- 描述: {description}
- 来源: {repo_name} 技能合集

### 技能目录
{skill_dir}

该目录下的文件：
{file_tree}

请先阅读目录下的 {entry_file_name}，技能配套的脚本和文档均在上述目录内。

### 执行指令
请主动读取完整的技能目录结构。务必探索并加载配套的 `scripts`、`references`、`assets`、`agents` 等关联文件夹及其内部文件，保留并理解它们之间的相对目录结构。**不要仅仅只阅读入口文件（{entry_file_name}）本身。**在执行任务前，请确认你已掌握并加载了这个 skill 需要的全部配套上下文。

### 仓库上下文
此技能属于技能合集。如需引用共享资源（包括但不限于公共脚本、
hooks、测试工具等），可在仓库根目录中查找：
{repo_root}",
                    name = name,
                    description = description,
                    repo_name = repo_name,
                    skill_dir = skill_dir.display(),
                    file_tree = file_tree,
                    entry_file_name = entry_file_name,
                    repo_root = repo_root.display(),
                )
            } else {
                // 场景 3：独立包 × 单技能
                format!(
"## 技能引用：{name}

- 描述: {description}
- 来源: {repo_name}

### 技能目录
{skill_dir}

该目录下的文件：
{file_tree}

请先阅读目录下的 {entry_file_name}。

### 执行指令
请主动读取完整的技能目录结构。务必探索并加载配套的 `scripts`、`references`、`assets`、`agents` 等关联文件夹及其内部文件，保留并理解它们之间的相对目录结构。**不要仅仅只阅读入口文件（{entry_file_name}）本身。**在执行任务前，请确认你已掌握并加载了这个 skill 需要的全部配套上下文。

### 仓库级配套资源
整个仓库都是此技能的配套资源，包含文档、示例、脚本等：
{repo_root}

如需额外的文档、模板、示例或脚本，请在仓库根目录中查找。",
                    name = name,
                    description = description,
                    repo_name = repo_name,
                    skill_dir = skill_dir.display(),
                    file_tree = file_tree,
                    entry_file_name = entry_file_name,
                    repo_root = repo_root.display(),
                )
            }
        }
        _ => {
            // 场景 4：整仓 (repo) —— 入口文件 + 仓库根 + 一级目录概览
            let overview = generate_top_level_overview(&repo_root, skill_path);
            format!(
"## 技能引用：{name}

- 描述: {description}
- 来源: {repo_name}

### 技能入口
{local_path}

请先阅读上述入口文件。

### 执行指令
请主动读取完整的技能仓库目录结构。务必探索并加载配套的 `scripts`、`references`、`assets`、`agents` 等关联文件夹及其内部文件，保留并理解它们之间的相对目录结构。**不要仅仅只阅读入口文件本身。**在执行任务前，请确认你已掌握并加载了这个 skill 需要的全部配套上下文。技能的所有配套脚本、文档、模板、示例均在仓库目录内，可自由探索：
{repo_root}

仓库主要内容：
{overview}",
                name = name,
                description = description,
                repo_name = repo_name,
                local_path = local_path,
                repo_root = repo_root.display(),
                overview = overview,
            )
        }
    };

    Ok(prompt)
}

/// 线上收藏技能：不需要本地文件，直接保存 URL
#[tauri::command]
pub fn add_online_skill(
    state: State<'_, AppState>,
    url: String,
    name: String,
    description: String,
    source_dir_id: String,
) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();
    crate::db::add_online_skill(&db, &id, &url, &name, &description, &source_dir_id, &now)
}

use std::sync::atomic::{AtomicI64, Ordering};
static GOOGLE_FAIL_TIMESTAMP: AtomicI64 = AtomicI64::new(0);

fn unescape_html(s: &str) -> String {
    s.replace("&quot;", "\"")
     .replace("&#39;", "'")
     .replace("&apos;", "'")
     .replace("&lt;", "<")
     .replace("&gt;", ">")
     .replace("&amp;", "&")
}

async fn translate_chunk_google(client: &reqwest::Client, chunk: &str, target_lang: &str) -> Result<String, String> {
    use serde_json::Value;

    let url = format!(
        "https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=auto&tl={}&dt=t",
        target_lang
    );
    let body = format!("q={}", urlencoding::encode(chunk));

    let res = client
        .post(&url)
        .timeout(std::time::Duration::from_millis(1500))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Google network error: {}", e))?;

    let status = res.status();
    let text_response = res.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(format!("Google API status {}: {}", status, text_response));
    }

    let json: Value = serde_json::from_str(&text_response)
        .map_err(|e| format!("Failed to parse Google JSON: {}", e))?;

    let mut translated = String::new();
    if let Some(array) = json.as_array() {
        if let Some(sentences) = array.get(0).and_then(|v| v.as_array()) {
            for sentence in sentences {
                if let Some(text_part) = sentence.get(0).and_then(|v| v.as_str()) {
                    translated.push_str(text_part);
                }
            }
        }
    }

    if translated.is_empty() {
        Err("Empty translation from Google".to_string())
    } else {
        Ok(translated)
    }
}

async fn translate_chunk_tencent(client: &reqwest::Client, chunk: &str, target_lang: &str) -> Result<String, String> {
    use serde_json::Value;

    let tgt = if target_lang.starts_with("zh") { "zh" } else { target_lang };

    let url = "https://transmart.qq.com/api/imt";
    let payload = serde_json::json!({
        "header": {
            "fn": "auto_translation",
            "client_key": "browser-chrome-122.0.0-Mac_OS"
        },
        "type": "plain",
        "model_category": "normal",
        "source": {
            "lang": "auto",
            "text_list": [chunk]
        },
        "target": {
            "lang": tgt
        }
    });

    let res = client
        .post(url)
        .timeout(std::time::Duration::from_millis(3000))
        .json(&payload)
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|e| format!("Tencent network error: {}", e))?;

    let status = res.status();
    let text_response = res.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(format!("Tencent status {}: {}", status, text_response));
    }

    let json: Value = serde_json::from_str(&text_response)
        .map_err(|e| format!("Failed to parse Tencent JSON: {}", e))?;

    if let Some(list) = json["auto_translation"].as_array() {
        let mut translated = String::new();
        for item in list {
            if let Some(s) = item.as_str() {
                translated.push_str(s);
            }
        }
        if !translated.is_empty() {
            return Ok(translated);
        }
    }

    Err(format!("Tencent response missing translation: {}", text_response))
}

async fn translate_chunk_mymemory(client: &reqwest::Client, chunk: &str, target_lang: &str) -> Result<String, String> {
    use serde_json::Value;

    // MyMemory 目标语言映射 (如 zh-CN, en, ja, ko)
    let lang_pair = if target_lang.starts_with("zh") {
        "autodetect|zh-CN"
    } else {
        &format!("autodetect|{}", target_lang)
    };

    let url = "https://api.mymemory.translated.net/get";
    let body = format!("q={}&langpair={}", urlencoding::encode(chunk), lang_pair);

    let res = client
        .post(url)
        .timeout(std::time::Duration::from_millis(2500))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
        .body(body)
        .send()
        .await
        .map_err(|e| format!("MyMemory network error: {}", e))?;

    let status = res.status();
    let text_response = res.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(format!("MyMemory status {}: {}", status, text_response));
    }

    let json: Value = serde_json::from_str(&text_response)
        .map_err(|e| format!("Failed to parse MyMemory JSON: {}", e))?;

    if let Some(translated_text) = json["responseData"]["translatedText"].as_str() {
        if !translated_text.is_empty() 
            && !translated_text.starts_with("MYMEMORY WARNING:") 
            && !translated_text.contains("QUERY LENGTH LIMIT") 
        {
            return Ok(unescape_html(translated_text));
        }
    }

    Err(format!("MyMemory response invalid: {}", text_response))
}

#[tauri::command]
pub async fn translate_text(text: String, target_lang: String) -> Result<String, String> {
    use reqwest::Client;

    // 常规客户端（走系统网络/代理，用于 Google 和 MyMemory）
    let client = Client::builder()
        .timeout(std::time::Duration::from_millis(2500))
        .build()
        .unwrap_or_else(|_| Client::new());

    // 国内直连客户端（核心：强制绕过系统代理 no_proxy，即使 VPN 卡死也能毫秒级秒连腾讯服务器！）
    let direct_client = Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_millis(2000))
        .build()
        .unwrap_or_else(|_| Client::new());

    // 保护 Markdown 骨架：空行、代码块、分隔符完全不送翻，保持原样；
    // 标题、列表行、文本行单独成项翻译，绝不跨行合并，彻底杜绝换行符被翻译引擎吞噬粘连的排版塌陷！
    #[derive(Clone)]
    enum MarkdownItem {
        Preserved(String),
        Translate(String),
    }

    let mut items: Vec<MarkdownItem> = Vec::new();
    let mut in_code_block = false;

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("```") {
            in_code_block = !in_code_block;
            items.push(MarkdownItem::Preserved(line.to_string()));
            continue;
        }
        if in_code_block || trimmed.is_empty() || trimmed == "---" {
            items.push(MarkdownItem::Preserved(line.to_string()));
            continue;
        }

        // 单行如果长度在 350 字符以内，保持为独立翻译行（绝不和下一行合并，防止吞噬换行）
        if line.len() <= 350 {
            items.push(MarkdownItem::Translate(line.to_string()));
        } else {
            // 超长单行按句子截断
            let mut sub_chunk = String::new();
            for ch in line.chars() {
                sub_chunk.push(ch);
                if sub_chunk.len() >= 300 && (ch == '。' || ch == '.' || ch == '；' || ch == ';' || ch == ' ' || ch == '!') {
                    items.push(MarkdownItem::Translate(sub_chunk.clone()));
                    sub_chunk.clear();
                }
            }
            if !sub_chunk.is_empty() {
                items.push(MarkdownItem::Translate(sub_chunk));
            }
        }
    }
    
    let now = chrono::Utc::now().timestamp();
    let last_fail = GOOGLE_FAIL_TIMESTAMP.load(Ordering::Relaxed);
    // 动态判断 Google 是否允许尝试
    let mut allow_google = (now - last_fail).abs() > 600;

    let mut full_translated_text = String::new();
    
    for item in items {
        match item {
            MarkdownItem::Preserved(s) => {
                full_translated_text.push_str(&s);
                full_translated_text.push('\n');
            }
            MarkdownItem::Translate(chunk) => {
                let mut translated_chunk = None;

                // 1. 如果 Google 处于可用状态，优先尝试 Google (1.5 秒极速判定)
                if allow_google {
                    match translate_chunk_google(&client, &chunk, &target_lang).await {
                        Ok(res) => {
                            GOOGLE_FAIL_TIMESTAMP.store(0, Ordering::Relaxed);
                            translated_chunk = Some(res);
                        }
                        Err(err) => {
                            eprintln!("[Translate] Google API unavailable ({}), switching all remaining chunks to domestic direct Tencent...", err);
                            // 核心关键：当前任务一旦失败，后续所有 chunk 立即 0 毫秒跳过 Google，绝不重复卡顿！
                            allow_google = false;
                            GOOGLE_FAIL_TIMESTAMP.store(chrono::Utc::now().timestamp(), Ordering::Relaxed);
                        }
                    }
                }

                // 2. 如果 Google 失败或处于熔断期，走国内无代理直连主力源 (腾讯交互翻译 Tencent Transmart)
                if translated_chunk.is_none() {
                    match translate_chunk_tencent(&direct_client, &chunk, &target_lang).await {
                        Ok(res) => {
                            translated_chunk = Some(res);
                        }
                        Err(err) => {
                            eprintln!("[Translate] Direct Tencent failed ({}), trying MyMemory fallback...", err);
                        }
                    }
                }

                // 3. 若腾讯也偶发失败，无缝走第三备选源 (MyMemory Neural)
                if translated_chunk.is_none() {
                    match translate_chunk_mymemory(&client, &chunk, &target_lang).await {
                        Ok(res) => {
                            translated_chunk = Some(res);
                        }
                        Err(err) => {
                            eprintln!("[Translate] MyMemory provider failed: {}", err);
                            translated_chunk = Some(chunk.clone());
                        }
                    }
                }

                if let Some(res) = translated_chunk {
                    full_translated_text.push_str(&res);
                    full_translated_text.push('\n');
                }
            }
        }
    }

    let result = full_translated_text.trim_end().to_string();
    if result.is_empty() {
        Err("翻译结果为空".to_string())
    } else {
        Ok(result)
    }
}

#[derive(serde::Serialize)]
pub struct SkillCapacity {
    pub file_count: u32,
    pub line_count: u32,
    pub token_count: u32,
    pub char_count: u32,
    
    pub main_doc_file_count: u32,
    pub main_doc_token_count: u32,
    pub knowledge_file_count: u32,
    pub knowledge_token_count: u32,
    pub script_file_count: u32,
    pub script_token_count: u32,
}

#[tauri::command]
pub async fn get_skill_token_count(state: tauri::State<'_, crate::AppState>, skill_id: String) -> Result<SkillCapacity, String> {
    let (local_path_str, skill_scope): (String, String) = {
        let db = state.db.lock().unwrap();
        db.query_row(
            "SELECT local_path, skill_scope FROM skills WHERE id = ?1",
            rusqlite::params![skill_id],
            |row| Ok((row.get(0)?, row.get::<_, Option<String>>(1)?.unwrap_or_else(|| "repo".to_string()))),
        ).map_err(|e| format!("Skill not found: {}", e))?
    };

    let path = std::path::Path::new(&local_path_str);
    if !path.exists() {
        return Err("Path does not exist".to_string());
    }

    // Determine actual scan scope
    let target_path = if skill_scope == "packed" || skill_scope == "pkg" {
        path.parent().unwrap_or(path).to_path_buf()
    } else if skill_scope == "repo" {
        find_git_root(path).unwrap_or_else(|| path.parent().unwrap_or(path).to_path_buf())
    } else {
        path.to_path_buf() // "loose" or single file
    };

    println!("DEBUG: skill_id={}, local_path={}, skill_scope={}, target_path={}", skill_id, local_path_str, skill_scope, target_path.display());

    let mut capacity = SkillCapacity {
        file_count: 0,
        line_count: 0,
        token_count: 0,
        char_count: 0,
        main_doc_file_count: 0,
        main_doc_token_count: 0,
        knowledge_file_count: 0,
        knowledge_token_count: 0,
        script_file_count: 0,
        script_token_count: 0,
    };

    let bpe = tiktoken_rs::cl100k_base().map_err(|e| e.to_string())?;

    let is_main_doc = |path: &std::path::Path| -> bool {
        if let Some(ext) = path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()) {
            if ext == "md" || ext == "mdx" {
                if let Some(name) = path.file_stem().and_then(|n| n.to_str()).map(|n| n.to_lowercase()) {
                    return name == "skill" || name == "readme" || name == "design" || name == "agents" || name == "claude" || name == "readme_cn";
                }
            }
        }
        false
    };

    let is_knowledge = |path: &std::path::Path| -> bool {
        if let Some(ext) = path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()) {
            ext == "md" || ext == "mdx"
        } else {
            false
        }
    };

    // If target is just a file, calculate it directly
    if target_path.is_file() {
        if let Ok(content) = std::fs::read_to_string(&target_path) {
            capacity.file_count = 1;
            capacity.line_count = content.lines().count() as u32;
            capacity.char_count = content.chars().count() as u32;
            let tokens = bpe.encode_with_special_tokens(&content).len() as u32;
            capacity.token_count = tokens;
            
            if is_main_doc(&target_path) {
                capacity.main_doc_file_count = 1;
                capacity.main_doc_token_count = tokens;
            } else if is_knowledge(&target_path) {
                capacity.knowledge_file_count = 1;
                capacity.knowledge_token_count = tokens;
            } else {
                capacity.script_file_count = 1;
                capacity.script_token_count = tokens;
            }
        }
        return Ok(capacity);
    }

    // If it's a directory, walk through it respecting .gitignore and explicitly filtering massive directories
    let walker = ignore::WalkBuilder::new(&target_path)
        .hidden(true)
        .git_ignore(true)
        .filter_entry(|e| {
            if let Some(name) = e.file_name().to_str() {
                if e.file_type().map_or(false, |ft| ft.is_dir()) {
                    let ignored_dirs = [
                        "node_modules", "venv", ".venv", "env", ".env", "target", "dist", "build", "__pycache__", ".git", ".idea", ".vscode"
                    ];
                    if ignored_dirs.contains(&name) {
                        return false;
                    }
                }
            }
            true
        })
        .build();

    for result in walker {
        if let Ok(entry) = result {
            let p = entry.path();
            if p.is_file() {
                // Try reading as string (skips binaries automatically if read_to_string fails)
                if let Ok(content) = std::fs::read_to_string(p) {
                    capacity.file_count += 1;
                    capacity.line_count += content.lines().count() as u32;
                    capacity.char_count += content.chars().count() as u32;
                    
                    let tokens = bpe.encode_with_special_tokens(&content).len() as u32;
                    capacity.token_count += tokens;
                    
                    if is_main_doc(p) {
                        capacity.main_doc_file_count += 1;
                        capacity.main_doc_token_count += tokens;
                    } else if is_knowledge(p) {
                        capacity.knowledge_file_count += 1;
                        capacity.knowledge_token_count += tokens;
                    } else {
                        capacity.script_file_count += 1;
                        capacity.script_token_count += tokens;
                    }
                }
            }
        }
    }

    Ok(capacity)
}



#[tauri::command]
pub async fn validate_and_copy_dropped_folders(
    paths: Vec<String>,
    target_workspace_path: String
) -> Result<String, String> {
    let mut copied_count = 0;
    let mut failed_paths = Vec::new();

    let base_target_dir = PathBuf::from(&target_workspace_path);
    if !base_target_dir.exists() {
        return Err("当前目标资源库路径不存在".to_string());
    }

    for path in paths {
        let src_path = Path::new(&path);
        if !src_path.is_dir() {
            failed_paths.push(format!("{} 不是一个文件夹", src_path.display()));
            continue;
        }

        // Validate if it contains any skills
        let skills = scanner::scan_directory(src_path).unwrap_or_default();
        if skills.is_empty() {
            failed_paths.push(format!("{} 不包含任何有效的 Skill 文件", src_path.display()));
            continue;
        }

        let dir_name = match src_path.file_name() {
            Some(name) => name,
            None => {
                failed_paths.push(format!("无法获取文件夹名: {}", src_path.display()));
                continue;
            }
        };

        let mut final_target_dir = base_target_dir.join(dir_name);
        
        let mut counter = 1;
        while final_target_dir.exists() {
            let new_name = format!("{}_{}", dir_name.to_string_lossy(), counter);
            final_target_dir = base_target_dir.join(new_name);
            counter += 1;
        }
        
        let src_clone = src_path.to_path_buf();
        let target_clone = final_target_dir.clone();
        
        let copy_result = tauri::async_runtime::spawn_blocking(move || {
            copy_dir_all(&src_clone, &target_clone)
        }).await.unwrap_or_else(|e| Err(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())));

        if let Err(e) = copy_result {
            failed_paths.push(format!("无法拷贝 {}: {}", src_path.display(), e));
        } else {
            copied_count += 1;
        }
    }

    if copied_count == 0 {
        if !failed_paths.is_empty() {
            return Err(failed_paths.join("\n"));
        }
        return Err("没有任何文件夹被导入".to_string());
    }

    if !failed_paths.is_empty() {
        Ok(format!("成功导入 {} 个文件夹，但部分导入失败:\n{}", copied_count, failed_paths.join("\n")))
    } else {
        Ok(format!("成功导入 {} 个文件夹", copied_count))
    }
}

pub fn set_folder_icon(folder_path: &str) {
    #[cfg(target_os = "macos")]
    {
        set_macos_folder_icon(folder_path);
    }
    #[cfg(target_os = "windows")]
    {
        set_windows_folder_icon(folder_path);
    }
    #[cfg(target_os = "linux")]
    {
        set_linux_folder_icon(folder_path);
    }
}

pub fn remove_folder_icon(folder_path: &str) {
    #[cfg(target_os = "macos")]
    {
        remove_macos_folder_icon(folder_path);
    }
    #[cfg(target_os = "windows")]
    {
        remove_windows_folder_icon(folder_path);
    }
    #[cfg(target_os = "linux")]
    {
        remove_linux_folder_icon(folder_path);
    }
}

#[cfg(target_os = "windows")]
fn set_windows_folder_icon(folder_path: &str) {
    use std::fs;
    use std::path::Path;
    use std::process::Command;

    let folder_path = Path::new(folder_path);
    if !folder_path.exists() {
        return;
    }

    let icon_data = include_bytes!("../../src/assets/folder_icon.ico");
    let icon_path = folder_path.join(".skillhub_icon.ico");
    let ini_path = folder_path.join("desktop.ini");

    if fs::write(&icon_path, icon_data).is_ok() {
        let ini_content = "[.ShellClassInfo]\r\nIconResource=.skillhub_icon.ico,0\r\n";
        let _ = fs::write(&ini_path, ini_content);

        // Hide files and set folder as read-only
        let _ = Command::new("attrib").args(&["+h", "+s", icon_path.to_str().unwrap_or("")]).output();
        let _ = Command::new("attrib").args(&["+h", "+s", ini_path.to_str().unwrap_or("")]).output();
        let _ = Command::new("attrib").args(&["+r", folder_path.to_str().unwrap_or("")]).output();
    }
}

#[cfg(target_os = "windows")]
fn remove_windows_folder_icon(folder_path: &str) {
    use std::fs;
    use std::path::Path;
    use std::process::Command;

    let folder_path = Path::new(folder_path);
    let _ = Command::new("attrib").args(&["-r", folder_path.to_str().unwrap_or("")]).output();
    
    let icon_path = folder_path.join(".skillhub_icon.ico");
    let ini_path = folder_path.join("desktop.ini");
    
    let _ = Command::new("attrib").args(&["-h", "-s", icon_path.to_str().unwrap_or("")]).output();
    let _ = Command::new("attrib").args(&["-h", "-s", ini_path.to_str().unwrap_or("")]).output();
    
    let _ = fs::remove_file(icon_path);
    let _ = fs::remove_file(ini_path);
}

#[cfg(target_os = "linux")]
fn set_linux_folder_icon(folder_path: &str) {
    use std::fs;
    use std::path::Path;
    use std::process::Command;

    let folder_path = Path::new(folder_path);
    if !folder_path.exists() {
        return;
    }

    let icon_data = include_bytes!("../../src/assets/folder_icon.png");
    let icon_path = folder_path.join(".skillhub_icon.png");
    
    if fs::write(&icon_path, icon_data).is_ok() {
        // KDE support
        let dir_file_path = folder_path.join(".directory");
        let dir_content = format!("[Desktop Entry]\nIcon={}\n", icon_path.to_string_lossy());
        let _ = fs::write(&dir_file_path, dir_content);
        
        // GNOME/GTK support (gio)
        let _ = Command::new("gio")
            .args(&["set", "-t", "string", folder_path.to_str().unwrap_or(""), "metadata::custom-icon", &format!("file://{}", icon_path.to_string_lossy())])
            .output();
    }
}

#[cfg(target_os = "linux")]
fn remove_linux_folder_icon(folder_path: &str) {
    use std::fs;
    use std::path::Path;
    use std::process::Command;

    let folder_path = Path::new(folder_path);
    
    let _ = fs::remove_file(folder_path.join(".skillhub_icon.png"));
    let _ = fs::remove_file(folder_path.join(".directory"));
    
    let _ = Command::new("gio")
        .args(&["set", "-t", "unset", folder_path.to_str().unwrap_or(""), "metadata::custom-icon"])
        .output();
}

#[tauri::command]
pub async fn export_database(app: tauri::AppHandle, target_path: String) -> Result<(), String> {
    use tauri::Manager;
    use std::fs::File;
    use zip::write::FileOptions;
    use zip::ZipWriter;
    
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("skillhub.sqlite");
    
    if !db_path.exists() {
        return Err("数据库文件不存在".to_string());
    }

    // 创建 manifest
    let manifest = serde_json::json!({
        "export_time": chrono::Utc::now().to_rfc3339(),
        "app_version": app.package_info().version.to_string(),
    });
    
    let manifest_str = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    
    // 执行打包逻辑
    tauri::async_runtime::spawn_blocking(move || {
        let file = File::create(&target_path).map_err(|e| e.to_string())?;
        let mut zip = ZipWriter::new(file);
        
        #[allow(deprecated)]
        let opts = FileOptions::default()
            .compression_method(zip::CompressionMethod::Stored)
            .unix_permissions(0o644);
            
        // 写入 manifest
        zip.start_file("manifest.json", opts).map_err(|e| e.to_string())?;
        use std::io::Write;
        zip.write_all(manifest_str.as_bytes()).map_err(|e| e.to_string())?;
        
        // 写入 sqlite
        zip.start_file("skillhub.sqlite", opts).map_err(|e| e.to_string())?;
        let mut db_file = File::open(&db_path).map_err(|e| e.to_string())?;
        use std::io::Read;
        let mut buf = Vec::new();
        db_file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        zip.write_all(&buf).map_err(|e| e.to_string())?;
        
        zip.finish().map_err(|e| e.to_string())?;
        
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("线程错误: {}", e))??;
    
    Ok(())
}

#[tauri::command]
pub async fn import_database(app: tauri::AppHandle, zip_path: String) -> Result<(), String> {
    use tauri::Manager;
    use std::fs::File;
    use zip::ZipArchive;
    
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("skillhub.sqlite");
    
    // 在子线程解压和校验
    tauri::async_runtime::spawn_blocking(move || {
        let file = File::open(&zip_path).map_err(|e| e.to_string())?;
        let mut archive = ZipArchive::new(file).map_err(|e| format!("无效的 ZIP 文件: {}", e))?;
        
        // 校验 manifest
        let has_manifest = archive.by_name("manifest.json").is_ok();
        let has_db = archive.by_name("skillhub.sqlite").is_ok();
        
        if !has_manifest || !has_db {
            return Err("压缩包格式不正确，缺少必要文件 (manifest.json 或 skillhub.sqlite)".to_string());
        }
        
        // 触发本地备份
        crate::db::backup_database(&db_path).map_err(|e| format!("导入前自动备份失败: {}", e))?;
        
        // 提取数据库覆盖当前文件
        let mut db_file = archive.by_name("skillhub.sqlite").map_err(|e| e.to_string())?;
        let mut target_file = File::create(&db_path).map_err(|e| format!("无法覆盖数据库文件: {}", e))?;
        use std::io::copy;
        copy(&mut db_file, &mut target_file).map_err(|e| format!("提取数据库文件失败: {}", e))?;
        
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("线程错误: {}", e))??;
    
    Ok(())
}
