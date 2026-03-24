import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/helpers/render";
import { MockAdoClient } from "@/api/ado-client.mock";
import { RetroPrepView } from "./retro-prep-view";

vi.mock("./retro-markdown-editor", () => ({
  RetroMarkdownEditor: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <textarea
      aria-label="Draft markdown"
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

describe("RetroPrepView", () => {
  it("prepares a draft from Template.md, seeds it from the latest retro, and creates the new repo file", async () => {
    const user = userEvent.setup();
    const client = new MockAdoClient();
    client.repositories = [{ id: "retro-repo", name: "Retro Repo" }];
    client.repositoryItems.set("retro-repo", [
      { path: "/retros/Template.md" },
      { path: "/retros/2026-03-09.md" },
      { path: "/retros/2026-03-16.md" },
    ]);
    client.repositoryTexts.set(
      "retro-repo:/retros/Template.md",
      [
        "# Retrospective DATE",
        "",
        "## Follow up on previous retrospectives",
        "",
        "## What went well?",
        "",
        "Julie",
        "- ",
        "",
        "## Solutions",
      ].join("\n"),
    );
    client.repositoryTexts.set(
      "retro-repo:/retros/2026-03-16.md",
      [
        "# Retrospective 2026-03-16",
        "",
        "## Follow up on previous retrospectives",
        "",
        "### Existing track",
        "",
        "- Existing follow-up item",
        "",
        "## Solutions",
        "",
        "### Agent queue",
        "",
        "- Follow up on flaky login tests",
      ].join("\n"),
    );

    const openWindow = vi.fn();
    renderWithProviders(
      <RetroPrepView
        client={client}
        org="test-org"
        project="test-project"
        repositoryId="retro-repo"
        branchName="main"
        folder="retros"
        filenamePattern="{date}.md"
        today={new Date(2026, 2, 23)}
        openWindow={openWindow}
      />,
    );

    await waitFor(() => {
      expect(
        (screen.getByLabelText("Draft markdown") as HTMLTextAreaElement).value,
      ).toContain("# Retrospective 2026-03-23");
    });

    expect(screen.getByText("/retros/Template.md")).toBeInTheDocument();
    expect(screen.getByText("/retros/2026-03-16.md")).toBeInTheDocument();
    expect(screen.getByText("/retros/2026-03-23.md")).toBeInTheDocument();
    expect((screen.getByLabelText("Draft markdown") as HTMLTextAreaElement).value).toContain(
      "### Existing track\n\n- Existing follow-up item",
    );
    expect((screen.getByLabelText("Draft markdown") as HTMLTextAreaElement).value).toContain(
      "### Agent queue\n\n- Follow up on flaky login tests",
    );
    const seededFollowUpCard = screen.getByRole("heading", { name: "Seeded follow-up" }).closest(
      "div.rounded-lg",
    );
    expect(seededFollowUpCard).not.toBeNull();
    expect(within(seededFollowUpCard as HTMLElement).getByText("Agent queue")).toBeInTheDocument();
    expect(within(seededFollowUpCard as HTMLElement).queryByText("Existing track")).not.toBeInTheDocument();
    expect(screen.queryByText("- Follow up on flaky login tests")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create in ADO" }));

    await waitFor(() => {
      expect(client.repositoryPushes).toHaveLength(1);
    });

    expect(client.callLog).toContainEqual({
      method: "createRepositoryFile",
      args: [
        "retro-repo",
        "/retros/2026-03-23.md",
        expect.stringContaining("# Retrospective 2026-03-23"),
        "main",
        "Create retro notes 2026-03-23",
      ],
    });

    await user.click(screen.getByRole("button", { name: "Open in ADO" }));

    expect(openWindow).toHaveBeenCalledWith(
      "https://dev.azure.com/test-org/test-project/_git/Retro%20Repo?path=%2Fretros%2F2026-03-23.md&version=GBmain&_a=edit",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("updates the markdown draft while editing", async () => {
    const user = userEvent.setup();
    const client = new MockAdoClient();
    client.repositories = [{ id: "retro-repo", name: "Retro Repo" }];
    client.repositoryItems.set("retro-repo", [{ path: "/retros/Template.md" }]);
    client.repositoryTexts.set(
      "retro-repo:/retros/Template.md",
      ["# Retrospective DATE", "", "## Solutions", ""].join("\n"),
    );

    renderWithProviders(
      <RetroPrepView
        client={client}
        org="test-org"
        project="test-project"
        repositoryId="retro-repo"
        branchName="main"
        folder="retros"
        filenamePattern="{date}.md"
        today={new Date(2026, 2, 23)}
      />,
    );

    const editor = screen.getByLabelText("Draft markdown");
    await waitFor(() => {
      expect((editor as HTMLTextAreaElement).value).toContain("# Retrospective 2026-03-23");
    });

    await user.clear(editor);
    await user.type(
      editor,
      "# Fresh retro{enter}{enter}- **Ship** preview{enter}{enter}Paragraph with `notes`",
    );

    expect((editor as HTMLTextAreaElement).value).toContain("# Fresh retro");
    expect((editor as HTMLTextAreaElement).value).toContain("**Ship** preview");
    expect((editor as HTMLTextAreaElement).value).toContain("`notes`");
  });
});
