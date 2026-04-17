mod commands;
mod crypto;
mod db;
mod file_manager;
mod models;
mod monitor;
mod ocr;
mod rules;
mod screenshot;
mod state;
mod storage_paths;
mod tray;
mod utils;

use clipboard_master::Master;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::GlobalShortcutExt;
#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

use crate::commands::*;
use crate::crypto::Crypto;
use crate::db::Database;
use crate::file_manager::FileManager;
use crate::models::{AppConfig, ClipboardItem};
use crate::monitor::ClipboardMonitor;
use crate::state::AppState;
use crate::storage_paths::StoragePaths;
use crate::utils::write_to_clipboard;
use tauri_plugin_updater::UpdaterExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize unified storage paths
    let storage_paths = StoragePaths::new();
    storage_paths
        .ensure_dirs()
        .expect("Failed to create storage directories");

    let db_path = storage_paths.db_path();
    let key_path = storage_paths.key_path();
    let crypto = Arc::new(Crypto::new(&key_path));
    let db = Arc::new(Database::new(&db_path, crypto).expect("Failed to initialize database"));

    // Load config from database
    let config = AppConfig::from_db(&db);
    let rules_engine = Arc::new(rules::RulesEngine::new(db.clone()));

    let shortcut_key = config.shortcut.clone();
    let screenshot_shortcut_key = config.screenshot_shortcut.clone();
    let config_arc = Arc::new(Mutex::new(config));

    let is_paused = Arc::new(Mutex::new(false));
    let is_paused_state = is_paused.clone();
    let is_recording_shortcut = Arc::new(Mutex::new(false));
    let is_recording_shortcut_state = is_recording_shortcut.clone();
    let is_recording_screenshot_shortcut = Arc::new(Mutex::new(false));
    let is_recording_screenshot_shortcut_state = is_recording_screenshot_shortcut.clone();
    let last_app_change = Arc::new(Mutex::new(None));
    let last_app_change_state = last_app_change.clone();
    let last_app_image_change = Arc::new(Mutex::new(None));
    let last_app_image_change_state = last_app_image_change.clone();
    let last_app_file_change = Arc::new(Mutex::new(None));
    let last_app_file_change_state = last_app_file_change.clone();
    let paste_stack = Arc::new(Mutex::new(Vec::<ClipboardItem>::new()));
    let paste_stack_state = paste_stack.clone();
    let current_captures = Arc::new(Mutex::new(None));
    let current_captures_state = current_captures.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--flag1", "--flag2"]),
        ))
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(move |app| {
            // Set activation policy to Accessory to hide from Dock
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                if let Some(window) = app.get_webview_window("main") {
                    let _ = apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None);
                }
                if let Some(window) = app.get_webview_window("popup") {
                    let _ = apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None);
                    // Set collection behavior to show on fullscreen spaces
                    use objc2::rc::Retained;
                    use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};
                    if let Ok(ns_window) = window.ns_window() {
                        let ns_window_ptr = ns_window as *mut NSWindow;
                        unsafe {
                            let ns_window: Retained<NSWindow> = Retained::retain(ns_window_ptr).unwrap();
                            ns_window.setCollectionBehavior(
                                NSWindowCollectionBehavior::CanJoinAllSpaces
                                    | NSWindowCollectionBehavior::FullScreenAuxiliary
                                    | NSWindowCollectionBehavior::IgnoresCycle,
                            );
                        }
                    }
                }
            }

            let handle = app.handle().clone();

            // 初始化文件管理器（仅管理临时目录）
            let file_manager = Arc::new(
                FileManager::new(storage_paths.temp_screenshot_dir().clone())
                    .expect("Failed to initialize file manager"),
            );

            // 启动时清理过期文件（超过 24 小时）
            let _ = file_manager.cleanup_expired_files(std::time::Duration::from_secs(24 * 3600));

            // 启动时自动检查更新（延迟 10 秒避免阻塞启动）
            // 只通知用户有更新，不自动下载
            let update_check_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(10)).await;
                log::info!("Auto checking for updates on startup...");

                if let Ok(updater) = update_check_handle.updater() {
                    match updater.check().await {
                        Ok(Some(_update)) => {
                            // 只通知用户有更新可用，不自动下载
                            // 用户可以从托盘点击查看详情并手动更新
                            log::info!(
                                "Update available on startup: {} (current: {})",
                                _update.version,
                                update_check_handle.package_info().version
                            );
                            // 保存更新信息到 state
                            let state = update_check_handle.state::<AppState>();
                            if let Ok(mut update_info) = state.update_info.lock() {
                                *update_info = Some(crate::state::UpdateInfo {
                                    version: _update.version.to_string(),
                                    current_version: update_check_handle.package_info().version.to_string(),
                                });
                            }
                            // 更新托盘菜单显示更新提示
                            let _ = crate::tray::update_version_menu_item(&update_check_handle, true);
                            let _ = update_check_handle.emit(
                                "update-detected",
                                serde_json::json!({
                                    "version": _update.version.to_string(),
                                    "current_version": update_check_handle.package_info().version.to_string(),
                                }),
                            );
                        }
                        Ok(None) => {
                            log::info!("App is up to date on startup");
                        }
                        Err(e) => {
                            log::warn!("Startup update check failed: {}", e);
                        }
                    }
                }
            });

            // 定时检查更新（每天一次）
            let scheduled_update_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    // 每 24 小时检查一次
                    tokio::time::sleep(std::time::Duration::from_secs(24 * 60 * 60)).await;
                    log::info!("Scheduled update check...");

                    if let Ok(updater) = scheduled_update_handle.updater() {
                        match updater.check().await {
                            Ok(Some(_update)) => {
                                log::info!(
                                    "Scheduled check found update: {}",
                                    _update.version
                                );
                                // 保存更新信息到 state
                                let state = scheduled_update_handle.state::<AppState>();
                                if let Ok(mut update_info) = state.update_info.lock() {
                                    *update_info = Some(crate::state::UpdateInfo {
                                        version: _update.version.to_string(),
                                        current_version: scheduled_update_handle.package_info().version.to_string(),
                                    });
                                }
                                // 更新托盘菜单显示更新提示
                                let _ = crate::tray::update_version_menu_item(&scheduled_update_handle, true);
                                let _ = scheduled_update_handle.emit(
                                    "update-detected",
                                    serde_json::json!({
                                        "version": _update.version.to_string(),
                                        "current_version": scheduled_update_handle.package_info().version.to_string(),
                                    }),
                                );
                            }
                            Ok(None) => {
                                log::info!("Scheduled check: app is up to date");
                            }
                            Err(e) => {
                                log::warn!("Scheduled update check failed: {}", e);
                            }
                        }
                    }
                }
            });

            // 将状态交给 Tauri 管理
            app.manage(AppState {
                db: db.clone(),
                config: config_arc.clone(),
                is_paused: is_paused_state.clone(),
                is_recording_shortcut: is_recording_shortcut_state.clone(),
                is_recording_screenshot_shortcut: is_recording_screenshot_shortcut_state.clone(),
                last_app_change: last_app_change_state.clone(),
                last_app_image_change: last_app_image_change_state.clone(),
                last_app_file_change: last_app_file_change_state.clone(),
                paste_stack: paste_stack_state.clone(),
                current_captures: current_captures_state.clone(),
                pause_item: Arc::new(Mutex::new(None)),
                version_item: Arc::new(Mutex::new(None)),
                file_manager: file_manager.clone(),
                storage_paths: Arc::new(storage_paths),
                rules_engine: rules_engine.clone(),
                update_info: Arc::new(Mutex::new(None)),
            });

            // 注册截图快捷键
            if !screenshot_shortcut_key.is_empty() {
                let screenshot_handle = handle.clone();
                let shortcut_manager = app.global_shortcut();
                if let Err(e) = shortcut_manager.on_shortcut(
                    screenshot_shortcut_key.as_str(),
                    move |_app, _shortcut, event| {
                        if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                            // Check if recording screenshot shortcut - ignore trigger
                            let state = _app.state::<AppState>();
                            if let Ok(is_recording) = state.is_recording_screenshot_shortcut.lock() {
                                if *is_recording {
                                    log::info!("Screenshot shortcut ignored during recording");
                                    return;
                                }
                            }
                            let handle = screenshot_handle.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Err(e) =
                                    crate::commands::start_capture(handle.clone(), handle.state())
                                        .await
                                {
                                    log::error!("Screenshot shortcut failed: {}", e);
                                    let _ = handle.emit("screenshot-error", e);
                                }
                            });
                        }
                    },
                ) {
                    log::warn!("Failed to register screenshot shortcut: {}", e);
                }
            }

            // 注册主窗口或弹出窗口快捷键
            if !shortcut_key.is_empty() {
                let shortcut_manager = app.global_shortcut();
                if let Err(e) = shortcut_manager.on_shortcut(
                    shortcut_key.as_str(),
                    move |app, _shortcut, event| {
                        if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                            // Check if recording shortcut - ignore trigger
                            let state = app.state::<AppState>();
                            if let Ok(is_recording) = state.is_recording_shortcut.lock() {
                                if *is_recording {
                                    log::info!("Main shortcut ignored during recording");
                                    return;
                                }
                            }
                            // Check Paste Stack
                            if let Ok(mut stack) = state.paste_stack.lock() {
                                if !stack.is_empty() {
                                    let item = stack.remove(0);
                                    let _ = write_to_clipboard(app, &item);
                                    return;
                                }
                            }

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
                                        log::info!("Mouse Position: ({}, {})", x, y);

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

                                    // Ensure window can show on fullscreen spaces
                                    #[cfg(target_os = "macos")]
                                    {
                                        use objc2::rc::Retained;
                                        use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};
                                        if let Ok(ns_window) = window.ns_window() {
                                            let ns_window_ptr = ns_window as *mut NSWindow;
                                            unsafe {
                                                let ns_window: Retained<NSWindow> = Retained::retain(ns_window_ptr).unwrap();
                                                ns_window.setCollectionBehavior(
                                                    NSWindowCollectionBehavior::CanJoinAllSpaces
                                                        | NSWindowCollectionBehavior::FullScreenAuxiliary
                                                        | NSWindowCollectionBehavior::IgnoresCycle,
                                                );
                                            }
                                        }
                                    }

                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                    },
                ) {
                    log::warn!("Failed to register popup shortcut: {}", e);
                }
            }

            // 托盘设置
            let menu = crate::tray::create_tray_menu(app.handle()).unwrap();

            // Store pause item in state
            if let Ok(items) = menu.items() {
                if let Some(item) = items
                    .iter()
                    .find(|i| i.id() == "pause")
                    .and_then(|i| i.as_menuitem())
                {
                    let state = app.state::<AppState>();
                    if let Ok(mut pause_item) = state.pause_item.lock() {
                        *pause_item = Some(item.clone());
                    };
                }
            }

            let _tray = TrayIconBuilder::with_id("tray")
                .icon(
                    app.default_window_icon()
                        .expect("No default window icon found")
                        .clone(),
                )
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
                    "pause" => {
                        let state = app.state::<AppState>();
                        let is_paused = state.is_paused.clone();
                        if let Ok(mut paused) = is_paused.lock() {
                            *paused = !*paused;
                            log::info!("Pause state toggled: {}", *paused);
                            let _ = app.emit("pause-state-changed", *paused);
                            let _ = crate::tray::update_pause_menu_item(app, *paused);
                        };
                    }
                    "clear" => {
                        let state = app.state::<AppState>();
                        let clear_pinned_on_clear =
                            state.config.lock().unwrap().clear_pinned_on_clear;
                        let clear_collected_on_clear =
                            state.config.lock().unwrap().clear_collected_on_clear;
                        if let Ok(_) = state
                            .db
                            .clear_history(clear_pinned_on_clear, clear_collected_on_clear)
                        {
                            log::info!("History cleared from tray");
                        }
                    }
                    "settings" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.emit("open-settings", ());
                        }
                    }
                    "check_update" => {
                        // 打开主窗口显示更新对话框
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }

                        let handle = app.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Ok(updater) = handle.updater() {
                                log::info!("User requested update check...");
                                match updater.check().await {
                                    Ok(Some(_update)) => {
                                        log::info!(
                                            "Update available: {} (current: {})",
                                            _update.version,
                                            handle.package_info().version
                                        );
                                        // 只通知前端，不自动下载，让用户选择
                                        let _ = handle.emit(
                                            "update-available",
                                            serde_json::json!({
                                                "version": _update.version.to_string(),
                                                "current_version": handle.package_info().version.to_string(),
                                            }),
                                        );
                                    }
                                    Ok(None) => {
                                        log::info!("No update available");
                                        let _ = handle.emit(
                                            "update-not-available",
                                            handle.package_info().version.to_string(),
                                        );
                                    }
                                    Err(e) => {
                                        log::error!("Failed to check for updates: {}", e);
                                        let _ = handle.emit("update-error", e.to_string());
                                    }
                                }
                            } else {
                                log::error!("Failed to get updater");
                            }
                        });
                    }
                    _ => {}
                })
                .build(app)?;

            // 剪切板监听线程
            let monitor_handle = handle.clone();
            thread::spawn(move || {
                // Delay starting the monitor to avoid race conditions with startup tray menu
                std::thread::sleep(std::time::Duration::from_secs(1));

                let monitor = ClipboardMonitor::new(monitor_handle);
                match Master::new(monitor) {
                    Ok(mut master) => {
                        if let Err(e) = master.run() {
                            log::error!("Failed to run clipboard listener: {}", e);
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to create clipboard master: {}", e);
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_history,
            set_clipboard_item,
            add_to_history,
            delete_item,
            toggle_sensitive,
            toggle_pin,
            toggle_snippet,
            update_clipboard_item_content,
            clear_history,
            get_config,
            save_config,
            set_paused,
            get_paused,
            get_item_content,
            get_item_by_id,
            get_history_count,
            create_collection,
            get_collections,
            delete_collection,
            update_collection,
            set_item_collection,
            set_paste_stack,
            ocr_image,
            start_capture,
            close_capture,
            get_capture_data,
            save_captured_image,
            cleanup_temp_files,
            cleanup_expired_temp_files,
            get_temp_file_count,
            get_temp_directory,
            check_screen_recording_permission,
            get_rules,
            add_rule,
            update_rule,
            delete_rule,
            download_and_install_update,
            set_recording_shortcut,
            set_recording_screenshot_shortcut,
            restart_app,
        ])
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                if window.label() == "popup" || window.label() == "main" {
                    let _ = window.hide();
                    api.prevent_close();
                }
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
