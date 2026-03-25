export interface KbDocument {
  id: string;
  file_path: string;
  title?: string | null;
  indexed_at?: string | null;
  chunk_count?: number;
}

export interface IndexedFile {
  file_path: string;
  title: string | null;
  chunk_count: number;
  indexed_at: string;
}

export interface IndexStats {
  document_count: number;
  chunk_count: number;
  total_words: number;
}

export interface IndexResult {
  total_files: number;
  indexed: number;
  skipped: number;
  errors: number;
}

export interface Namespace {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  created_at: string;
  updated_at: string;
}

export interface NamespaceWithCounts extends Namespace {
  document_count: number;
  source_count: number;
}

export interface IngestSource {
  id: string;
  source_type: string;
  source_uri: string;
  namespace_id: string;
  title?: string | null;
  etag?: string | null;
  last_modified?: string | null;
  content_hash?: string | null;
  last_ingested_at?: string | null;
  status: string;
  error_message?: string | null;
  metadata_json?: string | null;
  created_at: string;
  updated_at: string;
}

export interface IngestResult {
  document_id: string;
  title: string;
  source_uri: string;
  chunk_count: number;
  word_count: number;
}

export interface FailedSource {
  source: string;
  error: string;
}

export interface BatchIngestResult {
  successful: IngestResult[];
  failed: FailedSource[];
  cancelled: boolean;
}

export interface KbDocumentInfo {
  id: string;
  file_path: string;
  title?: string | null;
  indexed_at?: string | null;
  chunk_count?: number | null;
  namespace_id: string;
  source_type: string;
  source_id?: string | null;
  last_reviewed_at?: string | null;
  last_reviewed_by?: string | null;
}

export interface SearchResult {
  chunk_id: string;
  document_id: string;
  file_path: string;
  title: string | null;
  heading_path: string | null;
  content: string;
  snippet: string;
  score: number;
  source: 'Fts5' | 'Vector' | 'Hybrid';
  namespace_id: string | null;
  source_type: string | null;
}

export interface SearchOptions {
  fts_weight?: number;
  vector_weight?: number;
  enable_dedup?: boolean;
  dedup_threshold?: number;
}

export interface ContextSource {
  chunk_id: string;
  document_id: string;
  file_path: string;
  title: string | null;
  heading_path: string | null;
  score: number;
  search_method: string | null;
  source_type: string | null;
}

export interface DocumentChunk {
  id: string;
  chunk_index: number;
  heading_path?: string | null;
  content: string;
  word_count?: number | null;
}

export interface DocumentReviewInfo {
  id: string;
  file_path: string;
  title: string | null;
  indexed_at: string | null;
  last_reviewed_at: string | null;
  last_reviewed_by: string | null;
  namespace_id: string;
  source_type: string;
}

export interface SourceHealth {
  id: string;
  source_type: string;
  source_uri: string;
  title: string | null;
  status: 'pending' | 'active' | 'stale' | 'error' | 'removed';
  error_message: string | null;
  last_ingested_at: string | null;
  document_count: number;
  days_since_refresh: number | null;
}

export interface SourceHealthSummary {
  total_sources: number;
  active_sources: number;
  stale_sources: number;
  error_sources: number;
  pending_sources: number;
  sources: SourceHealth[];
}

export interface HybridSearchScores {
  bm25: number;
  vector: number;
  fused: number;
}

export interface HybridSearchResult {
  rank: number;
  article_id: string;
  title: string;
  category: string;
  preview: string;
  source_document: string | null;
  section: string | null;
  scores: HybridSearchScores | null;
}

export interface HybridSearchMetrics {
  latency_ms: number;
  embedding_time_ms: number;
  search_time_ms: number;
  result_count: number;
  timestamp: string;
}

export interface HybridSearchResponse {
  status: string;
  query: string;
  query_id: string | null;
  intent: string;
  intent_confidence: number;
  results_count: number;
  results: HybridSearchResult[];
  metrics: HybridSearchMetrics;
}

export interface SearchApiLatency {
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface SearchApiFeedbackStats {
  helpful: number;
  not_helpful: number;
  incorrect: number;
}

export interface SearchApiStatsData {
  queries_24h: number;
  queries_total: number;
  latency_ms: SearchApiLatency;
  feedback_stats: SearchApiFeedbackStats;
  intent_distribution: Record<string, number>;
}

export interface SearchApiHealthStatus {
  healthy: boolean;
  status: string;
  message: string;
  base_url: string;
}
