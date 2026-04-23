use tauri::{Manager, WebviewWindow};

const POPUP_WIDTH: i32 = 320;
const POPUP_HEIGHT: i32 = 400;
const POPUP_OFFSET: i32 = 12;

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
struct PopupPlacement {
    position: tauri::PhysicalPosition<i32>,
    monitor_origin: tauri::PhysicalPosition<i32>,
    monitor_scale: f64,
}

pub fn prepare_popup_window(window: &WebviewWindow) {
    let _ = window.set_size(tauri::LogicalSize::new(
        POPUP_WIDTH as f64,
        POPUP_HEIGHT as f64,
    ));
}

pub fn toggle_popup(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("popup") {
        let is_visible = window.is_visible().unwrap_or(false);
        if is_visible {
            let _ = window.hide();
            return;
        }

        show_popup(&window);
    }
}

fn show_popup(window: &WebviewWindow) {
    if let Some((mouse_x, mouse_y)) = current_mouse_position() {
        let placement = apply_popup_position(window, mouse_x, mouse_y);
        platform_show_popup(window, mouse_x, mouse_y, placement);
    } else {
        let _ = window.center();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn current_mouse_position() -> Option<(i32, i32)> {
    use mouse_position::mouse_position::Mouse;

    match Mouse::get_mouse_position() {
        Mouse::Position { x, y } => Some((x, y)),
        _ => None,
    }
}

fn apply_popup_position(
    window: &WebviewWindow,
    mouse_x: i32,
    mouse_y: i32,
) -> Option<PopupPlacement> {
    prepare_popup_window(window);

    if let Some(placement) = popup_placement_for_mouse(window, mouse_x, mouse_y) {
        let _ = window.set_position(tauri::Position::Physical(placement.position));
        Some(placement)
    } else {
        let _ = window.center();
        None
    }
}

#[cfg(target_os = "macos")]
fn platform_show_popup(
    window: &WebviewWindow,
    mouse_x: i32,
    mouse_y: i32,
    _placement: Option<PopupPlacement>,
) {
    let _ = window.show();
    let _ = window.set_focus();

    let delayed_window = window.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(35)).await;
        apply_popup_position(&delayed_window, mouse_x, mouse_y);
    });
}

#[cfg(target_os = "windows")]
fn platform_show_popup(
    window: &WebviewWindow,
    mouse_x: i32,
    mouse_y: i32,
    placement: Option<PopupPlacement>,
) {
    let _ = window.show();
    let _ = window.set_focus();

    if should_reposition_on_windows(window, placement.as_ref()) {
        let delayed_window = window.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(35)).await;
            let _ = apply_popup_position(&delayed_window, mouse_x, mouse_y);
        });
    }
}

#[cfg(target_os = "linux")]
fn platform_show_popup(
    window: &WebviewWindow,
    _mouse_x: i32,
    _mouse_y: i32,
    _placement: Option<PopupPlacement>,
) {
    let _ = window.show();
    let _ = window.set_focus();
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn platform_show_popup(
    window: &WebviewWindow,
    _mouse_x: i32,
    _mouse_y: i32,
    _placement: Option<PopupPlacement>,
) {
    let _ = window.show();
    let _ = window.set_focus();
}

#[cfg(target_os = "macos")]
fn popup_placement_for_mouse(
    window: &WebviewWindow,
    mouse_x: i32,
    mouse_y: i32,
) -> Option<PopupPlacement> {
    for monitor in window.available_monitors().ok()? {
        let position = monitor.position();
        let size = monitor.size();
        let scale = monitor.scale_factor();

        let logical_x = position.x as f64 / scale;
        let logical_y = position.y as f64 / scale;
        let logical_w = size.width as f64 / scale;
        let logical_h = size.height as f64 / scale;

        let mouse_x = mouse_x as f64;
        let mouse_y = mouse_y as f64;

        if mouse_x < logical_x
            || mouse_x > logical_x + logical_w
            || mouse_y < logical_y
            || mouse_y > logical_y + logical_h
        {
            continue;
        }

        let popup_w = POPUP_WIDTH as f64;
        let popup_h = POPUP_HEIGHT as f64;
        let offset = POPUP_OFFSET as f64;

        let mut final_x = mouse_x + offset;
        let mut final_y = mouse_y + offset;

        if final_x + popup_w > logical_x + logical_w {
            final_x = mouse_x - popup_w - offset;
        }
        if final_y + popup_h > logical_y + logical_h {
            final_y = mouse_y - popup_h - offset;
        }

        final_x = final_x.max(logical_x).min(logical_x + logical_w - popup_w);
        final_y = final_y.max(logical_y).min(logical_y + logical_h - popup_h);

        return Some(PopupPlacement {
            position: tauri::PhysicalPosition {
                x: (final_x * scale).round() as i32,
                y: (final_y * scale).round() as i32,
            },
            monitor_origin: *position,
            monitor_scale: scale,
        });
    }

    None
}

#[cfg(not(target_os = "macos"))]
fn popup_placement_for_mouse(
    window: &WebviewWindow,
    mouse_x: i32,
    mouse_y: i32,
) -> Option<PopupPlacement> {
    for monitor in window.available_monitors().ok()? {
        let position = monitor.position();
        let size = monitor.size();
        let scale = monitor.scale_factor();
        let popup_w = (POPUP_WIDTH as f64 * scale).round() as i32;
        let popup_h = (POPUP_HEIGHT as f64 * scale).round() as i32;

        if mouse_x < position.x
            || mouse_x > position.x + size.width as i32
            || mouse_y < position.y
            || mouse_y > position.y + size.height as i32
        {
            continue;
        }

        let mut final_x = mouse_x + POPUP_OFFSET;
        let mut final_y = mouse_y + POPUP_OFFSET;

        if final_x + popup_w > position.x + size.width as i32 {
            final_x = mouse_x - popup_w - POPUP_OFFSET;
        }
        if final_y + popup_h > position.y + size.height as i32 {
            final_y = mouse_y - popup_h - POPUP_OFFSET;
        }

        final_x = final_x
            .max(position.x)
            .min(position.x + size.width as i32 - popup_w);
        final_y = final_y
            .max(position.y)
            .min(position.y + size.height as i32 - popup_h);

        return Some(PopupPlacement {
            position: tauri::PhysicalPosition {
                x: final_x,
                y: final_y,
            },
            monitor_origin: *position,
            monitor_scale: scale,
        });
    }

    None
}

#[cfg(target_os = "windows")]
fn should_reposition_on_windows(
    window: &WebviewWindow,
    placement: Option<&PopupPlacement>,
) -> bool {
    let Some(placement) = placement else {
        return false;
    };

    let Ok(current_monitor) = window.current_monitor() else {
        return false;
    };
    let Some(current_monitor) = current_monitor else {
        return false;
    };

    let current_origin = current_monitor.position();
    let current_scale = current_monitor.scale_factor();

    let scale_changed = (current_scale - placement.monitor_scale).abs() > f64::EPSILON;
    let monitor_changed = current_origin != placement.monitor_origin;

    monitor_changed && scale_changed
}
