use crate::error::{AppError, ErrorCategory, ErrorCode};
use crate::AppState;
use tauri::State;

fn with_db<T>(
    state: State<'_, AppState>,
    f: impl FnOnce(&crate::db::Database) -> Result<T, crate::db::DbError>,
) -> Result<T, AppError> {
    let db_guard = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_guard.as_ref().ok_or_else(AppError::db_not_initialized)?;
    f(db).map_err(|e| AppError::db_query_failed(e.to_string()))
}

#[tauri::command]
pub async fn start_runbook_session(
    state: State<'_, AppState>,
    scenario: String,
    steps: Vec<String>,
    scope_key: String,
) -> Result<crate::db::RunbookSessionRecord, AppError> {
    let steps_json = serde_json::to_string(&steps)
        .map_err(|e| AppError::internal(format!("Failed to serialize steps: {}", e)))?;
    with_db(state, |db| {
        db.create_runbook_session(&scenario, &steps_json, &scope_key)
    })
}

#[tauri::command]
pub async fn advance_runbook_session(
    state: State<'_, AppState>,
    session_id: String,
    current_step: i32,
    status: Option<String>,
) -> Result<(), AppError> {
    with_db(state, |db| {
        db.advance_runbook_session(&session_id, current_step, status.as_deref())
    })
}

#[tauri::command]
pub async fn list_runbook_sessions(
    state: State<'_, AppState>,
    limit: Option<usize>,
    status: Option<String>,
    scope_key: Option<String>,
) -> Result<Vec<crate::db::RunbookSessionRecord>, AppError> {
    with_db(state, |db| {
        db.list_runbook_sessions(
            limit.unwrap_or(50).min(500),
            status.as_deref(),
            scope_key.as_deref(),
        )
    })
}

#[tauri::command]
pub async fn reassign_runbook_session_scope(
    state: State<'_, AppState>,
    from_scope_key: String,
    to_scope_key: String,
) -> Result<(), AppError> {
    with_db(state, |db| {
        db.reassign_runbook_session_scope(&from_scope_key, &to_scope_key)
    })
}

#[tauri::command]
pub async fn reassign_runbook_session_by_id(
    state: State<'_, AppState>,
    session_id: String,
    to_scope_key: String,
) -> Result<(), AppError> {
    with_db(state, |db| {
        db.reassign_runbook_session_by_id(&session_id, &to_scope_key)
    })
}

fn validate_integration_type(integration_type: &str) -> Result<String, AppError> {
    let normalized = integration_type.trim().to_ascii_lowercase();
    if matches!(
        normalized.as_str(),
        "jira" | "servicenow" | "slack" | "teams"
    ) {
        Ok(normalized)
    } else {
        Err(AppError::invalid_format(format!(
            "unsupported integration type '{}'; expected jira, servicenow, slack, or teams",
            integration_type
        )))
    }
}

fn confirm_dispatch_history(
    db: &crate::db::Database,
    dispatch_id: &str,
) -> Result<crate::db::DispatchHistoryRecord, AppError> {
    let existing = db
        .get_dispatch_history(dispatch_id)
        .map_err(|e| AppError::db_query_failed(e.to_string()))?;

    if existing.integration_type == "jira" {
        return db
            .update_dispatch_history_status(dispatch_id, "sent")
            .map_err(|e| AppError::db_query_failed(e.to_string()));
    }

    let integration_enabled = db
        .list_integration_configs()
        .map_err(|e| AppError::db_query_failed(e.to_string()))?
        .into_iter()
        .find(|item| item.integration_type == existing.integration_type)
        .map(|item| item.enabled)
        .unwrap_or(false);

    if !integration_enabled {
        return Err(AppError::new(
            ErrorCode::SECURITY_PERMISSION_DENIED,
            format!(
                "{} integration is not enabled. Configure it in Ops before confirming delivery.",
                existing.integration_type
            ),
            ErrorCategory::Security,
        ));
    }

    db.update_dispatch_history_status(dispatch_id, "sent")
        .map_err(|e| AppError::db_query_failed(e.to_string()))
}

