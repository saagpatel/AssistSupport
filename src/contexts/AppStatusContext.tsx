import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ModelInfo } from "../types/llm";
import type { MemoryKernelPreflightStatus } from "../types/settings";

export interface AppStatusState {
  // LLM status
  llmLoaded: boolean;
  llmModelName: string | null;
  llmModelInfo: ModelInfo | null;
  llmLoading: boolean;

  // Embeddings status
  embeddingsLoaded: boolean;
  embeddingsModelName: string | null;

  // Vector store status
  vectorEnabled: boolean;
  vectorConsent: boolean;

  // KB status
  kbIndexed: boolean;
  kbDocumentCount: number;
  kbChunkCount: number;

  // MemoryKernel integration status
  memoryKernelFeatureEnabled: boolean;
  memoryKernelReady: boolean;
  memoryKernelStatus: string;
  memoryKernelDetail: string;
  memoryKernelReleaseTag: string | null;
  memoryKernelCommitSha: string | null;
  memoryKernelServiceContract: string | null;
  memoryKernelApiContract: string | null;
  memoryKernelIntegrationBaseline: string | null;

  // Overall
  initialized: boolean;
  lastUpdated: Date | null;
}

interface AppStatusContextValue extends AppStatusState {
  refresh: () => Promise<void>;
  refreshLlm: () => Promise<void>;
  refreshKb: () => Promise<void>;
}

const defaultState: AppStatusState = {
  llmLoaded: false,
  llmModelName: null,
  llmModelInfo: null,
  llmLoading: false,
  embeddingsLoaded: false,
  embeddingsModelName: null,
  vectorEnabled: false,
  vectorConsent: false,
  kbIndexed: false,
  kbDocumentCount: 0,
  kbChunkCount: 0,
  memoryKernelFeatureEnabled: false,
  memoryKernelReady: false,
  memoryKernelStatus: "unknown",
  memoryKernelDetail: "Not checked",
  memoryKernelReleaseTag: null,
  memoryKernelCommitSha: null,
  memoryKernelServiceContract: null,
  memoryKernelApiContract: null,
  memoryKernelIntegrationBaseline: null,
  initialized: false,
  lastUpdated: null,
};

// ---------------------------------------------------------------------------
// Compute helpers — pure async functions returning the partial state slice
// for each backend probe. Intentionally free of setState so the caller can
// batch updates from multiple probes into a single render.
// ---------------------------------------------------------------------------

async function computeLlmStatus(): Promise<Partial<AppStatusState>> {
  try {
    const isLoaded = await invoke<boolean>("is_model_loaded");
    if (isLoaded) {
      const info = await invoke<ModelInfo | null>("get_model_info");
      return {
        llmLoaded: true,
        llmModelName: info?.name ?? info?.id ?? "Unknown",
        llmModelInfo: info,
        llmLoading: false,
      };
    }
    return {
      llmLoaded: false,
      llmModelName: null,
      llmModelInfo: null,
      llmLoading: false,
    };
  } catch (e) {
    console.error("Failed to check LLM status:", e);
    return {};
  }
}

async function computeEmbeddingsStatus(): Promise<Partial<AppStatusState>> {
  try {
    const isLoaded = await invoke<boolean>("is_embedding_model_loaded");
    return {
      embeddingsLoaded: isLoaded,
      embeddingsModelName: isLoaded ? "default" : null,
    };
  } catch {
    // Embedding check may not exist
    return {};
  }
}

async function computeVectorStatus(): Promise<Partial<AppStatusState>> {
  try {
    const consent = await invoke<{
      enabled: boolean;
      consented_at: string | null;
    }>("get_vector_consent");
    return {
      vectorEnabled: consent.enabled,
      vectorConsent: consent.enabled,
    };
  } catch {
    // Vector consent may not be available
    return {};
  }
}

