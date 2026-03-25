//! Knowledge base, ingest, namespace, and chunk persistence.

use super::*;

impl Database {

    /// FTS5 search for KB chunks
    pub fn fts_search(&self, query: &str, limit: usize) -> Result<Vec<FtsSearchResult>, DbError> {
        let mut stmt = self.conn.prepare(
            r#"
            SELECT
                kb_chunks.id,
                kb_chunks.document_id,
                kb_chunks.heading_path,
                snippet(kb_fts, 0, '<mark>', '</mark>', '...', 32) as snippet,
                bm25(kb_fts) as rank
            FROM kb_fts
            JOIN kb_chunks ON kb_fts.rowid = kb_chunks.rowid
            WHERE kb_fts MATCH ?
            ORDER BY rank
            LIMIT ?
            "#,
        )?;

        let results = stmt
            .query_map(params![query, limit as i64], |row| {
                Ok(FtsSearchResult {
                    chunk_id: row.get(0)?,
                    document_id: row.get(1)?,
                    heading_path: row.get(2)?,
                    snippet: row.get(3)?,
                    rank: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(results)
    }


    /// Get all chunk records needed for embedding generation.
    pub fn get_all_chunks_for_embedding(&self) -> Result<Vec<ChunkEmbeddingRecord>, DbError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, content, document_id, namespace_id
             FROM kb_chunks
             ORDER BY document_id, chunk_index",
        )?;

        let chunks = stmt
            .query_map([], |row| {
                Ok(ChunkEmbeddingRecord {
                    chunk_id: row.get::<_, String>(0)?,
                    content: row.get::<_, String>(1)?,
                    document_id: row.get::<_, String>(2)?,
                    namespace_id: row.get::<_, String>(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(chunks)
    }


    /// Look up a KB document ID by file path.
    pub fn get_document_id_by_path(&self, file_path: &str) -> Result<Option<String>, DbError> {
        match self.conn.query_row(
            "SELECT id FROM kb_documents WHERE file_path = ?",
            [file_path],
            |row| row.get(0),
        ) {
            Ok(id) => Ok(Some(id)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(DbError::Sqlite(e)),
        }
    }


    /// Get chunk content by ID
    pub fn get_chunk_content(&self, chunk_id: &str) -> Result<String, DbError> {
        self.conn
            .query_row(
                "SELECT content FROM kb_chunks WHERE id = ?",
                [chunk_id],
                |row| row.get(0),
            )
            .map_err(DbError::Sqlite)
    }


    // ============================================================================
    // Namespace Methods
    // ============================================================================

    /// List all namespaces
    pub fn list_namespaces(&self) -> Result<Vec<Namespace>, DbError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, description, color, created_at, updated_at
             FROM namespaces ORDER BY name",
        )?;

        let namespaces = stmt
            .query_map([], |row| {
                Ok(Namespace {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    color: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(namespaces)
    }


    /// List all namespaces with document and source counts (optimized single query)
    pub fn list_namespaces_with_counts(&self) -> Result<Vec<NamespaceWithCounts>, DbError> {
        let mut stmt = self.conn.prepare(
            "SELECT
                n.id, n.name, n.description, n.color, n.created_at, n.updated_at,
                COALESCE(d.doc_count, 0) as document_count,
                COALESCE(s.source_count, 0) as source_count
             FROM namespaces n
             LEFT JOIN (
                 SELECT namespace_id, COUNT(*) as doc_count
                 FROM kb_documents
                 GROUP BY namespace_id
             ) d ON d.namespace_id = n.id
             LEFT JOIN (
                 SELECT namespace_id, COUNT(*) as source_count
                 FROM ingest_sources
                 GROUP BY namespace_id
             ) s ON s.namespace_id = n.id
             ORDER BY n.name",
        )?;

        let namespaces = stmt
            .query_map([], |row| {
                Ok(NamespaceWithCounts {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    color: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                    document_count: row.get(6)?,
                    source_count: row.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(namespaces)
    }


    /// Get a namespace by ID
    pub fn get_namespace(&self, namespace_id: &str) -> Result<Namespace, DbError> {
        self.conn
            .query_row(
                "SELECT id, name, description, color, created_at, updated_at
             FROM namespaces WHERE id = ?",
                [namespace_id],
                |row| {
                    Ok(Namespace {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        description: row.get(2)?,
                        color: row.get(3)?,
                        created_at: row.get(4)?,
                        updated_at: row.get(5)?,
                    })
                },
            )
            .map_err(DbError::Sqlite)
    }


    /// Create or update a namespace
    pub fn save_namespace(&self, namespace: &Namespace) -> Result<(), DbError> {
        self.conn.execute(
            "INSERT INTO namespaces (id, name, description, color, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                color = excluded.color,
                updated_at = excluded.updated_at",
            params![
                namespace.id,
                namespace.name,
                namespace.description,
                namespace.color,
                namespace.created_at,
                namespace.updated_at,
            ],
        )?;
        Ok(())
    }


    /// Delete a namespace (and all its content)
    pub fn delete_namespace(&self, namespace_id: &str) -> Result<(), DbError> {
        if namespace_id == "default" {
            return Err(DbError::Migration("Cannot delete default namespace".into()));
        }
        // Cascade delete: documents -> chunks are handled by ON DELETE CASCADE
        // Delete documents first
        self.conn.execute(
            "DELETE FROM kb_documents WHERE namespace_id = ?",
            [namespace_id],
        )?;
        // Delete ingest sources
        self.conn.execute(
            "DELETE FROM ingest_sources WHERE namespace_id = ?",
            [namespace_id],
        )?;
        // Delete namespace
        self.conn
            .execute("DELETE FROM namespaces WHERE id = ?", [namespace_id])?;
        Ok(())
    }


    /// Create a new namespace with name, description, and color
    ///
    /// The namespace ID is normalized using the centralized validation rules:
    /// - Converted to lowercase
    /// - Spaces and underscores become hyphens
    /// - Special characters removed
    /// - Multiple hyphens collapsed
    /// - Max length 64 characters
    pub fn create_namespace(
        &self,
        name: &str,
        description: Option<&str>,
        color: Option<&str>,
    ) -> Result<Namespace, DbError> {
        let now = chrono::Utc::now().to_rfc3339();
        // Use centralized normalization for consistency
        let id = normalize_and_validate_namespace_id(name)?;

        let namespace = Namespace {
            id: id.clone(),
            name: name.to_string(),
            description: description.map(|s| s.to_string()),
            color: color.map(|s| s.to_string()),
            created_at: now.clone(),
            updated_at: now,
        };

        self.save_namespace(&namespace)?;
        Ok(namespace)
    }


    /// Ensure a namespace exists, creating it if necessary
    pub fn ensure_namespace_exists(&self, namespace_id: &str) -> Result<(), DbError> {
        // Check if exists
        let exists: bool = self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM namespaces WHERE id = ?)",
            [namespace_id],
            |row| row.get(0),
        )?;

        if !exists {
            let now = chrono::Utc::now().to_rfc3339();
            self.conn.execute(
                "INSERT INTO namespaces (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
                params![namespace_id, namespace_id, now, now],
            )?;
        }

        Ok(())
    }


    /// Rename a namespace (updates all references)
    ///
    /// Uses centralized namespace ID normalization for consistency.
    pub fn rename_namespace(&self, old_id: &str, new_id: &str) -> Result<(), DbError> {
        if old_id == "default" {
            return Err(DbError::Migration("Cannot rename default namespace".into()));
        }

        let now = chrono::Utc::now().to_rfc3339();
        // Use centralized normalization for consistency
        let new_id_normalized = normalize_and_validate_namespace_id(new_id)?;

        // Update namespace
        self.conn.execute(
            "UPDATE namespaces SET id = ?, name = ?, updated_at = ? WHERE id = ?",
            params![new_id_normalized, new_id, now, old_id],
        )?;

        // Update references in documents
        self.conn.execute(
            "UPDATE kb_documents SET namespace_id = ? WHERE namespace_id = ?",
            params![new_id_normalized, old_id],
        )?;

        // Update references in chunks
        self.conn.execute(
            "UPDATE kb_chunks SET namespace_id = ? WHERE namespace_id = ?",
            params![new_id_normalized, old_id],
        )?;

        // Update references in ingest sources
        self.conn.execute(
            "UPDATE ingest_sources SET namespace_id = ? WHERE namespace_id = ?",
            params![new_id_normalized, old_id],
        )?;

        Ok(())
    }


    /// Migrate existing namespace IDs to the canonical normalized form
    ///
    /// This function scans all namespaces and normalizes their IDs using
    /// the centralized validation rules. It updates all references (documents,
    /// chunks, ingest sources) to use the new canonical ID.
    ///
    /// Returns a list of (old_id, new_id) pairs for namespaces that were migrated.
    pub fn migrate_namespace_ids(&self) -> Result<Vec<(String, String)>, DbError> {
        use crate::validation::normalize_namespace_id;

        let mut migrated = Vec::new();

        // Get all namespaces
        let mut stmt = self.conn.prepare("SELECT id, name FROM namespaces")?;
        let namespaces: Vec<(String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .filter_map(|r| r.ok())
            .collect();

        for (old_id, name) in namespaces {
            // Compute canonical ID
            let canonical_id = normalize_namespace_id(&name);

            // Skip if already canonical
            if old_id == canonical_id {
                continue;
            }

            // Skip if canonical is empty (shouldn't happen, but be safe)
            if canonical_id.is_empty() {
                tracing::warn!("Skipping namespace '{}' - normalized ID is empty", old_id);
                continue;
            }

            // Check if canonical ID already exists (collision)
            let exists: bool = self.conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM namespaces WHERE id = ?)",
                [&canonical_id],
                |row| row.get(0),
            )?;

            if exists && old_id != canonical_id {
                tracing::warn!(
                    "Skipping namespace '{}' - canonical ID '{}' already exists",
                    old_id,
                    canonical_id
                );
                continue;
            }

            let now = chrono::Utc::now().to_rfc3339();

            // Update namespace ID
            self.conn.execute(
                "UPDATE namespaces SET id = ?, updated_at = ? WHERE id = ?",
                params![canonical_id, now, old_id],
            )?;

            // Update references in documents
            self.conn.execute(
                "UPDATE kb_documents SET namespace_id = ? WHERE namespace_id = ?",
                params![canonical_id, old_id],
            )?;

            // Update references in chunks
            self.conn.execute(
                "UPDATE kb_chunks SET namespace_id = ? WHERE namespace_id = ?",
                params![canonical_id, old_id],
            )?;

            // Update references in ingest sources
            self.conn.execute(
                "UPDATE ingest_sources SET namespace_id = ? WHERE namespace_id = ?",
                params![canonical_id, old_id],
            )?;

            tracing::info!("Migrated namespace ID '{}' -> '{}'", old_id, canonical_id);
            migrated.push((old_id, canonical_id));
        }

        Ok(migrated)
    }


    // ============================================================================
    // Ingest Source Methods
    // ============================================================================

    /// List ingest sources, optionally filtered by namespace
    pub fn list_ingest_sources(
        &self,
        namespace_id: Option<&str>,
    ) -> Result<Vec<IngestSource>, DbError> {
        let map_row = |row: &rusqlite::Row| -> rusqlite::Result<IngestSource> {
            Ok(IngestSource {
                id: row.get(0)?,
                source_type: row.get(1)?,
                source_uri: row.get(2)?,
                namespace_id: row.get(3)?,
                title: row.get(4)?,
                etag: row.get(5)?,
                last_modified: row.get(6)?,
                content_hash: row.get(7)?,
                last_ingested_at: row.get(8)?,
                status: row.get(9)?,
                error_message: row.get(10)?,
                metadata_json: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        };

        let sources: Vec<IngestSource> = match namespace_id {
            Some(ns) => {
                let mut stmt = self.conn.prepare(
                    "SELECT id, source_type, source_uri, namespace_id, title, etag, last_modified,
                            content_hash, last_ingested_at, status, error_message, metadata_json,
                            created_at, updated_at
                     FROM ingest_sources WHERE namespace_id = ? ORDER BY created_at DESC",
                )?;
                let result: Vec<IngestSource> = stmt
                    .query_map([ns], map_row)?
                    .collect::<Result<Vec<_>, _>>()?;
                result
            }
            None => {
                let mut stmt = self.conn.prepare(
                    "SELECT id, source_type, source_uri, namespace_id, title, etag, last_modified,
                            content_hash, last_ingested_at, status, error_message, metadata_json,
                            created_at, updated_at
                     FROM ingest_sources ORDER BY created_at DESC",
                )?;
                let result: Vec<IngestSource> = stmt
                    .query_map([], map_row)?
                    .collect::<Result<Vec<_>, _>>()?;
                result
            }
        };

        Ok(sources)
    }


    /// Get an ingest source by ID
    pub fn get_ingest_source(&self, source_id: &str) -> Result<IngestSource, DbError> {
        self.conn
            .query_row(
                "SELECT id, source_type, source_uri, namespace_id, title, etag, last_modified,
                    content_hash, last_ingested_at, status, error_message, metadata_json,
                    created_at, updated_at
             FROM ingest_sources WHERE id = ?",
                [source_id],
                |row| {
                    Ok(IngestSource {
                        id: row.get(0)?,
                        source_type: row.get(1)?,
                        source_uri: row.get(2)?,
                        namespace_id: row.get(3)?,
                        title: row.get(4)?,
                        etag: row.get(5)?,
                        last_modified: row.get(6)?,
                        content_hash: row.get(7)?,
                        last_ingested_at: row.get(8)?,
                        status: row.get(9)?,
                        error_message: row.get(10)?,
                        metadata_json: row.get(11)?,
                        created_at: row.get(12)?,
                        updated_at: row.get(13)?,
                    })
                },
            )
            .map_err(DbError::Sqlite)
    }


    /// Find an ingest source by URI and namespace
    pub fn find_ingest_source(
        &self,
        source_type: &str,
        source_uri: &str,
        namespace_id: &str,
    ) -> Result<Option<IngestSource>, DbError> {
        match self.conn.query_row(
            "SELECT id, source_type, source_uri, namespace_id, title, etag, last_modified,
                    content_hash, last_ingested_at, status, error_message, metadata_json,
                    created_at, updated_at
             FROM ingest_sources WHERE source_type = ? AND source_uri = ? AND namespace_id = ?",
            params![source_type, source_uri, namespace_id],
            |row| {
                Ok(IngestSource {
                    id: row.get(0)?,
                    source_type: row.get(1)?,
                    source_uri: row.get(2)?,
                    namespace_id: row.get(3)?,
                    title: row.get(4)?,
                    etag: row.get(5)?,
                    last_modified: row.get(6)?,
                    content_hash: row.get(7)?,
                    last_ingested_at: row.get(8)?,
                    status: row.get(9)?,
                    error_message: row.get(10)?,
                    metadata_json: row.get(11)?,
                    created_at: row.get(12)?,
                    updated_at: row.get(13)?,
                })
            },
        ) {
            Ok(source) => Ok(Some(source)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(DbError::Sqlite(e)),
        }
    }


    /// Save an ingest source
    pub fn save_ingest_source(&self, source: &IngestSource) -> Result<(), DbError> {
        self.conn.execute(
            "INSERT INTO ingest_sources (id, source_type, source_uri, namespace_id, title, etag,
                    last_modified, content_hash, last_ingested_at, status, error_message,
                    metadata_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                etag = excluded.etag,
                last_modified = excluded.last_modified,
                content_hash = excluded.content_hash,
                last_ingested_at = excluded.last_ingested_at,
                status = excluded.status,
                error_message = excluded.error_message,
                metadata_json = excluded.metadata_json,
                updated_at = excluded.updated_at",
            params![
                source.id,
                source.source_type,
                source.source_uri,
                source.namespace_id,
                source.title,
                source.etag,
                source.last_modified,
                source.content_hash,
                source.last_ingested_at,
                source.status,
                source.error_message,
                source.metadata_json,
                source.created_at,
                source.updated_at,
            ],
        )?;
        Ok(())
    }


    /// Delete an ingest source
    pub fn delete_ingest_source(&self, source_id: &str) -> Result<(), DbError> {
        self.conn
            .execute("DELETE FROM ingest_sources WHERE id = ?", [source_id])?;
        Ok(())
    }


    /// Update ingest source status
    pub fn update_ingest_source_status(
        &self,
        source_id: &str,
        status: &str,
        error_message: Option<&str>,
    ) -> Result<(), DbError> {
        let now = chrono::Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE ingest_sources SET status = ?, error_message = ?, updated_at = ? WHERE id = ?",
            params![status, error_message, now, source_id],
        )?;
        Ok(())
    }


    // ============================================================================
    // Ingest Run Methods
    // ============================================================================

    /// Create an ingest run
    pub fn create_ingest_run(&self, source_id: &str) -> Result<String, DbError> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO ingest_runs (id, source_id, started_at, status)
             VALUES (?, ?, ?, 'running')",
            params![id, source_id, now],
        )?;
        Ok(id)
    }


    /// Complete an ingest run
    pub fn complete_ingest_run(&self, completion: IngestRunCompletion<'_>) -> Result<(), DbError> {
        let now = chrono::Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE ingest_runs SET completed_at = ?, status = ?, documents_added = ?,
                    documents_updated = ?, documents_removed = ?, chunks_added = ?, error_message = ?
             WHERE id = ?",
            params![now, completion.status, completion.docs_added, completion.docs_updated, completion.docs_removed, completion.chunks_added, completion.error_message, completion.run_id],
        )?;
        Ok(())
    }


    /// Get recent ingest runs for a source
    pub fn get_ingest_runs(
        &self,
        source_id: &str,
        limit: usize,
    ) -> Result<Vec<IngestRun>, DbError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, source_id, started_at, completed_at, status, documents_added,
                    documents_updated, documents_removed, chunks_added, error_message
             FROM ingest_runs WHERE source_id = ? ORDER BY started_at DESC LIMIT ?",
        )?;

        let runs = stmt
            .query_map(params![source_id, limit as i64], |row| {
                Ok(IngestRun {
                    id: row.get(0)?,
                    source_id: row.get(1)?,
                    started_at: row.get(2)?,
                    completed_at: row.get(3)?,
                    status: row.get(4)?,
                    documents_added: row.get(5)?,
                    documents_updated: row.get(6)?,
                    documents_removed: row.get(7)?,
                    chunks_added: row.get(8)?,
                    error_message: row.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(runs)
    }


    // ============================================================================
    // FTS Search with Namespace Support
    // ============================================================================

    /// FTS5 search for KB chunks with namespace filtering
    pub fn fts_search_in_namespace(
        &self,
        query: &str,
        namespace_id: Option<&str>,
        limit: usize,
    ) -> Result<Vec<FtsSearchResult>, DbError> {
        let map_row = |row: &rusqlite::Row| -> rusqlite::Result<FtsSearchResult> {
            Ok(FtsSearchResult {
                chunk_id: row.get(0)?,
                document_id: row.get(1)?,
                heading_path: row.get(2)?,
                snippet: row.get(3)?,
                rank: row.get(4)?,
            })
        };

        let results: Vec<FtsSearchResult> = match namespace_id {
            Some(ns) => {
                let mut stmt = self.conn.prepare(
                    r#"
                    SELECT
                        kb_chunks.id,
                        kb_chunks.document_id,
                        kb_chunks.heading_path,
                        snippet(kb_fts, 0, '<mark>', '</mark>', '...', 32) as snippet,
                        bm25(kb_fts) as rank
                    FROM kb_fts
                    JOIN kb_chunks ON kb_fts.rowid = kb_chunks.rowid
                    WHERE kb_fts MATCH ?1 AND kb_chunks.namespace_id = ?2
                    ORDER BY rank
                    LIMIT ?3
                    "#,
                )?;
                let result: Vec<FtsSearchResult> = stmt
                    .query_map(params![query, ns, limit as i64], map_row)?
                    .collect::<Result<Vec<_>, _>>()?;
                result
            }
            None => {
                let mut stmt = self.conn.prepare(
                    r#"
                    SELECT
                        kb_chunks.id,
                        kb_chunks.document_id,
                        kb_chunks.heading_path,
                        snippet(kb_fts, 0, '<mark>', '</mark>', '...', 32) as snippet,
                        bm25(kb_fts) as rank
                    FROM kb_fts
                    JOIN kb_chunks ON kb_fts.rowid = kb_chunks.rowid
                    WHERE kb_fts MATCH ?1
                    ORDER BY rank
                    LIMIT ?2
                    "#,
                )?;
                let result: Vec<FtsSearchResult> = stmt
                    .query_map(params![query, limit as i64], map_row)?
                    .collect::<Result<Vec<_>, _>>()?;
                result
            }
        };

        Ok(results)
    }


    // ============================================================================
    // Network Allowlist Methods (SSRF Protection Override)
    // ============================================================================

    /// Check if a host is in the allowlist
    pub fn is_host_allowed(&self, host: &str) -> Result<bool, DbError> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM network_allowlist WHERE ? GLOB host_pattern OR ? = host_pattern",
            params![host, host],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }


    /// Add a host to the allowlist
    pub fn add_to_allowlist(&self, host_pattern: &str, reason: &str) -> Result<(), DbError> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT OR REPLACE INTO network_allowlist (id, host_pattern, reason, created_at)
             VALUES (?, ?, ?, ?)",
            params![id, host_pattern, reason, now],
        )?;
        Ok(())
    }


    /// Remove a host from the allowlist
    pub fn remove_from_allowlist(&self, host_pattern: &str) -> Result<(), DbError> {
        self.conn.execute(
            "DELETE FROM network_allowlist WHERE host_pattern = ?",
            [host_pattern],
        )?;
        Ok(())
    }


    /// List all allowlist entries
    pub fn list_allowlist(&self) -> Result<Vec<AllowlistEntry>, DbError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, host_pattern, reason, created_at FROM network_allowlist ORDER BY created_at"
        )?;

        let entries = stmt
            .query_map([], |row| {
                Ok(AllowlistEntry {
                    id: row.get(0)?,
                    host_pattern: row.get(1)?,
                    reason: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(entries)
    }


    // ============================================================================
    // Document Versioning Methods (Phase 14)
    // ============================================================================

    /// Create a version snapshot of a document before updating it
    pub fn create_document_version(
        &self,
        document_id: &str,
        change_reason: Option<&str>,
    ) -> Result<String, DbError> {
        // Get current document state
        let (file_hash,): (String,) = self.conn.query_row(
            "SELECT file_hash FROM kb_documents WHERE id = ?",
            [document_id],
            |row| Ok((row.get(0)?,)),
        )?;

        // Get current chunks as JSON
        let mut stmt = self.conn.prepare(
            "SELECT id, chunk_index, heading_path, content, word_count
             FROM kb_chunks WHERE document_id = ? ORDER BY chunk_index",
        )?;

        let chunks: Vec<serde_json::Value> = stmt
            .query_map([document_id], |row| {
                Ok(serde_json::json!({
                    "id": row.get::<_, String>(0)?,
                    "chunk_index": row.get::<_, i32>(1)?,
                    "heading_path": row.get::<_, Option<String>>(2)?,
                    "content": row.get::<_, String>(3)?,
                    "word_count": row.get::<_, Option<i32>>(4)?,
                }))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        let chunks_json = serde_json::to_string(&chunks)
            .map_err(|e| DbError::Sqlite(rusqlite::Error::InvalidParameterName(e.to_string())))?;

        // Get next version number
        let version_number: i32 = self.conn
            .query_row(
                "SELECT COALESCE(MAX(version_number), 0) + 1 FROM document_versions WHERE document_id = ?",
                [document_id],
                |row| row.get(0),
            )
            .unwrap_or(1);

        // Insert version
        let version_id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        self.conn.execute(
            "INSERT INTO document_versions (id, document_id, version_number, file_hash, chunks_json, created_at, change_reason)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![version_id, document_id, version_number, file_hash, chunks_json, now, change_reason],
        )?;

        Ok(version_id)
    }


    /// List versions of a document
    pub fn list_document_versions(
        &self,
        document_id: &str,
    ) -> Result<Vec<DocumentVersion>, DbError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, document_id, version_number, file_hash, created_at, change_reason
             FROM document_versions WHERE document_id = ? ORDER BY version_number DESC",
        )?;

        let versions = stmt
            .query_map([document_id], |row| {
                Ok(DocumentVersion {
                    id: row.get(0)?,
                    document_id: row.get(1)?,
                    version_number: row.get(2)?,
                    file_hash: row.get(3)?,
                    created_at: row.get(4)?,
                    change_reason: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(versions)
    }


    /// Rollback a document to a previous version
    pub fn rollback_document(&self, document_id: &str, version_id: &str) -> Result<(), DbError> {
        // Get the version
        let (chunks_json, file_hash, _version_number): (String, String, i32) = self.conn.query_row(
            "SELECT chunks_json, file_hash, version_number FROM document_versions WHERE id = ? AND document_id = ?",
            params![version_id, document_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;

        // Create a new version of current state before rollback
        let _ = self.create_document_version(document_id, Some("Pre-rollback snapshot"));

        // Delete current chunks
        self.conn
            .execute("DELETE FROM kb_chunks WHERE document_id = ?", [document_id])?;

        // Parse and restore chunks
        let chunks: Vec<serde_json::Value> = serde_json::from_str(&chunks_json)
            .map_err(|e| DbError::Sqlite(rusqlite::Error::InvalidParameterName(e.to_string())))?;

        let namespace_id: String = self.conn.query_row(
            "SELECT namespace_id FROM kb_documents WHERE id = ?",
            [document_id],
            |row| row.get(0),
        )?;

        for chunk in chunks {
            let chunk_id = uuid::Uuid::new_v4().to_string();
            self.conn.execute(
                "INSERT INTO kb_chunks (id, document_id, chunk_index, heading_path, content, word_count, namespace_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
                params![
                    chunk_id,
                    document_id,
                    chunk["chunk_index"].as_i64().unwrap_or(0) as i32,
                    chunk["heading_path"].as_str(),
                    chunk["content"].as_str().unwrap_or(""),
                    chunk["word_count"].as_i64().map(|v| v as i32),
                    namespace_id,
                ],
            )?;
        }

        // Update document hash
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE kb_documents SET file_hash = ?, indexed_at = ? WHERE id = ?",
            params![file_hash, now, document_id],
        )?;

        Ok(())
    }


    // ============================================================================
    // Source Trust and Curation Methods (Phase 14)
    // ============================================================================

    /// Update trust score for a source
    pub fn update_source_trust(&self, source_id: &str, trust_score: f64) -> Result<(), DbError> {
        let score = trust_score.clamp(0.0, 1.0);
        self.conn.execute(
            "UPDATE ingest_sources SET trust_score = ? WHERE id = ?",
            params![score, source_id],
        )?;
        Ok(())
    }


    /// Pin/unpin a source (boosts search results)
    pub fn set_source_pinned(&self, source_id: &str, pinned: bool) -> Result<(), DbError> {
        self.conn.execute(
            "UPDATE ingest_sources SET is_pinned = ? WHERE id = ?",
            params![pinned as i32, source_id],
        )?;
        Ok(())
    }


    /// Update review status for a source
    pub fn set_source_review_status(&self, source_id: &str, status: &str) -> Result<(), DbError> {
        self.conn.execute(
            "UPDATE ingest_sources SET review_status = ? WHERE id = ?",
            params![status, source_id],
        )?;
        Ok(())
    }


    /// Mark sources as stale based on threshold
    pub fn mark_stale_sources(&self, days_threshold: i64) -> Result<usize, DbError> {
        let now = Utc::now();
        let cutoff = (now - chrono::Duration::days(days_threshold)).to_rfc3339();
        let stale_at = now.to_rfc3339();

        let count = self.conn.execute(
            "UPDATE ingest_sources SET status = 'stale', stale_at = ?
             WHERE status = 'active'
             AND last_ingested_at IS NOT NULL
             AND last_ingested_at < ?",
            params![stale_at, cutoff],
        )?;

        Ok(count)
    }


    /// Get stale sources for review
    pub fn get_stale_sources(
        &self,
        namespace_id: Option<&str>,
    ) -> Result<Vec<IngestSource>, DbError> {
        let map_row = |row: &rusqlite::Row| -> rusqlite::Result<IngestSource> {
            Ok(IngestSource {
                id: row.get(0)?,
                source_type: row.get(1)?,
                source_uri: row.get(2)?,
                namespace_id: row.get(3)?,
                title: row.get(4)?,
                etag: row.get(5)?,
                last_modified: row.get(6)?,
                content_hash: row.get(7)?,
                last_ingested_at: row.get(8)?,
                status: row.get(9)?,
                error_message: row.get(10)?,
                metadata_json: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        };

        let sources: Vec<IngestSource> = match namespace_id {
            Some(ns) => {
                let mut stmt = self.conn.prepare(
                    "SELECT id, source_type, source_uri, namespace_id, title, etag, last_modified,
                            content_hash, last_ingested_at, status, error_message, metadata_json, created_at, updated_at
                     FROM ingest_sources WHERE status = 'stale' AND namespace_id = ? ORDER BY stale_at"
                )?;
                let result: Vec<IngestSource> = stmt
                    .query_map([ns], map_row)?
                    .collect::<Result<Vec<_>, _>>()?;
                result
            }
            None => {
                let mut stmt = self.conn.prepare(
                    "SELECT id, source_type, source_uri, namespace_id, title, etag, last_modified,
                            content_hash, last_ingested_at, status, error_message, metadata_json, created_at, updated_at
                     FROM ingest_sources WHERE status = 'stale' ORDER BY stale_at"
                )?;
                let result: Vec<IngestSource> = stmt
                    .query_map([], map_row)?
                    .collect::<Result<Vec<_>, _>>()?;
                result
            }
        };

        Ok(sources)
    }


    // ============================================================================
    // Namespace Rules Methods (Phase 14)
    // ============================================================================

    /// Add a namespace ingestion rule
    pub fn add_namespace_rule(
        &self,
        namespace_id: &str,
        rule_type: &str,
        pattern_type: &str,
        pattern: &str,
        reason: Option<&str>,
    ) -> Result<String, DbError> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        self.conn.execute(
            "INSERT INTO namespace_rules (id, namespace_id, rule_type, pattern_type, pattern, reason, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![id, namespace_id, rule_type, pattern_type, pattern, reason, now],
        )?;

        Ok(id)
    }


    /// Delete a namespace rule
    pub fn delete_namespace_rule(&self, rule_id: &str) -> Result<(), DbError> {
        self.conn
            .execute("DELETE FROM namespace_rules WHERE id = ?", [rule_id])?;
        Ok(())
    }


    /// List rules for a namespace
    pub fn list_namespace_rules(&self, namespace_id: &str) -> Result<Vec<NamespaceRule>, DbError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, namespace_id, rule_type, pattern_type, pattern, reason, created_at
             FROM namespace_rules WHERE namespace_id = ? ORDER BY created_at",
        )?;

        let rules = stmt
            .query_map([namespace_id], |row| {
                Ok(NamespaceRule {
                    id: row.get(0)?,
                    namespace_id: row.get(1)?,
                    rule_type: row.get(2)?,
                    pattern_type: row.get(3)?,
                    pattern: row.get(4)?,
                    reason: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(rules)
    }


    /// Check if a URL/path is allowed by namespace rules
    pub fn check_namespace_rules(
        &self,
        namespace_id: &str,
        url_or_path: &str,
    ) -> Result<bool, DbError> {
        let rules = self.list_namespace_rules(namespace_id)?;

        for rule in rules {
            let matches = match rule.pattern_type.as_str() {
                "domain" => {
                    if let Ok(parsed) = url::Url::parse(url_or_path) {
                        parsed
                            .host_str()
                            .map(|h| h.contains(&rule.pattern))
                            .unwrap_or(false)
                    } else {
                        false
                    }
                }
                "file_pattern" | "url_pattern" => {
                    // Simple glob-like pattern matching
                    let pattern = rule.pattern.replace("*", "");
                    url_or_path.contains(&pattern)
                }
                _ => false,
            };

            if matches {
                return Ok(rule.rule_type == "allow");
            }
        }

        // No matching rule = allowed by default
        Ok(true)
    }


    // ============================================================================
    // KB Document Methods with Namespace Support
    // ============================================================================

    /// Get documents, optionally filtered by namespace and/or source
    pub fn list_kb_documents(
        &self,
        namespace_id: Option<&str>,
        source_id: Option<&str>,
    ) -> Result<Vec<KbDocument>, DbError> {
        let map_row = |row: &rusqlite::Row| -> rusqlite::Result<KbDocument> {
            Ok(KbDocument {
                id: row.get(0)?,
                file_path: row.get(1)?,
                file_hash: row.get(2)?,
                title: row.get(3)?,
                indexed_at: row.get(4)?,
                chunk_count: row.get(5)?,
                ocr_quality: row.get(6)?,
                partial_index: row.get::<_, Option<i32>>(7)?.map(|v| v != 0),
                namespace_id: row.get(8)?,
                source_type: row.get(9)?,
                source_id: row.get(10)?,
            })
        };

        let docs: Vec<KbDocument> = match (namespace_id, source_id) {
            (Some(ns), Some(src)) => {
                let mut stmt = self.conn.prepare(
                    "SELECT id, file_path, file_hash, title, indexed_at, chunk_count, ocr_quality,
                            partial_index, namespace_id, source_type, source_id
                     FROM kb_documents WHERE namespace_id = ? AND source_id = ? ORDER BY indexed_at DESC"
                )?;
                let result: Vec<KbDocument> = stmt
                    .query_map(params![ns, src], map_row)?
                    .collect::<Result<Vec<_>, _>>()?;
                result
            }
            (Some(ns), None) => {
                let mut stmt = self.conn.prepare(
                    "SELECT id, file_path, file_hash, title, indexed_at, chunk_count, ocr_quality,
                            partial_index, namespace_id, source_type, source_id
                     FROM kb_documents WHERE namespace_id = ? ORDER BY indexed_at DESC",
                )?;
                let result: Vec<KbDocument> = stmt
                    .query_map(params![ns], map_row)?
                    .collect::<Result<Vec<_>, _>>()?;
                result
            }
            (None, Some(src)) => {
                let mut stmt = self.conn.prepare(
                    "SELECT id, file_path, file_hash, title, indexed_at, chunk_count, ocr_quality,
                            partial_index, namespace_id, source_type, source_id
                     FROM kb_documents WHERE source_id = ? ORDER BY indexed_at DESC",
                )?;
                let result: Vec<KbDocument> = stmt
                    .query_map(params![src], map_row)?
                    .collect::<Result<Vec<_>, _>>()?;
                result
            }
            (None, None) => {
                let mut stmt = self.conn.prepare(
                    "SELECT id, file_path, file_hash, title, indexed_at, chunk_count, ocr_quality,
                            partial_index, namespace_id, source_type, source_id
                     FROM kb_documents ORDER BY indexed_at DESC",
                )?;
                let result: Vec<KbDocument> = stmt
                    .query_map([], map_row)?
                    .collect::<Result<Vec<_>, _>>()?;
                result
            }
        };

        Ok(docs)
    }


    /// Delete all documents for a source
    pub fn delete_documents_for_source(&self, source_id: &str) -> Result<usize, DbError> {
        let deleted = self
            .conn
            .execute("DELETE FROM kb_documents WHERE source_id = ?", [source_id])?;
        Ok(deleted)
    }


    /// Get document count by namespace
    pub fn get_document_count_by_namespace(&self) -> Result<Vec<(String, i64)>, DbError> {
        let mut stmt = self
            .conn
            .prepare("SELECT namespace_id, COUNT(*) FROM kb_documents GROUP BY namespace_id")?;

        let counts = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(counts)
    }


    // ========================================================================
    // Phase 10: KB Management
    // ========================================================================

    /// Update the content of a KB chunk
    pub fn update_chunk_content(&self, chunk_id: &str, content: &str) -> Result<(), DbError> {
        let word_count = content.split_whitespace().count() as i32;
        let rows = self.conn.execute(
            "UPDATE kb_chunks SET content = ?, word_count = ? WHERE id = ?",
            params![content, word_count, chunk_id],
        )?;
        if rows == 0 {
            return Err(DbError::Migration(format!("Chunk not found: {}", chunk_id)));
        }
        Ok(())
    }


    /// Get KB health statistics
    pub fn get_kb_health_stats(&self) -> Result<KbHealthStats, DbError> {
        let total_documents: i64 =
            self.conn
                .query_row("SELECT COUNT(*) FROM kb_documents", [], |row| row.get(0))?;

        let total_chunks: i64 =
            self.conn
                .query_row("SELECT COUNT(*) FROM kb_chunks", [], |row| row.get(0))?;

        let stale_documents: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM kb_documents
             WHERE indexed_at < datetime('now', '-30 days')
                OR indexed_at IS NULL",
            [],
            |row| row.get(0),
        )?;

        let mut stmt = self.conn.prepare(
            "SELECT n.id, n.name,
                    COUNT(DISTINCT d.id) as doc_count,
                    COUNT(c.id) as chunk_count
             FROM namespaces n
             LEFT JOIN kb_documents d ON d.namespace_id = n.id
             LEFT JOIN kb_chunks c ON c.document_id = d.id
             GROUP BY n.id
             ORDER BY n.name",
        )?;

        let namespace_distribution = stmt
            .query_map([], |row| {
                Ok(NamespaceDistribution {
                    namespace_id: row.get(0)?,
                    namespace_name: row.get(1)?,
                    document_count: row.get(2)?,
                    chunk_count: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(KbHealthStats {
            total_documents,
            total_chunks,
            stale_documents,
            namespace_distribution,
        })
    }


    // ========================================================================
    // Phase 2 v0.4.0: KB Staleness / Review
    // ========================================================================

    /// Mark a KB document as reviewed
    pub fn mark_document_reviewed(
        &self,
        document_id: &str,
        reviewed_by: Option<&str>,
    ) -> Result<(), DbError> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE kb_documents SET last_reviewed_at = ?, last_reviewed_by = ? WHERE id = ?",
            params![&now, reviewed_by, document_id],
        )?;
        Ok(())
    }


    /// Get documents needing review (not reviewed in N days, or never reviewed)
    pub fn get_documents_needing_review(
        &self,
        stale_days: i64,
        limit: usize,
    ) -> Result<Vec<DocumentReviewInfo>, DbError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, file_path, title, indexed_at, last_reviewed_at, last_reviewed_by,
                    namespace_id, source_type
             FROM kb_documents
             WHERE last_reviewed_at IS NULL
                OR last_reviewed_at < datetime('now', '-' || ?1 || ' days')
             ORDER BY
                CASE WHEN last_reviewed_at IS NULL THEN 0 ELSE 1 END,
                last_reviewed_at ASC
             LIMIT ?2",
        )?;

        let docs = stmt
            .query_map(params![stale_days, limit as i64], |row| {
                Ok(DocumentReviewInfo {
                    id: row.get(0)?,
                    file_path: row.get(1)?,
                    title: row.get(2)?,
                    indexed_at: row.get(3)?,
                    last_reviewed_at: row.get(4)?,
                    last_reviewed_by: row.get(5)?,
                    namespace_id: row.get(6)?,
                    source_type: row.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(docs)
    }


    // ========================================================================
    // Phase 2 v0.4.0: Actionable Analytics
    // ========================================================================

    /// Get per-article analytics: drafts that used this article, ratings
    pub fn get_analytics_for_article(
        &self,
        document_id: &str,
    ) -> Result<ArticleAnalytics, DbError> {
        // Get document info
        let (title, file_path): (Option<String>, String) = self.conn.query_row(
            "SELECT title, file_path FROM kb_documents WHERE id = ?",
            [document_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        // Find drafts that referenced this document's chunks
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT d.id, d.input_text, d.response_text, d.created_at,
                    r.rating, r.feedback_text
             FROM drafts d
             LEFT JOIN response_ratings r ON r.draft_id = d.id
             WHERE d.kb_sources_json LIKE '%' || ?1 || '%'
               AND d.is_autosave = 0
             ORDER BY d.created_at DESC
             LIMIT 20",
        )?;

        let draft_refs = stmt
            .query_map([document_id], |row| {
                Ok(ArticleDraftReference {
                    draft_id: row.get(0)?,
                    input_text: row.get(1)?,
                    response_text: row.get(2)?,
                    created_at: row.get(3)?,
                    rating: row.get(4)?,
                    feedback_text: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        let total_uses = draft_refs.len() as i64;
        let rated_refs: Vec<&ArticleDraftReference> =
            draft_refs.iter().filter(|r| r.rating.is_some()).collect();
        let avg_rating = if rated_refs.is_empty() {
            None
        } else {
            let sum: f64 = rated_refs.iter().map(|r| r.rating.unwrap() as f64).sum();
            Some(sum / rated_refs.len() as f64)
        };

        Ok(ArticleAnalytics {
            document_id: document_id.to_string(),
            title: title.unwrap_or_else(|| file_path.clone()),
            file_path,
            total_uses,
            average_rating: avg_rating,
            draft_references: draft_refs,
        })
    }

}
