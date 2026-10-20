use git2::{Repository, FetchOptions, RemoteCallbacks};
use std::path::Path;
use tokio::process::Command;
use tokio::time::{timeout, Duration};
use tokio::io::AsyncReadExt;
use tauri::Emitter;

#[derive(Clone, serde::Serialize)]
pub struct CloneProgressPayload {
    pub target_dir: String,
    pub percent: Option<u32>,
    pub stage: String,
    pub message: String,
    pub raw_line: String,
}

pub fn format_git_error(raw_stderr: &str) -> String {
    let raw = raw_stderr.trim();
    let lower = raw.to_lowercase();
    if lower.contains("failed to connect") || lower.contains("connection timed out") || lower.contains("could not resolve host") {
        format!("连接 GitHub 超时，请检查网络或代理配置 (详细信息: {})", raw)
    } else if lower.contains("connection reset") || lower.contains("ssl_error") || lower.contains("openssl ssl_read") {
        format!("网络连接被重置，建议检查代理配置或稍后重试 (详细信息: {})", raw)
    } else if lower.contains("authentication failed") || lower.contains("could not read username") || lower.contains("terminal prompts disabled") {
        format!("身份认证失败，该仓库可能是私有仓库或需要访问凭据 (详细信息: {})", raw)
    } else if lower.contains("not found") || lower.contains("does not exist") {
        format!("仓库不存在或无权访问，请检查仓库链接是否正确 (详细信息: {})", raw)
    } else if lower.contains("already exists") {
        format!("本地目标目录已存在，请重命名或选择其他位置 (详细信息: {})", raw)
    } else if raw.is_empty() {
        "拉取失败，请检查网络或仓库地址".to_string()
    } else {
        format!("拉取失败: {}", raw)
    }
}

fn parse_git_progress(line: &str) -> (Option<u32>, String, String) {
    let trimmed = line.trim();
    if trimmed.starts_with("Receiving objects:") {
        let percent = extract_percent(trimmed);
        let pct_str = percent.map(|p| format!("{}%", p)).unwrap_or_default();
        (percent, "receiving".to_string(), if pct_str.is_empty() { "正在下载仓库文件...".to_string() } else { format!("正在下载文件 {}", pct_str) })
    } else if trimmed.starts_with("Resolving deltas:") {
        let percent = extract_percent(trimmed);
        let pct_str = percent.map(|p| format!("{}%", p)).unwrap_or_default();
        (percent, "resolving".to_string(), if pct_str.is_empty() { "正在解析文件差异...".to_string() } else { format!("正在解析差异 {}", pct_str) })
    } else if trimmed.starts_with("Compressing objects:") {
        let percent = extract_percent(trimmed);
        let pct_str = percent.map(|p| format!("{}%", p)).unwrap_or_default();
        (percent, "compressing".to_string(), if pct_str.is_empty() { "正在解压对象...".to_string() } else { format!("正在解压对象 {}", pct_str) })
    } else if trimmed.starts_with("Counting objects:") {
        let percent = extract_percent(trimmed);
        (percent, "counting".to_string(), "正在统计对象...".to_string())
    } else if trimmed.starts_with("Cloning into") {
        (Some(0), "cloning".to_string(), "正在准备克隆...".to_string())
    } else {
        (None, "running".to_string(), trimmed.to_string())
    }
}

fn extract_percent(line: &str) -> Option<u32> {
    if let Some(pos) = line.find('%') {
        let before = &line[..pos];
        if let Some(num_str) = before.split_whitespace().last() {
            return num_str.parse::<u32>().ok();
        }
    }
    None
}

