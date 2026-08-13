pub mod db;
pub mod models;
pub mod commands;
pub mod scanner;
pub mod agents;
pub mod git_engine;
pub mod agent_sync;
pub mod menu;
pub mod export;

use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tokio::sync::oneshot;
use tauri::{Manager, Emitter};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton};
use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem};

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub clone_cancel_tokens: Arc<Mutex<HashMap<String, oneshot::Sender<()>>>>,
    pub selected_workspace_id: Mutex<Option<String>>,
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
                selected_workspace_id: Mutex::new(None),
            });
            
            // Build the initial app menu
            let _ = crate::menu::update_app_menu(app.handle());
            
            // Build the tray menu
            let quit_i = MenuItemBuilder::new("退出 SkillHub").id("quit").build(app)?;
            let show_i = MenuItemBuilder::new("显示 SkillHub").id("show").build(app)?;
            let prefs_i = MenuItemBuilder::new("偏好设置...").id("prefs").build(app)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let tray_menu = Menu::with_items(app, &[&prefs_i, &show_i, &separator, &quit_i])?;

            // Build the tray icon
            #[cfg(target_os = "macos")]
            let tray_icon_bytes = include_bytes!("../icons/tray_icon.png");
            #[cfg(not(target_os = "macos"))]
            let tray_icon_bytes = include_bytes!("../icons/32x32.png");
            
            let img = image::load_from_memory(tray_icon_bytes).expect("Failed to load tray icon");
            let rgba = img.to_rgba8();
            let width = img.width();
            let height = img.height();
            let tauri_image = tauri::image::Image::new_owned(rgba.into_raw(), width, height);

            let _tray = TrayIconBuilder::new()
                .icon(tauri_image)
                .icon_as_template(true)
                .menu(&tray_menu)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "quit" => {
                            app.exit(0);
                        }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "prefs" => {
                            // For now, just show the window, frontend can handle actual pref routing later
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.emit("open-preferences", ());
                            }
                        }
                        _ => {}
                    }
                })
                .build(app)?;
            
            Ok(())
        })
        .on_menu_event(|app, event| {
            // Emits an event to the frontend when a menu item is clicked
            let _ = app.emit("menu-action", event.id().0.as_str());
        })
        .invoke_handler(tauri::generate_handler![
            crate::menu::refresh_app_menu,
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
            commands::sync_repo_to_agent,
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
            commands::update_source_directory_path,
            commands::update_source_directories_order,
            commands::rename_source_directory,
            commands::remove_source_directory,
            commands::create_local_skill_library,
            commands::merge_skill_libraries,
            export::export_item,
            export::export_batch,
            export::check_exists
        ])
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
