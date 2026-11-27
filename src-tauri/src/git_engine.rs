use git2::{Repository, FetchOptions, RemoteCallbacks};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::{Arc, Mutex as StdMutex, OnceLock};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;
use tokio::process::Command;
use tokio::sync::{Mutex as AsyncMutex, OwnedMutexGuard};
use tokio::time::{timeout, Duration};
use tokio::io::AsyncReadExt;
use tauri::Emitter;

/// 按本地目录路径分配的异步互斥锁表，防止同一仓库/技能目录并发执行 pull 或覆盖写入引发冲突
static REPO_OP_LOCKS: OnceLock<StdMutex<HashMap<String, Arc<AsyncMutex<()>>>>> = OnceLock::new();

/// 获取指定仓库/技能目录的独占操作锁（跨 `.await` 安全）
pub(crate) async fn acquire_repo_op_lock(path: &Path) -> OwnedMutexGuard<()> {
    let key = path
        .to_string_lossy()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_lowercase();
    let lock = {
        let map_mutex = REPO_OP_LOCKS.get_or_init(|| StdMutex::new(HashMap::new()));
        let mut map = map_mutex.lock().unwrap();
        map.entry(key)
            .or_insert_with(|| Arc::new(AsyncMutex::new(())))
            .clone()
    };
    lock.lock_owned().await
}

/// 判断 Git 克隆错误是否发生在已经开始传输对象数据流之后（避免流中断后再回退 ZIP 造成双倍流量）
pub(crate) fn is_git_clone_mid_stream_error(raw: &str) -> bool {
    let lower = raw.to_lowercase();
    lower.contains("receiving objects:")
        || lower.contains("resolving deltas:")
        || lower.contains("early eof")
        || lower.contains("unexpected disconnect")
        || lower.contains("下载数据流超时")
}

/// 检测本机是否安装可用的 `git` 命令行工具（进程级缓存，仅检测一次）
static GIT_CLI_AVAILABLE: OnceLock<bool> = OnceLock::new();

fn is_git_cli_available() -> bool {
    *GIT_CLI_AVAILABLE.get_or_init(|| {
        let mut cmd = std::process::Command::new("git");
        cmd.arg("--version");
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        cmd.output().map(|o| o.status.success()).unwrap_or(false)
    })
}

/// 判断 Git 错误是否属于明确的“非网络故障”（如仓库不存在、私有认证失败、本地冲突等）
/// 命中后应立即终止后续直连/镜像/ZIP 降级重试，避免浪费时间与流量
pub(crate) fn is_non_retryable_git_error(raw: &str) -> bool {
    let lower = raw.to_lowercase();
    lower.contains("repository not found")
        || lower.contains("not found")
        || lower.contains("does not exist")
        || lower.contains("http 404")
        || lower.contains("returned error: 404")
        || lower.contains("authentication failed")
        || lower.contains("could not read username")
        || lower.contains("terminal prompts disabled")
        || lower.contains("permission denied")
        || lower.contains("returned error: 401")
        || lower.contains("returned error: 403")
        || lower.contains("would be overwritten by merge")
        || lower.contains("would be overwritten by checkout")
        || lower.contains("unmerged files")
        || lower.contains("divergent branches")
        || lower.contains("not possible to fast-forward")
        || lower.contains("remote branch") && lower.contains("not found in upstream")
}

/// 经过实测在无 VPN 中国大陆环境下稳定可用的 GitHub 加速镜像前缀（支持 Git Smart-HTTP 与 ZIP archive）
const GITHUB_MIRROR_PREFIXES: &[(&str, &str)] = &[
    ("gh-proxy.com", "https://gh-proxy.com/https://github.com"),
    ("ghfast.top", "https://ghfast.top/https://github.com"),
    ("ghproxy.net", "https://ghproxy.net/https://github.com"),
];

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
    if lower.contains("authentication failed") || lower.contains("could not read username") || lower.contains("terminal prompts disabled") {
        format!("身份认证失败，该仓库可能是私有仓库或需要访问凭据 (详细信息: {})", raw)
    } else if lower.contains("not found") || lower.contains("does not exist") || lower.contains("http 404") {
        format!("仓库不存在或无权访问，请检查仓库链接是否正确 (详细信息: {})", raw)
    } else if lower.contains("already exists") {
        format!("本地目标目录已存在，请重命名或选择其他位置 (详细信息: {})", raw)
    } else if lower.contains("failed to connect") || lower.contains("connection timed out") || lower.contains("could not resolve host") || lower.contains("http2 framing layer") {
        format!("连接 GitHub 失败（已尝试代理、直连及源码包备用通道），请检查网络或代理设置 (详细信息: {})", raw)
    } else if lower.contains("connection reset") || lower.contains("ssl_error") || lower.contains("openssl ssl_read") {
        format!("网络连接被重置，建议检查代理配置或稍后重试 (详细信息: {})", raw)
    } else if raw.is_empty() {
        "拉取失败，请检查网络或仓库地址".to_string()
    } else {
        format!("拉取失败: {}", raw)
    }
}

fn emit_progress(
    app: Option<&tauri::AppHandle>,
    target_dir: &str,
    percent: Option<u32>,
    stage: &str,
    message: &str,
    raw_line: &str,
) {
    if let Some(a) = app {
        let _ = a.emit("clone-progress", CloneProgressPayload {
            target_dir: target_dir.to_string(),
            percent,
            stage: stage.to_string(),
            message: message.to_string(),
            raw_line: raw_line.to_string(),
        });
    }
}

/// 校验本地代理端口是否真正在监听，防止用户关闭代理软件后残留死代理配置导致连接被拒
fn is_proxy_reachable(proxy_url: &str) -> bool {
    let stripped = proxy_url
        .trim()
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .trim_start_matches("socks5h://")
        .trim_start_matches("socks5://")
        .trim_end_matches('/');

    // 如果包含认证信息 user:pass@host:port，取 @ 之后的部分
    let host_port = stripped.rsplit('@').next().unwrap_or(stripped);

    // 仅对本机回环代理做快速 TCP 探测；远端企业代理直接放行
    if !host_port.starts_with("127.0.0.1:") && !host_port.starts_with("localhost:") {
        return true;
    }

    if let Ok(mut addrs) = host_port.to_socket_addrs() {
        if let Some(addr) = addrs.next() {
            return TcpStream::connect_timeout(&addr, std::time::Duration::from_millis(200)).is_ok();
        }
    }
    false
}

/// 系统代理探测结果短期缓存（10 秒 TTL），避免高并发拉取时反复拉起 scutil / reg / git 子进程
static SYSTEM_PROXY_CACHE: OnceLock<StdMutex<Option<(Instant, Option<String>)>>> = OnceLock::new();

/// 跨平台探测当前系统代理（兼容 Clash Verge / Surge / V2Ray / 系统网络设置 / 环境变量 / Git 配置）
pub fn detect_system_proxy() -> Option<String> {
    let cache = SYSTEM_PROXY_CACHE.get_or_init(|| StdMutex::new(None));
    if let Ok(guard) = cache.lock() {
        if let Some((ts, ref cached)) = *guard {
            if ts.elapsed() < std::time::Duration::from_secs(10) {
                return cached.clone();
            }
        }
    }

    let detected = detect_system_proxy_uncached();
    if let Ok(mut guard) = cache.lock() {
        *guard = Some((Instant::now(), detected.clone()));
    }
    detected
}

