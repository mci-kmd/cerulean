import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/helpers/render";
import { setDndRenderSettledResolver } from "@/lib/schedule-dnd-mutation";
import { BoardCard } from "./board-card";
import { createWorkItem } from "@/test/fixtures/work-items";
import { createAssignment } from "@/test/fixtures/columns";
import { COMPLETED_COLUMN_ID, DEFAULT_SETTINGS, type WorkItem } from "@/types/board";

const openAdoPullRequestCreateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ado-pr-create", () => ({
  openAdoPullRequestCreate: openAdoPullRequestCreateMock,
}));

function renderCard(props: {
  statusMessage?: string;
  mockupUrl?: string;
  discussionUrl?: string;
  assignmentId?: string;
  columnId?: string;
  workItemOverrides?: Partial<WorkItem>;
}) {
  const workItem = createWorkItem({ id: 1, title: "Test Item", ...props.workItemOverrides });
  const assignment = createAssignment({
    id: props.assignmentId ?? "asgn-1",
    workItemId: workItem.id,
    statusMessage: props.statusMessage,
    mockupUrl: props.mockupUrl,
    discussionUrl: props.discussionUrl,
  });

  const result = renderWithProviders(
    <BoardCard
      workItem={workItem}
      assignmentId={assignment.id}
      statusMessage={assignment.statusMessage}
      mockupUrl={assignment.mockupUrl}
      discussionUrl={assignment.discussionUrl}
      index={0}
      columnId={props.columnId ?? "col-todo"}
    />,
  );

  // Seed assignment into collection so updates work
  result.collections.assignments.insert(assignment);

  return result;
}

function renderCustomTaskCard() {
  const workItem = createWorkItem({
    id: -1000,
    title: "Custom Task",
    type: "Task",
    url: "",
  });
  const assignment = createAssignment({
    id: "asgn-task",
    workItemId: -1000,
  });

  const result = renderWithProviders(
    <BoardCard
      workItem={workItem}
      assignmentId={assignment.id}
      statusMessage={undefined}
      index={0}
      columnId="col-todo"
    />,
  );

  result.collections.assignments.insert(assignment);
  result.collections.customTasks.insert({
    id: "ct-1",
    workItemId: -1000,
    title: "Custom Task",
  });

  return result;
}

function getRenderedCardRoot() {
  const card = screen.getByTestId("board-card");

  if (!(card instanceof HTMLElement)) {
    throw new Error("Board card root not found");
  }

  return card;
}

function getRenderedCardSurface() {
  const surface = screen.getByTestId("board-card-surface");

  if (!(surface instanceof HTMLElement)) {
    throw new Error("Board card surface not found");
  }

  return surface;
}

function insertAdoSettings(
  collections: ReturnType<typeof renderWithProviders>["collections"],
  overrides: Partial<typeof DEFAULT_SETTINGS> = {},
) {
  act(() => {
    collections.settings.insert({
      ...DEFAULT_SETTINGS,
      id: "settings",
      pat: "test-pat",
      org: "test-org",
      project: "test-project",
      ...overrides,
    });
  });
}

beforeEach(() => {
  openAdoPullRequestCreateMock.mockReset();
  openAdoPullRequestCreateMock.mockResolvedValue({ status: "opened" });
});

