use super::vector_runtime::{ensure_vector_store_initialized, vector_store_requires_rebuild};
use crate::audit;
use crate::commands::model_commands::{EmbeddingGenerationResult, VectorStats};
use crate::db::{ChunkEmbeddingRecord, CURRENT_VECTOR_STORE_VERSION};
use crate::kb::embeddings::EmbeddingModelInfo;
use crate::kb::vectors::VectorMetadata;
use crate::validation::{validate_within_home, ValidationError};
use crate::AppState;
use tauri::Emitter;
use tauri::State;

pub(crate) fn init_embedding_engine_impl(state: State<'_, AppState>) -> Result<(), String> {
    if state.embeddings.read().is_some() {
        return Ok(());
    }
    let backend = state.llama_backend()?;
    let engine = crate::kb::embeddings::EmbeddingEngine::new(backend).map_err(|e| e.to_string())?;
    *state.embeddings.write() = Some(engine);
    Ok(())
}

pub(crate) fn load_embedding_model_impl(
    state: State<'_, AppState>,
    path: String,
    n_gpu_layers: Option<u32>,
) -> Result<EmbeddingModelInfo, String> {
    use std::path::Path;

    let emb_guard = state.embeddings.read();
    let engine = emb_guard
        .as_ref()
        .ok_or("Embedding engine not initialized")?;

    let path = Path::new(&path);
    if !path.exists() {
        return Err(format!(
            "Embedding model file not found: {}",
            path.display()
        ));
    }

    let validated_path = validate_within_home(path).map_err(|e| match e {
        ValidationError::PathTraversal => {
            "Embedding model file must be within your home directory".to_string()
        }
        ValidationError::InvalidFormat(msg) if msg.contains("sensitive") => {
            "This path is blocked because it contains sensitive data".to_string()
        }
        _ => format!("Invalid embedding model path: {}", e),
    })?;

    if !validated_path.is_file() {
        return Err("Embedding model path is not a file".into());
    }

    let load_start = std::time::Instant::now();
    let layers = n_gpu_layers.unwrap_or(1000);

    let info = engine
        .load_model(&validated_path, layers)
        .map_err(|e| e.to_string())?;

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

pub(crate) fn unload_embedding_model_impl(state: State<'_, AppState>) -> Result<(), String> {
    let emb_guard = state.embeddings.read();
    let engine = emb_guard
        .as_ref()
        .ok_or("Embedding engine not initialized")?;
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
) -> Result<Option<EmbeddingModelInfo>, String> {
    let emb_guard = state.embeddings.read();
    let engine = emb_guard
        .as_ref()
        .ok_or("Embedding engine not initialized")?;
    Ok(engine.model_info())
}

pub(crate) fn is_embedding_model_loaded_impl(state: State<'_, AppState>) -> Result<bool, String> {
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
) -> Result<EmbeddingGenerationResult, String> {
    let consent_enabled = {
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        let db = db_lock.as_ref().ok_or("Database not initialized")?;
        db.get_vector_consent()
            .map_err(|e| e.to_string())?
            .enabled
    };

    if !consent_enabled {
        return Err("Vector search is disabled".into());
    }

    {
        let embeddings_lock = state.embeddings.read();
        let embeddings = embeddings_lock
            .as_ref()
            .ok_or("Embedding engine not initialized")?;
        if !embeddings.is_model_loaded() {
            return Err("Embedding model not loaded".into());
        }
    }

    ensure_vector_store_initialized(state).await?;

    let chunks: Vec<ChunkEmbeddingRecord> = {
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        let db = db_lock.as_ref().ok_or("Database not initialized")?;
        db.get_all_chunks_for_embedding()
            .map_err(|e| e.to_string())?
    };

    let requires_rebuild = {
        let tracked_vector_version = {
            let db_lock = state.db.lock().map_err(|e| e.to_string())?;
            let db = db_lock.as_ref().ok_or("Database not initialized")?;
            db.get_vector_store_version().map_err(|e| e.to_string())?
        };
        let vectors_lock = state.vectors.read().await;
        let store = vectors_lock
            .as_ref()
            .ok_or("Vector store not initialized")?;
        vector_store_requires_rebuild(tracked_vector_version, store).await?
    };

    if reset_table || requires_rebuild {
        {
            let db_lock = state.db.lock().map_err(|e| e.to_string())?;
            let db = db_lock.as_ref().ok_or("Database not initialized")?;
            db.set_vector_store_version(0).map_err(|e| e.to_string())?;
        }

        let mut vectors_lock = state.vectors.write().await;
        let store = vectors_lock
            .as_mut()
            .ok_or("Vector store not initialized")?;
        store.disable();
        store.reset_table().await.map_err(|e| e.to_string())?;
    }

    if chunks.is_empty() {
        {
            let db_lock = state.db.lock().map_err(|e| e.to_string())?;
            let db = db_lock.as_ref().ok_or("Database not initialized")?;
            db.set_vector_store_version(CURRENT_VECTOR_STORE_VERSION)
                .map_err(|e| e.to_string())?;
        }

        let mut vectors_lock = state.vectors.write().await;
        if let Some(store) = vectors_lock.as_mut() {
            store.enable(true).map_err(|e| e.to_string())?;
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
                .ok_or("Embedding engine not available")?;
            engine
                .embed_batch(&chunk_texts)
                .map_err(|e| e.to_string())?
        };

        {
            let vectors_lock = state.vectors.read().await;
            let vectors = vectors_lock.as_ref().ok_or("Vector store not available")?;
            vectors
                .insert_embeddings_with_metadata(&chunk_ids, &embeddings, &metadata)
                .await
                .map_err(|e| e.to_string())?;
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
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        let db = db_lock.as_ref().ok_or("Database not initialized")?;
        db.set_vector_store_version(CURRENT_VECTOR_STORE_VERSION)
            .map_err(|e| e.to_string())?;
    }

    {
        let mut vectors_lock = state.vectors.write().await;
        if let Some(store) = vectors_lock.as_mut() {
            store.enable(true).map_err(|e| e.to_string())?;
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

pub(crate) async fn init_vector_store_impl(state: State<'_, AppState>) -> Result<(), String> {
    ensure_vector_store_initialized(state.inner()).await?;

    let ready = {
        let tracked_vector_version = {
            let db_lock = state.db.lock().map_err(|e| e.to_string())?;
            let db = db_lock.as_ref().ok_or("Database not initialized")?;
            db.get_vector_store_version().map_err(|e| e.to_string())?
        };
        let vectors_lock = state.vectors.read().await;
        let store = vectors_lock
            .as_ref()
            .ok_or("Vector store not initialized")?;
        !vector_store_requires_rebuild(tracked_vector_version, store).await?
    };

    if ready {
        let consented = {
            let db_lock = state.db.lock().map_err(|e| e.to_string())?;
            let db = db_lock.as_ref().ok_or("Database not initialized")?;
            db.get_vector_consent()
                .map_err(|e| e.to_string())?
                .enabled
        };

        if consented {
            let mut vectors_lock = state.vectors.write().await;
            if let Some(store) = vectors_lock.as_mut() {
                store.enable(true).map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(())
}

pub(crate) async fn set_vector_enabled_impl(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), String> {
    ensure_vector_store_initialized(state.inner()).await?;

    if enabled {
        let tracked_vector_version = {
            let db_lock = state.db.lock().map_err(|e| e.to_string())?;
            let db = db_lock.as_ref().ok_or("Database not initialized")?;
            db.get_vector_store_version().map_err(|e| e.to_string())?
        };
        let vectors_lock = state.vectors.read().await;
        let store = vectors_lock
            .as_ref()
            .ok_or("Vector store not initialized")?;
        if vector_store_requires_rebuild(tracked_vector_version, store).await? {
            return Err("Vector store requires rebuild before it can be enabled".into());
        }
    }

    let mut vectors_lock = state.vectors.write().await;
    let store = vectors_lock
        .as_mut()
        .ok_or("Vector store not initialized")?;

    if enabled {
        store.enable(true).map_err(|e| e.to_string())?;
    } else {
        store.disable();
    }

    Ok(())
}

pub(crate) async fn is_vector_enabled_impl(state: State<'_, AppState>) -> Result<bool, String> {
    let vectors_lock = state.vectors.read().await;
    Ok(vectors_lock
        .as_ref()
        .map(|s| s.is_enabled())
        .unwrap_or(false))
}

pub(crate) async fn get_vector_stats_impl(state: State<'_, AppState>) -> Result<VectorStats, String> {
    let vectors_lock = state.vectors.read().await;
    let store = vectors_lock
        .as_ref()
        .ok_or("Vector store not initialized")?;

    let count = store.count().await.map_err(|e| e.to_string())?;

    Ok(VectorStats {
        enabled: store.is_enabled(),
        vector_count: count,
        embedding_dim: store.embedding_dim(),
        encryption_supported: store.encryption_supported(),
    })
}