fn detect_system_proxy_uncached() -> Option<String> {
    // 1. 优先检查进程环境变量
    for key in &["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"] {
        if let Ok(val) = std::env::var(key) {
            let trimmed = val.trim();
            if !trimmed.is_empty() && is_proxy_reachable(trimmed) {
                return Some(trimmed.to_string());
            }
        }
    }

    // 2. macOS: 通过 `scutil --proxy` 读取系统偏好设置中的活动代理（GUI 桌面应用默认无终端环境变量）
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("scutil").arg("--proxy").output() {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                let mut https_enable = false;
                let mut https_host = String::new();
                let mut https_port = String::new();

                let mut http_enable = false;
                let mut http_host = String::new();
                let mut http_port = String::new();

                let mut socks_enable = false;
                let mut socks_host = String::new();
                let mut socks_port = String::new();

                for line in text.lines() {
                    let parts: Vec<&str> = line.split(':').map(|s| s.trim()).collect();
                    if parts.len() >= 2 {
                        match parts[0] {
                            "HTTPSEnable" => https_enable = parts[1] == "1",
                            "HTTPSProxy" => https_host = parts[1].to_string(),
                            "HTTPSPort" => https_port = parts[1].to_string(),
                            "HTTPEnable" => http_enable = parts[1] == "1",
                            "HTTPProxy" => http_host = parts[1].to_string(),
                            "HTTPPort" => http_port = parts[1].to_string(),
                            "SOCKSEnable" => socks_enable = parts[1] == "1",
                            "SOCKSProxy" => socks_host = parts[1].to_string(),
                            "SOCKSPort" => socks_port = parts[1].to_string(),
                            _ => {}
                        }
                    }
                }

                if https_enable && !https_host.is_empty() && !https_port.is_empty() {
                    let candidate = format!("http://{}:{}", https_host, https_port);
                    if is_proxy_reachable(&candidate) {
                        return Some(candidate);
                    }
                }
                if http_enable && !http_host.is_empty() && !http_port.is_empty() {
                    let candidate = format!("http://{}:{}", http_host, http_port);
                    if is_proxy_reachable(&candidate) {
                        return Some(candidate);
                    }
                }
                if socks_enable && !socks_host.is_empty() && !socks_port.is_empty() {
                    // 大多数混合端口代理（如 Clash 7890/7897）同时支持 HTTP CONNECT，先探测端口存活
                    let candidate = format!("http://{}:{}", socks_host, socks_port);
                    if is_proxy_reachable(&candidate) {
                        return Some(candidate);
                    }
                }
            }
        }
    }

    // 3. Windows: 读取注册表 Internet Settings 系统代理配置
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        if let Ok(output) = std::process::Command::new("reg")
            .args(["query", r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                let mut proxy_enabled = false;
                let mut proxy_server = String::new();
                for line in text.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with("ProxyEnable") && trimmed.ends_with("0x1") {
                        proxy_enabled = true;
                    } else if trimmed.starts_with("ProxyServer") {
                        if let Some(val) = trimmed.split_whitespace().last() {
                            proxy_server = val.to_string();
                        }
                    }
                }
                if proxy_enabled && !proxy_server.is_empty() {
                    // 处理可能形如 "http=127.0.0.1:7890;https=127.0.0.1:7890"、"socks=127.0.0.1:1080" 或 "127.0.0.1:7890"
                    let mut extracted: Option<(&str, &str)> = None;
                    for part in proxy_server.split(';') {
                        let p = part.trim();
                        if let Some(rest) = p.strip_prefix("https=") {
                            extracted = Some(("http", rest.trim()));
                            break;
                        } else if let Some(rest) = p.strip_prefix("http=") {
                            extracted = Some(("http", rest.trim()));
                        } else if let Some(rest) = p.strip_prefix("socks=") {
                            if extracted.is_none() {
                                extracted = Some(("socks5h", rest.trim()));
                            }
                        }
                    }
                    let (scheme, raw_addr) = extracted.unwrap_or(("http", proxy_server.trim()));
                    let candidate = if raw_addr.starts_with("http://")
                        || raw_addr.starts_with("https://")
                        || raw_addr.starts_with("socks5://")
                        || raw_addr.starts_with("socks5h://")
                    {
                        raw_addr.to_string()
                    } else {
                        format!("{}://{}", scheme, raw_addr)
                    };
                    if is_proxy_reachable(&candidate) {
                        return Some(candidate);
                    }
                }
            }
        }
    }

    // 4. 兜底检查用户的 git 全局代理配置
    for key in &["https.proxy", "http.proxy"] {
        let mut cmd = std::process::Command::new("git");
        cmd.args(["config", "--global", "--get", key]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        if let Ok(output) = cmd.output() {
            if output.status.success() {
                let val = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !val.is_empty() && is_proxy_reachable(&val) {
                    return Some(val);
                }
            }
        }
    }

    None
}

/// 解析 GitHub URL，提取 (owner, repo, branch_opt, normalized_https_git_url)
pub fn parse_github_repo_info(url: &str) -> Option<(String, String, Option<String>, String)> {
    let trimmed = url.trim().trim_end_matches('/');

    let path_part = if let Some(rest) = trimmed.strip_prefix("git@github.com:") {
        rest
    } else if let Some(idx) = trimmed.find("github.com/") {
        &trimmed[idx + "github.com/".len()..]
    } else {
        return None;
    };

    let segments: Vec<&str> = path_part.split('/').filter(|s| !s.is_empty()).collect();
    if segments.len() < 2 {
        return None;
    }

    let owner = segments[0].to_string();
    let repo = segments[1].trim_end_matches(".git").to_string();
    if owner.is_empty() || repo.is_empty() {
        return None;
    }

    let branch_opt = if segments.len() >= 4 && (segments[2] == "tree" || segments[2] == "blob") {
        Some(segments[3].to_string())
    } else {
        None
    };

    let normalized_git_url = format!("https://github.com/{}/{}.git", owner, repo);
    Some((owner, repo, branch_opt, normalized_git_url))
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
        (Some(5), "cloning".to_string(), "正在准备克隆...".to_string())
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

/// 单次 Git Clone 尝试（支持指定代理或强制无代理直连，统一使用 HTTP/1.1 + 浅克隆防断流）
async fn run_git_clone_attempt(
    app: Option<&tauri::AppHandle>,
    url: &str,
    branch: Option<&str>,
    target_path: &Path,
    proxy: Option<&str>,
    connect_timeout_secs: u64,
    total_timeout_secs: u64,
) -> Result<(), String> {
    let _ = std::fs::remove_dir_all(target_path);
    let target_dir_str = target_path.to_string_lossy().to_string();

    let mut cmd = Command::new("git");
    // 核心优化：
    // 1. 强制 HTTP/1.1，解决 Clash Verge / Antify / Surge 等代理下的 `Error in the HTTP2 framing layer`
    // 2. 缩短连接超时与低速检测时间，告别默认 75 秒盲等
    // 3. 增大 postBuffer 防止大包中断
    cmd.arg("-c").arg("http.version=HTTP/1.1")
        .arg("-c").arg("http.postBuffer=524288000")
        .arg("-c").arg(format!("http.connectTimeout={}", connect_timeout_secs))
        .arg("-c").arg("http.lowSpeedLimit=1000")
        .arg("-c").arg("http.lowSpeedTime=15");

    if let Some(p) = proxy {
        cmd.arg("-c").arg(format!("http.proxy={}", p))
            .arg("-c").arg(format!("https.proxy={}", p))
            .env("http_proxy", p)
            .env("https_proxy", p)
            .env("HTTP_PROXY", p)
            .env("HTTPS_PROXY", p)
            .env("all_proxy", p)
            .env("ALL_PROXY", p);
    } else {
        // 强制直连（或交由 TUN / Antify 透明网卡接管，排除错误的代理环境变量干扰）
        cmd.arg("-c").arg("http.proxy=")
            .arg("-c").arg("https.proxy=");
        for key in &["https_proxy", "HTTPS_PROXY", "http_proxy", "HTTP_PROXY", "all_proxy", "ALL_PROXY"] {
            cmd.env_remove(key);
        }
    }

    cmd.arg("clone")
        .arg("--depth").arg("1")
        .arg("--single-branch")
        .arg("--progress");

    if let Some(b) = branch {
        cmd.arg("--branch").arg(b);
    }

    cmd.arg(url)
        .arg(target_path)
        .env("GIT_TERMINAL_PROMPT", "0")
        .kill_on_drop(true)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000);
    }

    let mut child = cmd.spawn().map_err(|e| format!("无法启动 git 进程: {}", e))?;

    let stderr_reader = child.stderr.take();
    let app_handle = app.cloned();
    let target_dir_clone = target_dir_str.clone();
    let received_objects_flag = Arc::new(AtomicBool::new(false));
    let received_objects_writer = received_objects_flag.clone();

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
                                    if trimmed.starts_with("Receiving objects:") || trimmed.starts_with("Resolving deltas:") {
                                        received_objects_writer.store(true, Ordering::Relaxed);
                                    }
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
                        if trimmed.starts_with("Receiving objects:") || trimmed.starts_with("Resolving deltas:") {
                            received_objects_writer.store(true, Ordering::Relaxed);
                        }
                        full_log.push(trimmed);
                    }
                }
            }
        }
        full_log
    });

    match timeout(Duration::from_secs(total_timeout_secs), child.wait()).await {
        Ok(Ok(status)) => {
            let logs = read_stderr_task.await.unwrap_or_default();
            if status.success() {
                Ok(())
            } else {
                let _ = std::fs::remove_dir_all(target_path);
                Err(logs.join("\n"))
            }
        }
        Ok(Err(e)) => {
            let _ = std::fs::remove_dir_all(target_path);
            Err(format!("git 进程执行出错: {}", e))
        }
        Err(_) => {
            let _ = std::fs::remove_dir_all(target_path);
            if received_objects_flag.load(Ordering::Relaxed) {
                Err("git clone 下载数据流超时".to_string())
            } else {
                Err("git clone 阶段连接超时".to_string())
            }
        }
    }
}

/// 为通过 ZIP 解压的仓库写入最小化 `.git` 元数据，确保 SkillHub 识别其为 GitHub 仓库并支持作者解析、网页跳转与后续更新
fn ensure_git_metadata(target_path: &Path, normalized_git_url: &str, branch: Option<&str>) {
    let git_dir = target_path.join(".git");
    if git_dir.join("config").exists() {
        return;
    }
    if std::fs::create_dir_all(&git_dir).is_ok() {
        let head_branch = branch.unwrap_or("main");
        let _ = std::fs::write(
            git_dir.join("HEAD"),
            format!("ref: refs/heads/{}\n", head_branch),
        );
        let config_content = format!(
            "[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n\tlogallrefupdates = true\n[remote \"origin\"]\n\turl = {}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n",
            normalized_git_url
        );
        let _ = std::fs::write(git_dir.join("config"), config_content);
    }
}

