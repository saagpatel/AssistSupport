#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RunbookSessionRecord {
    pub id: String,
    pub scenario: String,
    pub scope_key: String,
    pub status: String,
    pub steps_json: String,
    pub current_step: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RunbookTemplateRecord {
    pub id: String,
    pub name: String,
    pub scenario: String,
    pub steps_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RunbookStepEvidenceRecord {
    pub id: String,
    pub session_id: String,
    pub step_index: i32,
    pub status: String,
    pub evidence_text: String,
    pub skip_reason: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct IntegrationConfigRecord {
    pub id: String,
    pub integration_type: String,
    pub enabled: bool,
    pub config_json: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ResolutionKitRecord {
    pub id: String,
    pub name: String,
    pub summary: String,
    pub category: String,
    pub response_template: String,
    pub checklist_items_json: String,
    pub kb_document_ids_json: String,
    pub runbook_scenario: Option<String>,
    pub approval_hint: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WorkspaceFavoriteRecord {
    pub id: String,
    pub kind: String,
    pub label: String,
    pub resource_id: String,
    pub metadata_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DispatchHistoryRecord {
    pub id: String,
    pub integration_type: String,
    pub draft_id: Option<String>,
    pub title: String,
    pub destination_label: String,
    pub payload_preview: String,
    pub status: String,
    pub metadata_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CaseOutcomeRecord {
    pub id: String,
    pub draft_id: String,
    pub status: String,
    pub outcome_summary: String,
    pub handoff_pack_json: Option<String>,
    pub kb_draft_json: Option<String>,
    pub evidence_pack_json: Option<String>,
    pub tags_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WorkspaceRoleRecord {
    pub id: String,
    pub workspace_id: String,
    pub principal: String,
    pub role_name: String,
    pub created_at: String,
}
