mod common;

use assistsupport_lib::db::{
    AnalyticsSummary, IngestSource, Namespace, ResponseQualitySummary, RunbookSessionRecord,
    SavedDraft, VectorConsent, WorkspaceFavoriteRecord,
};
use chrono::Utc;
use rusqlite::params;
use std::path::PathBuf;
use std::time::{Duration, Instant};

fn db_mod_source() -> String {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    std::fs::read_to_string(manifest_dir.join("src/db/mod.rs")).expect("read db/mod.rs")
}

#[test]
fn db_mod_keeps_the_current_facade_surface_stable() {
    let source = db_mod_source();
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));

    assert!(
        source.contains("pub struct Database"),
        "db/mod.rs should continue exposing the stable Database facade"
    );
    assert!(
        source.contains("pub enum DbError"),
        "db/mod.rs should continue exposing the stable DbError surface"
    );
    assert!(
        source.contains("pub const CURRENT_VECTOR_STORE_VERSION"),
        "db/mod.rs should continue exposing the vector store compatibility constant"
    );
    for relative_path in [
        "src/db/bootstrap.rs",
        "src/db/migrations.rs",
        "src/db/draft_store.rs",
        "src/db/knowledge_store.rs",
        "src/db/analytics_ops_store.rs",
        "src/db/workspace_store.rs",
        "src/db/runtime_state_store.rs",
    ] {
        assert!(
            manifest_dir.join(relative_path).exists(),
            "expected {} to exist so the ongoing DB split remains represented in source",
            relative_path
        );
    }

    let line_count = source.lines().count();
    assert!(
        line_count < 7000,
        "db/mod.rs should stay below the current local bloat budget, found {} lines",
        line_count
    );
}

