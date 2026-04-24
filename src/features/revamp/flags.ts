export type RevampFlagId =
  | "ASSISTSUPPORT_REVAMP_COMMAND_PALETTE_V2"
  | "ASSISTSUPPORT_REVAMP_WORKSPACE_HERO"
  | "ASSISTSUPPORT_TICKET_WORKSPACE_V2"
  | "ASSISTSUPPORT_STRUCTURED_INTAKE"
  | "ASSISTSUPPORT_SIMILAR_CASES"
  | "ASSISTSUPPORT_NEXT_BEST_ACTION"
  | "ASSISTSUPPORT_GUIDED_RUNBOOKS_V2"
  | "ASSISTSUPPORT_POLICY_APPROVAL_ASSISTANT"
  | "ASSISTSUPPORT_BATCH_TRIAGE"
  | "ASSISTSUPPORT_COLLABORATION_DISPATCH"
  | "ASSISTSUPPORT_WORKSPACE_COMMAND_PALETTE"
  | "ASSISTSUPPORT_LLM_ROUTER_V2"
  | "ASSISTSUPPORT_ENABLE_ADMIN_TABS"
  | "ASSISTSUPPORT_ENABLE_NETWORK_INGEST";

interface RevampFlagDefinition {
  id: RevampFlagId;
  envKey: string;
  storageKey: string;
  defaultValue: boolean;
}

const REVAMP_FLAG_DEFINITIONS: Record<RevampFlagId, RevampFlagDefinition> = {
  ASSISTSUPPORT_REVAMP_COMMAND_PALETTE_V2: {
    id: "ASSISTSUPPORT_REVAMP_COMMAND_PALETTE_V2",
    envKey: "VITE_ASSISTSUPPORT_REVAMP_COMMAND_PALETTE_V2",
    storageKey: "assistsupport.flag.ASSISTSUPPORT_REVAMP_COMMAND_PALETTE_V2",
    defaultValue: true,
  },
  ASSISTSUPPORT_REVAMP_WORKSPACE_HERO: {
    id: "ASSISTSUPPORT_REVAMP_WORKSPACE_HERO",
    envKey: "VITE_ASSISTSUPPORT_REVAMP_WORKSPACE_HERO",
    storageKey: "assistsupport.flag.ASSISTSUPPORT_REVAMP_WORKSPACE_HERO",
    defaultValue: false,
  },
  ASSISTSUPPORT_TICKET_WORKSPACE_V2: {
    id: "ASSISTSUPPORT_TICKET_WORKSPACE_V2",
    envKey: "VITE_ASSISTSUPPORT_TICKET_WORKSPACE_V2",
    storageKey: "assistsupport.flag.ASSISTSUPPORT_TICKET_WORKSPACE_V2",
    defaultValue: true,
  },
  ASSISTSUPPORT_STRUCTURED_INTAKE: {
    id: "ASSISTSUPPORT_STRUCTURED_INTAKE",
    envKey: "VITE_ASSISTSUPPORT_STRUCTURED_INTAKE",
    storageKey: "assistsupport.flag.ASSISTSUPPORT_STRUCTURED_INTAKE",
    defaultValue: true,
  },
  ASSISTSUPPORT_SIMILAR_CASES: {
    id: "ASSISTSUPPORT_SIMILAR_CASES",
    envKey: "VITE_ASSISTSUPPORT_SIMILAR_CASES",
    storageKey: "assistsupport.flag.ASSISTSUPPORT_SIMILAR_CASES",
    defaultValue: true,
  },
  ASSISTSUPPORT_NEXT_BEST_ACTION: {
    id: "ASSISTSUPPORT_NEXT_BEST_ACTION",
    envKey: "VITE_ASSISTSUPPORT_NEXT_BEST_ACTION",
    storageKey: "assistsupport.flag.ASSISTSUPPORT_NEXT_BEST_ACTION",
    defaultValue: true,
  },
  ASSISTSUPPORT_GUIDED_RUNBOOKS_V2: {
    id: "ASSISTSUPPORT_GUIDED_RUNBOOKS_V2",
    envKey: "VITE_ASSISTSUPPORT_GUIDED_RUNBOOKS_V2",
    storageKey: "assistsupport.flag.ASSISTSUPPORT_GUIDED_RUNBOOKS_V2",
    defaultValue: true,
  },
  ASSISTSUPPORT_POLICY_APPROVAL_ASSISTANT: {
    id: "ASSISTSUPPORT_POLICY_APPROVAL_ASSISTANT",
    envKey: "VITE_ASSISTSUPPORT_POLICY_APPROVAL_ASSISTANT",
    storageKey: "assistsupport.flag.ASSISTSUPPORT_POLICY_APPROVAL_ASSISTANT",
    defaultValue: true,
  },
  ASSISTSUPPORT_BATCH_TRIAGE: {
    id: "ASSISTSUPPORT_BATCH_TRIAGE",
    envKey: "VITE_ASSISTSUPPORT_BATCH_TRIAGE",
    storageKey: "assistsupport.flag.ASSISTSUPPORT_BATCH_TRIAGE",
    defaultValue: true,
  },
  ASSISTSUPPORT_COLLABORATION_DISPATCH: {
    id: "ASSISTSUPPORT_COLLABORATION_DISPATCH",
    envKey: "VITE_ASSISTSUPPORT_COLLABORATION_DISPATCH",
    storageKey: "assistsupport.flag.ASSISTSUPPORT_COLLABORATION_DISPATCH",
    defaultValue: false,
  },
  ASSISTSUPPORT_WORKSPACE_COMMAND_PALETTE: {
    id: "ASSISTSUPPORT_WORKSPACE_COMMAND_PALETTE",
    envKey: "VITE_ASSISTSUPPORT_WORKSPACE_COMMAND_PALETTE",
    storageKey: "assistsupport.flag.ASSISTSUPPORT_WORKSPACE_COMMAND_PALETTE",
    defaultValue: true,
  },
  ASSISTSUPPORT_LLM_ROUTER_V2: {
    id: "ASSISTSUPPORT_LLM_ROUTER_V2",
    envKey: "VITE_ASSISTSUPPORT_LLM_ROUTER_V2",
    storageKey: "assistsupport.flag.ASSISTSUPPORT_LLM_ROUTER_V2",
    defaultValue: false,
  },
  ASSISTSUPPORT_ENABLE_ADMIN_TABS: {
    id: "ASSISTSUPPORT_ENABLE_ADMIN_TABS",
    envKey: "VITE_ASSISTSUPPORT_ENABLE_ADMIN_TABS",
    storageKey: "assistsupport.flag.ASSISTSUPPORT_ENABLE_ADMIN_TABS",
    defaultValue: false,
  },
  ASSISTSUPPORT_ENABLE_NETWORK_INGEST: {
    id: "ASSISTSUPPORT_ENABLE_NETWORK_INGEST",
    envKey: "VITE_ASSISTSUPPORT_ENABLE_NETWORK_INGEST",
    storageKey: "assistsupport.flag.ASSISTSUPPORT_ENABLE_NETWORK_INGEST",
    defaultValue: false,
  },
};

