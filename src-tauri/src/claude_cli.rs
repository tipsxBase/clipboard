use serde::{Deserialize, Serialize};
use std::io::BufRead;
use std::path::{Path, PathBuf};
use std::process::Stdio;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Status returned by `check_claude_cli`.
#[derive(Debug, Serialize, Clone)]
pub struct ClaudeCliStatus {
    pub installed: bool,
    pub version: Option<String>,
}

/// Incremental events emitted to the frontend during a streaming session.
#[derive(Debug, Serialize, Clone)]
#[serde(tag = "kind")]
pub enum ClaudeStreamEvent {
    /// Session initialised — carries the session ID for `--resume`.
    Init { session_id: String },
    /// Incremental text token.
    TextDelta { text: String },
    /// Incremental thinking/reasoning token.
    ThinkingDelta { text: String },
    /// An error occurred.
    Error { message: String },
    /// Stream finished.
    Done,
}

/// Parameters for `run_chat_stream`.
#[derive(Debug, Deserialize, Clone)]
pub struct ChatStreamRequest {
    pub message: String,
    pub system_prompt: Option<String>,
    pub session_id: Option<String>,
}

// ---------------------------------------------------------------------------
// Binary discovery
// ---------------------------------------------------------------------------

/// Locate the `claude` binary by checking PATH, user shell, and common dirs.
pub fn find_claude_binary() -> Result<PathBuf, String> {
    // 1. which/where on system PATH
    if let Some(bin) = find_via_which() {
        return Ok(bin);
    }

    // 2. Load user's login shell PATH and check again
    if let Some(bin) = find_via_login_shell() {
        return Ok(bin);
    }

    // 3. Well-known installation directories
    for candidate in claude_path_candidates() {
        if candidate.is_file() && is_executable(&candidate) {
            return Ok(candidate);
        }
    }

    Err("Claude CLI not found. Install with: brew install --cask claude-code".to_string())
}

fn find_via_which() -> Option<PathBuf> {
    let which_cmd = if cfg!(windows) { "where" } else { "which" };
    std::process::Command::new(which_cmd)
        .arg("claude")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| path_from_output(&o.stdout))
}

fn find_via_login_shell() -> Option<PathBuf> {
    let shell = std::env::var("SHELL").ok()?;
    let shell_path = PathBuf::from(&shell);
    if !shell_path.exists() {
        return None;
    }
    std::process::Command::new(&shell)
        .args(["-lc", "command -v claude"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| path_from_output(&o.stdout))
}

fn claude_path_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(home) = home::home_dir() {
        candidates.extend([
            home.join(".local/bin/claude"),
            home.join(".npm-global/bin/claude"),
            home.join(".npm/bin/claude"),
            home.join(".bun/bin/claude"),
            home.join(".local/share/mise/shims/claude"),
            home.join(".asdf/shims/claude"),
        ]);
    }
    candidates.extend([
        PathBuf::from("/opt/homebrew/bin/claude"),
        PathBuf::from("/usr/local/bin/claude"),
        PathBuf::from("/home/linuxbrew/.linuxbrew/bin/claude"),
    ]);
    candidates
}

fn path_from_output(bytes: &[u8]) -> Option<PathBuf> {
    let s = std::str::from_utf8(bytes).ok()?.trim();
    if s.is_empty() {
        return None;
    }
    Some(PathBuf::from(s.lines().next()?))
}

fn is_executable(path: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::metadata(path)
            .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        path.is_file()
    }
}

// ---------------------------------------------------------------------------
// CLI status check
// ---------------------------------------------------------------------------

pub fn check_claude_cli() -> ClaudeCliStatus {
    let Ok(bin) = find_claude_binary() else {
        return ClaudeCliStatus {
            installed: false,
            version: None,
        };
    };

    let version = std::process::Command::new(&bin)
        .arg("--version")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());

    ClaudeCliStatus {
        installed: true,
        version,
    }
}

// ---------------------------------------------------------------------------
// Streaming chat
// ---------------------------------------------------------------------------

/// Spawn `claude -p` (no tools, pure chat) and stream events via callback.
/// Returns the session_id captured from the `Init` or `result` JSON line.
pub fn run_chat_stream<F>(req: ChatStreamRequest, mut emit: F) -> Result<String, String>
where
    F: FnMut(ClaudeStreamEvent),
{
    let bin = find_claude_binary()?;
    let args = build_chat_args(&req);

    let mut child = std::process::Command::new(&bin)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        // Prevent claude CLI from detecting a nested session
        .env_remove("CLAUDE_CODE_ENTRYPOINT")
        .env_remove("CLAUDECODE")
        .spawn()
        .map_err(|e| format!("Failed to spawn claude: {e}"))?;

    let stdout = child.stdout.take().ok_or("No stdout")?;
    let reader = std::io::BufReader::new(stdout);

    let mut session_id = String::new();

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(e) => {
                emit(ClaudeStreamEvent::Error {
                    message: format!("Read error: {e}"),
                });
                break;
            }
        };

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let Ok(json) = serde_json::from_str::<serde_json::Value>(trimmed) else {
            continue;
        };

        if let Some(event) = parse_stream_line(&json, &mut session_id) {
            emit(event);
        }
    }

    let _ = child.wait();
    Ok(session_id)
}