describe("BoardCard custom task", () => {
  it("does not render copyable ID for custom tasks", () => {
    renderCustomTaskCard();
    expect(screen.queryByText(/#-1000/)).toBeNull();
  });

  it("renders title as button instead of link", () => {
    renderCustomTaskCard();
    const titleBtn = screen.getByRole("button", { name: "Custom Task" });
    expect(titleBtn).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Custom Task" })).toBeNull();
  });
});

describe("BoardCard UI review task", () => {
  it("renders a linked title with the copyable work item id but without task-edit or ADO PR controls", async () => {
    const { collections } = renderCard({
      workItemOverrides: {
        id: -1200,
        displayId: 42,
        title: "UI review login flow",
        type: "Task",
        url: "https://dev.azure.com/test-org/test-project/_workitems/edit/42",
        kind: "ui-review",
        uiReview: {
          sourceWorkItemId: 42,
          reviewTag: "UI Review",
        },
      },
    });
    insertAdoSettings(collections);

    expect(
      screen.getByRole("link", { name: "UI review login flow" }),
    ).toHaveAttribute(
      "href",
      "https://dev.azure.com/test-org/test-project/_workitems/edit/42",
    );
    expect(screen.queryByRole("button", { name: "Edit task" })).toBeNull();
    expect(screen.getByRole("button", { name: "Copy ID 42" })).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByRole("button", {
          name: "Create pull request for work item 42",
        }),
      ).toBeNull();
    });
  });

  it("keeps the neutral background but uses teal accent styling and a review icon", () => {
    renderCard({
      workItemOverrides: {
        id: -1200,
        displayId: 42,
        title: "UI review login flow",
        type: "Task",
        url: "https://dev.azure.com/test-org/test-project/_workitems/edit/42",
        kind: "ui-review",
        uiReview: {
          sourceWorkItemId: 42,
          reviewTag: "UI Review",
        },
      },
    });

    const card = getRenderedCardRoot();
    const surface = getRenderedCardSurface();
    expect(surface).toHaveClass("bg-card");
    expect(surface).toHaveClass("border-l-teal-400");
    expect(surface).not.toHaveClass("bg-amber-50");
    expect(card.querySelector(".lucide-eye")).not.toBeNull();
    expect(card.querySelector(".lucide-clipboard-list")).toBeNull();
  });

  it("renders labeled mockup and discussion links with hover-only pencil buttons", () => {
    renderCard({
      mockupUrl: "https://www.figma.com/file/mockup-123",
      discussionUrl: "https://github.com/test-org/test-repo/pull/42",
      workItemOverrides: {
        id: -1200,
        displayId: 42,
        title: "UI review login flow",
        type: "Task",
        url: "https://dev.azure.com/test-org/test-project/_workitems/edit/42",
        kind: "ui-review",
        uiReview: {
          sourceWorkItemId: 42,
          reviewTag: "UI Review",
        },
      },
    });

    const mockupLink = screen.getByRole("link", { name: "Mockup" });
    const discussionLink = screen.getByRole("link", { name: "Discussion" });
    const editMockupButton = screen.getByRole("button", { name: "Edit mockup URL" });
    const editDiscussionButton = screen.getByRole("button", { name: "Edit discussion URL" });

    expect(mockupLink).toHaveAttribute("href", "https://www.figma.com/file/mockup-123");
    expect(discussionLink).toHaveAttribute("href", "https://github.com/test-org/test-repo/pull/42");
    expect(screen.queryByText("https://www.figma.com/file/mockup-123")).toBeNull();
    expect(screen.queryByText("https://github.com/test-org/test-repo/pull/42")).toBeNull();
    expect(editMockupButton).toHaveClass("w-4");
    expect(editMockupButton).toHaveClass("opacity-0");
    expect(editMockupButton).toHaveClass("group-hover/mockup:opacity-100");
    expect(editDiscussionButton).toHaveClass("w-4");
    expect(editDiscussionButton).toHaveClass("opacity-0");
    expect(editDiscussionButton).toHaveClass("group-hover/discussion:opacity-100");
  });

  it("opens a mockup URL editor from the pencil button and saves on blur", async () => {
    const user = userEvent.setup();
    const { collections } = renderCard({
      assignmentId: "asgn-mockup-save",
      workItemOverrides: {
        id: -1200,
        displayId: 42,
        title: "UI review login flow",
        type: "Task",
        url: "https://dev.azure.com/test-org/test-project/_workitems/edit/42",
        kind: "ui-review",
        uiReview: {
          sourceWorkItemId: 42,
          reviewTag: "UI Review",
        },
      },
    });

    await user.click(screen.getByRole("button", { name: "Set mockup URL" }));
    const input = screen.getByPlaceholderText("Set mockup URL...");
    await user.type(input, "https://www.figma.com/file/mockup-save");
    await user.tab();

    await waitFor(() => {
      expect(collections.assignments.get("asgn-mockup-save")?.mockupUrl).toBe(
        "https://www.figma.com/file/mockup-save",
      );
    });
    expect(
      screen.getByRole("link", { name: "Mockup" }),
    ).toHaveAttribute("href", "https://www.figma.com/file/mockup-save");
  });

  it("trims and clears the mockup URL like status messages do", async () => {
    const user = userEvent.setup();
    const { collections } = renderCard({
      assignmentId: "asgn-mockup-clear",
      mockupUrl: "https://www.figma.com/file/original",
      workItemOverrides: {
        id: -1200,
        displayId: 42,
        title: "UI review login flow",
        type: "Task",
        url: "https://dev.azure.com/test-org/test-project/_workitems/edit/42",
        kind: "ui-review",
        uiReview: {
          sourceWorkItemId: 42,
          reviewTag: "UI Review",
        },
      },
    });

    await user.click(screen.getByRole("button", { name: "Edit mockup URL" }));
    const input = screen.getByDisplayValue("https://www.figma.com/file/original");
    await user.clear(input);
    await user.type(input, "  https://www.figma.com/file/trimmed  ");
    await user.tab();

    await waitFor(() => {
      expect(collections.assignments.get("asgn-mockup-clear")?.mockupUrl).toBe(
        "https://www.figma.com/file/trimmed",
      );
    });

    await user.click(screen.getByRole("button", { name: "Edit mockup URL" }));
    await user.clear(screen.getByDisplayValue("https://www.figma.com/file/trimmed"));
    await user.tab();

    await waitFor(() => {
      expect(collections.assignments.get("asgn-mockup-clear")?.mockupUrl).toBeUndefined();
    });
    expect(screen.getByRole("button", { name: "Set mockup URL" })).toBeInTheDocument();
  });

  it("trims and clears the discussion URL like status messages do", async () => {
    const user = userEvent.setup();
    const { collections } = renderCard({
      assignmentId: "asgn-discussion-clear",
      discussionUrl: "https://github.com/test-org/test-repo/pull/original",
      workItemOverrides: {
        id: -1200,
        displayId: 42,
        title: "UI review login flow",
        type: "Task",
        url: "https://dev.azure.com/test-org/test-project/_workitems/edit/42",
        kind: "ui-review",
        uiReview: {
          sourceWorkItemId: 42,
          reviewTag: "UI Review",
        },
      },
    });

    await user.click(screen.getByRole("button", { name: "Edit discussion URL" }));
    const input = screen.getByDisplayValue("https://github.com/test-org/test-repo/pull/original");
    await user.clear(input);
    await user.type(input, "  https://github.com/test-org/test-repo/pull/trimmed  ");
    await user.tab();

    await waitFor(() => {
      expect(collections.assignments.get("asgn-discussion-clear")?.discussionUrl).toBe(
        "https://github.com/test-org/test-repo/pull/trimmed",
      );
    });

    await user.click(screen.getByRole("button", { name: "Edit discussion URL" }));
    await user.clear(screen.getByDisplayValue("https://github.com/test-org/test-repo/pull/trimmed"));
    await user.tab();

    await waitFor(() => {
      expect(collections.assignments.get("asgn-discussion-clear")?.discussionUrl).toBeUndefined();
    });
    expect(screen.getByRole("button", { name: "Set discussion URL" })).toBeInTheDocument();
  });

  it("hides the UI review link editors in the completed column", () => {
    renderCard({
      columnId: COMPLETED_COLUMN_ID,
      mockupUrl: "https://www.figma.com/file/mockup-123",
      discussionUrl: "https://github.com/test-org/test-repo/pull/42",
      workItemOverrides: {
        id: -1200,
        displayId: 42,
        title: "UI review login flow",
        type: "Task",
        url: "https://dev.azure.com/test-org/test-project/_workitems/edit/42",
        kind: "ui-review",
        uiReview: {
          sourceWorkItemId: 42,
          reviewTag: "UI Review",
        },
      },
    });

    expect(screen.queryByRole("button", { name: "Edit mockup URL" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Set mockup URL" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit discussion URL" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Set discussion URL" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Mockup" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Discussion" })).toBeNull();
  });
});

describe("BoardCard hover styling", () => {
  it("adds a subtle background highlight without lifting the card", () => {
    renderCard({});

    const card = getRenderedCardRoot();
    const surface = getRenderedCardSurface();

    expect(card).not.toHaveClass("hover:-translate-y-px");
    expect(surface).toHaveClass("transition-[background-color]");
    expect(surface).toHaveClass("group-hover/card:bg-accent/30");
  });
});

describe("BoardCard review items", () => {
  it("renders review label, stripes, reviewer count, and source work item id", () => {
    renderCard({
      workItemOverrides: {
        id: -501,
        displayId: 42,
        kind: "review",
        type: "Bug",
        relatedPullRequests: [
          {
            id: "7001",
            label: "PR #7001",
            title: "Review login flow",
            status: "active",
            reviewerCount: 4,
            unresolvedCommentCount: 2,
            url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/7001",
          },
        ],
        review: {
          repositoryId: "repo",
          pullRequestId: 7001,
          reviewState: "new",
        },
      },
    });

    expect(screen.getByTestId("review-label")).toHaveTextContent("REVIEW");
    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.queryByText("#-501")).toBeNull();
    expect(screen.getByTestId("pr-reviewer-count-7001")).toHaveTextContent("4");
    expect(screen.getByTestId("pr-unresolved-comments-7001")).toHaveTextContent("2");
    expect(getRenderedCardSurface().style.backgroundImage).toContain("repeating-linear-gradient");
  });
});

describe("BoardCard create PR button", () => {
  it("renders a create PR button before the copyable id for ADO-backed cards", async () => {
    const { collections } = renderCard({});
    insertAdoSettings(collections);

    const button = await screen.findByRole("button", {
      name: "Create pull request for work item 1",
    });
    const idButton = screen.getByRole("button", { name: "Copy ID 1" });

    expect(button.compareDocumentPosition(idButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("does not render a create PR button for GitHub review cards", async () => {
    const { collections } = renderCard({
      workItemOverrides: {
        id: -501,
        displayId: 42,
        kind: "review",
        review: {
          provider: "github",
          repositoryId: "octo-org/widgets",
          pullRequestId: 12,
          reviewState: "new",
        },
      },
    });
    insertAdoSettings(collections);

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Create pull request for work item 42" }),
      ).toBeNull();
    });
  });

  it("opens ADO PR creation flow with the displayed work item id", async () => {
    const user = userEvent.setup();
    const { collections } = renderCard({
      workItemOverrides: {
        id: -501,
        displayId: 42,
        kind: "review",
        review: {
          provider: "ado",
          repositoryId: "repo-1",
          pullRequestId: 7001,
          reviewState: "new",
        },
      },
    });
    insertAdoSettings(collections);

    await user.click(
      await screen.findByRole("button", { name: "Create pull request for work item 42" }),
    );

    expect(openAdoPullRequestCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        org: "test-org",
        project: "test-project",
        workItemId: 42,
      }),
    );
  });
});

