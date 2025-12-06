use base64::{engine::general_purpose, Engine as _};
use chrono::Local;
use image::ImageFormat;
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardItem {
    pub content: String, // 文字内容或图片的Base64
    pub kind: String,    // "text" or "image"
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub shortcut: String,
    pub max_history_size: usize,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            shortcut: "CommandOrControl+Shift+V".to_string(),
            max_history_size: 20,
        }
    }
}

#[derive(Default)]
pub struct ClipboardHistory {
    pub items: Vec<ClipboardItem>,
    pub max_size: usize,
}

impl ClipboardHistory {
    pub fn new(max_size: usize) -> Self {
        Self {
            items: Vec::new(),
            max_size,
        }
    }

    pub fn push(&mut self, item: ClipboardItem) {
        // 如果内容已存在，先移除旧的
        if let Some(index) = self
            .items
            .iter()
            .position(|x| x.content == item.content && x.kind == item.kind)
        {
            self.items.remove(index);
        }

        self.items.insert(0, item);
        if self.items.len() > self.max_size {
            self.items.pop();
        }
    }
}

use std::fs;
use std::path::PathBuf;

// 状态管理
pub struct AppState {
    pub history: Arc<Mutex<ClipboardHistory>>,
    pub data_path: PathBuf,
    pub config_path: PathBuf,
    pub config: Arc<Mutex<AppConfig>>,
}

