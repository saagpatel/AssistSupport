import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PilotDashboard, PilotQueryTester } from "../Pilot";

interface PilotLoggingPolicy {
  enabled: boolean;
  retention_days: number;
  max_rows: number;
}

export function PilotDiagnosticsSection() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [policy, setPolicy] = useState<PilotLoggingPolicy | null>(null);
  const pilotLoggingEnabled = policy?.enabled ?? false;

  useEffect(() => {
    invoke<PilotLoggingPolicy>("get_pilot_logging_policy")
      .then(setPolicy)
      .catch(() =>
        setPolicy({ enabled: false, retention_days: 14, max_rows: 500 }),
      );
  }, []);

  const handleQueryLogged = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  return (
    <section
      className="analytics-section-surface analytics-section-surface-pilot"
      aria-label="Pilot diagnostics"
    >
      <div className="analytics-panel-card">
        <div className="analytics-panel-header">
          <div>
            <div className="section-title">Pilot Diagnostics</div>
            <p className="analytics-panel-subtitle">
              Validate query quality, pilot logging posture, and raw-log
              evidence without a separate Pilot tab.
            </p>
          </div>
        </div>
        <PilotQueryTester
          pilotLoggingEnabled={pilotLoggingEnabled}
          policy={policy}
          onQueryLogged={handleQueryLogged}
        />
      </div>

      <div className="analytics-panel-card">
        <PilotDashboard
          key={refreshKey}
          pilotLoggingEnabled={pilotLoggingEnabled}
          policy={policy}
        />
      </div>
    </section>
  );
}
