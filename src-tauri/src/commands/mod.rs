//! Tauri command index for AssistSupport.
//!
//! Batch 6 centralizes registration in `registry.rs` and exposes the command
//! surface through domain-specific modules while preserving command names.

pub mod app_core_commands;
pub mod backup;
pub(crate) mod decision_tree_runtime;
pub mod diagnostics;
pub(crate) mod download_runtime;
pub mod draft_commands;
pub(crate) mod embedding_runtime;
pub mod jira_commands;
pub mod jobs_commands;
pub mod kb_commands;
pub mod memory_kernel;
pub mod model_commands;
pub(crate) mod model_runtime;
pub(crate) mod ocr_runtime;
pub mod operations_analytics_commands;
pub mod pilot_feedback;
pub mod product_workspace;
pub mod registry;
pub mod search_api;
pub mod security_commands;
pub mod startup_commands;
pub mod vector_runtime;

#[allow(unused_imports)]
pub use model_commands::{
    ConfidenceAssessment, ConfidenceMode, ContextSource, GenerateWithContextResult,
    GenerationMetrics, GroundedClaim,
};

#[allow(unused_imports)]
pub(crate) use vector_runtime::{
    ensure_vector_store_initialized, purge_vectors_for_document, purge_vectors_for_namespace,
    vector_store_requires_rebuild,
};
