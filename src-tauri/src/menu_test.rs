use tauri::Manager;
use tauri::menu::{Menu, Submenu, MenuItem};

pub fn build_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::default(app)?;
    Ok(menu)
}
