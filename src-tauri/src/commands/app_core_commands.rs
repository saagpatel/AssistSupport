use crate::error::AppError;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn check_fts5_enabled(state: State<'_, AppState>) -> Result<bool, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_lock.as_ref().ok_or_else(AppError::db_not_initialized)?;
    db.verify_fts5()
        .map_err(|e| AppError::db_query_failed(e.to_string()))
}

#[tauri::command]
pub fn check_db_integrity(state: State<'_, AppState>) -> Result<bool, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_lock.as_ref().ok_or_else(AppError::db_not_initialized)?;
    db.check_integrity()
        .map(|_| true)
        .map_err(|e| AppError::db_query_failed(e.to_string()))
}

#[tauri::command]
pub fn get_vector_consent(
    state: State<'_, AppState>,
) -> Result<crate::db::VectorConsent, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_lock.as_ref().ok_or_else(AppError::db_not_initialized)?;
    db.get_vector_consent()
        .map_err(|e| AppError::db_query_failed(e.to_string()))
}

#[tauri::command]
pub fn set_vector_consent(
    state: State<'_, AppState>,
    enabled: bool,
    encryption_supported: bool,
) -> Result<(), AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_lock.as_ref().ok_or_else(AppError::db_not_initialized)?;
    db.set_vector_consent(enabled, encryption_supported)
        .map_err(|e| AppError::db_query_failed(e.to_string()))
}
