use crate::models::ClipboardItem;
use crate::state::AppState;
use base64::{engine::general_purpose, Engine as _};
use clipboard_rs::{Clipboard, ClipboardContent, ClipboardContext};
use regex::Regex;
use std::fs;
use tauri::Manager;
use tauri_plugin_clipboard_manager::ClipboardExt;

pub fn classify_content(content: &str) -> String {
    // URL
    let url_regex = Regex::new(r"^(https?://|www\.)[^\s/$.?#].[^\s]*$").unwrap();
    if url_regex.is_match(content) {
        return "url".to_string();
    }

    // Email
    let email_regex = Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").unwrap();
    if email_regex.is_match(content) {
        return "email".to_string();
    }

    // Phone (Simple)
    let phone_regex = Regex::new(r"^(\+\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}$").unwrap();
    if phone_regex.is_match(content) {
        return "phone".to_string();
    }

    // Code (Heuristic)
    let code_indicators = [
        "function", "class", "def", "import", "const", "let", "var", "public", "private", "return",
        "if (", "for (", "while (", "=>", "->", "::", "{", "}",
    ];
    let mut score = 0;
    for indicator in code_indicators {
        if content.contains(indicator) {
            score += 1;
        }
    }
    // Also check for indentation or typical code structure
    if content.contains(";\n") || content.contains("{\n") || content.contains("}\n") {
        score += 2;
    }

    if score >= 2 {
        return "code".to_string();
    }

    "text".to_string()
}

pub fn write_to_clipboard(app: &tauri::AppHandle, item: &ClipboardItem) -> Result<(), String> {
    if item.kind == "text" {
        // Try to use clipboard-rs for dual storage (Text + HTML)
        if let Some(html) = &item.html_content {
            if let Ok(ctx) = ClipboardContext::new() {
                let contents = vec![
                    ClipboardContent::Text(item.content.clone()),
                    ClipboardContent::Html(html.clone()),
                ];
                if let Err(e) = ctx.set(contents) {
                    log::error!("Failed to set rich text via clipboard-rs: {}", e);
                    // Fallback to standard text via tauri plugin if rich text fails
                } else {
                    return Ok(());
                }
            }
        }

        app.clipboard()
            .write_text(item.content.clone())
            .map_err(|e| e.to_string())?;
    } else if item.kind == "image" {
        let bytes = if item.content.starts_with('/') || item.content.chars().nth(1) == Some(':') {
            // It's a file path
            fs::read(&item.content).map_err(|e| e.to_string())?
        } else {
            // It's base64 (legacy support)
            general_purpose::STANDARD
                .decode(&item.content)
                .map_err(|e| e.to_string())?
        };

        let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
        let rgba = img.to_rgba8();
        let width = img.width();
        let height = img.height();
        let rgba_bytes = rgba.into_raw();

        // Update last_app_image_change
        let state = app.state::<AppState>();
        if let Ok(mut last_change) = state.last_app_image_change.lock() {
            *last_change = Some(rgba_bytes.clone());
        }

        let tauri_img = tauri::image::Image::new(&rgba_bytes, width, height);
        app.clipboard()
            .write_image(&tauri_img)
            .map_err(|e| e.to_string())?;
    } else if item.kind == "file" {
        let files: Vec<String> = serde_json::from_str(&item.content).map_err(|e| e.to_string())?;

        // Update last_app_file_change
        let state = app.state::<AppState>();
        if let Ok(mut last_change) = state.last_app_file_change.lock() {
            *last_change = Some(files.clone());
        }

        if let Ok(ctx) = ClipboardContext::new() {
            let contents = vec![ClipboardContent::Files(files)];
            ctx.set(contents).map_err(|e| e.to_string())?;
        } else {
            return Err("Failed to access clipboard context".to_string());
        }
    }
    Ok(())
}
