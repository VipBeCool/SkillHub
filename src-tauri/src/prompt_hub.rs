use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use tauri::State;

use crate::resource_hub::{
    fetch_text_resilient, get_cache_entry, get_stale_cache_entry, parse_csv_records, set_cache_entry,
};
use crate::AppState;

/// 统一的远程开源提示词条目模型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemotePromptItem {
    pub id: String,
    pub source: String, // "aishort" | "prompts-chat" | "fabric" | "langgpt"
    pub title: String,
    pub slug: Option<String>,
    pub description: String,
    pub content: String,
    pub content_alt: Option<String>,
    pub content_label: Option<String>,
    pub content_alt_label: Option<String>,
    pub category: Option<String>,
    pub category_label: Option<String>,
    pub tags: Vec<String>,
    pub author: Option<String>,
    pub votes: Option<i64>,
    pub prompt_type: Option<String>,
    pub source_url: Option<String>,
    pub needs_content_fetch: bool,
}

/// 统一的远程提示词列表响应
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemotePromptListResponse {
    pub source: String,
    pub items: Vec<RemotePromptItem>,
    pub total: usize,
    pub page: usize,
    pub per_page: usize,
    pub has_more: bool,
    pub from_cache: bool,
    pub used_fallback: bool,
    pub fetched_at: String,
}

/// 安全截断 UTF-8 字符串作为简短预览
fn truncate_preview(text: &str, max_chars: usize) -> String {
    let cleaned = text
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    let mut chars = cleaned.chars();
    let out: String = chars.by_ref().take(max_chars).collect();
    if chars.next().is_some() {
        format!("{}...", out.trim_end())
    } else {
        out
    }
}

/// 将 AiShort 官方英文 tag 映射为中文分类名称
fn map_aishort_tag(tag: &str) -> &'static str {
    match tag {
        "write" => "写作辅助",
        "article" => "文章/报告",
        "code" => "IT/编程",
        "ai" => "AI 增强",
        "living" => "生活质量",
        "interesting" => "趣味科普",
        "life" => "生活百科",
        "social" => "心理/社交",
        "philosophy" => "哲学/思辨",
        "mind" => "思维训练",
        "pedagogy" => "教育学习",
        "academic" => "学术科研",
        "games" => "趣味游戏",
        "tool" => "效率工具",
        "interpreter" => "终端/解释器",
        "language" => "语言翻译",
        "speech" => "辩论演讲",
        "comments" => "点评评鉴",
        "text" => "文本处理",
        "company" => "企业职能",
        "seo" => "SEO 增长",
        "doctor" => "医疗健康",
        "finance" => "金融顾问",
        "music" => "音乐艺术",
        "professional" => "专业顾问",
        "contribute" => "社区精选",
        _ => "其他",
    }
}

/// 将 Fabric Pattern 官方大写 Tag 映射为中文分类名称
fn map_fabric_tag(tag: &str) -> String {
    match tag.trim().to_uppercase().as_str() {
        "DEVELOPMENT" | "CODING" | "PROGRAMMING" => "开发工程".to_string(),
        "ANALYSIS" => "深度分析".to_string(),
        "SECURITY" | "CYBERSECURITY" => "安全审计".to_string(),
        "WRITING" => "写作润色".to_string(),
        "SUMMARIZE" | "SUMMARY" => "摘要提炼".to_string(),
        "EXTRACT" | "EXTRACTION" => "信息提取".to_string(),
        "AI" => "AI 与提示词".to_string(),
        "LEARNING" | "EDUCATION" => "学习研究".to_string(),
        "BUSINESS" | "MARKETING" => "商业策略".to_string(),
        "RESEARCH" | "ACADEMIC" => "学术调研".to_string(),
        "SELF" | "LIFE" | "PERSONAL" => "效率成长".to_string(),
        "VISUALIZE" | "VISUALIZATION" | "DESIGN" => "可视化设计".to_string(),
        "CONTENT" | "MEDIA" | "VIDEO" => "内容创作".to_string(),
        "CONVERSION" | "TRANSFORM" => "格式转换".to_string(),
        "CREATE" | "CREATION" => "生成构建".to_string(),
        "COMPARE" | "EVALUATION" => "对比评估".to_string(),
        "THINKING" | "REASONING" => "逻辑推演".to_string(),
        "GAMING" => "游戏创意".to_string(),
        other => other.to_string(),
    }
}

