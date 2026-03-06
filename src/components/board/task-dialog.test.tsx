import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/helpers/render";
import { TaskDialog } from "./task-dialog";

function renderDialog(props: Partial<Parameters<typeof TaskDialog>[0]> = {}) {
  const onSave = vi.fn();
  const onOpenChange = vi.fn();
  const onDelete = vi.fn();

  const result = renderWithProviders(
    <TaskDialog
      open
      onOpenChange={onOpenChange}
      onSave={onSave}
      mode="create"
      {...props}
    />,
  );

  return { ...result, onSave, onOpenChange, onDelete };
}

describe("TaskDialog", () => {
  it("renders create mode title", () => {
    renderDialog();
    expect(screen.getByText("New Task")).toBeInTheDocument();
  });

  it("renders edit mode title", () => {
    renderDialog({ mode: "edit", initialTitle: "Existing" });
    expect(screen.getByText("Edit Task")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Existing")).toBeInTheDocument();
  });

  it("calls onSave with trimmed title on submit", async () => {
    const user = userEvent.setup();
    const { onSave, onOpenChange } = renderDialog();

    const input = screen.getByPlaceholderText("What needs to be done?");
    await user.type(input, "  New task  ");
    await user.click(screen.getByText("Create"));

    expect(onSave).toHaveBeenCalledWith("New task");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables submit when title is empty", () => {
    renderDialog();
    expect(screen.getByText("Create")).toBeDisabled();
  });

  it("shows delete button in edit mode", () => {
    const onDelete = vi.fn();
    renderDialog({ mode: "edit", initialTitle: "Task", onDelete });
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("calls onDelete when delete clicked", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const { onOpenChange } = renderDialog({
      mode: "edit",
      initialTitle: "Task",
      onDelete,
    });

    await user.click(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
