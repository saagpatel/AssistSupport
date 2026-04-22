//! Tauri commands for AssistSupport
//!
//! Commands are organized into domain-specific submodules:
//! - backup: Export, backup, and restore operations
//! - diagnostics: Health checks and repair operations
//!
//! This file contains the remaining commands that are being gradually migrated.

// Domain-specific command modules
pub mod app_core_commands;
pub mod backup;
pub mod decision_tree_runtime;
pub mod diagnostics;
pub mod download_runtime;
pub mod draft_commands;
pub mod embedding_runtime;
pub mod jira_commands;
pub mod jobs_commands;
pub mod kb_commands;
pub mod memory_kernel;
pub mod model_commands;
pub mod model_runtime;
pub mod ocr_runtime;
pub mod operations_analytics_commands;
pub mod pilot_feedback;
pub mod product_workspace;
pub mod registry;
pub mod search_api;
pub mod security_commands;
pub mod startup_commands;
pub mod vector_runtime;

// Re-export commands from submodules
pub use backup::{export_backup, export_draft, import_backup, preview_backup_import, ExportFormat};
pub use diagnostics::{
    get_database_stats_cmd, get_failure_modes_cmd, get_llm_resource_limits,
    get_resource_metrics_cmd, get_system_health, get_vector_maintenance_info_cmd,
    rebuild_vector_store, repair_database_cmd, run_database_maintenance_cmd,
    run_quick_health_check, set_llm_resource_limits, QuickHealthResult,
};
pub use memory_kernel::{
    get_memory_kernel_integration_pin, get_memory_kernel_preflight_status, memory_kernel_query_ask,
    MemoryKernelEnrichmentResult, MemoryKernelIntegrationPin, MemoryKernelPreflightStatus,
};
pub use pilot_feedback::{
    export_pilot_data, get_pilot_logging_policy, get_pilot_query_logs, get_pilot_stats,
    log_pilot_query, submit_pilot_feedback, PilotLoggingPolicy,
};
pub use product_workspace::{
    add_runbook_step_evidence, cancel_collaboration_dispatch, delete_workspace_favorite,
    list_case_outcomes, list_dispatch_history, list_resolution_kits, list_runbook_step_evidence,
    list_runbook_templates, list_workspace_favorites, preview_collaboration_dispatch,
    save_case_outcome, save_resolution_kit, save_runbook_template, save_workspace_favorite,
    send_collaboration_dispatch,
};
pub use search_api::{
    check_search_api_health, get_search_api_health_status, get_search_api_stats, hybrid_search,
    submit_search_feedback, HybridSearchResponse, SearchApiHealthStatus, SearchApiStatsData,
};
pub use startup_commands::{
    check_keychain_available, initialize_app, unlock_with_passphrase, InitResult,
};
pub(crate) use vector_runtime::{
    ensure_vector_store_initialized, purge_vectors_for_document, purge_vectors_for_namespace,
    vector_store_requires_rebuild,
};

use crate::audit::{self};
use crate::db::{
    get_app_data_dir, ChunkEmbeddingRecord, GenerationQualityEvent, CURRENT_VECTOR_STORE_VERSION,
};
use crate::kb::vectors::VectorMetadata;
use crate::llm::{GenerationParams, LlmEngine, ModelInfo};
use crate::model_integrity::{verify_model_integrity, ModelAllowlist, VerificationResult};
use crate::security::{
    FileKeyStore, TOKEN_HUGGINGFACE, TOKEN_MEMORYKERNEL_SERVICE, TOKEN_SEARCH_API,
};
use crate::validation::{
    normalize_and_validate_namespace_id, validate_non_empty, validate_text_size,
    validate_within_home, ValidationError, MAX_QUERY_BYTES, MAX_TEXT_INPUT_BYTES,
};
use crate::AppState;
use once_cell::sync::Lazy;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::State;
use tokio::sync::mpsc;

/// Global cancel flag for generation - shared between generate and cancel commands
static GENERATION_CANCEL_FLAG: Lazy<Arc<AtomicBool>> =
    Lazy::new(|| Arc::new(AtomicBool::new(false)));
static DOWNLOAD_CANCEL_FLAG: Lazy<Arc<AtomicBool>> = Lazy::new(|| Arc::new(AtomicBool::new(false)));
const GITHUB_TOKEN_PREFIX: &str = "github_token:";
const ALLOW_UNVERIFIED_LOCAL_MODELS_KEY: &str = "allow_unverified_local_models";

fn normalize_github_host(host: &str) -> Result<String, crate::error::AppError> {
    use crate::error::AppError;
    let trimmed = host.trim();
    if trimmed.is_empty() {
        return Err(AppError::empty_input("GitHub host"));
    }
    if trimmed.contains("://") || trimmed.contains('/') {
        return Err(AppError::invalid_format(
            "GitHub host must be a hostname (no scheme or path)",
        ));
    }

    // Regex is a known-good constant — unwrap is safe, but prefer explicit err.
    let re = regex_lite::Regex::new(r"^[A-Za-z0-9.-]+(:[0-9]{1,5})?$")
        .map_err(|e| AppError::internal(format!("host-validation regex: {}", e)))?;
    if !re.is_match(trimmed) {
        return Err(AppError::invalid_format(
            "GitHub host contains invalid characters",
        ));
    }

    Ok(trimmed.to_lowercase())
}

fn allow_unverified_local_models(state: &AppState) -> Result<bool, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    let value = db
        .get_setting_value(ALLOW_UNVERIFIED_LOCAL_MODELS_KEY)
        .map_err(|e| e.to_string())?;
    Ok(matches!(
        value.as_deref(),
        Some("1") | Some("true") | Some("TRUE") | Some("True")
    ))
}

fn custom_model_verification_status(
    verification: VerificationResult,
    allow_unverified: bool,
) -> Result<(String, Option<String>), String> {
    match verification {
        VerificationResult::Verified { sha256, .. } => Ok(("verified".to_string(), Some(sha256))),
        VerificationResult::Unverified { sha256, .. } => {
            if !allow_unverified {
                return Err(
                    "This model is not on the verified allowlist. Enable the advanced override in Settings to load unverified local models."
                        .to_string(),
                );
            }
            Ok(("unverified".to_string(), Some(sha256)))
        }
    }
}

#[tauri::command]
pub fn get_allow_unverified_local_models(state: State<'_, AppState>) -> Result<bool, String> {
    allow_unverified_local_models(state.inner())
}

#[tauri::command]
pub fn set_allow_unverified_local_models(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.set_setting_value(
        ALLOW_UNVERIFIED_LOCAL_MODELS_KEY,
        if enabled { "true" } else { "false" },
    )
    .map_err(|e| e.to_string())
}

/// Verify FTS5 is available (release gate command)
pub fn check_fts5_enabled(state: State<'_, AppState>) -> Result<bool, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.verify_fts5().map_err(|e| e.to_string())
}

/// Check database integrity
pub fn check_db_integrity(state: State<'_, AppState>) -> Result<bool, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.check_integrity().map_err(|e| e.to_string())?;
    Ok(true)
}

/// Get vector search consent status
pub fn get_vector_consent(state: State<'_, AppState>) -> Result<crate::db::VectorConsent, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.get_vector_consent().map_err(|e| e.to_string())
}

/// Set vector search consent (requires explicit opt-in if unencrypted)
pub fn set_vector_consent(
    state: State<'_, AppState>,
    enabled: bool,
    encryption_supported: bool,
) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.set_vector_consent(enabled, encryption_supported)
        .map_err(|e| e.to_string())
}

/// Search options for advanced search tuning
#[derive(Debug, Clone, serde::Deserialize)]
pub struct SearchOptionsParam {
    /// Weight for FTS5 results (0.0-1.0, default 0.5)
    pub fts_weight: Option<f64>,
    /// Weight for vector results (0.0-1.0, default 0.5)
    pub vector_weight: Option<f64>,
    /// Enable deduplication (default true)
    pub enable_dedup: Option<bool>,
    /// Deduplication threshold (0.0-1.0, default 0.85)
    pub dedup_threshold: Option<f64>,
}

/// Hybrid search for KB (FTS5 + vector when enabled)
/// Uses parallel execution when vector search is available
pub async fn search_kb(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
    namespace_id: Option<String>,
) -> Result<Vec<crate::kb::search::SearchResult>, String> {
    search_kb_with_options(state, query, limit, namespace_id, None).await
}

/// Advanced search with configurable options
pub async fn search_kb_with_options(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
    namespace_id: Option<String>,
    options: Option<SearchOptionsParam>,
) -> Result<Vec<crate::kb::search::SearchResult>, String> {
    use crate::kb::search::{HybridSearch, SearchOptions};

    // Validate query input
    validate_non_empty(&query).map_err(|e| e.to_string())?;
    validate_text_size(&query, MAX_QUERY_BYTES).map_err(|e| e.to_string())?;

    // Validate and normalize namespace_id if provided
    let namespace_id = namespace_id
        .map(|ns| normalize_and_validate_namespace_id(&ns))
        .transpose()
        .map_err(|e| e.to_string())?;

    let limit = limit.unwrap_or(10).min(100); // Cap limit at 100

    // Build search options
    let mut search_opts = SearchOptions::new(limit)
        .with_namespace(namespace_id.clone())
        .with_query_text(&query);

    if let Some(opts) = options {
        if let (Some(fts_w), Some(vec_w)) = (opts.fts_weight, opts.vector_weight) {
            search_opts = search_opts.with_weights(fts_w, vec_w);
        }
        if let Some(enable) = opts.enable_dedup {
            let threshold = opts.dedup_threshold.unwrap_or(0.85);
            search_opts = search_opts.with_dedup(enable, threshold);
        }
    }

    let ns_id = namespace_id.clone();
    let ns_id_for_vector = namespace_id.clone();

    // Get query embedding if vector search is available (sync operation)
    let query_embedding = {
        let vectors_lock = state.vectors.read().await;
        let embeddings_lock = state.embeddings.read();

        if let (Some(vectors), Some(embeddings)) = (vectors_lock.as_ref(), embeddings_lock.as_ref())
        {
            if vectors.is_enabled() && embeddings.is_model_loaded() {
                embeddings.embed(&query).ok()
            } else {
                None
            }
        } else {
            None
        }
    }; // Locks released here

    // Clone state references for parallel execution
    let vectors_state = state.vectors.clone();

    // Start vector search as a spawned task (runs in parallel with FTS)
    let vector_handle = tokio::spawn(async move {
        if let Some(embedding) = query_embedding {
            let vectors_lock = vectors_state.read().await;
            if let Some(vectors) = vectors_lock.as_ref() {
                return vectors
                    .search_similar_in_namespace(&embedding, ns_id_for_vector.as_deref(), limit * 3)
                    .await
                    .ok();
            }
        }
        None
    });

    // Do FTS search (sync, fast) - runs while vector search is in progress
    let fts_results = {
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        let db = db_lock.as_ref().ok_or("Database not initialized")?;
        HybridSearch::fts_search_with_namespace(db, &query, ns_id.as_deref(), limit * 3)
            .map_err(|e| e.to_string())?
    }; // DB lock released here

    // Wait for vector search to complete
    let vector_results = vector_handle.await.unwrap_or(None);

    // Re-acquire DB lock for fusion (needed for vector result enrichment)
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    // Fuse results with configurable options (weights, dedup)
    let mut results = HybridSearch::fuse_results_with_options(
        db,
        fts_results,
        vector_results,
        search_opts.clone(),
    )
    .map_err(|e| e.to_string())?;

    // Apply post-processing (policy boost, score normalization, snippet sanitization)
    results = HybridSearch::post_process_results(results, &search_opts);

    Ok(results)
}

/// Get formatted context for LLM injection from search results
pub async fn get_search_context(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
    namespace_id: Option<String>,
) -> Result<String, String> {
    let results = search_kb(state, query, limit, namespace_id).await?;
    Ok(crate::kb::search::HybridSearch::format_context(&results))
}

// ============================================================================
// LLM Commands
// ============================================================================

/// Initialize the LLM engine (idempotent — skips if already initialized)
pub fn init_llm_engine(state: State<'_, AppState>) -> Result<(), String> {
    if state.llm.read().is_some() {
        return Ok(());
    }
    let backend = state.llama_backend()?;
    let engine = LlmEngine::new(backend).map_err(|e| e.to_string())?;
    *state.llm.write() = Some(engine);
    Ok(())
}

/// Load a model by ID
pub fn load_model(
    state: State<'_, AppState>,
    model_id: String,
    n_gpu_layers: Option<u32>,
) -> Result<ModelInfo, String> {
    let load_start = std::time::Instant::now();

    // Get filename from model ID
    let (_, filename) = get_model_source(&model_id)?;

    // Build path to model file
    let models_dir = crate::db::get_models_dir();
    let path = models_dir.join(filename);

    if !path.exists() {
        return Err(format!(
            "Model file not found: {}. Please download the model first.",
            filename
        ));
    }

    let llm_guard = state.llm.read();
    let engine = llm_guard.as_ref().ok_or("LLM engine not initialized")?;

    let layers = n_gpu_layers.unwrap_or(1000); // Default to full GPU offload

    let info = engine
        .load_model(&path, layers, model_id.clone())
        .map_err(|e| e.to_string())?;

    // Record model state for auto-load on next startup
    let load_time_ms = load_start.elapsed().as_millis() as i64;
    if let Ok(db_lock) = state.db.lock() {
        if let Some(db) = db_lock.as_ref() {
            let _ = db.save_model_state(
                "llm",
                path.to_str().unwrap_or(""),
                Some(&model_id),
                Some(load_time_ms),
            );
        }
    }
    tracing::info!("LLM model '{}' loaded in {}ms", model_id, load_time_ms);

    Ok(info)
}