/// 将下划线命名的 Fabric Pattern 转成易读标题（如 extract_wisdom -> Extract Wisdom）
fn humanize_pattern_name(slug: &str) -> String {
    slug.split(|c| c == '_' || c == '-')
        .filter(|s| !s.is_empty())
        .map(|word| {
            let lower = word.to_lowercase();
            match lower.as_str() {
                "ai" | "api" | "cli" | "csv" | "css" | "cve" | "dns" | "git" | "html" | "http"
                | "ioc" | "json" | "llm" | "mcp" | "ocr" | "pdf" | "pgp" | "pr" | "prd" | "rfc"
                | "seo" | "sql" | "ssh" | "tdd" | "ui" | "url" | "ux" | "xml" | "yaml" => {
                    lower.to_uppercase()
                }
                _ => {
                    let mut chars = lower.chars();
                    match chars.next() {
                        Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
                        None => String::new(),
                    }
                }
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// 校验 Fabric Pattern 名称仅含安全字符，防止路径穿越
fn is_valid_pattern_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 128
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

// ============================================================================
// 1. AiShort 中文精选（rockbenben/ChatGPT-Shortcut，MIT 协议）
// ============================================================================

pub fn parse_aishort_json(raw: &str) -> Result<Vec<RemotePromptItem>, String> {
    let arr: Vec<serde_json::Value> =
        serde_json::from_str(raw).map_err(|e| format!("解析 AiShort JSON 失败: {}", e))?;

    let mut list: Vec<(i64, RemotePromptItem)> = Vec::with_capacity(arr.len());

    for (idx, entry) in arr.into_iter().enumerate() {
        let zh = match entry.get("zh-Hans") {
            Some(v) if v.is_object() => v,
            _ => continue,
        };

        let title = zh
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if title.is_empty() {
            continue;
        }

        let en_prompt = zh
            .get("prompt")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let zh_prompt = zh
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let remark = zh
            .get("remark")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();

        if zh_prompt.is_empty() && en_prompt.is_empty() {
            continue;
        }

        // 中文场景默认展示中文版正文；若同时有不同英文原版则提供双语切换
        let (content, content_label, content_alt, content_alt_label) = if !zh_prompt.is_empty() {
            let alt = if !en_prompt.is_empty() && en_prompt != zh_prompt {
                Some(en_prompt)
            } else {
                None
            };
            let alt_label = alt.as_ref().map(|_| "英文原版".to_string());
            (zh_prompt, Some("中文版".to_string()), alt, alt_label)
        } else {
            (en_prompt, Some("原文".to_string()), None, None)
        };

        let description = if !remark.is_empty() {
            remark
        } else {
            truncate_preview(&content, 110)
        };

        let raw_tags: Vec<String> = entry
            .get("tags")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.as_str().map(|s| s.trim().to_string()))
                    .filter(|s| !s.is_empty())
                    .collect()
            })
            .unwrap_or_default();

        // 主分类跳过过于宽泛的 contribute 标签（若只有 contribute 则使用它）
        let primary_tag = raw_tags
            .iter()
            .find(|t| t.as_str() != "contribute")
            .or_else(|| raw_tags.first())
            .cloned();

        let category_label = primary_tag
            .as_deref()
            .map(|t| map_aishort_tag(t).to_string());

        let mut zh_tags: Vec<String> = Vec::new();
        for t in &raw_tags {
            if t == "contribute" && raw_tags.len() > 1 {
                continue;
            }
            let mapped = map_aishort_tag(t).to_string();
            if !zh_tags.contains(&mapped) {
                zh_tags.push(mapped);
            }
        }

        let item_id_num = entry
            .get("id")
            .and_then(|v| v.as_i64())
            .unwrap_or((idx + 1) as i64);
        let weight = entry.get("weight").and_then(|v| v.as_i64()).unwrap_or(0);
        let website = entry
            .get("website")
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        list.push((
            weight,
            RemotePromptItem {
                id: format!("aishort:{}", item_id_num),
                source: "aishort".to_string(),
                title,
                slug: Some(item_id_num.to_string()),
                description,
                content,
                content_alt,
                content_label,
                content_alt_label,
                category: primary_tag,
                category_label,
                tags: zh_tags,
                author: Some("AiShort 社区".to_string()),
                votes: if weight > 0 { Some(weight) } else { None },
                prompt_type: Some("TEXT".to_string()),
                source_url: website
                    .or_else(|| Some(format!("https://www.aishort.top/prompt/{}", item_id_num))),
                needs_content_fetch: false,
            },
        ));
    }

    list.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(list.into_iter().map(|(_, item)| item).collect())
}

#[tauri::command]
pub async fn fetch_aishort_prompts(
    state: State<'_, AppState>,
    force_refresh: Option<bool>,
) -> Result<RemotePromptListResponse, String> {
    const CACHE_KEY: &str = "prompt_hub:aishort:zh-Hans";
    const URL: &str =
        "https://raw.githubusercontent.com/rockbenben/ChatGPT-Shortcut/main/src/data/prompt_zh-Hans.json";

    let force = force_refresh.unwrap_or(false);
    if !force {
        if let Some((payload, _, updated_at)) = get_cache_entry(&state, CACHE_KEY, 12 * 3600) {
            if let Ok(items) = parse_aishort_json(&payload) {
                if !items.is_empty() {
                    let total = items.len();
                    return Ok(RemotePromptListResponse {
                        source: "aishort".to_string(),
                        items,
                        total,
                        page: 1,
                        per_page: total,
                        has_more: false,
                        from_cache: true,
                        used_fallback: false,
                        fetched_at: updated_at,
                    });
                }
            }
        }
    }

    match fetch_text_resilient(URL, None, false, true, 18).await {
        Ok((200, body)) => {
            let items = parse_aishort_json(&body)?;
            if items.is_empty() {
                return Err("AiShort 提示词数据为空".to_string());
            }
            set_cache_entry(&state, CACHE_KEY, &body, None);
            let total = items.len();
            Ok(RemotePromptListResponse {
                source: "aishort".to_string(),
                items,
                total,
                page: 1,
                per_page: total,
                has_more: false,
                from_cache: false,
                used_fallback: false,
                fetched_at: Utc::now().to_rfc3339(),
            })
        }
        Ok((status, _)) => {
            if let Some((payload, _, updated_at)) = get_stale_cache_entry(&state, CACHE_KEY) {
                if let Ok(items) = parse_aishort_json(&payload) {
                    let total = items.len();
                    return Ok(RemotePromptListResponse {
                        source: "aishort".to_string(),
                        items,
                        total,
                        page: 1,
                        per_page: total,
                        has_more: false,
                        from_cache: true,
                        used_fallback: true,
                        fetched_at: updated_at,
                    });
                }
            }
            Err(format!("拉取 AiShort 提示词失败（HTTP {}）", status))
        }
        Err(err) => {
            if let Some((payload, _, updated_at)) = get_stale_cache_entry(&state, CACHE_KEY) {
                if let Ok(items) = parse_aishort_json(&payload) {
                    let total = items.len();
                    return Ok(RemotePromptListResponse {
                        source: "aishort".to_string(),
                        items,
                        total,
                        page: 1,
                        per_page: total,
                        has_more: false,
                        from_cache: true,
                        used_fallback: true,
                        fetched_at: updated_at,
                    });
                }
            }
            Err(format!("拉取 AiShort 提示词失败：{}", err))
        }
    }
}

// ============================================================================
// 2. prompts.chat 全球开源社区（API 优先 + GitHub prompts.csv 镜像自动兜底）
// ============================================================================

pub fn parse_prompts_chat_api(
    raw: &str,
    page: usize,
    per_page: usize,
) -> Result<(Vec<RemotePromptItem>, usize, bool), String> {
    let val: serde_json::Value =
        serde_json::from_str(raw).map_err(|e| format!("解析 prompts.chat 响应失败: {}", e))?;

    let total = val.get("total").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
    let total_pages = val
        .get("totalPages")
        .and_then(|v| v.as_u64())
        .unwrap_or(1) as usize;

    let arr = val
        .get("prompts")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut items = Vec::with_capacity(arr.len());
    for entry in arr {
        let title = entry
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let content = entry
            .get("content")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if title.is_empty() || content.is_empty() {
            continue;
        }

        let slug = entry
            .get("slug")
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let id_raw = entry
            .get("id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| slug.clone())
            .unwrap_or_else(|| title.clone());

        let desc = entry
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let description = if !desc.is_empty() {
            desc
        } else {
            truncate_preview(&content, 120)
        };

        let cat_name = entry
            .get("category")
            .and_then(|c| c.get("name"))
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let cat_slug = entry
            .get("category")
            .and_then(|c| c.get("slug"))
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        let tags: Vec<String> = entry
            .get("tags")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|t| {
                        t.get("tag")
                            .and_then(|inner| inner.get("name"))
                            .or_else(|| t.get("name"))
                            .and_then(|v| v.as_str())
                            .map(|s| s.trim().to_string())
                    })
                    .filter(|s| !s.is_empty())
                    .take(5)
                    .collect()
            })
            .unwrap_or_default();

        let author = entry
            .get("author")
            .and_then(|a| {
                a.get("username")
                    .or_else(|| a.get("name"))
                    .and_then(|v| v.as_str())
            })
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        let votes = entry.get("voteCount").and_then(|v| v.as_i64());
        let prompt_type = entry
            .get("type")
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        let source_url = slug
            .as_ref()
            .map(|s| format!("https://prompts.chat/prompts/{}", s))
            .or_else(|| Some("https://prompts.chat".to_string()));

        items.push(RemotePromptItem {
            id: format!("prompts-chat:{}", id_raw),
            source: "prompts-chat".to_string(),
            title,
            slug,
            description,
            content,
            content_alt: None,
            content_label: Some("原文".to_string()),
            content_alt_label: None,
            category: cat_slug.or_else(|| cat_name.clone()),
            category_label: cat_name,
            tags,
            author,
            votes,
            prompt_type,
            source_url,
            needs_content_fetch: false,
        });
    }

    let has_more = page < total_pages && (page * per_page) < total;
    Ok((items, total, has_more))
}

