const fs = require('fs');
const path = 'src-tauri/src/commands.rs';
let content = fs.readFileSync(path, 'utf8');

const importLocal = `
#[tauri::command]
pub async fn import_local_skills_to_workspace(
    app: tauri::AppHandle,
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
    app: tauri::AppHandle,
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
`;

const insertIndex = content.indexOf('fn sync_skills_to_db');
content = content.slice(0, insertIndex) + importLocal + '\n' + content.slice(insertIndex);
fs.writeFileSync(path, content, 'utf8');
