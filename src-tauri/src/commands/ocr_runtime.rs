use crate::commands::model_commands::{OcrResult, MAX_OCR_BASE64_BYTES};
use crate::kb::ocr::OcrManager;
use crate::validation::{validate_within_home, ValidationError};
use std::path::PathBuf;

pub(crate) fn process_ocr_impl(image_path: String) -> Result<OcrResult, String> {
    let ocr = OcrManager::new();
    let path = PathBuf::from(&image_path);

    if !path.exists() {
        return Err(format!("Image file not found: {}", image_path));
    }

    let validated_path = validate_within_home(&path).map_err(|e| match e {
        ValidationError::PathTraversal => {
            "Image file must be within your home directory".to_string()
        }
        ValidationError::InvalidFormat(msg) if msg.contains("sensitive") => {
            "This path is blocked because it contains sensitive data".to_string()
        }
        _ => format!("Invalid image path: {}", e),
    })?;

    if !validated_path.is_file() {
        return Err("Image path is not a file".into());
    }

    let result = ocr.recognize(&validated_path).map_err(|e| e.to_string())?;

    Ok(OcrResult {
        text: result.text,
        confidence: result.confidence.unwrap_or(1.0),
    })
}

pub(crate) fn process_ocr_bytes_impl(image_base64: String) -> Result<OcrResult, String> {
    use base64::{engine::general_purpose, Engine as _};

    if image_base64.len() > MAX_OCR_BASE64_BYTES {
        return Err(format!(
            "Image too large: {} bytes exceeds limit of {} bytes. Please use a smaller image.",
            image_base64.len(),
            MAX_OCR_BASE64_BYTES
        ));
    }

    let image_data = general_purpose::STANDARD
        .decode(&image_base64)
        .map_err(|e| format!("Invalid base64 data: {}", e))?;

    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join(format!("assistsupport_ocr_{}.png", uuid::Uuid::new_v4()));

    std::fs::write(&temp_path, &image_data)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    let ocr = OcrManager::new();
    let result = ocr.recognize(&temp_path).map_err(|e| e.to_string());

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
