use crate::audit;
use crate::commands::model_commands::DOWNLOAD_CANCEL_FLAG;
use crate::downloads::{recommended_models, DownloadManager, ModelSource};
use crate::error::{AppError, ErrorCategory, ErrorCode};
use crate::model_integrity::{verify_model_integrity, ModelAllowlist, VerificationResult};
use std::sync::atomic::Ordering;
use tauri::Emitter;

/// Map a generic download-layer error to a categorized AppError with detail.
fn download_err(op: &str, e: impl std::fmt::Display) -> AppError {
    AppError::new(
        ErrorCode::INTERNAL_ERROR,
        format!("Model download {} failed", op),
        ErrorCategory::Internal,
    )
    .with_detail(e.to_string())
}

pub(crate) fn get_recommended_models_impl() -> Vec<ModelSource> {
    recommended_models()
}

pub(crate) fn list_downloaded_models_impl() -> Result<Vec<String>, AppError> {
    let app_dir = crate::db::get_app_data_dir();
    let manager = DownloadManager::new(&app_dir);
    let models = manager.list_models().map_err(|e| download_err("list", e))?;

    let model_ids: Vec<String> = models
        .into_iter()
        .filter_map(|p| {
            let filename = p.file_name()?.to_str()?;
            match filename {
                "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf" => {
                    Some("llama-3.1-8b-instruct".to_string())
                }
                "Llama-3.2-1B-Instruct-Q4_K_M.gguf" => Some("llama-3.2-1b-instruct".to_string()),
                "Llama-3.2-3B-Instruct-Q4_K_M.gguf" => Some("llama-3.2-3b-instruct".to_string()),
                "Phi-3.1-mini-4k-instruct-Q4_K_M.gguf" => {
                    Some("phi-3-mini-4k-instruct".to_string())
                }
                _ => None,
            }
        })
        .collect();

    Ok(model_ids)
}

