use std::path::PathBuf;
use std::fs;

/// Creates a symlink in the target_dir pointing to the source_path.
pub fn create_symlink(source_path: &str, target_dir: &str, link_name: &str) -> Result<String, String> {
    let source = PathBuf::from(source_path);
    if !source.exists() {
        return Err(format!("Source path does not exist: {}", source_path));
    }

    let target = PathBuf::from(target_dir);
    if !target.exists() {
        fs::create_dir_all(&target).map_err(|e| format!("Failed to create target directory: {}", e))?;
    }

    let safe_link_name = link_name.replace("/", "-");
    let symlink_path = target.join(safe_link_name);
    
    // If the symlink already exists, remove it first
    if symlink_path.exists() {
        let metadata = fs::symlink_metadata(&symlink_path).map_err(|e| e.to_string())?;
        if metadata.file_type().is_symlink() || metadata.is_dir() {
            fs::remove_dir_all(&symlink_path).or_else(|_| fs::remove_file(&symlink_path)).map_err(|e| e.to_string())?;
        } else {
            fs::remove_file(&symlink_path).map_err(|e| e.to_string())?;
        }
    }

    #[cfg(unix)]
    std::os::unix::fs::symlink(&source, &symlink_path).map_err(|e| format!("Failed to create symlink: {}", e))?;

    #[cfg(windows)]
    {
        if source.is_dir() {
            std::os::windows::fs::symlink_dir(&source, &symlink_path).map_err(|e| format!("Failed to create directory symlink: {}", e))?;
        } else {
            std::os::windows::fs::symlink_file(&source, &symlink_path).map_err(|e| format!("Failed to create file symlink: {}", e))?;
        }
    }

    Ok(symlink_path.to_string_lossy().to_string())
}

/// Removes a symlink at the given path.
pub fn remove_symlink(symlink_path: &str) -> Result<(), String> {
    let path = PathBuf::from(symlink_path);
    if !path.exists() {
        // Already removed or doesn't exist
        return Ok(());
    }

    let metadata = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
    if metadata.file_type().is_symlink() || metadata.is_dir() {
        fs::remove_dir_all(&path).or_else(|_| fs::remove_file(&path)).map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }

    Ok(())
}