pub async fn clone_repository(
    app: Option<&tauri::AppHandle>,
    url: &str,
    target_path: &Path,
) -> Result<(), String> {
    if target_path.exists() {
        return Err("目标文件夹已存在，请先删除旧目录。".into());
    }

    let target_dir_str = target_path.to_string_lossy().to_string();

    let mut cmd = Command::new("git");
    cmd.arg("clone")
        .arg("--progress")
        .arg(url)
        .arg(target_path)
        .env("GIT_TERMINAL_PROMPT", "0") // Prevent hanging on authentication
        .kill_on_drop(true)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    // 透传环境中的代理配置
    for key in &["https_proxy", "HTTPS_PROXY", "http_proxy", "HTTP_PROXY", "all_proxy", "ALL_PROXY"] {
        if let Ok(val) = std::env::var(key) {
            cmd.env(key, val);
        }
    }

    let mut child = cmd.spawn().map_err(|e| format!("无法执行 git clone 命令: {}", e))?;

    let stderr_reader = child.stderr.take();
    let app_handle = app.cloned();
    let target_dir_clone = target_dir_str.clone();

    // 异步流式读取 stderr，按 \r 或 \n 实时解析进度并广播
    let read_stderr_task = tokio::spawn(async move {
        let mut full_log = Vec::new();
        if let Some(mut reader) = stderr_reader {
            let mut buf = [0u8; 512];
            let mut line_buf = Vec::new();
            while let Ok(n) = reader.read(&mut buf).await {
                if n == 0 { break; }
                for &b in &buf[..n] {
                    if b == b'\r' || b == b'\n' {
                        if !line_buf.is_empty() {
                            if let Ok(line) = String::from_utf8(std::mem::take(&mut line_buf)) {
                                let trimmed = line.trim().to_string();
                                if !trimmed.is_empty() {
                                    let (percent, stage, message) = parse_git_progress(&trimmed);
                                    if let Some(ref a) = app_handle {
                                        let _ = a.emit("clone-progress", CloneProgressPayload {
                                            target_dir: target_dir_clone.clone(),
                                            percent,
                                            stage,
                                            message,
                                            raw_line: trimmed.clone(),
                                        });
                                    }
                                    full_log.push(trimmed);
                                }
                            }
                        }
                    } else {
                        line_buf.push(b);
                    }
                }
            }
            if !line_buf.is_empty() {
                if let Ok(line) = String::from_utf8(line_buf) {
                    let trimmed = line.trim().to_string();
                    if !trimmed.is_empty() {
                        full_log.push(trimmed);
                    }
                }
            }
        }
        full_log
    });

    match timeout(Duration::from_secs(180), child.wait()).await {
        Ok(Ok(status)) => {
            let logs = read_stderr_task.await.unwrap_or_default();
            if status.success() {
                if let Some(a) = app {
                    let _ = a.emit("clone-progress", CloneProgressPayload {
                        target_dir: target_dir_str,
                        percent: Some(100),
                        stage: "done".to_string(),
                        message: "拉取完成，正在解析技能...".to_string(),
                        raw_line: "Clone finished successfully.".to_string(),
                    });
                }
                Ok(())
            } else {
                let _ = std::fs::remove_dir_all(target_path);
                let err_msg = logs.join("\n");
                Err(format_git_error(&err_msg))
            }
        },
        Ok(Err(e)) => {
            let _ = std::fs::remove_dir_all(target_path);
            Err(format!("拉取命令执行出错: {}", e))
        },
        Err(_) => {
            let _ = std::fs::remove_dir_all(target_path);
            Err("拉取超时，已被取消。请检查网络连接状态。".into())
        }
    }
}


pub async fn pull_repository(repo_path: &Path) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.arg("pull")
        .current_dir(repo_path)
        .env("GIT_TERMINAL_PROMPT", "0") // Prevent hanging on authentication
        .kill_on_drop(true)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    // 透传环境中的代理配置
    for key in &["https_proxy", "HTTPS_PROXY", "http_proxy", "HTTP_PROXY", "all_proxy", "ALL_PROXY"] {
        if let Ok(val) = std::env::var(key) {
            cmd.env(key, val);
        }
    }

    let child = cmd.spawn().map_err(|e| format!("无法执行 git pull 命令: {}", e))?;

    match timeout(Duration::from_secs(60), child.wait_with_output()).await {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
            let stderr = String::from_utf8_lossy(&output.stderr);

            if output.status.success() {
                if stdout.contains("already up to date") || stdout.contains("already up-to-date") || stdout.contains("已经是最新") {
                    Ok("已是最新".to_string())
                } else {
                    Ok("更新成功".to_string())
                }
            } else {
                Err(format_git_error(&stderr))
            }
        },
        Ok(Err(e)) => Err(format!("同步命令执行出错: {}", e)),
        Err(_) => Err("同步超时，已被取消。请检查网络状态。".into()),
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
