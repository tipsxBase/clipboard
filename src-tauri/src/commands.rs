use chrono::Local;
use std::fs;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

use crate::models::{AppConfig, CaptureResult, ClipboardItem, Collection};
use crate::ocr::recognize_text;
use crate::rules::Rule;
use crate::state::AppState;
use crate::tray::{update_pause_menu_item, update_tray_menu};
use crate::utils::{classify_content, write_to_clipboard};

#[tauri::command]
pub async fn start_capture(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Starting screen capture...");

    // 在 macOS 上检查屏幕录制权限
    #[cfg(target_os = "macos")]
    {
        if !crate::screenshot::check_screen_recording_permission() {
            log::warn!("Screen recording permission denied");
            // 请求权限（触发系统弹窗）
            extern "C" {
                fn CGRequestScreenCaptureAccess() -> bool;
            }
            unsafe {
                CGRequestScreenCaptureAccess();
            }
            return Err("Screen recording permission is required. Please grant access in System Settings > Privacy & Security > Screen Recording.".to_string());
        }
    }

    // Use the shared temp screenshot directory
    let cache_dir = state.storage_paths.temp_screenshot_dir().clone();
    if !cache_dir.exists() {
        fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }

    // 1. Capture screens FIRST (before showing window to avoid capturing our own UI)
    let file_manager = state.file_manager.clone();
    let captures = tauri::async_runtime::spawn_blocking(move || {
        crate::screenshot::capture_all_screens(cache_dir, Some(file_manager))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e)?;

    log::info!("Capture complete: {} screens", captures.len());

    // Save to state so windows can fetch it
    if let Ok(mut c) = state.current_captures.lock() {
        *c = Some(captures.clone());
    }

    // 2. Multi-window: Create a window for EACH screen
    if captures.is_empty() {
        return Err("No screens captured".to_string());
    }

    for cap in &captures {
        let label = format!("screenshot_{}", cap.id);
        // Use index.html with query param. App.vue handles component rendering based on window label.
        let url = format!("index.html?screen_id={}", cap.id);
        let window = if let Some(w) = app.get_webview_window(&label) {
            w
        } else {
            // Convert physical pixels (from image capture) to logical pixels for Tauri window
            let logical_width = cap.width as f64 / cap.scale_factor;
            let logical_height = cap.height as f64 / cap.scale_factor;

            // x and y from display_info are usually in logical coordinates
            let logical_x = cap.x as f64;
            let logical_y = cap.y as f64;
            println!(
                "Creating window for screen {}: {}x{} (logical) at ({},{}), scale: {}",
                cap.id, logical_width, logical_height, cap.x, cap.y, cap.scale_factor
            );
            let builder =
                tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App(url.into()))
                    .title("Screenshot")
                    .decorations(false)
                    //.transparent(true) // Configured via macOS specific helper below or handled by window effect
                    .always_on_top(true)
                    .skip_taskbar(true)
                    .inner_size(logical_width, logical_height)
                    .position(logical_x, logical_y)
                    .resizable(false)
                    .focused(true)
                    .visible(false); // Start hidden to avoid flicker

            // Apply macOS specific settings if possible via builder or after

            let window = builder
                .build()
                .map_err(|e| format!("Failed to create window {}: {}", label, e))?;

            // Manually enable transparency if supported by platform/tauri version without feature flag
            // Or rely on window_vibrancy / platform specific code
            #[cfg(not(target_os = "macos"))]
            {
                // On Windows/Linux, try basic transparent if method exists or ignore
                // Since we don't have the feature, we can't call .transparent()
                // But wait, changing background color to empty is handled in frontend mostly
                // except window frame. decorations(false) handles frame.
            }

            window
        };

        // Set Mac specific level & transparency
        // Note: transparent(true) covers basic transparency, but make_window_transparent ensures native compliance
        #[cfg(target_os = "macos")]
        {
            let window_clone = window.clone();
            app.run_on_main_thread(move || {
                crate::screenshot::set_window_level_above_menubar(&window_clone);
                // Also call make_window_transparent for robust behavior on macOS
                crate::screenshot::make_window_transparent(&window_clone);
            })
            .map_err(|e| e.to_string())?;
        }

        // Ensure position and size
        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: cap.x,
            y: cap.y,
        }));
        let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
            width: cap.width,
            height: cap.height,
        }));

        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }

    // Emit event to ALL windows (they will filter by their ID)
    app.emit("screenshot-captured", &captures)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_capture_data(state: tauri::State<AppState>) -> Result<Vec<CaptureResult>, String> {
    if let Ok(captures) = state.current_captures.lock() {
        if let Some(c) = &*captures {
            return Ok(c.clone());
        }
    }
    Err("No capture data available".to_string())
}

