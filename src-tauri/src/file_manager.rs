use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime};

/// 临时文件信息
#[derive(Debug, Clone)]
pub struct TempFile {
    pub path: PathBuf,
    pub created_at: SystemTime,
    pub screen_index: u32,
}

/// 文件管理器
/// 负责管理临时文件的创建、删除和清理
pub struct FileManager {
    temp_files: Arc<Mutex<Vec<TempFile>>>,
    temp_dir: PathBuf,
}

impl FileManager {
    /// 创建新的文件管理器实例
    ///
    /// # Arguments
    /// * `temp_dir` - 临时文件目录路径
    pub fn new(temp_dir: PathBuf) -> Result<Self, String> {
        // 确保临时目录存在
        if !temp_dir.exists() {
            fs::create_dir_all(&temp_dir)
                .map_err(|e| format!("Failed to create temp directory: {}", e))?;
        }

        Ok(Self {
            temp_files: Arc::new(Mutex::new(Vec::new())),
            temp_dir,
        })
    }

    /// 添加临时文件记录
    ///
    /// # Arguments
    /// * `path` - 文件路径
    /// * `screen_index` - 屏幕索引
    pub fn add_temp_file(&self, path: PathBuf, screen_index: u32) {
        let temp_file = TempFile {
            path,
            created_at: SystemTime::now(),
            screen_index,
        };

        if let Ok(mut files) = self.temp_files.lock() {
            files.push(temp_file);
            log::info!("Added temp file to tracking list, total: {}", files.len());
        }
    }

    /// 删除指定的临时文件
    ///
    /// # Arguments
    /// * `path` - 文件路径
    pub fn delete_temp_file(&self, path: &Path) -> Result<(), String> {
        // 从列表中移除
        if let Ok(mut files) = self.temp_files.lock() {
            files.retain(|f| f.path != path);
        }

        // 删除文件
        if path.exists() {
            fs::remove_file(path).map_err(|e| {
                log::error!("Failed to delete temp file {:?}: {}", path, e);
                format!("Failed to delete file: {}", e)
            })?;
            log::info!("Deleted temp file: {:?}", path);
        }

        Ok(())
    }

    /// 删除所有临时文件
    pub fn delete_all_temp_files(&self) -> Result<(), String> {
        let files = if let Ok(mut files) = self.temp_files.lock() {
            let files_clone = files.clone();
            files.clear();
            files_clone
        } else {
            return Err("Failed to lock temp files list".to_string());
        };

        let mut errors = Vec::new();

        for temp_file in files {
            if temp_file.path.exists() {
                if let Err(e) = fs::remove_file(&temp_file.path) {
                    log::error!("Failed to delete temp file {:?}: {}", temp_file.path, e);
                    errors.push(format!("{:?}: {}", temp_file.path, e));
                } else {
                    log::info!("Deleted temp file: {:?}", temp_file.path);
                }
            }
        }

        if !errors.is_empty() {
            return Err(format!(
                "Failed to delete some files: {}",
                errors.join(", ")
            ));
        }

        log::info!("All temp files deleted successfully");
        Ok(())
    }

    /// 清理过期的临时文件
    ///
    /// # Arguments
    /// * `max_age` - 文件最大保留时间
    ///
    /// # Returns
    /// 返回清理的文件数量
    pub fn cleanup_expired_files(&self, max_age: Duration) -> Result<usize, String> {
        let now = SystemTime::now();
        let mut cleaned_count = 0;

        // 获取过期文件列表
        let expired_files = if let Ok(mut files) = self.temp_files.lock() {
            let (expired, valid): (Vec<_>, Vec<_>) = files.drain(..).partition(|f| {
                if let Ok(age) = now.duration_since(f.created_at) {
                    age > max_age
                } else {
                    false
                }
            });

            *files = valid;
            expired
        } else {
            return Err("Failed to lock temp files list".to_string());
        };

        // 删除过期文件
        for temp_file in expired_files {
            if temp_file.path.exists() {
                match fs::remove_file(&temp_file.path) {
                    Ok(_) => {
                        log::info!("Cleaned up expired file: {:?}", temp_file.path);
                        cleaned_count += 1;
                    }
                    Err(e) => {
                        log::error!("Failed to delete expired file {:?}: {}", temp_file.path, e);
                    }
                }
            }
        }

        log::info!("Cleaned up {} expired files", cleaned_count);
        Ok(cleaned_count)
    }

