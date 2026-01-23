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

    pub fn get_history(
        &self,
        page: usize,
        page_size: usize,
        query: Option<String>,
        search_regex: bool,
        search_case_sensitive: bool,
        collection_id: Option<i64>,
    ) -> Result<Vec<ClipboardItem>> {
        let conn = self.conn.lock().unwrap();
        let offset = (page - 1) * page_size;

        let mut sql = String::from("SELECT id, content, kind, timestamp, is_sensitive, is_pinned, source_app, data_type, collection_id, note, html_content FROM history WHERE 1=1");
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(q) = query {
            if !q.is_empty() {
                if search_regex {
                    sql.push_str(" AND (content REGEXP ? OR note REGEXP ?)");
                    // If case insensitive, we prepend (?i) flag to the regex string.
                    // This flag works in Rust regex crate which we used in create_scalar_function.
                    let final_query = if search_case_sensitive {
                        q.clone()
                    } else {
                        format!("(?i){}", q)
                    };
                    params.push(Box::new(final_query.clone()));
                    params.push(Box::new(final_query));
                } else {
                    if search_case_sensitive {
                        // SQLite LIKE is case-insensitive by default for ASCII characters.
                        // To make it case-sensitive, we can use GLOB which is case-sensitive (and uses * instead of %),
                        // OR we can use the `PRAGMA case_sensitive_like = ON` command (but that is connection wide),
                        // OR we can simply use the binary comparison for exact match or INSTR for substrings,
                        // BUT for pattern matching usually `GLOB` is the way.
                        // However, GLOB uses * and ?, not %. So we need to reformat the pattern or just use INSTR > 0 for simpler specific contains check.
                        // Since `q` here is a substring (like %q%), INSTR(content, q) > 0 does the job and is case-sensitive by default (if not explicitly COLLATE NOCASE).
                        // Wait, sqlite INSTR IS case-sensitive by default? No, it depends on collation?
                        // Actually, GLOB is the standard way for case-sensitive pattern matching in SQLite.
                        // wildcard: * matches any sequence, ? matches any single char.

                        sql.push_str(" AND (content GLOB ? OR note GLOB ?)");
                        let pattern = format!("*{}*", q); // Using * for GLOB
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

        sql.push_str(" ORDER BY is_pinned DESC, timestamp DESC LIMIT ? OFFSET ?");
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
                "INSERT INTO history (content, kind, timestamp, is_sensitive, is_pinned, source_app, data_type, collection_id, note, html_content) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
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
                    html_to_store
                ],
            )?;
        }

        // Prune if exceeding max_size
        let count: usize = conn.query_row("SELECT COUNT(*) FROM history", [], |row| row.get(0))?;
        if count > max_size {
            let delete_count = count - max_size;

            // Fetch items to be deleted first (oldest timestamp, NOT pinned)
            let mut stmt = conn.prepare(&format!(
                "SELECT content, kind, timestamp, is_sensitive, is_pinned, source_app, data_type, collection_id, note, html_content FROM history WHERE is_pinned = 0 ORDER BY timestamp ASC LIMIT {}",
                delete_count
            ))?;

            let rows = stmt.query_map([], |row| {
                let content: String = row.get(0)?;
                let kind: String = row.get(1)?;
                let timestamp: String = row.get(2)?;
                let is_sensitive: bool = row.get(3)?;
                let is_pinned: bool = row.get(4)?;
                let source_app: Option<String> = row.get(5)?;
                let data_type: String = row.get(6)?;
                let collection_id: Option<i64> = row.get(7)?;
                let note: Option<String> = row.get(8)?;
                let html_content: Option<String> = row.get(9)?;

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
                    id: None,
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
                })
            })?;

            for row in rows {
                if let Ok(item) = row {
                    pruned_items.push(item);
                }
            }

            // Delete them
            conn.execute(
                &format!(
                    "DELETE FROM history WHERE id IN (SELECT id FROM history WHERE is_pinned = 0 AND collection_id IS NULL ORDER BY timestamp ASC LIMIT {})",
                    delete_count
                ),
                [],
            )?;
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
                "SELECT id, content, kind, timestamp, is_sensitive, is_pinned, source_app, data_type, collection_id, note, html_content FROM history ORDER BY is_pinned DESC, timestamp DESC LIMIT 1 OFFSET ?1",
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
        // 如果都为 true，则不加条件，全部清除
        let where_clause = if conditions.is_empty() {
            String::from("")
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        // 查询所有将要被删除的项
        let select_sql = format!(
            "SELECT id, content, kind, timestamp, is_sensitive, is_pinned, source_app, data_type, collection_id, note, html_content FROM history {}",
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

    pub fn count_history(&self) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        let count: usize = conn.query_row("SELECT COUNT(*) FROM history", [], |row| row.get(0))?;
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
