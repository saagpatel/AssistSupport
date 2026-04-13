//! Runtime metadata persistence for models, startup metrics, vector consent, and decision trees.

use super::*;

impl Database {

    // -- Model state helpers --

    /// Record that a model was loaded (for auto-load on next startup)
    pub fn save_model_state(
        &self,
        model_type: &str,
        model_path: &str,
        model_id: Option<&str>,
        load_time_ms: Option<i64>,
    ) -> Result<(), DbError> {
        self.conn.execute(
            "INSERT OR REPLACE INTO model_state (model_type, model_path, model_id, loaded_at, load_time_ms)
             VALUES (?1, ?2, ?3, datetime('now'), ?4)",
            params![model_type, model_path, model_id, load_time_ms],
        )?;
        Ok(())
    }


    /// Clear model state (when model is unloaded)
    pub fn clear_model_state(&self, model_type: &str) -> Result<(), DbError> {
        self.conn.execute(
            "DELETE FROM model_state WHERE model_type = ?1",
            params![model_type],
        )?;
        Ok(())
    }


    /// Get last loaded model info for a given type
    pub fn get_model_state(
        &self,
        model_type: &str,
    ) -> Result<Option<(String, Option<String>)>, DbError> {
        let result = self.conn.query_row(
            "SELECT model_path, model_id FROM model_state WHERE model_type = ?1",
            params![model_type],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
        );
        match result {
            Ok(val) => Ok(Some(val)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(DbError::Sqlite(e)),
        }
    }


    // -- Startup metrics helpers --

    /// Record a startup metric
    pub fn record_startup_metric(
        &self,
        started_at: &str,
        ui_ready_at: Option<&str>,
        total_ms: Option<i64>,
        init_app_ms: Option<i64>,
        models_cached: bool,
    ) -> Result<(), DbError> {
        self.conn.execute(
            "INSERT INTO startup_metrics (started_at, ui_ready_at, total_ms, init_app_ms, models_cached)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![started_at, ui_ready_at, total_ms, init_app_ms, models_cached as i32],
        )?;
        // Keep only last 50 metrics
        self.conn.execute(
            "DELETE FROM startup_metrics WHERE id NOT IN (SELECT id FROM startup_metrics ORDER BY id DESC LIMIT 50)",
            [],
        )?;
        Ok(())
    }


    /// Get last startup metric
    pub fn get_last_startup_metric(&self) -> Result<Option<(i64, i64, bool)>, DbError> {
        let result = self.conn.query_row(
            "SELECT total_ms, init_app_ms, models_cached FROM startup_metrics ORDER BY id DESC LIMIT 1",
            [],
            |row| {
                Ok((
                    row.get::<_, i64>(0).unwrap_or(0),
                    row.get::<_, i64>(1).unwrap_or(0),
                    row.get::<_, i32>(2).unwrap_or(0) != 0,
                ))
            },
        );
        match result {
            Ok(val) => Ok(Some(val)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(DbError::Sqlite(e)),
        }
    }


    /// Get vector consent status
    pub fn get_vector_consent(&self) -> Result<VectorConsent, DbError> {
        let row = self.conn.query_row(
            "SELECT enabled, consented_at, encryption_supported FROM vector_consent WHERE id = 1",
            [],
            |row| {
                Ok(VectorConsent {
                    enabled: row.get::<_, i32>(0)? != 0,
                    consented_at: row.get(1)?,
                    encryption_supported: row.get::<_, Option<i32>>(2)?.map(|v| v != 0),
                })
            },
        )?;
        Ok(row)
    }


    /// Set vector consent
    pub fn set_vector_consent(
        &self,
        enabled: bool,
        encryption_supported: bool,
    ) -> Result<(), DbError> {
        let now = chrono::Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE vector_consent SET enabled = ?, consented_at = ?, encryption_supported = ? WHERE id = 1",
            params![enabled as i32, now, encryption_supported as i32],
        )?;
        Ok(())
    }


    /// List all decision trees
    pub fn list_decision_trees(&self) -> Result<Vec<DecisionTree>, DbError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, category, tree_json, source, created_at, updated_at
             FROM decision_trees ORDER BY name",
        )?;

        let trees = stmt
            .query_map([], |row| {
                Ok(DecisionTree {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    category: row.get(2)?,
                    tree_json: row.get(3)?,
                    source: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(trees)
    }


    /// Get a single decision tree by ID
    pub fn get_decision_tree(&self, tree_id: &str) -> Result<DecisionTree, DbError> {
        let tree = self.conn.query_row(
            "SELECT id, name, category, tree_json, source, created_at, updated_at
             FROM decision_trees WHERE id = ?",
            [tree_id],
            |row| {
                Ok(DecisionTree {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    category: row.get(2)?,
                    tree_json: row.get(3)?,
                    source: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            },
        )?;
        Ok(tree)
    }


    /// Save or update a decision tree
    pub fn save_decision_tree(&self, tree: &DecisionTree) -> Result<String, DbError> {
        self.conn.execute(
            "INSERT OR REPLACE INTO decision_trees
             (id, name, category, tree_json, source, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![
                &tree.id,
                &tree.name,
                &tree.category,
                &tree.tree_json,
                &tree.source,
                &tree.created_at,
                &tree.updated_at,
            ],
        )?;
        Ok(tree.id.clone())
    }


    /// Seed built-in decision trees (called on first run)
    pub fn seed_builtin_trees(&self) -> Result<(), DbError> {
        // Check if already seeded
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM decision_trees WHERE source = 'builtin'",
            [],
            |row| row.get(0),
        )?;

        if count > 0 {
            return Ok(());
        }

        let now = chrono::Utc::now().to_rfc3339();

        // Insert 4 core built-in trees
        for tree in BUILTIN_TREES.iter() {
            self.conn.execute(
                "INSERT INTO decision_trees (id, name, category, tree_json, source, created_at, updated_at)
                 VALUES (?, ?, ?, ?, 'builtin', ?, ?)",
                params![tree.0, tree.1, tree.2, tree.3, &now, &now],
            )?;
        }

        Ok(())
    }

}