/// Load a custom GGUF model from a file path
pub fn load_custom_model(
    state: State<'_, AppState>,
    model_path: String,
    n_gpu_layers: Option<u32>,
) -> Result<ModelInfo, String> {
    use std::path::Path;

    let path = Path::new(&model_path);

    // Validate path exists
    if !path.exists() {
        return Err(format!("Model file not found: {}", model_path));
    }

    let validated_path = validate_within_home(path).map_err(|e| match e {
        ValidationError::PathTraversal => {
            "Model file must be within your home directory".to_string()
        }
        ValidationError::InvalidFormat(msg) if msg.contains("sensitive") => {
            "This path is blocked because it contains sensitive data".to_string()
        }
        _ => format!("Invalid model path: {}", e),
    })?;

    if !validated_path.is_file() {
        return Err("Model path is not a file".into());
    }

    // Validate GGUF extension
    let ext = validated_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    if ext.to_lowercase() != "gguf" {
        return Err("Invalid file type. Only .gguf files are supported.".into());
    }

    // Validate file size (at least 1MB, sanity check)
    let metadata = std::fs::metadata(&validated_path).map_err(|e| e.to_string())?;
    if metadata.len() < 1_000_000 {
        return Err("File too small to be a valid GGUF model.".into());
    }

    let model_id = validated_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("custom-model")
        .to_string();

    // Custom models are permitted, but should be treated as unverified unless allowlisted.
    // Log a warning/audit entry so operators understand the trust tradeoff.
    let allow_unverified = allow_unverified_local_models(state.inner())?;
    let (verification_status, verification_sha256) = custom_model_verification_status(
        verify_model_integrity(&validated_path, false)
            .map_err(|e| format!("Model integrity verification failed: {}", e))?,
        allow_unverified,
    )?;

    match verification_status.as_str() {
        "verified" => {
            if let Some(sha256) = verification_sha256.as_deref() {
                audit::audit_model_integrity_verified(&model_id, sha256);
            }
        }
        "unverified" => {
            if let Some(sha256) = verification_sha256.as_deref() {
                audit::audit_model_integrity_unverified(&model_id, sha256);
                tracing::warn!(
                    "Loading unverified model '{}' (sha256: {}). Prefer allowlisted models.",
                    model_id,
                    sha256
                );
            }
        }
        _ => {}
    }

    let llm_guard = state.llm.read();
    let engine = llm_guard.as_ref().ok_or("LLM engine not initialized")?;

    let layers = n_gpu_layers.unwrap_or(1000); // Default to full GPU offload

    let mut info = engine
        .load_model(&validated_path, layers, model_id)
        .map_err(|e| e.to_string())?;
    info.verification_status = Some(verification_status);

    if let Ok(db_lock) = state.db.lock() {
        if let Some(db) = db_lock.as_ref() {
            let _ = db.save_model_state(
                "llm",
                validated_path.to_string_lossy().as_ref(),
                Some(info.id.as_str()),
                None,
            );
        }
    }

    Ok(info)
}

/// Validate a GGUF file without loading it (returns model metadata)
pub fn validate_gguf_file(model_path: String) -> Result<GgufFileInfo, String> {
    use std::fs;
    use std::path::Path;

    let path = Path::new(&model_path);

    if !path.exists() {
        return Err(format!("File not found: {}", model_path));
    }

    let validated_path = validate_within_home(path).map_err(|e| match e {
        ValidationError::PathTraversal => {
            "Model file must be within your home directory".to_string()
        }
        ValidationError::InvalidFormat(msg) if msg.contains("sensitive") => {
            "This path is blocked because it contains sensitive data".to_string()
        }
        _ => format!("Invalid model path: {}", e),
    })?;

    if !validated_path.is_file() {
        return Err("Model path is not a file".into());
    }

    let ext = validated_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    if ext.to_lowercase() != "gguf" {
        return Err("Invalid file type. Only .gguf files are supported.".into());
    }

    let metadata = fs::metadata(&validated_path).map_err(|e| e.to_string())?;
    let filename = validated_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // Check GGUF magic bytes (optional, basic validation)
    let mut file = fs::File::open(&validated_path).map_err(|e| e.to_string())?;
    let mut magic = [0u8; 4];
    use std::io::Read;
    file.read_exact(&mut magic).map_err(|e| e.to_string())?;

    // GGUF magic is "GGUF" in ASCII
    if &magic != b"GGUF" {
        return Err("Invalid GGUF file: magic bytes mismatch".into());
    }

    let integrity_status = match verify_model_integrity(&validated_path, false) {
        Ok(VerificationResult::Verified { .. }) => "verified".to_string(),
        Ok(VerificationResult::Unverified { .. }) => "unverified".to_string(),
        Err(e) => return Err(format!("Model integrity verification failed: {}", e)),
    };

    Ok(GgufFileInfo {
        path: validated_path.to_string_lossy().to_string(),
        filename,
        size_bytes: metadata.len(),
        is_valid: true,
        integrity_status,
    })
}

/// Information about a GGUF file
#[derive(Debug, Clone, serde::Serialize)]
pub struct GgufFileInfo {
    pub path: String,
    #[serde(rename = "file_name")]
    pub filename: String,
    #[serde(rename = "file_size")]
    pub size_bytes: u64,
    pub is_valid: bool,
    pub integrity_status: String,
}

/// Unload the current model
pub fn unload_model(state: State<'_, AppState>) -> Result<(), String> {
    let llm_guard = state.llm.read();
    let engine = llm_guard.as_ref().ok_or("LLM engine not initialized")?;
    engine.unload_model();
    // Clear model state
    if let Ok(db_lock) = state.db.lock() {
        if let Some(db) = db_lock.as_ref() {
            let _ = db.clear_model_state("llm");
        }
    }
    Ok(())
}

/// Get current model info
pub fn get_model_info(state: State<'_, AppState>) -> Result<Option<ModelInfo>, String> {
    let llm_guard = state.llm.read();
    let engine = llm_guard.as_ref().ok_or("LLM engine not initialized")?;
    Ok(engine.model_info())
}

/// Check if a model is loaded
pub fn is_model_loaded(state: State<'_, AppState>) -> Result<bool, String> {
    let llm_guard = state.llm.read();
    match llm_guard.as_ref() {
        Some(engine) => Ok(engine.is_model_loaded()),
        None => Ok(false),
    }
}

/// Generation parameters for the API
#[derive(serde::Deserialize)]
pub struct GenerateParams {
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
    pub top_k: Option<i32>,
    pub repeat_penalty: Option<f32>,
    pub context_window: Option<u32>,
}

impl From<GenerateParams> for GenerationParams {
    fn from(p: GenerateParams) -> Self {
        let mut params = GenerationParams::default();
        if let Some(v) = p.max_tokens {
            params.max_tokens = v;
        }
        if let Some(v) = p.temperature {
            params.temperature = v;
        }
        if let Some(v) = p.top_p {
            params.top_p = v;
        }
        if let Some(v) = p.top_k {
            params.top_k = v;
        }
        if let Some(v) = p.repeat_penalty {
            params.repeat_penalty = v;
        }
        params.context_window = p.context_window;
        params
    }
}

/// Generation result
#[derive(serde::Serialize)]
pub struct GenerationResult {
    pub text: String,
    pub tokens_generated: u32,
    pub duration_ms: u64,
}

/// Generate text (non-streaming, for simple use cases)
pub async fn generate_text(
    state: State<'_, AppState>,
    prompt: String,
    params: Option<GenerateParams>,
) -> Result<GenerationResult, String> {
    // Validate prompt input
    validate_non_empty(&prompt).map_err(|e| e.to_string())?;
    validate_text_size(&prompt, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;

    // Clone the Arc to use in async context
    let llm = state.llm.clone();

    // Get engine state without holding lock across await
    let engine_state = {
        let llm_guard = llm.read();
        let engine = llm_guard.as_ref().ok_or("LLM engine not initialized")?;
        if !engine.is_model_loaded() {
            return Err("No model loaded".into());
        }
        engine.state.clone()
    }; // Lock released here

    let gen_params = params.map(|p| p.into()).unwrap_or_default();

    let (tx, mut rx) = mpsc::channel(100);
    let cancel_flag = Arc::new(std::sync::atomic::AtomicBool::new(false));

    // Start generation in background
    let prompt_clone = prompt.clone();
    let cancel_clone = cancel_flag.clone();
    let tx_clone = tx.clone();

    tokio::spawn(async move {
        let temp_engine = LlmEngine {
            state: engine_state,
        };
        let _ = temp_engine
            .generate_streaming(&prompt_clone, gen_params, tx_clone, cancel_clone)
            .await;
    });

    // Collect output
    let mut text = String::new();
    let mut tokens_generated = 0u32;
    let mut duration_ms = 0u64;

    while let Some(event) = rx.recv().await {
        match event {
            crate::llm::GenerationEvent::Token(t) => text.push_str(&t),
            crate::llm::GenerationEvent::Done {
                tokens_generated: t,
                duration_ms: d,
            } => {
                tokens_generated = t;
                duration_ms = d;
                break;
            }
            crate::llm::GenerationEvent::Error(e) => return Err(e),
        }
    }

    Ok(GenerationResult {
        text,
        tokens_generated,
        duration_ms,
    })
}

/// Parameters for context-aware generation
#[derive(serde::Deserialize)]
pub struct GenerateWithContextParams {
    /// User's input text (ticket content, question)
    pub user_input: String,
    /// Optional KB search query (defaults to user_input if not provided)
    pub kb_query: Option<String>,
    /// Number of KB results to include (default: 3)
    pub kb_limit: Option<usize>,
    /// OCR text from screenshots
    pub ocr_text: Option<String>,
    /// Diagnostic notes
    pub diagnostic_notes: Option<String>,
    /// Decision tree results
    pub tree_decisions: Option<crate::prompts::TreeDecisions>,
    /// Jira ticket for context
    pub jira_ticket: Option<crate::jira::JiraTicket>,
    /// Response length preference
    pub response_length: Option<crate::prompts::ResponseLength>,
    /// Generation parameters
    pub gen_params: Option<GenerateParams>,
}

/// Quality metrics for generation
#[derive(serde::Serialize)]
pub struct GenerationMetrics {
    /// Tokens generated per second
    pub tokens_per_second: f64,
    /// Number of KB sources used in context
    pub sources_used: u32,
    /// Approximate word count of response
    pub word_count: u32,
    /// Response length vs target (Short/Medium/Long)
    pub length_target_met: bool,
    /// Percentage of context window used
    pub context_utilization: f64,
}

/// Confidence mode for trust-gated generation.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConfidenceMode {
    Answer,
    Clarify,
    Abstain,
}

/// Confidence assessment attached to generated output.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ConfidenceAssessment {
    pub mode: ConfidenceMode,
    pub score: f64,
    pub rationale: String,
}

/// Grounding result for a generated claim.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GroundedClaim {
    pub claim: String,
    pub source_indexes: Vec<usize>,
    pub support_level: String,
}

/// Result of context-aware generation
#[derive(serde::Serialize)]
pub struct GenerateWithContextResult {
    /// Generated response text
    pub text: String,
    /// Number of tokens generated
    pub tokens_generated: u32,
    /// Generation duration in milliseconds
    pub duration_ms: u64,
    /// KB chunk IDs used as sources
    pub source_chunk_ids: Vec<String>,
    /// KB search results used for context
    pub sources: Vec<ContextSource>,
    /// Quality metrics for the generation
    pub metrics: GenerationMetrics,
    /// Prompt template version used for this generation (for A/B tracking)
    pub prompt_template_version: String,
    /// Confidence-gating decision.
    pub confidence: ConfidenceAssessment,
    /// Per-claim grounding map.
    pub grounding: Vec<GroundedClaim>,
}

/// First-response tone for Slack/Jira
#[derive(Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FirstResponseTone {
    Slack,
    Jira,
}

/// Parameters for first-response generation
#[derive(serde::Deserialize)]
pub struct FirstResponseParams {
    pub user_input: String,
    pub tone: FirstResponseTone,
    pub ocr_text: Option<String>,
    pub jira_ticket: Option<crate::jira::JiraTicket>,
}

/// First-response generation result
#[derive(serde::Serialize)]
pub struct FirstResponseResult {
    pub text: String,
    pub tokens_generated: u32,
    pub duration_ms: u64,
}

/// Checklist item generated by the LLM
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct ChecklistItem {
    pub id: String,
    pub text: String,
    pub category: Option<String>,
    pub priority: Option<String>,
    pub details: Option<String>,
}

/// Checklist state for updates
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct ChecklistState {
    pub items: Vec<ChecklistItem>,
    pub completed_ids: Vec<String>,
}

/// Parameters for checklist generation
#[derive(serde::Deserialize)]
pub struct ChecklistGenerateParams {
    pub user_input: String,
    pub ocr_text: Option<String>,
    pub diagnostic_notes: Option<String>,
    pub tree_decisions: Option<crate::prompts::TreeDecisions>,
    pub jira_ticket: Option<crate::jira::JiraTicket>,
}

/// Parameters for checklist update
#[derive(serde::Deserialize)]
pub struct ChecklistUpdateParams {
    pub user_input: String,
    pub ocr_text: Option<String>,
    pub diagnostic_notes: Option<String>,
    pub tree_decisions: Option<crate::prompts::TreeDecisions>,
    pub jira_ticket: Option<crate::jira::JiraTicket>,
    pub checklist: ChecklistState,
}

/// Checklist generation result
#[derive(serde::Serialize, serde::Deserialize)]
pub struct ChecklistResult {
    pub items: Vec<ChecklistItem>,
}

/// Source information for context
#[derive(serde::Serialize)]
pub struct ContextSource {
    pub chunk_id: String,
    pub document_id: String,
    pub file_path: String,
    pub title: Option<String>,
    pub heading_path: Option<String>,
    pub score: f64,
    pub search_method: Option<String>,
    pub source_type: Option<String>,
}

fn extract_json_block(text: &str) -> Option<&str> {
    let trimmed = text.trim();
    let first_brace = trimmed.find('{');
    let first_bracket = trimmed.find('[');

    let (start_idx, open_char, close_char) = match (first_brace, first_bracket) {
        (Some(b), Some(a)) => {
            if b < a {
                (b, '{', '}')
            } else {
                (a, '[', ']')
            }
        }
        (Some(b), None) => (b, '{', '}'),
        (None, Some(a)) => (a, '[', ']'),
        (None, None) => return None,
    };

    let mut depth = 0i32;
    for (idx, ch) in trimmed.char_indices().skip(start_idx) {
        if ch == open_char {
            depth += 1;
        } else if ch == close_char {
            depth -= 1;
            if depth == 0 {
                return Some(&trimmed[start_idx..=idx]);
            }
        }
    }

    None
}

fn normalize_category(value: Option<String>) -> Option<String> {
    let normalized = value?.trim().to_lowercase();
    match normalized.as_str() {
        "triage" | "diagnostic" | "resolution" | "escalation" => Some(normalized),
        _ => None,
    }
}

fn normalize_priority(value: Option<String>) -> Option<String> {
    let normalized = value?.trim().to_lowercase();
    match normalized.as_str() {
        "high" | "medium" | "low" => Some(normalized),
        _ => None,
    }
}

fn normalize_checklist_items(mut items: Vec<ChecklistItem>) -> Vec<ChecklistItem> {
    use std::collections::HashSet;

    const MAX_ITEMS: usize = 10;
    let mut seen_texts = HashSet::new();
    let mut seen_ids = HashSet::new();
    let mut normalized = Vec::new();

    for (idx, item) in items.drain(..).enumerate() {
        let text = item.text.trim();
        if text.is_empty() {
            continue;
        }

        let normalized_text = text.split_whitespace().collect::<Vec<_>>().join(" ");
        let text_key = normalized_text.to_lowercase();
        if !seen_texts.insert(text_key) {
            continue;
        }

        let mut id = item.id.trim().to_string();
        if id.is_empty() {
            id = format!("step-{}", idx + 1);
        }
        if !seen_ids.insert(id.clone()) {
            let mut suffix = 2;
            let mut candidate = format!("{}-{}", id, suffix);
            while !seen_ids.insert(candidate.clone()) {
                suffix += 1;
                candidate = format!("{}-{}", id, suffix);
            }
            id = candidate;
        }

        normalized.push(ChecklistItem {
            id,
            text: normalized_text,
            category: normalize_category(item.category),
            priority: normalize_priority(item.priority),
            details: item
                .details
                .map(|d| d.trim().to_string())
                .filter(|d| !d.is_empty()),
        });

        if normalized.len() >= MAX_ITEMS {
            break;
        }
    }

    normalized
}