#[tauri::command]
pub async fn close_capture(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Closing all screenshot windows");
    for (label, window) in app.webview_windows() {
        if label.starts_with("screenshot_") {
            let _ = window.close();
        }
    }

    // 清理临时文件
    let file_manager = state.file_manager.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(e) = file_manager.delete_all_temp_files() {
            log::error!("Failed to cleanup temp files: {}", e);
        }
    })
    .await
    .map_err(|e| e.to_string())?;

    // 清空当前捕获状态
    if let Ok(mut c) = state.current_captures.lock() {
        *c = None;
    }

    Ok(())
}

#[tauri::command]
pub async fn save_captured_image(
    state: tauri::State<'_, AppState>,
    base64_data: String,
    format: Option<String>,
    quality: Option<u8>,
) -> Result<String, String> {
    // Read preferences from config if not provided
    let (fmt, qual) = {
        let config = state.config.lock().unwrap();
        (
            format.unwrap_or_else(|| config.screenshot_format.clone()),
            quality.unwrap_or(config.screenshot_quality),
        )
    };

    // 1. Decode base64
    // remove data:image/...;base64, prefix if present
    let base64_clean = base64_data
        .split(",")
        .last()
        .ok_or("Invalid base64 format")?;

    use base64::{engine::general_purpose, Engine as _};
    let data = general_purpose::STANDARD
        .decode(base64_clean)
        .map_err(|e| e.to_string())?;

    // 2. Generate path with correct extension
    let captures_dir = state.storage_paths.captures_dir();
    if !captures_dir.exists() {
        fs::create_dir_all(&captures_dir).map_err(|e| e.to_string())?;
    }

    let ext = match fmt.as_str() {
        "jpeg" | "jpg" => "jpg",
        "webp" => "webp",
        _ => "png",
    };
    let filename = format!(
        "capture_{}.{}",
        Local::now().format("%Y%m%d_%H%M%S_%f"),
        ext
    );
    let path = captures_dir.join(filename);

    // 3. Save with format conversion
    state
        .file_manager
        .save_screenshot_with_format(&data, &path, &fmt, qual)?;

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_history(
    state: tauri::State<AppState>,
    page: usize,
    page_size: usize,
    query: Option<String>,
    search_regex: Option<bool>,
    search_case_sensitive: Option<bool>,
    collection_id: Option<i64>,
    active_filter: Option<String>,
    source_app: Option<String>,
    time_range: Option<String>,
    sort_mode: Option<String>,
) -> Vec<ClipboardItem> {
    log::info!(
        "get_history query: {:?}, regex: {:?}, case: {:?}, filter: {:?}, source_app: {:?}, time_range: {:?}, sort: {:?}",
        query,
        search_regex,
        search_case_sensitive,
        active_filter,
        source_app,
        time_range,
        sort_mode
    );
    state
        .db
        .get_history(
            page,
            page_size,
            query,
            search_regex.unwrap_or(false),
            search_case_sensitive.unwrap_or(false),
            collection_id,
            active_filter,
            source_app,
            time_range,
            sort_mode,
        )
        .unwrap_or_default()
}

#[tauri::command]
pub fn set_clipboard_item(
    app: tauri::AppHandle,
    content: String,
    kind: String,
    id: Option<i64>,
    html_content: Option<String>,
    screenshot_id: Option<i64>,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    // Mark this content as set by the app to avoid duplication in monitor
    // Do this BEFORE writing to clipboard to avoid race condition
    if let Ok(mut last_change) = state.last_app_change.lock() {
        *last_change = Some(content.clone());
    }

    let data_type = classify_content(&content);

    let item = ClipboardItem {
        id,
        content: content.clone(),
        kind: kind.clone(),
        timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        is_sensitive: false, // Manually added items are assumed not sensitive
        is_pinned: false,
        source_app: None,
        data_type,
        collection_id: None,
        note: None,
        html_content: html_content.clone(),
        is_snippet: false,
        screenshot_id,
    };

    // Write to clipboard
    if let Err(e) = write_to_clipboard(&app, &item) {
        log::error!("Failed to write to clipboard: {}", e);
        return Err(e);
    }

    // Update DB
    if let Some(id) = id {
        if let Err(e) = state.db.update_timestamp(id) {
            log::error!("Failed to update timestamp: {}", e);
            return Err(e.to_string());
        }
    } else {
        let max_size = state.config.lock().unwrap().max_history_size;
        match state.db.insert_item(&item, max_size) {
            Ok(pruned_items) => {
                // Delete pruned images
                for pruned in pruned_items {
                    if pruned.kind == "image" {
                        let path = std::path::Path::new(&pruned.content);
                        if path.exists() {
                            if let Err(e) = fs::remove_file(path) {
                                log::error!("Failed to delete pruned image file: {}", e);
                            } else {
                                log::info!("Deleted pruned image file: {:?}", path);
                            }
                        }
                    }
                }
            }
            Err(e) => {
                log::error!("Failed to insert item into DB: {}", e);
                return Err(e.to_string());
            }
        }
    }

    // Update Tray
    let history = state
        .db
        .get_history(1, 20, None, false, false, None, None, None, None, None)
        .unwrap_or_default();
    if let Err(e) = update_tray_menu(&app, &history) {
        log::error!("Failed to update tray menu: {}", e);
    }

    log::info!("Clipboard item set successfully");
    Ok(())
}

/// Add an item to history without writing to clipboard (e.g., file-only screenshot save)
#[tauri::command]
pub fn add_to_history(
    app: tauri::AppHandle,
    content: String,
    kind: String,
    state: tauri::State<AppState>,
) -> Result<i64, String> {
    let data_type = classify_content(&content);
    let item = ClipboardItem {
        id: None,
        content,
        kind,
        timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        is_sensitive: false,
        is_pinned: false,
        source_app: None,
        data_type,
        collection_id: None,
        note: None,
        html_content: None,
        is_snippet: false,
        screenshot_id: None,
    };

    let max_size = state.config.lock().unwrap().max_history_size;
    match state.db.insert_item(&item, max_size) {
        Ok(_pruned) => {
            // Update Tray
            let history = state
                .db
                .get_history(1, 20, None, false, false, None, None, None, None, None)
                .unwrap_or_default();
            if let Err(e) = update_tray_menu(&app, &history) {
                log::error!("Failed to update tray menu: {}", e);
            }
            // Return the ID of the inserted item
            let items = state
                .db
                .get_history(1, 1, None, false, false, None, None, None, None, None)
                .unwrap_or_default();
            Ok(items.first().and_then(|i| i.id).unwrap_or(0))
        }
        Err(e) => {
            log::error!("Failed to insert item into DB: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn delete_item(
    app: tauri::AppHandle,
    index: usize,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    match state.db.delete_item(index as i64) {
        Ok(Some(item)) => {
            if item.kind == "image" {
                let path = std::path::Path::new(&item.content);
                if path.exists() {
                    if let Err(e) = fs::remove_file(path) {
                        log::error!("Failed to delete image file: {}", e);
                    } else {
                        log::info!("Deleted image file: {:?}", path);
                    }
                }
            }
        }
        Ok(None) => {
            log::warn!("Item at index {} not found", index);
        }
        Err(e) => {
            log::error!("Failed to delete item from DB: {}", e);
            return Err(e.to_string());
        }
    }

    // Update Tray
    let history = state
        .db
        .get_history(1, 20, None, false, false, None, None, None, None, None)
        .unwrap_or_default();
    if let Err(e) = update_tray_menu(&app, &history) {
        log::error!("Failed to update tray menu after delete: {}", e);
    }
    log::info!("Deleted item at index {}", index);
    Ok(())
}

#[tauri::command]
pub fn toggle_sensitive(state: tauri::State<AppState>, index: usize) -> Result<bool, String> {
    match state.db.toggle_sensitive(index as i64) {
        Ok(new_state) => {
            log::info!(
                "Toggled sensitive state for item {} to {}",
                index,
                new_state
            );
            Ok(new_state)
        }
        Err(e) => {
            log::error!("Failed to toggle sensitive state: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn toggle_pin(state: tauri::State<AppState>, index: usize) -> Result<bool, String> {
    match state.db.toggle_pin(index as i64) {
        Ok(new_state) => {
            log::info!("Toggled pin state for item {} to {}", index, new_state);
            Ok(new_state)
        }
        Err(e) => {
            log::error!("Failed to toggle pin state: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn toggle_snippet(state: tauri::State<AppState>, id: i64) -> Result<bool, String> {
    match state.db.toggle_snippet(id) {
        Ok(new_state) => {
            log::info!("Toggled snippet state for item {} to {}", id, new_state);
            Ok(new_state)
        }
        Err(e) => {
            log::error!("Failed to toggle snippet state: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn update_clipboard_item_content(
    state: tauri::State<AppState>,
    id: i64,
    content: String,
    data_type: String,
    note: Option<String>,
    html_content: Option<String>,
) -> Result<(), String> {
    match state
        .db
        .update_content(id, content, data_type, note, html_content)
    {
        Ok(_) => {
            log::info!("Updated item content for id {}", id);
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to update item content: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn clear_history(app: tauri::AppHandle, state: tauri::State<AppState>) -> Result<(), String> {
    let (clear_pinned, clear_collected) = {
        let config = state.config.lock().unwrap();
        (
            config.clear_pinned_on_clear,
            config.clear_collected_on_clear,
        )
    };

    match state.db.clear_history(clear_pinned, clear_collected) {
        Ok(items) => {
            for item in items {
                if item.kind == "image" {
                    let path = std::path::Path::new(&item.content);
                    if path.exists() {
                        if let Err(e) = fs::remove_file(path) {
                            log::error!("Failed to delete image file: {}", e);
                        }
                    }
                }
            }
        }
        Err(e) => {
            log::error!("Failed to clear history: {}", e);
            return Err(e.to_string());
        }
    }

    // Update Tray
    let _ = update_tray_menu(&app, &[]);
    Ok(())
}

// ---- Rule Engine Commands ----

#[tauri::command]
pub fn get_rules(state: tauri::State<AppState>) -> Vec<Rule> {
    state.rules_engine.get_rules()
}

#[tauri::command]
pub fn add_rule(state: tauri::State<AppState>, rule: Rule) -> Result<(), String> {
    state.rules_engine.add_rule(&rule)
}

#[tauri::command]
pub fn update_rule(state: tauri::State<AppState>, rule: Rule) -> Result<(), String> {
    state.rules_engine.update_rule(&rule)
}

#[tauri::command]
pub fn delete_rule(state: tauri::State<AppState>, id: String) -> Result<(), String> {
    state.rules_engine.delete_rule(&id)
}

#[tauri::command]
pub fn get_config(state: tauri::State<AppState>) -> AppConfig {
    let config = state.config.lock().unwrap();
    config.clone()
}

#[tauri::command]
pub fn save_config(
    app: tauri::AppHandle,
    shortcut: String,
    max_history_size: usize,
    language: String,
    theme: String,
    compact_mode: bool,
    clear_pinned_on_clear: bool,
    clear_collected_on_clear: bool,
    screenshot_shortcut: String,
    screenshot_format: String,
    screenshot_quality: u8,
    screenshot_save_action: String,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let (old_shortcut, old_screenshot_shortcut) = {
        let config = state.config.lock().unwrap();
        (config.shortcut.clone(), config.screenshot_shortcut.clone())
    };

    // Conflict check: popup and screenshot shortcuts must not be the same
    if !screenshot_shortcut.is_empty() && shortcut == screenshot_shortcut {
        return Err("Popup shortcut and screenshot shortcut cannot be the same.".to_string());
    }

    let new_config = AppConfig {
        shortcut: shortcut.clone(),
        max_history_size,
        language: language.clone(),
        theme: theme.clone(),
        compact_mode,
        clear_pinned_on_clear,
        clear_collected_on_clear,
        screenshot_shortcut: screenshot_shortcut.clone(),
        screenshot_format: screenshot_format.clone(),
        screenshot_quality,
        screenshot_save_action: screenshot_save_action.clone(),
    };

    // Save to database
    if let Err(e) = new_config.save_to_db(&state.db) {
        log::error!("Failed to save config to database: {}", e);
        return Err(e);
    }

    // Update state
    {
        let mut config = state.config.lock().unwrap();
        *config = new_config;
    }

    // Update shortcut if changed
    if shortcut != old_shortcut {
        let shortcut_manager = app.global_shortcut();
        let _ = shortcut_manager.unregister(old_shortcut.as_str());
        if let Err(e) = shortcut_manager.register(shortcut.as_str()) {
            log::error!("Failed to register new shortcut: {}", e);
        }
    }

    // Update screenshot shortcut if changed
    if screenshot_shortcut != old_screenshot_shortcut {
        let shortcut_manager = app.global_shortcut();
        if !old_screenshot_shortcut.is_empty() {
            let _ = shortcut_manager.unregister(old_screenshot_shortcut.as_str());
        }
        if !screenshot_shortcut.is_empty() {
            if let Err(e) = shortcut_manager.register(screenshot_shortcut.as_str()) {
                log::error!("Failed to register screenshot shortcut: {}", e);
            }
        }
    }

    // Emit event
    let _ = app.emit("config-updated", ());

    Ok(())
}

#[tauri::command]
pub fn set_paused(app: tauri::AppHandle, paused: bool, state: tauri::State<AppState>) {
    let mut is_paused = state.is_paused.lock().unwrap();
    *is_paused = paused;
    let _ = app.emit("pause-state-changed", paused);
    let _ = update_pause_menu_item(&app, paused);
}

#[tauri::command]
pub fn get_paused(state: tauri::State<AppState>) -> bool {
    let is_paused = state.is_paused.lock().unwrap();
    *is_paused
}

#[tauri::command]
pub fn get_item_content(state: tauri::State<AppState>, id: i64) -> Result<String, String> {
    state.db.get_item_content(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_item_by_id(
    state: tauri::State<AppState>,
    id: i64,
) -> Result<Option<ClipboardItem>, String> {
    state.db.get_item_by_id(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_collection(
    state: tauri::State<AppState>,
    name: String,
) -> Result<Collection, String> {
    state.db.create_collection(name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_collections(state: tauri::State<AppState>) -> Result<Vec<Collection>, String> {
    state.db.get_collections().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_collection(state: tauri::State<AppState>, id: i64) -> Result<(), String> {
    state.db.delete_collection(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_collection(
    state: tauri::State<AppState>,
    id: i64,
    name: String,
    icon: Option<String>,
    color: Option<String>,
) -> Result<(), String> {
    state
        .db
        .update_collection(id, name, icon, color)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_item_collection(
    state: tauri::State<AppState>,
    item_id: i64,
    collection_id: Option<i64>,
) -> Result<(), String> {
    state
        .db
        .set_item_collection(item_id, collection_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_history_count(
    state: tauri::State<AppState>,
    query: Option<String>,
    search_regex: Option<bool>,
    search_case_sensitive: Option<bool>,
    collection_id: Option<i64>,
    active_filter: Option<String>,
    source_app: Option<String>,
    time_range: Option<String>,
) -> usize {
    state
        .db
        .count_history_filtered(
            query,
            search_regex.unwrap_or(false),
            search_case_sensitive.unwrap_or(false),
            collection_id,
            active_filter,
            source_app,
            time_range,
        )
        .unwrap_or(0)
}

#[tauri::command]
pub fn set_paste_stack(
    state: tauri::State<AppState>,
    items: Vec<ClipboardItem>,
) -> Result<(), String> {
    let mut stack = state.paste_stack.lock().map_err(|e| e.to_string())?;
    *stack = items;
    Ok(())
}

#[tauri::command]
pub async fn ocr_image(image_path: String) -> Result<String, String> {
    log::info!("Starting OCR for image: {}", image_path);
    match recognize_text(&image_path).await {
        Ok(text) => {
            log::info!("OCR successful, text length: {}", text.len());
            Ok(text)
        }
        Err(e) => {
            log::error!("OCR failed: {}", e);
            Err(e)
        }
    }
}

// ==================== 文件管理命令 ====================

/// 检查屏幕录制权限（macOS）
#[tauri::command]
pub fn check_screen_recording_permission() -> bool {
    crate::screenshot::check_screen_recording_permission()
}

/// 清理所有临时文件
#[tauri::command]
pub async fn cleanup_temp_files(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let file_manager = state.file_manager.clone();
    tauri::async_runtime::spawn_blocking(move || file_manager.delete_all_temp_files())
        .await
        .map_err(|e| e.to_string())?
}

/// 清理过期的临时文件（超过 24 小时）
#[tauri::command]
pub async fn cleanup_expired_temp_files(
    state: tauri::State<'_, AppState>,
) -> Result<usize, String> {
    let file_manager = state.file_manager.clone();
    tauri::async_runtime::spawn_blocking(move || {
        file_manager.cleanup_expired_files(std::time::Duration::from_secs(24 * 3600))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 获取临时文件数量
#[tauri::command]
pub fn get_temp_file_count(state: tauri::State<AppState>) -> usize {
    state.file_manager.get_temp_file_count()
}

/// 获取临时目录路径
#[tauri::command]
pub fn get_temp_directory(state: tauri::State<AppState>) -> String {
    state
        .file_manager
        .get_temp_dir()
        .to_string_lossy()
        .to_string()
}

/// 下载并安装更新（用户确认后调用）
#[tauri::command]
pub async fn download_and_install_update(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;

    log::info!("User confirmed to download and install update...");

    let updater = app.updater().map_err(|e| e.to_string())?;

    // 重新检查获取更新信息
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No update available")?;

    log::info!("Downloading update: {}", update.version);

    // 下载并安装，带进度通知
    update
        .download_and_install(
            |downloaded, total| {
                let percent = total
                    .map(|t| {
                        if t > 0 {
                            (downloaded as f64 / t as f64 * 100.0) as u32
                        } else {
                            0
                        }
                    })
                    .unwrap_or(0);
                log::info!("Download progress: {}%", percent);
                let _ = app.emit(
                    "update-progress",
                    serde_json::json!({ "percent": percent }),
                );
            },
            || {
                log::info!("Update downloaded, installing...");
                let _ = app.emit("update-installing", ());
            },
        )
        .await
        .map_err(|e| {
            log::error!("Failed to install update: {}", e);
            let _ = app.emit("update-error", e.to_string());
            e.to_string()
        })?;

    log::info!("Update installed successfully");
    Ok(())
}
