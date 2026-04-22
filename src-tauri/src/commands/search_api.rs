//! Tauri commands for the local AssistSupport search sidecar.
//!
//! These commands proxy requests to the Python Flask API running on localhost:3000,
//! which performs adaptive hybrid BM25 + HNSW vector search against PostgreSQL.

use crate::db::get_app_data_dir;
use crate::error::{AppError, ErrorCategory, ErrorCode};
use crate::security::{FileKeyStore, TOKEN_SEARCH_API};
use crate::validation::validate_loopback_http_base_url;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use tauri::Manager;

const SEARCH_API_BASE: &str = "http://localhost:3000";
const SEARCH_API_TOKEN_ENV: &str = "ASSISTSUPPORT_SEARCH_API_KEY";
const SEARCH_API_LEGACY_TOKEN_ENV: &str = "ASSISTSUPPORT_API_KEY";
const DEFAULT_TOP_K: usize = 10;
const MAX_TOP_K: usize = 50;
const MIN_TOP_K: usize = 1;
const SEARCH_API_EMBEDDING_MANAGER_SCRIPT: &str = "managed_embedding_model.py";

// ── Request / Response types ──────────────────────────────────────────────────

#[derive(Debug, Serialize)]
struct SearchApiRequest {
    query: String,
    top_k: usize,
    include_scores: bool,
}

