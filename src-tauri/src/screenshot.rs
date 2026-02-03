use crate::models::{CaptureResult, ScreenInfo};
use image::ImageEncoder;
use screenshots::Screen;
use std::time::Instant;
use tauri::Runtime; // Import ImageEncoder trait

pub fn capture_all_screens(cache_dir: std::path::PathBuf) -> Result<Vec<CaptureResult>, String> {
    let start = Instant::now();
    let screens = Screen::all().map_err(|e| e.to_string())?;
    log::info!("Found {} screens", screens.len());

    // Use thread scope for parallel capture and encoding
    let results = std::thread::scope(|s| {
        let mut handles = Vec::with_capacity(screens.len());

        for screen in screens {
            let dir = cache_dir.clone();
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
                let path = dir.join(filename);

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
