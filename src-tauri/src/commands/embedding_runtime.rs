use super::vector_runtime::{ensure_vector_store_initialized, vector_store_requires_rebuild};
use crate::audit;
use crate::commands::model_commands::{EmbeddingGenerationResult, VectorStats};
use crate::db::{ChunkEmbeddingRecord, CURRENT_VECTOR_STORE_VERSION};
use crate::error::{AppError, ErrorCategory, ErrorCode};
use crate::kb::embeddings::EmbeddingModelInfo;
use crate::kb::vectors::VectorMetadata;
use crate::validation::validate_within_home;
use crate::AppState;
use tauri::Emitter;
use tauri::State;

/// Map a DB-layer error to a categorized AppError with upstream detail.
fn db_query_err(e: impl std::fmt::Display) -> AppError {
    AppError::db_query_failed(e.to_string())
}

/// Bridge stringly-typed errors from `vector_runtime` and vector-store calls
/// to AppError. These upstream APIs still return `Result<_, String>`, so we
/// classify them as internal errors with the original message as detail.
fn internal_err(e: impl std::fmt::Display) -> AppError {
    AppError::internal(e.to_string())
}

/// Map embedding-engine errors to `MODEL_GENERATION_FAILED` — used for
/// `embed_batch` and similar calls where the underlying engine failure
/// should surface as a model-category error.
fn embedding_err(e: impl std::fmt::Display) -> AppError {
    AppError::new(
        ErrorCode::MODEL_GENERATION_FAILED,
        "Embedding generation failed",
        ErrorCategory::Model,
    )
    .with_detail(e.to_string())
}

pub(crate) fn init_embedding_engine_impl(state: State<'_, AppState>) -> Result<(), AppError> {
    if state.embeddings.read().is_some() {
        return Ok(());
    }
    let backend = state
        .llama_backend()
        .map_err(|e| AppError::model_load_failed(e))?;
    let engine = crate::kb::embeddings::EmbeddingEngine::new(backend)
        .map_err(|e| AppError::model_load_failed(e.to_string()))?;
    *state.embeddings.write() = Some(engine);
    Ok(())
}

pub(crate) fn load_embedding_model_impl(
    state: State<'_, AppState>,
    path: String,
    n_gpu_layers: Option<u32>,
) -> Result<EmbeddingModelInfo, AppError> {
    use std::path::Path;

    let emb_guard = state.embeddings.read();
    let engine = emb_guard
        .as_ref()
        .ok_or_else(|| AppError::engine_not_initialized("Embedding"))?;

    let path = Path::new(&path);
    if !path.exists() {
        return Err(AppError::file_not_found(&path.display().to_string()));
    }

    // `validate_within_home` errors map via `From<ValidationError>`.
    let validated_path = validate_within_home(path)?;

    if !validated_path.is_file() {
        return Err(AppError::invalid_format(
            "Embedding model path is not a file",
        ));
    }

    let load_start = std::time::Instant::now();
    let layers = n_gpu_layers.unwrap_or(1000);

    let info = engine
        .load_model(&validated_path, layers)
        .map_err(|e| AppError::model_load_failed(e.to_string()))?;

    let load_time_ms = load_start.elapsed().as_millis() as i64;
    if let Ok(db_lock) = state.db.lock() {
        if let Some(db) = db_lock.as_ref() {
            let _ = db.save_model_state(
                "embeddings",
                validated_path.to_str().unwrap_or(""),
                None,
                Some(load_time_ms),
            );
        }
    }
    tracing::info!("Embedding model loaded in {}ms", load_time_ms);

    Ok(info)
}

pub(crate) fn unload_embedding_model_impl(state: State<'_, AppState>) -> Result<(), AppError> {
    let emb_guard = state.embeddings.read();
    let engine = emb_guard
        .as_ref()
        .ok_or_else(|| AppError::engine_not_initialized("Embedding"))?;
    engine.unload_model();
    if let Ok(db_lock) = state.db.lock() {
        if let Some(db) = db_lock.as_ref() {
            let _ = db.clear_model_state("embeddings");
        }
    }
    Ok(())
}

pub(crate) fn get_embedding_model_info_impl(
    state: State<'_, AppState>,
) -> Result<Option<EmbeddingModelInfo>, AppError> {
    let emb_guard = state.embeddings.read();
    let engine = emb_guard
        .as_ref()
        .ok_or_else(|| AppError::engine_not_initialized("Embedding"))?;
    Ok(engine.model_info())
}

