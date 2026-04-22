import { invoke } from "@tauri-apps/api/core";

interface AuditResponseCopyOverrideParams {
  reason: string;
  confidenceMode: string | null;
  sourcesCount: number;
}

export function auditResponseCopyOverride(
  params: AuditResponseCopyOverrideParams,
): Promise<unknown> {
  return invoke("audit_response_copy_override", { ...params });
}

interface ExportDraftParams {
  responseText: string;
  format: "Markdown";
}

export function exportDraft(params: ExportDraftParams): Promise<boolean> {
  return invoke<boolean>("export_draft", { ...params });
}
