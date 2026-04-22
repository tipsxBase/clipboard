use crate::models::ClipboardItem;
use crate::state::AppState;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::{Manager, Wry};

pub fn create_tray_menu(app: &tauri::AppHandle) -> Result<Menu<Wry>, String> {
    let menu = Menu::new(app).map_err(|e| e.to_string())?;

    // Show Main Window
    let show_item = MenuItem::with_id(app, "show", "Show Main Window", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    menu.append(&show_item).map_err(|e| e.to_string())?;

    menu.append(&PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;

    // Pause/Resume
    let pause_item = MenuItem::with_id(app, "pause", "Pause Recording", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    menu.append(&pause_item).map_err(|e| e.to_string())?;

    // Clear History
    let clear_item = MenuItem::with_id(app, "clear", "Clear History", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    menu.append(&clear_item).map_err(|e| e.to_string())?;

    menu.append(&PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;

    // Settings
    let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    menu.append(&settings_item).map_err(|e| e.to_string())?;

    // Check for Updates
    let version = app.package_info().version.to_string();
    let update_item = MenuItem::with_id(
        app,
        "check_update",
        format!("v{}", version),
        true,
        None::<&str>,
    )
    .map_err(|e| e.to_string())?;
    menu.append(&update_item).map_err(|e| e.to_string())?;

    // Save version_item to state for later updates
    let state = app.state::<AppState>();
    if let Ok(mut version_item_state) = state.version_item.lock() {
        *version_item_state = Some(update_item.clone());
    }

    menu.append(&PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;

    // Quit
    menu.append(
        &MenuItem::with_id(app, "quit", "Quit", true, None::<&str>).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    Ok(menu)
}

/// Update the version menu item text when update is detected
pub fn update_version_menu_item(app: &tauri::AppHandle, has_update: bool) -> Result<(), String> {
    let state = app.state::<AppState>();
    if let Ok(version_item) = state.version_item.lock() {
        if let Some(item) = version_item.as_ref() {
            let version = app.package_info().version.to_string();
            let text = if has_update {
                format!("v{} (有更新)", version)
            } else {
                format!("v{}", version)
            };
            item.set_text(text).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub fn update_tray_menu(_app: &tauri::AppHandle, _history: &[ClipboardItem]) -> Result<(), String> {
    // No longer updating tray menu with history
    Ok(())
}

pub fn update_pause_menu_item(app: &tauri::AppHandle, is_paused: bool) -> Result<(), String> {
    let state = app.state::<crate::state::AppState>();
    if let Ok(pause_item) = state.pause_item.lock() {
        if let Some(item) = pause_item.as_ref() {
            let text = if is_paused {
                "Resume Recording"
            } else {
                "Pause Recording"
            };
            item.set_text(text).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