async function computeKbStatus(): Promise<Partial<AppStatusState>> {
  try {
    const stats = await invoke<{
      document_count: number;
      chunk_count: number;
      namespace_count: number;
    }>("get_kb_stats");
    return {
      kbIndexed: stats.chunk_count > 0,
      kbDocumentCount: stats.document_count,
      kbChunkCount: stats.chunk_count,
    };
  } catch {
    // KB stats may fail if not initialized
    return {};
  }
}

async function computeMemoryKernelStatus(): Promise<Partial<AppStatusState>> {
  try {
    const preflight = await invoke<MemoryKernelPreflightStatus>(
      "get_memory_kernel_preflight_status",
    );
    return {
      memoryKernelFeatureEnabled: preflight.enabled,
      memoryKernelReady: preflight.ready && preflight.enrichment_enabled,
      memoryKernelStatus: preflight.status,
      memoryKernelDetail: preflight.message,
      memoryKernelReleaseTag: preflight.release_tag ?? null,
      memoryKernelCommitSha: preflight.commit_sha ?? null,
      memoryKernelServiceContract:
        preflight.service_contract_version ??
        preflight.expected_service_contract_version ??
        null,
      memoryKernelApiContract:
        preflight.api_contract_version ??
        preflight.expected_api_contract_version ??
        null,
      memoryKernelIntegrationBaseline: preflight.integration_baseline ?? null,
    };
  } catch (err) {
    return {
      memoryKernelFeatureEnabled: false,
      memoryKernelReady: false,
      memoryKernelStatus: "error",
      memoryKernelDetail: `Preflight unavailable: ${String(err)}`,
      memoryKernelReleaseTag: null,
      memoryKernelCommitSha: null,
      memoryKernelServiceContract: null,
      memoryKernelApiContract: null,
      memoryKernelIntegrationBaseline: null,
    };
  }
}

const AppStatusContext = createContext<AppStatusContextValue | null>(null);

interface Props {
  children: React.ReactNode;
  pollInterval?: number; // ms, default 10000 (10 seconds)
}

export function AppStatusProvider({ children, pollInterval = 10000 }: Props) {
  const [state, setState] = useState<AppStatusState>(defaultState);
  const pollRef = useRef<number | null>(null);

  const refreshLlm = useCallback(async () => {
    const partial = await computeLlmStatus();
    if (Object.keys(partial).length > 0) {
      setState((prev) => ({ ...prev, ...partial }));
    }
  }, []);

  const refreshKb = useCallback(async () => {
    const partial = await computeKbStatus();
    if (Object.keys(partial).length > 0) {
      setState((prev) => ({ ...prev, ...partial }));
    }
  }, []);

  const refresh = useCallback(async () => {
    const [llm, embeddings, vector, kb, memoryKernel] = await Promise.all([
      computeLlmStatus(),
      computeEmbeddingsStatus(),
      computeVectorStatus(),
      computeKbStatus(),
      computeMemoryKernelStatus(),
    ]);
    setState((prev) => ({
      ...prev,
      ...llm,
      ...embeddings,
      ...vector,
      ...kb,
      ...memoryKernel,
      initialized: true,
      lastUpdated: new Date(),
    }));
  }, []);

  // Initial load and polling. `refresh` has stable identity (empty deps),
  // so the effect only re-arms when `pollInterval` changes.
  useEffect(() => {
    refresh();

    if (pollInterval > 0) {
      pollRef.current = window.setInterval(refresh, pollInterval);
    }

    return () => {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current);
      }
    };
  }, [refresh, pollInterval]);

  const value = useMemo<AppStatusContextValue>(
    () => ({
      ...state,
      refresh,
      refreshLlm,
      refreshKb,
    }),
    [state, refresh, refreshLlm, refreshKb],
  );

  return (
    <AppStatusContext.Provider value={value}>
      {children}
    </AppStatusContext.Provider>
  );
}

export function useAppStatus(): AppStatusContextValue {
  const ctx = useContext(AppStatusContext);
  if (!ctx) {
    throw new Error("useAppStatus must be used within AppStatusProvider");
  }
  return ctx;
}