pub fn parse_prompts_chat_csv(
    csv_text: &str,
    query: &str,
    prompt_type: &str,
    page: usize,
    per_page: usize,
) -> (Vec<RemotePromptItem>, usize, bool) {
    let records = parse_csv_records(csv_text);
    let q = query.trim().to_lowercase();
    let type_filter = prompt_type.trim().to_uppercase();

    let mut matched: Vec<(u8, usize, RemotePromptItem)> = Vec::new();

    for (idx, row) in records.into_iter().enumerate() {
        let title = row.get("act").cloned().unwrap_or_default().trim().to_string();
        let content = row
            .get("prompt")
            .cloned()
            .unwrap_or_default()
            .trim()
            .to_string();
        if title.is_empty() || content.is_empty() {
            continue;
        }

        let rtype = row
            .get("type")
            .cloned()
            .unwrap_or_else(|| "TEXT".to_string())
            .trim()
            .to_uppercase();
        if !type_filter.is_empty() && type_filter != "ALL" && rtype != type_filter {
            continue;
        }

        let contributor = row
            .get("contributor")
            .cloned()
            .unwrap_or_default()
            .trim()
            .to_string();
        let for_devs = row
            .get("for_devs")
            .map(|s| s.eq_ignore_ascii_case("true"))
            .unwrap_or(false);

        let score = if q.is_empty() {
            1
        } else {
            let t_low = title.to_lowercase();
            let c_low = content.to_lowercase();
            if t_low == q {
                4
            } else if t_low.contains(&q) {
                3
            } else if c_low.contains(&q) {
                2
            } else if contributor.to_lowercase().contains(&q) {
                1
            } else {
                0
            }
        };

        if score == 0 {
            continue;
        }

        let mut tags = Vec::new();
        if for_devs {
            tags.push("开发者".to_string());
        }
        if rtype == "STRUCTURED" {
            tags.push("结构化".to_string());
        }

        let description = truncate_preview(&content, 120);
        matched.push((
            score,
            idx,
            RemotePromptItem {
                id: format!("prompts-chat:csv-{}", idx + 1),
                source: "prompts-chat".to_string(),
                title,
                slug: None,
                description,
                content,
                content_alt: None,
                content_label: Some("原文".to_string()),
                content_alt_label: None,
                category: if for_devs {
                    Some("coding".to_string())
                } else {
                    Some(rtype.to_lowercase())
                },
                category_label: if for_devs {
                    Some("开发编程".to_string())
                } else if rtype == "STRUCTURED" {
                    Some("结构化".to_string())
                } else {
                    Some("通用文本".to_string())
                },
                tags,
                author: if contributor.is_empty() {
                    None
                } else {
                    Some(contributor)
                },
                votes: None,
                prompt_type: Some(rtype),
                source_url: Some("https://prompts.chat".to_string()),
                needs_content_fetch: false,
            },
        ));
    }

    if !q.is_empty() {
        matched.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
    }

    let total = matched.len();
    let start = (page.saturating_sub(1)) * per_page;
    let items: Vec<RemotePromptItem> = matched
        .into_iter()
        .skip(start)
        .take(per_page)
        .map(|(_, _, item)| item)
        .collect();
    let has_more = start + items.len() < total;
    (items, total, has_more)
}

