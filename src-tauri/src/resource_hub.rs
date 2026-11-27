use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::sync::Semaphore;

use crate::AppState;

/// 单技能溯源元数据文件名（写入已安装单技能目录内，兼容主界面展示与单点更新）
pub const SOURCE_META_FILENAME: &str = ".skillhub-source.json";

/// 默认预置的高质量技能仓库源
const DEFAULT_SUBSCRIBED_REPOS: &[(&str, &str, &str)] = &[
    ("anthropics", "skills", "main"),
    ("vercel-labs", "skills", "main"),
    ("JimLiu", "baoyu-skills", "main"),
    ("obra", "superpowers", "main"),
    ("ComposioHQ", "awesome-claude-skills", "master"),
];

/// 单技能溯源元数据（写入 `${skill_dir}/.skillhub-source.json`）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillHubSourceMeta {
    pub schema_version: u32,
    pub provider: String,
    pub host: String,
    pub owner: String,
    pub repo: String,
    pub repo_url: String,
    pub branch: String,
    pub subpath: String,
    pub skill_name: String,
    pub tree_sha: Option<String>,
    pub commit_sha: Option<String>,
    pub installed_at: String,
    pub updated_at: Option<String>,
}

/// 订阅的远程技能仓库
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscribedRepo {
    pub id: String,
    pub host: String,
    pub owner: String,
    pub repo: String,
    pub branch: String,
    pub enabled: bool,
    pub last_commit_sha: Option<String>,
    pub skill_count: i64,
    pub last_synced_at: Option<String>,
    pub created_at: String,
}

/// 订阅仓库扫描出的技能条目
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscribedRepoSkill {
    pub id: String,
    pub repo_id: String,
    pub host: String,
    pub owner: String,
    pub repo: String,
    pub branch: String,
    pub skill_name: String,
    pub display_name: String,
    pub description: String,
    pub subpath: String,
    pub skill_md_path: String,
    pub tree_sha: Option<String>,
    pub tags: Vec<String>,
}

/// 仓库同步结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscribedRepoSyncResult {
    pub repo_id: String,
    pub branch: String,
    pub skill_count: usize,
    pub skipped_unchanged: bool,
    pub commit_sha: Option<String>,
}

/// 多站点只读令牌展示模型（脱敏返回给前端）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostTokenInfo {
    pub host: String,
    pub masked_token: String,
    pub updated_at: String,
}

/// Linkly AI 每日榜单单条记录
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinklyRankingItem {
    pub rank: i64,
    pub skill: String,
    pub skill_key: String,
    pub platform: String,
    pub vendor: String,
    pub source_skillssh: String,
    pub slug_clawhub: String,
    pub url: String,
    pub repo_url: String,
    pub install_cmd: String,
    pub description: String,
    pub description_zh: String,
    pub category: String,
    pub installs_skillssh: Option<i64>,
    pub downloads_clawhub: Option<i64>,
    pub downloads_skillhub_cn: Option<i64>,
    pub installs_or_downloads: Option<i64>,
    pub wis: Option<f64>,
    pub weekly_recent: Option<i64>,
    pub growth_pct: Option<f64>,
    pub first_seen_days: Option<i64>,
    pub verified_by: Option<String>,
    pub buzz_score: Option<f64>,
    pub last_update: Option<String>,
    pub can_direct_install: bool,
    pub github_owner: Option<String>,
    pub github_repo: Option<String>,
}

/// Linkly AI 每日榜单响应
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinklyLeaderboardResponse {
    pub list_id: String,
    pub last_updated: Option<String>,
    pub fetched_at: String,
    pub from_cache: bool,
    pub items: Vec<LinklyRankingItem>,
}

/// skills.sh 单条搜索结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsShItem {
    pub id: String,
    pub source: String,
    pub skill_id: String,
    pub name: String,
    pub installs: i64,
    pub owner: String,
    pub repo: String,
}

/// skills.sh 搜索响应
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsShSearchResponse {
    pub query: String,
    pub skills: Vec<SkillsShItem>,
    pub count: usize,
    pub duration_ms: Option<u64>,
}

/// 远程技能配套文件项
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSkillFileEntry {
    pub path: String,
    pub size: u64,
}

/// 安装前远程技能完整预览数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSkillPreview {
    pub host: String,
    pub owner: String,
    pub repo: String,
    pub branch: String,
    pub subpath: String,
    pub skill_md_path: String,
    pub skill_name: String,
    pub display_name: String,
    pub description: String,
    pub content: String,
    pub files: Vec<RemoteSkillFileEntry>,
    pub repo_url: String,
    pub browse_url: String,
    pub tree_sha: Option<String>,
    pub commit_sha: Option<String>,
    pub repo_skill_count: usize,
}

/// 本地已安装技能的来源索引（供资源中心精确判断“已安装 / 只看未安装”）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSkillSource {
    pub local_path: String,
    pub owner: String,
    pub repo: String,
    pub subpath: String,
    pub skill_name: String,
    pub repo_url: String,
    pub provider: String,
}

/// 安装结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallRemoteSkillResult {
    pub installed_path: String,
    pub folder_name: String,
    pub skill_count: usize,
    pub source_meta: SkillHubSourceMeta,
}

