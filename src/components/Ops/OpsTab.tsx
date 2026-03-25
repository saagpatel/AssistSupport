import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../shared/Button';
import { useToastContext } from '../../contexts/ToastContext';
import { useSettingsOps } from '../../hooks/useSettingsOps';
import type {
  DeploymentArtifactRecord,
  DeploymentHealthSummary,
  IntegrationConfigRecord,
  SignedArtifactVerificationResult,
} from '../../types/settings';
import './OpsTab.css';

type OpsView = 'deployment' | 'integrations';

const INTEGRATION_TYPES = ['servicenow', 'slack', 'teams'] as const;

function normalizeIntegrationConfigDraft(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('Integration config must be valid JSON');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Integration config must be a JSON object');
  }

  return JSON.stringify(parsed);
}

export function OpsTab() {
  const { success: showSuccess, error: showError } = useToastContext();
  const {
    getDeploymentHealthSummary,
    runDeploymentPreflight,
    listDeploymentArtifacts,
    recordDeploymentArtifact,
    verifySignedArtifact,
    rollbackDeploymentRun,
    listIntegrations,
    configureIntegration,
  } = useSettingsOps();

  const [view, setView] = useState<OpsView>('deployment');

  const [deploymentHealth, setDeploymentHealth] = useState<DeploymentHealthSummary | null>(null);
  const [preflightChecks, setPreflightChecks] = useState<string[]>([]);
  const [artifacts, setArtifacts] = useState<DeploymentArtifactRecord[]>([]);
  const [verification, setVerification] = useState<SignedArtifactVerificationResult | null>(null);
  const [deployBusy, setDeployBusy] = useState(false);
  const [artifactForm, setArtifactForm] = useState({
    artifactType: 'app_bundle',
    version: '1.0.0',
    channel: 'stable',
    sha256: '',
    isSigned: true,
  });
  const [rollbackReason, setRollbackReason] = useState('Release validation failure');
  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false);

  const [integrations, setIntegrations] = useState<IntegrationConfigRecord[]>([]);
  const [integrationConfigDraft, setIntegrationConfigDraft] = useState<Record<string, string>>({});
  const [integrationBusyType, setIntegrationBusyType] = useState<string | null>(null);
  const [opsError, setOpsError] = useState<string | null>(null);

  const refreshDeployment = useCallback(async () => {
    const [health, deploymentArtifacts] = await Promise.all([
      getDeploymentHealthSummary().catch(() => null),
      listDeploymentArtifacts(50).catch(() => []),
    ]);
    setDeploymentHealth(health);
    setArtifacts(deploymentArtifacts);
  }, [getDeploymentHealthSummary, listDeploymentArtifacts]);

  const refreshIntegrations = useCallback(async () => {
    const next = await listIntegrations().catch(() => []);
    setIntegrations(next);
    const nextDraft: Record<string, string> = {};
    for (const item of next) {
      nextDraft[item.integration_type] = item.config_json ?? '';
    }
    setIntegrationConfigDraft(nextDraft);
  }, [listIntegrations]);

  useEffect(() => {
    setOpsError(null);
    void Promise.all([refreshDeployment(), refreshIntegrations()]).catch((error) => {
      setOpsError(typeof error === 'string' ? error : 'Failed to load operations diagnostics');
    });
  }, [refreshDeployment, refreshIntegrations]);

  const runDeploymentChecks = useCallback(async () => {
    setDeployBusy(true);
    try {
      const result = await runDeploymentPreflight('stable');
      setPreflightChecks(result.checks);
      await refreshDeployment();
      if (result.ok) {
        showSuccess('Deployment preflight passed');
      } else {
        showError('Deployment preflight reported failures');
      }
    } catch (error) {
      showError(`Failed to run deployment preflight: ${error}`);
    } finally {
      setDeployBusy(false);
    }
  }, [refreshDeployment, runDeploymentPreflight, showError, showSuccess]);

  const submitArtifact = useCallback(async () => {
    if (!artifactForm.sha256.trim()) {
      return;
    }
    setDeployBusy(true);
    try {
      await recordDeploymentArtifact(
        artifactForm.artifactType,
        artifactForm.version,
        artifactForm.channel,
        artifactForm.sha256,
        artifactForm.isSigned,
      );
      setArtifactForm((current) => ({ ...current, sha256: '' }));
      await refreshDeployment();
      showSuccess('Deployment artifact recorded');
    } catch (error) {
      showError(`Failed to record artifact: ${error}`);
    } finally {
      setDeployBusy(false);
    }
  }, [artifactForm, recordDeploymentArtifact, refreshDeployment, showError, showSuccess]);

  const verifyArtifact = useCallback(async (artifactId: string) => {
    setDeployBusy(true);
    try {
      const result = await verifySignedArtifact(artifactId);
      setVerification(result);
      if (result.status === 'verified') {
        showSuccess('Artifact verification passed');
      } else {
        showError(`Verification result: ${result.status}`);
      }
    } catch (error) {
      showError(`Failed to verify artifact: ${error}`);
    } finally {
      setDeployBusy(false);
    }
  }, [showError, showSuccess, verifySignedArtifact]);

  const runRollback = useCallback(async () => {
    if (!deploymentHealth?.last_run?.id) {
      return;
    }
    setDeployBusy(true);
    try {
      await rollbackDeploymentRun(deploymentHealth.last_run.id, rollbackReason);
      await refreshDeployment();
      showSuccess('Rollback marked successfully');
    } catch (error) {
      showError(`Rollback failed: ${error}`);
    } finally {
      setDeployBusy(false);
      setShowRollbackConfirm(false);
    }
  }, [deploymentHealth?.last_run?.id, refreshDeployment, rollbackDeploymentRun, rollbackReason, showError, showSuccess]);

  const saveIntegration = useCallback(async (integrationType: string, enabled: boolean) => {
    setIntegrationBusyType(integrationType);
    try {
      const normalizedConfig = normalizeIntegrationConfigDraft(
        integrationConfigDraft[integrationType] || '',
      );
      await configureIntegration(integrationType, enabled, normalizedConfig);
      await refreshIntegrations();
      showSuccess(`${integrationType} integration updated`);
    } catch (error) {
      showError(`Failed to update integration: ${error}`);
    } finally {
      setIntegrationBusyType(null);
    }
  }, [configureIntegration, integrationConfigDraft, refreshIntegrations, showError, showSuccess]);

  const integrationMap = useMemo(() => {
    const map = new Map<string, IntegrationConfigRecord>();
    for (const item of integrations) {
      map.set(item.integration_type, item);
    }
    return map;
  }, [integrations]);

  return (
    <div className="ops-tab">
      <header className="ops-header">
        <div>
          <h2>Operations</h2>
          <p className="ops-subtitle">
            Internal deployment diagnostics and local integration controls. Eval, triage, and runbook tools stay out of the active UI in this wave.
          </p>
        </div>
      </header>

      <div className="ops-nav" role="tablist" aria-label="Operations sections">
        {([
          ['deployment', 'Deployment'],
          ['integrations', 'Integrations'],
        ] as [OpsView, string][]).map(([id, label]) => (
          <button
            key={id}
            className={`ops-nav-btn ${view === id ? 'active' : ''}`}
            onClick={() => setView(id)}
            role="tab"
            aria-selected={view === id}
          >
            {label}
          </button>
        ))}
      </div>

      {opsError && <div className="ops-banner hash_mismatch">{opsError}</div>}

      {view === 'deployment' && (
        <section className="ops-section" aria-label="Deployment diagnostics">
          <div className="ops-section-copy">
            <h3>Deployment Diagnostics</h3>
            <p>Run preflight checks, review recorded artifacts, verify signatures, and mark the last run for rollback when needed.</p>
          </div>

          <div className="ops-row">
            <Button variant="secondary" size="small" onClick={runDeploymentChecks} loading={deployBusy}>Run Preflight</Button>
            <Button
              variant="danger"
              size="small"
              onClick={() => setShowRollbackConfirm(true)}
              disabled={!deploymentHealth?.last_run || deploymentHealth.last_run.status === 'rolled_back'}
              loading={deployBusy}
            >
              Roll Back Last Run
            </Button>
            <input
              className="ops-input"
              value={rollbackReason}
              onChange={e => setRollbackReason(e.target.value)}
              placeholder="Rollback reason"
            />
          </div>

          {deploymentHealth ? (
            <div className="ops-kpis">
              <div>Artifacts: {deploymentHealth.total_artifacts}</div>
              <div>Signed: {deploymentHealth.signed_artifacts}</div>
              <div>Unsigned: {deploymentHealth.unsigned_artifacts}</div>
              <div>Last status: {deploymentHealth.last_run?.status ?? 'none'}</div>
            </div>
          ) : (
            <div className="ops-empty">Deployment health is not available yet.</div>
          )}

          {preflightChecks.length > 0 && (
            <ul className="ops-list">
              {preflightChecks.map((check, index) => <li key={`${check}-${index}`}>{check}</li>)}
            </ul>
          )}

          <div className="ops-grid">
            <input className="ops-input" value={artifactForm.artifactType} onChange={e => setArtifactForm(p => ({ ...p, artifactType: e.target.value }))} placeholder="artifact type" />
            <input className="ops-input" value={artifactForm.version} onChange={e => setArtifactForm(p => ({ ...p, version: e.target.value }))} placeholder="version" />
            <input className="ops-input" value={artifactForm.channel} onChange={e => setArtifactForm(p => ({ ...p, channel: e.target.value }))} placeholder="channel" />
            <input className="ops-input" value={artifactForm.sha256} onChange={e => setArtifactForm(p => ({ ...p, sha256: e.target.value }))} placeholder="sha256" />
            <label className="ops-checkbox"><input type="checkbox" checked={artifactForm.isSigned} onChange={e => setArtifactForm(p => ({ ...p, isSigned: e.target.checked }))} /> Signed</label>
            <Button size="small" onClick={submitArtifact} disabled={!artifactForm.sha256.trim()} loading={deployBusy}>Record Artifact</Button>
          </div>

          <div className="ops-card-list">
            {artifacts.length === 0 && <div className="ops-empty">No deployment artifacts recorded yet.</div>}
            {artifacts.map(artifact => (
              <div key={artifact.id} className="ops-card">
                <div className="ops-card-title">{artifact.artifact_type} {artifact.version}</div>
                <div className="ops-card-meta">{artifact.channel} • {artifact.is_signed ? 'Signed' : 'Unsigned'}</div>
                <code className="ops-code">{artifact.sha256}</code>
                <Button size="small" variant="ghost" onClick={() => verifyArtifact(artifact.id)} loading={deployBusy}>Verify</Button>
              </div>
            ))}
          </div>

          {verification && (
            <div className={`ops-banner ${verification.status}`}>
              Verification: {verification.status} ({verification.artifact.version})
            </div>
          )}
        </section>
      )}

      {view === 'integrations' && (
        <section className="ops-section" aria-label="Integration diagnostics">
          <div className="ops-section-copy">
            <h3>Integrations</h3>
            <p>Review local integration enablement and adjust stored config objects for supported destinations.</p>
          </div>

          <div className="ops-card-list">
            {INTEGRATION_TYPES.map((type) => {
              const config = integrationMap.get(type);
              const isBusy = integrationBusyType === type;
              return (
                <div key={type} className="ops-card">
                  <div className="ops-card-title">{type}</div>
                  <div className="ops-card-meta">{config?.enabled ? 'Enabled' : 'Disabled'}</div>
                  <textarea
                    className="ops-textarea"
                    value={integrationConfigDraft[type] ?? ''}
                    onChange={(event) => setIntegrationConfigDraft((current) => ({
                      ...current,
                      [type]: event.target.value,
                    }))}
                    placeholder='{"webhook_url":"https://..."}'
                  />
                  <div className="ops-row">
                    <Button
                      size="small"
                      variant={config?.enabled ? 'secondary' : 'primary'}
                      onClick={() => saveIntegration(type, !config?.enabled)}
                      loading={isBusy}
                    >
                      {config?.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button
                      size="small"
                      variant="ghost"
                      onClick={() => saveIntegration(type, Boolean(config?.enabled))}
                      loading={isBusy}
                    >
                      Save Config
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {showRollbackConfirm && (
        <div className="ops-modal-overlay" role="presentation">
          <div className="ops-modal" role="dialog" aria-label="Confirm rollback">
            <h4>Confirm Rollback</h4>
            <p>This marks the latest deployment run as rolled back and keeps the reason in the local diagnostics log.</p>
            <div className="ops-row">
              <Button variant="secondary" size="small" onClick={() => setShowRollbackConfirm(false)}>
                Cancel
              </Button>
              <Button variant="danger" size="small" onClick={runRollback} loading={deployBusy}>
                Confirm Rollback
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
