use super::vector_runtime::purge_vectors_for_document;
use crate::AppState;
use crate::db::CURRENT_VECTOR_STORE_VERSION;
use crate::kb::indexer::{IndexResult, IndexStats, KbIndexer};
use crate::security::FileKeyStore;
use crate::validation::{
    normalize_and_validate_namespace_id, validate_non_empty, validate_text_size,
    validate_within_home, ValidationError, MAX_QUERY_BYTES, MAX_TEXT_INPUT_BYTES,
};
use once_cell::sync::Lazy;
use std::sync::Mutex as StdMutex;
use crate::kb::watcher::KbWatcher;
use tauri::{Emitter, State};

#[tauri::command]
pub fn set_kb_folder(state: State<'_, AppState>, folder_path: String) -> Result<(), String> {
    set_kb_folder_impl(state, folder_path)
}

#[tauri::command]
pub fn get_kb_folder(state: State<'_, AppState>) -> Result<Option<String>, String> {
    get_kb_folder_impl(state)
}

#[tauri::command]
pub async fn index_kb(
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<IndexResult, String> {
    index_kb_impl(window, state).await
}

#[tauri::command]
pub fn get_kb_stats(state: State<'_, AppState>) -> Result<IndexStats, String> {
    get_kb_stats_impl(state)
}

#[tauri::command]
pub fn list_kb_documents(
    state: State<'_, AppState>,
    namespace_id: Option<String>,
    source_id: Option<String>,
) -> Result<Vec<KbDocumentInfo>, String> {
    list_kb_documents_impl(state, namespace_id, source_id)
}

#[derive(serde::Serialize)]
pub struct KbDocumentInfo {
    pub id: String,
    pub file_path: String,
    pub title: Option<String>,
    pub indexed_at: Option<String>,
    pub chunk_count: Option<i64>,
    pub namespace_id: String,
    pub source_type: String,
    pub source_id: Option<String>,
}

#[tauri::command]
pub async fn remove_kb_document(
    file_path: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    remove_kb_document_impl(file_path, state).await
}

#[tauri::command]
pub async fn start_kb_watcher(
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    start_kb_watcher_impl(window, state).await
}

#[tauri::command]
pub fn stop_kb_watcher() -> Result<bool, String> {
    stop_kb_watcher_impl()
}

#[tauri::command]
pub fn is_kb_watcher_running() -> Result<bool, String> {
    is_kb_watcher_running_impl()
}

/// Global watcher instance
static KB_WATCHER: Lazy<StdMutex<Option<KbWatcher>>> = Lazy::new(|| StdMutex::new(None));
const KB_FOLDER_SETTING: &str = "kb_folder";

fn validate_stored_kb_path(folder_path: &str) -> Result<std::path::PathBuf, String> {
    let path = std::path::Path::new(folder_path);
    validate_within_home(path).map_err(|e| match e {
        ValidationError::PathTraversal => {
            "KB folder must be within your home directory".to_string()
        }
        ValidationError::InvalidFormat(msg) if msg.contains("sensitive") => {
            "This directory cannot be used as it contains sensitive data".to_string()
        }
        _ => format!("Invalid KB folder: {}", e),
    })
}

pub(crate) fn set_kb_folder_impl(
    state: State<'_, AppState>,
    folder_path: String,
) -> Result<(), String> {
    // Validate path is within home directory (auto-creates if needed)
    let validated_path = validate_stored_kb_path(&folder_path)?;

    // Verify it's a directory
    if !validated_path.is_dir() {
        return Err("Path is not a directory".into());
    }

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    // Store in settings
    db.conn()
        .execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            rusqlite::params![KB_FOLDER_SETTING, validated_path.to_string_lossy().as_ref()],
        )
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub(crate) fn get_kb_folder_impl(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let result: Result<String, _> = db.conn().query_row(
        "SELECT value FROM settings WHERE key = ?",
        rusqlite::params![KB_FOLDER_SETTING],
        |row| row.get(0),
    );

    match result {
        Ok(path) => Ok(Some(path)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub(crate) async fn index_kb_impl(
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<IndexResult, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    // Get KB folder
    let folder_path: String = db
        .conn()
        .query_row(
            "SELECT value FROM settings WHERE key = ?",
            rusqlite::params![KB_FOLDER_SETTING],
            |row| row.get(0),
        )
        .map_err(|_| "KB folder not configured")?;

    let validated_path = validate_stored_kb_path(&folder_path)?;
    if !validated_path.exists() {
        return Err("KB folder does not exist".into());
    }

    // Run indexing with progress events
    let indexer = KbIndexer::new();
    let result = indexer
        .index_folder(db, &validated_path, |progress| {
            // Emit progress event to frontend
            let _ = window.emit("kb:indexing:progress", &progress);
        })
        .map_err(|e| e.to_string())?;

    Ok(result)
}

pub(crate) fn get_kb_stats_impl(state: State<'_, AppState>) -> Result<IndexStats, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let indexer = KbIndexer::new();
    indexer.get_stats(db).map_err(|e| e.to_string())
}

pub(crate) fn list_kb_documents_impl(
    state: State<'_, AppState>,
    namespace_id: Option<String>,
    source_id: Option<String>,
) -> Result<Vec<KbDocumentInfo>, String> {
    // Validate and normalize namespace_id if provided
    let namespace_id = namespace_id
        .map(|ns| normalize_and_validate_namespace_id(&ns))
        .transpose()
        .map_err(|e| e.to_string())?;

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let docs = db
        .list_kb_documents(namespace_id.as_deref(), source_id.as_deref())
        .map_err(|e| e.to_string())?;

    Ok(docs
        .into_iter()
        .map(|d| KbDocumentInfo {
            id: d.id,
            file_path: d.file_path,
            title: d.title,
            indexed_at: d.indexed_at,
            chunk_count: d.chunk_count.map(|c| c as i64),
            namespace_id: d.namespace_id,
            source_type: d.source_type,
            source_id: d.source_id,
        })
        .collect())
}

pub(crate) async fn remove_kb_document_impl(
    file_path: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let document_id = {
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        let db = db_lock.as_ref().ok_or("Database not initialized")?;
        db.get_document_id_by_path(&file_path)
            .map_err(|e| e.to_string())?
    };

    if let Some(document_id) = document_id.as_deref() {
        purge_vectors_for_document(state.inner(), document_id).await?;
    }

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let indexer = KbIndexer::new();
    indexer
        .remove_document(db, &file_path)
        .map_err(|e| e.to_string())
}

pub(crate) async fn start_kb_watcher_impl(
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    // Get KB folder path
    let folder_path = {
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        let db = db_lock.as_ref().ok_or("Database not initialized")?;
        db.conn()
            .query_row(
                "SELECT value FROM settings WHERE key = ?",
                rusqlite::params![KB_FOLDER_SETTING],
                |row| row.get::<_, String>(0),
            )
            .map_err(|_| "KB folder not configured")?
    };

    let validated_path = validate_stored_kb_path(&folder_path)?;

    // Create and start watcher
    let mut watcher = KbWatcher::new(&validated_path).map_err(|e| e.to_string())?;
    let mut rx = watcher.start().map_err(|e| e.to_string())?;

    // Store watcher instance
    {
        let mut guard = KB_WATCHER.lock().map_err(|e| e.to_string())?;
        *guard = Some(watcher);
    }

    // Spawn event handler
    let window_clone = window.clone();
    tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            // Emit event to frontend
            let _ = window_clone.emit("kb:file:changed", &event);
        }
    });

    Ok(true)
}

pub(crate) fn stop_kb_watcher_impl() -> Result<bool, String> {
    let mut guard = KB_WATCHER.lock().map_err(|e| e.to_string())?;
    if let Some(mut watcher) = guard.take() {
        watcher.stop();
        Ok(true)
    } else {
        Ok(false)
    }
}

pub(crate) fn is_kb_watcher_running_impl() -> Result<bool, String> {
    let guard = KB_WATCHER.lock().map_err(|e| e.to_string())?;
    Ok(guard.as_ref().map(|w| w.is_running()).unwrap_or(false))
}

const NETWORK_INGEST_POLICY_ENV: &str = "ASSISTSUPPORT_ENABLE_NETWORK_INGEST";
const GITHUB_TOKEN_PREFIX: &str = "github_token:";

#[derive(Debug, Clone, serde::Deserialize)]
pub struct SearchOptionsParam {
    pub fts_weight: Option<f64>,
    pub vector_weight: Option<f64>,
    pub enable_dedup: Option<bool>,
    pub dedup_threshold: Option<f64>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct IngestResult {
    pub document_id: String,
    pub title: String,
    pub source_uri: String,
    pub chunk_count: usize,
    pub word_count: usize,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct BatchIngestResult {
    pub successful: Vec<IngestResult>,
    pub failed: Vec<FailedSource>,
    pub cancelled: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct FailedSource {
    pub source: String,
    pub error: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DiskIngestResultResponse {
    pub total_files: usize,
    pub ingested: usize,
    pub skipped: usize,
    pub errors: usize,
    pub documents: Vec<IngestResult>,
}

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

#[derive(Debug, Clone, serde::Serialize)]
pub struct DocumentChunk {
    pub id: String,
    pub chunk_index: i32,
    pub heading_path: Option<String>,
    pub content: String,
    pub word_count: Option<i32>,
}

fn network_ingest_enabled_by_policy() -> bool {
    std::env::var(NETWORK_INGEST_POLICY_ENV)
        .ok()
        .map(|value| value.trim().to_ascii_lowercase())
        .map(|value| matches!(value.as_str(), "1" | "true" | "yes" | "on" | "enabled"))
        .unwrap_or(false)
}

fn normalize_github_host(host: &str) -> Result<String, String> {
    let trimmed = host.trim();
    if trimmed.is_empty() {
        return Err("GitHub host cannot be empty".to_string());
    }
    if trimmed.contains("://") || trimmed.contains('/') {
        return Err("GitHub host must be a hostname (no scheme or path)".to_string());
    }

    let re =
        regex_lite::Regex::new(r"^[A-Za-z0-9.-]+(:[0-9]{1,5})?$").map_err(|e| e.to_string())?;
    if !re.is_match(trimmed) {
        return Err("GitHub host contains invalid characters".to_string());
    }

    Ok(trimmed.to_lowercase())
}

#[tauri::command]
pub async fn search_kb(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
    namespace_id: Option<String>,
) -> Result<Vec<crate::kb::search::SearchResult>, String> {
    search_kb_with_options(state, query, limit, namespace_id, None).await
}

#[tauri::command]
pub async fn search_kb_with_options(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
    namespace_id: Option<String>,
    options: Option<SearchOptionsParam>,
) -> Result<Vec<crate::kb::search::SearchResult>, String> {
    use crate::kb::search::{HybridSearch, SearchOptions};

    validate_non_empty(&query).map_err(|e| e.to_string())?;
    validate_text_size(&query, MAX_QUERY_BYTES).map_err(|e| e.to_string())?;

    let namespace_id = namespace_id
        .map(|ns| normalize_and_validate_namespace_id(&ns))
        .transpose()
        .map_err(|e| e.to_string())?;

    let limit = limit.unwrap_or(10).min(100);
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
    };

    let vectors_state = state.vectors.clone();
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

    let fts_results = {
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        let db = db_lock.as_ref().ok_or("Database not initialized")?;
        HybridSearch::fts_search_with_namespace(db, &query, ns_id.as_deref(), limit * 3)
            .map_err(|e| e.to_string())?
    };

    let vector_results = vector_handle.await.unwrap_or(None);

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let mut results = HybridSearch::fuse_results_with_options(
        db,
        fts_results,
        vector_results,
        search_opts.clone(),
    )
    .map_err(|e| e.to_string())?;

    results = HybridSearch::post_process_results(results, &search_opts);
    Ok(results)
}

#[tauri::command]
pub async fn get_search_context(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
    namespace_id: Option<String>,
) -> Result<String, String> {
    let results = search_kb(state, query, limit, namespace_id).await?;
    Ok(crate::kb::search::HybridSearch::format_context(&results))
}

#[tauri::command]
pub fn ingest_kb_from_disk(
    state: State<'_, AppState>,
    folder_path: String,
    namespace_id: String,
) -> Result<DiskIngestResultResponse, String> {
    use crate::kb::ingest::disk::DiskIngester;
    use std::path::Path;

    let namespace_id =
        normalize_and_validate_namespace_id(&namespace_id).map_err(|e| e.to_string())?;

    let validated_path = validate_within_home(Path::new(&folder_path)).map_err(|e| match e {
        ValidationError::PathTraversal => "Folder must be within your home directory".to_string(),
        ValidationError::InvalidFormat(msg) if msg.contains("sensitive") => {
            "This directory cannot be used as it contains sensitive data".to_string()
        }
        _ => format!("Invalid folder path: {}", e),
    })?;

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
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

#[tauri::command]
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

    let namespace_id =
        normalize_and_validate_namespace_id(&namespace_id).map_err(|e| e.to_string())?;

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.ensure_namespace_exists(&namespace_id)
        .map_err(|e| e.to_string())?;

    let config = WebIngestConfig::default();
    let cancel_token = CancellationToken::new();

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

#[tauri::command]
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

    let namespace_id =
        normalize_and_validate_namespace_id(&namespace_id).map_err(|e| e.to_string())?;

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.ensure_namespace_exists(&namespace_id)
        .map_err(|e| e.to_string())?;

    let config = YouTubeIngestConfig::default();
    let ingester = YouTubeIngester::new(config);

    if !ingester.check_ytdlp_available() {
        return Err("yt-dlp not found. Install with: brew install yt-dlp".to_string());
    }

    let cancel_token = CancellationToken::new();
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

#[tauri::command]
pub fn ingest_github(
    state: State<'_, AppState>,
    repo_path: String,
    namespace_id: String,
) -> Result<Vec<IngestResult>, String> {
    use crate::kb::ingest::github::{GitHubIngestConfig, GitHubIngester};
    use crate::kb::ingest::CancellationToken;
    use std::path::Path;

    let namespace_id =
        normalize_and_validate_namespace_id(&namespace_id).map_err(|e| e.to_string())?;

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

#[tauri::command]
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

    let namespace_id =
        normalize_and_validate_namespace_id(&namespace_id).map_err(|e| e.to_string())?;

    let remote = parse_https_repo_url(&repo_url).map_err(|e| e.to_string())?;
    let host_key = normalize_github_host(&remote.host_port)?;
    let token_key = format!("{}{}", GITHUB_TOKEN_PREFIX, host_key);
    let token = FileKeyStore::get_token(&token_key).map_err(|e| e.to_string())?;

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
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

#[tauri::command]
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

    let source_file = SourceFile::from_path(&validated_path).map_err(|e| e.to_string())?;
    db.ensure_namespace_exists(&source_file.namespace)
        .map_err(|e| e.to_string())?;

    let sources: Vec<String> = source_file.enabled_sources().map(|s| s.uri.clone()).collect();
    let config = BatchIngestConfig::default();
    let cancel_token = CancellationToken::new();
    let namespace = source_file.namespace.clone();

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

#[tauri::command]
pub fn list_namespaces(state: State<'_, AppState>) -> Result<Vec<crate::db::Namespace>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.list_namespaces().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_namespaces_with_counts(
    state: State<'_, AppState>,
) -> Result<Vec<crate::db::NamespaceWithCounts>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.list_namespaces_with_counts().map_err(|e| e.to_string())
}

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
pub async fn delete_namespace(state: State<'_, AppState>, name: String) -> Result<(), String> {
    super::vector_runtime::purge_vectors_for_namespace(state.inner(), &name).await?;

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.delete_namespace(&name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_ingest_sources(
    state: State<'_, AppState>,
    namespace_id: Option<String>,
) -> Result<Vec<crate::db::IngestSource>, String> {
    let namespace_id = namespace_id
        .map(|ns| normalize_and_validate_namespace_id(&ns))
        .transpose()
        .map_err(|e| e.to_string())?;

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.list_ingest_sources(namespace_id.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_ingest_source(state: State<'_, AppState>, source_id: String) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.delete_ingest_source(&source_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_source_health(
    state: State<'_, AppState>,
    namespace_id: Option<String>,
) -> Result<SourceHealthSummary, String> {
    let namespace_id = namespace_id
        .map(|ns| normalize_and_validate_namespace_id(&ns))
        .transpose()
        .map_err(|e| e.to_string())?;

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

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

#[tauri::command]
pub fn retry_source(state: State<'_, AppState>, source_id: String) -> Result<IngestResult, String> {
    let source = {
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        let db = db_lock.as_ref().ok_or("Database not initialized")?;
        db.get_ingest_source(&source_id)
            .map_err(|e| e.to_string())?
    };

    {
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        let db = db_lock.as_ref().ok_or("Database not initialized")?;
        db.update_ingest_source_status(&source_id, "pending", None)
            .map_err(|e| e.to_string())?;
    }

    match source.source_type.as_str() {
        "web" => ingest_url(state, source.source_uri, source.namespace_id),
        "youtube" => ingest_youtube(state, source.source_uri, source.namespace_id),
        "github" => {
            let results: Vec<IngestResult> =
                ingest_github(state, source.source_uri.clone(), source.namespace_id)?;
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

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
pub async fn clear_knowledge_data(
    state: State<'_, AppState>,
    namespace_id: Option<String>,
) -> Result<(), String> {
    let namespace_id = namespace_id
        .map(|ns| normalize_and_validate_namespace_id(&ns))
        .transpose()
        .map_err(|e| e.to_string())?;

    match namespace_id {
        Some(ns) => {
            super::vector_runtime::purge_vectors_for_namespace(state.inner(), &ns).await?;

            let db_lock = state.db.lock().map_err(|e| e.to_string())?;
            let db = db_lock.as_ref().ok_or("Database not initialized")?;
            db.conn()
                .execute("DELETE FROM kb_documents WHERE namespace_id = ?", [&ns])
                .map_err(|e| e.to_string())?;
            db.conn()
                .execute("DELETE FROM ingest_sources WHERE namespace_id = ?", [&ns])
                .map_err(|e| e.to_string())?;
        }
        None => {
            super::vector_runtime::ensure_vector_store_initialized(state.inner()).await?;
            {
                let mut vectors_lock = state.vectors.write().await;
                if let Some(store) = vectors_lock.as_mut() {
                    store.reset_table().await.map_err(|e| e.to_string())?;
                }
            }

            let db_lock = state.db.lock().map_err(|e| e.to_string())?;
            let db = db_lock.as_ref().ok_or("Database not initialized")?;
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

#[tauri::command]
pub fn check_ytdlp_available() -> Result<bool, String> {
    use std::process::Command;

    Ok(Command::new("yt-dlp")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false))
}

#[tauri::command]
pub fn list_document_versions(
    state: State<'_, AppState>,
    document_id: String,
) -> Result<Vec<crate::db::DocumentVersion>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.list_document_versions(&document_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
pub fn get_stale_sources(
    state: State<'_, AppState>,
    namespace_id: Option<String>,
) -> Result<Vec<crate::db::IngestSource>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.get_stale_sources(namespace_id.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_namespace_rule(
    state: State<'_, AppState>,
    namespace_id: String,
    rule_type: String,
    pattern_type: String,
    pattern: String,
    reason: Option<String>,
) -> Result<String, String> {
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

#[tauri::command]
pub fn delete_namespace_rule(state: State<'_, AppState>, rule_id: String) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.delete_namespace_rule(&rule_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_namespace_rules(
    state: State<'_, AppState>,
    namespace_id: String,
) -> Result<Vec<crate::db::NamespaceRule>, String> {
    let namespace_id =
        normalize_and_validate_namespace_id(&namespace_id).map_err(|e| e.to_string())?;

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    db.list_namespace_rules(&namespace_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
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