#[tauri::command]
pub async fn search_prompts_chat(
    state: State<'_, AppState>,
    query: Option<String>,
    sort: Option<String>,
    prompt_type: Option<String>,
    page: Option<usize>,
    per_page: Option<usize>,
    force_refresh: Option<bool>,
) -> Result<RemotePromptListResponse, String> {
    let q = query.unwrap_or_default().trim().to_string();
    let eff_sort = match sort.as_deref().unwrap_or("upvotes") {
        "newest" => "newest",
        _ => "upvotes",
    };
    let eff_type = match prompt_type.as_deref().unwrap_or("all") {
        "TEXT" => "TEXT",
        "STRUCTURED" => "STRUCTURED",
        _ => "all",
    };
    let eff_page = page.unwrap_or(1).max(1);
    let eff_per_page = per_page.unwrap_or(24).clamp(6, 60);
    let force = force_refresh.unwrap_or(false);

    let api_cache_key = format!(
        "prompt_hub:pchat_api:{}:{}:{}:{}:{}",
        eff_sort, eff_type, eff_page, eff_per_page, q
    );

    if !force {
        if let Some((payload, _, updated_at)) = get_cache_entry(&state, &api_cache_key, 15 * 60) {
            if let Ok((items, total, has_more)) =
                parse_prompts_chat_api(&payload, eff_page, eff_per_page)
            {
                return Ok(RemotePromptListResponse {
                    source: "prompts-chat".to_string(),
                    items,
                    total,
                    page: eff_page,
                    per_page: eff_per_page,
                    has_more,
                    from_cache: true,
                    used_fallback: false,
                    fetched_at: updated_at,
                });
            }
        }
    }

    // 1. 主通道：prompts.chat 官方公开 REST API
    let mut api_url = format!(
        "https://prompts.chat/api/prompts?page={}&perPage={}&sort={}",
        eff_page, eff_per_page, eff_sort
    );
    if !q.is_empty() {
        api_url.push_str(&format!("&q={}", urlencoding::encode(&q)));
    }
    if eff_type != "all" {
        api_url.push_str(&format!("&type={}", eff_type));
    }

    if let Ok((200, body)) = fetch_text_resilient(&api_url, None, true, false, 12).await {
        if let Ok((items, total, has_more)) = parse_prompts_chat_api(&body, eff_page, eff_per_page)
        {
            set_cache_entry(&state, &api_cache_key, &body, None);
            return Ok(RemotePromptListResponse {
                source: "prompts-chat".to_string(),
                items,
                total,
                page: eff_page,
                per_page: eff_per_page,
                has_more,
                from_cache: false,
                used_fallback: false,
                fetched_at: Utc::now().to_rfc3339(),
            });
        }
    }

    // 2. 自动镜像兜底通道：f/prompts.chat GitHub CSV（国内免 VPN 自动走 gh-proxy.com）
    const CSV_CACHE_KEY: &str = "prompt_hub:pchat_csv:main";
    const CSV_URL: &str = "https://raw.githubusercontent.com/f/prompts.chat/main/prompts.csv";

    if !force {
        if let Some((csv_text, _, updated_at)) = get_cache_entry(&state, CSV_CACHE_KEY, 12 * 3600) {
            let (items, total, has_more) =
                parse_prompts_chat_csv(&csv_text, &q, eff_type, eff_page, eff_per_page);
            return Ok(RemotePromptListResponse {
                source: "prompts-chat".to_string(),
                items,
                total,
                page: eff_page,
                per_page: eff_per_page,
                has_more,
                from_cache: true,
                used_fallback: true,
                fetched_at: updated_at,
            });
        }
    }

    match fetch_text_resilient(CSV_URL, None, false, true, 25).await {
        Ok((200, csv_text)) => {
            set_cache_entry(&state, CSV_CACHE_KEY, &csv_text, None);
            let (items, total, has_more) =
                parse_prompts_chat_csv(&csv_text, &q, eff_type, eff_page, eff_per_page);
            Ok(RemotePromptListResponse {
                source: "prompts-chat".to_string(),
                items,
                total,
                page: eff_page,
                per_page: eff_per_page,
                has_more,
                from_cache: false,
                used_fallback: true,
                fetched_at: Utc::now().to_rfc3339(),
            })
        }
        other => {
            if let Some((csv_text, _, updated_at)) = get_stale_cache_entry(&state, CSV_CACHE_KEY) {
                let (items, total, has_more) =
                    parse_prompts_chat_csv(&csv_text, &q, eff_type, eff_page, eff_per_page);
                return Ok(RemotePromptListResponse {
                    source: "prompts-chat".to_string(),
                    items,
                    total,
                    page: eff_page,
                    per_page: eff_per_page,
                    has_more,
                    from_cache: true,
                    used_fallback: true,
                    fetched_at: updated_at,
                });
            }
            let msg = match other {
                Ok((s, _)) => format!("HTTP {}", s),
                Err(e) => e,
            };
            Err(format!("拉取 prompts.chat 数据失败：{}", msg))
        }
    }
}

