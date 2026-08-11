use tauri::{AppHandle, Manager, Wry};
use tauri::menu::{Menu, SubmenuBuilder, MenuItemBuilder, PredefinedMenuItem, CheckMenuItemBuilder};
use crate::models::SourceDirectory;

pub fn update_app_menu(app: &AppHandle) -> tauri::Result<()> {
    // 1. Get directories from DB
    let state = app.state::<crate::AppState>();
    let db = state.db.lock().unwrap();
    let mut stmt = db.prepare("SELECT id, path, label, sort_order, icon FROM source_directories ORDER BY sort_order ASC").unwrap();
    let dir_iter = stmt.query_map([], |row| {
        Ok(SourceDirectory {
            id: row.get(0)?,
            path: row.get(1)?,
            label: row.get(2)?,
            sort_order: row.get(3)?,
            icon: row.get(4)?,
            // Providing defaults for the rest since they are not returned in the query
            source_type: "local".to_string(),
            is_default: false,
            is_protected: false,
            is_missing: false,
            added_at: "".to_string(),
        })
    }).unwrap();
    
    let mut dirs = Vec::new();
    for dir in dir_iter {
        if let Ok(d) = dir {
            dirs.push(d);
        }
    }
    
    // 2. Create "资源库" Submenu
    let mut library_submenu = SubmenuBuilder::new(app, "资源库")
        .item(&MenuItemBuilder::new("创建资源库...").id("create_library").build(app)?)
        .item(&MenuItemBuilder::new("打开其它资源库...").id("open_library").build(app)?)
        .separator();
    let selected_id = state.selected_workspace_id.lock().unwrap().clone();
    
    for dir in dirs {
        let is_selected = selected_id.as_ref() == Some(&dir.id);
        let icon_prefix = "📂 ";
        let parent_path = std::path::Path::new(&dir.path).parent().unwrap_or(std::path::Path::new(&dir.path)).to_string_lossy();
        let label = format!("{}{} ({})", icon_prefix, dir.label, parent_path);
        library_submenu = library_submenu.item(&CheckMenuItemBuilder::new(label)
            .id(format!("select_{}", dir.id))
            .checked(is_selected)
            .build(app)?);
    }
    
    library_submenu = library_submenu
        .separator()
        .item(&MenuItemBuilder::new("合并其它资源库...").id("merge_library").build(app)?);
        
    let library_submenu = library_submenu.build()?;
    
    // 3. Rebuild main menu with Chinese labels
    let mut menu_builder = tauri::menu::MenuBuilder::new(app);

    // App Submenu (macOS only)
    #[cfg(target_os = "macos")]
    {
        let app_submenu = SubmenuBuilder::new(app, "SkillHub")
            .item(&PredefinedMenuItem::about(app, None, None)?)
            .separator()
            .item(&PredefinedMenuItem::services(app, None)?)
            .separator()
            .item(&PredefinedMenuItem::hide(app, None)?)
            .item(&PredefinedMenuItem::hide_others(app, None)?)
            .item(&PredefinedMenuItem::show_all(app, None)?)
            .separator()
            .item(&PredefinedMenuItem::quit(app, Some("退出 SkillHub"))?)
            .build()?;
        menu_builder = menu_builder.item(&app_submenu);
    }

    // Insert custom Library menu
    menu_builder = menu_builder.item(&library_submenu);

    // File (文件)
    let file_submenu = SubmenuBuilder::new(app, "文件")
        .item(&PredefinedMenuItem::close_window(app, Some("关闭窗口"))?)
        .build()?;
    menu_builder = menu_builder.item(&file_submenu);

    // Edit (编辑)
    let edit_submenu = SubmenuBuilder::new(app, "编辑")
        .item(&PredefinedMenuItem::undo(app, Some("撤销"))?)
        .item(&PredefinedMenuItem::redo(app, Some("重做"))?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, Some("剪切"))?)
        .item(&PredefinedMenuItem::copy(app, Some("复制"))?)
        .item(&PredefinedMenuItem::paste(app, Some("粘贴"))?)
        .item(&PredefinedMenuItem::select_all(app, Some("全选"))?)
        .build()?;
    menu_builder = menu_builder.item(&edit_submenu);

    // View (视图)
    let view_submenu = SubmenuBuilder::new(app, "视图")
        .item(&PredefinedMenuItem::fullscreen(app, Some("进入全屏"))?)
        .build()?;
    menu_builder = menu_builder.item(&view_submenu);

    // Window (窗口)
    let window_submenu = SubmenuBuilder::new(app, "窗口")
        .item(&PredefinedMenuItem::minimize(app, Some("最小化"))?)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, Some("关闭"))?)
        .build()?;
    menu_builder = menu_builder.item(&window_submenu);

    // Help (帮助)
    let help_submenu = SubmenuBuilder::new(app, "帮助")
        .build()?;
    menu_builder = menu_builder.item(&help_submenu);

    let menu = menu_builder.build()?;
    app.set_menu(menu)?;

    Ok(())
}

#[tauri::command]
pub fn refresh_app_menu(app: tauri::AppHandle, selected_id: Option<String>) -> Result<(), String> {
    if let Some(id) = selected_id {
        let state = app.state::<crate::AppState>();
        *state.selected_workspace_id.lock().unwrap() = Some(id);
    }
    update_app_menu(&app).map_err(|e| e.to_string())
}
