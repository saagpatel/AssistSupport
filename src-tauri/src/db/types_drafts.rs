/// Draft status for workflow lifecycle
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DraftStatus {
    #[default]
    Draft,
    Finalized,
    Archived,
}

impl std::fmt::Display for DraftStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DraftStatus::Draft => write!(f, "draft"),
            DraftStatus::Finalized => write!(f, "finalized"),
            DraftStatus::Archived => write!(f, "archived"),
        }
    }
}

impl std::str::FromStr for DraftStatus {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "draft" => Ok(DraftStatus::Draft),
            "finalized" => Ok(DraftStatus::Finalized),
            "archived" => Ok(DraftStatus::Archived),
            _ => Err(format!("Unknown draft status: {}", s)),
        }
    }
}

/// Case intake data for structured IT support workflow
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct CaseIntake {
    pub user: Option<String>,
    pub device: Option<String>,
    pub os: Option<String>,
    pub urgency: Option<String>,
    pub symptoms: Option<String>,
    pub reproduction: Option<String>,
    pub logs: Option<String>,
    #[serde(default)]
    pub custom_fields: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SavedDraft {
    pub id: String,
    pub input_text: String,
    pub summary_text: Option<String>,
    pub diagnosis_json: Option<String>,
    pub response_text: Option<String>,
    pub ticket_id: Option<String>,
    pub kb_sources_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub is_autosave: bool,
    #[serde(default)]
    pub model_name: Option<String>,
    #[serde(default)]
    pub case_intake_json: Option<String>,
    #[serde(default)]
    pub status: DraftStatus,
    #[serde(default)]
    pub handoff_summary: Option<String>,
    #[serde(default)]
    pub finalized_at: Option<String>,
    #[serde(default)]
    pub finalized_by: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DraftVersion {
    pub id: String,
    pub draft_id: String,
    pub version_number: i32,
    pub input_text: Option<String>,
    pub summary_text: Option<String>,
    pub response_text: Option<String>,
    pub case_intake_json: Option<String>,
    pub kb_sources_json: Option<String>,
    pub created_at: String,
    pub change_reason: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Playbook {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub decision_tree_id: Option<String>,
    pub steps_json: String,
    pub template_id: Option<String>,
    pub shortcuts_json: Option<String>,
    pub is_active: bool,
    pub usage_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ActionShortcut {
    pub id: String,
    pub name: String,
    pub shortcut_key: Option<String>,
    pub action_type: String,
    pub action_data_json: String,
    pub category: Option<String>,
    pub sort_order: i32,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ResponseTemplate {
    pub id: String,
    pub name: String,
    pub category: Option<String>,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CustomVariable {
    pub id: String,
    pub name: String,
    pub value: String,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SavedResponseTemplate {
    pub id: String,
    pub source_draft_id: Option<String>,
    pub source_rating: Option<i32>,
    pub name: String,
    pub category: Option<String>,
    pub content: String,
    pub variables_json: Option<String>,
    pub use_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ResponseAlternative {
    pub id: String,
    pub draft_id: String,
    pub original_text: String,
    pub alternative_text: String,
    pub sources_json: Option<String>,
    pub metrics_json: Option<String>,
    pub generation_params_json: Option<String>,
    pub chosen: Option<String>,
    pub created_at: String,
}