export type RevampFlags = Record<RevampFlagId, boolean>;

interface ResolveRevampFlagsOptions {
  env?: Record<string, unknown>;
  storage?: Pick<Storage, "getItem"> | null;
}

function parseBooleanLike(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off", "disabled"].includes(normalized)) {
    return false;
  }

  return null;
}

function resolveStorage(
  providedStorage?: Pick<Storage, "getItem"> | null,
): Pick<Storage, "getItem"> | null {
  if (providedStorage !== undefined) {
    return providedStorage;
  }

  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function resolveRevampFlags({
  env,
  storage,
}: ResolveRevampFlagsOptions = {}): RevampFlags {
  const envValues =
    env ?? (import.meta.env as unknown as Record<string, unknown>);
  const resolvedStorage = resolveStorage(storage);
  const mode = String(envValues.MODE ?? "")
    .trim()
    .toLowerCase();
  const devFlag = parseBooleanLike(envValues.DEV);
  const isDevelopment = devFlag ?? (mode === "development" || mode === "dev");
  const policyFlagIds: ReadonlySet<RevampFlagId> = new Set([
    "ASSISTSUPPORT_ENABLE_ADMIN_TABS",
    "ASSISTSUPPORT_ENABLE_NETWORK_INGEST",
  ]);

  return (
    Object.values(REVAMP_FLAG_DEFINITIONS) as RevampFlagDefinition[]
  ).reduce<RevampFlags>(
    (acc, definition) => {
      const envValue = parseBooleanLike(envValues[definition.envKey]);

      let storageValue: boolean | null = null;
      try {
        storageValue = parseBooleanLike(
          resolvedStorage?.getItem(definition.storageKey),
        );
      } catch {
        storageValue = null;
      }

      // Storage overrides are useful for local rehearsal, but policy flags must be env-authoritative
      // outside development builds so we don't "accidentally" enable admin/network surfaces.
      const effectiveStorageValue =
        !isDevelopment && policyFlagIds.has(definition.id)
          ? null
          : storageValue;

      acc[definition.id] =
        effectiveStorageValue ?? envValue ?? definition.defaultValue;
      return acc;
    },
    {
      ASSISTSUPPORT_REVAMP_COMMAND_PALETTE_V2: true,
      ASSISTSUPPORT_REVAMP_WORKSPACE_HERO: false,
      ASSISTSUPPORT_TICKET_WORKSPACE_V2: true,
      ASSISTSUPPORT_STRUCTURED_INTAKE: true,
      ASSISTSUPPORT_SIMILAR_CASES: true,
      ASSISTSUPPORT_NEXT_BEST_ACTION: true,
      ASSISTSUPPORT_GUIDED_RUNBOOKS_V2: true,
      ASSISTSUPPORT_POLICY_APPROVAL_ASSISTANT: true,
      ASSISTSUPPORT_BATCH_TRIAGE: true,
      ASSISTSUPPORT_COLLABORATION_DISPATCH: false,
      ASSISTSUPPORT_WORKSPACE_COMMAND_PALETTE: true,
      ASSISTSUPPORT_LLM_ROUTER_V2: false,
      ASSISTSUPPORT_ENABLE_ADMIN_TABS: false,
      ASSISTSUPPORT_ENABLE_NETWORK_INGEST: false,
    },
  );
}
