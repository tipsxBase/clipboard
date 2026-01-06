#![allow(deprecated)]
#![allow(unexpected_cfgs)]

#[cfg(target_os = "macos")]
use cocoa::base::{id, nil};
#[cfg(target_os = "macos")]
use cocoa::foundation::{NSArray, NSAutoreleasePool, NSString};
#[cfg(target_os = "macos")]
use objc::{class, msg_send, sel, sel_impl};

#[cfg(target_os = "macos")]
pub async fn recognize_text(image_path: &str) -> Result<String, String> {
    let path = image_path.to_string();
    tauri::async_runtime::spawn_blocking(move || recognize_text_sync(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(target_os = "macos")]
fn recognize_text_sync(image_path: &str) -> Result<String, String> {
    unsafe {
        let _pool = NSAutoreleasePool::new(nil);

        let path_str = NSString::alloc(nil).init_str(image_path);
        let url_class = class!(NSURL);
        let file_url: id = msg_send![url_class, fileURLWithPath:path_str];

        // Create VNImageRequestHandler
        let handler_class = class!(VNImageRequestHandler);
        let handler_alloc: id = msg_send![handler_class, alloc];
        let handler: id = msg_send![handler_alloc, initWithURL:file_url options:nil];

        // Create VNRecognizeTextRequest
        let request_class = class!(VNRecognizeTextRequest);
        let request_alloc: id = msg_send![request_class, alloc];
        let request: id = msg_send![request_alloc, init];

        // Set recognition level to accurate (VNRequestTextRecognitionLevelAccurate = 0)
        let _: () = msg_send![request, setRecognitionLevel:0];
        // Set usesLanguageCorrection = YES
        let _: () = msg_send![request, setUsesLanguageCorrection:true];
        // Set recognitionLanguages to ["zh-Hans", "en-US"]
        let langs = NSArray::arrayWithObjects(
            nil,
            &[
                NSString::alloc(nil).init_str("zh-Hans"),
                NSString::alloc(nil).init_str("en-US"),
            ],
        );
        let _: () = msg_send![request, setRecognitionLanguages:langs];

        // Perform request
        let requests = NSArray::arrayWithObject(nil, request);
        let error: id = nil;
        let success: bool = msg_send![handler, performRequests:requests error:&error];

        if !success {
            return Err("Failed to perform OCR request".to_string());
        }

        // Get results
        let results: id = msg_send![request, results];
        let count: usize = msg_send![results, count];

        let mut full_text = String::new();

        for i in 0..count {
            let observation: id = msg_send![results, objectAtIndex:i];
            // topCandidates:1
            let candidates: id = msg_send![observation, topCandidates:1];
            let candidate_count: usize = msg_send![candidates, count];
            if candidate_count > 0 {
                let candidate: id = msg_send![candidates, objectAtIndex:0];
                let string: id = msg_send![candidate, string];
                let text = std::ffi::CStr::from_ptr(string.UTF8String()).to_string_lossy();
                full_text.push_str(&text);
                full_text.push('\n');
            }
        }

        Ok(full_text.trim().to_string())
    }
}

#[cfg(target_os = "windows")]
use dunce;
#[cfg(target_os = "windows")]
use windows::{
    core::HSTRING,
    Foundation,
    Graphics::Imaging::{BitmapDecoder, BitmapPixelFormat, SoftwareBitmap},
    Media::Ocr::OcrEngine,
    Storage::{FileAccessMode, StorageFile},
};

#[cfg(target_os = "windows")]
pub async fn recognize_text(image_path: &str) -> Result<String, String> {
    let path = image_path.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| e.to_string())?;

        rt.block_on(async {
            log::info!("recognize_text called with path: {}", path);

            let original_path = path;
            log::info!("Original path: {}", original_path);

            // Pre-clean path to handle common issues before canonicalize
            let mut cleaned_path = original_path.clone();
            // Remove file scheme if present (file:///C:/...)
            if cleaned_path.starts_with("file:///") {
                cleaned_path = cleaned_path.trim_start_matches("file:///").to_string();
                cleaned_path = cleaned_path.replace('/', "\\");
            }
            // Replace full-width colon (Chinese punctuation) with ASCII colon
            if cleaned_path.contains('：') {
                cleaned_path = cleaned_path.replace('：', ":");
            }
            // Remove Windows extended-length path prefix "\\?\" if present
            if cleaned_path.starts_with("\\\\?\\") {
                cleaned_path = cleaned_path.trim_start_matches("\\\\?\\").to_string();
            }

            // 1. 简化路径处理 - 使用标准库方法
            let path = std::path::Path::new(&cleaned_path);

            // 2. 获取绝对路径（保留 UNC 前缀）
            let absolute_path = dunce::canonicalize(path).map_err(|e| {
                log::error!("Failed to canonicalize path: {}", e);
                e.to_string()
            })?;

            // 3. 直接使用规范化后的路径（不要移除 "\\?\"）
            let path_string = absolute_path.to_string_lossy().to_string();
            log::info!("Using path: {}", path_string);

            // 4. 尝试加载文件（添加更多错误信息）
            let file = match StorageFile::GetFileFromPathAsync(&HSTRING::from(&path_string)) {
                Ok(op) => op,
                Err(e) => {
                    log::error!("GetFileFromPathAsync failed with error: {:?}", e);
                    return Err(format!("Failed to access file: {}", e));
                }
            };

            let file = file.await.map_err(|e| {
                log::error!("Failed to get file: {:?}", e);
                format!("File operation failed: {}", e)
            })?;

            log::info!("File opened: {:?}", file);

            // 5. 打开文件流
            let stream = file
                .OpenAsync(FileAccessMode::Read)
                .map_err(|e| format!("Failed to open file: {}", e))?
                .await
                .map_err(|e| format!("Failed to open stream: {}", e))?;

            // 6. 创建解码器
            let decoder = BitmapDecoder::CreateAsync(&stream)
                .map_err(|e| format!("Failed to create decoder: {}", e))?
                .await
                .map_err(|e| format!("Failed to get decoder: {}", e))?;

            // 7. 获取位图
            let mut bitmap = decoder
                .GetSoftwareBitmapAsync()
                .map_err(|e| format!("Failed to get bitmap: {}", e))?
                .await
                .map_err(|e| format!("Failed to load bitmap: {}", e))?;

            log::info!("Bitmap format: {:?}", bitmap.BitmapPixelFormat().ok());

            // 8. 正确转换位图格式（如果需要）
            // Windows OCR 要求像素格式是 Bgra8
            let required_format = BitmapPixelFormat::Bgra8;
            let current_format = bitmap
                .BitmapPixelFormat()
                .unwrap_or(BitmapPixelFormat::Bgra8);

            if current_format != required_format {
                log::info!("Converting bitmap from {:?} to Bgra8", current_format);
                // 正确的转换方法
                bitmap = SoftwareBitmap::Convert(&bitmap, BitmapPixelFormat::Bgra8)
                    .map_err(|e| format!("Failed to convert bitmap format: {}", e))?;
            }

            // 9. 创建 OCR 引擎（尝试指定中文）
            let engine = OcrEngine::TryCreateFromUserProfileLanguages()
                .map_err(|e| format!("Failed to create OCR engine: {}", e))?;
            log::info!("OcrEngine created successfully");
            // 10. 执行 OCR
            let result = engine
                .RecognizeAsync(&bitmap)
                .map_err(|e| format!("Failed to start recognition: {}", e))?
                .await
                .map_err(|e| format!("Recognition failed: {}", e))?;

            // 11. 提取文本
            let lines = result
                .Lines()
                .map_err(|e| format!("Failed to get lines: {}", e))?;
            let mut full_text = String::new();
            let line_count = lines.Size().map_err(|e| e.to_string())?;

            log::info!("Found {} lines", line_count);

            for i in 0..line_count {
                if let Ok(line) = lines.GetAt(i) {
                    if let Ok(text) = line.Text() {
                        full_text.push_str(&text.to_string());
                        full_text.push('\n');
                    }
                }
            }

            let trimmed_text = full_text.trim().to_string();
            log::info!(
                "OCR Result ({} chars): {}",
                trimmed_text.len(),
                trimmed_text
            );

            Ok(trimmed_text)
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub async fn recognize_text(_image_path: &str) -> Result<String, String> {
    Err("OCR is only supported on macOS and Windows".to_string())
}
