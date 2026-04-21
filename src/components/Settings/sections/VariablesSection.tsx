import { useCallback, useState } from "react";
import type { CustomVariable } from "../../../types/workspace";
import { Button } from "../../shared/Button";

interface VariablesSectionProps {
  customVariables: CustomVariable[];
  onSaveVariable: (
    name: string,
    value: string,
    id?: string,
  ) => Promise<boolean>;
  onDeleteVariable: (id: string) => Promise<boolean>;
  onShowSuccess: (message: string) => void;
  onShowError: (message: string) => void;
}

export function VariablesSection({
  customVariables,
  onSaveVariable,
  onDeleteVariable,
  onShowSuccess,
  onShowError,
}: VariablesSectionProps) {
  const [editingVariable, setEditingVariable] = useState<CustomVariable | null>(
    null,
  );
  const [variableForm, setVariableForm] = useState({ name: "", value: "" });
  const [showVariableForm, setShowVariableForm] = useState(false);
  const [variableFormError, setVariableFormError] = useState<string | null>(
    null,
  );

  const handleEditVariable = useCallback((variable: CustomVariable) => {
    setEditingVariable(variable);
    setVariableForm({ name: variable.name, value: variable.value });
    setShowVariableForm(true);
    setVariableFormError(null);
  }, []);

  const handleAddVariable = useCallback(() => {
    setEditingVariable(null);
    setVariableForm({ name: "", value: "" });
    setShowVariableForm(true);
    setVariableFormError(null);
  }, []);

  const handleCancelVariableForm = useCallback(() => {
    setShowVariableForm(false);
    setEditingVariable(null);
    setVariableForm({ name: "", value: "" });
    setVariableFormError(null);
  }, []);

  const handleSaveVariable = useCallback(async () => {
    const name = variableForm.name.trim();
    const value = variableForm.value.trim();

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      setVariableFormError(
        "Name must start with a letter or underscore and contain only letters, numbers, and underscores",
      );
      return;
    }

    if (!value) {
      setVariableFormError("Value is required");
      return;
    }

    const isDuplicate = customVariables.some(
      (v) =>
        v.name.toLowerCase() === name.toLowerCase() &&
        v.id !== editingVariable?.id,
    );
    if (isDuplicate) {
      setVariableFormError("A variable with this name already exists");
      return;
    }

    const success = await onSaveVariable(name, value, editingVariable?.id);
    if (success) {
      onShowSuccess(editingVariable ? "Variable updated" : "Variable created");
      handleCancelVariableForm();
    } else {
      setVariableFormError("Failed to save variable");
    }
  }, [
    variableForm,
    editingVariable,
    customVariables,
    onSaveVariable,
    onShowSuccess,
    handleCancelVariableForm,
  ]);

  const handleDeleteVariable = useCallback(
    async (variableId: string) => {
      const success = await onDeleteVariable(variableId);
      if (success) {
        onShowSuccess("Variable deleted");
      } else {
        onShowError("Failed to delete variable");
      }
    },
    [onDeleteVariable, onShowSuccess, onShowError],
  );

  return (
    <section className="settings-section">
      <h2>Template Variables</h2>
      <p className="settings-description">
        Define custom variables to use in response templates. Use as{" "}
        <code>{`{{variable_name}}`}</code> in your prompts.
      </p>

      <div className="variables-container">
        {customVariables.length === 0 ? (
          <p className="variables-empty">No custom variables defined yet.</p>
        ) : (
          <div className="variables-list">
            {customVariables.map((variable) => (
              <div key={variable.id} className="variable-item">
                <div className="variable-info">
                  <code className="variable-name">{`{{${variable.name}}}`}</code>
                  <span className="variable-value">{variable.value}</span>
                </div>
                <div className="variable-actions">
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={() => handleEditVariable(variable)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={() => {
                      void handleDeleteVariable(variable.id);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Button variant="secondary" size="small" onClick={handleAddVariable}>
          + Add Variable
        </Button>
      </div>

      {showVariableForm && (
        <div
          className="variable-form-overlay"
          onClick={handleCancelVariableForm}
        >
          <div
            className="variable-form-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{editingVariable ? "Edit Variable" : "Add Variable"}</h3>
            {variableFormError && (
              <div className="variable-form-error">{variableFormError}</div>
            )}
            <div className="form-field">
              <label htmlFor="var-name">Name</label>
              <input
                id="var-name"
                type="text"
                placeholder="my_variable"
                value={variableForm.name}
                onChange={(e) =>
                  setVariableForm((f) => ({ ...f, name: e.target.value }))
                }
                autoFocus
              />
              <p className="field-hint">
                Letters, numbers, and underscores only
              </p>
            </div>
            <div className="form-field">
              <label htmlFor="var-value">Value</label>
              <textarea
                id="var-value"
                placeholder="The value to substitute..."
                value={variableForm.value}
                onChange={(e) =>
                  setVariableForm((f) => ({ ...f, value: e.target.value }))
                }
                rows={3}
              />
            </div>
            <div className="form-actions">
              <Button variant="ghost" onClick={handleCancelVariableForm}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  void handleSaveVariable();
                }}
                disabled={
                  !variableForm.name.trim() || !variableForm.value.trim()
                }
              >
                {editingVariable ? "Save" : "Add"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
