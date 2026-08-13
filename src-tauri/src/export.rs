use std::fs::File;
use std::io::{Read, Write};
use std::path::PathBuf;
use walkdir::WalkDir;
use zip::write::FileOptions;
use zip::ZipWriter;
use tauri::command;

/// 将目录 zip 打包，完全使用 Rust 原生实现，避免依赖系统命令
fn zip_directory(src: &PathBuf, zip_path: &PathBuf, root_name: &str) -> Result<(), String> {
    let file = File::create(zip_path).map_err(|e| format!("创建 zip 文件失败: {}", e))?;
    let mut zip = ZipWriter::new(file);

    for entry in WalkDir::new(src)
        .follow_links(false) // 不追踪符号链接，防止死循环
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        let relative = path
            .strip_prefix(src)
            .map_err(|e| e.to_string())?;

        // 构造 zip 内路径: root_name/relative/path
        let mut in_zip = PathBuf::from(root_name);
        in_zip.push(relative);
        // 统一为正斜杠（兼容 Windows）
        let in_zip_str = in_zip.to_string_lossy().replace('\\', "/");

        if path.is_dir() {
            // 目录条目：末尾必须有 /
            let dir_name = if in_zip_str.ends_with('/') {
                in_zip_str.to_string()
            } else {
                format!("{}/", in_zip_str)
            };
            #[allow(deprecated)]
            let opts = FileOptions::default()
                .compression_method(zip::CompressionMethod::Stored)
                .unix_permissions(0o755);
            zip.add_directory(&dir_name, opts)
                .map_err(|e| format!("添加目录失败 {}: {}", dir_name, e))?;
        } else if path.is_file() {
            #[allow(deprecated)]
            let opts = FileOptions::default()
                .compression_method(zip::CompressionMethod::Stored)
                .unix_permissions(0o644);
            zip.start_file(&in_zip_str, opts)
                .map_err(|e| format!("开始文件失败 {}: {}", in_zip_str, e))?;
            let mut f = File::open(path)
                .map_err(|e| format!("打开文件失败 {}: {}", path.display(), e))?;
            let mut buf = Vec::new();
            f.read_to_end(&mut buf)
                .map_err(|e| format!("读取文件失败: {}", e))?;
            zip.write_all(&buf)
                .map_err(|e| format!("写入文件失败: {}", e))?;
        }
        // 符号链接直接跳过
    }

    zip.finish().map_err(|e| format!("完成 zip 失败: {}", e))?;
    Ok(())
}

#[command]
pub async fn export_item(
    source_path: String,
    dest_dir: String,
    is_zip: bool,
    name: String,
) -> Result<(), String> {
    let src = PathBuf::from(&source_path);
    if !src.exists() {
        return Err(format!("源路径不存在: {}", source_path));
    }
    let dest = PathBuf::from(&dest_dir);
    if !dest.exists() {
        return Err(format!("目标目录不存在: {}", dest_dir));
    }

    if is_zip {
        let zip_path = dest.join(format!("{}.zip", name));
        // 先删已有的同名 zip
        if zip_path.exists() {
            let _ = std::fs::remove_file(&zip_path);
        }

        let src_clone = src.clone();
        let zip_path_clone = zip_path.clone();
        let name_clone = name.clone();

        // 在线程池里执行耗时的 IO 操作，不阻塞 Tauri 异步运行时
        tauri::async_runtime::spawn_blocking(move || {
            zip_directory(&src_clone, &zip_path_clone, &name_clone)
        })
        .await
        .map_err(|e| format!("线程执行失败: {}", e))??;
    } else {
        let dest_clone = dest.clone();
        let name_clone = name.clone();
        let src_clone = src.clone();

        tauri::async_runtime::spawn_blocking(move || {
            let target_dir = dest_clone.join(&name_clone);
            if !target_dir.exists() {
                std::fs::create_dir_all(&target_dir)
                    .map_err(|e| format!("创建目标目录失败: {}", e))?;
            }

            let mut opts = fs_extra::dir::CopyOptions::new();
            opts.overwrite = true;
            opts.content_only = true; // 只拷贝内容进 target_dir，不在目标内再嵌套一层
            fs_extra::dir::copy(&src_clone, &target_dir, &opts)
                .map_err(|e| format!("复制失败: {}", e))?;
            Ok::<(), String>(())
        })
        .await
        .map_err(|e| format!("线程执行失败: {}", e))??;
    }

    Ok(())
}

