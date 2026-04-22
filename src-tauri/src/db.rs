use crate::crypto::Crypto;
use crate::models::{ClipboardItem, Collection};
use crate::rules::{Rule, RuleAction, RuleCondition};
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
    fn now_string() -> String {
        Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
    }

    fn ensure_collection_schema(conn: &Connection) -> Result<()> {
        let mut has_sort_order = false;
        let mut has_updated_at = false;

        {
            let mut stmt = conn.prepare("PRAGMA table_info(collections)")?;
            let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;

            for row in rows {
                match row?.as_str() {
                    "sort_order" => has_sort_order = true,
                    "updated_at" => has_updated_at = true,
                    _ => {}
                }
            }
        }

        if !has_sort_order {
            conn.execute(
                "ALTER TABLE collections ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
                [],
            )?;

            let mut stmt =
                conn.prepare("SELECT id FROM collections ORDER BY created_at DESC, id DESC")?;
            let ids = stmt.query_map([], |row| row.get::<_, i64>(0))?;

            for (index, id) in ids.enumerate() {
                conn.execute(
                    "UPDATE collections SET sort_order = ? WHERE id = ?",
                    params![index as i64, id?],
                )?;
            }
        }

        if !has_updated_at {
            conn.execute(
                "ALTER TABLE collections ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''",
                [],
            )?;
        }

        conn.execute(
            "UPDATE collections SET updated_at = created_at WHERE updated_at = '' OR updated_at IS NULL",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_collections_sort_order ON collections (sort_order ASC, updated_at DESC)",
            [],
        )?;

        Ok(())
    }

    fn touch_collection_updated_at(conn: &Connection, collection_id: Option<i64>) -> Result<()> {
        if let Some(id) = collection_id {
            conn.execute(
                "UPDATE collections SET updated_at = ? WHERE id = ?",
                params![Self::now_string(), id],
            )?;
        }

        Ok(())
    }

    /// Create a new database with all tables.
    /// No migration needed - fresh database design.
    pub fn new<P: AsRef<Path>>(path: P, crypto: Arc<Crypto>) -> Result<Self> {
        let mut conn = Connection::open(path)?;

        // Create all tables in one transaction
        let tx = conn.transaction()?;

        // History table
        tx.execute(
            "CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                kind TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                is_sensitive BOOLEAN NOT NULL DEFAULT 0,
                is_pinned BOOLEAN NOT NULL DEFAULT 0,
                source_app TEXT,
                data_type TEXT NOT NULL DEFAULT 'text',
                collection_id INTEGER,
                note TEXT,
                html_content TEXT,
                is_snippet BOOLEAN NOT NULL DEFAULT 0,
                screenshot_id INTEGER
            )",
            [],
        )?;

        tx.execute(
            "CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history (timestamp DESC)",
            [],
        )?;
        tx.execute(
            "CREATE INDEX IF NOT EXISTS idx_history_pinned ON history (is_pinned DESC)",
            [],
        )?;
        tx.execute(
            "CREATE INDEX IF NOT EXISTS idx_history_content_kind ON history (content, kind)",
            [],
        )?;

        // Collections table
        tx.execute(
            "CREATE TABLE IF NOT EXISTS collections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                icon TEXT DEFAULT 'folder',
                color TEXT DEFAULT '',
                sort_order INTEGER NOT NULL DEFAULT 0
            )",
            [],
        )?;

        // Rules table
        tx.execute(
            "CREATE TABLE IF NOT EXISTS rules (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                enabled BOOLEAN NOT NULL DEFAULT 1,
                conditions TEXT NOT NULL,
                action_type TEXT NOT NULL,
                collection_id INTEGER
            )",
            [],
        )?;

        // Config table (key-value store)
        tx.execute(
            "CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
            [],
        )?;

        tx.commit()?;
        Self::ensure_collection_schema(&conn)?;

        // Add REGEXP function for search
        conn.create_scalar_function(
            "REGEXP",
            2,
            FunctionFlags::SQLITE_DETERMINISTIC,
            move |ctx| {
                let regex_s = ctx.get::<String>(0)?;
                let text = ctx.get::<Option<String>>(1)?.unwrap_or_default();
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

    // ==================== History Operations ====================

    fn build_history_filter(
        &self,
        query: &Option<String>,
        search_regex: bool,
        search_case_sensitive: bool,
        collection_scope: &Option<String>,
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
                    sql.push_str(" AND content REGEXP ?");
                } else if search_case_sensitive {
                    sql.push_str(" AND content LIKE ?");
                } else {
                    sql.push_str(" AND LOWER(content) LIKE LOWER(?)");
                }
                let pattern = if search_regex {
                    q.clone()
                } else {
                    format!("%{}%", q)
                };
                params.push(Box::new(pattern));
            }
        }

        match collection_scope.as_deref() {
            Some("all_collections") => {
                sql.push_str(" AND collection_id IS NOT NULL");
            }
            Some("collection_detail") => {
                if let Some(cid) = collection_id {
                    sql.push_str(" AND collection_id = ?");
                    params.push(Box::new(cid));
                } else {
                    sql.push_str(" AND 1 = 0");
                }
            }
            _ => {}
        }

        if let Some(filter) = active_filter {
            match filter.as_str() {
                "text" => sql.push_str(" AND data_type = 'text'"),
                "image" => sql.push_str(" AND kind = 'image'"),
                "file" => sql.push_str(" AND kind = 'file'"),
                "sensitive" => sql.push_str(" AND is_sensitive = 1"),
                "snippet" => sql.push_str(" AND is_snippet = 1"),
                "url" => sql.push_str(" AND data_type = 'url'"),
                "email" => sql.push_str(" AND data_type = 'email'"),
                "code" => sql.push_str(" AND data_type = 'code'"),
                "phone" => sql.push_str(" AND data_type = 'phone'"),
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
        collection_scope: Option<String>,
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
            &collection_scope,
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
            _ => " ORDER BY is_pinned DESC, timestamp DESC",
        };
        sql.push_str(order_clause);
        sql.push_str(" LIMIT ? OFFSET ?");
        params.push(Box::new(page_size));
        params.push(Box::new(offset));

        let mut stmt = conn.prepare(&sql)?;
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

        let effective_collection_id = if updated_count == 0 {
            item.collection_id
        } else {
            conn.query_row(
                "SELECT collection_id FROM history WHERE content = ? AND kind = ?",
                params![content_to_store, item.kind],
                |row| row.get::<_, Option<i64>>(0),
            )
            .optional()?
            .flatten()
        };
        Self::touch_collection_updated_at(&conn, effective_collection_id)?;

        // Prune if exceeding max_size
        let count: usize = conn.query_row("SELECT COUNT(*) FROM history", [], |row| row.get(0))?;
        if count > max_size {
            let delete_count = count - max_size;
            let mut stmt = conn.prepare(&format!(
                "SELECT id, content, kind, timestamp, is_sensitive, is_pinned, source_app, data_type, collection_id, note, html_content, is_snippet, screenshot_id FROM history WHERE is_pinned = 0 AND collection_id IS NULL AND is_snippet = 0 ORDER BY timestamp ASC LIMIT {}",
                delete_count
            ))?;

            let rows = stmt.query_map([], |row| {
                Ok(ClipboardItem {
                    id: Some(row.get::<_, i64>(0)?),
                    content: row.get::<_, String>(1)?,
                    kind: row.get::<_, String>(2)?,
                    timestamp: row.get::<_, String>(3)?,
                    is_sensitive: row.get::<_, bool>(4)?,
                    is_pinned: row.get::<_, bool>(5)?,
                    source_app: row.get::<_, Option<String>>(6)?,
                    data_type: row.get::<_, String>(7)?,
                    collection_id: row.get::<_, Option<i64>>(8)?,
                    note: row.get::<_, Option<String>>(9)?,
                    html_content: row.get::<_, Option<String>>(10)?,
                    is_snippet: row.get::<_, bool>(11)?,
                    screenshot_id: row.get::<_, Option<i64>>(12)?,
                })
            })?;

            let mut pruned_items = Vec::new();
            for row in rows {
                pruned_items.push(row?);
            }

            // Delete pruned items
            for pruned in &pruned_items {
                if let Some(id) = pruned.id {
                    conn.execute("DELETE FROM history WHERE id = ?", params![id])?;
                }
            }

            return Ok(pruned_items);
        }

        Ok(Vec::new())
    }

    pub fn delete_item(&self, id: i64) -> Result<Option<ClipboardItem>> {
        let conn = self.conn.lock().unwrap();

        let item = conn.query_row(
            "SELECT id, content, kind, timestamp, is_sensitive, is_pinned, source_app, data_type, collection_id, note, html_content, is_snippet, screenshot_id FROM history WHERE id = ?",
            params![id],
            |row| {
                Ok(ClipboardItem {
                    id: Some(row.get::<_, i64>(0)?),
                    content: row.get::<_, String>(1)?,
                    kind: row.get::<_, String>(2)?,
                    timestamp: row.get::<_, String>(3)?,
                    is_sensitive: row.get::<_, bool>(4)?,
                    is_pinned: row.get::<_, bool>(5)?,
                    source_app: row.get::<_, Option<String>>(6)?,
                    data_type: row.get::<_, String>(7)?,
                    collection_id: row.get::<_, Option<i64>>(8)?,
                    note: row.get::<_, Option<String>>(9)?,
                    html_content: row.get::<_, Option<String>>(10)?,
                    is_snippet: row.get::<_, bool>(11)?,
                    screenshot_id: row.get::<_, Option<i64>>(12)?,
                })
            },
        ).optional()?;

        if let Some(_) = &item {
            conn.execute("DELETE FROM history WHERE id = ?", params![id])?;
        }

        Ok(item)
    }

    pub fn toggle_sensitive(&self, id: i64) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let current: bool = conn.query_row(
            "SELECT is_sensitive FROM history WHERE id = ?",
            params![id],
            |row| row.get(0),
        )?;
        let new_state = !current;
        conn.execute(
            "UPDATE history SET is_sensitive = ? WHERE id = ?",
            params![new_state, id],
        )?;
        Ok(new_state)
    }

    pub fn toggle_pin(&self, id: i64) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let current: bool = conn.query_row(
            "SELECT is_pinned FROM history WHERE id = ?",
            params![id],
            |row| row.get(0),
        )?;
        let new_state = !current;
        conn.execute(
            "UPDATE history SET is_pinned = ? WHERE id = ?",
            params![new_state, id],
        )?;
        Ok(new_state)
    }

    pub fn toggle_snippet(&self, id: i64) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let current: bool = conn.query_row(
            "SELECT is_snippet FROM history WHERE id = ?",
            params![id],
            |row| row.get(0),
        )?;
        let new_state = !current;
        conn.execute(
            "UPDATE history SET is_snippet = ? WHERE id = ?",
            params![new_state, id],
        )?;
        Ok(new_state)
    }

    pub fn update_content(
        &self,
        id: i64,
        content: String,
        data_type: String,
        note: Option<String>,
        html_content: Option<String>,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE history SET content = ?, data_type = ?, note = ?, html_content = ? WHERE id = ?",
            params![content, data_type, note, html_content, id],
        )?;
        Ok(())
    }

    pub fn clear_history(
        &self,
        clear_pinned: bool,
        clear_collected: bool,
    ) -> Result<Vec<ClipboardItem>> {
        let conn = self.conn.lock().unwrap();

        // Build delete condition
        let where_clause = if clear_pinned && clear_collected {
            "1=1"
        } else if clear_pinned {
            "collection_id IS NULL"
        } else if clear_collected {
            "is_pinned = 0"
        } else {
            "is_pinned = 0 AND collection_id IS NULL"
        };

        // Get items to be deleted
        let mut stmt = conn.prepare(&format!(
            "SELECT id, content, kind, timestamp, is_sensitive, is_pinned, source_app, data_type, collection_id, note, html_content, is_snippet, screenshot_id FROM history WHERE {}",
            where_clause
        ))?;

        let rows = stmt.query_map([], |row| {
            Ok(ClipboardItem {
                id: Some(row.get::<_, i64>(0)?),
                content: row.get::<_, String>(1)?,
                kind: row.get::<_, String>(2)?,
                timestamp: row.get::<_, String>(3)?,
                is_sensitive: row.get::<_, bool>(4)?,
                is_pinned: row.get::<_, bool>(5)?,
                source_app: row.get::<_, Option<String>>(6)?,
                data_type: row.get::<_, String>(7)?,
                collection_id: row.get::<_, Option<i64>>(8)?,
                note: row.get::<_, Option<String>>(9)?,
                html_content: row.get::<_, Option<String>>(10)?,
                is_snippet: row.get::<_, bool>(11)?,
                screenshot_id: row.get::<_, Option<i64>>(12)?,
            })
        })?;

        let mut deleted_items = Vec::new();
        for row in rows {
            deleted_items.push(row?);
        }

        // Delete
        conn.execute(&format!("DELETE FROM history WHERE {}", where_clause), [])?;

        Ok(deleted_items)
    }

    pub fn get_item_content(&self, id: i64) -> Result<String> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT content, is_sensitive FROM history WHERE id = ?",
            params![id],
            |row| {
                let content: String = row.get(0)?;
                let is_sensitive: bool = row.get(1)?;
                if is_sensitive {
                    Ok(self.crypto.decrypt(&content).unwrap_or(content))
                } else {
                    Ok(content)
                }
            },
        )
    }

    pub fn get_item_by_id(&self, id: i64) -> Result<Option<ClipboardItem>> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT id, content, kind, timestamp, is_sensitive, is_pinned, source_app, data_type, collection_id, note, html_content, is_snippet, screenshot_id FROM history WHERE id = ?",
            params![id],
            |row| {
                let content: String = row.get(1)?;
                let is_sensitive: bool = row.get(4)?;
                let html_content: Option<String> = row.get(10)?;

                let final_content = if is_sensitive {
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
                    id: Some(row.get::<_, i64>(0)?),
                    content: final_content,
                    kind: row.get::<_, String>(2)?,
                    timestamp: row.get::<_, String>(3)?,
                    is_sensitive,
                    is_pinned: row.get::<_, bool>(5)?,
                    source_app: row.get::<_, Option<String>>(6)?,
                    data_type: row.get::<_, String>(7)?,
                    collection_id: row.get::<_, Option<i64>>(8)?,
                    note: row.get::<_, Option<String>>(9)?,
                    html_content: final_html,
                    is_snippet: row.get::<_, bool>(11)?,
                    screenshot_id: row.get::<_, Option<i64>>(12)?,
                })
            },
        ).optional()
    }

    pub fn count_history_filtered(
        &self,
        query: Option<String>,
        search_regex: bool,
        search_case_sensitive: bool,
        collection_scope: Option<String>,
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
            &collection_scope,
            collection_id,
            &active_filter,
            &source_app,
            &time_range,
        );

        let sql = format!("SELECT COUNT(*) FROM history{}", where_clause);
        let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

        conn.query_row(&sql, params_refs.as_slice(), |row| row.get(0))
    }

    pub fn update_timestamp(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let timestamp = Self::now_string();
        conn.execute(
            "UPDATE history SET timestamp = ? WHERE id = ?",
            params![timestamp, id],
        )?;
        Ok(())
    }

    // ==================== Collection Operations ====================

    pub fn create_collection(&self, name: String) -> Result<Collection> {
        let conn = self.conn.lock().unwrap();
        let created_at = Self::now_string();
        let sort_order: i64 = conn.query_row(
            "SELECT COALESCE(MIN(sort_order) - 1, 0) FROM collections",
            [],
            |row| row.get(0),
        )?;
        conn.execute(
            "INSERT INTO collections (name, created_at, updated_at, sort_order) VALUES (?, ?, ?, ?)",
            params![name, created_at, created_at, sort_order],
        )?;
        let id = conn.last_insert_rowid();
        Ok(Collection {
            id,
            name,
            created_at: created_at.clone(),
            updated_at: created_at,
            icon: "folder".to_string(),
            color: "".to_string(),
            sort_order,
            item_count: 0,
        })
    }

    pub fn get_collections(&self) -> Result<Vec<Collection>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT c.id, c.name, c.created_at, c.updated_at, c.icon, c.color, c.sort_order, COUNT(h.id) as item_count
             FROM collections c
             LEFT JOIN history h ON h.collection_id = c.id
             GROUP BY c.id, c.name, c.created_at, c.updated_at, c.icon, c.color, c.sort_order
             ORDER BY c.sort_order ASC, c.updated_at DESC, c.created_at DESC, c.id DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Collection {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
                icon: row
                    .get::<_, Option<String>>(4)?
                    .unwrap_or_else(|| "folder".to_string()),
                color: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
                sort_order: row.get(6)?,
                item_count: row.get(7)?,
            })
        })?;
        let mut collections = Vec::new();
        for row in rows {
            collections.push(row?);
        }
        Ok(collections)
    }

    pub fn update_collection(
        &self,
        id: i64,
        name: String,
        icon: Option<String>,
        color: Option<String>,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE collections SET name = ?, icon = ?, color = ?, updated_at = ? WHERE id = ?",
            params![name, icon, color, Self::now_string(), id],
        )?;
        Ok(())
    }

    pub fn delete_collection(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        // Unlink items from this collection
        conn.execute(
            "UPDATE history SET collection_id = NULL WHERE collection_id = ?",
            params![id],
        )?;
        conn.execute("DELETE FROM collections WHERE id = ?", params![id])?;
        Ok(())
    }

    pub fn set_item_collection(&self, item_id: i64, collection_id: Option<i64>) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let previous_collection_id = conn
            .query_row(
                "SELECT collection_id FROM history WHERE id = ?",
                params![item_id],
                |row| row.get::<_, Option<i64>>(0),
            )
            .optional()?
            .flatten();

        conn.execute(
            "UPDATE history SET collection_id = ? WHERE id = ?",
            params![collection_id, item_id],
        )?;
        Self::touch_collection_updated_at(&conn, previous_collection_id)?;
        Self::touch_collection_updated_at(&conn, collection_id)?;
        Ok(())
    }

    // ==================== Rules Operations ====================

    pub fn get_rules(&self) -> Result<Vec<Rule>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, enabled, conditions, action_type, collection_id FROM rules ORDER BY name",
        )?;
        let rows = stmt.query_map([], |row| {
            let conditions_json: String = row.get(3)?;
            let conditions: Vec<RuleCondition> =
                serde_json::from_str(&conditions_json).unwrap_or_default();
            Ok(Rule {
                id: row.get(0)?,
                name: row.get(1)?,
                enabled: row.get::<_, i32>(2)? != 0,
                conditions,
                action: RuleAction {
                    action_type: row.get(4)?,
                    collection_id: row.get(5)?,
                },
            })
        })?;
        let mut rules = Vec::new();
        for row in rows {
            rules.push(row?);
        }
        Ok(rules)
    }

    pub fn add_rule(&self, rule: &Rule) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let conditions_json = serde_json::to_string(&rule.conditions).unwrap_or_default();
        conn.execute(
            "INSERT INTO rules (id, name, enabled, conditions, action_type, collection_id) VALUES (?, ?, ?, ?, ?, ?)",
            params![
                rule.id,
                rule.name,
                rule.enabled as i32,
                conditions_json,
                rule.action.action_type,
                rule.action.collection_id
            ],
        )?;
        Ok(())
    }

    pub fn update_rule(&self, rule: &Rule) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let conditions_json = serde_json::to_string(&rule.conditions).unwrap_or_default();
        conn.execute(
            "UPDATE rules SET name = ?, enabled = ?, conditions = ?, action_type = ?, collection_id = ? WHERE id = ?",
            params![
                rule.name,
                rule.enabled as i32,
                conditions_json,
                rule.action.action_type,
                rule.action.collection_id,
                rule.id
            ],
        )?;
        Ok(())
    }

    pub fn delete_rule(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM rules WHERE id = ?", params![id])?;
        Ok(())
    }

    // ==================== Config Operations ====================

    pub fn get_config_value(&self, key: &str) -> Result<Option<String>> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT value FROM config WHERE key = ?",
            params![key],
            |row| row.get(0),
        )
        .optional()
    }

    pub fn set_config_value(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn get_all_config(&self) -> Result<std::collections::HashMap<String, String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT key, value FROM config")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut config = std::collections::HashMap::new();
        for row in rows {
            let (key, value) = row?;
            config.insert(key, value);
        }
        Ok(config)
    }
}
