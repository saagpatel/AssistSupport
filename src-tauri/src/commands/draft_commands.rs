use crate::db::{
    ActionShortcut, CustomVariable, Playbook, ResponseAlternative, ResponseTemplate, SavedDraft,
    SavedResponseTemplate,
};
use crate::exports::{
    format_draft, format_for_clipboard, ExportFormat as DraftExportFormat, ExportedSource,
    SafeExportOptions,
};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn list_drafts(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<SavedDraft>, String> {
    list_drafts_impl(state, limit)
}

#[tauri::command]
pub fn search_drafts(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SavedDraft>, String> {
    search_drafts_impl(state, query, limit)
}

#[tauri::command]
pub fn get_draft(state: State<'_, AppState>, draft_id: String) -> Result<SavedDraft, String> {
    get_draft_impl(state, draft_id)
}

#[tauri::command]
pub fn save_draft(state: State<'_, AppState>, draft: SavedDraft) -> Result<String, String> {
    save_draft_impl(state, draft)
}

#[tauri::command]
pub fn delete_draft(state: State<'_, AppState>, draft_id: String) -> Result<(), String> {
    delete_draft_impl(state, draft_id)
}

#[tauri::command]
pub fn export_draft_formatted(
    state: State<'_, AppState>,
    draft_id: String,
    format: String,
    safe_export: Option<SafeExportOptions>,
) -> Result<String, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    let draft = db.get_draft(&draft_id).map_err(|e| e.to_string())?;

    let response_text = draft.response_text.as_deref().unwrap_or("");
    let sources: Vec<ExportedSource> = draft
        .kb_sources_json
        .and_then(|json| serde_json::from_str::<Vec<serde_json::Value>>(&json).ok())
        .map(|sources| {
            sources
                .iter()
                .map(|source| ExportedSource {
                    title: source["title"].as_str().unwrap_or("Unknown").to_string(),
                    path: source["file_path"].as_str().map(|path| path.to_string()),
                    url: source["url"].as_str().map(|url| url.to_string()),
                })
                .collect()
        })
        .unwrap_or_default();

    let export_format = match format.as_str() {
        "html" => DraftExportFormat::Html,
        "ticket_html" => DraftExportFormat::TicketHtml,
        "json" => DraftExportFormat::Json,
        _ => DraftExportFormat::Plaintext,
    };

    Ok(format_draft(
        response_text,
        draft.summary_text.as_deref(),
        &sources,
        export_format,
        safe_export.as_ref(),
    ))
}

#[tauri::command]
pub fn format_draft_for_clipboard(
    state: State<'_, AppState>,
    draft_id: String,
    include_sources: bool,
) -> Result<String, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    let draft = db.get_draft(&draft_id).map_err(|e| e.to_string())?;

    let response_text = draft.response_text.as_deref().unwrap_or("");
    let sources: Vec<ExportedSource> = draft
        .kb_sources_json
        .and_then(|json| serde_json::from_str::<Vec<serde_json::Value>>(&json).ok())
        .map(|sources| {
            sources
                .iter()
                .map(|source| ExportedSource {
                    title: source["title"].as_str().unwrap_or("Unknown").to_string(),
                    path: source["file_path"].as_str().map(|path| path.to_string()),
                    url: source["url"].as_str().map(|url| url.to_string()),
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(format_for_clipboard(
        response_text,
        &sources,
        include_sources,
    ))
}

#[tauri::command]
pub fn list_autosaves(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<SavedDraft>, String> {
    list_autosaves_impl(state, limit)
}

#[tauri::command]
pub fn cleanup_autosaves(
    state: State<'_, AppState>,
    keep_count: Option<usize>,
) -> Result<usize, String> {
    cleanup_autosaves_impl(state, keep_count)
}

#[tauri::command]
pub fn get_draft_versions(
    state: State<'_, AppState>,
    input_hash: String,
) -> Result<Vec<SavedDraft>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.get_draft_versions(&input_hash).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_draft_version(
    state: State<'_, AppState>,
    draft_id: String,
    change_reason: Option<String>,
) -> Result<String, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.create_draft_version(&draft_id, change_reason.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_draft_versions(
    state: State<'_, AppState>,
    draft_id: String,
) -> Result<Vec<crate::db::DraftVersion>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.list_draft_versions(&draft_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn finalize_draft(
    state: State<'_, AppState>,
    draft_id: String,
    finalized_by: Option<String>,
) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.finalize_draft(&draft_id, finalized_by.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn archive_draft(state: State<'_, AppState>, draft_id: String) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.archive_draft(&draft_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_draft_handoff(
    state: State<'_, AppState>,
    draft_id: String,
    handoff_summary: String,
) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.update_draft_handoff(&draft_id, &handoff_summary)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_playbooks(
    state: State<'_, AppState>,
    category: Option<String>,
) -> Result<Vec<Playbook>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.list_playbooks(category.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_playbook(state: State<'_, AppState>, playbook_id: String) -> Result<Playbook, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.get_playbook(&playbook_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_playbook(state: State<'_, AppState>, playbook: Playbook) -> Result<String, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.save_playbook(&playbook).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn use_playbook(state: State<'_, AppState>, playbook_id: String) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.increment_playbook_usage(&playbook_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_playbook(state: State<'_, AppState>, playbook_id: String) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.delete_playbook(&playbook_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_action_shortcuts(
    state: State<'_, AppState>,
    category: Option<String>,
) -> Result<Vec<ActionShortcut>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.list_action_shortcuts(category.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_action_shortcut(
    state: State<'_, AppState>,
    shortcut_id: String,
) -> Result<ActionShortcut, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.get_action_shortcut(&shortcut_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_action_shortcut(
    state: State<'_, AppState>,
    shortcut: ActionShortcut,
) -> Result<String, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.save_action_shortcut(&shortcut)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_action_shortcut(
    state: State<'_, AppState>,
    shortcut_id: String,
) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.delete_action_shortcut(&shortcut_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_templates(state: State<'_, AppState>) -> Result<Vec<ResponseTemplate>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.list_templates().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_template(
    state: State<'_, AppState>,
    template_id: String,
) -> Result<ResponseTemplate, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.get_template(&template_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_template(
    state: State<'_, AppState>,
    template: ResponseTemplate,
) -> Result<String, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    let template_id = template.id.clone();
    db.save_template(&template).map_err(|e| e.to_string())?;
    Ok(template_id)
}

#[tauri::command]
pub fn delete_template(state: State<'_, AppState>, template_id: String) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.delete_template(&template_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_custom_variables(state: State<'_, AppState>) -> Result<Vec<CustomVariable>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.list_custom_variables().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_custom_variable(
    state: State<'_, AppState>,
    variable_id: String,
) -> Result<CustomVariable, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.get_custom_variable(&variable_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_custom_variable(
    state: State<'_, AppState>,
    variable: CustomVariable,
) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.save_custom_variable(&variable)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_custom_variable(
    state: State<'_, AppState>,
    variable_id: String,
) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.delete_custom_variable(&variable_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn restore_draft_version(
    state: State<'_, AppState>,
    draft_id: String,
    version_id: String,
) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.restore_draft_version(&draft_id, &version_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_response_as_template(
    state: State<'_, AppState>,
    source_draft_id: Option<String>,
    source_rating: Option<i32>,
    name: String,
    category: Option<String>,
    content: String,
    variables_json: Option<String>,
) -> Result<String, String> {
    crate::validation::validate_non_empty(&name).map_err(|e| e.to_string())?;
    crate::validation::validate_non_empty(&content).map_err(|e| e.to_string())?;

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let now = chrono::Utc::now().to_rfc3339();
    let template = SavedResponseTemplate {
        id: uuid::Uuid::new_v4().to_string(),
        source_draft_id,
        source_rating,
        name,
        category,
        content,
        variables_json,
        use_count: 0,
        created_at: now.clone(),
        updated_at: now,
    };

    db.save_response_as_template(&template)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_saved_response_templates(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<SavedResponseTemplate>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.list_saved_response_templates(limit.unwrap_or(20))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn increment_saved_template_usage(
    state: State<'_, AppState>,
    template_id: String,
) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.increment_saved_template_usage(&template_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn find_similar_saved_responses(
    state: State<'_, AppState>,
    input_text: String,
    limit: Option<usize>,
) -> Result<Vec<SavedResponseTemplate>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.find_similar_saved_responses(&input_text, limit.unwrap_or(5))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_response_alternative(
    state: State<'_, AppState>,
    draft_id: String,
    original_text: String,
    alternative_text: String,
    sources_json: Option<String>,
    metrics_json: Option<String>,
    generation_params_json: Option<String>,
) -> Result<String, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let now = chrono::Utc::now().to_rfc3339();
    let alternative = ResponseAlternative {
        id: uuid::Uuid::new_v4().to_string(),
        draft_id,
        original_text,
        alternative_text,
        sources_json,
        metrics_json,
        generation_params_json,
        chosen: None,
        created_at: now,
    };

    db.save_response_alternative(&alternative)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_alternatives_for_draft(
    state: State<'_, AppState>,
    draft_id: String,
) -> Result<Vec<ResponseAlternative>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.get_alternatives_for_draft(&draft_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn choose_alternative(
    state: State<'_, AppState>,
    alternative_id: String,
    choice: String,
) -> Result<(), String> {
    if choice != "original" && choice != "alternative" {
        return Err("Choice must be 'original' or 'alternative'".to_string());
    }

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.choose_alternative(&alternative_id, &choice)
        .map_err(|e| e.to_string())
}

pub(crate) fn list_drafts_impl(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<SavedDraft>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.list_drafts(limit.unwrap_or(50))
        .map_err(|e| e.to_string())
}

pub(crate) fn search_drafts_impl(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SavedDraft>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.search_drafts(&query, limit.unwrap_or(50))
        .map_err(|e| e.to_string())
}

pub(crate) fn get_draft_impl(
    state: State<'_, AppState>,
    draft_id: String,
) -> Result<SavedDraft, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.get_draft(&draft_id).map_err(|e| e.to_string())
}

pub(crate) fn save_draft_impl(
    state: State<'_, AppState>,
    draft: SavedDraft,
) -> Result<String, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.save_draft(&draft).map_err(|e| e.to_string())
}

pub(crate) fn delete_draft_impl(
    state: State<'_, AppState>,
    draft_id: String,
) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.delete_draft(&draft_id).map_err(|e| e.to_string())
}

pub(crate) fn list_autosaves_impl(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<SavedDraft>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.list_autosaves(limit.unwrap_or(10))
        .map_err(|e| e.to_string())
}

pub(crate) fn cleanup_autosaves_impl(
    state: State<'_, AppState>,
    keep_count: Option<usize>,
) -> Result<usize, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.cleanup_autosaves(keep_count.unwrap_or(10))
        .map_err(|e| e.to_string())
}
