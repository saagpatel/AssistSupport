//! Database module for AssistSupport
//! SQLCipher encrypted database with FTS5 full-text search

pub mod executor;
mod analytics_ops_store;
mod bootstrap;
mod draft_store;
mod job_store;
mod knowledge_store;
mod migrations;
mod path_helpers;
mod runtime_state_store;
mod types_analytics_ops;
mod types_drafts;
mod types_knowledge;
mod types_runtime;
mod types_workspace;
mod workspace_store;

pub use executor::{DbExecutor, DbExecutorError};
pub use path_helpers::{
    get_app_data_dir, get_attachments_dir, get_cache_dir, get_db_path, get_downloads_dir,
    get_logs_dir, get_models_dir, get_vectors_dir,
};
pub use types_analytics_ops::*;
pub use types_drafts::*;
pub use types_knowledge::*;
pub use types_runtime::*;
pub use types_workspace::*;

use crate::security::{MasterKey, SecurityError};
use crate::validation::{normalize_and_validate_namespace_id, ValidationError};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Result as SqliteResult};
use std::path::{Path, PathBuf};
use thiserror::Error;
use zeroize::Zeroize;

const CURRENT_SCHEMA_VERSION: i32 = 15;
const VECTOR_STORE_VERSION_KEY: &str = "vector_store_version";
pub const CURRENT_VECTOR_STORE_VERSION: i32 = 2;