#[tauri::command]
pub async fn list_resolution_kits(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<crate::db::ResolutionKitRecord>, AppError> {
    with_db(state, |db| {
        db.list_resolution_kits(limit.unwrap_or(50).min(200))
    })
}

#[tauri::command]
pub async fn save_resolution_kit(
    state: State<'_, AppState>,
    kit: crate::db::ResolutionKitRecord,
) -> Result<String, AppError> {
    with_db(state, |db| db.save_resolution_kit(&kit))
}

#[tauri::command]
pub async fn list_workspace_favorites(
    state: State<'_, AppState>,
) -> Result<Vec<crate::db::WorkspaceFavoriteRecord>, AppError> {
    with_db(state, |db| db.list_workspace_favorites())
}

#[tauri::command]
pub async fn save_workspace_favorite(
    state: State<'_, AppState>,
    favorite: crate::db::WorkspaceFavoriteRecord,
) -> Result<String, AppError> {
    with_db(state, |db| db.save_workspace_favorite(&favorite))
}

#[tauri::command]
pub async fn delete_workspace_favorite(
    state: State<'_, AppState>,
    favorite_id: String,
) -> Result<(), AppError> {
    with_db(state, |db| db.delete_workspace_favorite(&favorite_id))
}

#[tauri::command]
pub async fn list_runbook_templates(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<crate::db::RunbookTemplateRecord>, AppError> {
    with_db(state, |db| {
        db.list_runbook_templates(limit.unwrap_or(50).min(200))
    })
}

#[tauri::command]
pub async fn save_runbook_template(
    state: State<'_, AppState>,
    template: crate::db::RunbookTemplateRecord,
) -> Result<String, AppError> {
    with_db(state, |db| db.save_runbook_template(&template))
}

#[tauri::command]
pub async fn list_runbook_step_evidence(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<crate::db::RunbookStepEvidenceRecord>, AppError> {
    with_db(state, |db| db.list_runbook_step_evidence(&session_id))
}

#[tauri::command]
pub async fn add_runbook_step_evidence(
    state: State<'_, AppState>,
    session_id: String,
    step_index: i32,
    status: String,
    evidence_text: String,
    skip_reason: Option<String>,
) -> Result<crate::db::RunbookStepEvidenceRecord, AppError> {
    with_db(state, |db| {
        db.add_runbook_step_evidence(
            &session_id,
            step_index,
            &status,
            &evidence_text,
            skip_reason.as_deref(),
        )
    })
}

#[tauri::command]
pub async fn preview_collaboration_dispatch(
    state: State<'_, AppState>,
    integration_type: String,
    draft_id: Option<String>,
    title: String,
    destination_label: String,
    payload_preview: String,
    metadata_json: Option<String>,
) -> Result<crate::db::DispatchHistoryRecord, AppError> {
    let integration_type = validate_integration_type(&integration_type)?;
    with_db(state, |db| {
        db.create_dispatch_history_preview(
            &integration_type,
            draft_id.as_deref(),
            &title,
            &destination_label,
            &payload_preview,
            metadata_json.as_deref(),
        )
    })
}

#[tauri::command]
pub async fn confirm_collaboration_dispatch(
    state: State<'_, AppState>,
    dispatch_id: String,
) -> Result<crate::db::DispatchHistoryRecord, AppError> {
    let db_guard = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_guard.as_ref().ok_or_else(AppError::db_not_initialized)?;
    confirm_dispatch_history(db, &dispatch_id)
}

#[tauri::command]
pub async fn send_collaboration_dispatch(
    state: State<'_, AppState>,
    dispatch_id: String,
) -> Result<crate::db::DispatchHistoryRecord, AppError> {
    let db_guard = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_guard.as_ref().ok_or_else(AppError::db_not_initialized)?;
    confirm_dispatch_history(db, &dispatch_id)
}

#[tauri::command]
pub async fn cancel_collaboration_dispatch(
    state: State<'_, AppState>,
    dispatch_id: String,
) -> Result<crate::db::DispatchHistoryRecord, AppError> {
    with_db(state, |db| {
        db.update_dispatch_history_status(&dispatch_id, "cancelled")
    })
}

#[tauri::command]
pub async fn list_dispatch_history(
    state: State<'_, AppState>,
    limit: Option<usize>,
    status: Option<String>,
) -> Result<Vec<crate::db::DispatchHistoryRecord>, AppError> {
    with_db(state, |db| {
        db.list_dispatch_history(limit.unwrap_or(50).min(200), status.as_deref())
    })
}

#[tauri::command]
pub async fn save_case_outcome(
    state: State<'_, AppState>,
    outcome: crate::db::CaseOutcomeRecord,
) -> Result<String, AppError> {
    with_db(state, |db| db.save_case_outcome(&outcome))
}

#[tauri::command]
pub async fn list_case_outcomes(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<crate::db::CaseOutcomeRecord>, AppError> {
    with_db(state, |db| {
        db.list_case_outcomes(limit.unwrap_or(50).min(200))
    })
}

#[tauri::command]
pub async fn configure_integration(
    state: State<'_, AppState>,
    integration_type: String,
    enabled: bool,
    config_json: Option<String>,
) -> Result<(), AppError> {
    let normalized_type = integration_type.trim().to_ascii_lowercase();
    if !matches!(normalized_type.as_str(), "servicenow" | "slack" | "teams") {
        return Err(AppError::invalid_format(format!(
            "unsupported integration type '{}'; expected one of: servicenow, slack, teams",
            integration_type
        )));
    }

    let normalized_config = match config_json.map(|raw| raw.trim().to_string()) {
        Some(raw) if raw.is_empty() => None,
        Some(raw) => {
            let parsed: serde_json::Value = serde_json::from_str(&raw).map_err(|e| {
                AppError::invalid_format(format!("integration config must be valid JSON: {}", e))
            })?;
            if !parsed.is_object() {
                return Err(AppError::invalid_format(
                    "integration config must be a JSON object",
                ));
            }
            Some(parsed.to_string())
        }
        None => None,
    };

    with_db(state, |db| {
        db.set_integration_config(&normalized_type, enabled, normalized_config.as_deref())
    })
}

#[tauri::command]
pub async fn list_integrations(
    state: State<'_, AppState>,
) -> Result<Vec<crate::db::IntegrationConfigRecord>, AppError> {
    with_db(state, |db| db.list_integration_configs())
}

#[tauri::command]
pub async fn set_workspace_role(
    state: State<'_, AppState>,
    workspace_id: String,
    principal: String,
    role_name: String,
) -> Result<(), AppError> {
    with_db(state, |db| {
        db.set_workspace_role(&workspace_id, &principal, &role_name)
    })
}

#[tauri::command]
pub async fn list_workspace_roles(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<crate::db::WorkspaceRoleRecord>, AppError> {
    with_db(state, |db| db.list_workspace_roles(&workspace_id))
}
