use crate::audit;
use crate::commands::download_runtime::get_model_source;
use crate::commands::model_commands::{
    ChecklistGenerateParams, ChecklistItem, ChecklistResult, ChecklistState, ChecklistUpdateParams,
    ConfidenceAssessment, ConfidenceMode, ContextSource, FirstResponseParams, FirstResponseResult,
    GenerateParams, GenerateWithContextParams, GenerateWithContextResult, GenerationMetrics,
    GenerationResult, GgufFileInfo, GroundedClaim, ModelStateResult, StartupMetricsResult,
    TestModelResult, CONTEXT_WINDOW_SETTING, GENERATION_CANCEL_FLAG,
};
use crate::db::GenerationQualityEvent;
use crate::llm::{GenerationEvent, GenerationParams as LlmGenerationParams, LlmEngine, ModelInfo};
use crate::model_integrity::{verify_model_integrity, VerificationResult};
use crate::prompts::{PromptBuilder, ResponseLength};
use crate::validation::{
    validate_non_empty, validate_text_size, validate_within_home, ValidationError,
    MAX_QUERY_BYTES, MAX_TEXT_INPUT_BYTES,
};
use crate::AppState;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{Emitter, State};
use tokio::sync::mpsc;

fn extract_json_block(text: &str) -> Option<&str> {
    let trimmed = text.trim();
    let first_brace = trimmed.find('{');
    let first_bracket = trimmed.find('[');

    let (start_idx, open_char, close_char) = match (first_brace, first_bracket) {
        (Some(b), Some(a)) => {
            if b < a {
                (b, '{', '}')
            } else {
                (a, '[', ']')
            }
        }
        (Some(b), None) => (b, '{', '}'),
        (None, Some(a)) => (a, '[', ']'),
        (None, None) => return None,
    };

    let mut depth = 0i32;
    for (idx, ch) in trimmed.char_indices().skip(start_idx) {
        if ch == open_char {
            depth += 1;
        } else if ch == close_char {
            depth -= 1;
            if depth == 0 {
                return Some(&trimmed[start_idx..=idx]);
            }
        }
    }

    None
}

fn normalize_category(value: Option<String>) -> Option<String> {
    let normalized = value?.trim().to_lowercase();
    match normalized.as_str() {
        "triage" | "diagnostic" | "resolution" | "escalation" => Some(normalized),
        _ => None,
    }
}

fn normalize_priority(value: Option<String>) -> Option<String> {
    let normalized = value?.trim().to_lowercase();
    match normalized.as_str() {
        "high" | "medium" | "low" => Some(normalized),
        _ => None,
    }
}

fn normalize_checklist_items(mut items: Vec<ChecklistItem>) -> Vec<ChecklistItem> {
    use std::collections::HashSet;

    let mut seen_ids = HashSet::new();

    items.retain_mut(|item| {
        let text = item.text.trim();
        if text.is_empty() {
            return false;
        }

        item.text = text.to_string();
        item.details = item
            .details
            .as_ref()
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned);
        item.category = normalize_category(item.category.take());
        item.priority = normalize_priority(item.priority.take());

        let id = item.id.trim().to_string();
        if id.is_empty() || !seen_ids.insert(id.clone()) {
            return false;
        }
        item.id = id;
        true
    });

    items
}

fn parse_checklist_output(raw: &str) -> Result<Vec<ChecklistItem>, String> {
    let Some(json_block) = extract_json_block(raw) else {
        return Err("Checklist output did not contain JSON".to_string());
    };

    let parsed_items: Vec<ChecklistItem> =
        serde_json::from_str(json_block).map_err(|e| format!("Invalid checklist JSON: {}", e))?;
    let items = normalize_checklist_items(parsed_items);
    if items.is_empty() {
        return Err("Checklist output did not contain any valid items".to_string());
    }
    Ok(items)
}

fn extract_output_section_for_grounding(text: &str) -> String {
    let normalized = text.replace("\r\n", "\n");
    let lower = normalized.to_lowercase();
    for marker in ["response:", "draft:", "answer:", "output:"] {
        if let Some(start) = lower.rfind(marker) {
            return normalized[start + marker.len()..].trim().to_string();
        }
    }
    normalized.trim().to_string()
}

fn split_claims(text: &str) -> Vec<String> {
    text.lines()
        .flat_map(|line| line.split(". "))
        .map(str::trim)
        .filter(|segment| segment.len() > 12)
        .map(ToOwned::to_owned)
        .collect()
}

