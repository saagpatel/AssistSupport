use crate::downloads::ModelSource;
use crate::error::AppError;
use crate::kb::embeddings::EmbeddingModelInfo;
use crate::llm::{GenerationParams as LlmGenerationParams, ModelInfo};
use crate::prompts::{ResponseLength, TreeDecisions};
use crate::AppState;
use once_cell::sync::Lazy;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::State;

use super::decision_tree_runtime::{get_decision_tree_impl, list_decision_trees_impl};
use super::download_runtime::{
    delete_downloaded_model_impl, download_model_impl, get_embedding_model_path_impl,
    get_models_dir_impl, get_recommended_models_impl, is_embedding_model_downloaded_impl,
    list_downloaded_models_impl,
};
use super::embedding_runtime::{
    generate_kb_embeddings_internal, get_embedding_model_info_impl,
    init_embedding_engine_impl, init_vector_store_impl, is_embedding_model_loaded_impl,
    is_vector_enabled_impl, load_embedding_model_impl, set_vector_enabled_impl,
    unload_embedding_model_impl, get_vector_stats_impl,
};
use super::model_runtime::{
    cancel_generation_impl, generate_first_response_impl, generate_streaming_impl,
    generate_text_impl, generate_troubleshooting_checklist_impl, generate_with_context_impl,
    get_context_window_impl, get_model_info_impl, get_model_state_impl,
    get_startup_metrics_impl, init_llm_engine_impl, is_model_loaded_impl, load_custom_model_impl,
    load_model_impl, set_context_window_impl, test_model_impl,
    unload_model_impl, update_troubleshooting_checklist_impl, validate_gguf_file_impl,
};
use super::ocr_runtime::{is_ocr_available_impl, process_ocr_bytes_impl, process_ocr_impl};

pub(crate) static GENERATION_CANCEL_FLAG: Lazy<Arc<AtomicBool>> =
    Lazy::new(|| Arc::new(AtomicBool::new(false)));
pub(crate) static DOWNLOAD_CANCEL_FLAG: Lazy<Arc<AtomicBool>> =
    Lazy::new(|| Arc::new(AtomicBool::new(false)));

pub(crate) const CONTEXT_WINDOW_SETTING: &str = "llm_context_window";
pub(crate) const MAX_OCR_BASE64_BYTES: usize = 10 * 1024 * 1024;

#[derive(serde::Deserialize)]
pub struct GenerateParams {
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
    pub top_k: Option<i32>,
    pub repeat_penalty: Option<f32>,
    pub context_window: Option<u32>,
}

