import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/helpers/render";
import { AzureResourceLauncher } from "./azure-resource-launcher";

describe("AzureResourceLauncher", () => {
  it("adds a resource with links for all environments", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AzureResourceLauncher open={true} onOpenChange={() => undefined} />,
    );

    expect(screen.getByText("No favorited resources yet")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add resource" }));

    fireEvent.change(screen.getByLabelText("Resource name"), {
      target: { value: "Identity API" },
    });
    await user.selectOptions(screen.getByLabelText("Resource type"), "function-app");
    fireEvent.change(screen.getByLabelText("Sandbox link"), {
      target: { value: "https://sandbox.example.com/apps/identity-api" },
    });
    fireEvent.change(screen.getByLabelText("Dev link"), {
      target: { value: "https://dev.example.com/apps/identity-api" },
    });
    fireEvent.change(screen.getByLabelText("Prod link"), {
      target: { value: "https://prod.example.com/apps/identity-api" },
    });

    const addForm = screen
      .getByRole("heading", { name: "Add resource" })
      .closest("section");
    expect(addForm).toBeTruthy();

    await user.click(
      within(addForm!).getByRole("button", {
        name: "Add resource",
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Identity API")).toBeInTheDocument();
    });
    expect(screen.getByText("Function App")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open Identity API Sandbox" }),
    ).toHaveAttribute("href", "https://sandbox.example.com/apps/identity-api");
    expect(
      screen.getByRole("link", { name: "Open Identity API Dev" }),
    ).toHaveAttribute("href", "https://dev.example.com/apps/identity-api");
    expect(
      screen.getByRole("link", { name: "Open Identity API Prod" }),
    ).toHaveAttribute("href", "https://prod.example.com/apps/identity-api");
  });

  it("saves edited resource types", async () => {
    const user = userEvent.setup();
    const { collections } = renderWithProviders(
      <AzureResourceLauncher open={true} onOpenChange={() => undefined} />,
    );

    await user.click(screen.getByRole("button", { name: "Resource types" }));

    const appServiceName = screen.getByDisplayValue("App Service");
    fireEvent.change(appServiceName, {
      target: { value: "Web App" },
    });

    const appServiceIcon = screen.getByDisplayValue("AppWindow");
    fireEvent.change(appServiceIcon, {
      target: { value: "Globe" },
    });

    await user.click(screen.getByRole("button", { name: "Save types" }));

    await waitFor(() => {
      expect(collections.resourceTypes.toArray).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "app-service",
            name: "Web App",
            iconName: "Globe",
          }),
        ]),
      );
    });
  });
});