fn parse_source_indexes(claim: &str, source_count: usize) -> Vec<usize> {
    if source_count == 0 {
        return vec![];
    }

    let lower = claim.to_lowercase();
    let mut indexes = Vec::new();

    for idx in 1..=source_count {
        let bracketed = format!("[{}]", idx);
        let cited = format!("source {}", idx);
        if lower.contains(&bracketed) || lower.contains(&cited) {
            indexes.push(idx - 1);
        }
    }

    indexes.sort_unstable();
    indexes.dedup();
    indexes
}

fn build_grounding(claims: &[String], sources: &[ContextSource]) -> Vec<GroundedClaim> {
    claims
        .iter()
        .map(|claim| {
            let source_indexes = parse_source_indexes(claim, sources.len());
            let support_level = if source_indexes.is_empty() {
                "unsupported"
            } else if source_indexes
                .iter()
                .all(|idx| sources.get(*idx).map(|source| source.score >= 0.65).unwrap_or(false))
            {
                "supported"
            } else {
                "partial"
            };

            GroundedClaim {
                claim: claim.clone(),
                source_indexes,
                support_level: support_level.to_string(),
            }
        })
        .collect()
}

fn assess_confidence(
    grounding: &[GroundedClaim],
    sources: &[ContextSource],
) -> ConfidenceAssessment {
    let source_count = sources.len();
    let avg_source_score = if source_count > 0 {
        sources.iter().map(|s| s.score).sum::<f64>() / source_count as f64
    } else {
        0.0
    };

    let total_claims = grounding.len();
    let unsupported_claims = grounding
        .iter()
        .filter(|c| c.support_level == "unsupported")
        .count();
    let coverage = if total_claims > 0 {
        1.0 - (unsupported_claims as f64 / total_claims as f64)
    } else {
        0.0
    };
    let score = ((avg_source_score * 0.6) + (coverage * 0.4)).clamp(0.0, 1.0);

    let (mode, rationale) = if source_count == 0 || score < 0.45 {
        (
            ConfidenceMode::Abstain,
            "Low retrieval confidence or no grounded evidence".to_string(),
        )
    } else if score < 0.7 || unsupported_claims > 0 {
        (
            ConfidenceMode::Clarify,
            "Some claims are weakly grounded; clarify before sending".to_string(),
        )
    } else {
        (
            ConfidenceMode::Answer,
            "Strong grounded evidence across cited sources".to_string(),
        )
    };

    ConfidenceAssessment {
        mode,
        score,
        rationale,
    }
}

pub(crate) fn init_llm_engine_impl(state: State<'_, AppState>) -> Result<(), String> {
    if state.llm.read().is_some() {
        return Ok(());
    }
    let backend = state.llama_backend()?;
    let engine = LlmEngine::new(backend).map_err(|e| e.to_string())?;
    *state.llm.write() = Some(engine);
    Ok(())
}

pub(crate) fn load_model_impl(
    state: State<'_, AppState>,
    model_id: String,
    n_gpu_layers: Option<u32>,
) -> Result<ModelInfo, String> {
    let load_start = std::time::Instant::now();
    let (_, filename) = get_model_source(&model_id)?;
    let models_dir = crate::db::get_models_dir();
    let path = models_dir.join(filename);

    if !path.exists() {
        return Err(format!(
            "Model file not found: {}. Please download the model first.",
            filename
        ));
    }

    let llm_guard = state.llm.read();
    let engine = llm_guard.as_ref().ok_or("LLM engine not initialized")?;
    let layers = n_gpu_layers.unwrap_or(1000);

    let info = engine
        .load_model(&path, layers, model_id.clone())
        .map_err(|e| e.to_string())?;

    let load_time_ms = load_start.elapsed().as_millis() as i64;
    if let Ok(db_lock) = state.db.lock() {
        if let Some(db) = db_lock.as_ref() {
            let _ = db.save_model_state(
                "llm",
                path.to_str().unwrap_or(""),
                Some(&model_id),
                Some(load_time_ms),
            );
        }
    }
    tracing::info!("LLM model '{}' loaded in {}ms", model_id, load_time_ms);

    Ok(info)
}