/// 内部 GitHub Tree 缓存结构
#[derive(Debug, Clone, Serialize, Deserialize)]
struct CachedGitTree {
    branch: String,
    commit_sha: String,
    entries: Vec<GitTreeItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GitTreeItem {
    path: String,
    #[serde(rename = "type")]
    item_type: String,
    sha: String,
    size: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct GitHubTreeApiResponse {
    sha: String,
    tree: Vec<GitTreeItem>,
}

/// 从本地技能目录读取 `.skillhub-source.json`
pub fn read_source_meta(dir: &Path) -> Option<SkillHubSourceMeta> {
    let meta_path = dir.join(SOURCE_META_FILENAME);
    let content = std::fs::read_to_string(meta_path).ok()?;
    serde_json::from_str(&content).ok()
}

/// 根据 `.skillhub-source.json` 构造远程浏览链接
pub fn build_remote_browse_url(meta: &SkillHubSourceMeta) -> String {
    let base = meta.repo_url.trim_end_matches('/').trim_end_matches(".git");
    if meta.subpath.trim().is_empty() {
        base.to_string()
    } else if meta.host == "github.com" {
        format!("{}/tree/{}/{}", base, meta.branch, meta.subpath.trim_matches('/'))
    } else {
        format!("{}/-/tree/{}/{}", base, meta.branch, meta.subpath.trim_matches('/'))
    }
}

/// 构造脱敏令牌文案
fn mask_token(token: &str) -> String {
    let chars: Vec<char> = token.chars().collect();
    if chars.len() <= 8 {
        return "••••••••".to_string();
    }
    let prefix: String = chars.iter().take(4).collect();
    let suffix: String = chars.iter().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect();
    format!("{}••••{}", prefix, suffix)
}

/// 标准化站点域名
fn normalize_host(raw: &str) -> String {
    let trimmed = raw
        .trim()
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_end_matches('/');
    trimmed.split('/').next().unwrap_or("github.com").to_lowercase()
}

/// 解析用户输入的仓库地址（支持 `owner/repo`、GitHub HTTPS/SSH、自建 GitLab URL）
pub fn parse_repo_input(raw: &str) -> Result<(String, String, String, Option<String>), String> {
    let s = raw.trim();
    if s.is_empty() {
        return Err("请输入仓库地址或 owner/repo".to_string());
    }

    // 处理 SSH 格式 git@github.com:owner/repo.git
    if let Some(rest) = s.strip_prefix("git@") {
        let mut parts = rest.splitn(2, ':');
        let host = parts.next().unwrap_or("github.com").trim().to_lowercase();
        let path_part = parts
            .next()
            .ok_or_else(|| "无效的 SSH 仓库地址".to_string())?
            .trim_matches('/')
            .trim_end_matches(".git");
        let segs: Vec<&str> = path_part.split('/').filter(|p| !p.is_empty()).collect();
        if segs.len() < 2 {
            return Err("无法解析仓库所有者与名称".to_string());
        }
        let repo = segs[segs.len() - 1].to_string();
        let owner = segs[..segs.len() - 1].join("/");
        return Ok((host, owner, repo, None));
    }

    // 处理完整 HTTP(S) URL
    if s.starts_with("http://") || s.starts_with("https://") {
        let without_scheme = s
            .trim_start_matches("https://")
            .trim_start_matches("http://");
        let without_query = without_scheme.split('?').next().unwrap_or(without_scheme);
        let without_hash = without_query.split('#').next().unwrap_or(without_query);
        let segs: Vec<&str> = without_hash.split('/').filter(|p| !p.is_empty()).collect();
        if segs.len() < 3 {
            return Err("仓库 URL 格式不完整，应包含域名/所有者/仓库名".to_string());
        }
        let host = segs[0].to_lowercase();
        let path_segs = &segs[1..];

        // 识别 GitHub /tree/<branch> 或 GitLab /-/tree/<branch>
        let mut detected_branch: Option<String> = None;
        let repo_segs: Vec<&str> = if let Some(pos) = path_segs.iter().position(|&p| p == "-" || p == "tree" || p == "blob") {
            if path_segs.get(pos) == Some(&"tree") {
                detected_branch = path_segs.get(pos + 1).map(|b| b.to_string());
            } else if path_segs.get(pos) == Some(&"-") && path_segs.get(pos + 1) == Some(&"tree") {
                detected_branch = path_segs.get(pos + 2).map(|b| b.to_string());
            }
            path_segs[..pos].to_vec()
        } else {
            path_segs.to_vec()
        };

        if repo_segs.len() < 2 {
            return Err("无法从链接中识别仓库所有者与名称".to_string());
        }
        let repo = repo_segs[repo_segs.len() - 1].trim_end_matches(".git").to_string();
        let owner = repo_segs[..repo_segs.len() - 1].join("/");
        return Ok((host, owner, repo, detected_branch));
    }

    // 处理简写 owner/repo
    let clean = s.trim_matches('/').trim_end_matches(".git");
    let segs: Vec<&str> = clean.split('/').filter(|p| !p.is_empty()).collect();
    if segs.len() == 2 {
        return Ok(("github.com".to_string(), segs[0].to_string(), segs[1].to_string(), None));
    }

    Err("格式无效，请输入 owner/name 或完整的 Git 仓库 URL".to_string())
}

/// 从 Linkly AI 的 repo_url / source_skillssh / install 字段提取 GitHub (owner, repo)
pub fn extract_github_owner_repo(
    repo_url: &str,
    source_skillssh: &str,
    install_cmd: &str,
) -> Option<(String, String)> {
    // 1. 优先从 repo_url 提取
    let ru = repo_url.trim();
    if ru.contains("github.com/") {
        if let Ok((host, owner, repo, _)) = parse_repo_input(ru) {
            if host == "github.com" && !owner.is_empty() && !repo.is_empty() && !owner.contains('/') {
                return Some((owner, repo));
            }
        }
    }

    // 2. 从 source_skillssh (形如 owner/repo) 提取
    let ss = source_skillssh.trim();
    if !ss.is_empty() {
        let segs: Vec<&str> = ss.split('/').filter(|s| !s.is_empty()).collect();
        if segs.len() == 2 && !segs[0].contains('.') {
            return Some((segs[0].to_string(), segs[1].to_string()));
        }
    }

    // 3. 从 install 命令中的 https://github.com/owner/repo 提取
    for token in install_cmd.split_whitespace() {
        if token.contains("github.com/") {
            if let Ok((host, owner, repo, _)) = parse_repo_input(token) {
                if host == "github.com" && !owner.is_empty() && !repo.is_empty() && !owner.contains('/') {
                    return Some((owner, repo));
                }
            }
        }
    }

    None
}

/// 判断 URL 是否允许走国内 GitHub 镜像加速通道（严禁在镜像通道携带任何 Token）
fn is_github_mirrorable_url(url: &str) -> bool {
    url.starts_with("https://github.com/")
        || url.starts_with("https://api.github.com/")
        || url.starts_with("https://raw.githubusercontent.com/")
        || url.starts_with("https://codeload.github.com/")
}

/// 构建带系统代理 / 无代理的 HTTP/1.1 reqwest 客户端列表
fn build_http_clients(timeout_secs: u64) -> Vec<(String, reqwest::Client, bool)> {
    let system_proxy = crate::git_engine::detect_system_proxy();
    let mut clients = Vec::new();

    // 通道 1：系统代理
    if let Some(ref proxy_str) = system_proxy {
        if let Ok(proxy) = reqwest::Proxy::all(proxy_str) {
            if let Ok(c) = reqwest::Client::builder()
                .http1_only()
                .proxy(proxy)
                .connect_timeout(Duration::from_secs(8))
                .timeout(Duration::from_secs(timeout_secs))
                .build()
            {
                clients.push(("代理通道".to_string(), c, false));
            }
        }
    }

    // 通道 2：无代理直连 / TUN
    let connect_secs = if system_proxy.is_some() { 5 } else { 4 };
    if let Ok(c) = reqwest::Client::builder()
        .http1_only()
        .no_proxy()
        .connect_timeout(Duration::from_secs(connect_secs))
        .timeout(Duration::from_secs(timeout_secs))
        .build()
    {
        clients.push(("直连通道".to_string(), c, true));
    }

    clients
}

/// 执行单次 HTTP 请求并读取文本，附带状态码
async fn send_text_request(
    client: &reqwest::Client,
    url: &str,
    auth_header: Option<(&str, &str)>,
    accept_json: bool,
) -> Result<(u16, String), String> {
    let mut req = client
        .get(url)
        .header("User-Agent", "SkillHub-Desktop/0.3");
    if accept_json {
        req = req.header("Accept", "application/vnd.github.v3+json, application/json");
    }
    if let Some((h_name, h_val)) = auth_header {
        req = req.header(h_name, h_val);
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    Ok((status, body))
}

/// 三通道容错文本拉取（系统代理 → 无代理直连/TUN → gh-proxy.com 国内镜像且剥离 Token）
pub(crate) async fn fetch_text_resilient(
    url: &str,
    auth_header: Option<(&str, &str)>,
    accept_json: bool,
    allow_mirror: bool,
    timeout_secs: u64,
) -> Result<(u16, String), String> {
    let clients = build_http_clients(timeout_secs);
    let mut errors = Vec::new();
    let mut last_http_err: Option<(u16, String)> = None;

    for (label, client, can_mirror_here) in &clients {
        match send_text_request(client, url, auth_header, accept_json).await {
            Ok((status, body)) if (200..300).contains(&status) => {
                return Ok((status, body));
            }
            Ok((status, body)) if status == 404 || status == 401 => {
                // 404/401 直接返回语义状态，不无意义走镜像重试
                return Ok((status, body));
            }
            Ok((status, body)) => {
                errors.push(format!("{} HTTP {}", label, status));
                last_http_err = Some((status, body));
            }
            Err(e) => {
                errors.push(format!("{}失败: {}", label, e));
            }
        }

        // 通道 3：镜像兜底（严禁携带任何 Authorization/PRIVATE-TOKEN 令牌！）
        if *can_mirror_here && allow_mirror && is_github_mirrorable_url(url) {
            let mirror_url = format!("https://gh-proxy.com/{}", url);
            match send_text_request(client, &mirror_url, None, accept_json).await {
                Ok((status, body)) if (200..300).contains(&status) => {
                    return Ok((status, body));
                }
                Ok((status, _)) => {
                    errors.push(format!("镜像通道 HTTP {}", status));
                }
                Err(e) => {
                    errors.push(format!("镜像通道失败: {}", e));
                }
            }
        }
    }

    if let Some((status, body)) = last_http_err {
        return Ok((status, body));
    }

    Err(format!("网络请求失败 ({})", errors.join("; ")))
}

enum BytesFetchError {
    /// 建连失败或服务端返回非 2xx（几乎未消耗正文流量，可安全回退下一通道）
    BeforeBody(String),
    /// 已读取较多正文数据（> 64 KB）后中断/超时或超出体积上限（严禁重试放大流量）
    MidStreamOrLimit(String),
    /// 明确的语义错误（401 / 403 / 404），不应盲目切镜像重试
    Semantic(String),
}

/// 流式拉取单个 URL 的二进制内容（含单包体积上限、单块超时与流中断保护，杜绝大包中断后重复烧流量）
async fn stream_bytes_once(
    client: &reqwest::Client,
    label: &str,
    url: &str,
    auth_header: Option<(&str, &str)>,
    max_bytes: usize,
) -> Result<Vec<u8>, BytesFetchError> {
    let mut req = client
        .get(url)
        .header("User-Agent", "SkillHub-Desktop/0.3");
    if let Some((h_name, h_val)) = auth_header {
        req = req.header(h_name, h_val);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| BytesFetchError::BeforeBody(format!("{}失败: {}", label, e)))?;

    let code = resp.status().as_u16();
    if code == 404 {
        return Err(BytesFetchError::Semantic(format!(
            "远程资源不存在 (HTTP 404): {}",
            url
        )));
    }
    if code == 401 || code == 403 {
        return Err(BytesFetchError::Semantic(format!(
            "{}拒绝访问或受限 (HTTP {})",
            label, code
        )));
    }
    if !resp.status().is_success() {
        return Err(BytesFetchError::BeforeBody(format!("{} HTTP {}", label, code)));
    }

    if let Some(content_len) = resp.content_length() {
        if content_len as usize > max_bytes {
            return Err(BytesFetchError::MidStreamOrLimit(format!(
                "远程文件体积 ({:.1} MB) 超出安全上限 ({:.0} MB)，已取消下载以保护流量与内存",
                content_len as f64 / (1024.0 * 1024.0),
                max_bytes as f64 / (1024.0 * 1024.0)
            )));
        }
    }

    let mut buffer = Vec::new();
    let mut stream_resp = resp;
    loop {
        match tokio::time::timeout(Duration::from_secs(20), stream_resp.chunk()).await {
            Ok(Ok(Some(chunk))) => {
                if buffer.len().saturating_add(chunk.len()) > max_bytes {
                    return Err(BytesFetchError::MidStreamOrLimit(format!(
                        "远程文件体积超出安全上限 ({:.0} MB)，已中止下载以保护流量与内存",
                        max_bytes as f64 / (1024.0 * 1024.0)
                    )));
                }
                buffer.extend_from_slice(&chunk);
            }
            Ok(Ok(None)) => return Ok(buffer),
            Ok(Err(e)) => {
                let msg = format!("{}读取响应体中断: {}", label, e);
                return if buffer.len() > 64 * 1024 {
                    Err(BytesFetchError::MidStreamOrLimit(msg))
                } else {
                    Err(BytesFetchError::BeforeBody(msg))
                };
            }
            Err(_) => {
                let msg = format!("{}读取数据流超时", label);
                return if buffer.len() > 64 * 1024 {
                    Err(BytesFetchError::MidStreamOrLimit(msg))
                } else {
                    Err(BytesFetchError::BeforeBody(msg))
                };
            }
        }
    }
}

/// 三通道容错二进制拉取（系统代理 → 直连/TUN → gh-proxy 镜像且严禁传 Token；流中断绝不重复重试放大流量）
async fn fetch_bytes_resilient(
    url: &str,
    auth_header: Option<(&str, &str)>,
    allow_mirror: bool,
    timeout_secs: u64,
    max_bytes: usize,
) -> Result<Vec<u8>, String> {
    let clients = build_http_clients(timeout_secs);
    let has_proxy = clients.len() > 1;
    let can_mirror_url = allow_mirror && is_github_mirrorable_url(url);
    let mut errors = Vec::new();
    let mut mirror_tried = false;

    // 无代理且无认证头的公开 GitHub 资源：优先走国内高速镜像，镜像建连或状态失败后再回退官方直连
    if !has_proxy && can_mirror_url && auth_header.is_none() {
        if let Some((_, direct_client, _)) = clients.first() {
            mirror_tried = true;
            let mirror_url = format!("https://gh-proxy.com/{}", url);
            match stream_bytes_once(direct_client, "镜像通道", &mirror_url, None, max_bytes).await {
                Ok(bytes) => return Ok(bytes),
                Err(BytesFetchError::MidStreamOrLimit(msg)) => return Err(msg),
                Err(BytesFetchError::BeforeBody(msg)) | Err(BytesFetchError::Semantic(msg)) => {
                    errors.push(msg);
                }
            }
        }
    }

    for (label, client, can_mirror_here) in &clients {
        match stream_bytes_once(client, label, url, auth_header, max_bytes).await {
            Ok(bytes) => return Ok(bytes),
            Err(BytesFetchError::MidStreamOrLimit(msg)) => return Err(msg),
            Err(BytesFetchError::Semantic(msg)) => return Err(msg),
            Err(BytesFetchError::BeforeBody(msg)) => errors.push(msg),
        }

        // 官方通道在建连阶段失败时兜底走镜像（严禁携带任何 Authorization 头）
        if !mirror_tried && *can_mirror_here && can_mirror_url {
            mirror_tried = true;
            let mirror_url = format!("https://gh-proxy.com/{}", url);
            match stream_bytes_once(client, "镜像通道", &mirror_url, None, max_bytes).await {
                Ok(bytes) => return Ok(bytes),
                Err(BytesFetchError::MidStreamOrLimit(msg)) => return Err(msg),
                Err(BytesFetchError::BeforeBody(msg)) | Err(BytesFetchError::Semantic(msg)) => {
                    errors.push(msg);
                }
            }
        }
    }

    Err(format!("下载失败 ({})", errors.join("; ")))
}

/// 构造站点对应的认证请求头
fn build_auth_header(host: &str, token: Option<&str>) -> Option<(String, String)> {
    let t = token?.trim();
    if t.is_empty() {
        return None;
    }
    if host == "github.com" {
        Some(("Authorization".to_string(), format!("Bearer {}", t)))
    } else {
        Some(("PRIVATE-TOKEN".to_string(), t.to_string()))
    }
}

/// 查询某站点生效的访问令牌（优先使用数据库 host_tokens，其次使用前端透传的 GitHub Token）
fn resolve_host_token(
    state: &State<'_, AppState>,
    host: &str,
    fallback_github_token: Option<&str>,
) -> Option<String> {
    let norm = normalize_host(host);
    {
        let db = state.db.lock().unwrap();
        if let Ok(tok) = db.query_row(
            "SELECT token FROM host_tokens WHERE host = ?1",
            rusqlite::params![norm],
            |row| row.get::<_, String>(0),
        ) {
            let trimmed = tok.trim().to_string();
            if !trimmed.is_empty() {
                return Some(trimmed);
            }
        }
    }
    if norm == "github.com" {
        if let Some(fb) = fallback_github_token {
            let trimmed = fb.trim().to_string();
            if !trimmed.is_empty() {
                return Some(trimmed);
            }
        }
    }
    None
}

/// 兼容容错的 SKILL.md Frontmatter 解析器
/// 优先使用 serde_yaml；若社区 SKILL.md 含未加引号的冒号导致严格 YAML 失败，自动回退按行容错解析
pub fn parse_skill_md_frontmatter(content: &str, fallback_name: &str) -> (String, String, Vec<String>) {
    let clean = content.trim_start_matches('\u{feff}').trim_start();
    let mut name = String::new();
    let mut description = String::new();
    let mut tags: Vec<String> = Vec::new();

    if clean.starts_with("---") {
        let rest = &clean[3..];
        let rest = rest.strip_prefix("\r\n").or_else(|| rest.strip_prefix('\n')).unwrap_or(rest);
        // 查找结束分隔线 ---
        let mut end_idx: Option<usize> = None;
        let mut offset = 0usize;
        for line in rest.split_inclusive('\n') {
            if line.trim() == "---" {
                end_idx = Some(offset);
                break;
            }
            offset += line.len();
        }

        if let Some(idx) = end_idx {
            let yaml_str = &rest[..idx];
            if let Ok(val) = serde_yaml::from_str::<serde_yaml::Value>(yaml_str) {
                if let Some(n) = val.get("name").and_then(|v| v.as_str()) {
                    name = n.trim().to_string();
                }
                if let Some(d) = val.get("description").and_then(|v| v.as_str()) {
                    description = d.trim().to_string();
                }
                if let Some(seq) = val.get("tags").and_then(|v| v.as_sequence()) {
                    tags = seq
                        .iter()
                        .filter_map(|v| v.as_str().map(|s| s.trim().to_string()))
                        .filter(|s| !s.is_empty())
                        .collect();
                }
            } else {
                // 容错回退：逐行提取 name: / description:
                for line in yaml_str.lines() {
                    let trimmed = line.trim();
                    if name.is_empty() {
                        if let Some(v) = trimmed.strip_prefix("name:") {
                            name = v.trim().trim_matches('"').trim_matches('\'').to_string();
                            continue;
                        }
                    }
                    if description.is_empty() {
                        if let Some(v) = trimmed.strip_prefix("description:") {
                            let val = v.trim().trim_matches('"').trim_matches('\'');
                            if val != "|" && val != ">" && !val.is_empty() {
                                description = val.to_string();
                            }
                        }
                    }
                }
            }
        }
    }

    // 若未解析出 description，从正文首段提取一句简短描述
    if description.is_empty() {
        let body = if clean.starts_with("---") {
            clean
                .splitn(3, "---")
                .nth(2)
                .unwrap_or("")
        } else {
            clean
        };
        for line in body.lines() {
            let t = line.trim();
            if t.is_empty() || t.starts_with('#') || t.starts_with("![") || t.starts_with('<') || t.starts_with("```") {
                continue;
            }
            description = t.chars().take(240).collect();
            break;
        }
    }

    if name.is_empty() {
        name = fallback_name.to_string();
    }

    (name, description, tags)
}

/// 符合 RFC 4180 的轻量 CSV 解析器（支持带引号字段、内嵌逗号/换行、双引号转义、UTF-8 BOM）
pub fn parse_csv_records(input: &str) -> Vec<HashMap<String, String>> {
    let clean = input.trim_start_matches('\u{feff}');
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut current_row: Vec<String> = Vec::new();
    let mut field = String::new();
    let mut in_quotes = false;
    let mut chars = clean.chars().peekable();

    while let Some(c) = chars.next() {
        if in_quotes {
            if c == '"' {
                if chars.peek() == Some(&'"') {
                    chars.next();
                    field.push('"');
                } else {
                    in_quotes = false;
                }
            } else {
                field.push(c);
            }
        } else {
            match c {
                '"' if field.is_empty() => {
                    in_quotes = true;
                }
                ',' => {
                    current_row.push(std::mem::take(&mut field));
                }
                '\r' => {
                    if chars.peek() == Some(&'\n') {
                        chars.next();
                    }
                    current_row.push(std::mem::take(&mut field));
                    if !(current_row.len() == 1 && current_row[0].is_empty()) {
                        rows.push(std::mem::take(&mut current_row));
                    } else {
                        current_row.clear();
                    }
                }
                '\n' => {
                    current_row.push(std::mem::take(&mut field));
                    if !(current_row.len() == 1 && current_row[0].is_empty()) {
                        rows.push(std::mem::take(&mut current_row));
                    } else {
                        current_row.clear();
                    }
                }
                _ => field.push(c),
            }
        }
    }

    if !field.is_empty() || !current_row.is_empty() {
        current_row.push(field);
        rows.push(current_row);
    }

    if rows.len() < 2 {
        return Vec::new();
    }

    let headers: Vec<String> = rows[0]
        .iter()
        .map(|h| h.trim().to_lowercase())
        .collect();

    let mut result = Vec::with_capacity(rows.len() - 1);
    for row in rows.into_iter().skip(1) {
        if row.iter().all(|v| v.trim().is_empty()) {
            continue;
        }
        let mut map = HashMap::with_capacity(headers.len());
        for (idx, key) in headers.iter().enumerate() {
            let val = row.get(idx).map(|s| s.trim().to_string()).unwrap_or_default();
            map.insert(key.clone(), val);
        }
        result.push(map);
    }

    result
}

/// 从数据库读取缓存（检查是否在 TTL 秒数内）
pub(crate) fn get_cache_entry(
    state: &State<'_, AppState>,
    key: &str,
    ttl_secs: i64,
) -> Option<(String, Option<String>, String)> {
    let db = state.db.lock().unwrap();
    let row = db
        .query_row(
            "SELECT payload, etag_or_sha, updated_at FROM resource_cache WHERE cache_key = ?1",
            rusqlite::params![key],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?, r.get::<_, String>(2)?)),
        )
        .ok()?;

    if let Ok(dt) = DateTime::parse_from_rfc3339(&row.2) {
        let age = Utc::now().signed_duration_since(dt.with_timezone(&Utc)).num_seconds();
        if age <= ttl_secs {
            return Some(row);
        }
    }
    None
}

/// 读取任意陈旧缓存作为断网兜底
pub(crate) fn get_stale_cache_entry(
    state: &State<'_, AppState>,
    key: &str,
) -> Option<(String, Option<String>, String)> {
    let db = state.db.lock().unwrap();
    db.query_row(
        "SELECT payload, etag_or_sha, updated_at FROM resource_cache WHERE cache_key = ?1",
        rusqlite::params![key],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?, r.get::<_, String>(2)?)),
    )
    .ok()
}

