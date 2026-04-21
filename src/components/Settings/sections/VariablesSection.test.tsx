// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VariablesSection } from "./VariablesSection";

describe("VariablesSection", () => {
  afterEach(() => cleanup());

  it("rejects invalid names and duplicates, then saves a valid new variable", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "+ Add Variable" }));

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "1bad" },
    });
    fireEvent.change(screen.getByLabelText("Value"), {
      target: { value: "value" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText(/must start with a letter or underscore/i);

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "existing_var" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText(/already exists/i);

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "new_var" },
    });
    fireEvent.change(screen.getByLabelText("Value"), {
      target: { value: "new value" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

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

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(onDeleteVariable).toHaveBeenCalledWith("42"));
    expect(onShowSuccess).toHaveBeenCalledWith("Variable deleted");
  });
});
