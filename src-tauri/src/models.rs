use serde::{Deserialize, Serialize};

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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub shortcut: String,
    pub max_history_size: usize,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_sensitive_apps")]
    pub sensitive_apps: Vec<String>,
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

fn default_sensitive_apps() -> Vec<String> {
    vec![
        "1Password".to_string(),
        "Keychain Access".to_string(),
        "Bitwarden".to_string(),
        "LastPass".to_string(),
        "KeePassXC".to_string(),
        "Enpass".to_string(),
        "Dashlane".to_string(),
    ]
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            shortcut: "CommandOrControl+Shift+V".to_string(),
            max_history_size: 20,
            language: "auto".to_string(),
            theme: "auto".to_string(),
            sensitive_apps: default_sensitive_apps(),
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
