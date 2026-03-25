use crate::audit;
use crate::security::{
    FileKeyStore, TOKEN_HUGGINGFACE, TOKEN_MEMORYKERNEL_SERVICE, TOKEN_SEARCH_API,
};
use crate::validation::ValidationError;
use crate::validation::validate_within_home;
use tauri::command;

const GITHUB_TOKEN_PREFIX: &str = "github_token:";

fn normalize_github_host(host: &str) -> Result<String, String> {
    let trimmed = host.trim();
    if trimmed.is_empty() {
        return Err("GitHub host cannot be empty".to_string());
    }
    if trimmed.contains("://") || trimmed.contains('/') {
        return Err("GitHub host must be a hostname (no scheme or path)".to_string());
    }

    let re =
        regex_lite::Regex::new(r"^[A-Za-z0-9.-]+(:[0-9]{1,5})?$").map_err(|e| e.to_string())?;
    if !re.is_match(trimmed) {
        return Err("GitHub host contains invalid characters".to_string());
    }

    Ok(trimmed.to_lowercase())
}

pub(crate) fn has_hf_token_impl() -> Result<bool, String> {
    FileKeyStore::get_token(TOKEN_HUGGINGFACE)
        .map(|t| t.is_some())
        .map_err(|e| e.to_string())
}

pub(crate) fn set_hf_token_impl(token: String) -> Result<(), String> {
    FileKeyStore::store_token(TOKEN_HUGGINGFACE, &token).map_err(|e| e.to_string())?;
    audit::audit_token_set("huggingface");
    Ok(())
}

pub(crate) fn clear_hf_token_impl() -> Result<(), String> {
    FileKeyStore::delete_token(TOKEN_HUGGINGFACE).map_err(|e| e.to_string())?;
    audit::audit_token_cleared("huggingface");
    Ok(())
}

pub(crate) fn has_search_api_token_impl() -> Result<bool, String> {
    FileKeyStore::get_token(TOKEN_SEARCH_API)
        .map(|token| token.is_some())
        .map_err(|e| e.to_string())
}

pub(crate) fn set_search_api_token_impl(token: String) -> Result<(), String> {
    let token = token.trim();
    if token.is_empty() {
        return Err("Token cannot be empty".to_string());
    }
    FileKeyStore::store_token(TOKEN_SEARCH_API, token).map_err(|e| e.to_string())?;
    audit::audit_token_set("search_api");
    Ok(())
}

pub(crate) fn clear_search_api_token_impl() -> Result<(), String> {
    FileKeyStore::delete_token(TOKEN_SEARCH_API).map_err(|e| e.to_string())?;
    audit::audit_token_cleared("search_api");
    Ok(())
}

pub(crate) fn has_memorykernel_service_token_impl() -> Result<bool, String> {
    FileKeyStore::get_token(TOKEN_MEMORYKERNEL_SERVICE)
        .map(|token| token.is_some())
        .map_err(|e| e.to_string())
}

pub(crate) fn set_memorykernel_service_token_impl(token: String) -> Result<(), String> {
    let token = token.trim();
    if token.is_empty() {
        return Err("Token cannot be empty".to_string());
    }
    FileKeyStore::store_token(TOKEN_MEMORYKERNEL_SERVICE, token).map_err(|e| e.to_string())?;
    audit::audit_token_set("memorykernel_service");
    Ok(())
}

pub(crate) fn clear_memorykernel_service_token_impl() -> Result<(), String> {
    FileKeyStore::delete_token(TOKEN_MEMORYKERNEL_SERVICE).map_err(|e| e.to_string())?;
    audit::audit_token_cleared("memorykernel_service");
    Ok(())
}

pub(crate) fn set_github_token_impl(host: String, token: String) -> Result<(), String> {
    let host = normalize_github_host(&host)?;
    let token = token.trim();
    if token.is_empty() {
        return Err("Token cannot be empty".to_string());
    }
    let key = format!("{}{}", GITHUB_TOKEN_PREFIX, host);
    FileKeyStore::store_token(&key, token).map_err(|e| e.to_string())?;
    audit::audit_token_set(&format!("github:{}", host));
    Ok(())
}

pub(crate) fn clear_github_token_impl(host: String) -> Result<(), String> {
    let host = normalize_github_host(&host)?;
    let key = format!("{}{}", GITHUB_TOKEN_PREFIX, host);
    FileKeyStore::delete_token(&key).map_err(|e| e.to_string())?;
    audit::audit_token_cleared(&format!("github:{}", host));
    Ok(())
}

pub(crate) fn has_github_token_impl(host: String) -> Result<bool, String> {
    let host = normalize_github_host(&host)?;
    let key = format!("{}{}", GITHUB_TOKEN_PREFIX, host);
    Ok(FileKeyStore::get_token(&key)
        .map_err(|e| e.to_string())?
        .is_some())
}

pub(crate) fn get_audit_entries_impl(
    limit: Option<usize>,
) -> Result<Vec<crate::audit::AuditEntry>, String> {
    crate::audit::read_audit_entries(limit).map_err(|e| e.to_string())
}

pub(crate) fn export_audit_log_impl(export_path: String) -> Result<String, String> {
    use std::path::Path;

    let path = Path::new(&export_path);
    let validated = validate_within_home(path).map_err(|e| match e {
        ValidationError::PathTraversal => {
            "Export path must be within your home directory".to_string()
        }
        _ => format!("Invalid export path: {}", e),
    })?;

    let entries = crate::audit::read_audit_entries(None).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
    std::fs::write(&validated, json).map_err(|e| e.to_string())?;
    let _ = crate::security::set_secure_permissions(&validated, crate::security::FILE_PERMISSIONS);

    Ok(validated.to_string_lossy().to_string())
}

#[command]
pub fn has_hf_token() -> Result<bool, String> {
    has_hf_token_impl()
}

#[command]
pub fn set_hf_token(token: String) -> Result<(), String> {
    set_hf_token_impl(token)
}

#[command]
pub fn clear_hf_token() -> Result<(), String> {
    clear_hf_token_impl()
}

#[command]
pub fn has_search_api_token() -> Result<bool, String> {
    has_search_api_token_impl()
}

#[command]
pub fn set_search_api_token(token: String) -> Result<(), String> {
    set_search_api_token_impl(token)
}

#[command]
pub fn clear_search_api_token() -> Result<(), String> {
    clear_search_api_token_impl()
}

#[command]
pub fn has_memorykernel_service_token() -> Result<bool, String> {
    has_memorykernel_service_token_impl()
}

#[command]
pub fn set_memorykernel_service_token(token: String) -> Result<(), String> {
    set_memorykernel_service_token_impl(token)
}

#[command]
pub fn clear_memorykernel_service_token() -> Result<(), String> {
    clear_memorykernel_service_token_impl()
}

#[command]
pub fn set_github_token(host: String, token: String) -> Result<(), String> {
    set_github_token_impl(host, token)
}

#[command]
pub fn clear_github_token(host: String) -> Result<(), String> {
    clear_github_token_impl(host)
}

#[command]
pub fn has_github_token(host: String) -> Result<bool, String> {
    has_github_token_impl(host)
}

#[command]
pub fn get_audit_entries(limit: Option<usize>) -> Result<Vec<crate::audit::AuditEntry>, String> {
    get_audit_entries_impl(limit)
}

#[command]
pub fn export_audit_log(export_path: String) -> Result<String, String> {
    export_audit_log_impl(export_path)
}
