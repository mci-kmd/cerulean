import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/helpers/render";
import { setDndRenderSettledResolver } from "@/lib/schedule-dnd-mutation";
import { BoardCard } from "./board-card";
import { createWorkItem } from "@/test/fixtures/work-items";
import { createAssignment } from "@/test/fixtures/columns";
import type { WorkItem } from "@/types/board";

function renderCard(props: {
  statusMessage?: string;
  assignmentId?: string;
  columnId?: string;
  workItemOverrides?: Partial<WorkItem>;
}) {
  const workItem = createWorkItem({ id: 1, title: "Test Item", ...props.workItemOverrides });
  const assignment = createAssignment({
    id: props.assignmentId ?? "asgn-1",
    workItemId: 1,
    statusMessage: props.statusMessage,
  });

  const result = renderWithProviders(
    <BoardCard
      workItem={workItem}
      assignmentId={assignment.id}
      statusMessage={assignment.statusMessage}
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

describe("BoardCard status message", () => {
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
  it("renders related pull request links for bug cards", () => {
    renderCard({
      workItemOverrides: {
        type: "Bug",
        relatedPullRequests: [
          {
            id: "123",
            label: "PR #123",
            url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/123",
          },
        ],
      },
    });

    expect(screen.getByRole("link", { name: "PR #123" })).toHaveAttribute(
      "href",
      "https://dev.azure.com/org/proj/_git/repo/pullrequest/123",
    );
  });

  it("renders related pull request links for user stories", () => {
    renderCard({
      workItemOverrides: {
        type: "User Story",
        relatedPullRequests: [
          {
            id: "124",
            label: "PR #124",
            url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/124",
          },
        ],
      },
    });

    expect(screen.getByRole("link", { name: "PR #124" })).toBeInTheDocument();
  });

  it("does not render related pull request links for non-bug/story cards", () => {
    renderCard({
      workItemOverrides: {
        type: "Task",
        relatedPullRequests: [
          {
            id: "999",
            label: "PR #999",
            url: "https://dev.azure.com/org/proj/_git/repo/pullrequest/999",
          },
        ],
      },
    });

    expect(screen.queryByRole("link", { name: "PR #999" })).toBeNull();
  });
});
