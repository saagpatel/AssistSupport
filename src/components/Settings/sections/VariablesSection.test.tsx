// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VariablesSection } from "./VariablesSection";

describe("VariablesSection", () => {
  afterEach(() => cleanup());

  it("rejects invalid names and duplicates, then saves a valid new variable", async () => {
    const user = userEvent.setup();
    const onSaveVariable = vi.fn().mockResolvedValue(true);
    const onShowSuccess = vi.fn();
    render(
      <VariablesSection
        customVariables={[{ id: "1", name: "existing_var", value: "hello" }]}
        onSaveVariable={onSaveVariable}
        onDeleteVariable={vi.fn()}
        onShowSuccess={onShowSuccess}
        onShowError={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "+ Add Variable" }));

    await user.type(screen.getByLabelText("Name"), "1bad");
    await user.type(screen.getByLabelText("Value"), "value");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText(/must start with a letter or underscore/i);

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "existing_var");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText(/already exists/i);

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "new_var");
    await user.clear(screen.getByLabelText("Value"));
    await user.type(screen.getByLabelText("Value"), "new value");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(onSaveVariable).toHaveBeenCalledWith(
        "new_var",
        "new value",
        undefined,
      ),
    );
    expect(onShowSuccess).toHaveBeenCalledWith("Variable created");
  });

  it("deletes a variable through the delete button", async () => {
    const user = userEvent.setup();
    const onDeleteVariable = vi.fn().mockResolvedValue(true);
    const onShowSuccess = vi.fn();
    render(
      <VariablesSection
        customVariables={[{ id: "42", name: "to_remove", value: "bye" }]}
        onSaveVariable={vi.fn()}
        onDeleteVariable={onDeleteVariable}
        onShowSuccess={onShowSuccess}
        onShowError={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(onDeleteVariable).toHaveBeenCalledWith("42"));
    expect(onShowSuccess).toHaveBeenCalledWith("Variable deleted");
  });
});