fn parse_checklist_output(raw: &str) -> Result<Vec<ChecklistItem>, String> {
    let trimmed = raw.trim();
    let json_candidate = extract_json_block(trimmed).unwrap_or(trimmed);

    if let Ok(wrapper) = serde_json::from_str::<ChecklistResult>(json_candidate) {
        return Ok(normalize_checklist_items(wrapper.items));
    }

    if let Ok(items) = serde_json::from_str::<Vec<ChecklistItem>>(json_candidate) {
        return Ok(normalize_checklist_items(items));
    }

    Err("Checklist response was not valid JSON.".to_string())
}

fn extract_output_section_for_grounding(text: &str) -> String {
    let lower = text.to_lowercase();
    let output_header = "### output";
    let instructions_header = "### it support instructions";
    if let Some(output_idx) = lower.find(output_header) {
        let content_start = output_idx + output_header.len();
        let content_end = lower[content_start..]
            .find(instructions_header)
            .map(|idx| content_start + idx)
            .unwrap_or(text.len());
        text[content_start..content_end].trim().to_string()
    } else {
        text.trim().to_string()
    }
}

fn split_claims(text: &str) -> Vec<String> {
    let mut claims = Vec::new();
    let mut current = String::new();

    for ch in text.chars() {
        current.push(ch);
        if matches!(ch, '.' | '!' | '?') {
            let claim = current.trim();
            if !claim.is_empty() {
                claims.push(claim.to_string());
            }
            current.clear();
        }
    }

    let tail = current.trim();
    if !tail.is_empty() {
        claims.push(tail.to_string());
    }

    if claims.is_empty() {
        text.lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .map(|line| line.trim_start_matches("- ").to_string())
            .collect()
    } else {
        claims
    }
}

fn parse_source_indexes(claim: &str, source_count: usize) -> Vec<usize> {
    let mut indexes = Vec::new();
    let re = regex_lite::Regex::new(r"(?i)\[source\s+(\d+)\]")
        .expect("source citation regex must compile");

    for caps in re.captures_iter(claim) {
        let parsed = caps
            .get(1)
            .and_then(|m| m.as_str().parse::<usize>().ok())
            .unwrap_or(0);
        if parsed > 0 {
            let index = parsed - 1;
            if index < source_count && !indexes.contains(&index) {
                indexes.push(index);
            }
        }
    }
    indexes
}

fn build_grounding(claims: &[String], sources: &[ContextSource]) -> Vec<GroundedClaim> {
    claims
        .iter()
        .map(|claim| {
            let source_indexes = parse_source_indexes(claim, sources.len());
            let support_level = if source_indexes.is_empty() {
                "unsupported".to_string()
            } else {
                let avg = source_indexes
                    .iter()
                    .map(|i| sources[*i].score)
                    .sum::<f64>()
                    / source_indexes.len() as f64;
                if avg >= 0.75 {
                    "strong".to_string()
                } else if avg >= 0.5 {
                    "moderate".to_string()
                } else {
                    "weak".to_string()
                }
            };

            GroundedClaim {
                claim: claim.clone(),
                source_indexes,
                support_level,
            }
        })
        .collect()
}

fn assess_confidence(
    grounding: &[GroundedClaim],
    sources: &[ContextSource],
) -> ConfidenceAssessment {
    let source_count = sources.len();
    let avg_source_score = if source_count > 0 {
        sources.iter().map(|s| s.score).sum::<f64>() / source_count as f64
    } else {
        0.0
    };

    let total_claims = grounding.len();
    let unsupported_claims = grounding
        .iter()
        .filter(|c| c.support_level == "unsupported")
        .count();
    let coverage = if total_claims > 0 {
        1.0 - (unsupported_claims as f64 / total_claims as f64)
    } else {
        0.0
    };
    let score = ((avg_source_score * 0.6) + (coverage * 0.4)).clamp(0.0, 1.0);

    let (mode, rationale) = if source_count == 0 || score < 0.45 {
        (
            ConfidenceMode::Abstain,
            "Low retrieval confidence or no grounded evidence".to_string(),
        )
    } else if score < 0.7 || unsupported_claims > 0 {
        (
            ConfidenceMode::Clarify,
            "Some claims are weakly grounded; clarify before sending".to_string(),
        )
    } else {
        (
            ConfidenceMode::Answer,
            "Strong grounded evidence across cited sources".to_string(),
        )
    };

    ConfidenceAssessment {
        mode,
        score,
        rationale,
    }
}