describe("BoardCard status message", () => {
  it("hides the status editor in the completed column", () => {
    renderCard({
      columnId: COMPLETED_COLUMN_ID,
      statusMessage: "Done",
    });

    expect(screen.queryByPlaceholderText("Set status...")).toBeNull();
    expect(screen.queryByDisplayValue("Done")).toBeNull();
  });

  it("renders placeholder when no status", () => {
    renderCard({});
    expect(screen.getByPlaceholderText("Set status...")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Set status...")).toHaveValue("");
  });

  it("renders existing status message", () => {
    renderCard({ statusMessage: "In review" });
    expect(screen.getByDisplayValue("In review")).toBeInTheDocument();
  });

  it("uses a wrapping multiline status editor", () => {
    renderCard({ statusMessage: "Needs extra details before review" });
    const editor = screen.getByDisplayValue("Needs extra details before review");
    expect(editor.tagName).toBe("TEXTAREA");
    expect(editor).toHaveAttribute("wrap", "soft");
  });

  it("updates collection on blur", async () => {
    const user = userEvent.setup();
    const { collections } = renderCard({ assignmentId: "asgn-blur" });

    const input = screen.getByPlaceholderText("Set status...");
    await user.click(input);
    await user.type(input, "Blocked");
    await user.tab(); // blur

    await waitFor(() => {
      const updated = collections.assignments.get("asgn-blur");
      expect(updated?.statusMessage).toBe("Blocked");
    });
  });

  it("updates collection on Enter", async () => {
    const user = userEvent.setup();
    const { collections } = renderCard({ assignmentId: "asgn-enter" });

    const input = screen.getByPlaceholderText("Set status...");
    await user.click(input);
    await user.type(input, "Done");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      const updated = collections.assignments.get("asgn-enter");
      expect(updated?.statusMessage).toBe("Done");
    });
  });

  it("trims whitespace before saving", async () => {
    const user = userEvent.setup();
    const { collections } = renderCard({ assignmentId: "asgn-trim" });

    const input = screen.getByPlaceholderText("Set status...");
    await user.click(input);
    await user.type(input, "  Spaced  ");
    await user.tab();

    await waitFor(() => {
      const updated = collections.assignments.get("asgn-trim");
      expect(updated?.statusMessage).toBe("Spaced");
    });
  });

  it("clears statusMessage when emptied", async () => {
    const user = userEvent.setup();
    const { collections } = renderCard({
      assignmentId: "asgn-clear",
      statusMessage: "Old status",
    });

    const input = screen.getByDisplayValue("Old status");
    await user.clear(input);
    await user.tab();

    await waitFor(() => {
      const updated = collections.assignments.get("asgn-clear");
      expect(updated?.statusMessage).toBeUndefined();
    });
  });

  it("stops pointer events from propagating (drag prevention)", async () => {
    renderCard({});
    const input = screen.getByPlaceholderText("Set status...");

    const pointerDown = new PointerEvent("pointerdown", { bubbles: true });
    const stopSpy = vi.spyOn(pointerDown, "stopPropagation");
    input.dispatchEvent(pointerDown);

    expect(stopSpy).toHaveBeenCalled();
  });

  it("stops keydown from propagating", async () => {
    renderCard({});
    const input = screen.getByPlaceholderText("Set status...");

    const keydown = new KeyboardEvent("keydown", {
      key: "a",
      bubbles: true,
    });
    const stopSpy = vi.spyOn(keydown, "stopPropagation");
    input.dispatchEvent(keydown);

    expect(stopSpy).toHaveBeenCalled();
  });

  it("does not save when value unchanged", async () => {
    const user = userEvent.setup();
    const { collections } = renderCard({
      assignmentId: "asgn-noop",
      statusMessage: "Same",
    });

    const updateSpy = vi.spyOn(collections.assignments, "update");

    const input = screen.getByDisplayValue("Same");
    await user.click(input);
    await user.tab(); // blur without changing

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("does not crash when assignment is removed before blur save", async () => {
    const user = userEvent.setup();
    const { collections } = renderCard({ assignmentId: "asgn-missing" });

    const input = screen.getByPlaceholderText("Set status...");
    await user.click(input);
    await user.type(input, "Changed");
    collections.assignments.delete(["asgn-missing"]);

    await expect(user.tab()).resolves.toBeUndefined();
    expect(collections.assignments.get("asgn-missing")).toBeUndefined();
  });

  it("waits for global dnd settle resolver before saving status", async () => {
    vi.useFakeTimers();
    try {
      const { collections } = renderCard({ assignmentId: "asgn-global-settle" });
      let resolveRendering!: () => void;
      const renderSettled = new Promise<void>((resolve) => {
        resolveRendering = resolve;
      });
      setDndRenderSettledResolver(() => renderSettled);

      const input = screen.getByPlaceholderText("Set status...");
      fireEvent.change(input, { target: { value: "Deferred save" } });
      fireEvent.blur(input);

      expect(collections.assignments.get("asgn-global-settle")?.statusMessage).toBeUndefined();
      resolveRendering();
      await Promise.resolve();
      act(() => {
        vi.runAllTimers();
      });
      expect(collections.assignments.get("asgn-global-settle")?.statusMessage).toBe(
        "Deferred save",
      );
    } finally {
      setDndRenderSettledResolver(undefined);
      vi.useRealTimers();
    }
  });
});

describe("BoardCard related PR links", () => {
  it("shows unresolved comment count next to relevant active pull request titles", () => {
    renderCard({
      workItemOverrides: {
        type: "Bug",
        relatedPullRequests: [
          {
            id: "2001",
            label: "PR #2001",
            title: "Active PR one",
            status: "active",
            unresolvedCommentCount: 2,
            url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/2001",
          },
          {
            id: "2002",
            label: "PR #2002",
            title: "Completed PR",
            status: "completed",
            unresolvedCommentCount: 7,
            url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/2002",
          },
          {
            id: "2003",
            label: "PR #2003",
            title: "Active PR two",
            status: "active",
            unresolvedCommentCount: 1,
            url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/2003",
          },
        ],
      },
    });

    const activePrOne = screen.getByRole("link", { name: "Active PR one" });
    const activePrTwo = screen.getByRole("link", { name: "Active PR two" });
    const completedPr = screen.getByRole("link", { name: "Completed PR (Completed)" });
    const workItemLink = screen.getByRole("link", { name: "Test Item" });

    expect(within(activePrOne).getByTestId("pr-unresolved-comments-2001")).toHaveTextContent("2");
    expect(within(activePrTwo).getByTestId("pr-unresolved-comments-2003")).toHaveTextContent("1");
    expect(within(completedPr).queryByTestId("pr-unresolved-comments-2002")).toBeNull();
    expect(workItemLink.querySelector('[data-testid^="pr-unresolved-comments-"]')).toBeNull();
  });

  it("hides unresolved comment count when active pull requests have none", () => {
    renderCard({
      workItemOverrides: {
        type: "Bug",
        relatedPullRequests: [
          {
            id: "2010",
            label: "PR #2010",
            title: "Active clean PR",
            status: "active",
            unresolvedCommentCount: 0,
            url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/2010",
          },
          {
            id: "2011",
            label: "PR #2011",
            title: "Completed old PR",
            status: "completed",
            unresolvedCommentCount: 4,
            url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/2011",
          },
        ],
      },
    });

    const workItemLink = screen.getByRole("link", { name: "Test Item" });
    expect(screen.queryByTestId("pr-unresolved-comments-2010")).toBeNull();
    expect(screen.queryByTestId("pr-unresolved-comments-2011")).toBeNull();
    expect(workItemLink.querySelector('[data-testid^="pr-unresolved-comments-"]')).toBeNull();
  });

  it("shows approval count for active pull requests when at least one reviewer approved", () => {
    renderCard({
      workItemOverrides: {
        type: "Bug",
        relatedPullRequests: [
          {
            id: "2020",
            label: "PR #2020",
            title: "Active PR with approvals",
            status: "active",
            unresolvedCommentCount: 2,
            approvalCount: 3,
            url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/2020",
          },
          {
            id: "2021",
            label: "PR #2021",
            title: "Active PR with one approval",
            status: "active",
            unresolvedCommentCount: 2,
            approvalCount: 1,
            url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/2021",
          },
          {
            id: "2022",
            label: "PR #2022",
            title: "Completed PR with approvals",
            status: "completed",
            unresolvedCommentCount: 4,
            approvalCount: 5,
            url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/2022",
          },
        ],
      },
    });

    const activePrWithApprovals = screen.getByRole("link", { name: "Active PR with approvals" });
    const activePrWithOneApproval = screen.getByRole("link", { name: "Active PR with one approval" });
    const completedPr = screen.getByRole("link", { name: "Completed PR with approvals (Completed)" });

    expect(within(activePrWithApprovals).getByTestId("pr-unresolved-comments-2020")).toHaveTextContent(
      "2",
    );
    expect(within(activePrWithApprovals).getByTestId("pr-approval-count-2020")).toHaveTextContent(
      "3",
    );
    expect(within(activePrWithOneApproval).getByTestId("pr-approval-count-2021")).toHaveTextContent(
      "1",
    );
    expect(within(completedPr).queryByTestId("pr-approval-count-2022")).toBeNull();

    const unresolvedBadge = within(activePrWithApprovals).getByTestId("pr-unresolved-comments-2020");
    const approvalBadge = within(activePrWithApprovals).getByTestId("pr-approval-count-2020");
    expect(unresolvedBadge.compareDocumentPosition(approvalBadge) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it("renders related pull request title for bug cards", () => {
    renderCard({
      workItemOverrides: {
        type: "Bug",
        relatedPullRequests: [
          {
            id: "123",
            label: "PR #123",
            title: "Improve login flow",
            url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/123",
          },
        ],
      },
    });

    const prLink = screen.getByRole("link", { name: "Improve login flow" });
    expect(prLink).toHaveAttribute(
      "href",
      "https://dev.azure.com/org/proj/_git/repo/pullrequest/123",
    );
    expect(prLink.querySelector("svg")).not.toBeNull();
  });

  it("postfixes completed pull requests", () => {
    renderCard({
      workItemOverrides: {
        type: "User Story",
        relatedPullRequests: [
          {
            id: "124",
            label: "PR #124",
            title: "Ship release notes",
            isCompleted: true,
            url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/124",
          },
        ],
      },
    });

    const completedPrLink = screen.getByRole("link", { name: "Ship release notes (Completed)" });
    expect(completedPrLink).toBeInTheDocument();
    expect(within(completedPrLink).getByText("Ship release notes (Completed)")).toHaveClass(
      "opacity-60",
    );
  });

  it("orders active pull requests before completed ones", () => {
    renderCard({
      workItemOverrides: {
        type: "Bug",
        relatedPullRequests: [
          {
            id: "200",
            label: "PR #200",
            title: "Finalize migration",
            isCompleted: true,
            url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/200",
          },
          {
            id: "199",
            label: "PR #199",
            title: "Add migration script",
            isCompleted: false,
            url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/199",
          },
        ],
      },
    });

    const links = within(screen.getByRole("list")).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Add migration script",
      "Finalize migration (Completed)",
    ]);
  });

  it("does not render related pull request links for non-bug/story cards", () => {
    renderCard({
      workItemOverrides: {
        type: "Task",
        relatedPullRequests: [
          {
            id: "999",
            label: "PR #999",
            title: "This should not render",
            url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/999",
          },
        ],
      },
    });

    expect(screen.queryByRole("link", { name: "This should not render" })).toBeNull();
  });

  it("shows green icon + tooltip for mergeable pull requests", async () => {
    const user = userEvent.setup();
    renderCard({
      workItemOverrides: {
        type: "Bug",
        relatedPullRequests: [
          {
            id: "300",
            label: "PR #300",
            title: "Ready to merge",
            status: "active",
            mergeStatus: "succeeded",
            requiredReviewersApproved: true,
            requiredReviewersPendingCount: 0,
            url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/300",
          },
        ],
      },
    });

    const icon = screen.getByTestId("pr-status-icon-300");
    expect(icon).toHaveClass("text-green-600");
    await user.hover(icon);
    expect(await screen.findByRole("tooltip", { name: "Mergeable" })).toBeInTheDocument();
  });

  it("shows required-reviewer gate tooltip when approvals are still pending", async () => {
    const user = userEvent.setup();
    renderCard({
      workItemOverrides: {
        type: "Bug",
        relatedPullRequests: [
          {
            id: "303",
            label: "PR #303",
            title: "Waiting on reviewer",
            status: "active",
            mergeStatus: "succeeded",
            requiredReviewersApproved: false,
            requiredReviewersPendingCount: 1,
            url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/303",
          },
        ],
      },
    });

    const icon = screen.getByTestId("pr-status-icon-303");
    expect(icon).toHaveClass("text-amber-600");
    expect(icon).toHaveAttribute("data-pr-icon-variant", "review-gate");
    await user.hover(icon);
    expect(
      await screen.findByRole("tooltip", {
        name: "Waiting for 1 required reviewer approval",
      }),
    ).toBeInTheDocument();
  });

  it("shows red conflict icon + tooltip when PR has merge conflicts", async () => {
    const user = userEvent.setup();
    renderCard({
      workItemOverrides: {
        type: "Bug",
        relatedPullRequests: [
          {
            id: "301",
            label: "PR #301",
            title: "Conflict PR",
            status: "active",
            mergeStatus: "conflicts",
            url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/301",
          },
        ],
      },
    });

    const icon = screen.getByTestId("pr-status-icon-301");
    expect(icon).toHaveClass("text-red-600");
    expect(icon).toHaveAttribute("data-pr-icon-variant", "conflict");
    await user.hover(icon);
    expect(
      await screen.findByRole("tooltip", { name: "Cannot merge: merge conflicts" }),
    ).toBeInTheDocument();
  });

  it("shows red build-error icon + tooltip when PR fails policy/build checks", async () => {
    const user = userEvent.setup();
    renderCard({
      workItemOverrides: {
        type: "User Story",
        relatedPullRequests: [
          {
            id: "302",
            label: "PR #302",
            title: "Broken build PR",
            status: "active",
            mergeStatus: "rejectedByPolicy",
            url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/302",
          },
        ],
      },
    });

    const icon = screen.getByTestId("pr-status-icon-302");
    expect(icon).toHaveClass("text-red-600");
    expect(icon).toHaveAttribute("data-pr-icon-variant", "build-error");
    await user.hover(icon);
    expect(
      await screen.findByRole("tooltip", { name: "Cannot merge: build or policy checks failed" }),
    ).toBeInTheDocument();
  });

  it("uses red icon and includes all blocking statuses when build fails and reviewers are pending", async () => {
    const user = userEvent.setup();
    renderCard({
      workItemOverrides: {
        type: "User Story",
        relatedPullRequests: [
          {
            id: "305",
            label: "PR #305",
            title: "Blocked by build and reviewers",
            status: "active",
            mergeStatus: "rejectedByPolicy",
            requiredReviewersApproved: false,
            requiredReviewersPendingCount: 2,
            url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/305",
          },
        ],
      },
    });

    const icon = screen.getByTestId("pr-status-icon-305");
    expect(icon).toHaveClass("text-red-600");
    expect(icon).toHaveAttribute("data-pr-icon-variant", "build-error");
    await user.hover(icon);
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Cannot merge: build or policy checks failed");
    expect(tooltip).toHaveTextContent("Waiting for 2 required reviewers approval");
  });

  it("uses red icon when checks fail even if merge status is succeeded and reviewers are pending", async () => {
    const user = userEvent.setup();
    renderCard({
      workItemOverrides: {
        type: "User Story",
        relatedPullRequests: [
          {
            id: "306",
            label: "PR #306",
            title: "Failing checks and pending reviewers",
            status: "active",
            mergeStatus: "succeeded",
            requiredReviewersApproved: false,
            requiredReviewersPendingCount: 1,
            failingStatusChecks: ["CI Build"],
            url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/306",
          },
        ],
      },
    });

    const icon = screen.getByTestId("pr-status-icon-306");
    expect(icon).toHaveClass("text-red-600");
    expect(icon).toHaveAttribute("data-pr-icon-variant", "build-error");
    await user.hover(icon);
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Failing required checks: CI Build");
    expect(tooltip).toHaveTextContent("Waiting for 1 required reviewer approval");
  });

  it("shows red build-error icon when pull request merge status is failure", async () => {
    const user = userEvent.setup();
    renderCard({
      workItemOverrides: {
        type: "User Story",
        relatedPullRequests: [
          {
            id: "304",
            label: "PR #304",
            title: "Failing merge PR",
            status: "active",
            mergeStatus: "failure",
            url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/304",
          },
        ],
      },
    });

    const icon = screen.getByTestId("pr-status-icon-304");
    expect(icon).toHaveClass("text-red-600");
    expect(icon).toHaveAttribute("data-pr-icon-variant", "build-error");
    await user.hover(icon);
    expect(
      await screen.findByRole("tooltip", { name: "Cannot merge: merge failed" }),
    ).toBeInTheDocument();
  });
});
