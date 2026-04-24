import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";

const kbStats = {
  document_count: 2,
  chunk_count: 8,
  total_words: 4200,
};

const kbDocuments = [
  {
    id: "doc-1",
    file_path: "/mock/kb/remote-work-policy.md",
    title: "Remote Work Policy",
    indexed_at: "2026-02-03T10:00:00Z",
    chunk_count: 4,
  },
  {
    id: "doc-2",
    file_path: "/mock/kb/security-baseline.md",
    title: "Security Baseline",
    indexed_at: "2026-02-03T10:05:00Z",
    chunk_count: 4,
  },
];

function mockSearchResults() {
  return [
    {
      chunk_id: "chunk-1",
      document_id: "doc-1",
      file_path: "/mock/kb/remote-work-policy.md",
      title: "Remote Work Policy",
      heading_path: "Policy > VPN",
      content: "Use approved VPN and MFA when working remotely.",
      snippet: "Use approved VPN and MFA when working remotely.",
      score: 0.95,
      source: "Hybrid",
      namespace_id: "default",
      source_type: "file",
    },
  ];
}

export function setupE2eTauriMock(): void {
  // Portfolio-grade seed data: realistic IT-support scenarios, release
  // lifecycle, and KB gap clusters so live dev captures + day-to-day
  // dev work against the mock IPC show populated screens.
  const deploymentArtifacts = [
    {
      id: "artifact-1",
      artifact_type: "app_bundle",
      version: "1.2.0",
      channel: "stable",
      sha256: "a1f4c9e28b07d73f0c6d5e93b4fa812c9d01ae557832b8e7c0f2b4e6d8a19c",
      is_signed: true,
      created_at: "2026-04-24T11:57:00Z",
    },
    {
      id: "artifact-2",
      artifact_type: "app_bundle",
      version: "1.1.4",
      channel: "stable",
      sha256: "4e38f2a6d91c8b0e5a27c9d482f3b61c8a7e40b19f25d7c8e6a0a329b4d7c2",
      is_signed: true,
      created_at: "2026-04-23T18:04:00Z",
    },
    {
      id: "artifact-3",
      artifact_type: "app_bundle",
      version: "1.1.5-rc",
      channel: "canary",
      sha256: "7b12c4e0a9f3d851062e74a8c6b0d4e91a5c82d4f9e71c6a3b0e58c7d91f3a",
      is_signed: true,
      created_at: "2026-04-24T09:37:00Z",
    },
  ];

  const deploymentRuns = [
    {
      id: "run-1",
      target_channel: "stable",
      status: "succeeded",
      preflight_json: JSON.stringify([
        "Typecheck + lint gate: pass",
        "Vitest + UI gate: pass",
        "Cargo test + backend: pass",
        "Playwright smoke + visual + a11y: pass",
        "Bundle + asset budget: under budget",
        "Notarize + sign .app: accepted",
      ]),
      rollback_available: true,
      created_at: "2026-04-24T12:14:00Z",
      completed_at: "2026-04-24T12:18:00Z",
    },
    {
      id: "run-2",
      target_channel: "canary",
      status: "paused",
      preflight_json: JSON.stringify([
        "Retrieval p95 exceeded 80ms budget",
        "Auto-paused · root cause: index rebuild",
      ]),
      rollback_available: true,
      created_at: "2026-04-24T09:41:00Z",
      completed_at: null,
    },
    {
      id: "run-3",
      target_channel: "stable",
      status: "succeeded",
      preflight_json: JSON.stringify(["All gates green"]),
      rollback_available: true,
      created_at: "2026-04-23T17:58:00Z",
      completed_at: "2026-04-23T18:04:00Z",
    },
    {
      id: "run-4",
      target_channel: "stable",
      status: "rolled_back",
      preflight_json: JSON.stringify([
        "Confidence regression (v1.1.3-rc): 0.89 vs baseline 0.92",
        "Auto-rolled back to v1.1.2",
      ]),
      rollback_available: false,
      created_at: "2026-04-21T14:22:00Z",
      completed_at: "2026-04-21T14:29:00Z",
    },
  ];

  const evalRuns = [
    {
      id: "eval-4812",
      suite_name: "grounding-faithfulness-intent",
      total_cases: 250,
      passed_cases: 247,
      avg_confidence: 0.93,
      details_json: JSON.stringify({
        grounding: 0.93,
        faithfulness: 0.96,
        intent_f1: 0.914,
        retrieval_ndcg5: 0.882,
        latency_p95_ms: 1800,
        safety_refusals: "25/25",
      }),
      created_at: "2026-04-24T12:04:00Z",
    },
    {
      id: "eval-4811",
      suite_name: "grounding-faithfulness-intent",
      total_cases: 250,
      passed_cases: 244,
      avg_confidence: 0.92,
      details_json: "[]",
      created_at: "2026-04-23T17:52:00Z",
    },
    {
      id: "eval-4810",
      suite_name: "grounding-faithfulness-intent",
      total_cases: 250,
      passed_cases: 241,
      avg_confidence: 0.9,
      details_json: "[]",
      created_at: "2026-04-22T16:10:00Z",
    },
  ];

  const triageClusters = [
    {
      id: "cluster-1",
      cluster_key: "vpn-office-wifi",
      summary: "VPN fails on office Wi-Fi only — 14 tickets",
      ticket_count: 14,
      tickets_json: JSON.stringify([
        { id: "AS-4213", summary: "VPN fails only on office Wi-Fi" },
        { id: "AS-4199", summary: "Tunnel drops when I plug into ethernet" },
      ]),
      created_at: "2026-04-24T11:05:00Z",
    },
    {
      id: "cluster-2",
      cluster_key: "outlook-macos-14-5",
      summary: "Outlook crash on M3 Macs after macOS 14.5 — 9 tickets",
      ticket_count: 9,
      tickets_json: JSON.stringify([
        { id: "AS-4215", summary: "Outlook keeps crashing on M3 after 14.5" },
        { id: "AS-4204", summary: "Classic Outlook won't open macOS 14.5" },
      ]),
      created_at: "2026-04-23T16:00:00Z",
    },
    {
      id: "cluster-3",
      cluster_key: "macos_permissions_drift",
      summary: "macOS 14 permissions drift after reboot — 7 tickets",
      ticket_count: 7,
      tickets_json: JSON.stringify([
        {
          id: "AS-4191",
          summary: "Screen recording permission keeps resetting",
        },
        { id: "AS-4188", summary: "tccd keeps forgetting my choice" },
      ]),
      created_at: "2026-04-22T09:20:00Z",
    },
    {
      id: "cluster-4",
      cluster_key: "slack-compliance-export",
      summary: "Slack workspace export for compliance audit — 5 tickets",
      ticket_count: 5,
      tickets_json: JSON.stringify([
        { id: "AS-4212", summary: "Export Slack workspace archive for audit" },
      ]),
      created_at: "2026-04-21T11:15:00Z",
    },
    {
      id: "cluster-5",
      cluster_key: "touchid-sudo-persistence",
      summary: "Touch ID sudo not persisting after update — 4 tickets",
      ticket_count: 4,
      tickets_json: JSON.stringify([
        { id: "AS-4210", summary: "Touch ID for sudo on dev-provisioned Mac" },
      ]),
      created_at: "2026-04-20T14:42:00Z",
    },
  ];

  // Knowledge-base gap candidates — surfaced in the Analytics tab's
  // "Knowledge Gaps" panel. Shape matches src/types/insights.ts
  // KbGapCandidate exactly.
  interface MockKbGap {
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
  const kbGapCandidates: MockKbGap[] = [
    {
      id: "gap-1",
      query_signature: "vpn_office_wifi_fails",
      sample_query: "VPN won't connect at HQ but works on hotspot",
      occurrences: 14,
      low_confidence_count: 11,
      low_rating_count: 3,
      unsupported_claim_events: 6,
      suggested_category: "incident",
      status: "open",
      resolution_note: null,
      first_seen_at: "2026-04-10T09:14:00Z",
      last_seen_at: "2026-04-24T10:28:00Z",
    },
    {
      id: "gap-2",
      query_signature: "outlook_crash_macos_145",
      sample_query: "Outlook keeps crashing on macOS 14.5",
      occurrences: 9,
      low_confidence_count: 7,
      low_rating_count: 2,
      unsupported_claim_events: 4,
      suggested_category: "incident",
      status: "open",
      resolution_note: null,
      first_seen_at: "2026-04-12T11:02:00Z",
      last_seen_at: "2026-04-24T08:15:00Z",
    },
    {
      id: "gap-3",
      query_signature: "macos_permissions_drift",
      sample_query: "Screen recording permission keeps resetting after reboot",
      occurrences: 7,
      low_confidence_count: 5,
      low_rating_count: 2,
      unsupported_claim_events: 3,
      suggested_category: "howto",
      status: "open",
      resolution_note: null,
      first_seen_at: "2026-04-14T13:30:00Z",
      last_seen_at: "2026-04-23T17:08:00Z",
    },
    {
      id: "gap-4",
      query_signature: "slack_export_compliance",
      sample_query: "Export Slack workspace archive for SOC 2 compliance audit",
      occurrences: 5,
      low_confidence_count: 4,
      low_rating_count: 1,
      unsupported_claim_events: 2,
      suggested_category: "policy",
      status: "open",
      resolution_note: null,
      first_seen_at: "2026-04-16T10:44:00Z",
      last_seen_at: "2026-04-22T15:20:00Z",
    },
    {
      id: "gap-5",
      query_signature: "touchid_sudo_persistence",
      sample_query: "Touch ID for sudo broken after macOS update",
      occurrences: 4,
      low_confidence_count: 3,
      low_rating_count: 1,
      unsupported_claim_events: 1,
      suggested_category: "howto",
      status: "open",
      resolution_note: null,
      first_seen_at: "2026-04-18T14:02:00Z",
      last_seen_at: "2026-04-23T09:55:00Z",
    },
  ];

  const runbookSessions = [
    {
      id: "runbook-1",
      scenario: "security-incident",
      scope_key: "ops:global",
      status: "active",
      steps_json: JSON.stringify([
        "Acknowledge incident",
        "Contain access",
        "Notify stakeholders",
      ]),
      current_step: 0,
      created_at: "2026-02-03T11:10:00Z",
      updated_at: "2026-02-03T11:10:00Z",
    },
  ];

  const runbookTemplates = [
    {
      id: "runbook-template-1",
      name: "Security Incident",
      scenario: "security-incident",
      steps_json: JSON.stringify([
        "Acknowledge incident",
        "Contain access",
        "Notify stakeholders",
      ]),
      created_at: "2026-02-03T11:08:00Z",
      updated_at: "2026-02-03T11:08:00Z",
    },
  ];

  const runbookEvidence: Array<{
    id: string;
    session_id: string;
    step_index: number;
    status: string;
    evidence_text: string;
    skip_reason: string | null;
    created_at: string;
  }> = [];

  const resolutionKits = [
    {
      id: "kit-1",
      name: "VPN Incident Starter",
      summary: "Baseline steps for repeated VPN incidents.",
      category: "incident",
      response_template:
        "We are reviewing the VPN incident and will update you shortly.",
      checklist_items_json: JSON.stringify([
        "Confirm scope",
        "Check recent network changes",
      ]),
      kb_document_ids_json: JSON.stringify(["doc-1"]),
      runbook_scenario: "security-incident",
      approval_hint: null,
      created_at: "2026-02-03T11:09:00Z",
      updated_at: "2026-02-03T11:09:00Z",
    },
  ];

  const workspaceFavorites: Array<{
    id: string;
    kind: "runbook" | "policy" | "kb" | "kit";
    label: string;
    resource_id: string;
    metadata_json: string | null;
    created_at: string;
    updated_at: string;
  }> = [];

  const dispatchHistory: Array<{
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
  }> = [];

  const caseOutcomes: Array<{
    id: string;
    draft_id: string;
    status: string;
    outcome_summary: string;
    handoff_pack_json: string | null;
    kb_draft_json: string | null;
    evidence_pack_json: string | null;
    tags_json: string | null;
    created_at: string;
    updated_at: string;
  }> = [];

  const integrationConfigs = [
    {
      id: "integration-1",
      integration_type: "servicenow",
      enabled: true,
      config_json: '{"endpoint":"https://servicenow.example.com"}',
      updated_at: "2026-02-03T11:15:00Z",
    },
    {
      id: "integration-2",
      integration_type: "slack",
      enabled: false,
      config_json: null,
      updated_at: "2026-02-03T11:15:00Z",
    },
    {
      id: "integration-3",
      integration_type: "teams",
      enabled: false,
      config_json: null,
      updated_at: "2026-02-03T11:15:00Z",
    },
  ];

  type MockDraftRecord = {
    id: string;
    input_text: string;
    summary_text: string | null;
    diagnosis_json: string | null;
    response_text: string | null;
    ticket_id: string | null;
    kb_sources_json: string | null;
    created_at: string;
    updated_at: string;
    is_autosave: boolean;
    model_name?: string | null;
  };

  const draftStore: MockDraftRecord[] = [];

  mockWindows("main");
  mockIPC(
    async (cmd, payload) => {
      switch (cmd) {
        case "initialize_app":
        case "unlock_with_passphrase":
          return {
            is_first_run: false,
            vector_enabled: false,
            vector_store_ready: false,
            key_storage_mode: "keychain",
            passphrase_required: false,
            recovery_issue: null,
          };
        case "check_fts5_enabled":
          return true;
        case "get_memory_kernel_integration_pin":
          return {
            memorykernel_repo: "https://github.com/saagar210/MemoryKernel",
            release_tag: "v0.3.2",
            commit_sha: "cf331449e1589581a5dcbb3adecd3e9ae4509277",
            expected_service_contract_version: "service.v2",
            expected_api_contract_version: "api.v1",
            expected_integration_baseline: "integration/v1",
            default_base_url: "http://127.0.0.1:4010",
            default_timeout_ms: 2500,
          };
        case "get_memory_kernel_preflight_status":
          return {
            enabled: true,
            ready: false,
            enrichment_enabled: false,
            status: "offline",
            message:
              "MemoryKernel service is unavailable at http://127.0.0.1:4010",
            base_url: "http://127.0.0.1:4010",
            service_contract_version: null,
            api_contract_version: null,
            expected_service_contract_version: "service.v2",
            expected_api_contract_version: "api.v1",
            integration_baseline: "integration/v1",
            release_tag: "v0.3.2",
            commit_sha: "cf331449e1589581a5dcbb3adecd3e9ae4509277",
          };
        case "memory_kernel_query_ask":
          return {
            applied: false,
            status: "fallback",
            message: "MemoryKernel enrichment currently unavailable",
            fallback_reason: "offline",
            machine_error_code: null,
            context_package_id: null,
            enrichment_text: null,
            preflight: {
              enabled: true,
              ready: false,
              enrichment_enabled: false,
              status: "offline",
              message:
                "MemoryKernel service is unavailable at http://127.0.0.1:4010",
              base_url: "http://127.0.0.1:4010",
              service_contract_version: null,
              api_contract_version: null,
              expected_service_contract_version: "service.v2",
              expected_api_contract_version: "api.v1",
              integration_baseline: "integration/v1",
              release_tag: "v0.3.2",
              commit_sha: "cf331449e1589581a5dcbb3adecd3e9ae4509277",
            },
          };
        case "check_db_integrity":
          return true;
        case "init_llm_engine":
        case "init_embedding_engine":
        case "cancel_generation":
        case "configure_jira":
        case "clear_jira_config":
        case "set_context_window":
        case "set_vector_consent":
        case "set_kb_folder":
        case "index_kb":
        case "generate_kb_embeddings":
        case "log_analytics_event":
          return null;
        case "get_model_state":
          return {
            llm_model_id: null,
            llm_model_path: null,
            llm_loaded: true,
            embeddings_model_path: null,
            embeddings_loaded: false,
          };
        case "is_model_loaded":
          return true;
        case "get_model_info":
          return {
            id: "llama-3.1-8b-instruct",
            name: "Llama 3.1 8B Instruct",
            n_ctx_train: 8192,
          };
        case "list_downloaded_models":
          return ["llama-3.1-8b-instruct"];
        case "get_context_window":
          return 4096;
        case "is_embedding_model_loaded":
        case "is_embedding_model_downloaded":
          return false;
        case "get_embedding_model_info":
          return null;
        case "get_embedding_model_path":
          return null;
        case "get_vector_consent":
          return {
            enabled: false,
            consented_at: null,
            encryption_supported: true,
          };
        case "get_kb_folder":
          return "/mock/kb";
        case "get_kb_stats":
          return kbStats;
        case "list_kb_documents":
          return kbDocuments;
        case "list_namespaces":
          return [{ id: "default", name: "default" }];
        case "search_kb":
        case "search_kb_with_options":
          return mockSearchResults();
        case "get_search_context":
          return "Source: Remote Work Policy";
        case "list_templates":
        case "list_saved_response_templates":
        case "find_similar_saved_responses":
        case "get_alternatives_for_draft":
        case "get_draft_versions":
          return [];
        case "list_drafts": {
          const body = payload as { limit?: number } | undefined;
          const limit = body?.limit ?? 50;
          return draftStore
            .filter((draft) => !draft.is_autosave)
            .slice()
            .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
            .slice(0, limit);
        }
        case "list_autosaves": {
          const body = payload as { limit?: number } | undefined;
          const limit = body?.limit ?? 50;
          return draftStore
            .filter((draft) => draft.is_autosave)
            .slice()
            .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
            .slice(0, limit);
        }
        case "search_drafts": {
          const body = payload as
            | { query?: string; limit?: number }
            | undefined;
          const query = (body?.query ?? "").toLowerCase().trim();
          const limit = body?.limit ?? 50;
          if (!query) {
            return draftStore
              .filter((draft) => !draft.is_autosave)
              .slice(0, limit);
          }

          return draftStore
            .filter((draft) => {
              if (draft.is_autosave) {
                return false;
              }
              const haystack = [
                draft.input_text,
                draft.summary_text,
                draft.ticket_id,
                draft.response_text,
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
              return haystack.includes(query);
            })
            .slice(0, limit);
        }
        case "get_draft": {
          const body = payload as { draftId?: string } | undefined;
          const match = draftStore.find((draft) => draft.id === body?.draftId);
          if (!match) {
            throw new Error(`Draft not found: ${body?.draftId}`);
          }
          return match;
        }
        case "save_draft": {
          const body = payload as { draft?: MockDraftRecord } | undefined;
          const draft = body?.draft;
          if (!draft) {
            return "mock-draft-id";
          }

          const atRiskMarker = "[e2e-at-risk]";
          const shouldBackdate =
            draft.input_text?.includes(atRiskMarker) ?? false;
          const normalizedDraft: MockDraftRecord = {
            ...draft,
            input_text: shouldBackdate
              ? draft.input_text.replace(atRiskMarker, "").trim()
              : draft.input_text,
            updated_at: shouldBackdate
              ? "2025-01-01T00:00:00.000Z"
              : draft.updated_at,
            created_at: shouldBackdate
              ? "2025-01-01T00:00:00.000Z"
              : draft.created_at,
          };

          const existingIndex = draftStore.findIndex(
            (item) => item.id === draft.id,
          );
          if (existingIndex >= 0) {
            draftStore[existingIndex] = normalizedDraft;
          } else {
            draftStore.push(normalizedDraft);
          }
          return normalizedDraft.id;
        }
        case "delete_draft": {
          const body = payload as { draftId?: string } | undefined;
          const draftId = body?.draftId;
          if (!draftId) {
            return null;
          }
          const next = draftStore.filter((draft) => draft.id !== draftId);
          draftStore.splice(0, draftStore.length, ...next);
          return null;
        }
        case "generate_streaming":
        case "generate_with_context": {
          // Allow tests to exercise citation gating + copy override paths without changing
          // production behavior. Marker is only used in the e2e mock layer.
          const userInput = String((payload as any)?.params?.user_input ?? "");
          const wantsNoCitations = userInput.includes("[e2e-no-citations]");

          if (wantsNoCitations) {
            return {
              text: "I cannot provide a confident response without citations. Please verify manually or expand the knowledge base search.",
              tokens_generated: 36,
              duration_ms: 520,
              source_chunk_ids: [],
              sources: [],
              metrics: {
                tokens_per_second: 69.2,
                sources_used: 0,
                word_count: 20,
                length_target_met: true,
                context_utilization: 0.08,
              },
              prompt_template_version: "e2e-mock",
              confidence: {
                mode: "clarify",
                score: 0.42,
                rationale:
                  "No supporting knowledge base sources were found for this query.",
              },
              grounding: [],
            };
          }

          return {
            text: "Per Remote Work Policy, use the approved VPN and complete MFA before accessing internal systems.",
            tokens_generated: 48,
            duration_ms: 900,
            source_chunk_ids: ["chunk-1"],
            sources: mockSearchResults(),
            metrics: {
              tokens_per_second: 53.3,
              sources_used: 1,
              word_count: 16,
              length_target_met: true,
              context_utilization: 0.22,
            },
            prompt_template_version: "e2e-mock",
            confidence: {
              mode: "answer",
              score: 0.86,
              rationale: "Strong grounded evidence across cited sources",
            },
            grounding: [
              {
                claim: "Use approved VPN and complete MFA.",
                source_indexes: [0],
                support_level: "strong",
              },
            ],
          };
        }
        case "get_deployment_health_summary": {
          const lastRun = deploymentRuns[deploymentRuns.length - 1] ?? null;
          const signedArtifacts = deploymentArtifacts.filter(
            (a) => a.is_signed,
          ).length;
          return {
            total_artifacts: deploymentArtifacts.length,
            signed_artifacts: signedArtifacts,
            unsigned_artifacts: deploymentArtifacts.length - signedArtifacts,
            last_run: lastRun,
          };
        }
        case "list_deployment_artifacts":
          return deploymentArtifacts.slice().reverse();
        case "record_deployment_artifact": {
          const body = payload as {
            artifactType?: string;
            version?: string;
            channel?: string;
            sha256?: string;
            isSigned?: boolean;
          };
          const next = {
            id: `artifact-${deploymentArtifacts.length + 1}`,
            artifact_type: body.artifactType ?? "artifact",
            version: body.version ?? "0.0.0",
            channel: body.channel ?? "stable",
            sha256: body.sha256 ?? "",
            is_signed: !!body.isSigned,
            created_at: new Date().toISOString(),
          };
          deploymentArtifacts.push(next);
          return next.id;
        }
        case "run_deployment_preflight": {
          const checks = [
            "Database integrity: pass",
            "Model status: loaded",
            "Signed artifacts: pass",
          ];
          const run = {
            id: `run-${deploymentRuns.length + 1}`,
            target_channel: "stable",
            status: "succeeded",
            preflight_json: JSON.stringify(checks),
            rollback_available: true,
            created_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
          };
          deploymentRuns.push(run);
          return { ok: true, checks };
        }
        case "verify_signed_artifact": {
          const body = payload as {
            artifactId?: string;
            expectedSha256?: string | null;
          };
          const artifact =
            deploymentArtifacts.find((a) => a.id === body.artifactId) ??
            deploymentArtifacts[0];
          const expected = body.expectedSha256 ?? null;
          const hashMatches = expected
            ? artifact.sha256.toLowerCase() === expected.toLowerCase()
            : true;
          return {
            artifact,
            is_signed: artifact.is_signed,
            hash_matches: hashMatches,
            status:
              artifact.is_signed && hashMatches
                ? "verified"
                : artifact.is_signed
                  ? "hash_mismatch"
                  : "unsigned",
          };
        }
        case "rollback_deployment_run": {
          const body = payload as { runId?: string };
          const run =
            deploymentRuns.find((r) => r.id === body.runId) ??
            deploymentRuns[deploymentRuns.length - 1];
          if (run) {
            run.status = "rolled_back";
            run.completed_at = new Date().toISOString();
          }
          return null;
        }
        case "list_eval_runs":
          return evalRuns.slice().reverse();
        case "run_eval_harness": {
          const body = payload as {
            suiteName?: string;
            cases?: Array<{ query?: string }>;
          };
          const total = body.cases?.length ?? 0;
          const passed = total;
          const avgConfidence = 0.74;
          const run = {
            id: `eval-${evalRuns.length + 1}`,
            suite_name: body.suiteName ?? "suite",
            total_cases: total,
            passed_cases: passed,
            avg_confidence: avgConfidence,
            details_json: JSON.stringify(body.cases ?? []),
            created_at: new Date().toISOString(),
          };
          evalRuns.push(run);
          return {
            run_id: run.id,
            total_cases: total,
            passed_cases: passed,
            avg_confidence: avgConfidence,
          };
        }
        case "list_recent_triage_clusters":
          return triageClusters.slice().reverse();
        case "get_kb_gap_candidates": {
          const body = (payload ?? {}) as {
            limit?: number;
            status?: string | null;
          };
          const status = body.status ?? null;
          const filtered =
            status != null
              ? kbGapCandidates.filter((g) => g.status === status)
              : kbGapCandidates.slice();
          const limit =
            typeof body.limit === "number" ? body.limit : filtered.length;
          return filtered.slice(0, limit);
        }
        case "update_kb_gap_status": {
          const body = (payload ?? {}) as {
            gapId?: string;
            status?: string;
            note?: string | null;
          };
          const idx = kbGapCandidates.findIndex((g) => g.id === body.gapId);
          if (idx >= 0 && body.status) {
            kbGapCandidates[idx] = {
              ...kbGapCandidates[idx]!,
              status: body.status,
              resolution_note: body.note ?? null,
            };
          }
          return null;
        }
        case "cluster_tickets_for_triage": {
          const body = payload as {
            tickets?: Array<{ id?: string; summary?: string }>;
          };
          const tickets = body.tickets ?? [];
          const byKey = new Map<
            string,
            Array<{ id?: string; summary?: string }>
          >();
          for (const ticket of tickets) {
            const key =
              ticket.summary?.split(/\s+/)[0]?.toLowerCase() || "general";
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key)!.push(ticket);
          }
          const output = Array.from(byKey.entries()).map(
            ([cluster_key, group], idx) => {
              const record = {
                id: `cluster-${triageClusters.length + idx + 1}`,
                cluster_key,
                summary: `${group.length} tickets about ${cluster_key}`,
                ticket_count: group.length,
                tickets_json: JSON.stringify(group),
                created_at: new Date().toISOString(),
              };
              triageClusters.push(record);
              return {
                cluster_key,
                summary: record.summary,
                ticket_ids: group.map((ticket) => ticket.id ?? ""),
              };
            },
          );
          return output;
        }
        case "list_runbook_sessions":
          return runbookSessions
            .filter((session) => {
              const body = payload as { scopeKey?: string | null } | undefined;
              if (!body?.scopeKey) {
                return true;
              }
              return session.scope_key === body.scopeKey;
            })
            .slice()
            .reverse();
        case "reassign_runbook_session_scope": {
          const body = payload as
            | { fromScopeKey?: string; toScopeKey?: string }
            | undefined;
          runbookSessions.forEach((session) => {
            if (session.scope_key === body?.fromScopeKey && body?.toScopeKey) {
              session.scope_key = body.toScopeKey;
              session.updated_at = new Date().toISOString();
            }
          });
          return null;
        }
        case "start_runbook_session": {
          const body = payload as {
            scenario?: string;
            steps?: string[];
            scopeKey?: string;
          };
          const next = {
            id: `runbook-${runbookSessions.length + 1}`,
            scenario: body.scenario ?? "runbook",
            scope_key: body.scopeKey ?? "workspace:mock",
            status: "active",
            steps_json: JSON.stringify(body.steps ?? []),
            current_step: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          runbookSessions.push(next);
          return next;
        }
        case "advance_runbook_session": {
          const body = payload as {
            sessionId?: string;
            currentStep?: number;
            status?: string | null;
          };
          const session = runbookSessions.find((s) => s.id === body.sessionId);
          if (session) {
            session.current_step = body.currentStep ?? session.current_step;
            if (body.status) session.status = body.status;
            session.updated_at = new Date().toISOString();
          }
          return null;
        }
        case "list_runbook_templates":
          return runbookTemplates.slice().reverse();
        case "save_runbook_template": {
          const body = payload as
            | { template?: (typeof runbookTemplates)[number] }
            | undefined;
          const template = body?.template;
          if (!template) {
            return "runbook-template-new";
          }
          const id =
            template.id || `runbook-template-${runbookTemplates.length + 1}`;
          const normalized = {
            ...template,
            id,
            created_at: template.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          const existingIndex = runbookTemplates.findIndex(
            (item) => item.id === id,
          );
          if (existingIndex >= 0) {
            runbookTemplates[existingIndex] = normalized;
          } else {
            runbookTemplates.push(normalized);
          }
          return id;
        }
        case "list_runbook_step_evidence": {
          const body = payload as { sessionId?: string } | undefined;
          return runbookEvidence.filter(
            (item) => item.session_id === body?.sessionId,
          );
        }
        case "add_runbook_step_evidence": {
          const body = payload as
            | {
                sessionId?: string;
                stepIndex?: number;
                status?: string;
                evidenceText?: string;
                skipReason?: string | null;
              }
            | undefined;
          const entry = {
            id: `runbook-evidence-${runbookEvidence.length + 1}`,
            session_id: body?.sessionId ?? "runbook-1",
            step_index: body?.stepIndex ?? 0,
            status: body?.status ?? "completed",
            evidence_text: body?.evidenceText ?? "",
            skip_reason: body?.skipReason ?? null,
            created_at: new Date().toISOString(),
          };
          runbookEvidence.push(entry);
          return entry;
        }
        case "list_integrations":
          return integrationConfigs;
        case "configure_integration": {
          const body = payload as {
            integrationType?: string;
            enabled?: boolean;
            configJson?: string | null;
          };
          const type = body.integrationType ?? "unknown";
          const existing = integrationConfigs.find(
            (item) => item.integration_type === type,
          );
          if (existing) {
            existing.enabled = !!body.enabled;
            existing.config_json = body.configJson ?? null;
            existing.updated_at = new Date().toISOString();
          } else {
            integrationConfigs.push({
              id: `integration-${integrationConfigs.length + 1}`,
              integration_type: type,
              enabled: !!body.enabled,
              config_json: body.configJson ?? null,
              updated_at: new Date().toISOString(),
            });
          }
          return null;
        }
        case "list_resolution_kits":
          return resolutionKits.slice().reverse();
        case "save_resolution_kit": {
          const body = payload as
            | { kit?: (typeof resolutionKits)[number] }
            | undefined;
          const kit = body?.kit;
          if (!kit) {
            return "kit-new";
          }
          const id = kit.id || `kit-${resolutionKits.length + 1}`;
          const normalized = {
            ...kit,
            id,
            created_at: kit.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          const existingIndex = resolutionKits.findIndex(
            (item) => item.id === id,
          );
          if (existingIndex >= 0) {
            resolutionKits[existingIndex] = normalized;
          } else {
            resolutionKits.push(normalized);
          }
          return id;
        }
        case "list_workspace_favorites":
          return workspaceFavorites.slice().reverse();
        case "save_workspace_favorite": {
          const body = payload as
            | { favorite?: (typeof workspaceFavorites)[number] }
            | undefined;
          const favorite = body?.favorite;
          if (!favorite) {
            return "favorite-new";
          }
          const existing = workspaceFavorites.find(
            (item) =>
              item.kind === favorite.kind &&
              item.resource_id === favorite.resource_id,
          );
          if (existing) {
            existing.label = favorite.label;
            existing.metadata_json = favorite.metadata_json ?? null;
            existing.updated_at = new Date().toISOString();
            return existing.id;
          }
          const next = {
            ...favorite,
            id: favorite.id || `favorite-${workspaceFavorites.length + 1}`,
            created_at: favorite.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          workspaceFavorites.push(next);
          return next.id;
        }
        case "delete_workspace_favorite": {
          const body = payload as { favoriteId?: string } | undefined;
          const next = workspaceFavorites.filter(
            (item) => item.id !== body?.favoriteId,
          );
          workspaceFavorites.splice(0, workspaceFavorites.length, ...next);
          return null;
        }
        case "preview_collaboration_dispatch": {
          const body = payload as
            | {
                integrationType?: "jira" | "servicenow" | "slack" | "teams";
                draftId?: string | null;
                title?: string;
                destinationLabel?: string;
                payloadPreview?: string;
                metadataJson?: string | null;
              }
            | undefined;
          const record = {
            id: `dispatch-${dispatchHistory.length + 1}`,
            integration_type: body?.integrationType ?? "jira",
            draft_id: body?.draftId ?? null,
            title: body?.title ?? "Dispatch preview",
            destination_label: body?.destinationLabel ?? "Jira",
            payload_preview: body?.payloadPreview ?? "",
            status: "previewed" as const,
            metadata_json: body?.metadataJson ?? null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          dispatchHistory.push(record);
          return record;
        }
        case "confirm_collaboration_dispatch":
        case "send_collaboration_dispatch": {
          const body = payload as { dispatchId?: string } | undefined;
          const record = dispatchHistory.find(
            (item) => item.id === body?.dispatchId,
          );
          if (!record) {
            throw new Error(`Dispatch not found: ${body?.dispatchId}`);
          }
          record.status = "sent";
          record.updated_at = new Date().toISOString();
          return record;
        }
        case "cancel_collaboration_dispatch": {
          const body = payload as { dispatchId?: string } | undefined;
          const record = dispatchHistory.find(
            (item) => item.id === body?.dispatchId,
          );
          if (!record) {
            throw new Error(`Dispatch not found: ${body?.dispatchId}`);
          }
          record.status = "cancelled";
          record.updated_at = new Date().toISOString();
          return record;
        }
        case "list_dispatch_history":
          return dispatchHistory.slice().reverse();
        case "save_case_outcome": {
          const body = payload as
            | { outcome?: (typeof caseOutcomes)[number] }
            | undefined;
          const outcome = body?.outcome;
          if (!outcome) {
            return "case-outcome-new";
          }
          const id = outcome.id || `case-outcome-${caseOutcomes.length + 1}`;
          const normalized = {
            ...outcome,
            id,
            created_at: outcome.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          const existingIndex = caseOutcomes.findIndex(
            (item) => item.id === id,
          );
          if (existingIndex >= 0) {
            caseOutcomes[existingIndex] = normalized;
          } else {
            caseOutcomes.push(normalized);
          }
          return id;
        }
        case "list_case_outcomes":
          return caseOutcomes.slice().reverse();
        case "check_search_api_health":
          return true;
        case "get_search_api_health_status":
          return {
            healthy: true,
            status: "ok",
            message: "Connected",
            base_url: "http://localhost:3000",
          };
        case "hybrid_search":
          return {
            status: "success",
            query: (payload as { query?: string })?.query ?? "mock query",
            query_id: "query-e2e-1",
            intent: "POLICY",
            intent_confidence: 0.93,
            results_count: 1,
            results: [
              {
                rank: 1,
                article_id: "article-1",
                title: "Removable Media Policy",
                category: "POLICY",
                preview: "USB drives are restricted unless approved.",
                source_document: "doc-2",
                section: "Section 4.2",
                scores: { bm25: 0.91, vector: 0.88, fused: 0.9 },
              },
            ],
            metrics: {
              latency_ms: 18.7,
              embedding_time_ms: 2.1,
              search_time_ms: 6.3,
              result_count: 1,
              timestamp: "2026-02-03T10:00:00Z",
            },
          };
        case "submit_search_feedback":
          return "Feedback submitted";
        case "get_search_api_stats":
          return {
            queries_24h: 12,
            queries_total: 240,
            latency_ms: { avg: 21, p50: 12, p95: 55, p99: 91 },
            feedback_stats: { helpful: 8, not_helpful: 1, incorrect: 0 },
            intent_distribution: { POLICY: 6, PROCEDURE: 4, REFERENCE: 2 },
          };
        case "get_analytics_summary":
          return {
            total_events: 18,
            responses_generated: 6,
            searches_performed: 5,
            drafts_saved: 7,
            daily_counts: [
              { date: "2026-02-06", count: 4 },
              { date: "2026-02-07", count: 6 },
              { date: "2026-02-08", count: 8 },
            ],
            average_rating: 4.4,
            total_ratings: 5,
            rating_distribution: [0, 0, 1, 1, 3],
          };
        case "get_response_quality_summary":
          return {
            snapshots_count: 5,
            saved_count: 4,
            copied_count: 3,
            avg_word_count: 133.2,
            avg_edit_ratio: 0.21,
            edited_save_rate: 0.5,
            avg_time_to_draft_ms: 8400,
            median_time_to_draft_ms: 7900,
            copy_per_saved_ratio: 0.75,
          };
        case "is_jira_configured":
          return false;
        case "get_jira_config":
          return null;
        case "get_startup_metrics":
          return { total_ms: 1200, init_app_ms: 420, models_cached: true };
        case "get_audit_entries":
          return [];
        case "list_custom_variables":
          return [];
        default:
          // Keep the app responsive even when new commands are added.
          if (cmd.startsWith("list_") || cmd.startsWith("get_")) return [];
          if (cmd.startsWith("is_") || cmd.startsWith("has_")) return false;
          if (cmd.startsWith("save_") || cmd.startsWith("create_")) return "ok";
          return null;
      }
    },
    { shouldMockEvents: true },
  );
}