#[test]
fn database_facade_reexports_and_representative_methods_still_work() {
    let (_dir, db) = common::create_test_db().expect("create test db");

    let _reexport_guard: (
        Option<SavedDraft>,
        Option<Namespace>,
        Option<IngestSource>,
        Option<AnalyticsSummary>,
        Option<ResponseQualitySummary>,
        Option<RunbookSessionRecord>,
        Option<WorkspaceFavoriteRecord>,
        Option<VectorConsent>,
    ) = (None, None, None, None, None, None, None, None);

    let now = Utc::now().to_rfc3339();
    let draft = SavedDraft {
        id: "draft-1".to_string(),
        input_text: "VPN client fails during posture check".to_string(),
        summary_text: Some("VPN failure summary".to_string()),
        diagnosis_json: Some(r#"{"status":"triage"}"#.to_string()),
        response_text: Some("Try reinstalling the posture module.".to_string()),
        ticket_id: Some("TICK-100".to_string()),
        kb_sources_json: Some(r#"["kb-1"]"#.to_string()),
        created_at: now.clone(),
        updated_at: now.clone(),
        is_autosave: false,
        model_name: Some("test-model".to_string()),
        case_intake_json: Some(r#"{"user":"Avery"}"#.to_string()),
        status: Default::default(),
        handoff_summary: None,
        finalized_at: None,
        finalized_by: None,
    };

    db.save_draft(&draft).expect("save draft");
    assert_eq!(db.get_draft("draft-1").expect("get draft").ticket_id.as_deref(), Some("TICK-100"));
    assert_eq!(db.list_drafts(10).expect("list drafts").len(), 1);
    assert_eq!(db.search_drafts("VPN", 10).expect("search drafts").len(), 1);

    db.create_namespace("Internal Ops", Some("Internal"), None)
        .expect("create namespace");
    let namespaces = db
        .list_namespaces_with_counts()
        .expect("list namespaces with counts");
    assert!(namespaces.iter().any(|namespace| namespace.id == "internal-ops"));

    db.log_analytics_event(
        "quality-1",
        "response_quality_snapshot",
        Some(r#"{"word_count":120,"edit_ratio":0.25,"time_to_draft_ms":9000}"#),
    )
    .expect("log analytics snapshot");
    let summary = db
        .get_response_quality_summary(None)
        .expect("get response quality summary");
    assert_eq!(summary.snapshots_count, 1);

    let session = db
        .create_runbook_session("vpn-incident", r#"["Verify","Reinstall"]"#, "draft:draft-1")
        .expect("create runbook session");
    let sessions = db
        .list_runbook_sessions(10, None, Some("draft:draft-1"))
        .expect("list runbook sessions");
    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].id, session.id);

    let consent = db.get_vector_consent().expect("get vector consent");
    assert!(!consent.enabled);
}

#[test]
fn sqlite_query_health_smoke_checks_cover_split_stores() {
    let (_dir, db) = common::create_test_db().expect("create test db");
    let now = Utc::now().to_rfc3339();

    for idx in 0..150 {
        let draft = SavedDraft {
            id: format!("draft-{}", idx),
            input_text: format!("VPN failure {}", idx),
            summary_text: Some("summary".to_string()),
            diagnosis_json: Some(r#"{"state":"open"}"#.to_string()),
            response_text: Some("response".to_string()),
            ticket_id: Some(format!("TICK-{}", idx % 12)),
            kb_sources_json: Some(r#"["kb-1"]"#.to_string()),
            created_at: now.clone(),
            updated_at: now.clone(),
            is_autosave: false,
            model_name: Some("test-model".to_string()),
            case_intake_json: Some(r#"{"user":"Casey"}"#.to_string()),
            status: Default::default(),
            handoff_summary: None,
            finalized_at: None,
            finalized_by: None,
        };
        db.save_draft(&draft).expect("save seeded draft");
    }

    for idx in 0..12 {
        let namespace = Namespace {
            id: format!("team-{}", idx),
            name: format!("Team {}", idx),
            description: Some("Seed namespace".to_string()),
            color: Some("#123456".to_string()),
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        db.save_namespace(&namespace).expect("save namespace");
    }

    for idx in 0..20 {
        db.conn()
            .execute(
                "INSERT INTO kb_documents (id, file_path, file_hash, title, indexed_at, chunk_count, namespace_id, source_type)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'file')",
                params![
                    format!("doc-{}", idx),
                    format!("/tmp/doc-{}.md", idx),
                    format!("hash-{}", idx),
                    format!("Document {}", idx),
                    now,
                    1,
                    format!("team-{}", idx % 12),
                ],
            )
            .expect("seed kb document");
    }

    for idx in 0..30 {
        db.log_analytics_event(
            &format!("quality-{}", idx),
            "response_quality_snapshot",
            Some(r#"{"word_count":100,"edit_ratio":0.4,"time_to_draft_ms":5000}"#),
        )
        .expect("seed analytics event");
    }

    for idx in 0..25 {
        let scope = format!("draft:seed-{}", idx);
        db.create_runbook_session("vpn-incident", r#"["Verify","Escalate"]"#, &scope)
            .expect("seed runbook session");
        if idx % 2 == 0 {
            let session = db
                .list_runbook_sessions(1, None, Some(&scope))
                .expect("list seeded runbook session")
                .remove(0);
            db.advance_runbook_session(&session.id, 1, Some("completed"))
                .expect("complete seeded runbook session");
        }
    }

    fn assert_fast_enough(label: &str, started_at: Instant) {
        let elapsed = started_at.elapsed();
        assert!(
            elapsed < Duration::from_secs(5),
            "{} should stay comfortably below the local sanity budget, got {:?}",
            label,
            elapsed
        );
    }

    let started = Instant::now();
    let drafts = db.list_drafts(50).expect("list drafts");
    assert_eq!(drafts.len(), 50);
    assert_fast_enough("list_drafts", started);

    let started = Instant::now();
    let search_results = db.search_drafts("VPN", 25).expect("search drafts");
    assert_eq!(search_results.len(), 25);
    assert_fast_enough("search_drafts", started);

    let started = Instant::now();
    let namespace_counts = db
        .list_namespaces_with_counts()
        .expect("list namespace counts");
    assert!(namespace_counts.len() >= 12);
    assert_fast_enough("list_namespaces_with_counts", started);

    let started = Instant::now();
    let quality_summary = db
        .get_response_quality_summary(None)
        .expect("response quality summary");
    assert_eq!(quality_summary.snapshots_count, 30);
    assert_fast_enough("get_response_quality_summary", started);

    let started = Instant::now();
    let runbook_sessions = db
        .list_runbook_sessions(50, None, None)
        .expect("list runbook sessions");
    assert!(runbook_sessions.len() >= 25);
    assert_fast_enough("list_runbook_sessions", started);
}

#[test]
fn db_facade_supports_backup_after_store_split() {
    let (_dir, db) = common::create_test_db().expect("create test db");
    let backup_path = db.backup().expect("backup database");

    assert!(backup_path.exists(), "backup file should be created");
}
