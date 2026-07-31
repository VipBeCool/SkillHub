pub mod db;
pub mod models;
pub mod commands;
pub mod scanner;
pub mod agents;
pub mod git_engine;
pub mod agent_sync;

use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tokio::sync::oneshot;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub clone_cancel_tokens: Arc<Mutex<HashMap<String, oneshot::Sender<()>>>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");
            
            let db_path = app_data_dir.join("skillhub.sqlite");
            let conn = db::init_db(&db_path).expect("Failed to initialize database");
            
            app.manage(AppState {
                db: Mutex::new(conn),
                clone_cancel_tokens: Arc::new(Mutex::new(HashMap::new())),
            });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_skills,
            commands::get_source_directories,
            commands::get_repositories_with_skills,
            commands::update_skill_metadata,
            commands::add_source_directory,
            commands::scan_and_add_source_directory,
            commands::add_github_repository,
            commands::pull_repository,
            commands::rescan_directory,
            commands::get_skill_content,
            commands::save_skill_content,
            commands::get_agents,
            commands::add_agent,
            commands::delete_agent,
            commands::sync_skill,
            commands::unsync_skill,
            commands::get_sync_records_for_skill,
            commands::get_sync_records_for_agent,
            commands::get_git_repos_in_directory,
            commands::pull_single_repo,
            commands::get_git_remote_url,
            commands::delete_skill_by_path,
            commands::get_skill_files,
            commands::save_skill_file,
            commands::save_skill_file_by_path,
            commands::open_local_folder,
            commands::cancel_github_clone,
            commands::update_source_directory_icon,
            commands::update_source_directories_order,
            commands::rename_source_directory,
            commands::remove_source_directory,
            commands::create_local_skill_library,
            commands::merge_skill_libraries
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
