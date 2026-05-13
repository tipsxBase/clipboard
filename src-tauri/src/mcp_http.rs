/// Lightweight HTTP bridge exposing knowledge-base endpoints to the MCP Node.js server.
/// Bound to 127.0.0.1 only – never accessible from outside the machine.
use crate::db::Database;
use std::sync::Arc;

// ---------------------------------------------------------------------------
// Public: start server and return the bound port
// ---------------------------------------------------------------------------

pub fn start_mcp_http_server(db: Arc<Database>) -> u16 {
    let server = tiny_http::Server::http("127.0.0.1:0").expect("Failed to bind MCP HTTP server");

    let port = server
        .server_addr()
        .to_ip()
        .expect("MCP HTTP server: expected IP address")
        .port();

    std::thread::spawn(move || {
        for request in server.incoming_requests() {
            let db = db.clone();
            std::thread::spawn(move || {
                let url = request.url().to_string();
                let method = request.method().clone();

                if method != tiny_http::Method::Get {
                    let _ =
                        request.respond(json_response(r#"{"error":"method not allowed"}"#, 405));
                    return;
                }

                let response = handle_request(&url, &db);
                let _ = request.respond(response);
            });
        }
    });

    log::info!("MCP HTTP bridge listening on 127.0.0.1:{}", port);
    port
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

type JsonResponse = tiny_http::Response<std::io::Cursor<Vec<u8>>>;

fn json_response(body: &str, status: u16) -> JsonResponse {
    tiny_http::Response::from_string(body)
        .with_status_code(tiny_http::StatusCode::from(status))
        .with_header(tiny_http::Header::from_bytes("Content-Type", "application/json").unwrap())
}

fn handle_request(url: &str, db: &Arc<Database>) -> JsonResponse {
    let (path, query_str) = url.split_once('?').unwrap_or((url, ""));
    let params = parse_query(query_str);

    match path {
        "/health" => json_response(r#"{"ok":true}"#, 200),

        "/api/knowledge" => {
            let query = params
                .iter()
                .find(|(k, _)| k == "q")
                .map(|(_, v)| v.clone())
                .filter(|v| !v.is_empty());
            let limit: usize = params
                .iter()
                .find(|(k, _)| k == "limit")
                .and_then(|(_, v)| v.parse().ok())
                .unwrap_or(50);

            match db.list_knowledge_items(query, None, false) {
                Ok(items) => {
                    let limited: Vec<serde_json::Value> =
                        items.into_iter().take(limit).map(item_to_json).collect();
                    let body = serde_json::to_string(&limited).unwrap_or_else(|_| "[]".into());
                    json_response(&body, 200)
                }
                Err(e) => {
                    let msg = e.to_string().replace('"', "'");
                    json_response(&format!(r#"{{"error":"{msg}"}}"#), 500)
                }
            }
        }

        path if path.starts_with("/api/knowledge/") => {
            let id_str = &path["/api/knowledge/".len()..];
            match id_str.parse::<i64>() {
                Ok(id) => match db.get_knowledge_item(id) {
                    Ok(Some(item)) => {
                        let body = serde_json::to_string(&item_to_json(item))
                            .unwrap_or_else(|_| "{}".into());
                        json_response(&body, 200)
                    }
                    Ok(None) => json_response(r#"{"error":"not found"}"#, 404),
                    Err(e) => {
                        let msg = e.to_string().replace('"', "'");
                        json_response(&format!(r#"{{"error":"{msg}"}}"#), 500)
                    }
                },
                Err(_) => json_response(r#"{"error":"invalid id"}"#, 400),
            }
        }

        _ => json_response(r#"{"error":"not found"}"#, 404),
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn item_to_json(item: crate::models::KnowledgeItem) -> serde_json::Value {
    // Truncate content for list view to keep payloads small
    let content_preview = if item.content.len() > 500 {
        format!("{}…", &item.content[..500])
    } else {
        item.content.clone()
    };

    serde_json::json!({
        "id": item.id,
        "title": item.title,
        "summary": item.summary,
        "content": content_preview,
        "full_content": item.content,
        "tags": item.tags,
        "knowledge_group_id": item.knowledge_group_id,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
        "word_count": item.word_count,
    })
}

fn parse_query(query_str: &str) -> Vec<(String, String)> {
    query_str
        .split('&')
        .filter(|s| !s.is_empty())
        .filter_map(|pair| {
            let mut parts = pair.splitn(2, '=');
            let key = percent_decode(parts.next()?);
            let value = percent_decode(parts.next().unwrap_or(""));
            Some((key, value))
        })
        .collect()
}

fn percent_decode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(hex_str) = std::str::from_utf8(&bytes[i + 1..i + 3]) {
                if let Ok(byte) = u8::from_str_radix(hex_str, 16) {
                    out.push(byte as char);
                    i += 3;
                    continue;
                }
            }
        } else if bytes[i] == b'+' {
            out.push(' ');
            i += 1;
            continue;
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}