fn build_chat_args(req: &ChatStreamRequest) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "-p".into(),
        req.message.clone(),
        "--output-format".into(),
        "stream-json".into(),
        "--verbose".into(),
        "--include-partial-messages".into(),
        "--tools".into(),
        String::new(), // empty = disable all built-in tools
    ];

    if let Some(ref sp) = req.system_prompt {
        if !sp.trim().is_empty() {
            args.push("--system-prompt".into());
            args.push(sp.clone());
        }
    }

    if let Some(ref sid) = req.session_id {
        if !sid.is_empty() {
            args.push("--resume".into());
            args.push(sid.clone());
        }
    }

    args
}

fn parse_stream_line(
    json: &serde_json::Value,
    session_id: &mut String,
) -> Option<ClaudeStreamEvent> {
    let msg_type = json["type"].as_str()?;

    match msg_type {
        // Claude Code stream-json protocol
        "system" => {
            if let Some(sid) = json["session_id"].as_str() {
                *session_id = sid.to_string();
                return Some(ClaudeStreamEvent::Init {
                    session_id: sid.to_string(),
                });
            }
            None
        }
        "assistant" => {
            // message content blocks
            if let Some(content) = json["message"]["content"].as_array() {
                for block in content {
                    if block["type"].as_str() == Some("text") {
                        if let Some(text) = block["text"].as_str() {
                            return Some(ClaudeStreamEvent::TextDelta {
                                text: text.to_string(),
                            });
                        }
                    }
                    if block["type"].as_str() == Some("thinking") {
                        if let Some(text) = block["thinking"].as_str() {
                            return Some(ClaudeStreamEvent::ThinkingDelta {
                                text: text.to_string(),
                            });
                        }
                    }
                }
            }
            None
        }
        "result" => {
            if let Some(sid) = json["session_id"].as_str() {
                *session_id = sid.to_string();
            }
            if let Some(text) = json["result"].as_str() {
                if !text.is_empty() {
                    return Some(ClaudeStreamEvent::TextDelta {
                        text: text.to_string(),
                    });
                }
            }
            None
        }
        "error" => {
            let msg = json["error"]["message"]
                .as_str()
                .unwrap_or("Unknown error")
                .to_string();
            Some(ClaudeStreamEvent::Error { message: msg })
        }
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Agent stream (MCP-enabled)
// ---------------------------------------------------------------------------

/// Parameters for `run_agent_stream` – MCP knowledge-base agent mode.
#[derive(Debug, Deserialize, Clone)]
pub struct AgentStreamRequest {
    pub message: String,
    pub session_id: Option<String>,
    /// Absolute path to `mcp-server/index.js` (resolved by Tauri at runtime).
    pub mcp_server_path: String,
    /// Port of the local MCP HTTP bridge (127.0.0.1 only).
    pub api_port: u16,
}

/// Spawn `claude -p` with a stdio MCP server config and stream events via callback.
/// Only MCP tools are allowed – no dangerous built-in tools (Bash, Edit, etc.).
pub fn run_agent_stream<F>(req: AgentStreamRequest, mut emit: F) -> Result<String, String>
where
    F: FnMut(ClaudeStreamEvent),
{
    let bin = find_claude_binary()?;

    // Write MCP config to a temp file (claude expects a file path)
    let mcp_config = serde_json::json!({
        "mcpServers": {
            "clipboard-kb": {
                "command": "node",
                "args": [req.mcp_server_path],
                "env": {
                    "MCP_API_PORT": req.api_port.to_string()
                }
            }
        }
    });
    let config_path = std::env::temp_dir().join("clipboard_mcp_config.json");
    std::fs::write(
        &config_path,
        serde_json::to_string_pretty(&mcp_config)
            .map_err(|e| format!("Failed to serialize MCP config: {e}"))?,
    )
    .map_err(|e| format!("Failed to write MCP config: {e}"))?;

    let mut args: Vec<String> = vec![
        "-p".into(),
        req.message.clone(),
        "--output-format".into(),
        "stream-json".into(),
        "--verbose".into(),
        "--include-partial-messages".into(),
        "--mcp-config".into(),
        config_path.to_string_lossy().to_string(),
        // Allow only our MCP tools – no shell/file-system tools
        "--allowedTools".into(),
        "mcp__clipboard-kb__list_notes,mcp__clipboard-kb__search_notes,mcp__clipboard-kb__get_note"
            .into(),
    ];

    if let Some(ref sid) = req.session_id {
        if !sid.is_empty() {
            args.push("--resume".into());
            args.push(sid.clone());
        }
    }

    let mut child = std::process::Command::new(&bin)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .env_remove("CLAUDE_CODE_ENTRYPOINT")
        .env_remove("CLAUDECODE")
        .spawn()
        .map_err(|e| format!("Failed to spawn claude (agent): {e}"))?;

    let stdout = child.stdout.take().ok_or("No stdout")?;
    let reader = std::io::BufReader::new(stdout);

    let mut session_id = String::new();

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(e) => {
                emit(ClaudeStreamEvent::Error {
                    message: format!("Read error: {e}"),
                });
                break;
            }
        };

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let Ok(json) = serde_json::from_str::<serde_json::Value>(trimmed) else {
            continue;
        };

        if let Some(event) = parse_stream_line(&json, &mut session_id) {
            emit(event);
        }
    }

    let _ = child.wait();
    Ok(session_id)
}
