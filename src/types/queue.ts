export interface TriageClusterRecord {
  id: string;
  cluster_key: string;
  summary: string;
  ticket_count: number;
  tickets_json: string;
  created_at: string;
}

export interface DispatchHistoryRecord {
  id: string;
  integration_type: "jira" | "servicenow" | "slack" | "teams";
  draft_id: string | null;
  title: string;
  destination_label: string;
  payload_preview: string;
  status: "previewed" | "sent" | "cancelled" | "failed";
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}
