import { useState } from "react";
import { Button } from "../../shared/Button";

interface JiraSectionProps {
  jiraConfigured: boolean;
  jiraConfig: { base_url?: string; email?: string } | null;
  jiraLoading: boolean;
  onJiraConnect: (
    baseUrl: string,
    email: string,
    apiToken: string,
  ) => Promise<void>;
  onJiraDisconnect: () => Promise<void>;
}

export function JiraSection({
  jiraConfigured,
  jiraConfig,
  jiraLoading,
  onJiraConnect,
  onJiraDisconnect,
}: JiraSectionProps) {
  const [jiraForm, setJiraForm] = useState({
    baseUrl: "",
    email: "",
    apiToken: "",
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await onJiraConnect(jiraForm.baseUrl, jiraForm.email, jiraForm.apiToken);
    setJiraForm({ baseUrl: "", email: "", apiToken: "" });
  }

  return (
    <section className="settings-section">
      <h2>Jira Integration</h2>
      <p className="settings-description">
        Connect to Jira Cloud to import tickets directly into your drafts.
      </p>

      {jiraConfigured ? (
        <div className="jira-connected">
          <div className="jira-status">
            <span className="status-icon">&#10003;</span>
            <span>Connected to {jiraConfig?.base_url || "Jira"}</span>
          </div>
          <p className="jira-email">Account: {jiraConfig?.email}</p>
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              void onJiraDisconnect();
            }}
            disabled={jiraLoading}
          >
            Disconnect
          </Button>
        </div>
      ) : (
        <form className="jira-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="jira-url">Jira URL</label>
            <input
              id="jira-url"
              type="url"
              placeholder="https://your-company.atlassian.net"
              value={jiraForm.baseUrl}
              onChange={(e) =>
                setJiraForm((f) => ({ ...f, baseUrl: e.target.value }))
              }
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="jira-email">Email</label>
            <input
              id="jira-email"
              type="email"
              placeholder="your.email@company.com"
              value={jiraForm.email}
              onChange={(e) =>
                setJiraForm((f) => ({ ...f, email: e.target.value }))
              }
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="jira-token">API Token</label>
            <input
              id="jira-token"
              type="password"
              placeholder="Your Jira API token"
              value={jiraForm.apiToken}
              onChange={(e) =>
                setJiraForm((f) => ({ ...f, apiToken: e.target.value }))
              }
              required
            />
            <p className="field-hint">
              Generate at{" "}
              <a
                href="https://id.atlassian.com/manage/api-tokens"
                target="_blank"
                rel="noopener noreferrer"
              >
                id.atlassian.com/manage/api-tokens
              </a>
            </p>
          </div>
          <Button
            type="submit"
            variant="primary"
            disabled={
              jiraLoading ||
              !jiraForm.baseUrl ||
              !jiraForm.email ||
              !jiraForm.apiToken
            }
          >
            {jiraLoading ? "Connecting..." : "Connect"}
          </Button>
        </form>
      )}
    </section>
  );
}
