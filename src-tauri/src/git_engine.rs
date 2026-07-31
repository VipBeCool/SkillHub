use git2::{Repository, build::RepoBuilder, FetchOptions, RemoteCallbacks};
use std::path::Path;
use tokio::process::Command;
use tokio::time::{timeout, Duration};

pub async fn clone_repository(url: &str, target_path: &Path) -> Result<(), String> {
    if target_path.exists() {
        return Err("目标文件夹已存在，请先删除旧目录。".into());
    }

    let mut child = Command::new("git")
        .arg("clone")
        .arg(url)
        .arg(target_path)
        .env("GIT_TERMINAL_PROMPT", "0") // Prevent hanging on authentication
        .kill_on_drop(true)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("无法执行 git clone 命令: {}", e))?;

    match timeout(Duration::from_secs(120), child.wait_with_output()).await {
        Ok(Ok(output)) => {
            if output.status.success() {
                Ok(())
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let _ = std::fs::remove_dir_all(target_path); // Cleanup on error
                Err(format!("拉取失败: {}", stderr))
            }
        },
        Ok(Err(e)) => {
            let _ = std::fs::remove_dir_all(target_path); // Cleanup on error
            Err(format!("拉取命令执行出错: {}", e))
        },
        Err(_) => {
            let _ = std::fs::remove_dir_all(target_path); // Cleanup on timeout
            Err("拉取超时，已被取消".into())
        }
    }
}

pub async fn pull_repository(repo_path: &Path) -> Result<String, String> {
    let mut child = Command::new("git")
        .arg("pull")
        .current_dir(repo_path)
        .env("GIT_TERMINAL_PROMPT", "0") // Prevent hanging on authentication
        .kill_on_drop(true)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("无法执行 git pull 命令: {}", e))?;

    match timeout(Duration::from_secs(60), child.wait_with_output()).await {
        Ok(Ok(output)) => {
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
        },
        Ok(Err(e)) => Err(format!("同步命令执行出错: {}", e)),
        Err(_) => Err("同步超时，已被取消".into()),
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
