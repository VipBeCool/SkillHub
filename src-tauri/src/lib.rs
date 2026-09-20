pub mod db;
pub mod models;
pub mod commands;
pub mod scanner;
pub mod agents;
pub mod git_engine;
pub mod agent_sync;
pub mod menu;
pub mod export;
pub mod prompt_commands;

use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tokio::sync::oneshot;
use tauri::{Manager, Emitter};
use tauri::tray::TrayIconBuilder;
#[cfg(not(target_os = "linux"))]
use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};
use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem};

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub clone_cancel_tokens: Arc<Mutex<HashMap<String, oneshot::Sender<()>>>>,
    pub selected_workspace_id: Mutex<Option<String>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // 仅在正式发布打包版（Release）中启用单实例互斥锁，防止多开导致 SQLite 冲突；
    // 本地开发调试阶段（Debug / npm run dev）不加锁，方便开发者同时开启本地版与安装版进行对比测试。
    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        #[cfg(target_os = "macos")]
        let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
        if let Some(tray_window) = app.get_webview_window("tray-panel") {
            let _ = tray_window.hide();
        }
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }));

    let app = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");
            
            let db_path = app_data_dir.join("skillhub.sqlite");
            
            // Backup the database before applying migrations or starting the app
            if let Err(e) = db::backup_database(&db_path) {
                eprintln!("Failed to backup database: {}", e);
            }
            
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

            #[cfg(not(target_os = "linux"))]
            let tray_builder = TrayIconBuilder::new()
                .icon(tauri_image)
                .icon_as_template(true)
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        rect: _rect,
                        ..
                    } = event {
                        let app = tray.app_handle();
                        if let Some(tray_window) = app.get_webview_window("tray-panel") {
                            let is_visible = tray_window.is_visible().unwrap_or(false);
                            if is_visible {
                                let _ = tray_window.hide();
                            } else {
                                #[cfg(target_os = "macos")]
                                {
                                    let _ = tray_window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(380.0, 520.0)));
                                    if let Ok(ns_win) = tray_window.ns_window() {
                                        unsafe {
                                            position_tray_window_macos(ns_win);
                                        }
                                    }
                                }

                                #[cfg(not(target_os = "macos"))]
                                {
                                    let fallback_sf = tray_window.scale_factor().unwrap_or(1.0);
                                    let cursor_pos = app.cursor_position().unwrap_or_else(|_| {
                                        _rect.position.to_physical(fallback_sf)
                                    });

                                    let target_monitor = app.monitor_from_point(cursor_pos.x, cursor_pos.y)
                                        .ok()
                                        .flatten()
                                        .or_else(|| tray_window.current_monitor().ok().flatten())
                                        .or_else(|| app.primary_monitor().ok().flatten());

                                    let (monitor_pos, monitor_size, monitor_scale) = if let Some(ref m) = target_monitor {
                                        (*m.position(), *m.size(), m.scale_factor())
                                    } else {
                                        (tauri::PhysicalPosition::new(0, 0), tauri::PhysicalSize::new(1920, 1080), fallback_sf)
                                    };

                                    let panel_phys_w = (380.0 * monitor_scale) as i32;
                                    let panel_phys_h = (520.0 * monitor_scale) as i32;

                                    let min_x = monitor_pos.x + (8.0 * monitor_scale) as i32;
                                    let max_x = monitor_pos.x + (monitor_size.width as i32) - panel_phys_w - (8.0 * monitor_scale) as i32;
                                    let target_x = ((cursor_pos.x as i32) - (panel_phys_w / 2)).clamp(min_x, max_x.max(min_x));

                                    let y = (cursor_pos.y as i32) - panel_phys_h + (4.0 * monitor_scale) as i32;
                                    let min_y = monitor_pos.y + (8.0 * monitor_scale) as i32;
                                    let target_y = y.max(min_y);

                                    let _ = tray_window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(panel_phys_w as u32, panel_phys_h as u32)));
                                    let _ = tray_window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(target_x, target_y)));
                                }

                                let _ = tray_window.show();
                                let _ = tray_window.set_focus();
                                let _ = tray_window.emit("tray-panel-shown", ());
                            }
                        }
                    }
                });

            #[cfg(target_os = "linux")]
            let tray_builder = TrayIconBuilder::new()
                .icon(tauri_image)
                .icon_as_template(true)
                .menu(&tray_menu);

            let _tray = tray_builder
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "quit" => {
                            app.exit(0);
                        }
                        "show" => {
                            #[cfg(target_os = "macos")]
                            let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
                            if let Some(tray_window) = app.get_webview_window("tray-panel") {
                                let _ = tray_window.hide();
                            }
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                        "prefs" => {
                            #[cfg(target_os = "macos")]
                            let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
                            if let Some(tray_window) = app.get_webview_window("tray-panel") {
                                let _ = tray_window.hide();
                            }
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                                let _ = window.emit("open-preferences", ());
                            }
                        }
                        _ => {}
                    }
                })
                .build(app)?;
            
            if let Some(tray_window) = app.get_webview_window("tray-panel") {
                let _ = tray_window.set_shadow(true);
            }
            
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
            commands::update_skill_tags,
            commands::increment_skill_use_count,
            commands::toggle_skill_favorite,
            commands::add_source_directory,
            commands::scan_and_add_source_directory,
            commands::validate_and_copy_dropped_folders,
            commands::import_skills_to_directory,
            commands::add_github_repository,
            commands::import_local_skills_to_workspace,
            commands::import_github_skills_to_workspace,
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
            commands::open_email,
            commands::reveal_in_finder,
            commands::get_open_with_apps,
            commands::open_with_app,
            commands::cancel_github_clone,
            commands::update_source_directory_icon,
            commands::update_source_directory_path,
            commands::update_source_directories_order,
            commands::rename_source_directory,
            commands::remove_source_directory,
            commands::create_local_skill_library,
            commands::merge_skill_libraries,
            commands::translate_text,
            commands::get_skill_token_count,
            export::export_item,
            export::export_batch,
            export::check_exists,
            prompt_commands::get_prompt_groups,
            prompt_commands::create_prompt_group,
            prompt_commands::update_prompt_group,
            prompt_commands::delete_prompt_group,
            prompt_commands::reorder_prompt_groups,
            prompt_commands::get_prompts,
            prompt_commands::create_prompt,
            prompt_commands::update_prompt,
            prompt_commands::delete_prompts,
            prompt_commands::toggle_prompt_favorite,
            prompt_commands::increment_prompt_use_count,
            prompt_commands::move_prompts_to_group,
            prompt_commands::get_prompt_versions,
            prompt_commands::rollback_prompt_version,
            prompt_commands::export_prompts,
            prompt_commands::restore_prompts,
            prompt_commands::hard_delete_prompts,
            prompt_commands::empty_trash,
            prompt_commands::cleanup_expired_trash,
            commands::generate_skill_reference_prompt,
            commands::add_online_skill,
            commands::update_skill_tags,
            commands::show_main_window,
            commands::hide_tray_panel,
            commands::open_preferences,
            commands::exit_app,
            commands::export_database,
            commands::import_database
        ])
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                if window.label() == "main" {
                    // macOS 和 Windows 下保持隐藏常驻后台；
                    // Linux（尤其是 GNOME）默认无托盘区域，为避免应用失联假死，直接退出
                    #[cfg(target_os = "macos")]
                    {
                        api.prevent_close();
                        let _ = window.hide();
                        let _ = window.app_handle().set_activation_policy(tauri::ActivationPolicy::Accessory);
                    }
                    #[cfg(target_os = "windows")]
                    {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
            }
            tauri::WindowEvent::Focused(focused) => {
                if !focused && window.label() == "tray-panel" {
                    let _ = window.hide();
                }
            }
            _ => {}
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen { has_visible_windows, .. } => {
            if !has_visible_windows {
                let _ = app_handle.set_activation_policy(tauri::ActivationPolicy::Regular);
                if let Some(tray_window) = app_handle.get_webview_window("tray-panel") {
                    let _ = tray_window.hide();
                }
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        }
        _ => {}
    });
}

