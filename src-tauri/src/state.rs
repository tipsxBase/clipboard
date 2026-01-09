use crate::db::Database;
use crate::models::{AppConfig, ClipboardItem};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::menu::MenuItem;
use tauri::Wry;

pub struct AppState {
    pub db: Arc<Database>,
    pub config_path: PathBuf,
    pub config: Arc<Mutex<AppConfig>>,
    pub is_paused: Arc<Mutex<bool>>,
    pub last_app_change: Arc<Mutex<Option<String>>>,
    pub last_app_image_change: Arc<Mutex<Option<Vec<u8>>>>,
    pub last_app_file_change: Arc<Mutex<Option<Vec<String>>>>,
    pub paste_stack: Arc<Mutex<Vec<ClipboardItem>>>,
    pub pause_item: Arc<Mutex<Option<MenuItem<Wry>>>>,
}
