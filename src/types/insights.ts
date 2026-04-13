export interface KbGapCandidate {
  id: string;
  query_signature: string;
  sample_query: string;
  occurrences: number;
  low_confidence_count: number;
  low_rating_count: number;
  unsupported_claim_events: number;
  suggested_category: string | null;
  status: string;
  resolution_note: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

export interface ArticleAnalytics {
  document_id: string;
  title: string;
  file_path: string;
  total_uses: number;
  average_rating: number | null;
  draft_references: ArticleDraftReference[];
}

export interface ArticleDraftReference {
  draft_id: string;
  input_text: string;
  response_text: string | null;
  created_at: string;
  rating: number | null;
  feedback_text: string | null;
}