impl From<GenerateParams> for LlmGenerationParams {
    fn from(p: GenerateParams) -> Self {
        let mut params = LlmGenerationParams::default();
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

#[derive(serde::Serialize)]
pub struct GenerationResult {
    pub text: String,
    pub tokens_generated: u32,
    pub duration_ms: u64,
}

#[derive(serde::Deserialize)]
pub struct GenerateWithContextParams {
    pub user_input: String,
    pub kb_query: Option<String>,
    pub kb_limit: Option<usize>,
    pub ocr_text: Option<String>,
    pub diagnostic_notes: Option<String>,
    pub tree_decisions: Option<TreeDecisions>,
    pub jira_ticket: Option<crate::jira::JiraTicket>,
    pub response_length: Option<ResponseLength>,
    pub gen_params: Option<GenerateParams>,
}

#[derive(serde::Serialize)]
pub struct GenerationMetrics {
    pub tokens_per_second: f64,
    pub sources_used: u32,
    pub word_count: u32,
    pub length_target_met: bool,
    pub context_utilization: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConfidenceMode {
    Answer,
    Clarify,
    Abstain,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ConfidenceAssessment {
    pub mode: ConfidenceMode,
    pub score: f64,
    pub rationale: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GroundedClaim {
    pub claim: String,
    pub source_indexes: Vec<usize>,
    pub support_level: String,
}

#[derive(serde::Serialize)]
pub struct GenerateWithContextResult {
    pub text: String,
    pub tokens_generated: u32,
    pub duration_ms: u64,
    pub source_chunk_ids: Vec<String>,
    pub sources: Vec<ContextSource>,
    pub metrics: GenerationMetrics,
    pub prompt_template_version: String,
    pub confidence: ConfidenceAssessment,
    pub grounding: Vec<GroundedClaim>,
}

#[derive(Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FirstResponseTone {
    Slack,
    Jira,
}

#[derive(serde::Deserialize)]
pub struct FirstResponseParams {
    pub user_input: String,
    pub tone: FirstResponseTone,
    pub ocr_text: Option<String>,
    pub jira_ticket: Option<crate::jira::JiraTicket>,
}

#[derive(serde::Serialize)]
pub struct FirstResponseResult {
    pub text: String,
    pub tokens_generated: u32,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct ChecklistItem {
    pub id: String,
    pub text: String,
    pub category: Option<String>,
    pub priority: Option<String>,
    pub details: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct ChecklistState {
    pub items: Vec<ChecklistItem>,
    pub completed_ids: Vec<String>,
}

#[derive(serde::Deserialize)]
pub struct ChecklistGenerateParams {
    pub user_input: String,
    pub ocr_text: Option<String>,
    pub diagnostic_notes: Option<String>,
    pub tree_decisions: Option<TreeDecisions>,
    pub jira_ticket: Option<crate::jira::JiraTicket>,
}

#[derive(serde::Deserialize)]
pub struct ChecklistUpdateParams {
    pub user_input: String,
    pub ocr_text: Option<String>,
    pub diagnostic_notes: Option<String>,
    pub tree_decisions: Option<TreeDecisions>,
    pub jira_ticket: Option<crate::jira::JiraTicket>,
    pub checklist: ChecklistState,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ChecklistResult {
    pub items: Vec<ChecklistItem>,
}

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

#[derive(Clone, serde::Serialize)]
pub struct StreamToken {
    pub token: String,
    pub done: bool,
}

#[derive(serde::Serialize)]
pub struct TestModelResult {
    pub output: String,
    pub tokens_generated: u32,
    pub duration_ms: u64,
    pub tokens_per_sec: f64,
}

#[derive(serde::Serialize, Clone)]
pub struct ModelStateResult {
    pub llm_model_id: Option<String>,
    pub llm_model_path: Option<String>,
    pub llm_loaded: bool,
    pub embeddings_model_path: Option<String>,
    pub embeddings_loaded: bool,
}

#[derive(serde::Serialize, Clone)]
pub struct StartupMetricsResult {
    pub total_ms: i64,
    pub init_app_ms: i64,
    pub models_cached: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct GgufFileInfo {
    pub path: String,
    #[serde(rename = "file_name")]
    pub filename: String,
    #[serde(rename = "file_size")]
    pub size_bytes: u64,
    pub is_valid: bool,
}

#[derive(serde::Serialize)]
pub struct OcrResult {
    pub text: String,
    pub confidence: f32,
}

#[derive(serde::Serialize)]
pub struct EmbeddingGenerationResult {
    pub chunks_processed: usize,
    pub vectors_created: usize,
}

#[derive(serde::Serialize)]
pub struct VectorStats {
    pub enabled: bool,
    pub vector_count: usize,
    pub embedding_dim: usize,
    pub encryption_supported: bool,
}

pub type DecisionTree = crate::db::DecisionTree;

#[tauri::command]
pub fn get_model_state(state: State<'_, AppState>) -> Result<ModelStateResult, AppError> {
    get_model_state_impl(state)
}

#[tauri::command]
pub fn get_startup_metrics(state: State<'_, AppState>) -> Result<StartupMetricsResult, AppError> {
    get_startup_metrics_impl(state)
}

#[tauri::command]
pub fn init_llm_engine(state: State<'_, AppState>) -> Result<(), AppError> {
    init_llm_engine_impl(state)
}

#[tauri::command]
pub fn load_model(
    state: State<'_, AppState>,
    model_id: String,
    n_gpu_layers: Option<u32>,
) -> Result<ModelInfo, AppError> {
    load_model_impl(state, model_id, n_gpu_layers)
}

#[tauri::command]
pub fn load_custom_model(
    state: State<'_, AppState>,
    model_path: String,
    n_gpu_layers: Option<u32>,
) -> Result<ModelInfo, AppError> {
    load_custom_model_impl(state, model_path, n_gpu_layers)
}

#[tauri::command]
pub fn validate_gguf_file(model_path: String) -> Result<GgufFileInfo, AppError> {
    validate_gguf_file_impl(model_path)
}

#[tauri::command]
pub fn unload_model(state: State<'_, AppState>) -> Result<(), AppError> {
    unload_model_impl(state)
}

#[tauri::command]
pub fn get_model_info(state: State<'_, AppState>) -> Result<Option<ModelInfo>, AppError> {
    get_model_info_impl(state)
}

#[tauri::command]
pub fn is_model_loaded(state: State<'_, AppState>) -> Result<bool, AppError> {
    is_model_loaded_impl(state)
}

#[tauri::command]
pub fn get_context_window(state: State<'_, AppState>) -> Result<Option<u32>, AppError> {
    get_context_window_impl(state)
}

#[tauri::command]
pub fn set_context_window(state: State<'_, AppState>, size: Option<u32>) -> Result<(), AppError> {
    set_context_window_impl(state, size)
}

#[tauri::command]
pub fn get_recommended_models() -> Vec<ModelSource> {
    get_recommended_models_impl()
}

#[tauri::command]
pub fn list_downloaded_models() -> Result<Vec<String>, AppError> {
    list_downloaded_models_impl()
}

#[tauri::command]
pub fn get_embedding_model_path(model_id: String) -> Result<Option<String>, AppError> {
    get_embedding_model_path_impl(model_id)
}

#[tauri::command]
pub fn is_embedding_model_downloaded() -> Result<bool, AppError> {
    is_embedding_model_downloaded_impl()
}

#[tauri::command]
pub fn get_models_dir() -> Result<String, AppError> {
    get_models_dir_impl()
}

#[tauri::command]
pub fn delete_downloaded_model(filename: String) -> Result<(), AppError> {
    delete_downloaded_model_impl(filename)
}

#[tauri::command]
pub fn process_ocr(image_path: String) -> Result<OcrResult, AppError> {
    process_ocr_impl(image_path)
}

#[tauri::command]
pub fn process_ocr_bytes(image_base64: String) -> Result<OcrResult, AppError> {
    process_ocr_bytes_impl(image_base64)
}

#[tauri::command]
pub fn is_ocr_available() -> bool {
    is_ocr_available_impl()
}

#[tauri::command]
pub fn list_decision_trees(
    state: State<'_, AppState>,
) -> Result<Vec<DecisionTree>, crate::error::AppError> {
    list_decision_trees_impl(state)
}

#[tauri::command]
pub fn get_decision_tree(
    state: State<'_, AppState>,
    tree_id: String,
) -> Result<DecisionTree, crate::error::AppError> {
    get_decision_tree_impl(state, tree_id)
}

#[tauri::command]
pub async fn generate_text(
    state: State<'_, AppState>,
    prompt: String,
    params: Option<GenerateParams>,
) -> Result<GenerationResult, AppError> {
    generate_text_impl(state, prompt, params).await
}

#[tauri::command]
pub async fn generate_with_context(
    state: State<'_, AppState>,
    params: GenerateWithContextParams,
) -> Result<GenerateWithContextResult, AppError> {
    generate_with_context_impl(state, params).await
}

#[tauri::command]
pub async fn generate_streaming(
    window: tauri::Window,
    state: State<'_, AppState>,
    params: GenerateWithContextParams,
) -> Result<GenerateWithContextResult, AppError> {
    generate_streaming_impl(window, state, params).await
}

#[tauri::command]
pub async fn generate_first_response(
    state: State<'_, AppState>,
    params: FirstResponseParams,
) -> Result<FirstResponseResult, AppError> {
    generate_first_response_impl(state, params).await
}

#[tauri::command]
pub async fn generate_troubleshooting_checklist(
    state: State<'_, AppState>,
    params: ChecklistGenerateParams,
) -> Result<ChecklistResult, AppError> {
    generate_troubleshooting_checklist_impl(state, params).await
}

#[tauri::command]
pub async fn update_troubleshooting_checklist(
    state: State<'_, AppState>,
    params: ChecklistUpdateParams,
) -> Result<ChecklistResult, AppError> {
    update_troubleshooting_checklist_impl(state, params).await
}

#[tauri::command]
pub async fn test_model(state: State<'_, AppState>) -> Result<TestModelResult, AppError> {
    test_model_impl(state).await
}

#[tauri::command]
pub fn cancel_generation() -> Result<(), AppError> {
    cancel_generation_impl()
}

#[tauri::command]
pub async fn download_model(
    window: tauri::Window,
    model_id: String,
) -> Result<String, AppError> {
    download_model_impl(window, model_id).await
}

#[tauri::command]
pub fn cancel_download() -> Result<(), AppError> {
    DOWNLOAD_CANCEL_FLAG.store(true, std::sync::atomic::Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub async fn generate_kb_embeddings(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<EmbeddingGenerationResult, AppError> {
    generate_kb_embeddings_internal(state.inner(), &app_handle, true).await
}

#[tauri::command]
pub fn init_embedding_engine(state: State<'_, AppState>) -> Result<(), AppError> {
    init_embedding_engine_impl(state)
}

#[tauri::command]
pub fn load_embedding_model(
    state: State<'_, AppState>,
    path: String,
    n_gpu_layers: Option<u32>,
) -> Result<EmbeddingModelInfo, AppError> {
    load_embedding_model_impl(state, path, n_gpu_layers)
}

#[tauri::command]
pub fn unload_embedding_model(state: State<'_, AppState>) -> Result<(), AppError> {
    unload_embedding_model_impl(state)
}

#[tauri::command]
pub fn get_embedding_model_info(
    state: State<'_, AppState>,
) -> Result<Option<EmbeddingModelInfo>, AppError> {
    get_embedding_model_info_impl(state)
}

#[tauri::command]
pub fn is_embedding_model_loaded(state: State<'_, AppState>) -> Result<bool, AppError> {
    is_embedding_model_loaded_impl(state)
}

#[tauri::command]
pub async fn init_vector_store(state: State<'_, AppState>) -> Result<(), AppError> {
    init_vector_store_impl(state).await
}

#[tauri::command]
pub async fn set_vector_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), AppError> {
    set_vector_enabled_impl(state, enabled).await
}

#[tauri::command]
pub async fn is_vector_enabled(state: State<'_, AppState>) -> Result<bool, AppError> {
    is_vector_enabled_impl(state).await
}

#[tauri::command]
pub async fn get_vector_stats(state: State<'_, AppState>) -> Result<VectorStats, AppError> {
    get_vector_stats_impl(state).await
}
