use crate::crypto::Crypto;
use crate::models::{ClipboardItem, Collection};
use chrono::Local;
use regex::Regex;
use rusqlite::{functions::FunctionFlags, params, Connection, OptionalExtension, Result};
use std::path::Path;
use std::sync::{Arc, Mutex};

pub struct Database {
    conn: Mutex<Connection>,
    crypto: Arc<Crypto>,
}

impl Database {
    pub fn new<P: AsRef<Path>>(path: P, crypto: Arc<Crypto>) -> Result<Self> {
        let mut conn = Connection::open(path)?;

        let tx = conn.transaction()?;
        let version: i32 = tx.query_row("PRAGMA user_version", [], |row| row.get(0))?;

        if version < 1 {
            tx.execute(
                "CREATE TABLE IF NOT EXISTS history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    content TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    is_sensitive BOOLEAN NOT NULL DEFAULT 0
                )",
                [],
            )?;

            tx.execute(
                "CREATE INDEX IF NOT EXISTS idx_content_kind ON history (content, kind)",
                [],
            )?;

            tx.execute("PRAGMA user_version = 1", [])?;
        }

        if version < 2 {
            // Check if column exists first to avoid error if user manually added it or something weird happened
            // Actually, ALTER TABLE ADD COLUMN IF NOT EXISTS is not supported in all sqlite versions,
            // but since we use user_version, we should be safe.
            // However, let's wrap in a try-catch block or just execute it.
            // Rusqlite doesn't support "try", so we just execute.
            // If it fails because column exists, we might want to ignore?
            // But version check should prevent that.
            let _ = tx.execute(
                "ALTER TABLE history ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT 0",
                [],
            );
            tx.execute("PRAGMA user_version = 2", [])?;
        }

        if version < 3 {
            let _ = tx.execute("ALTER TABLE history ADD COLUMN source_app TEXT", []);
            tx.execute("PRAGMA user_version = 3", [])?;
        }

        if version < 4 {
            let _ = tx.execute(
                "ALTER TABLE history ADD COLUMN data_type TEXT NOT NULL DEFAULT 'text'",
                [],
            );
            let _ = tx.execute("ALTER TABLE history ADD COLUMN collection_id INTEGER", []);
            tx.execute(
                "CREATE TABLE IF NOT EXISTS collections (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )",
                [],
            )?;
            tx.execute("PRAGMA user_version = 4", [])?;
        }

        if version < 5 {
            let _ = tx.execute("ALTER TABLE history ADD COLUMN note TEXT", []);
            tx.execute("PRAGMA user_version = 5", [])?;
        }

        if version < 6 {
            let _ = tx.execute("ALTER TABLE history ADD COLUMN html_content TEXT", []);
            tx.execute("PRAGMA user_version = 6", [])?;
        }

        if version < 7 {
            let _ = tx.execute(
                "ALTER TABLE history ADD COLUMN is_snippet BOOLEAN NOT NULL DEFAULT 0",
                [],
            );
            let _ = tx.execute(
                "ALTER TABLE history ADD COLUMN is_favorite BOOLEAN NOT NULL DEFAULT 0",
                [],
            );
            tx.execute("PRAGMA user_version = 7", [])?;
        }

        if version < 8 {
            let _ = tx.execute("ALTER TABLE history ADD COLUMN screenshot_id INTEGER", []);
            tx.execute("PRAGMA user_version = 8", [])?;
        }

        tx.commit()?;

        // Add REGEXP function
        conn.create_scalar_function(
            "REGEXP",
            2,
            FunctionFlags::SQLITE_DETERMINISTIC,
            move |ctx| {
                let regex_s = ctx.get::<String>(0)?;
                // Handle nullable text column (like 'note')
                let text = ctx.get::<Option<String>>(1)?.unwrap_or_default();

                // log::info!("REGEXP called: pattern='{}', text='{}'", regex_s, text);

                let regex = Regex::new(&regex_s).map_err(|e| {
                    log::error!("Invalid regex '{}': {}", regex_s, e);
                    rusqlite::Error::UserFunctionError(Box::new(e))
                })?;

                Ok(regex.is_match(&text))
            },
        )?;

