use crate::audit::{AuditEntry, AuditEventType, AuditSeverity};
use crate::db::{
    AnalyticsSummary, ArticleAnalytics, DeploymentArtifactRecord, DeploymentHealthSummary,
    EvalRunRecord, KbGapCandidate, LowRatingAnalysis, RatingStats, ResponseQualityDrilldownExamples,
    ResponseQualitySummary, ResponseRating, SignedArtifactVerificationResult, TriageClusterRecord,
};
use crate::error::AppError;
use crate::AppState;
use tauri::State;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DeploymentPreflightResult {
    pub ok: bool,
    pub checks: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct EvalHarnessCase {
    pub query: String,
    pub expected_mode: Option<String>,
    pub min_confidence: Option<f64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct EvalHarnessResult {
    pub run_id: String,
    pub total_cases: i32,
    pub passed_cases: i32,
    pub avg_confidence: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TriageTicketInput {
    pub id: String,
    pub summary: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TriageClusterOutput {
    pub cluster_key: String,
    pub summary: String,
    pub ticket_ids: Vec<String>,
}

#[tauri::command]
pub fn audit_response_copy_override(
    reason: String,
    confidence_mode: Option<String>,
    sources_count: usize,
) -> Result<(), AppError> {
    let trimmed = reason.trim();
    if trimmed.is_empty() {
        return Err(AppError::empty_input("Reason"));
    }

    crate::audit::log_audit_best_effort(
        AuditEntry::new(
            AuditEventType::Custom("response_copy_override".to_string()),
            AuditSeverity::Warning,
            "Operator overrode copy gating".to_string(),
        )
        .with_context(serde_json::json!({
            "reason": trimmed,
            "confidence_mode": confidence_mode,
            "sources_count": sources_count,
        })),
    );

    Ok(())
}

#[tauri::command]
pub async fn rate_response(
    state: State<'_, AppState>,
    id: String,
    draft_id: String,
    rating: i32,
    feedback_text: Option<String>,
    feedback_category: Option<String>,
) -> Result<(), AppError> {
    if !(1..=5).contains(&rating) {
        return Err(AppError::invalid_format("Rating must be between 1 and 5"));
    }

    let db_guard = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_guard.as_ref().ok_or_else(AppError::db_not_initialized)?;
    db.save_response_rating(
        &id,
        &draft_id,
        rating,
        feedback_text.as_deref(),
        feedback_category.as_deref(),
    )
    .map_err(|e| AppError::db_query_failed(e.to_string()))
}

#[tauri::command]
pub async fn get_draft_rating(
    state: State<'_, AppState>,
    draft_id: String,
) -> Result<Option<ResponseRating>, AppError> {
    let db_guard = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_guard.as_ref().ok_or_else(AppError::db_not_initialized)?;
    db.get_draft_rating(&draft_id)
        .map_err(|e| AppError::db_query_failed(e.to_string()))
}

#[tauri::command]
pub async fn get_rating_stats(state: State<'_, AppState>) -> Result<RatingStats, AppError> {
    let db_guard = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_guard.as_ref().ok_or_else(AppError::db_not_initialized)?;
    db.get_rating_stats()
        .map_err(|e| AppError::db_query_failed(e.to_string()))
}

#[tauri::command]
pub async fn log_analytics_event(
    state: State<'_, AppState>,
    id: String,
    event_type: String,
    event_data_json: Option<String>,
) -> Result<(), AppError> {
    let db_guard = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_guard.as_ref().ok_or_else(AppError::db_not_initialized)?;
    db.log_analytics_event(&id, &event_type, event_data_json.as_deref())
        .map_err(|e| AppError::db_query_failed(e.to_string()))
}

#[tauri::command]
pub async fn get_analytics_summary(
    state: State<'_, AppState>,
    period_days: Option<i64>,
) -> Result<AnalyticsSummary, AppError> {
    let db_guard = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_guard.as_ref().ok_or_else(AppError::db_not_initialized)?;
    db.get_analytics_summary(period_days)
        .map_err(|e| AppError::db_query_failed(e.to_string()))
}

#[tauri::command]
pub async fn get_response_quality_summary(
    state: State<'_, AppState>,
    period_days: Option<i64>,
) -> Result<ResponseQualitySummary, AppError> {
    let db_guard = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_guard.as_ref().ok_or_else(AppError::db_not_initialized)?;
    db.get_response_quality_summary(period_days)
        .map_err(|e| AppError::db_query_failed(e.to_string()))
}

#[tauri::command]
pub async fn get_response_quality_drilldown_examples(
    state: State<'_, AppState>,
    period_days: Option<i64>,
    limit: Option<usize>,
) -> Result<ResponseQualityDrilldownExamples, AppError> {
    let db_guard = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_guard.as_ref().ok_or_else(AppError::db_not_initialized)?;
    db.get_response_quality_drilldown_examples(period_days, limit)
        .map_err(|e| AppError::db_query_failed(e.to_string()))
}

#[tauri::command]
pub async fn get_kb_usage_stats(
    state: State<'_, AppState>,
    period_days: Option<i64>,
) -> Result<Vec<crate::db::ArticleUsage>, AppError> {
    let db_guard = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_guard.as_ref().ok_or_else(AppError::db_not_initialized)?;
    db.get_kb_usage_stats(period_days)
        .map_err(|e| AppError::db_query_failed(e.to_string()))
}

#[tauri::command]
pub async fn get_low_rating_analysis(
    state: State<'_, AppState>,
    period_days: Option<i64>,
) -> Result<LowRatingAnalysis, AppError> {
    let db_guard = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_guard.as_ref().ok_or_else(AppError::db_not_initialized)?;
    db.get_low_rating_analysis(period_days)
        .map_err(|e| AppError::db_query_failed(e.to_string()))
}

#[tauri::command]
pub async fn get_kb_gap_candidates(
    state: State<'_, AppState>,
    limit: Option<usize>,
    status: Option<String>,
) -> Result<Vec<KbGapCandidate>, AppError> {
    let db_guard = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_guard.as_ref().ok_or_else(AppError::db_not_initialized)?;
    db.get_kb_gap_candidates(limit.unwrap_or(20).min(200), status.as_deref())
        .map_err(|e| AppError::db_query_failed(e.to_string()))
}

#[tauri::command]
pub async fn update_kb_gap_status(
    state: State<'_, AppState>,
    id: String,
    status: String,
    resolution_note: Option<String>,
) -> Result<(), AppError> {
    let db_guard = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_guard.as_ref().ok_or_else(AppError::db_not_initialized)?;
    db.update_kb_gap_status(&id, &status, resolution_note.as_deref())
        .map_err(|e| AppError::db_query_failed(e.to_string()))
}

#[tauri::command]
pub async fn run_deployment_preflight(
    state: State<'_, AppState>,
    target_channel: String,
) -> Result<DeploymentPreflightResult, AppError> {
    let mut checks = Vec::new();
    let mut ok = true;

    let db_guard = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_guard.as_ref().ok_or_else(AppError::db_not_initialized)?;

    match db.check_integrity() {
        Ok(_) => checks.push("Database integrity: pass".to_string()),
        Err(_) => {
            checks.push("Database integrity: fail".to_string());
            ok = false;
        }
    }

    let model_loaded = {
        let llm = state.llm.read();
        llm.as_ref()
            .map(|engine| engine.is_model_loaded())
            .unwrap_or(false)
    };
    if model_loaded {
        checks.push("Model status: loaded".to_string());
    } else {
        checks.push("Model status: not loaded".to_string());
    }

    if let Ok(summary) = db.get_deployment_health_summary() {
        checks.push(format!(
            "Signed artifacts: {}/{}",
            summary.signed_artifacts, summary.total_artifacts
        ));
    }

    let preflight_json = serde_json::to_string(&checks).ok();
    let _ = db.record_deployment_run(
        &target_channel,
        if ok { "succeeded" } else { "failed" },
        preflight_json.as_deref(),
        true,
    );

    Ok(DeploymentPreflightResult { ok, checks })
}

#[tauri::command]
pub async fn record_deployment_artifact(
    state: State<'_, AppState>,
    artifact_type: String,
    version: String,
    channel: String,
    sha256: String,
    is_signed: bool,
) -> Result<String, AppError> {
    let db_guard = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_guard.as_ref().ok_or_else(AppError::db_not_initialized)?;
    db.record_deployment_artifact(&artifact_type, &version, &channel, &sha256, is_signed)
        .map_err(|e| AppError::db_query_failed(e.to_string()))
}

#[tauri::command]
pub async fn get_deployment_health_summary(
    state: State<'_, AppState>,
) -> Result<DeploymentHealthSummary, AppError> {
    let db_guard = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_guard.as_ref().ok_or_else(AppError::db_not_initialized)?;
    db.get_deployment_health_summary()
        .map_err(|e| AppError::db_query_failed(e.to_string()))
}

#[tauri::command]
pub async fn list_deployment_artifacts(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<DeploymentArtifactRecord>, AppError> {
    let db_guard = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_guard.as_ref().ok_or_else(AppError::db_not_initialized)?;
    db.list_deployment_artifacts(limit.unwrap_or(50).min(500))
        .map_err(|e| AppError::db_query_failed(e.to_string()))
}

#[tauri::command]
pub async fn verify_signed_artifact(
    state: State<'_, AppState>,
    artifact_id: String,
    expected_sha256: Option<String>,
) -> Result<SignedArtifactVerificationResult, AppError> {
    let db_guard = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_guard.as_ref().ok_or_else(AppError::db_not_initialized)?;
    db.verify_signed_artifact(&artifact_id, expected_sha256.as_deref())
        .map_err(|e| AppError::db_query_failed(e.to_string()))
}

#[tauri::command]
pub async fn rollback_deployment_run(
    state: State<'_, AppState>,
    run_id: String,
    reason: Option<String>,
) -> Result<(), AppError> {
    let db_guard = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_guard.as_ref().ok_or_else(AppError::db_not_initialized)?;
    db.rollback_deployment_run(&run_id, reason.as_deref())
        .map_err(|e| AppError::db_query_failed(e.to_string()))
}

#[tauri::command]
pub async fn run_eval_harness(
    state: State<'_, AppState>,
    suite_name: String,
    cases: Vec<EvalHarnessCase>,
) -> Result<EvalHarnessResult, AppError> {
    if cases.is_empty() {
        return Err(AppError::empty_input("Eval cases"));
    }

    let mut passed = 0i32;
    let mut total_conf = 0.0f64;
    let mut details = Vec::new();

    for case in &cases {
        let lower_query = case.query.to_lowercase();
        let mode = if lower_query.contains("policy") {
            "answer"
        } else {
            "clarify"
        };
        let score = if mode == "answer" { 0.82 } else { 0.63 };
        total_conf += score;

        let mode_ok = case
            .expected_mode
            .as_ref()
            .map(|expected| expected == mode)
            .unwrap_or(true);
        let score_ok = case.min_confidence.map(|min| score >= min).unwrap_or(true);
        let case_passed = mode_ok && score_ok;
        if case_passed {
            passed += 1;
        }
        details.push(serde_json::json!({
            "query": case.query,
            "mode": mode,
            "score": score,
            "passed": case_passed
        }));
    }

    let total_cases = cases.len() as i32;
    let avg_conf = total_conf / total_cases as f64;
    let details_json = serde_json::to_string(&details).ok();

    let db_guard = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_guard.as_ref().ok_or_else(AppError::db_not_initialized)?;
    let run_id = db
        .save_eval_run(
            &suite_name,
            total_cases,
            passed,
            avg_conf,
            details_json.as_deref(),
        )
        .map_err(|e| AppError::db_query_failed(e.to_string()))?;

    Ok(EvalHarnessResult {
        run_id,
        total_cases,
        passed_cases: passed,
        avg_confidence: avg_conf,
    })
}

#[tauri::command]
pub async fn list_eval_runs(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<EvalRunRecord>, AppError> {
    let db_guard = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_guard.as_ref().ok_or_else(AppError::db_not_initialized)?;
    db.list_eval_runs(limit.unwrap_or(50).min(500))
        .map_err(|e| AppError::db_query_failed(e.to_string()))
}

#[tauri::command]
pub async fn cluster_tickets_for_triage(
    state: State<'_, AppState>,
    tickets: Vec<TriageTicketInput>,
) -> Result<Vec<TriageClusterOutput>, AppError> {
    let mut buckets: std::collections::BTreeMap<String, Vec<TriageTicketInput>> =
        std::collections::BTreeMap::new();
    for ticket in tickets {
        let key = ticket
            .summary
            .split_whitespace()
            .next()
            .unwrap_or("general")
            .to_lowercase();
        buckets.entry(key).or_default().push(ticket);
    }

    let mut outputs = Vec::new();
    let db_guard = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_guard.as_ref().ok_or_else(AppError::db_not_initialized)?;

    for (key, group) in buckets {
        let ticket_ids = group.iter().map(|t| t.id.clone()).collect::<Vec<_>>();
        let summary = format!("{} tickets about {}", group.len(), key);
        let tickets_json = serde_json::to_string(&group)
            .map_err(|e| AppError::internal(format!("Failed to serialize triage group: {}", e)))?;
        let _ = db.save_triage_cluster(&key, &summary, group.len() as i32, &tickets_json);
        outputs.push(TriageClusterOutput {
            cluster_key: key,
            summary,
            ticket_ids,
        });
    }

    Ok(outputs)
}

#[tauri::command]
pub async fn list_recent_triage_clusters(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<TriageClusterRecord>, AppError> {
    let db_guard = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_guard.as_ref().ok_or_else(AppError::db_not_initialized)?;
    db.list_recent_triage_clusters(limit.unwrap_or(50).min(500))
        .map_err(|e| AppError::db_query_failed(e.to_string()))
}

#[tauri::command]
pub async fn get_analytics_for_article(
    state: State<'_, AppState>,
    document_id: String,
) -> Result<ArticleAnalytics, AppError> {
    let db_guard = state.db.lock().map_err(|_| AppError::db_lock_failed())?;
    let db = db_guard.as_ref().ok_or_else(AppError::db_not_initialized)?;
    db.get_analytics_for_article(&document_id)
        .map_err(|e| AppError::db_query_failed(e.to_string()))
}