/// 写入缓存表
pub(crate) fn set_cache_entry(
    state: &State<'_, AppState>,
    key: &str,
    payload: &str,
    etag_or_sha: Option<&str>,
) {
    let db = state.db.lock().unwrap();
    let now = Utc::now().to_rfc3339();
    let _ = db.execute(
        "INSERT INTO resource_cache (cache_key, payload, etag_or_sha, updated_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload, etag_or_sha=excluded.etag_or_sha, updated_at=excluded.updated_at",
        rusqlite::params![key, payload, etag_or_sha, now],
    );
}

/// 读取或初始化默认订阅仓库
fn ensure_default_subscribed_repos_seeded(db: &rusqlite::Connection) {
    let already_seeded = db
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'resource_hub_repos_seeded'",
            [],
            |r| r.get::<_, String>(0),
        )
        .ok()
        .is_some();

    if already_seeded {
        return;
    }

    let existing_count: i64 = db
        .query_row("SELECT COUNT(*) FROM subscribed_repos", [], |r| r.get(0))
        .unwrap_or(0);

    if existing_count == 0 {
        let now = Utc::now().to_rfc3339();
        for (owner, repo, branch) in DEFAULT_SUBSCRIBED_REPOS {
            let id = format!("github.com/{}/{}", owner.to_lowercase(), repo.to_lowercase());
            let _ = db.execute(
                "INSERT OR IGNORE INTO subscribed_repos (id, host, owner, repo, branch, enabled, skill_count, created_at)
                 VALUES (?1, 'github.com', ?2, ?3, ?4, 1, 0, ?5)",
                rusqlite::params![id, owner, repo, branch, now],
            );
        }
    }

    let _ = db.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('resource_hub_repos_seeded', '1')",
        [],
    );
}

/// 获取 GitHub 仓库完整目录树（带 6 小时 SQLite 缓存，自动识别 main/master/default_branch）
async fn fetch_github_repo_tree(
    state: Option<&State<'_, AppState>>,
    owner: &str,
    repo: &str,
    preferred_branch: Option<&str>,
    token: Option<&str>,
    force_refresh: bool,
) -> Result<CachedGitTree, String> {
    let branch_hint = preferred_branch.unwrap_or("").trim();
    let cache_key = format!(
        "gh_tree:{}/{}:{}",
        owner.to_lowercase(),
        repo.to_lowercase(),
        if branch_hint.is_empty() { "default" } else { branch_hint }
    );

    if !force_refresh {
        if let Some(st) = state {
            if let Some((payload, _, _)) = get_cache_entry(st, &cache_key, 6 * 3600) {
                if let Ok(parsed) = serde_json::from_str::<CachedGitTree>(&payload) {
                    return Ok(parsed);
                }
            }
        }
    }

    let auth = build_auth_header("github.com", token);
    let auth_ref = auth.as_ref().map(|(k, v)| (k.as_str(), v.as_str()));

    let mut candidate_branches: Vec<String> = Vec::new();
    if !branch_hint.is_empty() {
        candidate_branches.push(branch_hint.to_string());
    } else {
        candidate_branches.push("main".to_string());
        candidate_branches.push("master".to_string());
    }

    let mut last_err = String::new();
    let mut rate_limited = false;

    for branch in &candidate_branches {
        let url = format!(
            "https://api.github.com/repos/{}/{}/git/trees/{}?recursive=1",
            owner, repo, branch
        );
        match fetch_text_resilient(&url, auth_ref, true, true, 18).await {
            Ok((200, body)) => {
                if let Ok(api_resp) = serde_json::from_str::<GitHubTreeApiResponse>(&body) {
                    let tree = CachedGitTree {
                        branch: branch.clone(),
                        commit_sha: api_resp.sha,
                        entries: api_resp.tree,
                    };
                    if let Some(st) = state {
                        if let Ok(json_str) = serde_json::to_string(&tree) {
                            set_cache_entry(st, &cache_key, &json_str, Some(&tree.commit_sha));
                        }
                    }
                    return Ok(tree);
                }
                last_err = "解析 GitHub Tree JSON 失败".to_string();
            }
            Ok((404, _)) => {
                last_err = format!("分支 {} 不存在", branch);
                continue;
            }
            Ok((403, body)) | Ok((429, body)) => {
                rate_limited = true;
                last_err = format!("GitHub API 限流或无权限 ({})", body.chars().take(120).collect::<String>());
                break;
            }
            Ok((code, _)) => {
                last_err = format!("GitHub API 返回 HTTP {}", code);
            }
            Err(e) => {
                last_err = e;
            }
        }
    }

    // 若未命中 main/master 且非限流，尝试查询仓库元信息获取真实 default_branch
    if !rate_limited && branch_hint.is_empty() {
        let meta_url = format!("https://api.github.com/repos/{}/{}", owner, repo);
        if let Ok((200, body)) = fetch_text_resilient(&meta_url, auth_ref, true, true, 12).await {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&body) {
                if let Some(def_branch) = v.get("default_branch").and_then(|b| b.as_str()) {
                    if !candidate_branches.iter().any(|b| b == def_branch) {
                        let url = format!(
                            "https://api.github.com/repos/{}/{}/git/trees/{}?recursive=1",
                            owner, repo, def_branch
                        );
                        if let Ok((200, tree_body)) = fetch_text_resilient(&url, auth_ref, true, true, 18).await {
                            if let Ok(api_resp) = serde_json::from_str::<GitHubTreeApiResponse>(&tree_body) {
                                let tree = CachedGitTree {
                                    branch: def_branch.to_string(),
                                    commit_sha: api_resp.sha,
                                    entries: api_resp.tree,
                                };
                                if let Some(st) = state {
                                    if let Ok(json_str) = serde_json::to_string(&tree) {
                                        set_cache_entry(st, &cache_key, &json_str, Some(&tree.commit_sha));
                                    }
                                }
                                return Ok(tree);
                            }
                        }
                    }
                }
            }
        }
    }

    // 若有旧缓存作为容错降级
    if let Some(st) = state {
        if let Some((payload, _, _)) = get_stale_cache_entry(st, &cache_key) {
            if let Ok(parsed) = serde_json::from_str::<CachedGitTree>(&payload) {
                return Ok(parsed);
            }
        }
    }

    Err(format!("获取仓库 {}/{} 目录树失败: {}", owner, repo, last_err))
}

/// 仓库内存 ZIP 扫描上限（150 MB），避免超大二进制仓库造成流量与内存飙升
const MAX_REPO_ZIP_SCAN_BYTES: usize = 150 * 1024 * 1024;
/// 单技能 Raw 文件下载上限（30 MB）
const MAX_RAW_FILE_BYTES: usize = 30 * 1024 * 1024;

/// 下载 GitHub 仓库 ZIP 压缩包到内存（每分支仅用唯一标准 codeload 地址 + 体积上限 + 流中断保护，绝不双地址重复下载）
async fn download_github_repo_zip_bytes(
    owner: &str,
    repo: &str,
    preferred_branch: Option<&str>,
    token: Option<&str>,
) -> Result<(String, Vec<u8>), String> {
    let auth = build_auth_header("github.com", token);
    let auth_ref = auth.as_ref().map(|(k, v)| (k.as_str(), v.as_str()));

    let mut branches = Vec::new();
    if let Some(b) = preferred_branch {
        if !b.trim().is_empty() {
            branches.push(b.trim().to_string());
        }
    }
    if branches.is_empty() {
        branches.push("main".to_string());
        branches.push("master".to_string());
    }

    let mut last_err = String::new();
    for branch in branches {
        // 仅请求唯一的官方 codeload 地址（不再叠加会 302 跳转回 codeload 的 github.com/archive/*.zip）
        let url = format!(
            "https://codeload.github.com/{}/{}/zip/refs/heads/{}",
            owner, repo, branch
        );
        match fetch_bytes_resilient(&url, auth_ref, true, 90, MAX_REPO_ZIP_SCAN_BYTES).await {
            Ok(bytes) if bytes.len() > 22 && &bytes[0..2] == b"PK" => {
                return Ok((branch, bytes));
            }
            Ok(_) => {
                last_err = "返回内容不是有效 ZIP 归档".to_string();
            }
            Err(e) => {
                // 若遇到体积超限或流中断/超时，直接停止不再尝试其他分支重复下载
                if e.contains("超出安全上限") || e.contains("读取响应体中断") || e.contains("读取数据流超时") {
                    return Err(format!("下载仓库 {}/{} 压缩包失败: {}", owner, repo, e));
                }
                last_err = e;
            }
        }
    }

    Err(format!("下载仓库 {}/{} 压缩包失败: {}", owner, repo, last_err))
}

/// 判断目录树路径是否为需要忽略的噪音目录
fn is_ignored_skill_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.starts_with(".git/")
        || lower.contains("/.git/")
        || lower.starts_with("node_modules/")
        || lower.contains("/node_modules/")
        || lower.starts_with("__pycache__/")
        || lower.contains("/__pycache__/")
}

/// 从 SKILL.md 路径计算其所在子目录路径与默认技能名
fn derive_subpath_and_fallback_name(skill_md_path: &str, repo_name: &str) -> (String, String) {
    let norm = skill_md_path.trim_matches('/');
    let subpath = if let Some(pos) = norm.rfind('/') {
        norm[..pos].to_string()
    } else {
        String::new()
    };
    let fallback_name = if subpath.is_empty() {
        repo_name.to_string()
    } else {
        subpath.rsplit('/').next().unwrap_or(repo_name).to_string()
    };
    (subpath, fallback_name)
}

/// 纯内存扫描 ZIP 归档中全部 SKILL.md（用于 >35 技能的大仓索引或 API 限流降级）
fn scan_skills_from_zip_bytes(
    zip_bytes: Vec<u8>,
    repo_name: &str,
) -> Result<Vec<(String, String, String, String, Vec<String>, Option<String>)>, String> {
    let reader = std::io::Cursor::new(zip_bytes);
    let mut archive = zip::ZipArchive::new(reader).map_err(|e| format!("无法解析 ZIP 归档: {}", e))?;
    let mut results = Vec::new();
    let mut seen_subpaths = HashSet::new();

    for i in 0..archive.len() {
        let mut file = match archive.by_index(i) {
            Ok(f) => f,
            Err(_) => continue,
        };
        if file.is_dir() {
            continue;
        }
        let raw_name = file.name().replace('\\', "/");
        // 剥离 GitHub ZIP 最外层 `<repo>-<branch>/` 目录前缀
        let rel_path = match raw_name.find('/') {
            Some(pos) => &raw_name[pos + 1..],
            None => continue,
        };
        if rel_path.is_empty() || is_ignored_skill_path(rel_path) {
            continue;
        }
        let file_name = rel_path.rsplit('/').next().unwrap_or("");
        if !file_name.eq_ignore_ascii_case("SKILL.md") {
            continue;
        }

        let (subpath, fallback_name) = derive_subpath_and_fallback_name(rel_path, repo_name);
        if !seen_subpaths.insert(subpath.clone()) {
            continue;
        }

        // 只读取前 32 KB 以加速解析大仓 Frontmatter
        let mut buf = Vec::new();
        let _ = file.by_ref().take(32 * 1024).read_to_end(&mut buf);
        let content = String::from_utf8_lossy(&buf);
        let (parsed_name, description, tags) = parse_skill_md_frontmatter(&content, &fallback_name);
        let skill_slug = if fallback_name.is_empty() {
            parsed_name.clone()
        } else {
            fallback_name
        };

        results.push((
            skill_slug,
            parsed_name,
            description,
            subpath,
            tags,
            Some(rel_path.to_string()),
        ));
    }

    results.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()));
    Ok(results)
}

/// 将 ZIP 中的指定子目录精准安全解压到目标目录
fn extract_subpath_from_zip_bytes(
    zip_bytes: Vec<u8>,
    subpath: &str,
    dest_dir: &Path,
) -> Result<usize, String> {
    let reader = std::io::Cursor::new(zip_bytes);
    let mut archive = zip::ZipArchive::new(reader).map_err(|e| format!("无法打开 ZIP: {}", e))?;
    let norm_sub = subpath.trim_matches('/');
    let prefix = if norm_sub.is_empty() {
        String::new()
    } else {
        format!("{}/", norm_sub)
    };

    std::fs::create_dir_all(dest_dir).map_err(|e| format!("创建目标目录失败: {}", e))?;
    let mut count = 0usize;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("读取 ZIP 条目失败: {}", e))?;
        let raw_name = entry.name().replace('\\', "/");
        let rel_in_repo = match raw_name.find('/') {
            Some(pos) => &raw_name[pos + 1..],
            None => continue,
        };
        if rel_in_repo.is_empty() {
            continue;
        }

        let target_rel = if prefix.is_empty() {
            rel_in_repo
        } else if let Some(stripped) = rel_in_repo.strip_prefix(&prefix) {
            stripped
        } else {
            continue;
        };

        if target_rel.is_empty() || is_ignored_skill_path(target_rel) {
            continue;
        }

        // 防 Zip-Slip 路径穿越检查
        let mut safe_path = PathBuf::new();
        let mut unsafe_comp = false;
        for comp in Path::new(target_rel).components() {
            match comp {
                Component::Normal(part) => safe_path.push(part),
                Component::CurDir => {}
                _ => {
                    unsafe_comp = true;
                    break;
                }
            }
        }
        if unsafe_comp || safe_path.as_os_str().is_empty() {
            continue;
        }

        let out_path = dest_dir.join(&safe_path);
        if entry.is_dir() {
            let _ = std::fs::create_dir_all(&out_path);
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("创建子目录失败: {}", e))?;
            }
            let mut out_file = std::fs::File::create(&out_path)
                .map_err(|e| format!("写入文件 {} 失败: {}", out_path.display(), e))?;
            std::io::copy(&mut entry, &mut out_file)
                .map_err(|e| format!("复制文件 {} 失败: {}", out_path.display(), e))?;
            count += 1;
        }
    }

    if count == 0 {
        return Err(format!("ZIP 归档中未找到子目录 '{}' 对应的文件", subpath));
    }
    Ok(count)
}

/// 定位结果：用于预览与单技能精准提取
struct ResolvedRemoteSkill {
    branch: String,
    commit_sha: String,
    subpath: String,
    skill_md_path: String,
    tree_sha: Option<String>,
    files: Vec<RemoteSkillFileEntry>,
    repo_skill_count: usize,
}