/// 通过镜像 URL 完成 Git 克隆后，将 `.git/config` 中的 `remote.origin.url` 还原为标准官方地址
fn set_git_remote_origin(target_path: &Path, clean_url: &str) {
    let mut cmd = std::process::Command::new("git");
    cmd.current_dir(target_path)
        .args(["remote", "set-url", "origin", clean_url]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    if let Ok(status) = cmd.status() {
        if status.success() {
            return;
        }
    }

    // 兜底直接替换 .git/config 中的 url 行
    let config_path = target_path.join(".git").join("config");
    if let Ok(content) = std::fs::read_to_string(&config_path) {
        let mut updated = Vec::new();
        let mut replaced = false;
        for line in content.lines() {
            if !replaced && line.trim_start().starts_with("url = ") {
                updated.push(format!("\turl = {}", clean_url));
                replaced = true;
            } else {
                updated.push(line.to_string());
            }
        }
        if replaced {
            let _ = std::fs::write(&config_path, format!("{}\n", updated.join("\n")));
        }
    }
}

/// 解压 GitHub 源码 ZIP 字节流到目标目录（自动剥离顶层 `<repo>-<sha>/` 目录）
fn extract_github_zip_bytes(zip_bytes: Vec<u8>, target_path: &Path) -> Result<(), String> {
    use std::io::{Cursor, Read, Write};

    let reader = Cursor::new(zip_bytes);
    let mut archive = zip::ZipArchive::new(reader).map_err(|e| format!("无法解析源码 ZIP 压缩包: {}", e))?;

    if archive.is_empty() {
        return Err("下载的源码 ZIP 压缩包为空".to_string());
    }

    std::fs::create_dir_all(target_path).map_err(|e| format!("无法创建目标文件夹: {}", e))?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let enclosed_path = match file.enclosed_name() {
            Some(p) => p.to_owned(),
            None => continue,
        };

        // 剥离 ZIP 内的顶层文件夹（例如 `ppt-builder-main/...` -> `...`）
        let mut components = enclosed_path.components();
        let _top_dir = components.next();
        let rel_path: PathBuf = components.collect();

        if rel_path.as_os_str().is_empty() {
            continue;
        }

        // 跳过 macOS 归档元数据噪音
        if rel_path.to_string_lossy().contains("__MACOSX") {
            continue;
        }

        let out_path = target_path.join(&rel_path);

        if file.is_dir() {
            std::fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut out_file = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
            let mut buffer = Vec::new();
            file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
            out_file.write_all(&buffer).map_err(|e| e.to_string())?;

            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Some(mode) = file.unix_mode() {
                    let _ = std::fs::set_permissions(&out_path, std::fs::Permissions::from_mode(mode));
                }
            }
        }
    }

    Ok(())
}

/// ZIP 降级仓库的版本校验元数据文件名（保存在 `<repo>/.git/.skillhub_zip_meta.json`）
const ZIP_META_FILENAME: &str = ".skillhub_zip_meta.json";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct ZipSyncMeta {
    etag: Option<String>,
    commit_sha: Option<String>,
    branch: Option<String>,
    updated_at: String,
}

fn read_zip_sync_meta(repo_path: &Path) -> Option<ZipSyncMeta> {
    let p = repo_path.join(".git").join(ZIP_META_FILENAME);
    let content = std::fs::read_to_string(p).ok()?;
    serde_json::from_str(&content).ok()
}

fn write_zip_sync_meta(repo_path: &Path, meta: &ZipSyncMeta) {
    let git_dir = repo_path.join(".git");
    if std::fs::create_dir_all(&git_dir).is_ok() {
        if let Ok(json) = serde_json::to_string_pretty(meta) {
            let _ = std::fs::write(git_dir.join(ZIP_META_FILENAME), json);
        }
    }
}

/// 解析 Git Smart-HTTP `info/refs?service=git-upload-pack` 响应中的目标分支或 HEAD 的 40 位 Commit SHA
/// 该接口仅几百字节，且不受 GitHub REST API 60次/小时 限额约束
fn parse_git_info_refs_head_sha(body: &str, branch: Option<&str>) -> Option<String> {
    let target_ref = branch
        .map(|b| b.trim())
        .filter(|b| !b.is_empty())
        .map(|b| format!("refs/heads/{}", b));

    let mut head_sha: Option<String> = None;
    let mut branch_sha: Option<String> = None;

    for raw_line in body.lines() {
        // 剥离 pkt-line 4 位十六进制长度前缀（如 "003f<sha> refs/heads/main" 或 "00000159<sha> HEAD\0..."）
        let mut line = raw_line.trim();
        while line.len() >= 4 && line.as_bytes()[0..4].iter().all(|b| b.is_ascii_hexdigit()) {
            // 如果前 40 位本身已经是 SHA + 空格，则不再剥离
            if line.len() > 41
                && line.as_bytes()[40] == b' '
                && line.as_bytes()[0..40].iter().all(|b| b.is_ascii_hexdigit())
            {
                break;
            }
            line = &line[4..];
        }

        if line.len() < 42 || line.as_bytes()[40] != b' ' {
            continue;
        }
        let sha_part = &line[0..40];
        if !sha_part.as_bytes().iter().all(|b| b.is_ascii_hexdigit()) {
            continue;
        }
        let rest = &line[41..];
        // HEAD 行后面通常带有 `\0` 能力列表，只取 ref 名称部分
        let ref_name = rest.split(['\0', ' ']).next().unwrap_or("").trim();

        if ref_name == "HEAD" && head_sha.is_none() {
            head_sha = Some(sha_part.to_lowercase());
        }
        if let Some(ref want) = target_ref {
            if ref_name == want {
                branch_sha = Some(sha_part.to_lowercase());
                break;
            }
        }
    }

    branch_sha.or(head_sha)
}

/// 极轻量获取远端 GitHub 仓库当前 HEAD / 指定分支的 Commit SHA（仅 ~500 字节，零 ZIP 流量、零 GitHub API 配额）
pub(crate) async fn fetch_remote_head_sha(
    owner: &str,
    repo: &str,
    branch: Option<&str>,
    system_proxy: Option<&str>,
) -> Option<String> {
    let official_url = format!(
        "https://github.com/{}/{}.git/info/refs?service=git-upload-pack",
        owner, repo
    );
    let mirror_urls: Vec<String> = GITHUB_MIRROR_PREFIXES
        .iter()
        .map(|(_, prefix)| {
            format!("{}/{}/{}.git/info/refs?service=git-upload-pack", prefix, owner, repo)
        })
        .collect();

    let direct_client = reqwest::Client::builder()
        .http1_only()
        .no_proxy()
        .connect_timeout(Duration::from_secs(4))
        .timeout(Duration::from_secs(10))
        .user_agent("git/2.43.0")
        .build()
        .ok()?;

    // 1. 有系统代理时优先经代理检查（仅几百字节）
    if let Some(proxy_str) = system_proxy {
        if let Ok(proxy) = reqwest::Proxy::all(proxy_str) {
            if let Ok(proxy_client) = reqwest::Client::builder()
                .http1_only()
                .proxy(proxy)
                .connect_timeout(Duration::from_secs(6))
                .timeout(Duration::from_secs(10))
                .user_agent("git/2.43.0")
                .build()
            {
                if let Ok(resp) = proxy_client.get(&official_url).send().await {
                    if resp.status().is_success() {
                        if let Ok(text) = resp.text().await {
                            if let Some(sha) = parse_git_info_refs_head_sha(&text, branch) {
                                return Some(sha);
                            }
                        }
                    }
                }
            }
        }
        // 代理失败尝试快速直连
        if let Ok(resp) = direct_client.get(&official_url).send().await {
            if resp.status().is_success() {
                if let Ok(text) = resp.text().await {
                    if let Some(sha) = parse_git_info_refs_head_sha(&text, branch) {
                        return Some(sha);
                    }
                }
            }
        }
    }

    // 2. 尝试国内镜像（无代理环境首选，有代理环境兜底）
    for mirror_url in &mirror_urls {
        if let Ok(resp) = direct_client.get(mirror_url).send().await {
            if resp.status().is_success() {
                if let Ok(text) = resp.text().await {
                    if let Some(sha) = parse_git_info_refs_head_sha(&text, branch) {
                        return Some(sha);
                    }
                }
            }
        }
    }

    // 3. 无代理且镜像都失败时最后尝试直连官方
    if system_proxy.is_none() {
        if let Ok(resp) = direct_client.get(&official_url).send().await {
            if resp.status().is_success() {
                if let Ok(text) = resp.text().await {
                    if let Some(sha) = parse_git_info_refs_head_sha(&text, branch) {
                        return Some(sha);
                    }
                }
            }
        }
    }

    None
}

enum ZipFetchResult {
    Downloaded { bytes: Vec<u8>, etag: Option<String> },
    NotModified,
}

enum ZipAttemptError {
    /// 建连失败或服务端返回非 2xx（几乎未消耗流量，可安全回退下一通道）
    BeforeBody(String),
    /// 已开始接收较多正文数据后中途中断或超时（避免在同一官方源上重复重下放大流量）
    MidStream(String),
}

impl ZipAttemptError {
    fn message(&self) -> &str {
        match self {
            ZipAttemptError::BeforeBody(s) | ZipAttemptError::MidStream(s) => s,
        }
    }
}

