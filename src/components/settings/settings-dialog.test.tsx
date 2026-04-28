import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_SETTINGS } from "@/types/board";
import { createTestCollections, renderWithProviders } from "@/test/helpers/render";
import { createBoardBackup } from "@/lib/board-backup";
import { SettingsDialog } from "./settings-dialog";

async function expandSection(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  const section = screen.getByRole("button", { name });

  if (section.getAttribute("aria-expanded") !== "true") {
    await user.click(section);
  }

  return section;
}

function getSectionContent(name: string) {
  const section = screen.getByRole("button", { name });
  const contentId = section.getAttribute("aria-controls");

  expect(contentId).toBeTruthy();

  return document.getElementById(contentId!);
}

describe("SettingsDialog", () => {
  it("renders section controls collapsed by default", () => {
    renderWithProviders(
      <SettingsDialog open={true} onOpenChange={() => {}} />,
    );

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connection" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: "Source" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: "Retro Prep" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: "Board Columns" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(getSectionContent("Connection")).toHaveAttribute("aria-hidden", "true");
    expect(getSectionContent("Connection")).toHaveClass("opacity-0");
    expect(getSectionContent("Source")).toHaveAttribute("aria-hidden", "true");
    expect(getSectionContent("Source")).toHaveClass("opacity-0");
    expect(getSectionContent("Retro Prep")).toHaveAttribute("aria-hidden", "true");
    expect(getSectionContent("Retro Prep")).toHaveClass("opacity-0");
    expect(getSectionContent("Board Columns")).toHaveAttribute("aria-hidden", "true");
    expect(getSectionContent("Board Columns")).toHaveClass("opacity-0");
  });

  it("expands and collapses sections", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SettingsDialog open={true} onOpenChange={() => {}} />,
    );

    const connection = screen.getByRole("button", { name: "Connection" });

    await user.click(connection);
    expect(connection).toHaveAttribute("aria-expanded", "true");
    expect(getSectionContent("Connection")).toHaveAttribute("aria-hidden", "false");
    expect(getSectionContent("Connection")).toHaveClass("opacity-100");
    expect(screen.getByLabelText("Personal Access Token")).toBeInTheDocument();
    expect(screen.getAllByText(/Code \(Read & write\)/i).length).toBeGreaterThan(0);

    await user.click(connection);
    expect(connection).toHaveAttribute("aria-expanded", "false");
    expect(getSectionContent("Connection")).toHaveAttribute("aria-hidden", "true");
    expect(getSectionContent("Connection")).toHaveClass("opacity-0");
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

    await expandSection(user, "Connection");
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

  it("saves team to collection", async () => {
    const user = userEvent.setup();
    const { collections } = renderWithProviders(
      <SettingsDialog open={true} onOpenChange={() => {}} />,
    );

    await expandSection(user, "Connection");
    await user.type(screen.getByLabelText("Team"), "my-team");
    await user.click(screen.getByText("Save"));

    const settings = collections.settings.get("settings");
    expect(settings?.team).toBe("my-team");
  });

  it("saves normalized GitHub review settings to collection", async () => {
    const user = userEvent.setup();
    const { collections } = renderWithProviders(
      <SettingsDialog open={true} onOpenChange={() => {}} />,
    );

    await expandSection(user, "Connection");
    await user.type(screen.getByLabelText("GitHub Username"), "@octocat");
    await user.type(
      screen.getByLabelText("GitHub Repository"),
      "https://github.com/octo-org/widgets/",
    );
    await user.click(screen.getByText("Save"));

    const settings = collections.settings.get("settings");
    expect(settings?.githubUsername).toBe("octocat");
    expect(settings?.githubRepository).toBe("octo-org/widgets");
  });

  it("saves retro settings to collection", async () => {
    const user = userEvent.setup();
    const { collections } = renderWithProviders(
      <SettingsDialog open={true} onOpenChange={() => {}} />,
    );

    await expandSection(user, "Retro Prep");
    await user.type(screen.getByLabelText("Retro Repository"), "  retro-repo  ");
    await user.clear(screen.getByLabelText("Retro Branch"));
    await user.type(screen.getByLabelText("Retro Branch"), "  sprint-notes  ");
    await user.type(screen.getByLabelText("Retro Folder"), "  retros\\team-a  ");
    const patternInput = screen.getByLabelText("Retro Filename Pattern");
    await user.clear(patternInput);
    await user.click(patternInput);
    await user.paste("retro-{date}.md");
    await user.click(screen.getByText("Save"));

    const settings = collections.settings.get("settings");
    expect(settings?.retroRepository).toBe("retro-repo");
    expect(settings?.retroBranch).toBe("sprint-notes");
    expect(settings?.retroFolder).toBe("retros\\team-a");
    expect(settings?.retroFilenamePattern).toBe("retro-{date}.md");
  });

  it("saves source, new-work, and approval board columns to collection", async () => {
    const user = userEvent.setup();
    const { collections } = renderWithProviders(
      <SettingsDialog open={true} onOpenChange={() => {}} />,
    );

    await expandSection(user, "Source");
    await user.type(screen.getByLabelText("Active Work Board Column"), "Approved");
    await user.type(screen.getByLabelText("New Work Board Column"), "Ideas");
    await user.type(screen.getByLabelText("Approval Board Column"), "Approved");
    await user.click(screen.getByText("Save"));

    const settings = collections.settings.get("settings");
    expect(settings?.sourceBoardColumn).toBe("Approved");
    expect(settings?.candidateBoardColumn).toBe("Ideas");
    expect(settings?.approvalBoardColumn).toBe("Approved");
  });

  it("normalizes connection settings before saving", async () => {
    const user = userEvent.setup();
    const { collections } = renderWithProviders(
      <SettingsDialog open={true} onOpenChange={() => {}} />,
    );

    await expandSection(user, "Connection");
    await user.type(screen.getByLabelText("Personal Access Token"), "  my-pat  ");
    await user.type(screen.getByLabelText("Organization"), " https://dev.azure.com/my-org/ ");
    await user.type(screen.getByLabelText("Project"), " my project ");

    await user.click(screen.getByText("Save"));

    const settings = collections.settings.get("settings");
    expect(settings?.pat).toBe("my-pat");
    expect(settings?.org).toBe("my-org");
    expect(settings?.project).toBe("my project");
  });

  it("renders area path input", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SettingsDialog open={true} onOpenChange={() => {}} />,
    );

    await expandSection(user, "Source");
    expect(screen.getByLabelText("Area Path")).toBeInTheDocument();
  });

  it("saves area path to collection", async () => {
    const user = userEvent.setup();
    const { collections } = renderWithProviders(
      <SettingsDialog open={true} onOpenChange={() => {}} />,
    );

    await expandSection(user, "Source");
    const areaInput = screen.getByLabelText("Area Path");
    await user.type(areaInput, "MyProject\\MyTeam");
    await user.click(screen.getByText("Save"));

    const settings = collections.settings.get("settings");
    expect(settings?.areaPath).toBe("MyProject\\MyTeam");
  });

  it("saves UI review tag to collection", async () => {
    const user = userEvent.setup();
    const { collections } = renderWithProviders(
      <SettingsDialog open={true} onOpenChange={() => {}} />,
    );

    await expandSection(user, "Source");
    await user.type(screen.getByLabelText("UI review tag"), "  UI Review  ");
    await user.click(screen.getByText("Save"));

    const settings = collections.settings.get("settings");
    expect(settings?.uiReviewTag).toBe("UI Review");
  });

  it("clears legacy state query fields on save", async () => {
    const user = userEvent.setup();
    const collections = createTestCollections();
    const legacySettings = {
      ...DEFAULT_SETTINGS,
      team: "legacy-team",
      sourceState: "Active",
      sourceBoardColumn: "Old Column",
      approvalState: "Resolved",
      candidateState: "New",
      candidateStatesByType: "Bug=New",
    };
    collections.settings.insert(legacySettings);

    renderWithProviders(
      <SettingsDialog open={true} onOpenChange={() => {}} />,
      { collections },
    );

    await user.click(screen.getByText("Save"));

    const settings = collections.settings.get("settings");
    expect(settings?.team).toBe("legacy-team");
    expect(settings?.sourceState).toBe("");
    expect(settings?.sourceBoardColumn).toBe("Old Column");
    expect(settings?.candidateBoardColumn).toBe("");
    expect(settings?.approvalState).toBe("");
    expect(settings?.candidateState).toBe("");
    expect(settings?.candidateStatesByType).toBe("");
  });

  it("exports current settings draft with stored app data", async () => {
    const user = userEvent.setup();
    const collections = createTestCollections();
    collections.settings.insert({
      ...DEFAULT_SETTINGS,
      team: "saved-team",
      org: "saved-org",
    });
    collections.columns.insert({ id: "col-1", name: "Doing", order: 0 });
    collections.assignments.insert({
      id: "assignment-1",
      workItemId: 101,
      columnId: "col-1",
      position: 0,
      statusMessage: "blocked",
    });
    collections.demoChecklist.insert({
      id: "check-1",
      workItemId: 101,
      text: "demo step",
      checked: true,
      order: 0,
    });
    collections.demoOrder.insert({
      id: "demo-1",
      workItemId: 101,
      position: 0,
    });
    collections.customTasks.insert({
      id: "task-1",
      workItemId: 101,
      title: "Follow up",
      completedAt: 42,
    });
    collections.resourceTypes.insert({
      id: "app-service",
      name: "App Service",
      iconName: "AppWindow",
      order: 0,
    });
    collections.launcherResources.insert({
      id: "resource-1",
      name: "Identity API",
      typeId: "app-service",
      sandboxUrl: "https://sandbox.example.com/apps/identity-api",
      devUrl: "https://dev.example.com/apps/identity-api",
      prodUrl: "https://prod.example.com/apps/identity-api",
      order: 0,
      children: [{
        id: "child-1",
        name: "Identity Insights",
        typeId: "app-insights",
        sandboxUrl: "https://sandbox.example.com/insights/identity-api",
        devUrl: "https://dev.example.com/insights/identity-api",
        prodUrl: "https://prod.example.com/insights/identity-api",
        order: 0,
      }],
    });

    const createObjectURL = vi.fn((object: Blob | MediaSource) => {
      void object;
      return "blob:backup";
    });
    const revokeObjectURL = vi.fn();
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: revokeObjectURL,
    });

    try {
      renderWithProviders(
        <SettingsDialog open={true} onOpenChange={() => {}} />,
        { collections },
      );

      await expandSection(user, "Connection");
      await user.clear(screen.getByLabelText("Team"));
      await user.type(screen.getByLabelText("Team"), "draft-team");
      await user.click(screen.getByRole("button", { name: "Export" }));

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:backup");

      const firstCreateObjectUrlCall = createObjectURL.mock.calls[0];
      expect(firstCreateObjectUrlCall).toBeDefined();
      const [blob] = firstCreateObjectUrlCall!;
      expect(blob).toBeInstanceOf(Blob);
      const exported = JSON.parse(await (blob as Blob).text());
      expect(exported).toMatchObject({
        format: "cerulean-backup",
        version: 1,
        settings: {
          id: "settings",
          team: "draft-team",
          org: "saved-org",
        },
        columns: [{ id: "col-1", name: "Doing", order: 0 }],
        assignments: [{
          id: "assignment-1",
          workItemId: 101,
          columnId: "col-1",
          position: 0,
          statusMessage: "blocked",
        }],
        demoChecklist: [{
          id: "check-1",
          workItemId: 101,
          text: "demo step",
          checked: true,
          order: 0,
        }],
        demoOrder: [{
          id: "demo-1",
          workItemId: 101,
          position: 0,
        }],
        customTasks: [{
          id: "task-1",
          workItemId: 101,
          title: "Follow up",
          completedAt: 42,
        }],
        resourceTypes: [{
          id: "app-service",
          name: "App Service",
          iconName: "AppWindow",
          order: 0,
        }],
        launcherResources: [{
          id: "resource-1",
          name: "Identity API",
          typeId: "app-service",
          sandboxUrl: "https://sandbox.example.com/apps/identity-api",
          devUrl: "https://dev.example.com/apps/identity-api",
          prodUrl: "https://prod.example.com/apps/identity-api",
          order: 0,
          children: [{
            id: "child-1",
            name: "Identity Insights",
            typeId: "app-insights",
            sandboxUrl: "https://sandbox.example.com/insights/identity-api",
            devUrl: "https://dev.example.com/insights/identity-api",
            prodUrl: "https://prod.example.com/insights/identity-api",
            order: 0,
          }],
        }],
      });
      expect(exported.exportedAt).toEqual(expect.any(String));
    } finally {
      clickSpy.mockRestore();
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        writable: true,
        value: originalCreateObjectURL,
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        writable: true,
        value: originalRevokeObjectURL,
      });
    }
  });

  it("imports settings and stored app data from backup json", async () => {
    const user = userEvent.setup();
    const collections = createTestCollections();
    collections.settings.insert({
      ...DEFAULT_SETTINGS,
      team: "old-team",
    });
    collections.columns.insert({ id: "old-col", name: "Old", order: 0 });
    collections.assignments.insert({
      id: "old-assignment",
      workItemId: 1,
      columnId: "old-col",
      position: 0,
    });

    const backupCollections = createTestCollections();
    backupCollections.assignments.insert({
      id: "new-assignment",
      workItemId: 202,
      columnId: "new-col",
      position: 1,
      mockupUrl: "https://example.com/mockup",
      candidateOptOut: true,
    });
    backupCollections.demoChecklist.insert({
      id: "new-check",
      workItemId: 202,
      text: "Verify flow",
      checked: false,
      order: 2,
    });
    backupCollections.demoOrder.insert({
      id: "new-demo",
      workItemId: 202,
      position: 3,
    });
    backupCollections.customTasks.insert({
      id: "new-task",
      workItemId: 202,
      title: "Draft QA notes",
    });
    backupCollections.resourceTypes.insert({
      id: "function-app",
      name: "Function App",
      iconName: "Workflow",
      order: 0,
    });
    backupCollections.launcherResources.insert({
      id: "resource-1",
      name: "Token API",
      typeId: "function-app",
      sandboxUrl: "https://sandbox.example.com/api/token",
      devUrl: "https://dev.example.com/api/token",
      prodUrl: "https://prod.example.com/api/token",
      order: 0,
      children: [{
        id: "child-1",
        name: "Token Insights",
        typeId: "app-insights",
        sandboxUrl: "https://sandbox.example.com/insights/token",
        devUrl: "https://dev.example.com/insights/token",
        prodUrl: "https://prod.example.com/insights/token",
        order: 0,
      }],
    });
    const backupJson = JSON.stringify(
      createBoardBackup({
        collections: backupCollections,
        settings: {
          ...DEFAULT_SETTINGS,
          team: "imported-team",
          org: "imported-org",
          project: "imported-project",
        },
        columns: [{ id: "new-col", name: "Imported", order: 0 }],
      }),
    );

    renderWithProviders(
      <SettingsDialog open={true} onOpenChange={() => {}} />,
      { collections },
    );

    const importInput = screen.getByLabelText("Import settings and data");
    await user.upload(
      importInput,
      new File([backupJson], "cerulean-backup.json", { type: "application/json" }),
    );

    expect(collections.settings.get("settings")?.team).toBe("imported-team");
    expect(collections.settings.get("settings")?.org).toBe("imported-org");
    expect(collections.columns.get("old-col")).toBeUndefined();
    expect(collections.columns.get("new-col")?.name).toBe("Imported");
    expect(collections.assignments.get("old-assignment")).toBeUndefined();
    expect(collections.assignments.get("new-assignment")?.mockupUrl).toBe(
      "https://example.com/mockup",
    );
    expect(collections.assignments.get("new-assignment")?.candidateOptOut).toBe(true);
    expect(collections.demoChecklist.get("new-check")?.text).toBe("Verify flow");
    expect(collections.demoOrder.get("new-demo")?.position).toBe(3);
    expect(collections.customTasks.get("new-task")?.title).toBe("Draft QA notes");
    expect(collections.resourceTypes.get("function-app")?.iconName).toBe("Workflow");
    expect(collections.launcherResources.get("resource-1")?.prodUrl).toBe(
      "https://prod.example.com/api/token",
    );
    expect(collections.launcherResources.get("resource-1")?.children).toEqual([{
      id: "child-1",
      name: "Token Insights",
      typeId: "app-insights",
      sandboxUrl: "https://sandbox.example.com/insights/token",
      devUrl: "https://dev.example.com/insights/token",
      prodUrl: "https://prod.example.com/insights/token",
      order: 0,
    }]);

    await expandSection(user, "Connection");
    expect(screen.getByLabelText("Team")).toHaveValue("imported-team");
    expect(screen.getByLabelText("Organization")).toHaveValue("imported-org");
    expect(screen.getByLabelText("Project")).toHaveValue("imported-project");
  });
});