#[cfg(target_os = "macos")]
unsafe fn position_tray_window_macos(window: *mut std::ffi::c_void) {
    use objc2_app_kit::{NSEvent, NSScreen, NSWindow};
    use objc2_foundation::{NSPoint, NSRect};
    use objc2::MainThreadMarker;

    let mouse_loc = NSEvent::mouseLocation();
    let mtm = MainThreadMarker::new_unchecked();
    let screens = NSScreen::screens(mtm);

    let mut screen_frame = NSRect::ZERO;
    let mut found = false;

    for screen in screens.iter() {
        let f = screen.frame();
        if mouse_loc.x >= f.origin.x && mouse_loc.x <= f.origin.x + f.size.width
            && mouse_loc.y >= f.origin.y && mouse_loc.y <= f.origin.y + f.size.height {
            screen_frame = f;
            found = true;
            break;
        }
    }

    if !found {
        if let Some(first) = screens.iter().next() {
            screen_frame = first.frame();
        }
    }

    // 浮窗面板逻辑点尺寸：宽 380 点，高 520 点
    let panel_w = 380.0;

    // 水平位置：以鼠标位置为中心居中，限制在目标屏幕可视区域内
    let min_x = screen_frame.origin.x + 8.0;
    let max_x = screen_frame.origin.x + screen_frame.size.width - panel_w - 8.0;
    let target_x = (mouse_loc.x - panel_w / 2.0).clamp(min_x, max_x.max(min_x));

    // 垂直位置：当前屏幕菜单栏底边下方
    // screen_frame.origin.y + screen_frame.size.height 为当前屏幕的最顶端
    // 菜单栏高度约为 25 点，距离菜单栏底边缘下方 4px
    let screen_top = screen_frame.origin.y + screen_frame.size.height;
    let target_top_y = screen_top - 25.0 - 4.0;

    let target_pt = NSPoint::new(target_x, target_top_y);
    let ns_win = &*(window as *mut NSWindow);
    ns_win.setHasShadow(true);
    ns_win.invalidateShadow();
    ns_win.setFrameTopLeftPoint(target_pt);
}

#[cfg(test)]
#[cfg(target_os = "macos")]
mod tests {
    use objc2_app_kit::{NSEvent, NSScreen};
    use objc2::MainThreadMarker;

    #[test]
    fn test_objc2_screens() {
        let mouse_loc = NSEvent::mouseLocation();
        let mtm = unsafe { MainThreadMarker::new_unchecked() };
        let screens = NSScreen::screens(mtm);
        assert!(!screens.is_empty());
        println!("==> Tested AppKit screen detection successfully. Mouse: {:?}, Screens count: {}", mouse_loc, screens.len());

        let _test_shadow = |win: &objc2_app_kit::NSWindow| {
            win.setHasShadow(true);
            win.invalidateShadow();
        };
    }
}