pub(crate) fn get_embedding_model_path_impl(model_id: String) -> Result<Option<String>, AppError> {
    let filename = get_embedding_model_filename(&model_id)
        .ok_or_else(|| AppError::invalid_format(format!("Unknown embedding model ID: {}", model_id)))?;

    let app_dir = crate::db::get_app_data_dir();
    let model_path = app_dir.join("models").join(filename);

    if model_path.exists() {
        Ok(Some(model_path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

pub(crate) fn is_embedding_model_downloaded_impl() -> Result<bool, AppError> {
    let app_dir = crate::db::get_app_data_dir();
    let model_path = app_dir
        .join("models")
        .join("nomic-embed-text-v1.5.Q5_K_M.gguf");
    Ok(model_path.exists())
}

pub(crate) fn get_models_dir_impl() -> Result<String, AppError> {
    let app_dir = crate::db::get_app_data_dir();
    let manager = DownloadManager::new(&app_dir);
    Ok(manager.models_dir().display().to_string())
}

pub(crate) fn delete_downloaded_model_impl(filename: String) -> Result<(), AppError> {
    use std::path::Component;
    use std::path::Path;

    let path = Path::new(&filename);
    let mut components = path.components();
    let is_single_filename =
        matches!(components.next(), Some(Component::Normal(_))) && components.next().is_none();
    if path.is_absolute() || !is_single_filename {
        return Err(AppError::invalid_format("Invalid model filename"));
    }

    let has_gguf_ext = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("gguf"))
        .unwrap_or(false);
    if !has_gguf_ext {
        return Err(AppError::invalid_format(
            "Only .gguf model files can be deleted",
        ));
    }

    let app_dir = crate::db::get_app_data_dir();
    let manager = DownloadManager::new(&app_dir);
    manager
        .delete_model(&filename)
        .map_err(|e| download_err("delete", e))
}

pub(crate) fn get_model_source(model_id: &str) -> Result<(&'static str, &'static str), AppError> {
    match model_id {
        "llama-3.1-8b-instruct" => Ok((
            "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF",
            "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
        )),
        "llama-3.2-1b-instruct" => Ok((
            "bartowski/Llama-3.2-1B-Instruct-GGUF",
            "Llama-3.2-1B-Instruct-Q4_K_M.gguf",
        )),
        "llama-3.2-3b-instruct" => Ok((
            "bartowski/Llama-3.2-3B-Instruct-GGUF",
            "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
        )),
        "phi-3-mini-4k-instruct" => Ok((
            "bartowski/Phi-3.1-mini-4k-instruct-GGUF",
            "Phi-3.1-mini-4k-instruct-Q4_K_M.gguf",
        )),
        "nomic-embed-text" => Ok((
            "nomic-ai/nomic-embed-text-v1.5-GGUF",
            "nomic-embed-text-v1.5.Q5_K_M.gguf",
        )),
        _ => Err(AppError::invalid_format(format!(
            "Unknown model ID: {}",
            model_id
        ))),
    }
}

pub(crate) fn get_embedding_model_filename(model_id: &str) -> Option<&'static str> {
    match model_id {
        "nomic-embed-text" => Some("nomic-embed-text-v1.5.Q5_K_M.gguf"),
        _ => None,
    }
}

pub(crate) async fn download_model_impl(
    window: tauri::Window,
    model_id: String,
) -> Result<String, AppError> {
    let (repo, filename) = get_model_source(&model_id)?;
    audit::audit_model_download_started(&model_id, repo, filename);

    let app_dir = crate::db::get_app_data_dir();
    let manager = DownloadManager::new(&app_dir);
    manager.init().map_err(|e| download_err("init", e))?;

    let mut source = ModelSource::huggingface(repo, filename);
    let (size, sha256) = crate::downloads::fetch_hf_file_info(repo, filename)
        .await
        .map_err(|e| {
            audit::audit_model_download_failed(&model_id, "metadata_fetch_failed", &e.to_string());
            AppError::connection_failed(format!("Failed to fetch checksum metadata: {}", e))
        })?;
    let allowlist = ModelAllowlist::new();
    let allowed = allowlist.get_allowed_model(filename).ok_or_else(|| {
        audit::audit_model_download_failed(&model_id, "allowlist_missing", filename);
        AppError::new(
            ErrorCode::SECURITY_AUTH_FAILED,
            "Model is not in the allowlist",
            ErrorCategory::Security,
        )
    })?;

    if allowed.repo != repo {
        audit::audit_model_download_failed(&model_id, "allowlist_repo_mismatch", repo);
        return Err(AppError::new(
            ErrorCode::SECURITY_AUTH_FAILED,
            "Model allowlist mismatch (repo)",
            ErrorCategory::Security,
        ));
    }

    if allowed.size_bytes != size || allowed.sha256.to_lowercase() != sha256.to_lowercase() {
        audit::audit_model_download_failed(&model_id, "allowlist_metadata_mismatch", filename);
        return Err(AppError::new(
            ErrorCode::SECURITY_AUTH_FAILED,
            "Model allowlist mismatch (size or checksum)",
            ErrorCategory::Security,
        ));
    }

    source.size_bytes = Some(allowed.size_bytes);
    source.sha256 = Some(allowed.sha256.clone());

    let (tx, mut rx) = tokio::sync::mpsc::channel(100);
    DOWNLOAD_CANCEL_FLAG.store(false, Ordering::SeqCst);
    let cancel_flag = DOWNLOAD_CANCEL_FLAG.clone();

    let download_handle = {
        let cancel = cancel_flag.clone();
        tokio::spawn(async move { manager.download(&source, tx, cancel).await })
    };

    let window_clone = window.clone();
    let event_handle = tokio::spawn(async move {
        while let Some(progress) = rx.recv().await {
            let _ = window_clone.emit("download-progress", &progress);
        }
    });

    let download_result = download_handle.await.map_err(|e| {
        audit::audit_model_download_failed(&model_id, "download_task_failed", &e.to_string());
        AppError::internal(e.to_string())
    })?;

    let _ = event_handle.await;

    let result = download_result.map_err(|e| {
        audit::audit_model_download_failed(&model_id, "download_failed", &e.to_string());
        AppError::connection_failed(e.to_string())
    })?;

    let verify_path = result.clone();
    let verify_result =
        tokio::task::spawn_blocking(move || verify_model_integrity(&verify_path, true))
            .await
            .map_err(|e| {
                audit::audit_model_download_failed(
                    &model_id,
                    "integrity_task_failed",
                    &e.to_string(),
                );
                AppError::internal(e.to_string())
            })?;

    match verify_result {
        Ok(VerificationResult::Verified { sha256, .. }) => {
            audit::audit_model_integrity_verified(&model_id, &sha256);
        }
        Ok(VerificationResult::Unverified { sha256, .. }) => {
            audit::audit_model_integrity_unverified(&model_id, &sha256);
        }
        Err(e) => {
            audit::audit_model_download_failed(&model_id, "integrity_check_failed", &e.to_string());
            return Err(AppError::new(
                ErrorCode::SECURITY_AUTH_FAILED,
                "Model integrity verification failed",
                ErrorCategory::Security,
            )
            .with_detail(e.to_string()));
        }
    }

    audit::audit_model_download_completed(&model_id, &sha256, size);
    Ok(result.display().to_string())
}
