//! Database migrations and schema bootstrap.

use super::*;

impl Database {

    /// Run database migrations
    pub(crate) fn run_migrations(&self, from_version: i32) -> Result<(), DbError> {
        // Backup before migration
        self.backup()?;

        let tx = self.conn.unchecked_transaction()?;

        if from_version < 1 {
            self.migrate_v1()?;
        }

        if from_version < 2 {
            self.migrate_v2()?;
        }

        if from_version < 3 {
            self.migrate_v3()?;
        }

        if from_version < 4 {
            self.migrate_v4()?;
        }

        if from_version < 5 {
            self.migrate_v5()?;
        }

        if from_version < 6 {
            self.migrate_v6()?;
        }

        if from_version < 7 {
            self.migrate_v7()?;
        }

        if from_version < 8 {
            self.migrate_v8()?;
        }

        if from_version < 9 {
            self.migrate_v9()?;
        }

        if from_version < 10 {
            self.migrate_v10()?;
        }

        if from_version < 11 {
            self.migrate_v11()?;
        }

        if from_version < 12 {
            self.migrate_v12()?;
        }

        if from_version < 13 {
            self.migrate_v13()?;
        }

        if from_version < 14 {
            self.migrate_v14()?;
        }

        if from_version < 15 {
            self.migrate_v15()?;
        }

        tx.commit()?;
        self.set_schema_version(CURRENT_SCHEMA_VERSION)?;

        Ok(())
    }


