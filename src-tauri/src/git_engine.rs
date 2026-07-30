use git2::{Repository, build::RepoBuilder, FetchOptions, RemoteCallbacks};
use std::path::Path;

pub fn clone_repository(url: &str, target_path: &Path) -> Result<(), String> {
    if target_path.exists() {
        return Err("Target directory already exists".into());
    }

    let output = std::process::Command::new("git")
        .arg("clone")
        .arg(url)
        .arg(target_path)
        .output()
        .map_err(|e| format!("无法执行 git clone 命令: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to clone repository: {}", stderr))
    }
}

pub fn pull_repository(repo_path: &Path) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .arg("pull")
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("无法执行 git 命令: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
    let stderr = String::from_utf8_lossy(&output.stderr).to_lowercase();

    if output.status.success() {
        if stdout.contains("already up to date") || stdout.contains("already up-to-date") || stdout.contains("已经是最新") {
            Ok("已是最新".to_string())
        } else {
            Ok("更新成功".to_string())
        }
    } else {
        Err(format!("拉取失败: {}", stderr))
    }
}

pub fn check_updates(repo_path: &Path) -> Result<bool, String> {
    let repo = Repository::open(repo_path).map_err(|e| format!("Failed to open repository: {}", e))?;
    let mut remote = repo.find_remote("origin").map_err(|e| format!("Failed to find remote 'origin': {}", e))?;
    
    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(|_url, _username_from_url, _allowed_types| {
        git2::Cred::default()
    });

    let mut fetch_options = FetchOptions::new();
    fetch_options.remote_callbacks(callbacks);

    remote.fetch(&["master", "main"], Some(&mut fetch_options), None).map_err(|e| format!("Failed to fetch: {}", e))?;
    
    let fetch_head = repo.find_reference("FETCH_HEAD").map_err(|e| format!("Failed to find FETCH_HEAD: {}", e))?;
    let fetch_commit = repo.reference_to_annotated_commit(&fetch_head).map_err(|e| format!("Failed to get fetch commit: {}", e))?;
    
    let head = repo.head().map_err(|e| format!("Failed to get HEAD: {}", e))?;
    let head_commit = head.peel_to_commit().map_err(|e| format!("Failed to peel head to commit: {}", e))?;
    
    let is_up_to_date = head_commit.id() == fetch_commit.id();
    
    Ok(!is_up_to_date)
}