#[command]
pub async fn check_exists(path: String) -> Result<bool, String> {
    Ok(std::path::Path::new(&path).exists())
}

#[command]
pub async fn export_batch(
    source_paths: Vec<String>,
    dest_path: String, // 如果是 zip 就是完整文件路径，如果是文件夹导出就是目标目录
    is_zip: bool,
) -> Result<(), String> {
    let dest = PathBuf::from(&dest_path);

    if is_zip {
        // 先删已有的同名 zip
        if dest.exists() {
            let _ = std::fs::remove_file(&dest);
        }

        let zip_path_clone = dest.clone();
        
        // 执行耗时 IO
        tauri::async_runtime::spawn_blocking(move || {
            let file = File::create(&zip_path_clone).map_err(|e| format!("创建 zip 失败: {}", e))?;
            let mut zip = ZipWriter::new(file);

            for source_path in source_paths {
                let src = PathBuf::from(&source_path);
                if !src.exists() { continue; }
                let root_name = src.file_name().unwrap_or(src.as_os_str()).to_string_lossy().to_string();

                for entry in WalkDir::new(&src)
                    .follow_links(false)
                    .into_iter()
                    .filter_map(|e| e.ok())
                {
                    let path = entry.path();
                    let relative = path.strip_prefix(&src).map_err(|e| e.to_string())?;

                    let mut in_zip = PathBuf::from(&root_name);
                    in_zip.push(relative);
                    let in_zip_str = in_zip.to_string_lossy().replace('\\', "/");

                    if path.is_dir() {
                        let dir_name = if in_zip_str.ends_with('/') {
                            in_zip_str.to_string()
                        } else {
                            format!("{}/", in_zip_str)
                        };
                        #[allow(deprecated)]
                        let opts = FileOptions::default()
                            .compression_method(zip::CompressionMethod::Stored)
                            .unix_permissions(0o755);
                        zip.add_directory(&dir_name, opts).ok();
                    } else if path.is_file() {
                        #[allow(deprecated)]
                        let opts = FileOptions::default()
                            .compression_method(zip::CompressionMethod::Stored)
                            .unix_permissions(0o644);
                        zip.start_file(&in_zip_str, opts).ok();
                        if let Ok(mut f) = File::open(path) {
                            let mut buf = Vec::new();
                            if f.read_to_end(&mut buf).is_ok() {
                                zip.write_all(&buf).ok();
                            }
                        }
                    }
                }
            }
            zip.finish().map_err(|e| format!("完成 zip 失败: {}", e))?;
            Ok::<(), String>(())
        })
        .await
        .map_err(|e| format!("线程执行失败: {}", e))??;
    } else {
        if !dest.exists() {
            std::fs::create_dir_all(&dest).map_err(|e| format!("创建目标目录失败: {}", e))?;
        }
        
        let dest_clone = dest.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let mut opts = fs_extra::dir::CopyOptions::new();
            opts.overwrite = true;
            opts.content_only = true;
            
            for source_path in source_paths {
                let src = PathBuf::from(&source_path);
                if !src.exists() { continue; }
                let root_name = src.file_name().unwrap_or(src.as_os_str()).to_string_lossy().to_string();
                
                let target_dir = dest_clone.join(&root_name);
                if !target_dir.exists() {
                    std::fs::create_dir_all(&target_dir).ok();
                }
                
                fs_extra::dir::copy(&src, &target_dir, &opts).ok();
            }
            Ok::<(), String>(())
        })
        .await
        .map_err(|e| format!("线程执行失败: {}", e))??;
    }

    Ok(())
}