    /// Migration to v1: Initial schema
    fn migrate_v1(&self) -> Result<(), DbError> {
        self.conn.execute_batch(
            r#"
            -- Core settings
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            -- Drafts
            CREATE TABLE IF NOT EXISTS drafts (
                id TEXT PRIMARY KEY,
                input_text TEXT NOT NULL,
                summary_text TEXT,
                diagnosis_json TEXT,
                response_text TEXT,
                ticket_id TEXT,
                kb_sources_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                is_autosave INTEGER DEFAULT 0,
                model_name TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_drafts_created ON drafts(created_at);
            CREATE INDEX IF NOT EXISTS idx_drafts_ticket ON drafts(ticket_id);

            -- Follow-ups
            CREATE TABLE IF NOT EXISTS followups (
                id TEXT PRIMARY KEY,
                draft_id TEXT,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE SET NULL
            );

            -- Attachments (encrypted at rest)
            CREATE TABLE IF NOT EXISTS attachments (
                id TEXT PRIMARY KEY,
                draft_id TEXT,
                filename TEXT NOT NULL,
                mime_type TEXT,
                encrypted_path TEXT NOT NULL,
                ocr_text TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE
            );

            -- Knowledge Base Documents
            CREATE TABLE IF NOT EXISTS kb_documents (
                id TEXT PRIMARY KEY,
                file_path TEXT NOT NULL UNIQUE,
                file_hash TEXT NOT NULL,
                title TEXT,
                indexed_at TEXT,
                chunk_count INTEGER,
                ocr_quality TEXT,
                partial_index INTEGER DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_kb_docs_path ON kb_documents(file_path);

            -- Document Chunks (keep rowid for FTS5 joins)
            CREATE TABLE IF NOT EXISTS kb_chunks (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                heading_path TEXT,
                content TEXT NOT NULL,
                word_count INTEGER,
                FOREIGN KEY (document_id) REFERENCES kb_documents(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_kb_chunks_doc ON kb_chunks(document_id);

            -- FTS5 Full-Text Search Index
            CREATE VIRTUAL TABLE IF NOT EXISTS kb_fts USING fts5(
                content, heading_path,
                content='kb_chunks',
                tokenize='porter unicode61'
            );

            -- FTS5 Triggers (sync with kb_chunks via rowid)
            CREATE TRIGGER IF NOT EXISTS kb_chunks_ai AFTER INSERT ON kb_chunks BEGIN
                INSERT INTO kb_fts(rowid, content, heading_path)
                VALUES (new.rowid, new.content, new.heading_path);
            END;

            CREATE TRIGGER IF NOT EXISTS kb_chunks_ad AFTER DELETE ON kb_chunks BEGIN
                INSERT INTO kb_fts(kb_fts, rowid, content, heading_path)
                VALUES ('delete', old.rowid, old.content, old.heading_path);
            END;

            CREATE TRIGGER IF NOT EXISTS kb_chunks_au AFTER UPDATE ON kb_chunks BEGIN
                INSERT INTO kb_fts(kb_fts, rowid, content, heading_path)
                VALUES ('delete', old.rowid, old.content, old.heading_path);
                INSERT INTO kb_fts(rowid, content, heading_path)
                VALUES (new.rowid, new.content, new.heading_path);
            END;

            -- Diagnostic Sessions
            CREATE TABLE IF NOT EXISTS diagnostic_sessions (
                id TEXT PRIMARY KEY,
                draft_id TEXT,
                checklist_json TEXT,
                findings_json TEXT,
                decision_tree_id TEXT,
                tree_path_json TEXT,
                escalation_note TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE SET NULL
            );

            -- Decision Trees (built-in + custom)
            CREATE TABLE IF NOT EXISTS decision_trees (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT,
                tree_json TEXT NOT NULL,
                source TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            -- Learning Stats (opt-in)
            CREATE TABLE IF NOT EXISTS learning_checklist_stats (
                item_text_hash TEXT PRIMARY KEY,
                times_shown INTEGER DEFAULT 0,
                times_checked INTEGER DEFAULT 0,
                times_led_to_resolution INTEGER DEFAULT 0,
                avg_time_to_check_ms INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS learning_tree_stats (
                tree_id TEXT NOT NULL,
                node_id TEXT NOT NULL,
                times_visited INTEGER DEFAULT 0,
                times_led_to_resolution INTEGER DEFAULT 0,
                PRIMARY KEY (tree_id, node_id)
            );

            -- Vector search consent (LanceDB)
            CREATE TABLE IF NOT EXISTS vector_consent (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                enabled INTEGER NOT NULL DEFAULT 0,
                consented_at TEXT,
                encryption_supported INTEGER
            );
            INSERT OR IGNORE INTO vector_consent (id, enabled) VALUES (1, 0);

            -- Custom template variables
            CREATE TABLE IF NOT EXISTS custom_variables (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                value TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            "#,
        )?;

        Ok(())
    }


    /// Migration to v2: Add index for drafts.updated_at (FollowUps performance)
    fn migrate_v2(&self) -> Result<(), DbError> {
        self.conn.execute_batch(
            r#"
            -- Add index for faster draft sorting by updated_at (used in FollowUps tab)
            CREATE INDEX IF NOT EXISTS idx_drafts_updated ON drafts(updated_at DESC);
            "#,
        )?;

        Ok(())
    }


    /// Migration to v3: Add model_name column to drafts (track which model generated response)
    fn migrate_v3(&self) -> Result<(), DbError> {
        // Check if model_name column already exists (may exist if created from fresh schema)
        let has_model_name: bool = self
            .conn
            .prepare("PRAGMA table_info(drafts)")?
            .query_map([], |row| {
                let name: String = row.get(1)?;
                Ok(name)
            })?
            .filter_map(|r| r.ok())
            .any(|name| name == "model_name");

        if !has_model_name {
            self.conn.execute_batch(
                r#"
                -- Add model_name column to track which model generated each response
                ALTER TABLE drafts ADD COLUMN model_name TEXT;
                "#,
            )?;
        }

        Ok(())
    }


    /// Migration to v4: Add namespaces, ingest sources, and update kb tables
    fn migrate_v4(&self) -> Result<(), DbError> {
        // Create namespaces table
        self.conn.execute_batch(
            r#"
            -- Namespaces for organizing content
            CREATE TABLE IF NOT EXISTS namespaces (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                color TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            -- Insert default namespace
            INSERT OR IGNORE INTO namespaces (id, name, description, color, created_at, updated_at)
            VALUES ('default', 'Default', 'Default namespace for all content', '#6366f1', datetime('now'), datetime('now'));

            -- Ingest sources (web URLs, YouTube videos, GitHub repos)
            CREATE TABLE IF NOT EXISTS ingest_sources (
                id TEXT PRIMARY KEY,
                source_type TEXT NOT NULL CHECK(source_type IN ('web', 'youtube', 'github', 'file')),
                source_uri TEXT NOT NULL,
                namespace_id TEXT NOT NULL DEFAULT 'default',
                title TEXT,
                etag TEXT,
                last_modified TEXT,
                content_hash TEXT,
                last_ingested_at TEXT,
                status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'stale', 'error', 'removed')),
                error_message TEXT,
                metadata_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (namespace_id) REFERENCES namespaces(id) ON DELETE CASCADE,
                UNIQUE(source_type, source_uri, namespace_id)
            );
            CREATE INDEX IF NOT EXISTS idx_ingest_sources_namespace ON ingest_sources(namespace_id);
            CREATE INDEX IF NOT EXISTS idx_ingest_sources_type ON ingest_sources(source_type);
            CREATE INDEX IF NOT EXISTS idx_ingest_sources_status ON ingest_sources(status);

            -- Ingest runs (track ingest operations)
            CREATE TABLE IF NOT EXISTS ingest_runs (
                id TEXT PRIMARY KEY,
                source_id TEXT NOT NULL,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed', 'cancelled')),
                documents_added INTEGER DEFAULT 0,
                documents_updated INTEGER DEFAULT 0,
                documents_removed INTEGER DEFAULT 0,
                chunks_added INTEGER DEFAULT 0,
                error_message TEXT,
                FOREIGN KEY (source_id) REFERENCES ingest_sources(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_ingest_runs_source ON ingest_runs(source_id);
            CREATE INDEX IF NOT EXISTS idx_ingest_runs_started ON ingest_runs(started_at DESC);

            -- GitHub tokens (encrypted, stored separately for security)
            CREATE TABLE IF NOT EXISTS github_tokens (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                encrypted_token BLOB,
                token_name TEXT,
                created_at TEXT,
                last_used_at TEXT
            );
            INSERT OR IGNORE INTO github_tokens (id) VALUES (1);

            -- Network allowlist for SSRF protection override
            CREATE TABLE IF NOT EXISTS network_allowlist (
                id TEXT PRIMARY KEY,
                host_pattern TEXT NOT NULL UNIQUE,
                reason TEXT,
                created_at TEXT NOT NULL
            );
            "#,
        )?;

        // Check if namespace column already exists in kb_documents
        let has_namespace_col: bool = self
            .conn
            .prepare("PRAGMA table_info(kb_documents)")?
            .query_map([], |row| {
                let name: String = row.get(1)?;
                Ok(name)
            })?
            .filter_map(|r| r.ok())
            .any(|name| name == "namespace_id");

        if !has_namespace_col {
            // Add new columns to kb_documents
            self.conn.execute_batch(
                r#"
                -- Add namespace and source columns to kb_documents
                ALTER TABLE kb_documents ADD COLUMN namespace_id TEXT NOT NULL DEFAULT 'default';
                ALTER TABLE kb_documents ADD COLUMN source_type TEXT NOT NULL DEFAULT 'file';
                ALTER TABLE kb_documents ADD COLUMN source_id TEXT;

                -- Update existing documents to have default namespace
                UPDATE kb_documents SET namespace_id = 'default' WHERE namespace_id = 'default';

                -- Create unique index on (namespace_id, file_path) replacing file_path UNIQUE
                DROP INDEX IF EXISTS idx_kb_docs_path;
                CREATE UNIQUE INDEX idx_kb_docs_namespace_path ON kb_documents(namespace_id, file_path);
                CREATE INDEX idx_kb_docs_source ON kb_documents(source_id);
                "#,
            )?;
        }

        // Check if namespace column already exists in kb_chunks
        let has_chunk_namespace: bool = self
            .conn
            .prepare("PRAGMA table_info(kb_chunks)")?
            .query_map([], |row| {
                let name: String = row.get(1)?;
                Ok(name)
            })?
            .filter_map(|r| r.ok())
            .any(|name| name == "namespace_id");

        if !has_chunk_namespace {
            // Add namespace column to kb_chunks
            self.conn.execute_batch(
                r#"
                -- Add namespace column to kb_chunks for faster filtering
                ALTER TABLE kb_chunks ADD COLUMN namespace_id TEXT NOT NULL DEFAULT 'default';

                -- Update chunks with namespace from their parent documents
                UPDATE kb_chunks SET namespace_id = (
                    SELECT namespace_id FROM kb_documents WHERE kb_documents.id = kb_chunks.document_id
                );

                -- Create index for namespace filtering
                CREATE INDEX IF NOT EXISTS idx_kb_chunks_namespace ON kb_chunks(namespace_id);
                "#,
            )?;
        }

        Ok(())
    }


    /// Migration to v5: Add jobs and job_logs tables for background task management
    fn migrate_v5(&self) -> Result<(), DbError> {
        self.conn.execute_batch(
            r#"
            -- Jobs table for background task management
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                job_type TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                started_at TEXT,
                completed_at TEXT,
                progress REAL DEFAULT 0.0,
                progress_message TEXT,
                error TEXT,
                metadata_json TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
            CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(job_type);

            -- Job logs for detailed progress tracking
            CREATE TABLE IF NOT EXISTS job_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                level TEXT NOT NULL DEFAULT 'info' CHECK(level IN ('debug', 'info', 'warning', 'error')),
                message TEXT NOT NULL,
                FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_job_logs_job ON job_logs(job_id);
            CREATE INDEX IF NOT EXISTS idx_job_logs_timestamp ON job_logs(timestamp DESC);
            "#,
        )?;

        Ok(())
    }


    /// Migration to v6: Document versioning and source trust (Phase 14)
    fn migrate_v6(&self) -> Result<(), DbError> {
        self.conn.execute_batch(
            r#"
            -- Document versions for rollback support
            CREATE TABLE IF NOT EXISTS document_versions (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                version_number INTEGER NOT NULL,
                file_hash TEXT NOT NULL,
                content_snapshot TEXT,
                chunks_json TEXT,
                created_at TEXT NOT NULL,
                change_reason TEXT,
                FOREIGN KEY (document_id) REFERENCES kb_documents(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_doc_versions_doc ON document_versions(document_id);
            CREATE INDEX IF NOT EXISTS idx_doc_versions_num ON document_versions(document_id, version_number DESC);

            -- Source trust and curation metadata
            ALTER TABLE ingest_sources ADD COLUMN trust_score REAL DEFAULT 0.5;
            ALTER TABLE ingest_sources ADD COLUMN is_pinned INTEGER DEFAULT 0;
            ALTER TABLE ingest_sources ADD COLUMN owner TEXT;
            ALTER TABLE ingest_sources ADD COLUMN review_status TEXT DEFAULT 'pending'
                CHECK(review_status IN ('pending', 'approved', 'rejected', 'needs_review'));
            ALTER TABLE ingest_sources ADD COLUMN tags_json TEXT;
            ALTER TABLE ingest_sources ADD COLUMN stale_at TEXT;

            -- Document curation metadata
            ALTER TABLE kb_documents ADD COLUMN review_status TEXT DEFAULT 'auto_approved'
                CHECK(review_status IN ('pending', 'approved', 'rejected', 'auto_approved'));
            ALTER TABLE kb_documents ADD COLUMN is_pinned INTEGER DEFAULT 0;
            ALTER TABLE kb_documents ADD COLUMN tags_json TEXT;
            ALTER TABLE kb_documents ADD COLUMN owner TEXT;

            -- Namespace ingestion rules (allowlist/denylist)
            CREATE TABLE IF NOT EXISTS namespace_rules (
                id TEXT PRIMARY KEY,
                namespace_id TEXT NOT NULL,
                rule_type TEXT NOT NULL CHECK(rule_type IN ('allow', 'deny')),
                pattern_type TEXT NOT NULL CHECK(pattern_type IN ('domain', 'file_pattern', 'url_pattern')),
                pattern TEXT NOT NULL,
                reason TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (namespace_id) REFERENCES namespaces(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_ns_rules_ns ON namespace_rules(namespace_id);
            CREATE INDEX IF NOT EXISTS idx_ns_rules_type ON namespace_rules(rule_type, pattern_type);

            -- Trust score defaults based on source type
            UPDATE ingest_sources SET trust_score = 0.8 WHERE source_type = 'file' AND trust_score = 0.5;
            UPDATE ingest_sources SET trust_score = 0.6 WHERE source_type = 'web' AND trust_score = 0.5;
            UPDATE ingest_sources SET trust_score = 0.5 WHERE source_type = 'youtube' AND trust_score = 0.5;
            "#,
        )?;

        Ok(())
    }


    /// Migration to v7: IT Support workflow enhancements (Phase 17)
    /// - Case intake fields for drafts
    /// - Draft versioning and finalization
    /// - Playbooks for common workflows
    fn migrate_v7(&self) -> Result<(), DbError> {
        self.conn.execute_batch(
            r#"
            -- Add case intake and workflow fields to drafts
            ALTER TABLE drafts ADD COLUMN case_intake_json TEXT;
            ALTER TABLE drafts ADD COLUMN status TEXT DEFAULT 'draft'
                CHECK(status IN ('draft', 'finalized', 'archived'));
            ALTER TABLE drafts ADD COLUMN handoff_summary TEXT;
            ALTER TABLE drafts ADD COLUMN finalized_at TEXT;
            ALTER TABLE drafts ADD COLUMN finalized_by TEXT;

            -- Draft versions for history/diff view
            CREATE TABLE IF NOT EXISTS draft_versions (
                id TEXT PRIMARY KEY,
                draft_id TEXT NOT NULL,
                version_number INTEGER NOT NULL,
                input_text TEXT,
                summary_text TEXT,
                response_text TEXT,
                case_intake_json TEXT,
                kb_sources_json TEXT,
                created_at TEXT NOT NULL,
                change_reason TEXT,
                FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_draft_versions_draft ON draft_versions(draft_id);
            CREATE INDEX IF NOT EXISTS idx_draft_versions_num ON draft_versions(draft_id, version_number DESC);

            -- Playbooks: curated workflows tied to decision trees
            CREATE TABLE IF NOT EXISTS playbooks (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                category TEXT,
                decision_tree_id TEXT,
                steps_json TEXT NOT NULL,
                template_id TEXT,
                shortcuts_json TEXT,
                is_active INTEGER DEFAULT 1,
                usage_count INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (template_id) REFERENCES response_templates(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS idx_playbooks_category ON playbooks(category);
            CREATE INDEX IF NOT EXISTS idx_playbooks_active ON playbooks(is_active);
            CREATE INDEX IF NOT EXISTS idx_playbooks_tree ON playbooks(decision_tree_id);

            -- Action shortcuts: one-click sequences
            CREATE TABLE IF NOT EXISTS action_shortcuts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                shortcut_key TEXT,
                action_type TEXT NOT NULL CHECK(action_type IN ('template', 'clarify', 'request_logs', 'summarize', 'custom')),
                action_data_json TEXT NOT NULL,
                category TEXT,
                sort_order INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_shortcuts_type ON action_shortcuts(action_type);
            CREATE INDEX IF NOT EXISTS idx_shortcuts_active ON action_shortcuts(is_active, sort_order);

            -- Insert default action shortcuts
            INSERT OR IGNORE INTO action_shortcuts (id, name, action_type, action_data_json, category, sort_order, created_at, updated_at)
            VALUES
                ('clarify_default', 'Request Clarification', 'clarify', '{"prompt": "To help resolve this issue, could you please provide:\n\n1. When did this issue first occur?\n2. Have you tried any troubleshooting steps?\n3. Are other users affected?"}', 'intake', 1, datetime('now'), datetime('now')),
                ('request_logs', 'Request Logs', 'request_logs', '{"prompt": "To investigate further, please share:\n\n- Screenshots of any error messages\n- Relevant log files\n- Steps to reproduce the issue"}', 'intake', 2, datetime('now'), datetime('now')),
                ('summarize_steps', 'Summarize Resolution', 'summarize', '{"prompt": "Resolution Summary\n\nIssue: [Brief description]\n\nRoot Cause: [What caused it]\n\nResolution: [Steps taken]\n\nPrevention: [How to avoid in future]"}', 'resolution', 3, datetime('now'), datetime('now'));
            "#,
        )?;

        Ok(())
    }


    /// Migration to v8: Response ratings and analytics events
    fn migrate_v8(&self) -> Result<(), DbError> {
        self.conn.execute_batch(
            r#"
            -- Phase 4: Response ratings
            CREATE TABLE IF NOT EXISTS response_ratings (
                id TEXT PRIMARY KEY,
                draft_id TEXT NOT NULL,
                rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
                feedback_text TEXT,
                feedback_category TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_response_ratings_draft ON response_ratings(draft_id);
            CREATE INDEX IF NOT EXISTS idx_response_ratings_created ON response_ratings(created_at DESC);

            -- Phase 2: Analytics events
            CREATE TABLE IF NOT EXISTS analytics_events (
                id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL,
                event_data_json TEXT,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
            CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at DESC);
            "#,
        )?;

        Ok(())
    }


    /// Migration to v9: Response alternatives, saved response templates, Jira transitions, KB review
    fn migrate_v9(&self) -> Result<(), DbError> {
        self.conn.execute_batch(
            r#"
            -- Response alternatives for side-by-side comparison
            CREATE TABLE IF NOT EXISTS response_alternatives (
                id TEXT PRIMARY KEY,
                draft_id TEXT NOT NULL,
                original_text TEXT NOT NULL,
                alternative_text TEXT NOT NULL,
                sources_json TEXT,
                metrics_json TEXT,
                generation_params_json TEXT,
                chosen TEXT CHECK(chosen IN ('original', 'alternative') OR chosen IS NULL),
                created_at TEXT NOT NULL,
                FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_response_alts_draft ON response_alternatives(draft_id);

            -- Saved response templates from high-rated responses
            CREATE TABLE IF NOT EXISTS saved_response_templates (
                id TEXT PRIMARY KEY,
                source_draft_id TEXT,
                source_rating INTEGER,
                name TEXT NOT NULL,
                category TEXT,
                content TEXT NOT NULL,
                variables_json TEXT,
                use_count INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (source_draft_id) REFERENCES drafts(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS idx_saved_templates_category ON saved_response_templates(category);
            CREATE INDEX IF NOT EXISTS idx_saved_templates_usage ON saved_response_templates(use_count DESC);

            -- Jira status transitions log
            CREATE TABLE IF NOT EXISTS jira_status_transitions (
                id TEXT PRIMARY KEY,
                draft_id TEXT,
                ticket_key TEXT NOT NULL,
                old_status TEXT,
                new_status TEXT NOT NULL,
                comment_id TEXT,
                transitioned_at TEXT NOT NULL,
                FOREIGN KEY (draft_id) REFERENCES drafts(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS idx_jira_transitions_draft ON jira_status_transitions(draft_id);
            CREATE INDEX IF NOT EXISTS idx_jira_transitions_ticket ON jira_status_transitions(ticket_key);
            "#,
        )?;

        // Add review columns to kb_documents if not present
        let has_last_reviewed_at: bool = self
            .conn
            .prepare("PRAGMA table_info(kb_documents)")?
            .query_map([], |row| {
                let name: String = row.get(1)?;
                Ok(name)
            })?
            .filter_map(|r| r.ok())
            .any(|name| name == "last_reviewed_at");

        if !has_last_reviewed_at {
            self.conn.execute_batch(
                r#"
                ALTER TABLE kb_documents ADD COLUMN last_reviewed_at TEXT;
                ALTER TABLE kb_documents ADD COLUMN last_reviewed_by TEXT;
                "#,
            )?;
        }

        Ok(())
    }


    /// Migration to v10: Model state and startup metrics
    fn migrate_v10(&self) -> Result<(), DbError> {
        self.conn.execute_batch(
            r#"
            -- Track which models were last loaded (for auto-load on startup)
            CREATE TABLE IF NOT EXISTS model_state (
                model_type TEXT PRIMARY KEY,
                model_path TEXT NOT NULL,
                model_id TEXT,
                loaded_at TEXT NOT NULL,
                load_time_ms INTEGER
            );

            -- Track startup performance metrics
            CREATE TABLE IF NOT EXISTS startup_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                started_at TEXT NOT NULL,
                ui_ready_at TEXT,
                total_ms INTEGER,
                init_app_ms INTEGER,
                models_cached INTEGER DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            "#,
        )?;
        Ok(())
    }


    /// Migration to v11: Pilot feedback tables
    fn migrate_v11(&self) -> Result<(), DbError> {
        self.conn.execute_batch(
            r#"
            -- Pilot query logs: tracks every query + response during pilot
            CREATE TABLE IF NOT EXISTS pilot_query_logs (
                id TEXT PRIMARY KEY,
                query TEXT NOT NULL,
                response TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'unknown',
                user_id TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_pilot_query_logs_user ON pilot_query_logs(user_id);
            CREATE INDEX IF NOT EXISTS idx_pilot_query_logs_category ON pilot_query_logs(category);
            CREATE INDEX IF NOT EXISTS idx_pilot_query_logs_created ON pilot_query_logs(created_at DESC);

            -- Pilot feedback: user ratings on query responses
            CREATE TABLE IF NOT EXISTS pilot_feedback (
                id TEXT PRIMARY KEY,
                query_log_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                accuracy INTEGER NOT NULL CHECK(accuracy BETWEEN 1 AND 5),
                clarity INTEGER NOT NULL CHECK(clarity BETWEEN 1 AND 5),
                helpfulness INTEGER NOT NULL CHECK(helpfulness BETWEEN 1 AND 5),
                comment TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (query_log_id) REFERENCES pilot_query_logs(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_pilot_feedback_log ON pilot_feedback(query_log_id);
            CREATE INDEX IF NOT EXISTS idx_pilot_feedback_user ON pilot_feedback(user_id);
            CREATE INDEX IF NOT EXISTS idx_pilot_feedback_created ON pilot_feedback(created_at DESC);
            "#,
        )?;
        Ok(())
    }


    /// Migration to v12: Trust/ops feature foundation tables
    fn migrate_v12(&self) -> Result<(), DbError> {
        self.conn.execute_batch(
            r#"
            -- Generation quality events (confidence + grounding)
            CREATE TABLE IF NOT EXISTS generation_quality_events (
                id TEXT PRIMARY KEY,
                query_text TEXT NOT NULL,
                confidence_mode TEXT NOT NULL CHECK(confidence_mode IN ('answer', 'clarify', 'abstain')),
                confidence_score REAL NOT NULL,
                unsupported_claims INTEGER NOT NULL DEFAULT 0,
                total_claims INTEGER NOT NULL DEFAULT 0,
                source_count INTEGER NOT NULL DEFAULT 0,
                avg_source_score REAL NOT NULL DEFAULT 0.0,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_quality_events_created ON generation_quality_events(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_quality_events_mode ON generation_quality_events(confidence_mode);

            -- KB gap detector candidates
            CREATE TABLE IF NOT EXISTS kb_gap_candidates (
                id TEXT PRIMARY KEY,
                query_signature TEXT NOT NULL UNIQUE,
                sample_query TEXT NOT NULL,
                occurrences INTEGER NOT NULL DEFAULT 1,
                low_confidence_count INTEGER NOT NULL DEFAULT 0,
                low_rating_count INTEGER NOT NULL DEFAULT 0,
                unsupported_claim_events INTEGER NOT NULL DEFAULT 0,
                suggested_category TEXT,
                status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'accepted', 'resolved', 'ignored')),
                resolution_note TEXT,
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_kb_gap_status ON kb_gap_candidates(status, last_seen_at DESC);

            -- Deployment polish telemetry
            CREATE TABLE IF NOT EXISTS deployment_artifacts (
                id TEXT PRIMARY KEY,
                artifact_type TEXT NOT NULL,
                version TEXT NOT NULL,
                channel TEXT NOT NULL,
                sha256 TEXT NOT NULL,
                is_signed INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_deploy_artifacts_version ON deployment_artifacts(version DESC);

            CREATE TABLE IF NOT EXISTS deployment_runs (
                id TEXT PRIMARY KEY,
                target_channel TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('started', 'succeeded', 'failed', 'rolled_back')),
                preflight_json TEXT,
                rollback_available INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                completed_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_deploy_runs_created ON deployment_runs(created_at DESC);

            -- Eval harness runs
            CREATE TABLE IF NOT EXISTS eval_runs (
                id TEXT PRIMARY KEY,
                suite_name TEXT NOT NULL,
                total_cases INTEGER NOT NULL,
                passed_cases INTEGER NOT NULL,
                avg_confidence REAL NOT NULL DEFAULT 0.0,
                details_json TEXT,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_eval_runs_created ON eval_runs(created_at DESC);

            -- Triage autopilot output clusters
            CREATE TABLE IF NOT EXISTS triage_clusters (
                id TEXT PRIMARY KEY,
                cluster_key TEXT NOT NULL,
                summary TEXT NOT NULL,
                ticket_count INTEGER NOT NULL,
                tickets_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_triage_clusters_created ON triage_clusters(created_at DESC);

            -- Runbook sessions
            CREATE TABLE IF NOT EXISTS runbook_sessions (
                id TEXT PRIMARY KEY,
                scenario TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('active', 'paused', 'completed')),
                steps_json TEXT NOT NULL,
                current_step INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_runbook_sessions_status ON runbook_sessions(status, updated_at DESC);

            -- Integrations and role/workspace controls
            CREATE TABLE IF NOT EXISTS integration_configs (
                id TEXT PRIMARY KEY,
                integration_type TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 0,
                config_json TEXT,
                updated_at TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_type ON integration_configs(integration_type);

            CREATE TABLE IF NOT EXISTS workspace_roles (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                principal TEXT NOT NULL,
                role_name TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_principal
                ON workspace_roles(workspace_id, principal);
            "#,
        )?;
        Ok(())
    }


    /// Migration to v13: Remove deprecated session token table (was security theater).
    fn migrate_v13(&self) -> Result<(), DbError> {
        self.conn.execute_batch(
            r#"
            DROP TABLE IF EXISTS session_tokens;
            "#,
        )?;
        Ok(())
    }


    /// Migration to v14: Product workspace persistence tables
    fn migrate_v14(&self) -> Result<(), DbError> {
        self.conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS resolution_kits (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                summary TEXT NOT NULL,
                category TEXT NOT NULL,
                response_template TEXT NOT NULL,
                checklist_items_json TEXT NOT NULL,
                kb_document_ids_json TEXT NOT NULL,
                runbook_scenario TEXT,
                approval_hint TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_resolution_kits_category
                ON resolution_kits(category, updated_at DESC);

            CREATE TABLE IF NOT EXISTS workspace_favorites (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL CHECK(kind IN ('runbook', 'policy', 'kb', 'kit')),
                label TEXT NOT NULL,
                resource_id TEXT NOT NULL,
                metadata_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_favorites_unique
                ON workspace_favorites(kind, resource_id);

            CREATE TABLE IF NOT EXISTS runbook_templates (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                scenario TEXT NOT NULL,
                steps_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_runbook_templates_updated
                ON runbook_templates(updated_at DESC);

            CREATE TABLE IF NOT EXISTS runbook_step_evidence (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                step_index INTEGER NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('pending', 'completed', 'skipped', 'failed')),
                evidence_text TEXT NOT NULL,
                skip_reason TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES runbook_sessions(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_runbook_step_evidence_session
                ON runbook_step_evidence(session_id, step_index, created_at DESC);

            CREATE TABLE IF NOT EXISTS dispatch_history (
                id TEXT PRIMARY KEY,
                integration_type TEXT NOT NULL CHECK(integration_type IN ('jira', 'servicenow', 'slack', 'teams')),
                draft_id TEXT,
                title TEXT NOT NULL,
                destination_label TEXT NOT NULL,
                payload_preview TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('previewed', 'sent', 'cancelled', 'failed')),
                metadata_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_dispatch_history_status
                ON dispatch_history(status, updated_at DESC);

            CREATE TABLE IF NOT EXISTS case_outcomes (
                id TEXT PRIMARY KEY,
                draft_id TEXT NOT NULL,
                status TEXT NOT NULL,
                outcome_summary TEXT NOT NULL,
                handoff_pack_json TEXT,
                kb_draft_json TEXT,
                evidence_pack_json TEXT,
                tags_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_case_outcomes_draft
                ON case_outcomes(draft_id, updated_at DESC);
            "#,
        )?;
        Ok(())
    }


    /// Migration to v15: scope guided runbook sessions to the active workspace.
    fn migrate_v15(&self) -> Result<(), DbError> {
        self.conn.execute_batch(
            r#"
            ALTER TABLE runbook_sessions ADD COLUMN scope_key TEXT NOT NULL DEFAULT 'legacy:unscoped';
            CREATE INDEX IF NOT EXISTS idx_runbook_sessions_scope_status
                ON runbook_sessions(scope_key, status, updated_at DESC);
            "#,
        )?;
        Ok(())
    }

}
