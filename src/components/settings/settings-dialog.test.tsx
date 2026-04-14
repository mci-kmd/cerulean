import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_SETTINGS } from "@/types/board";
import { createTestCollections, renderWithProviders } from "@/test/helpers/render";
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
});
