//! Draft, template, and saved-response persistence.

use super::*;

impl Database {

    /// Ensure response_templates table exists (called during init)
    pub fn ensure_templates_table(&self) -> Result<(), DbError> {
        self.conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS response_templates (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            "#,
        )?;
        Ok(())
    }


    // ============================================================================
    // Draft Methods
    // ============================================================================

    /// List recent drafts
    pub fn list_drafts(&self, limit: usize) -> Result<Vec<SavedDraft>, DbError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, input_text, summary_text, diagnosis_json, response_text,
                    ticket_id, kb_sources_json, created_at, updated_at, is_autosave, model_name,
                    case_intake_json, status, handoff_summary, finalized_at, finalized_by
             FROM drafts
             ORDER BY updated_at DESC
             LIMIT ?",
        )?;

        let drafts = stmt
            .query_map([limit as i64], |row| {
                Ok(SavedDraft {
                    id: row.get(0)?,
                    input_text: row.get(1)?,
                    summary_text: row.get(2)?,
                    diagnosis_json: row.get(3)?,
                    response_text: row.get(4)?,
                    ticket_id: row.get(5)?,
                    kb_sources_json: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                    is_autosave: row.get::<_, i32>(9)? != 0,
                    model_name: row.get(10)?,
                    case_intake_json: row.get(11)?,
                    status: row
                        .get::<_, Option<String>>(12)?
                        .and_then(|s| s.parse().ok())
                        .unwrap_or_default(),
                    handoff_summary: row.get(13)?,
                    finalized_at: row.get(14)?,
                    finalized_by: row.get(15)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(drafts)
    }


    /// Search drafts by text content
    pub fn search_drafts(&self, query: &str, limit: usize) -> Result<Vec<SavedDraft>, DbError> {
        let pattern = format!("%{}%", query);
        let mut stmt = self.conn.prepare(
            "SELECT id, input_text, summary_text, diagnosis_json, response_text,
                    ticket_id, kb_sources_json, created_at, updated_at, is_autosave, model_name,
                    case_intake_json, status, handoff_summary, finalized_at, finalized_by
             FROM drafts
             WHERE is_autosave = 0
               AND (input_text LIKE ?1 OR response_text LIKE ?1 OR ticket_id LIKE ?1)
             ORDER BY updated_at DESC
             LIMIT ?2",
        )?;

        let drafts = stmt
            .query_map(params![pattern, limit as i64], |row| {
                Ok(SavedDraft {
                    id: row.get(0)?,
                    input_text: row.get(1)?,
                    summary_text: row.get(2)?,
                    diagnosis_json: row.get(3)?,
                    response_text: row.get(4)?,
                    ticket_id: row.get(5)?,
                    kb_sources_json: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                    is_autosave: row.get::<_, i32>(9)? != 0,
                    model_name: row.get(10)?,
                    case_intake_json: row.get(11)?,
                    status: row
                        .get::<_, Option<String>>(12)?
                        .and_then(|s| s.parse().ok())
                        .unwrap_or_default(),
                    handoff_summary: row.get(13)?,
                    finalized_at: row.get(14)?,
                    finalized_by: row.get(15)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(drafts)
    }


    /// Get a single draft by ID
    pub fn get_draft(&self, draft_id: &str) -> Result<SavedDraft, DbError> {
        let draft = self.conn.query_row(
            "SELECT id, input_text, summary_text, diagnosis_json, response_text,
                    ticket_id, kb_sources_json, created_at, updated_at, is_autosave, model_name,
                    case_intake_json, status, handoff_summary, finalized_at, finalized_by
             FROM drafts WHERE id = ?",
            [draft_id],
            |row| {
                Ok(SavedDraft {
                    id: row.get(0)?,
                    input_text: row.get(1)?,
                    summary_text: row.get(2)?,
                    diagnosis_json: row.get(3)?,
                    response_text: row.get(4)?,
                    ticket_id: row.get(5)?,
                    kb_sources_json: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                    is_autosave: row.get::<_, i32>(9)? != 0,
                    model_name: row.get(10)?,
                    case_intake_json: row.get(11)?,
                    status: row
                        .get::<_, Option<String>>(12)?
                        .and_then(|s| s.parse().ok())
                        .unwrap_or_default(),
                    handoff_summary: row.get(13)?,
                    finalized_at: row.get(14)?,
                    finalized_by: row.get(15)?,
                })
            },
        )?;
        Ok(draft)
    }


    /// Save a draft (insert or update)
    pub fn save_draft(&self, draft: &SavedDraft) -> Result<String, DbError> {
        self.conn.execute(
            "INSERT OR REPLACE INTO drafts
             (id, input_text, summary_text, diagnosis_json, response_text,
              ticket_id, kb_sources_json, created_at, updated_at, is_autosave, model_name,
              case_intake_json, status, handoff_summary, finalized_at, finalized_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                &draft.id,
                &draft.input_text,
                &draft.summary_text,
                &draft.diagnosis_json,
                &draft.response_text,
                &draft.ticket_id,
                &draft.kb_sources_json,
                &draft.created_at,
                &draft.updated_at,
                draft.is_autosave as i32,
                &draft.model_name,
                &draft.case_intake_json,
                draft.status.to_string(),
                &draft.handoff_summary,
                &draft.finalized_at,
                &draft.finalized_by,
            ],
        )?;
        Ok(draft.id.clone())
    }


    /// Delete a draft
    pub fn delete_draft(&self, draft_id: &str) -> Result<(), DbError> {
        self.conn
            .execute("DELETE FROM drafts WHERE id = ?", [draft_id])?;
        Ok(())
    }


    /// Cleanup old autosaves, keeping only the most recent ones
    pub fn cleanup_autosaves(&self, keep_count: usize) -> Result<usize, DbError> {
        // Delete old autosaves, keeping only the most recent `keep_count`
        let deleted = self.conn.execute(
            "DELETE FROM drafts WHERE is_autosave = 1 AND id NOT IN (
                SELECT id FROM drafts WHERE is_autosave = 1
                ORDER BY created_at DESC LIMIT ?
            )",
            [keep_count],
        )?;
        Ok(deleted)
    }


    /// List autosave drafts (most recent first)
    pub fn list_autosaves(&self, limit: usize) -> Result<Vec<SavedDraft>, DbError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, input_text, summary_text, diagnosis_json, response_text,
                    ticket_id, kb_sources_json, created_at, updated_at, is_autosave, model_name,
                    case_intake_json, status, handoff_summary, finalized_at, finalized_by
             FROM drafts
             WHERE is_autosave = 1
             ORDER BY created_at DESC
             LIMIT ?",
        )?;

        let drafts = stmt
            .query_map([limit], |row| {
                Ok(SavedDraft {
                    id: row.get(0)?,
                    input_text: row.get(1)?,
                    summary_text: row.get(2)?,
                    diagnosis_json: row.get(3)?,
                    response_text: row.get(4)?,
                    ticket_id: row.get(5)?,
                    kb_sources_json: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                    is_autosave: row.get::<_, i32>(9)? != 0,
                    model_name: row.get(10)?,
                    case_intake_json: row.get(11)?,
                    status: row
                        .get::<_, Option<String>>(12)?
                        .and_then(|s| s.parse().ok())
                        .unwrap_or_default(),
                    handoff_summary: row.get(13)?,
                    finalized_at: row.get(14)?,
                    finalized_by: row.get(15)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(drafts)
    }


    /// Get draft versions by input hash (autosaves with matching input_text hash)
    /// The hash is computed as SHA256(input_text)[0:16]
    pub fn get_draft_versions(&self, input_hash: &str) -> Result<Vec<SavedDraft>, DbError> {
        use sha2::{Digest, Sha256};

        // Get all autosaves and filter by input hash
        let all_autosaves = self.list_autosaves(100)?; // Get more to search through

        let matching: Vec<SavedDraft> = all_autosaves
            .into_iter()
            .filter(|draft| {
                let mut hasher = Sha256::new();
                hasher.update(draft.input_text.as_bytes());
                let hash = hex::encode(hasher.finalize());
                hash[..16] == *input_hash
            })
            .collect();

        Ok(matching)
    }


    // ============================================================================
    // Draft Versioning Methods (Phase 17)
    // ============================================================================

    /// Create a draft version snapshot
    pub fn create_draft_version(
        &self,
        draft_id: &str,
        change_reason: Option<&str>,
    ) -> Result<String, DbError> {
        // Get current draft state
        let draft = self.get_draft(draft_id)?;

        // Get next version number
        let version_number: i32 = self.conn.query_row(
            "SELECT COALESCE(MAX(version_number), 0) + 1 FROM draft_versions WHERE draft_id = ?",
            [draft_id],
            |row| row.get(0),
        )?;

        let version_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        self.conn.execute(
            "INSERT INTO draft_versions
             (id, draft_id, version_number, input_text, summary_text, response_text,
              case_intake_json, kb_sources_json, created_at, change_reason)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                &version_id,
                draft_id,
                version_number,
                &draft.input_text,
                &draft.summary_text,
                &draft.response_text,
                &draft.case_intake_json,
                &draft.kb_sources_json,
                &now,
                change_reason,
            ],
        )?;

        Ok(version_id)
    }


    /// List draft versions
    pub fn list_draft_versions(&self, draft_id: &str) -> Result<Vec<DraftVersion>, DbError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, draft_id, version_number, input_text, summary_text, response_text,
                    case_intake_json, kb_sources_json, created_at, change_reason
             FROM draft_versions
             WHERE draft_id = ?
             ORDER BY version_number DESC",
        )?;

        let versions = stmt
            .query_map([draft_id], |row| {
                Ok(DraftVersion {
                    id: row.get(0)?,
                    draft_id: row.get(1)?,
                    version_number: row.get(2)?,
                    input_text: row.get(3)?,
                    summary_text: row.get(4)?,
                    response_text: row.get(5)?,
                    case_intake_json: row.get(6)?,
                    kb_sources_json: row.get(7)?,
                    created_at: row.get(8)?,
                    change_reason: row.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(versions)
    }


    /// Finalize a draft (lock it and mark as read-only)
    pub fn finalize_draft(
        &self,
        draft_id: &str,
        finalized_by: Option<&str>,
    ) -> Result<(), DbError> {
        // Create a version snapshot before finalizing
        self.create_draft_version(draft_id, Some("Pre-finalization snapshot"))?;

        let now = chrono::Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE drafts SET status = 'finalized', finalized_at = ?, finalized_by = ?, updated_at = ?
             WHERE id = ?",
            params![&now, finalized_by, &now, draft_id],
        )?;
        Ok(())
    }


    /// Archive a draft
    pub fn archive_draft(&self, draft_id: &str) -> Result<(), DbError> {
        let now = chrono::Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE drafts SET status = 'archived', updated_at = ? WHERE id = ?",
            params![&now, draft_id],
        )?;
        Ok(())
    }


    /// Update draft handoff summary
    pub fn update_draft_handoff(
        &self,
        draft_id: &str,
        handoff_summary: &str,
    ) -> Result<(), DbError> {
        let now = chrono::Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE drafts SET handoff_summary = ?, updated_at = ? WHERE id = ?",
            params![handoff_summary, &now, draft_id],
        )?;
        Ok(())
    }


    // ============================================================================
    // Playbook Methods (Phase 17)
    // ============================================================================

    /// List all active playbooks
    pub fn list_playbooks(&self, category: Option<&str>) -> Result<Vec<Playbook>, DbError> {
        let query = match category {
            Some(_) => "SELECT id, name, description, category, decision_tree_id, steps_json,
                               template_id, shortcuts_json, is_active, usage_count, created_at, updated_at
                        FROM playbooks WHERE is_active = 1 AND category = ? ORDER BY usage_count DESC",
            None => "SELECT id, name, description, category, decision_tree_id, steps_json,
                            template_id, shortcuts_json, is_active, usage_count, created_at, updated_at
                     FROM playbooks WHERE is_active = 1 ORDER BY usage_count DESC",
        };

        let mut stmt = self.conn.prepare(query)?;
        let playbooks = if let Some(cat) = category {
            stmt.query_map([cat], Self::row_to_playbook)?
        } else {
            stmt.query_map([], Self::row_to_playbook)?
        }
        .collect::<Result<Vec<_>, _>>()?;

        Ok(playbooks)
    }


    fn row_to_playbook(row: &rusqlite::Row) -> Result<Playbook, rusqlite::Error> {
        Ok(Playbook {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            category: row.get(3)?,
            decision_tree_id: row.get(4)?,
            steps_json: row.get(5)?,
            template_id: row.get(6)?,
            shortcuts_json: row.get(7)?,
            is_active: row.get::<_, i32>(8)? != 0,
            usage_count: row.get(9)?,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
        })
    }


    /// Get a playbook by ID
    pub fn get_playbook(&self, playbook_id: &str) -> Result<Playbook, DbError> {
        let playbook = self.conn.query_row(
            "SELECT id, name, description, category, decision_tree_id, steps_json,
                    template_id, shortcuts_json, is_active, usage_count, created_at, updated_at
             FROM playbooks WHERE id = ?",
            [playbook_id],
            Self::row_to_playbook,
        )?;
        Ok(playbook)
    }


    /// Save a playbook (insert or update)
    pub fn save_playbook(&self, playbook: &Playbook) -> Result<String, DbError> {
        self.conn.execute(
            "INSERT OR REPLACE INTO playbooks
             (id, name, description, category, decision_tree_id, steps_json,
              template_id, shortcuts_json, is_active, usage_count, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                &playbook.id,
                &playbook.name,
                &playbook.description,
                &playbook.category,
                &playbook.decision_tree_id,
                &playbook.steps_json,
                &playbook.template_id,
                &playbook.shortcuts_json,
                playbook.is_active as i32,
                playbook.usage_count,
                &playbook.created_at,
                &playbook.updated_at,
            ],
        )?;
        Ok(playbook.id.clone())
    }


    /// Increment playbook usage count
    pub fn increment_playbook_usage(&self, playbook_id: &str) -> Result<(), DbError> {
        self.conn.execute(
            "UPDATE playbooks SET usage_count = usage_count + 1 WHERE id = ?",
            [playbook_id],
        )?;
        Ok(())
    }


    /// Delete a playbook
    pub fn delete_playbook(&self, playbook_id: &str) -> Result<(), DbError> {
        self.conn
            .execute("DELETE FROM playbooks WHERE id = ?", [playbook_id])?;
        Ok(())
    }


    // ============================================================================
    // Action Shortcut Methods (Phase 17)
    // ============================================================================

    /// List all active action shortcuts
    pub fn list_action_shortcuts(
        &self,
        category: Option<&str>,
    ) -> Result<Vec<ActionShortcut>, DbError> {
        let query = match category {
            Some(_) => "SELECT id, name, shortcut_key, action_type, action_data_json,
                               category, sort_order, is_active, created_at, updated_at
                        FROM action_shortcuts WHERE is_active = 1 AND category = ? ORDER BY sort_order",
            None => "SELECT id, name, shortcut_key, action_type, action_data_json,
                            category, sort_order, is_active, created_at, updated_at
                     FROM action_shortcuts WHERE is_active = 1 ORDER BY sort_order",
        };

        let mut stmt = self.conn.prepare(query)?;
        let shortcuts = if let Some(cat) = category {
            stmt.query_map([cat], Self::row_to_action_shortcut)?
        } else {
            stmt.query_map([], Self::row_to_action_shortcut)?
        }
        .collect::<Result<Vec<_>, _>>()?;

        Ok(shortcuts)
    }


    fn row_to_action_shortcut(row: &rusqlite::Row) -> Result<ActionShortcut, rusqlite::Error> {
        Ok(ActionShortcut {
            id: row.get(0)?,
            name: row.get(1)?,
            shortcut_key: row.get(2)?,
            action_type: row.get(3)?,
            action_data_json: row.get(4)?,
            category: row.get(5)?,
            sort_order: row.get(6)?,
            is_active: row.get::<_, i32>(7)? != 0,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    }


    /// Get an action shortcut by ID
    pub fn get_action_shortcut(&self, shortcut_id: &str) -> Result<ActionShortcut, DbError> {
        let shortcut = self.conn.query_row(
            "SELECT id, name, shortcut_key, action_type, action_data_json,
                    category, sort_order, is_active, created_at, updated_at
             FROM action_shortcuts WHERE id = ?",
            [shortcut_id],
            Self::row_to_action_shortcut,
        )?;
        Ok(shortcut)
    }


    /// Save an action shortcut (insert or update)
    pub fn save_action_shortcut(&self, shortcut: &ActionShortcut) -> Result<String, DbError> {
        self.conn.execute(
            "INSERT OR REPLACE INTO action_shortcuts
             (id, name, shortcut_key, action_type, action_data_json,
              category, sort_order, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                &shortcut.id,
                &shortcut.name,
                &shortcut.shortcut_key,
                &shortcut.action_type,
                &shortcut.action_data_json,
                &shortcut.category,
                shortcut.sort_order,
                shortcut.is_active as i32,
                &shortcut.created_at,
                &shortcut.updated_at,
            ],
        )?;
        Ok(shortcut.id.clone())
    }


    /// Delete an action shortcut
    pub fn delete_action_shortcut(&self, shortcut_id: &str) -> Result<(), DbError> {
        self.conn
            .execute("DELETE FROM action_shortcuts WHERE id = ?", [shortcut_id])?;
        Ok(())
    }


    // ============================================================================
    // Response Template Methods
    // ============================================================================

    /// List all response templates
    pub fn list_templates(&self) -> Result<Vec<ResponseTemplate>, DbError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, category, content, created_at, updated_at
             FROM response_templates
             ORDER BY name",
        )?;

        let templates = stmt
            .query_map([], |row| {
                Ok(ResponseTemplate {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    category: row.get(2)?,
                    content: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(templates)
    }


    /// Get a single template by ID
    pub fn get_template(&self, template_id: &str) -> Result<ResponseTemplate, DbError> {
        let template = self.conn.query_row(
            "SELECT id, name, category, content, created_at, updated_at
             FROM response_templates WHERE id = ?",
            [template_id],
            |row| {
                Ok(ResponseTemplate {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    category: row.get(2)?,
                    content: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            },
        )?;
        Ok(template)
    }


    /// Save a template (insert or update)
    pub fn save_template(&self, template: &ResponseTemplate) -> Result<(), DbError> {
        self.conn.execute(
            "INSERT OR REPLACE INTO response_templates
             (id, name, category, content, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)",
            params![
                &template.id,
                &template.name,
                &template.category,
                &template.content,
                &template.created_at,
                &template.updated_at,
            ],
        )?;
        Ok(())
    }


    /// Delete a template
    pub fn delete_template(&self, template_id: &str) -> Result<(), DbError> {
        self.conn
            .execute("DELETE FROM response_templates WHERE id = ?", [template_id])?;
        Ok(())
    }


    // ============================================================================
    // Custom Variable Methods
    // ============================================================================

    /// Ensure custom_variables table exists (for existing databases)
    pub fn ensure_custom_variables_table(&self) -> Result<(), DbError> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS custom_variables (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                value TEXT NOT NULL,
                created_at TEXT NOT NULL
            )",
            [],
        )?;
        Ok(())
    }


    /// List all custom variables
    pub fn list_custom_variables(&self) -> Result<Vec<CustomVariable>, DbError> {
        // Ensure table exists for older databases
        self.ensure_custom_variables_table()?;

        let mut stmt = self.conn.prepare(
            "SELECT id, name, value, created_at
             FROM custom_variables
             ORDER BY name",
        )?;

        let variables = stmt
            .query_map([], |row| {
                Ok(CustomVariable {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    value: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(variables)
    }


    /// Get a single custom variable by ID
    pub fn get_custom_variable(&self, variable_id: &str) -> Result<CustomVariable, DbError> {
        let variable = self.conn.query_row(
            "SELECT id, name, value, created_at
             FROM custom_variables WHERE id = ?",
            [variable_id],
            |row| {
                Ok(CustomVariable {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    value: row.get(2)?,
                    created_at: row.get(3)?,
                })
            },
        )?;
        Ok(variable)
    }


    /// Save a custom variable (insert or update)
    pub fn save_custom_variable(&self, variable: &CustomVariable) -> Result<(), DbError> {
        // Ensure table exists
        self.ensure_custom_variables_table()?;

        self.conn.execute(
            "INSERT INTO custom_variables (id, name, value, created_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                value = excluded.value",
            params![
                variable.id,
                variable.name,
                variable.value,
                variable.created_at,
            ],
        )?;
        Ok(())
    }


    /// Delete a custom variable
    pub fn delete_custom_variable(&self, variable_id: &str) -> Result<(), DbError> {
        self.conn
            .execute("DELETE FROM custom_variables WHERE id = ?", [variable_id])?;
        Ok(())
    }


    // ========================================================================
    // Phase 6: Draft Version Restore
    // ========================================================================

    /// Restore a draft to a previous version
    pub fn restore_draft_version(&self, draft_id: &str, version_id: &str) -> Result<(), DbError> {
        // First, create a snapshot of the current state before restoring
        self.create_draft_version(draft_id, Some("Pre-restore snapshot"))?;

        // Get the version data to restore
        let version = self.conn.query_row(
            "SELECT input_text, summary_text, response_text, case_intake_json, kb_sources_json
             FROM draft_versions WHERE id = ? AND draft_id = ?",
            params![version_id, draft_id],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            },
        )?;

        let now = Utc::now().to_rfc3339();

        // Update the draft with the version's data
        self.conn.execute(
            "UPDATE drafts SET
                input_text = COALESCE(?, input_text),
                summary_text = ?,
                response_text = ?,
                case_intake_json = ?,
                kb_sources_json = ?,
                updated_at = ?
             WHERE id = ?",
            params![version.0, version.1, version.2, version.3, version.4, &now, draft_id,],
        )?;

        // Create a new version snapshot after restoring
        self.create_draft_version(draft_id, Some("Restored from version"))?;

        Ok(())
    }


    // ========================================================================
    // Phase 2 v0.4.0: Saved Response Templates (Recycling)
    // ========================================================================

    /// Save a response as a reusable template
    pub fn save_response_as_template(
        &self,
        template: &SavedResponseTemplate,
    ) -> Result<String, DbError> {
        self.conn.execute(
            "INSERT INTO saved_response_templates
             (id, source_draft_id, source_rating, name, category, content, variables_json, use_count, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                &template.id,
                &template.source_draft_id,
                template.source_rating,
                &template.name,
                &template.category,
                &template.content,
                &template.variables_json,
                template.use_count,
                &template.created_at,
                &template.updated_at,
            ],
        )?;
        Ok(template.id.clone())
    }


    /// List saved response templates
    pub fn list_saved_response_templates(
        &self,
        limit: usize,
    ) -> Result<Vec<SavedResponseTemplate>, DbError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, source_draft_id, source_rating, name, category, content,
                    variables_json, use_count, created_at, updated_at
             FROM saved_response_templates
             ORDER BY use_count DESC, updated_at DESC
             LIMIT ?",
        )?;

        let templates = stmt
            .query_map([limit as i64], |row| {
                Ok(SavedResponseTemplate {
                    id: row.get(0)?,
                    source_draft_id: row.get(1)?,
                    source_rating: row.get(2)?,
                    name: row.get(3)?,
                    category: row.get(4)?,
                    content: row.get(5)?,
                    variables_json: row.get(6)?,
                    use_count: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(templates)
    }


    /// Increment usage count for a saved response template
    pub fn increment_saved_template_usage(&self, template_id: &str) -> Result<(), DbError> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE saved_response_templates SET use_count = use_count + 1, updated_at = ? WHERE id = ?",
            params![&now, template_id],
        )?;
        Ok(())
    }


    /// Find saved responses similar to current input (keyword match)
    pub fn find_similar_saved_responses(
        &self,
        input_text: &str,
        limit: usize,
    ) -> Result<Vec<SavedResponseTemplate>, DbError> {
        // Extract keywords from input (words > 3 chars, skip common stopwords)
        let keywords: Vec<&str> = input_text
            .split_whitespace()
            .filter(|w| w.len() > 3)
            .take(5)
            .collect();

        if keywords.is_empty() {
            return Ok(Vec::new());
        }

        let like_clauses: Vec<String> = keywords
            .iter()
            .map(|k| format!("content LIKE '%{}%'", k.replace('\'', "''")))
            .collect();
        let where_clause = like_clauses.join(" OR ");

        let query = format!(
            "SELECT id, source_draft_id, source_rating, name, category, content,
                    variables_json, use_count, created_at, updated_at
             FROM saved_response_templates
             WHERE {}
             ORDER BY use_count DESC
             LIMIT ?",
            where_clause
        );

        let mut stmt = self.conn.prepare(&query)?;
        let templates = stmt
            .query_map([limit as i64], |row| {
                Ok(SavedResponseTemplate {
                    id: row.get(0)?,
                    source_draft_id: row.get(1)?,
                    source_rating: row.get(2)?,
                    name: row.get(3)?,
                    category: row.get(4)?,
                    content: row.get(5)?,
                    variables_json: row.get(6)?,
                    use_count: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(templates)
    }


    // ========================================================================
    // Phase 2 v0.4.0: Response Alternatives
    // ========================================================================

    /// Save a response alternative
    pub fn save_response_alternative(&self, alt: &ResponseAlternative) -> Result<String, DbError> {
        self.conn.execute(
            "INSERT INTO response_alternatives
             (id, draft_id, original_text, alternative_text, sources_json, metrics_json, generation_params_json, chosen, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                &alt.id,
                &alt.draft_id,
                &alt.original_text,
                &alt.alternative_text,
                &alt.sources_json,
                &alt.metrics_json,
                &alt.generation_params_json,
                &alt.chosen,
                &alt.created_at,
            ],
        )?;
        Ok(alt.id.clone())
    }


    /// Get alternatives for a draft
    pub fn get_alternatives_for_draft(
        &self,
        draft_id: &str,
    ) -> Result<Vec<ResponseAlternative>, DbError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, draft_id, original_text, alternative_text, sources_json,
                    metrics_json, generation_params_json, chosen, created_at
             FROM response_alternatives
             WHERE draft_id = ?
             ORDER BY created_at DESC",
        )?;

        let alts = stmt
            .query_map([draft_id], |row| {
                Ok(ResponseAlternative {
                    id: row.get(0)?,
                    draft_id: row.get(1)?,
                    original_text: row.get(2)?,
                    alternative_text: row.get(3)?,
                    sources_json: row.get(4)?,
                    metrics_json: row.get(5)?,
                    generation_params_json: row.get(6)?,
                    chosen: row.get(7)?,
                    created_at: row.get(8)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(alts)
    }


    /// Choose an alternative (mark as chosen)
    pub fn choose_alternative(&self, alternative_id: &str, choice: &str) -> Result<(), DbError> {
        self.conn.execute(
            "UPDATE response_alternatives SET chosen = ? WHERE id = ?",
            params![choice, alternative_id],
        )?;
        Ok(())
    }

}