// ============================================================================
// 3. Fabric Patterns 专业工程化工作流（danielmiessler/fabric，MIT 协议）
// ============================================================================

pub fn parse_fabric_descriptions_json(raw: &str) -> Result<Vec<RemotePromptItem>, String> {
    let val: serde_json::Value =
        serde_json::from_str(raw).map_err(|e| format!("解析 Fabric 索引 JSON 失败: {}", e))?;

    let arr = val
        .get("patterns")
        .and_then(|v| v.as_array())
        .or_else(|| val.as_array())
        .ok_or_else(|| "Fabric 索引格式异常".to_string())?;

    let mut items = Vec::with_capacity(arr.len());
    for entry in arr {
        let slug = entry
            .get("patternName")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if !is_valid_pattern_name(&slug) {
            continue;
        }

        let description = entry
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();

        let raw_tags: Vec<String> = entry
            .get("tags")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.as_str().map(|s| s.trim().to_string()))
                    .filter(|s| !s.is_empty())
                    .collect()
            })
            .unwrap_or_default();

        let primary_cat = raw_tags.first().cloned();
        let category_label = primary_cat.as_deref().map(map_fabric_tag);

        let mut mapped_tags = Vec::new();
        for t in &raw_tags {
            let label = map_fabric_tag(t);
            if !mapped_tags.contains(&label) {
                mapped_tags.push(label);
            }
        }

        items.push(RemotePromptItem {
            id: format!("fabric:{}", slug),
            source: "fabric".to_string(),
            title: humanize_pattern_name(&slug),
            slug: Some(slug.clone()),
            description,
            content: String::new(),
            content_alt: None,
            content_label: Some("System Prompt".to_string()),
            content_alt_label: None,
            category: primary_cat,
            category_label,
            tags: mapped_tags,
            author: Some("danielmiessler/fabric".to_string()),
            votes: None,
            prompt_type: Some("SYSTEM".to_string()),
            source_url: Some(format!(
                "https://github.com/danielmiessler/fabric/blob/main/data/patterns/{}/system.md",
                slug
            )),
            needs_content_fetch: true,
        });
    }

    Ok(items)
}

#[tauri::command]
pub async fn fetch_fabric_patterns(
    state: State<'_, AppState>,
    force_refresh: Option<bool>,
) -> Result<RemotePromptListResponse, String> {
    const CACHE_KEY: &str = "prompt_hub:fabric:descriptions";
    const URL: &str = "https://raw.githubusercontent.com/danielmiessler/fabric/main/scripts/pattern_descriptions/pattern_descriptions.json";

    let force = force_refresh.unwrap_or(false);
    if !force {
        if let Some((payload, _, updated_at)) = get_cache_entry(&state, CACHE_KEY, 12 * 3600) {
            if let Ok(items) = parse_fabric_descriptions_json(&payload) {
                if !items.is_empty() {
                    let total = items.len();
                    return Ok(RemotePromptListResponse {
                        source: "fabric".to_string(),
                        items,
                        total,
                        page: 1,
                        per_page: total,
                        has_more: false,
                        from_cache: true,
                        used_fallback: false,
                        fetched_at: updated_at,
                    });
                }
            }
        }
    }

    match fetch_text_resilient(URL, None, false, true, 18).await {
        Ok((200, body)) => {
            let items = parse_fabric_descriptions_json(&body)?;
            set_cache_entry(&state, CACHE_KEY, &body, None);
            let total = items.len();
            Ok(RemotePromptListResponse {
                source: "fabric".to_string(),
                items,
                total,
                page: 1,
                per_page: total,
                has_more: false,
                from_cache: false,
                used_fallback: false,
                fetched_at: Utc::now().to_rfc3339(),
            })
        }
        other => {
            if let Some((payload, _, updated_at)) = get_stale_cache_entry(&state, CACHE_KEY) {
                if let Ok(items) = parse_fabric_descriptions_json(&payload) {
                    let total = items.len();
                    return Ok(RemotePromptListResponse {
                        source: "fabric".to_string(),
                        items,
                        total,
                        page: 1,
                        per_page: total,
                        has_more: false,
                        from_cache: true,
                        used_fallback: true,
                        fetched_at: updated_at,
                    });
                }
            }
            let msg = match other {
                Ok((s, _)) => format!("HTTP {}", s),
                Err(e) => e,
            };
            Err(format!("拉取 Fabric Patterns 失败：{}", msg))
        }
    }
}

