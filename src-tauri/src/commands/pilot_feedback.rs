use crate::error::{AppError, ErrorCategory, ErrorCode};
use crate::validation::{validate_output_file_within_home, ValidationError};
use crate::AppState;
use std::path::Path;
use tauri::State;

const PILOT_LOGGING_POLICY_ENV: &str = "ASSISTSUPPORT_ENABLE_PILOT_LOGGING";
const PILOT_RETENTION_DAYS_ENV: &str = "ASSISTSUPPORT_PILOT_RETENTION_DAYS";
const PILOT_MAX_ROWS_ENV: &str = "ASSISTSUPPORT_PILOT_MAX_ROWS";

fn parse_bool_env(var: &str, default: bool) -> bool {
    std::env::var(var)
        .ok()
        .map(|value| value.trim().to_ascii_lowercase())
        .map(|value| matches!(value.as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(default)
}

fn parse_i64_env(var: &str, default: i64) -> i64 {
    std::env::var(var)
        .ok()
        .and_then(|v| v.trim().parse::<i64>().ok())
        .unwrap_or(default)
}

fn pilot_logging_enabled() -> bool {
    parse_bool_env(PILOT_LOGGING_POLICY_ENV, false)
}

fn require_pilot_logging_enabled() -> Result<(), AppError> {
    if pilot_logging_enabled() {
        Ok(())
    } else {
        Err(AppError::new(
            ErrorCode::SECURITY_PERMISSION_DENIED,
            format!(
                "Pilot logging is disabled by policy. Set {}=1 and restart AssistSupport to enable.",
                PILOT_LOGGING_POLICY_ENV
            ),
            ErrorCategory::Security,
        ))
    }
}

/// Map a `crate::feedback` string error to a properly-categorized AppError.
///
/// The feedback module returns stringly-typed errors today; until it migrates
/// we categorize as Database (its real source) with the message as detail.
fn feedback_err(op: &str, e: impl std::fmt::Display) -> AppError {
    AppError::new(
        ErrorCode::DB_QUERY_FAILED,
        format!("Pilot {} failed", op),
        ErrorCategory::Database,
    )
    .with_detail(e.to_string())
}

#[derive(serde::Serialize, Clone)]
pub struct PilotLoggingPolicy {
    pub enabled: bool,
    pub retention_days: i64,
    pub max_rows: i64,
}

#[tauri::command]
pub fn get_pilot_logging_policy() -> PilotLoggingPolicy {
    PilotLoggingPolicy {
        enabled: pilot_logging_enabled(),
        retention_days: parse_i64_env(PILOT_RETENTION_DAYS_ENV, 14).clamp(1, 365),
        max_rows: parse_i64_env(PILOT_MAX_ROWS_ENV, 500).clamp(50, 50_000),
    }
}

/// Log a query and its response for pilot tracking
#[tauri::command]
pub fn log_pilot_query(
    state: State<'_, AppState>,
    query: String,
    response: String,
    operator_id: String,
) -> Result<String, AppError> {
    require_pilot_logging_enabled()?;
    let db_lock = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_lock.as_ref().ok_or_else(AppError::db_not_initialized)?;
    crate::feedback::log_query(db, &query, &response, &operator_id)
        .map_err(|e| feedback_err("query log", e))
}

/// Submit user feedback on a pilot query response
#[tauri::command]
pub fn submit_pilot_feedback(
    state: State<'_, AppState>,
    query_log_id: String,
    operator_id: String,
    accuracy: i32,
    clarity: i32,
    helpfulness: i32,
    comment: Option<String>,
) -> Result<String, AppError> {
    require_pilot_logging_enabled()?;
    let db_lock = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_lock.as_ref().ok_or_else(AppError::db_not_initialized)?;
    crate::feedback::submit_feedback(
        db,
        &query_log_id,
        &operator_id,
        accuracy,
        clarity,
        helpfulness,
        comment.as_deref(),
    )
    .map_err(|e| feedback_err("feedback submission", e))
}

/// Get pilot dashboard summary stats
#[tauri::command]
pub fn get_pilot_stats(
    state: State<'_, AppState>,
) -> Result<crate::feedback::PilotStats, AppError> {
    require_pilot_logging_enabled()?;
    let db_lock = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_lock.as_ref().ok_or_else(AppError::db_not_initialized)?;
    crate::feedback::get_pilot_stats(db).map_err(|e| feedback_err("stats read", e))
}

/// Get all pilot query logs
#[tauri::command]
pub fn get_pilot_query_logs(
    state: State<'_, AppState>,
) -> Result<Vec<crate::feedback::QueryLog>, AppError> {
    require_pilot_logging_enabled()?;
    let db_lock = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_lock.as_ref().ok_or_else(AppError::db_not_initialized)?;
    crate::feedback::get_query_logs(db).map_err(|e| feedback_err("query logs read", e))
}

/// Export pilot data to CSV
#[tauri::command]
pub fn export_pilot_data(state: State<'_, AppState>, path: String) -> Result<usize, AppError> {
    require_pilot_logging_enabled()?;

    let candidate = Path::new(&path);
    let ext = candidate
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if ext != "csv" {
        return Err(AppError::invalid_format("Export path must be a .csv file"));
    }

    let validated_path = validate_output_file_within_home(candidate).map_err(|e| match e {
        ValidationError::PathTraversal => AppError::new(
            ErrorCode::VALIDATION_PATH_TRAVERSAL,
            "Export path must be within your home directory",
            ErrorCategory::Validation,
        ),
        ValidationError::PathNotFound(_) => {
            AppError::invalid_path("Export parent directory does not exist")
        }
        ValidationError::InvalidFormat(msg) if msg.contains("sensitive") => {
            AppError::sensitive_path()
        }
        other => AppError::invalid_path(format!("Invalid export path: {}", other)),
    })?;

    let db_lock = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_lock.as_ref().ok_or_else(AppError::db_not_initialized)?;
    crate::feedback::export::export_to_csv(db, validated_path.as_path())
        .map_err(|e| feedback_err("data export", e))
}