/// 流式下载 ZIP 压缩包，支持 `If-None-Match` 条件校验（304 零流量跳过），校验 `PK\x03\x04` 魔数并推送进度
async fn download_zip_with_progress(
    app: Option<&tauri::AppHandle>,
    target_dir_str: &str,
    client: &reqwest::Client,
    client_label: &str,
    url_label: &str,
    zip_url: &str,
    if_none_match: Option<&str>,
) -> Result<ZipFetchResult, ZipAttemptError> {
    emit_progress(
        app,
        target_dir_str,
        Some(20),
        "zip_downloading",
        &format!("正在请求源码包 ({})...", url_label),
        &format!("[ZIP 通道 - {}] 正在连接 {} ...", client_label, zip_url),
    );

    let mut req = client.get(zip_url);
    if let Some(etag) = if_none_match {
        let trimmed = etag.trim();
        if !trimmed.is_empty() {
            req = req.header("If-None-Match", trimmed);
        }
    }

    let resp = req
        .send()
        .await
        .map_err(|e| ZipAttemptError::BeforeBody(format!("{} 请求失败: {}", url_label, e)))?;

    if resp.status() == reqwest::StatusCode::NOT_MODIFIED {
        return Ok(ZipFetchResult::NotModified);
    }

    if !resp.status().is_success() {
        return Err(ZipAttemptError::BeforeBody(format!(
            "{} 返回 HTTP {}",
            url_label,
            resp.status()
        )));
    }

    let response_etag = resp
        .headers()
        .get(reqwest::header::ETAG)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let total_size = resp.content_length();
    let mut buffer = Vec::new();
    let mut stream_resp = resp;
    let mut last_emit_bytes = 0usize;

    loop {
        match timeout(Duration::from_secs(20), stream_resp.chunk()).await {
            Ok(Ok(Some(chunk))) => {
                buffer.extend_from_slice(&chunk);
                if buffer.len() - last_emit_bytes >= 65536 {
                    last_emit_bytes = buffer.len();
                    let kb = buffer.len() as f64 / 1024.0;
                    let pct = if let Some(total) = total_size {
                        if total > 0 {
                            (20 + ((buffer.len() as u64 * 65) / total).min(65)) as u32
                        } else {
                            50
                        }
                    } else {
                        (25 + (buffer.len() / 32768).min(60)) as u32
                    };
                    let size_str = if kb >= 1024.0 {
                        format!("{:.2} MB", kb / 1024.0)
                    } else {
                        format!("{:.0} KB", kb)
                    };
                    emit_progress(
                        app,
                        target_dir_str,
                        Some(pct),
                        "zip_downloading",
                        &format!("正在下载源码包 ({})...", size_str),
                        &format!("Receiving ZIP archive: {}", size_str),
                    );
                }
            }
            Ok(Ok(None)) => break,
            Ok(Err(e)) => {
                let msg = format!("读取数据流中断: {}", e);
                return if buffer.len() > 64 * 1024 {
                    Err(ZipAttemptError::MidStream(msg))
                } else {
                    Err(ZipAttemptError::BeforeBody(msg))
                };
            }
            Err(_) => {
                let msg = "读取源码包数据流超时".to_string();
                return if buffer.len() > 64 * 1024 {
                    Err(ZipAttemptError::MidStream(msg))
                } else {
                    Err(ZipAttemptError::BeforeBody(msg))
                };
            }
        }
    }

    // 校验 ZIP 文件头魔数 PK\x03\x04
    if buffer.len() >= 4 && &buffer[0..4] == b"PK\x03\x04" {
        let kb = buffer.len() as f64 / 1024.0;
        emit_progress(
            app,
            target_dir_str,
            Some(88),
            "zip_extracting",
            "源码包下载完成，正在解压文件...",
            &format!("✅ 源码压缩包下载完成 ({:.1} KB)，正在解压到本地目录...", kb),
        );
        Ok(ZipFetchResult::Downloaded {
            bytes: buffer,
            etag: response_etag,
        })
    } else {
        Err(ZipAttemptError::BeforeBody("下载内容不是有效的 ZIP 压缩包".to_string()))
    }
}

/// 阶段二：通过 HTTPS 下载 GitHub 源码压缩包 (ZIP)
/// 返回 `Ok(true)` 表示已下载并解压新版本；返回 `Ok(false)` 表示远端返回 304 未变更（0 流量跳过）
async fn download_github_zip_fallback_with_meta(
    app: Option<&tauri::AppHandle>,
    owner: &str,
    repo: &str,
    branch: Option<&str>,
    normalized_git_url: &str,
    target_path: &Path,
    system_proxy: Option<&str>,
    if_none_match: Option<&str>,
    known_commit_sha: Option<&str>,
) -> Result<bool, String> {
    let target_dir_str = target_path.to_string_lossy().to_string();

    emit_progress(
        app,
        &target_dir_str,
        Some(15),
        "zip_fallback",
        "正在通过源码压缩包 (ZIP) 通道下载...",
        "⚡ Git 协议连接受阻，已自动切换至「GitHub 源码包 (ZIP)」高速通道...",
    );

    // 仅保留 1 个标准 codeload 官方地址，避免 github.com/archive 302 跳转回 codeload 导致大包重复双倍流量
    let (official_label, official_url) = if let Some(b) = branch {
        (
            format!("codeload ({})", b),
            format!("https://codeload.github.com/{}/{}/zip/refs/heads/{}", owner, repo, b),
        )
    } else {
        (
            "codeload (HEAD)".to_string(),
            format!("https://codeload.github.com/{}/{}/zip/HEAD", owner, repo),
        )
    };

    // 构建国内镜像候选下载链接
    let ref_part = branch
        .map(|b| format!("refs/heads/{}.zip", b))
        .unwrap_or_else(|| "HEAD.zip".to_string());
    let mirror_urls: Vec<(String, String)> = GITHUB_MIRROR_PREFIXES
        .iter()
        .map(|(name, prefix)| {
            (
                format!("镜像 {}", name),
                format!("{}/{}/{}/archive/{}", prefix, owner, repo, ref_part),
            )
        })
        .collect();

    let direct_client = reqwest::Client::builder()
        .http1_only()
        .no_proxy()
        .connect_timeout(Duration::from_secs(4))
        .timeout(Duration::from_secs(120))
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) SkillHub/0.3")
        .build()
        .map_err(|e| format!("初始化 HTTP 客户端失败: {}", e))?;

    let mut last_error = String::new();
    let mut downloaded: Option<(Vec<u8>, Option<String>)> = None;
    let mut aborted_mid_stream = false;

    if let Some(proxy_str) = system_proxy {
        // 1. 有活动系统代理：通过系统代理请求唯一的官方 codeload 地址（附带 If-None-Match）
        if let Ok(proxy) = reqwest::Proxy::all(proxy_str) {
            if let Ok(proxy_client) = reqwest::Client::builder()
                .http1_only()
                .proxy(proxy)
                .connect_timeout(Duration::from_secs(8))
                .timeout(Duration::from_secs(120))
                .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) SkillHub/0.3")
                .build()
            {
                let client_label = format!("系统代理 {}", proxy_str);
                match download_zip_with_progress(
                    app,
                    &target_dir_str,
                    &proxy_client,
                    &client_label,
                    &official_label,
                    &official_url,
                    if_none_match,
                )
                .await
                {
                    Ok(ZipFetchResult::NotModified) => return Ok(false),
                    Ok(ZipFetchResult::Downloaded { bytes, etag }) => {
                        downloaded = Some((bytes, etag));
                    }
                    Err(e) => {
                        if matches!(e, ZipAttemptError::MidStream(_)) {
                            aborted_mid_stream = true;
                        }
                        last_error = e.message().to_string();
                    }
                }
            }
        }

        // 2. 仅当代理建连阶段失败（未消耗正文流量）时，才尝试直连 codeload（兼容 TUN 模式）
        if downloaded.is_none() && !aborted_mid_stream {
            match download_zip_with_progress(
                app,
                &target_dir_str,
                &direct_client,
                "直连/TUN 通道",
                &official_label,
                &official_url,
                if_none_match,
            )
            .await
            {
                Ok(ZipFetchResult::NotModified) => return Ok(false),
                Ok(ZipFetchResult::Downloaded { bytes, etag }) => {
                    downloaded = Some((bytes, etag));
                }
                Err(e) => {
                    if matches!(e, ZipAttemptError::MidStream(_)) {
                        aborted_mid_stream = true;
                    }
                    last_error = e.message().to_string();
                }
            }
        }

        // 3. 若官方通道未成功且非流中超时，兜底走国内镜像（不经 VPN 代理）
        if downloaded.is_none() && !aborted_mid_stream {
            for (url_label, mirror_url) in &mirror_urls {
                match download_zip_with_progress(
                    app,
                    &target_dir_str,
                    &direct_client,
                    "国内加速镜像",
                    url_label,
                    mirror_url,
                    if_none_match,
                )
                .await
                {
                    Ok(ZipFetchResult::NotModified) => return Ok(false),
                    Ok(ZipFetchResult::Downloaded { bytes, etag }) => {
                        downloaded = Some((bytes, etag));
                        break;
                    }
                    Err(e) => {
                        last_error = e.message().to_string();
                        if matches!(e, ZipAttemptError::MidStream(_)) {
                            break;
                        }
                    }
                }
            }
        }
    } else {
        // 无 VPN / 无系统代理环境：优先直接走国内高速镜像
        for (url_label, mirror_url) in &mirror_urls {
            match download_zip_with_progress(
                app,
                &target_dir_str,
                &direct_client,
                "国内加速镜像",
                url_label,
                mirror_url,
                if_none_match,
            )
            .await
            {
                Ok(ZipFetchResult::NotModified) => return Ok(false),
                Ok(ZipFetchResult::Downloaded { bytes, etag }) => {
                    downloaded = Some((bytes, etag));
                    break;
                }
                Err(e) => {
                    last_error = e.message().to_string();
                    if matches!(e, ZipAttemptError::MidStream(_)) {
                        aborted_mid_stream = true;
                        break;
                    }
                }
            }
        }

        // 镜像全部不可用且未在流中中断时，尝试直连官方源（兼容海外无代理或教育网用户）
        if downloaded.is_none() && !aborted_mid_stream {
            match download_zip_with_progress(
                app,
                &target_dir_str,
                &direct_client,
                "官方直连通道",
                &official_label,
                &official_url,
                if_none_match,
            )
            .await
            {
                Ok(ZipFetchResult::NotModified) => return Ok(false),
                Ok(ZipFetchResult::Downloaded { bytes, etag }) => {
                    downloaded = Some((bytes, etag));
                }
                Err(e) => last_error = e.message().to_string(),
            }
        }
    }

    let (zip_bytes, response_etag) = downloaded.ok_or_else(|| {
        format!("源码包 (ZIP) 备用通道下载失败: {}", last_error)
    })?;

    // 下载成功后补齐远端 Commit SHA（若未预先传入），方便后续更新零流量比对
    let resolved_sha = match known_commit_sha {
        Some(s) if !s.is_empty() => Some(s.to_string()),
        _ => fetch_remote_head_sha(owner, repo, branch, system_proxy).await,
    };

    let _ = std::fs::remove_dir_all(target_path);
    let target_clone = target_path.to_path_buf();
    let git_url_owned = normalized_git_url.to_string();
    let branch_owned = branch.map(|s| s.to_string());
    let sync_meta = ZipSyncMeta {
        etag: response_etag,
        commit_sha: resolved_sha,
        branch: branch_owned.clone(),
        updated_at: chrono::Utc::now().to_rfc3339(),
    };

    tauri::async_runtime::spawn_blocking(move || {
        extract_github_zip_bytes(zip_bytes, &target_clone)?;
        ensure_git_metadata(&target_clone, &git_url_owned, branch_owned.as_deref());
        write_zip_sync_meta(&target_clone, &sync_meta);
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("解压任务异常: {}", e))??;

    Ok(true)
}

