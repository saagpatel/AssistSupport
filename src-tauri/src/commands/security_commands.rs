use super::*;
use crate::error::AppError;
use crate::validation::{validate_output_file_within_home, ValidationError};

/// Convert FileKeyStore / keychain errors into an AppError with a security
/// category. Keeps the detail out of the user-facing message but preserves it
/// for logging.
fn keystore_err(op: &str, e: impl std::fmt::Display) -> AppError {
    AppError::new(
        crate::error::ErrorCode::INTERNAL_ERROR,
        format!("Token {} failed", op),
        crate::error::ErrorCategory::Security,
    )
    .with_detail(e.to_string())
}

pub(crate) fn has_hf_token_impl() -> Result<bool, AppError> {
    FileKeyStore::get_token(TOKEN_HUGGINGFACE)
        .map(|t| t.is_some())
        .map_err(|e| keystore_err("read", e))
}

pub(crate) fn set_hf_token_impl(token: String) -> Result<(), AppError> {
    FileKeyStore::store_token(TOKEN_HUGGINGFACE, &token).map_err(|e| keystore_err("store", e))?;
    audit::audit_token_set("huggingface");
    Ok(())
}

pub(crate) fn clear_hf_token_impl() -> Result<(), AppError> {
    FileKeyStore::delete_token(TOKEN_HUGGINGFACE).map_err(|e| keystore_err("delete", e))?;
    audit::audit_token_cleared("huggingface");
    Ok(())
}

pub(crate) fn has_search_api_token_impl() -> Result<bool, AppError> {
    FileKeyStore::get_token(TOKEN_SEARCH_API)
        .map(|token| token.is_some())
        .map_err(|e| keystore_err("read", e))
}

pub(crate) fn set_search_api_token_impl(token: String) -> Result<(), AppError> {
    let token = token.trim();
    if token.is_empty() {
        return Err(AppError::empty_input("Token"));
    }
    FileKeyStore::store_token(TOKEN_SEARCH_API, token).map_err(|e| keystore_err("store", e))?;
    audit::audit_token_set("search_api");
    Ok(())
}

pub(crate) fn clear_search_api_token_impl() -> Result<(), AppError> {
    FileKeyStore::delete_token(TOKEN_SEARCH_API).map_err(|e| keystore_err("delete", e))?;
    audit::audit_token_cleared("search_api");
    Ok(())
}

pub(crate) fn has_memorykernel_service_token_impl() -> Result<bool, AppError> {
    FileKeyStore::get_token(TOKEN_MEMORYKERNEL_SERVICE)
        .map(|token| token.is_some())
        .map_err(|e| keystore_err("read", e))
}

pub(crate) fn set_memorykernel_service_token_impl(token: String) -> Result<(), AppError> {
    let token = token.trim();
    if token.is_empty() {
        return Err(AppError::empty_input("Token"));
    }
    FileKeyStore::store_token(TOKEN_MEMORYKERNEL_SERVICE, token)
        .map_err(|e| keystore_err("store", e))?;
    audit::audit_token_set("memorykernel_service");
    Ok(())
}

pub(crate) fn clear_memorykernel_service_token_impl() -> Result<(), AppError> {
    FileKeyStore::delete_token(TOKEN_MEMORYKERNEL_SERVICE)
        .map_err(|e| keystore_err("delete", e))?;
    audit::audit_token_cleared("memorykernel_service");
    Ok(())
}

pub(crate) fn set_github_token_impl(host: String, token: String) -> Result<(), AppError> {
    let host = normalize_github_host(&host)?;
    let token = token.trim();
    if token.is_empty() {
        return Err(AppError::empty_input("Token"));
    }
    let key = format!("{}{}", GITHUB_TOKEN_PREFIX, host);
    FileKeyStore::store_token(&key, token).map_err(|e| keystore_err("store", e))?;
    audit::audit_token_set(&format!("github:{}", host));
    Ok(())
}

pub(crate) fn clear_github_token_impl(host: String) -> Result<(), AppError> {
    let host = normalize_github_host(&host)?;
    let key = format!("{}{}", GITHUB_TOKEN_PREFIX, host);
    FileKeyStore::delete_token(&key).map_err(|e| keystore_err("delete", e))?;
    audit::audit_token_cleared(&format!("github:{}", host));
    Ok(())
}

pub(crate) fn has_github_token_impl(host: String) -> Result<bool, AppError> {
    let host = normalize_github_host(&host)?;
    let key = format!("{}{}", GITHUB_TOKEN_PREFIX, host);
    Ok(FileKeyStore::get_token(&key)
        .map_err(|e| keystore_err("read", e))?
        .is_some())
}

pub(crate) fn get_audit_entries_impl(
    limit: Option<usize>,
) -> Result<Vec<crate::audit::AuditEntry>, AppError> {
    crate::audit::read_audit_entries(limit).map_err(|e| {
        AppError::new(
            crate::error::ErrorCode::IO_READ_ERROR,
            "Failed to read audit log",
            crate::error::ErrorCategory::Io,
        )
        .with_detail(e.to_string())
    })
}

pub(crate) fn export_audit_log_impl(export_path: String) -> Result<String, AppError> {
    use std::path::Path;

    let path = Path::new(&export_path);
    let validated = validate_output_file_within_home(path).map_err(|e| match e {
        ValidationError::PathTraversal => AppError::new(
            crate::error::ErrorCode::VALIDATION_PATH_TRAVERSAL,
            "Export path must be within your home directory",
            crate::error::ErrorCategory::Validation,
        ),
        other => AppError::invalid_path(format!("Invalid export path: {}", other)),
    })?;

    let entries = crate::audit::read_audit_entries(None).map_err(|e| {
        AppError::new(
            crate::error::ErrorCode::IO_READ_ERROR,
            "Failed to read audit log",
            crate::error::ErrorCategory::Io,
        )
        .with_detail(e.to_string())
    })?;
    let json = serde_json::to_string_pretty(&entries)
        .map_err(|e| AppError::internal(format!("Failed to serialize audit log: {}", e)))?;
    std::fs::write(&validated, json).map_err(AppError::from)?;
    let _ = crate::security::set_secure_permissions(&validated, crate::security::FILE_PERMISSIONS);

    Ok(validated.to_string_lossy().to_string())
}