pub(crate) fn load_custom_model_impl(
    state: State<'_, AppState>,
    model_path: String,
    n_gpu_layers: Option<u32>,
) -> Result<ModelInfo, String> {
    use std::path::Path;

    let path = Path::new(&model_path);
    if !path.exists() {
        return Err(format!("Model file not found: {}", model_path));
    }

    let validated_path = validate_within_home(path).map_err(|e| match e {
        ValidationError::PathTraversal => {
            "Model file must be within your home directory".to_string()
        }
        ValidationError::InvalidFormat(msg) if msg.contains("sensitive") => {
            "This path is blocked because it contains sensitive data".to_string()
        }
        _ => format!("Invalid model path: {}", e),
    })?;

    if !validated_path.is_file() {
        return Err("Model path is not a file".into());
    }

    let ext = validated_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    if ext.to_lowercase() != "gguf" {
        return Err("Invalid file type. Only .gguf files are supported.".into());
    }

    let metadata = std::fs::metadata(&validated_path).map_err(|e| e.to_string())?;
    if metadata.len() < 1_000_000 {
        return Err("File too small to be a valid GGUF model.".into());
    }

    let model_id = validated_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("custom-model")
        .to_string();

    match verify_model_integrity(&validated_path, false) {
        Ok(VerificationResult::Verified { sha256, .. }) => {
            audit::audit_model_integrity_verified(&model_id, &sha256);
        }
        Ok(VerificationResult::Unverified { sha256, .. }) => {
            audit::audit_model_integrity_unverified(&model_id, &sha256);
            tracing::warn!(
                "Loading unverified model '{}' (sha256: {}). Prefer allowlisted models.",
                model_id,
                sha256
            );
        }
        Err(e) => return Err(format!("Model integrity verification failed: {}", e)),
    }

    let llm_guard = state.llm.read();
    let engine = llm_guard.as_ref().ok_or("LLM engine not initialized")?;
    let layers = n_gpu_layers.unwrap_or(1000);

    engine
        .load_model(&validated_path, layers, model_id)
        .map_err(|e| e.to_string())
}

pub(crate) fn validate_gguf_file_impl(model_path: String) -> Result<GgufFileInfo, String> {
    use std::fs;
    use std::io::Read;
    use std::path::Path;

    let path = Path::new(&model_path);

    if !path.exists() {
        return Err(format!("File not found: {}", model_path));
    }

    let validated_path = validate_within_home(path).map_err(|e| match e {
        ValidationError::PathTraversal => {
            "Model file must be within your home directory".to_string()
        }
        ValidationError::InvalidFormat(msg) if msg.contains("sensitive") => {
            "This path is blocked because it contains sensitive data".to_string()
        }
        _ => format!("Invalid model path: {}", e),
    })?;

    if !validated_path.is_file() {
        return Err("Model path is not a file".into());
    }

    let ext = validated_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    if ext.to_lowercase() != "gguf" {
        return Err("Invalid file type. Only .gguf files are supported.".into());
    }

    let metadata = fs::metadata(&validated_path).map_err(|e| e.to_string())?;
    let filename = validated_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let mut file = fs::File::open(&validated_path).map_err(|e| e.to_string())?;
    let mut magic = [0u8; 4];
    file.read_exact(&mut magic).map_err(|e| e.to_string())?;

    if &magic != b"GGUF" {
        return Err("Invalid GGUF file: magic bytes mismatch".into());
    }

    Ok(GgufFileInfo {
        path: validated_path.to_string_lossy().to_string(),
        filename,
        size_bytes: metadata.len(),
        is_valid: true,
    })
}

pub(crate) fn unload_model_impl(state: State<'_, AppState>) -> Result<(), String> {
    let llm_guard = state.llm.read();
    let engine = llm_guard.as_ref().ok_or("LLM engine not initialized")?;
    engine.unload_model();
    if let Ok(db_lock) = state.db.lock() {
        if let Some(db) = db_lock.as_ref() {
            let _ = db.clear_model_state("llm");
        }
    }
    Ok(())
}

pub(crate) fn get_model_info_impl(state: State<'_, AppState>) -> Result<Option<ModelInfo>, String> {
    let llm_guard = state.llm.read();
    let engine = llm_guard.as_ref().ok_or("LLM engine not initialized")?;
    Ok(engine.model_info())
}

pub(crate) fn is_model_loaded_impl(state: State<'_, AppState>) -> Result<bool, String> {
    let llm_guard = state.llm.read();
    match llm_guard.as_ref() {
        Some(engine) => Ok(engine.is_model_loaded()),
        None => Ok(false),
    }
}

