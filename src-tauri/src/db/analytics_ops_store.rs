//! Analytics, ratings, deployment, eval, and ops persistence.

use super::*;

impl Database {

    // ========================================================================
    // Phase 4: Response Ratings
    // ========================================================================

    /// Save or update a response rating for a draft
    pub fn save_response_rating(
        &self,
        id: &str,
        draft_id: &str,
        rating: i32,
        feedback_text: Option<&str>,
        feedback_category: Option<&str>,
    ) -> Result<(), DbError> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT OR REPLACE INTO response_ratings (id, draft_id, rating, feedback_text, feedback_category, created_at)
             VALUES (?, ?, ?, ?, ?, ?)",
            params![id, draft_id, rating, feedback_text, feedback_category, &now],
        )?;
        Ok(())
    }


    /// Get the rating for a specific draft
    pub fn get_draft_rating(&self, draft_id: &str) -> Result<Option<ResponseRating>, DbError> {
        let result = self.conn.query_row(
            "SELECT id, draft_id, rating, feedback_text, feedback_category, created_at
             FROM response_ratings WHERE draft_id = ? LIMIT 1",
            [draft_id],
            |row| {
                Ok(ResponseRating {
                    id: row.get(0)?,
                    draft_id: row.get(1)?,
                    rating: row.get(2)?,
                    feedback_text: row.get(3)?,
                    feedback_category: row.get(4)?,
                    created_at: row.get(5)?,
                })
            },
        );

        match result {
            Ok(r) => Ok(Some(r)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(DbError::Sqlite(e)),
        }
    }


    /// Get aggregate rating statistics
    pub fn get_rating_stats(&self) -> Result<RatingStats, DbError> {
        let total_ratings: i64 =
            self.conn
                .query_row("SELECT COUNT(*) FROM response_ratings", [], |row| {
                    row.get(0)
                })?;

        let average_rating: f64 = if total_ratings > 0 {
            self.conn.query_row(
                "SELECT AVG(CAST(rating AS REAL)) FROM response_ratings",
                [],
                |row| row.get(0),
            )?
        } else {
            0.0
        };

        let mut distribution = vec![0i64; 5];
        let mut stmt = self.conn.prepare(
            "SELECT rating, COUNT(*) FROM response_ratings GROUP BY rating ORDER BY rating",
        )?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, i32>(0)?, row.get::<_, i64>(1)?)))?;

        for row in rows {
            let (rating, count) = row?;
            if (1..=5).contains(&rating) {
                distribution[(rating - 1) as usize] = count;
            }
        }

        Ok(RatingStats {
            total_ratings,
            average_rating,
            distribution,
        })
    }


    // ========================================================================
    // Phase 2: Analytics Events
    // ========================================================================

    /// Log an analytics event
    pub fn log_analytics_event(
        &self,
        id: &str,
        event_type: &str,
        event_data_json: Option<&str>,
    ) -> Result<(), DbError> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO analytics_events (id, event_type, event_data_json, created_at)
             VALUES (?, ?, ?, ?)",
            params![id, event_type, event_data_json, &now],
        )?;
        Ok(())
    }


    /// Get analytics summary for a given period (None = all time)
    pub fn get_analytics_summary(
        &self,
        period_days: Option<i64>,
    ) -> Result<AnalyticsSummary, DbError> {
        let date_filter = period_days
            .map(|d| format!("AND created_at >= datetime('now', '-{} days')", d))
            .unwrap_or_default();

        let total_events: i64 = self.conn.query_row(
            &format!(
                "SELECT COUNT(*) FROM analytics_events WHERE 1=1 {}",
                date_filter
            ),
            [],
            |row| row.get(0),
        )?;

        let responses_generated: i64 = self.conn.query_row(
            &format!(
                "SELECT COUNT(*) FROM analytics_events WHERE event_type = 'response_generated' {}",
                date_filter
            ),
            [],
            |row| row.get(0),
        )?;

        let searches_performed: i64 = self.conn.query_row(
            &format!(
                "SELECT COUNT(*) FROM analytics_events WHERE event_type = 'search_performed' {}",
                date_filter
            ),
            [],
            |row| row.get(0),
        )?;

        let drafts_saved: i64 = self.conn.query_row(
            &format!(
                "SELECT COUNT(*) FROM analytics_events WHERE event_type = 'draft_saved' {}",
                date_filter
            ),
            [],
            |row| row.get(0),
        )?;

        // Daily counts for the period
        let daily_query = format!(
            "SELECT DATE(created_at) as day, COUNT(*) FROM analytics_events
             WHERE 1=1 {}
             GROUP BY day ORDER BY day DESC LIMIT 30",
            date_filter
        );
        let mut stmt = self.conn.prepare(&daily_query)?;
        let daily_counts = stmt
            .query_map([], |row| {
                Ok(DailyCount {
                    date: row.get(0)?,
                    count: row.get(1)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        // Rating stats for the period
        let rating_date_filter = period_days
            .map(|d| format!("WHERE created_at >= datetime('now', '-{} days')", d))
            .unwrap_or_default();

        let total_ratings: i64 = self.conn.query_row(
            &format!(
                "SELECT COUNT(*) FROM response_ratings {}",
                rating_date_filter
            ),
            [],
            |row| row.get(0),
        )?;

        let average_rating: f64 = if total_ratings > 0 {
            self.conn.query_row(
                &format!(
                    "SELECT AVG(CAST(rating AS REAL)) FROM response_ratings {}",
                    rating_date_filter
                ),
                [],
                |row| row.get(0),
            )?
        } else {
            0.0
        };

        // Query per-star rating distribution (1-5)
        let mut rating_distribution = vec![0i64; 5];
        {
            let dist_query = format!(
                "SELECT rating, COUNT(*) FROM response_ratings {} GROUP BY rating",
                rating_date_filter
            );
            let mut stmt = self.conn.prepare(&dist_query)?;
            let rows =
                stmt.query_map([], |row| Ok((row.get::<_, i32>(0)?, row.get::<_, i64>(1)?)))?;
            for row in rows {
                let (star, count) = row?;
                if (1..=5).contains(&star) {
                    rating_distribution[(star - 1) as usize] = count;
                }
            }
        }

        Ok(AnalyticsSummary {
            total_events,
            responses_generated,
            searches_performed,
            drafts_saved,
            daily_counts,
            average_rating,
            total_ratings,
            rating_distribution,
        })
    }


    /// Get response quality summary from structured analytics events.
    pub fn get_response_quality_summary(
        &self,
        period_days: Option<i64>,
    ) -> Result<ResponseQualitySummary, DbError> {
        let date_filter = period_days
            .map(|d| format!("AND created_at >= datetime('now', '-{} days')", d))
            .unwrap_or_default();

        let snapshots_count: i64 = self.conn.query_row(
            &format!(
                "SELECT COUNT(*) FROM analytics_events WHERE event_type = 'response_quality_snapshot' {}",
                date_filter
            ),
            [],
            |row| row.get(0),
        )?;

        let saved_count: i64 = self.conn.query_row(
            &format!(
                "SELECT COUNT(*) FROM analytics_events WHERE event_type = 'response_saved' {}",
                date_filter
            ),
            [],
            |row| row.get(0),
        )?;

        let copied_count: i64 = self.conn.query_row(
            &format!(
                "SELECT COUNT(*) FROM analytics_events WHERE event_type = 'response_copied' {}",
                date_filter
            ),
            [],
            |row| row.get(0),
        )?;

        let (avg_word_count, avg_edit_ratio): (Option<f64>, Option<f64>) = self.conn.query_row(
            &format!(
                "SELECT
                    AVG(CAST(json_extract(event_data_json, '$.word_count') AS REAL)),
                    AVG(CAST(json_extract(event_data_json, '$.edit_ratio') AS REAL))
                 FROM analytics_events
                 WHERE event_type = 'response_quality_snapshot' {}",
                date_filter
            ),
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        let edited_save_rate: f64 = self.conn.query_row(
            &format!(
                "SELECT
                    COALESCE(
                        AVG(
                            CASE
                                WHEN CAST(json_extract(event_data_json, '$.is_edited') AS INTEGER) = 1 THEN 1.0
                                ELSE 0.0
                            END
                        ),
                        0.0
                    )
                 FROM analytics_events
                 WHERE event_type = 'response_saved' {}",
                date_filter
            ),
            [],
            |row| row.get(0),
        )?;

        let mut time_to_draft_values: Vec<i64> = Vec::new();
        {
            let query = format!(
                "SELECT CAST(json_extract(event_data_json, '$.time_to_draft_ms') AS INTEGER)
                 FROM analytics_events
                 WHERE event_type = 'response_quality_snapshot'
                   AND json_extract(event_data_json, '$.time_to_draft_ms') IS NOT NULL
                   {}",
                date_filter
            );
            let mut stmt = self.conn.prepare(&query)?;
            let rows = stmt.query_map([], |row| row.get::<_, i64>(0))?;
            for value in rows {
                time_to_draft_values.push(value?);
            }
        }

        let avg_time_to_draft_ms = if time_to_draft_values.is_empty() {
            None
        } else {
            Some(
                time_to_draft_values
                    .iter()
                    .copied()
                    .map(|v| v as f64)
                    .sum::<f64>()
                    / time_to_draft_values.len() as f64,
            )
        };

        let median_time_to_draft_ms = if time_to_draft_values.is_empty() {
            None
        } else {
            time_to_draft_values.sort_unstable();
            let len = time_to_draft_values.len();
            if len % 2 == 1 {
                Some(time_to_draft_values[len / 2])
            } else {
                let upper = time_to_draft_values[len / 2];
                let lower = time_to_draft_values[(len / 2) - 1];
                Some((upper + lower) / 2)
            }
        };

        let copy_per_saved_ratio = if saved_count > 0 {
            copied_count as f64 / saved_count as f64
        } else {
            0.0
        };

        Ok(ResponseQualitySummary {
            snapshots_count,
            saved_count,
            copied_count,
            avg_word_count: avg_word_count.unwrap_or(0.0),
            avg_edit_ratio: avg_edit_ratio.unwrap_or(0.0),
            edited_save_rate,
            avg_time_to_draft_ms,
            median_time_to_draft_ms,
            copy_per_saved_ratio,
        })
    }


    /// Get drill-down draft examples for each response quality coaching signal.
    pub fn get_response_quality_drilldown_examples(
        &self,
        period_days: Option<i64>,
        limit: Option<usize>,
    ) -> Result<ResponseQualityDrilldownExamples, DbError> {
        let date_filter = period_days
            .map(|d| format!("AND a.created_at >= datetime('now', '-{} days')", d))
            .unwrap_or_default();
        let capped_limit = limit.unwrap_or(5).clamp(1, 25);

        let map_examples = |query: &str| -> Result<Vec<ResponseQualityDrilldownExample>, DbError> {
            let mut stmt = self.conn.prepare(query)?;
            let rows = stmt.query_map([], |row| {
                Ok(ResponseQualityDrilldownExample {
                    draft_id: row.get(0)?,
                    metric_value: row.get::<_, Option<f64>>(1)?.unwrap_or(0.0),
                    created_at: row.get(2)?,
                    draft_excerpt: row.get(3)?,
                })
            })?;

            rows.collect::<Result<Vec<_>, _>>().map_err(DbError::from)
        };

        let edit_ratio = map_examples(&format!(
            "SELECT
                CAST(json_extract(a.event_data_json, '$.draft_id') AS TEXT) AS draft_id,
                CAST(json_extract(a.event_data_json, '$.edit_ratio') AS REAL) AS metric_value,
                a.created_at,
                CASE
                    WHEN d.input_text IS NOT NULL THEN substr(d.input_text, 1, 160)
                    ELSE NULL
                END AS draft_excerpt
             FROM analytics_events a
             LEFT JOIN drafts d ON d.id = CAST(json_extract(a.event_data_json, '$.draft_id') AS TEXT)
             WHERE a.event_type = 'response_saved'
               AND json_extract(a.event_data_json, '$.draft_id') IS NOT NULL
               AND json_extract(a.event_data_json, '$.edit_ratio') IS NOT NULL
               {}
             ORDER BY metric_value DESC, a.created_at DESC
             LIMIT {}",
            date_filter, capped_limit
        ))?;

        let time_to_draft = map_examples(&format!(
            "SELECT
                CAST(json_extract(a.event_data_json, '$.draft_id') AS TEXT) AS draft_id,
                CAST(json_extract(a.event_data_json, '$.time_to_draft_ms') AS REAL) AS metric_value,
                a.created_at,
                CASE
                    WHEN d.input_text IS NOT NULL THEN substr(d.input_text, 1, 160)
                    ELSE NULL
                END AS draft_excerpt
             FROM analytics_events a
             LEFT JOIN drafts d ON d.id = CAST(json_extract(a.event_data_json, '$.draft_id') AS TEXT)
             WHERE a.event_type = 'response_quality_snapshot'
               AND json_extract(a.event_data_json, '$.draft_id') IS NOT NULL
               AND json_extract(a.event_data_json, '$.time_to_draft_ms') IS NOT NULL
               {}
             ORDER BY metric_value DESC, a.created_at DESC
             LIMIT {}",
            date_filter, capped_limit
        ))?;

        let copy_per_save = map_examples(&format!(
            "SELECT
                rs.draft_id AS draft_id,
                0.0 AS metric_value,
                rs.created_at,
                CASE
                    WHEN d.input_text IS NOT NULL THEN substr(d.input_text, 1, 160)
                    ELSE NULL
                END AS draft_excerpt
             FROM (
                SELECT
                    CAST(json_extract(a.event_data_json, '$.draft_id') AS TEXT) AS draft_id,
                    a.created_at
                FROM analytics_events a
                WHERE a.event_type = 'response_saved'
                  AND json_extract(a.event_data_json, '$.draft_id') IS NOT NULL
                  {}
             ) rs
             LEFT JOIN drafts d ON d.id = rs.draft_id
             WHERE NOT EXISTS (
                SELECT 1
                FROM analytics_events c
                WHERE c.event_type = 'response_copied'
                  AND CAST(json_extract(c.event_data_json, '$.draft_id') AS TEXT) = rs.draft_id
                  AND c.created_at >= rs.created_at
             )
             ORDER BY rs.created_at DESC
             LIMIT {}",
            date_filter, capped_limit
        ))?;

        let edited_save_rate = map_examples(&format!(
            "SELECT
                CAST(json_extract(a.event_data_json, '$.draft_id') AS TEXT) AS draft_id,
                CAST(json_extract(a.event_data_json, '$.edit_ratio') AS REAL) AS metric_value,
                a.created_at,
                CASE
                    WHEN d.input_text IS NOT NULL THEN substr(d.input_text, 1, 160)
                    ELSE NULL
                END AS draft_excerpt
             FROM analytics_events a
             LEFT JOIN drafts d ON d.id = CAST(json_extract(a.event_data_json, '$.draft_id') AS TEXT)
             WHERE a.event_type = 'response_saved'
               AND json_extract(a.event_data_json, '$.draft_id') IS NOT NULL
               AND CAST(json_extract(a.event_data_json, '$.is_edited') AS INTEGER) = 1
               {}
             ORDER BY a.created_at DESC
             LIMIT {}",
            date_filter, capped_limit
        ))?;

        Ok(ResponseQualityDrilldownExamples {
            edit_ratio,
            time_to_draft,
            copy_per_save,
            edited_save_rate,
        })
    }


    /// Get analysis of low-rated responses for quality feedback loop
    pub fn get_low_rating_analysis(
        &self,
        period_days: Option<i64>,
    ) -> Result<LowRatingAnalysis, DbError> {
        let date_filter = period_days
            .map(|d| format!("WHERE created_at >= datetime('now', '-{} days')", d))
            .unwrap_or_default();

        let total_rating_count: i64 = self.conn.query_row(
            &format!("SELECT COUNT(*) FROM response_ratings {}", date_filter),
            [],
            |row| row.get(0),
        )?;

        let low_date_filter = period_days
            .map(|d| {
                format!(
                    "WHERE rating <= 2 AND created_at >= datetime('now', '-{} days')",
                    d
                )
            })
            .unwrap_or_else(|| "WHERE rating <= 2".to_string());

        let low_rating_count: i64 = self.conn.query_row(
            &format!("SELECT COUNT(*) FROM response_ratings {}", low_date_filter),
            [],
            |row| row.get(0),
        )?;

        let low_rating_percentage = if total_rating_count > 0 {
            (low_rating_count as f64 / total_rating_count as f64) * 100.0
        } else {
            0.0
        };

        // Group by feedback category
        let cat_query = format!(
            "SELECT COALESCE(feedback_category, 'Uncategorized'), COUNT(*) FROM response_ratings {} GROUP BY COALESCE(feedback_category, 'Uncategorized') ORDER BY COUNT(*) DESC LIMIT 10",
            low_date_filter
        );
        let mut cat_stmt = self.conn.prepare(&cat_query)?;
        let feedback_categories = cat_stmt
            .query_map([], |row| {
                Ok(FeedbackCategoryCount {
                    category: row.get(0)?,
                    count: row.get(1)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        // Recent low-rated feedback texts
        let recent_query = format!(
            "SELECT rating, COALESCE(feedback_text, ''), feedback_category, created_at FROM response_ratings {} AND feedback_text IS NOT NULL AND feedback_text != '' ORDER BY created_at DESC LIMIT 10",
            if low_date_filter.contains("WHERE") {
                low_date_filter.clone()
            } else {
                "WHERE rating <= 2".to_string()
            }
        );
        let mut recent_stmt = self.conn.prepare(&recent_query)?;
        let recent_feedback = recent_stmt
            .query_map([], |row| {
                Ok(RecentLowFeedback {
                    rating: row.get(0)?,
                    feedback_text: row.get(1)?,
                    feedback_category: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(LowRatingAnalysis {
            low_rating_count,
            total_rating_count,
            low_rating_percentage,
            feedback_categories,
            recent_feedback,
        })
    }


    /// Get KB article usage stats from analytics events
    pub fn get_kb_usage_stats(
        &self,
        period_days: Option<i64>,
    ) -> Result<Vec<ArticleUsage>, DbError> {
        let date_filter = period_days
            .map(|d| format!("AND ae.created_at >= datetime('now', '-{} days')", d))
            .unwrap_or_default();

        // Parse event_data_json to extract document_id from kb_article_used events
        let query = format!(
            "SELECT
                json_extract(ae.event_data_json, '$.document_id') as doc_id,
                COALESCE(json_extract(ae.event_data_json, '$.title'), 'Unknown') as title,
                COUNT(*) as usage_count
             FROM analytics_events ae
             WHERE ae.event_type = 'kb_article_used'
               AND json_extract(ae.event_data_json, '$.document_id') IS NOT NULL
               {}
             GROUP BY doc_id
             ORDER BY usage_count DESC
             LIMIT 50",
            date_filter
        );

        let mut stmt = self.conn.prepare(&query)?;
        let results = stmt
            .query_map([], |row| {
                Ok(ArticleUsage {
                    document_id: row.get(0)?,
                    title: row.get(1)?,
                    usage_count: row.get(2)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(results)
    }


    /// Record generation quality event and update KB gap detector counters.
    pub fn record_generation_quality_event(
        &self,
        event: GenerationQualityEvent<'_>,
    ) -> Result<(), DbError> {
        let now = Utc::now().to_rfc3339();
        let event_id = uuid::Uuid::new_v4().to_string();

        self.conn.execute(
            "INSERT INTO generation_quality_events
             (id, query_text, confidence_mode, confidence_score, unsupported_claims, total_claims, source_count, avg_source_score, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                event_id,
                event.query_text,
                event.confidence_mode,
                event.confidence_score,
                event.unsupported_claims,
                event.total_claims,
                event.source_count,
                event.avg_source_score,
                &now
            ],
        )?;

        let query_signature = event
            .query_text
            .trim()
            .to_lowercase()
            .chars()
            .take(180)
            .collect::<String>();
        if query_signature.is_empty() {
            return Ok(());
        }

        let low_confidence_increment = if event.confidence_mode == "answer" {
            0
        } else {
            1
        };
        let unsupported_increment = if event.unsupported_claims > 0 { 1 } else { 0 };

        let suggested_category = if query_signature.contains("policy")
            || query_signature.contains("allowed")
            || query_signature.contains("can i")
        {
            Some("policy")
        } else if query_signature.contains("how")
            || query_signature.contains("steps")
            || query_signature.contains("setup")
        {
            Some("procedure")
        } else {
            Some("reference")
        };

        self.conn.execute(
            "INSERT INTO kb_gap_candidates
             (id, query_signature, sample_query, occurrences, low_confidence_count, low_rating_count, unsupported_claim_events, suggested_category, status, first_seen_at, last_seen_at)
             VALUES (?, ?, ?, 1, ?, 0, ?, ?, 'open', ?, ?)
             ON CONFLICT(query_signature) DO UPDATE SET
                occurrences = occurrences + 1,
                low_confidence_count = low_confidence_count + excluded.low_confidence_count,
                unsupported_claim_events = unsupported_claim_events + excluded.unsupported_claim_events,
                suggested_category = COALESCE(kb_gap_candidates.suggested_category, excluded.suggested_category),
                last_seen_at = excluded.last_seen_at",
            params![
                uuid::Uuid::new_v4().to_string(),
                query_signature,
                event.query_text.trim(),
                low_confidence_increment,
                unsupported_increment,
                suggested_category,
                &now,
                &now
            ],
        )?;

        Ok(())
    }


    /// Get KB gap candidates ordered by impact.
    pub fn get_kb_gap_candidates(
        &self,
        limit: usize,
        status: Option<&str>,
    ) -> Result<Vec<KbGapCandidate>, DbError> {
        let status = status.unwrap_or("open");
        let mut stmt = self.conn.prepare(
            "SELECT id, query_signature, sample_query, occurrences, low_confidence_count, low_rating_count,
                    unsupported_claim_events, suggested_category, status, resolution_note, first_seen_at, last_seen_at
             FROM kb_gap_candidates
             WHERE status = ?1
             ORDER BY (occurrences + low_confidence_count + (unsupported_claim_events * 2) + (low_rating_count * 3)) DESC,
                      last_seen_at DESC
             LIMIT ?2",
        )?;
        let rows = stmt
            .query_map(params![status, limit as i64], |row| {
                Ok(KbGapCandidate {
                    id: row.get(0)?,
                    query_signature: row.get(1)?,
                    sample_query: row.get(2)?,
                    occurrences: row.get(3)?,
                    low_confidence_count: row.get(4)?,
                    low_rating_count: row.get(5)?,
                    unsupported_claim_events: row.get(6)?,
                    suggested_category: row.get(7)?,
                    status: row.get(8)?,
                    resolution_note: row.get(9)?,
                    first_seen_at: row.get(10)?,
                    last_seen_at: row.get(11)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }


    /// Update KB gap candidate workflow status.
    pub fn update_kb_gap_status(
        &self,
        id: &str,
        status: &str,
        resolution_note: Option<&str>,
    ) -> Result<(), DbError> {
        self.conn.execute(
            "UPDATE kb_gap_candidates SET status = ?, resolution_note = ? WHERE id = ?",
            params![status, resolution_note, id],
        )?;
        Ok(())
    }


    /// Record deployment artifact metadata.
    pub fn record_deployment_artifact(
        &self,
        artifact_type: &str,
        version: &str,
        channel: &str,
        sha256: &str,
        is_signed: bool,
    ) -> Result<String, DbError> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO deployment_artifacts (id, artifact_type, version, channel, sha256, is_signed, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![&id, artifact_type, version, channel, sha256, if is_signed { 1 } else { 0 }, &now],
        )?;
        Ok(id)
    }


    /// Record deployment run.
    pub fn record_deployment_run(
        &self,
        target_channel: &str,
        status: &str,
        preflight_json: Option<&str>,
        rollback_available: bool,
    ) -> Result<String, DbError> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let completed_at = if status == "started" {
            None
        } else {
            Some(now.clone())
        };
        self.conn.execute(
            "INSERT INTO deployment_runs (id, target_channel, status, preflight_json, rollback_available, created_at, completed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![
                &id,
                target_channel,
                status,
                preflight_json,
                if rollback_available { 1 } else { 0 },
                &now,
                completed_at
            ],
        )?;
        Ok(id)
    }


    /// Deployment health summary for UI.
    pub fn get_deployment_health_summary(&self) -> Result<DeploymentHealthSummary, DbError> {
        let total_artifacts: i64 =
            self.conn
                .query_row("SELECT COUNT(*) FROM deployment_artifacts", [], |row| {
                    row.get(0)
                })?;
        let signed_artifacts: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM deployment_artifacts WHERE is_signed = 1",
            [],
            |row| row.get(0),
        )?;
        let unsigned_artifacts = total_artifacts - signed_artifacts;

        let last_run: Option<DeploymentRunRecord> = self
            .conn
            .query_row(
                "SELECT id, target_channel, status, preflight_json, rollback_available, created_at, completed_at
                 FROM deployment_runs ORDER BY created_at DESC LIMIT 1",
                [],
                |row| {
                    Ok(DeploymentRunRecord {
                        id: row.get(0)?,
                        target_channel: row.get(1)?,
                        status: row.get(2)?,
                        preflight_json: row.get(3)?,
                        rollback_available: row.get::<_, i32>(4)? == 1,
                        created_at: row.get(5)?,
                        completed_at: row.get(6)?,
                    })
                },
            )
            .ok();

        Ok(DeploymentHealthSummary {
            total_artifacts,
            signed_artifacts,
            unsigned_artifacts,
            last_run,
        })
    }


    /// List recent deployment artifacts.
    pub fn list_deployment_artifacts(
        &self,
        limit: usize,
    ) -> Result<Vec<DeploymentArtifactRecord>, DbError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, artifact_type, version, channel, sha256, is_signed, created_at
             FROM deployment_artifacts
             ORDER BY created_at DESC
             LIMIT ?",
        )?;
        let rows = stmt
            .query_map([limit as i64], |row| {
                Ok(DeploymentArtifactRecord {
                    id: row.get(0)?,
                    artifact_type: row.get(1)?,
                    version: row.get(2)?,
                    channel: row.get(3)?,
                    sha256: row.get(4)?,
                    is_signed: row.get::<_, i32>(5)? == 1,
                    created_at: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }


    /// Verify signed artifact metadata against an expected hash.
    pub fn verify_signed_artifact(
        &self,
        artifact_id: &str,
        expected_sha256: Option<&str>,
    ) -> Result<SignedArtifactVerificationResult, DbError> {
        let artifact = self.conn.query_row(
            "SELECT id, artifact_type, version, channel, sha256, is_signed, created_at
             FROM deployment_artifacts WHERE id = ?",
            [artifact_id],
            |row| {
                Ok(DeploymentArtifactRecord {
                    id: row.get(0)?,
                    artifact_type: row.get(1)?,
                    version: row.get(2)?,
                    channel: row.get(3)?,
                    sha256: row.get(4)?,
                    is_signed: row.get::<_, i32>(5)? == 1,
                    created_at: row.get(6)?,
                })
            },
        )?;

        let hash_matches = expected_sha256
            .map(|expected| artifact.sha256.eq_ignore_ascii_case(expected))
            .unwrap_or(true);

        let is_signed = artifact.is_signed;
        Ok(SignedArtifactVerificationResult {
            artifact,
            is_signed,
            hash_matches,
            status: if is_signed && hash_matches {
                "verified".to_string()
            } else if is_signed {
                "hash_mismatch".to_string()
            } else {
                "unsigned".to_string()
            },
        })
    }


    /// Mark a deployment run as rolled back.
    pub fn rollback_deployment_run(
        &self,
        run_id: &str,
        reason: Option<&str>,
    ) -> Result<(), DbError> {
        let now = Utc::now().to_rfc3339();
        let reason_json = reason.map(|r| serde_json::json!({ "rollback_reason": r }).to_string());
        self.conn.execute(
            "UPDATE deployment_runs
             SET status = 'rolled_back',
                 completed_at = ?,
                 preflight_json = COALESCE(preflight_json, ?)
             WHERE id = ?",
            params![&now, reason_json, run_id],
        )?;
        Ok(())
    }


    /// Save an evaluation harness run result.
    pub fn save_eval_run(
        &self,
        suite_name: &str,
        total_cases: i32,
        passed_cases: i32,
        avg_confidence: f64,
        details_json: Option<&str>,
    ) -> Result<String, DbError> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO eval_runs (id, suite_name, total_cases, passed_cases, avg_confidence, details_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![
                &id,
                suite_name,
                total_cases,
                passed_cases,
                avg_confidence,
                details_json,
                &now
            ],
        )?;
        Ok(id)
    }


    /// List evaluation harness runs.
    pub fn list_eval_runs(&self, limit: usize) -> Result<Vec<EvalRunRecord>, DbError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, suite_name, total_cases, passed_cases, avg_confidence, details_json, created_at
             FROM eval_runs
             ORDER BY created_at DESC
             LIMIT ?",
        )?;
        let rows = stmt
            .query_map([limit as i64], |row| {
                Ok(EvalRunRecord {
                    id: row.get(0)?,
                    suite_name: row.get(1)?,
                    total_cases: row.get(2)?,
                    passed_cases: row.get(3)?,
                    avg_confidence: row.get(4)?,
                    details_json: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }


    /// Save triage cluster output.
    pub fn save_triage_cluster(
        &self,
        cluster_key: &str,
        summary: &str,
        ticket_count: i32,
        tickets_json: &str,
    ) -> Result<String, DbError> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO triage_clusters (id, cluster_key, summary, ticket_count, tickets_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?)",
            params![&id, cluster_key, summary, ticket_count, tickets_json, &now],
        )?;
        Ok(id)
    }


    /// List recent triage clusters.
    pub fn list_recent_triage_clusters(
        &self,
        limit: usize,
    ) -> Result<Vec<TriageClusterRecord>, DbError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, cluster_key, summary, ticket_count, tickets_json, created_at
             FROM triage_clusters
             ORDER BY created_at DESC
             LIMIT ?",
        )?;
        let rows = stmt
            .query_map([limit as i64], |row| {
                Ok(TriageClusterRecord {
                    id: row.get(0)?,
                    cluster_key: row.get(1)?,
                    summary: row.get(2)?,
                    ticket_count: row.get(3)?,
                    tickets_json: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }


    // ========================================================================
    // Phase 2 v0.4.0: Jira Status Transitions
    // ========================================================================

    /// Save a Jira status transition
    pub fn save_jira_transition(
        &self,
        transition: &JiraStatusTransition,
    ) -> Result<String, DbError> {
        self.conn.execute(
            "INSERT INTO jira_status_transitions
             (id, draft_id, ticket_key, old_status, new_status, comment_id, transitioned_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![
                &transition.id,
                &transition.draft_id,
                &transition.ticket_key,
                &transition.old_status,
                &transition.new_status,
                &transition.comment_id,
                &transition.transitioned_at,
            ],
        )?;
        Ok(transition.id.clone())
    }
}