/// 统一技能路径解析器（Skill Path Resolver）
/// 支持：显式 subpath → 目录名精准匹配 → 单技能根 SKILL.md → Frontmatter name 匹配
async fn resolve_remote_skill_internal(
    state: Option<&State<'_, AppState>>,
    owner: &str,
    repo: &str,
    preferred_branch: Option<&str>,
    skill_name: &str,
    explicit_subpath: Option<&str>,
    token: Option<&str>,
    force_refresh_tree: bool,
) -> Result<ResolvedRemoteSkill, String> {
    let tree = fetch_github_repo_tree(state, owner, repo, preferred_branch, token, force_refresh_tree).await?;

    // 收集仓库中全部 SKILL.md
    let skill_mds: Vec<&GitTreeItem> = tree
        .entries
        .iter()
        .filter(|e| {
            e.item_type == "blob"
                && !is_ignored_skill_path(&e.path)
                && e.path.rsplit('/').next().map(|n| n.eq_ignore_ascii_case("SKILL.md")).unwrap_or(false)
        })
        .collect();

    let repo_skill_count = skill_mds.len();
    let target_subpath_opt = explicit_subpath.map(|s| s.trim_matches('/').to_string());
    let target_name_lower = skill_name.trim().to_lowercase();

    let mut matched_md: Option<&GitTreeItem> = None;

    // Tier 1: 显式 subpath 精准匹配
    if let Some(ref sub) = target_subpath_opt {
        matched_md = skill_mds.iter().copied().find(|item| {
            let (item_sub, _) = derive_subpath_and_fallback_name(&item.path, repo);
            item_sub.eq_ignore_ascii_case(sub)
        });
    }

    // Tier 2: 目录名匹配（忽略大小写及连字符/下划线微小差异）
    if matched_md.is_none() && !target_name_lower.is_empty() {
        let norm_target = target_name_lower.replace('_', "-");
        matched_md = skill_mds.iter().copied().find(|item| {
            let (item_sub, fallback) = derive_subpath_and_fallback_name(&item.path, repo);
            let last_dir = item_sub.rsplit('/').next().unwrap_or(&fallback).to_lowercase();
            last_dir == target_name_lower || last_dir.replace('_', "-") == norm_target
        });
    }

    // Tier 2.5: 仓库仅有 1 个技能（或根 SKILL.md）时直接命中
    if matched_md.is_none() && skill_mds.len() == 1 {
        matched_md = Some(skill_mds[0]);
    }

    // Tier 3: 若候选数合理（≤ 25），拉取候选 SKILL.md Frontmatter 匹配 name 字段
    if matched_md.is_none() && !skill_mds.is_empty() && skill_mds.len() <= 25 && !target_name_lower.is_empty() {
        let auth = build_auth_header("github.com", token);
        let auth_ref = auth.as_ref().map(|(k, v)| (k.as_str(), v.as_str()));
        for item in &skill_mds {
            let raw_url = format!(
                "https://raw.githubusercontent.com/{}/{}/{}/{}",
                owner, repo, tree.branch, item.path
            );
            if let Ok((200, text)) = fetch_text_resilient(&raw_url, auth_ref, false, true, 10).await {
                let (_, fallback) = derive_subpath_and_fallback_name(&item.path, repo);
                let (fm_name, _, _) = parse_skill_md_frontmatter(&text, &fallback);
                if fm_name.to_lowercase() == target_name_lower
                    || fm_name.to_lowercase().replace(' ', "-") == target_name_lower
                {
                    matched_md = Some(*item);
                    break;
                }
            }
        }
    }

    // Tier 4: 子串模糊匹配目录名
    if matched_md.is_none() && !target_name_lower.is_empty() {
        matched_md = skill_mds.iter().copied().find(|item| {
            let (item_sub, _) = derive_subpath_and_fallback_name(&item.path, repo);
            item_sub.to_lowercase().contains(&target_name_lower)
        });
    }

    let (subpath, skill_md_path) = if let Some(md) = matched_md {
        let (sub, _) = derive_subpath_and_fallback_name(&md.path, repo);
        (sub, md.path.clone())
    } else if let Some(sub) = target_subpath_opt {
        let md_path = if sub.is_empty() {
            "SKILL.md".to_string()
        } else {
            format!("{}/SKILL.md", sub)
        };
        (sub, md_path)
    } else if repo_skill_count == 0 {
        // 没有标准 SKILL.md（可能是传统 README / 提示词仓库），降级指向仓库根
        (String::new(), "README.md".to_string())
    } else {
        return Err(format!(
            "在仓库 {}/{} 中未找到技能「{}」（该仓库共含 {} 个技能）",
            owner, repo, skill_name, repo_skill_count
        ));
    };

    // 查找子目录本身的 tree SHA（若为根目录则用仓库 commit_sha）
    let tree_sha = if subpath.is_empty() {
        Some(tree.commit_sha.clone())
    } else {
        tree.entries
            .iter()
            .find(|e| e.item_type == "tree" && e.path == subpath)
            .map(|e| e.sha.clone())
            .or_else(|| Some(tree.commit_sha.clone()))
    };

    // 收集该子目录下的全部文件
    let prefix = if subpath.is_empty() {
        String::new()
    } else {
        format!("{}/", subpath)
    };
    let mut files: Vec<RemoteSkillFileEntry> = tree
        .entries
        .iter()
        .filter(|e| e.item_type == "blob" && !is_ignored_skill_path(&e.path))
        .filter_map(|e| {
            let rel = if prefix.is_empty() {
                e.path.as_str()
            } else {
                e.path.strip_prefix(&prefix)?
            };
            if rel.is_empty() {
                return None;
            }
            Some(RemoteSkillFileEntry {
                path: rel.to_string(),
                size: e.size.unwrap_or(0),
            })
        })
        .collect();
    files.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(ResolvedRemoteSkill {
        branch: tree.branch,
        commit_sha: tree.commit_sha,
        subpath,
        skill_md_path,
        tree_sha,
        files,
        repo_skill_count,
    })
}

/// 安全清理文件夹名称
fn sanitize_folder_name(raw: &str) -> String {
    let cleaned: String = raw
        .trim()
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches(|c| c == '-' || c == '.');
    if trimmed.is_empty() {
        "skill".to_string()
    } else {
        trimmed.to_string()
    }
}

/// 智能双策略下载子目录内容到本地暂存目录（小技能并发 Raw 秒装 / 重型技能自动回退过滤 ZIP）
async fn download_subskill_to_dir(
    owner: &str,
    repo: &str,
    branch: &str,
    subpath: &str,
    files: &[RemoteSkillFileEntry],
    dest_dir: &Path,
    token: Option<&str>,
) -> Result<(), String> {
    let total_bytes: u64 = files.iter().map(|f| f.size).sum();
    let use_raw_fast_path = !files.is_empty() && files.len() <= 25 && total_bytes <= 3 * 1024 * 1024;

    if use_raw_fast_path {
        std::fs::create_dir_all(dest_dir).map_err(|e| format!("创建目录失败: {}", e))?;
        let auth = build_auth_header("github.com", token);
        let sem = Arc::new(Semaphore::new(6));
        let mut handles = Vec::with_capacity(files.len());

        for f in files {
            let permit = sem.clone().acquire_owned().await.map_err(|e| e.to_string())?;
            let owner_s = owner.to_string();
            let repo_s = repo.to_string();
            let branch_s = branch.to_string();
            let rel_path = f.path.clone();
            let full_repo_path = if subpath.is_empty() {
                rel_path.clone()
            } else {
                format!("{}/{}", subpath.trim_matches('/'), rel_path)
            };
            let dest = dest_dir.to_path_buf();
            let auth_clone = auth.clone();

            handles.push(tokio::spawn(async move {
                let _permit = permit;
                // 对路径分段 URL 编码，兼容含空格或中文文件名
                let encoded_path = full_repo_path
                    .split('/')
                    .map(|seg| urlencoding::encode(seg).into_owned())
                    .collect::<Vec<_>>()
                    .join("/");
                let raw_url = format!(
                    "https://raw.githubusercontent.com/{}/{}/{}/{}",
                    owner_s, repo_s, branch_s, encoded_path
                );
                let auth_ref = auth_clone.as_ref().map(|(k, v)| (k.as_str(), v.as_str()));
                let bytes = fetch_bytes_resilient(&raw_url, auth_ref, true, 20, MAX_RAW_FILE_BYTES).await?;

                // 防路径穿越
                let mut safe_rel = PathBuf::new();
                for comp in Path::new(&rel_path).components() {
                    if let Component::Normal(part) = comp {
                        safe_rel.push(part);
                    }
                }
                let out_path = dest.join(safe_rel);
                if let Some(parent) = out_path.parent() {
                    std::fs::create_dir_all(parent).map_err(|e| format!("创建子目录失败: {}", e))?;
                }
                std::fs::write(&out_path, &bytes)
                    .map_err(|e| format!("写入文件 {} 失败: {}", out_path.display(), e))?;
                Ok::<(), String>(())
            }));
        }

        let mut raw_failed = false;
        for h in handles {
            match h.await {
                Ok(Ok(())) => {}
                _ => {
                    raw_failed = true;
                }
            }
        }
        if !raw_failed {
            return Ok(());
        }
        // Raw 通道有文件失败时，清空暂存目录并优雅回退到 ZIP 过滤提取
        let _ = std::fs::remove_dir_all(dest_dir);
    }

    // 归档回退通道：下载仓库 ZIP 并仅提取目标 subpath
    let (_, zip_bytes) = download_github_repo_zip_bytes(owner, repo, Some(branch), token).await?;
    let sub_owned = subpath.to_string();
    let dest_owned = dest_dir.to_path_buf();
    tauri::async_runtime::spawn_blocking(move || {
        extract_subpath_from_zip_bytes(zip_bytes, &sub_owned, &dest_owned)
    })
    .await
    .map_err(|e| format!("解压子技能任务异常: {}", e))??;

    Ok(())
}

/// 原子替换目标目录：若目标已存在则先备份并在失败时自动回滚，最后清理暂存与备份目录
fn atomic_place_dir(staging_dir: &Path, final_dir: &Path) -> Result<(), String> {
    if !final_dir.exists() {
        return std::fs::rename(staging_dir, final_dir).map_err(|e| {
            let _ = std::fs::remove_dir_all(staging_dir);
            format!("落盘技能目录失败: {}", e)
        });
    }

    let parent = final_dir
        .parent()
        .ok_or_else(|| "无法确定目标父目录".to_string())?;
    let backup = parent.join(format!(".skillhub_bak_{}", uuid::Uuid::new_v4()));
    if let Err(e) = std::fs::rename(final_dir, &backup) {
        let _ = std::fs::remove_dir_all(staging_dir);
        return Err(format!("备份旧技能目录失败: {}", e));
    }

    if let Err(e) = std::fs::rename(staging_dir, final_dir) {
        let _ = std::fs::rename(&backup, final_dir);
        let _ = std::fs::remove_dir_all(staging_dir);
        return Err(format!("替换更新文件失败: {}", e));
    }

    let _ = std::fs::remove_dir_all(&backup);
    Ok(())
}

/// 当 GitHub Trees API 限流或异常时，用轻量 raw 请求探测目标技能是否直接位于仓库根目录（0 REST API 配额）
async fn probe_root_skill_without_api(
    owner: &str,
    repo: &str,
    preferred_branch: Option<&str>,
    skill_name: &str,
    token: Option<&str>,
) -> Option<ResolvedRemoteSkill> {
    let auth = build_auth_header("github.com", token);
    let auth_ref = auth.as_ref().map(|(k, v)| (k.as_str(), v.as_str()));

    let mut branches = Vec::new();
    if let Some(b) = preferred_branch {
        let trimmed = b.trim();
        if !trimmed.is_empty() {
            branches.push(trimmed.to_string());
        }
    }
    if branches.is_empty() {
        branches.push("main".to_string());
        branches.push("master".to_string());
    }

    let target_norm = skill_name.trim().to_lowercase().replace('_', "-");
    let repo_norm = repo.trim().to_lowercase().replace('_', "-");

    for br in branches {
        let raw_url = format!(
            "https://raw.githubusercontent.com/{}/{}/{}/SKILL.md",
            owner, repo, br
        );
        if let Ok((200, text)) = fetch_text_resilient(&raw_url, auth_ref, false, true, 10).await {
            let (fm_name, _, _) = parse_skill_md_frontmatter(&text, repo);
            let fm_norm = fm_name.trim().to_lowercase().replace('_', "-");
            if repo_norm == target_norm || fm_norm == target_norm {
                return Some(ResolvedRemoteSkill {
                    branch: br,
                    commit_sha: String::new(),
                    subpath: String::new(),
                    skill_md_path: "SKILL.md".to_string(),
                    tree_sha: None,
                    files: Vec::new(),
                    repo_skill_count: 1,
                });
            }
        }
    }
    None
}

/// 构造用于 Git 克隆的规范 GitHub 地址（未显式指定分支时克隆远端默认 HEAD）
fn build_github_clone_url(owner: &str, repo: &str, explicit_branch: Option<&str>) -> String {
    if let Some(br) = explicit_branch {
        let trimmed = br.trim();
        if !trimmed.is_empty() && !trimmed.contains('/') {
            return format!("https://github.com/{}/{}/tree/{}", owner, repo, trimmed);
        }
    }
    format!("https://github.com/{}/{}.git", owner, repo)
}