async fn download_github_zip_fallback(
    app: Option<&tauri::AppHandle>,
    owner: &str,
    repo: &str,
    branch: Option<&str>,
    normalized_git_url: &str,
    target_path: &Path,
    system_proxy: Option<&str>,
) -> Result<(), String> {
    download_github_zip_fallback_with_meta(
        app,
        owner,
        repo,
        branch,
        normalized_git_url,
        target_path,
        system_proxy,
        None,
        None,
    )
    .await
    .map(|_| ())
}

pub async fn clone_repository(
    app: Option<&tauri::AppHandle>,
    url: &str,
    target_path: &Path,
) -> Result<(), String> {
    let system_proxy = detect_system_proxy();
    clone_repository_with_proxy(app, url, target_path, system_proxy).await
}

async fn clone_repository_with_proxy(
    app: Option<&tauri::AppHandle>,
    url: &str,
    target_path: &Path,
    system_proxy: Option<String>,
) -> Result<(), String> {
    if target_path.exists() {
        return Err("目标文件夹已存在，请先删除旧目录。".into());
    }

    let target_dir_str = target_path.to_string_lossy().to_string();
    let repo_info = parse_github_repo_info(url);
    let effective_git_url = repo_info
        .as_ref()
        .map(|(_, _, _, norm_url)| norm_url.as_str())
        .unwrap_or(url);
    let branch_opt = repo_info.as_ref().and_then(|(_, _, b, _)| b.as_deref());

    // ==================== 阶段 1：Git 浅克隆（系统代理 / 极速直连 / 国内 Git 镜像） ====================
    let mut git_errors = Vec::new();
    let mut git_succeeded = false;
    let mut fatal_non_network_err: Option<String> = None;
    let mut aborted_mid_stream = false;

    if let Some(ref proxy) = system_proxy {
        emit_progress(
            app,
            &target_dir_str,
            Some(2),
            "cloning",
            "正在通过系统代理连接 GitHub...",
            &format!("[网络诊断] 检测到系统代理 ({})，使用 HTTP/1.1 兼容模式拉取...", proxy),
        );

        match run_git_clone_attempt(app, effective_git_url, branch_opt, target_path, Some(proxy), 8, 60).await {
            Ok(()) => {
                git_succeeded = true;
            }
            Err(e) => {
                git_errors.push(format!("[代理通道] {}", e));
                if is_non_retryable_git_error(&e) {
                    fatal_non_network_err = Some(e);
                } else if is_git_clone_mid_stream_error(&e) {
                    // 数据流中途断开时停止切换通道重下，避免重复消耗代理流量
                    aborted_mid_stream = true;
                } else {
                    emit_progress(
                        app,
                        &target_dir_str,
                        Some(6),
                        "retrying_direct",
                        "代理通道受阻，正在尝试直连/TUN 通道...",
                        &format!("⚠️ 代理通道返回错误: {}\n🔄 正在切换至无代理直连 / TUN 透明通道重试...", e.lines().last().unwrap_or(&e)),
                    );
                }
            }
        }
    }

    // 尝试无代理直连（有代理时 5s 快速探测兼容 TUN；无代理时 4s 极速探测，避免大陆用户长时间盲等）
    if !git_succeeded && fatal_non_network_err.is_none() && !aborted_mid_stream {
        let connect_timeout = if system_proxy.is_some() { 5 } else { 4 };
        let total_timeout = if system_proxy.is_some() { 40 } else { 30 };
        match run_git_clone_attempt(app, effective_git_url, branch_opt, target_path, None, connect_timeout, total_timeout).await {
            Ok(()) => {
                git_succeeded = true;
            }
            Err(e) => {
                git_errors.push(format!("[直连通道] {}", e));
                if is_non_retryable_git_error(&e) {
                    fatal_non_network_err = Some(e);
                } else if is_git_clone_mid_stream_error(&e) {
                    aborted_mid_stream = true;
                }
            }
        }
    }

    // 若官方直连/代理 Git 通道在建连阶段受阻且目标为 GitHub 仓库，自动切换国内高速 Git 镜像浅克隆并还原 origin 地址
    if !git_succeeded && fatal_non_network_err.is_none() && !aborted_mid_stream {
        if let Some((ref owner, ref repo, _, ref norm_url)) = repo_info {
            for (mirror_name, prefix) in GITHUB_MIRROR_PREFIXES {
                let mirror_git_url = format!("{}/{}/{}.git", prefix, owner, repo);
                emit_progress(
                    app,
                    &target_dir_str,
                    Some(10),
                    "cloning_mirror",
                    &format!("正在通过国内加速镜像 ({}) 拉取仓库...", mirror_name),
                    &format!("⚡ 直连受阻，正在切换国内 Git 加速镜像 ({}) 拉取...", mirror_name),
                );
                match run_git_clone_attempt(app, &mirror_git_url, branch_opt, target_path, None, 6, 45).await {
                    Ok(()) => {
                        set_git_remote_origin(target_path, norm_url);
                        git_succeeded = true;
                        break;
                    }
                    Err(e) => {
                        git_errors.push(format!("[镜像 {}] {}", mirror_name, e));
                        if is_non_retryable_git_error(&e) {
                            fatal_non_network_err = Some(e);
                            break;
                        } else if is_git_clone_mid_stream_error(&e) {
                            aborted_mid_stream = true;
                            break;
                        }
                    }
                }
            }
        }
    }

    if git_succeeded {
        emit_progress(
            app,
            &target_dir_str,
            Some(100),
            "done",
            "拉取完成，正在解析技能...",
            "Clone finished successfully.",
        );
        return Ok(());
    }

    if let Some(fatal_err) = fatal_non_network_err {
        let _ = std::fs::remove_dir_all(target_path);
        return Err(format_git_error(&fatal_err));
    }

    // 若已在传输对象阶段中途中断，严禁继续穿透回退 ZIP 重下载造成双倍流量
    if aborted_mid_stream {
        let _ = std::fs::remove_dir_all(target_path);
        return Err(format_git_error(&git_errors.join("\n")));
    }

    // ==================== 阶段 2：GitHub 源码包 (ZIP) 自动降级兜底 ====================
    if let Some((owner, repo, branch, norm_url)) = repo_info {
        match download_github_zip_fallback(
            app,
            &owner,
            &repo,
            branch.as_deref(),
            &norm_url,
            target_path,
            system_proxy.as_deref(),
        )
        .await
        {
            Ok(()) => {
                emit_progress(
                    app,
                    &target_dir_str,
                    Some(100),
                    "done",
                    "源码包解压完成，正在解析技能...",
                    "Archive download and extraction finished successfully.",
                );
                return Ok(());
            }
            Err(zip_err) => {
                let _ = std::fs::remove_dir_all(target_path);
                let combined = format!("{}\n[ZIP 备用通道] {}", git_errors.join("\n"), zip_err);
                return Err(format_git_error(&combined));
            }
        }
    }

    let _ = std::fs::remove_dir_all(target_path);
    Err(format_git_error(&git_errors.join("\n")))
}

