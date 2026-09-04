import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useUpdateStore } from "@/stores";
import { UpdateStatus } from "./UpdateStatus";

beforeEach(() => {
  useUpdateStore.setState({
    phase: "current",
    currentVersion: "0.1.2",
    update: null,
    dialogOpen: false,
    downloadedBytes: 0,
    totalBytes: null,
    error: null,
  });
});

describe("UpdateStatus", () => {
  it("keeps the current version quiet at the status bar edge", () => {
    render(<UpdateStatus />);
    expect(screen.getByText("v0.1.2")).toBeTruthy();
  });

  it("turns an available version into the update action", () => {
    useUpdateStore.setState({
      phase: "available",
      update: {
        currentVersion: "0.1.2",
        version: "0.1.3",
        date: null,
        notes: null,
      },
    });
    render(<UpdateStatus />);

    fireEvent.click(screen.getByRole("button", { name: "Update 0.1.3" }));
    expect(useUpdateStore.getState().dialogOpen).toBe(true);
  });

  it("shows determinate download progress without widening into prose", () => {
    useUpdateStore.setState({
      phase: "installing",
      update: {
        currentVersion: "0.1.2",
        version: "0.1.3",
        date: null,
        notes: null,
      },
      downloadedBytes: 40,
      totalBytes: 100,
    });
    render(<UpdateStatus />);

    expect(screen.getByText("40%")).toBeTruthy();
  });
});