/// 更新已通过资源中心精准安装的单技能（供 pull_single_repo / 批量同步原生调用）
/// 优化：支持读取已配置站点 Token + 同路径并发锁 + 前置 ~500 字节 Commit SHA 零 API 配额极速比对
/// 若历史安装记录为根目录单技能（subpath 为空），检测到上游更新时自动转正为完整 Git 增量仓库
pub async fn update_installed_subskill(
    state: &State<'_, AppState>,
    dir: &Path,
) -> Result<String, String> {
    let _op_guard = crate::git_engine::acquire_repo_op_lock(dir).await;

    let meta = read_source_meta(dir)
        .ok_or_else(|| "未找到技能来源元数据 .skillhub-source.json".to_string())?;

    if meta.host != "github.com" {
        return Err(format!("暂不支持自动更新非 GitHub 站点单技能 ({})", meta.host));
    }

    // 1. 先通过 ~500 字节的 git-upload-pack info/refs 比对远端最新 Commit SHA（0 GitHub REST API 配额、0 ZIP 流量）
    let system_proxy = crate::git_engine::detect_system_proxy();
    let remote_head_sha = crate::git_engine::fetch_remote_head_sha(
        &meta.owner,
        &meta.repo,
        if meta.branch.trim().is_empty() {
            None
        } else {
            Some(meta.branch.as_str())
        },
        system_proxy.as_deref(),
    )
    .await;

    if let (Some(ref local_sha), Some(ref latest_sha)) = (&meta.commit_sha, &remote_head_sha) {
        if !local_sha.is_empty() && local_sha.eq_ignore_ascii_case(latest_sha) {
            return Ok("已是最新".to_string());
        }
    }

    // 2. 仓库存在新提交（或旧记录缺少 commit_sha）时，携带已配置的站点 Token 查询目录树，精确核对目标子目录 tree_sha
    let token = resolve_host_token(state, &meta.host, None);
    let resolved = resolve_remote_skill_internal(
        Some(state),
        &meta.owner,
        &meta.repo,
        Some(&meta.branch),
        &meta.skill_name,
        Some(&meta.subpath),
        token.as_deref(),
        true,
    )
    .await?;

    // 若目标子目录 tree_sha 未变化，仅刷新本地 commit_sha（确保下次检查恢复 0 配额秒过）并返回 "已是最新"
    if meta.tree_sha.is_some() && meta.tree_sha == resolved.tree_sha {
        let mut refreshed_meta = meta.clone();
        refreshed_meta.commit_sha = remote_head_sha.or(Some(resolved.commit_sha));
        refreshed_meta.updated_at = Some(Utc::now().to_rfc3339());
        if let Ok(meta_json) = serde_json::to_string_pretty(&refreshed_meta) {
            let _ = std::fs::write(dir.join(SOURCE_META_FILENAME), meta_json);
        }
        return Ok("已是最新".to_string());
    }

    let parent = dir
        .parent()
        .ok_or_else(|| "无法确定目标父目录".to_string())?;
    let staging = parent.join(format!(".skillhub_upd_{}", uuid::Uuid::new_v4()));

    // 3. 若为根目录单技能（subpath 为空），检测到上游更新时自动通过 git clone 转正为标准 Git 增量仓库，统一与外部导入的更新体验
    if resolved.subpath.is_empty() {
        let clone_url = build_github_clone_url(&meta.owner, &meta.repo, Some(&resolved.branch));
        if let Err(e) = crate::git_engine::clone_repository(None, &clone_url, &staging).await {
            let _ = std::fs::remove_dir_all(&staging);
            return Err(e);
        }
        atomic_place_dir(&staging, dir)?;
        return Ok("更新成功（已升级为 Git 增量同步）".to_string());
    }

    let dl_res = download_subskill_to_dir(
        &meta.owner,
        &meta.repo,
        &resolved.branch,
        &resolved.subpath,
        &resolved.files,
        &staging,
        token.as_deref(),
    )
    .await;

    if let Err(e) = dl_res {
        let _ = std::fs::remove_dir_all(&staging);
        return Err(e);
    }

    // 写入更新后的溯源元数据
    let mut new_meta = meta.clone();
    new_meta.branch = resolved.branch;
    new_meta.subpath = resolved.subpath;
    new_meta.tree_sha = resolved.tree_sha;
    new_meta.commit_sha = remote_head_sha.or(Some(resolved.commit_sha));
    new_meta.updated_at = Some(Utc::now().to_rfc3339());
    if let Ok(meta_json) = serde_json::to_string_pretty(&new_meta) {
        let _ = std::fs::write(staging.join(SOURCE_META_FILENAME), meta_json);
    }

    atomic_place_dir(&staging, dir)?;
    Ok("更新成功".to_string())
}

// ============================================================================
// Tauri Commands：订阅仓库管理
// ============================================================================