fn write_to_clipboard(app: &tauri::AppHandle, item: &ClipboardItem) -> Result<(), String> {
    if item.kind == "text" {
        app.clipboard()
            .write_text(item.content.clone())
            .map_err(|e| e.to_string())?;
    } else if item.kind == "image" {
        let bytes = general_purpose::STANDARD
            .decode(&item.content)
            .map_err(|e| e.to_string())?;
        let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
        let rgba = img.to_rgba8();
        let width = img.width();
        let height = img.height();
        let rgba_bytes = rgba.into_raw();
        let tauri_img = tauri::image::Image::new(&rgba_bytes, width, height);
        app.clipboard()
            .write_image(&tauri_img)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn update_tray_menu(app: &tauri::AppHandle, history: &[ClipboardItem]) -> Result<(), String> {
    let tray = if let Some(tray) = app.tray_by_id("tray") {
        tray
    } else {
        return Ok(()); // Tray might not be ready yet
    };

    let menu = Menu::new(app).map_err(|e| e.to_string())?;

    // Add "Show History" item
    let show_item = MenuItem::with_id(app, "show", "Show History", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    menu.append(&show_item).map_err(|e| e.to_string())?;

    menu.append(&PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;

    for (i, item) in history.iter().take(10).enumerate() {
        let mut title = if item.kind == "text" {
            item.content.chars().take(20).collect::<String>()
        } else {
            format!("Image {}", item.timestamp)
        };
        if item.kind == "text" && item.content.chars().count() > 20 {
            title.push_str("...");
        }

        let menu_item =
            MenuItem::with_id(app, format!("history_{}", i), &title, true, None::<&str>)
                .map_err(|e| e.to_string())?;
        menu.append(&menu_item).map_err(|e| e.to_string())?;
    }

    menu.append(&PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    menu.append(
        &MenuItem::with_id(app, "quit", "Quit", true, None::<&str>).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_history(state: tauri::State<AppState>) -> Vec<ClipboardItem> {
    let history = state.history.lock().unwrap();
    history.items.clone()
}

#[tauri::command]
fn set_clipboard_item(
    app: tauri::AppHandle,
    content: String,
    kind: String,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let item = ClipboardItem {
        content: content.clone(),
        kind: kind.clone(),
        timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };

    // Write to clipboard
    write_to_clipboard(&app, &item)?;

    // Update history
    let mut history = state.history.lock().unwrap();
    history.push(item);

    // Save
    let json = serde_json::to_string(&history.items).map_err(|e| e.to_string())?;
    let _ = fs::write(&state.data_path, json);

    // Update Tray
    let _ = update_tray_menu(&app, &history.items);

    Ok(())
}

#[tauri::command]
fn delete_item(
    app: tauri::AppHandle,
    index: usize,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let mut history = state.history.lock().unwrap();
    if index < history.items.len() {
        history.items.remove(index);
        // Save
        let json = serde_json::to_string(&history.items).map_err(|e| e.to_string())?;
        let _ = fs::write(&state.data_path, json);

        // Update Tray
        let _ = update_tray_menu(&app, &history.items);
    }
    Ok(())
}

#[tauri::command]
fn clear_history(app: tauri::AppHandle, state: tauri::State<AppState>) -> Result<(), String> {
    let mut history = state.history.lock().unwrap();
    history.items.clear();
    // Save
    let json = serde_json::to_string(&history.items).map_err(|e| e.to_string())?;
    let _ = fs::write(&state.data_path, json);

    // Update Tray
    let _ = update_tray_menu(&app, &history.items);
    Ok(())
}

#[tauri::command]
fn get_config(state: tauri::State<AppState>) -> AppConfig {
    let config = state.config.lock().unwrap();
    config.clone()
}

#[tauri::command]
fn save_config(
    app: tauri::AppHandle,
    shortcut: String,
    max_history_size: usize,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let old_shortcut = {
        let config = state.config.lock().unwrap();
        config.shortcut.clone()
    };

    let new_config = AppConfig {
        shortcut: shortcut.clone(),
        max_history_size,
    };

    // Save to file
    let json = serde_json::to_string(&new_config).map_err(|e| e.to_string())?;
    fs::write(&state.config_path, json).map_err(|e| e.to_string())?;

    // Update in-memory config
    {
        let mut config = state.config.lock().unwrap();
        *config = new_config;
    }

    // Update history max size
    {
        let mut history = state.history.lock().unwrap();
        history.max_size = max_history_size;
        // Trim if necessary
        while history.items.len() > max_history_size {
            history.items.pop();
        }
    }

    // Update global shortcut if changed
    if shortcut != old_shortcut {
        // Unregister old shortcut
        let _ = app.global_shortcut().unregister(old_shortcut.as_str());

        // Register new shortcut
        app.global_shortcut()
            .register(shortcut.as_str())
            .map_err(|e| format!("Failed to register new shortcut: {}", e))?;
    }

    // Notify frontend
    app.emit("config-updated", ()).map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load config first
    let app_data_dir = std::env::var("HOME")
        .map(|h| PathBuf::from(h).join(".clipboard-manager"))
        .unwrap_or_else(|_| PathBuf::from(".clipboard-manager"));

    if !app_data_dir.exists() {
        let _ = fs::create_dir_all(&app_data_dir);
    }

    let config_path = app_data_dir.join("config.json");
    let config = if let Ok(content) = fs::read_to_string(&config_path) {
        serde_json::from_str::<AppConfig>(&content).unwrap_or_default()
    } else {
        AppConfig::default()
    };

    let max_size = config.max_history_size;
    let shortcut_key = config.shortcut.clone();
    let config_arc = Arc::new(Mutex::new(config));

    let history = Arc::new(Mutex::new(ClipboardHistory::new(max_size)));
    let history_state = history.clone();

    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcut(shortcut_key.as_str())
                .expect("Failed to register shortcut")
                .with_handler(|app, _shortcut, event| {
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window("popup") {
                            let is_visible = window.is_visible().unwrap_or(false);
                            if is_visible {
                                let _ = window.hide();
                            } else {
                                // Get mouse position
                                use mouse_position::mouse_position::Mouse;
                                let position = Mouse::get_mouse_position();
                                if let Mouse::Position { x, y } = position {
                                    let mut final_x = x;
                                    let mut final_y = y;

                                    if let Ok(monitors) = window.available_monitors() {
                                        for m in monitors {
                                            let m_pos = m.position();
                                            let m_size = m.size();
                                            let scale = m.scale_factor();
                                            let x = x * scale as i32;
                                            let y = y * scale as i32;
                                            final_x = x;
                                            final_y = y;
                                            // Check if mouse is in this monitor
                                            if x >= m_pos.x
                                                && x < m_pos.x + m_size.width as i32
                                                && y >= m_pos.y
                                                && y < m_pos.y + m_size.height as i32
                                            {
                                                if let Ok(w_size) = window.outer_size() {
                                                    let w = w_size.width as i32;
                                                    let h = w_size.height as i32;

                                                    // If window goes off the right edge, shift to left of cursor
                                                    if x + w > m_pos.x + m_size.width as i32 {
                                                        final_x = x - w;
                                                    }

                                                    // If window goes off the bottom edge, shift to above cursor
                                                    if y + h > m_pos.y + m_size.height as i32 {
                                                        final_y = y - h;
                                                    }
                                                }
                                                break;
                                            }
                                        }
                                    }
                                    let _ = window.set_position(tauri::Position::Physical(
                                        tauri::PhysicalPosition {
                                            x: final_x,
                                            y: final_y,
                                        },
                                    ));
                                } else {
                                    // Fallback to center if mouse position fails
                                    let _ = window.center();
                                }

                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            // Set activation policy to Accessory to hide from Dock
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            let handle = app.handle().clone();
            let history_monitor = history_state.clone();

            // 初始化数据路径
            let app_data_dir = app.path().app_data_dir().unwrap();
            if !app_data_dir.exists() {
                let _ = fs::create_dir_all(&app_data_dir);
            }
            let history_path = app_data_dir.join("history.json");

            // 加载历史
            {
                let mut history_guard = history_state.lock().unwrap();
                if let Ok(content) = fs::read_to_string(&history_path) {
                    if let Ok(items) = serde_json::from_str::<Vec<ClipboardItem>>(&content) {
                        history_guard.items = items;
                    }
                }
            }

            // 将状态交给 Tauri 管理
            app.manage(AppState {
                history: history_state.clone(),
                data_path: history_path.clone(),
                config_path: config_path.clone(),
                config: config_arc.clone(),
            });

            // 托盘设置
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit_i])?;

            let _tray = TrayIconBuilder::with_id("tray")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    id if id.starts_with("history_") => {
                        if let Ok(index) = id.replace("history_", "").parse::<usize>() {
                            let state = app.state::<AppState>();
                            let history = state.history.lock().unwrap();
                            if let Some(item) = history.items.get(index) {
                                let _ = write_to_clipboard(app, item);
                            }
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|_tray, event| {
                    // Do nothing on click, let default behavior (menu) happen
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
                        // Do not open main window
                    }
                })
                .build(app)?;

            // Initial tray update
            {
                let history = history_state.lock().unwrap();
                let _ = update_tray_menu(app.handle(), &history.items);
            }

            // 剪切板监听线程
            let history_path_thread = history_path.clone();
            thread::spawn(move || {
                let mut last_text = String::new();
                let mut last_image_hash: Vec<u8> = Vec::new(); // Simple hash or just bytes comparison

                // 初始化 last_text 为当前剪切板内容，避免启动时重复记录
                if let Ok(text) = handle.clipboard().read_text() {
                    last_text = text;
                }

                loop {
                    let mut updated = false;

                    // 检查文本
                    if let Ok(text) = handle.clipboard().read_text() {
                        if text != last_text && !text.is_empty() {
                            last_text = text.clone();

                            let mut history = history_monitor.lock().unwrap();
                            history.push(ClipboardItem {
                                content: text,
                                kind: "text".to_string(),
                                timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                            });
                            updated = true;
                        }
                    }

                    // 检查图片
                    if let Ok(img) = handle.clipboard().read_image() {
                        let rgba = img.rgba();
                        // Simple check: if bytes are different from last time
                        // Note: This might be expensive for large images, but okay for now.
                        if rgba != last_image_hash && !rgba.is_empty() {
                            last_image_hash = rgba.to_vec();

                            // Convert to PNG Base64
                            let width = img.width();
                            let height = img.height();
                            if let Some(buffer) =
                                image::RgbaImage::from_raw(width, height, rgba.to_vec())
                            {
                                let mut bytes: Vec<u8> = Vec::new();
                                let mut cursor = Cursor::new(&mut bytes);
                                if buffer.write_to(&mut cursor, ImageFormat::Png).is_ok() {
                                    let base64_str = general_purpose::STANDARD.encode(&bytes);

                                    let mut history = history_monitor.lock().unwrap();
                                    history.push(ClipboardItem {
                                        content: base64_str,
                                        kind: "image".to_string(),
                                        timestamp: Local::now()
                                            .format("%Y-%m-%d %H:%M:%S")
                                            .to_string(),
                                    });
                                    updated = true;
                                }
                            }
                        }
                    }

                    if updated {
                        // 保存
                        let history = history_monitor.lock().unwrap();
                        if let Ok(json) = serde_json::to_string(&history.items) {
                            let _ = fs::write(&history_path_thread, json);
                        }
                        // Update Tray
                        let _ = update_tray_menu(&handle, &history.items);
                        // 触发前端更新
                        let _ = handle.emit("clipboard-update", ());
                    }

                    thread::sleep(Duration::from_secs(1));
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_history,
            set_clipboard_item,
            delete_item,
            clear_history,
            get_config,
            save_config
        ])
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                let _ = window.hide();
                api.prevent_close();
            }
            tauri::WindowEvent::Focused(false) => {
                if window.label() == "popup" {
                    let _ = window.hide();
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