#[tauri::command]
pub async fn fetch_fabric_pattern_content(
    state: State<'_, AppState>,
    pattern_name: String,
    force_refresh: Option<bool>,
) -> Result<String, String> {
    let clean = pattern_name.trim().to_string();
    if !is_valid_pattern_name(&clean) {
        return Err("无效的 Fabric Pattern 名称".to_string());
    }

    let cache_key = format!("prompt_hub:fabric:content:{}", clean);
    let force = force_refresh.unwrap_or(false);
    if !force {
        if let Some((payload, _, _)) = get_cache_entry(&state, &cache_key, 24 * 3600) {
            if !payload.trim().is_empty() {
                return Ok(payload);
            }
        }
    }

    let url = format!(
        "https://raw.githubusercontent.com/danielmiessler/fabric/main/data/patterns/{}/system.md",
        clean
    );

    match fetch_text_resilient(&url, None, false, true, 15).await {
        Ok((200, body)) => {
            let trimmed = body.trim().to_string();
            if trimmed.is_empty() {
                return Err("该 Pattern 的 system.md 内容为空".to_string());
            }
            set_cache_entry(&state, &cache_key, &trimmed, None);
            Ok(trimmed)
        }
        other => {
            if let Some((payload, _, _)) = get_stale_cache_entry(&state, &cache_key) {
                return Ok(payload);
            }
            let msg = match other {
                Ok((s, _)) => format!("HTTP {}", s),
                Err(e) => e,
            };
            Err(format!("加载 Fabric 提示词正文失败：{}", msg))
        }
    }
}

// ============================================================================
// 4. LangGPT 中文结构化提示词模板（langgptai/LangGPT，Apache-2.0 协议）
// ============================================================================

/// 从单个 LangGPT 结构化 Markdown 提取角色名、作者与简介
fn extract_langgpt_meta(body: &str, fallback_title: &str) -> (String, Option<String>, String) {
    let mut role_title = String::new();
    let mut author: Option<String> = None;
    let mut desc = String::new();

    for line in body.lines().take(35) {
        let trimmed = line.trim();
        if role_title.is_empty() {
            if let Some(rest) = trimmed
                .strip_prefix("# Role:")
                .or_else(|| trimmed.strip_prefix("# Role："))
                .or_else(|| trimmed.strip_prefix("#Role:"))
            {
                let t = rest.trim();
                if !t.is_empty() {
                    role_title = t.to_string();
                }
            }
        }

        let lower = trimmed.to_lowercase();
        if author.is_none() && (lower.starts_with("- author:") || lower.starts_with("- author：")) {
            if let Some(pos) = trimmed.find(':').or_else(|| trimmed.find('：')) {
                let val = trimmed[pos + 1..].trim().trim_start_matches('：').trim();
                if !val.is_empty() {
                    author = Some(val.to_string());
                }
            }
        }
        if desc.is_empty()
            && (lower.starts_with("- description:") || lower.starts_with("- description："))
        {
            if let Some(pos) = trimmed.find(':').or_else(|| trimmed.find('：')) {
                let val = trimmed[pos + 1..].trim().trim_start_matches('：').trim();
                if !val.is_empty() {
                    desc = val.to_string();
                }
            }
        }
    }

    if role_title.is_empty() {
        role_title = fallback_title.to_string();
    }
    if desc.is_empty() {
        desc = truncate_preview(body, 110);
    }

    (role_title, author, desc)
}

/// 从 LangGPT 汇总文件（含多个 ## 标题与代码块）拆分多个结构化提示词
pub fn parse_langgpt_collection_md(
    md: &str,
    file_path: &str,
    default_category: &str,
) -> Vec<RemotePromptItem> {
    let mut results = Vec::new();
    let mut current_heading = String::new();
    let mut in_fence = false;
    let mut fence_buf = String::new();

    for line in md.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("```") {
            if in_fence {
                let block = fence_buf.trim().to_string();
                if block.len() >= 80 && (block.contains("# Role") || block.contains("## Profile")) {
                    let (title, author, desc) = extract_langgpt_meta(&block, &current_heading);
                    let slug = format!("{}:{}", file_path, title);
                    results.push(RemotePromptItem {
                        id: format!("langgpt:{}", slug),
                        source: "langgpt".to_string(),
                        title,
                        slug: Some(slug),
                        description: desc,
                        content: block,
                        content_alt: None,
                        content_label: Some("结构化模板".to_string()),
                        content_alt_label: None,
                        category: Some(default_category.to_string()),
                        category_label: Some(default_category.to_string()),
                        tags: vec!["LangGPT".to_string(), default_category.to_string()],
                        author: author.or_else(|| Some("LangGPT 社区".to_string())),
                        votes: None,
                        prompt_type: Some("STRUCTURED".to_string()),
                        source_url: Some(format!(
                            "https://github.com/langgptai/LangGPT/blob/main/{}",
                            file_path
                        )),
                        needs_content_fetch: false,
                    });
                }
                fence_buf.clear();
                in_fence = false;
            } else {
                in_fence = true;
                fence_buf.clear();
            }
            continue;
        }

        if in_fence {
            fence_buf.push_str(line);
            fence_buf.push('\n');
        } else if let Some(h) = trimmed.strip_prefix("## ") {
            current_heading = h.trim().to_string();
        }
    }

    results
}

