use active_win_pos_rs::get_active_window;
use chrono::Local;
use clipboard_master::{CallbackResult, ClipboardHandler};
use clipboard_rs::{Clipboard, ClipboardContext};
use tauri::{Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::models::ClipboardItem;
use crate::state::AppState;
use crate::tray::update_tray_menu;
use crate::utils::classify_content;

pub struct ClipboardMonitor {
    pub app_handle: tauri::AppHandle,
    pub last_text: String,
    pub last_image_hash: Vec<u8>,
    pub last_files: Vec<String>,
}

impl ClipboardMonitor {
    pub fn new(app_handle: tauri::AppHandle) -> Self {
        let mut last_text = String::new();
        if let Ok(text) = app_handle.clipboard().read_text() {
            last_text = text;
        }
        Self {
            app_handle,
            last_text,
            last_image_hash: Vec::new(),
            last_files: Vec::new(),
        }
    }

    fn is_password_manager(&self, app_name: &str) -> bool {
        let state = self.app_handle.state::<AppState>();
        let config = state.config.lock().unwrap();
        config
            .sensitive_apps
            .iter()
            .any(|app| app_name.contains(app) || app_name.eq_ignore_ascii_case(app))
    }
}

impl ClipboardHandler for ClipboardMonitor {
    fn on_clipboard_change(&mut self) -> CallbackResult {
        let state = self.app_handle.state::<AppState>();

        // Check if paused
        if let Ok(paused) = state.is_paused.lock() {
            if *paused {
                return CallbackResult::Next;
            }
        }

        // Check active application
        let mut source_app = None;
        if let Ok(active_window) = get_active_window() {
            log::info!("Active window app: {}", active_window.app_name);
            if self.is_password_manager(&active_window.app_name) {
                log::info!(
                    "Ignored clipboard change from sensitive app: {}",
                    active_window.app_name
                );
                return CallbackResult::Next;
            }
            source_app = Some(active_window.app_name);
        } else {
            log::warn!("Failed to get active window");
        }

        let mut updated = false;
        let max_size = state.config.lock().unwrap().max_history_size;

        let mut captured_something = false;

        // Check files
        if let Ok(ctx) = ClipboardContext::new() {
            if let Ok(files) = ctx.get_files() {
                if !files.is_empty() {
                    // Check if this change was initiated by the app itself
                    if let Ok(mut last_app_file_change) = state.last_app_file_change.lock() {
                        if let Some(last_files) = last_app_file_change.as_ref() {
                            if last_files == &files {
                                log::info!("Ignoring clipboard file change initiated by app");
                                self.last_files = files;
                                *last_app_file_change = None;
                                return CallbackResult::Next;
                            }
                        }
                    }

                    if files != self.last_files {
                        self.last_files = files.clone();
                        self.last_text = String::new();
                        self.last_image_hash = Vec::new();

                        let content = serde_json::to_string(&files).unwrap_or_default();

                        let item = ClipboardItem {
                            id: None,
                            content,
                            kind: "file".to_string(),
                            timestamp: Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string(),
                            is_sensitive: false,
                            is_pinned: false,
                            source_app: source_app.clone(),
                            data_type: "file-list".to_string(),
                            collection_id: None,
                            note: None,
                            html_content: None,
                        };

                        match state.db.insert_item(&item, max_size) {
                            Ok(pruned_items) => {
                                for pruned in pruned_items {
                                    if pruned.kind == "image" {
                                        let path = std::path::Path::new(&pruned.content);
                                        if path.exists() {
                                            let _ = std::fs::remove_file(path);
                                        }
                                    }
                                }
                                updated = true;
                                log::info!("New files captured");
                            }
                            Err(e) => {
                                log::error!("Failed to insert file item: {}", e);
                            }
                        }
                    }
                    captured_something = true;
                }
            }
        }

        // Check text
        if !captured_something {
            if let Ok(text) = self.app_handle.clipboard().read_text() {
                // Check if this change was initiated by the app itself
                if let Ok(mut last_app_change) = state.last_app_change.lock() {
                    if let Some(last_content) = last_app_change.as_ref() {
                        if last_content == &text {
                            log::info!("Ignoring clipboard change initiated by app");
                            self.last_text = text;
                            *last_app_change = None;
                            return CallbackResult::Next;
                        }
                    }
                }

                if text != self.last_text && !text.is_empty() {
                    self.last_text = text.clone();
                    let is_sensitive = false;
                    let data_type = classify_content(&text);

                    let html_content = if let Ok(ctx) = ClipboardContext::new() {
                        ctx.get_html().ok()
                    } else {
                        None
                    };

                    let item = ClipboardItem {
                        id: None,
                        content: text,
                        kind: "text".to_string(),
                        timestamp: Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string(),
                        is_sensitive,
                        is_pinned: false,
                        source_app: source_app.clone(),
                        data_type,
                        collection_id: None,
                        note: None,
                        html_content,
                    };

                    match state.db.insert_item(&item, max_size) {
                        Ok(pruned_items) => {
                            // Delete pruned images
                            for pruned in pruned_items {
                                if pruned.kind == "image" {
                                    let path = std::path::Path::new(&pruned.content);
                                    if path.exists() {
                                        let _ = std::fs::remove_file(path);
                                    }
                                }
                            }
                            updated = true;
                            if is_sensitive {
                                log::info!("New sensitive text captured");
                            } else {
                                log::info!("New text captured");
                            }
                        }
                        Err(e) => {
                            log::error!("Failed to insert text item: {}", e);
                        }
                    }
                }
            }
        }

        // Check image
        if !captured_something {
            if let Ok(img) = self.app_handle.clipboard().read_image() {
                let rgba = img.rgba();

                // Check if this change was initiated by the app itself
                if let Ok(mut last_app_image_change) = state.last_app_image_change.lock() {
                    if let Some(last_content) = last_app_image_change.as_ref() {
                        if last_content == rgba {
                            log::info!("Ignoring clipboard image change initiated by app");
                            self.last_image_hash = rgba.to_vec();
                            *last_app_image_change = None;
                            return CallbackResult::Next;
                        }
                    }
                }

                if !rgba.is_empty()
                    && (rgba.len() != self.last_image_hash.len()
                        || rgba != self.last_image_hash.as_slice())
                {
                    self.last_image_hash = rgba.to_vec();

                    let width = img.width();
                    let height = img.height();
                    if let Some(buffer) = image::RgbaImage::from_raw(width, height, rgba.to_vec()) {
                        let timestamp = Local::now().timestamp_nanos_opt().unwrap_or(0);
                        let filename = format!("{}.png", timestamp);
                        let app_data_dir = self.app_handle.path().app_data_dir().unwrap();
                        let image_path = app_data_dir.join("images").join(&filename);

                        if let Err(e) = buffer.save(&image_path) {
                            log::error!("Failed to save image to disk: {}", e);
                        } else {
                            let item = ClipboardItem {
                                id: None,
                                content: image_path.to_string_lossy().to_string(),
                                kind: "image".to_string(),
                                timestamp: Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string(),
                                is_sensitive: false,
                                is_pinned: false,
                                source_app: source_app.clone(),
                                data_type: "image".to_string(),
                                collection_id: None,
                                note: None,
                                html_content: None,
                            };

                            match state.db.insert_item(&item, max_size) {
                                Ok(pruned_items) => {
                                    // Delete pruned images
                                    for pruned in pruned_items {
                                        if pruned.kind == "image" {
                                            let path = std::path::Path::new(&pruned.content);
                                            if path.exists() {
                                                let _ = std::fs::remove_file(path);
                                            }
                                        }
                                    }
                                    updated = true;
                                    log::info!("New image captured and saved to {:?}", image_path);
                                }
                                Err(e) => {
                                    log::error!("Failed to insert image item: {}", e);
                                }
                            }
                        }
                    }
                }
            }
        }

        if updated {
            let history = state
                .db
                .get_history(1, 20, None, false, false, None)
                .unwrap_or_default();
            if let Err(e) = update_tray_menu(&self.app_handle, &history) {
                log::error!("Failed to update tray: {}", e);
            }

            if let Err(e) = self.app_handle.emit("clipboard-update", ()) {
                log::error!("Failed to emit clipboard-update event: {}", e);
            }
        }

        CallbackResult::Next
    }

    fn on_clipboard_error(&mut self, error: std::io::Error) -> CallbackResult {
        log::error!("Clipboard listener error: {}", error);
        CallbackResult::Next
    }
}