/// 从本地仓库的 `.git/HEAD` 中提取当前所在分支名称
fn read_local_git_head_branch(repo_path: &Path) -> Option<String> {
    let head_path = repo_path.join(".git").join("HEAD");
    let content = std::fs::read_to_string(head_path).ok()?;
    let trimmed = content.trim();
    trimmed
        .strip_prefix("ref: refs/heads/")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// 从本地仓库的 `.git/config` 中提取 `remote.origin.url`
pub fn read_remote_url_from_git_config(repo_path: &Path) -> Option<String> {
    let config_path = repo_path.join(".git").join("config");
    if let Ok(content) = std::fs::read_to_string(config_path) {
        for line in content.lines() {
            let trimmed = line.trim();
            if let Some(url) = trimmed.strip_prefix("url = ") {
                let u = url.trim();
                if !u.is_empty() {
                    return Some(u.to_string());
                }
            }
        }
    }
    None
}

async fn run_git_pull_attempt(repo_path: &Path, proxy: Option<&str>, connect_timeout_secs: u64) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.current_dir(repo_path)
        .arg("-c").arg("http.version=HTTP/1.1")
        .arg("-c").arg(format!("http.connectTimeout={}", connect_timeout_secs))
        .arg("-c").arg("http.lowSpeedLimit=1000")
        .arg("-c").arg("http.lowSpeedTime=15");

    if let Some(p) = proxy {
        cmd.arg("-c").arg(format!("http.proxy={}", p))
            .arg("-c").arg(format!("https.proxy={}", p))
            .env("http_proxy", p)
            .env("https_proxy", p)
            .env("HTTP_PROXY", p)
            .env("HTTPS_PROXY", p)
            .env("all_proxy", p)
            .env("ALL_PROXY", p);
    } else {
        cmd.arg("-c").arg("http.proxy=")
            .arg("-c").arg("https.proxy=");
        for key in &["https_proxy", "HTTPS_PROXY", "http_proxy", "HTTP_PROXY", "all_proxy", "ALL_PROXY"] {
            cmd.env_remove(key);
        }
    }

    cmd.arg("pull")
        .env("GIT_TERMINAL_PROMPT", "0")
        .kill_on_drop(true)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000);
    }

    let child = cmd.spawn().map_err(|e| format!("无法执行 git pull 命令: {}", e))?;

    match timeout(Duration::from_secs(45), child.wait_with_output()).await {
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
                Err(stderr.to_string())
            }
        }
        Ok(Err(e)) => Err(format!("同步命令执行出错: {}", e)),
        Err(_) => Err("同步连接超时".into()),
    }
}

/// 使用国内 Git 镜像拉取更新（无代理直连 + 指定镜像 URL + HEAD），不篡改本地 `.git/config`
async fn run_git_pull_mirror_attempt(repo_path: &Path, mirror_git_url: &str, branch: Option<&str>) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.current_dir(repo_path)
        .arg("-c").arg("http.version=HTTP/1.1")
        .arg("-c").arg("http.connectTimeout=6")
        .arg("-c").arg("http.lowSpeedLimit=1000")
        .arg("-c").arg("http.lowSpeedTime=15")
        .arg("-c").arg("http.proxy=")
        .arg("-c").arg("https.proxy=");

    for key in &["https_proxy", "HTTPS_PROXY", "http_proxy", "HTTP_PROXY", "all_proxy", "ALL_PROXY"] {
        cmd.env_remove(key);
    }

    cmd.arg("pull")
        .arg("--ff-only")
        .arg(mirror_git_url);
    if let Some(b) = branch {
        cmd.arg(b);
    } else {
        cmd.arg("HEAD");
    }

    cmd.env("GIT_TERMINAL_PROMPT", "0")
        .kill_on_drop(true)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000);
    }

    let child = cmd.spawn().map_err(|e| format!("无法执行 git pull 命令: {}", e))?;

    match timeout(Duration::from_secs(45), child.wait_with_output()).await {
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
                Err(stderr.to_string())
            }
        }
        Ok(Err(e)) => Err(format!("同步命令执行出错: {}", e)),
        Err(_) => Err("同步连接超时".into()),
    }
}

enum ZipUpgradeOutcome {
    /// 成功通过 Git 浅克隆转正为正式 Git 仓库（后续均走增量 git pull）
    Upgraded,
    /// Git 通道在建连阶段不可用（几乎未消耗流量），可安全回退到 ZIP 更新通道
    FallbackToZip,
    /// 命中明确的不可重试错误（404/认证失败）或已在流中中断（严禁再回退 ZIP 造成双倍流量）
    Abort(String),
}

/// 当 ZIP 降级仓确认存在上游更新时，尝试通过一次浅克隆“原地转正”为正式 Git 仓库
/// 转正成功后一劳永逸摆脱整包 ZIP 下载，未来所有更新均只拉取几 KB 的 Git 增量差异
async fn try_upgrade_zip_repo_to_git(
    repo_path: &Path,
    owner: &str,
    repo: &str,
    branch: Option<&str>,
    norm_url: &str,
    system_proxy: Option<&str>,
) -> ZipUpgradeOutcome {
    if !is_git_cli_available() {
        return ZipUpgradeOutcome::FallbackToZip;
    }

    let parent = repo_path.parent().unwrap_or_else(|| Path::new("."));
    let temp_dir = parent.join(format!(
        ".skillhub_upgrade_git_{}",
        uuid::Uuid::new_v4().simple()
    ));

    let mut cloned = false;

    if let Some(proxy) = system_proxy {
        // 1. 有系统代理：优先经代理浅克隆官方地址
        match run_git_clone_attempt(None, norm_url, branch, &temp_dir, Some(proxy), 6, 60).await {
            Ok(()) => cloned = true,
            Err(e) => {
                if is_non_retryable_git_error(&e) || is_git_clone_mid_stream_error(&e) {
                    let _ = std::fs::remove_dir_all(&temp_dir);
                    return ZipUpgradeOutcome::Abort(e);
                }
            }
        }

        // 2. 代理建连失败时尝试无代理直连（兼容 TUN 模式）
        if !cloned {
            match run_git_clone_attempt(None, norm_url, branch, &temp_dir, None, 5, 45).await {
                Ok(()) => cloned = true,
                Err(e) => {
                    if is_non_retryable_git_error(&e) || is_git_clone_mid_stream_error(&e) {
                        let _ = std::fs::remove_dir_all(&temp_dir);
                        return ZipUpgradeOutcome::Abort(e);
                    }
                }
            }
        }

        // 3. 官方通道均建连失败时，兜底尝试国内 Git 加速镜像并还原 origin
        if !cloned {
            for (_, prefix) in GITHUB_MIRROR_PREFIXES {
                let mirror_git_url = format!("{}/{}/{}.git", prefix, owner, repo);
                match run_git_clone_attempt(None, &mirror_git_url, branch, &temp_dir, None, 6, 45).await {
                    Ok(()) => {
                        set_git_remote_origin(&temp_dir, norm_url);
                        cloned = true;
                        break;
                    }
                    Err(e) => {
                        if is_non_retryable_git_error(&e) || is_git_clone_mid_stream_error(&e) {
                            let _ = std::fs::remove_dir_all(&temp_dir);
                            return ZipUpgradeOutcome::Abort(e);
                        }
                    }
                }
            }
        }
    } else {
        // 无系统代理环境：优先走国内高速 Git 镜像，建连失败再回退官方直连
        for (_, prefix) in GITHUB_MIRROR_PREFIXES {
            let mirror_git_url = format!("{}/{}/{}.git", prefix, owner, repo);
            match run_git_clone_attempt(None, &mirror_git_url, branch, &temp_dir, None, 6, 45).await {
                Ok(()) => {
                    set_git_remote_origin(&temp_dir, norm_url);
                    cloned = true;
                    break;
                }
                Err(e) => {
                    if is_non_retryable_git_error(&e) || is_git_clone_mid_stream_error(&e) {
                        let _ = std::fs::remove_dir_all(&temp_dir);
                        return ZipUpgradeOutcome::Abort(e);
                    }
                }
            }
        }

        if !cloned {
            match run_git_clone_attempt(None, norm_url, branch, &temp_dir, None, 4, 40).await {
                Ok(()) => cloned = true,
                Err(e) => {
                    if is_non_retryable_git_error(&e) || is_git_clone_mid_stream_error(&e) {
                        let _ = std::fs::remove_dir_all(&temp_dir);
                        return ZipUpgradeOutcome::Abort(e);
                    }
                }
            }
        }
    }

    if !cloned || !temp_dir.join(".git").join("objects").exists() {
        let _ = std::fs::remove_dir_all(&temp_dir);
        return ZipUpgradeOutcome::FallbackToZip;
    }

    // 原子替换旧的 ZIP 降级目录为完整 Git 仓库（失败自动回滚）
    let repo_target = repo_path.to_path_buf();
    let temp_source = temp_dir.clone();
    let backup_dir = parent.join(format!(
        ".skillhub_upgrade_bak_{}",
        uuid::Uuid::new_v4().simple()
    ));

    let replace_res = tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        // 1. 优先尝试整体目录原子重命名替换（包含全新的完整 .git 目录，且自动丢弃旧 .skillhub_zip_meta.json）
        if std::fs::rename(&repo_target, &backup_dir).is_ok() {
            if let Err(e) = std::fs::rename(&temp_source, &repo_target) {
                let _ = std::fs::rename(&backup_dir, &repo_target);
                let _ = std::fs::remove_dir_all(&temp_source);
                return Err(format!("转正替换目录失败: {}", e));
            }
            let _ = std::fs::remove_dir_all(&backup_dir);
            return Ok(());
        }

        // 2. Windows 若顶层目录被外部句柄占用导致整体 rename 失败，降级为目录内全量替换（连同 .git 一并替换为正式仓）
        if let Ok(entries) = std::fs::read_dir(&repo_target) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    let _ = std::fs::remove_dir_all(&p);
                } else {
                    let _ = std::fs::remove_file(&p);
                }
            }
        }
        if let Ok(entries) = std::fs::read_dir(&temp_source) {
            for entry in entries.flatten() {
                let src = entry.path();
                let dst = repo_target.join(entry.file_name());
                if std::fs::rename(&src, &dst).is_err() {
                    if src.is_dir() {
                        fs_extra::dir::copy(
                            &src,
                            &repo_target,
                            &fs_extra::dir::CopyOptions::new().overwrite(true),
                        )
                        .map_err(|e| format!("复制转正目录失败: {}", e))?;
                    } else {
                        std::fs::copy(&src, &dst)
                            .map_err(|e| format!("复制转正文件失败: {}", e))?;
                    }
                }
            }
        }
        let _ = std::fs::remove_file(repo_target.join(ZIP_META_FILENAME));
        let _ = std::fs::remove_dir_all(&temp_source);
        Ok(())
    })
    .await;

    let _ = std::fs::remove_dir_all(&temp_dir);
    match replace_res {
        Ok(Ok(())) => ZipUpgradeOutcome::Upgraded,
        Ok(Err(e)) => ZipUpgradeOutcome::Abort(e),
        Err(e) => ZipUpgradeOutcome::Abort(format!("转正替换任务异常: {}", e)),
    }
}

