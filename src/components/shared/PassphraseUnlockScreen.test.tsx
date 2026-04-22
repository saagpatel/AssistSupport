// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PassphraseUnlockScreen } from "./PassphraseUnlockScreen";

vi.mock("./Button", () => ({
  Button: ({
    children,
    type,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    type?: "button" | "submit";
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type={type ?? "button"} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("./Icon", () => ({
  Icon: ({ name }: { name: string }) => <span>{name}</span>,
}));

afterEach(() => {
  cleanup();
});

describe("PassphraseUnlockScreen", () => {
  it("keeps unlock disabled until a passphrase is entered", async () => {
    const user = userEvent.setup();
    render(<PassphraseUnlockScreen error={null} onUnlock={vi.fn()} />);

    const unlockButton = screen.getByRole("button", { name: "Unlock" });
    expect(unlockButton.hasAttribute("disabled")).toBe(true);

    await user.click(screen.getByLabelText("Passphrase"));
    await user.paste("correct horse battery staple");

    expect(unlockButton.hasAttribute("disabled")).toBe(false);
  });

  it("submits the entered passphrase to the unlock handler", async () => {
    const user = userEvent.setup();
    const onUnlock = vi.fn().mockResolvedValue(undefined);
    render(<PassphraseUnlockScreen error={null} onUnlock={onUnlock} />);

    await user.click(screen.getByLabelText("Passphrase"));
    await user.paste("local-secret");
    await user.click(screen.getByRole("button", { name: "Unlock" }));

    await waitFor(() => {
      expect(onUnlock).toHaveBeenCalledWith("local-secret");
    });
  });

  it("renders unlock errors for failed passphrase attempts", () => {
    render(
      <PassphraseUnlockScreen
        error="Passphrase required"
        onUnlock={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "Passphrase required",
    );
  });
});
