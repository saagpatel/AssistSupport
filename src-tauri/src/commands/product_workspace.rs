use super::*;

fn with_db<T>(
    state: State<'_, AppState>,
    f: impl FnOnce(&crate::db::Database) -> Result<T, crate::db::DbError>,
) -> Result<T, String> {
    let db_guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    f(db).map_err(|e| e.to_string())
}

fn validate_integration_type(integration_type: &str) -> Result<String, String> {
    let normalized = integration_type.trim().to_ascii_lowercase();
    if matches!(
        normalized.as_str(),
        "jira" | "servicenow" | "slack" | "teams"
    ) {
        Ok(normalized)
    } else {
        Err(format!(
            "unsupported integration type '{}'; expected jira, servicenow, slack, or teams",
            integration_type
        ))
    }
}

fn confirm_dispatch_history(
    db: &crate::db::Database,
    dispatch_id: &str,
) -> Result<crate::db::DispatchHistoryRecord, String> {
    let existing = db
        .get_dispatch_history(dispatch_id)
        .map_err(|e| e.to_string())?;

    if existing.integration_type == "jira" {
        return db
            .update_dispatch_history_status(dispatch_id, "sent")
            .map_err(|e| e.to_string());
    }

    let integration_enabled = db
        .list_integration_configs()
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|item| item.integration_type == existing.integration_type)
        .map(|item| item.enabled)
        .unwrap_or(false);

    if !integration_enabled {
        return Err(format!(
            "{} integration is not enabled. Configure it in Ops before confirming delivery.",
            existing.integration_type
        ));
    }

    db.update_dispatch_history_status(dispatch_id, "sent")
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_resolution_kits(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<crate::db::ResolutionKitRecord>, String> {
    with_db(state, |db| {
        db.list_resolution_kits(limit.unwrap_or(50).min(200))
    })
}

#[tauri::command]
pub async fn save_resolution_kit(
    state: State<'_, AppState>,
    kit: crate::db::ResolutionKitRecord,
) -> Result<String, String> {
    with_db(state, |db| db.save_resolution_kit(&kit))
}

#[tauri::command]
pub async fn list_workspace_favorites(
    state: State<'_, AppState>,
) -> Result<Vec<crate::db::WorkspaceFavoriteRecord>, String> {
    with_db(state, |db| db.list_workspace_favorites())
}

#[tauri::command]
pub async fn save_workspace_favorite(
    state: State<'_, AppState>,
    favorite: crate::db::WorkspaceFavoriteRecord,
) -> Result<String, String> {
    with_db(state, |db| db.save_workspace_favorite(&favorite))
}

#[tauri::command]
pub async fn delete_workspace_favorite(
    state: State<'_, AppState>,
    favorite_id: String,
) -> Result<(), String> {
    with_db(state, |db| db.delete_workspace_favorite(&favorite_id))
}

#[tauri::command]
pub async fn list_runbook_templates(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<crate::db::RunbookTemplateRecord>, String> {
    with_db(state, |db| {
        db.list_runbook_templates(limit.unwrap_or(50).min(200))
    })
}

#[tauri::command]
pub async fn save_runbook_template(
    state: State<'_, AppState>,
    template: crate::db::RunbookTemplateRecord,
) -> Result<String, String> {
    with_db(state, |db| db.save_runbook_template(&template))
}

#[tauri::command]
pub async fn list_runbook_step_evidence(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<crate::db::RunbookStepEvidenceRecord>, String> {
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
) -> Result<crate::db::RunbookStepEvidenceRecord, String> {
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
) -> Result<crate::db::DispatchHistoryRecord, String> {
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
) -> Result<crate::db::DispatchHistoryRecord, String> {
    let db_guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    confirm_dispatch_history(db, &dispatch_id)
}

#[tauri::command]
pub async fn send_collaboration_dispatch(
    state: State<'_, AppState>,
    dispatch_id: String,
) -> Result<crate::db::DispatchHistoryRecord, String> {
    let db_guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    confirm_dispatch_history(db, &dispatch_id)
}

#[tauri::command]
pub async fn cancel_collaboration_dispatch(
    state: State<'_, AppState>,
    dispatch_id: String,
) -> Result<crate::db::DispatchHistoryRecord, String> {
    with_db(state, |db| {
        db.update_dispatch_history_status(&dispatch_id, "cancelled")
    })
}

#[tauri::command]
pub async fn list_dispatch_history(
    state: State<'_, AppState>,
    limit: Option<usize>,
    status: Option<String>,
) -> Result<Vec<crate::db::DispatchHistoryRecord>, String> {
    with_db(state, |db| {
        db.list_dispatch_history(limit.unwrap_or(50).min(200), status.as_deref())
    })
}

#[tauri::command]
pub async fn save_case_outcome(
    state: State<'_, AppState>,
    outcome: crate::db::CaseOutcomeRecord,
) -> Result<String, String> {
    with_db(state, |db| db.save_case_outcome(&outcome))
}

#[tauri::command]
pub async fn list_case_outcomes(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<crate::db::CaseOutcomeRecord>, String> {
    with_db(state, |db| {
        db.list_case_outcomes(limit.unwrap_or(50).min(200))
    })
}
