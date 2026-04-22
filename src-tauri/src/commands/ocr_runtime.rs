use crate::commands::model_commands::{OcrResult, MAX_OCR_BASE64_BYTES};
use crate::error::AppError;
use crate::kb::ocr::OcrManager;
use crate::validation::{validate_within_home, ValidationError};
use std::path::PathBuf;

pub(crate) fn process_ocr_impl(image_path: String) -> Result<OcrResult, AppError> {
    let ocr = OcrManager::new();
    let path = PathBuf::from(&image_path);

    if !path.exists() {
        return Err(AppError::file_not_found(&image_path));
    }

    let validated_path = validate_within_home(&path).map_err(|e| match e {
        ValidationError::PathTraversal => AppError::path_traversal(),
        ValidationError::InvalidFormat(msg) if msg.contains("sensitive") => {
            AppError::sensitive_path()
        }
        other => AppError::invalid_path(format!("Invalid image path: {}", other)),
    })?;

    if !validated_path.is_file() {
        return Err(AppError::invalid_path("Image path is not a file"));
    }

    let result = ocr
        .recognize(&validated_path)
        .map_err(|e| AppError::internal(e.to_string()))?;

    Ok(OcrResult {
        text: result.text,
        confidence: result.confidence.unwrap_or(1.0),
    })
}

pub(crate) fn process_ocr_bytes_impl(image_base64: String) -> Result<OcrResult, AppError> {
    use base64::{engine::general_purpose, Engine as _};

    if image_base64.len() > MAX_OCR_BASE64_BYTES {
        // Preserve the exact "Image too large" wording — integration test in
        // tests/command_contracts.rs asserts on it via .to_string().contains.
        return Err(AppError::new(
            crate::error::ErrorCode::VALIDATION_INPUT_TOO_LARGE,
            format!(
                "Image too large: {} bytes exceeds limit of {} bytes. Please use a smaller image.",
                image_base64.len(),
                MAX_OCR_BASE64_BYTES
            ),
            crate::error::ErrorCategory::Validation,
        ));
    }

    let image_data = general_purpose::STANDARD
        .decode(&image_base64)
        .map_err(|e| AppError::invalid_format(format!("Invalid base64 data: {}", e)))?;

    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join(format!("assistsupport_ocr_{}.png", uuid::Uuid::new_v4()));

    std::fs::write(&temp_path, &image_data).map_err(AppError::from)?;

    let ocr = OcrManager::new();
    let result = ocr
        .recognize(&temp_path)
        .map_err(|e| AppError::internal(e.to_string()));

    let _ = std::fs::remove_file(&temp_path);

    let ocr_result = result?;
    Ok(OcrResult {
        text: ocr_result.text,
        confidence: ocr_result.confidence.unwrap_or(1.0),
    })
}

pub(crate) fn is_ocr_available_impl() -> bool {
    let ocr = OcrManager::new();
    !ocr.available_providers().is_empty()
}
