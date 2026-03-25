//! Workspace persistence for runbooks, favorites, dispatch, and outcomes.

use super::*;

impl Database {

    /// Start a runbook session.
    pub fn create_runbook_session(
        &self,
        scenario: &str,
        steps_json: &str,
        scope_key: &str,
    ) -> Result<RunbookSessionRecord, DbError> {
        let mut existing_stmt = self.conn.prepare(
            "SELECT id FROM runbook_sessions
             WHERE scope_key = ?
               AND status IN ('active', 'paused')
             LIMIT 1",
        )?;
        let existing_session = existing_stmt
            .query_row([scope_key], |row| row.get::<_, String>(0))
            .optional()?;
        if existing_session.is_some() {
            return Err(DbError::InvalidInput(
                "an in-progress guided runbook already exists for this workspace".to_string(),
            ));
        }

        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO runbook_sessions (id, scenario, scope_key, status, steps_json, current_step, created_at, updated_at)
             VALUES (?, ?, ?, 'active', ?, 0, ?, ?)",
            params![&id, scenario, scope_key, steps_json, &now, &now],
        )?;
        Ok(RunbookSessionRecord {
            id,
            scenario: scenario.to_string(),
            scope_key: scope_key.to_string(),
            status: "active".to_string(),
            steps_json: steps_json.to_string(),
            current_step: 0,
            created_at: now.clone(),
            updated_at: now,
        })
    }


    /// Advance an existing runbook session.
    pub fn advance_runbook_session(
        &self,
        session_id: &str,
        new_step: i32,
        status: Option<&str>,
    ) -> Result<(), DbError> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE runbook_sessions
             SET current_step = ?, status = COALESCE(?, status), updated_at = ?
             WHERE id = ?",
            params![new_step, status, &now, session_id],
        )?;
        Ok(())
    }


    /// Reassign all guided runbook sessions from one workspace scope to another.
    pub fn reassign_runbook_session_scope(
        &self,
        from_scope_key: &str,
        to_scope_key: &str,
    ) -> Result<(), DbError> {
        if from_scope_key.trim().is_empty() || to_scope_key.trim().is_empty() {
            return Err(DbError::InvalidInput(
                "runbook scope keys must be non-empty".to_string(),
            ));
        }

        if from_scope_key == to_scope_key {
            return Ok(());
        }

        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE runbook_sessions
             SET scope_key = ?, updated_at = ?
             WHERE scope_key = ?",
            params![to_scope_key, &now, from_scope_key],
        )?;
        Ok(())
    }


    /// Reassign a single guided runbook session to a new workspace scope.
    pub fn reassign_runbook_session_by_id(
        &self,
        session_id: &str,
        to_scope_key: &str,
    ) -> Result<(), DbError> {
        if session_id.trim().is_empty() || to_scope_key.trim().is_empty() {
            return Err(DbError::InvalidInput(
                "runbook session id and scope key must be non-empty".to_string(),
            ));
        }

        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE runbook_sessions
             SET scope_key = ?, updated_at = ?
             WHERE id = ?",
            params![to_scope_key, &now, session_id],
        )?;
        Ok(())
    }


    /// List recent runbook sessions.
    pub fn list_runbook_sessions(
        &self,
        limit: usize,
        status: Option<&str>,
        scope_key: Option<&str>,
    ) -> Result<Vec<RunbookSessionRecord>, DbError> {
        let status = status.unwrap_or("%");
        let scope_key = scope_key.unwrap_or("%");
        let mut stmt = self.conn.prepare(
            "SELECT id, scenario, scope_key, status, steps_json, current_step, created_at, updated_at
             FROM runbook_sessions
             WHERE status LIKE ?
               AND scope_key LIKE ?
             ORDER BY updated_at DESC
             LIMIT ?",
        )?;
        let rows = stmt
            .query_map(params![status, scope_key, limit as i64], |row| {
                Ok(RunbookSessionRecord {
                    id: row.get(0)?,
                    scenario: row.get(1)?,
                    scope_key: row.get(2)?,
                    status: row.get(3)?,
                    steps_json: row.get(4)?,
                    current_step: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }


    /// Save or update a guided runbook template.
    pub fn save_runbook_template(
        &self,
        template: &RunbookTemplateRecord,
    ) -> Result<String, DbError> {
        let id = if template.id.trim().is_empty() {
            uuid::Uuid::new_v4().to_string()
        } else {
            template.id.clone()
        };
        let now = Utc::now().to_rfc3339();
        let created_at = if template.created_at.trim().is_empty() {
            now.clone()
        } else {
            template.created_at.clone()
        };
        let steps_json = self.normalize_json_string_array(&template.steps_json, "runbook template steps")?;
        self.conn.execute(
            "INSERT INTO runbook_templates (id, name, scenario, steps_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                scenario = excluded.scenario,
                steps_json = excluded.steps_json,
                updated_at = excluded.updated_at",
            params![&id, &template.name, &template.scenario, &steps_json, &created_at, &now],
        )?;
        Ok(id)
    }


    /// List guided runbook templates.
    pub fn list_runbook_templates(
        &self,
        limit: usize,
    ) -> Result<Vec<RunbookTemplateRecord>, DbError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, scenario, steps_json, created_at, updated_at
             FROM runbook_templates
             ORDER BY updated_at DESC
             LIMIT ?",
        )?;
        let rows = stmt
            .query_map([limit as i64], |row| {
                Ok(RunbookTemplateRecord {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    scenario: row.get(2)?,
                    steps_json: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }


    /// Record evidence for a runbook step.
    pub fn add_runbook_step_evidence(
        &self,
        session_id: &str,
        step_index: i32,
        status: &str,
        evidence_text: &str,
        skip_reason: Option<&str>,
    ) -> Result<RunbookStepEvidenceRecord, DbError> {
        if !matches!(status, "pending" | "completed" | "skipped" | "failed") {
            return Err(DbError::InvalidInput(format!(
                "unsupported runbook step status '{}'",
                status
            )));
        }

        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO runbook_step_evidence (id, session_id, step_index, status, evidence_text, skip_reason, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![&id, session_id, step_index, status, evidence_text, skip_reason, &now],
        )?;
        Ok(RunbookStepEvidenceRecord {
            id,
            session_id: session_id.to_string(),
            step_index,
            status: status.to_string(),
            evidence_text: evidence_text.to_string(),
            skip_reason: skip_reason.map(|value| value.to_string()),
            created_at: now,
        })
    }


    /// List evidence recorded for a runbook session.
    pub fn list_runbook_step_evidence(
        &self,
        session_id: &str,
    ) -> Result<Vec<RunbookStepEvidenceRecord>, DbError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, session_id, step_index, status, evidence_text, skip_reason, created_at
             FROM runbook_step_evidence
             WHERE session_id = ?
             ORDER BY step_index ASC, created_at DESC",
        )?;
        let rows = stmt
            .query_map([session_id], |row| {
                Ok(RunbookStepEvidenceRecord {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    step_index: row.get(2)?,
                    status: row.get(3)?,
                    evidence_text: row.get(4)?,
                    skip_reason: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }


    /// Save or update a reusable resolution kit.
    pub fn save_resolution_kit(&self, kit: &ResolutionKitRecord) -> Result<String, DbError> {
        let id = if kit.id.trim().is_empty() {
            uuid::Uuid::new_v4().to_string()
        } else {
            kit.id.clone()
        };
        let now = Utc::now().to_rfc3339();
        let created_at = if kit.created_at.trim().is_empty() {
            now.clone()
        } else {
            kit.created_at.clone()
        };
        let checklist_items_json =
            self.normalize_json_string_array(&kit.checklist_items_json, "resolution kit checklist")?;
        let kb_document_ids_json =
            self.normalize_json_string_array(&kit.kb_document_ids_json, "resolution kit KB document ids")?;
        self.conn.execute(
            "INSERT INTO resolution_kits
                (id, name, summary, category, response_template, checklist_items_json, kb_document_ids_json, runbook_scenario, approval_hint, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                summary = excluded.summary,
                category = excluded.category,
                response_template = excluded.response_template,
                checklist_items_json = excluded.checklist_items_json,
                kb_document_ids_json = excluded.kb_document_ids_json,
                runbook_scenario = excluded.runbook_scenario,
                approval_hint = excluded.approval_hint,
                updated_at = excluded.updated_at",
            params![
                &id,
                &kit.name,
                &kit.summary,
                &kit.category,
                &kit.response_template,
                &checklist_items_json,
                &kb_document_ids_json,
                &kit.runbook_scenario,
                &kit.approval_hint,
                &created_at,
                &now
            ],
        )?;
        Ok(id)
    }


    /// List reusable resolution kits.
    pub fn list_resolution_kits(&self, limit: usize) -> Result<Vec<ResolutionKitRecord>, DbError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, summary, category, response_template, checklist_items_json, kb_document_ids_json, runbook_scenario, approval_hint, created_at, updated_at
             FROM resolution_kits
             ORDER BY updated_at DESC
             LIMIT ?",
        )?;
        let rows = stmt
            .query_map([limit as i64], |row| {
                Ok(ResolutionKitRecord {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    summary: row.get(2)?,
                    category: row.get(3)?,
                    response_template: row.get(4)?,
                    checklist_items_json: row.get(5)?,
                    kb_document_ids_json: row.get(6)?,
                    runbook_scenario: row.get(7)?,
                    approval_hint: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }


    /// Save or update a workspace favorite.
    pub fn save_workspace_favorite(
        &self,
        favorite: &WorkspaceFavoriteRecord,
    ) -> Result<String, DbError> {
        let id = if favorite.id.trim().is_empty() {
            uuid::Uuid::new_v4().to_string()
        } else {
            favorite.id.clone()
        };
        let now = Utc::now().to_rfc3339();
        let created_at = if favorite.created_at.trim().is_empty() {
            now.clone()
        } else {
            favorite.created_at.clone()
        };
        let metadata_json = self.normalize_optional_json_object(
            favorite.metadata_json.as_deref(),
            "workspace favorite metadata",
        )?;
        self.conn.execute(
            "INSERT INTO workspace_favorites (id, kind, label, resource_id, metadata_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(kind, resource_id) DO UPDATE SET
                label = excluded.label,
                metadata_json = excluded.metadata_json,
                updated_at = excluded.updated_at",
            params![
                &id,
                &favorite.kind,
                &favorite.label,
                &favorite.resource_id,
                metadata_json.as_deref(),
                &created_at,
                &now
            ],
        )?;
        self.conn
            .query_row(
                "SELECT id FROM workspace_favorites WHERE kind = ? AND resource_id = ?",
                params![&favorite.kind, &favorite.resource_id],
                |row| row.get(0),
            )
            .map_err(DbError::from)
    }


    /// List workspace favorites.
    pub fn list_workspace_favorites(&self) -> Result<Vec<WorkspaceFavoriteRecord>, DbError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, kind, label, resource_id, metadata_json, created_at, updated_at
             FROM workspace_favorites
             ORDER BY updated_at DESC",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok(WorkspaceFavoriteRecord {
                    id: row.get(0)?,
                    kind: row.get(1)?,
                    label: row.get(2)?,
                    resource_id: row.get(3)?,
                    metadata_json: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }


    /// Delete a workspace favorite.
    pub fn delete_workspace_favorite(&self, favorite_id: &str) -> Result<(), DbError> {
        self.conn.execute(
            "DELETE FROM workspace_favorites WHERE id = ?",
            [favorite_id],
        )?;
        Ok(())
    }


    /// Record a preview-first collaboration dispatch artifact.
    pub fn create_dispatch_history_preview(
        &self,
        integration_type: &str,
        draft_id: Option<&str>,
        title: &str,
        destination_label: &str,
        payload_preview: &str,
        metadata_json: Option<&str>,
    ) -> Result<DispatchHistoryRecord, DbError> {
        let metadata_json =
            self.normalize_optional_json_object(metadata_json, "dispatch history metadata")?;
        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO dispatch_history
                (id, integration_type, draft_id, title, destination_label, payload_preview, status, metadata_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 'previewed', ?, ?, ?)",
            params![
                &id,
                integration_type,
                draft_id,
                title,
                destination_label,
                payload_preview,
                metadata_json.as_deref(),
                &now,
                &now
            ],
        )?;
        Ok(DispatchHistoryRecord {
            id,
            integration_type: integration_type.to_string(),
            draft_id: draft_id.map(|value| value.to_string()),
            title: title.to_string(),
            destination_label: destination_label.to_string(),
            payload_preview: payload_preview.to_string(),
            status: "previewed".to_string(),
            metadata_json,
            created_at: now.clone(),
            updated_at: now,
        })
    }


    /// Update collaboration dispatch status after an explicit user action.
    pub fn update_dispatch_history_status(
        &self,
        dispatch_id: &str,
        status: &str,
    ) -> Result<DispatchHistoryRecord, DbError> {
        if !matches!(status, "previewed" | "sent" | "cancelled" | "failed") {
            return Err(DbError::InvalidInput(format!(
                "unsupported dispatch status '{}'",
                status
            )));
        }

        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE dispatch_history
             SET status = ?, updated_at = ?
             WHERE id = ?",
            params![status, &now, dispatch_id],
        )?;
        self.get_dispatch_history(dispatch_id)
    }


    /// Get one dispatch history record.
    pub fn get_dispatch_history(&self, dispatch_id: &str) -> Result<DispatchHistoryRecord, DbError> {
        self.conn.query_row(
            "SELECT id, integration_type, draft_id, title, destination_label, payload_preview, status, metadata_json, created_at, updated_at
             FROM dispatch_history
             WHERE id = ?",
            [dispatch_id],
            |row| {
                Ok(DispatchHistoryRecord {
                    id: row.get(0)?,
                    integration_type: row.get(1)?,
                    draft_id: row.get(2)?,
                    title: row.get(3)?,
                    destination_label: row.get(4)?,
                    payload_preview: row.get(5)?,
                    status: row.get(6)?,
                    metadata_json: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            },
        ).map_err(DbError::Sqlite)
    }


    /// List collaboration dispatch history.
    pub fn list_dispatch_history(
        &self,
        limit: usize,
        status: Option<&str>,
    ) -> Result<Vec<DispatchHistoryRecord>, DbError> {
        let status = status.unwrap_or("%");
        let mut stmt = self.conn.prepare(
            "SELECT id, integration_type, draft_id, title, destination_label, payload_preview, status, metadata_json, created_at, updated_at
             FROM dispatch_history
             WHERE status LIKE ?
             ORDER BY updated_at DESC
             LIMIT ?",
        )?;
        let rows = stmt
            .query_map(params![status, limit as i64], |row| {
                Ok(DispatchHistoryRecord {
                    id: row.get(0)?,
                    integration_type: row.get(1)?,
                    draft_id: row.get(2)?,
                    title: row.get(3)?,
                    destination_label: row.get(4)?,
                    payload_preview: row.get(5)?,
                    status: row.get(6)?,
                    metadata_json: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }


    /// Save or update a case outcome summary.
    pub fn save_case_outcome(&self, outcome: &CaseOutcomeRecord) -> Result<String, DbError> {
        let id = if outcome.id.trim().is_empty() {
            uuid::Uuid::new_v4().to_string()
        } else {
            outcome.id.clone()
        };
        let now = Utc::now().to_rfc3339();
        let created_at = if outcome.created_at.trim().is_empty() {
            now.clone()
        } else {
            outcome.created_at.clone()
        };
        let handoff_pack_json =
            self.normalize_optional_json_object(outcome.handoff_pack_json.as_deref(), "case outcome handoff pack")?;
        let kb_draft_json =
            self.normalize_optional_json_object(outcome.kb_draft_json.as_deref(), "case outcome KB draft")?;
        let evidence_pack_json =
            self.normalize_optional_json_object(outcome.evidence_pack_json.as_deref(), "case outcome evidence pack")?;
        let tags_json = match outcome.tags_json.as_deref() {
            Some(value) => Some(self.normalize_json_string_array(value, "case outcome tags")?),
            None => None,
        };
        self.conn.execute(
            "INSERT INTO case_outcomes
                (id, draft_id, status, outcome_summary, handoff_pack_json, kb_draft_json, evidence_pack_json, tags_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                draft_id = excluded.draft_id,
                status = excluded.status,
                outcome_summary = excluded.outcome_summary,
                handoff_pack_json = excluded.handoff_pack_json,
                kb_draft_json = excluded.kb_draft_json,
                evidence_pack_json = excluded.evidence_pack_json,
                tags_json = excluded.tags_json,
                updated_at = excluded.updated_at",
            params![
                &id,
                &outcome.draft_id,
                &outcome.status,
                &outcome.outcome_summary,
                handoff_pack_json.as_deref(),
                kb_draft_json.as_deref(),
                evidence_pack_json.as_deref(),
                tags_json.as_deref(),
                &created_at,
                &now
            ],
        )?;
        Ok(id)
    }


    /// List recent case outcomes.
    pub fn list_case_outcomes(&self, limit: usize) -> Result<Vec<CaseOutcomeRecord>, DbError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, draft_id, status, outcome_summary, handoff_pack_json, kb_draft_json, evidence_pack_json, tags_json, created_at, updated_at
             FROM case_outcomes
             ORDER BY updated_at DESC
             LIMIT ?",
        )?;
        let rows = stmt
            .query_map([limit as i64], |row| {
                Ok(CaseOutcomeRecord {
                    id: row.get(0)?,
                    draft_id: row.get(1)?,
                    status: row.get(2)?,
                    outcome_summary: row.get(3)?,
                    handoff_pack_json: row.get(4)?,
                    kb_draft_json: row.get(5)?,
                    evidence_pack_json: row.get(6)?,
                    tags_json: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }


    /// Upsert integration configuration.
    pub fn set_integration_config(
        &self,
        integration_type: &str,
        enabled: bool,
        config_json: Option<&str>,
    ) -> Result<(), DbError> {
        let normalized_config = match config_json.map(str::trim).filter(|raw| !raw.is_empty()) {
            Some(raw) => {
                let parsed: serde_json::Value = serde_json::from_str(raw).map_err(|e| {
                    DbError::InvalidInput(format!("integration config must be valid JSON: {}", e))
                })?;
                if !parsed.is_object() {
                    return Err(DbError::InvalidInput(
                        "integration config must be a JSON object".to_string(),
                    ));
                }
                Some(parsed.to_string())
            }
            None => None,
        };
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO integration_configs (id, integration_type, enabled, config_json, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(integration_type) DO UPDATE SET
                enabled = excluded.enabled,
                config_json = excluded.config_json,
                updated_at = excluded.updated_at",
            params![
                uuid::Uuid::new_v4().to_string(),
                integration_type,
                if enabled { 1 } else { 0 },
                normalized_config.as_deref(),
                &now
            ],
        )?;
        Ok(())
    }


    /// List integration configuration records.
    pub fn list_integration_configs(&self) -> Result<Vec<IntegrationConfigRecord>, DbError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, integration_type, enabled, config_json, updated_at
             FROM integration_configs
             ORDER BY integration_type ASC",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok(IntegrationConfigRecord {
                    id: row.get(0)?,
                    integration_type: row.get(1)?,
                    enabled: row.get::<_, i32>(2)? == 1,
                    config_json: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }


    /// Upsert workspace role assignment.
    pub fn set_workspace_role(
        &self,
        workspace_id: &str,
        principal: &str,
        role_name: &str,
    ) -> Result<(), DbError> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO workspace_roles (id, workspace_id, principal, role_name, created_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(workspace_id, principal) DO UPDATE SET
                role_name = excluded.role_name",
            params![
                uuid::Uuid::new_v4().to_string(),
                workspace_id,
                principal,
                role_name,
                &now
            ],
        )?;
        Ok(())
    }


    /// List role assignments for a workspace.
    pub fn list_workspace_roles(
        &self,
        workspace_id: &str,
    ) -> Result<Vec<WorkspaceRoleRecord>, DbError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, workspace_id, principal, role_name, created_at
             FROM workspace_roles
             WHERE workspace_id = ?
             ORDER BY principal ASC",
        )?;
        let rows = stmt
            .query_map([workspace_id], |row| {
                Ok(WorkspaceRoleRecord {
                    id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    principal: row.get(2)?,
                    role_name: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

}
