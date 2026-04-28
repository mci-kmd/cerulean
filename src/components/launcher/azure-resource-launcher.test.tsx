import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTestCollections, renderWithProviders } from "@/test/helpers/render";
import { AzureResourceLauncher } from "./azure-resource-launcher";

describe("AzureResourceLauncher", () => {
  it("adds a resource with child links for all environments", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AzureResourceLauncher open={true} onOpenChange={() => undefined} />,
    );

    expect(screen.getByText("No favorited resources yet")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add resource" }));

    const rootSection = screen
      .getByRole("heading", { name: "Root resource" })
      .closest("section");
    expect(rootSection).toBeTruthy();

    fireEvent.change(within(rootSection!).getByLabelText("Resource name"), {
      target: { value: "Identity API" },
    });
    fireEvent.change(within(rootSection!).getByLabelText("Sandbox link"), {
      target: { value: "https://sandbox.example.com/apps/identity-api" },
    });
    fireEvent.change(within(rootSection!).getByLabelText("Dev link"), {
      target: { value: "https://dev.example.com/apps/identity-api" },
    });
    fireEvent.change(within(rootSection!).getByLabelText("Prod link"), {
      target: { value: "https://prod.example.com/apps/identity-api" },
    });

    await user.click(screen.getByRole("button", { name: "Add child resource" }));

    const childSection = screen
      .getByRole("heading", { name: "Child resource 1" })
      .closest("section");
    expect(childSection).toBeTruthy();

    fireEvent.change(within(childSection!).getByLabelText("Resource name"), {
      target: { value: "Identity Insights" },
    });
    await user.selectOptions(
      within(childSection!).getByLabelText("Resource type"),
      "app-insights",
    );
    fireEvent.change(within(childSection!).getByLabelText("Sandbox link"), {
      target: { value: "https://sandbox.example.com/insights/identity-api" },
    });
    fireEvent.change(within(childSection!).getByLabelText("Dev link"), {
      target: { value: "https://dev.example.com/insights/identity-api" },
    });
    fireEvent.change(within(childSection!).getByLabelText("Prod link"), {
      target: { value: "https://prod.example.com/insights/identity-api" },
    });

    await user.click(screen.getByRole("button", { name: "Save resource" }));

    await waitFor(() => {
      expect(screen.getByText("Identity API")).toBeInTheDocument();
    });

    const resourceName = screen.getByText("Identity API");
    const resourceTitle = resourceName.closest("div");
    expect(resourceTitle?.previousElementSibling?.tagName).toBe("svg");

    expect(screen.getAllByText("App Service").length).toBeGreaterThan(1);
    expect(screen.getAllByText("App Insights").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: "Open Identity API App Service Sandbox" }),
    ).toHaveAttribute("href", "https://sandbox.example.com/apps/identity-api");
    expect(
      screen.getByRole("link", {
        name: "Open Identity Insights App Insights Sandbox",
      }),
    ).toHaveAttribute("href", "https://sandbox.example.com/insights/identity-api");
    expect(
      screen.getByRole("link", { name: "Open Identity API App Service Dev" }),
    ).toHaveAttribute("href", "https://dev.example.com/apps/identity-api");
    expect(
      screen.getByRole("link", { name: "Open Identity Insights App Insights Prod" }),
    ).toHaveAttribute("href", "https://prod.example.com/insights/identity-api");
  });

  it("edits an existing resource and stores child resources", async () => {
    const user = userEvent.setup();
    const testCollections = createTestCollections();
    testCollections.launcherResources.insert({
      id: "resource-1",
      name: "Identity API",
      typeId: "app-service",
      sandboxUrl: "https://sandbox.example.com/apps/identity-api",
      devUrl: "https://dev.example.com/apps/identity-api",
      prodUrl: "https://prod.example.com/apps/identity-api",
      order: 0,
      children: [],
    });

    const { collections } = renderWithProviders(
      <AzureResourceLauncher open={true} onOpenChange={() => undefined} />,
      { collections: testCollections },
    );

    await waitFor(() => {
      expect(screen.getByText("Identity API")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Edit Identity API" }));

    const rootSection = screen
      .getByRole("heading", { name: "Root resource" })
      .closest("section");
    expect(within(rootSection!).getByDisplayValue("Identity API")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add child resource" }));

    const childSection = screen
      .getByRole("heading", { name: "Child resource 1" })
      .closest("section");
    expect(childSection).toBeTruthy();

    fireEvent.change(within(childSection!).getByLabelText("Resource name"), {
      target: { value: "Identity Insights" },
    });
    await user.selectOptions(
      within(childSection!).getByLabelText("Resource type"),
      "app-insights",
    );
    fireEvent.change(within(childSection!).getByLabelText("Sandbox link"), {
      target: { value: "https://sandbox.example.com/insights/identity-api" },
    });
    fireEvent.change(within(childSection!).getByLabelText("Dev link"), {
      target: { value: "https://dev.example.com/insights/identity-api" },
    });
    fireEvent.change(within(childSection!).getByLabelText("Prod link"), {
      target: { value: "https://prod.example.com/insights/identity-api" },
    });

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(collections.launcherResources.get("resource-1")?.children).toEqual([
        {
          id: expect.any(String),
          name: "Identity Insights",
          typeId: "app-insights",
          sandboxUrl: "https://sandbox.example.com/insights/identity-api",
          devUrl: "https://dev.example.com/insights/identity-api",
          prodUrl: "https://prod.example.com/insights/identity-api",
          order: 0,
        },
      ]);
    });

    expect(
      screen.getByRole("link", {
        name: "Open Identity Insights App Insights Dev",
      }),
    ).toHaveAttribute("href", "https://dev.example.com/insights/identity-api");
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