#[derive(Debug, Serialize)]
struct FeedbackApiRequest {
    query_id: String,
    result_rank: usize,
    rating: String,
    comment: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HybridSearchScores {
    pub bm25: f64,
    pub vector: f64,
    pub fused: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HybridSearchResult {
    pub rank: usize,
    pub article_id: String,
    pub title: String,
    pub category: String,
    pub preview: String,
    pub source_document: Option<String>,
    pub section: Option<String>,
    pub scores: Option<HybridSearchScores>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HybridSearchMetrics {
    pub latency_ms: f64,
    pub embedding_time_ms: f64,
    pub search_time_ms: f64,
    pub result_count: usize,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HybridSearchResponse {
    pub status: String,
    pub query: String,
    pub query_id: Option<String>,
    pub intent: String,
    pub intent_confidence: f64,
    pub results_count: usize,
    pub results: Vec<HybridSearchResult>,
    pub metrics: HybridSearchMetrics,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchApiLatency {
    pub avg: f64,
    pub p50: f64,
    pub p95: f64,
    pub p99: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchApiFeedbackStats {
    #[serde(default)]
    pub helpful: u64,
    #[serde(default)]
    pub not_helpful: u64,
    #[serde(default)]
    pub incorrect: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchApiStatsData {
    pub queries_24h: u64,
    pub queries_total: u64,
    pub latency_ms: SearchApiLatency,
    pub feedback_stats: SearchApiFeedbackStats,
    pub intent_distribution: std::collections::HashMap<String, u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchApiHealthStatus {
    pub healthy: bool,
    pub status: String,
    pub message: String,
    pub base_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchApiEmbeddingModelStatus {
    pub installed: bool,
    pub ready: bool,
    pub model_name: String,
    pub revision: String,
    pub local_path: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct StatsApiResponse {
    #[allow(dead_code)]
    status: String,
    data: SearchApiStatsData,
    #[allow(dead_code)]
    timestamp: String,
}

#[derive(Debug, Deserialize)]
struct HealthApiResponse {
    status: String,
    #[allow(dead_code)]
    service: Option<String>,
    #[allow(dead_code)]
    timestamp: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ReadyCheckResponse {
    status: Option<String>,
    #[allow(dead_code)]
    error: Option<String>,
    #[allow(dead_code)]
    errors: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct ReadyApiResponse {
    status: String,
    #[allow(dead_code)]
    service: Option<String>,
    #[allow(dead_code)]
    timestamp: Option<String>,
    #[serde(default)]
    checks: std::collections::HashMap<String, ReadyCheckResponse>,
}

// ── AppError helpers for the search-api domain ────────────────────────────────

/// Network-layer failure (DNS, connect, TLS, timeout, reqwest::Error).
fn search_api_network_err(op: &str, e: impl std::fmt::Display) -> AppError {
    AppError::connection_failed(format!("Search API {}: {}", op, e))
}

/// Non-2xx HTTP response — carry the status + body as detail.
fn search_api_http_err(op: &str, status: StatusCode, body: &str) -> AppError {
    AppError::new(
        ErrorCode::NETWORK_CONNECTION_FAILED,
        format!("Search API {} failed ({})", op, status),
        ErrorCategory::Network,
    )
    .with_detail(body.to_string())
}

/// JSON decoding failed — the server sent a malformed payload.
fn search_api_parse_err(op: &str, e: impl std::fmt::Display) -> AppError {
    AppError::new(
        ErrorCode::VALIDATION_INVALID_FORMAT,
        format!("Failed to parse Search API {} response", op),
        ErrorCategory::Validation,
    )
    .with_detail(e.to_string())
}

// ── Internal helpers ──────────────────────────────────────────────────────────

fn search_api_base() -> Result<String, AppError> {
    let from_env = std::env::var("ASSISTSUPPORT_SEARCH_API_BASE_URL")
        .ok()
        .map(|v| v.trim().trim_end_matches('/').to_string())
        .filter(|v| !v.is_empty());

    match from_env {
        Some(candidate) => validate_loopback_http_base_url(&candidate).map_err(|e| {
            AppError::invalid_url(format!(
                "ASSISTSUPPORT_SEARCH_API_BASE_URL rejected: {}",
                e
            ))
        }),
        None => Ok(SEARCH_API_BASE.to_string()),
    }
}

fn search_api_auth_token() -> Result<String, AppError> {
    // Avoid secure-store access in unit tests to prevent keychain prompts/hangs.
    if !cfg!(test) {
        if let Ok(Some(value)) = FileKeyStore::get_token(TOKEN_SEARCH_API) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Ok(trimmed.to_string());
            }
        }
    }

    for key in [SEARCH_API_TOKEN_ENV, SEARCH_API_LEGACY_TOKEN_ENV] {
        if let Ok(value) = std::env::var(key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Ok(trimmed.to_string());
            }
        }
    }

    Err(AppError::new(
        ErrorCode::SECURITY_AUTH_FAILED,
        "Search API token is not configured. Set ASSISTSUPPORT_SEARCH_API_KEY (or ASSISTSUPPORT_API_KEY) and restart AssistSupport.",
        ErrorCategory::Security,
    ))
}

fn sanitize_top_k(top_k: Option<usize>) -> usize {
    top_k.unwrap_or(DEFAULT_TOP_K).clamp(MIN_TOP_K, MAX_TOP_K)
}

fn is_valid_feedback_rating(rating: &str) -> bool {
    matches!(rating, "helpful" | "not_helpful" | "incorrect")
}

fn is_html_payload(content_type: Option<&str>, body: &str) -> bool {
    let ct_has_html = content_type
        .map(|ct| ct.to_ascii_lowercase().contains("text/html"))
        .unwrap_or(false);
    let body_trimmed = body.trim_start();
    ct_has_html || body_trimmed.starts_with("<!DOCTYPE html") || body_trimmed.starts_with("<html")
}

fn classify_health_response(
    status_code: StatusCode,
    content_type: Option<&str>,
    body: &str,
    base_url: &str,
) -> SearchApiHealthStatus {
    let base = base_url.to_string();

    if !status_code.is_success() {
        return SearchApiHealthStatus {
            healthy: false,
            status: "offline".to_string(),
            message: format!(
                "Search API responded with HTTP {} at {}/health",
                status_code.as_u16(),
                base_url
            ),
            base_url: base,
        };
    }

    if let Ok(health) = serde_json::from_str::<HealthApiResponse>(body) {
        if health.status == "ok" {
            return SearchApiHealthStatus {
                healthy: true,
                status: "ok".to_string(),
                message: "Connected".to_string(),
                base_url: base,
            };
        }

        return SearchApiHealthStatus {
            healthy: false,
            status: "degraded".to_string(),
            message: format!("Search API reported status '{}'", health.status),
            base_url: base,
        };
    }

    if is_html_payload(content_type, body) {
        return SearchApiHealthStatus {
            healthy: false,
            status: "wrong-service".to_string(),
            message: format!(
                "Port 3000 is serving HTML instead of AssistSupport Search API JSON. Start search-api and ensure {}/health returns JSON.",
                base_url
            ),
            base_url: base,
        };
    }

    SearchApiHealthStatus {
        healthy: false,
        status: "invalid-response".to_string(),
        message: format!(
            "Search API health endpoint returned an unexpected response at {}/health",
            base_url
        ),
        base_url: base,
    }
}

fn classify_ready_response(
    status_code: StatusCode,
    content_type: Option<&str>,
    body: &str,
    base_url: &str,
) -> SearchApiHealthStatus {
    let base = base_url.to_string();

    if let Ok(ready) = serde_json::from_str::<ReadyApiResponse>(body) {
        if ready.status == "ok" {
            return SearchApiHealthStatus {
                healthy: true,
                status: "ok".to_string(),
                message: "Search API is ready".to_string(),
                base_url: base,
            };
        }

        let failing_checks = ready
            .checks
            .iter()
            .filter(|(_, check)| check.status.as_deref() != Some("ok"))
            .map(|(name, check)| {
                if let Some(error) = &check.error {
                    format!("{}: {}", name, error)
                } else if let Some(errors) = &check.errors {
                    format!("{}: {}", name, errors.join(", "))
                } else {
                    format!("{}: not ready", name)
                }
            })
            .collect::<Vec<_>>();

        return SearchApiHealthStatus {
            healthy: false,
            status: "degraded".to_string(),
            message: if failing_checks.is_empty() {
                "Search API reported degraded readiness".to_string()
            } else {
                format!("Search API degraded: {}", failing_checks.join("; "))
            },
            base_url: base,
        };
    }

    if is_html_payload(content_type, body) {
        return SearchApiHealthStatus {
            healthy: false,
            status: "wrong-service".to_string(),
            message: format!(
                "Port 3000 is serving HTML instead of AssistSupport Search API JSON. Start search-api and ensure {}/ready returns JSON.",
                base_url
            ),
            base_url: base,
        };
    }

    SearchApiHealthStatus {
        healthy: false,
        status: if status_code.is_success() {
            "invalid-response".to_string()
        } else {
            "degraded".to_string()
        },
        message: format!(
            "Search API readiness endpoint returned an unexpected response at {}/ready",
            base_url
        ),
        base_url: base,
    }
}

fn dev_search_api_runner() -> Option<PathBuf> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()?
        .join("scripts")
        .join("search-api")
        .join("run-python.sh");
    path.exists().then_some(path)
}

fn bundled_search_api_manager_script(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path()
        .resource_dir()
        .ok()
        .map(|dir| {
            dir.join("search-api")
                .join(SEARCH_API_EMBEDDING_MANAGER_SCRIPT)
        })
        .filter(|path| path.exists())
}

fn repo_search_api_manager_script() -> Option<PathBuf> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()?
        .join("search-api")
        .join(SEARCH_API_EMBEDDING_MANAGER_SCRIPT);
    path.exists().then_some(path)
}

fn parse_embedding_manager_output(
    output: std::process::Output,
) -> Result<SearchApiEmbeddingModelStatus, AppError> {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    let parsed = serde_json::from_str::<SearchApiEmbeddingModelStatus>(&stdout).map_err(|e| {
        AppError::new(
            ErrorCode::VALIDATION_INVALID_FORMAT,
            "Failed to parse embedding manager output",
            ErrorCategory::Validation,
        )
        .with_detail(e.to_string())
    })?;

    if output.status.success() {
        return Ok(parsed);
    }

    let message = parsed.error.unwrap_or_else(|| {
        if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            "Embedding manager failed".to_string()
        }
    });
    Err(AppError::new(
        ErrorCode::MODEL_LOAD_FAILED,
        "Embedding manager reported failure",
        ErrorCategory::Model,
    )
    .with_detail(message))
}

fn run_search_api_embedding_manager(
    app: &tauri::AppHandle,
    action: &str,
) -> Result<SearchApiEmbeddingModelStatus, AppError> {
    let app_data_dir = get_app_data_dir();
    let app_data_dir_str = app_data_dir
        .to_str()
        .ok_or_else(|| AppError::internal("App data directory contains invalid UTF-8"))?;

    if let Some(runner) = dev_search_api_runner() {
        let output = Command::new(&runner)
            .arg(SEARCH_API_EMBEDDING_MANAGER_SCRIPT)
            .arg(action)
            .arg("--json")
            .arg("--app-data-dir")
            .arg(app_data_dir_str)
            .output()
            .map_err(|e| {
                AppError::internal(format!("Failed to run search-api model manager: {}", e))
            })?;
        return parse_embedding_manager_output(output);
    }

    let script_path = bundled_search_api_manager_script(app)
        .or_else(repo_search_api_manager_script)
        .ok_or_else(|| AppError::internal("Managed embedding model script is unavailable"))?;

    let output = Command::new("python3")
        .arg(script_path)
        .arg(action)
        .arg("--json")
        .arg("--app-data-dir")
        .arg(app_data_dir_str)
        .output()
        .map_err(|e| {
            AppError::internal(format!(
                "Failed to run python3 for search-api model manager: {}",
                e
            ))
        })?;
    parse_embedding_manager_output(output)
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_search_api_embedding_model_status(
    app: tauri::AppHandle,
) -> Result<SearchApiEmbeddingModelStatus, AppError> {
    tokio::task::spawn_blocking(move || run_search_api_embedding_manager(&app, "status"))
        .await
        .map_err(|e| AppError::internal(format!("embedding-manager task: {}", e)))?
}

#[tauri::command]
pub async fn install_search_api_embedding_model(
    app: tauri::AppHandle,
) -> Result<SearchApiEmbeddingModelStatus, AppError> {
    tokio::task::spawn_blocking(move || run_search_api_embedding_manager(&app, "install"))
        .await
        .map_err(|e| AppError::internal(format!("embedding-manager task: {}", e)))?
}

/// Execute a hybrid search against the PostgreSQL search API.
#[tauri::command]
pub async fn hybrid_search(
    query: String,
    top_k: Option<usize>,
) -> Result<HybridSearchResponse, AppError> {
    let client = reqwest::Client::new();
    let base_url = search_api_base()?;
    let auth_token = search_api_auth_token()?;

    let request = SearchApiRequest {
        query,
        top_k: sanitize_top_k(top_k),
        include_scores: true,
    };

    let response = client
        .post(format!("{}/search", base_url))
        .bearer_auth(auth_token)
        .json(&request)
        .send()
        .await
        .map_err(|e| search_api_network_err("search request", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(search_api_http_err("search", status, &body));
    }

    response
        .json::<HybridSearchResponse>()
        .await
        .map_err(|e| search_api_parse_err("search", e))
}

/// Submit feedback on a search result (helpful / not_helpful / incorrect).
#[tauri::command]
pub async fn submit_search_feedback(
    query_id: String,
    result_rank: usize,
    rating: String,
    comment: Option<String>,
) -> Result<String, AppError> {
    if !is_valid_feedback_rating(&rating) {
        return Err(AppError::invalid_format(format!(
            "Invalid rating '{}': must be helpful, not_helpful, or incorrect",
            rating
        )));
    }

    let client = reqwest::Client::new();
    let base_url = search_api_base()?;
    let auth_token = search_api_auth_token()?;

    let feedback = FeedbackApiRequest {
        query_id,
        result_rank,
        rating,
        comment: comment.unwrap_or_default(),
    };

    let response = client
        .post(format!("{}/feedback", base_url))
        .bearer_auth(auth_token)
        .json(&feedback)
        .send()
        .await
        .map_err(|e| search_api_network_err("feedback submission", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(search_api_http_err("feedback", status, &body));
    }

    Ok("Feedback submitted".to_string())
}

/// Get search monitoring statistics (last 24 hours).
#[tauri::command]
pub async fn get_search_api_stats() -> Result<SearchApiStatsData, AppError> {
    let client = reqwest::Client::new();
    let base_url = search_api_base()?;
    let auth_token = search_api_auth_token()?;

    let response = client
        .get(format!("{}/stats", base_url))
        .bearer_auth(auth_token)
        .send()
        .await
        .map_err(|e| search_api_network_err("stats request", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(search_api_http_err("stats", status, &body));
    }

    let stats: StatsApiResponse = response
        .json()
        .await
        .map_err(|e| search_api_parse_err("stats", e))?;

    Ok(stats.data)
}

/// Diagnose search API health with actionable status.
#[tauri::command]
pub async fn get_search_api_health_status() -> Result<SearchApiHealthStatus, AppError> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| AppError::internal(format!("reqwest client builder: {}", e)))?;
    let base_url = match search_api_base() {
        Ok(value) => value,
        Err(err) => {
            return Ok(SearchApiHealthStatus {
                healthy: false,
                status: "invalid-config".to_string(),
                message: err.to_string(),
                base_url: SEARCH_API_BASE.to_string(),
            });
        }
    };

    match client.get(format!("{}/ready", base_url)).send().await {
        Ok(response) => {
            if response.status() == StatusCode::NOT_FOUND {
                let fallback = client
                    .get(format!("{}/health", base_url))
                    .send()
                    .await
                    .map_err(|e| search_api_network_err("health fallback", e))?;
                let status_code = fallback.status();
                let content_type = fallback
                    .headers()
                    .get(reqwest::header::CONTENT_TYPE)
                    .and_then(|h| h.to_str().ok())
                    .map(|s| s.to_string());
                let body = fallback.text().await.unwrap_or_default();

                return Ok(classify_health_response(
                    status_code,
                    content_type.as_deref(),
                    &body,
                    &base_url,
                ));
            }

            let status_code = response.status();
            let content_type = response
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|h| h.to_str().ok())
                .map(|s| s.to_string());
            let body = response.text().await.unwrap_or_default();

            Ok(classify_ready_response(
                status_code,
                content_type.as_deref(),
                &body,
                &base_url,
            ))
        }
        Err(e) => Ok(SearchApiHealthStatus {
            healthy: false,
            status: "offline".to_string(),
            message: format!("Search API unavailable at {}: {}", base_url, e),
            base_url,
        }),
    }
}

/// Check if the search API is healthy.
#[tauri::command]
pub async fn check_search_api_health() -> Result<bool, AppError> {
    Ok(get_search_api_health_status().await?.healthy)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn sanitize_top_k_applies_defaults_and_bounds() {
        assert_eq!(sanitize_top_k(None), DEFAULT_TOP_K);
        assert_eq!(sanitize_top_k(Some(0)), MIN_TOP_K);
        assert_eq!(sanitize_top_k(Some(1)), MIN_TOP_K);
        assert_eq!(sanitize_top_k(Some(25)), 25);
        assert_eq!(sanitize_top_k(Some(500)), MAX_TOP_K);
    }

    #[test]
    fn feedback_rating_validation_accepts_only_known_values() {
        assert!(is_valid_feedback_rating("helpful"));
        assert!(is_valid_feedback_rating("not_helpful"));
        assert!(is_valid_feedback_rating("incorrect"));
        assert!(!is_valid_feedback_rating("HELPFUL"));
        assert!(!is_valid_feedback_rating(" meh "));
    }

    #[test]
    fn search_api_base_rejects_non_loopback_override() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("ASSISTSUPPORT_SEARCH_API_BASE_URL", "https://example.com");

        // SECURITY: search API must be local-only. Reject non-loopback overrides.
        let base = search_api_base();

        std::env::remove_var("ASSISTSUPPORT_SEARCH_API_BASE_URL");
        assert!(
            base.is_err(),
            "non-loopback overrides must be rejected (not silently ignored)"
        );
    }

    #[test]
    fn classify_health_response_detects_wrong_service_html() {
        let status = classify_health_response(
            StatusCode::OK,
            Some("text/html; charset=utf-8"),
            "<!DOCTYPE html><html><body>not api</body></html>",
            "http://localhost:3000",
        );
        assert!(!status.healthy);
        assert_eq!(status.status, "wrong-service");
    }

    #[test]
    fn classify_health_response_accepts_valid_json_health() {
        let status = classify_health_response(
            StatusCode::OK,
            Some("application/json"),
            r#"{"status":"ok","service":"search-api"}"#,
            "http://localhost:3000",
        );
        assert!(status.healthy);
        assert_eq!(status.status, "ok");
    }

    #[test]
    fn classify_health_response_reports_http_errors() {
        let status = classify_health_response(
            StatusCode::NOT_FOUND,
            Some("application/json"),
            "{}",
            "http://localhost:3000",
        );
        assert!(!status.healthy);
        assert_eq!(status.status, "offline");
    }

    #[test]
    fn classify_ready_response_accepts_ready_json() {
        let status = classify_ready_response(
            StatusCode::OK,
            Some("application/json"),
            r#"{"status":"ok","service":"search-api","checks":{"database":{"status":"ok"}}}"#,
            "http://localhost:3000",
        );
        assert!(status.healthy);
        assert_eq!(status.status, "ok");
    }

    #[test]
    fn classify_ready_response_surfaces_degraded_checks() {
        let status = classify_ready_response(
            StatusCode::SERVICE_UNAVAILABLE,
            Some("application/json"),
            r#"{"status":"degraded","checks":{"database":{"status":"error","error":"connection refused"},"models":{"status":"ok"}}}"#,
            "http://localhost:3000",
        );
        assert!(!status.healthy);
        assert_eq!(status.status, "degraded");
        assert!(status.message.contains("database: connection refused"));
    }

    #[test]
    fn stats_response_defaults_missing_feedback_fields_to_zero() {
        let payload = serde_json::json!({
            "status": "success",
            "data": {
                "queries_24h": 1,
                "queries_total": 2,
                "latency_ms": {
                    "avg": 1.0,
                    "p50": 1.0,
                    "p95": 2.0,
                    "p99": 3.0
                },
                "feedback_stats": {},
                "intent_distribution": {}
            },
            "timestamp": "2026-02-03T00:00:00Z"
        });

        let parsed: StatsApiResponse =
            serde_json::from_value(payload).expect("valid stats payload");
        assert_eq!(parsed.data.feedback_stats.helpful, 0);
        assert_eq!(parsed.data.feedback_stats.not_helpful, 0);
        assert_eq!(parsed.data.feedback_stats.incorrect, 0);
    }

    #[tokio::test]
    async fn submit_feedback_rejects_invalid_rating_before_network_call() {
        let result = submit_search_feedback(
            "query-123".to_string(),
            1,
            "invalid".to_string(),
            Some("bad".to_string()),
        )
        .await;

        assert!(result.is_err());
        // AppError::to_string() emits "[CODE] message" via Display.
        let err_text = result.expect_err("must reject invalid rating").to_string();
        assert!(err_text.contains("Invalid rating"));
        assert!(err_text.contains("VALIDATION_INVALID_FORMAT"));
    }

    #[test]
    fn search_api_auth_token_prefers_env_fallback_when_secure_store_missing() {
        // Avoid mutating secure storage in unit tests; assert env fallback behavior.
        std::env::set_var(SEARCH_API_TOKEN_ENV, "test-token");
        let token = search_api_auth_token().expect("token should resolve from env");
        assert_eq!(token, "test-token");
        std::env::remove_var(SEARCH_API_TOKEN_ENV);
    }
}
