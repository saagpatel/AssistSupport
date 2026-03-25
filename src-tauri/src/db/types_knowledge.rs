#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Namespace {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct NamespaceWithCounts {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub document_count: i64,
    pub source_count: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct IngestSource {
    pub id: String,
    pub source_type: String,
    pub source_uri: String,
    pub namespace_id: String,
    pub title: Option<String>,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    pub content_hash: Option<String>,
    pub last_ingested_at: Option<String>,
    pub status: String,
    pub error_message: Option<String>,
    pub metadata_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DocumentVersion {
    pub id: String,
    pub document_id: String,
    pub version_number: i32,
    pub file_hash: String,
    pub created_at: String,
    pub change_reason: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct NamespaceRule {
    pub id: String,
    pub namespace_id: String,
    pub rule_type: String,
    pub pattern_type: String,
    pub pattern: String,
    pub reason: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct IngestRun {
    pub id: String,
    pub source_id: String,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub status: String,
    pub documents_added: Option<i32>,
    pub documents_updated: Option<i32>,
    pub documents_removed: Option<i32>,
    pub chunks_added: Option<i32>,
    pub error_message: Option<String>,
}

pub struct IngestRunCompletion<'a> {
    pub run_id: &'a str,
    pub status: &'a str,
    pub docs_added: i32,
    pub docs_updated: i32,
    pub docs_removed: i32,
    pub chunks_added: i32,
    pub error_message: Option<&'a str>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AllowlistEntry {
    pub id: String,
    pub host_pattern: String,
    pub reason: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct KbDocument {
    pub id: String,
    pub file_path: String,
    pub file_hash: String,
    pub title: Option<String>,
    pub indexed_at: Option<String>,
    pub chunk_count: Option<i32>,
    pub ocr_quality: Option<String>,
    pub partial_index: Option<bool>,
    pub namespace_id: String,
    pub source_type: String,
    pub source_id: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct KbHealthStats {
    pub total_documents: i64,
    pub total_chunks: i64,
    pub stale_documents: i64,
    pub namespace_distribution: Vec<NamespaceDistribution>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct NamespaceDistribution {
    pub namespace_id: String,
    pub namespace_name: String,
    pub document_count: i64,
    pub chunk_count: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DocumentReviewInfo {
    pub id: String,
    pub file_path: String,
    pub title: Option<String>,
    pub indexed_at: Option<String>,
    pub last_reviewed_at: Option<String>,
    pub last_reviewed_by: Option<String>,
    pub namespace_id: String,
    pub source_type: String,
}
