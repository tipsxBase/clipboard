use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::db::Database;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardItem {
    pub id: Option<i64>,
    pub content: String, // 文字内容或图片的Base64
    pub kind: String,    // "text" or "image"
    pub timestamp: String,
    #[serde(default)]
    pub is_sensitive: bool,
    #[serde(default)]
    pub is_pinned: bool,
    #[serde(default)]
    pub source_app: Option<String>,
    #[serde(default = "default_data_type")]
    pub data_type: String, // "text", "image", "url", "email", "code", "phone"
    #[serde(default)]
    pub collection_id: Option<i64>,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub html_content: Option<String>,
    #[serde(default)]
    pub is_snippet: bool,
    /// Links OCR text items to their source screenshot image (history id)
    #[serde(default)]
    pub screenshot_id: Option<i64>,
}

fn default_data_type() -> String {
    "text".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Collection {
    pub id: i64,
    pub name: String,
    pub created_at: String,
    #[serde(default = "default_collection_icon")]
    pub icon: String,
    #[serde(default)]
    pub color: String,
}

fn default_collection_icon() -> String {
    "folder".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub shortcut: String,
    pub max_history_size: usize,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default)]
    pub compact_mode: bool,
    // 清空历史时是否清空置顶内容
    #[serde(default)]
    pub clear_pinned_on_clear: bool,
    // 清空历史时是否删除收藏的内容
    #[serde(default)]
    pub clear_collected_on_clear: bool,
    // 截图快捷键
    #[serde(default = "default_screenshot_shortcut")]
    pub screenshot_shortcut: String,
    // 截图导出格式: "png" | "jpeg" | "webp"
    #[serde(default = "default_screenshot_format")]
    pub screenshot_format: String,
    // 截图导出质量 (1-100, 仅 jpeg/webp 有效)
    #[serde(default = "default_screenshot_quality")]
    pub screenshot_quality: u8,
    // 截图确认后的默认动作: "clipboard" | "file" | "both"
    #[serde(default = "default_screenshot_action")]
    pub screenshot_save_action: String,
}

fn default_screenshot_shortcut() -> String {
    "CommandOrControl+Shift+S".to_string()
}

fn default_screenshot_format() -> String {
    "png".to_string()
}

fn default_screenshot_quality() -> u8 {
    90
}

fn default_screenshot_action() -> String {
    "clipboard".to_string()
}

fn default_language() -> String {
    "auto".to_string()
}

fn default_theme() -> String {
    "auto".to_string()
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            shortcut: "CommandOrControl+Shift+V".to_string(),
            max_history_size: 20,
            language: "auto".to_string(),
            theme: "auto".to_string(),
            compact_mode: false,
            clear_pinned_on_clear: false,
            clear_collected_on_clear: false,
            screenshot_shortcut: "CommandOrControl+Shift+S".to_string(),
            screenshot_format: "png".to_string(),
            screenshot_quality: 90,
            screenshot_save_action: "clipboard".to_string(),
        }
    }
}

impl AppConfig {
    /// Load config from database, falling back to defaults if not found.
    pub fn from_db(db: &Arc<Database>) -> Self {
        let config_values = db.get_all_config().unwrap_or_default();

        Self {
            shortcut: config_values
                .get("shortcut")
                .cloned()
                .unwrap_or_else(|| "CommandOrControl+Shift+V".to_string()),
            max_history_size: config_values
                .get("max_history_size")
                .and_then(|v| v.parse().ok())
                .unwrap_or(20),
            language: config_values
                .get("language")
                .cloned()
                .unwrap_or_else(|| "auto".to_string()),
            theme: config_values
                .get("theme")
                .cloned()
                .unwrap_or_else(|| "auto".to_string()),
            compact_mode: config_values
                .get("compact_mode")
                .and_then(|v| v.parse().ok())
                .unwrap_or(false),
            clear_pinned_on_clear: config_values
                .get("clear_pinned_on_clear")
                .and_then(|v| v.parse().ok())
                .unwrap_or(false),
            clear_collected_on_clear: config_values
                .get("clear_collected_on_clear")
                .and_then(|v| v.parse().ok())
                .unwrap_or(false),
            screenshot_shortcut: config_values
                .get("screenshot_shortcut")
                .cloned()
                .unwrap_or_else(|| "CommandOrControl+Shift+S".to_string()),
            screenshot_format: config_values
                .get("screenshot_format")
                .cloned()
                .unwrap_or_else(|| "png".to_string()),
            screenshot_quality: config_values
                .get("screenshot_quality")
                .and_then(|v| v.parse().ok())
                .unwrap_or(90),
            screenshot_save_action: config_values
                .get("screenshot_save_action")
                .cloned()
                .unwrap_or_else(|| "clipboard".to_string()),
        }
    }

    /// Save config to database.
    pub fn save_to_db(&self, db: &Arc<Database>) -> Result<(), String> {
        let config_values = serde_json::json!({
            "shortcut": self.shortcut,
            "max_history_size": self.max_history_size.to_string(),
            "language": self.language,
            "theme": self.theme,
            "compact_mode": self.compact_mode.to_string(),
            "clear_pinned_on_clear": self.clear_pinned_on_clear.to_string(),
            "clear_collected_on_clear": self.clear_collected_on_clear.to_string(),
            "screenshot_shortcut": self.screenshot_shortcut,
            "screenshot_format": self.screenshot_format,
            "screenshot_quality": self.screenshot_quality.to_string(),
            "screenshot_save_action": self.screenshot_save_action,
        });

        if let serde_json::Value::Object(map) = config_values {
            for (key, value) in map {
                let value_str = match value {
                    serde_json::Value::String(s) => s.clone(),
                    serde_json::Value::Number(n) => n.to_string(),
                    serde_json::Value::Bool(b) => b.to_string(),
                    _ => continue,
                };
                if let Err(e) = db.set_config_value(&key, &value_str) {
                    log::error!("Failed to save config key '{}': {}", key, e);
                    return Err(e.to_string());
                }
            }
        }
        Ok(())
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ScreenInfo {
    pub id: u32,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub is_primary: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CaptureResult {
    pub id: u32,
    pub path: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}
