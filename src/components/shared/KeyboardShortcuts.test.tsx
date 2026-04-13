// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeyboardShortcuts } from "./KeyboardShortcuts";

vi.mock("./Icon", () => ({
  Icon: ({ name }: { name: string }) => <span>{name}</span>,
}));

afterEach(() => {
  cleanup();
});

describe("KeyboardShortcuts", () => {
  it("hides admin-only navigation shortcuts in the default shell help", () => {
    render(<KeyboardShortcuts isOpen onClose={vi.fn()} />);

    expect(screen.queryByText("Go to Analytics")).toBeNull();
    expect(screen.queryByText("Go to Operations")).toBeNull();
    expect(screen.getByText("Go to Knowledge")).toBeTruthy();
  });

  it("shows admin shortcuts when admin mode is enabled", () => {
    render(<KeyboardShortcuts isOpen onClose={vi.fn()} showAdminShortcuts />);

    expect(screen.getByText("Go to Analytics")).toBeTruthy();
    expect(screen.getByText("Go to Operations")).toBeTruthy();
    expect(screen.queryByText("Go to Pilot")).toBeNull();
  });
});
