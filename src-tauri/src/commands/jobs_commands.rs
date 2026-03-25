use crate::jobs::{Job, JobStatus, JobType};
use crate::AppState;
use tauri::State;

#[derive(Debug, Clone, serde::Serialize)]
pub struct JobSummary {
    pub id: String,
    pub job_type: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub progress: f32,
    pub progress_message: Option<String>,
    pub error: Option<String>,
}

impl From<Job> for JobSummary {
    fn from(job: Job) -> Self {
        Self {
            id: job.id,
            job_type: job.job_type.to_string(),
            status: job.status.to_string(),
            created_at: job.created_at.to_rfc3339(),
            updated_at: job.updated_at.to_rfc3339(),
            progress: job.progress,
            progress_message: job.progress_message,
            error: job.error,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BatchInput {
    pub text: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BatchResult {
    pub input: String,
    pub response: String,
    pub sources: Vec<BatchSource>,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BatchSource {
    pub chunk_id: String,
    pub document_id: String,
    pub title: Option<String>,
    pub score: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BatchStatus {
    pub job_id: String,
    pub status: String,
    pub total: usize,
    pub completed: usize,
    pub results: Vec<BatchResult>,
    pub error: Option<String>,
}

#[tauri::command]
pub fn create_job(
    state: State<'_, AppState>,
    job_type: String,
    metadata: Option<serde_json::Value>,
) -> Result<String, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let job_type_enum: JobType = job_type
        .parse()
        .map_err(|_| format!("Invalid job type: {}", job_type))?;
    let mut job = Job::new(job_type_enum);
    if let Some(meta) = metadata {
        job = job.with_metadata(meta);
    }

    let job_id = job.id.clone();
    db.create_job(&job).map_err(|e| e.to_string())?;
    Ok(job_id)
}

#[tauri::command]
pub fn list_jobs(
    state: State<'_, AppState>,
    status: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<JobSummary>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let status_filter = status.as_deref().and_then(|value| value.parse::<JobStatus>().ok());
    let jobs = db
        .list_jobs(status_filter, limit.unwrap_or(50))
        .map_err(|e| e.to_string())?;

    Ok(jobs.into_iter().map(JobSummary::from).collect())
}

#[tauri::command]
pub fn get_job(state: State<'_, AppState>, job_id: String) -> Result<Option<Job>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.get_job(&job_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cancel_job(state: State<'_, AppState>, job_id: String) -> Result<(), String> {
    state.jobs.cancel_job(&job_id);

    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.update_job_status(&job_id, JobStatus::Cancelled, Some("Cancelled by user"))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_job_logs(
    state: State<'_, AppState>,
    job_id: String,
    limit: Option<usize>,
) -> Result<Vec<crate::jobs::JobLog>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.get_job_logs(&job_id, limit.unwrap_or(100))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_job_counts(state: State<'_, AppState>) -> Result<Vec<(String, i64)>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.get_job_counts().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cleanup_old_jobs(
    state: State<'_, AppState>,
    keep_days: Option<i64>,
) -> Result<usize, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;
    db.cleanup_old_jobs(keep_days.unwrap_or(30))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn batch_generate(
    state: State<'_, AppState>,
    inputs: Vec<String>,
    response_length: String,
) -> Result<String, String> {
    if inputs.is_empty() {
        return Err("Inputs list cannot be empty".to_string());
    }

    for input in &inputs {
        crate::validation::validate_non_empty(input).map_err(|e| e.to_string())?;
    }

    let job =
        Job::new(JobType::Custom("batch_generate".to_string())).with_metadata(serde_json::json!({
            "input_count": inputs.len(),
            "response_length": response_length,
            "batch_results": [],
            "completed": 0,
        }));

    let job_id = job.id.clone();

    {
        let db_guard = state
            .db
            .lock()
            .map_err(|e| format!("DB lock error: {}", e))?;
        let db = db_guard.as_ref().ok_or("Database not initialized")?;
        db.create_job(&job).map_err(|e| e.to_string())?;
    }

    let cancel_token = state.jobs.register_job(&job_id);
    let llm_arc = state.llm.clone();
    let jobs_arc = state.jobs.clone();
    let total = inputs.len();

    let engine_state = {
        let llm_guard = llm_arc.read();
        match llm_guard.as_ref() {
            Some(engine) => {
                if !engine.is_model_loaded() {
                    let db_guard = state
                        .db
                        .lock()
                        .map_err(|e| format!("DB lock error: {}", e))?;
                    if let Some(db) = db_guard.as_ref() {
                        let _ =
                            db.update_job_status(&job_id, JobStatus::Failed, Some("No model loaded"));
                    }
                    jobs_arc.unregister_job(&job_id);
                    return Err("No model loaded".to_string());
                }
                Some(engine.state.clone())
            }
            None => None,
        }
    };

    {
        let db_guard = state
            .db
            .lock()
            .map_err(|e| format!("DB lock error: {}", e))?;
        let db = db_guard.as_ref().ok_or("Database not initialized")?;
        db.update_job_status(&job_id, JobStatus::Running, None)
            .map_err(|e| e.to_string())?;
    }

    let mut results: Vec<BatchResult> = Vec::new();

    for (i, input_text) in inputs.iter().enumerate() {
        if cancel_token.is_cancelled() {
            let db_guard = state
                .db
                .lock()
                .map_err(|e| format!("DB lock error: {}", e))?;
            let db = db_guard.as_ref().ok_or("Database not initialized")?;
            db.update_job_status(&job_id, JobStatus::Cancelled, Some("Cancelled by user"))
                .map_err(|e| e.to_string())?;
            jobs_arc.unregister_job(&job_id);
            return Ok(job_id);
        }

        let start = std::time::Instant::now();

        let sources = {
            let db_guard = state
                .db
                .lock()
                .map_err(|e| format!("DB lock error: {}", e))?;
            if let Some(db) = db_guard.as_ref() {
                crate::kb::search::HybridSearch::search(db, input_text, 3)
                    .unwrap_or_default()
                    .iter()
                    .map(|r| BatchSource {
                        chunk_id: r.chunk_id.clone(),
                        document_id: r.document_id.clone(),
                        title: r.title.clone(),
                        score: r.score,
                    })
                    .collect::<Vec<_>>()
            } else {
                vec![]
            }
        };

        let response_text = if let Some(ref es) = engine_state {
            let max_tokens: u32 = match response_length.as_str() {
                "short" => 150,
                "long" => 600,
                _ => 300,
            };

            let gen_params = crate::llm::GenerationParams {
                max_tokens,
                ..Default::default()
            };

            let prompt = format!(
                "You are a helpful IT support assistant. Respond to the following support request:\n\n{}\n\nProvide a clear, professional response.",
                input_text
            );

            let temp_engine = crate::llm::LlmEngine { state: es.clone() };
            match temp_engine.generate(&prompt, gen_params).await {
                Ok(text) => text,
                Err(e) => format!("Error generating response: {}", e),
            }
        } else {
            "LLM engine not loaded".to_string()
        };

        let duration_ms = start.elapsed().as_millis() as u64;

        results.push(BatchResult {
            input: input_text.clone(),
            response: response_text,
            sources,
            duration_ms,
        });

        {
            let db_guard = state
                .db
                .lock()
                .map_err(|e| format!("DB lock error: {}", e))?;
            if let Some(db) = db_guard.as_ref() {
                let progress = ((i + 1) as f32 / total as f32) * 100.0;
                let _ = db.update_job_progress(
                    &job_id,
                    progress,
                    Some(&format!("Processed {}/{}", i + 1, total)),
                );

                let metadata = serde_json::json!({
                    "input_count": total,
                    "response_length": response_length,
                    "batch_results": &results,
                    "completed": i + 1,
                });
                let metadata_str = serde_json::to_string(&metadata).unwrap_or_default();
                let _ = db.execute(
                    "UPDATE jobs SET metadata_json = ? WHERE id = ?",
                    &[&metadata_str as &dyn rusqlite::ToSql, &job_id],
                );
            }
        }
    }

    {
        let db_guard = state
            .db
            .lock()
            .map_err(|e| format!("DB lock error: {}", e))?;
        if let Some(db) = db_guard.as_ref() {
            let final_metadata = serde_json::json!({
                "input_count": total,
                "response_length": response_length,
                "batch_results": &results,
                "completed": total,
            });
            let metadata_str = serde_json::to_string(&final_metadata).unwrap_or_default();
            let _ = db.execute(
                "UPDATE jobs SET metadata_json = ? WHERE id = ?",
                &[&metadata_str as &dyn rusqlite::ToSql, &job_id],
            );
            let _ = db.update_job_status(&job_id, JobStatus::Succeeded, None);
        }
    }

    jobs_arc.unregister_job(&job_id);

    Ok(job_id)
}

#[tauri::command]
pub async fn get_batch_status(
    state: State<'_, AppState>,
    job_id: String,
) -> Result<BatchStatus, String> {
    let db_guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let job = db
        .get_job(&job_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Job not found: {}", job_id))?;

    let (results, completed, total) = if let Some(metadata) = &job.metadata {
        let batch_results: Vec<BatchResult> = metadata
            .get("batch_results")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();
        let completed = metadata
            .get("completed")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as usize;
        let total = metadata
            .get("input_count")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as usize;
        (batch_results, completed, total)
    } else {
        (vec![], 0, 0)
    };

    Ok(BatchStatus {
        job_id: job.id,
        status: job.status.to_string(),
        total,
        completed,
        results,
        error: job.error,
    })
}

#[tauri::command]
pub async fn export_batch_results(
    state: State<'_, AppState>,
    job_id: String,
    format: String,
) -> Result<bool, String> {
    let db_guard = state
        .db
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let job = db
        .get_job(&job_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Job not found: {}", job_id))?;

    let results: Vec<BatchResult> = job
        .metadata
        .as_ref()
        .and_then(|m| m.get("batch_results"))
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    if results.is_empty() {
        return Err("No results to export".to_string());
    }

    let export_dir = crate::db::get_app_data_dir().join("exports");
    std::fs::create_dir_all(&export_dir).map_err(|e| e.to_string())?;

    match format.as_str() {
        "json" => {
            let path = export_dir.join(format!("batch_{}.json", job_id));
            let json = serde_json::to_string_pretty(&results).map_err(|e| e.to_string())?;
            std::fs::write(&path, json).map_err(|e| e.to_string())?;
        }
        "csv" => {
            let path = export_dir.join(format!("batch_{}.csv", job_id));
            let mut csv_content = String::from("Input,Response,Duration(ms),Sources\n");
            for r in &results {
                let sources_str: Vec<String> =
                    r.sources.iter().map(|s| s.chunk_id.clone()).collect();
                csv_content.push_str(&format!(
                    "\"{}\",\"{}\",{},\"{}\"\n",
                    r.input.replace('"', "\"\""),
                    r.response.replace('"', "\"\""),
                    r.duration_ms,
                    sources_str.join("; ")
                ));
            }
            std::fs::write(&path, csv_content).map_err(|e| e.to_string())?;
        }
        _ => return Err(format!("Unsupported export format: {}", format)),
    }

    Ok(true)
}