pub(crate) fn is_embedding_model_loaded_impl(
    state: State<'_, AppState>,
) -> Result<bool, AppError> {
    let emb_guard = state.embeddings.read();
    match emb_guard.as_ref() {
        Some(engine) => Ok(engine.is_model_loaded()),
        None => Ok(false),
    }
}

pub(crate) async fn generate_kb_embeddings_internal(
    state: &AppState,
    app_handle: &tauri::AppHandle,
    reset_table: bool,
) -> Result<EmbeddingGenerationResult, AppError> {
    let consent_enabled = {
        let db_lock = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
        let db = db_lock.as_ref().ok_or_else(AppError::db_not_initialized)?;
        db.get_vector_consent().map_err(db_query_err)?.enabled
    };

    if !consent_enabled {
        return Err(AppError::new(
            ErrorCode::MODEL_ENGINE_NOT_INITIALIZED,
            "Vector search is disabled",
            ErrorCategory::Model,
        ));
    }

    {
        let embeddings_lock = state.embeddings.read();
        let embeddings = embeddings_lock
            .as_ref()
            .ok_or_else(|| AppError::engine_not_initialized("Embedding"))?;
        if !embeddings.is_model_loaded() {
            return Err(AppError::model_not_loaded());
        }
    }

    // `vector_runtime` still returns `Result<_, String>` — bridge to AppError.
    ensure_vector_store_initialized(state)
        .await
        ?;

    let chunks: Vec<ChunkEmbeddingRecord> = {
        let db_lock = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
        let db = db_lock.as_ref().ok_or_else(AppError::db_not_initialized)?;
        db.get_all_chunks_for_embedding().map_err(db_query_err)?
    };

    let requires_rebuild = {
        let tracked_vector_version = {
            let db_lock = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
            let db = db_lock.as_ref().ok_or_else(AppError::db_not_initialized)?;
            db.get_vector_store_version().map_err(db_query_err)?
        };
        let vectors_lock = state.vectors.read().await;
        let store = vectors_lock
            .as_ref()
            .ok_or_else(|| AppError::engine_not_initialized("Vector store"))?;
        vector_store_requires_rebuild(tracked_vector_version, store)
            .await
            ?
    };

    if reset_table || requires_rebuild {
        {
            let db_lock = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
            let db = db_lock.as_ref().ok_or_else(AppError::db_not_initialized)?;
            db.set_vector_store_version(0).map_err(db_query_err)?;
        }

        let mut vectors_lock = state.vectors.write().await;
        let store = vectors_lock
            .as_mut()
            .ok_or_else(|| AppError::engine_not_initialized("Vector store"))?;
        store.disable();
        store.reset_table().await.map_err(internal_err)?;
    }

    if chunks.is_empty() {
        {
            let db_lock = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
            let db = db_lock.as_ref().ok_or_else(AppError::db_not_initialized)?;
            db.set_vector_store_version(CURRENT_VECTOR_STORE_VERSION)
                .map_err(db_query_err)?;
        }

        let mut vectors_lock = state.vectors.write().await;
        if let Some(store) = vectors_lock.as_mut() {
            store.enable(true).map_err(internal_err)?;
        }

        let _ = app_handle.emit(
            "kb:embeddings:complete",
            serde_json::json!({
                "vectors_created": 0
            }),
        );

        audit::audit_vector_store_rebuilt("0 chunks");

        return Ok(EmbeddingGenerationResult {
            chunks_processed: 0,
            vectors_created: 0,
        });
    }

    let total_chunks = chunks.len();
    let batch_size: usize = 32;
    let mut vectors_created = 0;

    let _ = app_handle.emit(
        "kb:embeddings:start",
        serde_json::json!({
            "total_chunks": total_chunks
        }),
    );

    for (batch_idx, batch) in chunks.chunks(batch_size).enumerate() {
        let chunk_ids: Vec<String> = batch.iter().map(|chunk| chunk.chunk_id.clone()).collect();
        let chunk_texts: Vec<String> = batch.iter().map(|chunk| chunk.content.clone()).collect();
        let metadata: Vec<VectorMetadata> = batch
            .iter()
            .map(|chunk| VectorMetadata {
                namespace_id: chunk.namespace_id.clone(),
                document_id: chunk.document_id.clone(),
            })
            .collect();

        let embeddings: Vec<Vec<f32>> = {
            let embeddings_lock = state.embeddings.read();
            let engine = embeddings_lock
                .as_ref()
                .ok_or_else(|| AppError::engine_not_initialized("Embedding"))?;
            engine.embed_batch(&chunk_texts).map_err(embedding_err)?
        };

        {
            let vectors_lock = state.vectors.read().await;
            let vectors = vectors_lock
                .as_ref()
                .ok_or_else(|| AppError::engine_not_initialized("Vector store"))?;
            vectors
                .insert_embeddings_with_metadata(&chunk_ids, &embeddings, &metadata)
                .await
                .map_err(internal_err)?;
        }

        vectors_created += embeddings.len();

        let progress = ((batch_idx + 1) * batch_size).min(total_chunks);
        let _ = app_handle.emit(
            "kb:embeddings:progress",
            serde_json::json!({
                "processed": progress,
                "total": total_chunks,
                "percentage": (progress * 100) / total_chunks
            }),
        );
    }

    {
        let db_lock = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
        let db = db_lock.as_ref().ok_or_else(AppError::db_not_initialized)?;
        db.set_vector_store_version(CURRENT_VECTOR_STORE_VERSION)
            .map_err(db_query_err)?;
    }

    {
        let mut vectors_lock = state.vectors.write().await;
        if let Some(store) = vectors_lock.as_mut() {
            store.enable(true).map_err(internal_err)?;
        }
    }

    let _ = app_handle.emit(
        "kb:embeddings:complete",
        serde_json::json!({
            "vectors_created": vectors_created
        }),
    );

    audit::audit_vector_store_rebuilt(&format!(
        "{} chunks / {} vectors",
        total_chunks, vectors_created
    ));

    Ok(EmbeddingGenerationResult {
        chunks_processed: total_chunks,
        vectors_created,
    })
}

