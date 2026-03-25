//! AssistSupport - Self-contained local KB + LLM app for IT support

pub mod audit;
pub mod backup;
pub mod commands;
pub mod db;
pub mod diagnostics;
pub mod downloads;
pub mod error;
pub mod exports;
pub mod feedback;
pub mod jira;
pub mod jobs;
pub mod kb;
pub mod llm;
pub mod migration;
pub mod model_integrity;
pub mod prompts;
pub mod security;
pub mod sources;
pub mod validation;

use crate::db::Database;
use crate::jobs::JobManager;
use crate::kb::embeddings::EmbeddingEngine;
use crate::kb::vectors::VectorStore;
use crate::llm::LlmEngine;
use crate::security::MasterKey;
use llama_cpp_2::llama_backend::LlamaBackend;
use parking_lot::RwLock;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::sync::RwLock as TokioRwLock;

#[cfg(target_os = "macos")]
fn configure_ggml_metal_env() {
    // Work around a class of macOS Metal crashes/aborts observed in ggml's
    // residency-set teardown (ggml_metal_rsets_free). If the user explicitly set
    // the env var we respect it; otherwise default to the safer setting.
    if std::env::var_os("GGML_METAL_NO_RESIDENCY").is_none() {
        std::env::set_var("GGML_METAL_NO_RESIDENCY", "1");
    }
}

/// Application state
#[derive(Debug, Clone, serde::Serialize)]
pub struct StartupRecoveryConflict {
    pub name: String,
    pub old_path: String,
    pub new_path: String,
    pub reason: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct StartupRecoveryIssue {
    pub code: String,
    pub summary: String,
    pub details: Option<String>,
    pub can_repair: bool,
    pub can_restore_backup: bool,
    pub requires_manual_resolution: bool,
    pub migration_conflicts: Vec<StartupRecoveryConflict>,
}

pub struct PendingRecoveryContext {
    pub issue: StartupRecoveryIssue,
    pub db_path: Option<PathBuf>,
    pub master_key: Option<MasterKey>,
    pub key_storage_mode: Option<String>,
}

pub struct AppState {
    /// Shared llama.cpp backend — initialized once, shared by LLM and embedding engines
    pub backend: Option<Arc<LlamaBackend>>,
    pub backend_init_error: Option<String>,
    pub db: Mutex<Option<Database>>,
    pub recovery: Mutex<Option<PendingRecoveryContext>>,
    pub llm: Arc<RwLock<Option<LlmEngine>>>,
    pub embeddings: Arc<RwLock<Option<EmbeddingEngine>>>,
    pub vectors: Arc<TokioRwLock<Option<VectorStore>>>,
    pub jobs: Arc<JobManager>,
}

impl AppState {
    pub fn llama_backend(&self) -> Result<Arc<LlamaBackend>, String> {
        self.backend.clone().ok_or_else(|| {
            self.backend_init_error
                .clone()
                .unwrap_or_else(|| "LLM backend is unavailable on this machine".to_string())
        })
    }
}

impl Default for AppState {
    fn default() -> Self {
        let (backend, backend_init_error) = match LlamaBackend::init() {
            Ok(backend) => (Some(Arc::new(backend)), None),
            Err(error) => {
                let message = format!("Failed to initialize llama backend: {}", error);
                tracing::error!("{}", message);
                (None, Some(message))
            }
        };
        Self {
            backend,
            backend_init_error,
            db: Mutex::new(None),
            recovery: Mutex::new(None),
            llm: Arc::new(RwLock::new(None)),
            embeddings: Arc::new(RwLock::new(None)),
            vectors: Arc::new(TokioRwLock::new(None)),
            jobs: Arc::new(JobManager::new()),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "macos")]
    configure_ggml_metal_env();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(crate::assistsupport_generate_handler!());

    if let Err(error) = builder.run(tauri::generate_context!()) {
        tracing::error!("error while running tauri application: {}", error);
        eprintln!("AssistSupport failed to start: {}", error);
    }
}

#[cfg(test)]
mod tests {
    use crate::security::KeychainManager;

    #[test]
    fn test_keychain_available() {
        // This will vary by environment
        let available = KeychainManager::is_available();
        println!("Keychain available: {}", available);
    }
}