        Ok(Self {
            conn: Mutex::new(conn),
            crypto,
        })
    }

    /// Build the shared WHERE clause and params for history queries.
    /// Used by both `get_history` and `count_history_filtered` to ensure identical semantics.
    fn build_history_filter(
        &self,
        query: &Option<String>,
        search_regex: bool,
        search_case_sensitive: bool,
        collection_id: Option<i64>,
        active_filter: &Option<String>,
        source_app: &Option<String>,
        time_range: &Option<String>,
    ) -> (String, Vec<Box<dyn rusqlite::ToSql>>) {
        let mut sql = String::from(" WHERE 1=1");
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(q) = query {
            if !q.is_empty() {
                if search_regex {
                    sql.push_str(" AND (content REGEXP ? OR note REGEXP ?)");
                    let final_query = if search_case_sensitive {
                        q.clone()
                    } else {
                        format!("(?i){}", q)
                    };
                    params.push(Box::new(final_query.clone()));
                    params.push(Box::new(final_query));
                } else {
                    if search_case_sensitive {
                        sql.push_str(" AND (content GLOB ? OR note GLOB ?)");
                        let pattern = format!("*{}*", q);
                        params.push(Box::new(pattern.clone()));
                        params.push(Box::new(pattern));
                    } else {
                        sql.push_str(" AND (content LIKE ? OR note LIKE ?)");
                        let pattern = format!("%{}%", q);
                        params.push(Box::new(pattern.clone()));
                        params.push(Box::new(pattern));
                    }
                }
            }
        }

        if let Some(cid) = collection_id {
            sql.push_str(" AND collection_id = ?");
            params.push(Box::new(cid));
        }

        if let Some(filter) = active_filter {
            match filter.as_str() {
                "text" => sql.push_str(" AND kind = 'text'"),
                "image" => sql.push_str(" AND kind = 'image'"),
                "file" => sql.push_str(" AND kind = 'file'"),
                "sensitive" => sql.push_str(" AND is_sensitive = 1"),
                "snippet" => sql.push_str(" AND is_snippet = 1"),
                "url" | "email" | "code" | "phone" => {
                    sql.push_str(" AND data_type = ?");
                    params.push(Box::new(filter.clone()));
                }
                // "all" or unknown → no additional filter
                _ => {}
            }
        }

        if let Some(app) = source_app {
            if !app.is_empty() {
                sql.push_str(" AND source_app = ?");
                params.push(Box::new(app.clone()));
            }
        }

        if let Some(range) = time_range {
            let now = chrono::Local::now();
            let cutoff = match range.as_str() {
                "today" => Some(now.date_naive().and_hms_opt(0, 0, 0).unwrap()),
                "yesterday" => Some(
                    (now.date_naive() - chrono::Duration::days(1))
                        .and_hms_opt(0, 0, 0)
                        .unwrap(),
                ),
                "week" => Some(
                    (now.date_naive() - chrono::Duration::days(7))
                        .and_hms_opt(0, 0, 0)
                        .unwrap(),
                ),
                "month" => Some(
                    (now.date_naive() - chrono::Duration::days(30))
                        .and_hms_opt(0, 0, 0)
                        .unwrap(),
                ),
                _ => None,
            };
            if let Some(cutoff_time) = cutoff {
                sql.push_str(" AND timestamp >= ?");
                params.push(Box::new(
                    cutoff_time.format("%Y-%m-%d %H:%M:%S").to_string(),
                ));
            }
        }

        (sql, params)
    }

    pub fn get_history(
        &self,
        page: usize,
        page_size: usize,
        query: Option<String>,
        search_regex: bool,
        search_case_sensitive: bool,
        collection_id: Option<i64>,
        active_filter: Option<String>,
        source_app: Option<String>,
        time_range: Option<String>,
        sort_mode: Option<String>,
    ) -> Result<Vec<ClipboardItem>> {
        let conn = self.conn.lock().unwrap();
        let offset = (page - 1) * page_size;

        let (where_clause, mut params) = self.build_history_filter(
            &query,
            search_regex,
            search_case_sensitive,
            collection_id,
            &active_filter,
            &source_app,
            &time_range,
        );

        let mut sql = format!(
            "SELECT id, content, kind, timestamp, is_sensitive, is_pinned, source_app, data_type, collection_id, note, html_content, is_snippet, screenshot_id FROM history{}",
            where_clause
        );

        let order_clause = match sort_mode.as_deref() {
            Some("oldest") => " ORDER BY is_pinned DESC, timestamp ASC",
            Some("source_app") => " ORDER BY is_pinned DESC, source_app ASC, timestamp DESC",
            // "recent" or default
            _ => " ORDER BY is_pinned DESC, timestamp DESC",
        };
        sql.push_str(order_clause);
        sql.push_str(" LIMIT ? OFFSET ?");
        params.push(Box::new(page_size));
        params.push(Box::new(offset));

        let mut stmt = conn.prepare(&sql)?;

        // Convert params to references for query_map
        let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

        let rows = stmt.query_map(params_refs.as_slice(), |row| {
            let id: i64 = row.get(0)?;
            let content: String = row.get(1)?;
            let kind: String = row.get(2)?;
            let timestamp: String = row.get(3)?;
            let is_sensitive: bool = row.get(4)?;
            let is_pinned: bool = row.get(5)?;
            let source_app: Option<String> = row.get(6)?;
            let data_type: String = row.get(7)?;
            let collection_id: Option<i64> = row.get(8)?;
            let note: Option<String> = row.get(9)?;
            let html_content: Option<String> = row.get(10)?;
            let is_snippet: bool = row.get(11)?;
            let screenshot_id: Option<i64> = row.get(12)?;

            let final_content = if is_sensitive && kind == "text" {
                self.crypto.decrypt(&content).unwrap_or(content)
            } else {
                content
            };

            let final_html = if let Some(html) = html_content {
                if is_sensitive {
                    Some(self.crypto.decrypt(&html).unwrap_or(html))
                } else {
                    Some(html)
                }
            } else {
                None
            };

            Ok(ClipboardItem {
                id: Some(id),
                content: final_content,
                kind,
                timestamp,
                is_sensitive,
                is_pinned,
                source_app,
                data_type,
                collection_id,
                note,
                html_content: final_html,
                is_snippet,
                screenshot_id,
            })
        })?;

        let mut items = Vec::new();
        for row in rows {
            items.push(row?);
        }
        Ok(items)
    }

    pub fn insert_item(&self, item: &ClipboardItem, max_size: usize) -> Result<Vec<ClipboardItem>> {
        let conn = self.conn.lock().unwrap();
        let mut pruned_items = Vec::new();

        let content_to_store = if item.is_sensitive && item.kind == "text" {
            self.crypto
                .encrypt(&item.content)
                .unwrap_or(item.content.clone())
        } else {
            item.content.clone()
        };

        let html_to_store = if let Some(html) = &item.html_content {
            if item.is_sensitive {
                Some(self.crypto.encrypt(html).unwrap_or(html.clone()))
            } else {
                Some(html.clone())
            }
        } else {
            None
        };

        // Deduplicate: Update timestamp, source_app and html_content if exists
        let updated_count = conn.execute(
            "UPDATE history SET timestamp = ?1, source_app = ?2, html_content = ?3 WHERE content = ?4 AND kind = ?5",
            params![item.timestamp, item.source_app, html_to_store, content_to_store, item.kind],
        )?;

        if updated_count == 0 {
            // Insert new item
            conn.execute(
                "INSERT INTO history (content, kind, timestamp, is_sensitive, is_pinned, source_app, data_type, collection_id, note, html_content, is_snippet, screenshot_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    content_to_store,
                    item.kind,
                    item.timestamp,
                    item.is_sensitive,
                    item.is_pinned,
                    item.source_app,
                    item.data_type,
                    item.collection_id,
                    item.note,
                    html_to_store,
                    item.is_snippet,
                    item.screenshot_id
                ],
            )?;
        }

        // Prune if exceeding max_size
        let count: usize = conn.query_row("SELECT COUNT(*) FROM history", [], |row| row.get(0))?;
        if count > max_size {
            let delete_count = count - max_size;

            // Use unified eligibility rule: not pinned AND not in a collection
            // First collect IDs of items to delete, then delete by those exact IDs
            let mut stmt = conn.prepare(&format!(
                "SELECT id, content, kind, timestamp, is_sensitive, is_pinned, source_app, data_type, collection_id, note, html_content, is_snippet, screenshot_id FROM history WHERE is_pinned = 0 AND collection_id IS NULL AND is_snippet = 0 ORDER BY timestamp ASC LIMIT {}",
                delete_count
            ))?;

            let rows = stmt.query_map([], |row| {
                let id: i64 = row.get(0)?;
                let content: String = row.get(1)?;
                let kind: String = row.get(2)?;
                let timestamp: String = row.get(3)?;
                let is_sensitive: bool = row.get(4)?;
                let is_pinned: bool = row.get(5)?;
                let source_app: Option<String> = row.get(6)?;
                let data_type: String = row.get(7)?;
                let collection_id: Option<i64> = row.get(8)?;
                let note: Option<String> = row.get(9)?;
                let html_content: Option<String> = row.get(10)?;
                let is_snippet: bool = row.get(11)?;
                let screenshot_id: Option<i64> = row.get(12)?;

                let final_content = if is_sensitive && kind == "text" {
                    self.crypto.decrypt(&content).unwrap_or(content)
                } else {
                    content
                };

                let final_html = if let Some(html) = html_content {
                    if is_sensitive {
                        Some(self.crypto.decrypt(&html).unwrap_or(html))
                    } else {
                        Some(html)
                    }
                } else {
                    None
                };

                Ok(ClipboardItem {
                    id: Some(id),
                    content: final_content,
                    kind,
                    timestamp,
                    is_sensitive,
                    is_pinned,
                    source_app,
                    data_type,
                    collection_id,
                    note,
                    html_content: final_html,
                    is_snippet,
                    screenshot_id,
                })
            })?;

            for row in rows {
                if let Ok(item) = row {
                    pruned_items.push(item);
                }
            }

            // Delete by exact IDs collected above
            if !pruned_items.is_empty() {
                let ids: Vec<String> = pruned_items
                    .iter()
                    .filter_map(|item| item.id.map(|id| id.to_string()))
                    .collect();
                let id_list = ids.join(",");
                conn.execute(
                    &format!("DELETE FROM history WHERE id IN ({})", id_list),
                    [],
                )?;
            }
        }

        Ok(pruned_items)
    }

    pub fn delete_item(&self, index: usize) -> Result<Option<ClipboardItem>> {
        // Index is from the frontend, which sees the list in DESC order (latest first).
        // So index 0 is the latest item (highest ID).
        // We need to find the ID of the item at that offset.
        let conn = self.conn.lock().unwrap();

        // Get the ID and details of the item at the specified offset
        let item: Option<(i64, ClipboardItem)> = conn
            .query_row(
                "SELECT id, content, kind, timestamp, is_sensitive, is_pinned, source_app, data_type, collection_id, note, html_content, is_snippet, screenshot_id FROM history ORDER BY is_pinned DESC, timestamp DESC LIMIT 1 OFFSET ?1",
                params![index],
                |row| {
                    let id: i64 = row.get(0)?;
                    let content: String = row.get(1)?;
                    let kind: String = row.get(2)?;
                    let timestamp: String = row.get(3)?;
                    let is_sensitive: bool = row.get(4)?;
                    let is_pinned: bool = row.get(5)?;
                    let source_app: Option<String> = row.get(6)?;
                    let data_type: String = row.get(7)?;
                    let collection_id: Option<i64> = row.get(8)?;
                    let note: Option<String> = row.get(9)?;
                    let html_content: Option<String> = row.get(10)?;
                    let is_snippet: bool = row.get(11)?;
                    let screenshot_id: Option<i64> = row.get(12)?;

                    let final_content = if is_sensitive && kind == "text" {
                        self.crypto.decrypt(&content).unwrap_or(content)
                    } else {
                        content
                    };

                     let final_html = if let Some(html) = html_content {
                         if is_sensitive {
                             Some(self.crypto.decrypt(&html).unwrap_or(html))
                        } else {
                             Some(html)
                        }
                    } else {
                        None
                    };

                    Ok((
                        id,
                        ClipboardItem {
                            id: Some(id),
                            content: final_content,
                            kind,
                            timestamp,
                            is_sensitive,
                            is_pinned,
                            source_app,
                            data_type,
                            collection_id,
                            note,
                            html_content: final_html,
                            is_snippet,
                            screenshot_id,
                        },
                    ))
                },
            )
            .optional()?;

        if let Some((id, item)) = item {
            conn.execute("DELETE FROM history WHERE id = ?1", params![id])?;
            Ok(Some(item))
        } else {
            Ok(None)
        }
    }

    pub fn toggle_sensitive(&self, index: usize) -> Result<bool> {
        let conn = self.conn.lock().unwrap();

        // Get item at index
        let item: Option<(i64, String, bool, String)> = conn
            .query_row(
                "SELECT id, content, is_sensitive, kind FROM history ORDER BY is_pinned DESC, timestamp DESC LIMIT 1 OFFSET ?1",
                params![index],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                    ))
                },
            )
            .optional()?;

        if let Some((id, content, is_sensitive, kind)) = item {
            let new_state = !is_sensitive;
            let new_content = if kind == "text" {
                if new_state {
                    // Encrypt
                    self.crypto.encrypt(&content).unwrap_or(content)
                } else {
                    // Decrypt
                    self.crypto.decrypt(&content).unwrap_or(content)
                }
            } else {
                content
            };

            conn.execute(
                "UPDATE history SET is_sensitive = ?1, content = ?2 WHERE id = ?3",
                params![new_state, new_content, id],
            )?;
            Ok(new_state)
        } else {
            Err(rusqlite::Error::QueryReturnedNoRows)
        }
    }

    pub fn toggle_pin(&self, index: usize) -> Result<bool> {
        let conn = self.conn.lock().unwrap();

        // Get item at index
        let item: Option<(i64, bool)> = conn
            .query_row(
                "SELECT id, is_pinned FROM history ORDER BY is_pinned DESC, timestamp DESC LIMIT 1 OFFSET ?1",
                params![index],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;

        if let Some((id, is_pinned)) = item {
            let new_state = !is_pinned;
            conn.execute(
                "UPDATE history SET is_pinned = ?1 WHERE id = ?2",
                params![new_state, id],
            )?;
            Ok(new_state)
        } else {
            Err(rusqlite::Error::QueryReturnedNoRows)
        }
    }

    pub fn toggle_snippet(&self, id: i64) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let current: bool = conn.query_row(
            "SELECT is_snippet FROM history WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;
        let new_state = !current;
        conn.execute(
            "UPDATE history SET is_snippet = ?1 WHERE id = ?2",
            params![new_state, id],
        )?;
        Ok(new_state)
    }

    pub fn update_content(
        &self,
        id: i64,
        new_content: String,
        new_data_type: String,
        new_note: Option<String>,
        new_html_content: Option<String>,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        // Fetch is_sensitive and kind to encrypt if needed
        let (is_sensitive, kind): (bool, String) = conn.query_row(
            "SELECT is_sensitive, kind FROM history WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        let final_content = if is_sensitive && kind == "text" {
            self.crypto.encrypt(&new_content).unwrap_or(new_content)
        } else {
            new_content
        };

        let final_html_content = if let Some(html) = new_html_content {
            if is_sensitive {
                Some(self.crypto.encrypt(&html).unwrap_or(html))
            } else {
                Some(html)
            }
        } else {
            None
        };

        conn.execute(
            "UPDATE history SET content = ?1, data_type = ?2, timestamp = ?3, note = ?4, html_content = ?5 WHERE id = ?6",
            params![
                final_content,
                new_data_type,
                Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                new_note,
                final_html_content,
                id
            ],
        )?;

        Ok(())
    }

    pub fn clear_history(
        &self,
        clear_pinned_on_clear: bool,
        clear_collected_on_clear: bool,
    ) -> Result<Vec<ClipboardItem>> {
        let conn = self.conn.lock().unwrap();

        // 构建 WHERE 条件
        let mut conditions = Vec::new();
        if !clear_pinned_on_clear {
            conditions.push("is_pinned = 0");
        }
        if !clear_collected_on_clear {
            conditions.push("collection_id IS NULL");
        }
        // Snippets are always exempt from clearing
        conditions.push("is_snippet = 0");
        // 如果都为 true，则不加条件，全部清除
        let where_clause = if conditions.is_empty() {
            String::from("")
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        // 查询所有将要被删除的项
        let select_sql = format!(
            "SELECT id, content, kind, timestamp, is_sensitive, is_pinned, source_app, data_type, collection_id, note, html_content, is_snippet, screenshot_id FROM history {}",
            where_clause
        );
        let mut stmt = conn.prepare(&select_sql)?;
        let rows = stmt.query_map([], |row| {
            let id: i64 = row.get(0)?;
            let content: String = row.get(1)?;
            let kind: String = row.get(2)?;
            let timestamp: String = row.get(3)?;
            let is_sensitive: bool = row.get(4)?;
            let is_pinned: bool = row.get(5)?;
            let source_app: Option<String> = row.get(6)?;
            let data_type: String = row.get(7)?;
            let collection_id: Option<i64> = row.get(8)?;
            let note: Option<String> = row.get(9)?;
            let html_content: Option<String> = row.get(10)?;
            let is_snippet: bool = row.get(11)?;
            let screenshot_id: Option<i64> = row.get(12)?;

            let final_content = if is_sensitive && kind == "text" {
                self.crypto.decrypt(&content).unwrap_or(content)
            } else {
                content
            };

            let final_html = if let Some(html) = html_content {
                if is_sensitive {
                    Some(self.crypto.decrypt(&html).unwrap_or(html))
                } else {
                    Some(html)
                }
            } else {
                None
            };

            Ok(ClipboardItem {
                id: Some(id),
                content: final_content,
                kind,
                timestamp,
                is_sensitive,
                is_pinned,
                source_app,
                data_type,
                collection_id,
                note,
                html_content: final_html,
                is_snippet,
                screenshot_id,
            })
        })?;

        let mut items = Vec::new();
        for row in rows {
            items.push(row?);
        }

        // 删除这些项
        let delete_sql = if where_clause.is_empty() {
            String::from("DELETE FROM history")
        } else {
            format!("DELETE FROM history {}", where_clause)
        };
        conn.execute(&delete_sql, [])?;
        Ok(items)
    }

    pub fn get_item_content(&self, id: i64) -> Result<String> {
        let conn = self.conn.lock().unwrap();
        let (content, is_sensitive, kind): (String, bool, String) = conn.query_row(
            "SELECT content, is_sensitive, kind FROM history WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;

        if is_sensitive && kind == "text" {
            Ok(self.crypto.decrypt(&content).unwrap_or(content))
        } else {
            Ok(content)
        }
    }

    pub fn get_item_by_id(&self, id: i64) -> Result<Option<ClipboardItem>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, content, kind, timestamp, is_sensitive, is_pinned, source_app, data_type, collection_id, note, html_content, is_snippet, screenshot_id FROM history WHERE id = ?1",
        )?;
        let item = stmt
            .query_row(params![id], |row| {
                let is_sensitive: bool = row.get(4)?;
                let kind: String = row.get(2)?;
                let raw: String = row.get(1)?;
                let content = if is_sensitive && kind == "text" {
                    self.crypto.decrypt(&raw).unwrap_or(raw)
                } else {
                    raw
                };
                let screenshot_id: Option<i64> = row.get(12)?;
                Ok(ClipboardItem {
                    id: row.get(0)?,
                    content,
                    kind,
                    timestamp: row.get(3)?,
                    is_sensitive,
                    is_pinned: row.get(5)?,
                    source_app: row.get(6)?,
                    data_type: row.get(7)?,
                    collection_id: row.get(8)?,
                    note: row.get(9)?,
                    html_content: row.get(10)?,
                    is_snippet: row.get(11)?,
                    screenshot_id,
                })
            })
            .optional()?;
        Ok(item)
    }

    pub fn count_history(&self) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        let count: usize = conn.query_row("SELECT COUNT(*) FROM history", [], |row| row.get(0))?;
        Ok(count)
    }

    pub fn count_history_filtered(
        &self,
        query: Option<String>,
        search_regex: bool,
        search_case_sensitive: bool,
        collection_id: Option<i64>,
        active_filter: Option<String>,
        source_app: Option<String>,
        time_range: Option<String>,
    ) -> Result<usize> {
        let conn = self.conn.lock().unwrap();

        let (where_clause, params) = self.build_history_filter(
            &query,
            search_regex,
            search_case_sensitive,
            collection_id,
            &active_filter,
            &source_app,
            &time_range,
        );

        let sql = format!("SELECT COUNT(*) FROM history{}", where_clause);
        let mut stmt = conn.prepare(&sql)?;
        let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let count: usize = stmt.query_row(params_refs.as_slice(), |row| row.get(0))?;
        Ok(count)
    }

    pub fn update_timestamp(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        conn.execute(
            "UPDATE history SET timestamp = ?1 WHERE id = ?2",
            params![timestamp, id],
        )?;
        Ok(())
    }

    pub fn create_collection(&self, name: String) -> Result<Collection> {
        let conn = self.conn.lock().unwrap();
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        conn.execute(
            "INSERT INTO collections (name, created_at) VALUES (?1, ?2)",
            params![name, timestamp],
        )?;
        let id = conn.last_insert_rowid();
        Ok(Collection {
            id,
            name,
            created_at: timestamp,
        })
    }

    pub fn get_collections(&self) -> Result<Vec<Collection>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt =
            conn.prepare("SELECT id, name, created_at FROM collections ORDER BY created_at DESC")?;
        let rows = stmt.query_map([], |row| {
            Ok(Collection {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
            })
        })?;

        let mut collections = Vec::new();
        for row in rows {
            collections.push(row?);
        }
        Ok(collections)
    }

    pub fn delete_collection(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        // First, remove items from this collection (set collection_id to NULL)
        conn.execute(
            "UPDATE history SET collection_id = NULL WHERE collection_id = ?1",
            params![id],
        )?;
        // Then delete the collection
        conn.execute("DELETE FROM collections WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn set_item_collection(&self, item_id: i64, collection_id: Option<i64>) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE history SET collection_id = ?1 WHERE id = ?2",
            params![collection_id, item_id],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::Crypto;
    use std::sync::Arc;
    use tempfile::TempDir;

    /// Helper: create a Database backed by a temp directory
    fn setup_db() -> (Database, TempDir) {
        let tmp = TempDir::new().unwrap();
        let db_path = tmp.path().join("test.db");
        let key_path = tmp.path().join("test.key");
        let crypto = Arc::new(Crypto::new(&key_path));
        let db = Database::new(&db_path, crypto).unwrap();
        (db, tmp)
    }

    /// Helper: build a minimal text item
    fn text_item(content: &str) -> ClipboardItem {
        ClipboardItem {
            id: None,
            content: content.to_string(),
            kind: "text".to_string(),
            timestamp: chrono::Local::now()
                .format("%Y-%m-%d %H:%M:%S%.3f")
                .to_string(),
            is_sensitive: false,
            is_pinned: false,
            source_app: None,
            data_type: "text".to_string(),
            collection_id: None,
            note: None,
            html_content: None,
            is_snippet: false,
            screenshot_id: None,
        }
    }

    /// Helper: build a minimal image item whose content is a file path
    fn image_item(path: &str) -> ClipboardItem {
        ClipboardItem {
            id: None,
            content: path.to_string(),
            kind: "image".to_string(),
            timestamp: chrono::Local::now()
                .format("%Y-%m-%d %H:%M:%S%.3f")
                .to_string(),
            is_sensitive: false,
            is_pinned: false,
            source_app: None,
            data_type: "image".to_string(),
            collection_id: None,
            note: None,
            html_content: None,
            is_snippet: false,
            screenshot_id: None,
        }
    }

    // -------------------------------------------------------
    // 3.1  Automatic pruning with pinned / collected / image
    // -------------------------------------------------------

    #[test]
    fn pruning_skips_pinned_items() {
        let (db, _tmp) = setup_db();
        let max_size = 3;

        // Insert 3 items, pin the first one
        for i in 0..3 {
            let item = text_item(&format!("item-{}", i));
            db.insert_item(&item, max_size).unwrap();
            std::thread::sleep(std::time::Duration::from_millis(10));
        }

        // Pin the oldest item (id=1)
        {
            let conn = db.conn.lock().unwrap();
            conn.execute("UPDATE history SET is_pinned = 1 WHERE id = 1", [])
                .unwrap();
        }

        // Now insert a 4th item which should trigger pruning
        let new_item = text_item("item-3");
        let pruned = db.insert_item(&new_item, max_size).unwrap();

        // Pruned items must NOT include the pinned one
        assert!(!pruned.is_empty(), "should prune something");
        for p in &pruned {
            assert!(!p.is_pinned, "pinned item must not be pruned");
        }

        // The pinned item should still exist
        let conn = db.conn.lock().unwrap();
        let pinned_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM history WHERE is_pinned = 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(pinned_count, 1, "pinned item must survive pruning");
    }

    #[test]
    fn pruning_skips_collected_items() {
        let (db, _tmp) = setup_db();
        let max_size = 3;

        // Create a collection
        let coll = db.create_collection("test-coll".to_string()).unwrap();

        // Insert 3 items, assign first to collection
        for i in 0..3 {
            let item = text_item(&format!("item-{}", i));
            db.insert_item(&item, max_size).unwrap();
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        db.set_item_collection(1, Some(coll.id)).unwrap();

        // Insert a 4th item
        let pruned = db.insert_item(&text_item("item-3"), max_size).unwrap();

        // Pruned should NOT include the collected item
        for p in &pruned {
            assert!(
                p.collection_id.is_none(),
                "collected item must not be pruned"
            );
        }

        // The collected item should still exist
        let conn = db.conn.lock().unwrap();
        let coll_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM history WHERE collection_id IS NOT NULL",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(coll_count, 1, "collected item must survive pruning");
    }

    #[test]
    fn pruned_items_match_actual_deletions() {
        let (db, _tmp) = setup_db();
        let max_size = 2;

        // Insert max_size items
        for i in 0..2 {
            db.insert_item(&text_item(&format!("old-{}", i)), max_size)
                .unwrap();
            std::thread::sleep(std::time::Duration::from_millis(10));
        }

        // One more triggers pruning of 1 item
        let pruned = db.insert_item(&text_item("new"), max_size).unwrap();
        assert_eq!(pruned.len(), 1, "should prune exactly 1 item");

        // Verify the pruned item is gone
        let pruned_id = pruned[0].id.unwrap();
        let conn = db.conn.lock().unwrap();
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM history WHERE id = ?1",
                params![pruned_id],
                |r| r.get::<_, i64>(0),
            )
            .map(|c| c > 0)
            .unwrap();
        assert!(!exists, "pruned item must be deleted from database");
    }

    #[test]
    fn pruning_returns_image_items_for_file_cleanup() {
        let (db, tmp) = setup_db();
        let max_size = 2;

        // Create a fake image file
        let img_path = tmp.path().join("test.png");
        std::fs::write(&img_path, b"fake-image-data").unwrap();

        // Insert an image item and a text item
        db.insert_item(&image_item(img_path.to_str().unwrap()), max_size)
            .unwrap();
        std::thread::sleep(std::time::Duration::from_millis(10));
        db.insert_item(&text_item("text-1"), max_size).unwrap();

        // Insert one more, triggering prune of the oldest (image)
        let pruned = db.insert_item(&text_item("text-2"), max_size).unwrap();

        // The pruned list must contain the image item so the caller can clean the file
        let image_pruned: Vec<_> = pruned.iter().filter(|p| p.kind == "image").collect();
        assert_eq!(image_pruned.len(), 1, "image item should be in pruned list");
        assert_eq!(
            image_pruned[0].content,
            img_path.to_string_lossy().to_string()
        );
    }

    // -------------------------------------------------------
    // 3.2  Manual delete and clear-history asset cleanup
    // -------------------------------------------------------

    #[test]
    fn delete_item_returns_deleted_item() {
        let (db, _tmp) = setup_db();
        db.insert_item(&text_item("hello"), 100).unwrap();

        let deleted = db.delete_item(0).unwrap();
        assert!(deleted.is_some(), "should return the deleted item");
        assert_eq!(deleted.unwrap().content, "hello");

        // Verify it's gone
        assert_eq!(db.count_history().unwrap(), 0);
    }

    #[test]
    fn clear_history_respects_pinned_flag() {
        let (db, _tmp) = setup_db();

        // Insert items and pin one
        db.insert_item(&text_item("keep-me"), 100).unwrap();
        db.insert_item(&text_item("delete-me"), 100).unwrap();
        {
            let conn = db.conn.lock().unwrap();
            conn.execute("UPDATE history SET is_pinned = 1 WHERE id = 1", [])
                .unwrap();
        }

        // Clear without clearing pinned
        let cleared = db.clear_history(false, false).unwrap();
        assert_eq!(cleared.len(), 1, "should only clear non-pinned");
        assert_eq!(cleared[0].content, "delete-me");

        // Pinned item still exists
        assert_eq!(db.count_history().unwrap(), 1);
    }

    #[test]
    fn clear_history_respects_collected_flag() {
        let (db, _tmp) = setup_db();

        let coll = db.create_collection("coll".to_string()).unwrap();
        db.insert_item(&text_item("collected"), 100).unwrap();
        db.insert_item(&text_item("normal"), 100).unwrap();
        db.set_item_collection(1, Some(coll.id)).unwrap();

        // Clear without clearing collected
        let cleared = db.clear_history(false, false).unwrap();
        assert_eq!(cleared.len(), 1, "should only clear non-collected");
        assert_eq!(cleared[0].content, "normal");

        assert_eq!(db.count_history().unwrap(), 1);
    }

    #[test]
    fn clear_history_clears_everything_when_flags_set() {
        let (db, _tmp) = setup_db();

        let coll = db.create_collection("coll".to_string()).unwrap();
        db.insert_item(&text_item("pinned"), 100).unwrap();
        db.insert_item(&text_item("collected"), 100).unwrap();
        db.insert_item(&text_item("normal"), 100).unwrap();
        {
            let conn = db.conn.lock().unwrap();
            conn.execute("UPDATE history SET is_pinned = 1 WHERE id = 1", [])
                .unwrap();
        }
        db.set_item_collection(2, Some(coll.id)).unwrap();

        // Clear everything
        let cleared = db.clear_history(true, true).unwrap();
        assert_eq!(cleared.len(), 3, "should clear all items");
        assert_eq!(db.count_history().unwrap(), 0);
    }

    #[test]
    fn clear_history_returns_image_items_for_cleanup() {
        let (db, tmp) = setup_db();

        let img_path = tmp.path().join("img.png");
        std::fs::write(&img_path, b"data").unwrap();

        db.insert_item(&image_item(img_path.to_str().unwrap()), 100)
            .unwrap();
        db.insert_item(&text_item("text"), 100).unwrap();

        let cleared = db.clear_history(false, false).unwrap();
        let images: Vec<_> = cleared.iter().filter(|i| i.kind == "image").collect();
        assert_eq!(
            images.len(),
            1,
            "should include image items for file cleanup"
        );
    }

    // -------------------------------------------------------
    // Helper for typed items
    // -------------------------------------------------------

    fn typed_item(content: &str, data_type: &str) -> ClipboardItem {
        ClipboardItem {
            id: None,
            content: content.to_string(),
            kind: "text".to_string(),
            timestamp: chrono::Local::now()
                .format("%Y-%m-%d %H:%M:%S%.3f")
                .to_string(),
            is_sensitive: false,
            is_pinned: false,
            source_app: None,
            data_type: data_type.to_string(),
            collection_id: None,
            note: None,
            html_content: None,
            is_snippet: false,
            screenshot_id: None,
        }
    }

    fn sensitive_item(content: &str) -> ClipboardItem {
        ClipboardItem {
            id: None,
            content: content.to_string(),
            kind: "text".to_string(),
            timestamp: chrono::Local::now()
                .format("%Y-%m-%d %H:%M:%S%.3f")
                .to_string(),
            is_sensitive: true,
            is_pinned: false,
            source_app: None,
            data_type: "text".to_string(),
            collection_id: None,
            note: None,
            html_content: None,
            is_snippet: false,
            screenshot_id: None,
        }
    }

    // -------------------------------------------------------
    // 3.1  Type-filtered retrieval and matching filtered counts
    // -------------------------------------------------------

    #[test]
    fn filter_by_text_kind() {
        let (db, tmp) = setup_db();
        let img_path = tmp.path().join("test.png");
        std::fs::write(&img_path, b"img").unwrap();

        db.insert_item(&text_item("hello"), 100).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(10));
        db.insert_item(&image_item(img_path.to_str().unwrap()), 100)
            .unwrap();

        let results = db
            .get_history(
                1,
                50,
                None,
                false,
                false,
                None,
                Some("text".to_string()),
                None,
                None,
                None,
            )
            .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].kind, "text");

        let count = db
            .count_history_filtered(
                None,
                false,
                false,
                None,
                Some("text".to_string()),
                None,
                None,
            )
            .unwrap();
        assert_eq!(count, results.len());
    }

    #[test]
    fn filter_by_image_kind() {
        let (db, tmp) = setup_db();
        let img_path = tmp.path().join("test.png");
        std::fs::write(&img_path, b"img").unwrap();

        db.insert_item(&text_item("hello"), 100).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(10));
        db.insert_item(&image_item(img_path.to_str().unwrap()), 100)
            .unwrap();

        let results = db
            .get_history(
                1,
                50,
                None,
                false,
                false,
                None,
                Some("image".to_string()),
                None,
                None,
                None,
            )
            .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].kind, "image");

        let count = db
            .count_history_filtered(
                None,
                false,
                false,
                None,
                Some("image".to_string()),
                None,
                None,
            )
            .unwrap();
        assert_eq!(count, results.len());
    }

    #[test]
    fn filter_by_sensitive() {
        let (db, _tmp) = setup_db();
        db.insert_item(&text_item("normal"), 100).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(10));
        db.insert_item(&sensitive_item("secret"), 100).unwrap();

        let results = db
            .get_history(
                1,
                50,
                None,
                false,
                false,
                None,
                Some("sensitive".to_string()),
                None,
                None,
                None,
            )
            .unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].is_sensitive);

        let count = db
            .count_history_filtered(
                None,
                false,
                false,
                None,
                Some("sensitive".to_string()),
                None,
                None,
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn filter_by_data_type_url() {
        let (db, _tmp) = setup_db();
        db.insert_item(&text_item("plain text"), 100).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(10));
        db.insert_item(&typed_item("https://example.com", "url"), 100)
            .unwrap();

        let results = db
            .get_history(
                1,
                50,
                None,
                false,
                false,
                None,
                Some("url".to_string()),
                None,
                None,
                None,
            )
            .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].data_type, "url");

        let count = db
            .count_history_filtered(
                None,
                false,
                false,
                None,
                Some("url".to_string()),
                None,
                None,
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn filter_all_returns_everything() {
        let (db, _tmp) = setup_db();
        db.insert_item(&text_item("a"), 100).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(10));
        db.insert_item(&typed_item("b@c.com", "email"), 100)
            .unwrap();

        let results = db
            .get_history(
                1,
                50,
                None,
                false,
                false,
                None,
                Some("all".to_string()),
                None,
                None,
                None,
            )
            .unwrap();
        assert_eq!(results.len(), 2);

        let count = db
            .count_history_filtered(
                None,
                false,
                false,
                None,
                Some("all".to_string()),
                None,
                None,
            )
            .unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn count_matches_list_with_no_filter() {
        let (db, _tmp) = setup_db();
        for i in 0..5 {
            db.insert_item(&text_item(&format!("item-{}", i)), 100)
                .unwrap();
            std::thread::sleep(std::time::Duration::from_millis(5));
        }

        let results = db
            .get_history(1, 50, None, false, false, None, None, None, None, None)
            .unwrap();
        let count = db
            .count_history_filtered(None, false, false, None, None, None, None)
            .unwrap();
        assert_eq!(results.len(), count);
    }

    // -------------------------------------------------------
    // 3.2  Collection + search + type combinations
    // -------------------------------------------------------

    #[test]
    fn filter_collection_plus_type() {
        let (db, tmp) = setup_db();
        let coll = db.create_collection("test".to_string()).unwrap();

        let img_path = tmp.path().join("coll.png");
        std::fs::write(&img_path, b"img").unwrap();

        db.insert_item(&text_item("text-in-coll"), 100).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(10));
        db.insert_item(&image_item(img_path.to_str().unwrap()), 100)
            .unwrap();
        std::thread::sleep(std::time::Duration::from_millis(10));
        db.insert_item(&text_item("text-not-in-coll"), 100).unwrap();

        // Put first two items in collection
        db.set_item_collection(1, Some(coll.id)).unwrap();
        db.set_item_collection(2, Some(coll.id)).unwrap();

        // Collection only → 2 items
        let results = db
            .get_history(
                1,
                50,
                None,
                false,
                false,
                Some(coll.id),
                None,
                None,
                None,
                None,
            )
            .unwrap();
        assert_eq!(results.len(), 2);

        // Collection + text filter → 1 item (only the text item in coll)
        let results = db
            .get_history(
                1,
                50,
                None,
                false,
                false,
                Some(coll.id),
                Some("text".to_string()),
                None,
                None,
                None,
            )
            .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].content, "text-in-coll");

        // Count matches
        let count = db
            .count_history_filtered(
                None,
                false,
                false,
                Some(coll.id),
                Some("text".to_string()),
                None,
                None,
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn filter_search_plus_type() {
        let (db, _tmp) = setup_db();
        db.insert_item(&text_item("hello world"), 100).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(10));
        db.insert_item(&typed_item("hello@example.com", "email"), 100)
            .unwrap();
        std::thread::sleep(std::time::Duration::from_millis(10));
        db.insert_item(&text_item("goodbye"), 100).unwrap();

        // Search "hello" → 2 results
        let results = db
            .get_history(
                1,
                50,
                Some("hello".to_string()),
                false,
                false,
                None,
                None,
                None,
                None,
                None,
            )
            .unwrap();
        assert_eq!(results.len(), 2);

        // Search "hello" + email filter → 1 result
        let results = db
            .get_history(
                1,
                50,
                Some("hello".to_string()),
                false,
                false,
                None,
                Some("email".to_string()),
                None,
                None,
                None,
            )
            .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].data_type, "email");

        let count = db
            .count_history_filtered(
                Some("hello".to_string()),
                false,
                false,
                None,
                Some("email".to_string()),
                None,
                None,
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn filter_collection_plus_search_plus_type() {
        let (db, _tmp) = setup_db();
        let coll = db.create_collection("combo".to_string()).unwrap();

        db.insert_item(&typed_item("https://example.com", "url"), 100)
            .unwrap();
        std::thread::sleep(std::time::Duration::from_millis(10));
        db.insert_item(&typed_item("https://other.com", "url"), 100)
            .unwrap();
        std::thread::sleep(std::time::Duration::from_millis(10));
        db.insert_item(&text_item("example text"), 100).unwrap();

        db.set_item_collection(1, Some(coll.id)).unwrap();
        db.set_item_collection(3, Some(coll.id)).unwrap();

        // collection + search "example" + url filter → 1 (only item 1)
        let results = db
            .get_history(
                1,
                50,
                Some("example".to_string()),
                false,
                false,
                Some(coll.id),
                Some("url".to_string()),
                None,
                None,
                None,
            )
            .unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].content.contains("example.com"));

        let count = db
            .count_history_filtered(
                Some("example".to_string()),
                false,
                false,
                Some(coll.id),
                Some("url".to_string()),
                None,
                None,
            )
            .unwrap();
        assert_eq!(count, 1);
    }
}