pub(crate) async fn init_vector_store_impl(state: State<'_, AppState>) -> Result<(), AppError> {
    ensure_vector_store_initialized(state.inner())
        .await
        ?;

    let ready = {
        let tracked_vector_version = {
            let db_lock = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
            let db = db_lock.as_ref().ok_or_else(AppError::db_not_initialized)?;
            db.get_vector_store_version().map_err(db_query_err)?
        };
        let vectors_lock = state.vectors.read().await;
        let store = vectors_lock
            .as_ref()
            .ok_or_else(|| AppError::engine_not_initialized("Vector store"))?;
        !vector_store_requires_rebuild(tracked_vector_version, store)
            .await
            ?
    };

    if ready {
        let consented = {
            let db_lock = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
            let db = db_lock.as_ref().ok_or_else(AppError::db_not_initialized)?;
            db.get_vector_consent().map_err(db_query_err)?.enabled
        };

        if consented {
            let mut vectors_lock = state.vectors.write().await;
            if let Some(store) = vectors_lock.as_mut() {
                store.enable(true).map_err(internal_err)?;
            }
        }
    }

    Ok(())
}

pub(crate) async fn set_vector_enabled_impl(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), AppError> {
    ensure_vector_store_initialized(state.inner())
        .await
        ?;

    if enabled {
        let tracked_vector_version = {
            let db_lock = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
            let db = db_lock.as_ref().ok_or_else(AppError::db_not_initialized)?;
            db.get_vector_store_version().map_err(db_query_err)?
        };
        let vectors_lock = state.vectors.read().await;
        let store = vectors_lock
            .as_ref()
            .ok_or_else(|| AppError::engine_not_initialized("Vector store"))?;
        if vector_store_requires_rebuild(tracked_vector_version, store)
            .await
            ?
        {
            return Err(AppError::invalid_format(
                "Vector store requires rebuild before it can be enabled",
            ));
        }
    }

    let mut vectors_lock = state.vectors.write().await;
    let store = vectors_lock
        .as_mut()
        .ok_or_else(|| AppError::engine_not_initialized("Vector store"))?;

    if enabled {
        store.enable(true).map_err(internal_err)?;
    } else {
        store.disable();
    }

    Ok(())
}

pub(crate) async fn is_vector_enabled_impl(state: State<'_, AppState>) -> Result<bool, AppError> {
    let vectors_lock = state.vectors.read().await;
    Ok(vectors_lock
        .as_ref()
        .map(|s| s.is_enabled())
        .unwrap_or(false))
}

pub(crate) async fn get_vector_stats_impl(
    state: State<'_, AppState>,
) -> Result<VectorStats, AppError> {
    let vectors_lock = state.vectors.read().await;
    let store = vectors_lock
        .as_ref()
        .ok_or_else(|| AppError::engine_not_initialized("Vector store"))?;

    let count = store.count().await.map_err(internal_err)?;

    Ok(VectorStats {
        enabled: store.is_enabled(),
        vector_count: count,
        embedding_dim: store.embedding_dim(),
        encryption_supported: store.encryption_supported(),
    })
}