#[tauri::command]
pub fn get_subscribed_repos(state: State<'_, AppState>) -> Result<Vec<SubscribedRepo>, String> {
    let db = state.db.lock().unwrap();
    ensure_default_subscribed_repos_seeded(&db);

    let mut stmt = db
        .prepare(
            "SELECT id, host, owner, repo, branch, enabled, last_commit_sha, skill_count, last_synced_at, created_at
             FROM subscribed_repos
             ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |r| {
            Ok(SubscribedRepo {
                id: r.get(0)?,
                host: r.get(1)?,
                owner: r.get(2)?,
                repo: r.get(3)?,
                branch: r.get(4)?,
                enabled: r.get(5)?,
                last_commit_sha: r.get(6)?,
                skill_count: r.get(7)?,
                last_synced_at: r.get(8)?,
                created_at: r.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for r in rows {
        if let Ok(item) = r {
            list.push(item);
        }
    }
    Ok(list)
}

#[tauri::command]
pub fn add_subscribed_repo(
    state: State<'_, AppState>,
    repo_url: String,
    branch: Option<String>,
) -> Result<SubscribedRepo, String> {
    let (host, owner, repo, url_branch) = parse_repo_input(&repo_url)?;
    let eff_branch = branch
        .map(|b| b.trim().to_string())
        .filter(|b| !b.is_empty())
        .or(url_branch)
        .unwrap_or_default();

    let id = format!(
        "{}/{}/{}",
        host.to_lowercase(),
        owner.to_lowercase(),
        repo.to_lowercase()
    );
    let now = Utc::now().to_rfc3339();

    let db = state.db.lock().unwrap();
    ensure_default_subscribed_repos_seeded(&db);

    let exists: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM subscribed_repos WHERE id = ?1)",
            rusqlite::params![id],
            |r| r.get(0),
        )
        .unwrap_or(false);
    if exists {
        return Err(format!("仓库 {}/{} 已在订阅列表中", owner, repo));
    }

    db.execute(
        "INSERT INTO subscribed_repos (id, host, owner, repo, branch, enabled, skill_count, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 1, 0, ?6)",
        rusqlite::params![id, host, owner, repo, eff_branch, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(SubscribedRepo {
        id,
        host,
        owner,
        repo,
        branch: eff_branch,
        enabled: true,
        last_commit_sha: None,
        skill_count: 0,
        last_synced_at: None,
        created_at: now,
    })
}

#[tauri::command]
pub fn toggle_subscribed_repo(
    state: State<'_, AppState>,
    repo_id: String,
    enabled: bool,
) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.execute(
        "UPDATE subscribed_repos SET enabled = ?1 WHERE id = ?2",
        rusqlite::params![enabled, repo_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_subscribed_repo(state: State<'_, AppState>, repo_id: String) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    let _ = db.execute(
        "DELETE FROM subscribed_repo_skills WHERE repo_id = ?1",
        rusqlite::params![repo_id],
    );
    db.execute(
        "DELETE FROM subscribed_repos WHERE id = ?1",
        rusqlite::params![repo_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_subscribed_repo_skills(
    state: State<'_, AppState>,
    only_enabled: Option<bool>,
) -> Result<Vec<SubscribedRepoSkill>, String> {
    let db = state.db.lock().unwrap();
    ensure_default_subscribed_repos_seeded(&db);

    let filter_enabled = only_enabled.unwrap_or(true);
    let sql = if filter_enabled {
        "SELECT s.id, s.repo_id, r.host, r.owner, r.repo, r.branch, s.skill_name, s.display_name, s.description, s.subpath, s.skill_md_path, s.tree_sha, s.tags
         FROM subscribed_repo_skills s
         INNER JOIN subscribed_repos r ON r.id = s.repo_id
         WHERE r.enabled = 1
         ORDER BY s.skill_name COLLATE NOCASE ASC"
    } else {
        "SELECT s.id, s.repo_id, r.host, r.owner, r.repo, r.branch, s.skill_name, s.display_name, s.description, s.subpath, s.skill_md_path, s.tree_sha, s.tags
         FROM subscribed_repo_skills s
         INNER JOIN subscribed_repos r ON r.id = s.repo_id
         ORDER BY s.skill_name COLLATE NOCASE ASC"
    };

    let mut stmt = db.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            let tags_raw: Option<String> = r.get(12)?;
            let tags: Vec<String> = tags_raw
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default();
            let skill_name: String = r.get(6)?;
            let display_name: String = r
                .get::<_, Option<String>>(7)?
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| skill_name.clone());
            Ok(SubscribedRepoSkill {
                id: r.get(0)?,
                repo_id: r.get(1)?,
                host: r.get(2)?,
                owner: r.get(3)?,
                repo: r.get(4)?,
                branch: r.get(5)?,
                skill_name,
                display_name,
                description: r.get(8)?,
                subpath: r.get(9)?,
                skill_md_path: r.get(10)?,
                tree_sha: r.get(11)?,
                tags,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for r in rows {
        if let Ok(item) = r {
            items.push(item);
        }
    }
    Ok(items)
}

/// 同步单个订阅仓库的技能清单（小仓 Raw 并发 / 大仓 1 次 ZIP 内存扫描，零落盘）
#[tauri::command]
pub async fn sync_subscribed_repo(
    state: State<'_, AppState>,
    repo_id: String,
    force: Option<bool>,
    github_token: Option<String>,
) -> Result<SubscribedRepoSyncResult, String> {
    let repo_row = {
        let db = state.db.lock().unwrap();
        db.query_row(
            "SELECT id, host, owner, repo, branch, enabled, last_commit_sha, skill_count, last_synced_at, created_at
             FROM subscribed_repos WHERE id = ?1",
            rusqlite::params![repo_id],
            |r| {
                Ok(SubscribedRepo {
                    id: r.get(0)?,
                    host: r.get(1)?,
                    owner: r.get(2)?,
                    repo: r.get(3)?,
                    branch: r.get(4)?,
                    enabled: r.get(5)?,
                    last_commit_sha: r.get(6)?,
                    skill_count: r.get(7)?,
                    last_synced_at: r.get(8)?,
                    created_at: r.get(9)?,
                })
            },
        )
        .map_err(|_| format!("未找到订阅仓库: {}", repo_id))?
    };

    let force_sync = force.unwrap_or(false);
    let token = resolve_host_token(&state, &repo_row.host, github_token.as_deref());
    let branch_pref = if repo_row.branch.trim().is_empty() {
        None
    } else {
        Some(repo_row.branch.as_str())
    };

    // 非 GitHub（如自建 GitLab）走 GitLab Repository Tree API
    if repo_row.host != "github.com" {
        return sync_gitlab_subscribed_repo(&state, &repo_row, token.as_deref()).await;
    }

    // 前置 ~500 字节轻量 Commit SHA 比对（不消耗 GitHub REST API 限额、零 ZIP 下载）
    // 只要本地已有缓存技能且远端最新 Commit SHA 与上次完全一致，即使手动点击“刷新”也无需重复拉取整包 ZIP
    let system_proxy = crate::git_engine::detect_system_proxy();
    let remote_head_sha = crate::git_engine::fetch_remote_head_sha(
        &repo_row.owner,
        &repo_row.repo,
        branch_pref,
        system_proxy.as_deref(),
    )
    .await;

    if repo_row.skill_count > 0 {
        if let (Some(ref local_sha), Some(ref latest_sha)) =
            (&repo_row.last_commit_sha, &remote_head_sha)
        {
            if !local_sha.is_empty() && local_sha.eq_ignore_ascii_case(latest_sha) {
                let now = Utc::now().to_rfc3339();
                {
                    let db = state.db.lock().unwrap();
                    let _ = db.execute(
                        "UPDATE subscribed_repos SET last_synced_at = ?1 WHERE id = ?2",
                        rusqlite::params![now, repo_row.id],
                    );
                }
                return Ok(SubscribedRepoSyncResult {
                    repo_id: repo_row.id,
                    branch: repo_row.branch,
                    skill_count: repo_row.skill_count as usize,
                    skipped_unchanged: true,
                    commit_sha: Some(latest_sha.clone()),
                });
            }
        }
    }

    // 优先通过 GitHub Trees API 获取目录树
    let tree_res = fetch_github_repo_tree(
        Some(&state),
        &repo_row.owner,
        &repo_row.repo,
        branch_pref,
        token.as_deref(),
        force_sync,
    )
    .await;

    let (resolved_branch, commit_sha, scanned_rows): (
        String,
        Option<String>,
        Vec<(String, String, String, String, String, Option<String>, Vec<String>)>,
    ) = match tree_res {
        Ok(tree) => {
            // 若 Commit SHA 无变化且已有本地缓存，直接零带宽跳过
            if repo_row.skill_count > 0
                && repo_row.last_commit_sha.as_deref() == Some(tree.commit_sha.as_str())
            {
                let now = Utc::now().to_rfc3339();
                {
                    let db = state.db.lock().unwrap();
                    let _ = db.execute(
                        "UPDATE subscribed_repos SET last_synced_at = ?1 WHERE id = ?2",
                        rusqlite::params![now, repo_row.id],
                    );
                }
                return Ok(SubscribedRepoSyncResult {
                    repo_id: repo_row.id,
                    branch: tree.branch,
                    skill_count: repo_row.skill_count as usize,
                    skipped_unchanged: true,
                    commit_sha: Some(tree.commit_sha),
                });
            }

            let skill_mds: Vec<GitTreeItem> = tree
                .entries
                .iter()
                .filter(|e| {
                    e.item_type == "blob"
                        && !is_ignored_skill_path(&e.path)
                        && e.path.rsplit('/').next().map(|n| n.eq_ignore_ascii_case("SKILL.md")).unwrap_or(false)
                })
                .cloned()
                .collect();

            // 建立 subpath -> tree_sha 映射
            let dir_sha_map: HashMap<String, String> = tree
                .entries
                .iter()
                .filter(|e| e.item_type == "tree")
                .map(|e| (e.path.clone(), e.sha.clone()))
                .collect();

            if skill_mds.len() > 35 {
                // 大仓库（如 ComposioHQ 864 个技能）：1 次内存 ZIP 扫描全部 SKILL.md，避免 864 次 HTTP 请求
                let (zip_branch, zip_bytes) = download_github_repo_zip_bytes(
                    &repo_row.owner,
                    &repo_row.repo,
                    Some(&tree.branch),
                    token.as_deref(),
                )
                .await?;
                let repo_name_owned = repo_row.repo.clone();
                let parsed_zip = tauri::async_runtime::spawn_blocking(move || {
                    scan_skills_from_zip_bytes(zip_bytes, &repo_name_owned)
                })
                .await
                .map_err(|e| format!("内存扫描大仓库异常: {}", e))??;

                let rows = parsed_zip
                    .into_iter()
                    .map(|(slug, disp, desc, sub, tags, md_opt)| {
                        let tsha = if sub.is_empty() {
                            Some(tree.commit_sha.clone())
                        } else {
                            dir_sha_map.get(&sub).cloned().or_else(|| Some(tree.commit_sha.clone()))
                        };
                        let md_path = md_opt.unwrap_or_else(|| {
                            if sub.is_empty() {
                                "SKILL.md".to_string()
                            } else {
                                format!("{}/SKILL.md", sub)
                            }
                        });
                        (slug, disp, desc, sub, md_path, tsha, tags)
                    })
                    .collect();

                (zip_branch, remote_head_sha.or(Some(tree.commit_sha)), rows)
            } else {
                // 中小仓库（≤35 技能）：并发拉取 Raw SKILL.md，1~2 秒极速完成
                let auth = build_auth_header("github.com", token.as_deref());
                let sem = Arc::new(Semaphore::new(8));
                let mut handles = Vec::with_capacity(skill_mds.len());

                for md in skill_mds {
                    let permit = sem.clone().acquire_owned().await.map_err(|e| e.to_string())?;
                    let owner_s = repo_row.owner.clone();
                    let repo_s = repo_row.repo.clone();
                    let branch_s = tree.branch.clone();
                    let auth_c = auth.clone();
                    let (subpath, fallback_name) = derive_subpath_and_fallback_name(&md.path, &repo_s);
                    let tsha = if subpath.is_empty() {
                        Some(tree.commit_sha.clone())
                    } else {
                        dir_sha_map.get(&subpath).cloned().or_else(|| Some(tree.commit_sha.clone()))
                    };

                    handles.push(tokio::spawn(async move {
                        let _permit = permit;
                        let encoded_path = md
                            .path
                            .split('/')
                            .map(|seg| urlencoding::encode(seg).into_owned())
                            .collect::<Vec<_>>()
                            .join("/");
                        let raw_url = format!(
                            "https://raw.githubusercontent.com/{}/{}/{}/{}",
                            owner_s, repo_s, branch_s, encoded_path
                        );
                        let auth_ref = auth_c.as_ref().map(|(k, v)| (k.as_str(), v.as_str()));
                        let (display_name, description, tags) =
                            match fetch_text_resilient(&raw_url, auth_ref, false, true, 12).await {
                                Ok((200, text)) => parse_skill_md_frontmatter(&text, &fallback_name),
                                _ => (fallback_name.clone(), String::new(), Vec::new()),
                            };
                        (fallback_name, display_name, description, subpath, md.path, tsha, tags)
                    }));
                }

                let mut rows = Vec::new();
                for h in handles {
                    if let Ok(item) = h.await {
                        rows.push(item);
                    }
                }
                (tree.branch, remote_head_sha.or(Some(tree.commit_sha)), rows)
            }
        }
        Err(_) => {
            // 当 GitHub API 限流（403/429）时，自动降级为 1 次 ZIP 内存扫描，不消耗 API 配额
            let (zip_branch, zip_bytes) = download_github_repo_zip_bytes(
                &repo_row.owner,
                &repo_row.repo,
                branch_pref,
                token.as_deref(),
            )
            .await?;
            let repo_name_owned = repo_row.repo.clone();
            let parsed_zip = tauri::async_runtime::spawn_blocking(move || {
                scan_skills_from_zip_bytes(zip_bytes, &repo_name_owned)
            })
            .await
            .map_err(|e| format!("内存扫描归档异常: {}", e))??;

            let rows = parsed_zip
                .into_iter()
                .map(|(slug, disp, desc, sub, tags, md_opt)| {
                    let md_path = md_opt.unwrap_or_else(|| {
                        if sub.is_empty() {
                            "SKILL.md".to_string()
                        } else {
                            format!("{}/SKILL.md", sub)
                        }
                    });
                    (slug, disp, desc, sub, md_path, None, tags)
                })
                .collect();

            // 保留远端 Commit SHA（不再写 None），确保限流降级后下次刷新依然可以 0 流量跳过
            let resolved_sha = match remote_head_sha {
                Some(sha) => Some(sha),
                None => {
                    crate::git_engine::fetch_remote_head_sha(
                        &repo_row.owner,
                        &repo_row.repo,
                        Some(&zip_branch),
                        system_proxy.as_deref(),
                    )
                    .await
                }
            };
            (zip_branch, resolved_sha, rows)
        }
    };

    // 事务写入 SQLite 缓存
    let skill_count = scanned_rows.len();
    let now = Utc::now().to_rfc3339();
    {
        let mut db = state.db.lock().unwrap();
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM subscribed_repo_skills WHERE repo_id = ?1",
            rusqlite::params![repo_row.id],
        )
        .map_err(|e| e.to_string())?;

        for (skill_name, display_name, description, subpath, skill_md_path, tree_sha, tags) in scanned_rows {
            let entry_id = format!("{}::{}", repo_row.id, subpath);
            let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());
            tx.execute(
                "INSERT OR REPLACE INTO subscribed_repo_skills
                 (id, repo_id, skill_name, display_name, description, subpath, skill_md_path, tree_sha, tags)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                rusqlite::params![
                    entry_id,
                    repo_row.id,
                    skill_name,
                    display_name,
                    description,
                    subpath,
                    skill_md_path,
                    tree_sha,
                    tags_json
                ],
            )
            .map_err(|e| e.to_string())?;
        }

        tx.execute(
            "UPDATE subscribed_repos
             SET branch = ?1, last_commit_sha = ?2, skill_count = ?3, last_synced_at = ?4
             WHERE id = ?5",
            rusqlite::params![resolved_branch, commit_sha, skill_count as i64, now, repo_row.id],
        )
        .map_err(|e| e.to_string())?;

        tx.commit().map_err(|e| e.to_string())?;
    }

    Ok(SubscribedRepoSyncResult {
        repo_id: repo_row.id,
        branch: resolved_branch,
        skill_count,
        skipped_unchanged: false,
        commit_sha,
    })
}

/// 自建 GitLab 仓库扫描支持
async fn sync_gitlab_subscribed_repo(
    state: &State<'_, AppState>,
    repo_row: &SubscribedRepo,
    token: Option<&str>,
) -> Result<SubscribedRepoSyncResult, String> {
    let project_path = urlencoding::encode(&format!("{}/{}", repo_row.owner, repo_row.repo)).into_owned();
    let branch = if repo_row.branch.trim().is_empty() {
        "main".to_string()
    } else {
        repo_row.branch.clone()
    };
    let url = format!(
        "https://{}/api/v4/projects/{}/repository/tree?recursive=true&per_page=100&ref={}",
        repo_row.host,
        project_path,
        urlencoding::encode(&branch)
    );
    let auth = build_auth_header(&repo_row.host, token);
    let auth_ref = auth.as_ref().map(|(k, v)| (k.as_str(), v.as_str()));

    let (status, body) = fetch_text_resilient(&url, auth_ref, true, false, 18).await?;
    if status < 200 || status >= 300 {
        return Err(format!("GitLab 仓库索引失败 (HTTP {})，私有仓请先在抽屉底部配置站点访问令牌", status));
    }

    let items: Vec<serde_json::Value> = serde_json::from_str(&body)
        .map_err(|e| format!("解析 GitLab Tree 失败: {}", e))?;

    let skill_mds: Vec<String> = items
        .iter()
        .filter_map(|v| {
            let t = v.get("type")?.as_str()?;
            let p = v.get("path")?.as_str()?;
            if t == "blob" && p.rsplit('/').next()?.eq_ignore_ascii_case("SKILL.md") {
                Some(p.to_string())
            } else {
                None
            }
        })
        .collect();

    let mut rows = Vec::new();
    for md_path in skill_mds.into_iter().take(60) {
        let (subpath, fallback_name) = derive_subpath_and_fallback_name(&md_path, &repo_row.repo);
        let raw_url = format!(
            "https://{}/api/v4/projects/{}/repository/files/{}/raw?ref={}",
            repo_row.host,
            project_path,
            urlencoding::encode(&md_path),
            urlencoding::encode(&branch)
        );
        let (display_name, description, tags) =
            match fetch_text_resilient(&raw_url, auth_ref, false, false, 12).await {
                Ok((200, text)) => parse_skill_md_frontmatter(&text, &fallback_name),
                _ => (fallback_name.clone(), String::new(), Vec::new()),
            };
        rows.push((fallback_name, display_name, description, subpath, md_path, tags));
    }

    let skill_count = rows.len();
    let now = Utc::now().to_rfc3339();
    {
        let mut db = state.db.lock().unwrap();
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM subscribed_repo_skills WHERE repo_id = ?1",
            rusqlite::params![repo_row.id],
        )
        .map_err(|e| e.to_string())?;
        for (skill_name, display_name, description, subpath, skill_md_path, tags) in rows {
            let entry_id = format!("{}::{}", repo_row.id, subpath);
            let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());
            tx.execute(
                "INSERT OR REPLACE INTO subscribed_repo_skills
                 (id, repo_id, skill_name, display_name, description, subpath, skill_md_path, tree_sha, tags)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8)",
                rusqlite::params![
                    entry_id,
                    repo_row.id,
                    skill_name,
                    display_name,
                    description,
                    subpath,
                    skill_md_path,
                    tags_json
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.execute(
            "UPDATE subscribed_repos SET branch = ?1, skill_count = ?2, last_synced_at = ?3 WHERE id = ?4",
            rusqlite::params![branch, skill_count as i64, now, repo_row.id],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
    }

    Ok(SubscribedRepoSyncResult {
        repo_id: repo_row.id.clone(),
        branch,
        skill_count,
        skipped_unchanged: false,
        commit_sha: None,
    })
}

// ============================================================================
// Tauri Commands：多站点访问令牌管理
// ============================================================================

#[tauri::command]
pub fn get_host_tokens(state: State<'_, AppState>) -> Result<Vec<HostTokenInfo>, String> {
    let db = state.db.lock().unwrap();
    let mut stmt = db
        .prepare("SELECT host, token, updated_at FROM host_tokens ORDER BY host ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            let host: String = r.get(0)?;
            let raw: String = r.get(1)?;
            let updated_at: String = r.get(2)?;
            Ok(HostTokenInfo {
                host,
                masked_token: mask_token(&raw),
                updated_at,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for r in rows {
        if let Ok(item) = r {
            list.push(item);
        }
    }
    Ok(list)
}

#[tauri::command]
pub fn save_host_token(
    state: State<'_, AppState>,
    host: String,
    token: String,
) -> Result<HostTokenInfo, String> {
    let norm_host = normalize_host(&host);
    let trimmed = token.trim().to_string();
    if norm_host.is_empty() || trimmed.is_empty() {
        return Err("站点域名和访问令牌均不能为空".to_string());
    }
    let now = Utc::now().to_rfc3339();
    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT INTO host_tokens (host, token, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(host) DO UPDATE SET token=excluded.token, updated_at=excluded.updated_at",
        rusqlite::params![norm_host, trimmed, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(HostTokenInfo {
        host: norm_host,
        masked_token: mask_token(&trimmed),
        updated_at: now,
    })
}

#[tauri::command]
pub fn delete_host_token(state: State<'_, AppState>, host: String) -> Result<(), String> {
    let norm_host = normalize_host(&host);
    let db = state.db.lock().unwrap();
    db.execute("DELETE FROM host_tokens WHERE host = ?1", rusqlite::params![norm_host])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================================
// Tauri Commands：Linkly AI 每日实时榜单（CC BY 4.0，零爬虫直连 CSV）
// ============================================================================

fn parse_opt_i64(map: &HashMap<String, String>, key: &str) -> Option<i64> {
    map.get(key)
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .and_then(|s| s.parse::<i64>().ok().or_else(|| s.parse::<f64>().ok().map(|f| f as i64)))
}

fn parse_opt_f64(map: &HashMap<String, String>, key: &str) -> Option<f64> {
    map.get(key)
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .and_then(|s| s.parse::<f64>().ok())
}

fn parse_linkly_csv(csv_text: &str) -> Vec<LinklyRankingItem> {
    let records = parse_csv_records(csv_text);
    let mut items = Vec::with_capacity(records.len());

    for (idx, row) in records.into_iter().enumerate() {
        let skill = row.get("skill").cloned().unwrap_or_default();
        if skill.is_empty() {
            continue;
        }
        let rank = parse_opt_i64(&row, "rank").unwrap_or((idx + 1) as i64);
        let skill_key = row.get("skill_key").cloned().unwrap_or_default();
        let platform = row.get("platform").cloned().unwrap_or_default();
        let vendor = row.get("vendor").cloned().unwrap_or_default();
        let source_skillssh = row.get("source_skillssh").cloned().unwrap_or_default();
        let slug_clawhub = row.get("slug_clawhub").cloned().unwrap_or_default();
        let url = row.get("url").cloned().unwrap_or_default();
        let repo_url = row.get("repo_url").cloned().unwrap_or_default();
        let install_cmd = row.get("install").cloned().unwrap_or_default();
        let description = row.get("description").cloned().unwrap_or_default();
        let description_zh = row.get("description_zh").cloned().unwrap_or_default();
        let category = row.get("category").cloned().unwrap_or_default();

        let gh = extract_github_owner_repo(&repo_url, &source_skillssh, &install_cmd);
        let can_direct_install = gh.is_some();
        let (github_owner, github_repo) = match gh {
            Some((o, r)) => (Some(o), Some(r)),
            None => (None, None),
        };

        items.push(LinklyRankingItem {
            rank,
            skill,
            skill_key,
            platform,
            vendor,
            source_skillssh,
            slug_clawhub,
            url,
            repo_url,
            install_cmd,
            description,
            description_zh,
            category,
            installs_skillssh: parse_opt_i64(&row, "installs_skillssh"),
            downloads_clawhub: parse_opt_i64(&row, "downloads_clawhub"),
            downloads_skillhub_cn: parse_opt_i64(&row, "downloads_skillhub_cn"),
            installs_or_downloads: parse_opt_i64(&row, "installs_or_downloads"),
            wis: parse_opt_f64(&row, "wis"),
            weekly_recent: parse_opt_i64(&row, "weekly_recent"),
            growth_pct: parse_opt_f64(&row, "growth_pct"),
            first_seen_days: parse_opt_i64(&row, "first_seen_days"),
            verified_by: row.get("verified_by").cloned().filter(|s| !s.is_empty()),
            buzz_score: parse_opt_f64(&row, "buzz_score"),
            last_update: row.get("last_update").cloned().filter(|s| !s.is_empty()),
            can_direct_install,
            github_owner,
            github_repo,
        });
    }

    items
}

/// 从 LinklyAI/best-skills README.md 提取最新更新日期
async fn fetch_linkly_last_updated(state: &State<'_, AppState>, force_refresh: bool) -> Option<String> {
    const DATE_CACHE_KEY: &str = "linkly_last_updated_date";
    if !force_refresh {
        if let Some((date_val, _, _)) = get_cache_entry(state, DATE_CACHE_KEY, 6 * 3600) {
            return Some(date_val);
        }
    }
    let url = "https://raw.githubusercontent.com/LinklyAI/best-skills/main/README.md";
    if let Ok((200, body)) = fetch_text_resilient(url, None, false, true, 10).await {
        for line in body.lines().take(25) {
            if let Some(pos) = line.find("Last updated:") {
                let tail = &line[pos + "Last updated:".len()..];
                // 提取类似 **2026-11-23** 中的日期
                for token in tail.split(|c: char| !c.is_ascii_digit() && c != '-') {
                    if token.len() == 10 && token.as_bytes()[4] == b'-' && token.as_bytes()[7] == b'-' {
                        set_cache_entry(state, DATE_CACHE_KEY, token, None);
                        return Some(token.to_string());
                    }
                }
            }
        }
    }
    get_stale_cache_entry(state, DATE_CACHE_KEY).map(|(v, _, _)| v)
}

#[tauri::command]
pub async fn fetch_linkly_leaderboard(
    state: State<'_, AppState>,
    list_id: String,
    force_refresh: Option<bool>,
) -> Result<LinklyLeaderboardResponse, String> {
    let allowed = [
        "best-100",
        "trending-7d",
        "top-installs",
        "rising-stars",
        "official-100",
        "social-buzz",
        "most-active",
    ];
    let clean_id = list_id.trim().to_lowercase();
    if !allowed.contains(&clean_id.as_str()) {
        return Err(format!("不支持的榜单类型: {}", list_id));
    }

    let force = force_refresh.unwrap_or(false);
    let cache_key = format!("linkly_csv:{}", clean_id);

    // 12 小时缓存优先命中
    if !force {
        if let Some((payload, date_opt, updated_at)) = get_cache_entry(&state, &cache_key, 12 * 3600) {
            let items = parse_linkly_csv(&payload);
            if !items.is_empty() {
                return Ok(LinklyLeaderboardResponse {
                    list_id: clean_id,
                    last_updated: date_opt,
                    fetched_at: updated_at,
                    from_cache: true,
                    items,
                });
            }
        }
    }

    let url = format!(
        "https://raw.githubusercontent.com/LinklyAI/best-skills/main/data/latest/rankings/{}.csv",
        clean_id
    );

    match fetch_text_resilient(&url, None, false, true, 18).await {
        Ok((200, csv_text)) => {
            let items = parse_linkly_csv(&csv_text);
            if items.is_empty() {
                return Err("榜单 CSV 解析为空，请稍后重试".to_string());
            }
            let last_updated = fetch_linkly_last_updated(&state, force).await;
            set_cache_entry(&state, &cache_key, &csv_text, last_updated.as_deref());
            Ok(LinklyLeaderboardResponse {
                list_id: clean_id,
                last_updated,
                fetched_at: Utc::now().to_rfc3339(),
                from_cache: false,
                items,
            })
        }
        other => {
            // 网络异常时自动回退陈旧缓存
            if let Some((payload, date_opt, updated_at)) = get_stale_cache_entry(&state, &cache_key) {
                let items = parse_linkly_csv(&payload);
                if !items.is_empty() {
                    return Ok(LinklyLeaderboardResponse {
                        list_id: clean_id,
                        last_updated: date_opt,
                        fetched_at: updated_at,
                        from_cache: true,
                        items,
                    });
                }
            }
            match other {
                Ok((code, _)) => Err(format!("拉取 Linkly AI 榜单失败 (HTTP {})", code)),
                Err(e) => Err(format!("拉取 Linkly AI 榜单失败: {}", e)),
            }
        }
    }
}

// ============================================================================
// Tauri Commands：精选专题榜远程 JSON 热更新（24 小时缓存 + 国内镜像回退）
// ============================================================================

/// 校验精选专题榜 JSON 格式，防止远程异常文件破坏前端展示
pub fn validate_curated_leaderboards_json(raw: &str) -> Result<serde_json::Value, String> {
    let val: serde_json::Value =
        serde_json::from_str(raw).map_err(|e| format!("精选专题榜 JSON 解析失败: {}", e))?;

    let boards = val
        .get("leaderboards")
        .and_then(|v| v.as_array())
        .or_else(|| val.as_array())
        .ok_or_else(|| "精选专题榜缺少 leaderboards 数组".to_string())?;

    if boards.is_empty() {
        return Err("精选专题榜列表为空".to_string());
    }

    for b in boards {
        let has_id = b.get("id").and_then(|v| v.as_str()).map(|s| !s.trim().is_empty()).unwrap_or(false);
        let has_title = b.get("title").and_then(|v| v.as_str()).map(|s| !s.trim().is_empty()).unwrap_or(false);
        let has_items = b.get("items").and_then(|v| v.as_array()).map(|a| !a.is_empty()).unwrap_or(false);
        if !has_id || !has_title || !has_items {
            return Err("精选专题榜条目缺少必填字段 (id/title/items)".to_string());
        }
    }

    // 统一规范返回包装对象
    if val.is_array() {
        Ok(serde_json::json!({
            "schemaVersion": 1,
            "leaderboards": val,
        }))
    } else {
        Ok(val)
    }
}

#[tauri::command]
pub async fn fetch_curated_leaderboards(
    state: State<'_, AppState>,
    remote_url: Option<String>,
    force_refresh: Option<bool>,
) -> Result<serde_json::Value, String> {
    const DEFAULT_URL: &str =
        "https://raw.githubusercontent.com/VipBeCool/SkillHub/main/src/data/curated-leaderboards.json";
    const CACHE_KEY: &str = "curated_leaderboards:main";

    let url = remote_url
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_URL);
    let force = force_refresh.unwrap_or(false);

    // 24 小时缓存优先命中
    if !force {
        if let Some((payload, _, updated_at)) = get_cache_entry(&state, CACHE_KEY, 24 * 3600) {
            if let Ok(mut parsed) = validate_curated_leaderboards_json(&payload) {
                if let Some(obj) = parsed.as_object_mut() {
                    obj.insert("fromCache".to_string(), serde_json::json!(true));
                    obj.insert("fetchedAt".to_string(), serde_json::json!(updated_at));
                }
                return Ok(parsed);
            }
        }
    }

    match fetch_text_resilient(url, None, true, true, 12).await {
        Ok((200, body)) => {
            let mut parsed = validate_curated_leaderboards_json(&body)?;
            set_cache_entry(&state, CACHE_KEY, &body, None);
            if let Some(obj) = parsed.as_object_mut() {
                obj.insert("fromCache".to_string(), serde_json::json!(false));
                obj.insert("fetchedAt".to_string(), serde_json::json!(Utc::now().to_rfc3339()));
            }
            Ok(parsed)
        }
        other => {
            // 网络失败或 404 时，优先回退历史缓存，否则由前端静默使用内置默认 JSON
            if let Some((payload, _, updated_at)) = get_stale_cache_entry(&state, CACHE_KEY) {
                if let Ok(mut parsed) = validate_curated_leaderboards_json(&payload) {
                    if let Some(obj) = parsed.as_object_mut() {
                        obj.insert("fromCache".to_string(), serde_json::json!(true));
                        obj.insert("fetchedAt".to_string(), serde_json::json!(updated_at));
                    }
                    return Ok(parsed);
                }
            }
            match other {
                Ok((code, _)) => Err(format!("拉取远程精选专题榜失败 (HTTP {})", code)),
                Err(e) => Err(format!("拉取远程精选专题榜失败: {}", e)),
            }
        }
    }
}

// ============================================================================
// Tauri Commands：skills.sh 在线目录搜索（免配置、实时安装量）
// ============================================================================

#[tauri::command]
pub async fn search_skills_sh(
    query: String,
    limit: Option<usize>,
) -> Result<SkillsShSearchResponse, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(SkillsShSearchResponse {
            query: String::new(),
            skills: Vec::new(),
            count: 0,
            duration_ms: None,
        });
    }

    let eff_limit = limit.unwrap_or(20).clamp(1, 100);
    let url = format!(
        "https://skills.sh/api/search?q={}&limit={}",
        urlencoding::encode(trimmed),
        eff_limit
    );

    let (status, body) = fetch_text_resilient(&url, None, true, false, 15).await?;
    if status < 200 || status >= 300 {
        return Err(format!("skills.sh 检索返回 HTTP {}", status));
    }

    let json: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| format!("解析 skills.sh 响应失败: {}", e))?;

    let mut skills = Vec::new();
    if let Some(arr) = json.get("skills").and_then(|v| v.as_array()) {
        for item in arr {
            // 同时兼容 source 与历史字段 topSource
            let source = item
                .get("source")
                .or_else(|| item.get("topSource"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let skill_id = item
                .get("skillId")
                .or_else(|| item.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let name = item
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or(&skill_id)
                .trim()
                .to_string();
            let id = item
                .get("id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("{}/{}", source, skill_id));
            let installs = item
                .get("installs")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);

            let segs: Vec<&str> = source.split('/').filter(|s| !s.is_empty()).collect();
            if segs.len() < 2 || name.is_empty() {
                continue;
            }
            skills.push(SkillsShItem {
                id,
                source: source.clone(),
                skill_id,
                name,
                installs,
                owner: segs[0].to_string(),
                repo: segs[1].to_string(),
            });
        }
    }

    let count = skills.len();
    let duration_ms = json.get("duration_ms").and_then(|v| v.as_u64());

    Ok(SkillsShSearchResponse {
        query: trimmed.to_string(),
        skills,
        count,
        duration_ms,
    })
}

// ============================================================================
// Tauri Commands：安装前 SKILL.md 实时预览
// ============================================================================

#[tauri::command]
pub async fn fetch_remote_skill_preview(
    state: State<'_, AppState>,
    host: Option<String>,
    owner: String,
    repo: String,
    branch: Option<String>,
    skill_name: String,
    subpath: Option<String>,
    github_token: Option<String>,
) -> Result<RemoteSkillPreview, String> {
    let norm_host = normalize_host(host.as_deref().unwrap_or("github.com"));
    let token = resolve_host_token(&state, &norm_host, github_token.as_deref());

    if norm_host != "github.com" {
        let br = branch.unwrap_or_else(|| "main".to_string());
        let sub = subpath.unwrap_or_default();
        let md_path = if sub.is_empty() {
            "SKILL.md".to_string()
        } else {
            format!("{}/SKILL.md", sub.trim_matches('/'))
        };
        let project_path = urlencoding::encode(&format!("{}/{}", owner, repo)).into_owned();
        let raw_url = format!(
            "https://{}/api/v4/projects/{}/repository/files/{}/raw?ref={}",
            norm_host,
            project_path,
            urlencoding::encode(&md_path),
            urlencoding::encode(&br)
        );
        let auth = build_auth_header(&norm_host, token.as_deref());
        let auth_ref = auth.as_ref().map(|(k, v)| (k.as_str(), v.as_str()));
        let (_, content) = fetch_text_resilient(&raw_url, auth_ref, false, false, 15).await?;
        let (display_name, description, _) = parse_skill_md_frontmatter(&content, &skill_name);
        let repo_url = format!("https://{}/{}/{}", norm_host, owner, repo);
        let browse_url = if sub.is_empty() {
            repo_url.clone()
        } else {
            format!("{}/-/tree/{}/{}", repo_url, br, sub)
        };
        return Ok(RemoteSkillPreview {
            host: norm_host,
            owner,
            repo,
            branch: br,
            subpath: sub,
            skill_md_path: md_path,
            skill_name,
            display_name,
            description,
            content,
            files: Vec::new(),
            repo_url,
            browse_url,
            tree_sha: None,
            commit_sha: None,
            repo_skill_count: 1,
        });
    }

    let resolved = resolve_remote_skill_internal(
        Some(&state),
        &owner,
        &repo,
        branch.as_deref(),
        &skill_name,
        subpath.as_deref(),
        token.as_deref(),
        false,
    )
    .await?;

    let auth = build_auth_header("github.com", token.as_deref());
    let auth_ref = auth.as_ref().map(|(k, v)| (k.as_str(), v.as_str()));

    let encoded_md = resolved
        .skill_md_path
        .split('/')
        .map(|seg| urlencoding::encode(seg).into_owned())
        .collect::<Vec<_>>()
        .join("/");
    let raw_url = format!(
        "https://raw.githubusercontent.com/{}/{}/{}/{}",
        owner, repo, resolved.branch, encoded_md
    );

    let content = match fetch_text_resilient(&raw_url, auth_ref, false, true, 15).await {
        Ok((200, text)) => text,
        _ => format!(
            "# {}\n\n暂未能加载远程文档正文，可点击「在 GitHub 查看」浏览源文件。",
            skill_name
        ),
    };

    let (display_name, description, _) = parse_skill_md_frontmatter(&content, &skill_name);
    let repo_url = format!("https://github.com/{}/{}", owner, repo);
    let browse_url = if resolved.subpath.is_empty() {
        repo_url.clone()
    } else {
        format!("{}/tree/{}/{}", repo_url, resolved.branch, resolved.subpath)
    };

    Ok(RemoteSkillPreview {
        host: "github.com".to_string(),
        owner,
        repo,
        branch: resolved.branch,
        subpath: resolved.subpath,
        skill_md_path: resolved.skill_md_path,
        skill_name,
        display_name,
        description,
        content,
        files: resolved.files,
        repo_url,
        browse_url,
        tree_sha: resolved.tree_sha,
        commit_sha: Some(resolved.commit_sha),
        repo_skill_count: resolved.repo_skill_count,
    })
}

// ============================================================================
// Tauri Commands：单技能精准提取安装到 SkillHub 资源库
// ============================================================================

#[tauri::command]
pub async fn install_remote_subskill_to_workspace(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    host: Option<String>,
    owner: String,
    repo: String,
    branch: Option<String>,
    skill_name: String,
    subpath: Option<String>,
    target_source_dir_id: String,
    folder_name_override: Option<String>,
    provider: Option<String>,
    overwrite: Option<bool>,
    github_token: Option<String>,
) -> Result<InstallRemoteSkillResult, String> {
    let norm_host = normalize_host(host.as_deref().unwrap_or("github.com"));
    if norm_host != "github.com" {
        return Err("单技能精准提取目前仅支持 GitHub 仓库，自建 Git 仓库请使用整仓克隆".to_string());
    }

    // 1. 查询目标技能库目录路径
    let target_root = {
        let db = state.db.lock().unwrap();
        db.query_row(
            "SELECT path FROM source_directories WHERE id = ?1",
            rusqlite::params![target_source_dir_id],
            |r| r.get::<_, String>(0),
        )
        .map_err(|_| "未找到所选目标技能库，请检查设置".to_string())?
    };

    let target_root_path = PathBuf::from(&target_root);
    if !target_root_path.exists() {
        std::fs::create_dir_all(&target_root_path)
            .map_err(|e| format!("无法创建目标技能库目录: {}", e))?;
    }

    let token = resolve_host_token(&state, &norm_host, github_token.as_deref());
    let has_explicit_nonempty_subpath = subpath
        .as_deref()
        .is_some_and(|s| !s.trim().trim_matches('/').is_empty());

    // 2. 通过 Skill Path Resolver 定位精确子目录；若 GitHub API 限流且未指定深层子目录，再用 0 配额 raw 探测是否为根目录独立技能
    let resolved = match resolve_remote_skill_internal(
        Some(&state),
        &owner,
        &repo,
        branch.as_deref(),
        &skill_name,
        subpath.as_deref(),
        token.as_deref(),
        false,
    )
    .await
    {
        Ok(r) => r,
        Err(resolve_err) => {
            if !has_explicit_nonempty_subpath {
                if let Some(root_resolved) = probe_root_skill_without_api(
                    &owner,
                    &repo,
                    branch.as_deref(),
                    &skill_name,
                    token.as_deref(),
                )
                .await
                {
                    root_resolved
                } else {
                    return Err(resolve_err);
                }
            } else {
                return Err(resolve_err);
            }
        }
    };

    // 3. 计算最终落盘文件夹名，自动避开不同仓库同名技能碰撞（同时识别既有 .git 仓库避免重复生成后缀目录）
    let install_as_git_repo = resolved.subpath.is_empty();
    let base_slug = sanitize_folder_name(
        folder_name_override
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| {
                if !skill_name.trim().is_empty() {
                    skill_name.trim()
                } else if !resolved.subpath.is_empty() {
                    resolved.subpath.rsplit('/').next().unwrap_or(&repo)
                } else {
                    &repo
                }
            }),
    );

    let mut folder_name = base_slug.clone();
    let mut final_dir = target_root_path.join(&folder_name);
    let allow_overwrite = overwrite.unwrap_or(false);

    if final_dir.exists() {
        if let Some(existing_meta) = read_source_meta(&final_dir) {
            let same_upstream = existing_meta.owner.eq_ignore_ascii_case(&owner)
                && existing_meta.repo.eq_ignore_ascii_case(&repo)
                && existing_meta.subpath.eq_ignore_ascii_case(&resolved.subpath);
            if same_upstream && !allow_overwrite {
                return Err(format!("该技能「{}」已安装在当前技能库中", folder_name));
            }
            if !same_upstream {
                folder_name = format!("{}-{}", base_slug, sanitize_folder_name(&owner));
                final_dir = target_root_path.join(&folder_name);
                if final_dir.exists() && !allow_overwrite {
                    return Err(format!("目标目录「{}」已存在，请先清理后再试", folder_name));
                }
            }
        } else {
            let same_git_repo = install_as_git_repo
                && crate::git_engine::read_remote_url_from_git_config(&final_dir)
                    .and_then(|u| parse_repo_input(&u).ok())
                    .is_some_and(|(h, o, r, _)| {
                        h == norm_host && o.eq_ignore_ascii_case(&owner) && r.eq_ignore_ascii_case(&repo)
                    });
            if same_git_repo && !allow_overwrite {
                return Err(format!("该技能「{}」已安装在当前技能库中", folder_name));
            }
            if !same_git_repo && !allow_overwrite {
                folder_name = format!("{}-{}", base_slug, sanitize_folder_name(&owner));
                final_dir = target_root_path.join(&folder_name);
                if final_dir.exists() {
                    return Err(format!("当前技能库中已存在同名目录「{}」", folder_name));
                }
            }
        }
    }

    // 4. 下载到临时暂存目录并原子落盘：
    //    - 根目录独立技能（如 ppt-master）：直接走统一 Git 浅克隆引擎（保留 .git/objects，后续更新与外部导入完全一致走增量 git pull）
    //    - 多技能集合仓内的子技能：精准提取子目录并写入 .skillhub-source.json 溯源
    let staging_dir = target_root_path.join(format!(".skillhub_tmp_{}", uuid::Uuid::new_v4()));
    let now = Utc::now().to_rfc3339();
    let repo_url = format!("https://github.com/{}/{}", owner, repo);

    let meta = if install_as_git_repo {
        let clone_url = build_github_clone_url(
            &owner,
            &repo,
            branch
                .as_deref()
                .filter(|b| !b.trim().is_empty())
                .or(Some(&resolved.branch)),
        );
        if let Err(e) = crate::git_engine::clone_repository(Some(&app), &clone_url, &staging_dir).await {
            let _ = std::fs::remove_dir_all(&staging_dir);
            return Err(e);
        }
        atomic_place_dir(&staging_dir, &final_dir)?;

        SkillHubSourceMeta {
            schema_version: 1,
            provider: "git-clone".to_string(),
            host: norm_host,
            owner: owner.clone(),
            repo: repo.clone(),
            repo_url: repo_url.clone(),
            branch: resolved.branch.clone(),
            subpath: String::new(),
            skill_name: skill_name.clone(),
            tree_sha: resolved.tree_sha.clone(),
            commit_sha: if resolved.commit_sha.is_empty() {
                None
            } else {
                Some(resolved.commit_sha.clone())
            },
            installed_at: now.clone(),
            updated_at: Some(now.clone()),
        }
    } else {
        let dl_res = download_subskill_to_dir(
            &owner,
            &repo,
            &resolved.branch,
            &resolved.subpath,
            &resolved.files,
            &staging_dir,
            token.as_deref(),
        )
        .await;

        if let Err(e) = dl_res {
            let _ = std::fs::remove_dir_all(&staging_dir);
            return Err(e);
        }

        let sub_meta = SkillHubSourceMeta {
            schema_version: 1,
            provider: provider.unwrap_or_else(|| "resource-hub".to_string()),
            host: norm_host,
            owner: owner.clone(),
            repo: repo.clone(),
            repo_url: repo_url.clone(),
            branch: resolved.branch.clone(),
            subpath: resolved.subpath.clone(),
            skill_name: skill_name.clone(),
            tree_sha: resolved.tree_sha.clone(),
            commit_sha: if resolved.commit_sha.is_empty() {
                None
            } else {
                Some(resolved.commit_sha.clone())
            },
            installed_at: now.clone(),
            updated_at: Some(now.clone()),
        };

        let meta_json = serde_json::to_string_pretty(&sub_meta).map_err(|e| e.to_string())?;
        std::fs::write(staging_dir.join(SOURCE_META_FILENAME), meta_json).map_err(|e| {
            let _ = std::fs::remove_dir_all(&staging_dir);
            format!("写入溯源元数据失败: {}", e)
        })?;

        atomic_place_dir(&staging_dir, &final_dir)?;
        sub_meta
    };

    // 5. 扫描新目录并入库（保留 source_type = "github" 以便主页和更新链路无缝识别）
    let scan_path = final_dir.clone();
    let scanned_skills = tauri::async_runtime::spawn_blocking(move || {
        crate::scanner::scan_directory(&scan_path)
    })
    .await
    .map_err(|e| format!("扫描已安装技能异常: {}", e))??;

    let skill_count = scanned_skills.len();
    let final_dir_str = final_dir.to_string_lossy().to_string();

    {
        let mut db = state.db.lock().unwrap();
        let tx = db.transaction().map_err(|e| e.to_string())?;
        for sk in &scanned_skills {
            crate::db::insert_skill(&tx, sk, &target_source_dir_id, "github")?;
        }
        let repo_db_id = uuid::Uuid::new_v4().to_string();
        let _ = tx.execute(
            "INSERT INTO repositories (id, name, github_url, local_path, source_dir_id, source_type, added_at, last_checked)
             VALUES (?1, ?2, ?3, ?4, ?5, 'github', ?6, ?6)
             ON CONFLICT(local_path) DO UPDATE SET github_url=excluded.github_url, name=excluded.name, last_checked=excluded.last_checked",
            rusqlite::params![
                repo_db_id,
                folder_name,
                repo_url,
                final_dir_str,
                target_source_dir_id,
                now
            ],
        );
        tx.commit().map_err(|e| e.to_string())?;
    }

    Ok(InstallRemoteSkillResult {
        installed_path: final_dir_str,
        folder_name,
        skill_count,
        source_meta: meta,
    })
}

// ============================================================================
// Tauri Commands：扫描本地已安装来源索引（供资源中心精确标识“已安装”）
// ============================================================================

#[tauri::command]
pub fn get_installed_skill_sources(
    state: State<'_, AppState>,
) -> Result<Vec<InstalledSkillSource>, String> {
    let dir_paths: Vec<String> = {
        let db = state.db.lock().unwrap();
        let mut stmt = db
            .prepare("SELECT path FROM source_directories")
            .map_err(|e| e.to_string())?;
        let collected: Vec<String> = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        collected
    };

    let mut results = Vec::new();
    for root_str in dir_paths {
        let root = Path::new(&root_str);
        if !root.exists() || !root.is_dir() {
            continue;
        }
        let entries = match std::fs::read_dir(root) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let p = entry.path();
            if !p.is_dir() {
                continue;
            }
            if let Some(meta) = read_source_meta(&p) {
                results.push(InstalledSkillSource {
                    local_path: p.to_string_lossy().to_string(),
                    owner: meta.owner,
                    repo: meta.repo,
                    subpath: meta.subpath,
                    skill_name: meta.skill_name,
                    repo_url: meta.repo_url,
                    provider: meta.provider,
                });
            } else if let Some(remote_url) = crate::git_engine::read_remote_url_from_git_config(&p) {
                if let Ok((host, owner, repo, _)) = parse_repo_input(&remote_url) {
                    results.push(InstalledSkillSource {
                        local_path: p.to_string_lossy().to_string(),
                        owner: owner.clone(),
                        repo: repo.clone(),
                        subpath: String::new(),
                        skill_name: p
                            .file_name()
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_else(|| repo.clone()),
                        repo_url: format!("https://{}/{}/{}", host, owner, repo),
                        provider: "git-clone".to_string(),
                    });
                }
            }
        }
    }

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_csv_records_rfc4180() {
        let sample = "\u{feff}rank,skill,description_zh,installs_skillssh\r\n\
1,agent-browser,\"支持网页自动化, 含\"\"引号\"\"与逗号\",1649798\r\n\
2,find-skills,\"多行\n描述测试\",4489381\n";
        let rows = parse_csv_records(sample);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].get("skill").unwrap(), "agent-browser");
        assert_eq!(
            rows[0].get("description_zh").unwrap(),
            "支持网页自动化, 含\"引号\"与逗号"
        );
        assert_eq!(rows[1].get("description_zh").unwrap(), "多行\n描述测试");
        assert_eq!(rows[1].get("installs_skillssh").unwrap(), "4489381");
    }

    #[test]
    fn test_parse_repo_input_variants() {
        assert_eq!(
            parse_repo_input("anthropics/skills").unwrap(),
            ("github.com".into(), "anthropics".into(), "skills".into(), None)
        );
        assert_eq!(
            parse_repo_input("https://github.com/ComposioHQ/awesome-claude-skills.git").unwrap(),
            ("github.com".into(), "ComposioHQ".into(), "awesome-claude-skills".into(), None)
        );
        assert_eq!(
            parse_repo_input("https://github.com/JimLiu/baoyu-skills/tree/main/skills").unwrap(),
            ("github.com".into(), "JimLiu".into(), "baoyu-skills".into(), Some("main".into()))
        );
        assert_eq!(
            parse_repo_input("https://gitlab.example.com/team/sub/my-skills").unwrap(),
            ("gitlab.example.com".into(), "team/sub".into(), "my-skills".into(), None)
        );
    }

    #[test]
    fn test_parse_skill_md_frontmatter_tolerant() {
        let tricky = "---\nname: ppt-helper\ndescription: Use when: user needs slides, charts\n---\n# Title\nBody text";
        let (name, desc, _) = parse_skill_md_frontmatter(tricky, "fallback");
        assert_eq!(name, "ppt-helper");
        assert!(desc.contains("Use when:"));
    }

    #[test]
    fn test_extract_github_owner_repo() {
        assert_eq!(
            extract_github_owner_repo(
                "https://github.com/vercel-labs/skills",
                "vercel-labs/skills",
                ""
            ),
            Some(("vercel-labs".into(), "skills".into()))
        );
        assert_eq!(
            extract_github_owner_repo("", "anthropics/skills", ""),
            Some(("anthropics".into(), "skills".into()))
        );
        assert_eq!(extract_github_owner_repo("", "", ""), None);
    }

    #[test]
    fn test_build_github_clone_url() {
        assert_eq!(
            build_github_clone_url("hugohe3", "ppt-master", None),
            "https://github.com/hugohe3/ppt-master.git"
        );
        assert_eq!(
            build_github_clone_url("hugohe3", "ppt-master", Some("main")),
            "https://github.com/hugohe3/ppt-master/tree/main"
        );
        assert_eq!(
            build_github_clone_url("owner", "repo", Some("feat/v2")),
            "https://github.com/owner/repo.git"
        );
    }

    #[test]
    fn test_atomic_place_dir_new_and_overwrite() {
        let base = std::env::temp_dir().join(format!("skillhub_atomic_test_{}", uuid::Uuid::new_v4().simple()));
        std::fs::create_dir_all(&base).unwrap();

        let staging1 = base.join(".tmp1");
        let final_dir = base.join("ppt-master");
        std::fs::create_dir_all(&staging1).unwrap();
        std::fs::write(staging1.join("SKILL.md"), "v1").unwrap();

        atomic_place_dir(&staging1, &final_dir).unwrap();
        assert_eq!(std::fs::read_to_string(final_dir.join("SKILL.md")).unwrap(), "v1");
        assert!(!staging1.exists());

        let staging2 = base.join(".tmp2");
        std::fs::create_dir_all(&staging2).unwrap();
        std::fs::write(staging2.join("SKILL.md"), "v2").unwrap();

        atomic_place_dir(&staging2, &final_dir).unwrap();
        assert_eq!(std::fs::read_to_string(final_dir.join("SKILL.md")).unwrap(), "v2");
        assert!(!staging2.exists());

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_validate_curated_leaderboards_json() {
        let valid = r#"{"schemaVersion":1,"leaderboards":[{"id":"b1","title":"测试榜","items":[{"rank":1,"skillName":"demo"}]}]}"#;
        let ok = validate_curated_leaderboards_json(valid).unwrap();
        assert_eq!(ok["leaderboards"].as_array().unwrap().len(), 1);

        let invalid_empty = r#"{"schemaVersion":1,"leaderboards":[]}"#;
        assert!(validate_curated_leaderboards_json(invalid_empty).is_err());

        let invalid_missing_items = r#"{"leaderboards":[{"id":"b1","title":"空条目"}]}"#;
        assert!(validate_curated_leaderboards_json(invalid_missing_items).is_err());
    }
}
