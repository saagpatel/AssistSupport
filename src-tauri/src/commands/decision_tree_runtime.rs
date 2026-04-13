use crate::commands::model_commands::DecisionTree;
use crate::AppState;
use tauri::State;

pub(crate) fn list_decision_trees_impl(
    state: State<'_, AppState>,
) -> Result<Vec<DecisionTree>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.list_decision_trees().map_err(|e| e.to_string())
}

pub(crate) fn get_decision_tree_impl(
    state: State<'_, AppState>,
    tree_id: String,
) -> Result<DecisionTree, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.get_decision_tree(&tree_id).map_err(|e| e.to_string())
}
