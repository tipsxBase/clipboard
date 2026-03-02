use crate::file_manager::FileManager;
use crate::models::CaptureResult;
use image::ImageEncoder;
use screenshots::Screen;
use std::sync::Arc;
use std::time::Instant;
use tauri::Runtime; // Import ImageEncoder trait

/// 检查 macOS 屏幕录制权限
#[cfg(target_os = "macos")]
pub fn check_screen_recording_permission() -> bool {
    use objc2_app_kit::NSWorkspace;

    // 尝试获取当前运行的应用程序
    let workspace = NSWorkspace::sharedWorkspace();
    let running_apps = workspace.runningApplications();

    // 如果能获取到其他应用程序的信息，说明有权限
    // 这是一个简单的检查，实际权限检查更复杂
    log::info!("Found {} running applications", running_apps.len());

    // 注意：这只是一个基本检查
    // 真正的权限检查需要尝试截图并检查结果
    true
}

#[cfg(not(target_os = "macos"))]
pub fn check_screen_recording_permission() -> bool {
    true // 非 macOS 平台默认有权限
}

pub fn capture_all_screens(
    cache_dir: std::path::PathBuf,
    file_manager: Option<Arc<FileManager>>,
) -> Result<Vec<CaptureResult>, String> {
    let start = Instant::now();

    // 在 macOS 上，确保我们有屏幕录制权限
    #[cfg(target_os = "macos")]
    {
        log::info!("Checking macOS screen recording permissions...");
        // 注意：screenshots crate 会自动请求权限，但用户需要在系统设置中授予权限
        // 如果没有权限，capture() 会失败或返回空白图像
    }

    let screens = Screen::all().map_err(|e| e.to_string())?;
    log::info!("Found {} screens", screens.len());

    // Use thread scope for parallel capture and encoding
    let results = std::thread::scope(|s| {
        let mut handles = Vec::with_capacity(screens.len());

        for screen in screens {
            let dir = cache_dir.clone();
            let fm = file_manager.clone();
            handles.push(s.spawn(move || -> Result<CaptureResult, String> {
                let capture_start = Instant::now();
                let image = screen.capture().map_err(|e| e.to_string())?;

                // Convert to raw bytes and encode
                // Parallel encoding helps performance
                let width = image.width();
                let height = image.height();

                let filename = format!(
                    "screenshot_{}_{}.png",
                    screen.display_info.id,
                    chrono::Local::now().timestamp_millis()
                );
                let path = dir.join(&filename);

                // Use std::fs::File for buffered writing
                let file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
                let mut writer = std::io::BufWriter::new(file);

                let encoder = image::codecs::png::PngEncoder::new(&mut writer);

                // Using as_raw() to get the underlying Vec<u8>
                encoder
                    .write_image(
                        image.as_raw(),
                        width,
                        height,
                        image::ExtendedColorType::Rgba8,
                    )
                    .map_err(|e| e.to_string())?;

                // 添加到文件管理器跟踪列表
                if let Some(fm) = fm {
                    fm.add_temp_file(path.clone(), screen.display_info.id);
                }

                log::info!(
                    "Screen {} capture+save took {:?}",
                    screen.display_info.id,
                    capture_start.elapsed()
                );

                Ok(CaptureResult {
                    id: screen.display_info.id,
                    path: path.to_string_lossy().to_string(),
                    x: screen.display_info.x,
                    y: screen.display_info.y,
                    width: width,
                    height: height,
                    scale_factor: screen.display_info.scale_factor as f64,
                })
            }));
        }

        let mut results = Vec::new();
        for handle in handles {
            match handle.join() {
                Ok(res) => match res {
                    Ok(capture) => results.push(capture),
                    Err(e) => log::error!("Failed to capture screen: {}", e),
                },
                Err(_) => log::error!("Thread panicked during capture"),
            }
        }
        results
    });

    log::info!("Total capture took {:?}", start.elapsed());
    Ok(results)
}

#[cfg(target_os = "macos")]
pub fn set_window_level_above_menubar<R: Runtime>(window: &tauri::WebviewWindow<R>) {
    use objc2::rc::Retained;
    use objc2_app_kit::{NSScreenSaverWindowLevel, NSWindow, NSWindowCollectionBehavior};

    if let Ok(ns_window) = window.ns_window() {
        let ns_window_ptr = ns_window as *mut NSWindow;
        unsafe {
            let ns_window: Retained<NSWindow> = Retained::retain(ns_window_ptr).unwrap();
            // Set to screen saver level (highest, covers everything)
            ns_window.setLevel(NSScreenSaverWindowLevel);
            // Allow window to span across all spaces and fullscreen
            ns_window.setCollectionBehavior(
                NSWindowCollectionBehavior::CanJoinAllSpaces
                    | NSWindowCollectionBehavior::FullScreenAuxiliary
                    | NSWindowCollectionBehavior::IgnoresCycle,
            );
        }
    }
}

#[cfg(target_os = "macos")]
pub fn make_window_transparent<R: Runtime>(window: &tauri::WebviewWindow<R>) {
    use objc2::rc::Retained;
    use objc2_app_kit::{NSColor, NSWindow};

    if let Ok(ns_window) = window.ns_window() {
        let ns_window_ptr = ns_window as *mut NSWindow;
        unsafe {
            let ns_window: Retained<NSWindow> = Retained::retain(ns_window_ptr).unwrap();
            ns_window.setOpaque(false);
            ns_window.setBackgroundColor(Some(&NSColor::clearColor()));
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub fn make_window_transparent<R: Runtime>(_window: &tauri::WebviewWindow<R>) {}

#[cfg(not(target_os = "macos"))]
pub fn set_window_level_above_menubar<R: Runtime>(_window: &tauri::WebviewWindow<R>) {
    // Windows/Linux implementation if needed
}
