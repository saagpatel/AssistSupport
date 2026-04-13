/// Chunk payload used when generating vector embeddings.
#[derive(Debug, Clone)]
pub struct ChunkEmbeddingRecord {
    pub chunk_id: String,
    pub content: String,
    pub document_id: String,
    pub namespace_id: String,
}

/// Metrics payload recorded for generation quality monitoring.
pub struct GenerationQualityEvent<'a> {
    pub query_text: &'a str,
    pub confidence_mode: &'a str,
    pub confidence_score: f64,
    pub unsupported_claims: i32,
    pub total_claims: i32,
    pub source_count: i32,
    pub avg_source_score: f64,
}

/// FTS5 search result
#[derive(Debug, Clone, serde::Serialize)]
pub struct FtsSearchResult {
    pub chunk_id: String,
    pub document_id: String,
    pub heading_path: Option<String>,
    pub snippet: String,
    pub rank: f64,
}

/// Vector consent status
#[derive(Debug, Clone, serde::Serialize)]
pub struct VectorConsent {
    pub enabled: bool,
    pub consented_at: Option<String>,
    pub encryption_supported: Option<bool>,
}

/// Decision tree from database
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DecisionTree {
    pub id: String,
    pub name: String,
    pub category: Option<String>,
    pub tree_json: String,
    pub source: String,
    pub created_at: String,
    pub updated_at: String,
}