    /// 清理临时目录中的所有文件（包括未跟踪的文件）
    pub fn cleanup_temp_directory(&self) -> Result<usize, String> {
        let mut cleaned_count = 0;

        if !self.temp_dir.exists() {
            return Ok(0);
        }

        let entries = fs::read_dir(&self.temp_dir)
            .map_err(|e| format!("Failed to read temp directory: {}", e))?;

        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.is_file() {
                    match fs::remove_file(&path) {
                        Ok(_) => {
                            log::info!("Cleaned up file: {:?}", path);
                            cleaned_count += 1;
                        }
                        Err(e) => {
                            log::error!("Failed to delete file {:?}: {}", path, e);
                        }
                    }
                }
            }
        }

        // 清空跟踪列表
        if let Ok(mut files) = self.temp_files.lock() {
            files.clear();
        }

        log::info!("Cleaned up {} files from temp directory", cleaned_count);
        Ok(cleaned_count)
    }

    /// 保存截图到指定路径
    ///
    /// # Arguments
    /// * `data` - 图片数据
    /// * `path` - 保存路径
    pub fn save_screenshot(&self, data: &[u8], path: &Path) -> Result<(), String> {
        // 确保目标目录存在
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create directory: {}", e))?;
            }
        }

        // 写入文件
        fs::write(path, data).map_err(|e| format!("Failed to write file: {}", e))?;

        log::info!("Screenshot saved to: {:?}", path);
        Ok(())
    }

    /// 保存截图到指定路径（支持不同格式和质量）
    ///
    /// # Arguments
    /// * `data` - 图片数据
    /// * `path` - 保存路径
    /// * `format` - 图片格式 (png, jpg, webp)
    /// * `quality` - 图片质量 (0-100，仅用于 jpg 和 webp)
    pub fn save_screenshot_with_format(
        &self,
        data: &[u8],
        path: &Path,
        format: &str,
        quality: u8,
    ) -> Result<(), String> {
        // 确保目标目录存在
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create directory: {}", e))?;
            }
        }

        // 根据格式处理图片
        match format.to_lowercase().as_str() {
            "png" => {
                // PNG 格式直接写入
                fs::write(path, data).map_err(|e| format!("Failed to write PNG file: {}", e))?;
            }
            "jpg" | "jpeg" => {
                // JPG 格式需要转换
                let img = image::load_from_memory(data)
                    .map_err(|e| format!("Failed to load image: {}", e))?;

                let mut output = Vec::new();
                let mut encoder =
                    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut output, quality);
                encoder
                    .encode_image(&img)
                    .map_err(|e| format!("Failed to encode JPEG: {}", e))?;

                fs::write(path, output).map_err(|e| format!("Failed to write JPEG file: {}", e))?;
            }
            "webp" => {
                // WebP 格式需要转换
                let img = image::load_from_memory(data)
                    .map_err(|e| format!("Failed to load image: {}", e))?;

                let mut output = Vec::new();
                // 在 image 0.25 中，WebP 编码器只支持无损编码
                let encoder = image::codecs::webp::WebPEncoder::new_lossless(&mut output);
                encoder
                    .encode(
                        img.as_bytes(),
                        img.width(),
                        img.height(),
                        img.color().into(),
                    )
                    .map_err(|e| format!("Failed to encode WebP: {}", e))?;

                fs::write(path, output).map_err(|e| format!("Failed to write WebP file: {}", e))?;
            }
            _ => {
                return Err(format!("Unsupported format: {}", format));
            }
        }

        log::info!(
            "Screenshot saved to: {:?} (format: {}, quality: {})",
            path,
            format,
            quality
        );
        Ok(())
    }

    /// 获取临时目录路径
    pub fn get_temp_dir(&self) -> &Path {
        &self.temp_dir
    }

    /// 获取当前跟踪的临时文件数量
    pub fn get_temp_file_count(&self) -> usize {
        if let Ok(files) = self.temp_files.lock() {
            files.len()
        } else {
            0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn test_file_manager_creation() {
        let temp_dir = std::env::temp_dir().join("test_file_manager");
        let manager = FileManager::new(temp_dir.clone()).unwrap();
        assert!(temp_dir.exists());
        // 清理
        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn test_add_and_delete_temp_file() {
        let temp_dir = std::env::temp_dir().join("test_temp_files");
        let manager = FileManager::new(temp_dir.clone()).unwrap();

        // 创建测试文件
        let test_file = temp_dir.join("test.txt");
        fs::write(&test_file, b"test").unwrap();

        // 添加到跟踪列表
        manager.add_temp_file(test_file.clone(), 0);
        assert_eq!(manager.get_temp_file_count(), 1);

        // 删除文件
        manager.delete_temp_file(&test_file).unwrap();
        assert_eq!(manager.get_temp_file_count(), 0);
        assert!(!test_file.exists());

        // 清理
        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn test_cleanup_expired_files() {
        let temp_dir = std::env::temp_dir().join("test_expired_files");
        let manager = FileManager::new(temp_dir.clone()).unwrap();

        // 创建测试文件
        let test_file = temp_dir.join("expired.txt");
        fs::write(&test_file, b"test").unwrap();

        // 添加到跟踪列表（使用过去的时间）
        let old_file = TempFile {
            path: test_file.clone(),
            created_at: SystemTime::now() - Duration::from_secs(25 * 3600), // 25 小时前
            screen_index: 0,
        };

        if let Ok(mut files) = manager.temp_files.lock() {
            files.push(old_file);
        }

        // 清理过期文件（24 小时）
        let cleaned = manager
            .cleanup_expired_files(Duration::from_secs(24 * 3600))
            .unwrap();
        assert_eq!(cleaned, 1);
        assert!(!test_file.exists());

        // 清理
        let _ = fs::remove_dir_all(temp_dir);
    }
}
