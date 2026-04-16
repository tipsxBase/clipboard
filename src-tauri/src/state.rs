use crate::db::Database;
use crate::file_manager::FileManager;
use crate::models::{AppConfig, CaptureResult, ClipboardItem};
use crate::rules::RulesEngine;
use crate::storage_paths::StoragePaths;
use std::sync::{Arc, Mutex};
use tauri::menu::MenuItem;
use tauri::Wry;

/// Update info structure for tracking available updates
#[derive(Clone, serde::Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
}

pub struct AppState {
    pub db: Arc<Database>,
    pub config: Arc<Mutex<AppConfig>>,
    pub is_paused: Arc<Mutex<bool>>,
    pub last_app_change: Arc<Mutex<Option<String>>>,
    pub last_app_image_change: Arc<Mutex<Option<Vec<u8>>>>,
    pub last_app_file_change: Arc<Mutex<Option<Vec<String>>>>,
    pub paste_stack: Arc<Mutex<Vec<ClipboardItem>>>,
    pub current_captures: Arc<Mutex<Option<Vec<CaptureResult>>>>,
    pub pause_item: Arc<Mutex<Option<MenuItem<Wry>>>>,
    pub version_item: Arc<Mutex<Option<MenuItem<Wry>>>>,
    pub file_manager: Arc<FileManager>,
    pub storage_paths: Arc<StoragePaths>,
    pub rules_engine: Arc<RulesEngine>,
    pub update_info: Arc<Mutex<Option<UpdateInfo>>>,
}