pub(crate) fn get_context_window_impl(state: State<'_, AppState>) -> Result<Option<u32>, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let result: Result<String, _> = db.conn().query_row(
        "SELECT value FROM settings WHERE key = ?",
        rusqlite::params![CONTEXT_WINDOW_SETTING],
        |row| row.get(0),
    );

    match result {
        Ok(value) => Ok(value.parse::<u32>().ok()),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub(crate) fn set_context_window_impl(
    state: State<'_, AppState>,
    size: Option<u32>,
) -> Result<(), String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    match size {
        Some(s) => {
            if !(2048..=32768).contains(&s) {
                return Err("Context window must be between 2048 and 32768".to_string());
            }
            db.conn()
                .execute(
                    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                    rusqlite::params![CONTEXT_WINDOW_SETTING, s.to_string()],
                )
                .map_err(|e| e.to_string())?;
        }
        None => {
            db.conn()
                .execute(
                    "DELETE FROM settings WHERE key = ?",
                    rusqlite::params![CONTEXT_WINDOW_SETTING],
                )
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

pub(crate) async fn generate_text_impl(
    state: State<'_, AppState>,
    prompt: String,
    params: Option<GenerateParams>,
) -> Result<GenerationResult, String> {
    validate_non_empty(&prompt).map_err(|e| e.to_string())?;
    validate_text_size(&prompt, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;

    let llm = state.llm.clone();
    let engine_state = {
        let llm_guard = llm.read();
        let engine = llm_guard.as_ref().ok_or("LLM engine not initialized")?;
        if !engine.is_model_loaded() {
            return Err("No model loaded".into());
        }
        engine.state.clone()
    };

    let gen_params = params.map(LlmGenerationParams::from).unwrap_or_default();
    let (tx, mut rx) = mpsc::channel(100);
    let cancel_flag = Arc::new(AtomicBool::new(false));

    let prompt_clone = prompt.clone();
    let cancel_clone = cancel_flag.clone();
    let tx_clone = tx.clone();

    tokio::spawn(async move {
        let temp_engine = LlmEngine { state: engine_state };
        let _ = temp_engine
            .generate_streaming(&prompt_clone, gen_params, tx_clone, cancel_clone)
            .await;
    });

    let mut text = String::new();
    let mut tokens_generated = 0u32;
    let mut duration_ms = 0u64;

    while let Some(event) = rx.recv().await {
        match event {
            GenerationEvent::Token(t) => text.push_str(&t),
            GenerationEvent::Done {
                tokens_generated: t,
                duration_ms: d,
            } => {
                tokens_generated = t;
                duration_ms = d;
                break;
            }
            GenerationEvent::Error(e) => return Err(e),
        }
    }

    Ok(GenerationResult {
        text,
        tokens_generated,
        duration_ms,
    })
}

pub(crate) async fn generate_with_context_impl(
    state: State<'_, AppState>,
    params: GenerateWithContextParams,
) -> Result<GenerateWithContextResult, String> {
    validate_non_empty(&params.user_input).map_err(|e| e.to_string())?;
    validate_text_size(&params.user_input, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    if let Some(query) = &params.kb_query {
        validate_text_size(query, MAX_QUERY_BYTES).map_err(|e| e.to_string())?;
    }
    if let Some(ocr) = &params.ocr_text {
        validate_text_size(ocr, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    }
    if let Some(notes) = &params.diagnostic_notes {
        validate_text_size(notes, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    }

    let kb_results = {
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        if let Some(db) = db_lock.as_ref() {
            let query = params.kb_query.as_ref().unwrap_or(&params.user_input);
            let limit = params.kb_limit.unwrap_or(3);
            crate::kb::search::HybridSearch::search(db, query, limit).unwrap_or_default()
        } else {
            vec![]
        }
    };

    let sources: Vec<ContextSource> = kb_results
        .iter()
        .map(|r| ContextSource {
            chunk_id: r.chunk_id.clone(),
            document_id: r.document_id.clone(),
            file_path: r.file_path.clone(),
            title: r.title.clone(),
            heading_path: r.heading_path.clone(),
            score: r.score,
            search_method: Some(format!("{:?}", r.source)),
            source_type: r.source_type.clone(),
        })
        .collect();

    let mut builder = PromptBuilder::new()
        .with_kb_results(kb_results)
        .with_user_input(&params.user_input);

    if let Some(ocr) = &params.ocr_text {
        builder = builder.with_ocr_text(ocr);
    }

    if let Some(notes) = &params.diagnostic_notes {
        builder = builder.with_diagnostic_notes(notes);
    }

    if let Some(tree) = params.tree_decisions {
        builder = builder.with_tree_decisions(tree);
    }

    if let Some(ticket) = params.jira_ticket {
        builder = builder.with_jira_ticket(ticket);
    }

    if let Some(length) = params.response_length {
        builder = builder.with_response_length(length);
    }

    let source_chunk_ids = builder.get_source_chunk_ids();
    let response_length = params.response_length.unwrap_or_default();
    let prompt = builder.build();
    let prompt_length = prompt.len();

    validate_text_size(&prompt, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;

    let gen_result = generate_text_impl(state.clone(), prompt, params.gen_params).await?;

    let word_count = gen_result.text.split_whitespace().count() as u32;
    let target_words = response_length.target_words() as u32;
    let length_target_met = match response_length {
        ResponseLength::Short => word_count <= target_words + 40,
        ResponseLength::Medium => {
            word_count >= target_words / 2 && word_count <= target_words * 2
        }
        ResponseLength::Long => word_count >= target_words / 2,
    };

    let tokens_per_second = if gen_result.duration_ms > 0 {
        (gen_result.tokens_generated as f64 * 1000.0) / gen_result.duration_ms as f64
    } else {
        0.0
    };

    let estimated_prompt_tokens = prompt_length / 4;
    let context_window = 4096;
    let context_utilization =
        (estimated_prompt_tokens as f64 / context_window as f64 * 100.0).min(100.0);

    let metrics = GenerationMetrics {
        tokens_per_second,
        sources_used: sources.len() as u32,
        word_count,
        length_target_met,
        context_utilization,
    };

    let output_section = extract_output_section_for_grounding(&gen_result.text);
    let claims = split_claims(&output_section);
    let grounding = build_grounding(&claims, &sources);
    let confidence = assess_confidence(&grounding, &sources);

    let confidence_mode = match confidence.mode {
        ConfidenceMode::Answer => "answer",
        ConfidenceMode::Clarify => "clarify",
        ConfidenceMode::Abstain => "abstain",
    };
    let unsupported_claims = grounding
        .iter()
        .filter(|claim| claim.support_level == "unsupported")
        .count() as i32;
    let avg_source_score = if sources.is_empty() {
        0.0
    } else {
        sources.iter().map(|s| s.score).sum::<f64>() / sources.len() as f64
    };
    if let Ok(db_lock) = state.db.lock() {
        if let Some(db) = db_lock.as_ref() {
            let _ = db.record_generation_quality_event(GenerationQualityEvent {
                query_text: &params.user_input,
                confidence_mode,
                confidence_score: confidence.score,
                unsupported_claims,
                total_claims: grounding.len() as i32,
                source_count: sources.len() as i32,
                avg_source_score,
            });
        }
    }

    Ok(GenerateWithContextResult {
        text: gen_result.text,
        tokens_generated: gen_result.tokens_generated,
        duration_ms: gen_result.duration_ms,
        source_chunk_ids,
        sources,
        metrics,
        prompt_template_version: crate::prompts::PROMPT_TEMPLATE_VERSION.to_string(),
        confidence,
        grounding,
    })
}

pub(crate) async fn generate_streaming_impl(
    window: tauri::Window,
    state: State<'_, AppState>,
    params: GenerateWithContextParams,
) -> Result<GenerateWithContextResult, String> {
    validate_non_empty(&params.user_input).map_err(|e| e.to_string())?;
    validate_text_size(&params.user_input, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    if let Some(query) = &params.kb_query {
        validate_text_size(query, MAX_QUERY_BYTES).map_err(|e| e.to_string())?;
    }
    if let Some(ocr) = &params.ocr_text {
        validate_text_size(ocr, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    }
    if let Some(notes) = &params.diagnostic_notes {
        validate_text_size(notes, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    }

    let kb_results = {
        let db_lock = state.db.lock().map_err(|e| e.to_string())?;
        if let Some(db) = db_lock.as_ref() {
            let query = params.kb_query.as_ref().unwrap_or(&params.user_input);
            let limit = params.kb_limit.unwrap_or(3);
            crate::kb::search::HybridSearch::search(db, query, limit).unwrap_or_default()
        } else {
            vec![]
        }
    };

    let sources: Vec<ContextSource> = kb_results
        .iter()
        .map(|r| ContextSource {
            chunk_id: r.chunk_id.clone(),
            document_id: r.document_id.clone(),
            file_path: r.file_path.clone(),
            title: r.title.clone(),
            heading_path: r.heading_path.clone(),
            score: r.score,
            search_method: Some(format!("{:?}", r.source)),
            source_type: r.source_type.clone(),
        })
        .collect();

    let mut builder = PromptBuilder::new()
        .with_kb_results(kb_results)
        .with_user_input(&params.user_input);

    if let Some(ocr) = &params.ocr_text {
        builder = builder.with_ocr_text(ocr);
    }
    if let Some(notes) = &params.diagnostic_notes {
        builder = builder.with_diagnostic_notes(notes);
    }
    if let Some(tree) = params.tree_decisions {
        builder = builder.with_tree_decisions(tree);
    }
    if let Some(ticket) = params.jira_ticket {
        builder = builder.with_jira_ticket(ticket);
    }
    if let Some(length) = params.response_length {
        builder = builder.with_response_length(length);
    }

    let source_chunk_ids = builder.get_source_chunk_ids();
    let response_length = params.response_length.unwrap_or_default();
    let prompt = builder.build();
    let prompt_length = prompt.len();

    validate_text_size(&prompt, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;

    let llm = state.llm.clone();
    let engine_state = {
        let llm_guard = llm.read();
        let engine = llm_guard.as_ref().ok_or("LLM engine not initialized")?;
        if !engine.is_model_loaded() {
            return Err("No model loaded".into());
        }
        engine.state.clone()
    };

    let gen_params = params.gen_params.map(LlmGenerationParams::from).unwrap_or_default();
    let (tx, mut rx) = mpsc::channel(100);

    GENERATION_CANCEL_FLAG.store(false, Ordering::SeqCst);
    let cancel_flag = GENERATION_CANCEL_FLAG.clone();

    let prompt_clone = prompt.clone();
    let cancel_clone = cancel_flag.clone();
    let tx_clone = tx.clone();

    tokio::spawn(async move {
        let temp_engine = LlmEngine { state: engine_state };
        let _ = temp_engine
            .generate_streaming(&prompt_clone, gen_params, tx_clone, cancel_clone)
            .await;
    });

    let mut text = String::new();
    let mut tokens_generated = 0u32;
    let mut duration_ms = 0u64;

    while let Some(event) = rx.recv().await {
        match event {
            GenerationEvent::Token(t) => {
                let _ = window.emit(
                    "llm-token",
                    crate::commands::model_commands::StreamToken {
                        token: t.clone(),
                        done: false,
                    },
                );
                text.push_str(&t);
            }
            GenerationEvent::Done {
                tokens_generated: t,
                duration_ms: d,
            } => {
                tokens_generated = t;
                duration_ms = d;
                let _ = window.emit(
                    "llm-token",
                    crate::commands::model_commands::StreamToken {
                        token: String::new(),
                        done: true,
                    },
                );
                break;
            }
            GenerationEvent::Error(e) => {
                let _ = window.emit(
                    "llm-token",
                    crate::commands::model_commands::StreamToken {
                        token: String::new(),
                        done: true,
                    },
                );
                return Err(e);
            }
        }
    }

    let word_count = text.split_whitespace().count() as u32;
    let target_words = response_length.target_words() as u32;
    let length_target_met = match response_length {
        ResponseLength::Short => word_count <= target_words + 40,
        ResponseLength::Medium => {
            word_count >= target_words / 2 && word_count <= target_words * 2
        }
        ResponseLength::Long => word_count >= target_words / 2,
    };

    let tokens_per_second = if duration_ms > 0 {
        (tokens_generated as f64 * 1000.0) / duration_ms as f64
    } else {
        0.0
    };

    let estimated_prompt_tokens = prompt_length / 4;
    let context_window = 4096;
    let context_utilization =
        (estimated_prompt_tokens as f64 / context_window as f64 * 100.0).min(100.0);

    let metrics = GenerationMetrics {
        tokens_per_second,
        sources_used: sources.len() as u32,
        word_count,
        length_target_met,
        context_utilization,
    };

    let output_section = extract_output_section_for_grounding(&text);
    let claims = split_claims(&output_section);
    let grounding = build_grounding(&claims, &sources);
    let confidence = assess_confidence(&grounding, &sources);

    let confidence_mode = match confidence.mode {
        ConfidenceMode::Answer => "answer",
        ConfidenceMode::Clarify => "clarify",
        ConfidenceMode::Abstain => "abstain",
    };
    let unsupported_claims = grounding
        .iter()
        .filter(|claim| claim.support_level == "unsupported")
        .count() as i32;
    let avg_source_score = if sources.is_empty() {
        0.0
    } else {
        sources.iter().map(|s| s.score).sum::<f64>() / sources.len() as f64
    };
    if let Ok(db_lock) = state.db.lock() {
        if let Some(db) = db_lock.as_ref() {
            let _ = db.record_generation_quality_event(GenerationQualityEvent {
                query_text: &params.user_input,
                confidence_mode,
                confidence_score: confidence.score,
                unsupported_claims,
                total_claims: grounding.len() as i32,
                source_count: sources.len() as i32,
                avg_source_score,
            });
        }
    }

    Ok(GenerateWithContextResult {
        text,
        tokens_generated,
        duration_ms,
        source_chunk_ids,
        sources,
        metrics,
        prompt_template_version: crate::prompts::PROMPT_TEMPLATE_VERSION.to_string(),
        confidence,
        grounding,
    })
}

pub(crate) async fn generate_first_response_impl(
    state: State<'_, AppState>,
    params: FirstResponseParams,
) -> Result<FirstResponseResult, String> {
    use crate::prompts::{FIRST_RESPONSE_JIRA_PROMPT, FIRST_RESPONSE_SLACK_PROMPT};

    validate_non_empty(&params.user_input).map_err(|e| e.to_string())?;
    validate_text_size(&params.user_input, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    if let Some(ocr) = &params.ocr_text {
        validate_text_size(ocr, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    }

    let system_prompt = match params.tone {
        crate::commands::model_commands::FirstResponseTone::Slack => FIRST_RESPONSE_SLACK_PROMPT,
        crate::commands::model_commands::FirstResponseTone::Jira => FIRST_RESPONSE_JIRA_PROMPT,
    };

    let mut builder = PromptBuilder::new()
        .with_system_prompt(system_prompt)
        .with_user_input(&params.user_input)
        .with_response_length(ResponseLength::Short);

    if let Some(ocr) = &params.ocr_text {
        builder = builder.with_ocr_text(ocr);
    }

    if let Some(ticket) = params.jira_ticket {
        builder = builder.with_jira_ticket(ticket);
    }

    let prompt = builder.build();
    validate_text_size(&prompt, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;

    let gen_result = generate_text_impl(
        state,
        prompt,
        Some(GenerateParams {
            max_tokens: Some(200),
            temperature: Some(0.4),
            top_p: Some(0.9),
            top_k: None,
            repeat_penalty: Some(1.05),
            context_window: None,
        }),
    )
    .await?;

    Ok(FirstResponseResult {
        text: gen_result.text.trim().to_string(),
        tokens_generated: gen_result.tokens_generated,
        duration_ms: gen_result.duration_ms,
    })
}

pub(crate) async fn generate_troubleshooting_checklist_impl(
    state: State<'_, AppState>,
    params: ChecklistGenerateParams,
) -> Result<ChecklistResult, String> {
    use crate::prompts::CHECKLIST_SYSTEM_PROMPT;

    validate_non_empty(&params.user_input).map_err(|e| e.to_string())?;
    validate_text_size(&params.user_input, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    if let Some(ocr) = &params.ocr_text {
        validate_text_size(ocr, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    }
    if let Some(notes) = &params.diagnostic_notes {
        validate_text_size(notes, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    }

    let mut builder = PromptBuilder::new()
        .with_system_prompt(CHECKLIST_SYSTEM_PROMPT)
        .with_user_input(&params.user_input)
        .with_response_length(ResponseLength::Long);

    if let Some(ocr) = &params.ocr_text {
        builder = builder.with_ocr_text(ocr);
    }
    if let Some(notes) = &params.diagnostic_notes {
        builder = builder.with_diagnostic_notes(notes);
    }
    if let Some(tree) = params.tree_decisions {
        builder = builder.with_tree_decisions(tree);
    }
    if let Some(ticket) = params.jira_ticket {
        builder = builder.with_jira_ticket(ticket);
    }

    let prompt = builder.build();
    validate_text_size(&prompt, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;

    let gen_result = generate_text_impl(
        state,
        prompt,
        Some(GenerateParams {
            max_tokens: Some(400),
            temperature: Some(0.2),
            top_p: Some(0.9),
            top_k: None,
            repeat_penalty: Some(1.05),
            context_window: None,
        }),
    )
    .await?;

    let items = parse_checklist_output(&gen_result.text)?;
    Ok(ChecklistResult { items })
}

pub(crate) async fn update_troubleshooting_checklist_impl(
    state: State<'_, AppState>,
    params: ChecklistUpdateParams,
) -> Result<ChecklistResult, String> {
    use crate::prompts::CHECKLIST_UPDATE_SYSTEM_PROMPT;
    use std::collections::HashSet;

    validate_non_empty(&params.user_input).map_err(|e| e.to_string())?;
    validate_text_size(&params.user_input, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    if let Some(ocr) = &params.ocr_text {
        validate_text_size(ocr, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    }
    if let Some(notes) = &params.diagnostic_notes {
        validate_text_size(notes, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;
    }

    let items = normalize_checklist_items(params.checklist.items);
    let valid_ids: HashSet<&str> = items.iter().map(|item| item.id.as_str()).collect();
    let completed_ids: Vec<String> = params
        .checklist
        .completed_ids
        .into_iter()
        .filter(|id| valid_ids.contains(id.as_str()))
        .collect();

    let checklist_state = ChecklistState {
        items,
        completed_ids,
    };

    let checklist_json = serde_json::to_string_pretty(&checklist_state)
        .or_else(|_| serde_json::to_string(&checklist_state))
        .map_err(|e| e.to_string())?;

    let completed_label = if checklist_state.completed_ids.is_empty() {
        "none".to_string()
    } else {
        checklist_state.completed_ids.join(", ")
    };

    let update_context = format!(
        "Current checklist JSON:\n{}\n\nCompleted item IDs: {}",
        checklist_json, completed_label
    );

    let mut builder = PromptBuilder::new()
        .with_system_prompt(CHECKLIST_UPDATE_SYSTEM_PROMPT)
        .with_user_input(&params.user_input)
        .with_response_length(ResponseLength::Long)
        .with_extra_section("Checklist Update Context", &update_context);

    if let Some(ocr) = &params.ocr_text {
        builder = builder.with_ocr_text(ocr);
    }
    if let Some(notes) = &params.diagnostic_notes {
        builder = builder.with_diagnostic_notes(notes);
    }
    if let Some(tree) = params.tree_decisions {
        builder = builder.with_tree_decisions(tree);
    }
    if let Some(ticket) = params.jira_ticket {
        builder = builder.with_jira_ticket(ticket);
    }

    let prompt = builder.build();
    validate_text_size(&prompt, MAX_TEXT_INPUT_BYTES).map_err(|e| e.to_string())?;

    let gen_result = generate_text_impl(
        state,
        prompt,
        Some(GenerateParams {
            max_tokens: Some(400),
            temperature: Some(0.2),
            top_p: Some(0.9),
            top_k: None,
            repeat_penalty: Some(1.05),
            context_window: None,
        }),
    )
    .await?;

    let items = parse_checklist_output(&gen_result.text)?;
    Ok(ChecklistResult { items })
}

pub(crate) async fn test_model_impl(state: State<'_, AppState>) -> Result<TestModelResult, String> {
    let result = generate_text_impl(
        state,
        "Say hello in one sentence.".to_string(),
        Some(GenerateParams {
            max_tokens: Some(50),
            temperature: Some(0.7),
            top_p: None,
            top_k: None,
            repeat_penalty: None,
            context_window: None,
        }),
    )
    .await?;

    let tokens_per_sec = if result.duration_ms > 0 {
        (result.tokens_generated as f64 / result.duration_ms as f64) * 1000.0
    } else {
        0.0
    };

    Ok(TestModelResult {
        output: result.text,
        tokens_generated: result.tokens_generated,
        duration_ms: result.duration_ms,
        tokens_per_sec,
    })
}

pub(crate) fn cancel_generation_impl() -> Result<(), String> {
    GENERATION_CANCEL_FLAG.store(true, Ordering::SeqCst);
    Ok(())
}

pub(crate) fn get_model_state_impl(state: State<'_, AppState>) -> Result<ModelStateResult, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let llm = db.get_model_state("llm").map_err(|e| e.to_string())?;
    let embeddings = db
        .get_model_state("embeddings")
        .map_err(|e| e.to_string())?;

    let llm_loaded = state
        .llm
        .read()
        .as_ref()
        .map(|e| e.model_info().is_some())
        .unwrap_or(false);

    let embeddings_loaded = state
        .embeddings
        .read()
        .as_ref()
        .map(|e| e.model_info().is_some())
        .unwrap_or(false);

    Ok(ModelStateResult {
        llm_model_id: llm.as_ref().and_then(|(_, id)| id.clone()),
        llm_model_path: llm.map(|(p, _)| p),
        llm_loaded,
        embeddings_model_path: embeddings.map(|(p, _)| p),
        embeddings_loaded,
    })
}

pub(crate) fn get_startup_metrics_impl(
    state: State<'_, AppState>,
) -> Result<StartupMetricsResult, String> {
    let db_lock = state.db.lock().map_err(|e| e.to_string())?;
    let db = db_lock.as_ref().ok_or("Database not initialized")?;

    let metrics = db.get_last_startup_metric().map_err(|e| e.to_string())?;

    match metrics {
        Some((total_ms, init_app_ms, models_cached)) => Ok(StartupMetricsResult {
            total_ms,
            init_app_ms,
            models_cached,
        }),
        None => Ok(StartupMetricsResult {
            total_ms: 0,
            init_app_ms: 0,
            models_cached: false,
        }),
    }
}
