import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_SETTINGS } from "@/types/board";
import { createTestCollections, renderWithProviders } from "@/test/helpers/render";
import { SettingsDialog } from "./settings-dialog";

describe("SettingsDialog", () => {
  it("renders when open", () => {
    renderWithProviders(
      <SettingsDialog open={true} onOpenChange={() => {}} />,
    );

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByLabelText("Personal Access Token")).toBeInTheDocument();
    expect(screen.getByLabelText("Organization")).toBeInTheDocument();
    expect(screen.getByLabelText("Project")).toBeInTheDocument();
    expect(screen.queryByLabelText("Team (optional)")).not.toBeInTheDocument();
  });

  it("shows connection, source, and columns sections", () => {
    renderWithProviders(
      <SettingsDialog open={true} onOpenChange={() => {}} />,
    );

    expect(screen.getByText("Connection")).toBeInTheDocument();
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Board Columns")).toBeInTheDocument();
  });

  it("calls onOpenChange when cancel is clicked", async () => {
    const user = userEvent.setup();
    let closed = false;
    renderWithProviders(
      <SettingsDialog open={true} onOpenChange={(v) => { closed = !v; }} />,
    );

    await user.click(screen.getByText("Cancel"));
    expect(closed).toBe(true);
  });

  it("saves settings to collection", async () => {
    const user = userEvent.setup();
    const { collections } = renderWithProviders(
      <SettingsDialog open={true} onOpenChange={() => {}} />,
    );

    const patInput = screen.getByLabelText("Personal Access Token");
    const orgInput = screen.getByLabelText("Organization");
    const projInput = screen.getByLabelText("Project");

    await user.type(patInput, "my-pat");
    await user.type(orgInput, "my-org");
    await user.type(projInput, "my-proj");

    await user.click(screen.getByText("Save"));

    const settings = collections.settings.get("settings");
    expect(settings).toBeTruthy();
    expect(settings?.pat).toBe("my-pat");
    expect(settings?.org).toBe("my-org");
  });

  it("normalizes connection settings before saving", async () => {
    const user = userEvent.setup();
    const { collections } = renderWithProviders(
      <SettingsDialog open={true} onOpenChange={() => {}} />,
    );

    await user.type(screen.getByLabelText("Personal Access Token"), "  my-pat  ");
    await user.type(screen.getByLabelText("Organization"), " https://dev.azure.com/my-org/ ");
    await user.type(screen.getByLabelText("Project"), " my project ");

    await user.click(screen.getByText("Save"));

    const settings = collections.settings.get("settings");
    expect(settings?.pat).toBe("my-pat");
    expect(settings?.org).toBe("my-org");
    expect(settings?.project).toBe("my project");
  });

  it("renders area path input", () => {
    renderWithProviders(
      <SettingsDialog open={true} onOpenChange={() => {}} />,
    );

    expect(screen.getByLabelText("Area Path")).toBeInTheDocument();
  });

  it("saves area path to collection", async () => {
    const user = userEvent.setup();
    const { collections } = renderWithProviders(
      <SettingsDialog open={true} onOpenChange={() => {}} />,
    );

    const areaInput = screen.getByLabelText("Area Path");
    await user.type(areaInput, "MyProject\\MyTeam");
    await user.click(screen.getByText("Save"));

    const settings = collections.settings.get("settings");
    expect(settings?.areaPath).toBe("MyProject\\MyTeam");
  });

  it("drops legacy team data when saving", async () => {
    const user = userEvent.setup();
    const collections = createTestCollections();
    const legacySettings = { ...DEFAULT_SETTINGS, team: "legacy-team" };
    collections.settings.insert(legacySettings);

    renderWithProviders(
      <SettingsDialog open={true} onOpenChange={() => {}} />,
      { collections },
    );

    await user.click(screen.getByText("Save"));

    const settings = collections.settings.get("settings");
    expect(Object.hasOwn(settings ?? {}, "team")).toBe(false);
  });
});
