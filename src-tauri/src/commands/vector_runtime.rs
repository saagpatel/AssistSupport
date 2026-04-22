use crate::db::{get_vectors_dir, CURRENT_VECTOR_STORE_VERSION};
use crate::error::AppError;
use crate::kb::vectors::{VectorStore, VectorStoreConfig};
use crate::AppState;

/// Map any `VectorStore` / `DbError` -like error with a `Display` impl to the
/// standard internal AppError used across vector operations. Keeps the detail
/// for logging while emitting a stable code to the frontend.
fn vector_err(e: impl std::fmt::Display) -> AppError {
    AppError::internal(e.to_string())
}

fn current_vector_embedding_dim(state: &AppState) -> usize {
    let emb_guard = state.embeddings.read();
    emb_guard
        .as_ref()
        .and_then(|engine| engine.embedding_dim())
        .unwrap_or(768)
}

pub(crate) async fn ensure_vector_store_initialized(state: &AppState) -> Result<(), AppError> {
    let embedding_dim = current_vector_embedding_dim(state);
    let mut vectors_lock = state.vectors.write().await;
    if vectors_lock.is_some() {
        return Ok(());
    }

    let config = VectorStoreConfig {
        path: get_vectors_dir(),
        embedding_dim,
        encryption_enabled: false,
    };

    let mut store = VectorStore::new(config);
    store.init().await.map_err(vector_err)?;
    store.create_table().await.map_err(vector_err)?;
    *vectors_lock = Some(store);
    Ok(())
}

pub(crate) async fn vector_store_requires_rebuild(
    tracked_version: i32,
    store: &VectorStore,
) -> Result<bool, AppError> {
    if tracked_version < CURRENT_VECTOR_STORE_VERSION {
        return Ok(true);
    }

    store.requires_rebuild().await.map_err(vector_err)
}

pub(crate) async fn quarantine_vector_store(state: &AppState) -> Result<(), AppError> {
    ensure_vector_store_initialized(state).await?;

    {
        let mut vectors_lock = state.vectors.write().await;
        let store = vectors_lock.as_mut().ok_or_else(|| {
            AppError::new(
                crate::error::ErrorCode::INTERNAL_ERROR,
                "Vector store not initialized",
                crate::error::ErrorCategory::Internal,
            )
        })?;
        store.reset_table().await.map_err(vector_err)?;
        store.disable();
    }

    let db_lock = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_lock.as_ref().ok_or_else(AppError::db_not_initialized)?;
    db.set_vector_store_version(0)
        .map_err(|e| AppError::db_query_failed(e.to_string()))
}

pub(crate) async fn purge_vectors_for_document(
    state: &AppState,
    document_id: &str,
) -> Result<(), AppError> {
    ensure_vector_store_initialized(state).await?;

    let tracked_version = {
        let db_lock = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
        let db = db_lock.as_ref().ok_or_else(AppError::db_not_initialized)?;
        db.get_vector_store_version()
            .map_err(|e| AppError::db_query_failed(e.to_string()))?
    };

    let requires_rebuild = {
        let vectors_lock = state.vectors.read().await;
        let vectors = vectors_lock.as_ref().ok_or_else(|| {
            AppError::new(
                crate::error::ErrorCode::INTERNAL_ERROR,
                "Vector store not initialized",
                crate::error::ErrorCategory::Internal,
            )
        })?;
        vector_store_requires_rebuild(tracked_version, vectors).await?
    };

    if requires_rebuild {
        quarantine_vector_store(state).await?;
        return Ok(());
    }

    let vectors_lock = state.vectors.read().await;
    let vectors = vectors_lock.as_ref().ok_or_else(|| {
        AppError::new(
            crate::error::ErrorCode::INTERNAL_ERROR,
            "Vector store not initialized",
            crate::error::ErrorCategory::Internal,
        )
    })?;
    vectors
        .delete_by_document(document_id)
        .await
        .map_err(vector_err)
}

pub(crate) async fn purge_vectors_for_namespace(
    state: &AppState,
    namespace_id: &str,
) -> Result<(), AppError> {
    ensure_vector_store_initialized(state).await?;

    let tracked_version = {
        let db_lock = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
        let db = db_lock.as_ref().ok_or_else(AppError::db_not_initialized)?;
        db.get_vector_store_version()
            .map_err(|e| AppError::db_query_failed(e.to_string()))?
    };

    let requires_rebuild = {
        let vectors_lock = state.vectors.read().await;
        let vectors = vectors_lock.as_ref().ok_or_else(|| {
            AppError::new(
                crate::error::ErrorCode::INTERNAL_ERROR,
                "Vector store not initialized",
                crate::error::ErrorCategory::Internal,
            )
        })?;
        vector_store_requires_rebuild(tracked_version, vectors).await?
    };

    if requires_rebuild {
        quarantine_vector_store(state).await?;
        return Ok(());
    }

    let vectors_lock = state.vectors.read().await;
    let vectors = vectors_lock.as_ref().ok_or_else(|| {
        AppError::new(
            crate::error::ErrorCode::INTERNAL_ERROR,
            "Vector store not initialized",
            crate::error::ErrorCategory::Internal,
        )
    })?;
    vectors
        .delete_by_namespace(namespace_id)
        .await
        .map_err(vector_err)
}
