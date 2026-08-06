use tauri::{AppHandle, Manager, Wry};
use tauri::menu::{Menu, SubmenuBuilder, MenuItemBuilder, PredefinedMenuItem};
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
        
    for dir in dirs {
        let label = format!("{} ({})", dir.label, dir.path);
        library_submenu = library_submenu.item(&MenuItemBuilder::new(label).id(format!("select_{}", dir.id)).build(app)?);
    }
    
    library_submenu = library_submenu
        .separator()
        .item(&MenuItemBuilder::new("清除历史记录").id("clear_history").build(app)?)
        .item(&MenuItemBuilder::new("清除缓存并重新加载").id("reload_cache").build(app)?)
        .separator()
        .item(&MenuItemBuilder::new("合并其它资源库...").id("merge_library").build(app)?);
        
    let library_submenu = library_submenu.build()?;
    
    // 3. Rebuild main menu
    // We get the default menu, and insert our library menu after the App menu (which is index 0 on macOS)
    let menu = Menu::default(app)?;
    
    // On macOS, index 0 is App name, index 1 is File. We can insert at index 1.
    #[cfg(target_os = "macos")]
    menu.insert(&library_submenu, 1)?;
    
    #[cfg(not(target_os = "macos"))]
    menu.insert(&library_submenu, 0)?;

    app.set_menu(menu)?;

    Ok(())
}

#[tauri::command]
pub fn refresh_app_menu(app: tauri::AppHandle) -> Result<(), String> {
    update_app_menu(&app).map_err(|e| e.to_string())
}
