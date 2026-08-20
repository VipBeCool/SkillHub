use tauri::command;

#[command]
pub fn log_message(msg: String) {
    println!("FRONTEND LOG: {}", msg);
}