#[derive(Debug, Error)]
pub enum DbError {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("Security error: {0}")]
    Security(#[from] SecurityError),
    #[error("Validation error: {0}")]
    Validation(#[from] ValidationError),
    #[error("Database not initialized")]
    NotInitialized,
    #[error("Migration failed: {0}")]
    Migration(String),
    #[error("Database corruption detected")]
    Corruption,
    #[error("Database integrity check failed: {0}")]
    Integrity(String),
    #[error("FTS5 not available in this build")]
    Fts5NotAvailable,
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Invalid input: {0}")]
    InvalidInput(String),
}

/// Database manager for AssistSupport
pub struct Database {
    conn: Connection,
    path: PathBuf,
}

impl Database {
    fn normalize_json_string_array(
        &self,
        raw: &str,
        field_name: &str,
    ) -> Result<String, DbError> {
        let parsed: Vec<String> = serde_json::from_str(raw).map_err(|e| {
            DbError::InvalidInput(format!("{} must be a JSON string array: {}", field_name, e))
        })?;
        serde_json::to_string(&parsed).map_err(|e| {
            DbError::InvalidInput(format!("{} could not be normalized: {}", field_name, e))
        })
    }

    fn normalize_optional_json_object(
        &self,
        raw: Option<&str>,
        field_name: &str,
    ) -> Result<Option<String>, DbError> {
        match raw.map(str::trim).filter(|value| !value.is_empty()) {
            Some(value) => {
                let parsed: serde_json::Value = serde_json::from_str(value).map_err(|e| {
                    DbError::InvalidInput(format!("{} must be valid JSON: {}", field_name, e))
                })?;
                if !parsed.is_object() {
                    return Err(DbError::InvalidInput(format!(
                        "{} must be a JSON object",
                        field_name
                    )));
                }
                Ok(Some(parsed.to_string()))
            }
            None => Ok(None),
        }
    }
}

/// Built-in decision trees: (id, name, category, tree_json)
const BUILTIN_TREES: &[(&str, &str, &str, &str)] = &[
    (
        "auth-issues",
        "Authentication Issues",
        "Security",
        include_str!("../trees/auth.json"),
    ),
    (
        "vpn-connectivity",
        "VPN Connectivity",
        "Network",
        include_str!("../trees/vpn.json"),
    ),
    (
        "email-calendar",
        "Email & Calendar",
        "Productivity",
        include_str!("../trees/email.json"),
    ),
    (
        "password-reset",
        "Password Reset",
        "Security",
        include_str!("../trees/password.json"),
    ),
];

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn create_test_db() -> (Database, tempfile::TempDir) {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let key = MasterKey::generate();
        let db = Database::open(&db_path, &key).unwrap();
        db.initialize().unwrap();
        (db, dir)
    }

    #[test]
    fn test_database_creation() {
        let (db, _dir) = create_test_db();
        assert!(db.check_integrity().is_ok());
    }

    #[test]
    fn test_fts5_available() {
        let (db, _dir) = create_test_db();
        assert!(db.verify_fts5().unwrap());
    }

    #[test]
    fn test_sqlcipher_encryption() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("encrypted.db");
        let key = MasterKey::generate();

        // Create and write to encrypted database
        {
            let db = Database::open(&db_path, &key).unwrap();
            db.initialize().unwrap();
            db.conn()
                .execute(
                    "INSERT INTO settings (key, value) VALUES ('test', 'secret_data')",
                    [],
                )
                .unwrap();
        }

        // Verify file is encrypted (raw read should not contain plaintext)
        let raw_content = std::fs::read(&db_path).unwrap();
        let content_str = String::from_utf8_lossy(&raw_content);
        assert!(
            !content_str.contains("secret_data"),
            "Database file should be encrypted - plaintext found!"
        );
        assert!(
            !content_str.contains("SQLite format"),
            "Database should be encrypted - SQLite header found!"
        );

        // Verify we can still read with correct key
        let db = Database::open(&db_path, &key).unwrap();
        let value: String = db
            .conn()
            .query_row("SELECT value FROM settings WHERE key = 'test'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(value, "secret_data");
    }

    #[test]
    fn test_wrong_key_fails() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("encrypted.db");
        let key1 = MasterKey::generate();
        let key2 = MasterKey::generate();

        // Create database with key1
        {
            let db = Database::open(&db_path, &key1).unwrap();
            db.initialize().unwrap();
        }

        // Opening with wrong key should fail
        let result = Database::open(&db_path, &key2);
        assert!(result.is_err(), "Should fail to open with wrong key");
    }

    #[test]
    fn test_fts5_indexing() {
        let (db, _dir) = create_test_db();

        // Insert a test document
        db.conn()
            .execute(
                "INSERT INTO kb_documents (id, file_path, file_hash, indexed_at) VALUES (?, ?, ?, ?)",
                params!["doc1", "/test/doc.md", "abc123", "2024-01-01"],
            )
            .unwrap();

        // Insert a test chunk (trigger should update FTS5)
        db.conn()
            .execute(
                "INSERT INTO kb_chunks (id, document_id, chunk_index, heading_path, content, word_count) VALUES (?, ?, ?, ?, ?, ?)",
                params!["chunk1", "doc1", 0, "Test > Heading", "This is a test chunk about authentication errors", 8],
            )
            .unwrap();

        // Search should find the chunk
        let results = db.fts_search("authentication", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].chunk_id, "chunk1");
    }

    #[test]
    fn test_fts5_triggers() {
        let (db, _dir) = create_test_db();

        // Insert document
        db.conn()
            .execute(
                "INSERT INTO kb_documents (id, file_path, file_hash, indexed_at) VALUES (?, ?, ?, ?)",
                params!["doc1", "/test/doc.md", "abc123", "2024-01-01"],
            )
            .unwrap();

        // Insert chunk
        db.conn()
            .execute(
                "INSERT INTO kb_chunks (id, document_id, chunk_index, heading_path, content, word_count) VALUES (?, ?, ?, ?, ?, ?)",
                params!["chunk1", "doc1", 0, "Heading", "VPN connection troubleshooting guide", 4],
            )
            .unwrap();

        // Verify FTS5 has the content
        let results = db.fts_search("VPN", 10).unwrap();
        assert_eq!(results.len(), 1);

        // Update chunk
        db.conn()
            .execute(
                "UPDATE kb_chunks SET content = 'Password reset instructions' WHERE id = 'chunk1'",
                [],
            )
            .unwrap();

        // Old content should not be found
        let results = db.fts_search("VPN", 10).unwrap();
        assert_eq!(results.len(), 0);

        // New content should be found
        let results = db.fts_search("Password", 10).unwrap();
        assert_eq!(results.len(), 1);

        // Delete chunk
        db.conn()
            .execute("DELETE FROM kb_chunks WHERE id = 'chunk1'", [])
            .unwrap();

        // Should not be found after delete
        let results = db.fts_search("Password", 10).unwrap();
        assert_eq!(results.len(), 0);
    }

    #[test]
    fn test_vector_consent() {
        let (db, _dir) = create_test_db();

        // Default should be disabled
        let consent = db.get_vector_consent().unwrap();
        assert!(!consent.enabled);

        // Enable with encryption support
        db.set_vector_consent(true, true).unwrap();
        let consent = db.get_vector_consent().unwrap();
        assert!(consent.enabled);
        assert_eq!(consent.encryption_supported, Some(true));
    }

    #[test]
    fn test_get_all_chunks_for_embedding_includes_document_metadata() {
        let (db, _dir) = create_test_db();

        db.create_namespace("internal", Some("Internal"), None)
            .unwrap();
        db.conn()
            .execute(
                "INSERT INTO kb_documents (id, file_path, file_hash, indexed_at, namespace_id, source_type)
                 VALUES (?, ?, ?, ?, ?, ?)",
                params![
                    "doc_internal",
                    "/test/internal.md",
                    "hash1",
                    "2024-01-01",
                    "internal",
                    "file"
                ],
            )
            .unwrap();
        db.conn()
            .execute(
                "INSERT INTO kb_chunks (id, document_id, chunk_index, heading_path, content, word_count, namespace_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
                params![
                    "chunk_internal",
                    "doc_internal",
                    0,
                    "Heading",
                    "Internal runbook content",
                    3,
                    "internal"
                ],
            )
            .unwrap();

        let chunks = db.get_all_chunks_for_embedding().unwrap();
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].chunk_id, "chunk_internal");
        assert_eq!(chunks[0].document_id, "doc_internal");
        assert_eq!(chunks[0].namespace_id, "internal");
        assert!(chunks[0].content.contains("runbook"));
        assert_eq!(
            db.get_document_id_by_path("/test/internal.md").unwrap(),
            Some("doc_internal".to_string())
        );
        assert_eq!(db.get_document_id_by_path("/missing.md").unwrap(), None);
    }

    #[test]
    fn test_set_integration_config_accepts_json_object() {
        let (db, _dir) = create_test_db();

        db.set_integration_config(
            "slack",
            true,
            Some(r#"{"endpoint":"https://example.test/hook","channel":"it-support"}"#),
        )
        .expect("integration config object should be accepted");

        let integrations = db.list_integration_configs().expect("list integrations");
        assert_eq!(integrations.len(), 1);
        assert_eq!(integrations[0].integration_type, "slack");
        assert!(integrations[0].enabled);
        assert!(integrations[0].config_json.is_some());
    }

    #[test]
    fn test_set_integration_config_rejects_non_object_json() {
        let (db, _dir) = create_test_db();

        let err = db
            .set_integration_config("slack", true, Some(r#"["not","an","object"]"#))
            .expect_err("array config should be rejected");

        assert!(err.to_string().contains("JSON object"));
    }

    #[test]
    fn test_response_quality_summary_aggregates_event_metrics() {
        let (db, _dir) = create_test_db();

        db.log_analytics_event(
            "event-1",
            "response_quality_snapshot",
            Some(r#"{"word_count":120,"edit_ratio":0.2,"time_to_draft_ms":9000}"#),
        )
        .unwrap();
        db.log_analytics_event(
            "event-2",
            "response_quality_snapshot",
            Some(r#"{"word_count":80,"edit_ratio":0.5,"time_to_draft_ms":3000}"#),
        )
        .unwrap();
        db.log_analytics_event("event-3", "response_saved", Some(r#"{"is_edited":true}"#))
            .unwrap();
        db.log_analytics_event("event-4", "response_saved", Some(r#"{"is_edited":false}"#))
            .unwrap();
        db.log_analytics_event("event-5", "response_copied", Some(r#"{}"#))
            .unwrap();

        let summary = db.get_response_quality_summary(None).unwrap();
        assert_eq!(summary.snapshots_count, 2);
        assert_eq!(summary.saved_count, 2);
        assert_eq!(summary.copied_count, 1);
        assert!((summary.avg_word_count - 100.0).abs() < f64::EPSILON);
        assert!((summary.avg_edit_ratio - 0.35).abs() < f64::EPSILON);
        assert!((summary.edited_save_rate - 0.5).abs() < f64::EPSILON);
        assert_eq!(summary.median_time_to_draft_ms, Some(6000));
        assert_eq!(summary.avg_time_to_draft_ms, Some(6000.0));
        assert!((summary.copy_per_saved_ratio - 0.5).abs() < f64::EPSILON);
    }

    #[test]
    fn test_response_quality_drilldown_examples_include_draft_context() {
        let (db, _dir) = create_test_db();

        let now = Utc::now().to_rfc3339();
        db.conn()
            .execute(
                "INSERT INTO drafts (id, input_text, summary_text, diagnosis_json, response_text, ticket_id, kb_sources_json, created_at, updated_at, is_autosave, model_name)
                 VALUES (?1, ?2, NULL, NULL, NULL, NULL, NULL, ?3, ?3, 0, NULL)",
                params![
                    "draft-example-1",
                    "VPN client fails at startup when endpoint posture check blocks launch",
                    now
                ],
            )
            .unwrap();

        db.log_analytics_event(
            "drill-event-1",
            "response_quality_snapshot",
            Some(
                r#"{"draft_id":"draft-example-1","word_count":110,"edit_ratio":0.15,"time_to_draft_ms":195000}"#,
            ),
        )
        .unwrap();
        db.log_analytics_event(
            "drill-event-2",
            "response_saved",
            Some(r#"{"draft_id":"draft-example-1","is_edited":true,"edit_ratio":0.48}"#),
        )
        .unwrap();

        let examples = db
            .get_response_quality_drilldown_examples(None, Some(3))
            .unwrap();
        assert!(!examples.edit_ratio.is_empty());
        assert_eq!(examples.edit_ratio[0].draft_id, "draft-example-1");
        assert!(examples.edit_ratio[0]
            .draft_excerpt
            .as_deref()
            .unwrap_or_default()
            .contains("VPN client fails"));

        assert!(!examples.time_to_draft.is_empty());
        assert_eq!(examples.time_to_draft[0].draft_id, "draft-example-1");

        assert!(!examples.copy_per_save.is_empty());
        assert_eq!(examples.copy_per_save[0].draft_id, "draft-example-1");

        assert!(!examples.edited_save_rate.is_empty());
        assert_eq!(examples.edited_save_rate[0].draft_id, "draft-example-1");
    }

    #[test]
    fn test_save_workspace_favorite_returns_persisted_id_after_upsert() {
        let (db, _dir) = create_test_db();

        let first_id = db
            .save_workspace_favorite(&WorkspaceFavoriteRecord {
                id: String::new(),
                kind: "kit".to_string(),
                label: "VPN Incident Starter".to_string(),
                resource_id: "kit-1".to_string(),
                metadata_json: Some(r#"{"category":"incident"}"#.to_string()),
                created_at: String::new(),
                updated_at: String::new(),
            })
            .expect("save first favorite");

        let second_id = db
            .save_workspace_favorite(&WorkspaceFavoriteRecord {
                id: String::new(),
                kind: "kit".to_string(),
                label: "VPN Incident Starter Updated".to_string(),
                resource_id: "kit-1".to_string(),
                metadata_json: Some(r#"{"category":"incident"}"#.to_string()),
                created_at: String::new(),
                updated_at: String::new(),
            })
            .expect("upsert favorite");

        let favorites = db.list_workspace_favorites().expect("list favorites");
        assert_eq!(favorites.len(), 1);
        assert_eq!(favorites[0].id, first_id);
        assert_eq!(second_id, first_id);
        assert_eq!(favorites[0].label, "VPN Incident Starter Updated");
    }

    #[test]
    fn test_runbook_sessions_are_scoped_to_workspace_key() {
        let (db, _dir) = create_test_db();

        db.create_runbook_session(
            "security-incident",
            r#"["Acknowledge","Contain"]"#,
            "draft:draft-1",
        )
        .expect("create first session");
        db.create_runbook_session(
            "access-request",
            r#"["Verify","Approve"]"#,
            "draft:draft-2",
        )
        .expect("create second session");

        let draft_one_sessions = db
            .list_runbook_sessions(10, None, Some("draft:draft-1"))
            .expect("list draft one sessions");
        let draft_two_sessions = db
            .list_runbook_sessions(10, None, Some("draft:draft-2"))
            .expect("list draft two sessions");

        assert_eq!(draft_one_sessions.len(), 1);
        assert_eq!(draft_two_sessions.len(), 1);
        assert_eq!(draft_one_sessions[0].scope_key, "draft:draft-1");
        assert_eq!(draft_two_sessions[0].scope_key, "draft:draft-2");
        assert_ne!(draft_one_sessions[0].id, draft_two_sessions[0].id);
    }

    #[test]
    fn test_reassign_runbook_session_scope_moves_existing_sessions() {
        let (db, _dir) = create_test_db();

        db.create_runbook_session(
            "security-incident",
            r#"["Acknowledge","Contain"]"#,
            "workspace:temp-1",
        )
        .expect("create scoped session");

        db.reassign_runbook_session_scope("workspace:temp-1", "draft:draft-1")
            .expect("reassign session scope");

        let old_scope_sessions = db
            .list_runbook_sessions(10, None, Some("workspace:temp-1"))
            .expect("list old scope sessions");
        let new_scope_sessions = db
            .list_runbook_sessions(10, None, Some("draft:draft-1"))
            .expect("list new scope sessions");

        assert!(old_scope_sessions.is_empty());
        assert_eq!(new_scope_sessions.len(), 1);
        assert_eq!(new_scope_sessions[0].scope_key, "draft:draft-1");
    }

    #[test]
    fn test_reassign_runbook_session_by_id_moves_only_target_session() {
        let (db, _dir) = create_test_db();

        let target = db
            .create_runbook_session(
                "security-incident",
                r#"["Acknowledge","Contain"]"#,
                "legacy:unscoped",
            )
            .expect("create target session");
        db.advance_runbook_session(&target.id, 1, Some("completed"))
            .expect("complete target session");
        let untouched = db
            .create_runbook_session(
                "access-request",
                r#"["Verify","Approve"]"#,
                "legacy:unscoped",
            )
            .expect("create untouched session");
        db.advance_runbook_session(&untouched.id, 1, Some("completed"))
            .expect("complete untouched session");

        db.reassign_runbook_session_by_id(&target.id, "draft:draft-1")
            .expect("reassign target session");

        let legacy_sessions = db
            .list_runbook_sessions(10, None, Some("legacy:unscoped"))
            .expect("list legacy sessions");
        let draft_sessions = db
            .list_runbook_sessions(10, None, Some("draft:draft-1"))
            .expect("list draft sessions");

        assert_eq!(draft_sessions.len(), 1);
        assert_eq!(draft_sessions[0].id, target.id);
        assert_eq!(legacy_sessions.len(), 1);
        assert_eq!(legacy_sessions[0].id, untouched.id);
    }

    #[test]
    fn test_create_runbook_session_rejects_second_live_session_in_same_scope() {
        let (db, _dir) = create_test_db();

        let session = db
            .create_runbook_session(
                "security-incident",
                r#"["Acknowledge","Contain"]"#,
                "draft:draft-1",
            )
            .expect("create first session");

        let err = db
            .create_runbook_session(
                "access-request",
                r#"["Verify","Approve"]"#,
                "draft:draft-1",
            )
            .expect_err("reject second live session");
        assert!(matches!(err, DbError::InvalidInput(_)));

        db.advance_runbook_session(&session.id, 1, Some("completed"))
            .expect("complete first session");

        let replacement = db
            .create_runbook_session(
                "access-request",
                r#"["Verify","Approve"]"#,
                "draft:draft-1",
            )
            .expect("allow new session after completion");
        assert_ne!(replacement.id, session.id);
    }

}