/// 解析单个 LangGPT 独立 Markdown 模板文件
pub fn parse_langgpt_single_md(
    md: &str,
    file_path: &str,
    fallback_title: &str,
    category_label: &str,
) -> Option<RemotePromptItem> {
    let body = md.trim().to_string();
    if body.len() < 80 {
        return None;
    }
    let (title, author, desc) = extract_langgpt_meta(&body, fallback_title);
    Some(RemotePromptItem {
        id: format!("langgpt:{}", file_path),
        source: "langgpt".to_string(),
        title,
        slug: Some(file_path.to_string()),
        description: desc,
        content: body,
        content_alt: None,
        content_label: Some("结构化模板".to_string()),
        content_alt_label: None,
        category: Some(category_label.to_string()),
        category_label: Some(category_label.to_string()),
        tags: vec!["LangGPT".to_string(), category_label.to_string()],
        author: author.or_else(|| Some("LangGPT 社区".to_string())),
        votes: None,
        prompt_type: Some("STRUCTURED".to_string()),
        source_url: Some(format!(
            "https://github.com/langgptai/LangGPT/blob/main/{}",
            file_path
        )),
        needs_content_fetch: false,
    })
}

#[tauri::command]
pub async fn fetch_langgpt_prompts(
    state: State<'_, AppState>,
    force_refresh: Option<bool>,
) -> Result<RemotePromptListResponse, String> {
    const CACHE_KEY: &str = "prompt_hub:langgpt:v1";

    let force = force_refresh.unwrap_or(false);
    if !force {
        if let Some((payload, _, updated_at)) = get_cache_entry(&state, CACHE_KEY, 12 * 3600) {
            if let Ok(items) = serde_json::from_str::<Vec<RemotePromptItem>>(&payload) {
                if !items.is_empty() {
                    let total = items.len();
                    return Ok(RemotePromptListResponse {
                        source: "langgpt".to_string(),
                        items,
                        total,
                        page: 1,
                        per_page: total,
                        has_more: false,
                        from_cache: true,
                        used_fallback: false,
                        fetched_at: updated_at,
                    });
                }
            }
        }
    }

    // 精选 LangGPT 仓库中可直接使用的结构化提示词文件（含中文和经典角色）
    let collection_sources: Vec<(&str, &str)> = vec![
        ("examples/prompts_zh.md", "内容创作"),
        ("examples/prompts_from_community.md", "效率办公"),
    ];
    let single_sources: Vec<(&str, &str, &str)> = vec![
        (
            "examples/chinese_xiaohongshu_writer/Prompt_chinese_xiaohongshu_writer.md",
            "小红书爆款大师",
            "内容创作",
        ),
        ("examples/数据分析.md", "数据分析专家", "数据分析"),
        ("examples/math_tutors/calculus_tutor_zh.md", "高等数学私教", "教育学习"),
        (
            "examples/math_tutors/linear_algebra_tutor_zh.md",
            "线性代数几何直觉私教",
            "教育学习",
        ),
        ("examples/code_anything_now/prompt_can.md", "CAN 全能编程助手", "开发工程"),
        (
            "examples/Make_Custom_Fitness_Plan/Prompt_Health.md",
            "FitnessGPT 健身规划师",
            "生活健康",
        ),
    ];

    let mut all_items: Vec<RemotePromptItem> = Vec::new();
    let mut seen_titles: HashSet<String> = HashSet::new();

    // 并发拉取所有精选文件（使用 tokio::task::JoinSet，保持展示顺序稳定）
    let mut col_set: tokio::task::JoinSet<(usize, String, String, Result<(u16, String), String>)> =
        tokio::task::JoinSet::new();
    for (idx, (path, cat)) in collection_sources.iter().enumerate() {
        let encoded_path: String = path
            .split('/')
            .map(|seg| urlencoding::encode(seg).into_owned())
            .collect::<Vec<_>>()
            .join("/");
        let url = format!(
            "https://raw.githubusercontent.com/langgptai/LangGPT/main/{}",
            encoded_path
        );
        let p = path.to_string();
        let c = cat.to_string();
        col_set.spawn(async move {
            let res = fetch_text_resilient(&url, None, false, true, 15).await;
            (idx, p, c, res)
        });
    }

    let mut single_set: tokio::task::JoinSet<(
        usize,
        String,
        String,
        String,
        Result<(u16, String), String>,
    )> = tokio::task::JoinSet::new();
    for (idx, (path, fallback_title, cat)) in single_sources.iter().enumerate() {
        let encoded_path: String = path
            .split('/')
            .map(|seg| urlencoding::encode(seg).into_owned())
            .collect::<Vec<_>>()
            .join("/");
        let url = format!(
            "https://raw.githubusercontent.com/langgptai/LangGPT/main/{}",
            encoded_path
        );
        let p = path.to_string();
        let ft = fallback_title.to_string();
        let c = cat.to_string();
        single_set.spawn(async move {
            let res = fetch_text_resilient(&url, None, false, true, 15).await;
            (idx, p, ft, c, res)
        });
    }

    let mut single_results = Vec::new();
    while let Some(joined) = single_set.join_next().await {
        if let Ok(item) = joined {
            single_results.push(item);
        }
    }
    single_results.sort_by_key(|r| r.0);

    let mut col_results = Vec::new();
    while let Some(joined) = col_set.join_next().await {
        if let Ok(item) = joined {
            col_results.push(item);
        }
    }
    col_results.sort_by_key(|r| r.0);

    for (_, path, fallback_title, cat, res) in single_results {
        if let Ok((200, body)) = res {
            if let Some(item) = parse_langgpt_single_md(&body, &path, &fallback_title, &cat) {
                let key = item.title.to_lowercase();
                if seen_titles.insert(key) {
                    all_items.push(item);
                }
            }
        }
    }

    for (_, path, cat, res) in col_results {
        if let Ok((200, body)) = res {
            for item in parse_langgpt_collection_md(&body, &path, &cat) {
                let key = item.title.to_lowercase();
                if seen_titles.insert(key) {
                    all_items.push(item);
                }
            }
        }
    }

    if all_items.is_empty() {
        if let Some((payload, _, updated_at)) = get_stale_cache_entry(&state, CACHE_KEY) {
            if let Ok(items) = serde_json::from_str::<Vec<RemotePromptItem>>(&payload) {
                let total = items.len();
                return Ok(RemotePromptListResponse {
                    source: "langgpt".to_string(),
                    items,
                    total,
                    page: 1,
                    per_page: total,
                    has_more: false,
                    from_cache: true,
                    used_fallback: true,
                    fetched_at: updated_at,
                });
            }
        }
        return Err("未能从 LangGPT 拉取模板，请检查网络后重试".to_string());
    }

    if let Ok(serialized) = serde_json::to_string(&all_items) {
        set_cache_entry(&state, CACHE_KEY, &serialized, None);
    }

    let total = all_items.len();
    Ok(RemotePromptListResponse {
        source: "langgpt".to_string(),
        items: all_items,
        total,
        page: 1,
        per_page: total,
        has_more: false,
        from_cache: false,
        used_fallback: false,
        fetched_at: Utc::now().to_rfc3339(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_aishort_json_bilingual() {
        let sample = r#"[
            {
                "id": 3,
                "weight": 2741,
                "tags": ["contribute", "write"],
                "zh-Hans": {
                    "title": "语音输入优化",
                    "prompt": "Using concise English prompt...",
                    "description": "请用简洁明了的语言编辑以下段落...",
                    "remark": "整理口语化语音转文字内容"
                }
            }
        ]"#;
        let items = parse_aishort_json(sample).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].title, "语音输入优化");
        assert_eq!(items[0].content, "请用简洁明了的语言编辑以下段落...");
        assert_eq!(
            items[0].content_alt.as_deref(),
            Some("Using concise English prompt...")
        );
        assert_eq!(items[0].category_label.as_deref(), Some("写作辅助"));
        assert_eq!(items[0].description, "整理口语化语音转文字内容");
    }

    #[test]
    fn test_parse_fabric_descriptions_and_validation() {
        assert!(is_valid_pattern_name("extract_wisdom"));
        assert!(!is_valid_pattern_name("../etc/passwd"));
        assert!(!is_valid_pattern_name("foo/bar"));
        assert_eq!(humanize_pattern_name("analyze_sql_pr"), "Analyze SQL PR");

        let sample = r#"{
            "patterns": [
                {"patternName": "extract_wisdom", "description": "Extract key insights.", "tags": ["EXTRACT", "ANALYSIS"]}
            ]
        }"#;
        let items = parse_fabric_descriptions_json(sample).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].title, "Extract Wisdom");
        assert_eq!(items[0].category_label.as_deref(), Some("信息提取"));
        assert!(items[0].needs_content_fetch);
    }

    #[test]
    fn test_parse_prompts_chat_csv_search() {
        let csv = "act,prompt,for_devs,type,contributor\nCode Reviewer,\"Review this Rust code carefully\",TRUE,TEXT,alice\nPoet,\"Write a poem about rain\",FALSE,TEXT,bob\n";
        let (items, total, has_more) = parse_prompts_chat_csv(csv, "rust", "TEXT", 1, 10);
        assert_eq!(total, 1);
        assert!(!has_more);
        assert_eq!(items[0].title, "Code Reviewer");
        assert_eq!(items[0].category_label.as_deref(), Some("开发编程"));
    }

    #[test]
    fn test_parse_langgpt_collection_md() {
        let md = r#"
## 教案生成器

```
# Role: 教案生成器
## Profile
- Author: 教师
- Description: 根据年级与学科生成结构化教案，覆盖教学目标、流程与作业评估方案。
## Workflow
1. 分析教学需求与学情
```
"#;
        let items = parse_langgpt_collection_md(md, "examples/prompts_from_community.md", "效率办公");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].title, "教案生成器");
        assert_eq!(items[0].author.as_deref(), Some("教师"));
        assert!(items[0].description.contains("结构化教案"));
    }
}
