#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ResponseRating {
    pub id: String,
    pub draft_id: String,
    pub rating: i32,
    pub feedback_text: Option<String>,
    pub feedback_category: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RatingStats {
    pub total_ratings: i64,
    pub average_rating: f64,
    pub distribution: Vec<i64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AnalyticsSummary {
    pub total_events: i64,
    pub responses_generated: i64,
    pub searches_performed: i64,
    pub drafts_saved: i64,
    pub daily_counts: Vec<DailyCount>,
    pub average_rating: f64,
    pub total_ratings: i64,
    pub rating_distribution: Vec<i64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ResponseQualitySummary {
    pub snapshots_count: i64,
    pub saved_count: i64,
    pub copied_count: i64,
    pub avg_word_count: f64,
    pub avg_edit_ratio: f64,
    pub edited_save_rate: f64,
    pub avg_time_to_draft_ms: Option<f64>,
    pub median_time_to_draft_ms: Option<i64>,
    pub copy_per_saved_ratio: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ResponseQualityDrilldownExample {
    pub draft_id: String,
    pub metric_value: f64,
    pub created_at: String,
    pub draft_excerpt: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ResponseQualityDrilldownExamples {
    pub edit_ratio: Vec<ResponseQualityDrilldownExample>,
    pub time_to_draft: Vec<ResponseQualityDrilldownExample>,
    pub copy_per_save: Vec<ResponseQualityDrilldownExample>,
    pub edited_save_rate: Vec<ResponseQualityDrilldownExample>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DailyCount {
    pub date: String,
    pub count: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleUsage {
    pub document_id: String,
    pub title: String,
    pub usage_count: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LowRatingAnalysis {
    pub low_rating_count: i64,
    pub total_rating_count: i64,
    pub low_rating_percentage: f64,
    pub feedback_categories: Vec<FeedbackCategoryCount>,
    pub recent_feedback: Vec<RecentLowFeedback>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FeedbackCategoryCount {
    pub category: String,
    pub count: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RecentLowFeedback {
    pub rating: i32,
    pub feedback_text: String,
    pub feedback_category: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct KbGapCandidate {
    pub id: String,
    pub query_signature: String,
    pub sample_query: String,
    pub occurrences: i64,
    pub low_confidence_count: i64,
    pub low_rating_count: i64,
    pub unsupported_claim_events: i64,
    pub suggested_category: Option<String>,
    pub status: String,
    pub resolution_note: Option<String>,
    pub first_seen_at: String,
    pub last_seen_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DeploymentRunRecord {
    pub id: String,
    pub target_channel: String,
    pub status: String,
    pub preflight_json: Option<String>,
    pub rollback_available: bool,
    pub created_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DeploymentHealthSummary {
    pub total_artifacts: i64,
    pub signed_artifacts: i64,
    pub unsigned_artifacts: i64,
    pub last_run: Option<DeploymentRunRecord>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DeploymentArtifactRecord {
    pub id: String,
    pub artifact_type: String,
    pub version: String,
    pub channel: String,
    pub sha256: String,
    pub is_signed: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SignedArtifactVerificationResult {
    pub artifact: DeploymentArtifactRecord,
    pub is_signed: bool,
    pub hash_matches: bool,
    pub status: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct EvalRunRecord {
    pub id: String,
    pub suite_name: String,
    pub total_cases: i32,
    pub passed_cases: i32,
    pub avg_confidence: f64,
    pub details_json: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TriageClusterRecord {
    pub id: String,
    pub cluster_key: String,
    pub summary: String,
    pub ticket_count: i32,
    pub tickets_json: String,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleAnalytics {
    pub document_id: String,
    pub title: String,
    pub file_path: String,
    pub total_uses: i64,
    pub average_rating: Option<f64>,
    pub draft_references: Vec<ArticleDraftReference>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArticleDraftReference {
    pub draft_id: String,
    pub input_text: String,
    pub response_text: Option<String>,
    pub created_at: String,
    pub rating: Option<i32>,
    pub feedback_text: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct JiraStatusTransition {
    pub id: String,
    pub draft_id: Option<String>,
    pub ticket_key: String,
    pub old_status: Option<String>,
    pub new_status: String,
    pub comment_id: Option<String>,
    pub transitioned_at: String,
}
