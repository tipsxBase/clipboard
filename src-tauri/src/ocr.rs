#![allow(deprecated)]
#![allow(unexpected_cfgs)]

#[cfg(target_os = "macos")]
use cocoa::base::{id, nil};
#[cfg(target_os = "macos")]
use cocoa::foundation::{NSArray, NSAutoreleasePool, NSString};
#[cfg(target_os = "macos")]
use objc::{class, msg_send, sel, sel_impl};

#[cfg(target_os = "macos")]
pub fn recognize_text(image_path: &str) -> Result<String, String> {
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
    Graphics::Imaging::{BitmapAlphaMode, BitmapDecoder, BitmapPixelFormat, SoftwareBitmap},
    Media::Ocr::OcrEngine,
    Storage::{FileAccessMode, StorageFile},
};

#[cfg(target_os = "windows")]
pub fn recognize_text(image_path: &str) -> Result<String, String> {
    tauri::async_runtime::block_on(async move { recognize_text_async(image_path).await })
}

#[cfg(target_os = "windows")]
async fn recognize_text_async(image_path: &str) -> Result<String, String> {
    log::info!("recognize_text_async called with path: {}", image_path);
    let original_path = image_path.to_string();
    log::info!("Original path: {}", original_path);
    let path = std::path::Path::new(&original_path);
    let absolute_path = dunce::canonicalize(path).map_err(|e| {
        log::error!("Failed to canonicalize path: {}", e);
        e.to_string()
    })?;
    let mut path_string = absolute_path.to_string_lossy().to_string();
    // Remove file scheme if present (file:///C:/...)
    if path_string.starts_with("file:///") {
        path_string = path_string.trim_start_matches("file:///").to_string();
        path_string = path_string.replace('/', "\\");
    }

    // Replace full-width colon (Chinese punctuation) with ASCII colon
    if path_string.contains('：') {
        path_string = path_string.replace('：', ":");
    }

    // Remove Windows extended-length path prefix "\\?\" if present
    if path_string.starts_with("\\\\?\\") {
        path_string = path_string.trim_start_matches("\\\\?\\").to_string();
    }
    log::info!("Absolute path: {}", path_string);

    let file = StorageFile::GetFileFromPathAsync(&HSTRING::from(&path_string))
        .map_err(|e| {
            log::error!("GetFileFromPathAsync failed: {}", e);
            e.to_string()
        })?
        .await
        .map_err(|e| {
            log::error!("GetFileFromPathAsync await failed: {}", e);
            e.to_string()
        })?;
    log::info!("File opened successfully");

    let stream = file
        .OpenAsync(FileAccessMode::Read)
        .map_err(|e| {
            log::error!("OpenAsync failed: {}", e);
            e.to_string()
        })?
        .await
        .map_err(|e| {
            log::error!("OpenAsync await failed: {}", e);
            e.to_string()
        })?;
    log::info!("Stream opened successfully");

    let decoder = BitmapDecoder::CreateAsync(&stream)
        .map_err(|e| {
            log::error!("BitmapDecoder::CreateAsync failed: {}", e);
            e.to_string()
        })?
        .await
        .map_err(|e| {
            log::error!("BitmapDecoder::CreateAsync await failed: {}", e);
            e.to_string()
        })?;
    log::info!("Decoder created successfully");

    let bitmap = decoder
        .GetSoftwareBitmapAsync()
        .map_err(|e| {
            log::error!("GetSoftwareBitmapAsync failed: {}", e);
            e.to_string()
        })?
        .await
        .map_err(|e| {
            log::error!("GetSoftwareBitmapAsync await failed: {}", e);
            e.to_string()
        })?;
    log::info!("Bitmap obtained successfully");

    // Ensure the bitmap is in the correct format for OCR (Bgra8, Premultiplied)
    let bitmap = if bitmap.BitmapPixelFormat().map_err(|e| e.to_string())?
        != BitmapPixelFormat::Bgra8
        || bitmap.BitmapAlphaMode().map_err(|e| e.to_string())? != BitmapAlphaMode::Premultiplied
    {
        log::info!("Converting bitmap format to Bgra8 Premultiplied");
        SoftwareBitmap::Convert(&bitmap, BitmapPixelFormat::Bgra8).map_err(|e| {
            log::error!("SoftwareBitmap::Convert failed: {}", e);
            e.to_string()
        })?
    } else {
        log::info!("Bitmap format is already correct");
        bitmap
    };

    let engine = OcrEngine::TryCreateFromUserProfileLanguages().map_err(|e| {
        log::error!("TryCreateFromUserProfileLanguages failed: {}", e);
        e.to_string()
    })?;
    log::info!("OcrEngine created successfully");

    let result = engine
        .RecognizeAsync(&bitmap)
        .map_err(|e| {
            log::error!("RecognizeAsync failed: {}", e);
            e.to_string()
        })?
        .await
        .map_err(|e| {
            log::error!("RecognizeAsync await failed: {}", e);
            e.to_string()
        })?;
    log::info!("Recognition completed");

    let lines = result.Lines().map_err(|e| e.to_string())?;
    let mut full_text = String::new();

    for line in lines {
        let text = line.Text().map_err(|e| e.to_string())?;
        full_text.push_str(&text.to_string_lossy());
        full_text.push('\n');
    }

    log::info!("OCR Result length: {}", full_text.len());

    Ok(full_text.trim().to_string())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn recognize_text(_image_path: &str) -> Result<String, String> {
    Err("OCR is only supported on macOS and Windows".to_string())
}