/// Generate text with KB context injection
pub async fn generate_with_context(
    state: State<'_, AppState>,
    params: GenerateWithContextParams,
) -> Result<GenerateWithContextResult, String> {
    use crate::prompts::PromptBuilder;

    validate_non_empty(&params.user_input).map_err(|e| e.to_string())?;
    validate_text_size(&params.user_input, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    if let Some(query) = &params.kb_query {
        validate_text_size(query, MAX_QUERY_BYTES).map_err(|e| e.to_string())?;
    }
    if let Some(ocr) = &params.ocr_text {
        validate_text_size(ocr, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    }
    if let Some(notes) = &params.diagnostic_notes {
        validate_text_size(notes, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    }

    // Search KB if database is available
    let kb_results = {
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        if let Some(db) = db_lock.as_ref() {
            let query = params.kb_query.as_ref().unwrap_or(&params.user_input);
            let limit = params.kb_limit.unwrap_or(3);
            crate::kb::search::HybridSearch::search(db, query, limit).unwrap_or_default()
        } else {
            vec![]
        }
    };

    // Build sources info for response
    let sources: Vec<ContextSource> = kb_results
        .iter()
        .map(|r| ContextSource {
            chunk_id: r.chunk_id.clone(),
            document_id: r.document_id.clone(),
            file_path: r.file_path.clone(),
            title: r.title.clone(),
            heading_path: r.heading_path.clone(),
            score: r.score,
            search_method: Some(format!("{:?}", r.source)),
            source_type: r.source_type.clone(),
        })
        .collect();

    // Build prompt with context
    let mut builder = PromptBuilder::new()
        .with_kb_results(kb_results)
        .with_user_input(&params.user_input);

    if let Some(ocr) = &params.ocr_text {
        builder = builder.with_ocr_text(ocr);
    }

    if let Some(notes) = &params.diagnostic_notes {
        builder = builder.with_diagnostic_notes(notes);
    }

    if let Some(tree) = params.tree_decisions {
        builder = builder.with_tree_decisions(tree);
    }

    if let Some(ticket) = params.jira_ticket {
        builder = builder.with_jira_ticket(ticket);
    }

    if let Some(length) = params.response_length {
        builder = builder.with_response_length(length);
    }

    let source_chunk_ids = builder.get_source_chunk_ids();
    let response_length = params.response_length.unwrap_or_default();
    let prompt = builder.build();
    let prompt_length = prompt.len();

    validate_text_size(&prompt, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;

    // Generate using the built prompt
    let gen_result = generate_text(state.clone(), prompt, params.gen_params).await?;

    // Calculate quality metrics
    let word_count = gen_result.text.split_whitespace().count() as u32;
    let target_words = response_length.target_words() as u32;
    let length_target_met = match response_length {
        crate::prompts::ResponseLength::Short => word_count <= target_words + 40,
        crate::prompts::ResponseLength::Medium => {
            word_count >= target_words / 2 && word_count <= target_words * 2
        }
        crate::prompts::ResponseLength::Long => word_count >= target_words / 2,
    };

    let tokens_per_second = if gen_result.duration_ms > 0 {
        (gen_result.tokens_generated as f64 * 1000.0) / gen_result.duration_ms as f64
    } else {
        0.0
    };

    // Estimate context utilization (prompt tokens / typical 4096 context window)
    let estimated_prompt_tokens = prompt_length / 4;
    let context_window = 4096; // Default, could be read from model
    let context_utilization =
        (estimated_prompt_tokens as f64 / context_window as f64 * 100.0).min(100.0);

    let metrics = GenerationMetrics {
        tokens_per_second,
        sources_used: sources.len() as u32,
        word_count,
        length_target_met,
        context_utilization,
    };

    let output_section = extract_output_section_for_grounding(&gen_result.text);
    let claims = split_claims(&output_section);
    let grounding = build_grounding(&claims, &sources);
    let confidence = assess_confidence(&grounding, &sources);

    let confidence_mode = match confidence.mode {
        ConfidenceMode::Answer => "answer",
        ConfidenceMode::Clarify => "clarify",
        ConfidenceMode::Abstain => "abstain",
    };
    let unsupported_claims = grounding
        .iter()
        .filter(|claim| claim.support_level == "unsupported")
        .count() as i32;
    let avg_source_score = if sources.is_empty() {
        0.0
    } else {
        sources.iter().map(|s| s.score).sum::<f64>() / sources.len() as f64
    };
    if let Ok(db_lock) = state.db.lock() {
        if let Some(db) = db_lock.as_ref() {
            let _ = db.record_generation_quality_event(GenerationQualityEvent {
                query_text: &params.user_input,
                confidence_mode,
                confidence_score: confidence.score,
                unsupported_claims,
                total_claims: grounding.len() as i32,
                source_count: sources.len() as i32,
                avg_source_score,
            });
        }
    }

    Ok(GenerateWithContextResult {
        text: gen_result.text,
        tokens_generated: gen_result.tokens_generated,
        duration_ms: gen_result.duration_ms,
        source_chunk_ids,
        sources,
        metrics,
        prompt_template_version: crate::prompts::PROMPT_TEMPLATE_VERSION.to_string(),
        confidence,
        grounding,
    })
}

/// Streaming token event
#[derive(Clone, serde::Serialize)]
pub struct StreamToken {
    pub token: String,
    pub done: bool,
}

/// Generate text with streaming (emits events as tokens are generated)
pub async fn generate_streaming(
    window: tauri::Window,
    state: State<'_, AppState>,
    params: GenerateWithContextParams,
) -> Result<GenerateWithContextResult, String> {
    use crate::prompts::PromptBuilder;

    validate_non_empty(&params.user_input).map_err(|e| e.to_string())?;
    validate_text_size(&params.user_input, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    if let Some(query) = &params.kb_query {
        validate_text_size(query, MAX_QUERY_BYTES).map_err(|e| e.to_string())?;
    }
    if let Some(ocr) = &params.ocr_text {
        validate_text_size(ocr, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    }
    if let Some(notes) = &params.diagnostic_notes {
        validate_text_size(notes, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    }

    // Search KB if database is available
    let kb_results = {
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        if let Some(db) = db_lock.as_ref() {
            let query = params.kb_query.as_ref().unwrap_or(&params.user_input);
            let limit = params.kb_limit.unwrap_or(3);
            crate::kb::search::HybridSearch::search(db, query, limit).unwrap_or_default()
        } else {
            vec![]
        }
    };

    // Build sources info for response
    let sources: Vec<ContextSource> = kb_results
        .iter()
        .map(|r| ContextSource {
            chunk_id: r.chunk_id.clone(),
            document_id: r.document_id.clone(),
            file_path: r.file_path.clone(),
            title: r.title.clone(),
            heading_path: r.heading_path.clone(),
            score: r.score,
            search_method: Some(format!("{:?}", r.source)),
            source_type: r.source_type.clone(),
        })
        .collect();

    // Build prompt with context
    let mut builder = PromptBuilder::new()
        .with_kb_results(kb_results)
        .with_user_input(&params.user_input);

    if let Some(ocr) = &params.ocr_text {
        builder = builder.with_ocr_text(ocr);
    }

    if let Some(notes) = &params.diagnostic_notes {
        builder = builder.with_diagnostic_notes(notes);
    }

    if let Some(tree) = params.tree_decisions {
        builder = builder.with_tree_decisions(tree);
    }

    if let Some(ticket) = params.jira_ticket {
        builder = builder.with_jira_ticket(ticket);
    }

    if let Some(length) = params.response_length {
        builder = builder.with_response_length(length);
    }

    let source_chunk_ids = builder.get_source_chunk_ids();
    let response_length = params.response_length.unwrap_or_default();
    let prompt = builder.build();
    let prompt_length = prompt.len();

    validate_text_size(&prompt, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;

    // Get engine state
    let llm = state.llm.clone();
    let engine_state = {
        let llm_guard = llm.read();
        let engine = llm_guard.as_ref().ok_or("LLM engine not initialized")?;
        if !engine.is_model_loaded() {
            return Err("No model loaded".into());
        }
        engine.state.clone()
    };

    let gen_params = params.gen_params.map(|p| p.into()).unwrap_or_default();

    let (tx, mut rx) = mpsc::channel(100);

    // Reset the global cancel flag before starting
    GENERATION_CANCEL_FLAG.store(false, Ordering::SeqCst);
    let cancel_flag = GENERATION_CANCEL_FLAG.clone();

    // Start generation in background
    let prompt_clone = prompt.clone();
    let cancel_clone = cancel_flag.clone();
    let tx_clone = tx.clone();

    tokio::spawn(async move {
        let temp_engine = LlmEngine {
            state: engine_state,
        };
        let _ = temp_engine
            .generate_streaming(&prompt_clone, gen_params, tx_clone, cancel_clone)
            .await;
    });

    // Forward tokens to frontend as events and collect output
    let mut text = String::new();
    let mut tokens_generated = 0u32;
    let mut duration_ms = 0u64;

    while let Some(event) = rx.recv().await {
        match event {
            crate::llm::GenerationEvent::Token(t) => {
                // Emit token to frontend
                let _ = window.emit(
                    "llm-token",
                    StreamToken {
                        token: t.clone(),
                        done: false,
                    },
                );
                text.push_str(&t);
            }
            crate::llm::GenerationEvent::Done {
                tokens_generated: t,
                duration_ms: d,
            } => {
                tokens_generated = t;
                duration_ms = d;
                // Emit done signal
                let _ = window.emit(
                    "llm-token",
                    StreamToken {
                        token: String::new(),
                        done: true,
                    },
                );
                break;
            }
            crate::llm::GenerationEvent::Error(e) => {
                let _ = window.emit(
                    "llm-token",
                    StreamToken {
                        token: String::new(),
                        done: true,
                    },
                );
                return Err(e);
            }
        }
    }

    // Calculate quality metrics
    let word_count = text.split_whitespace().count() as u32;
    let target_words = response_length.target_words() as u32;
    let length_target_met = match response_length {
        crate::prompts::ResponseLength::Short => word_count <= target_words + 40,
        crate::prompts::ResponseLength::Medium => {
            word_count >= target_words / 2 && word_count <= target_words * 2
        }
        crate::prompts::ResponseLength::Long => word_count >= target_words / 2,
    };

    let tokens_per_second = if duration_ms > 0 {
        (tokens_generated as f64 * 1000.0) / duration_ms as f64
    } else {
        0.0
    };

    // Estimate context utilization (prompt tokens / typical 4096 context window)
    let estimated_prompt_tokens = prompt_length / 4;
    let context_window = 4096; // Default, could be read from model
    let context_utilization =
        (estimated_prompt_tokens as f64 / context_window as f64 * 100.0).min(100.0);

    let metrics = GenerationMetrics {
        tokens_per_second,
        sources_used: sources.len() as u32,
        word_count,
        length_target_met,
        context_utilization,
    };

    let output_section = extract_output_section_for_grounding(&text);
    let claims = split_claims(&output_section);
    let grounding = build_grounding(&claims, &sources);
    let confidence = assess_confidence(&grounding, &sources);

    let confidence_mode = match confidence.mode {
        ConfidenceMode::Answer => "answer",
        ConfidenceMode::Clarify => "clarify",
        ConfidenceMode::Abstain => "abstain",
    };
    let unsupported_claims = grounding
        .iter()
        .filter(|claim| claim.support_level == "unsupported")
        .count() as i32;
    let avg_source_score = if sources.is_empty() {
        0.0
    } else {
        sources.iter().map(|s| s.score).sum::<f64>() / sources.len() as f64
    };
    if let Ok(db_lock) = state.db.lock() {
        if let Some(db) = db_lock.as_ref() {
            let _ = db.record_generation_quality_event(GenerationQualityEvent {
                query_text: &params.user_input,
                confidence_mode,
                confidence_score: confidence.score,
                unsupported_claims,
                total_claims: grounding.len() as i32,
                source_count: sources.len() as i32,
                avg_source_score,
            });
        }
    }

    Ok(GenerateWithContextResult {
        text,
        tokens_generated,
        duration_ms,
        source_chunk_ids,
        sources,
        metrics,
        prompt_template_version: crate::prompts::PROMPT_TEMPLATE_VERSION.to_string(),
        confidence,
        grounding,
    })
}

/// Generate a short first-response message for Slack or Jira
pub async fn generate_first_response(
    state: State<'_, AppState>,
    params: FirstResponseParams,
) -> Result<FirstResponseResult, String> {
    use crate::prompts::{
        PromptBuilder, ResponseLength, FIRST_RESPONSE_JIRA_PROMPT, FIRST_RESPONSE_SLACK_PROMPT,
    };

    validate_non_empty(&params.user_input).map_err(|e| e.to_string())?;
    validate_text_size(&params.user_input, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    if let Some(ocr) = &params.ocr_text {
        validate_text_size(ocr, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    }

    let system_prompt = match params.tone {
        FirstResponseTone::Slack => FIRST_RESPONSE_SLACK_PROMPT,
        FirstResponseTone::Jira => FIRST_RESPONSE_JIRA_PROMPT,
    };

    let mut builder = PromptBuilder::new()
        .with_system_prompt(system_prompt)
        .with_user_input(&params.user_input)
        .with_response_length(ResponseLength::Short);

    if let Some(ocr) = &params.ocr_text {
        builder = builder.with_ocr_text(ocr);
    }

    if let Some(ticket) = params.jira_ticket {
        builder = builder.with_jira_ticket(ticket);
    }

    let prompt = builder.build();
    validate_text_size(&prompt, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;

    let gen_result = generate_text(
        state,
        prompt,
        Some(GenerateParams {
            max_tokens: Some(200),
            temperature: Some(0.4),
            top_p: Some(0.9),
            top_k: None,
            repeat_penalty: Some(1.05),
            context_window: None,
        }),
    )
    .await?;

    Ok(FirstResponseResult {
        text: gen_result.text.trim().to_string(),
        tokens_generated: gen_result.tokens_generated,
        duration_ms: gen_result.duration_ms,
    })
}

/// Generate a troubleshooting checklist for the issue
pub async fn generate_troubleshooting_checklist(
    state: State<'_, AppState>,
    params: ChecklistGenerateParams,
) -> Result<ChecklistResult, String> {
    use crate::prompts::{PromptBuilder, ResponseLength, CHECKLIST_SYSTEM_PROMPT};

    validate_non_empty(&params.user_input).map_err(|e| e.to_string())?;
    validate_text_size(&params.user_input, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    if let Some(ocr) = &params.ocr_text {
        validate_text_size(ocr, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    }
    if let Some(notes) = &params.diagnostic_notes {
        validate_text_size(notes, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    }

    let mut builder = PromptBuilder::new()
        .with_system_prompt(CHECKLIST_SYSTEM_PROMPT)
        .with_user_input(&params.user_input)
        .with_response_length(ResponseLength::Long);

    if let Some(ocr) = &params.ocr_text {
        builder = builder.with_ocr_text(ocr);
    }

    if let Some(notes) = &params.diagnostic_notes {
        builder = builder.with_diagnostic_notes(notes);
    }

    if let Some(tree) = params.tree_decisions {
        builder = builder.with_tree_decisions(tree);
    }

    if let Some(ticket) = params.jira_ticket {
        builder = builder.with_jira_ticket(ticket);
    }

    let prompt = builder.build();
    validate_text_size(&prompt, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;

    let gen_result = generate_text(
        state,
        prompt,
        Some(GenerateParams {
            max_tokens: Some(400),
            temperature: Some(0.2),
            top_p: Some(0.9),
            top_k: None,
            repeat_penalty: Some(1.05),
            context_window: None,
        }),
    )
    .await?;

    let items = parse_checklist_output(&gen_result.text)?;
    Ok(ChecklistResult { items })
}

/// Update an existing troubleshooting checklist based on completed steps
pub async fn update_troubleshooting_checklist(
    state: State<'_, AppState>,
    params: ChecklistUpdateParams,
) -> Result<ChecklistResult, String> {
    use crate::prompts::{PromptBuilder, ResponseLength, CHECKLIST_UPDATE_SYSTEM_PROMPT};
    use std::collections::HashSet;

    validate_non_empty(&params.user_input).map_err(|e| e.to_string())?;
    validate_text_size(&params.user_input, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    if let Some(ocr) = &params.ocr_text {
        validate_text_size(ocr, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    }
    if let Some(notes) = &params.diagnostic_notes {
        validate_text_size(notes, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    }

    let items = normalize_checklist_items(params.checklist.items);
    let valid_ids: HashSet<&str> = items.iter().map(|item| item.id.as_str()).collect();
    let completed_ids: Vec<String> = params
        .checklist
        .completed_ids
        .into_iter()
        .filter(|id| valid_ids.contains(id.as_str()))
        .collect();

    let checklist_state = ChecklistState {
        items,
        completed_ids,
    };

    let checklist_json = serde_json::to_string_pretty(&checklist_state)
        .or_else(|_| serde_json::to_string(&checklist_state))
        .map_err(|e| e.to_string())?;

    let completed_label = if checklist_state.completed_ids.is_empty() {
        "none".to_string()
    } else {
        checklist_state.completed_ids.join(", ")
    };

    let update_context = format!(
        "Current checklist JSON:\n{}\n\nCompleted item IDs: {}",
        checklist_json, completed_label
    );

    let mut builder = PromptBuilder::new()
        .with_system_prompt(CHECKLIST_UPDATE_SYSTEM_PROMPT)
        .with_user_input(&params.user_input)
        .with_response_length(ResponseLength::Long)
        .with_extra_section("Checklist Update Context", &update_context);

    if let Some(ocr) = &params.ocr_text {
        builder = builder.with_ocr_text(ocr);
    }

    if let Some(notes) = &params.diagnostic_notes {
        builder = builder.with_diagnostic_notes(notes);
    }

    if let Some(tree) = params.tree_decisions {
        builder = builder.with_tree_decisions(tree);
    }

    if let Some(ticket) = params.jira_ticket {
        builder = builder.with_jira_ticket(ticket);
    }

    let prompt = builder.build();
    validate_text_size(&prompt, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;

    let gen_result = generate_text(
        state,
        prompt,
        Some(GenerateParams {
            max_tokens: Some(400),
            temperature: Some(0.2),
            top_p: Some(0.9),
            top_k: None,
            repeat_penalty: Some(1.05),
            context_window: None,
        }),
    )
    .await?;

    let items = parse_checklist_output(&gen_result.text)?;
    Ok(ChecklistResult { items })
}

/// Test model with a simple prompt
pub async fn test_model(state: State<'_, AppState>) -> Result<TestModelResult, String> {
    let result = generate_text(
        state,
        "Say hello in one sentence.".to_string(),
        Some(GenerateParams {
            max_tokens: Some(50),
            temperature: Some(0.7),
            top_p: None,
            top_k: None,
            repeat_penalty: None,
            context_window: None,
        }),
    )
    .await?;

    let tokens_per_sec = if result.duration_ms > 0 {
        (result.tokens_generated as f64 / result.duration_ms as f64) * 1000.0
    } else {
        0.0
    };

    Ok(TestModelResult {
        output: result.text,
        tokens_generated: result.tokens_generated,
        duration_ms: result.duration_ms,
        tokens_per_sec,
    })
}

/// Cancel an ongoing text generation
pub fn cancel_generation() -> Result<(), String> {
    GENERATION_CANCEL_FLAG.store(true, Ordering::SeqCst);
    Ok(())
}

/// Test model result
#[derive(serde::Serialize)]
pub struct TestModelResult {
    pub output: String,
    pub tokens_generated: u32,
    pub duration_ms: u64,
    pub tokens_per_sec: f64,
}

const CONTEXT_WINDOW_SETTING: &str = "llm_context_window";

/// Get the configured context window size
pub fn get_context_window(state: State<'_, AppState>) -> Result<Option<u32>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let result: Result<String, _> = db.conn().query_row(
        "SELECT value FROM settings WHERE key = ?",
        rusqlite::params![CONTEXT_WINDOW_SETTING],
        |row| row.get(0),
    );

    match result {
        Ok(value) => {
            let parsed = value.parse::<u32>().ok();
            Ok(parsed)
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Set the context window size (2048-32768, or None for model default)
pub fn set_context_window(state: State<'_, AppState>, size: Option<u32>) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    match size {
        Some(s) => {
            // Validate range
            if !(2048..=32768).contains(&s) {
                return Err("Context window must be between 2048 and 32768".to_string());
            }
            db.conn()
                .execute(
                    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                    rusqlite::params![CONTEXT_WINDOW_SETTING, s.to_string()],
                )
                .map_err(|e| e.to_string())?;
        }
        None => {
            // Remove setting to use model default
            db.conn()
                .execute(
                    "DELETE FROM settings WHERE key = ?",
                    rusqlite::params![CONTEXT_WINDOW_SETTING],
                )
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

// ============================================================================
// Download Commands
// ============================================================================

use crate::downloads::{recommended_models, DownloadManager, ModelSource};

/// Get recommended models list
pub fn get_recommended_models() -> Vec<ModelSource> {
    recommended_models()
}

/// List downloaded models
pub fn list_downloaded_models() -> Result<Vec<String>, String> {
    let app_dir = get_app_data_dir();
    let manager = DownloadManager::new(&app_dir);

    let models = manager.list_models().map_err(|e| e.to_string())?;

    // Map filenames back to model IDs
    let model_ids: Vec<String> = models
        .into_iter()
        .filter_map(|p| {
            let filename = p.file_name()?.to_str()?;
            // Reverse lookup: filename -> model_id
            match filename {
                "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf" => {
                    Some("llama-3.1-8b-instruct".to_string())
                }
                "Llama-3.2-1B-Instruct-Q4_K_M.gguf" => Some("llama-3.2-1b-instruct".to_string()),
                "Llama-3.2-3B-Instruct-Q4_K_M.gguf" => Some("llama-3.2-3b-instruct".to_string()),
                "Phi-3.1-mini-4k-instruct-Q4_K_M.gguf" => {
                    Some("phi-3-mini-4k-instruct".to_string())
                }
                _ => None, // Unknown model files are ignored
            }
        })
        .collect();

    Ok(model_ids)
}

/// Check if embedding model is downloaded and return its path if so
pub fn get_embedding_model_path(model_id: String) -> Result<Option<String>, String> {
    let filename = get_embedding_model_filename(&model_id)
        .ok_or_else(|| format!("Unknown embedding model ID: {}", model_id))?;

    let app_dir = get_app_data_dir();
    let model_path = app_dir.join("models").join(filename);

    if model_path.exists() {
        Ok(Some(model_path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

/// Check if the default embedding model is downloaded
pub fn is_embedding_model_downloaded() -> Result<bool, String> {
    let app_dir = get_app_data_dir();
    let model_path = app_dir
        .join("models")
        .join("nomic-embed-text-v1.5.Q5_K_M.gguf");
    Ok(model_path.exists())
}

/// Get models directory path
pub fn get_models_dir() -> Result<String, String> {
    let app_dir = get_app_data_dir();
    let manager = DownloadManager::new(&app_dir);
    Ok(manager.models_dir().display().to_string())
}

/// Delete a downloaded model
pub fn delete_downloaded_model(filename: String) -> Result<(), String> {
    use std::path::Component;
    use std::path::Path;

    let path = Path::new(&filename);
    let mut components = path.components();
    let is_single_filename =
        matches!(components.next(), Some(Component::Normal(_))) && components.next().is_none();
    if path.is_absolute() || !is_single_filename {
        return Err("Invalid model filename".into());
    }

    let has_gguf_ext = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("gguf"))
        .unwrap_or(false);
    if !has_gguf_ext {
        return Err("Only .gguf model files can be deleted".into());
    }

    let app_dir = get_app_data_dir();
    let manager = DownloadManager::new(&app_dir);
    manager.delete_model(&filename).map_err(|e| e.to_string())
}

/// Get HuggingFace token status (not the actual token for security)
#[tauri::command]
pub fn has_hf_token() -> Result<bool, crate::error::AppError> {
    security_commands::has_hf_token_impl()
}

/// Store HuggingFace token
#[tauri::command]
pub fn set_hf_token(token: String) -> Result<(), crate::error::AppError> {
    security_commands::set_hf_token_impl(token)
}

/// Delete HuggingFace token
#[tauri::command]
pub fn clear_hf_token() -> Result<(), crate::error::AppError> {
    security_commands::clear_hf_token_impl()
}

/// Get Search API bearer token status (not the actual token for security)
#[tauri::command]
pub fn has_search_api_token() -> Result<bool, crate::error::AppError> {
    security_commands::has_search_api_token_impl()
}

/// Store Search API bearer token
#[tauri::command]
pub fn set_search_api_token(token: String) -> Result<(), crate::error::AppError> {
    security_commands::set_search_api_token_impl(token)
}

/// Delete Search API bearer token
#[tauri::command]
pub fn clear_search_api_token() -> Result<(), crate::error::AppError> {
    security_commands::clear_search_api_token_impl()
}

/// Get MemoryKernel service token status (not the actual token for security)
#[tauri::command]
pub fn has_memorykernel_service_token() -> Result<bool, crate::error::AppError> {
    security_commands::has_memorykernel_service_token_impl()
}

/// Store MemoryKernel service bearer token
#[tauri::command]
pub fn set_memorykernel_service_token(token: String) -> Result<(), crate::error::AppError> {
    security_commands::set_memorykernel_service_token_impl(token)
}

/// Delete MemoryKernel service bearer token
#[tauri::command]
pub fn clear_memorykernel_service_token() -> Result<(), crate::error::AppError> {
    security_commands::clear_memorykernel_service_token_impl()
}

/// Store GitHub token for a specific host (HTTPS only)
#[tauri::command]
pub fn set_github_token(host: String, token: String) -> Result<(), crate::error::AppError> {
    security_commands::set_github_token_impl(host, token)
}

/// Delete GitHub token for a specific host
#[tauri::command]
pub fn clear_github_token(host: String) -> Result<(), crate::error::AppError> {
    security_commands::clear_github_token_impl(host)
}

/// Check if a GitHub token exists for a host (does not return the token)
#[tauri::command]
pub fn has_github_token(host: String) -> Result<bool, crate::error::AppError> {
    security_commands::has_github_token_impl(host)
}

/// Read audit log entries (most recent first if limit is set)
#[tauri::command]
pub fn get_audit_entries(
    limit: Option<usize>,
) -> Result<Vec<crate::audit::AuditEntry>, crate::error::AppError> {
    security_commands::get_audit_entries_impl(limit)
}

/// Export audit log entries to a JSON file
#[tauri::command]
pub fn export_audit_log(export_path: String) -> Result<String, crate::error::AppError> {
    security_commands::export_audit_log_impl(export_path)
}


use tauri::Emitter;

/// Map model ID to HuggingFace repo and filename
fn get_model_source(model_id: &str) -> Result<(&'static str, &'static str), String> {
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
        _ => Err(format!("Unknown model ID: {}", model_id)),
    }
}

/// Get the filename for an embedding model ID
fn get_embedding_model_filename(model_id: &str) -> Option<&'static str> {
    match model_id {
        "nomic-embed-text" => Some("nomic-embed-text-v1.5.Q5_K_M.gguf"),
        _ => None,
    }
}

/// Download a model from HuggingFace with progress events
pub async fn download_model(window: tauri::Window, model_id: String) -> Result<String, String> {
    let (repo, filename) = get_model_source(&model_id)?;
    audit::audit_model_download_started(&model_id, repo, filename);

    let app_dir = get_app_data_dir();
    let manager = DownloadManager::new(&app_dir);
    manager.init().map_err(|e| e.to_string())?;

    // Fetch file info (size and SHA256) from HuggingFace API for verification
    let mut source = ModelSource::huggingface(repo, filename);
    let (size, sha256) = crate::downloads::fetch_hf_file_info(repo, filename)
        .await
        .map_err(|e| {
            audit::audit_model_download_failed(&model_id, "metadata_fetch_failed", &e.to_string());
            format!("Failed to fetch checksum metadata: {}", e)
        })?;
    let allowlist = ModelAllowlist::new();
    let allowed = allowlist.get_allowed_model(filename).ok_or_else(|| {
        audit::audit_model_download_failed(&model_id, "allowlist_missing", filename);
        "Model is not in the allowlist".to_string()
    })?;

    if allowed.repo != repo {
        audit::audit_model_download_failed(&model_id, "allowlist_repo_mismatch", repo);
        return Err("Model allowlist mismatch (repo)".to_string());
    }

    if allowed.size_bytes != size || allowed.sha256.to_lowercase() != sha256.to_lowercase() {
        audit::audit_model_download_failed(&model_id, "allowlist_metadata_mismatch", filename);
        return Err("Model allowlist mismatch (size or checksum)".to_string());
    }

    source.size_bytes = Some(allowed.size_bytes);
    source.sha256 = Some(allowed.sha256.clone());

    // Create progress channel
    let (tx, mut rx) = tokio::sync::mpsc::channel(100);
    DOWNLOAD_CANCEL_FLAG.store(false, Ordering::SeqCst);
    let cancel_flag = DOWNLOAD_CANCEL_FLAG.clone();

    // Spawn download task
    let download_handle = {
        let cancel = cancel_flag.clone();
        tokio::spawn(async move { manager.download(&source, tx, cancel).await })
    };

    // Forward progress events to frontend
    let window_clone = window.clone();
    let event_handle = tokio::spawn(async move {
        while let Some(progress) = rx.recv().await {
            let _ = window_clone.emit("download-progress", &progress);
        }
    });

    // Wait for download to complete
    let download_result = download_handle.await.map_err(|e| {
        audit::audit_model_download_failed(&model_id, "download_task_failed", &e.to_string());
        e.to_string()
    })?;

    // Wait for event forwarding to finish
    let _ = event_handle.await;

    let result = download_result.map_err(|e| {
        audit::audit_model_download_failed(&model_id, "download_failed", &e.to_string());
        e.to_string()
    })?;

    // Run integrity verification on a blocking thread to avoid stalling the async runtime.
    // calculate_sha256 reads the entire model file (1-2 GB) synchronously.
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
                e.to_string()
            })?;

    match verify_result {
        Ok(verification) => {
            if verification.is_verified() {
                audit::audit_model_integrity_verified(&model_id, verification.sha256());
            } else {
                audit::audit_model_integrity_unverified(&model_id, verification.sha256());
            }
        }
        Err(e) => {
            audit::audit_model_download_failed(&model_id, "integrity_check_failed", &e.to_string());
            return Err(format!("Model integrity verification failed: {}", e));
        }
    }

    audit::audit_model_download_completed(&model_id, &sha256, size);
    Ok(result.display().to_string())
}

/// Cancel an ongoing download
pub fn cancel_download() -> Result<(), String> {
    DOWNLOAD_CANCEL_FLAG.store(true, Ordering::SeqCst);
    Ok(())
}

// ============================================================================
// KB Indexer Commands
// ============================================================================

use crate::kb::indexer::{IndexResult, IndexStats};

/// Set the KB folder path
/// Path must be within user's home directory (auto-creates if needed)
/// Blocks sensitive directories like .ssh, .aws, .gnupg, .config
pub fn set_kb_folder(state: State<'_, AppState>, folder_path: String) -> Result<(), String> {
    kb_commands::set_kb_folder_impl(state, folder_path)
}

/// Get the current KB folder path
pub fn get_kb_folder(state: State<'_, AppState>) -> Result<Option<String>, String> {
    kb_commands::get_kb_folder_impl(state)
}

/// Index the KB folder with progress events
pub async fn index_kb(
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<IndexResult, String> {
    kb_commands::index_kb_impl(window, state).await
}

/// Get KB statistics
pub fn get_kb_stats(state: State<'_, AppState>) -> Result<IndexStats, String> {
    kb_commands::get_kb_stats_impl(state)
}

/// List indexed KB documents, optionally filtered by namespace and/or source
pub fn list_kb_documents(
    state: State<'_, AppState>,
    namespace_id: Option<String>,
    source_id: Option<String>,
) -> Result<Vec<KbDocumentInfo>, String> {
    kb_commands::list_kb_documents_impl(state, namespace_id, source_id)
}

/// KB document info for API responses
pub type KbDocumentInfo = kb_commands::KbDocumentInfo;

/// Remove a document from the KB index
pub async fn remove_kb_document(
    file_path: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    kb_commands::remove_kb_document_impl(file_path, state).await
}

/// Start watching KB folder for changes
pub async fn start_kb_watcher(
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    kb_commands::start_kb_watcher_impl(window, state).await
}

/// Stop watching KB folder
pub fn stop_kb_watcher() -> Result<bool, String> {
    kb_commands::stop_kb_watcher_impl()
}

/// Check if KB watcher is running
pub fn is_kb_watcher_running() -> Result<bool, String> {
    kb_commands::is_kb_watcher_running_impl()
}

pub(super) async fn generate_kb_embeddings_internal(
    state: &AppState,
    app_handle: &tauri::AppHandle,
    reset_table: bool,
) -> Result<EmbeddingGenerationResult, String> {
    let consent_enabled = {
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        let db = db_lock.as_ref().ok_or("Database not initialized")?;
        db.get_vector_consent().map_err(|e| e.to_string())?.enabled
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
    let batch_size = 32;
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

/// Generate embeddings for all KB chunks
/// This should be called after indexing if vector search is enabled
pub async fn generate_kb_embeddings(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<EmbeddingGenerationResult, String> {
    generate_kb_embeddings_internal(state.inner(), &app_handle, true).await
}

/// Result of embedding generation
#[derive(serde::Serialize)]
pub struct EmbeddingGenerationResult {
    pub chunks_processed: usize,
    pub vectors_created: usize,
}

// ============================================================================
// Embedding Commands
// ============================================================================

use crate::kb::embeddings::{EmbeddingEngine, EmbeddingModelInfo};
use crate::kb::ocr::OcrManager;

/// Initialize the embedding engine (idempotent — skips if already initialized)
pub fn init_embedding_engine(state: State<'_, AppState>) -> Result<(), String> {
    if state.embeddings.read().is_some() {
        return Ok(());
    }
    let backend = state.llama_backend()?;
    let engine = EmbeddingEngine::new(backend).map_err(|e| e.to_string())?;
    *state.embeddings.write() = Some(engine);
    Ok(())
}

/// Load an embedding model from file
pub fn load_embedding_model(
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
    let layers = n_gpu_layers.unwrap_or(1000); // Default to full GPU offload

    let info = engine
        .load_model(&validated_path, layers)
        .map_err(|e| e.to_string())?;

    // Record embedding model state for auto-load
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

/// Unload the current embedding model
pub fn unload_embedding_model(state: State<'_, AppState>) -> Result<(), String> {
    let emb_guard = state.embeddings.read();
    let engine = emb_guard
        .as_ref()
        .ok_or("Embedding engine not initialized")?;
    engine.unload_model();
    // Clear embedding model state
    if let Ok(db_lock) = state.db.lock() {
        if let Some(db) = db_lock.as_ref() {
            let _ = db.clear_model_state("embeddings");
        }
    }
    Ok(())
}

/// Get current embedding model info
pub fn get_embedding_model_info(
    state: State<'_, AppState>,
) -> Result<Option<EmbeddingModelInfo>, String> {
    let emb_guard = state.embeddings.read();
    let engine = emb_guard
        .as_ref()
        .ok_or("Embedding engine not initialized")?;
    Ok(engine.model_info())
}

/// Check if an embedding model is loaded
pub fn is_embedding_model_loaded(state: State<'_, AppState>) -> Result<bool, String> {
    let emb_guard = state.embeddings.read();
    match emb_guard.as_ref() {
        Some(engine) => Ok(engine.is_model_loaded()),
        None => Ok(false),
    }
}

// ============================================================================
// Vector Store Commands
// ============================================================================

/// Initialize the vector store
pub async fn init_vector_store(state: State<'_, AppState>) -> Result<(), String> {
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
            db.get_vector_consent().map_err(|e| e.to_string())?.enabled
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

/// Enable or disable vector search
pub async fn set_vector_enabled(state: State<'_, AppState>, enabled: bool) -> Result<(), String> {
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

/// Check if vector store is enabled
pub async fn is_vector_enabled(state: State<'_, AppState>) -> Result<bool, String> {
    let vectors_lock = state.vectors.read().await;
    Ok(vectors_lock
        .as_ref()
        .map(|s| s.is_enabled())
        .unwrap_or(false))
}

/// Get vector store statistics
pub async fn get_vector_stats(state: State<'_, AppState>) -> Result<VectorStats, String> {
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

/// Vector store statistics
#[derive(serde::Serialize)]
pub struct VectorStats {
    pub enabled: bool,
    pub vector_count: usize,
    pub embedding_dim: usize,
    pub encryption_supported: bool,
}

// ============================================================================
// OCR Commands
// ============================================================================

/// OCR result
#[derive(serde::Serialize)]
pub struct OcrResult {
    pub text: String,
    pub confidence: f32,
}

/// Process an image with OCR to extract text
pub fn process_ocr(image_path: String) -> Result<OcrResult, String> {
    let ocr = OcrManager::new();
    let path = PathBuf::from(&image_path);

    if !path.exists() {
        return Err(format!("Image file not found: {}", image_path));
    }

    let validated_path = validate_within_home(&path).map_err(|e| match e {
        ValidationError::PathTraversal => {
            "Image file must be within your home directory".to_string()
        }
        ValidationError::InvalidFormat(msg) if msg.contains("sensitive") => {
            "This path is blocked because it contains sensitive data".to_string()
        }
        _ => format!("Invalid image path: {}", e),
    })?;

    if !validated_path.is_file() {
        return Err("Image path is not a file".into());
    }

    let result = ocr.recognize(&validated_path).map_err(|e| e.to_string())?;

    Ok(OcrResult {
        text: result.text,
        confidence: result.confidence.unwrap_or(1.0),
    })
}

/// Maximum base64 payload size for OCR (10MB encoded = ~7.5MB decoded)
const MAX_OCR_BASE64_BYTES: usize = 10 * 1024 * 1024;

/// Process OCR from base64-encoded image data (for clipboard paste)
pub fn process_ocr_bytes(image_base64: String) -> Result<OcrResult, String> {
    use base64::{engine::general_purpose, Engine as _};

    // Validate payload size before processing to prevent memory spikes
    if image_base64.len() > MAX_OCR_BASE64_BYTES {
        return Err(format!(
            "Image too large: {} bytes exceeds limit of {} bytes. Please use a smaller image.",
            image_base64.len(),
            MAX_OCR_BASE64_BYTES
        ));
    }

    // Decode base64
    let image_data = general_purpose::STANDARD
        .decode(&image_base64)
        .map_err(|e| format!("Invalid base64 data: {}", e))?;

    // Save to temp file
    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join(format!("assistsupport_ocr_{}.png", uuid::Uuid::new_v4()));

    std::fs::write(&temp_path, &image_data)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    // Process OCR
    let ocr = OcrManager::new();
    let result = ocr.recognize(&temp_path).map_err(|e| e.to_string());

    // Clean up temp file
    let _ = std::fs::remove_file(&temp_path);

    let ocr_result = result?;
    Ok(OcrResult {
        text: ocr_result.text,
        confidence: ocr_result.confidence.unwrap_or(1.0),
    })
}

/// Check if OCR is available on this system
pub fn is_ocr_available() -> bool {
    let ocr = OcrManager::new();
    !ocr.available_providers().is_empty()
}

// ============================================================================
// Decision Tree Commands
// ============================================================================

/// List all decision trees
pub fn list_decision_trees(
    state: State<'_, AppState>,
) -> Result<Vec<crate::db::DecisionTree>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.list_decision_trees().map_err(|e| e.to_string())
}

/// Get a single decision tree by ID
pub fn get_decision_tree(
    state: State<'_, AppState>,
    tree_id: String,
) -> Result<crate::db::DecisionTree, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.get_decision_tree(&tree_id).map_err(|e| e.to_string())
}


// ============================================================================
// Export Commands (Phase 18)
// ============================================================================

use crate::exports::{
    format_draft, format_for_clipboard, ExportFormat as DraftExportFormat, ExportedSource,
    SafeExportOptions,
};

/// Export a draft in various formats
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

    // Parse KB sources
    let sources: Vec<ExportedSource> = draft
        .kb_sources_json
        .and_then(|json| serde_json::from_str::<Vec<serde_json::Value>>(&json).ok())
        .map(|sources| {
            sources
                .iter()
                .map(|s| ExportedSource {
                    title: s["title"].as_str().unwrap_or("Unknown").to_string(),
                    path: s["file_path"].as_str().map(|p| p.to_string()),
                    url: s["url"].as_str().map(|u| u.to_string()),
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

/// Format draft for clipboard (optimized for ticket systems)
pub fn format_draft_for_clipboard(
    state: State<'_, AppState>,
    draft_id: String,
    include_sources: bool,
) -> Result<String, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    let draft = db.get_draft(&draft_id).map_err(|e| e.to_string())?;

    let response_text = draft.response_text.as_deref().unwrap_or("");

    // Parse KB sources
    let sources: Vec<ExportedSource> = draft
        .kb_sources_json
        .and_then(|json| serde_json::from_str::<Vec<serde_json::Value>>(&json).ok())
        .map(|sources| {
            sources
                .iter()
                .map(|s| ExportedSource {
                    title: s["title"].as_str().unwrap_or("Unknown").to_string(),
                    path: s["file_path"].as_str().map(|p| p.to_string()),
                    url: s["url"].as_str().map(|u| u.to_string()),
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

// ============================================================================
// Draft & Template Commands
// ============================================================================

use crate::db::{ResponseTemplate, SavedDraft};

// NOTE: the following 7 delegating wrappers are dead code (registry points
// at draft_commands:: directly). Kept temporarily with .map_err bridges so
// this PR can ship without a 1000+ LOC mod.rs cleanup in the same commit.
// Deletion tracked as a follow-up task.

/// List saved drafts (most recent first)
pub fn list_drafts(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<SavedDraft>, String> {
    draft_commands::list_drafts_impl(state, limit).map_err(|e| e.to_string())
}

/// Search drafts by text content
pub fn search_drafts(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SavedDraft>, String> {
    draft_commands::search_drafts_impl(state, query, limit).map_err(|e| e.to_string())
}

/// Get a single draft by ID
pub fn get_draft(state: State<'_, AppState>, draft_id: String) -> Result<SavedDraft, String> {
    draft_commands::get_draft_impl(state, draft_id).map_err(|e| e.to_string())
}

/// Save a draft (insert or update)
pub fn save_draft(state: State<'_, AppState>, draft: SavedDraft) -> Result<String, String> {
    draft_commands::save_draft_impl(state, draft).map_err(|e| e.to_string())
}

/// Delete a draft by ID
pub fn delete_draft(state: State<'_, AppState>, draft_id: String) -> Result<(), String> {
    draft_commands::delete_draft_impl(state, draft_id).map_err(|e| e.to_string())
}

/// List autosave drafts (most recent first)
pub fn list_autosaves(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<SavedDraft>, String> {
    draft_commands::list_autosaves_impl(state, limit).map_err(|e| e.to_string())
}

/// Cleanup old autosaves, keeping only the most recent ones
pub fn cleanup_autosaves(
    state: State<'_, AppState>,
    keep_count: Option<usize>,
) -> Result<usize, String> {
    draft_commands::cleanup_autosaves_impl(state, keep_count).map_err(|e| e.to_string())
}

/// Get draft versions by input hash (autosaves with matching input_text hash)
/// Used for version history UI
pub fn get_draft_versions(
    state: State<'_, AppState>,
    input_hash: String,
) -> Result<Vec<SavedDraft>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.get_draft_versions(&input_hash)
        .map_err(|e| e.to_string())
}

// ============================================================================
// Draft Versioning Commands (Phase 17)
// ============================================================================

/// Create a draft version snapshot
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

/// List draft versions for a specific draft
pub fn list_draft_versions(
    state: State<'_, AppState>,
    draft_id: String,
) -> Result<Vec<crate::db::DraftVersion>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.list_draft_versions(&draft_id).map_err(|e| e.to_string())
}

/// Finalize a draft (lock and mark as read-only)
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

/// Archive a draft
pub fn archive_draft(state: State<'_, AppState>, draft_id: String) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.archive_draft(&draft_id).map_err(|e| e.to_string())
}

/// Update draft handoff summary for escalations
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

// ============================================================================
// Playbook Commands (Phase 17)
// ============================================================================

/// List all active playbooks
pub fn list_playbooks(
    state: State<'_, AppState>,
    category: Option<String>,
) -> Result<Vec<crate::db::Playbook>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.list_playbooks(category.as_deref())
        .map_err(|e| e.to_string())
}

/// Get a playbook by ID
pub fn get_playbook(
    state: State<'_, AppState>,
    playbook_id: String,
) -> Result<crate::db::Playbook, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.get_playbook(&playbook_id).map_err(|e| e.to_string())
}

/// Save a playbook (insert or update)
pub fn save_playbook(
    state: State<'_, AppState>,
    playbook: crate::db::Playbook,
) -> Result<String, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.save_playbook(&playbook).map_err(|e| e.to_string())
}

/// Record playbook usage
pub fn use_playbook(state: State<'_, AppState>, playbook_id: String) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.increment_playbook_usage(&playbook_id)
        .map_err(|e| e.to_string())
}

/// Delete a playbook
pub fn delete_playbook(state: State<'_, AppState>, playbook_id: String) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.delete_playbook(&playbook_id).map_err(|e| e.to_string())
}

// ============================================================================
// Action Shortcut Commands (Phase 17)
// ============================================================================

/// List all active action shortcuts
pub fn list_action_shortcuts(
    state: State<'_, AppState>,
    category: Option<String>,
) -> Result<Vec<crate::db::ActionShortcut>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.list_action_shortcuts(category.as_deref())
        .map_err(|e| e.to_string())
}

/// Get an action shortcut by ID
pub fn get_action_shortcut(
    state: State<'_, AppState>,
    shortcut_id: String,
) -> Result<crate::db::ActionShortcut, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.get_action_shortcut(&shortcut_id)
        .map_err(|e| e.to_string())
}

/// Save an action shortcut (insert or update)
pub fn save_action_shortcut(
    state: State<'_, AppState>,
    shortcut: crate::db::ActionShortcut,
) -> Result<String, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.save_action_shortcut(&shortcut)
        .map_err(|e| e.to_string())
}

/// Delete an action shortcut
pub fn delete_action_shortcut(
    state: State<'_, AppState>,
    shortcut_id: String,
) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.delete_action_shortcut(&shortcut_id)
        .map_err(|e| e.to_string())
}

/// List all response templates
pub fn list_templates(state: State<'_, AppState>) -> Result<Vec<ResponseTemplate>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.list_templates().map_err(|e| e.to_string())
}

/// Get a single template by ID
pub fn get_template(
    state: State<'_, AppState>,
    template_id: String,
) -> Result<ResponseTemplate, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.get_template(&template_id).map_err(|e| e.to_string())
}

/// Save a template (insert or update)
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

/// Delete a template by ID
pub fn delete_template(state: State<'_, AppState>, template_id: String) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.delete_template(&template_id).map_err(|e| e.to_string())
}

// ============================================================================
// Custom Variable Commands
// ============================================================================

/// List all custom template variables
pub fn list_custom_variables(
    state: State<'_, AppState>,
) -> Result<Vec<crate::db::CustomVariable>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.list_custom_variables().map_err(|e| e.to_string())
}

/// Get a custom variable by ID
pub fn get_custom_variable(
    state: State<'_, AppState>,
    variable_id: String,
) -> Result<crate::db::CustomVariable, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.get_custom_variable(&variable_id)
        .map_err(|e| e.to_string())
}

/// Save a custom variable (create or update)
pub fn save_custom_variable(
    state: State<'_, AppState>,
    variable: crate::db::CustomVariable,
) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.save_custom_variable(&variable)
        .map_err(|e| e.to_string())
}

/// Delete a custom variable by ID
pub fn delete_custom_variable(
    state: State<'_, AppState>,
    variable_id: String,
) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.delete_custom_variable(&variable_id)
        .map_err(|e| e.to_string())
}

// Export and Backup commands moved to commands/backup.rs

// =============================================================================
// CONTENT INGESTION COMMANDS
// =============================================================================

/// Result of an ingestion operation
#[derive(Debug, Clone, serde::Serialize)]
pub struct IngestResult {
    pub document_id: String,
    pub title: String,
    pub source_uri: String,
    pub chunk_count: usize,
    pub word_count: usize,
}

/// Result of a batch ingestion operation
#[derive(Debug, Clone, serde::Serialize)]
pub struct BatchIngestResult {
    pub successful: Vec<IngestResult>,
    pub failed: Vec<FailedSource>,
    pub cancelled: bool,
}

/// A failed source in a batch operation
#[derive(Debug, Clone, serde::Serialize)]
pub struct FailedSource {
    pub source: String,
    pub error: String,
}

/// Result of a disk folder ingestion
#[derive(Debug, Clone, serde::Serialize)]
pub struct DiskIngestResultResponse {
    pub total_files: usize,
    pub ingested: usize,
    pub skipped: usize,
    pub errors: usize,
    pub documents: Vec<IngestResult>,
}

/// Ingest a folder of documents from disk with source tracking
/// Creates ingest_sources and ingest_runs entries so disk-indexed
/// articles appear in the source management UI
pub fn ingest_kb_from_disk(
    state: State<'_, AppState>,
    folder_path: String,
    namespace_id: String,
) -> Result<DiskIngestResultResponse, String> {
    use crate::kb::ingest::disk::DiskIngester;
    use std::path::Path;

    // Validate and normalize namespace ID
    let namespace_id =
        normalize_and_validate_namespace_id(&namespace_id).map_err(|e| e.to_string())?;

    // Validate path is within home directory
    let validated_path = validate_within_home(Path::new(&folder_path)).map_err(|e| match e {
        ValidationError::PathTraversal => "Folder must be within your home directory".to_string(),
        ValidationError::InvalidFormat(msg) if msg.contains("sensitive") => {
            "This directory cannot be used as it contains sensitive data".to_string()
        }
        _ => format!("Invalid folder path: {}", e),
    })?;

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    // Ensure namespace exists
    db.ensure_namespace_exists(&namespace_id)
        .map_err(|e| e.to_string())?;

    let ingester = DiskIngester::new();
    let result = ingester
        .ingest_folder(db, &validated_path, &namespace_id)
        .map_err(|e| e.to_string())?;

    Ok(DiskIngestResultResponse {
        total_files: result.total_files,
        ingested: result.ingested,
        skipped: result.skipped,
        errors: result.errors,
        documents: result
            .documents
            .into_iter()
            .map(|d| IngestResult {
                document_id: d.id,
                title: d.title,
                source_uri: d.source_uri,
                chunk_count: d.chunk_count,
                word_count: d.word_count,
            })
            .collect(),
    })
}

const NETWORK_INGEST_POLICY_ENV: &str = "ASSISTSUPPORT_ENABLE_NETWORK_INGEST";

fn network_ingest_enabled_by_policy() -> bool {
    // Offline-first default: network ingestion is disabled unless explicitly enabled.
    // This is a product policy choice (not a security boundary by itself), but it helps
    // keep workstation deployments predictable and reduces unexpected network dependencies.
    std::env::var(NETWORK_INGEST_POLICY_ENV)
        .ok()
        .map(|value| value.trim().to_ascii_lowercase())
        .map(|value| matches!(value.as_str(), "1" | "true" | "yes" | "on" | "enabled"))
        .unwrap_or(false)
}

/// Ingest a web page URL
/// Uses block_in_place to run async operations while holding DB lock
pub fn ingest_url(
    state: State<'_, AppState>,
    url: String,
    namespace_id: String,
) -> Result<IngestResult, String> {
    use crate::kb::ingest::web::{WebIngestConfig, WebIngester};
    use crate::kb::ingest::CancellationToken;

    if !network_ingest_enabled_by_policy() {
        return Err(
            "Network ingestion is disabled by policy. Set ASSISTSUPPORT_ENABLE_NETWORK_INGEST=1 and restart AssistSupport to enable."
                .to_string(),
        );
    }

    // Validate and normalize namespace ID
    let namespace_id =
        normalize_and_validate_namespace_id(&namespace_id).map_err(|e| e.to_string())?;

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    // Ensure namespace exists
    db.ensure_namespace_exists(&namespace_id)
        .map_err(|e| e.to_string())?;

    let config = WebIngestConfig::default();
    let cancel_token = CancellationToken::new();

    // Use block_in_place to run async code in sync context
    // The ingester now requires async initialization for DNS resolver
    let result = tokio::task::block_in_place(|| {
        tokio::runtime::Handle::current().block_on(async {
            let ingester = WebIngester::new(config).await.map_err(|e| e.to_string())?;
            ingester
                .ingest_page(db, &url, &namespace_id, &cancel_token, None)
                .await
                .map_err(|e| e.to_string())
        })
    })?;

    Ok(IngestResult {
        document_id: result.id,
        title: result.title,
        source_uri: result.source_uri,
        chunk_count: result.chunk_count,
        word_count: result.word_count,
    })
}

/// Ingest a YouTube video transcript
/// Uses block_in_place to run async operations while holding DB lock
pub fn ingest_youtube(
    state: State<'_, AppState>,
    url: String,
    namespace_id: String,
) -> Result<IngestResult, String> {
    use crate::kb::ingest::youtube::{YouTubeIngestConfig, YouTubeIngester};
    use crate::kb::ingest::CancellationToken;

    if !network_ingest_enabled_by_policy() {
        return Err(
            "Network ingestion is disabled by policy. Set ASSISTSUPPORT_ENABLE_NETWORK_INGEST=1 and restart AssistSupport to enable."
                .to_string(),
        );
    }

    // Validate and normalize namespace ID
    let namespace_id =
        normalize_and_validate_namespace_id(&namespace_id).map_err(|e| e.to_string())?;

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    // Ensure namespace exists
    db.ensure_namespace_exists(&namespace_id)
        .map_err(|e| e.to_string())?;

    let config = YouTubeIngestConfig::default();
    let ingester = YouTubeIngester::new(config);

    // Check yt-dlp availability
    if !ingester.check_ytdlp_available() {
        return Err("yt-dlp not found. Install with: brew install yt-dlp".to_string());
    }

    let cancel_token = CancellationToken::new();

    // Use block_in_place to run async code in sync context
    let result = tokio::task::block_in_place(|| {
        tokio::runtime::Handle::current().block_on(async {
            ingester
                .ingest_video(db, &url, &namespace_id, &cancel_token, None)
                .await
        })
    })
    .map_err(|e| e.to_string())?;

    Ok(IngestResult {
        document_id: result.id,
        title: result.title,
        source_uri: result.source_uri,
        chunk_count: result.chunk_count,
        word_count: result.word_count,
    })
}

/// Ingest a GitHub repository (local path)
/// Path must be within user's home directory
pub fn ingest_github(
    state: State<'_, AppState>,
    repo_path: String,
    namespace_id: String,
) -> Result<Vec<IngestResult>, String> {
    use crate::kb::ingest::github::{GitHubIngestConfig, GitHubIngester};
    use crate::kb::ingest::CancellationToken;
    use std::path::Path;

    // Validate and normalize namespace ID
    let namespace_id =
        normalize_and_validate_namespace_id(&namespace_id).map_err(|e| e.to_string())?;

    // Validate path is within home directory
    let validated_path = validate_within_home(Path::new(&repo_path)).map_err(|e| match e {
        ValidationError::PathTraversal => {
            "Repository must be within your home directory".to_string()
        }
        ValidationError::InvalidFormat(msg) if msg.contains("sensitive") => {
            "This directory cannot be used as it contains sensitive data".to_string()
        }
        _ => format!("Invalid repository path: {}", e),
    })?;

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    // Ensure namespace exists
    db.ensure_namespace_exists(&namespace_id)
        .map_err(|e| e.to_string())?;

    let config = GitHubIngestConfig::default();
    let ingester = GitHubIngester::new(config);
    let cancel_token = CancellationToken::new();

    let results = ingester
        .ingest_local_repo(db, &validated_path, &namespace_id, &cancel_token, None)
        .map_err(|e| e.to_string())?;

    Ok(results
        .into_iter()
        .map(|r| IngestResult {
            document_id: r.id,
            title: r.title,
            source_uri: r.source_uri,
            chunk_count: r.chunk_count,
            word_count: r.word_count,
        })
        .collect())
}

/// Ingest a GitHub repository from a remote HTTPS URL
pub fn ingest_github_remote(
    state: State<'_, AppState>,
    repo_url: String,
    namespace_id: String,
) -> Result<Vec<IngestResult>, String> {
    use crate::kb::ingest::github::{parse_https_repo_url, GitHubIngestConfig, GitHubIngester};
    use crate::kb::ingest::CancellationToken;

    if !network_ingest_enabled_by_policy() {
        return Err(
            "Network ingestion is disabled by policy. Set ASSISTSUPPORT_ENABLE_NETWORK_INGEST=1 and restart AssistSupport to enable."
                .to_string(),
        );
    }

    // Validate and normalize namespace ID
    let namespace_id =
        normalize_and_validate_namespace_id(&namespace_id).map_err(|e| e.to_string())?;

    // Parse and validate repo URL
    let remote = parse_https_repo_url(&repo_url).map_err(|e| e.to_string())?;
    // normalize_github_host returns AppError; bridge to String via Display.
    let host_key = normalize_github_host(&remote.host_port).map_err(|e| e.to_string())?;
    let token_key = format!("{}{}", GITHUB_TOKEN_PREFIX, host_key);
    let token = FileKeyStore::get_token(&token_key).map_err(|e| e.to_string())?;

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    // Ensure namespace exists
    db.ensure_namespace_exists(&namespace_id)
        .map_err(|e| e.to_string())?;

    let config = GitHubIngestConfig::default();
    let ingester = GitHubIngester::new(config);
    let cancel_token = CancellationToken::new();

    let results = ingester
        .ingest_remote_repo(
            db,
            &repo_url,
            token.as_deref(),
            &namespace_id,
            &cancel_token,
            None,
        )
        .map_err(|e| e.to_string())?;

    Ok(results
        .into_iter()
        .map(|r| IngestResult {
            document_id: r.id,
            title: r.title,
            source_uri: r.source_uri,
            chunk_count: r.chunk_count,
            word_count: r.word_count,
        })
        .collect())
}

/// Process a YAML source file for batch ingestion
/// Uses block_in_place to run async operations while holding DB lock
pub fn process_source_file(
    state: State<'_, AppState>,
    file_path: String,
) -> Result<BatchIngestResult, String> {
    use crate::kb::ingest::batch::{BatchIngestConfig, BatchIngester};
    use crate::kb::ingest::CancellationToken;
    use crate::sources::SourceFile;
    use std::path::Path;

    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("Source file not found: {}", file_path));
    }

    let validated_path = validate_within_home(path).map_err(|e| match e {
        ValidationError::PathTraversal => {
            "Source file must be within your home directory".to_string()
        }
        ValidationError::InvalidFormat(msg) if msg.contains("sensitive") => {
            "This path is blocked because it contains sensitive data".to_string()
        }
        _ => format!("Invalid source file path: {}", e),
    })?;

    if !validated_path.is_file() {
        return Err("Source file path is not a file".into());
    }

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    // Parse the source file
    let source_file = SourceFile::from_path(&validated_path).map_err(|e| e.to_string())?;

    // Ensure namespace exists
    db.ensure_namespace_exists(&source_file.namespace)
        .map_err(|e| e.to_string())?;

    // Convert to batch sources
    let sources: Vec<String> = source_file
        .enabled_sources()
        .map(|s| s.uri.clone())
        .collect();

    let config = BatchIngestConfig::default();
    let cancel_token = CancellationToken::new();
    let namespace = source_file.namespace.clone();

    // Use block_in_place to run async code in sync context
    // The batch ingester now requires async initialization for DNS resolver
    let result = tokio::task::block_in_place(|| {
        tokio::runtime::Handle::current().block_on(async {
            let ingester = BatchIngester::new(config)
                .await
                .map_err(|e| e.to_string())?;
            Ok::<_, String>(
                ingester
                    .ingest_from_strings(db, &sources, &namespace, &cancel_token, None)
                    .await,
            )
        })
    })?;

    Ok(BatchIngestResult {
        successful: result
            .successful
            .into_iter()
            .map(|r| IngestResult {
                document_id: r.id,
                title: r.title,
                source_uri: r.source_uri,
                chunk_count: r.chunk_count,
                word_count: r.word_count,
            })
            .collect(),
        failed: result
            .failed
            .into_iter()
            .map(|f| FailedSource {
                source: f.source,
                error: f.error,
            })
            .collect(),
        cancelled: result.cancelled,
    })
}

/// List all namespaces
pub fn list_namespaces(state: State<'_, AppState>) -> Result<Vec<crate::db::Namespace>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.list_namespaces().map_err(|e| e.to_string())
}

/// List all namespaces with document and source counts (optimized single query)
pub fn list_namespaces_with_counts(
    state: State<'_, AppState>,
) -> Result<Vec<crate::db::NamespaceWithCounts>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.list_namespaces_with_counts().map_err(|e| e.to_string())
}

/// Create a new namespace
pub fn create_namespace(
    state: State<'_, AppState>,
    name: String,
    description: Option<String>,
    color: Option<String>,
) -> Result<crate::db::Namespace, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.create_namespace(&name, description.as_deref(), color.as_deref())
        .map_err(|e| e.to_string())
}

/// Rename a namespace
pub fn rename_namespace(
    state: State<'_, AppState>,
    old_name: String,
    new_name: String,
) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.rename_namespace(&old_name, &new_name)
        .map_err(|e| e.to_string())
}

/// Delete a namespace and all its content
pub async fn delete_namespace(state: State<'_, AppState>, name: String) -> Result<(), String> {
    purge_vectors_for_namespace(state.inner(), &name).await?;

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.delete_namespace(&name).map_err(|e| e.to_string())
}

/// List ingestion sources, optionally filtered by namespace
pub fn list_ingest_sources(
    state: State<'_, AppState>,
    namespace_id: Option<String>,
) -> Result<Vec<crate::db::IngestSource>, String> {
    // Validate and normalize namespace_id if provided
    let namespace_id = namespace_id
        .map(|ns| normalize_and_validate_namespace_id(&ns))
        .transpose()
        .map_err(|e| e.to_string())?;

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.list_ingest_sources(namespace_id.as_deref())
        .map_err(|e| e.to_string())
}

/// Delete an ingestion source and its documents
pub fn delete_ingest_source(state: State<'_, AppState>, source_id: String) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.delete_ingest_source(&source_id)
        .map_err(|e| e.to_string())
}

/// Get source health summary for a namespace
#[derive(serde::Serialize)]
pub struct SourceHealthSummary {
    pub total_sources: u32,
    pub active_sources: u32,
    pub stale_sources: u32,
    pub error_sources: u32,
    pub pending_sources: u32,
    pub sources: Vec<SourceHealth>,
}

#[derive(serde::Serialize)]
pub struct SourceHealth {
    pub id: String,
    pub source_type: String,
    pub source_uri: String,
    pub title: Option<String>,
    pub status: String,
    pub error_message: Option<String>,
    pub last_ingested_at: Option<String>,
    pub document_count: u32,
    pub days_since_refresh: Option<i64>,
}

pub fn get_source_health(
    state: State<'_, AppState>,
    namespace_id: Option<String>,
) -> Result<SourceHealthSummary, String> {
    // Validate and normalize namespace_id if provided
    let namespace_id = namespace_id
        .map(|ns| normalize_and_validate_namespace_id(&ns))
        .transpose()
        .map_err(|e| e.to_string())?;

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    // Get all sources with document counts
    let sql = r#"
        SELECT
            s.id,
            s.source_type,
            s.source_uri,
            s.title,
            s.status,
            s.error_message,
            s.last_ingested_at,
            COUNT(d.id) as document_count,
            CASE
                WHEN s.last_ingested_at IS NOT NULL
                THEN julianday('now') - julianday(s.last_ingested_at)
                ELSE NULL
            END as days_since
        FROM ingest_sources s
        LEFT JOIN kb_documents d ON d.source_id = s.id
        WHERE (?1 IS NULL OR s.namespace_id = ?1)
        GROUP BY s.id
        ORDER BY s.updated_at DESC
    "#;

    let mut stmt = db.conn().prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([namespace_id], |row| {
            Ok(SourceHealth {
                id: row.get(0)?,
                source_type: row.get(1)?,
                source_uri: row.get(2)?,
                title: row.get(3)?,
                status: row.get(4)?,
                error_message: row.get(5)?,
                last_ingested_at: row.get(6)?,
                document_count: row.get::<_, i64>(7)? as u32,
                days_since_refresh: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let sources: Vec<SourceHealth> = rows.filter_map(|r| r.ok()).collect();

    let mut summary = SourceHealthSummary {
        total_sources: sources.len() as u32,
        active_sources: 0,
        stale_sources: 0,
        error_sources: 0,
        pending_sources: 0,
        sources,
    };

    for source in &summary.sources {
        match source.status.as_str() {
            "active" => summary.active_sources += 1,
            "stale" => summary.stale_sources += 1,
            "error" => summary.error_sources += 1,
            "pending" => summary.pending_sources += 1,
            _ => {}
        }
    }

    Ok(summary)
}

/// Retry a failed or stale source
pub fn retry_source(state: State<'_, AppState>, source_id: String) -> Result<IngestResult, String> {
    // Get source details
    let source = {
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        let db = db_lock.as_ref().ok_or("Database not initialized")?;
        db.get_ingest_source(&source_id)
            .map_err(|e| e.to_string())?
    };

    // Mark as pending
    {
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        let db = db_lock.as_ref().ok_or("Database not initialized")?;
        db.update_ingest_source_status(&source_id, "pending", None)
            .map_err(|e| e.to_string())?;
    }

    // Re-ingest based on source type
    match source.source_type.as_str() {
        "web" => ingest_url(state, source.source_uri, source.namespace_id),
        "youtube" => ingest_youtube(state, source.source_uri, source.namespace_id),
        "github" => {
            let results: Vec<IngestResult> =
                ingest_github(state, source.source_uri.clone(), source.namespace_id)?;
            // Return summary for multi-file results
            Ok(IngestResult {
                document_id: source_id,
                title: source.title.unwrap_or_else(|| "Repository".to_string()),
                source_uri: source.source_uri,
                chunk_count: results.iter().map(|r| r.chunk_count).sum(),
                word_count: results.iter().map(|r| r.word_count).sum(),
            })
        }
        _ => Err(format!("Unknown source type: {}", source.source_type)),
    }
}

/// Mark sources as stale if they haven't been refreshed in N days
pub fn mark_stale_sources(
    state: State<'_, AppState>,
    days_threshold: Option<u32>,
) -> Result<u32, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let days = days_threshold.unwrap_or(7) as i64;

    let sql = r#"
        UPDATE ingest_sources
        SET status = 'stale', updated_at = datetime('now')
        WHERE status = 'active'
        AND last_ingested_at IS NOT NULL
        AND julianday('now') - julianday(last_ingested_at) > ?
    "#;

    let count = db.conn().execute(sql, [days]).map_err(|e| e.to_string())?;

    Ok(count as u32)
}

/// Get document chunks
pub fn get_document_chunks(
    state: State<'_, AppState>,
    document_id: String,
) -> Result<Vec<DocumentChunk>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let chunks: Vec<DocumentChunk> = db
        .conn()
        .prepare(
            "SELECT id, chunk_index, heading_path, content, word_count
             FROM kb_chunks WHERE document_id = ? ORDER BY chunk_index",
        )
        .map_err(|e| e.to_string())?
        .query_map([&document_id], |row| {
            Ok(DocumentChunk {
                id: row.get(0)?,
                chunk_index: row.get(1)?,
                heading_path: row.get(2)?,
                content: row.get(3)?,
                word_count: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(chunks)
}

/// A document chunk for API responses
#[derive(Debug, Clone, serde::Serialize)]
pub struct DocumentChunk {
    pub id: String,
    pub chunk_index: i32,
    pub heading_path: Option<String>,
    pub content: String,
    pub word_count: Option<i32>,
}

/// Delete a specific document
pub async fn delete_kb_document(
    state: State<'_, AppState>,
    document_id: String,
) -> Result<(), String> {
    purge_vectors_for_document(state.inner(), &document_id).await?;

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.conn()
        .execute("DELETE FROM kb_documents WHERE id = ?", [&document_id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Clear all knowledge data, optionally for a specific namespace
pub async fn clear_knowledge_data(
    state: State<'_, AppState>,
    namespace_id: Option<String>,
) -> Result<(), String> {
    // Validate and normalize namespace_id if provided
    let namespace_id = namespace_id
        .map(|ns| normalize_and_validate_namespace_id(&ns))
        .transpose()
        .map_err(|e| e.to_string())?;

    match namespace_id {
        Some(ns) => {
            purge_vectors_for_namespace(state.inner(), &ns).await?;

            let db_lock = state.db.lock().map_err(|e| e.to_string())?;
            let db = db_lock.as_ref().ok_or("Database not initialized")?;
            // Clear only the specified namespace
            db.conn()
                .execute("DELETE FROM kb_documents WHERE namespace_id = ?", [&ns])
                .map_err(|e| e.to_string())?;
            db.conn()
                .execute("DELETE FROM ingest_sources WHERE namespace_id = ?", [&ns])
                .map_err(|e| e.to_string())?;
        }
        None => {
            ensure_vector_store_initialized(state.inner()).await?;
            {
                let mut vectors_lock = state.vectors.write().await;
                if let Some(store) = vectors_lock.as_mut() {
                    store.reset_table().await.map_err(|e| e.to_string())?;
                }
            }

            let db_lock = state.db.lock().map_err(|e| e.to_string())?;
            let db = db_lock.as_ref().ok_or("Database not initialized")?;
            // Clear all knowledge data
            db.conn()
                .execute("DELETE FROM kb_chunks", [])
                .map_err(|e| e.to_string())?;
            db.conn()
                .execute("DELETE FROM kb_documents", [])
                .map_err(|e| e.to_string())?;
            db.conn()
                .execute("DELETE FROM ingest_runs", [])
                .map_err(|e| e.to_string())?;
            db.conn()
                .execute("DELETE FROM ingest_sources", [])
                .map_err(|e| e.to_string())?;
            db.set_vector_store_version(CURRENT_VECTOR_STORE_VERSION)
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

/// Check if yt-dlp is available
pub fn check_ytdlp_available() -> Result<bool, String> {
    use std::process::Command;

    Ok(Command::new("yt-dlp")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false))
}


// ============================================================================
// Document Versioning Commands (Phase 14)
// ============================================================================

/// List versions of a document
pub fn list_document_versions(
    state: State<'_, AppState>,
    document_id: String,
) -> Result<Vec<crate::db::DocumentVersion>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.list_document_versions(&document_id)
        .map_err(|e| e.to_string())
}

/// Rollback a document to a previous version
pub fn rollback_document(
    state: State<'_, AppState>,
    document_id: String,
    version_id: String,
) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.rollback_document(&document_id, &version_id)
        .map_err(|e| e.to_string())
}

// ============================================================================
// Source Trust Commands (Phase 14)
// ============================================================================

/// Update trust score for a source
pub fn update_source_trust(
    state: State<'_, AppState>,
    source_id: String,
    trust_score: f64,
) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.update_source_trust(&source_id, trust_score)
        .map_err(|e| e.to_string())
}

/// Pin or unpin a source
pub fn set_source_pinned(
    state: State<'_, AppState>,
    source_id: String,
    pinned: bool,
) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.set_source_pinned(&source_id, pinned)
        .map_err(|e| e.to_string())
}

/// Set review status for a source
pub fn set_source_review_status(
    state: State<'_, AppState>,
    source_id: String,
    status: String,
) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.set_source_review_status(&source_id, &status)
        .map_err(|e| e.to_string())
}

/// Get stale sources for review
pub fn get_stale_sources(
    state: State<'_, AppState>,
    namespace_id: Option<String>,
) -> Result<Vec<crate::db::IngestSource>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.get_stale_sources(namespace_id.as_deref())
        .map_err(|e| e.to_string())
}

// ============================================================================
// Namespace Rules Commands (Phase 14)
// ============================================================================

/// Add a namespace ingestion rule
pub fn add_namespace_rule(
    state: State<'_, AppState>,
    namespace_id: String,
    rule_type: String,
    pattern_type: String,
    pattern: String,
    reason: Option<String>,
) -> Result<String, String> {
    // Validate and normalize namespace ID
    let namespace_id =
        normalize_and_validate_namespace_id(&namespace_id).map_err(|e| e.to_string())?;

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.add_namespace_rule(
        &namespace_id,
        &rule_type,
        &pattern_type,
        &pattern,
        reason.as_deref(),
    )
    .map_err(|e| e.to_string())
}

/// Delete a namespace rule
pub fn delete_namespace_rule(state: State<'_, AppState>, rule_id: String) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.delete_namespace_rule(&rule_id)
        .map_err(|e| e.to_string())
}

/// List rules for a namespace
pub fn list_namespace_rules(
    state: State<'_, AppState>,
    namespace_id: String,
) -> Result<Vec<crate::db::NamespaceRule>, String> {
    // Validate and normalize namespace ID
    let namespace_id =
        normalize_and_validate_namespace_id(&namespace_id).map_err(|e| e.to_string())?;

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.list_namespace_rules(&namespace_id)
        .map_err(|e| e.to_string())
}

// Diagnostics commands moved to commands/diagnostics.rs


/// Start a runbook mode session.
pub async fn start_runbook_session(
    state: State<'_, AppState>,
    scenario: String,
    steps: Vec<String>,
    scope_key: String,
) -> Result<crate::db::RunbookSessionRecord, String> {
    let steps_json = serde_json::to_string(&steps).map_err(|e| e.to_string())?;
    let db_guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    db.create_runbook_session(&scenario, &steps_json, &scope_key)
        .map_err(|e| e.to_string())
}

/// Advance runbook session progress.
pub async fn advance_runbook_session(
    state: State<'_, AppState>,
    session_id: String,
    current_step: i32,
    status: Option<String>,
) -> Result<(), String> {
    let db_guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    db.advance_runbook_session(&session_id, current_step, status.as_deref())
        .map_err(|e| e.to_string())
}

/// List runbook sessions.
pub async fn list_runbook_sessions(
    state: State<'_, AppState>,
    limit: Option<usize>,
    status: Option<String>,
    scope_key: Option<String>,
) -> Result<Vec<crate::db::RunbookSessionRecord>, String> {
    let db_guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    db.list_runbook_sessions(
        limit.unwrap_or(50).min(500),
        status.as_deref(),
        scope_key.as_deref(),
    )
    .map_err(|e| e.to_string())
}

/// Reassign runbook sessions from one workspace scope to another.
pub async fn reassign_runbook_session_scope(
    state: State<'_, AppState>,
    from_scope_key: String,
    to_scope_key: String,
) -> Result<(), String> {
    let db_guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    db.reassign_runbook_session_scope(&from_scope_key, &to_scope_key)
        .map_err(|e| e.to_string())
}

/// Reassign one runbook session to a new workspace scope.
pub async fn reassign_runbook_session_by_id(
    state: State<'_, AppState>,
    session_id: String,
    to_scope_key: String,
) -> Result<(), String> {
    let db_guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    db.reassign_runbook_session_by_id(&session_id, &to_scope_key)
        .map_err(|e| e.to_string())
}

/// Configure integration connection metadata (ServiceNow, Slack, Teams).
pub async fn configure_integration(
    state: State<'_, AppState>,
    integration_type: String,
    enabled: bool,
    config_json: Option<String>,
) -> Result<(), String> {
    let normalized_type = integration_type.trim().to_ascii_lowercase();
    if !matches!(normalized_type.as_str(), "servicenow" | "slack" | "teams") {
        return Err(format!(
            "unsupported integration type '{}'; expected one of: servicenow, slack, teams",
            integration_type
        ));
    }

    let normalized_config = match config_json.map(|raw| raw.trim().to_string()) {
        Some(raw) if raw.is_empty() => None,
        Some(raw) => {
            let parsed: serde_json::Value = serde_json::from_str(&raw)
                .map_err(|e| format!("integration config must be valid JSON: {}", e))?;
            if !parsed.is_object() {
                return Err("integration config must be a JSON object".to_string());
            }
            Some(parsed.to_string())
        }
        None => None,
    };

    let db_guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    db.set_integration_config(&normalized_type, enabled, normalized_config.as_deref())
        .map_err(|e| e.to_string())
}

/// List integration connection statuses.
pub async fn list_integrations(
    state: State<'_, AppState>,
) -> Result<Vec<crate::db::IntegrationConfigRecord>, String> {
    let db_guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    db.list_integration_configs().map_err(|e| e.to_string())
}

/// Set workspace role mapping.
pub async fn set_workspace_role(
    state: State<'_, AppState>,
    workspace_id: String,
    principal: String,
    role_name: String,
) -> Result<(), String> {
    let db_guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    db.set_workspace_role(&workspace_id, &principal, &role_name)
        .map_err(|e| e.to_string())
}

/// List workspace roles for a workspace.
pub async fn list_workspace_roles(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<crate::db::WorkspaceRoleRecord>, String> {
    let db_guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    db.list_workspace_roles(&workspace_id)
        .map_err(|e| e.to_string())
}

// ============================================================================
// Phase 10: KB Management Commands
// ============================================================================

/// Update the content of a KB chunk
pub async fn update_chunk_content(
    state: State<'_, AppState>,
    chunk_id: String,
    content: String,
) -> Result<(), String> {
    validate_non_empty(&content).map_err(|e| e.to_string())?;
    validate_text_size(&content, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;

    let db_guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    db.update_chunk_content(&chunk_id, &content)
        .map_err(|e| e.to_string())
}

/// Get KB health statistics
pub async fn get_kb_health_stats(
    state: State<'_, AppState>,
) -> Result<crate::db::KbHealthStats, String> {
    let db_guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    db.get_kb_health_stats().map_err(|e| e.to_string())
}

// ============================================================================
// Phase 6: Draft Version Restore Command
// ============================================================================

/// Restore a draft to a previous version
pub async fn restore_draft_version(
    state: State<'_, AppState>,
    draft_id: String,
    version_id: String,
) -> Result<(), String> {
    let db_guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    db.restore_draft_version(&draft_id, &version_id)
        .map_err(|e| e.to_string())
}


// ============================================================================
// Phase 2 v0.4.0: KB Staleness / Review Commands
// ============================================================================

/// Mark a KB document as reviewed
pub async fn mark_document_reviewed(
    state: State<'_, AppState>,
    document_id: String,
    reviewed_by: Option<String>,
) -> Result<(), String> {
    let db_guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    db.mark_document_reviewed(&document_id, reviewed_by.as_deref())
        .map_err(|e| e.to_string())
}

/// Get documents that need review (stale or never reviewed)
pub async fn get_documents_needing_review(
    state: State<'_, AppState>,
    stale_days: Option<i64>,
    limit: Option<usize>,
) -> Result<Vec<crate::db::DocumentReviewInfo>, String> {
    let db_guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    db.get_documents_needing_review(stale_days.unwrap_or(30), limit.unwrap_or(50))
        .map_err(|e| e.to_string())
}


// ============================================================================
// Phase 2 v0.4.0: Saved Response Templates (Recycling) Commands
// ============================================================================

/// Save a response as a reusable template
pub async fn save_response_as_template(
    state: State<'_, AppState>,
    source_draft_id: Option<String>,
    source_rating: Option<i32>,
    name: String,
    category: Option<String>,
    content: String,
    variables_json: Option<String>,
) -> Result<String, String> {
    validate_non_empty(&name).map_err(|e| e.to_string())?;
    validate_non_empty(&content).map_err(|e| e.to_string())?;

    let db_guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let now = chrono::Utc::now().to_rfc3339();
    let template = crate::db::SavedResponseTemplate {
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

/// List saved response templates
pub async fn list_saved_response_templates(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<crate::db::SavedResponseTemplate>, String> {
    let db_guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    db.list_saved_response_templates(limit.unwrap_or(20))
        .map_err(|e| e.to_string())
}

/// Increment usage count for a saved response template
pub async fn increment_saved_template_usage(
    state: State<'_, AppState>,
    template_id: String,
) -> Result<(), String> {
    let db_guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    db.increment_saved_template_usage(&template_id)
        .map_err(|e| e.to_string())
}

/// Find saved responses similar to current input
pub async fn find_similar_saved_responses(
    state: State<'_, AppState>,
    input_text: String,
    limit: Option<usize>,
) -> Result<Vec<crate::db::SavedResponseTemplate>, String> {
    let db_guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    db.find_similar_saved_responses(&input_text, limit.unwrap_or(5))
        .map_err(|e| e.to_string())
}

// ============================================================================
// Phase 2 v0.4.0: Response Alternatives Commands
// ============================================================================

/// Save a response alternative
pub async fn save_response_alternative(
    state: State<'_, AppState>,
    draft_id: String,
    original_text: String,
    alternative_text: String,
    sources_json: Option<String>,
    metrics_json: Option<String>,
    generation_params_json: Option<String>,
) -> Result<String, String> {
    let db_guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let now = chrono::Utc::now().to_rfc3339();
    let alt = crate::db::ResponseAlternative {
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

    db.save_response_alternative(&alt)
        .map_err(|e| e.to_string())
}

/// Get alternatives for a draft
pub async fn get_alternatives_for_draft(
    state: State<'_, AppState>,
    draft_id: String,
) -> Result<Vec<crate::db::ResponseAlternative>, String> {
    let db_guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    db.get_alternatives_for_draft(&draft_id)
        .map_err(|e| e.to_string())
}

/// Choose an alternative response
pub async fn choose_alternative(
    state: State<'_, AppState>,
    alternative_id: String,
    choice: String,
) -> Result<(), String> {
    if choice != "original" && choice != "alternative" {
        return Err("Choice must be 'original' or 'alternative'".to_string());
    }

    let db_guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    db.choose_alternative(&alternative_id, &choice)
        .map_err(|e| e.to_string())
}


// ============================================================================
// Startup & Model State Commands (v0.4.1)
// ============================================================================

/// Get the last-used model state (for auto-load on startup)
pub fn get_model_state(state: State<'_, AppState>) -> Result<ModelStateResult, String> {
    model_runtime::get_model_state_impl(state)
}

pub type ModelStateResult = model_commands::ModelStateResult;

/// Get the last startup metrics
pub fn get_startup_metrics(state: State<'_, AppState>) -> Result<StartupMetricsResult, String> {
    model_runtime::get_startup_metrics_impl(state)
}

pub type StartupMetricsResult = model_commands::StartupMetricsResult;

#[cfg(test)]
mod tests {
    use super::custom_model_verification_status;
    use crate::model_integrity::VerificationResult;

    #[test]
    fn unverified_custom_models_are_rejected_by_default() {
        let result = custom_model_verification_status(
            VerificationResult::Unverified {
                filename: "custom.gguf".to_string(),
                sha256: "abc123".to_string(),
            },
            false,
        );

        let err = result.expect_err("unverified models should be rejected without override");
        assert!(err.contains("advanced override"));
    }

    #[test]
    fn unverified_custom_models_are_allowed_only_when_override_is_enabled() {
        let result = custom_model_verification_status(
            VerificationResult::Unverified {
                filename: "custom.gguf".to_string(),
                sha256: "abc123".to_string(),
            },
            true,
        )
        .expect("override should allow unverified models");

        assert_eq!(result.0, "unverified");
        assert_eq!(result.1.as_deref(), Some("abc123"));
    }
}
