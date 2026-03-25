//! Database bootstrap, integrity, and settings helpers.

use super::*;

impl Database {
    /// Open or create encrypted database
    pub fn open(path: &Path, master_key: &MasterKey) -> Result<Self, DbError> {
        let conn = Connection::open(path)?;

        // Set SQLCipher key (hex-encoded)
        // Using default SQLCipher 4 settings for compatibility
        let mut hex_key = master_key.to_hex();
        let mut key_pragma = format!("PRAGMA key = \"x'{}'\"", hex_key);
        hex_key.zeroize();
        let pragma_result = conn.execute_batch(&key_pragma);
        key_pragma.zeroize();
        pragma_result?;

        // Verify the key works by reading from the database
        conn.execute_batch("SELECT count(*) FROM sqlite_master;")?;

        // Enable foreign key enforcement (required for ON DELETE CASCADE)
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;

        // Set busy timeout (5 seconds) to avoid SQLITE_BUSY errors
        conn.execute_batch("PRAGMA busy_timeout = 5000;")?;

        // Use WAL journal mode for better concurrent read performance.
        // For defense in depth, do not silently ignore failures; log the effective mode.
        match conn.query_row("PRAGMA journal_mode = WAL;", [], |row| {
            row.get::<_, String>(0)
        }) {
            Ok(mode) => tracing::info!("SQLite journal_mode set to {}", mode),
            Err(e) => tracing::warn!("Failed to set journal_mode=WAL: {}", e),
        }

        // Set secure delete to overwrite deleted content
        conn.execute_batch("PRAGMA secure_delete = ON;")?;

        let db = Self {
            conn,
            path: path.to_path_buf(),
        };

        // Set secure file permissions on database file
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
        }

        // Verify FTS5 is available
        db.verify_fts5()?;

        Ok(db)
    }


    /// Initialize database schema
    pub fn initialize(&self) -> Result<(), DbError> {
        // Run integrity check
        self.check_integrity()?;

        // Get current schema version
        let version = self.get_schema_version()?;

        // Run migrations
        if version < CURRENT_SCHEMA_VERSION {
            self.run_migrations(version)?;
        }

        Ok(())
    }


    /// Verify FTS5 extension is available (release gate)
    pub fn verify_fts5(&self) -> Result<bool, DbError> {
        // Check if FTS5 is compiled in
        let result: SqliteResult<i32> = self.conn.query_row(
            "SELECT 1 WHERE EXISTS (SELECT 1 FROM pragma_compile_options WHERE compile_options = 'ENABLE_FTS5')",
            [],
            |row| row.get(0),
        );

        match result {
            Ok(_) => Ok(true),
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                // Try to create a test FTS5 table as fallback verification
                match self.conn.execute(
                    "CREATE VIRTUAL TABLE IF NOT EXISTS _fts5_test USING fts5(content)",
                    [],
                ) {
                    Ok(_) => {
                        self.conn.execute("DROP TABLE IF EXISTS _fts5_test", [])?;
                        Ok(true)
                    }
                    Err(_) => Err(DbError::Fts5NotAvailable),
                }
            }
            Err(e) => Err(DbError::Sqlite(e)),
        }
    }


    /// Check database integrity
    pub fn check_integrity(&self) -> Result<(), DbError> {
        let result: String = self
            .conn
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))?;

        if result != "ok" {
            return Err(DbError::Integrity(result));
        }

        let mut stmt = self
            .conn
            .prepare("PRAGMA foreign_key_check")
            .map_err(DbError::Sqlite)?;
        let mut rows = stmt.query([])?;
        let mut violations = Vec::new();
        while let Some(row) = rows.next()? {
            let table: String = row.get(0)?;
            let row_id: i64 = row.get(1)?;
            let parent: String = row.get(2)?;
            let fk_index: i64 = row.get(3)?;
            violations.push(format!(
                "table={} rowid={} parent={} fk_index={}",
                table, row_id, parent, fk_index
            ));
            if violations.len() >= 5 {
                break;
            }
        }

        if !violations.is_empty() {
            return Err(DbError::Integrity(format!(
                "foreign key violations detected: {}",
                violations.join("; ")
            )));
        }

        Ok(())
    }


    /// Get current schema version
    pub(crate) fn get_schema_version(&self) -> Result<i32, DbError> {
        // Create settings table if not exists
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
            [],
        )?;

        let version: SqliteResult<String> = self.conn.query_row(
            "SELECT value FROM settings WHERE key = 'schema_version'",
            [],
            |row| row.get(0),
        );

        match version {
            Ok(v) => v
                .parse()
                .map_err(|_| DbError::Migration("Invalid schema version".into())),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(0),
            Err(e) => Err(DbError::Sqlite(e)),
        }
    }


    /// Set schema version
    pub(crate) fn set_schema_version(&self, version: i32) -> Result<(), DbError> {
        self.conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', ?)",
            params![version.to_string()],
        )?;
        Ok(())
    }


    pub(crate) fn get_setting(&self, key: &str) -> Result<Option<String>, DbError> {
        let value: SqliteResult<String> = self
            .conn
            .query_row("SELECT value FROM settings WHERE key = ?", [key], |row| row.get(0));

        match value {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(DbError::Sqlite(e)),
        }
    }


    pub(crate) fn set_setting(&self, key: &str, value: &str) -> Result<(), DbError> {
        self.conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            params![key, value],
        )?;
        Ok(())
    }


    /// Get the current vector store version tracked in SQLite settings.
    pub fn get_vector_store_version(&self) -> Result<i32, DbError> {
        self.get_setting(VECTOR_STORE_VERSION_KEY)?
            .map(|value| {
                value
                    .parse()
                    .map_err(|_| DbError::Migration("Invalid vector store version".into()))
            })
            .transpose()
            .map(|value| value.unwrap_or(0))
    }


    /// Persist the vector store version tracked in SQLite settings.
    pub fn set_vector_store_version(&self, version: i32) -> Result<(), DbError> {
        self.set_setting(VECTOR_STORE_VERSION_KEY, &version.to_string())
    }


    /// Create backup of database
    /// Note: For SQLCipher encrypted databases, we use file copy instead of SQLite backup API
    pub fn backup(&self) -> Result<PathBuf, DbError> {
        let backup_path = self.path.with_extension("db.bak");

        // For SQLCipher, the standard backup API doesn't work with encrypted databases
        // We'll use a file copy approach instead (database must be checkpointed first)
        self.conn
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;

        // Copy the database file
        std::fs::copy(&self.path, &backup_path)?;

        // Set secure file permissions on backup file
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&backup_path, std::fs::Permissions::from_mode(0o600));
        }

        Ok(backup_path)
    }


    /// Get inner connection reference
    pub fn conn(&self) -> &Connection {
        &self.conn
    }


    /// Execute a simple query (for testing)
    pub fn execute(&self, sql: &str, params: &[&dyn rusqlite::ToSql]) -> Result<usize, DbError> {
        Ok(self.conn.execute(sql, params)?)
    }

}
