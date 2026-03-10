import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { renderWithProviders } from "@/test/helpers/render";
import { DemoView } from "./demo-view";
import { MockAdoClient } from "@/api/ado-client.mock";

type MockDragEvent = {
  canceled: boolean;
  operation: { source: unknown; target: unknown };
};

const demoDragMocks: {
  onDragEnd: ((event: MockDragEvent) => void) | null;
  reorder: ReturnType<typeof vi.fn>;
} = vi.hoisted(() => ({
  onDragEnd: null,
  reorder: vi.fn(),
}));

vi.mock("@dnd-kit/react", async () => {
  const React = await import("react");
  return {
    DragDropProvider: ({
      onDragEnd,
      children,
    }: {
      onDragEnd: (event: MockDragEvent) => void;
      children: ReactNode;
    }) => {
      demoDragMocks.onDragEnd = onDragEnd;
      return React.createElement(React.Fragment, null, children);
    },
  };
});

vi.mock("@/hooks/use-demo-work-items", () => ({
  useDemoWorkItems: () => ({
    items: [
      {
        id: 300,
        title: "Only pending story",
        type: "User Story",
        state: "Resolved",
        url: "https://example.com/item/300",
        description: "",
        acceptanceCriteria: "",
        reproSteps: "",
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/hooks/use-demo-approve", () => ({
  useDemoApprove: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/use-demo-order", () => ({
  useDemoOrder: () => ({
    sortedItems: [
      {
        id: 300,
        title: "Only pending story",
        type: "User Story",
        state: "Resolved",
        url: "https://example.com/item/300",
        description: "",
        acceptanceCriteria: "",
        reproSteps: "",
      },
    ],
    reorder: demoDragMocks.reorder,
  }),
}));

vi.mock("@dnd-kit/react/sortable", () => ({
  useSortable: () => ({ ref: () => undefined, isDragSource: false }),
  isSortableOperation: (operation: MockDragEvent["operation"]) =>
    Boolean(
      operation.source &&
      operation.target &&
      typeof operation.target === "object" &&
      operation.target !== null &&
      "index" in operation.target &&
      typeof operation.target.index === "number",
    ),
}));

describe("DemoView drag safety", () => {
  beforeEach(() => {
    demoDragMocks.onDragEnd = null;
    demoDragMocks.reorder.mockReset();
  });

  it("defers reorder mutation from onDragEnd", async () => {
    renderWithProviders(
      <DemoView
        client={new MockAdoClient()}
        approvalState="Resolved"
        closedState="Closed"
        org="org"
        project="project"
      />,
    );

    expect(demoDragMocks.onDragEnd).toBeTypeOf("function");

    demoDragMocks.onDragEnd?.({
      canceled: false,
      operation: {
        source: { id: 300 },
        target: { index: 0 },
      },
    });

    expect(demoDragMocks.reorder).not.toHaveBeenCalled();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(demoDragMocks.reorder).toHaveBeenCalledTimes(1);
    expect(demoDragMocks.reorder).toHaveBeenCalledWith(300, 0, [300]);
  });
});