pub async fn pull_repository(repo_path: &Path) -> Result<String, String> {
    // 按目录路径加独占异步锁，防止定时同步与手动刷新并发执行同一仓库 pull/替换
    let _op_guard = acquire_repo_op_lock(repo_path).await;

    let system_proxy = detect_system_proxy();
    let has_git_objects = repo_path.join(".git").join("objects").exists();
    let remote_info = read_remote_url_from_git_config(repo_path)
        .and_then(|u| parse_github_repo_info(&u));

    let mut pull_err = String::new();

    // 1. 如果是完整 Git 仓库（含 .git/objects），只走增量 git pull（绝不穿透降级去重下整仓 ZIP 消耗流量）
    if has_git_objects {
        if let Some(ref proxy) = system_proxy {
            match run_git_pull_attempt(repo_path, Some(proxy), 8).await {
                Ok(msg) => return Ok(msg),
                Err(e) => {
                    if is_non_retryable_git_error(&e) {
                        return Err(format_git_error(&e));
                    }
                    pull_err = e;
                }
            }
        }
        let direct_timeout = if system_proxy.is_some() { 5 } else { 4 };
        match run_git_pull_attempt(repo_path, None, direct_timeout).await {
            Ok(msg) => return Ok(msg),
            Err(e) => {
                if is_non_retryable_git_error(&e) {
                    return Err(format_git_error(&e));
                }
                if pull_err.is_empty() {
                    pull_err = e;
                }
            }
        }

        if let Some((ref owner, ref repo, ref branch, _)) = remote_info {
            let local_branch = read_local_git_head_branch(repo_path);
            let target_branch = branch.as_deref().or(local_branch.as_deref());
            for (_, prefix) in GITHUB_MIRROR_PREFIXES {
                let mirror_git_url = format!("{}/{}/{}.git", prefix, owner, repo);
                match run_git_pull_mirror_attempt(repo_path, &mirror_git_url, target_branch).await {
                    Ok(msg) => return Ok(msg),
                    Err(e) => {
                        if is_non_retryable_git_error(&e) {
                            return Err(format_git_error(&e));
                        }
                        pull_err = e;
                    }
                }
            }
        }

        return Err(format_git_error(&pull_err));
    }

    // 2. 仅针对无 .git/objects 的 ZIP 降级仓库：先做轻量版本校验（Commit SHA + If-None-Match ETag），未变 0 流量跳过
    if let Some((owner, repo, branch, norm_url)) = remote_info {
        let saved_meta = read_zip_sync_meta(repo_path);
        let effective_branch_owned = branch
            .clone()
            .or_else(|| saved_meta.as_ref().and_then(|m| m.branch.clone()));
        let effective_branch = effective_branch_owned.as_deref();

        // 2.1 先用 ~500 字节的 git-upload-pack info/refs 校验远端 HEAD Commit SHA
        let remote_sha = fetch_remote_head_sha(
            &owner,
            &repo,
            effective_branch,
            system_proxy.as_deref(),
        )
        .await;

        if let (Some(ref local_sha), Some(ref latest_sha)) = (
            saved_meta.as_ref().and_then(|m| m.commit_sha.as_ref()),
            &remote_sha,
        ) {
            if local_sha.eq_ignore_ascii_case(latest_sha) {
                return Ok("已是最新".to_string());
            }
        }

        // 2.2 已确认存在上游更新（或旧版 ZIP 仓无元数据时）：若本机有 Git 且无需先走纯 ETag 304 校验，
        // 优先用一次浅克隆自动“转正”为正式 Git 仓库，从此一劳永逸享受几 KB 的增量 git pull
        let has_only_etag_unverified = saved_meta.as_ref().is_some_and(|m| {
            m.commit_sha.is_none()
                && m.etag
                    .as_deref()
                    .is_some_and(|e| !e.trim().is_empty())
        });
        if !has_only_etag_unverified {
            match try_upgrade_zip_repo_to_git(
                repo_path,
                &owner,
                &repo,
                effective_branch,
                &norm_url,
                system_proxy.as_deref(),
            )
            .await
            {
                ZipUpgradeOutcome::Upgraded => {
                    return Ok("更新成功（已升级为 Git 增量同步）".to_string());
                }
                ZipUpgradeOutcome::Abort(e) => {
                    return Err(format_git_error(&e));
                }
                ZipUpgradeOutcome::FallbackToZip => {}
            }
        }

        let parent = repo_path.parent().unwrap_or_else(|| Path::new("."));
        let temp_dir = parent.join(format!(
            ".skillhub_update_tmp_{}",
            uuid::Uuid::new_v4().simple()
        ));

        // 2.3 Git 转正不可用（如未装 Git 或协议受阻）时，携带 ETag 走 ZIP 条件更新，304 零字节跳过
        let zip_res = download_github_zip_fallback_with_meta(
            None,
            &owner,
            &repo,
            effective_branch,
            &norm_url,
            &temp_dir,
            system_proxy.as_deref(),
            saved_meta.as_ref().and_then(|m| m.etag.as_deref()),
            remote_sha.as_deref(),
        )
        .await;

        match zip_res {
            Ok(false) => {
                // 304 未变更：顺手补齐 commit_sha 以便下次连 codeload 都不需要访问
                let _ = std::fs::remove_dir_all(&temp_dir);
                if let Some(latest_sha) = remote_sha {
                    let mut updated_meta = saved_meta.unwrap_or(ZipSyncMeta {
                        etag: None,
                        commit_sha: None,
                        branch: effective_branch.map(|s| s.to_string()),
                        updated_at: chrono::Utc::now().to_rfc3339(),
                    });
                    updated_meta.commit_sha = Some(latest_sha);
                    updated_meta.updated_at = chrono::Utc::now().to_rfc3339();
                    write_zip_sync_meta(repo_path, &updated_meta);
                }
                return Ok("已是最新".to_string());
            }
            Ok(true) => {
                // 原子备份替换：将原 .git 目录保留到 temp_dir，再备份原目录 -> 移入新目录 -> 失败自动回滚，防止半残状态
                let new_meta = read_zip_sync_meta(&temp_dir);
                let repo_target = repo_path.to_path_buf();
                let temp_source = temp_dir.clone();
                let backup_dir = parent.join(format!(
                    ".skillhub_update_bak_{}",
                    uuid::Uuid::new_v4().simple()
                ));
                let replace_res = tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
                    // 把原 .git 配置复制到新暂存目录，保留仓库 origin 等元信息
                    let old_git = repo_target.join(".git");
                    let new_git = temp_source.join(".git");
                    if old_git.exists() {
                        let _ = std::fs::remove_dir_all(&new_git);
                        fs_extra::dir::copy(
                            &old_git,
                            &temp_source,
                            &fs_extra::dir::CopyOptions::new().overwrite(true),
                        )
                        .map_err(|e| format!("保留 .git 元数据失败: {}", e))?;
                    }
                    if let Some(meta) = new_meta {
                        write_zip_sync_meta(&temp_source, &meta);
                    }

                    // 1. 尝试原子目录替换（最安全、零半残风险）
                    if std::fs::rename(&repo_target, &backup_dir).is_ok() {
                        if let Err(e) = std::fs::rename(&temp_source, &repo_target) {
                            // 替换失败立刻回滚原目录
                            let _ = std::fs::rename(&backup_dir, &repo_target);
                            let _ = std::fs::remove_dir_all(&temp_source);
                            return Err(format!("替换更新目录失败: {}", e));
                        }
                        let _ = std::fs::remove_dir_all(&backup_dir);
                        return Ok(());
                    }

                    // 2. Windows 若原目录句柄被占用导致整体 rename 失败，降级为目录内文件替换
                    if let Ok(entries) = std::fs::read_dir(&repo_target) {
                        for entry in entries.flatten() {
                            if entry.file_name() == ".git" {
                                continue;
                            }
                            let p = entry.path();
                            if p.is_dir() {
                                let _ = std::fs::remove_dir_all(&p);
                            } else {
                                let _ = std::fs::remove_file(&p);
                            }
                        }
                    }
                    if let Ok(entries) = std::fs::read_dir(&temp_source) {
                        for entry in entries.flatten() {
                            if entry.file_name() == ".git" {
                                continue;
                            }
                            let src = entry.path();
                            let dst = repo_target.join(entry.file_name());
                            if std::fs::rename(&src, &dst).is_err() {
                                if src.is_dir() {
                                    fs_extra::dir::copy(
                                        &src,
                                        &repo_target,
                                        &fs_extra::dir::CopyOptions::new().overwrite(true),
                                    )
                                    .map_err(|e| format!("复制更新目录失败: {}", e))?;
                                } else {
                                    std::fs::copy(&src, &dst)
                                        .map_err(|e| format!("复制更新文件失败: {}", e))?;
                                }
                            }
                        }
                    }
                    let _ = std::fs::remove_dir_all(&temp_source);
                    Ok(())
                })
                .await;

                let _ = std::fs::remove_dir_all(&temp_dir);
                match replace_res {
                    Ok(Ok(())) => return Ok("更新成功".to_string()),
                    Ok(Err(e)) => pull_err = e,
                    Err(e) => pull_err = format!("替换更新任务异常: {}", e),
                }
            }
            Err(e) => {
                let _ = std::fs::remove_dir_all(&temp_dir);
                pull_err = e;
            }
        }
    }

    Err(format_git_error(&pull_err))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_github_repo_info() {
        let info = parse_github_repo_info("https://github.com/wendaokeliu-sys/ppt-builder.git").unwrap();
        assert_eq!(info.0, "wendaokeliu-sys");
        assert_eq!(info.1, "ppt-builder");
        assert_eq!(info.2, None);
        assert_eq!(info.3, "https://github.com/wendaokeliu-sys/ppt-builder.git");

        let info2 = parse_github_repo_info("https://github.com/owner/repo/tree/dev").unwrap();
        assert_eq!(info2.0, "owner");
        assert_eq!(info2.1, "repo");
        assert_eq!(info2.2.as_deref(), Some("dev"));
    }

    #[test]
    fn test_parse_git_info_refs_head_sha() {
        let sample = "001e# service=git-upload-pack\n\
0000015957217cf86ba38148a57af9e90d14a4c049558330 HEAD\0multi_ack symref=HEAD:refs/heads/main\n\
003f57217cf86ba38148a57af9e90d14a4c049558330 refs/heads/main\n\
003ea1b2c3d4e5f60718293a4b5c6d7e8f9012345678 refs/heads/dev\n\
0000";
        assert_eq!(
            parse_git_info_refs_head_sha(sample, None).as_deref(),
            Some("57217cf86ba38148a57af9e90d14a4c049558330")
        );
        assert_eq!(
            parse_git_info_refs_head_sha(sample, Some("dev")).as_deref(),
            Some("a1b2c3d4e5f60718293a4b5c6d7e8f9012345678")
        );
        assert_eq!(
            parse_git_info_refs_head_sha(sample, Some("nonexistent")).as_deref(),
            Some("57217cf86ba38148a57af9e90d14a4c049558330")
        );
        assert_eq!(parse_git_info_refs_head_sha("invalid", None), None);
    }

    #[test]
    fn test_is_non_retryable_git_error() {
        assert!(is_non_retryable_git_error("remote: Repository not found."));
        assert!(is_non_retryable_git_error("fatal: Authentication failed for 'https://github.com/a/b.git'"));
        assert!(is_non_retryable_git_error("error: Your local changes to the following files would be overwritten by merge:"));
        assert!(is_non_retryable_git_error("fatal: Not possible to fast-forward, aborting."));
        assert!(!is_non_retryable_git_error("fatal: unable to access 'https://github.com/a/b.git': Failed to connect to github.com port 443"));
        assert!(!is_non_retryable_git_error("git clone 阶段连接超时"));
    }

    #[test]
    fn test_is_git_clone_mid_stream_error() {
        assert!(is_git_clone_mid_stream_error("Receiving objects: 42% (120/285)\nfatal: early EOF"));
        assert!(is_git_clone_mid_stream_error("git clone 下载数据流超时"));
        assert!(is_git_clone_mid_stream_error("fatal: fetch-pack: unexpected disconnect while reading sideband packet"));
        assert!(!is_git_clone_mid_stream_error("fatal: unable to access 'https://github.com/a/b.git': Failed to connect"));
        assert!(!is_git_clone_mid_stream_error("git clone 阶段连接超时"));
    }

    #[test]
    fn test_read_local_git_head_branch() {
        let dir = std::env::temp_dir().join(format!("skillhub_head_test_{}", uuid::Uuid::new_v4().simple()));
        let git_dir = dir.join(".git");
        std::fs::create_dir_all(&git_dir).unwrap();
        std::fs::write(git_dir.join("HEAD"), "ref: refs/heads/master\n").unwrap();
        assert_eq!(read_local_git_head_branch(&dir).as_deref(), Some("master"));
        std::fs::write(git_dir.join("HEAD"), "57217cf86ba38148a57af9e90d14a4c049558330\n").unwrap();
        assert_eq!(read_local_git_head_branch(&dir), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn test_acquire_repo_op_lock_serializes() {
        let p = Path::new("/tmp/skillhub_lock_test_repo");
        let guard = acquire_repo_op_lock(p).await;
        // 锁持有期间，第二次尝试应该等待而非立刻穿透
        let second = tokio::time::timeout(
            Duration::from_millis(40),
            acquire_repo_op_lock(p),
        )
        .await;
        assert!(second.is_err(), "同一路径操作锁应阻止并发进入");
        drop(guard);
        let third = tokio::time::timeout(
            Duration::from_millis(100),
            acquire_repo_op_lock(p),
        )
        .await;
        assert!(third.is_ok(), "释放后应可立即获取锁");
    }

    #[tokio::test]
    #[ignore]
    async fn test_proxy_and_clone_and_zip_fallback() {
        let proxy = detect_system_proxy();
        println!("==> Detected system proxy: {:?}", proxy);

        let tmp_clone_dir = std::env::temp_dir().join("skillhub_test_clone_ppt_builder");
        let _ = std::fs::remove_dir_all(&tmp_clone_dir);

        let res = clone_repository(
            None,
            "https://github.com/wendaokeliu-sys/ppt-builder.git",
            &tmp_clone_dir,
        )
        .await;
        println!("==> clone_repository result: {:?}", res);
        assert!(res.is_ok(), "clone_repository failed: {:?}", res);
        assert!(tmp_clone_dir.join(".git/config").exists());
        let _ = std::fs::remove_dir_all(&tmp_clone_dir);

        let tmp_zip_dir = std::env::temp_dir().join("skillhub_test_zip_ppt_builder");
        let _ = std::fs::remove_dir_all(&tmp_zip_dir);

        let zip_res = download_github_zip_fallback(
            None,
            "wendaokeliu-sys",
            "ppt-builder",
            None,
            "https://github.com/wendaokeliu-sys/ppt-builder.git",
            &tmp_zip_dir,
            proxy.as_deref(),
        )
        .await;
        println!("==> download_github_zip_fallback result: {:?}", zip_res);
        assert!(zip_res.is_ok(), "download_github_zip_fallback failed: {:?}", zip_res);
        assert!(tmp_zip_dir.join(".git/config").exists());
        let remote = read_remote_url_from_git_config(&tmp_zip_dir);
        assert_eq!(
            remote.as_deref(),
            Some("https://github.com/wendaokeliu-sys/ppt-builder.git")
        );
        let _ = std::fs::remove_dir_all(&tmp_zip_dir);
    }

    #[tokio::test]
    #[ignore]
    async fn test_no_vpn_mirror_clone_and_zip_fallback() {
        let start = std::time::Instant::now();
        let tmp_clone_dir = std::env::temp_dir().join("skillhub_test_no_vpn_clone");
        let _ = std::fs::remove_dir_all(&tmp_clone_dir);

        // 模拟无代理（国内普通用户无 VPN）环境：即使传入一个不可达的官方直连超时或无代理，快速走国内镜像完成拉取
        let res = clone_repository_with_proxy(
            None,
            "https://github.com/wendaokeliu-sys/ppt-builder.git",
            &tmp_clone_dir,
            None,
        )
        .await;
        println!("==> no-vpn clone elapsed: {:?}, result: {:?}", start.elapsed(), res);
        assert!(res.is_ok(), "no-vpn clone failed: {:?}", res);
        let remote = read_remote_url_from_git_config(&tmp_clone_dir);
        assert_eq!(
            remote.as_deref(),
            Some("https://github.com/wendaokeliu-sys/ppt-builder.git")
        );
        let _ = std::fs::remove_dir_all(&tmp_clone_dir);

        let zip_start = std::time::Instant::now();
        let tmp_zip_dir = std::env::temp_dir().join("skillhub_test_no_vpn_zip");
        let _ = std::fs::remove_dir_all(&tmp_zip_dir);

        let zip_res = download_github_zip_fallback(
            None,
            "wendaokeliu-sys",
            "ppt-builder",
            None,
            "https://github.com/wendaokeliu-sys/ppt-builder.git",
            &tmp_zip_dir,
            None,
        )
        .await;
        println!("==> no-vpn zip fallback elapsed: {:?}, result: {:?}", zip_start.elapsed(), zip_res);
        assert!(zip_res.is_ok(), "no-vpn zip fallback failed: {:?}", zip_res);
        assert_eq!(
            read_remote_url_from_git_config(&tmp_zip_dir).as_deref(),
            Some("https://github.com/wendaokeliu-sys/ppt-builder.git")
        );
        let _ = std::fs::remove_dir_all(&tmp_zip_dir);
    }
}

