use crate::commands::model_commands::DecisionTree;
use crate::error::AppError;
use crate::AppState;
use tauri::State;

pub(crate) fn list_decision_trees_impl(
    state: State<'_, AppState>,
) -> Result<Vec<DecisionTree>, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_lock.as_ref().ok_or_else(AppError::db_not_initialized)?;
    db.list_decision_trees()
        .map_err(|e| AppError::db_query_failed(e.to_string()))
}

pub(crate) fn get_decision_tree_impl(
    state: State<'_, AppState>,
    tree_id: String,
) -> Result<DecisionTree, AppError> {
    let db_lock = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_lock.as_ref().ok_or_else(AppError::db_not_initialized)?;
    db.get_decision_tree(&tree_id)
        .map_err(|e| AppError::db_query_failed(e.to_string()))
}
